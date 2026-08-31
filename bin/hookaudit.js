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
  // Tokenize
  const args = [];
  let current = '';
  let inQuote = null;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuote) {
      if (ch === inQuote) { if (args.length === 0 && current) { /* keep */ } inQuote = null; }
      else current += ch;
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
        found.push(f);
      }
    } else {
      found.push(abs);
    }
  }
  return found;
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
  // JS/TS imports
  const importRe = /(?:import\s+.*?from\s+["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']\s*\)|import\s*\(\s*["']([^"']+)["']\s*\))/g;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const p = m[1] || m[2] || m[3];
    if (p && (p.startsWith('.') || p.startsWith('/') || p.includes('/'))) refs.add(p);
  }
  // Shell source / . / bash / sh / node / python invocations
  const shellRefRe = /\b(?:node|python3?|bash|sh|pwsh|powershell|bun)\s+["']?([^\s"'`|&;]+)/g;
  while ((m = shellRefRe.exec(content)) !== null) {
    if (m[1]) refs.add(m[1]);
  }
  // Source/dot commands
  const sourceRe = /\b(?:source|\.)\s+["']?([^\s"'`|&;]+)/g;
  while ((m = sourceRe.exec(content)) !== null) {
    if (m[1]) refs.add(m[1]);
  }
  // Generic file path patterns
  const pathRe = /(?:\.\.?\/[\w.\-\/]+|\.claude\/[\w.\-\/]+|\.vscode\/[\w.\-\/]+|scripts\/[\w.\-\/]+)/g;
  while ((m = pathRe.exec(content)) !== null) refs.add(m[0]);
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

        const rel = resolved.relative;
        const abs = resolved.path;
        // Check visited & cycle
        const visitKey = `${result.file}→${rel}`;
        if (visited.has(visitKey)) {
          diagnostics.push({ code: DIAGNOSTIC_CODES.CYCLE_DETECTED, path: result.file, detail: `Cycle detected ${visitKey}` });
          const cycleNode = addNode('FILE', rel, rel + ' (CYCLE)');
          edges.push({ from: cmdNode.id, to: cycleNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: DIAGNOSTIC_CODES.CYCLE_DETECTED });
          continue;
        }
        visited.add(visitKey);

        // Check exists and safety
        let lstat;
        try { lstat = fs.lstatSync(abs); } catch {
          diagnostics.push({ code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, path: result.file, detail: `Missing file ${rel}` });
          const missNode = addNode('FILE', rel, rel + ' (MISSING)');
          edges.push({ from: cmdNode.id, to: missNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: 'UNRESOLVED_REFERENCE' });
          continue;
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

function printHuman(results, diff, graph, diagnostics) {
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
}

function printJson(results, diff, graph, diagnostics, root) {
  const allFindings = results.flatMap(r=> r.findings);
  const highRiskPaths = graph ? graph.paths.filter(p=> p.risk==='HIGH'||p.risk==='CRITICAL').length : 0;
  const summary = {
    executionSurfaces: results.length,
    withFindings: results.filter(r=> r.findings.length).length,
    totalFindings: allFindings.length,
    critical: allFindings.filter(f=> f.severity==='CRITICAL').length,
    warn: allFindings.filter(f=> f.severity==='WARN').length,
    paths: graph ? graph.paths.length : 0,
    highRiskPaths,
    diagnostics: (diagnostics||[]).length,
    decision: highRiskPaths > 0 || allFindings.some(f=> f.severity==='CRITICAL') ? 'BLOCK' : (allFindings.some(f=> f.severity==='WARN') || (diff && diff.changes.length) ? 'REVIEW' : 'PASS'),
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
    },
  });

  let command = positionals[0];
  let pathArg = values.path;
  const known = new Set(['scan', 'baseline', 'diff']);
  if (known.has(command)) {
    if (positionals[1] && !String(positionals[1]).startsWith('-')) pathArg = positionals[1];
  } else if (command && !String(command).startsWith('-')) {
    pathArg = command;
    command = 'scan';
  } else if (!command) {
    pathArg = values.path;
  }
  const root = path.resolve(pathArg);

  if (values.help || !command) {
    console.log(`hookaudit — repository execution-topology auditor

Usage:
  hookaudit [path] [--json] [--strict]                Scan (default: current directory)
  hookaudit scan [path] [--json] [--strict]           Scan for risky hook surfaces
  hookaudit baseline [path]                           Record current state as trusted
  hookaudit diff [path] [--json]                      Scan + compare against baseline
  hookaudit . --json --strict                         JSON + strict policy (CI gate)
  hookaudit --help

Examples:
  hookaudit .                         # scan current directory (human)
  hookaudit . --json                  # machine-readable (v1 + backward compat)
  hookaudit baseline .                # trust current state
  hookaudit diff .                    # detect drift (file + semantic)

Execution topology: DISCOVER → NORMALIZE → RESOLVE → GRAPH → INFER → EXPLAIN → BASELINE → DIFF
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

  // Deterministic global diagnostics sort
  globalDiagnostics.sort((a,b)=> (a.code+a.path).localeCompare(b.code+b.path));

  if (command === 'scan') {
    values.json ? printJson(results, null, graph, globalDiagnostics, root) : printHuman(results, null, graph, globalDiagnostics);
    process.exitCode = (anyCritical || hasHighPath || strictViolation) ? 1 : 0;
  } else if (command === 'baseline') {
    const record = writeBaseline(root, results, graph);
    const relBaseline = toPosix(baselinePath(root));
    const relRoot = toPosix(root);
    const display = relBaseline.startsWith(relRoot) ? relBaseline.slice(relRoot.length + 1) : baselinePath(root);
    console.log(`Baseline written: ${display} (${Object.keys(record.files).length} file(s), id ${record.id}, schema v${record.schemaVersion})`);
    process.exitCode = 0;
  } else if (command === 'diff') {
    const diff = diffAgainstBaseline(root, results, graph);
    if (!diff) {
      console.error('No baseline found. Run `hookaudit baseline` first.');
      process.exitCode = 2;
      return;
    }
    values.json ? printJson(results, diff, graph, globalDiagnostics, root) : printHuman(results, diff, graph, globalDiagnostics);
    process.exitCode = (anyCritical || hasHighPath || strictViolation || diff.changes.length) ? 1 : 0;
  } else {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
  }
}

main();
