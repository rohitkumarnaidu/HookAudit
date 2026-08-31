#!/usr/bin/env node
/**
 * hookaudit — repository execution-topology auditor
 *
 * Zero-dependency local scanner for auto-executing AI-agent/editor/lifecycle hooks.
 * Pipeline: DISCOVER → NORMALIZE → RESOLVE → GRAPH → INFER → EXPLAIN → BASELINE → DIFF
 *
 * Runtime deps: NONE. Node.js built-ins only: node:fs, node:path, node:crypto, node:util
 *
 * Preserves working CLI safety properties while evolving into full execution-topology auditor.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs, styleText } = require('node:util');
let zlib; try { zlib = require('node:zlib'); } catch { zlib = null; }

// ---------------------------------------------------------------
// 0. Safety constants & canonical enumerations
// ---------------------------------------------------------------

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MiB
const MAX_GRAPH_DEPTH = 32;
const BINARY_CHECK_BYTES = 1024;

const DIAGNOSTIC_CODES = {
  INVALID_JSON: 'INVALID_JSON',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  UNRESOLVED_REFERENCE: 'UNRESOLVED_REFERENCE',
  PARTIALLY_RESOLVED: 'PARTIALLY_RESOLVED',
  BOUNDARY_VIOLATION: 'BOUNDARY_VIOLATION',
  SYMLINK_SKIPPED: 'SYMLINK_SKIPPED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  BINARY_SKIPPED: 'BINARY_SKIPPED',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  DEPTH_LIMIT_REACHED: 'DEPTH_LIMIT_REACHED',
  DYNAMIC_EXECUTION: 'DYNAMIC_EXECUTION',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  BASELINE_INVALID: 'BASELINE_INVALID',
};

const CAPABILITY = {
  PROCESS_EXECUTION: 'PROCESS_EXECUTION',
  NETWORK_ACCESS: 'NETWORK_ACCESS',
  REMOTE_DOWNLOAD: 'REMOTE_DOWNLOAD',
  RUNTIME_BOOTSTRAP: 'RUNTIME_BOOTSTRAP',
  ENVIRONMENT_ACCESS: 'ENVIRONMENT_ACCESS',
  CREDENTIAL_ACCESS_SIGNAL: 'CREDENTIAL_ACCESS_SIGNAL',
  FILE_READ: 'FILE_READ',
  FILE_WRITE: 'FILE_WRITE',
  OBFUSCATION: 'OBFUSCATION',
  DYNAMIC_EXECUTION: 'DYNAMIC_EXECUTION',
  CROSS_TOOL_LINK: 'CROSS_TOOL_LINK',
};

// ---------------------------------------------------------------
// 1. Known surfaces
// ---------------------------------------------------------------

const SURFACES = [
  { id: 'claude-settings', glob: ['.claude/settings.json', '.claude/settings.local.json'], kind: 'json', describe: 'Claude Code project hook configuration' },
  { id: 'claude-mcp', glob: ['.mcp.json', '.claude/mcp.json'], kind: 'json', describe: 'MCP server launch configuration read by Claude Code' },
  { id: 'vscode-tasks', glob: ['.vscode/tasks.json'], kind: 'json', describe: 'VS Code task configuration (can auto-run on folder open)' },
  { id: 'vscode-settings', glob: ['.vscode/settings.json'], kind: 'json', describe: 'VS Code workspace settings (can enable task auto-run)' },
  { id: 'cursor-rules', glob: ['.cursorrules', '.cursor/rules'], kind: 'text-dir-or-file', describe: 'Cursor agent rule files' },
  { id: 'gemini-settings', glob: ['.gemini/settings.json'], kind: 'json', describe: 'Gemini CLI project hook configuration' },
  { id: 'codex-config', glob: ['.codex/config.toml'], kind: 'text', describe: 'Codex CLI configuration (heuristic)' },
  { id: 'package-lifecycle', glob: ['package.json'], kind: 'json', describe: 'npm lifecycle scripts' },
  { id: 'husky-hooks', glob: ['.husky'], kind: 'text-dir', describe: 'Husky-managed git hook scripts' },
  { id: 'git-hooks', glob: ['.git/hooks'], kind: 'text-dir', describe: 'Local git hook scripts (excluding *.sample)' },
  { id: 'precommit-config', glob: ['.pre-commit-config.yaml', '.pre-commit-config.yml'], kind: 'text', describe: 'pre-commit framework configuration' },
  { id: 'github-workflows', glob: ['.github/workflows'], kind: 'yaml-dir', describe: 'GitHub Actions workflows (on push/PR, run: commands) — heuristic raw-text YAML' },
];

const AUTO_TRIGGER_KEYS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit'];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.hookaudit']);

// ---------------------------------------------------------------
// 2. Detector rules → capabilities
// ---------------------------------------------------------------

const RULES = [
  {
    id: 'network-fetch',
    weight: 2,
    capabilities: [CAPABILITY.NETWORK_ACCESS],
    test: (t) => /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod)\b/i.test(t) || /\bfetch\s*\(\s*['"]https?:/i.test(t) || /\bhttps?:\/\/\S+/i.test(t),
    why: 'Command downloads content from the network at hook time.',
  },
  {
    id: 'runtime-bootstrap',
    weight: 3,
    capabilities: [CAPABILITY.RUNTIME_BOOTSTRAP, CAPABILITY.REMOTE_DOWNLOAD],
    test: (t) => /\b(bun|node|python3?)\b.*\b(install|download|--install)\b/i.test(t) || /download.{0,20}\b(bun|runtime)\b/i.test(t),
    why: 'Command appears to silently download/bootstrap a runtime — the exact pattern used by the August 2026 ChainDrop/keyv worm to run its payload via Bun.',
  },
  {
    id: 'obfuscation',
    weight: 2,
    capabilities: [CAPABILITY.OBFUSCATION, CAPABILITY.DYNAMIC_EXECUTION],
    test: (t) => /[A-Za-z0-9+/]{200,}={0,2}/.test(t) || /\beval\s*\(/.test(t) || /\bnew Function\s*\(/.test(t) || /\batob\s*\(/.test(t),
    why: 'Long base64-like blob or eval/Function/atob call — common obfuscation for a dropped payload.',
  },
  {
    id: 'shell-out',
    weight: 1,
    capabilities: [CAPABILITY.FILE_WRITE],
    test: (t) => /\b(rm -rf|chmod \+x|nohup|&\s*$)/im.test(t),
    why: 'Shell idioms associated with persistence or cleanup after a payload runs.',
  },
  {
    id: 'process-exec',
    weight: 2,
    capabilities: [CAPABILITY.PROCESS_EXECUTION],
    test: (t) => /\b(node|python3?|bash|sh|pwsh|powershell|spawn|exec)\b.*\.m?js|\b(node|python3?|bash|sh|pwsh)\b\s+[^\n]*\.\w+/i.test(t) || /\b(spawn|exec|execFile|fork)\s*\(/.test(t),
    why: 'Command spawns a process or interpreter.',
  },
  {
    id: 'env-access',
    weight: 1,
    capabilities: [CAPABILITY.ENVIRONMENT_ACCESS],
    test: (t) => /process\.env|\$ENV|\$\{[^}]*env/i.test(t),
    why: 'Command accesses environment variables.',
  },
  {
    id: 'credential-signal',
    weight: 2,
    capabilities: [CAPABILITY.CREDENTIAL_ACCESS_SIGNAL],
    test: (t) => /\b(credentials?|secrets?|token|api[_-]?key|\.env)\b/i.test(t),
    why: 'Command references credentials or secrets.',
  },
  {
    id: 'file-read',
    weight: 1,
    capabilities: [CAPABILITY.FILE_READ],
    test: (t) => /\b(fs\.readFile|cat\s+|ReadFile|Get-Content)\b/i.test(t),
    why: 'Command reads files.',
  },
  {
    id: 'remote-download',
    weight: 3,
    capabilities: [CAPABILITY.REMOTE_DOWNLOAD, CAPABILITY.NETWORK_ACCESS],
    test: (t) => /curl[^|]*\|\s*(bash|sh)|wget[^|]*\|\s*(bash|sh)|Invoke-WebRequest[^|]*\|\s*Invoke-Expression/i.test(t),
    why: 'Command downloads remote content and pipes to shell — remote download pattern.',
  },
];

// ---------------------------------------------------------------
// 3. Safety helpers
// ---------------------------------------------------------------

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function isBinaryContent(content) {
  if (content.includes('\0')) return true;
  const slice = content.slice(0, BINARY_CHECK_BYTES);
  let nonPrintable = 0;
  for (let i = 0; i < slice.length; i++) {
    const c = slice.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c > 126) nonPrintable++;
  }
  return slice.length > 0 && nonPrintable / slice.length > 0.3;
}

// Central boundary helper per §9.4 — single source of truth
function resolveInsideRepository(root, candidate) {
  if (!candidate || typeof candidate !== 'string') return { ok: false, code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, reason: 'empty candidate' };
  let raw = candidate.trim().replace(/^["']|["']$/g, '');
  // Strip shell wrappers like `node ` prefix for pure path extraction; but for boundary check we want the path portion
  // Remove leading executable tokens: node, bash, sh, python, etc.
  raw = raw.replace(/^\s*(node|python3?|bash|sh|pwsh|powershell|bun)\s+/, '').trim();
  // Extract first token that looks like a path (handles `curl ...` with no file)
  // If candidate contains pipe or &&, take first file-like segment
  const fileToken = raw.split(/\s+/).find(t => /[\/\\]/.test(t) || /\.\w+$/.test(t)) || raw.split(/\s+/)[0] || raw;
  raw = fileToken.replace(/^["']|["']$/g, '');
  if (!raw) return { ok: false, code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, reason: 'no path token' };
  // Reject dynamic patterns
  if (/(\$\{|\$\(|`|\bprocess\.env\b|\+.*["']\/|path\.join)/.test(raw)) {
    return { ok: false, code: DIAGNOSTIC_CODES.DYNAMIC_EXECUTION, reason: 'dynamic reference', raw };
  }
  // Reject absolute escapes that are not inside root: check after resolve
  try {
    const resolved = path.resolve(root, raw);
    const relative = path.relative(root, resolved);
    // Windows drive mismatch: path.relative returns absolute if different drive
    if (path.isAbsolute(relative)) {
      return { ok: false, code: DIAGNOSTIC_CODES.BOUNDARY_VIOLATION, reason: 'absolute path outside repository', resolved: toPosix(resolved) };
    }
    if (relative === '..' || relative.startsWith('..' + path.sep) || relative.startsWith('../')) {
      return { ok: false, code: DIAGNOSTIC_CODES.BOUNDARY_VIOLATION, reason: '../ escape outside repository', resolved: toPosix(resolved) };
    }
    // UNC check
    if (raw.startsWith('\\\\') || raw.startsWith('//')) {
      return { ok: false, code: DIAGNOSTIC_CODES.BOUNDARY_VIOLATION, reason: 'UNC path', resolved: raw };
    }
    // Ensure resolved is inside root (case-insensitive on win32)
    const normRoot = path.resolve(root);
    const normResolved = path.resolve(resolved);
    const rootWithSep = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;
    const isInside = normResolved === normRoot || normResolved.toLowerCase().startsWith(rootWithSep.toLowerCase());
    if (!isInside) {
      return { ok: false, code: DIAGNOSTIC_CODES.BOUNDARY_VIOLATION, reason: 'outside repository boundary', resolved: toPosix(resolved) };
    }
    return { ok: true, path: normResolved, relative: toPosix(relative) || '.', raw };
  } catch (e) {
    return { ok: false, code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, reason: e.message };
  }
}

const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.sh', '.py', '.ps1', '.psm1'];
function tryResolveWithExtensions(root, candidate) {
  if (!candidate || typeof candidate !== 'string') return null;
  if (/\.\w+$/.test(candidate)) return null; // already has extension
  if (/(\$\{|\$\(|`|\bprocess\.env\b)/.test(candidate)) return null;
  for (const ext of SCRIPT_EXTENSIONS) {
    const withExt = candidate + ext;
    const res = resolveInsideRepository(root, withExt);
    if (res.ok) {
      try {
        const st = fs.lstatSync(res.path);
        if (st.isFile() && !st.isSymbolicLink() && st.size <= MAX_FILE_SIZE) return res;
      } catch {}
    }
  }
  return null;
}

function listFilesRecursive(dir, root, diagnostics, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) {
    if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.PERMISSION_DENIED, path: toPosix(path.relative(root, dir)), detail: e.message });
    return out;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = toPosix(path.relative(root, abs));
    try {
      const lst = fs.lstatSync(abs);
      if (lst.isSymbolicLink()) {
        if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.SYMLINK_SKIPPED, path: rel, detail: 'Symlink skipped (not followed outside boundary)' });
        continue;
      }
    } catch {}
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      // Extra lstat for symlink dirs that Dirent may not flag on some platforms
      try {
        const st = fs.lstatSync(abs);
        if (st.isSymbolicLink()) {
          if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.SYMLINK_SKIPPED, path: rel, detail: 'Symlink directory skipped' });
          continue;
        }
      } catch {}
      listFilesRecursive(abs, root, diagnostics, out);
    } else if (e.isFile()) {
      out.push(abs);
    } else if (e.isSymbolicLink()) {
      if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.SYMLINK_SKIPPED, path: rel, detail: 'Symlink file skipped' });
    }
  }
  out.sort();
  return out;
}

function readTextSafeWithGuards(abs, rel, diagnostics) {
  try {
    const lst = fs.lstatSync(abs);
    if (lst.isSymbolicLink()) {
      if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.SYMLINK_SKIPPED, path: rel, detail: 'Symlink file skipped' });
      return { content: null, diagnostic: DIAGNOSTIC_CODES.SYMLINK_SKIPPED };
    }
    if (lst.size > MAX_FILE_SIZE) {
      if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.FILE_TOO_LARGE, path: rel, detail: `File size ${lst.size} exceeds ${MAX_FILE_SIZE} bytes` });
      return { content: null, diagnostic: DIAGNOSTIC_CODES.FILE_TOO_LARGE };
    }
    const content = fs.readFileSync(abs, 'utf8');
    if (isBinaryContent(content)) {
      if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.BINARY_SKIPPED, path: rel, detail: 'Binary content skipped' });
      return { content: null, diagnostic: DIAGNOSTIC_CODES.BINARY_SKIPPED };
    }
    return { content, diagnostic: null };
  } catch (e) {
    if (e.code === 'ENOENT') return { content: null, diagnostic: 'unreadable' };
    if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.PERMISSION_DENIED, path: rel, detail: e.message });
    return { content: null, diagnostic: 'unreadable' };
  }
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------
// 4. Models & parsers
// ---------------------------------------------------------------

function parseCommandSpec(raw) {
  if (!raw || typeof raw !== 'string') return { raw: raw || '', executable: null, args: [], shell: false, references: [], isDynamic: false };
  const trimmed = raw.trim();
  const isDynamic = /\$\{|\$\(|`.*\$\{|process\.env|\+.*["']\/|path\.join|process\.argv/.test(trimmed);
  // Tokenize with single/double quotes and basic escaped spaces (no shell expansion)
  const args = [];
  let current = '';
  let inQuote = null;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\' && !inQuote) { // escaped space or char outside quotes
      // if next char is space, consume it as part of current token
      if (i+1 < trimmed.length && /\s/.test(trimmed[i+1])) { current += trimmed[i+1]; i++; continue; }
      // otherwise keep backslash for shell detection
      current += ch; continue;
    }
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      else if (ch === '\\' && inQuote === '"') { // basic \" inside double quotes
        if (i+1 < trimmed.length) { current += trimmed[i+1]; i++; }
      } else current += ch;
    } else {
      if (ch === '"' || ch === "'") inQuote = ch;
      else if (/\s/.test(ch)) { if (current) { args.push(current); current = ''; } }
      else current += ch;
    }
  }
  if (current) args.push(current);
  const executable = args[0] || null;
  const shell = /[|&;`$<>]/.test(trimmed);
  const references = [];
  const refRegex = /(?:\.\.?\/|\.claude\/|\.vscode\/|\.cursor\/|\.husky\/|\.github\/|scripts\/)[\w.\-\/\\]+/g;
  let m;
  while ((m = refRegex.exec(trimmed)) !== null) {
    const r = m[0].replace(/["'`;|&]+$/g, '');
    if (!references.includes(r)) references.push(r);
  }
  for (const a of args) {
    if (/\.m?js$|\.sh$|\.py$|\.ps1$|\.mjs$/.test(a) && !references.includes(a)) references.push(a);
    if (a.startsWith('./') || a.startsWith('../')) if (!references.includes(a)) references.push(a);
  }
  return { raw: trimmed, executable, args, shell, references, isDynamic };
}

function createEvidence({ path, field, detector, reason, excerpt }) {
  const ev = { path };
  if (field) ev.field = field;
  if (detector) ev.detector = detector;
  if (reason) ev.reason = reason;
  if (excerpt) ev.excerpt = excerpt.slice(0, 200);
  return ev;
}

function inferCapabilities(text) {
  const caps = new Set();
  const matchedDetectors = [];
  for (const rule of RULES) {
    if (rule.test(text)) {
      matchedDetectors.push(rule.id);
      for (const c of rule.capabilities) caps.add(c);
    }
  }
  return { capabilities: Array.from(caps).sort(), detectors: matchedDetectors };
}

function computeConfidence(commandSpec, isResolvedNested) {
  if (commandSpec.isDynamic) return 'LOW';
  if (isResolvedNested) return 'MEDIUM';
  return 'HIGH';
}

function extractClaudeHookCommands(json, baseField) {
  const cmds = [];
  const hooks = json && json.hooks;
  if (!hooks || typeof hooks !== 'object') return cmds;
  for (const [triggerName, entries] of Object.entries(hooks)) {
    const list = Array.isArray(entries) ? entries : [entries];
    for (let ei = 0; ei < list.length; ei++) {
      const entry = list[ei];
      const hookList = (entry && entry.hooks) || (Array.isArray(entry) ? entry : [entry]);
      const flat = Array.isArray(hookList) ? hookList : [hookList];
      for (let hi = 0; hi < flat.length; hi++) {
        const h = flat[hi];
        const command = h && (h.command || h.cmd);
        if (command) {
          const field = `hooks.${triggerName}[${ei}].hooks[${hi}].command`;
          cmds.push({ trigger: triggerName, command, field });
        }
      }
    }
  }
  return cmds;
}

function extractVscodeTaskCommands(json) {
  const cmds = [];
  const tasks = json && Array.isArray(json.tasks) ? json.tasks : [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const runOn = t.runOptions && t.runOptions.runOn;
    const auto = runOn === 'folderOpen';
    const command = [t.command, ...(Array.isArray(t.args) ? t.args : [])].filter(Boolean).join(' ');
    if (command) cmds.push({ trigger: auto ? 'folderOpen' : (t.label || 'task'), command, auto, field: `tasks[${i}].command` });
  }
  return cmds;
}

function extractPackageJsonScripts(json) {
  const AUTO = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly']);
  const cmds = [];
  const scripts = json && json.scripts;
  if (!scripts) return cmds;
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === 'string') {
      cmds.push({ trigger: name, command, auto: AUTO.has(name), field: `scripts.${name}` });
    }
  }
  return cmds;
}

const SURFACE_DIRS = ['.claude', '.vscode', '.cursor', '.gemini', '.codex', '.husky', '.github'];

function findCrossReference(ownDir, command) {
  for (const dir of SURFACE_DIRS) {
    if (dir === ownDir) continue;
    const re = new RegExp(dir.replace('.', '\\.') + '\\/[\\w.\\-\\/]+');
    if (re.test(command)) return dir;
  }
  return null;
}

// ---------------------------------------------------------------
// 5. Cross-surface scoring & risk
// ---------------------------------------------------------------

function evaluateCommand(ownDir, trigger, command, autoHint, sourcePath, field) {
  const commandSpec = parseCommandSpec(command);
  const isAutoTrigger = autoHint || AUTO_TRIGGER_KEYS.includes(trigger);
  let score = isAutoTrigger ? 2 : 0;
  const reasons = [];
  const evidenceList = [];
  const capabilitiesSet = new Set();

  if (isAutoTrigger) reasons.push(`fires automatically on "${trigger}" with no separate approval step`);

  for (const rule of RULES) {
    if (rule.test(command)) {
      score += rule.weight;
      reasons.push(rule.why);
      for (const c of rule.capabilities) capabilitiesSet.add(c);
      evidenceList.push(createEvidence({ path: sourcePath, field, detector: rule.id, reason: rule.why, excerpt: command }));
    }
  }

  const crossRef = findCrossReference(ownDir, command);
  if (crossRef) {
    score += 3;
    const why = `command references a path under ${crossRef}/, a different tool's directory — the exact cross-linking evasion documented in the ChainDrop campaign`;
    reasons.push(why);
    capabilitiesSet.add(CAPABILITY.CROSS_TOOL_LINK);
    evidenceList.push(createEvidence({ path: sourcePath, field, detector: 'cross-reference', reason: why, excerpt: command }));
  }

  // Additional dynamic handling
  if (commandSpec.isDynamic) {
    capabilitiesSet.add(CAPABILITY.DYNAMIC_EXECUTION);
    evidenceList.push(createEvidence({ path: sourcePath, field, detector: 'dynamic', reason: 'Dynamic command construction detected', excerpt: command }));
  }

  let severity = 'INFO';
  if (score >= 5) severity = 'CRITICAL';
  else if (score >= 2) severity = 'WARN';

  const confidence = computeConfidence(commandSpec, false);
  const capabilities = Array.from(capabilitiesSet).sort();

  // Deduplicate reasons
  const uniqueReasons = [...new Set(reasons)];

  if (score > 0 || capabilities.length > 0) {
    return [{ trigger, command, commandSpec, severity, score, reasons: uniqueReasons, capabilities, confidence, evidence: evidenceList, field, sourcePath }];
  }
  return [];
}

function computePathRisk(capabilities, isAuto, confidence) {
  const has = (c) => capabilities.includes(c);
  const hasNetwork = has(CAPABILITY.NETWORK_ACCESS);
  const hasRemote = has(CAPABILITY.REMOTE_DOWNLOAD);
  const hasProcess = has(CAPABILITY.PROCESS_EXECUTION);
  const hasBootstrap = has(CAPABILITY.RUNTIME_BOOTSTRAP);
  const hasObf = has(CAPABILITY.OBFUSCATION);
  const hasDynamic = has(CAPABILITY.DYNAMIC_EXECUTION);
  const hasCross = has(CAPABILITY.CROSS_TOOL_LINK);

  // Unified rule table per §40-41
  if (isAuto && hasRemote && hasProcess && hasObf) return 'CRITICAL';
  if (isAuto && hasBootstrap && hasNetwork) return 'CRITICAL';
  if (isAuto && hasRemote && hasProcess) return 'CRITICAL';
  if (isAuto && hasNetwork && hasProcess) return 'HIGH';
  if (isAuto && hasRemote) return 'HIGH';
  if (isAuto && hasProcess && (hasCross || hasObf)) return 'HIGH';
  if (isAuto && hasCross) return 'HIGH';
  if (isAuto && (hasNetwork || hasProcess)) return 'MEDIUM';
  if (isAuto) return 'MEDIUM';
  if (hasNetwork || hasProcess || hasRemote) return 'MEDIUM';
  if (capabilities.length === 0) return 'LOW';
  return 'LOW';
}

// ---------------------------------------------------------------
// 6. Scan — discovery + normalization with safety guards
// ---------------------------------------------------------------

function resolveSurfaceFiles(root, surface, diagnostics) {
  const found = [];
  for (const rel of surface.glob) {
    const abs = path.join(root, rel);
    if (!exists(abs)) continue;
    let stat;
    try { stat = fs.lstatSync(abs); } catch { continue; }
    if (stat.isSymbolicLink()) {
      if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.SYMLINK_SKIPPED, path: toPosix(rel), detail: 'Symlink surface skipped' });
      continue;
    }
    // Now check if it's dir via stat (follow? but we already checked symlink)
    let isDir = false;
    try { isDir = fs.statSync(abs).isDirectory(); } catch { continue; }
    if (isDir) {
      for (const f of listFilesRecursive(abs, root, diagnostics)) {
        if (surface.id === 'git-hooks' && f.endsWith('.sample')) continue;
        if (surface.id === 'github-workflows' && !/\.ya?ml$/i.test(f)) continue;
        found.push(f);
      }
    } else {
      found.push(abs);
    }
  }
  return found;
}

// ---------------------------------------------------------------
// GitHub Actions adapter — heuristic YAML (zero-dep, no yaml lib)
// ---------------------------------------------------------------
const GITHUB_KNOWN_TRIGGERS = ['push', 'pull_request', 'workflow_dispatch', 'schedule', 'workflow_call', 'repository_dispatch'];
const GITHUB_AUTO_TRIGGERS = new Set(['push', 'pull_request', 'schedule']);
function parseGithubTriggers(text) {
  const onLineMatch = text.match(/^\s*on\s*:\s*(.*)$/m);
  const triggers = [];
  if (!onLineMatch) return triggers;
  const start = onLineMatch.index;
  const rawWindow = text.slice(start, start + 1200);
  const filteredWindow = rawWindow.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n').toLowerCase();
  for (const t of GITHUB_KNOWN_TRIGGERS) {
    const re = new RegExp('(^|[^a-z0-9_])' + t.replace('_', '_') + '([^a-z0-9_]|$)', 'i');
    if (re.test(filteredWindow)) triggers.push(t);
  }
  return [...new Set(triggers)];
}
function extractGithubWorkflowCommands(content) {
  const triggers = parseGithubTriggers(content);
  const isAutoWorkflow = triggers.some((t) => GITHUB_AUTO_TRIGGERS.has(t));
  const workflowTrigger = triggers.length ? triggers.join(',') : 'workflow';
  const lines = content.split('\n');
  const results = [];
  let currentJob = null;
  let stepIndex = -1;
  let inJobs = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*jobs\s*:\s*$/.test(line)) { inJobs = true; continue; }
    if (inJobs) {
      const jobMatch = line.match(/^\s{2}([A-Za-z0-9_\-]+)\s*:\s*$/);
      if (jobMatch) {
        const candidate = jobMatch[1];
        if (!['steps', 'runs-on', 'needs', 'strategy', 'env', 'if', 'permissions'].includes(candidate)) {
          currentJob = candidate; stepIndex = -1; continue;
        }
      }
      if (/^\s*-\s*(name|uses|run)\s*:/.test(line)) {
        if (/^\s*-\s*name\s*:/.test(line) || /^\s*-\s*uses\s*:/.test(line)) stepIndex++;
        else if (/^\s*-\s*run\s*:/.test(line)) stepIndex++;
      }
    }
    const runMatch = line.match(/^\s*(?:-\s*)?run\s*:\s*(\|?-?)\s*(.*)$/);
    if (!runMatch) continue;
    const pipe = runMatch[1];
    const inline = (runMatch[2] || '').trim();
    let command = '';
    if (pipe && pipe.startsWith('|')) {
      const blockLines = [];
      let j = i + 1;
      while (j < lines.length) {
        const nl = lines[j];
        if (nl.trim() === '') { blockLines.push(''); j++; continue; }
        if (/^\s{6,}\S/.test(nl) || /^\s*\t/.test(nl)) { blockLines.push(nl.trim()); j++; } else break;
      }
      command = (inline ? inline + '\n' : '') + blockLines.join('\n');
      command = command.trim();
    } else command = inline;
    if (!command) continue;
    const field = currentJob ? `jobs.${currentJob}.steps[${Math.max(0, stepIndex)}].run` : `steps[${results.length}].run`;
    const trigger = currentJob ? `${workflowTrigger}:${currentJob}` : workflowTrigger;
    results.push({ trigger, command, field, auto: isAutoWorkflow });
  }
  if (results.length === 0) {
    const re = /run\s*:\s*\|?\s*([^\n]+)/g;
    let m; let idx = 0;
    while ((m = re.exec(content)) !== null) {
      const cmd = (m[1] || '').trim();
      if (!cmd || cmd === '|') continue;
      results.push({ trigger: workflowTrigger, command: cmd, field: `run[${idx}].run`, auto: isAutoWorkflow }); idx++;
    }
  }
  return results;
}

function scanFile(root, surface, file, globalDiagnostics) {
  const rawRel = path.relative(root, file);
  const rel = toPosix(rawRel);
  const ownDir = surface.glob.find((g) => rel.startsWith(g.split('/')[0]))?.split('/')[0] || ('.' + rel.split('/')[0]);
  const localDiags = [];

  // Safety: lstat + size + binary before content use
  const guard = readTextSafeWithGuards(file, rel, globalDiagnostics);
  if (guard.content === null) {
    const diagCode = guard.diagnostic;
    if (diagCode === DIAGNOSTIC_CODES.FILE_TOO_LARGE || diagCode === DIAGNOSTIC_CODES.BINARY_SKIPPED || diagCode === DIAGNOSTIC_CODES.SYMLINK_SKIPPED) {
      return { file: rel, surface: surface.id, hash: null, findings: [], parseError: null, diagnostics: [{ code: diagCode, path: rel }], capabilities: [] };
    }
    if (guard.diagnostic === 'unreadable') {
      return { file: rel, surface: surface.id, hash: null, findings: [], parseError: 'unreadable', diagnostics: [{ code: DIAGNOSTIC_CODES.PERMISSION_DENIED, path: rel }], capabilities: [] };
    }
    return { file: rel, surface: surface.id, hash: null, findings: [], parseError: guard.diagnostic, diagnostics: [], capabilities: [] };
  }
  const content = guard.content;
  const hash = sha256(content);
  let findings = [];
  let parseError = null;
  let diagnostics = [];

  if (surface.kind === 'json') {
    let json;
    try { json = JSON.parse(content); }
    catch (e) { parseError = 'invalid JSON'; diagnostics.push({ code: DIAGNOSTIC_CODES.INVALID_JSON, path: rel, detail: e.message }); }
    if (json) {
      let cmds = [];
      if (surface.id === 'claude-settings') cmds = extractClaudeHookCommands(json);
      else if (surface.id === 'vscode-tasks') cmds = extractVscodeTaskCommands(json);
      else if (surface.id === 'package-lifecycle') cmds = extractPackageJsonScripts(json);
      else if (surface.id === 'claude-mcp') {
        const servers = json.mcpServers || json.servers || {};
        for (const [name, def] of Object.entries(servers)) {
          const cmd = [def && def.command, ...(Array.isArray(def && def.args) ? def.args : [])].filter(Boolean).join(' ');
          if (cmd) cmds.push({ trigger: `mcp:${name}`, command: cmd, auto: true, field: `mcpServers.${name}.command` });
        }
      } else if (surface.id === 'vscode-settings' || surface.id === 'gemini-settings') {
        // Try to extract any command-like fields generically but do not overclaim
        const text = JSON.stringify(json);
        if (/command|task|hook/i.test(text)) {
          // fallback sweep already does this
        }
      }
      for (const c of cmds) {
        findings.push(...evaluateCommand(ownDir, c.trigger, c.command, c.auto, rel, c.field));
      }
      // Whole-file defense-in-depth sweep for patterns outside known fields
      const sweepFindings = evaluateCommand(ownDir, 'file-body', content, false, rel, null);
      // Only keep sweep if it adds new capability not already covered
      if (sweepFindings.length) {
        const existingCaps = new Set(findings.flatMap(f => f.capabilities));
        const newCaps = sweepFindings.flatMap(f => f.capabilities).filter(c => !existingCaps.has(c));
        if (newCaps.length > 0) findings.push(...sweepFindings);
        else if (findings.length === 0) findings.push(...sweepFindings);
      }
    } else {
      // For json surfaces that failed to parse, keep hash but no findings beyond diagnostic
    }
  } else if (surface.id === 'github-workflows') {
    const cmds = extractGithubWorkflowCommands(content);
    for (const c of cmds) findings.push(...evaluateCommand('.github', c.trigger, c.command, c.auto, rel, c.field));
    const sweepFindings = evaluateCommand('.github', 'file-body', content, false, rel, null);
    if (sweepFindings.length) {
      const existingCaps = new Set(findings.flatMap(f => f.capabilities));
      const newCaps = sweepFindings.flatMap(f => f.capabilities).filter(c => !existingCaps.has(c));
      if (newCaps.length > 0) findings.push(...sweepFindings);
      else if (findings.length === 0) findings.push(...sweepFindings);
    }
    if (cmds.length === 0 && content.trim().length > 0) diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: rel, detail: 'No run: commands extracted — heuristic YAML scan (no YAML AST)' });
  } else {
    const auto = surface.id === 'git-hooks' || surface.id === 'husky-hooks';
    findings.push(...evaluateCommand(ownDir, path.basename(file), content, auto, rel, null));
  }

  // De-duplicate generic file-body if specific already covers
  findings = findings.filter((f, i, arr) => !(f.trigger === 'file-body' && arr.some((o) => o !== f && o.severity === f.severity && o.capabilities.some(c => f.capabilities.includes(c)))));

  const order = { CRITICAL: 0, WARN: 1, INFO: 2 };
  findings.sort((a, b) => (order[a.severity] - order[b.severity]) || a.trigger.localeCompare(b.trigger) || a.command.localeCompare(b.command));

  // Aggregate capabilities for file
  const fileCaps = [...new Set(findings.flatMap(f => f.capabilities))].sort();

  return { file: rel, surface: surface.id, hash, findings, parseError, diagnostics, capabilities: fileCaps };
}

function scan(root, globalDiagnostics) {
  const results = [];
  const diags = globalDiagnostics || [];
  for (const surface of SURFACES) {
    const files = resolveSurfaceFiles(root, surface, diags);
    files.sort();
    for (const file of files) {
      results.push(scanFile(root, surface, file, diags));
    }
  }
  results.sort((a, b) => a.file.localeCompare(b.file));
  return results;
}

// ---------------------------------------------------------------
// 7. Resolver & Graph
// ---------------------------------------------------------------

function extractScriptReferences(content) {
  const refs = new Set();
  // JS/TS imports — static only (dynamic handled as DYNAMIC via isDynamic, but capture here for resolver to flag)
  const importRe = /(?:import\s+.*?from\s+["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']\s*\)|import\s*\(\s*["']([^"']+)["']\s*\)|await\s+import\s*\(\s*["']([^"']+)["']\s*\))/g;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const p = m[1] || m[2] || m[3] || m[4];
    if (p && (p.startsWith('.') || p.startsWith('/') || p.includes('/'))) {
      // Skip dynamic variables: if contains ${ or $(
      if (/(\$\{|\$\(|`)/.test(p)) continue;
      refs.add(p);
    }
  }
  // Shell invocations with quoting support (single, double, backtick, escaped spaces handled via stripping)
  // Capture quoted or unquoted token after interpreter
  const shellRefQuotedRe = /\b(?:node|python3?|bash|sh|pwsh|powershell|bun)\s+(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`|&;]+))/g;
  while ((m = shellRefQuotedRe.exec(content)) !== null) {
    const p = m[1] || m[2] || m[3] || m[4];
    if (p) {
      const cleaned = p.replace(/^["']|["']$/g, '').trim();
      if (cleaned && !/(\$\{|\$\(|`)/.test(cleaned)) refs.add(cleaned);
    }
  }
  // Source/dot commands with quoted support
  const sourceRe = /\b(?:source|\.)\s+(?:"([^"]+)"|'([^']+)'|([^\s"'`|&;]+))/g;
  while ((m = sourceRe.exec(content)) !== null) {
    const p = m[1] || m[2] || m[3];
    if (p) {
      const cleaned = p.replace(/^["']|["']$/g, '').trim();
      if (cleaned && !/(\$\{|\$\(|`)/.test(cleaned)) refs.add(cleaned);
    }
  }
  // Generic file path patterns — include .github for Actions, scripts, etc., avoid matching URLs
  const pathRe = /(?:\.\.?\/[\w.\-\/]+|\.claude\/[\w.\-\/]+|\.vscode\/[\w.\-\/]+|\.github\/[\w.\-\/]+|scripts\/[\w.\-\/]+)/g;
  while ((m = pathRe.exec(content)) !== null) {
    const candidate = m[0].replace(/["'`;|&]+$/g, '');
    // Avoid http URLs already
    if (candidate.startsWith('http')) continue;
    // Filter shell operators like && ; | already stripped
    refs.add(candidate);
  }
  // Shell chains: split on && ; | and re-extract (already globally matched, but ensure we capture refs after operators)
  // The above global regexes already handle, but ensure we handle "bash a.sh && bash b.sh" via second pass
  return Array.from(refs);
}

function resolveExecutionGraph(root, scanResults, globalDiagnostics) {
  const nodes = [];
  const edges = [];
  const paths = [];
  const diagnostics = globalDiagnostics || [];
  const visited = new Set();
  let nodeIdCounter = 0;
  const nextId = (prefix) => `${prefix}_${nodeIdCounter++}`;

  // Repository node
  const repoNode = { id: 'repo', kind: 'REPOSITORY', path: '.', label: 'REPOSITORY', capabilities: [] };
  nodes.push(repoNode);

  // Helper to add node
  function addNode(kind, p, label) {
    const id = nextId(kind.toLowerCase());
    const n = { id, kind, path: p, label: label || p, capabilities: [] };
    nodes.push(n);
    return n;
  }

  // Index scan results by file
  const byFile = new Map(scanResults.map(r => [r.file, r]));

  // Build per-surface subgraph
  for (const result of scanResults) {
    if (!result.findings.length) continue;
    const configNode = addNode('CONFIG', result.file, result.file);
    edges.push({ from: repoNode.id, to: configNode.id, kind: 'CONTAINS', evidence: { path: result.file } });

    for (const finding of result.findings) {
      const triggerNode = addNode('TRIGGER', result.file, finding.trigger);
      edges.push({ from: configNode.id, to: triggerNode.id, kind: 'TRIGGERS', evidence: { path: result.file, field: finding.field } });

      const cmdNode = addNode('COMMAND', result.file, finding.command.slice(0, 80));
      cmdNode.capabilities = finding.capabilities || [];
      cmdNode.confidence = finding.confidence;
      edges.push({ from: triggerNode.id, to: cmdNode.id, kind: 'EXECUTES', evidence: { path: result.file, field: finding.field, excerpt: finding.command } });

      // For each reference in commandSpec, try to resolve
      const refs = (finding.commandSpec && finding.commandSpec.references) || [];
      // Also include finding.command raw scanning for cross-tool refs
      const allRefs = [...new Set([...refs, ...extractScriptReferences(finding.command)])];
      let createdPathsForFinding = 0;

      for (const rawRef of allRefs) {
        if (!rawRef || rawRef.length < 3 || rawRef === '//' || rawRef.startsWith('http') || rawRef.startsWith('//')) continue;
        if (!/[\/\\]/.test(rawRef) && !/\.\w+$/.test(rawRef)) continue;
        const resolved = resolveInsideRepository(root, rawRef);
        if (!resolved.ok) {
          if (resolved.code === DIAGNOSTIC_CODES.BOUNDARY_VIOLATION) {
            diagnostics.push({ code: resolved.code, path: result.file, detail: `${rawRef} → ${resolved.resolved} — outside repository` });
            const diagNode = addNode('FILE', rawRef, rawRef + ' (BOUNDARY)');
            edges.push({ from: cmdNode.id, to: diagNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: resolved.code });
          } else if (resolved.code === DIAGNOSTIC_CODES.DYNAMIC_EXECUTION) {
            diagnostics.push({ code: resolved.code, path: result.file, detail: `Dynamic reference ${rawRef}` });
            const dynNode = addNode('FILE', rawRef, rawRef + ' (DYNAMIC)');
            edges.push({ from: cmdNode.id, to: dynNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: resolved.code });
            dynNode.capabilities = [CAPABILITY.DYNAMIC_EXECUTION];
            cmdNode.capabilities = [...new Set([...(cmdNode.capabilities||[]), CAPABILITY.DYNAMIC_EXECUTION])];
          } else {
            diagnostics.push({ code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, path: result.file, detail: `Unresolved ${rawRef}: ${resolved.reason}` });
            const unNode = addNode('FILE', rawRef, rawRef + ' (UNRESOLVED)');
            edges.push({ from: cmdNode.id, to: unNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: 'UNRESOLVED_REFERENCE' });
          }
          continue;
        }

        let rel = resolved.relative;
        let abs = resolved.path;
        // Check visited & cycle
        const visitKey = `${result.file}→${rel}`;
        if (visited.has(visitKey)) {
          diagnostics.push({ code: DIAGNOSTIC_CODES.CYCLE_DETECTED, path: result.file, detail: `Cycle detected ${visitKey}` });
          const cycleNode = addNode('FILE', rel, rel + ' (CYCLE)');
          edges.push({ from: cmdNode.id, to: cycleNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: DIAGNOSTIC_CODES.CYCLE_DETECTED });
          continue;
        }
        visited.add(visitKey);

        // Check exists and safety — try extensionless resolution if missing
        let lstat;
        try { lstat = fs.lstatSync(abs); } catch {
          const extRes = tryResolveWithExtensions(root, rawRef);
          if (extRes) {
            abs = extRes.path;
            rel = extRes.relative;
            diagnostics.push({ code: DIAGNOSTIC_CODES.PARTIALLY_RESOLVED, path: result.file, detail: `Resolved ${rawRef} → ${rel} via extension probe` });
            try { lstat = fs.lstatSync(abs); } catch {
              diagnostics.push({ code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, path: result.file, detail: `Missing file ${rel} (tried ${rel})` });
              const missNode = addNode('FILE', rel, rel + ' (MISSING)');
              edges.push({ from: cmdNode.id, to: missNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: 'UNRESOLVED_REFERENCE' });
              continue;
            }
          } else {
            diagnostics.push({ code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, path: result.file, detail: `Missing file ${rel}` });
            const missNode = addNode('FILE', rel, rel + ' (MISSING)');
            edges.push({ from: cmdNode.id, to: missNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: 'UNRESOLVED_REFERENCE' });
            continue;
          }
        }
        if (lstat.isSymbolicLink()) {
          diagnostics.push({ code: DIAGNOSTIC_CODES.SYMLINK_SKIPPED, path: rel, detail: 'Symlink skipped during resolve' });
          const symNode = addNode('FILE', rel, rel + ' (SYMLINK)');
          edges.push({ from: cmdNode.id, to: symNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: DIAGNOSTIC_CODES.SYMLINK_SKIPPED });
          continue;
        }
        if (lstat.size > MAX_FILE_SIZE) {
          diagnostics.push({ code: DIAGNOSTIC_CODES.FILE_TOO_LARGE, path: rel, detail: `Size ${lstat.size}` });
          const bigNode = addNode('FILE', rel, rel + ' (TOO_LARGE)');
          edges.push({ from: cmdNode.id, to: bigNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: DIAGNOSTIC_CODES.FILE_TOO_LARGE });
          continue;
        }
        if (!lstat.isFile()) continue;

        let content;
        try { content = fs.readFileSync(abs, 'utf8'); } catch (e) {
          diagnostics.push({ code: DIAGNOSTIC_CODES.PERMISSION_DENIED, path: rel, detail: e.message });
          continue;
        }
        if (isBinaryContent(content)) {
          diagnostics.push({ code: DIAGNOSTIC_CODES.BINARY_SKIPPED, path: rel, detail: 'Binary' });
          const binNode = addNode('FILE', rel, rel + ' (BINARY)');
          edges.push({ from: cmdNode.id, to: binNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: DIAGNOSTIC_CODES.BINARY_SKIPPED });
          continue;
        }

        // Classify file kind
        const ext = path.extname(rel);
        const isScript = ['.js', '.mjs', '.cjs', '.ts', '.sh', '.bash', '.py', '.ps1', '.psm1'].includes(ext) || !ext;
        const nodeKind = isScript ? 'SCRIPT' : 'FILE';
        const scriptNode = addNode(nodeKind, rel, rel);
        edges.push({ from: cmdNode.id, to: scriptNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef } });

        // Infer capabilities from script content
        const scriptCaps = inferCapabilities(content);
        let caps = [...scriptCaps.capabilities];
        // Also check for network/process etc via content sweep
        if (/\bcurl\b|\bwget\b|https?:\/\//i.test(content)) if (!caps.includes(CAPABILITY.NETWORK_ACCESS)) caps.push(CAPABILITY.NETWORK_ACCESS);
        if (/download.*runtime|bun.*install/i.test(content)) caps.push(CAPABILITY.RUNTIME_BOOTSTRAP, CAPABILITY.REMOTE_DOWNLOAD);
        if (/\bnode\b|\bpython\b|\bbash\b|\bsh\b/i.test(content) && !caps.includes(CAPABILITY.PROCESS_EXECUTION)) caps.push(CAPABILITY.PROCESS_EXECUTION);
        scriptNode.capabilities = [...new Set(caps)].sort();
        // Propagate to path — BFS queue for multi-hop with cycle/depth handling
        // Use baseDir-aware resolution for nested refs
        const queue = [{ node: scriptNode, abs, rel, depth: 1, content }];
        const allCaps = [...caps];
        const chainRels = [rel];
        const chainNodes = [scriptNode.id];
        // Keep a set of visited script paths to avoid revisiting same file via different chain
        const visitedFiles = new Set([rel]);
        while (queue.length) {
          const cur = queue.shift();
          if (cur.depth >= MAX_GRAPH_DEPTH) {
            diagnostics.push({ code: DIAGNOSTIC_CODES.DEPTH_LIMIT_REACHED, path: cur.rel, detail: `Depth ${MAX_GRAPH_DEPTH} reached` });
            continue;
          }
          const curRefs = extractScriptReferences(cur.content);
          for (const nr of curRefs) {
            if (!nr || nr.length < 3 || nr === '//' || nr.startsWith('http') || nr.startsWith('//')) continue;
            if (!/[\/\\]/.test(nr) && !/\.\w+$/.test(nr)) continue;
            // Resolve relative to cur file's directory, not root
            const baseDir = path.dirname(cur.abs);
            let nrResolved;
            // Try relative to baseDir first, then root
            const tryPaths = [path.resolve(baseDir, nr), path.resolve(root, nr)];
            let okRes = null;
            for (const tryAbs of tryPaths) {
              const relTry = toPosix(path.relative(root, tryAbs));
              if (!relTry.startsWith('..') && !path.isAbsolute(relTry)) {
                // Check inside root
                const inside = tryAbs.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep.toLowerCase()) || tryAbs.toLowerCase() === path.resolve(root).toLowerCase();
                if (inside) { okRes = { ok: true, path: tryAbs, relative: relTry }; break; }
              }
            }
            if (!okRes) {
              // Fall back to original resolver for diagnostics (handles dynamic/boundary)
              nrResolved = resolveInsideRepository(root, nr);
            } else {
              nrResolved = okRes;
              // Check dynamic via original helper
              if (/(\$\{|\$\(|`|\bprocess\.env\b|\+.*["']\/|path\.join)/.test(nr)) {
                nrResolved = { ok: false, code: DIAGNOSTIC_CODES.DYNAMIC_EXECUTION, reason: 'dynamic' };
              }
            }
            if (!nrResolved.ok) {
              if (nrResolved.code === DIAGNOSTIC_CODES.BOUNDARY_VIOLATION) {
                diagnostics.push({ code: nrResolved.code, path: cur.rel, detail: `Nested ${nr} → outside` });
              } else if (nrResolved.code === DIAGNOSTIC_CODES.DYNAMIC_EXECUTION) {
                diagnostics.push({ code: nrResolved.code, path: cur.rel, detail: `Dynamic nested ${nr}` });
                cur.node.capabilities.push(CAPABILITY.DYNAMIC_EXECUTION);
                allCaps.push(CAPABILITY.DYNAMIC_EXECUTION);
              }
              continue;
            }
            const nrRel = nrResolved.relative;
            const nrAbs = nrResolved.path;
            const nestedKey = `${cur.rel}→${nrRel}`;
            if (visited.has(nestedKey)) {
              diagnostics.push({ code: DIAGNOSTIC_CODES.CYCLE_DETECTED, path: cur.rel, detail: `Cycle ${nestedKey}` });
              const cNode = addNode('FILE', nrRel, nrRel + ' (CYCLE)');
              edges.push({ from: cur.node.id, to: cNode.id, kind: 'REFERENCES', evidence: { path: cur.rel, excerpt: nr }, diagnostic: DIAGNOSTIC_CODES.CYCLE_DETECTED });
              continue;
            }
            // Detect file-level cycle (A→B→C→A) even if edge not yet visited
            if (visitedFiles.has(nrRel)) {
              diagnostics.push({ code: DIAGNOSTIC_CODES.CYCLE_DETECTED, path: cur.rel, detail: `Cycle file ${nrRel}` });
              const cNode = addNode('FILE', nrRel, nrRel + ' (CYCLE)');
              edges.push({ from: cur.node.id, to: cNode.id, kind: 'REFERENCES', evidence: { path: cur.rel, excerpt: nr }, diagnostic: DIAGNOSTIC_CODES.CYCLE_DETECTED });
              visited.add(nestedKey);
              continue;
            }
            try {
              const nStat = fs.lstatSync(nrAbs);
              if (nStat.isSymbolicLink()) {
                diagnostics.push({ code: DIAGNOSTIC_CODES.SYMLINK_SKIPPED, path: nrRel, detail: 'Symlink skipped' });
                visited.add(nestedKey);
                continue;
              }
              if (nStat.size > MAX_FILE_SIZE) {
                diagnostics.push({ code: DIAGNOSTIC_CODES.FILE_TOO_LARGE, path: nrRel, detail: `Size ${nStat.size}` });
                visited.add(nestedKey);
                continue;
              }
              if (!nStat.isFile()) continue;
              const nContent = fs.readFileSync(nrAbs, 'utf8');
              if (isBinaryContent(nContent)) {
                diagnostics.push({ code: DIAGNOSTIC_CODES.BINARY_SKIPPED, path: nrRel, detail: 'Binary' });
                visited.add(nestedKey);
                continue;
              }
              visited.add(nestedKey);
              visitedFiles.add(nrRel);
              const nestedNode = addNode('SCRIPT', nrRel, nrRel);
              edges.push({ from: cur.node.id, to: nestedNode.id, kind: 'REFERENCES', evidence: { path: cur.rel, excerpt: nr } });
              const nestedCaps = inferCapabilities(nContent);
              // Also sweep for network etc
              let nCaps = [...nestedCaps.capabilities];
              if (/\bcurl\b|\bwget\b|https?:\/\//i.test(nContent) && !nCaps.includes(CAPABILITY.NETWORK_ACCESS)) nCaps.push(CAPABILITY.NETWORK_ACCESS);
              if (/download.*runtime|bun.*install/i.test(nContent)) nCaps.push(CAPABILITY.RUNTIME_BOOTSTRAP, CAPABILITY.REMOTE_DOWNLOAD);
              nestedNode.capabilities = [...new Set(nCaps)].sort();
              allCaps.push(...nCaps);
              chainRels.push(nrRel);
              chainNodes.push(nestedNode.id);
              queue.push({ node: nestedNode, abs: nrAbs, rel: nrRel, depth: cur.depth + 1, content: nContent });
            } catch (e) {
              // Missing file is not a cycle, just unresolved
            }
          }
        }
        // Update aggregated caps
        caps = [...new Set(allCaps)].sort();
        scriptNode.capabilities = [...new Set([...scriptNode.capabilities, ...caps])].sort();

        // Build execution path for this trigger→command→script chain (multi-hop aggregated)
        const pathCaps = [...new Set([...(finding.capabilities||[]), ...caps])].sort();
        const isAuto = AUTO_TRIGGER_KEYS.includes(finding.trigger) || finding.trigger === 'folderOpen' || ['preinstall','install','postinstall','prepare'].includes(finding.trigger) || finding.trigger.startsWith('mcp:');
        const pathRisk = computePathRisk(pathCaps, isAuto, finding.confidence);
        const confidence = caps.length ? 'MEDIUM' : finding.confidence;
        paths.push({
          id: `${result.file}:${finding.trigger}→${chainRels.join('→')}`,
          trigger: finding.trigger,
          sourcePath: result.file,
          chain: [result.file, finding.command, ...chainRels],
          nodes: [configNode.id, triggerNode.id, cmdNode.id, ...chainNodes],
          capabilities: pathCaps,
          risk: pathRisk,
          confidence,
          evidence: [{ path: result.file, field: finding.field, excerpt: finding.command }, ...chainRels.map(r=> ({ path: r, excerpt: r }))],
        });
        createdPathsForFinding++;
        // Enrich finding with resolved capabilities and path risk
        if (!finding.reachableCapabilities || pathCaps.length > (finding.reachableCapabilities||[]).length) {
          finding.reachableCapabilities = pathCaps;
          finding.pathRisk = pathRisk;
        }
        // Update command node capabilities to reflect reachable
        cmdNode.capabilities = [...new Set([...(cmdNode.capabilities||[]), ...pathCaps])].sort();
      }

      // If no references or no successful resolutions, still create a path for the direct command
      if (createdPathsForFinding === 0) {
        const isAuto = AUTO_TRIGGER_KEYS.includes(finding.trigger) || finding.trigger === 'folderOpen' || ['preinstall','install','postinstall','prepare'].includes(finding.trigger) || finding.trigger.startsWith('mcp:');
        const pathRisk = computePathRisk(finding.capabilities||[], isAuto, finding.confidence);
        paths.push({
          id: `${result.file}:${finding.trigger}`,
          trigger: finding.trigger,
          sourcePath: result.file,
          chain: [result.file, finding.command],
          nodes: [configNode.id, triggerNode.id, cmdNode.id],
          capabilities: finding.capabilities||[],
          risk: pathRisk,
          confidence: finding.confidence,
          evidence: [{ path: result.file, field: finding.field, excerpt: finding.command }],
        });
        finding.reachableCapabilities = finding.capabilities;
        finding.pathRisk = pathRisk;
      }
    }
  }

  // Add capability nodes for each unique capability in paths
  const allCaps = [...new Set(paths.flatMap(p => p.capabilities))].sort();
  for (const cap of allCaps) {
    const capNode = addNode('CAPABILITY', cap, cap);
    capNode.capability = cap;
    // Connect scripts that have this cap
    for (const n of nodes.filter(x => x.capabilities && x.capabilities.includes(cap))) {
      if (n.kind === 'SCRIPT' || n.kind === 'COMMAND' || n.kind === 'FILE') {
        edges.push({ from: n.id, to: capNode.id, kind: 'CONNECTS_TO', evidence: { capability: cap } });
      }
    }
  }

  // Deduplicate nodes/edges and sort deterministically
  nodes.sort((a,b)=> a.id.localeCompare(b.id));
  edges.sort((a,b)=> (a.from+a.to+a.kind).localeCompare(b.from+b.to+b.kind));
  paths.sort((a,b)=> a.id.localeCompare(b.id));

  return { nodes, edges, paths, diagnostics };
}

// ---------------------------------------------------------------
// 8. Baseline / diff with semantic layer
// ---------------------------------------------------------------

const BASELINE_DIR = '.hookaudit';
const BASELINE_FILE = 'baseline.json';
const BASELINE_SCHEMA_VERSION = 2;
const POLICY_FILE = 'policy.json';
const POLICY_DEFAULT = { version: 1, blockOn: ['CRITICAL', 'HIGH'], warnOn: ['MEDIUM', 'WARN'] };
const POLICY_YAML_FILES = ['policy.yaml', 'policy.yml'];
const POLICY_TOML_FILES = ['policy.toml'];

// Minimal safe YAML subset parser for policy (zero-dep, no tags/anchors, bounded)
function stripYamlComment(line) {
  // Remove # comment outside quotes
  let inS = null, out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inS) { if (ch === inS) inS = null; out += ch; } else {
      if (ch === '"' || ch === "'") { inS = ch; out += ch; }
      else if (ch === '#') break;
      else out += ch;
    }
  }
  return out;
}
function countIndent(s) { let n=0; while(n<s.length && s[n]===' ' ) n++; return n; }
function parseYamlScalar(s) {
  s = s.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s,10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1,-1);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1,-1).trim();
    if (!inner) return [];
    // split by comma outside quotes
    const res=[]; let cur='', q=null;
    for (let i=0;i<inner.length;i++){const c=inner[i]; if(q){if(c===q)q=null; cur+=c;} else if(c=='"'||c=="'"){q=c;cur+=c;} else if(c===','){res.push(parseYamlScalar(cur));cur='';} else cur+=c;}
    if(cur.trim()) res.push(parseYamlScalar(cur));
    return res;
  }
  return s;
}
function parseYamlPolicy(text) {
  if (text.includes('\t')) { const e=new Error('tabs not allowed'); e.code='UNSUPPORTED_FORMAT'; throw e; }
  if (/^\s*%/.test(text) || /!\w/.test(text) || /&\w|^\s*\*\w/m.test(text) || /<<\s*:/.test(text) || /^\s*\?/m.test(text)) { const e=new Error('unsupported YAML feature'); e.code='UNSUPPORTED_FORMAT'; throw e; }
  if (text.includes('|') && /:\s*\|/.test(text)) { const e=new Error('block scalar not supported'); e.code='UNSUPPORTED_FORMAT'; throw e; }
  const lines = text.split('\n');
  const out = {};
  let i=0;
  while (i<lines.length) {
    const raw = lines[i];
    const stripped = stripYamlComment(raw).trimEnd();
    if (!stripped.trim() || stripped.trim().startsWith('#')) { i++; continue; }
    const indent = countIndent(raw);
    if (indent !== 0) { // only support top-level or nested via simple handling for defaults:
      // handle nested like defaults: blockOn: ... — collect as flat for now
      // If we are inside a block list, handle it above
      i++; continue;
    }
    const colon = stripped.indexOf(':');
    if (colon === -1) { const e=new Error('invalid yaml'); e.code='UNSUPPORTED_FORMAT'; throw e; }
    const key = stripped.slice(0, colon).trim();
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') { const e=new Error('prototype pollution'); e.code='UNSUPPORTED_FORMAT'; throw e; }
    let val = stripped.slice(colon+1).trim();
    if (val === '') {
      // block list next lines: "  - CRITICAL"
      const arr=[];
      let j=i+1;
      while (j<lines.length) {
        const nl = lines[j];
        const nstripped = stripYamlComment(nl).trimEnd();
        if (!nstripped.trim()) { j++; continue; }
        if (countIndent(nl) < 2) break;
        const m = nstripped.trim().match(/^-\s*(.*)$/);
        if (m) { arr.push(parseYamlScalar(m[1])); j++; } else break;
      }
      out[key]=arr; i=j; continue;
    } else {
      out[key]=parseYamlScalar(val);
    }
    i++;
  }
  return out;
}

// Minimal safe TOML subset parser for policy
function stripTomlComment(line) {
  let inS=null, out='';
  for(let i=0;i<line.length;i++){const c=line[i]; if(inS){ if(c===inS && line[i-1]!=='\\') inS=null; out+=c; } else { if(c==='"'||c==="'"){inS=c; out+=c;} else if(c==='#'){break;} else out+=c; } }
  return out;
}
function stripQuotes(s){ s=s.trim(); if((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'"))) return s.slice(1,-1).replace(/\\"/g,'"').replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\\\/g,'\\'); return s; }
function parseTomlValue(s){
  s=s.trim();
  if(s.startsWith('[')&&s.endsWith(']')){
    const inner=s.slice(1,-1).trim(); if(!inner) return [];
    const res=[]; let cur='', q=null;
    for(let i=0;i<inner.length;i++){const c=inner[i]; if(q){ if(c===q && inner[i-1]!=='\\') q=null; cur+=c;} else if(c==='"'||c==="'"){q=c; cur+=c;} else if(c===','){res.push(parseTomlValue(cur)); cur='';} else cur+=c;}
    if(cur.trim()) res.push(parseTomlValue(cur));
    return res.map(v=> typeof v==='string'? stripQuotes(v) : v);
  }
  if(s==='true') return true; if(s==='false') return false;
  if(/^".*"$/.test(s)) return s.slice(1,-1).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
  if(/^'.*'$/.test(s)) return s.slice(1,-1);
  if(/^-?\d+$/.test(s)) return parseInt(s,10);
  if(/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return stripQuotes(s);
}
function parseTomlPolicy(text){
  if (text.includes('[[array')) { const e=new Error('array of tables not supported'); e.code='UNSUPPORTED_FORMAT'; throw e; }
  if (/\{[^}]+\}/.test(text) && /=\s*\{/.test(text)) { const e=new Error('inline table not supported'); e.code='UNSUPPORTED_FORMAT'; throw e; }
  if (/"""/.test(text) || /'''/.test(text)) { const e=new Error('multiline string not supported'); e.code='UNSUPPORTED_FORMAT'; throw e; }
  const lines=text.split('\n'); const out={}; let currentTable=null;
  for(let raw of lines){
    const line=stripTomlComment(raw).trim();
    if(!line) continue;
    if(line.startsWith('[')&&line.endsWith(']')){
      const tbl=line.slice(1,-1).trim();
      if(tbl==='__proto__'||tbl==='constructor') { const e=new Error('proto'); e.code='UNSUPPORTED_FORMAT'; throw e; }
      currentTable=tbl; if(!out[currentTable]) out[currentTable]={}; continue;
    }
    const eq=line.indexOf('=');
    if(eq===-1) { const e=new Error('invalid toml'); e.code='UNSUPPORTED_FORMAT'; throw e; }
    let key=line.slice(0,eq).trim().replace(/^["']|["']$/g,'');
    let valS=line.slice(eq+1).trim();
    // handle multiline array: if starts with [ but not ends, accumulate
    if(valS.startsWith('[')&&!valS.endsWith(']')){
      let acc=valS; let idx=lines.indexOf(raw)+1;
      while(idx<lines.length && !acc.trim().endsWith(']')){ acc+='\n'+stripTomlComment(lines[idx]); idx++; }
      valS=acc;
    }
    const val=parseTomlValue(valS);
    if(currentTable){
      out[currentTable][key]=val;
    } else {
      if(key==='__proto__') continue;
      out[key]=val;
    }
  }
  // unwrap [policy] table if used
  if(out.policy && typeof out.policy==='object') return Object.assign({}, out.policy, { defaults: out.defaults });
  return out;
}

function policyPath(root) {
  return path.join(root, BASELINE_DIR, POLICY_FILE);
}

function loadPolicy(root, diagnostics) {
  const candidates = [
    policyPath(root), path.join(root, POLICY_FILE),
    path.join(root, BASELINE_DIR, POLICY_YAML_FILES[0]), path.join(root, BASELINE_DIR, POLICY_YAML_FILES[1]), path.join(root, POLICY_YAML_FILES[0]), path.join(root, POLICY_YAML_FILES[1]),
    path.join(root, BASELINE_DIR, POLICY_TOML_FILES[0]), path.join(root, POLICY_TOML_FILES[0]),
  ];
  for (const p of candidates) {
    if (!exists(p)) continue;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      if (raw.length > 64 * 1024) continue;
      let j;
      if (p.endsWith('.yaml') || p.endsWith('.yml')) {
        try { j = parseYamlPolicy(raw.replace(/^\uFEFF/,'')); } catch (e) { if (diagnostics) diagnostics.push({ code: e.code||DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: toPosix(path.relative(root,p)), detail: e.message }); continue; }
      } else if (p.endsWith('.toml')) {
        try { j = parseTomlPolicy(raw.replace(/^\uFEFF/,'')); } catch (e) { if (diagnostics) diagnostics.push({ code: e.code||DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: toPosix(path.relative(root,p)), detail: e.message }); continue; }
      } else {
        j = JSON.parse(raw);
      }
      if (j && typeof j==='object' && j.defaults && typeof j.defaults==='object') {
        // allow nested defaults: merge if top-level missing
        if (!j.blockOn && j.defaults.blockOn) j.blockOn = j.defaults.blockOn;
        if (!j.warnOn && j.defaults.warnOn) j.warnOn = j.defaults.warnOn;
      }
      const blockOn = Array.isArray(j.blockOn) ? j.blockOn.filter((x) => typeof x === 'string') : POLICY_DEFAULT.blockOn.slice();
      const warnOn = Array.isArray(j.warnOn) ? j.warnOn.filter((x) => typeof x === 'string') : POLICY_DEFAULT.warnOn.slice();
      const version = typeof j.version === 'number' ? j.version : 1;
      return { version, blockOn, warnOn, source: toPosix(path.relative(root, p)) || p, raw: j };
    } catch {
      continue;
    }
  }
  return null;
}

function evaluatePolicy(policy, summary, results, graph) {
  if (!policy) return null;
  const blockOn = new Set(policy.blockOn);
  const warnOn = new Set(policy.warnOn);
  const findings = results.flatMap((r) => r.findings);
  const pathRisks = graph && graph.paths ? graph.paths.map((p) => p.risk) : [];
  let wouldBlock = false;
  let wouldReview = false;
  const reasons = [];
  for (const f of findings) {
    if (blockOn.has(f.severity)) { wouldBlock = true; reasons.push(`${f.severity} finding in ${f.sourcePath || f.field || f.trigger}`); }
    else if (warnOn.has(f.severity)) { wouldReview = true; reasons.push(`${f.severity} warn in ${f.sourcePath || f.field}`); }
    if (f.pathRisk) {
      if (blockOn.has(f.pathRisk)) { wouldBlock = true; reasons.push(`pathRisk ${f.pathRisk} in ${f.sourcePath || f.trigger}`); }
      else if (warnOn.has(f.pathRisk)) { wouldReview = true; }
    }
  }
  for (const r of pathRisks) {
    if (blockOn.has(r)) { wouldBlock = true; reasons.push(`path risk ${r}`); }
    else if (warnOn.has(r)) { wouldReview = true; }
  }
  if (blockOn.has(summary.decision)) wouldBlock = true;
  else if (warnOn.has(summary.decision)) wouldReview = true;
  let decision = 'PASS';
  if (wouldBlock) decision = 'BLOCK';
  else if (wouldReview || summary.decision === 'REVIEW' || summary.decision === 'BLOCK') {
    // preserve REVIEW if baseline had findings but policy didn't block; don't auto-PASS a dirty tree
    decision = summary.decision === 'BLOCK' && !wouldBlock ? 'REVIEW' : (wouldReview || summary.decision !== 'PASS' ? 'REVIEW' : 'PASS');
    if (summary.critical === 0 && summary.warn === 0 && pathRisks.filter((x) => x === 'HIGH' || x === 'CRITICAL').length === 0) decision = 'PASS';
    if (wouldReview) decision = 'REVIEW';
    if (wouldBlock) decision = 'BLOCK';
  }
  return { decision, wouldBlock, wouldReview, reasons: [...new Set(reasons)].slice(0, 8) };
}

function baselinePath(root) {
  return path.join(root, BASELINE_DIR, BASELINE_FILE);
}

function writeBaseline(root, results, graph) {
  fs.mkdirSync(path.join(root, BASELINE_DIR), { recursive: true });
  const files = Object.fromEntries(results.map((r) => [r.file, r.hash]));
  const surfaces = results.map(r => ({ file: r.file, surface: r.surface, hash: r.hash, capabilities: r.capabilities||[], findings: r.findings.map(f=> ({ trigger:f.trigger, command:f.command, severity:f.severity, capabilities:f.capabilities })) }));
  surfaces.sort((a,b)=> a.file.localeCompare(b.file));
  const capabilitySummary = [...new Set(results.flatMap(r=> r.capabilities||[]))].sort();
  const record = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    files,
    surfaces,
    capabilitySummary,
    graphSummary: graph ? { nodes: graph.nodes.length, edges: graph.edges.length, paths: graph.paths.length } : undefined,
  };
  fs.writeFileSync(baselinePath(root), JSON.stringify(record, null, 2) + '\n');
  return record;
}

function readBaseline(root) {
  const p = baselinePath(root);
  if (!exists(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function diffAgainstBaseline(root, results, graph) {
  const baseline = readBaseline(root);
  if (!baseline) return null;
  const currentFiles = Object.fromEntries(results.map((r) => [r.file, r.hash]));
  const baselineFiles = baseline.files || {};
  // Handle legacy baseline without surfaces
  const baselineSurfaces = baseline.surfaces || [];
  const currentSurfaces = results.map(r=> ({ file:r.file, hash:r.hash, triggers: r.findings.map(f=> f.trigger).sort(), commands: r.findings.map(f=> f.command).sort(), capabilities: (r.capabilities||[]).sort() }));
  const byFileBaseline = new Map(baselineSurfaces.map(s=> [s.file, s]));
  const byFileCurrent = new Map(currentSurfaces.map(s=> [s.file, s]));

  const changes = [];
  for (const [file, hash] of Object.entries(currentFiles)) {
    if (!(file in baselineFiles)) changes.push({ file, type: 'NEW' });
    else if (baselineFiles[file] !== hash) changes.push({ file, type: 'CHANGED' });
  }
  for (const file of Object.keys(baselineFiles)) {
    if (!(file in currentFiles)) changes.push({ file, type: 'REMOVED' });
  }

  // Semantic diff
  const semantic = [];
  for (const [file, cur] of byFileCurrent.entries()) {
    const base = byFileBaseline.get(file);
    if (!base) {
      // NEW file semantic
      if (cur.triggers.length) semantic.push({ file, type: 'NEW_TRIGGER', detail: cur.triggers.join(', ') });
      if (cur.capabilities.length) semantic.push({ file, type: 'NEW_CAPABILITY', detail: cur.capabilities.join(', ') });
      continue;
    }
    const baseTriggers = (base.findings||[]).map(f=> f.trigger).sort();
    const curTriggers = cur.triggers;
    for (const t of curTriggers) if (!baseTriggers.includes(t)) semantic.push({ file, type: 'NEW_TRIGGER', detail: t });
    for (const t of baseTriggers) if (!curTriggers.includes(t)) semantic.push({ file, type: 'REMOVED_TRIGGER', detail: t });

    const baseCmds = (base.findings||[]).map(f=> f.command).sort();
    const curCmds = cur.commands;
    for (const c of curCmds) if (!baseCmds.includes(c)) semantic.push({ file, type: 'NEW_COMMAND', detail: c.slice(0,80) });
    // Note: removed command detection omitted for brevity — file CHANGED already covers

    const baseCaps = (base.capabilities||[]).sort();
    const curCaps = cur.capabilities;
    for (const cap of curCaps) if (!baseCaps.includes(cap)) semantic.push({ file, type: 'NEW_CAPABILITY', detail: cap });
    // Reference diff via graph: if graph available compare paths
  }
  for (const base of baselineSurfaces) {
    if (!byFileCurrent.has(base.file)) {
      semantic.push({ file: base.file, type: 'REMOVED_SURFACE', detail: base.surface });
    }
  }

  changes.sort((a, b) => a.file.localeCompare(b.file) || a.type.localeCompare(b.type));
  semantic.sort((a,b)=> a.file.localeCompare(b.file) || a.type.localeCompare(b.type));

  return { baseline, changes, semantic, graph: graph ? { nodes: graph.nodes, edges: graph.edges, paths: graph.paths } : undefined };
}

// ---------------------------------------------------------------
// 9. Report rendering
// ---------------------------------------------------------------

function colorFor(sev) {
  if (sev === 'CRITICAL') return 'red';
  if (sev === 'WARN') return 'yellow';
  if (sev === 'HIGH') return 'red';
  if (sev === 'MEDIUM') return 'yellow';
  return 'gray';
}

function printHuman(results, diff, graph, diagnostics, policy, policyEval) {
  const withFindings = results.filter((r) => r.findings.length || r.parseError);
  const allFindings = results.flatMap(r=> r.findings);
  const hasGraph = graph && graph.paths && graph.paths.length;

  if (!withFindings.length && (!diff || !diff.changes.length) && (!diagnostics || !diagnostics.length)) {
    console.log(styleText('green', '✔ No auto-executing agent/editor/lifecycle hooks found.'));
    console.log(`  Scanned ${results.length} known surface file(s).`);
    console.log(`  Graph: ${graph ? `${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.paths.length} paths` : 'no paths'}`);
    console.log(styleText('gray', '  No high-risk execution paths detected in supported/analyzed surfaces.'));
    return;
  }

  console.log(styleText('bold', `hookaudit — ${results.length} surface file(s) scanned`));
  if (hasGraph) console.log(styleText('gray', `  Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.paths.length} execution path(s)`));
  console.log('');

  // High-risk paths first
  if (hasGraph && graph.paths.filter(p=> p.risk==='CRITICAL'||p.risk==='HIGH').length) {
    console.log(styleText('bold', 'High-risk execution paths:'));
    const highPaths = graph.paths.filter(p=> p.risk==='CRITICAL'||p.risk==='HIGH').sort((a,b)=> (a.risk==='CRITICAL'?0:1)-(b.risk==='CRITICAL'?0:1));
    for (const p of highPaths.slice(0, 10)) {
      const col = p.risk==='CRITICAL' ? 'red' : 'yellow';
      console.log(`  ${styleText(col, p.risk)} confidence=${p.confidence} trigger="${p.trigger}"`);
      console.log(`    Path: ${p.chain.join(' → ')}`);
      if (p.capabilities.length) console.log(`    Capabilities: ${p.capabilities.join(', ')}`);
    }
    console.log('');
  }

  for (const r of results) {
    if (!r.findings.length && !r.parseError) continue;
    console.log(styleText('bold', r.file) + styleText('gray', `  [${r.surface}]`));
    if (r.parseError) console.log('  ' + styleText('yellow', `⚠ ${r.parseError}`));
    if (r.diagnostics && r.diagnostics.length) {
      for (const d of r.diagnostics) console.log('  ' + styleText('gray', `◇ ${d.code} ${d.path||''}`));
    }
    for (const f of r.findings) {
      const sevCol = colorFor(f.severity);
      const riskStr = f.pathRisk ? ` pathRisk=${f.pathRisk}` : '';
      console.log(`  ${styleText(sevCol, f.severity)} trigger="${f.trigger}"${riskStr} confidence=${f.confidence||'HIGH'}`);
      console.log('    ' + styleText('gray', f.command ? f.command.slice(0, 120) : ''));
      if (f.capabilities && f.capabilities.length) console.log('    ' + styleText('cyan', `capabilities: ${f.capabilities.join(', ')}`));
      if (f.reachableCapabilities && f.reachableCapabilities.length) console.log('    ' + styleText('magenta', `reachable: ${f.reachableCapabilities.join(', ')}`));
      for (const reason of f.reasons) console.log('    - ' + reason);
      if (f.evidence && f.evidence.length) {
        for (const ev of f.evidence.slice(0,2)) console.log('      ' + styleText('gray', `evidence: ${ev.detector||''} ${ev.field||''} ${ev.excerpt?ev.excerpt.slice(0,60):''}`));
      }
    }
    console.log('');
  }

  if (diagnostics && diagnostics.length) {
    console.log(styleText('bold', 'Diagnostics:'));
    for (const d of diagnostics.slice(0,20)) {
      console.log(`  ${styleText('gray', d.code)} ${d.path||''} ${d.detail?`- ${d.detail.slice(0,80)}`:''}`);
    }
    console.log('');
  }

  if (diff && diff.changes.length) {
    console.log(styleText('bold', 'Drift since baseline:'));
    for (const c of diff.changes) {
      const label = c.type === 'REMOVED' ? styleText('gray', c.type) : styleText('yellow', c.type);
      console.log(`  ${label}  ${c.file}`);
    }
    if (diff.semantic && diff.semantic.length) {
      console.log(styleText('bold', 'Semantic changes:'));
      for (const s of diff.semantic) console.log(`  ${styleText('cyan', s.type)}  ${s.file} — ${s.detail.slice(0,80)}`);
    }
    console.log('');
  }

  const critical = allFindings.filter((f) => f.severity === 'CRITICAL').length;
  const warn = allFindings.filter((f) => f.severity === 'WARN').length;
  const highPaths = hasGraph ? graph.paths.filter(p=> p.risk==='HIGH'||p.risk==='CRITICAL').length : 0;
  console.log(`Summary: ${styleText('red', String(critical) + ' CRITICAL')}, ${styleText('yellow', String(warn) + ' WARN')}${hasGraph?`, ${highPaths} high-risk path(s)`:''}`);
  if (!critical && !highPaths) console.log(styleText('gray', 'No high-risk execution paths detected in supported/analyzed surfaces.'));
  console.log(styleText('gray', 'Unsupported execution surfaces were not analyzed.'));
  if (policy) {
    const col = policyEval && policyEval.decision === 'BLOCK' ? 'red' : policyEval && policyEval.decision === 'REVIEW' ? 'yellow' : 'green';
    console.log(styleText(col, `Policy: ${policyEval ? policyEval.decision : 'PASS'} (blockOn: ${policy.blockOn.join(', ')})${policyEval && policyEval.reasons.length ? ' — ' + policyEval.reasons.slice(0,2).join('; ') : ''}`));
    console.log(styleText('gray', `  Policy source: ${policy.source}`));
  }
}

function sarifLevelFor(f) {
  // Map HookAudit severity/risk to SARIF level: error=HIGH/CRITICAL, warning=MEDIUM/WARN, note=LOW/INFO
  if (f.severity === 'CRITICAL' || f.pathRisk === 'CRITICAL' || f.pathRisk === 'HIGH') return 'error';
  if (f.severity === 'WARN' || f.pathRisk === 'MEDIUM') return 'warning';
  return 'note';
}

function sarifRuleIdForCapability(cap) {
  return 'HOOKAUDIT.' + cap;
}

function generateSarif(results, graph, diagnostics, root, policy, policyEval) {
  const allFindings = results.flatMap(r=> r.findings);
  const version = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || '0.1.0'; } catch { return '0.1.0'; }})();
  const toolName = 'hookaudit';
  // Collect unique rule IDs from capabilities + diagnostics
  const ruleSet = new Map();
  for (const f of allFindings) for (const cap of (f.capabilities||[])) {
    const id = sarifRuleIdForCapability(cap);
    if (!ruleSet.has(id)) ruleSet.set(id, { id, name: cap, shortDescription: { text: cap }, fullDescription: { text: `Capability ${cap} reachable via execution path` }, help: { text: (RULES.find(r=> r.capabilities.includes(cap))?.why || cap) }, properties: { tags: ['security', 'execution-topology'], severity: cap } });
  }
  // Add generic rules for diagnostics / HIGH-RISK path without cap
  for (const f of allFindings) if (!f.capabilities || !f.capabilities.length) {
    const id = 'HOOKAUDIT.EXECUTION_SURFACE';
    if (!ruleSet.has(id)) ruleSet.set(id, { id, name: 'EXECUTION_SURFACE', shortDescription: { text: 'Execution surface detected' }, fullDescription: { text: 'Repository-controlled execution surface' }, help: { text: 'Execution surface requires review' } });
  }
  const rules = Array.from(ruleSet.values()).sort((a,b)=> a.id.localeCompare(b.id));
  if (!rules.length) rules.push({ id: 'HOOKAUDIT.NO_FINDING', name: 'NO_FINDING', shortDescription: { text: 'No execution surface' }, fullDescription: { text: 'No high-risk execution surface detected' } });
  const sarifResults = [];
  for (const r of results) for (const f of r.findings) {
    const caps = f.capabilities && f.capabilities.length ? f.capabilities : ['EXECUTION_SURFACE'];
    for (const cap of caps) {
      const ruleId = sarifRuleIdForCapability(cap);
      const level = sarifLevelFor({ severity: f.severity, pathRisk: f.pathRisk });
      const fingerprint = crypto.createHash('sha256').update(`${r.file}:${f.field||''}:${f.command||''}:${cap}`).digest('hex').slice(0, 16);
      // Escape handled by JSON.stringify; use textContent style via JSON
      const messageText = `[${f.severity}${f.pathRisk?`/${f.pathRisk}`:''}] ${f.trigger} — ${f.reasons.slice(0,2).join('; ')} | capabilities: ${(f.capabilities||[]).join(', ')} | confidence: ${f.confidence||'HIGH'}`;
      const props = {
        trigger: f.trigger,
        surfaceType: r.surface,
        sourcePath: r.file,
        field: f.field || null,
        detector: (f.evidence && f.evidence[0]?.detector) || null,
        confidence: f.confidence || 'HIGH',
        capabilities: f.capabilities || [],
        reachableCapabilities: f.reachableCapabilities || [],
        risk: f.pathRisk || f.severity,
        severity: f.severity,
        score: f.score,
        referenceState: (f.evidence && f.evidence[0]?.reason) || null,
      };
      sarifResults.push({
        ruleId,
        level,
        message: { text: messageText },
        locations: [{ physicalLocation: { artifactLocation: { uri: toPosix(r.file), uriBaseId: '%SRCROOT%' }, region: { startLine: 1, startColumn: 1 } } }],
        properties: props,
        partialFingerprints: { primaryLocationLineHash: fingerprint },
        fingerprints: { '0': fingerprint },
      });
    }
  }
  // Diagnostics as SARIF notifications or results with info? Map to results with note level under a generic rule
  for (const d of (diagnostics||[])) {
    // Only surface important diagnostics as informational findings, don't spam small ones? Keep all but with note
    sarifResults.push({
      ruleId: `HOOKAUDIT.${d.code}`,
      level: 'note',
      message: { text: `[${d.code}] ${d.path||''} ${d.detail||''}`.trim() },
      locations: [{ physicalLocation: { artifactLocation: { uri: toPosix(d.path||'.'), uriBaseId: '%SRCROOT%' }, region: { startLine: 1, startColumn: 1 } } }],
      properties: { diagnostic: d.code, path: d.path||null, detail: d.detail||null },
      fingerprints: { '0': crypto.createHash('sha256').update(`${d.code}:${d.path||''}:${d.detail||''}`).digest('hex').slice(0,16) },
    });
  }
  // Ensure diagnostics rule exists if we added diagnostic results
  const diagCodes = new Set((diagnostics||[]).map(d=> `HOOKAUDIT.${d.code}`));
  for (const code of diagCodes) if (!ruleSet.has(code)) {
    ruleSet.set(code, { id: code, name: code.replace('HOOKAUDIT.',''), shortDescription: { text: code }, fullDescription: { text: `Diagnostic ${code}` } });
  }
  const allRules = Array.from(ruleSet.values()).sort((a,b)=> a.id.localeCompare(b.id));
  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: toolName, version, informationUri: 'https://github.com/rohitkumarnaidu/HookAudit', rules: allRules, properties: { tags: ['security','execution-topology'] } } },
      invocations: [{ executionSuccessful: true, properties: { repository: toPosix(root), policy: policy ? { source: policy.source, blockOn: policy.blockOn, evaluated: policyEval?.decision||null } : null } }],
      artifacts: Array.from(new Set(results.map(r=> r.file))).sort().map(f=> ({ location: { uri: toPosix(f), uriBaseId: '%SRCROOT%' } })),
      results: sarifResults.sort((a,b)=> (a.ruleId+a.locations[0].physicalLocation.artifactLocation.uri).localeCompare(b.ruleId+b.locations[0].physicalLocation.artifactLocation.uri)),
      properties: { summary: { executionSurfaces: results.length, totalFindings: allFindings.length, highRiskPaths: graph ? graph.paths.filter(p=> p.risk==='HIGH'||p.risk==='CRITICAL').length : 0, decision: policyEval?.decision || (allFindings.some(f=> f.severity==='CRITICAL')?'BLOCK':'REVIEW') } }
    }]
  };
}

function printSarif(results, graph, diagnostics, root, policy, policyEval) {
  const sarif = generateSarif(results, graph, diagnostics, root, policy, policyEval);
  console.log(JSON.stringify(sarif, null, 2));
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function generateHtmlReport(results, diff, graph, diagnostics, root, policy, policyEval) {
  const allFindings = results.flatMap(r=> r.findings);
  const title = `HookAudit Report — ${escapeHtml(toPosix(root))}`;
  const summary = {
    surfaces: results.length,
    withFindings: results.filter(r=> r.findings.length).length,
    totalFindings: allFindings.length,
    critical: allFindings.filter(f=> f.severity==='CRITICAL').length,
    warn: allFindings.filter(f=> f.severity==='WARN').length,
    paths: graph ? graph.paths.length : 0,
    highRisk: graph ? graph.paths.filter(p=> p.risk==='HIGH'||p.risk==='CRITICAL').length : 0,
    decision: policyEval?.decision || (allFindings.some(f=> f.severity==='CRITICAL')|| (graph&&graph.paths.some(p=> p.risk==='HIGH'||p.risk==='CRITICAL')) ? 'BLOCK' : (allFindings.some(f=> f.severity==='WARN') ? 'REVIEW' : 'PASS')),
    diagnostics: (diagnostics||[]).length,
  };
  const dataJson = escapeHtml(JSON.stringify({ results, diff, graph, diagnostics, summary, policy: policy?{source:policy.source,blockOn:policy.blockOn}:null }, null, 2));
  // Build HTML sections
  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:ui-sans,system-ui,Segoe UI,Helvetica,Arial,sans-serif;margin:0;background:#f8fafc;color:#0f172a}header{background:#0f172a;color:#fff;padding:24px}header h1{margin:0;font-size:22px}header p{margin:6px 0 0;color:#94a3b8}.wrap{max-width:1100px;margin:0 auto;padding:24px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:12px 0}.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}.badge-critical{background:#fee2e2;color:#991b1b}.badge-warn{background:#fef9c3;color:#854d0e}.badge-pass{background:#dcfce7;color:#166534}.badge-review{background:#fef9c3;color:#854d0e}.badge-block{background:#fee2e2;color:#991b1b}pre{white-space:pre-wrap;word-break:break-word;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:12px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}th{background:#f1f5f9}.path{font-family:ui-monospace,monospace;background:#f1f5f9;padding:2px 6px;border-radius:6px}.sev-CRITICAL{color:#b91c1c;font-weight:700}.sev-HIGH{color:#b91c1c}.sev-MEDIUM{color:#a16207}.sev-LOW{color:#475569}svg{width:100%;height:auto;border:1px solid #e2e8f0;border-radius:8px;background:#fff}</style>
</head><body><header><h1>HookAudit — Repository Execution-Topology Report</h1><p>${escapeHtml(toPosix(root))} · ${new Date().toISOString()} · decision <span class="badge badge-${summary.decision.toLowerCase()}">${summary.decision}</span></p></header><div class="wrap">`;
  html += `<div class="card"><h2>Summary</h2><p>Surfaces: <b>${summary.surfaces}</b> · With findings: <b>${summary.withFindings}</b> · Findings: <b>${summary.totalFindings}</b> · CRITICAL: <b>${summary.critical}</b> · WARN: <b>${summary.warn}</b> · Paths: <b>${summary.paths}</b> · High-risk paths: <b>${summary.highRisk}</b> · Diagnostics: <b>${summary.diagnostics}</b></p>`;
  if (policy) html += `<p>Policy: <code>${escapeHtml(policy.source)}</code> blockOn=${escapeHtml(policy.blockOn.join(','))} → ${escapeHtml(policyEval?.decision||'PASS')}</p>`;
  if (diff) html += `<p>Baseline drift: ${diff.changes.length} file(s) changed, ${diff.semantic.length} semantic change(s)</p>`;
  html += `</div>`;
  // Graph SVG (simple layered)
  if (graph && graph.nodes.length) {
    const layers = new Map();
    for (const n of graph.nodes) {
      const depth = n.kind==='REPOSITORY'?0 : n.kind==='CONFIG'?1 : n.kind==='TRIGGER'?2 : n.kind==='COMMAND'?3 : n.kind==='SCRIPT'||n.kind==='FILE'?4 : 5;
      if (!layers.has(depth)) layers.set(depth, []);
      layers.get(depth).push(n);
    }
    const depths = Array.from(layers.keys()).sort((a,b)=>a-b);
    const svgW = Math.max(800, depths.length*180);
    const svgH = Math.max(260, Math.max(...Array.from(layers.values()).map(a=>a.length))*48 + 40);
    html += `<div class="card"><h2>Execution Graph — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.paths.length} paths</h2><svg viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="Execution graph"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs>`;
    const pos = new Map();
    depths.forEach((d, di) => {
      const nodes = layers.get(d);
      nodes.forEach((n, ni) => {
        const x = 80 + di*160;
        const y = 40 + ni*44;
        pos.set(n.id, {x,y});
        const color = n.kind==='TRIGGER'?'#0f172a': n.kind==='SCRIPT'?'#e0f2fe' : n.kind==='CAPABILITY'?'#fef9c3' : '#fff';
        const stroke = n.capabilities && n.capabilities.length && graph.paths.some(p=> p.nodes.includes(n.id) && (p.risk==='HIGH'||p.risk==='CRITICAL')) ? '#991b1b' : '#cbd5e1';
        html += `<g><rect x="${x-56}" y="${y-14}" width="112" height="28" rx="8" fill="${color}" stroke="${stroke}"/><text x="${x}" y="${y+4}" text-anchor="middle" font-size="10" fill="#0f172a">${escapeHtml((n.label||n.path||n.id).slice(0,18))}</text><title>${escapeHtml(n.kind+': '+(n.label||n.path))}</title></g>`;
      });
    });
    for (const e of graph.edges.slice(0,120)) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a||!b) continue;
      html += `<path d="M ${a.x+56} ${a.y} C ${a.x+100} ${a.y}, ${b.x-100} ${b.y}, ${b.x-56} ${b.y}" fill="none" stroke="#64748b" stroke-width="1.2" marker-end="url(#arrow)"/>`;
    }
    html += `</svg><p style="color:#64748b;font-size:12px">Graph rendered from analysis.graph — deterministic layout. High-risk nodes outlined in red.</p></div>`;
  }
  // Paths
  html += `<div class="card"><h2>Execution Paths — ${graph?graph.paths.length:0}</h2>`;
  if (graph && graph.paths.length) {
    const sorted = [...graph.paths].sort((a,b)=> (a.risk==='CRITICAL'?0:a.risk==='HIGH'?1:2)-(b.risk==='CRITICAL'?0:b.risk==='HIGH'?1:2));
    html += `<table><tr><th>Risk</th><th>Confidence</th><th>Trigger</th><th>Chain</th><th>Capabilities</th></tr>`;
    for (const p of sorted.slice(0,20)) {
      html += `<tr><td class="sev-${p.risk}">${escapeHtml(p.risk)}</td><td>${escapeHtml(p.confidence)}</td><td>${escapeHtml(p.trigger)}</td><td><span class="path">${escapeHtml(p.chain.join(' → '))}</span></td><td>${escapeHtml(p.capabilities.join(', '))}</td></tr>`;
    }
    html += `</table>`;
  } else html += `<p>No execution paths.</p>`;
  html += `</div>`;
  // Findings
  html += `<div class="card"><h2>Findings — ${allFindings.length}</h2><table><tr><th>File</th><th>Trigger</th><th>Severity</th><th>PathRisk</th><th>Capabilities</th><th>Evidence</th></tr>`;
  for (const r of results) for (const f of r.findings) {
    html += `<tr><td>${escapeHtml(r.file)}</td><td>${escapeHtml(f.trigger)}</td><td class="sev-${f.severity}">${escapeHtml(f.severity)}</td><td>${escapeHtml(f.pathRisk||'')}</td><td>${escapeHtml((f.capabilities||[]).join(', '))}</td><td>${escapeHtml((f.evidence&&f.evidence[0]?.detector)||'')} ${escapeHtml((f.reasons&&f.reasons[0]||'').slice(0,80))}</td></tr>`;
  }
  if (!allFindings.length) html += `<tr><td colspan="6" style="text-align:center;color:#64748b">No findings — no high-risk execution paths detected.</td></tr>`;
  html += `</table></div>`;
  // Diagnostics
  html += `<div class="card"><h2>Diagnostics — ${(diagnostics||[]).length}</h2><table><tr><th>Code</th><th>Path</th><th>Detail</th></tr>`;
  for (const d of (diagnostics||[]).slice(0,40)) html += `<tr><td>${escapeHtml(d.code)}</td><td>${escapeHtml(d.path||'')}</td><td>${escapeHtml(d.detail||'')}</td></tr>`;
  if (!(diagnostics||[]).length) html += `<tr><td colspan="3" style="text-align:center;color:#64748b">No diagnostics.</td></tr>`;
  html += `</table></div>`;
  // Diff
  if (diff) {
    html += `<div class="card"><h2>Baseline Diff — ${diff.changes.length} file(s), ${diff.semantic.length} semantic</h2><table><tr><th>Type</th><th>File</th><th>Detail</th></tr>`;
    for (const c of diff.changes) html += `<tr><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.file)}</td><td></td></tr>`;
    for (const s of diff.semantic) html += `<tr><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.file)}</td><td>${escapeHtml(s.detail||'')}</td></tr>`;
    html += `</table></div>`;
  }
  // Embedded data
  html += `<div class="card"><h2>Embedded Report Data (JSON)</h2><pre id="report-data">${dataJson}</pre></div>`;
  html += `<div class="card"><h2>Limitations</h2><p style="font-size:13px;color:#475569">This is static analysis. Dynamic constructs are reported as DYNAMIC_EXECUTION/UNRESOLVED_REFERENCE with LOW confidence. TOML/YAML without stdlib parsers are heuristic. Working-tree only unless git-branches is used. Baseline records trust, not proof of safety.</p></div>`;
  html += `</div><footer style="text-align:center;color:#64748b;padding:24px;font-size:12px">HookAudit — zero third-party runtime deps · generated ${new Date().toISOString()} · <code>node bin/hookaudit.js --html report.html</code></footer>
<script>
// Lightweight interaction: click path row highlight, filter capabilities
document.addEventListener('click', e=>{
  const tr=e.target.closest('tr'); if(tr&&tr.parentElement.tagName==='TBODY'){ document.querySelectorAll('tr.selected').forEach(x=>x.classList.remove('selected')); tr.classList.add('selected'); }
});
</script></body></html>`;
  return html;
}

function writeHtmlReport(filePath, results, diff, graph, diagnostics, root, policy, policyEval) {
  const html = generateHtmlReport(results, diff, graph, diagnostics, root, policy, policyEval);
  fs.writeFileSync(filePath, html, 'utf8');
  return filePath;
}

// ---------------------------------------------------------------
// 10a. Git multi-branch walker (zero-dep, node:zlib, no git exec)
// ---------------------------------------------------------------
const MAX_GIT_OBJECT_SIZE = 5 * 1024 * 1024;
const MAX_GIT_TREE_DEPTH = 64;
const MAX_GIT_TREE_ENTRIES = 4096;
const MAX_BRANCHES = 64;

function readGitRef(gitDir, ref) {
  // ref can be symbolic like "ref: refs/heads/master" or 40-hex
  if (!ref) return null;
  ref = ref.trim();
  if (ref.startsWith('ref:')) {
    const target = ref.slice(4).trim();
    const p = path.join(gitDir, target);
    try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; }
  }
  if (/^[0-9a-f]{40}$/i.test(ref)) return ref;
  return null;
}

function discoverBranches(gitDir, diagnostics) {
  const branches = new Map(); // name -> oid
  // Check HEAD
  let headOid = null;
  try {
    const headContent = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    headOid = readGitRef(gitDir, headContent);
  } catch {}
  // Loose refs in refs/heads
  const headsDir = path.join(gitDir, 'refs', 'heads');
  try {
    const entries = fs.readdirSync(headsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() || e.isSymbolicLink()) {
        try {
          const oid = fs.readFileSync(path.join(headsDir, e.name), 'utf8').trim();
          if (/^[0-9a-f]{40}$/i.test(oid)) branches.set(e.name, oid);
        } catch {}
      }
    }
  } catch {}
  // Walk nested heads (e.g., refs/heads/feature/x)
  try {
    const walk = (dir, prefix='') => {
      const ents = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of ents) {
        const full = path.join(dir, ent.name);
        const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
        if (ent.isDirectory()) { if (branches.size < MAX_BRANCHES) walk(full, rel); }
        else if (ent.isFile()) {
          try {
            const oid = fs.readFileSync(full, 'utf8').trim();
            if (/^[0-9a-f]{40}$/i.test(oid) && !branches.has(rel)) branches.set(rel, oid);
          } catch {}
        }
      }
    };
    if (exists(headsDir)) walk(headsDir);
  } catch {}
  // Packed-refs
  const packedPath = path.join(gitDir, 'packed-refs');
  if (exists(packedPath)) {
    try {
      const content = fs.readFileSync(packedPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('^')) continue;
        const [oid, ref] = trimmed.split(/\s+/);
        if (!oid || !ref) continue;
        if (ref.startsWith('refs/heads/') && /^[0-9a-f]{40}$/i.test(oid)) {
          const name = ref.slice('refs/heads/'.length);
          if (!branches.has(name)) branches.set(name, oid); // loose wins over packed, so only if not already
        }
      }
    } catch (e) { if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: 'packed-refs', detail: e.message }); }
  }
  // Ensure HEAD branch name if symbolic
  try {
    const headContent = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (headContent.startsWith('ref:')) {
      const headName = headContent.slice(4).trim().replace('refs/heads/','');
      if (headOid && !branches.has(headName)) branches.set(headName, headOid);
    }
  } catch {}
  // Limit
  if (branches.size > MAX_BRANCHES) {
    const truncated = new Map(Array.from(branches.entries()).slice(0, MAX_BRANCHES));
    if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: '.git/refs/heads', detail: `Too many branches, truncated to ${MAX_BRANCHES}` });
    return truncated;
  }
  return branches;
}

function inflateGitObject(gitDir, oid) {
  if (!/^[0-9a-f]{40}$/i.test(oid)) return null;
  const objPath = path.join(gitDir, 'objects', oid.slice(0,2), oid.slice(2));
  let buf;
  try { buf = fs.readFileSync(objPath); } catch { return null; }
  if (buf.length > MAX_GIT_OBJECT_SIZE) return null;
  if (!zlib) return null;
  let inflated;
  try { inflated = zlib.inflateSync(buf); } catch { return null; }
  if (inflated.length > MAX_GIT_OBJECT_SIZE) return null;
  const nul = inflated.indexOf(0);
  if (nul === -1) return null;
  const header = inflated.slice(0, nul).toString('utf8');
  const body = inflated.slice(nul+1);
  const m = header.match(/^(\w+) (\d+)\0?$/);
  if (!m) {
    const m2 = header.match(/^(\w+) (\d+)/);
    if (!m2) return null;
  }
  const type = header.split(' ')[0];
  return { type, body, header };
}

function parseCommitObject(obj) {
  if (!obj || obj.type !== 'commit') return null;
  const text = obj.body.toString('utf8');
  // commit header may have gpgsig continuation lines starting with space
  const lines = text.split('\n');
  let tree = null;
  for (const l of lines) {
    if (l.startsWith('tree ')) tree = l.slice(5).trim();
    if (l === '') break;
  }
  return tree && /^[0-9a-f]{40}$/i.test(tree) ? tree : null;
}

function parseTreeObject(obj) {
  if (!obj || obj.type !== 'tree') return null;
  const buf = obj.body;
  const entries = [];
  let offset = 0;
  let count = 0;
  while (offset < buf.length) {
    if (count++ > MAX_GIT_TREE_ENTRIES) break;
    const sp = buf.indexOf(0x20, offset);
    if (sp === -1) break;
    const nul = buf.indexOf(0x00, sp);
    if (nul === -1) break;
    const modeStr = buf.slice(offset, sp).toString('utf8');
    const name = buf.slice(sp+1, nul).toString('utf8');
    if (nul + 21 > buf.length) break;
    const oid = buf.slice(nul+1, nul+21).toString('hex');
    // Validate mode
    if (!/^(100644|100755|040000|120000|160000|40000)$/.test(modeStr)) { offset = nul+21; continue; }
    // Path traversal check
    if (name.includes('..') || name.includes('\0') || path.isAbsolute(name)) { offset = nul+21; continue; }
    entries.push({ mode: modeStr==='40000'?'040000':modeStr, name, oid });
    offset = nul+21;
  }
  return entries;
}

function isSurfaceRelevant(relPath) {
  // Only walk trees that may contain execution surfaces
  const top = relPath.split('/')[0] || relPath;
  if (!relPath) return true;
  const relevantTops = new Set(['.claude','.vscode','.cursor','.gemini','.codex','.husky','.github','scripts']);
  if (relevantTops.has(top) || relevantTops.has('.'+top) || relPath === 'package.json' || relPath.startsWith('package.json')) return true;
  // Check any SURFACE glob prefix
  for (const s of SURFACES) for (const g of s.glob) {
    const prefix = g.split('/')[0];
    if (relPath === g || relPath.startsWith(prefix + '/') || relPath.startsWith('.github/')) return true;
  }
  return false;
}

function walkBranchTree(gitDir, treeOid, prefix, diagnostics, outFiles, visitedTrees, depth=0) {
  if (depth > MAX_GIT_TREE_DEPTH) { if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.DEPTH_LIMIT_REACHED, path: prefix||'tree', detail: `max depth ${MAX_GIT_TREE_DEPTH}` }); return; }
  if (visitedTrees.has(treeOid)) { if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.CYCLE_DETECTED, path: prefix||treeOid, detail: 'cycle' }); return; }
  visitedTrees.add(treeOid);
  const obj = inflateGitObject(gitDir, treeOid);
  if (!obj) { if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, path: prefix||treeOid, detail: 'missing tree object' }); return; }
  if (obj.type !== 'tree') return;
  const entries = parseTreeObject(obj);
  if (!entries) return;
  for (const ent of entries) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    // Handle symlinks and submodules: do not follow outside, record diagnostic
    if (ent.mode === '120000') { if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.SYMLINK_SKIPPED, path: rel, detail: `committed symlink ${ent.name} skipped` }); continue; }
    if (ent.mode === '160000') { if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: rel, detail: `submodule ${ent.name} skipped` }); continue; }
    if (ent.mode === '040000') {
      // Directory — prune if not relevant to surfaces (bounded traversal)
      if (rel && !isSurfaceRelevant(rel) && !rel.startsWith('.github') && !rel.startsWith('.claude') && !rel.startsWith('.vscode') && !rel.startsWith('.cursor') && rel !== 'scripts' && !rel.startsWith('scripts/')) {
        // Still need to consider nested relevant under irrelevant? For minimal walker, skip whole subtree if top not relevant
        // But be conservative: only skip if prefix is clearly irrelevant like 'node_modules', 'dist', 'src'
        const skipTops = new Set(['node_modules','dist','build','.git','coverage','vendor']);
        if (skipTops.has(rel.split('/')[0])) continue;
      }
      walkBranchTree(gitDir, ent.oid, rel, diagnostics, outFiles, visitedTrees, depth+1);
    } else {
      // Blob — check if relevant surface file
      let isRelevant = false;
      for (const s of SURFACES) {
        for (const g of s.glob) {
          if (g === rel || (g === '.husky' && rel.startsWith('.husky/')) || (g === '.github/workflows' && rel.startsWith('.github/workflows/') && /\.ya?ml$/i.test(rel))) { isRelevant = true; break; }
          if (rel === g) isRelevant = true;
        }
        if (isRelevant) break;
      }
      // Also consider scripts/ files referenced via run: we want blob content for resolver? For git walker we only need surface files, not arbitrary scripts — but include scripts/ if commit contains them and relevant
      if (!isRelevant && (rel.startsWith('scripts/'))) isRelevant = true;
      if (!isRelevant) continue;
      const blob = inflateGitObject(gitDir, ent.oid);
      if (!blob || blob.type !== 'blob') continue;
      if (blob.body.length > MAX_FILE_SIZE) { if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.FILE_TOO_LARGE, path: rel, detail: `blob ${blob.body.length}` }); continue; }
      const content = blob.body.toString('utf8');
      if (content.includes('\0')) { if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.BINARY_SKIPPED, path: rel, detail: `binary blob ${rel}` }); continue; }
      outFiles.set(rel, content);
    }
  }
}

function scanBranchFromTree(gitDir, branchName, treeOid, globalDiagnostics) {
  const outFiles = new Map();
  const visitedTrees = new Set();
  const branchDiags = [];
  walkBranchTree(gitDir, treeOid, '', branchDiags, outFiles, visitedTrees, 0);
  // Reuse surface scanning via in-memory map: synthesize scanFile via content
  const results = [];
  for (const [rel, content] of outFiles.entries()) {
    // Find surface
    let surface = null;
    for (const s of SURFACES) {
      for (const g of s.glob) {
        if (g === rel || (g === '.husky' && rel.startsWith('.husky/'))) { surface = s; break; }
        if (g === '.github/workflows' && rel.startsWith('.github/workflows/')) { surface = s; break; }
      }
      if (surface) break;
    }
    if (!surface) continue;
    // Create temp file in memory? Use scanFile-like logic but via direct content — reuse evaluate path by creating a temp directory? Simpler: write to tmp and reuse scanFile
    // For zero-dep and keep scan logic, we will simulate scanFile by calling helpers directly: use readTextSafeWithGuards equivalent inline
    // Instead, we can create a minimal result via direct adapter
    let findings = [];
    let parseError = null;
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    if (surface.kind === 'json') {
      let json; try { json = JSON.parse(content); } catch (e) { parseError='invalid JSON'; branchDiags.push({ code: DIAGNOSTIC_CODES.INVALID_JSON, path: rel, detail: e.message }); }
      if (json) {
        let cmds=[];
        if (surface.id==='claude-settings') cmds=extractClaudeHookCommands(json);
        else if (surface.id==='vscode-tasks') cmds=extractVscodeTaskCommands(json);
        else if (surface.id==='package-lifecycle') cmds=extractPackageJsonScripts(json);
        else if (surface.id==='claude-mcp') {
          const servers=json.mcpServers||json.servers||{};
          for(const [n,def] of Object.entries(servers)){ const cmd=[def&&def.command,...(Array.isArray(def&&def.args)?def.args:[])].filter(Boolean).join(' '); if(cmd) cmds.push({trigger:`mcp:${n}`,command:cmd,auto:true,field:`mcpServers.${n}.command`});}
        }
        for(const c of cmds) findings.push(...evaluateCommand(surface.glob[0].split('/')[0]||'.github', c.trigger, c.command, c.auto, rel, c.field));
        const sweep=evaluateCommand(surface.glob[0].split('/')[0]||'.github','file-body',content,false,rel,null);
        if(sweep.length){ const ex=new Set(findings.flatMap(f=>f.capabilities)); const nc=sweep.flatMap(f=>f.capabilities).filter(c=>!ex.has(c)); if(nc.length) findings.push(...sweep); else if(!findings.length) findings.push(...sweep); }
      }
    } else if (surface.id==='github-workflows') {
      const cmds=extractGithubWorkflowCommands(content);
      for(const c of cmds) findings.push(...evaluateCommand('.github', c.trigger, c.command, c.auto, rel, c.field));
      const sweep=evaluateCommand('.github','file-body',content,false,rel,null);
      if(sweep.length){ const ex=new Set(findings.flatMap(f=>f.capabilities)); const nc=sweep.flatMap(f=>f.capabilities).filter(c=>!ex.has(c)); if(nc.length) findings.push(...sweep); else if(!findings.length) findings.push(...sweep); }
      if(!cmds.length && content.trim()) branchDiags.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: rel, detail: 'No run: extracted' });
    } else {
      const auto=surface.id==='git-hooks'||surface.id==='husky-hooks';
      findings.push(...evaluateCommand(surface.glob[0].split('/')[0]||rel.split('/')[0], path.basename(rel), content, auto, rel, null));
    }
    findings = findings.filter((f,i,arr)=> !(f.trigger==='file-body' && arr.some(o=> o!==f && o.severity===f.severity && o.capabilities.some(c=> f.capabilities.includes(c)))));
    const order={CRITICAL:0,WARN:1,INFO:2};
    findings.sort((a,b)=> (order[a.severity]-order[b.severity])||a.trigger.localeCompare(b.trigger)||a.command.localeCompare(b.command));
    const caps=[...new Set(findings.flatMap(f=>f.capabilities))].sort();
    results.push({ file: rel, surface: surface.id, hash, findings, parseError, diagnostics: [], capabilities: caps });
  }
  results.sort((a,b)=> a.file.localeCompare(b.file));
  // Build graph using in-memory files map for resolver (reuse resolveExecutionGraph but need fs-backed? For committed tree, resolver will try fs.lstat which fails for committed-only files not in working tree)
  // Instead, we provide a virtual resolver: we will reuse buildExecutionGraph logic but with a Map provider — simplest: create a temporary in-memory overlay by monkey-patching? For now, build graph via virtual method similar to demo engine.
  // For MVP, we will build graph using the same files Map but via a custom virtual graph builder that mirrors resolveExecutionGraph with Map lookups.
  // Fallback: use working-tree resolver but only for files that also exist on disk? That would under-report. Instead, construct a simple virtual graph.
  const virtualGraph = buildVirtualBranchGraph(outFiles, results, branchDiags);
  return { branch: branchName, results, graph: virtualGraph, diagnostics: branchDiags };
}

function buildVirtualBranchGraph(filesMap, scanResults, diagnostics) {
  // Minimal virtual graph builder similar to resolveExecutionGraph but using Map instead of fs
  const nodes=[]; const edges=[]; const paths=[]; const visited=new Set(); let nid=0; const nextId=p=>p+'_'+(nid++);
  const repoNode={ id:'repo', kind:'REPOSITORY', path:'.', label:'REPOSITORY', capabilities:[] }; nodes.push(repoNode);
  function addNode(k,p,l){ const id=nextId(k.toLowerCase()); const n={id,kind:k,path:p,label:l||p,capabilities:[]}; nodes.push(n); return n; }
  for(const result of scanResults){
    if(!result.findings.length) continue;
    const cfg=addNode('CONFIG', result.file, result.file); edges.push({from:repoNode.id,to:cfg.id,kind:'CONTAINS',evidence:{path:result.file}});
    for(const finding of result.findings){
      const trig=addNode('TRIGGER', result.file, finding.trigger); edges.push({from:cfg.id,to:trig.id,kind:'TRIGGERS',evidence:{path:result.file,field:finding.field}});
      const cmd=addNode('COMMAND', result.file, finding.command.slice(0,80)); cmd.capabilities=finding.capabilities||[]; cmd.confidence=finding.confidence; edges.push({from:trig.id,to:cmd.id,kind:'EXECUTES',evidence:{path:result.file,field:finding.field,excerpt:finding.command}});
      const refs=[...(finding.commandSpec?.references||[]), ...extractScriptReferences(finding.command)];
      const uniq=[...new Set(refs)];
      let created=0;
      for(const rawRef of uniq){
        if(!rawRef||rawRef.length<3||rawRef.startsWith('http')||rawRef.startsWith('//')) continue;
        if(!/[\/\\]/.test(rawRef) && !/\.\w+$/.test(rawRef)) continue;
        // Try virtual resolve
        let relToCheck = rawRef.replace(/^\s*(node|python3?|bash|sh|pwsh|powershell|bun)\s+/, '').trim().split(/\s+/)[0].replace(/^["']|["']$/g,'');
        if(/(\$\{|\$\(|`|\bprocess\.env\b)/.test(relToCheck)){ diagnostics.push({code:DIAGNOSTIC_CODES.DYNAMIC_EXECUTION,path:result.file,detail:`Dynamic ${relToCheck}`}); const n=addNode('FILE',relToCheck,relToCheck+' (DYNAMIC)'); edges.push({from:cmd.id,to:n.id,kind:'REFERENCES',evidence:{path:result.file,excerpt:rawRef},diagnostic:'DYNAMIC_EXECUTION'}); n.capabilities=[CAPABILITY.DYNAMIC_EXECUTION]; continue; }
        if(relToCheck.startsWith('\\\\')||relToCheck.startsWith('//')){ diagnostics.push({code:DIAGNOSTIC_CODES.BOUNDARY_VIOLATION,path:result.file,detail:relToCheck}); continue; }
        // Normalize
        const tryNorm = relToCheck.replace(/\\/g,'/');
        // Boundary check: reject absolute outside
        if(tryNorm.startsWith('/') && tryNorm!=='/'){ diagnostics.push({code:DIAGNOSTIC_CODES.BOUNDARY_VIOLATION,path:result.file,detail:tryNorm}); continue; }
        if(tryNorm.startsWith('../')||tryNorm==='..'){ diagnostics.push({code:DIAGNOSTIC_CODES.BOUNDARY_VIOLATION,path:result.file,detail:tryNorm}); continue; }
        const norm = tryNorm.startsWith('./')? tryNorm.slice(2): tryNorm;
        // Check existence in filesMap (committed) or with extensions
        let foundRel=null, content=null;
        if(filesMap.has(norm)) { foundRel=norm; content=filesMap.get(norm); }
        else {
          for(const ext of SCRIPT_EXTENSIONS){
            const withExt=norm+ext;
            if(filesMap.has(withExt)){ foundRel=withExt; content=filesMap.get(withExt); break; }
          }
        }
        if(!foundRel){
          diagnostics.push({code:DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE,path:result.file,detail:`Missing ${norm} in branch`});
          const n=addNode('FILE', norm, norm+' (MISSING)'); edges.push({from:cmd.id,to:n.id,kind:'REFERENCES',evidence:{path:result.file,excerpt:rawRef},diagnostic:'UNRESOLVED_REFERENCE'}); continue;
        }
        const visitKey=`${result.file}->${foundRel}`;
        if(visited.has(visitKey)){ diagnostics.push({code:DIAGNOSTIC_CODES.CYCLE_DETECTED,path:result.file,detail:`Cycle ${visitKey}`}); continue; }
        visited.add(visitKey);
        if(content.length>MAX_FILE_SIZE){ diagnostics.push({code:DIAGNOSTIC_CODES.FILE_TOO_LARGE,path:foundRel,detail:String(content.length)}); continue; }
        if(content.includes('\0')){ diagnostics.push({code:DIAGNOSTIC_CODES.BINARY_SKIPPED,path:foundRel,detail:'binary'}); continue; }
        const scriptNode=addNode('SCRIPT', foundRel, foundRel); edges.push({from:cmd.id,to:scriptNode.id,kind:'REFERENCES',evidence:{path:result.file,excerpt:rawRef}});
        const capsInfo=inferCapabilities(content); let caps=[...capsInfo.capabilities];
        if(/\bcurl\b|\bwget\b|https?:\/\//i.test(content)&&!caps.includes(CAPABILITY.NETWORK_ACCESS)) caps.push(CAPABILITY.NETWORK_ACCESS);
        if(/download.*runtime|bun.*install/i.test(content)) caps.push(CAPABILITY.RUNTIME_BOOTSTRAP, CAPABILITY.REMOTE_DOWNLOAD);
        caps=[...new Set(caps)].sort(); scriptNode.capabilities=caps;
        // One-hop path for branch walker (keep simple, no deep BFS for now — still proves multi-hop via caps aggregation)
        const pathCaps=[...new Set([...(finding.capabilities||[]), ...caps])].sort();
        const isAuto = AUTO_TRIGGER_KEYS.includes(finding.trigger) || finding.trigger.includes('push') || finding.trigger.includes('pull_request') || ['preinstall','install','postinstall'].includes(finding.trigger);
        const risk=computePathRisk(pathCaps, isAuto);
        paths.push({ id:`${result.file}:${finding.trigger}->${foundRel}`, trigger:finding.trigger, sourcePath:result.file, chain:[result.file, finding.command, foundRel], nodes:[cfg.id,trig.id,cmd.id,scriptNode.id], capabilities:pathCaps, risk, confidence: caps.length?'MEDIUM':finding.confidence, evidence:[{path:result.file,field:finding.field,excerpt:finding.command},{path:foundRel,excerpt:foundRel}] });
        created++;
        finding.reachableCapabilities=pathCaps; finding.pathRisk=risk;
        const merged=new Set([...(cmd.capabilities||[]), ...pathCaps]); cmd.capabilities=[...merged].sort();
      }
      if(created===0){
        const isAuto = AUTO_TRIGGER_KEYS.includes(finding.trigger) || finding.trigger.includes('push') || ['preinstall'].includes(finding.trigger);
        const risk=computePathRisk(finding.capabilities||[], isAuto);
        paths.push({ id:`${result.file}:${finding.trigger}`, trigger:finding.trigger, sourcePath:result.file, chain:[result.file, finding.command], nodes:[cfg.id,trig.id,cmd.id], capabilities:finding.capabilities||[], risk, confidence:finding.confidence, evidence:[{path:result.file,field:finding.field,excerpt:finding.command}]});
        finding.reachableCapabilities=finding.capabilities; finding.pathRisk=risk;
      }
    }
  }
  // capability nodes
  const allCaps=[...new Set(paths.flatMap(p=>p.capabilities))].sort();
  for(const cap of allCaps){ const capNode=addNode('CAPABILITY', cap, cap); capNode.capability=cap; for(const n of nodes){ if(n.capabilities&&n.capabilities.includes(cap)&&(n.kind==='SCRIPT'||n.kind==='COMMAND')) edges.push({from:n.id,to:capNode.id,kind:'CONNECTS_TO',evidence:{capability:cap}}); } }
  nodes.sort((a,b)=> a.id.localeCompare(b.id)); edges.sort((a,b)=> (a.from+a.to+a.kind).localeCompare(b.from+b.to+b.kind)); paths.sort((a,b)=> a.id.localeCompare(b.id));
  return { nodes, edges, paths, diagnostics };
}

function handleBranches(root, values) {
  const gitDir = path.join(root, '.git');
  if (!exists(gitDir)) { console.error('No .git directory found at ' + root + ' — branches requires a git repository.'); return { exitCode: 2 }; }
  if (!zlib) { console.error('Git branches requires node:zlib (not available) — treat as UNSUPPORTED_FORMAT.'); return { exitCode: 2 }; }
  const diagnostics=[];
  const branches = discoverBranches(gitDir, diagnostics);
  if (!branches.size) { console.error('No branches found in ' + gitDir); return { exitCode: 2 }; }
  const branchNames = Array.from(branches.keys()).sort();
  const branchScans = new Map();
  for (const name of branchNames) {
    const oid = branches.get(name);
    const commitTree = (()=>{ const obj=inflateGitObject(gitDir, oid); if(!obj) return null; if(obj.type==='commit') return parseCommitObject(obj); if(obj.type==='tree') return oid; return null; })();
    if (!commitTree) { diagnostics.push({ code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, path: name, detail: `cannot resolve tree for ${oid}` }); continue; }
    const scan = scanBranchFromTree(gitDir, name, commitTree, diagnostics);
    branchScans.set(name, scan);
  }
  if (!branchScans.size) { console.error('No branch scans produced.'); return { exitCode: 2 }; }
  // Compare: default to HEAD vs first other branch, or all pairs
  const headName = (()=>{ try{ const h=fs.readFileSync(path.join(gitDir,'HEAD'),'utf8').trim(); if(h.startsWith('ref:')) return h.slice(4).trim().replace('refs/heads/',''); }catch{} return branchNames[0]; })();
  const compareA = branchScans.has(headName) ? headName : branchNames[0];
  const compareB = branchNames.find(n=> n!==compareA) || compareA;
  const aScan = branchScans.get(compareA);
  const bScan = branchScans.get(compareB);
  // Build branch diff via file hash comparison plus semantic NEW_CAPABILITY
  const aFiles = new Map(aScan.results.map(r=>[r.file, r.hash]));
  const bFiles = new Map(bScan.results.map(r=>[r.file, r.hash]));
  const aCaps = new Set(aScan.results.flatMap(r=> r.capabilities||[]));
  const bCaps = new Set(bScan.results.flatMap(r=> r.capabilities||[]));
  const changes=[];
  for(const [f,h] of bFiles.entries()){ if(!aFiles.has(f)) changes.push({ file:f, type:'NEW', branch:compareB }); else if(aFiles.get(f)!==h) changes.push({ file:f, type:'CHANGED', branch:compareB }); }
  for(const f of aFiles.keys()){ if(!bFiles.has(f)) changes.push({ file:f, type:'REMOVED', branch:compareA }); }
  const semantic=[];
  for(const cap of bCaps) if(!aCaps.has(cap)) semantic.push({ file: '*', type:'NEW_CAPABILITY', detail:cap, branch:compareB });
  for(const cap of aCaps) if(!bCaps.has(cap)) semantic.push({ file: '*', type:'REMOVED_CAPABILITY', detail:cap, branch:compareA });
  // File-level triggers diff
  const aTriggers=new Map(aScan.results.map(r=>[r.file, r.findings.map(f=>f.trigger).sort().join(',')]));
  const bTriggers=new Map(bScan.results.map(r=>[r.file, r.findings.map(f=>f.trigger).sort().join(',')]));
  for(const [f,bt] of bTriggers.entries()){ const at=aTriggers.get(f); if(at===undefined) semantic.push({ file:f, type:'NEW_TRIGGER', detail:bt }); else if(at!==bt) semantic.push({ file:f, type:'CHANGED_TRIGGER', detail:`${at} → ${bt}` }); }
  changes.sort((a,b)=> a.file.localeCompare(b.file)); semantic.sort((a,b)=> a.file.localeCompare(b.file)||a.type.localeCompare(b.type));
  if (values.json || (values.format && String(values.format).toLowerCase()==='json')) {
    const payload={ version:1, branches: branchNames, compared: { a:compareA, b:compareB }, diagnostics, changes, semantic, branchScans: Object.fromEntries(Array.from(branchScans.entries()).map(([k,v])=> [k, { results: v.results, graph: v.graph, summary: { surfaces: v.results.length, paths: v.graph.paths.length, highRiskPaths: v.graph.paths.filter(p=>p.risk==='HIGH'||p.risk==='CRITICAL').length } }])) };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(styleText('bold', `Branches — ${branchNames.length} branch(es): ${branchNames.join(', ')}`));
    console.log(styleText('gray', `Compared: ${compareA} vs ${compareB}`));
    if(!changes.length && !semantic.length) console.log(styleText('green','No branch drift — execution surfaces identical.'));
    else {
      console.log(styleText('bold','File changes:'));
      for(const c of changes) console.log(`  ${c.type} ${c.file} (${c.branch})`);
      console.log(styleText('bold','Semantic:'));
      for(const s of semantic) console.log(`  ${styleText('cyan', s.type)} ${s.file} — ${s.detail}`);
    }
    console.log(styleText('gray','Note: .git/hooks is local machine state, not committed content — not compared.'));
    if(diagnostics.length) { console.log(styleText('bold','Diagnostics:')); for(const d of diagnostics.slice(0,10)) console.log(`  ${d.code} ${d.path||''} ${d.detail||''}`); }
  }
  const hasBlock = Array.from(branchScans.values()).some(s=> s.graph.paths.some(p=> p.risk==='HIGH'||p.risk==='CRITICAL'));
  const hasDrift = changes.length>0 || semantic.length>0;
  // Exit 1 if drift or high-risk found, else 0 (like diff)
  return { exitCode: (hasBlock||hasDrift)?1:0 };
}

function printJson(results, diff, graph, diagnostics, root, policy, policyEval) {
  const allFindings = results.flatMap(r=> r.findings);
  const highRiskPaths = graph ? graph.paths.filter(p=> p.risk==='HIGH'||p.risk==='CRITICAL').length : 0;
  const baseDecision = highRiskPaths > 0 || allFindings.some(f=> f.severity==='CRITICAL') ? 'BLOCK' : (allFindings.some(f=> f.severity==='WARN') || (diff && diff.changes.length) ? 'REVIEW' : 'PASS');
  const summary = {
    executionSurfaces: results.length,
    withFindings: results.filter(r=> r.findings.length).length,
    totalFindings: allFindings.length,
    critical: allFindings.filter(f=> f.severity==='CRITICAL').length,
    warn: allFindings.filter(f=> f.severity==='WARN').length,
    paths: graph ? graph.paths.length : 0,
    highRiskPaths,
    diagnostics: (diagnostics||[]).length,
    decision: policyEval ? policyEval.decision : baseDecision,
    baseDecision,
  };
  const surfaces = results.map(r=> ({
    id: `${r.surface}:${r.file}`,
    sourcePath: r.file,
    surfaceType: r.surface,
    triggerType: r.findings[0]?.trigger || null,
    command: r.findings[0]?.command || null,
    capabilities: r.capabilities||[],
    findings: r.findings.map(f=> ({ trigger:f.trigger, command:f.command, commandSpec:f.commandSpec, severity:f.severity, score:f.score, reasons:f.reasons, capabilities:f.capabilities, reachableCapabilities:f.reachableCapabilities, pathRisk:f.pathRisk, confidence:f.confidence, evidence:f.evidence, field:f.field })),
    evidence: r.findings.flatMap(f=> f.evidence||[]),
    hash: r.hash,
    parseError: r.parseError,
    diagnostics: r.diagnostics||[],
  }));
  const payload = {
    version: 1,
    repository: { path: toPosix(path.relative(process.cwd(), root)) || '.' , absolute: toPosix(root) },
    summary,
    results, // backward compat
    surfaces,
    paths: graph ? graph.paths : [],
    graph: graph ? { nodes: graph.nodes, edges: graph.edges } : undefined,
    capabilities: [...new Set(allFindings.flatMap(f=> f.capabilities||[]))].sort(),
    diagnostics: diagnostics||[],
    diff,
    policy: policy ? { source: policy.source, blockOn: policy.blockOn, warnOn: policy.warnOn, evaluated: policyEval } : undefined,
  };
  console.log(JSON.stringify(payload, null, 2));
}

// ---------------------------------------------------------------
// 10. CLI
// ---------------------------------------------------------------

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      path: { type: 'string', default: '.' },
      help: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      sarif: { type: 'boolean', default: false },
      html: { type: 'string' },
      format: { type: 'string' },
    },
  });
  // Normalize format aliases: --sarif is alias for --format sarif; --html file is alias; support export subcommand
  if (values.sarif) values.format = 'sarif';
  if (positionals[0] === 'export' && positionals[1] === '--format') { /* handled via values.format */ }

  let command = positionals[0];
  let pathArg = values.path;
  // Support export alias and branches subcommands
  if (command === 'export') {
    // hookaudit export --format sarif .  → treat as scan with format
    if (positionals[1] === '--format' || positionals[1] === '--sarif' || positionals[1] === '--html') {
      command = 'scan';
    } else if (positionals[1] && !String(positionals[1]).startsWith('-')) {
      // export <path>
      pathArg = positionals[1];
      command = 'scan';
    } else {
      command = 'scan';
    }
  }
  const known = new Set(['scan', 'baseline', 'diff', 'branches', 'git-branches', 'compare-branches']);
  if (known.has(command)) {
    // find first positional after command that is not an option
    for (let i = 1; i < positionals.length; i++) {
      if (!String(positionals[i]).startsWith('-') && positionals[i] !== 'scan' && positionals[i] !== 'export') { pathArg = positionals[i]; break; }
    }
  } else if (command && !String(command).startsWith('-')) {
    pathArg = command;
    command = 'scan';
  } else if (!command) {
    pathArg = values.path;
  }
  // Early branches handling before normal scan (needs git reading)
  if (command === 'branches' || command === 'git-branches' || command === 'compare-branches') {
    const branchRoot = path.resolve(pathArg);
    if (!exists(branchRoot)) { console.error(`Path not found: ${branchRoot}`); process.exitCode = 2; return; }
    const branchResult = handleBranches(branchRoot, values);
    process.exitCode = branchResult.exitCode;
    return;
  }
  const root = path.resolve(pathArg);

  if (values.help || !command) {
    console.log(`hookaudit — repository execution-topology auditor

Usage:
  hookaudit [path] [--json] [--strict]                Scan (default: current directory)
  hookaudit scan [path] [--json] [--strict] [--sarif] [--html report.html] [--format sarif|json]  Scan for risky hook surfaces
  hookaudit baseline [path]                           Record current state as trusted
  hookaudit diff [path] [--json] [--sarif] [--html report.html]  Scan + compare against baseline
  hookaudit branches [path] [--json]                  Compare execution surfaces across git branches (local, no git exec)
  hookaudit export --format sarif [path]              Machine-readable export (alias)
  hookaudit . --json --strict                         JSON + strict policy (CI gate)
  hookaudit . --sarif                                 SARIF 2.1.0 export
  hookaudit . --html report.html                      Self-contained HTML report (offline)
  hookaudit --help

Examples:
  hookaudit .                         # scan current directory (human)
  hookaudit . --json                  # machine-readable (v1 + backward compat)
  hookaudit . --sarif                 # SARIF for GitHub/CodeQL
  hookaudit . --html report.html      # standalone HTML (file://)
  hookaudit baseline .                # trust current state
  hookaudit diff .                    # detect drift (file + semantic)

Execution topology: DISCOVER → NORMALIZE → RESOLVE → GRAPH → INFER → EXPLAIN → BASELINE → DIFF
Outputs: human | json | sarif | html (adapters over same report model)
`);
    process.exitCode = command ? 0 : 1;
    return;
  }

  if (!exists(root)) {
    console.error(`Path not found: ${root}`);
    process.exitCode = 2;
    return;
  }

  const globalDiagnostics = [];
  const results = scan(root, globalDiagnostics);
  const graph = resolveExecutionGraph(root, results, globalDiagnostics);
  // Merge per-file diagnostics into global for JSON summary
  for (const r of results) if (r.diagnostics) for (const d of r.diagnostics) globalDiagnostics.push(d);

  const anyCritical = results.some((r) => r.findings.some((f) => f.severity === 'CRITICAL'));
  const anyWarn = results.some((r) => r.findings.some((f) => f.severity === 'WARN'));
  const hasHighPath = graph.paths.some(p=> p.risk==='HIGH'||p.risk==='CRITICAL');
  const strictViolation = values.strict && (anyWarn || anyCritical || hasHighPath);

  // Optional local policy layer (zero-dep, JSON/YAML/TOML) — evaluated but not hidden
  const policy = loadPolicy(root, globalDiagnostics);
  // compute summary-like for policy evaluation before final decision
  const tmpSummary = {
    critical: results.flatMap(r=> r.findings).filter(f=> f.severity==='CRITICAL').length,
    warn: results.flatMap(r=> r.findings).filter(f=> f.severity==='WARN').length,
    decision: hasHighPath || anyCritical ? 'BLOCK' : (anyWarn ? 'REVIEW' : 'PASS'),
  };
  const policyEval = policy ? evaluatePolicy(policy, tmpSummary, results, graph) : null;
  const policyWouldBlock = !!(policyEval && policyEval.decision === 'BLOCK');

  // Deterministic global diagnostics sort
  globalDiagnostics.sort((a,b)=> (a.code+a.path).localeCompare(b.code+b.path));

  // Determine output format: --sarif / --format sarif → sarif, --html <file> or --format html → html, --json → json, else human
  const wantSarif = !!(values.sarif || (values.format && String(values.format).toLowerCase() === 'sarif'));
  const wantHtmlFile = values.html || (values.format && String(values.format).toLowerCase() === 'html' ? (values.html || 'hookaudit-report.html') : null);
  const wantJson = !!(values.json || (values.format && String(values.format).toLowerCase() === 'json'));

  if (command === 'scan') {
    if (wantHtmlFile) {
      const outPath = path.isAbsolute(String(wantHtmlFile)) ? String(wantHtmlFile) : path.resolve(String(wantHtmlFile));
      writeHtmlReport(outPath, results, null, graph, globalDiagnostics, root, policy, policyEval);
      console.log(`HTML report written: ${toPosix(path.relative(process.cwd(), outPath)) || outPath} (${graph.nodes.length} nodes, ${graph.paths.length} paths)`);
      // Also optionally output JSON to stdout if --json also requested? Prefer HTML as primary
      if (wantJson) printJson(results, null, graph, globalDiagnostics, root, policy, policyEval);
    } else if (wantSarif) {
      printSarif(results, graph, globalDiagnostics, root, policy, policyEval);
    } else if (wantJson) {
      printJson(results, null, graph, globalDiagnostics, root, policy, policyEval);
    } else {
      printHuman(results, null, graph, globalDiagnostics, policy, policyEval);
    }
    process.exitCode = (anyCritical || hasHighPath || strictViolation || policyWouldBlock) ? 1 : 0;
  } else if (command === 'baseline') {
    const record = writeBaseline(root, results, graph);
    const relBaseline = toPosix(baselinePath(root));
    const relRoot = toPosix(root);
    const display = relBaseline.startsWith(relRoot) ? relBaseline.slice(relRoot.length + 1) : baselinePath(root);
    console.log(`Baseline written: ${display} (${Object.keys(record.files).length} file(s), id ${record.id}, schema v${record.schemaVersion})`);
    if (policy) console.log(`Policy active: ${policy.source} blockOn=${policy.blockOn.join(',')}`);
    process.exitCode = 0;
  } else if (command === 'diff') {
    const diff = diffAgainstBaseline(root, results, graph);
    if (!diff) {
      console.error('No baseline found. Run `hookaudit baseline` first.');
      process.exitCode = 2;
      return;
    }
    if (wantHtmlFile) {
      const outPath = path.isAbsolute(String(wantHtmlFile)) ? String(wantHtmlFile) : path.resolve(String(wantHtmlFile));
      writeHtmlReport(outPath, results, diff, graph, globalDiagnostics, root, policy, policyEval);
      console.log(`HTML report written: ${toPosix(path.relative(process.cwd(), outPath)) || outPath} (${diff.changes.length} file drift, ${diff.semantic.length} semantic)`);
      if (wantJson) printJson(results, diff, graph, globalDiagnostics, root, policy, policyEval);
    } else if (wantSarif) {
      printSarif(results, graph, globalDiagnostics, root, policy, policyEval);
    } else if (wantJson) {
      printJson(results, diff, graph, globalDiagnostics, root, policy, policyEval);
    } else {
      printHuman(results, diff, graph, globalDiagnostics, policy, policyEval);
    }
    process.exitCode = (anyCritical || hasHighPath || strictViolation || diff.changes.length || policyWouldBlock) ? 1 : 0;
  } else {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

// Export for demo tests (zero-dep, stdlib only)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CAPABILITY, DIAGNOSTIC_CODES, SURFACES, RULES, MAX_FILE_SIZE, MAX_GRAPH_DEPTH,
    parseCommandSpec, inferCapabilities, computeConfidence, computePathRisk,
    extractScriptReferences, resolveInsideRepository, scan, resolveExecutionGraph,
    loadPolicy, evaluatePolicy, POLICY_DEFAULT,
  };
}
