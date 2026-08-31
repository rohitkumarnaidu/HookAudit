#!/usr/bin/env node
/**
 * hookaudit — a zero-dependency local scanner for auto-executing
 * AI-agent / editor / package-lifecycle hooks.
 *
 * Built for the Zero Dependency 72-Hour Hackathon 2026, Track E
 * (Security & Crypto Utilities — "local security scanner" /
 * "file integrity tooling").
 *
 * Runtime dependencies: NONE. Node.js built-ins only.
 *   node:fs, node:path, node:crypto, node:util
 *
 * Threat model (see README.md and STDLIB.md for full detail):
 *   Since August 2026, campaigns such as ChainDrop have shown that
 *   opening a cloned repository in an AI coding agent (Claude Code)
 *   or an editor (VS Code) can itself be an execution event, via
 *   configuration files the tool trusts and runs automatically
 *   (.claude/settings.json SessionStart hooks, .vscode/tasks.json
 *   runOn:"folderOpen" tasks, package.json lifecycle scripts, git
 *   hooks). Most dependency/vulnerability scanners only look at
 *   manifests and lockfiles, so they do not see this class of
 *   attack. hookaudit looks specifically at that surface.
 *
 * This tool does NOT implement any cryptographic primitive itself.
 * It only composes node:crypto's SHA-256 implementation to
 * fingerprint files for drift detection. See STDLIB.md.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs, styleText } = require('node:util');

// ---------------------------------------------------------------
// 1. Known auto-executing surfaces
//
// Each entry describes a file (or directory of files) that a
// developer's AI agent, editor, or package manager will read and
// potentially EXECUTE without a separate, explicit "run this"
// action from the developer. This list is the core research
// artifact of the project — see README.md "Why these files" for
// the evidence behind each entry.
// ---------------------------------------------------------------

const SURFACES = [
  {
    id: 'claude-settings',
    glob: ['.claude/settings.json', '.claude/settings.local.json'],
    kind: 'json',
    describe: 'Claude Code project hook configuration',
  },
  {
    id: 'claude-mcp',
    glob: ['.mcp.json', '.claude/mcp.json'],
    kind: 'json',
    describe: 'MCP server launch configuration read by Claude Code',
  },
  {
    id: 'vscode-tasks',
    glob: ['.vscode/tasks.json'],
    kind: 'json',
    describe: 'VS Code task configuration (can auto-run on folder open)',
  },
  {
    id: 'vscode-settings',
    glob: ['.vscode/settings.json'],
    kind: 'json',
    describe: 'VS Code workspace settings (can enable task auto-run)',
  },
  {
    id: 'cursor-rules',
    glob: ['.cursorrules', '.cursor/rules'],
    kind: 'text-dir-or-file',
    describe: 'Cursor agent rule files (prompt-injection / auto-run surface)',
  },
  {
    id: 'gemini-settings',
    glob: ['.gemini/settings.json'],
    kind: 'json',
    describe: 'Gemini CLI project hook configuration',
  },
  {
    id: 'codex-config',
    glob: ['.codex/config.toml'],
    kind: 'text',
    describe: 'Codex CLI configuration (parsed heuristically, not full TOML)',
  },
  {
    id: 'package-lifecycle',
    glob: ['package.json'],
    kind: 'json',
    describe: 'npm lifecycle scripts (preinstall/postinstall/prepare/install)',
  },
  {
    id: 'husky-hooks',
    glob: ['.husky'],
    kind: 'text-dir',
    describe: 'Husky-managed git hook scripts',
  },
  {
    id: 'git-hooks',
    glob: ['.git/hooks'],
    kind: 'text-dir',
    describe: 'Local git hook scripts (excluding *.sample templates)',
  },
  {
    id: 'precommit-config',
    glob: ['.pre-commit-config.yaml', '.pre-commit-config.yml'],
    kind: 'text',
    describe: 'pre-commit framework configuration (heuristic text scan)',
  },
];

const AUTO_TRIGGER_KEYS = [
  'SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit',
];

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.hookaudit']);
// .git is walked separately (only .git/hooks) — never bulk-walked.

// ---------------------------------------------------------------
// 2. Heuristic rules
//
// Each rule inspects a raw text blob (the file content, or a
// single hook command string) and returns a finding or null.
// Rules are intentionally simple and inspectable — this is a
// tripwire, not a classifier. Every rule is documented with the
// real-world pattern it is modelled on.
// ---------------------------------------------------------------

const RULES = [
  {
    id: 'network-fetch',
    weight: 2,
    test: (t) => /\b(curl|wget|Invoke-WebRequest|iwr)\b/i.test(t) ||
                 /\bfetch\s*\(\s*['"]https?:/i.test(t),
    why: 'Command downloads content from the network at hook time.',
  },
  {
    id: 'runtime-bootstrap',
    weight: 3,
    test: (t) => /\b(bun|node|python3?)\b.*\b(install|download|--install)\b/i.test(t) ||
                 /download.{0,20}\b(bun|runtime)\b/i.test(t),
    why: 'Command appears to silently download/bootstrap a runtime — the exact pattern used by the August 2026 ChainDrop/keyv worm to run its payload via Bun.',
  },
  {
    id: 'obfuscation',
    weight: 2,
    test: (t) => /[A-Za-z0-9+/]{200,}={0,2}/.test(t) ||
                 /\beval\s*\(/.test(t) ||
                 /\bnew Function\s*\(/.test(t) ||
                 /\batob\s*\(/.test(t),
    why: 'Long base64-like blob or eval/Function/atob call — common obfuscation for a dropped payload.',
  },
  {
    id: 'shell-out',
    weight: 1,
    test: (t) => /\b(rm -rf|chmod \+x|nohup|&\s*$)/im.test(t),
    why: 'Shell idioms associated with persistence or cleanup after a payload runs.',
  },
];

// ---------------------------------------------------------------
// 3. Filesystem helpers
// ---------------------------------------------------------------

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function listFilesRecursive(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      listFilesRecursive(path.join(dir, e.name), out);
    } else if (e.isFile()) {
      out.push(path.join(dir, e.name));
    }
  }
  out.sort();
  return out;
}

function readTextSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------
// 4. Extract "hook command strings" from a parsed surface
//
// For JSON surfaces we want the actual command text a tool would
// execute, not the whole file, so cross-reference and obfuscation
// rules stay precise. For text/dir surfaces we scan the raw text.
// ---------------------------------------------------------------

function extractClaudeHookCommands(json) {
  const cmds = [];
  const hooks = json && json.hooks;
  if (!hooks || typeof hooks !== 'object') return cmds;
  for (const [triggerName, entries] of Object.entries(hooks)) {
    const list = Array.isArray(entries) ? entries : [entries];
    for (const entry of list) {
      const hookList = (entry && entry.hooks) || (Array.isArray(entry) ? entry : [entry]);
      const flat = Array.isArray(hookList) ? hookList : [hookList];
      for (const h of flat) {
        const command = h && (h.command || h.cmd);
        if (command) cmds.push({ trigger: triggerName, command });
      }
    }
  }
  return cmds;
}

function extractVscodeTaskCommands(json) {
  const cmds = [];
  const tasks = json && Array.isArray(json.tasks) ? json.tasks : [];
  for (const t of tasks) {
    const runOn = t.runOptions && t.runOptions.runOn;
    const auto = runOn === 'folderOpen';
    const command = [t.command, ...(Array.isArray(t.args) ? t.args : [])].filter(Boolean).join(' ');
    if (command) cmds.push({ trigger: auto ? 'folderOpen' : (t.label || 'task'), command, auto });
  }
  return cmds;
}

function extractPackageJsonScripts(json) {
  const AUTO = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']);
  const cmds = [];
  const scripts = json && json.scripts;
  if (!scripts) return cmds;
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === 'string') {
      cmds.push({ trigger: name, command, auto: AUTO.has(name) });
    }
  }
  return cmds;
}

// ---------------------------------------------------------------
// 5. Cross-reference check
//
// ChainDrop's own persistence trick: the .claude hook pointed at a
// script inside .vscode/, and the .vscode task pointed at a script
// inside .claude/ — so a lone reviewer checking either directory in
// isolation sees a command that "belongs to the other tool" and
// moves on. We flag any hook command that references a path under
// a *different* known surface directory than the one it lives in.
// ---------------------------------------------------------------

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
// 6. Scan
// ---------------------------------------------------------------

function resolveSurfaceFiles(root, surface) {
  const found = [];
  for (const rel of surface.glob) {
    const abs = path.join(root, rel);
    if (!exists(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      for (const f of listFilesRecursive(abs)) {
        if (surface.id === 'git-hooks' && f.endsWith('.sample')) continue;
        found.push(f);
      }
    } else {
      found.push(abs);
    }
  }
  return found;
}

function evaluateCommand(ownDir, trigger, command, autoHint) {
  const findings = [];
  const isAutoTrigger = autoHint || AUTO_TRIGGER_KEYS.includes(trigger);
  let score = isAutoTrigger ? 2 : 0;
  const reasons = [];
  if (isAutoTrigger) reasons.push(`fires automatically on "${trigger}" with no separate approval step`);

  for (const rule of RULES) {
    if (rule.test(command)) {
      score += rule.weight;
      reasons.push(rule.why);
    }
  }

  const crossRef = findCrossReference(ownDir, command);
  if (crossRef) {
    score += 3;
    reasons.push(`command references a path under ${crossRef}/, a different tool's directory — the exact cross-linking evasion documented in the ChainDrop campaign`);
  }

  let severity = 'INFO';
  if (score >= 5) severity = 'CRITICAL';
  else if (score >= 2) severity = 'WARN';

  if (score > 0) {
    findings.push({ trigger, command, severity, score, reasons });
  }
  return findings;
}

function scanFile(root, surface, file) {
  const rawRel = path.relative(root, file);
  const rel = rawRel.split(path.sep).join('/');
  const ownDir = surface.glob.find((g) => rel.startsWith(g.split('/')[0]))?.split('/')[0]
    || ('.' + rel.split('/')[0]);
  const content = readTextSafe(file);
  if (content === null) return { file: rel, surface: surface.id, hash: null, findings: [], parseError: 'unreadable' };

  const hash = sha256(content);
  let findings = [];
  let parseError = null;

  if (surface.kind === 'json') {
    let json;
    try { json = JSON.parse(content); }
    catch (e) { parseError = 'invalid JSON'; }
    if (json) {
      let cmds = [];
      if (surface.id === 'claude-settings') cmds = extractClaudeHookCommands(json);
      else if (surface.id === 'vscode-tasks') cmds = extractVscodeTaskCommands(json);
      else if (surface.id === 'package-lifecycle') cmds = extractPackageJsonScripts(json);
      else if (surface.id === 'claude-mcp') {
        const servers = json.mcpServers || json.servers || {};
        for (const [name, def] of Object.entries(servers)) {
          const command = [def && def.command, ...(Array.isArray(def && def.args) ? def.args : [])].filter(Boolean).join(' ');
          if (command) cmds.push({ trigger: `mcp:${name}`, command, auto: true });
        }
      }
      for (const c of cmds) {
        findings.push(...evaluateCommand(ownDir, c.trigger, c.command, c.auto));
      }
      // Also sweep the whole file text for obfuscation/network patterns
      // outside of a recognised "command" field (defence in depth).
      findings.push(...evaluateCommand(ownDir, 'file-body', content, false));
    }
  } else {
    // text / text-dir surfaces: git hooks, husky scripts, cursor rules,
    // pre-commit config, codex toml — scanned as raw shell/text.
    const auto = surface.id === 'git-hooks' || surface.id === 'husky-hooks';
    findings.push(...evaluateCommand(ownDir, path.basename(file), content, auto));
  }

  // De-duplicate the generic 'file-body' finding if a more specific
  // finding already covers the same severity, to avoid noisy double
  // counting in the report.
  findings = findings.filter((f, i, arr) =>
    !(f.trigger === 'file-body' && arr.some((o) => o !== f)));
  // Deterministic ordering: CRITICAL first, then WARN, then trigger name
  const order = { CRITICAL: 0, WARN: 1, INFO: 2 };
  findings.sort((a, b) => (order[a.severity] - order[b.severity]) || a.trigger.localeCompare(b.trigger));

  return { file: rel, surface: surface.id, hash, findings, parseError };
}

function scan(root) {
  const results = [];
  for (const surface of SURFACES) {
    const files = resolveSurfaceFiles(root, surface);
    files.sort();
    for (const file of files) {
      results.push(scanFile(root, surface, file));
    }
  }
  results.sort((a, b) => a.file.localeCompare(b.file));
  return results;
}

// ---------------------------------------------------------------
// 7. Baseline / diff (trust-on-first-use integrity model)
// ---------------------------------------------------------------

const BASELINE_DIR = '.hookaudit';
const BASELINE_FILE = 'baseline.json';

function baselinePath(root) {
  return path.join(root, BASELINE_DIR, BASELINE_FILE);
}

function writeBaseline(root, results) {
  fs.mkdirSync(path.join(root, BASELINE_DIR), { recursive: true });
  const record = {
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    files: Object.fromEntries(results.map((r) => [r.file, r.hash])),
  };
  fs.writeFileSync(baselinePath(root), JSON.stringify(record, null, 2) + '\n');
  return record;
}

function readBaseline(root) {
  const p = baselinePath(root);
  if (!exists(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function diffAgainstBaseline(root, results) {
  const baseline = readBaseline(root);
  if (!baseline) return null;
  const current = Object.fromEntries(results.map((r) => [r.file, r.hash]));
  const changes = [];
  for (const [file, hash] of Object.entries(current)) {
    if (!(file in baseline.files)) changes.push({ file, type: 'NEW' });
    else if (baseline.files[file] !== hash) changes.push({ file, type: 'CHANGED' });
  }
  for (const file of Object.keys(baseline.files)) {
    if (!(file in current)) changes.push({ file, type: 'REMOVED' });
  }
  changes.sort((a, b) => a.file.localeCompare(b.file) || a.type.localeCompare(b.type));
  return { baseline, changes };
}

// ---------------------------------------------------------------
// 8. Report rendering
// ---------------------------------------------------------------

function colorFor(sev) {
  if (sev === 'CRITICAL') return 'red';
  if (sev === 'WARN') return 'yellow';
  return 'gray';
}

function printHuman(results, diff) {
  const withFindings = results.filter((r) => r.findings.length || r.parseError);
  if (!withFindings.length && (!diff || !diff.changes.length)) {
    console.log(styleText('green', '✔ No auto-executing agent/editor/lifecycle hooks found.'));
    console.log(`  Scanned ${results.length} known surface file(s).`);
    return;
  }

  console.log(styleText('bold', `hookaudit — ${results.length} surface file(s) scanned`));
  console.log('');

  for (const r of results) {
    if (!r.findings.length && !r.parseError) continue;
    console.log(styleText('bold', r.file) + styleText('gray', `  [${r.surface}]`));
    if (r.parseError) console.log('  ' + styleText('yellow', `⚠ ${r.parseError}`));
    for (const f of r.findings) {
      console.log(
        '  ' + styleText(colorFor(f.severity), `${f.severity}`) +
        ` trigger="${f.trigger}"`
      );
      console.log('    ' + styleText('gray', f.command ? f.command.slice(0, 120) : ''));
      for (const reason of f.reasons) console.log('    - ' + reason);
    }
    console.log('');
  }

  if (diff && diff.changes.length) {
    console.log(styleText('bold', 'Drift since baseline:'));
    for (const c of diff.changes) {
      const label = c.type === 'REMOVED' ? styleText('gray', c.type)
        : styleText('yellow', c.type);
      console.log(`  ${label}  ${c.file}`);
    }
    console.log('');
  }

  const critical = results.flatMap((r) => r.findings).filter((f) => f.severity === 'CRITICAL').length;
  const warn = results.flatMap((r) => r.findings).filter((f) => f.severity === 'WARN').length;
  console.log(`Summary: ${styleText('red', String(critical) + ' CRITICAL')}, ${styleText('yellow', String(warn) + ' WARN')}`);
}

function printJson(results, diff) {
  console.log(JSON.stringify({ results, diff }, null, 2));
}

// ---------------------------------------------------------------
// 9. CLI entry point
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

  // Support both `hookaudit scan --path <dir>` and `hookaudit . --json --strict`
  // per MVP contract: hookaudit . / hookaudit baseline . / hookaudit diff .
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
    console.log(`hookaudit — zero-dependency scanner for auto-executing AI-agent/editor hooks

Usage:
  hookaudit [path] [--json] [--strict]                Scan (default: current directory)
  hookaudit scan [path] [--json] [--strict]           Scan for risky hook surfaces
  hookaudit baseline [path]                           Record current state as trusted
  hookaudit diff [path] [--json]                      Scan + compare against baseline
  hookaudit . --json --strict                         JSON + strict policy (CI gate)
  hookaudit --help

Examples:
  hookaudit .                         # scan current directory (human)
  hookaudit . --json                  # machine-readable
  hookaudit baseline .                # trust current state
  hookaudit diff .                    # detect drift
`);
    process.exitCode = command ? 0 : 1;
    return;
  }

  if (!exists(root)) {
    console.error(`Path not found: ${root}`);
    process.exitCode = 2;
    return;
  }

  const results = scan(root);
  const anyCritical = results.some((r) => r.findings.some((f) => f.severity === 'CRITICAL'));
  const anyWarn = results.some((r) => r.findings.some((f) => f.severity === 'WARN'));
  const strictViolation = values.strict && (anyWarn || anyCritical);

  if (command === 'scan') {
    values.json ? printJson(results, null) : printHuman(results, null);
    process.exitCode = (anyCritical || strictViolation) ? 1 : 0;
  } else if (command === 'baseline') {
    const record = writeBaseline(root, results);
    const relBaseline = baselinePath(root).split(path.sep).join('/');
    const relRoot = root.split(path.sep).join('/');
    const display = relBaseline.startsWith(relRoot) ? relBaseline.slice(relRoot.length + 1) : baselinePath(root);
    console.log(`Baseline written: ${display} (${Object.keys(record.files).length} file(s), id ${record.id})`);
    process.exitCode = 0;
  } else if (command === 'diff') {
    const diff = diffAgainstBaseline(root, results);
    if (!diff) {
      console.error('No baseline found. Run `hookaudit baseline` first.');
      process.exitCode = 2;
      return;
    }
    values.json ? printJson(results, diff) : printHuman(results, diff);
    process.exitCode = (anyCritical || strictViolation || diff.changes.length) ? 1 : 0;
  } else {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
  }
}

main();
