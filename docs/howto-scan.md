# How to Scan a Repository and Gate CI

Task-oriented guide for running HookAudit scans, choosing the right output, and gating pull requests. Assumes you can already run `node bin/hookaudit.js --help` (see `docs/tutorial-quickstart.md` if not).

## Prerequisites

- Node.js `>=24.0.0` (`node -v`)
- Checkout at repo root (output paths are `toPosix(path.relative(root, file))` — running from the wrong directory changes `path`)
- No install needed — `package.json: dependencies {}`

## Steps

### 1. Scan the current directory (human)

```bash
node bin/hookaudit.js .
```

This prints the prioritized human report: high-risk paths first (`CRITICAL`/`HIGH` sorted), then per-surface `WARN`/`CRITICAL` with `field` pointer, `capabilities`, `why`, `evidence`, diagnostics, and `Summary: N CRITICAL, N WARN, N high-risk path(s)`. `Unsupported execution surfaces were not analyzed.` footer is normal — see `LIMITATIONS.md` for what is heuristic.

Equivalent explicit form:

```bash
node bin/hookaudit.js scan --path .
node bin/hookaudit.js --path .
```

All three are tested as equivalent (`positional CLI` test).

### 2. Get machine-readable output (JSON)

For CI or programmatic use:

```bash
node bin/hookaudit.js . --json | jq .summary
# → {executionSurfaces, withFindings, totalFindings, critical, warn, paths, highRiskPaths, diagnostics, decision}
```

JSON is `v1` with backward-compat `results`/`diff` (`docs/reference-cli.md`). Deterministic: POSIX paths, sorted `nodes/edges/paths`, byte-identical on Windows/Linux.

```bash
# Full structure
node bin/hookaudit.js . --json | jq '{summary, graph: {nodes: (.graph.nodes|length), edges: (.graph.edges|length), paths: (.graph.paths|length)}, capabilities, diagnostics: (.diagnostics|length)}'
```

### 3. Gate CI on policy (strict mode + policy file)

HookAudit is a CI gate by exit code:

| Exit | Meaning |
|------|---------|
| `0` | No policy violation |
| `1` | `CRITICAL` (or `WARN` with `--strict`) or drift |
| `2` | Usage / path error |

Gate strictly (also fail on `WARN`):

```bash
node bin/hookaudit.js . --json --strict
echo $?  # 1 if any WARN/CRITICAL, 0 otherwise
```

Customize policy via `.hookaudit/policy.json` (or `policy.yaml`/`policy.toml` — 140/120-line subset parsers, 64 KiB cap, see `docs/howto-custom-policy.md`):

```json
{ "blockOn": ["CRITICAL","HIGH"], "warnOn": ["MEDIUM","WARN"] }
```

With policy, `decision` becomes `PASS / REVIEW / BLOCK` (`evaluatePolicy`). CI example (`.github/workflows/ci.yml` snippet):

```yaml
on: { push: {} }
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      - run: node bin/hookaudit.js . --json --strict
```

No `git` invocation, no network, no `npm install` of target needed.

### 4. Produce SARIF for GitHub/CodeQL and HTML for humans

Both are adapters over the same graph — not second engines:

```bash
node bin/hookaudit.js . --sarif > report.sarif
# → SARIF 2.1.0, $schema oasis-tcs, rules HOOKAUDIT.<capability>, level error/warning/note, fingerprint sha256(file:field:command:cap).slice(0,16)
# Upload in GitHub Actions via github/codeql-action/upload-sarif

node bin/hookaudit.js . --html report.html
# → self-contained HTML, inline CSS/JS, no CDN, file:// compatible, escapeHtml via replace(/[&<>"]/g)
start report.html  # open locally — no server needed
```

Verify locally:

```bash
node bin/hookaudit.js scan --path demo/sample-repository --sarif | jq '.runs[0].results[0].ruleId'
# → "HOOKAUDIT.NETWORK_ACCESS"
ls -lh report.html report.sarif
```

### 5. Scan other branches locally (no git binary)

Working-tree scan is default. To compare committed branches without `git` exec (zero-dep rule):

```bash
node bin/hookaudit.js branches . --json | jq .branches
```

Reads `.git/HEAD` + `refs/heads/*` + `packed-refs` + `node:zlib` inflate of `commit/tree/blob` (bounded: 5 MiB object, 64-depth, 4096 entries, 64 branches). Reports per-branch surfaces. No fetch, no remote, no `.git/hooks` (local state). Packed deltas beyond loose objects → `UNSUPPORTED_FORMAT` diagnostic.

For working-tree per-branch, use `git worktree` and re-scan each worktree.

## Verification

```bash
# Human vs JSON parity
node bin/hookaudit.js . --json | jq .summary.decision
# Should match human Summary decision line

# Determinism proof
node bin/hookaudit.js scan --json --path . > /tmp/a.json
node bin/hookaudit.js scan --json --path . > /tmp/b.json
diff /tmp/a.json /tmp/b.json && echo "deterministic"
```

If `diff` shows `\` vs `/` separators, you are on an old baseline — regenerate `.hookaudit/baseline.json` after `toPosix` hardening.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `No auto-executing … hooks found.` but you expect findings | Check `IGNORED_DIRS` — file under `node_modules/.git/dist/build/.hookaudit` is ignored by design. Move test file to `.claude/settings.json`. |
| `parseError: invalid JSON` and exit 0 | Valid — malformed surface file emits `diagnostic INVALID_JSON` and continues other surfaces (`test malformed JSON` contract). Fix JSON, re-scan. |
| Exit 0 but human shows `WARN` | `WARN` alone is `REVIEW`, not `BLOCK`, without `--strict`. Use `--strict` to gate on `WARN`. |
| `FILE_TOO_LARGE` / `BINARY_SKIPPED` | File >1 MiB or binary (null-byte / >30% non-printable) — skipped by `MAX_FILE_SIZE`/`BINARY_SKIPPED` guards, see `LIMITATIONS.md` §4. |
| `BOUNDARY_VIOLATION` / `UNRESOLVED_REFERENCE` | Reference points to `../` outside root or missing file — inspected as `DYNAMIC/UNRESOLVED` with `LOW` confidence, never followed outside. See `docs/reference-graph.md`. |
| `hookaudit branches` → `No .git directory found` | Not a git repo or path wrong — pass `--path` to repo root. |

## Related

- `docs/reference-cli.md` — flags, exit codes, JSON shape, SARIF/HTML internals
- `docs/reference-surfaces.md` — what counts as a surface (12 surfaces, evidence fields)
- `docs/howto-baseline.md` — trust workflow
