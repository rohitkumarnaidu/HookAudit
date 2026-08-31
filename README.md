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

`hookaudit` walks a project for eleven known auto-executing surfaces —
Claude Code hook/MCP config, VS Code tasks/settings, Cursor rules,
Gemini and Codex config, npm lifecycle scripts, git hooks, Husky
hooks, and pre-commit config — and scores each discovered command
against a small, documented rule set:

- Does it fire **automatically**, with no separate approval step
  (`SessionStart`, `folderOpen`, `preinstall`/`postinstall`, a raw git
  hook)?
- Does it reach out to the **network** (`curl`, `wget`, `fetch(...)`)?
- Does it look like it's **bootstrapping a runtime** (downloading
  `bun`/`node`/`python`) — the exact mechanism ChainDrop used to pull
  down Bun and run its payload?
- Does it **cross-reference another tool's directory** — the
  documented ChainDrop evasion trick?
- Does it contain **obfuscation** (long base64 blobs, `eval`,
  `Function`, `atob`)?

It also supports a **baseline / diff** workflow: run `hookaudit
baseline` once when you trust a repository's current state, then run
`hookaudit diff` on every subsequent pull or checkout to see exactly
what changed in any of these files — the direct, automated version of
"check for a `.claude/settings.json` you didn't add yourself."

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

9 tests in `test/hookaudit.test.js` (Day-1 hardening adds 4 planned:
never-execute, boundary traversal, determinism, strict mode — see
`INVESTIGATION_REPORT.md`), run as black-box subprocess tests
against the actual CLI (via `node:test` + `node:child_process`):
clean-repo has no CRITICAL findings; the malicious-pattern fixture
does; the cross-reference rule fires; the runtime-bootstrap rule
fires; obfuscation is flagged; baseline/diff correctly reports no
drift on an unchanged repo and correctly reports `CHANGED` when a
tracked file is modified; malformed JSON is reported as a parse error
rather than crashing the scanner; `node_modules` is never walked.
Output is POSIX-normalized and deterministically sorted so Windows
and Linux produce byte-identical JSON.

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

- **Working tree only, not all branches.** The rules explicitly
  disallow shelling out to the `git` binary as a hidden runtime
  dependency, so we do not invoke `git`. ChainDrop-style attacks
  specifically targeted branches other than `main`. A "should have"
  feature (not in this build) is a git-native branch walker: read
  `.git/refs/heads/*` and `.git/packed-refs` directly, then inflate
  loose objects via `node:zlib` to read each branch's tree without
  ever running `git` — legal under the rules because it only reads
  `.git`'s on-disk format, using the stdlib, and never invokes an
  external binary.
- **No TOML/YAML structural parsing.** `.codex/config.toml` and
  `.pre-commit-config.yaml` are scanned as raw text with the same rule
  engine as everything else, not structurally parsed. Node's stdlib
  has no TOML or YAML reader (confirmed against the hackathon's own
  cheat-sheet), and a correct hand-rolled parser for either was out of
  scope for this build. This means a hook hidden inside an unusual
  TOML multiline-string layout could be missed by field-level
  extraction, though the whole-file text sweep still runs on it.
- **Heuristic, not exhaustive.** This is a tripwire, not a guarantee.
  A sufficiently patient attacker who avoids every one of our five
  signals (no network call, no runtime download, no cross-reference,
  no obfuscation, and accepts the WARN-level "it auto-fires" flag
  alone) would not be scored CRITICAL. The baseline/diff workflow is
  the real safety net: *any* change to a tracked hook file is
  reported regardless of whether the heuristics score it as
  dangerous.
- **Not a sandbox.** `hookaudit` reads files; it never executes a
  discovered hook to observe its behavior. That's intentional — a
  static scanner should not run the thing it's inspecting.

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
