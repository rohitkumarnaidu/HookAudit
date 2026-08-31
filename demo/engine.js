/* HookAudit — Browser engine (Honest Browser Adapter)
 * Zero-dependency, pure JS, deterministic.
 * Mirrors bin/hookaudit.js concepts for in-memory fixtures:
 *  RULES/CAPABILITY/parseCommandSpec/inferCapabilities/computePathRisk/computeConfidence/extractScriptReferences/resolveInsideRepository-like, build nodes/edges/paths, baseline/diff.
 * Never executes fixture code, never fetches remote, never uploads.
 * Separation: this file = analysis only. Rendering/view lives in demo.js.
 */
(function () {
  'use strict';

  const MAX_GRAPH_DEPTH = 32;
  const MAX_FILE_SIZE = 1 * 1024 * 1024;
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
    BASELINE_INVALID: 'BASELINE_INVALID'
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
    CROSS_TOOL_LINK: 'CROSS_TOOL_LINK'
  };

  const SURFACES = [
    { id: 'claude-settings', globs: ['.claude/settings.json', '.claude/settings.local.json'], kind: 'json', describe: 'Claude Code project hook configuration' },
    { id: 'claude-mcp', globs: ['.mcp.json', '.claude/mcp.json'], kind: 'json', describe: 'MCP server launch configuration' },
    { id: 'vscode-tasks', globs: ['.vscode/tasks.json'], kind: 'json', describe: 'VS Code task configuration' },
    { id: 'vscode-settings', globs: ['.vscode/settings.json'], kind: 'json', describe: 'VS Code workspace settings' },
    { id: 'cursor-rules', globs: ['.cursorrules', '.cursor/rules'], kind: 'text-dir-or-file', describe: 'Cursor agent rule files' },
    { id: 'gemini-settings', globs: ['.gemini/settings.json'], kind: 'json', describe: 'Gemini CLI project hook configuration' },
    { id: 'codex-config', globs: ['.codex/config.toml'], kind: 'text', describe: 'Codex CLI configuration (heuristic)' },
    { id: 'package-lifecycle', globs: ['package.json'], kind: 'json', describe: 'npm lifecycle scripts' },
    { id: 'husky-hooks', globs: ['.husky'], kind: 'text-dir', describe: 'Husky-managed git hook scripts' },
    { id: 'git-hooks', globs: ['.git/hooks'], kind: 'text-dir', describe: 'Local git hook scripts' },
    { id: 'precommit-config', globs: ['.pre-commit-config.yaml', '.pre-commit-config.yml'], kind: 'text', describe: 'pre-commit framework configuration' },
    { id: 'github-workflows', globs: ['.github/workflows'], kind: 'yaml-dir', describe: 'GitHub Actions workflows (on push/PR, run: commands) — heuristic raw-text YAML' }
  ];

  const AUTO_TRIGGER_KEYS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit'];
  const SURFACE_DIRS = ['.claude', '.vscode', '.cursor', '.gemini', '.codex', '.husky', '.github'];
  const GITHUB_KNOWN_TRIGGERS = ['push', 'pull_request', 'workflow_dispatch', 'schedule', 'workflow_call', 'repository_dispatch'];
  const GITHUB_AUTO_TRIGGERS = new Set(['push', 'pull_request', 'schedule']);
  function parseGithubTriggers(text) {
    const m = text.match(/^\s*on\s*:\s*(.*)$/m);
    const triggers=[]; if(!m) return triggers;
    const win=text.slice(m.index, m.index+1200).split('\n').filter(l=>!/^\s*#/.test(l)).join('\n').toLowerCase();
    for(const t of GITHUB_KNOWN_TRIGGERS){ const re=new RegExp('(^|[^a-z0-9_])'+t+'([^a-z0-9_]|$)','i'); if(re.test(win)) triggers.push(t); }
    return [...new Set(triggers)];
  }
  function extractGithubWorkflowCommands(content){
    const triggers=parseGithubTriggers(content); const isAuto=triggers.some(t=>GITHUB_AUTO_TRIGGERS.has(t)); const wf=triggers.length?triggers.join(','):'workflow';
    const lines=content.split('\n'); const res=[]; let curJob=null, step=-1, inJobs=false;
    for(let i=0;i<lines.length;i++){ const line=lines[i]; if(/^\s*jobs\s*:\s*$/.test(line)){inJobs=true;continue;} if(inJobs){ const jm=line.match(/^\s{2}([A-Za-z0-9_\-]+)\s*:\s*$/); if(jm && !['steps','runs-on','needs','strategy','env','if','permissions'].includes(jm[1])){curJob=jm[1];step=-1;continue;} if(/^\s*-\s*(name|uses|run)\s*:/.test(line)){ if(/^\s*-\s*name\s*:/.test(line)||/^\s*-\s*uses\s*:/.test(line)) step++; else if(/^\s*-\s*run\s*:/.test(line)) step++; } }
      const runMatch=line.match(/^\s*(?:-\s*)?run\s*:\s*(\|?-?)\s*(.*)$/); if(!runMatch) continue;
      const pipe=runMatch[1]; const inline=(runMatch[2]||'').trim(); let cmd='';
      if(pipe&&pipe.startsWith('|')){ const block=[]; let j=i+1; while(j<lines.length){ const nl=lines[j]; if(nl.trim()===''){block.push('');j++;continue;} if(/^\s{6,}\S/.test(nl)||/^\s*\t/.test(nl)){block.push(nl.trim());j++;} else break; } cmd=(inline?inline+'\n':'')+block.join('\n'); cmd=cmd.trim(); } else cmd=inline;
      if(!cmd) continue; const field=curJob?`jobs.${curJob}.steps[${Math.max(0,step)}].run`:`steps[${res.length}].run`; const trigger=curJob?`${wf}:${curJob}`:wf; res.push({trigger,command:cmd,field,auto:isAuto});
    }
    if(!res.length){ const re=/run\s*:\s*\|?\s*([^\n]+)/g; let m; let idx=0; while((m=re.exec(content))!==null){ const cmd=(m[1]||'').trim(); if(!cmd||cmd==='|') continue; res.push({trigger:wf,command:cmd,field:`run[${idx}].run`,auto:isAuto}); idx++; } }
    return res;
  }

  const RULES = [
    {
      id: 'network-fetch',
      weight: 2,
      capabilities: [CAPABILITY.NETWORK_ACCESS],
      test: function (t) { return /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod)\b/i.test(t) || /\bfetch\s*\(\s*['"]https?:/i.test(t) || /\bhttps?:\/\/\S+/i.test(t); },
      why: 'Command downloads content from the network at hook time.'
    },
    {
      id: 'runtime-bootstrap',
      weight: 3,
      capabilities: [CAPABILITY.RUNTIME_BOOTSTRAP, CAPABILITY.REMOTE_DOWNLOAD],
      test: function (t) { return /\b(bun|node|python3?)\b.*\b(install|download|--install)\b/i.test(t) || /download.{0,20}\b(bun|runtime)\b/i.test(t); },
      why: 'Command appears to silently download/bootstrap a runtime — the exact pattern used by the August 2026 ChainDrop/keyv worm to run its payload via Bun.'
    },
    {
      id: 'obfuscation',
      weight: 2,
      capabilities: [CAPABILITY.OBFUSCATION, CAPABILITY.DYNAMIC_EXECUTION],
      test: function (t) { return /[A-Za-z0-9+/]{200,}={0,2}/.test(t) || /\beval\s*\(/.test(t) || /\bnew Function\s*\(/.test(t) || /\batob\s*\(/.test(t); },
      why: 'Long base64-like blob or eval/Function/atob call — common obfuscation for a dropped payload.'
    },
    {
      id: 'shell-out',
      weight: 1,
      capabilities: [CAPABILITY.FILE_WRITE],
      test: function (t) { return /\b(rm -rf|chmod \+x|nohup|&\s*$)/im.test(t); },
      why: 'Shell idioms associated with persistence or cleanup after a payload runs.'
    },
    {
      id: 'process-exec',
      weight: 2,
      capabilities: [CAPABILITY.PROCESS_EXECUTION],
      test: function (t) {
        return /\b(node|python3?|bash|sh|pwsh|powershell|spawn|exec)\b.*\.m?js|\b(node|python3?|bash|sh|pwsh)\b\s+[^\n]*\.\w+/i.test(t) || /\b(spawn|exec|execFile|fork)\s*\(/.test(t);
      },
      why: 'Command spawns a process or interpreter.'
    },
    {
      id: 'env-access',
      weight: 1,
      capabilities: [CAPABILITY.ENVIRONMENT_ACCESS],
      test: function (t) { return /process\.env|\$ENV|\$\{[^}]*env/i.test(t); },
      why: 'Command accesses environment variables.'
    },
    {
      id: 'credential-signal',
      weight: 2,
      capabilities: [CAPABILITY.CREDENTIAL_ACCESS_SIGNAL],
      test: function (t) { return /\b(credentials?|secrets?|token|api[_-]?key|\.env)\b/i.test(t); },
      why: 'Command references credentials or secrets.'
    },
    {
      id: 'file-read',
      weight: 1,
      capabilities: [CAPABILITY.FILE_READ],
      test: function (t) { return /\b(fs\.readFile|cat\s+|ReadFile|Get-Content)\b/i.test(t); },
      why: 'Command reads files.'
    },
    {
      id: 'remote-download',
      weight: 3,
      capabilities: [CAPABILITY.REMOTE_DOWNLOAD, CAPABILITY.NETWORK_ACCESS],
      test: function (t) { return /curl[^|]*\|\s*(bash|sh)|wget[^|]*\|\s*(bash|sh)|Invoke-WebRequest[^|]*\|\s*Invoke-Expression/i.test(t); },
      why: 'Command downloads remote content and pipes to shell — remote download pattern.'
    }
  ];

  // --------------- helpers ---------------
  function toPosix(p) {
    return p.split('\\').join('/');
  }

  function normalizePosixPath(p) {
    const isAbsolute = p.startsWith('/');
    const parts = p.split('/');
    const out = [];
    for (const part of parts) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (out.length) out.pop();
        else if (!isAbsolute) return null; // would escape root
        else return null;
      } else {
        out.push(part);
      }
    }
    const norm = (isAbsolute ? '/' : '') + out.join('/');
    return norm || '.';
  }

  function joinPosix(a, b) {
    if (!a || a === '.') return b;
    if (!b) return a;
    return a.replace(/\/+$/, '') + '/' + b.replace(/^\/+/, '');
  }

  function dirnamePosix(p) {
    const idx = p.lastIndexOf('/');
    if (idx === -1) return '.';
    if (idx === 0) return '/';
    return p.slice(0, idx);
  }

  function isBinaryContent(content) {
    if (content.indexOf('\0') !== -1) return true;
    const slice = content.slice(0, BINARY_CHECK_BYTES);
    let nonPrintable = 0;
    for (let i = 0; i < slice.length; i++) {
      const c = slice.charCodeAt(i);
      if (c === 9 || c === 10 || c === 13) continue;
      if (c < 32 || c > 126) nonPrintable++;
    }
    return slice.length > 0 && nonPrintable / slice.length > 0.3;
  }

  function simpleHash(str) {
    // djb2 fallback, deterministic, hex 8 chars
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash | 0;
    }
    // convert to unsigned hex
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function bufferToHex(buf) {
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  }

  async function sha256HexAsync(str) {
    const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
    if (!subtle) return { hash: simpleHash(str), method: 'fallback-simple (no Web Crypto)' };
    try {
      const enc = new TextEncoder();
      const data = enc.encode(str);
      const digest = await subtle.digest('SHA-256', data);
      return { hash: bufferToHex(digest), method: 'WebCrypto-SHA256' };
    } catch (e) {
      return { hash: simpleHash(str), method: 'fallback-simple (error: ' + e.message + ')' };
    }
  }

  function sha256SyncFallback(str) {
    return simpleHash(str);
  }

  async function hashFilesAsync(filesMap) {
    // filesMap: {path: content}
    const entries = Object.keys(filesMap).sort();
    const result = {};
    const methods = {};
    for (const key of entries) {
      const content = filesMap[key];
      const r = await sha256HexAsync(content);
      result[key] = r.hash;
      methods[key] = r.method;
    }
    // determine overall method label: if any fallback, mark mixed
    const allWeb = Object.values(methods).every(function (m) { return m.indexOf('WebCrypto') === 0; });
    const overall = allWeb ? 'WebCrypto-SHA256' : 'fallback-simple (mixed or unavailable)';
    return { files: result, method: overall, perFileMethod: methods };
  }

  function hashFilesSync(filesMap) {
    const res = {};
    const keys = Object.keys(filesMap).sort();
    for (const k of keys) res[k] = sha256SyncFallback(filesMap[k]);
    return { files: res, method: 'fallback-simple (sync)' };
  }

  // --------------- parse + infer ---------------
  function parseCommandSpec(raw) {
    if (!raw || typeof raw !== 'string') return { raw: raw || '', executable: null, args: [], shell: false, references: [], isDynamic: false };
    const trimmed = raw.trim();
    const isDynamic = /\$\{|\$\(|`.*\$\{|process\.env|\+.*["']\/|path\.join|process\.argv/.test(trimmed);
    const args = [];
    let current = '';
    let inQuote = null;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
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
      if (references.indexOf(r) === -1) references.push(r);
    }
    for (let ai = 0; ai < args.length; ai++) {
      const a = args[ai];
      if (/\.m?js$|\.sh$|\.py$|\.ps1$|\.mjs$/.test(a) && references.indexOf(a) === -1) references.push(a);
      if (a.indexOf('./') === 0 || a.indexOf('../') === 0) if (references.indexOf(a) === -1) references.push(a);
    }
    return { raw: trimmed, executable: executable, args: args, shell: shell, references: references, isDynamic: isDynamic };
  }

  function createEvidence(obj) {
    const ev = { path: obj.path };
    if (obj.field) ev.field = obj.field;
    if (obj.detector) ev.detector = obj.detector;
    if (obj.reason) ev.reason = obj.reason;
    if (obj.excerpt) ev.excerpt = obj.excerpt.slice(0, 200);
    return ev;
  }

  function inferCapabilities(text) {
    const caps = new Set();
    const detectors = [];
    for (let i = 0; i < RULES.length; i++) {
      const rule = RULES[i];
      if (rule.test(text)) {
        detectors.push(rule.id);
        for (let ci = 0; ci < rule.capabilities.length; ci++) caps.add(rule.capabilities[ci]);
      }
    }
    return { capabilities: Array.from(caps).sort(), detectors: detectors };
  }

  function computeConfidence(commandSpec, isResolvedNested) {
    if (commandSpec.isDynamic) return 'LOW';
    if (isResolvedNested) return 'MEDIUM';
    return 'HIGH';
  }

  function extractScriptReferences(content) {
    const refs = new Set();
    const importRe = /(?:import\s+.*?from\s+["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']\s*\)|import\s*\(\s*["']([^"']+)["']\s*\))/g;
    let m;
    while ((m = importRe.exec(content)) !== null) {
      const p = m[1] || m[2] || m[3];
      if (p && (p.indexOf('.') === 0 || p.indexOf('/') !== -1 || p.indexOf('/') === 0 || p.indexOf('./') === 0)) refs.add(p);
      else if (p && p.indexOf('/') !== -1) refs.add(p);
    }
    const shellRefRe = /\b(?:node|python3?|bash|sh|pwsh|powershell|bun)\s+["']?([^\s"'`|&;]+)/g;
    while ((m = shellRefRe.exec(content)) !== null) if (m[1]) refs.add(m[1]);
    const sourceRe = /\b(?:source|\.)\s+["']?([^\s"'`|&;]+)/g;
    while ((m = sourceRe.exec(content)) !== null) if (m[1]) refs.add(m[1]);
    const pathRe = /(?:\.\.?\/[\w.\-\/]+|\.claude\/[\w.\-\/]+|\.vscode\/[\w.\-\/]+|scripts\/[\w.\-\/]+)/g;
    while ((m = pathRe.exec(content)) !== null) refs.add(m[0]);
    return Array.from(refs);
  }

  function extractClaudeHookCommands(json) {
    const cmds = [];
    const hooks = json && json.hooks;
    if (!hooks || typeof hooks !== 'object') return cmds;
    const keys = Object.keys(hooks);
    for (let ki = 0; ki < keys.length; ki++) {
      const triggerName = keys[ki];
      const entries = hooks[triggerName];
      const list = Array.isArray(entries) ? entries : [entries];
      for (let ei = 0; ei < list.length; ei++) {
        const entry = list[ei];
        const hookList = (entry && entry.hooks) || (Array.isArray(entry) ? entry : [entry]);
        const flat = Array.isArray(hookList) ? hookList : [hookList];
        for (let hi = 0; hi < flat.length; hi++) {
          const h = flat[hi];
          const command = h && (h.command || h.cmd);
          if (command) cmds.push({ trigger: triggerName, command: command, field: 'hooks.' + triggerName + '[' + ei + '].hooks[' + hi + '].command' });
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
      const command = [t.command].concat(Array.isArray(t.args) ? t.args : []).filter(Boolean).join(' ');
      if (command) cmds.push({ trigger: auto ? 'folderOpen' : (t.label || 'task'), command: command, auto: auto, field: 'tasks[' + i + '].command' });
    }
    return cmds;
  }

  function extractPackageJsonScripts(json) {
    const AUTO = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly']);
    const cmds = [];
    const scripts = json && json.scripts;
    if (!scripts) return cmds;
    const keys = Object.keys(scripts);
    for (let ki = 0; ki < keys.length; ki++) {
      const name = keys[ki];
      const command = scripts[name];
      if (typeof command === 'string') cmds.push({ trigger: name, command: command, auto: AUTO.has(name), field: 'scripts.' + name });
    }
    return cmds;
  }

  function findCrossReference(ownDir, command) {
    for (let i = 0; i < SURFACE_DIRS.length; i++) {
      const dir = SURFACE_DIRS[i];
      if (dir === ownDir) continue;
      const re = new RegExp(dir.replace('.', '\\.') + '\\/[\\w.\\-\\/]+');
      if (re.test(command)) return dir;
    }
    return null;
  }

  function computePathRisk(capabilities, isAuto) {
    const has = function (c) { return capabilities.indexOf(c) !== -1; };
    const hasNetwork = has(CAPABILITY.NETWORK_ACCESS);
    const hasRemote = has(CAPABILITY.REMOTE_DOWNLOAD);
    const hasProcess = has(CAPABILITY.PROCESS_EXECUTION);
    const hasBootstrap = has(CAPABILITY.RUNTIME_BOOTSTRAP);
    const hasObf = has(CAPABILITY.OBFUSCATION);
    const hasCross = has(CAPABILITY.CROSS_TOOL_LINK);
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

  function isAutoTrigger(trigger) {
    return AUTO_TRIGGER_KEYS.indexOf(trigger) !== -1 || trigger === 'folderOpen' || ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly'].indexOf(trigger) !== -1 || trigger.indexOf('mcp:') === 0;
  }

  function evaluateCommand(ownDir, trigger, command, autoHint, sourcePath, field) {
    const commandSpec = parseCommandSpec(command);
    const isAuto = !!(autoHint || isAutoTrigger(trigger));
    let score = isAuto ? 2 : 0;
    const reasons = [];
    const evidenceList = [];
    const capsSet = new Set();
    if (isAuto) reasons.push('fires automatically on "' + trigger + '" with no separate approval step');
    for (let i = 0; i < RULES.length; i++) {
      const rule = RULES[i];
      if (rule.test(command)) {
        score += rule.weight;
        reasons.push(rule.why);
        for (let ci = 0; ci < rule.capabilities.length; ci++) capsSet.add(rule.capabilities[ci]);
        evidenceList.push(createEvidence({ path: sourcePath, field: field, detector: rule.id, reason: rule.why, excerpt: command }));
      }
    }
    const crossRef = findCrossReference(ownDir, command);
    if (crossRef) {
      score += 3;
      const why = 'command references a path under ' + crossRef + '/, a different tool\'s directory — the exact cross-linking evasion documented in the ChainDrop campaign';
      reasons.push(why);
      capsSet.add(CAPABILITY.CROSS_TOOL_LINK);
      evidenceList.push(createEvidence({ path: sourcePath, field: field, detector: 'cross-reference', reason: why, excerpt: command }));
    }
    if (commandSpec.isDynamic) {
      capsSet.add(CAPABILITY.DYNAMIC_EXECUTION);
      evidenceList.push(createEvidence({ path: sourcePath, field: field, detector: 'dynamic', reason: 'Dynamic command construction detected', excerpt: command }));
    }
    let severity = 'INFO';
    if (score >= 5) severity = 'CRITICAL';
    else if (score >= 2) severity = 'WARN';
    const confidence = computeConfidence(commandSpec, false);
    const capabilities = Array.from(capsSet).sort();
    const uniqueReasons = Array.from(new Set(reasons));
    if (score > 0 || capabilities.length > 0) {
      return [{ trigger: trigger, command: command, commandSpec: commandSpec, severity: severity, score: score, reasons: uniqueReasons, capabilities: capabilities, confidence: confidence, evidence: evidenceList, field: field, sourcePath: sourcePath }];
    }
    return [];
  }

  // --------------- virtual file helpers ---------------
  function matchSurfaceForPath(relPosix) {
    // returns surface object if path matches SURFACES globs, else null
    for (let si = 0; si < SURFACES.length; si++) {
      const surface = SURFACES[si];
      for (let gi = 0; gi < surface.globs.length; gi++) {
        const g = surface.globs[gi];
        // directory surfaces: .husky , .git/hooks  -> match prefix
        if (g.indexOf('.husky') === 0 || g.indexOf('.git/hooks') === 0) {
          if (relPosix === g || relPosix.indexOf(g + '/') === 0) return surface;
          // also handle file inside dir
          if (relPosix.startsWith('.husky/') && surface.id === 'husky-hooks') return surface;
          if (relPosix.startsWith('.git/hooks/') && surface.id === 'git-hooks') return surface;
        } else if (g.indexOf('/') !== -1) {
          if (relPosix === g) return surface;
        } else {
          if (relPosix === g) return surface;
        }
      }
    }
    return null;
  }

  function resolveInsideRepositoryVirtual(filesMap, candidate, baseDir) {
    // candidate may be like "node scripts/a.js" or "scripts/b.js" or "./helper.sh"
    // Return {ok, relative, content, code, reason}
    if (!candidate || typeof candidate !== 'string') return { ok: false, code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, reason: 'empty candidate' };
    let raw = candidate.trim().replace(/^["']|["']$/g, '');
    raw = raw.replace(/^\s*(node|python3?|bash|sh|pwsh|powershell|bun)\s+/, '').trim();
    // Extract first file-like token
    const fileToken = raw.split(/\s+/).find(function (t) { return /[\/\\]/.test(t) || /\.\w+$/.test(t); }) || raw.split(/\s+/)[0] || raw;
    raw = fileToken.replace(/^["']|["']$/g, '');
    if (!raw) return { ok: false, code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, reason: 'no path token' };
    if (/(\$\{|\$\(|`|\bprocess\.env\b|\+.*["']\/|path\.join)/.test(raw)) {
      return { ok: false, code: DIAGNOSTIC_CODES.DYNAMIC_EXECUTION, reason: 'dynamic reference', raw: raw };
    }
    if (raw.startsWith('\\\\') || raw.startsWith('//')) {
      return { ok: false, code: DIAGNOSTIC_CODES.BOUNDARY_VIOLATION, reason: 'UNC path', raw: raw };
    }
    // Reject absolute path escape (starting with /)
    if (raw.startsWith('/') && raw.length > 1) {
      return { ok: false, code: DIAGNOSTIC_CODES.BOUNDARY_VIOLATION, reason: 'absolute path outside repository', raw: raw };
    }
    // Try resolve relative to baseDir then root
    const attempts = [];
    if (baseDir && baseDir !== '.' && baseDir !== '') attempts.push(joinPosix(baseDir, raw));
    attempts.push(raw);
    // also try normalizing raw directly if it starts with ./
    // We will normalize each attempt and check boundary and existence
    for (let ai = 0; ai < attempts.length; ai++) {
      const attempt = attempts[ai];
      // Prevent ../ escape beyond root: normalizePosixPath returns null if escapes
      const norm = normalizePosixPath(attempt);
      if (norm === null) {
        // Check if this attempt would escape -> boundary violation for this candidate
        // But continue to next attempt? Actually if baseDir+raw escapes but raw itself is inside, we should try raw.
        // So only return violation if all attempts escape and candidate itself escapes root.
        continue;
      }
      // Check if norm is inside root: normalize already ensures not escaping, but also need to handle absolute UNC etc.
      // For virtual, any norm that is not null is inside root.
      // Now check existence
      if (filesMap.hasOwnProperty(norm)) {
        // Check size/binary?
        const content = filesMap[norm];
        if (content === null || content === undefined) return { ok: false, code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, reason: 'null content' };
        if (content.length > MAX_FILE_SIZE) return { ok: false, code: DIAGNOSTIC_CODES.FILE_TOO_LARGE, reason: 'File size ' + content.length + ' exceeds limit', relative: norm };
        if (isBinaryContent(content)) return { ok: false, code: DIAGNOSTIC_CODES.BINARY_SKIPPED, reason: 'Binary', relative: norm };
        return { ok: true, relative: norm, path: norm, content: content, raw: raw };
      }
      // If not found, keep trying next attempt; but if last attempt and none found -> UNRESOLVED Reference
      // Do not immediately return violation; we will handle after loop
    }
    // No attempt matched existing file. Check if normalized version of raw would be inside root but missing
    const normRaw = normalizePosixPath(raw);
    if (normRaw === null) {
      return { ok: false, code: DIAGNOSTIC_CODES.BOUNDARY_VIOLATION, reason: '../ escape outside repository', raw: raw };
    }
    // If attempts included baseDir and raw, but neither exists, report UNRESOLVED
    // However check if attempt normalized exists as prefix? no
    // Also check dynamic already handled
    // Also need to handle absolute path that normalizes to inside but file missing -> UNRESOLVED
    // Check if candidate references an ignored dir like node_modules -> treat as UNRESOLVED? But not needed
    // Special case: if raw is like "https://..." we should have filtered earlier via http check in caller
    return { ok: false, code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, reason: 'file not found in fixture: ' + normRaw, raw: raw, relative: normRaw };
  }

  function scanVirtualFile(filesMap, surface, relPath, content, globalDiagnostics) {
    const ownDir = (surface.globs[0] || '').split('/')[0] || relPath.split('/')[0];
    // Guards
    if (content.length > MAX_FILE_SIZE) {
      if (globalDiagnostics) globalDiagnostics.push({ code: DIAGNOSTIC_CODES.FILE_TOO_LARGE, path: relPath, detail: 'File size ' + content.length + ' exceeds ' + MAX_FILE_SIZE });
      return { file: relPath, surface: surface.id, hash: null, findings: [], parseError: null, diagnostics: [{ code: DIAGNOSTIC_CODES.FILE_TOO_LARGE, path: relPath }], capabilities: [] };
    }
    if (isBinaryContent(content)) {
      if (globalDiagnostics) globalDiagnostics.push({ code: DIAGNOSTIC_CODES.BINARY_SKIPPED, path: relPath, detail: 'Binary content' });
      return { file: relPath, surface: surface.id, hash: null, findings: [], parseError: null, diagnostics: [{ code: DIAGNOSTIC_CODES.BINARY_SKIPPED, path: relPath }], capabilities: [] };
    }
    const hash = sha256SyncFallback(content);
    let findings = [];
    let parseError = null;
    const diagnostics = [];
    if (surface.kind === 'json') {
      let json = null;
      try { json = JSON.parse(content); } catch (e) { parseError = 'invalid JSON'; diagnostics.push({ code: DIAGNOSTIC_CODES.INVALID_JSON, path: relPath, detail: e.message }); }
      if (json) {
        let cmds = [];
        if (surface.id === 'claude-settings') cmds = extractClaudeHookCommands(json);
        else if (surface.id === 'vscode-tasks') cmds = extractVscodeTaskCommands(json);
        else if (surface.id === 'package-lifecycle') cmds = extractPackageJsonScripts(json);
        else if (surface.id === 'claude-mcp') {
          const servers = json.mcpServers || json.servers || {};
          const keys = Object.keys(servers);
          for (let ki = 0; ki < keys.length; ki++) {
            const name = keys[ki];
            const def = servers[name];
            const cmd = [def && def.command].concat(Array.isArray(def && def.args) ? def.args : []).filter(Boolean).join(' ');
            if (cmd) cmds.push({ trigger: 'mcp:' + name, command: cmd, auto: true, field: 'mcpServers.' + name + '.command' });
          }
        } else if (surface.id === 'vscode-settings' || surface.id === 'gemini-settings') {
          // no structural extraction; fallback sweep will handle if needed
        }
        for (let ci = 0; ci < cmds.length; ci++) {
          const c = cmds[ci];
          const res = evaluateCommand(ownDir, c.trigger, c.command, c.auto, relPath, c.field);
          findings = findings.concat(res);
        }
        // defense-in-depth whole-file sweep
        const sweepFindings = evaluateCommand(ownDir, 'file-body', content, false, relPath, null);
        if (sweepFindings.length) {
          const existingCaps = new Set();
          for (let fi = 0; fi < findings.length; fi++) for (let ci = 0; ci < findings[fi].capabilities.length; ci++) existingCaps.add(findings[fi].capabilities[ci]);
          const newCaps = [];
          for (let fi = 0; fi < sweepFindings.length; fi++) for (let ci = 0; ci < sweepFindings[fi].capabilities.length; ci++) if (!existingCaps.has(sweepFindings[fi].capabilities[ci])) newCaps.push(sweepFindings[fi].capabilities[ci]);
          if (newCaps.length > 0) findings = findings.concat(sweepFindings);
          else if (findings.length === 0) findings = findings.concat(sweepFindings);
        }
      }
    } else if (surface.id === 'github-workflows') {
      const cmds = extractGithubWorkflowCommands(content);
      for (let ci = 0; ci < cmds.length; ci++) {
        const c = cmds[ci];
        findings = findings.concat(evaluateCommand('.github', c.trigger, c.command, c.auto, relPath, c.field));
      }
      const sweepFindings = evaluateCommand('.github', 'file-body', content, false, relPath, null);
      if (sweepFindings.length) {
        const existingCaps = new Set();
        for (let fi = 0; fi < findings.length; fi++) for (let ci = 0; ci < findings[fi].capabilities.length; ci++) existingCaps.add(findings[fi].capabilities[ci]);
        const newCaps = [];
        for (let fi = 0; fi < sweepFindings.length; fi++) for (let ci = 0; ci < sweepFindings[fi].capabilities.length; ci++) if (!existingCaps.has(sweepFindings[fi].capabilities[ci])) newCaps.push(sweepFindings[fi].capabilities[ci]);
        if (newCaps.length > 0) findings = findings.concat(sweepFindings);
        else if (findings.length === 0) findings = findings.concat(sweepFindings);
      }
      if (cmds.length === 0 && content.trim().length > 0) diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: relPath, detail: 'No run: commands extracted — heuristic YAML scan (no YAML AST)' });
    } else {
      const auto = surface.id === 'git-hooks' || surface.id === 'husky-hooks';
      const res = evaluateCommand(ownDir, relPath.split('/').pop(), content, auto, relPath, null);
      findings = findings.concat(res);
    }
    // deduplicate generic file-body if specific already covers
    findings = findings.filter(function (f, i, arr) {
      if (f.trigger !== 'file-body') return true;
      for (let oi = 0; oi < arr.length; oi++) {
        const o = arr[oi];
        if (o !== f && o.severity === f.severity) {
          for (let ci = 0; ci < f.capabilities.length; ci++) if (o.capabilities.indexOf(f.capabilities[ci]) !== -1) return false;
        }
      }
      return true;
    });
    const order = { CRITICAL: 0, WARN: 1, INFO: 2 };
    findings.sort(function (a, b) {
      const oa = order[a.severity] !== undefined ? order[a.severity] : 99;
      const ob = order[b.severity] !== undefined ? order[b.severity] : 99;
      if (oa !== ob) return oa - ob;
      const at = a.trigger.localeCompare(b.trigger);
      if (at !== 0) return at;
      return a.command.localeCompare(b.command);
    });
    const fileCaps = Array.from(new Set([].concat.apply([], findings.map(function (f) { return f.capabilities; })))).sort();
    return { file: relPath, surface: surface.id, hash: hash, findings: findings, parseError: parseError, diagnostics: diagnostics, capabilities: fileCaps };
  }

  function scanVirtualRepo(filesMap) {
    const diagnostics = [];
    const results = [];
    const relPaths = Object.keys(filesMap).sort();
    for (let pi = 0; pi < relPaths.length; pi++) {
      const rel = toPosix(relPaths[pi]);
      // Skip ignored dirs: node_modules etc. For virtual demo, we still respect IGNORED_DIRS
      const topDir = rel.split('/')[0];
      if (['node_modules', '.git', 'dist', 'build', '.hookaudit'].indexOf(topDir) !== -1) {
        continue;
      }
      const content = filesMap[rel];
      // Find matching surface
      // For .husky/* etc, need prefix match
      let matchedSurface = null;
      // Try exact glob match first
      for (let si = 0; si < SURFACES.length; si++) {
        const s = SURFACES[si];
        for (let gi = 0; gi < s.globs.length; gi++) {
          const g = s.globs[gi];
          if (g.indexOf('/') !== -1) {
            if (rel === g) matchedSurface = s;
            // directory prefix for .husky / .git/hooks / .github/workflows
            if (g === '.husky' && rel.indexOf('.husky/') === 0) matchedSurface = s;
            if (g === '.git/hooks' && rel.indexOf('.git/hooks/') === 0) {
              if (rel.endsWith('.sample')) matchedSurface = null;
              else matchedSurface = s;
            }
            if (g === '.github/workflows' && rel.indexOf('.github/workflows/') === 0) {
              if (!/\.ya?ml$/i.test(rel)) matchedSurface = null;
              else matchedSurface = s;
            }
          } else {
            if (rel === g) matchedSurface = s;
            if (rel.startsWith('.cursor/') && s.id === 'cursor-rules') matchedSurface = s;
          }
        }
      }
      // Also consider that .cursor/rules is a file, .cursorrules is file
      // For simplicity, if no surface matched but file looks like a script referenced, we don't scan it as surface.
      // Only surfaces are scanned as entry points. Scripts are discovered via resolver.
      if (!matchedSurface) continue;
      // Skip .sample git hooks already
      if (matchedSurface.id === 'git-hooks' && rel.endsWith('.sample')) continue;
      const res = scanVirtualFile(filesMap, matchedSurface, rel, content, diagnostics);
      results.push(res);
    }
    results.sort(function (a, b) { return a.file.localeCompare(b.file); });
    diagnostics.sort(function (a, b) { return (a.code + a.path).localeCompare(b.code + b.path); });
    return { results: results, diagnostics: diagnostics };
  }

  function buildExecutionGraph(filesMap, scanResults, globalDiagnostics) {
    const diagnostics = globalDiagnostics || [];
    const nodes = [];
    const edges = [];
    const paths = [];
    const visited = new Set();
    let nodeIdCounter = 0;
    function nextId(prefix) { const id = prefix + '_' + (nodeIdCounter++); return id; }
    const repoNode = { id: 'repo', kind: 'REPOSITORY', path: '.', label: 'REPOSITORY', capabilities: [] };
    nodes.push(repoNode);
    function addNode(kind, p, label) {
      const id = nextId(kind.toLowerCase());
      const n = { id: id, kind: kind, path: p, label: label || p, capabilities: [] };
      nodes.push(n);
      return n;
    }
    // Build per-surface subgraph
    for (let ri = 0; ri < scanResults.length; ri++) {
      const result = scanResults[ri];
      if (!result.findings.length) continue;
      const configNode = addNode('CONFIG', result.file, result.file);
      edges.push({ from: repoNode.id, to: configNode.id, kind: 'CONTAINS', evidence: { path: result.file } });
      for (let fi = 0; fi < result.findings.length; fi++) {
        const finding = result.findings[fi];
        const triggerNode = addNode('TRIGGER', result.file, finding.trigger);
        edges.push({ from: configNode.id, to: triggerNode.id, kind: 'TRIGGERS', evidence: { path: result.file, field: finding.field } });
        const cmdNode = addNode('COMMAND', result.file, finding.command.slice(0, 80));
        cmdNode.capabilities = finding.capabilities ? finding.capabilities.slice() : [];
        cmdNode.confidence = finding.confidence;
        edges.push({ from: triggerNode.id, to: cmdNode.id, kind: 'EXECUTES', evidence: { path: result.file, field: finding.field, excerpt: finding.command } });
        const refs = (finding.commandSpec && finding.commandSpec.references) ? finding.commandSpec.references : [];
        const scriptRefs = extractScriptReferences(finding.command);
        const allRefsSet = new Set(refs.concat(scriptRefs));
        const allRefs = Array.from(allRefsSet);
        let createdPathsForFinding = 0;
        for (let rri = 0; rri < allRefs.length; rri++) {
          const rawRef = allRefs[rri];
          if (!rawRef || rawRef.length < 3 || rawRef === '//' || rawRef.indexOf('http') === 0 || rawRef.indexOf('//') === 0) continue;
          if (rawRef.indexOf('/') === -1 && rawRef.indexOf('\\') === -1 && !/\.\w+$/.test(rawRef)) continue;
          const resolved = resolveInsideRepositoryVirtual(filesMap, rawRef, null);
          if (!resolved.ok) {
            if (resolved.code === DIAGNOSTIC_CODES.BOUNDARY_VIOLATION) {
              diagnostics.push({ code: resolved.code, path: result.file, detail: rawRef + ' \u2192 outside repository' });
              const diagNode = addNode('FILE', rawRef, rawRef + ' (BOUNDARY)');
              edges.push({ from: cmdNode.id, to: diagNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: resolved.code });
            } else if (resolved.code === DIAGNOSTIC_CODES.DYNAMIC_EXECUTION) {
              diagnostics.push({ code: resolved.code, path: result.file, detail: 'Dynamic reference ' + rawRef });
              const dynNode = addNode('FILE', rawRef, rawRef + ' (DYNAMIC)');
              edges.push({ from: cmdNode.id, to: dynNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: resolved.code });
              dynNode.capabilities = [CAPABILITY.DYNAMIC_EXECUTION];
              const newCaps = new Set(cmdNode.capabilities || []);
              newCaps.add(CAPABILITY.DYNAMIC_EXECUTION);
              cmdNode.capabilities = Array.from(newCaps).sort();
            } else {
              diagnostics.push({ code: DIAGNOSTIC_CODES.UNRESOLVED_REFERENCE, path: result.file, detail: 'Unresolved ' + rawRef + ': ' + resolved.reason });
              const unNode = addNode('FILE', rawRef, rawRef + ' (UNRESOLVED)');
              edges.push({ from: cmdNode.id, to: unNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: 'UNRESOLVED_REFERENCE' });
            }
            continue;
          }
          const rel = resolved.relative;
          const visitKey = result.file + '\u2192' + rel;
          if (visited.has(visitKey)) {
            diagnostics.push({ code: DIAGNOSTIC_CODES.CYCLE_DETECTED, path: result.file, detail: 'Cycle detected ' + visitKey });
            const cycleNode = addNode('FILE', rel, rel + ' (CYCLE)');
            edges.push({ from: cmdNode.id, to: cycleNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef }, diagnostic: DIAGNOSTIC_CODES.CYCLE_DETECTED });
            continue;
          }
          visited.add(visitKey);
          const content = resolved.content;
          const ext = rel.indexOf('.') !== -1 ? rel.slice(rel.lastIndexOf('.')) : '';
          const isScript = ['.js', '.mjs', '.cjs', '.ts', '.sh', '.bash', '.py', '.ps1', '.psm1'].indexOf(ext) !== -1 || ext === '';
          const nodeKind = isScript ? 'SCRIPT' : 'FILE';
          const scriptNode = addNode(nodeKind, rel, rel);
          edges.push({ from: cmdNode.id, to: scriptNode.id, kind: 'REFERENCES', evidence: { path: result.file, excerpt: rawRef } });
          const scriptCapsInfo = inferCapabilities(content);
          let caps = scriptCapsInfo.capabilities.slice();
          if (/\bcurl\b|\bwget\b|https?:\/\//i.test(content) && caps.indexOf(CAPABILITY.NETWORK_ACCESS) === -1) caps.push(CAPABILITY.NETWORK_ACCESS);
          if (/download.*runtime|bun.*install/i.test(content)) { caps.push(CAPABILITY.RUNTIME_BOOTSTRAP, CAPABILITY.REMOTE_DOWNLOAD); }
          if (/\bnode\b|\bpython\b|\bbash\b|\bsh\b/i.test(content) && caps.indexOf(CAPABILITY.PROCESS_EXECUTION) === -1) caps.push(CAPABILITY.PROCESS_EXECUTION);
          caps = Array.from(new Set(caps)).sort();
          scriptNode.capabilities = caps.slice();
          // BFS queue for multi-hop
          const queue = [{ node: scriptNode, rel: rel, content: content, depth: 1 }];
          const allCaps = caps.slice();
          const chainRels = [rel];
          const chainNodes = [scriptNode.id];
          const visitedFiles = new Set([rel]);
          while (queue.length) {
            const cur = queue.shift();
            if (cur.depth >= MAX_GRAPH_DEPTH) {
              diagnostics.push({ code: DIAGNOSTIC_CODES.DEPTH_LIMIT_REACHED, path: cur.rel, detail: 'Depth ' + MAX_GRAPH_DEPTH + ' reached' });
              continue;
            }
            const curRefs = extractScriptReferences(cur.content);
            for (let cri = 0; cri < curRefs.length; cri++) {
              const nr = curRefs[cri];
              if (!nr || nr.length < 3 || nr === '//' || nr.indexOf('http') === 0 || nr.indexOf('//') === 0) continue;
              if (nr.indexOf('/') === -1 && nr.indexOf('\\') === -1 && !/\.\w+$/.test(nr)) continue;
              const baseDir = dirnamePosix(cur.rel);
              let nrResolved = null;
              // try baseDir first then root, checking existence
              const tries = [joinPosix(baseDir, nr), nr];
              // also try raw nr normalized directly if not found
              let found = null;
              for (let ti = 0; ti < tries.length; ti++) {
                const tryCandidate = tries[ti];
                const res = resolveInsideRepositoryVirtual(filesMap, tryCandidate, null);
                // For nested, we want to treat successful ok as found; but resolveInsideRepositoryVirtual already normalizes and checks existence.
                // However we need to distinguish boundary/dynamic vs unresolved
                if (res.ok) { found = res; break; }
                if (res.code === DIAGNOSTIC_CODES.BOUNDARY_VIOLATION || res.code === DIAGNOSTIC_CODES.DYNAMIC_EXECUTION) {
                  nrResolved = res;
                  break;
                }
                // else unresolved, continue to next try
              }
              if (found) nrResolved = found;
              else if (!nrResolved) {
                // All tries returned UNRESOLVED_REFERENCE -> report unresolved continuation but don't add node
                // Also check dynamic via raw test
                if (/(\$\{|\$\(|`|\bprocess\.env\b|\+.*["']\/|path\.join)/.test(nr)) {
                  nrResolved = { ok: false, code: DIAGNOSTIC_CODES.DYNAMIC_EXECUTION, reason: 'dynamic' };
                } else {
                  // Treat as unresolved, no edge needed for missing nested unless we want diagnostics
                  // Add diagnostic for nested unresolved?
                  // For demo, we can push but not add node to keep graph clean
                  continue;
                }
              }
              if (!nrResolved.ok) {
                if (nrResolved.code === DIAGNOSTIC_CODES.BOUNDARY_VIOLATION) {
                  diagnostics.push({ code: nrResolved.code, path: cur.rel, detail: 'Nested ' + nr + ' \u2192 outside' });
                } else if (nrResolved.code === DIAGNOSTIC_CODES.DYNAMIC_EXECUTION) {
                  diagnostics.push({ code: nrResolved.code, path: cur.rel, detail: 'Dynamic nested ' + nr });
                  if (cur.node.capabilities.indexOf(CAPABILITY.DYNAMIC_EXECUTION) === -1) cur.node.capabilities.push(CAPABILITY.DYNAMIC_EXECUTION);
                  allCaps.push(CAPABILITY.DYNAMIC_EXECUTION);
                }
                continue;
              }
              const nrRel = nrResolved.relative;
              if (nrRel === cur.rel) continue; // ignore self-reference (e.g., filename in header comment)
              const nestedKey = cur.rel + '\u2192' + nrRel;
              if (visited.has(nestedKey)) {
                diagnostics.push({ code: DIAGNOSTIC_CODES.CYCLE_DETECTED, path: cur.rel, detail: 'Cycle ' + nestedKey });
                const cNode = addNode('FILE', nrRel, nrRel + ' (CYCLE)');
                edges.push({ from: cur.node.id, to: cNode.id, kind: 'REFERENCES', evidence: { path: cur.rel, excerpt: nr }, diagnostic: DIAGNOSTIC_CODES.CYCLE_DETECTED });
                continue;
              }
              if (visitedFiles.has(nrRel)) {
                diagnostics.push({ code: DIAGNOSTIC_CODES.CYCLE_DETECTED, path: cur.rel, detail: 'Cycle file ' + nrRel });
                const cNode = addNode('FILE', nrRel, nrRel + ' (CYCLE)');
                edges.push({ from: cur.node.id, to: cNode.id, kind: 'REFERENCES', evidence: { path: cur.rel, excerpt: nr }, diagnostic: DIAGNOSTIC_CODES.CYCLE_DETECTED });
                visited.add(nestedKey);
                continue;
              }
              // Check file exists уже ensured, get content
              const nContent = nrResolved.content;
              if (nContent.length > MAX_FILE_SIZE) {
                diagnostics.push({ code: DIAGNOSTIC_CODES.FILE_TOO_LARGE, path: nrRel, detail: 'Size ' + nContent.length });
                visited.add(nestedKey);
                continue;
              }
              if (isBinaryContent(nContent)) {
                diagnostics.push({ code: DIAGNOSTIC_CODES.BINARY_SKIPPED, path: nrRel, detail: 'Binary' });
                visited.add(nestedKey);
                continue;
              }
              visited.add(nestedKey);
              visitedFiles.add(nrRel);
              const nestedNode = addNode('SCRIPT', nrRel, nrRel);
              edges.push({ from: cur.node.id, to: nestedNode.id, kind: 'REFERENCES', evidence: { path: cur.rel, excerpt: nr } });
              const nestedCapsInfo = inferCapabilities(nContent);
              let nCaps = nestedCapsInfo.capabilities.slice();
              if (/\bcurl\b|\bwget\b|https?:\/\//i.test(nContent) && nCaps.indexOf(CAPABILITY.NETWORK_ACCESS) === -1) nCaps.push(CAPABILITY.NETWORK_ACCESS);
              if (/download.*runtime|bun.*install/i.test(nContent)) { nCaps.push(CAPABILITY.RUNTIME_BOOTSTRAP, CAPABILITY.REMOTE_DOWNLOAD); }
              nCaps = Array.from(new Set(nCaps)).sort();
              nestedNode.capabilities = nCaps.slice();
              for (let nci = 0; nci < nCaps.length; nci++) allCaps.push(nCaps[nci]);
              chainRels.push(nrRel);
              chainNodes.push(nestedNode.id);
              queue.push({ node: nestedNode, rel: nrRel, content: nContent, depth: cur.depth + 1 });
            }
          }
          // deduplicate allCaps
          const dedupCaps = Array.from(new Set(allCaps)).sort();
          // update scriptNode caps with aggregated
          scriptNode.capabilities = Array.from(new Set(scriptNode.capabilities.concat(dedupCaps))).sort();
          const pathCaps = Array.from(new Set((finding.capabilities || []).concat(dedupCaps))).sort();
          const isAuto = isAutoTrigger(finding.trigger);
          const pathRisk = computePathRisk(pathCaps, isAuto);
          const confidence = dedupCaps.length ? 'MEDIUM' : finding.confidence;
          paths.push({
            id: result.file + ':' + finding.trigger + '\u2192' + chainRels.join('\u2192'),
            trigger: finding.trigger,
            sourcePath: result.file,
            chain: [result.file, finding.command].concat(chainRels),
            nodes: [configNode.id, triggerNode.id, cmdNode.id].concat(chainNodes),
            capabilities: pathCaps,
            risk: pathRisk,
            confidence: confidence,
            evidence: [{ path: result.file, field: finding.field, excerpt: finding.command }].concat(chainRels.map(function (r) { return { path: r, excerpt: r }; }))
          });
          createdPathsForFinding++;
          if (!finding.reachableCapabilities || pathCaps.length > (finding.reachableCapabilities || []).length) {
            finding.reachableCapabilities = pathCaps;
            finding.pathRisk = pathRisk;
          }
          const merged = new Set((cmdNode.capabilities || []).concat(pathCaps));
          cmdNode.capabilities = Array.from(merged).sort();
        }
        if (createdPathsForFinding === 0) {
          const isAuto = isAutoTrigger(finding.trigger);
          const pathRisk = computePathRisk(finding.capabilities || [], isAuto);
          paths.push({
            id: result.file + ':' + finding.trigger,
            trigger: finding.trigger,
            sourcePath: result.file,
            chain: [result.file, finding.command],
            nodes: [configNode.id, triggerNode.id, cmdNode.id],
            capabilities: finding.capabilities || [],
            risk: pathRisk,
            confidence: finding.confidence,
            evidence: [{ path: result.file, field: finding.field, excerpt: finding.command }]
          });
          finding.reachableCapabilities = finding.capabilities;
          finding.pathRisk = pathRisk;
        }
      }
    }
    // capability nodes
    const allCapsSet = new Set();
    for (let pi = 0; pi < paths.length; pi++) for (let ci = 0; ci < paths[pi].capabilities.length; ci++) allCapsSet.add(paths[pi].capabilities[ci]);
    const allCaps = Array.from(allCapsSet).sort();
    for (let ci = 0; ci < allCaps.length; ci++) {
      const cap = allCaps[ci];
      const capNode = addNode('CAPABILITY', cap, cap);
      capNode.capability = cap;
      for (let ni = 0; ni < nodes.length; ni++) {
        const n = nodes[ni];
        if (n.capabilities && n.capabilities.indexOf(cap) !== -1 && (n.kind === 'SCRIPT' || n.kind === 'COMMAND' || n.kind === 'FILE')) {
          edges.push({ from: n.id, to: capNode.id, kind: 'CONNECTS_TO', evidence: { capability: cap } });
        }
      }
    }
    nodes.sort(function (a, b) { return a.id.localeCompare(b.id); });
    edges.sort(function (a, b) { return (a.from + a.to + a.kind).localeCompare(b.from + b.to + b.kind); });
    paths.sort(function (a, b) { return a.id.localeCompare(b.id); });
    diagnostics.sort(function (a, b) { return (a.code + (a.path || '')).localeCompare(b.code + (b.path || '')); });
    return { nodes: nodes, edges: edges, paths: paths, diagnostics: diagnostics };
  }

  function analyzeRepo(filesMap) {
    const scan = scanVirtualRepo(filesMap);
    const graph = buildExecutionGraph(filesMap, scan.results, scan.diagnostics.slice());
    // merge per-file diagnostics into global for display
    const allDiagnostics = scan.diagnostics.slice();
    for (let ri = 0; ri < scan.results.length; ri++) {
      const r = scan.results[ri];
      if (r.diagnostics) for (let di = 0; di < r.diagnostics.length; di++) allDiagnostics.push(r.diagnostics[di]);
    }
    for (let di = 0; di < graph.diagnostics.length; di++) {
      const d = graph.diagnostics[di];
      if (allDiagnostics.findIndex(function (x) { return x.code === d.code && x.path === d.path && x.detail === d.detail; }) === -1) allDiagnostics.push(d);
    }
    allDiagnostics.sort(function (a, b) { return (a.code + (a.path || '')).localeCompare(b.code + (b.path || '')); });
    // summary
    const allFindings = [].concat.apply([], scan.results.map(function (r) { return r.findings; }));
    const highRiskPaths = graph.paths.filter(function (p) { return p.risk === 'HIGH' || p.risk === 'CRITICAL'; }).length;
    const decision = (highRiskPaths > 0 || allFindings.some(function (f) { return f.severity === 'CRITICAL'; })) ? 'BLOCK' : (allFindings.some(function (f) { return f.severity === 'WARN'; }) ? 'REVIEW' : 'PASS');
    return {
      results: scan.results,
      graph: graph,
      diagnostics: allDiagnostics,
      summary: {
        executionSurfaces: scan.results.length,
        withFindings: scan.results.filter(function (r) { return r.findings.length; }).length,
        totalFindings: allFindings.length,
        critical: allFindings.filter(function (f) { return f.severity === 'CRITICAL'; }).length,
        warn: allFindings.filter(function (f) { return f.severity === 'WARN'; }).length,
        paths: graph.paths.length,
        highRiskPaths: highRiskPaths,
        diagnostics: allDiagnostics.length,
        decision: decision
      }
    };
  }

  function diffAgainstBaseline(baseline, currentFilesMap, currentAnalysis) {
    if (!baseline) return null;
    const currentFiles = currentFilesMap; // {path: content}
    // Use simpleHash for deterministic drift comparison; baseline.filesSimple is stored for compatibility
    const currentHashesSimple = {};
    const keys = Object.keys(currentFiles).sort();
    for (let i = 0; i < keys.length; i++) currentHashesSimple[keys[i]] = sha256SyncFallback(currentFiles[keys[i]]);
    const baselineFiles = baseline.filesSimple || baseline.files || {};
    const baselineSurfaces = baseline.surfaces || [];
    const currentSurfaces = currentAnalysis.results.map(function (r) {
      return {
        file: r.file,
        hash: r.hash,
        triggers: r.findings.map(function (f) { return f.trigger; }).sort(),
        commands: r.findings.map(function (f) { return f.command; }).sort(),
        capabilities: (r.capabilities || []).slice().sort(),
        references: (r.findings.reduce(function (acc, f) { return acc.concat(f.commandSpec.references || []); }, [])).sort()
      };
    });
    const byFileBaseline = new Map();
    for (let i = 0; i < baselineSurfaces.length; i++) byFileBaseline.set(baselineSurfaces[i].file, baselineSurfaces[i]);
    const byFileCurrent = new Map();
    for (let i = 0; i < currentSurfaces.length; i++) byFileCurrent.set(currentSurfaces[i].file, currentSurfaces[i]);

    const changes = [];
    const currentFileKeys = Object.keys(currentHashesSimple);
    for (let i = 0; i < currentFileKeys.length; i++) {
      const file = currentFileKeys[i];
      const hash = currentHashesSimple[file];
      if (!(file in baselineFiles)) changes.push({ file: file, type: 'NEW' });
      else if (baselineFiles[file] !== hash) changes.push({ file: file, type: 'CHANGED' });
    }
    const baselineKeys = Object.keys(baselineFiles);
    for (let i = 0; i < baselineKeys.length; i++) {
      const file = baselineKeys[i];
      if (!(file in currentHashesSimple)) changes.push({ file: file, type: 'REMOVED' });
    }
    const semantic = [];
    // Compare per file
    const currentKeys = Array.from(byFileCurrent.keys());
    for (let ci = 0; ci < currentKeys.length; ci++) {
      const file = currentKeys[ci];
      const cur = byFileCurrent.get(file);
      const base = byFileBaseline.get(file);
      if (!base) {
        if (cur.triggers.length) semantic.push({ file: file, type: 'NEW_TRIGGER', detail: cur.triggers.join(', ') });
        if (cur.capabilities.length) semantic.push({ file: file, type: 'NEW_CAPABILITY', detail: cur.capabilities.join(', ') });
        if (cur.references.length) semantic.push({ file: file, type: 'NEW_REFERENCE', detail: cur.references.join(', ') });
        continue;
      }
      const baseTriggers = (base.findings || []).map(function (f) { return f.trigger; }).sort();
      const curTriggers = cur.triggers;
      for (let ti = 0; ti < curTriggers.length; ti++) if (baseTriggers.indexOf(curTriggers[ti]) === -1) semantic.push({ file: file, type: 'NEW_TRIGGER', detail: curTriggers[ti] });
      for (let ti = 0; ti < baseTriggers.length; ti++) if (curTriggers.indexOf(baseTriggers[ti]) === -1) semantic.push({ file: file, type: 'REMOVED_TRIGGER', detail: baseTriggers[ti] });
      const baseCmds = (base.findings || []).map(function (f) { return f.command; }).sort();
      const curCmds = cur.commands;
      for (let ti = 0; ti < curCmds.length; ti++) if (baseCmds.indexOf(curCmds[ti]) === -1) semantic.push({ file: file, type: 'NEW_COMMAND', detail: curCmds[ti].slice(0, 80) });
      const baseCaps = (base.capabilities || []).slice().sort();
      const curCaps = cur.capabilities;
      for (let ti = 0; ti < curCaps.length; ti++) if (baseCaps.indexOf(curCaps[ti]) === -1) semantic.push({ file: file, type: 'NEW_CAPABILITY', detail: curCaps[ti] });
      const baseRefs = (base.findings || []).reduce(function (acc, f) { return acc.concat(((f.commandSpec && f.commandSpec.references) || [])); }, []).sort();
      const curRefs = cur.references;
      for (let ti = 0; ti < curRefs.length; ti++) if (baseRefs.indexOf(curRefs[ti]) === -1) semantic.push({ file: file, type: 'NEW_REFERENCE', detail: curRefs[ti] });
    }
    for (let bi = 0; bi < baselineSurfaces.length; bi++) {
      const base = baselineSurfaces[bi];
      if (!byFileCurrent.has(base.file)) semantic.push({ file: base.file, type: 'REMOVED_SURFACE', detail: base.surface });
    }
    // Also capability diff via graph and reachable: detect new capabilities not in baseline
    const baselineCaps = baseline.capabilitySummary || [];
    const baselineReachable = baseline.reachableSummary || [];
    const baselinePathCaps = baseline.pathCapabilities || [];
    const currentCapsSet = new Set();
    for (let i = 0; i < currentAnalysis.results.length; i++) for (let ci = 0; ci < (currentAnalysis.results[i].capabilities || []).length; ci++) currentCapsSet.add(currentAnalysis.results[i].capabilities[ci]);
    const currentAllCaps = Array.from(currentCapsSet).sort();
    for (let i = 0; i < currentAllCaps.length; i++) if (baselineCaps.indexOf(currentAllCaps[i]) === -1) {
      if (!semantic.some(function (s) { return s.type === 'NEW_CAPABILITY' && s.detail === currentAllCaps[i]; })) {
        semantic.push({ file: '(graph)', type: 'NEW_CAPABILITY', detail: currentAllCaps[i] });
      }
    }
    // reachable (includes script-transitive capabilities) — more sensitive for multi-hop
    const currentReachableSet = new Set();
    for (let i = 0; i < currentAnalysis.results.length; i++) {
      const r = currentAnalysis.results[i];
      for (let fi = 0; fi < r.findings.length; fi++) {
        const caps = r.findings[fi].reachableCapabilities || [];
        for (let ci = 0; ci < caps.length; ci++) currentReachableSet.add(caps[ci]);
      }
    }
    const currentReachable = Array.from(currentReachableSet).sort();
    for (let i = 0; i < currentReachable.length; i++) {
      const cap = currentReachable[i];
      if (baselineReachable.indexOf(cap) === -1 && baselineCaps.indexOf(cap) === -1) {
        if (!semantic.some(function (s) { return s.type === 'NEW_CAPABILITY' && s.detail === cap; })) {
          semantic.push({ file: '(graph-reachable)', type: 'NEW_CAPABILITY', detail: cap });
        }
      }
    }
    // path-level capabilities (from graph.paths)
    const currentPathSet = new Set();
    for (let i = 0; i < currentAnalysis.graph.paths.length; i++) for (let ci = 0; ci < (currentAnalysis.graph.paths[i].capabilities || []).length; ci++) currentPathSet.add(currentAnalysis.graph.paths[i].capabilities[ci]);
    const currentPathCaps = Array.from(currentPathSet).sort();
    for (let i = 0; i < currentPathCaps.length; i++) {
      const cap = currentPathCaps[i];
      if (baselinePathCaps.indexOf(cap) === -1 && baselineCaps.indexOf(cap) === -1 && baselineReachable.indexOf(cap) === -1) {
        if (!semantic.some(function (s) { return s.type === 'NEW_CAPABILITY' && s.detail === cap; })) {
          semantic.push({ file: '(path)', type: 'NEW_CAPABILITY', detail: cap });
        }
      }
    }
    changes.sort(function (a, b) { return a.file.localeCompare(b.file) || a.type.localeCompare(b.type); });
    semantic.sort(function (a, b) { return a.file.localeCompare(b.file) || a.type.localeCompare(b.type); });
    return { baseline: baseline, changes: changes, semantic: semantic, graph: { nodes: currentAnalysis.graph.nodes, edges: currentAnalysis.graph.edges, paths: currentAnalysis.graph.paths } };
  }

  async function createBaselineAsync(filesMap, analysis) {
    const hashed = await hashFilesAsync(filesMap);
    const surfaces = analysis.results.map(function (r) {
      return { file: r.file, surface: r.surface, hash: r.hash, capabilities: (r.capabilities || []).slice().sort(), findings: r.findings.map(function (f) { return { trigger: f.trigger, command: f.command, commandSpec: f.commandSpec, severity: f.severity, capabilities: f.capabilities.slice(), reachableCapabilities: (f.reachableCapabilities || []).slice(), pathRisk: f.pathRisk || null }; }) };
    });
    surfaces.sort(function (a, b) { return a.file.localeCompare(b.file); });
    const capabilitySummary = Array.from(new Set([].concat.apply([], analysis.results.map(function (r) { return r.capabilities || []; })))).sort();
    const reachableSummary = Array.from(new Set([].concat.apply([], analysis.results.map(function (r) { return [].concat.apply([], r.findings.map(function (f) { return f.reachableCapabilities || []; })); })))).sort();
    const pathCapabilities = Array.from(new Set([].concat.apply([], analysis.graph.paths.map(function (p) { return p.capabilities || []; })))).sort();
    // store simpleHash mapping as fallback for diff compatibility (deterministic file drift via simpleHash)
    const simpleHashed = hashFilesSync(filesMap);
    return {
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      id: 'demo-' + Math.random().toString(16).slice(2, 10),
      files: hashed.files,
      filesSimple: simpleHashed.files,
      filesMethod: hashed.method,
      perFileMethod: hashed.perFileMethod,
      surfaces: surfaces,
      capabilitySummary: capabilitySummary,
      reachableSummary: reachableSummary,
      pathCapabilities: pathCapabilities,
      graphSummary: { nodes: analysis.graph.nodes.length, edges: analysis.graph.edges.length, paths: analysis.graph.paths.length },
      label: 'Trusted execution surface (not \u201CSafe repository\u201D) — records what you chose to trust at this point in time.'
    };
  }

  function createBaselineSync(filesMap, analysis) {
    const hashed = hashFilesSync(filesMap);
    const surfaces = analysis.results.map(function (r) {
      return { file: r.file, surface: r.surface, hash: r.hash, capabilities: (r.capabilities || []).slice().sort(), findings: r.findings.map(function (f) { return { trigger: f.trigger, command: f.command, commandSpec: f.commandSpec, severity: f.severity, capabilities: f.capabilities.slice(), reachableCapabilities: (f.reachableCapabilities || []).slice(), pathRisk: f.pathRisk || null }; }) };
    });
    surfaces.sort(function (a, b) { return a.file.localeCompare(b.file); });
    const capabilitySummary = Array.from(new Set([].concat.apply([], analysis.results.map(function (r) { return r.capabilities || []; })))).sort();
    const reachableSummary = Array.from(new Set([].concat.apply([], analysis.results.map(function (r) { return [].concat.apply([], r.findings.map(function (f) { return f.reachableCapabilities || []; })); })))).sort();
    const pathCapabilities = Array.from(new Set([].concat.apply([], analysis.graph.paths.map(function (p) { return p.capabilities || []; })))).sort();
    return {
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      id: 'demo-' + Math.random().toString(16).slice(2, 10),
      files: hashed.files,
      filesSimple: hashed.files,
      filesMethod: hashed.method,
      perFileMethod: {},
      surfaces: surfaces,
      capabilitySummary: capabilitySummary,
      reachableSummary: reachableSummary,
      pathCapabilities: pathCapabilities,
      graphSummary: { nodes: analysis.graph.nodes.length, edges: analysis.graph.edges.length, paths: analysis.graph.paths.length },
      label: 'Trusted execution surface (not \u201CSafe repository\u201D) — records what you chose to trust at this point in time.'
    };
  }

  // expose
  const HookAuditEngine = {
    CAPABILITY: CAPABILITY,
    DIAGNOSTIC_CODES: DIAGNOSTIC_CODES,
    RULES: RULES,
    SURFACES: SURFACES,
    MAX_GRAPH_DEPTH: MAX_GRAPH_DEPTH,
    parseCommandSpec: parseCommandSpec,
    inferCapabilities: inferCapabilities,
    computePathRisk: computePathRisk,
    computeConfidence: computeConfidence,
    extractScriptReferences: extractScriptReferences,
    resolveInsideRepositoryVirtual: resolveInsideRepositoryVirtual,
    scanVirtualRepo: scanVirtualRepo,
    buildExecutionGraph: buildExecutionGraph,
    analyzeRepo: analyzeRepo,
    diffAgainstBaseline: diffAgainstBaseline,
    createBaselineAsync: createBaselineAsync,
    createBaselineSync: createBaselineSync,
    hashFilesAsync: hashFilesAsync,
    hashFilesSync: hashFilesSync,
    sha256HexAsync: sha256HexAsync,
    simpleHash: simpleHash,
    normalizePosixPath: normalizePosixPath
  };

  if (typeof window !== 'undefined') window.HookAuditEngine = HookAuditEngine;
  if (typeof globalThis !== 'undefined') globalThis.HookAuditEngine = HookAuditEngine;
  // CommonJS for node testing if needed
  if (typeof module !== 'undefined' && module.exports) module.exports = HookAuditEngine;
})();
