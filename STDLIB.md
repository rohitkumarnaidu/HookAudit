# STDLIB.md

What we would normally reach for, what we used instead, and why. All
replacements below are used in `bin/hookaudit.js`; none are hypothetical.

| # | Normally you'd install | Instead we used | Why |
|---|---|---|---|
| 1 | `minimist` / `yargs` / `commander` (80.5M+/wk combined) | `node:util` → `parseArgs()` | Stable since Node v18.3. Handles our subcommand + boolean/string flag needs (`scan`, `baseline`, `diff`, `--json`, `--path`) without a parser dependency. Limitation (documented honestly): no built-in subcommand routing or type coercion beyond string/boolean — we route subcommands ourselves via `positionals[0]`. |
| 2 | `chalk` (319.8M/wk) | `node:util` → `styleText()` | Stable Node built-in terminal styling. Automatically respects `NO_COLOR` and non-TTY output, which chalk requires extra config for. |
| 3 | `glob` / `fast-glob` | Hand-written `listFilesRecursive()` over `node:fs.readdirSync` | We only need a small, fixed set of known relative paths (11 surfaces), not general glob syntax, so a ~15-line recursive walker is more auditable than a glob engine and has zero edge-case surprises. |
| 4 | `ignore` (gitignore-pattern matcher) | Hard-coded `IGNORED_DIRS` set (`node_modules`, `.git`, `dist`, `build`, `.hookaudit`) | **Honest limitation**: this is not a full `.gitignore` parser. We do not need general ignore semantics — we need to never walk `node_modules` or bulk-walk `.git` — so a fixed deny-list is correct for this project's scope and avoids a real parsing project we don't have time for. If we ship a v2, this is the first thing we'd properly implement (see README "Limitations"). |
| 5 | `js-sha256` / `crypto-js` | `node:crypto` → `createHash('sha256')` | We fingerprint every scanned file for the baseline/diff (trust-on-first-use) model. This is composing a trusted, audited primitive — not writing our own hash function, per the Track E rule against inventing cryptography. |
| 6 | `uuid` | `node:crypto` → `randomUUID()` | Stable since Node v14.17/v16. Used to stamp each baseline with a unique id for audit trails. |
| 7 | `mocha` / `jest` / `ava` | `node:test` + `node:assert/strict` | Node's built-in test runner (stable since v20) gave us subtests, TAP output, and `--test` file targeting with zero setup. All 22 of our tests run on it (9 original + 13 safety/graph). |
| 8 | `cli-table3` / `table` | Hand-written column/severity formatter in `printHuman()` | Our report only needs three columns (severity, trigger, reason) and colour, not general table layout — writing it directly kept the whole CLI in one auditable file. |
| 9 | `deep-diff` / `jsdiff` | Hand-written structural diff in `diffAgainstBaseline()` | We only ever diff two flat `{path: sha256}` maps (NEW / CHANGED / REMOVED), which is a ~10-line `Object.entries` loop — a generic diff library would be solving a much bigger problem than we have. |
| 10 | `dotenv` | *(not needed)* — noted here because it's the canonical "you don't need a package for this" example; if we add config-file support later, `process.loadEnvFile()` (stable since Node v20.6) is the stdlib answer. | N/A |
| 11 | `execa` / `child_process` wrapper libraries | `node:child_process` → `execFileSync` (test suite only, to invoke the CLI as a subprocess) | Only used in `test/hookaudit.test.js` to black-box test the actual CLI the way a user runs it, not to shell out from the tool itself at runtime. |
| 12 | `toml` / `@iarna/toml` (for `.codex/config.toml`) | **Not implemented** — `.codex/config.toml` is currently scanned as raw text via the same rule engine as our other text surfaces, not structurally parsed. | **Honest limitation**: Node's stdlib has no TOML reader (confirmed against the hackathon's own cheat-sheet). A structural parse would let us extract exact command fields the way we do for JSON surfaces; raw-text regex scanning is strictly weaker and can miss a hook whose dangerous content is split across TOML's multiline string syntax. This is the top item on our "should have" list if more time is available — see README. |

## What we did *not* build (by design)

- **No cipher, no crypto primitive of our own.** The only cryptographic
  operation in this project is SHA-256 file hashing via `node:crypto`,
  used purely for change detection, never for confidentiality or
  authentication claims.
- **No shelling out to `git`.** The rules explicitly disallow hidden
  runtime dependencies on separately installed tools. We do not invoke
  the `git` binary anywhere. Consequence (documented limitation): the
  MVP scans the *currently checked-out* working tree only, not every
  local branch. See README "Limitations" for what a git-native
  (zlib-based, no-subprocess) multi-branch walker would require.
