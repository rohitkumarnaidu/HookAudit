# How to Write a Custom Policy (blockOn / warnOn)

Gate PRs on your team’s tolerance, not a fixed severity. Assumes you can run `hookaudit diff` and know what `BLOCK/REVIEW/PASS` means (see `docs/howto-baseline.md`).

## Prerequisites

- Same as scanning: Node `>=24`, checkout at root.
- Know your tolerance: `blockOn` → exit `1` (fail CI), `warnOn` → exit `0` but `REVIEW` decision, others → `PASS`.

Defaults without a file (`bin/hookaudit.js: POLIFY_DEFAULT`):

```json
{ "version": 1, "blockOn": ["CRITICAL","HIGH"], "warnOn": ["MEDIUM","WARN"] }
```

## Steps

### 1. Create a policy file

HookAudit loads the first found (64 KiB cap, BOM-stripped, ordered):

1. `.hookaudit/policy.json` or `policy.json`
2. `.hookaudit/policy.yaml` / `.hookaudit/policy.yml` / `policy.yaml` / `policy.yml`
3. `.hookaudit/policy.toml` / `policy.toml`

Choose one format — JSON is the most explicit, YAML/TOML are for teams that prefer them. All three are stdlib-only subset parsers (no `js-yaml`/`toml` package) — see `STDLIB.md` §12-13 and `LIMITATIONS.md` §2.

#### JSON (full)

```json
{
  "version": 1,
  "blockOn": ["CRITICAL", "HIGH"],
  "warnOn": ["MEDIUM", "WARN", "LOW"]
}
```

Values are strings — they can be `severity` (`CRITICAL|WARN|INFO`) or `risk` (`CRITICAL|HIGH|MEDIUM|LOW`). HookAudit checks each finding’s `severity`, `pathRisk`, `graph.paths[].risk`, and `summary.decision` (`bin/hookaudit.js: evaluatePolicy`).

#### YAML subset (`parseYamlPolicy` 140 lines)

Supports: mappings, block lists, inline arrays, `#` comments. Caps 64 KiB / 8-depth. Unsupported `!include`, `&*`, `[[array.tables]]`, `|` block scalars, tabs → `UNSUPPORTED_FORMAT` diagnostic, not crash.

```yaml
# .hookaudit/policy.yaml
version: 1
blockOn:
  - CRITICAL
  - HIGH
warnOn: ["MEDIUM", "WARN"]
# or inline:
# blockOn: [CRITICAL, HIGH]
```

#### TOML subset (`parseTomlPolicy` 120 lines)

Supports: tables, string arrays, scalars. Unsupported `[[array.tables]]`, `{inline}`, `"""` multiline → `UNSUPPORTED_FORMAT`.

```toml
# .hookaudit/policy.toml — or [policy] table form
version = 1
blockOn = ["CRITICAL", "HIGH"]
warnOn = ["MEDIUM"]

# Alternative table form:
# [policy]
# blockOn = ["CRITICAL"]
```

`defaults` nesting is also merged if top-level `blockOn` missing: `{ defaults: { blockOn: [...] } }`.

### 2. Verify it loads

```bash
mkdir -p .hookaudit
cat > .hookaudit/policy.json <<'JSON'
{ "version": 1, "blockOn": ["CRITICAL"], "warnOn": ["HIGH","MEDIUM"] }
JSON
node bin/hookaudit.js scan --path demo/sample-repository --json | jq '{decision: .summary.decision, policy: .policy, policyEval: .policyEval}'
```

Expected (if `demo/sample-repository` has `CRITICAL` → `BLOCK`):

```json
{
  "decision": "BLOCK",
  "policy": { "source": ".hookaudit/policy.json", "blockOn": ["CRITICAL"], "warnOn": ["HIGH","MEDIUM"] },
  "policyEval": { "decision": "BLOCK", "wouldBlock": true, "wouldReview": false, "reasons": ["path risk CRITICAL"] }
}
```

Human report also prints:

```text
Policy: BLOCK (blockOn: CRITICAL) — path risk CRITICAL / CRITICAL finding in .claude/settings.json
  Policy source: .hookaudit/policy.json
```

If you see `policy: null`, the file wasn’t found — check path and `64 KiB` limit.

### 3. Gate strictly or permissively

- **Stricter (also block on WARN):**

```json
{ "blockOn": ["CRITICAL","HIGH","WARN","MEDIUM"], "warnOn": [] }
# or just use --strict flag without a file: hookaudit . --strict exits 1 on WARN
```

- **Permissive (only CRITICAL blocks):**

```json
{ "blockOn": ["CRITICAL"], "warnOn": ["HIGH","MEDIUM"] }
```

- **Test the gate:**

```bash
# Permissive → malicious repo still BLOCKs (has CRITICAL)
node bin/hookaudit.js scan --path test/fixtures/malicious-repo --json | jq .summary.decision
# → BLOCK

# Strict → clean repo (2 WARN, no CRITICAL) now exits 1
node bin/hookaudit.js scan --path test/fixtures/clean-repo --json; echo $?
# → 0 (without --strict)
node bin/hookaudit.js scan --path test/fixtures/clean-repo --json --strict; echo $?
# → 1 (with --strict)
```

This is the same behavior tested via `policy layer: CLI with .hookaudit/policy.json influences decision to BLOCK when blockOn includes WARN` (p2-stretch).

### 4. Try YAML and TOML variants

```bash
cat > .hookaudit/policy.yaml <<'YAML'
blockOn:
  - CRITICAL
  - HIGH
YAML
node bin/hookaudit.js scan --path demo/sample-repository --json | jq .policy.source
# → ".hookaudit/policy.yaml"

cat > policy.toml <<'TOML'
blockOn = ["CRITICAL"]
TOML
node bin/hookaudit.js scan --path demo/sample-repository --json | jq .policy.source
# → "policy.toml" (after .hookaudit/*.yaml not found)

rm .hookaudit/policy.yaml .hookaudit/policy.json policy.toml
```

The loaders try `.hookaudit/policy.json` first, then `.hookaudit/policy.yaml`, then `policy.toml` etc. — first hit wins. Removed files fall back to defaults.

### 5. Handle unsupported syntax honestly

If you use an unsupported YAML feature (e.g., `!include`), HookAudit does not crash — it emits `UNSUPPORTED_FORMAT` diagnostic and tries the next candidate:

```bash
cat > .hookaudit/policy.yaml <<'YAML'
blockOn: !include other.yaml
YAML
node bin/hookaudit.js scan --path demo/sample-repository --json | jq .diagnostics
# → [{code:"UNSUPPORTED_FORMAT", path:".hookaudit/policy.yaml", detail:"unsupported YAML feature"}]
# Policy falls back to .hookaudit/policy.json or defaults
```

Fix by using supported subset: block lists ` - CRITICAL`, inline arrays `["CRITICAL"]`, `#` comments.

## Verification

```bash
cat .hookaudit/policy.json
node bin/hookaudit.js scan --path demo/sample-repository --json | jq .policyEval.decision
# → BLOCK or REVIEW or PASS per your blockOn/warnOn

# Confirm without file reverts to defaults
rm -rf .hookaudit
node bin/hookaudit.js scan --path demo/sample-repository --json | jq .policy
# → null (no policy file) — proceed gap of defaults; decision unchanged for this fixture but explicit policyEval absent
# Human report hides Policy line when no file
```

Keep policy file committed if you want PRs gated identically for all contributors; or keep it local if you want personal stricter review.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `policy.source` not as expected | Candidates are ordered — earlier wins. Remove earlier `.hookaudit/policy.json` to test `policy.yaml`. |
| `UNSUPPORTED_FORMAT` diagnostic | Use supported subset — see this doc + `LIMITATIONS.md` §2. Avoid `!include`, `&*`, `[[array.tables]]`, `|` block scalar, tabs. |
| Policy doesn’t change `decision` | Check that `blockOn` includes the actual `severity` or `pathRisk` value (`CRITICAL|HIGH|MEDIUM|LOW|WARN`). `policyEval.reasons` shows which finding triggered. |
| Want to block on `NEW_CAPABILITY` drift, not just risk | `policy` gates `risk/severity`, but `diff` exits `1` on any drift `NEW/CHANGED/REMOVED` irrespective of policy — use `hookaudit diff` as the gate for `NEW_CAPABILITY`. |

## Related

- `docs/reference-cli.md` — policy load order, evaluation, SARIF `policy` field
- `docs/reference-capabilities.md` — what `blockOn` values map to
- `demo/policy.yaml` / `demo/policy.toml` / `demo/policy.json` — working examples in this repo
