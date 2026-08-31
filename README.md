# hookaudit

A zero-dependency local scanner for **auto-executing AI-agent, editor,
and package-lifecycle hooks** — the class of files that silently run
commands the moment you open a repository or install its dependencies.

Track: **E — Security & Crypto Utilities** ("local security scanner" /
"file integrity tooling").

## The problem

On August 4, 2026, the ChainDrop worm compromised the maintainer
account behind the `keyv` npm package family (over two billion monthly
installs across `keyv`, `flat-cache`, `cache-manager`, and related
packages) and, beyond the usual `npm install`-time payload, committed
two files into every branch it could reach: `.claude/settings.json`
with a `SessionStart` hook, and `.vscode/tasks.json` with a task set
to run on `folderOpen`. Each hook pointed at a dropper script sitting
in *the other tool's* directory — a "cross-linking" trick meant to
make either file look, on a casual read, like it belongs to a
different tool. The result: cloning the repository and simply opening
it in Claude Code or VS Code was enough to run the payload. No
`npm install`, no build step, no explicit "run this" action.

Security press covering the incident noted directly that "this
approach falls outside the view of many dependency scanners. Those
products commonly examine manifests and lockfiles to identify
downloaded packages, not project settings that describe editor tasks
or AI coding-tool behavior." Incident responders' concrete advice
afterward was to manually check `.claude/settings.json` and
`.vscode/tasks.json` for hooks you didn't add yourself, across every
branch, not just `main`.

That's a real, repeatable, manual workflow today. `hookaudit` turns it
into a one-command scan you can run on every clone, every pull, and
in CI.

## What it does

`hookaudit` is a **repository execution-topology auditor** answering *What can this repo cause to execute, through which trigger, with which reachable capabilities, and what changed since I trusted it?* Pipeline `DISCOVER → NORMALIZE → RESOLVE → GRAPH → INFER → EXPLAIN → BASELINE → DIFF` — the graph is the central product asset.

It walks a project for eleven known auto-executing surfaces — Claude Code hook/MCP config, VS Code tasks/settings, Cursor rules, Gemini and Codex config, npm lifecycle scripts, git hooks, Husky hooks, and pre-commit config — and:

1. **Normalizes** each surface to `ExecutionSurface {id, sourcePath, surfaceType, triggerType, command: CommandSpec{raw, executable, args, shell, references}, capabilities, evidence, confidence}` with field-accurate evidence (`hooks.SessionStart[0].hooks[0].command`).

2. **Resolves references** statically: `config → script → script → helper` including cross-tool links, with repository boundary checks (`resolveInsideRepository`), symlink safety (`lstat`), cycle detection (`CYCLE_DETECTED`), depth limit `32` (`DEPTH_LIMIT_REACHED`), and dynamic handling (`DYNAMIC_EXECUTION`, `UNRESOLVED_REFERENCE`, `PARTIALLY_RESOLVED`) — never executing target code.

3. **Materializes an execution graph**: nodes `REPOSITORY/CONFIG/TRIGGER/COMMAND/SCRIPT/FILE/PROCESS/NETWORK/CAPABILITY` and edges `CONTAINS/TRIGGERS/EXECUTES/REFERENCES/CONNECTS_TO` with evidence per edge, plus deterministic `ExecutionPath[]` showing full trigger→command→script chains.

4. **Infers structured capabilities** (not just reason strings): `PROCESS_EXECUTION`, `NETWORK_ACCESS`, `REMOTE_DOWNLOAD`, `RUNTIME_BOOTSTRAP`, `ENVIRONMENT_ACCESS`, `CREDENTIAL_ACCESS_SIGNAL`, `FILE_READ/FILE_WRITE`, `OBFUSCATION`, `DYNAMIC_EXECUTION`, `CROSS_TOOL_LINK` — detectors are reusable evidence producers.

5. **Scores unified path risk** (deterministic, rule-based, transparent, cross-ecosystem): `automatic + network + process → HIGH`, `automatic + remote-download + process + obfuscation → CRITICAL`, with separate `confidence` (`HIGH` literal, `MEDIUM` resolved, `LOW` dynamic). Never `MALWARE DETECTED`; outputs `HIGH-RISK EXECUTION PATH` plus `why + evidence + capabilities + confidence + recommendation`.

6. **Supports trust-on-first-use baseline/diff**: `hookaudit baseline` writes `.hookaudit/baseline.json` (`schemaVersion:2`, `files:{path:sha256}`, `surfaces`, `capabilitySummary`, `graphSummary`); `hookaudit diff` reports `NEW/CHANGED/REMOVED` plus semantic `NEW_TRIGGER/CHANGED_COMMAND/NEW_CAPABILITY` and `NEW_REFERENCE` where resolvable.

Safety guards: `MAX_FILE_SIZE=1MiB → FILE_TOO_LARGE`, binary heuristic → `BINARY_SKIPPED`, `lstat` symlink policy → `SYMLINK_SKIPPED`/`BOUNDARY_VIOLATION`, repository boundary helper central, visited/depth guards.

Heuristic signals (still additive, now mapped to capabilities):
- `network-fetch` → `NETWORK_ACCESS` (`curl|wget|Invoke-WebRequest|fetch("https:`)
- `runtime-bootstrap` → `RUNTIME_BOOTSTRAP+REMOTE_DOWNLOAD` (`bun|node|python + install|download`)
- `obfuscation` → `OBFUSCATION+DYNAMIC_EXECUTION` (200-char base64, `eval`, `new Function`, `atob`)
- `process-exec` → `PROCESS_EXECUTION` (`node|python|bash|sh|pwsh|spawn|exec`)
- `cross-reference` → `CROSS_TOOL_LINK` (`.claude/` vs `.vscode/` etc.)
- `remote-download` → `REMOTE_DOWNLOAD+NETWORK_ACCESS` (`curl … | bash`)
- `env-access` → `ENVIRONMENT_ACCESS`, `credential-signal` → `CREDENTIAL_ACCESS_SIGNAL`

## Build

No build step. It's a single Node.js file with zero runtime
dependencies.

```
git clone <this repo>
cd hookaudit
node bin/hookaudit.js --help
```

Optional, to install it as a `hookaudit` command on your `PATH`:

```
npm link
```

Requires Node.js ≥ 24.0.0 (tested on v24.19.0 LTS; Node 20 reached EOL
2026-04-30 per hackathon rules — see `package.json` engines). The tool
itself only needs `node:fs`, `node:path`, `node:crypto`, `node:util`,
all stable since Node 14–18.

## Run

```
hookaudit .                          # scan current directory (human)
hookaudit . --json                   # machine-readable, for CI
hookaudit . --strict                 # also fail on WARN (stricter CI gate)
hookaudit scan --path ../some-repo   # explicit flag form (equivalent)
hookaudit baseline .                 # record current state as trusted
hookaudit diff .                     # scan + compare against baseline
```

All path arguments are POSIX-normalized and deterministically ordered
for cross-platform reproducible output.

Exit codes: `0` = no policy violation; `1` = CRITICAL (or WARN with
`--strict`) or drift was detected — safe to use as a CI gate or a
pre-`git pull` hook; `2` = usage / path error.

### Try it on the included fixtures

```
node bin/hookaudit.js scan --path test/fixtures/clean-repo
node bin/hookaudit.js scan --path test/fixtures/malicious-repo
```

The second one reproduces (with inert, synthetic placeholder commands
— no working payload) the exact structural pattern ChainDrop used:
a `SessionStart` hook in `.claude/settings.json` pointing into
`.vscode/`, and a `folderOpen` task in `.vscode/tasks.json` pointing
back into `.claude/`, downloading a runtime over the network. It's
flagged CRITICAL on both files.

## Tests

```
npm test
```

22 tests in `test/hookaudit.test.js`, run as black-box subprocess tests via `node:test` + `node:child_process` against the actual CLI:

- clean-repo has no CRITICAL (exit 0), malicious-pattern is CRITICAL (exit 1), cross-reference and runtime-bootstrap fire, obfuscation flagged, `node_modules` never walked, malformed JSON → `parseError` diagnostic not crash
- baseline/diff: no drift on unchanged, `CHANGED` on modified, `NEW_CAPABILITY` semantic diff (`NETWORK_ACCESS` after `curl` edit)
- **Safety:** never-execute marker never created, boundary `../` and absolute outside → `BOUNDARY_VIOLATION` no outside read, `FILE_TOO_LARGE` (>1MiB) and `BINARY_SKIPPED` (null-byte) guards, `SYMLINK_SKIPPED` on symlink outside, `PERMISSION_DENIED` handling
- **Graph:** multi-hop `config → script A → script B → network` yields connected path with `NETWORK_ACCESS`, cycle `A→B→C→A` → `CYCLE_DETECTED` and terminates, dynamic `process.env` → `DYNAMIC_EXECUTION` `LOW` confidence, depth limit `32`
- **Contracts:** determinism `scan#1 === scan#2` on same repo (POSIX, sorted), strict mode `hookaudit . --strict` gates `WARN`, positional `hookaudit .` ≡ `hookaudit scan --path`, human report prioritizes high-risk paths, JSON `v1` with `summary/paths/graph/diagnostics` plus backward-compat `results/diff`

All output is POSIX-normalized and deterministically sorted (Windows/Linux byte-identical JSON). Graphs are deterministic (`nodes/edges/paths` sorted).

See `SECURITY.md` and `LIMITATIONS.md` for the full threat model and
honest limitation disclosure.

## Design decisions

- **JSON-first extraction, not regex-only.** For `.claude/settings.json`,
  `.vscode/tasks.json`, `.mcp.json`, and `package.json`, we parse the
  actual JSON structure and pull out the specific command string a
  tool would execute (e.g. the `command` field inside a
  `hooks.SessionStart[].hooks[]` entry), rather than regex-scanning
  the whole file. This is what lets us know *which trigger* fired and
  keeps the cross-reference and obfuscation checks precise. We also
  run a whole-file text sweep as a defense-in-depth fallback for
  fields our structural extractor doesn't yet know about, but suppress
  it whenever a more specific finding already covers the same file so
  the report stays signal-dense rather than noisy.
- **Trust-on-first-use, not a signature database.** We deliberately did
  not ship a list of "known bad" package hashes — IOC lists go stale
  within days and give false confidence. The baseline/diff model
  instead answers the question that actually matters on every pull:
  *did anything in this file change since I last looked at it?*
- **Severity is additive, not a black box.** Every finding carries the
  literal list of reasons that produced its score, in the same
  sentence a human reviewer would use. No ML, no fixed "trust level"
  categories — a judge (or a developer) can read the ~20 lines of
  `RULES` and know exactly what will and won't fire.

## Limitations (said plainly, per the hackathon's honesty rule)

- **Working tree only, not all branches.** We do not invoke `git` (hidden runtime dep forbidden). ChainDrop targeted branches other than `main`. A stretch is a git-native walker reading `.git/refs/heads/*` + `.git/packed-refs` via `node:zlib` — not in this build.
- **No TOML/YAML structural parsing.** `.codex/config.toml` and `.pre-commit-config.yaml` are raw-text heuristic scans, not TOML/YAML ASTs (Node has no stdlib TOML/YAML reader). A hook hidden in unusual multiline-string layout could be missed by field extraction, though whole-file sweep still catches blunt `curl`/`eval`.
- **No full shell/language AST.** Commands are `CommandSpec{raw, executable, args, shell, references}` via light tokenization, not a full shell parser. Variable-constructed paths like `process.env.X + "/setup.sh"` correctly become `DYNAMIC_EXECUTION`/`UNRESOLVED_REFERENCE` `LOW` confidence rather than guessed.
- **Graph is bounded static analysis.** Resolver follows `config → script → script` with `MAX_GRAPH_DEPTH=32`, cycle and boundary guards, and `lstat` symlink checks. It never executes, never builds a full interpreter, and reports `DYNAMIC_EXECUTION`/`UNRESOLVED_REFERENCE`/`CYCLE_DETECTED`/`DEPTH_LIMIT_REACHED` where static interpretation is incomplete. A chain that dynamically constructs its next hop at runtime will be `LOW` confidence.
- **Heuristic, not exhaustive.** Tripwire requiring specific signals. An attacker avoiding all signals (no network, no runtime download, no cross-reference, no obfuscation, accepting `WARN` auto-trigger alone) would not be `CRITICAL`. Baseline/diff is the real safety net: *any* change to a tracked file is `CHANGED`/`NEW`/`REMOVED` plus `NEW_CAPABILITY` where detectable.
- **Not a sandbox.** Reads files only; never executes hooks. `hookaudit diff` on every pull/checkout is the workflow: any new trigger/command/capability is worth review even if heuristics score low.

## Threat model

**In scope:** a developer cloning or pulling a repository they do not
fully trust (an open-source dependency, a contributor's fork, a
take-home assignment, a CTF-style hackathon submission) who wants to
know, before opening it in an AI agent or editor, whether that repo
contains a hook that will run automatically.

**Out of scope:** an attacker with an existing foothold on the
developer's machine (this tool doesn't defend against a compromised
`node` binary or a compromised OS); supply-chain compromise via a
package's *code* rather than its *lifecycle/hook configuration*
(that's what SBOM/CVE scanners are for, and we don't try to replace
them); zero-day vulnerabilities in Claude Code, VS Code, or any other
agent/editor itself.

**Failure modes:** false negatives (see Limitations above) are more
likely than false positives, because every rule requires a specific,
named signal to fire — we chose to under-flag rather than train users
to ignore a noisy tool.
