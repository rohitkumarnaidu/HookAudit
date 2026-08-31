# Reference — CLI

Complete, accurate description of the `hookaudit` command-line interface. Every flag and exit code is taken from `bin/hookaudit.js` parsing (`node:util parseArgs`) and verified via `node bin/hookaudit.js --help` and `npm test`.

## Synopsis

```text
hookaudit [path] [--json] [--strict]                Scan (default: current directory)
hookaudit scan [path] [--json] [--strict] [--sarif] [--html report.html] [--format sarif|json]
hookaudit baseline [path]                           Record current state as trusted
hookaudit diff [path] [--json] [--sarif] [--html report.html]
hookaudit branches [path] [--json]                  Compare execution surfaces across git branches (local, no git exec)
hookaudit export --format sarif [path]              Alias for --sarif
```

`path` is positional and optional. `hookaudit .` and `hookaudit scan --path .` are equivalent (see test `positional CLI`). All paths are POSIX-normalized and deterministically sorted.

## Commands

### `scan` (default)

Scan the target repository and report.

```bash
hookaudit .                          # human report to stdout
hookaudit . --json                   # JSON v1 to stdout
hookaudit . --sarif                  # SARIF 2.1.0 to stdout
hookaudit . --html report.html       # self-contained HTML file, no CDN, file:// compatible
hookaudit scan --path ../other-repo --json
hookaudit --json --path demo/sample-repository   # flag form also works
```

Options:

| Flag | Type | Effect |
|------|------|--------|
| `--json` | boolean | Emit JSON `v1` (`summary`, `results`, `graph`, `diagnostics`, `policy`) + backward-compat `results`/`diff`. Deterministic, sorted. |
| `--sarif` | boolean | Emit SARIF 2.1.0 (`generateSarif`). Rule IDs `HOOKAUDIT.<capability>` + `HOOKAUDIT.<DIAGNOSTIC>`, levels `error/warning/note`, fingerprints `sha256(file:field:command:cap).slice(0,16)`. |
| `--html <file>` | string | Write self-contained HTML via `generateHtmlReport` + `escapeHtml`. Inline CSS/JS, no external fetch. |
| `--format sarif\|json` | string | Alias: `--format sarif` ≡ `--sarif`. |
| `--strict` | boolean | Policy gate stricter: fail (exit 1) on `WARN` as well as `CRITICAL`. Without `--strict`, only `CRITICAL` or drift gates. |
| `--path <dir>` | string | Target root (alternative to positional). Resolved via `path.resolve`. Must exist, otherwise exit 2. |

Positional `path` and `--path` are mutually resolved — if `positionals[0]` is a valid directory, it is used as `values.path`.

### `baseline`

Record the current execution surface state as trusted.

```bash
hookaudit baseline .                 # writes .hookaudit/baseline.json
hookaudit baseline --path demo/sample-repository
```

Creates `.hookaudit/baseline.json`:

```json
{
  "schemaVersion": 2,
  "createdAt": "2026-09-01T00:00:00.000Z",
  "id": "uuid-v4",
  "files": { ".claude/settings.json": "sha256…", ".vscode/tasks.json": "…" },
  "surfaces": [{ "file": ".claude/settings.json", "surface": "claude-settings", "hash": "…", "capabilities": [], "findings": [] }],
  "capabilitySummary": ["NETWORK_ACCESS", "PROCESS_EXECUTION"],
  "graphSummary": { "nodes": 12, "edges": 11, "paths": 4 }
}
```

- `files` keys are POSIX-sorted.
- `hash` is `node:crypto createHash('sha256')` hex.
- `capabilitySummary` is union of `results[].capabilities`, sorted.
- Legacy baselines without `schemaVersion` are still readable; corrupt baseline → `BASELINE_INVALID` diagnostic, not crash.
- Only writes controlled metadata under `.hookaudit/`; normal scan is read-only.

### `diff`

Compare current state against baseline.

```bash
hookaudit diff .                     # human diff
hookaudit diff --json --path demo/sample-repository | jq .diff.semantic
hookaudit diff --sarif --path . > report.sarif
hookaudit diff --html diff.html --path .
```

Outputs both:

- File-level `changes`: `NEW / CHANGED / REMOVED` via `sha256` map compare (sorted `file+type`).
- Semantic `semantic`: `NEW_TRIGGER`, `REMOVED_TRIGGER`, `NEW_COMMAND`, `NEW_CAPABILITY`, `REMOVED_SURFACE` via normalized trigger/command/capability comparison.

Exit code `1` if drift exists (or policy blocks), `0` if no drift.

### `branches`

Local git branch comparison without `git` exec (zero-dep rule).

```bash
hookaudit branches . --json
hookaudit branches --json --path /path/to/repo
```

Reads:

- `.git/HEAD` → resolves `ref: refs/heads/<branch>` vs 40-hex
- `refs/heads/*` (loose) + nested walk under `refs/heads/`
- `packed-refs` (packed, loose wins over packed)
- Loose objects via `node:zlib inflateSync` on `.git/objects/ab/cdef…` — header `type size\0` + body, supports `commit/tree/blob`

Parses `commit → tree` + recursive `tree` walk with caps:

- `MAX_GIT_OBJECT_SIZE=5 MiB`, `MAX_GIT_TREE_DEPTH=64`, `MAX_GIT_TREE_ENTRIES=4096`, `MAX_BRANCHES=64`
- Skips `120000` symlink (`SYMLINK_SKIPPED`), `160000` submodule (`UNSUPPORTED_FORMAT`), prunes irrelevant `node_modules/dist/build/.git/coverage/vendor` subtrees via `isSurfaceRelevant()`
- Validates `mode` regex `100644|100755|040000|120000|160000|40000`, rejects `..` / absolute / `\0` in entry name

Outputs per-branch execution surfaces and cross-branch drift. `.git/hooks` is local machine state — excluded. Packed deltas requiring packfile delta resolution → `UNSUPPORTED_FORMAT`.

No `.git` → error exit `2`.

### `export`

Alias for `--sarif`/`--html` via `--format`.

```bash
hookaudit export --format sarif .    # same as hookaudit . --sarif
hookaudit export --format sarif --path demo/sample-repository
```

## Global flags

| Flag | Effect |
|------|--------|
| `--help`, `-h` | Print usage and exit 0. |
| `--json` | See `scan`/`diff` above. |
| `--sarif` | See above. |
| `--html <file>` | See above. |
| `--strict` | Stricter gate. |
| `--format` | `sarif` or `json`. |
| `--path <dir>` | Target root. |

## Policy

Policy maps severities/risks to `PASS / REVIEW / BLOCK`. Loaded from first found (64 KiB cap, BOM-stripped):

1. `.hookaudit/policy.json` / `policy.json`
2. `.hookaudit/policy.yaml` / `.hookaudit/policy.yml` / `policy.yaml` / `policy.yml`
3. `.hookaudit/policy.toml` / `policy.toml`

Formats supported (stdlib only, no `js-yaml`/`toml` package):

- **JSON:** `{ "blockOn": ["CRITICAL","HIGH"], "warnOn": ["MEDIUM","WARN"], "version": 1 }`
- **YAML subset** (`parseYamlPolicy` 140 lines): mappings, block lists `- CRITICAL`, inline arrays `["CRITICAL","HIGH"]`, `#` comments. Unsupported `!include`/`&*`/`[[array.tables]]`/`|` block scalars/tabs → `UNSUPPORTED_FORMAT` diagnostic, not crash. Caps 64 KiB / 8-depth.
- **TOML subset** (`parseTomlPolicy` 120 lines): tables `[policy]`, string arrays `blockOn = ["CRITICAL"]`, scalars. Unsupported `[[array.tables]]`/`{inline}`/`"""` multiline → `UNSUPPORTED_FORMAT`.

Defaults if no file:

```json
{ "version": 1, "blockOn": ["CRITICAL","HIGH"], "warnOn": ["MEDIUM","WARN"] }
```

Evaluation (`evaluatePolicy`): checks `finding.severity`, `finding.pathRisk`, `graph.paths[].risk`, `summary.decision` against `blockOn`/`warnOn`; returns `decision` `PASS/REVIEW/BLOCK` + `wouldBlock/wouldReview` + up to 8 `reasons`.

## Exit codes

| Code | Meaning | Condition |
|------|---------|-----------|
| `0` | No policy violation | No `CRITICAL` / no drift (or policy `PASS`); also `0` for valid `baseline` write |
| `1` | Policy violation or drift | `CRITICAL` or `HIGH` risk path present, or `WARN` with `--strict`, or `diff`/`branches` drift, or policy `BLOCK` |
| `2` | Usage / path error | Missing/invalid root, no `.git` for `branches`, unknown command |
| `3` | Internal failure (reserved) | Clean handling, not used for normal findings |

Safe for CI gates: `hookaudit . --json` in GitHub Actions `run:` step; `exit 1` fails the job.

## JSON schema (v1)

Top-level shape (`bin/hookaudit.js` JSON emit):

```json
{
  "version": 1,
  "repository": { "path": "." },
  "summary": {
    "executionSurfaces": 3,
    "withFindings": 3,
    "totalFindings": 3,
    "critical": 1,
    "warn": 2,
    "paths": 4,
    "highRiskPaths": 3,
    "diagnostics": 0,
    "decision": "BLOCK",
    "baseDecision": "BLOCK"
  },
  "results": [
    {
      "file": ".claude/settings.json",
      "surface": "claude-settings",
      "hash": "e584c118…",
      "findings": [{
        "trigger": "SessionStart",
        "command": "node scripts/bootstrap.mjs",
        "commandSpec": { "raw": "node scripts/bootstrap.mjs", "executable": "node", "args": ["node","scripts/bootstrap.mjs"], "shell": false, "references": ["scripts/bootstrap.mjs"], "isDynamic": false },
        "severity": "WARN",
        "score": 4,
        "reasons": ["fires automatically on \"SessionStart\"…"],
        "capabilities": ["PROCESS_EXECUTION"],
        "reachableCapabilities": ["DYNAMIC_EXECUTION","NETWORK_ACCESS","PROCESS_EXECUTION"],
        "pathRisk": "CRITICAL",
        "confidence": "HIGH",
        "evidence": [{ "path": ".claude/settings.json", "field": "hooks.SessionStart[0].hooks[0].command", "detector": "process-exec", "reason": "…", "excerpt": "node scripts/bootstrap.mjs" }],
        "field": "hooks.SessionStart[0].hooks[0].command",
        "sourcePath": ".claude/settings.json"
      }],
      "parseError": null,
      "diagnostics": [],
      "capabilities": ["PROCESS_EXECUTION"]
    }
  ],
  "surfaces": [],
  "paths": [{
    "id": ".claude/settings.json:SessionStart→scripts/bootstrap.mjs→scripts/helper.sh",
    "trigger": "SessionStart",
    "sourcePath": ".claude/settings.json",
    "chain": [".claude/settings.json","node scripts/bootstrap.mjs","scripts/bootstrap.mjs","scripts/helper.sh"],
    "nodes": ["config_0","trigger_1","command_2","script_10","script_11"],
    "capabilities": ["DYNAMIC_EXECUTION","NETWORK_ACCESS","PROCESS_EXECUTION","REMOTE_DOWNLOAD","RUNTIME_BOOTSTRAP"],
    "risk": "CRITICAL",
    "confidence": "MEDIUM",
    "evidence": [{ "path": ".claude/settings.json", "field": "hooks.SessionStart[0].hooks[0].command", "excerpt": "node scripts/bootstrap.mjs" }]
  }],
  "graph": { "nodes": [], "edges": [], "paths": [] },
  "capabilities": ["CROSS_TOOL_LINK","PROCESS_EXECUTION"],
  "diagnostics": [],
  "diff": null,
  "policy": null,
  "policyEval": null
}
```

Backward-compat keys `results`/`diff` are preserved alongside `summary`/`paths`/`graph`. All arrays sorted, paths POSIX, deterministic across Windows/Linux.

## SARIF 2.1.0

- `$schema: https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json`, `version: 2.1.0`
- `tool.driver.rules[]` per unique capability `HOOKAUDIT.<capability>` + diagnostics `HOOKAUDIT.<DIAGNOSTIC_CODE>` (sorted)
- `results[]` per finding+capability: `ruleId`, `level` (`error` if `CRITICAL/HIGH`, `warning` if `MEDIUM/WARN`, else `note`), `message.text` `[SEVERITY/RISK] trigger — reasons | capabilities: … | confidence: …`, `locations[].physicalLocation.artifactLocation.uri` POSIX, `partialFingerprints.primaryLocationLineHash` = `sha256(file:field:command:cap).slice(0,16)`

## HTML

Single self-contained file, inline CSS/JS, no CDN, `escapeHtml` via `replace(/[&<>"]/g)`, `file://` compatible. Sections: summary, SVG graph (deterministic layered), paths table, findings table, diagnostics, diff, embedded JSON.

## Examples

These commands work if copy-pasted from a checkout at `C:\Hackathons\HookAudit`:

```bash
node bin/hookaudit.js --help
node bin/hookaudit.js scan --path demo/sample-repository
node bin/hookaudit.js scan --path demo/sample-repository --json | jq .summary
node bin/hookaudit.js . --json --strict --path demo/sample-repository | jq .summary.decision
node bin/hookaudit.js . --sarif --path demo/sample-repository > report.sarif
node bin/hookaudit.js . --html report.html --path demo/sample-repository && start report.html
node bin/hookaudit.js baseline --path demo/sample-repository
node bin/hookaudit.js diff --json --path demo/sample-repository | jq .diff.semantic
node bin/hookaudit.js branches --json --path . | jq .branches
node bin/hookaudit.js scan --path test/fixtures/clean-repo --json | jq .summary.decision
# → REVIEW (WARN auto-trigger, no CRITICAL)
node bin/hookaudit.js scan --path test/fixtures/malicious-repo --json | jq .summary.decision
# → BLOCK
```

## Related

- `docs/reference-surfaces.md` — surfaces, triggers, evidence fields
- `docs/reference-capabilities.md` — capability detectors
- `docs/reference-graph.md` — graph model and diagnostics
- `docs/howto-scan.md` — task-oriented scanning
