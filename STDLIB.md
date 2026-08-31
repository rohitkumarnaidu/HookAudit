# STDLIB.md

What we would normally reach for, what we used instead, and why. All
replacements below are used in `bin/hookaudit.js`; none are hypothetical.

| # | Normally you'd install | Instead we used | Why |
|---|---|---|---|
| 1 | `minimist` / `yargs` / `commander` (80.5M+/wk combined) | `node:util` → `parseArgs()` | Stable since Node v18.3. Handles our subcommand + boolean/string flag needs (`scan`, `baseline`, `diff`, `--json`, `--path`) without a parser dependency. Limitation (documented honestly): no built-in subcommand routing or type coercion beyond string/boolean — we route subcommands ourselves via `positionals[0]`. |
| 2 | `chalk` (319.8M/wk) | `node:util` → `styleText()` | Stable Node built-in terminal styling. Automatically respects `NO_COLOR` and non-TTY output, which chalk requires extra config for. |
| 3 | `glob` / `fast-glob` | Hand-written `listFilesRecursive()` over `node:fs.readdirSync` | We only need a small, fixed set of known relative paths (12 surfaces), not general glob syntax, so a ~15-line recursive walker is more auditable than a glob engine and has zero edge-case surprises. |
| 4 | `ignore` (gitignore-pattern matcher) | Hard-coded `IGNORED_DIRS` set (`node_modules`, `.git`, `dist`, `build`, `.hookaudit`) | **Honest limitation**: this is not a full `.gitignore` parser. We do not need general ignore semantics — we need to never walk `node_modules` or bulk-walk `.git` — so a fixed deny-list is correct for this project's scope and avoids a real parsing project we don't have time for. If we ship a v2, this is the first thing we'd properly implement (see README "Limitations"). |
| 5 | `js-sha256` / `crypto-js` | `node:crypto` → `createHash('sha256')` | We fingerprint every scanned file for the baseline/diff (trust-on-first-use) model. This is composing a trusted, audited primitive — not writing our own hash function, per the Track E rule against inventing cryptography. |
| 6 | `uuid` | `node:crypto` → `randomUUID()` | Stable since Node v14.17/v16. Used to stamp each baseline with a unique id for audit trails. |
| 7 | `mocha` / `jest` / `ava` | `node:test` + `node:assert/strict` | Node's built-in test runner (stable since v20) gave us subtests, TAP output, and `--test` file targeting with zero setup. All 87 tests run on it (22 core + 49 demo/policy/parity + 16 P2 stretch: SARIF/HTML/shell/GitHub/YAML/TOML/git-branches). |
| 8 | `cli-table3` / `table` | Hand-written column/severity formatter in `printHuman()` | Our report only needs three columns (severity, trigger, reason) and colour, not general table layout — writing it directly kept the whole CLI in one auditable file. |
| 9 | `deep-diff` / `jsdiff` | Hand-written structural diff in `diffAgainstBaseline()` | We only ever diff two flat `{path: sha256}` maps (NEW / CHANGED / REMOVED), which is a ~10-line `Object.entries` loop — a generic diff library would be solving a much bigger problem than we have. |
| 10 | `dotenv` | *(not needed)* — noted here because it's the canonical "you don't need a package for this" example; if we add config-file support later, `process.loadEnvFile()` (stable since Node v20.6) is the stdlib answer. | N/A |
| 11 | `execa` / `child_process` wrapper libraries | `node:child_process` → `execFileSync` (test suite only, to invoke the CLI as a subprocess) | Only used in `test/hookaudit.test.js` to black-box test the actual CLI the way a user runs it, not to shell out from the tool itself at runtime. |
| 12 | `toml` / `@iarna/toml` (for `.codex/config.toml`) | **Subset implemented for policy + heuristic scan for surfaces** — `.codex/config.toml` still heuristic raw-text; policy TOML (`policy.toml`) parsed via 120-line `parseTomlPolicy()` using `node:fs` string ops (tables, string arrays, scalars) with 64 KiB/8-depth caps, no `yaml` package. | For surfaces we keep heuristic (no full TOML AST needed); for policy we support `blockOn = ["CRITICAL","HIGH"]` subset honestly documented (see `LIMITATIONS.md`). |
| 13 | `yaml` / `js-yaml` (for `.github/workflows` + policy) | **Heuristic + minimal policy parser** — workflows scanned via `run:` regex (no yaml AST); policy YAML via 140-line `parseYamlPolicy()` (mappings, block lists `- CRITICAL`, inline arrays, `#` comments) with caps, no `js-yaml`. | Workflows: triggers `push/pull_request/schedule` as auto via regex window; policy supports `blockOn: - CRITICAL` subset. Full AST deferred — documented `LIMITATIONS.md`. |
| 14 | `sarif` / `sarif-builder` | `JSON.stringify` + custom `generateSarif()` → SARIF 2.1.0 via stdlib only | Deterministic rule IDs `HOOKAUDIT.<capability>` + `HOOKAUDIT.<DIAGNOSTIC>`, level mapping `error/warning/note`, fingerprint `sha256(file:field:command:cap).slice(0,16)`, no external validator needed (internal structural tests). |
| 15 | `handlebars` / `ejs` / HTML templating | `generateHtmlReport()` string template + `escapeHtml()` via `replace(/[&<>"]/g)` | Self-contained `file://` report, inline CSS/JS, no CDN, safe `textContent`-equivalent escaping, deterministic layout. |
| 16 | `simple-git` / `isomorphic-git` | `node:zlib` → `inflateSync` + `node:fs` `readFileSync` on `.git/objects`, `HEAD`, `refs/heads`, `packed-refs` | Local branch walker without `git` exec — `discoverBranches`, `inflateGitObject`, `parseCommit/parseTree` with 5 MiB/64-depth/4096-entry caps, bounded traversal pruned by `isSurfaceRelevant()`. |
| 17 | `shell-quote` / `shell-parser` | `parseCommandSpec()` enhanced: single/double quotes, escaped spaces, `shell` detection `[|&;`$<>]` | Still bounded — no `$(...)` expansion, dynamic → `DYNAMIC_EXECUTION` LOW, chains `bash a.sh && bash b.sh` both extracted via global regex. |
| 18 | `ignore` extension for `.github` | Extended `resolveSurfaceFiles` + `scanVirtualFile` for `.github/workflows` via `.ya?ml` filter | Reuses existing `IGNORED_DIRS` + `MAX_FILE_SIZE`/`BINARY_CHECK` guards. |

## What we did *not* build (by design)

- **No cipher, no crypto primitive of our own.** The only cryptographic
  operation in this project is SHA-256 file hashing via `node:crypto`,
  used purely for change detection, never for confidentiality or
  authentication claims.
- **No shelling out to `git` for normal scan.** The rules explicitly disallow hidden runtime dependencies. Normal `scan`/`diff` still scans working tree only. **New:** `hookaudit branches` reads `.git` directly via `node:zlib` + `node:fs` without `git` exec — see `docs/demo/README.md` § branches.
