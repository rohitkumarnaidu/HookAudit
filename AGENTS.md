# AGENTS.md — HookAudit

## Stack & Entry Points
- Single-file CLI `bin/hookaudit.js` (~2357 lines, SHA `A3C45D8…2829B`) is the only runtime artifact. No build step. `package.json:6` `bin.hookaudit → ./bin/hookaudit.js`.
- Node.js **≥24.0.0** (tested `v24.19.0` LTS; Node 20 is EOL). Built-ins only: `node:fs`, `node:path`, `node:crypto`, `node:util`, plus `node:zlib` try-require for `branches`. See `SECURITY.md:2` and `STDLIB.md`.
- Browser demo is `index.html` + `demo/engine.js` + `demo/demo.js` + `demo/demo.css` — a static adapter over 5 inert fixtures. Not the scanner. Real scans run via `node bin/hookaudit.js`. Demo works `file://` or GH Pages `main/root`. See `demo/README.md`.

## Commands (use these exactly)
```bash
node bin/hookaudit.js --help
node bin/hookaudit.js .                          # human scan of cwd
node bin/hookaudit.js . --json                   # or: scan --path <dir> --json
node bin/hookaudit.js . --sarif
node bin/hookaudit.js . --html report.html       # self-contained, no CDN
node bin/hookaudit.js . --strict                 # also fail on WARN
node bin/hookaudit.js baseline .                 # writes .hookaudit/baseline.json (schemaVersion 2)
node bin/hookaudit.js diff .                     # drift: NEW/CHANGED/REMOVED + NEW_CAPABILITY
node bin/hookaudit.js branches . --json          # local .git read via node:zlib, no git exec

npm test                                         # all 87 tests (~2s) — the correct command
node --test test/hookaudit.test.js               # 22 core tests
node --test test/demo.test.js                    # 49 demo/policy/parity
node --test test/p2-stretch.test.js              # 16 SARIF/HTML/shell/YAML/TOML/branches
node --test --test-name-pattern="multi-hop"      # single test by name substring
```
- `Makefile` `make test` only runs `hookaudit.test.js` (22/87) — stale comment, prefer `npm test`.
- `npm link` installs global `hookaudit` but is optional — `node bin/hookaudit.js` is canonical for agents.

## Architecture (read this before editing `bin/hookaudit.js`)
- Pipeline: `DISCOVER → NORMALIZE → RESOLVE → GRAPH → INFER → EXPLAIN → BASELINE → DIFF` — the **execution graph is the central artifact** (`RULES.md:8`).
- 12 surfaces in `bin/hookaudit.js:63` `SURFACES` (Claude/MCP/VS Code×2/Cursor/Gemini/Codex/npm/Husky/git-hooks/pre-commit/GitHub Actions). Adapters normalize to `findings[]` then `resolveExecutionGraph()` (`bin/hookaudit.js:732`) builds `REPOSITORY/CONFIG/TRIGGER/COMMAND/SCRIPT/FILE/CAPABILITY` nodes + `CONTAINS/TRIGGERS/EXECUTES/REFERENCES/CONNECTS_TO` edges + deterministic `ExecutionPath[]`.
- 11 capabilities enum `bin/hookaudit.js:45` + `RULES` detectors at `bin/hookaudit.js:85` map to `PROCESS_EXECUTION/NETWORK_ACCESS/REMOTE_DOWNLOAD/RUNTIME_BOOTSTRAP/…/DYNAMIC_EXECUTION/CROSS_TOOL_LINK`. Risk is unified path-based (`bin/hookaudit.js:496` `computePathRisk`): `auto+network+process→HIGH`, `auto+remote+process+obfuscation→CRITICAL`, etc. Confidence (`HIGH` literal / `MEDIUM` resolved / `LOW` dynamic) is separate from risk.
- `IGNORED_DIRS = {node_modules, .git, dist, build, .hookaudit}` — never bulk-walked. `.git/hooks` scanned separately, `*.sample` ignored. `MAX_FILE_SIZE=1MiB`, `MAX_GRAPH_DEPTH=32`, `.git` objects bounded `5MiB/64-depth/4096-entry`.

## Non-Negotiables (from `RULES.md` + `SECURITY.md`)
- **Never execute target code.** Allowed: `read/parse/hash/match/resolve/graph/report`. Forbidden: `execute/require/import/npm install/spawn/fetch`. Verify via `deps-proof.txt` and never add runtime `child_process`/`vm`/`fetch`/`https` to `bin/hookaudit.js` (tests use `execFileSync` to black-box the CLI — scanner itself must not).
- **Zero runtime deps.** `package.json` `dependencies:{}` + `devDependencies:{}` must stay empty (`npm ls --all → (empty)`). All `require()` must be `node:`-prefixed. Adding a dependency is a stop condition (`RULES.md:39`).
- **Boundary enforcement.** All path resolution via `resolveInsideRepository(root, candidate)` (`bin/hookaudit.js:176`) — rejects `../`, absolute, UNC, symlink/junction escapes as `BOUNDARY_VIOLATION`/`SYMLINK_SKIPPED`/`DYNAMIC_EXECUTION`. Check with `lstatSync` not `statSync`. `CYCLE_DETECTED`/`DEPTH_LIMIT_REACHED` preserve partial graph.
- **Evidence + language.** Every `HIGH`/`CRITICAL` must carry `path/field/detector/reason/excerpt`. Never output `MALWARE DETECTED`; use `HIGH-RISK EXECUTION PATH` + `why + evidence + capabilities + confidence` (`RULES.md:16`). Prefer `No high-risk execution paths detected in supported/analyzed surfaces.`
- **Determinism.** All outputs POSIX-normalized (`toPosix()` at `bin/hookaudit.js:159`) and lexicographically sorted — `Windows \ → /` portability is load-bearing. Do not break sorting/normalization.

## Testing Quirks
- Tests shell-out via `execFileSync('node', [BIN, ...args])` — they test the real CLI, not an imported function. Changing CLI arg parsing (`parseArgs` at `bin/hookaudit.js:18`) must keep both forms: `hookaudit . --json` **and** `scan --path <dir> --json` (parity test at `test/hookaudit.test.js:281`).
- Canonical fixtures: `test/fixtures/clean-repo` (0 CRITICAL) vs `malicious-repo` (CRITICAL cross-link + runtime-bootstrap) vs `github-actions-repo` (`on:push`+`run:`) vs `demo/sample-repository` (BLOCK, multi-hop `bootstrap.mjs→helper.sh→network`). Demo↔CLI parity enforced in `test/demo.test.js:491`.
- Key black-box invariants to not regress: `never-execute` marker, `BOUNDARY_VIOLATION` no-leak, `FILE_TOO_LARGE`/`BINARY_SKIPPED`/`SYMLINK_SKIPPED` diagnostics, `CYCLE_DETECTED`, `DYNAMIC_EXECUTION LOW`, determinism `scan#1===scan#2`, strict gating, `NEW_CAPABILITY NETWORK_ACCESS`.
- Old baselines with `\` keys (pre-fix) are invalid — regenerate via `rm -rf .hookaudit && node bin/hookaudit.js baseline .`.

## Docs & Update Discipline
- Rulebook authority: `RULES.md` (48 sections, operational), `SECURITY.md` (threat model + boundary), `LIMITATIONS.md` (honest gaps: heuristic shell/YAML/TOML, working-tree + local branches only), `STDLIB.md` (18 stdlib substitutions — update on any built-in change), `docs/README.md` (Diataxis map). Keep them consistent; prose defers to `bin/hookaudit.js` + `npm test` when in conflict.
- `demo/policy.json` / `policy.yaml` / `policy.toml` are subset parsers (`blockOn/warnOn`, caps 64KiB/8-depth) — unsupported syntax → `UNSUPPORTED_FORMAT` diagnostic, not crash.

## Pre-Change / Post-Change Checklist
- Pre: `git status`, read `bin/hookaudit.js` section you touch + `RULES.md` § for that area.
- Post: `npm test` (87/87), `node bin/hookaudit.js scan --path test/fixtures/malicious-repo --json` flags CRITICAL, `--sarif --path demo/sample-repository` valid SARIF 2.1.0, `grep -c "require(" bin/hookaudit.js` == 5 all `node:`, `npm ls --all` empty, paths in JSON contain only `/`.
