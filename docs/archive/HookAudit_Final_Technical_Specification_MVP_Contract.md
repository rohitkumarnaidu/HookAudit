# HookAudit — Final Technical Specification & MVP Contract

## Zero Dependency 72-Hour Hackathon 2026

**Document status:** Implementation baseline  
**Product:** HookAudit  
**Category:** Repository Execution-Surface Auditor  
**Primary implementation:** Node.js + standard library only  
**Primary goal:** Build a deterministic local analyzer that exposes repository-controlled execution paths before those paths become trusted or executed.

---

# 0. Executive Decision

## Product

**HookAudit**

## Product category

**Repository Execution-Surface Auditor**

## Core question

> What can this repository cause to execute automatically, through which trigger, with which reachable capabilities, and what changed since I trusted it?

## Product promise

HookAudit statically discovers repository-controlled execution surfaces, resolves the execution relationships it can safely resolve, constructs an execution graph, infers reachable capabilities, assigns transparent path-based risk, and tracks changes to the execution surface with a trusted baseline.

## Core product sentence

> **HookAudit turns hidden repository automation into an explicit, reviewable execution graph.**

## Primary workflow

```text
Unfamiliar repository
        ↓
Do not install/execute target
        ↓
hookaudit .
        ↓
Execution surfaces
        ↓
Execution paths
        ↓
Reachable capabilities
        ↓
Risk + evidence
        ↓
TRUST / REVIEW / REMOVE / BLOCK
```

## Secondary workflow

```text
Known/trusted repository
        ↓
hookaudit baseline .
        ↓
Trusted execution snapshot
        ↓
Repository changes
        ↓
hookaudit diff .
        ↓
New / changed / removed execution surfaces
        ↓
Review
```

---

# 1. Source-of-Truth Hierarchy

This implementation contract is derived from the consolidated HookAudit research and its preceding specification/research materials.

The latest consolidated research defines the core thesis as a **repository execution-topology auditor**, not a generic hook scanner, and identifies the defensible wedge as repository-wide execution topology, cross-tool relationships, reference resolution, capability reachability, path-based risk, baseline/diff, and zero third-party runtime dependencies. fileciteturn11file0L10-L35

The current research recommends:

```text
Execution graph quality
>
Number of integrations
```

and recommends primary focus on Claude Code, VS Code, Cursor, with npm lifecycle and selected development-hook support through adapters. fileciteturn11file1L142-L187

The research's implementation gate requires:

- target repository never executed,
- zero third-party runtime dependencies,
- repository boundaries enforced,
- evidence retained,
- explainable risk,
- explicit execution relationships,
- documented ecosystem semantics,
- honest treatment of unsupported/dynamic behavior,
- deterministic output,
- controlled scope. fileciteturn11file0L97-L114

The research also defines the current MVP as repository scanning, surface normalization, Claude/VS Code/Cursor/npm/development surfaces, trigger/command extraction, reference resolution, recursive graph construction, capability detection, path-based risk, human + JSON reporting, SHA-256 baseline/diff, tests, and zero runtime dependencies. fileciteturn12file4L594-L656

These requirements are treated as the baseline for implementation.

---

# 2. Product Principles

## P1 — Never execute the target repository

The target repository is treated as inert data.

Never:

- import target modules,
- require target modules,
- execute target scripts,
- run target package-manager commands,
- run target build commands,
- invoke target hooks,
- run target interpreters,
- install target dependencies.

The core research explicitly requires that static analysis never import or execute target source modules. fileciteturn12file7L1240-L1254

## P2 — Graph over grep

The central technical object is the execution graph.

Raw pattern matches are evidence.

Execution relationships create meaning.

## P3 — Risk is not a malware verdict

Never output a claim equivalent to:

```text
MALWARE = TRUE
```

from static heuristics.

Instead:

```text
RISK
+
EVIDENCE
+
EXECUTION PATH
+
CONFIDENCE
```

## P4 — Explainability over complexity

Every meaningful risk should be explainable in plain language.

## P5 — Depth over breadth

Support a limited number of ecosystems deeply.

Do not add integrations merely to inflate feature count.

## P6 — Zero dependency is part of the design

No third-party runtime dependency.

The target repository must not need to be installed for the scanner to inspect it.

## P7 — Determinism

The same repository state should produce stable results.

## P8 — Honest uncertainty

When static analysis cannot safely determine behavior:

```text
UNRESOLVED
PARTIALLY_RESOLVED
DYNAMIC
REVIEW_REQUIRED
```

Do not invent certainty.

---

# 3. User Personas

## 3.1 AI-assisted developer

Needs to understand whether project-local configuration can trigger actions in an AI coding environment.

Primary use:

```text
clone → HookAudit → trust decision
```

## 3.2 Security engineer

Needs evidence-backed repository execution analysis.

Primary use:

```text
repository → scan → graph → report → triage
```

## 3.3 Open-source maintainer

Needs to know whether a change introduces a new execution path.

Primary use:

```text
baseline → PR/change → diff
```

## 3.4 CI/platform engineer

Needs deterministic checks and machine-readable output.

Primary use:

```text
hookaudit . --json
hookaudit . --strict
```

## 3.5 Incident responder

Needs to identify when repository-controlled execution changed.

Primary use:

```text
baseline → current state → execution-surface diff
```

---

# 4. Primary MVP Ecosystems

The MVP is intentionally narrow.

## 4.1 Claude Code

Primary AI-agent surface.

Required support:

- project-local settings/hooks where officially documented,
- trigger extraction,
- command extraction,
- referenced local file extraction,
- evidence location,
- execution condition/context.

Do not assume all historical Claude behavior remains current.

## 4.2 VS Code

Primary IDE/workspace surface.

Required support:

- `.vscode/tasks.json`,
- relevant automatic task trigger semantics,
- command/task extraction,
- workspace execution conditions where exposed by the configuration.

Do not interpret all VS Code settings as executable.

## 4.3 Cursor

Primary AI-editor surface.

Required support:

- documented project hook configuration,
- trigger extraction,
- command extraction,
- referenced files,
- execution condition.

Do not classify ordinary instruction files as direct code execution unless documented semantics establish that behavior.

## 4.4 npm

Primary package-lifecycle surface.

Required support:

- `preinstall`,
- `install`,
- `postinstall`,
- `prepare`,
- other explicitly supported lifecycle fields,
- related policy/allowlist metadata where it can be safely and deterministically interpreted.

The tool reports execution surfaces, not package maliciousness.

## 4.5 Development hooks

Selected repository-controlled development hooks such as:

- `.husky/`,
- setup scripts that install/configure hooks,
- other committed hook mechanisms that can be safely detected.

Native `.git/hooks/` is not treated as ordinary version-controlled repository content.

---

# 5. Future Ecosystems

Architecture should permit future adapters for:

- GitHub Copilot
- Gemini
- Windsurf
- other AI coding agents
- additional IDEs
- CI systems
- MCP-related project configuration
- other task runners

They are explicitly **not MVP blockers**.

---

# 6. Architecture Overview

```text
                         REPOSITORY
                              │
                              ▼
                      REPOSITORY BOUNDARY
                              │
                              ▼
                       SURFACE DISCOVERY
                              │
                              ▼
                    ECOSYSTEM-SPECIFIC PARSERS
              ┌────────┬────────┬────────┬────────┐
              ▼        ▼        ▼        ▼        ▼
           Claude    VS Code   Cursor    npm    Dev Hooks
              │        │        │        │        │
              └────────┴────────┴────────┴────────┘
                              │
                              ▼
                  NORMALIZED SURFACE MODEL
                              │
                              ▼
                    TRIGGER EXTRACTION
                              │
                              ▼
                    COMMAND EXTRACTION
                              │
                              ▼
                   REFERENCE RESOLUTION
                              │
                              ▼
                     EXECUTION GRAPH
                              │
                              ▼
                  CAPABILITY INFERENCE
                              │
                              ▼
                    PATH-BASED RISK
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
           HUMAN REPORT                JSON REPORT
                 │
                 ▼
              BASELINE
                 │
                 ▼
               DIFF
```

---

# 7. Module Boundaries

## 7.1 `cli`

Responsibilities:

- parse arguments,
- dispatch commands,
- configure output,
- set exit codes,
- never load target code.

## 7.2 `scanner`

Responsibilities:

- walk repository,
- enforce repository boundary,
- identify candidate files,
- ignore unsafe/unnecessary directories,
- avoid executing anything.

## 7.3 `adapters`

Responsibilities:

- recognize ecosystem surfaces,
- parse supported formats,
- normalize surface definitions.

Each adapter should expose a common interface.

## 7.4 `extractor`

Responsibilities:

- trigger extraction,
- command extraction,
- reference extraction,
- behavior metadata.

## 7.5 `resolver`

Responsibilities:

- resolve local file references,
- normalize paths,
- enforce repository boundaries,
- detect cycles,
- record resolution state.

## 7.6 `graph`

Responsibilities:

- nodes,
- edges,
- traversal,
- cycle handling,
- path generation.

## 7.7 `capability`

Responsibilities:

- infer behavior/capability signals,
- attach evidence,
- do not execute code.

## 7.8 `risk`

Responsibilities:

- evaluate execution paths,
- apply deterministic rules,
- produce severity,
- produce explanation/evidence.

## 7.9 `snapshot`

Responsibilities:

- baseline state,
- file hashes,
- execution-surface state.

## 7.10 `diff`

Responsibilities:

- compare trusted snapshot/current state,
- identify new/changed/removed surfaces,
- identify structural/capability changes where supported.

## 7.11 `report`

Responsibilities:

- concise human output,
- detailed evidence output,
- JSON serialization.

---

# 8. Repository Boundary Contract

## 8.1 Input

A path supplied by the user.

Example:

```bash
hookaudit .
```

## 8.2 Normalize

Convert the target to an absolute, canonical starting path.

## 8.3 Boundary

All referenced local files must be resolved relative to a controlled repository root.

## 8.4 Path traversal

Never silently follow:

```text
../
```

outside the repository.

## 8.5 Symlinks

Define and document a deterministic policy.

Recommended MVP:

- do not follow symlinks outside the repository boundary,
- preserve evidence that a symlink was skipped,
- optionally follow symlinks only when the resolved target remains safely within the boundary.

## 8.6 Windows

Handle:

- drive letters,
- path separators,
- UNC paths,
- junctions.

## 8.7 Output

Boundary violations should never crash the scanner.

Return an explicit diagnostic:

```text
UNRESOLVED_REFERENCE
Reason: target outside repository boundary
```

---

# 9. Repository Scanning Policy

## 9.1 Prioritize execution-relevant files

Do not fully parse every repository file.

First identify:

```text
.claude/
.vscode/
.cursor/
package.json
.husky/
known setup/bootstrap files
supported repository automation files
```

## 9.2 Default exclusions

Consider skipping:

```text
node_modules/
.git/objects/
.git/info/
dist/
build/
coverage/
vendor/
large generated directories
binary files
```

The exact exclusion list must not prevent analysis of legitimate execution surfaces.

## 9.3 File size

Set a configurable maximum text file size.

Recommended initial policy:

```text
Default: 1 MiB per analyzed text file
```

Large files should produce:

```text
FILE_SKIPPED_SIZE_LIMIT
```

rather than destabilizing the scan.

## 9.4 Binary detection

Do not process binary blobs as scripts by default.

Report:

```text
BINARY_SKIPPED
```

when relevant.

---

# 10. Canonical Execution Surface

Every adapter must normalize findings to:

```text
ExecutionSurface
{
    id,
    sourcePath,
    surfaceType,
    triggerType,
    triggerCondition,
    command,
    referencedPaths[],
    capabilities[],
    evidence[],
    resolutionState,
    severity,
    confidence
}
```

## 10.1 `id`

Deterministic identifier.

Do not use random UUIDs for baseline identity.

## 10.2 `sourcePath`

Repository-relative source path.

## 10.3 `surfaceType`

Examples:

```text
CLAUDE_HOOK
VSCODE_TASK
CURSOR_HOOK
NPM_LIFECYCLE
HUSKY_HOOK
DEV_SETUP
```

## 10.4 `triggerType`

Examples:

```text
SESSION_START
FOLDER_OPEN
TOOL_EVENT
INSTALL
PREPARE
GIT_HOOK
MANUAL
UNKNOWN
```

## 10.5 `triggerCondition`

Human-readable execution condition.

## 10.6 `command`

The extracted command or command representation.

## 10.7 `referencedPaths`

Repository-relative references discovered statically.

## 10.8 `capabilities`

Capability identifiers.

## 10.9 `evidence`

Exact source location and reason.

Example:

```text
path: .claude/settings.json
field: hooks.SessionStart
line: 17
```

## 10.10 `resolutionState`

```text
RESOLVED
PARTIALLY_RESOLVED
UNRESOLVED
```

---

# 11. Graph Data Model

## 11.1 Node types

```text
REPOSITORY
CONFIG
TRIGGER
COMMAND
SCRIPT
FILE
PROCESS
NETWORK
ENVIRONMENT
CAPABILITY
```

## 11.2 Edge types

```text
CONTAINS
TRIGGERS
EXECUTES
REFERENCES
SPAWNS
LOADS
CONNECTS_TO
DOWNLOADS
READS
WRITES
```

## 11.3 Minimum graph example

```text
Repository
   ↓
.claude/settings.json
   ↓ TRIGGERS
SessionStart
   ↓ EXECUTES
scripts/bootstrap.mjs
   ↓ SPAWNS
powershell
   ↓ CONNECTS_TO
remote endpoint
```

---

# 12. Graph Invariants

1. No graph edge may be created from unsupported semantics without evidence.
2. Every edge should retain source evidence.
3. Graph traversal must terminate.
4. Cycles must be detected.
5. Paths must be deterministic.
6. Repository boundaries must be respected.
7. A graph is an analytical model, not proof of runtime behavior.
8. Dynamic/unresolved edges must be labeled as such.

---

# 13. Trigger Extraction Contract

Each adapter must identify whether execution is:

```text
AUTOMATIC
MANUAL
EVENT_DRIVEN
UNKNOWN
```

## Examples

Claude:

```text
SessionStart
```

VS Code:

```text
folderOpen
```

npm:

```text
preinstall
postinstall
prepare
```

Development hooks:

```text
pre-commit
pre-push
commit-msg
```

The exact supported triggers must be tied to current documented semantics.

---

# 14. Command Extraction Contract

Commands may appear as:

- direct string,
- array,
- command + args,
- shell wrapper,
- script reference,
- local path.

Normalize to:

```text
CommandSpec
{
    raw,
    executable,
    arguments[],
    shell,
    references[]
}
```

Do not execute the command to determine its meaning.

---

# 15. Reference Resolution Contract

## 15.1 Detect

Look for:

- relative local script path,
- script invocation,
- interpreter invocation,
- direct local file path,
- supported command wrappers.

## 15.2 Normalize

Resolve against the correct semantic base path.

Do not assume every path is relative to repository root.

## 15.3 Boundary-check

Reject paths leaving repository boundary.

## 15.4 Load inertly

Read text only.

Never import/execute.

## 15.5 Recursive traversal

Follow supported references up to:

```text
MAX_GRAPH_DEPTH
```

Recommended MVP default:

```text
32
```

## 15.6 Cycle detection

Use canonical paths/identifiers.

## 15.7 Missing references

Report:

```text
UNRESOLVED_REFERENCE
```

not a fatal error.

---

# 16. Resolution States

## RESOLVED

The referenced target was found and statically analyzed.

## PARTIALLY_RESOLVED

The path was found but not fully interpreted.

## UNRESOLVED

The target could not be safely or deterministically determined.

Examples:

```text
dynamic variable path
environment-generated path
remote path
missing local file
```

---

# 17. Capability Model

Canonical MVP capability identifiers:

```text
PROCESS_EXECUTION
SHELL_EXECUTION
NETWORK_ACCESS
REMOTE_DOWNLOAD
RUNTIME_BOOTSTRAP
FILE_READ
FILE_WRITE
ENVIRONMENT_ACCESS
CREDENTIAL_ACCESS_SIGNAL
OBFUSCATION
CROSS_TOOL_LINK
DYNAMIC_EXECUTION
```

Not every capability must automatically increase severity.

Context matters.

---

# 18. Capability Detection

## 18.1 Process execution

Signals:

- `node`
- `python`
- direct executable paths
- process-spawn APIs
- shell launchers

Evidence should identify the source.

## 18.2 Shell execution

Signals:

- `bash -c`
- `sh -c`
- `powershell -Command`
- `pwsh`
- command wrappers

## 18.3 Network

Signals:

- `curl`
- `wget`
- `Invoke-WebRequest`
- `Invoke-RestMethod`
- JavaScript HTTP APIs
- Python HTTP APIs
- URLs in executable contexts

Avoid flagging URLs in plain documentation as executable behavior unless path context establishes reachability.

## 18.4 Remote download

Stronger network signal:

```text
network
+
download
```

## 18.5 Runtime bootstrap

Signals:

```text
download runtime/interpreter
+
execute downloaded runtime
```

## 18.6 Environment access

Signals involving:

- environment variables,
- process environment,
- credential-like variables.

Do not claim actual credential theft merely because environment access is possible.

## 18.7 Obfuscation

Signals:

- large encoded blobs,
- base64 decode patterns,
- dynamic command reconstruction,
- eval-like mechanisms.

Obfuscation is a review signal, not proof of malicious intent.

---

# 19. Evidence Model

Every capability should retain:

```text
Evidence
{
    path,
    line,
    column?,
    field?,
    excerpt?,
    detector,
    reason
}
```

Example:

```text
path:
scripts/bootstrap.sh

line:
19

detector:
NETWORK_DOWNLOAD

reason:
curl command references remote URL
```

The system should prefer exact evidence over generic messages.

---

# 20. Risk Engine Contract

Risk engine must be:

- deterministic,
- rule-based,
- explainable,
- context-aware.

Do not use a black-box ML score.

---

# 21. Risk Factors

Primary factors:

```text
AUTOMATIC_TRIGGER
PROJECT_CONTROLLED
NETWORK
REMOTE_DOWNLOAD
PROCESS_EXECUTION
SHELL_EXECUTION
RUNTIME_BOOTSTRAP
ENVIRONMENT_ACCESS
CREDENTIAL_ACCESS_SIGNAL
OBFUSCATION
CROSS_TOOL_LINK
NEW_SINCE_BASELINE
UNRESOLVED_DYNAMIC_BEHAVIOR
```

---

# 22. Risk Rules

Recommended baseline rules:

## LOW

Examples:

```text
manual local formatter
manual test task
routine local development automation
```

## MEDIUM

Examples:

```text
automatic execution
```

or:

```text
automatic execution
+
one unusual capability
```

## HIGH

Examples:

```text
automatic trigger
+
network access
+
process execution
```

or:

```text
automatic trigger
+
remote download
```

## CRITICAL

Reserve for strong combinations such as:

```text
automatic trigger
+
remote download
+
process execution
+
obfuscation
```

or another equivalent high-impact chain supported by evidence.

These are policy defaults and must be adjustable in code without changing the parser architecture.

---

# 23. Risk Explanation Contract

Every HIGH/CRITICAL finding must be explainable in this format:

```text
[HIGH] SessionStart

Trigger:
.claude/settings.json

Execution path:
.claude/settings.json
    ↓
scripts/bootstrap.mjs
    ↓
remote download
    ↓
process execution

Why:
This repository-controlled automatic trigger reaches an external
resource and a process-launch capability.

Evidence:
scripts/bootstrap.mjs:19
```

---

# 24. Confidence Model

Use:

```text
HIGH
MEDIUM
LOW
```

Confidence describes certainty in the static interpretation.

It is separate from risk.

Example:

```text
Risk: HIGH
Confidence: MEDIUM
```

because the behavior is suspicious but part of the command is dynamically constructed.

---

# 25. Dynamic Behavior Contract

When static analysis encounters:

```text
eval(...)
```

or:

```text
command = variableA + variableB
```

or:

```text
path = process.env.X + "/setup.sh"
```

do not guess.

Report:

```text
DYNAMIC_EXECUTION
```

or:

```text
UNRESOLVED_REFERENCE
```

with the available evidence.

---

# 26. Scan Output Contract

Default output should start with summary:

```text
HOOKAUDIT

Repository: example-project

Execution surfaces: 6
High-risk paths:     2
New since baseline:  1

Trust decision: REVIEW
```

Then show prioritized findings.

Do not flood the user with low-value output first.

---

# 27. Trust Decision

Recommended summary states:

```text
PASS
REVIEW
BLOCK
```

Possible policy:

```text
PASS
No high-risk execution paths.

REVIEW
At least one medium/high path.

BLOCK
Critical path or strict policy violation.
```

Do not label a repository intrinsically “safe.”

---

# 28. CLI Contract

## Scan

```bash
hookaudit .
```

## JSON

```bash
hookaudit . --json
```

## Strict

```bash
hookaudit . --strict
```

## Baseline

```bash
hookaudit baseline .
```

## Diff

```bash
hookaudit diff .
```

## Optional future command

```bash
hookaudit explain <finding>
```

Do not make `explain` an MVP requirement unless time remains.

---

# 29. CLI Exit Codes

Suggested:

```text
0 = success / no policy violation
1 = policy violation or high-risk finding in strict mode
2 = invalid CLI usage
3 = scanner/internal error
```

Document all codes.

Never use non-zero solely because a repository contains an ordinary low-risk execution surface unless policy says so.

---

# 30. JSON Schema Contract

Minimum shape:

```json
{
  "version": 1,
  "repository": {
    "path": "."
  },
  "summary": {
    "executionSurfaces": 6,
    "highRiskPaths": 2,
    "newSinceBaseline": 1,
    "decision": "REVIEW"
  },
  "surfaces": [],
  "paths": [],
  "capabilities": [],
  "diagnostics": []
}
```

Every surface should preserve evidence.

JSON must be deterministic in field ordering where practical.

---

# 31. Baseline Model

Baseline represents:

> **Trusted execution-surface state at a point in time.**

It does NOT mean:

> software is proven safe.

Baseline contents:

```text
version
repository identity
generated timestamp
surface identities
file hashes
surface metadata
graph/path representation where practical
capability summary
```

---

# 32. Baseline Identity

Do not rely on absolute machine-specific paths.

Use repository-relative paths.

Potential surface key:

```text
surfaceType
+
sourcePath
+
triggerType
+
normalizedCommand
```

Hash the normalized representation for stable identity.

---

# 33. SHA-256

Use:

```text
node:crypto
```

for SHA-256.

Hash:

- relevant execution-surface files,
- normalized execution representation if implemented.

Do not hash the entire repository unless required.

---

# 34. Diff Model

Minimum categories:

```text
NEW
CHANGED
REMOVED
```

## NEW

Execution surface absent from baseline.

## CHANGED

Execution surface exists in both but relevant state changed.

## REMOVED

Execution surface existed in baseline but no longer exists.

---

# 35. Structural Execution Diff

Where feasible, report:

```text
NEW TRIGGER
CHANGED TRIGGER
NEW COMMAND
CHANGED COMMAND
NEW REFERENCE
REMOVED REFERENCE
```

This is more useful than only saying:

```text
SHA-256 changed
```

---

# 36. Capability Diff

Where feasible:

```text
NEW NETWORK
NEW REMOTE DOWNLOAD
NEW PROCESS EXECUTION
NEW RUNTIME BOOTSTRAP
NEW OBFUSCATION
NEW ENVIRONMENT ACCESS
```

This should be a high-priority MVP enhancement if the graph model already supports it.

---

# 37. Semantic Diff Stretch Goal

Future/advanced:

```text
BEFORE

SessionStart
→ local formatter

AFTER

SessionStart
→ local formatter
→ network
```

Report:

```text
BEHAVIOR CHANGE

New reachable capability:
NETWORK

New path:
SessionStart → formatter → external request
```

Do not implement full program-semantics diffing in the 72-hour MVP.

---

# 38. Ecosystem Adapter Contract

Every adapter must implement conceptually:

```text
canHandle(path, content)
parse(path, content)
normalize(parsed)
```

Output:

```text
ExecutionSurface[]
Diagnostic[]
```

Adapters must not know about:

- terminal formatting,
- risk scoring,
- baseline storage,
- CLI argument parsing.

This keeps the core generic.

---

# 39. Claude Adapter Contract

Input:

```text
.claude/settings.json
```

Responsibilities:

- parse valid JSON,
- identify supported hook events,
- identify command/script definitions,
- identify local path references,
- capture execution condition,
- retain evidence.

Failure handling:

```text
Malformed JSON
→ diagnostic
→ continue scan
```

Do not assume unknown Claude fields are executable.

Only support documented semantics.

---

# 40. VS Code Adapter Contract

Input:

```text
.vscode/tasks.json
```

Responsibilities:

- parse JSON,
- identify tasks,
- identify automatic triggers where documented,
- extract command/args,
- resolve supported references.

Do not interpret arbitrary settings as executable.

Workspace-trust conditions must be represented where relevant.

---

# 41. Cursor Adapter Contract

Input:

Documented project hook configuration.

Responsibilities:

- parse supported format,
- identify trigger,
- identify command,
- resolve supported local references,
- preserve execution-condition evidence.

Do not infer execution from instruction-only configuration.

---

# 42. npm Adapter Contract

Input:

```text
package.json
```

Responsibilities:

- identify supported lifecycle scripts,
- identify script commands,
- identify relevant package-manager execution surfaces,
- attach package lifecycle trigger.

Optional:

- lockfile metadata,
- local package policy where deterministic.

The adapter should clearly distinguish:

```text
root-project scripts
```

from:

```text
dependency package lifecycle behavior
```

where the source evidence permits.

---

# 43. Development Hook Adapter Contract

Potential inputs:

```text
.husky/*
setup/bootstrap scripts
```

Responsibilities:

- detect committed hook scripts,
- identify hook names,
- extract commands,
- resolve references,
- avoid treating local `.git/hooks` as ordinary tracked content.

---

# 44. Cross-Tool Linking

Cross-tool linking is a core differentiator.

Example:

```text
Claude hook
    ↓
scripts/setup.mjs
    ↓
VS Code task
    ↓
another script
```

The graph should retain ecosystem metadata so the report can say:

```text
CROSS-TOOL EXECUTION PATH
Claude → Script → VS Code → Script
```

---

# 45. Cross-Tool Link Risk

A cross-tool link is not inherently malicious.

Treat it as contextual evidence.

Potential risk increases if:

```text
cross-tool link
+
automatic trigger
+
network/process behavior
```

Do not assign HIGH solely because a path crosses directories or ecosystems.

---

# 46. Graph Traversal Algorithm

Recommended:

```text
queue = initial execution surfaces
visited = empty set

while queue not empty:
    surface = queue.pop()

    if surface already visited:
        continue

    mark visited

    extract references

    for each reference:
        resolve safely

        add graph edge

        if resolvable target:
            enqueue target
```

Every traversal should carry:

```text
rootTrigger
currentNode
path
depth
evidence
```

---

# 47. Maximum Depth

Recommended default:

```text
MAX_GRAPH_DEPTH = 32
```

If exceeded:

```text
DEPTH_LIMIT_REACHED
```

This is not necessarily a security finding.

It is a diagnostic/uncertainty signal.

---

# 48. Cycle Handling

Example:

```text
A → B → C → A
```

Must terminate.

Represent:

```text
CYCLE_DETECTED
```

in diagnostics.

Do not recursively process forever.

---

# 49. Error Handling

Parsing errors must be non-fatal where safe.

Example:

```text
settings.json malformed
```

Output:

```text
WARNING
Could not parse .claude/settings.json
Reason: invalid JSON
```

Continue scanning other surfaces.

Fatal errors should be limited to:

- invalid root path,
- unreadable repository root,
- internal invariant failure.

---

# 50. Deterministic Ordering

Sort:

- paths lexicographically,
- surfaces by source path + trigger,
- nodes deterministically,
- edges deterministically,
- findings by severity then path,
- capabilities deterministically.

Avoid random IDs.

Avoid current timestamps in scan identity.

---

# 51. Performance Contract

MVP target:

- small repository: near-instant
- medium repository: seconds
- large monorepo: bounded and controlled

Do not optimize prematurely.

Main performance risks:

- scanning generated directories,
- repeatedly parsing the same file,
- recursive graph loops,
- huge files.

Use caching where it meaningfully helps.

---

# 52. Content Cache

Optional in-memory cache:

```text
canonicalPath
→ parsed/analyzed content
```

This avoids repeatedly reading the same script.

Cache lifetime:

single scan.

Do not persist arbitrary analyzed source content to disk by default.

---

# 53. Privacy Model

HookAudit is local-first.

By default:

- no telemetry,
- no cloud upload,
- no target repository content upload,
- no external threat-intelligence dependency.

If an optional online capability is ever added, it must be explicit.

Core scan must remain local.

---

# 54. Network Access by HookAudit Itself

Default MVP:

```text
NO NETWORK REQUIRED
```

The scanner should be able to analyze supported local surfaces without contacting external services.

This strengthens deterministic/local behavior.

---

# 55. Security of the Scanner Itself

The scanner must not:

- follow arbitrary remote URLs,
- execute extracted commands,
- import target modules,
- install dependencies,
- launch target interpreters,
- write into target repository except explicit baseline files.

If baseline storage is implemented, write only controlled HookAudit metadata.

---

# 56. Baseline Storage

Suggested:

```text
.hookaudit/
    baseline.json
```

Document:

- why this directory exists,
- what it contains,
- whether it should be committed,
- how to remove it.

Recommended initial behavior:

- support local baseline,
- document commit/use in CI based on workflow.

Do not assume the baseline itself should always be versioned.

---

# 57. Baseline Integrity

The baseline must identify:

- schema version,
- repository root identity where practical,
- surface data,
- relevant hashes.

If baseline is malformed:

```text
BASELINE_INVALID
```

Require recreation.

---

# 58. Baseline Trust Language

UI:

```text
Baseline created.

Note:
This snapshot records the repository's execution surface.
It does not prove the initial state was safe.
```

This prevents conceptual confusion.

---

# 59. Diff Language

Use:

```text
NEW EXECUTION SURFACE
CHANGED EXECUTION SURFACE
REMOVED EXECUTION SURFACE
```

Avoid:

```text
ATTACK DETECTED
```

unless there is far stronger evidence than the MVP provides.

---

# 60. Policy Mode

`--strict` should turn risk into CI behavior.

Recommended:

```text
LOW → allow
MEDIUM → allow/warn
HIGH → fail
CRITICAL → fail
```

These thresholds should be centralized.

Do not duplicate risk rules across commands.

---

# 61. Human Report Sections

Recommended:

```text
SUMMARY
EXECUTION SURFACES
HIGH-RISK PATHS
CAPABILITIES
DIAGNOSTICS
BASELINE/DIFF
```

Keep the default output compact.

---

# 62. Detailed Finding

Every detailed finding should include:

```text
Severity
Confidence
Surface type
Trigger
Source
Path
Capabilities
Evidence
Reason
Recommended action
```

---

# 63. Recommended Actions

Keep actions simple:

```text
REVIEW
REMOVE
DISABLE
CONFIRM TRUST
INVESTIGATE CHANGE
```

Do not claim automated remediation unless implemented safely.

---

# 64. No Automatic Remediation in MVP

Do not:

- modify hooks,
- delete configuration,
- rewrite package scripts,
- disable IDE tasks,
- alter repository files automatically.

A scanner should report first.

---

# 65. Security Evidence Rules

Evidence must be:

- local,
- reproducible,
- source-linked,
- deterministic.

Example:

```text
Evidence:
.vscode/tasks.json:12
Task: setup
runOn: folderOpen
command: node scripts/setup.js
```

---

# 66. Fixture Repository Specification

Create a dedicated fixture set.

Suggested structure:

```text
fixtures/
├── safe/
├── legitimate-hook/
├── network/
├── download/
├── bootstrap/
├── obfuscated/
├── cross-tool/
├── nested/
├── cyclic/
├── malformed/
├── traversal/
├── baseline/
└── dynamic/
```

---

# 67. Safe Fixture

Contains ordinary source/configuration.

Expected:

```text
No high-risk paths.
```

---

# 68. Legitimate Hook Fixture

Example:

```text
automatic trigger
→ formatter
```

Expected:

```text
LOW / MEDIUM
```

depending on policy.

Purpose:

prove hooks are not automatically considered malicious.

---

# 69. Network Fixture

Example:

```text
automatic trigger
→ harmless network-looking operation
```

Expected:

```text
NETWORK_ACCESS
```

and elevated contextual risk.

---

# 70. Remote Download Fixture

Example:

```text
automatic trigger
→ curl remote artifact
```

Expected:

```text
NETWORK_ACCESS
REMOTE_DOWNLOAD
```

---

# 71. Runtime Bootstrap Fixture

Example:

```text
automatic trigger
→ download runtime
→ execute runtime
```

Expected:

```text
RUNTIME_BOOTSTRAP
```

with elevated path risk.

---

# 72. Obfuscated Fixture

Example:

```text
encoded command
→ decode
→ dynamic execution
```

Expected:

```text
OBFUSCATION
DYNAMIC_EXECUTION
```

The detector should not attempt to execute the payload.

---

# 73. Cross-Tool Fixture

Example:

```text
Claude hook
→ script
→ VS Code task/script
→ network
```

Expected:

```text
CROSS_TOOL_LINK
```

plus the full graph.

---

# 74. Nested Fixture

Example:

```text
config
→ A
→ B
→ C
→ capability
```

Expected:

Full path resolution.

---

# 75. Cyclic Fixture

Example:

```text
A → B → C → A
```

Expected:

```text
CYCLE_DETECTED
```

No crash or infinite loop.

---

# 76. Malformed Fixture

Malformed JSON.

Expected:

- diagnostic,
- no process termination,
- other files still analyzed.

---

# 77. Traversal Fixture

A config tries to reference:

```text
../outside-repo
```

Expected:

```text
UNRESOLVED_REFERENCE
BOUNDARY_VIOLATION
```

No outside read.

---

# 78. Dynamic Fixture

Command/path cannot be statically resolved.

Expected:

```text
DYNAMIC / UNRESOLVED
```

rather than guessed graph edges.

---

# 79. Testing Layers

## Unit tests

Test:

- path normalization,
- parser behavior,
- command extraction,
- capability detectors,
- risk rules,
- hash,
- baseline,
- diff.

## Integration tests

Test:

```text
fixture repository
→ scan
→ graph
→ report
```

## Security tests

Test:

- path traversal,
- symlinks,
- malformed input,
- huge files,
- cycles,
- command execution prevention.

## CLI tests

Test:

- help,
- scan,
- JSON,
- strict,
- baseline,
- diff,
- exit codes.

---

# 80. “Never Execute Target” Test

Create a fixture containing a script that would create a marker if executed.

Run HookAudit.

Assert:

```text
marker does not exist
```

This test must be explicit.

It validates the central security invariant.

---

# 81. Determinism Tests

Run the same scan twice.

Compare JSON output after removing intentionally nondeterministic metadata if any.

Expected:

```text
identical analytical result
```

---

# 82. Risk Rule Tests

For each rule:

```text
input signals
→ expected severity
→ expected explanation
```

Do not only test final scores.

Test the evidence path.

---

# 83. Baseline Tests

Test:

1. create baseline,
2. unchanged scan,
3. new surface,
4. changed surface,
5. removed surface,
6. malformed baseline,
7. missing baseline.

---

# 84. Capability-Diff Tests

Test:

```text
Before:
automatic + local

After:
automatic + network
```

Expected:

```text
NEW CAPABILITY: NETWORK
```

---

# 85. Reference Resolution Tests

Test:

- relative path,
- nested path,
- absolute path within repo,
- missing path,
- external path,
- cycle,
- duplicate reference.

---

# 86. Adapter Contract Tests

Every adapter must have:

```text
known-good fixture
known-risk fixture
malformed fixture
unsupported fixture
```

---

# 87. Documentation Contract

Repository must include:

```text
README.md
STDLIB.md
```

And where appropriate:

```text
SECURITY.md
LIMITATIONS.md
```

---

# 88. README Requirements

README must answer:

1. What is HookAudit?
2. What problem does it solve?
3. Who is it for?
4. What execution surfaces are supported?
5. How does it work?
6. Why is execution graph analysis useful?
7. How is risk calculated?
8. What does it not detect?
9. How is zero dependency achieved?
10. How do I run it?
11. How do I use baseline/diff?
12. How do I interpret the output?
13. What are known limitations?

---

# 89. README Claims Discipline

Do not say:

```text
first
unique
nobody does this
zero risk
perfect detection
malware detector
```

without strong evidence.

Recommended:

> HookAudit analyzes repository-controlled execution surfaces and maps supported execution paths.

---

# 90. STDLIB.md Requirements

Document actual substitutions.

Minimum:

```text
filesystem traversal
JSON parsing
CLI parsing
hashing
terminal formatting
diff logic
```

For each:

```text
Typical dependency
→ standard library replacement
→ why it is enough
→ limitations
```

The research specifically recommends standard-library substitutions such as filesystem traversal, built-in CLI parsing, ANSI output, hashing, and custom diffing. fileciteturn12file0L63-L104

---

# 91. Dependency Proof

Final repository must visibly demonstrate:

```text
runtime dependencies = 0
```

Verify:

- `package.json`,
- source imports,
- dependency tree,
- build/run commands,
- test command.

The research identifies this as a key proof point. fileciteturn12file0L30-L59

---

# 92. Development Dependencies

Development/test dependencies are allowed only if the official hackathon rules explicitly permit them.

Do not hide runtime imports behind development tooling.

The final audit must distinguish:

```text
runtime
```

from:

```text
test/build/development
```

---

# 93. Node.js Standard Library Contract

Preferred modules:

```text
node:fs
node:path
node:crypto
node:util
node:os
node:url
node:readline
node:test
```

Core tasks:

```text
filesystem
JSON
hashing
path normalization
CLI
testing
reporting
```

The research identifies these as the preferred standard-library foundation. fileciteturn12file5L898-L928

---

# 94. No Runtime External Tools

Do not make core scanning depend on:

```text
git
npm
python
bash
powershell
curl
jq
grep
ripgrep
```

The scanner may recognize such commands as strings in target files, but it must not invoke them as part of the target analysis.

---

# 95. No Network Requirement

Core scan should work offline.

If future online features exist, they must be optional.

---

# 96. CLI Parsing

Use:

```text
process.argv
```

or:

```text
node:util
```

Do not add a CLI dependency.

---

# 97. Terminal Rendering

Use:

- stdout/stderr,
- ANSI escape sequences,
- fixed-width formatting.

No `chalk` or table package.

---

# 98. Graph Rendering

MVP does not require a graphical UI.

Use readable text:

```text
Trigger
  ↓
Script
  ↓
Reference
  ↓
Capability
```

An interactive visual graph is a stretch goal.

---

# 99. Security Invariants

The implementation must preserve these invariants:

```text
1. Target repository code is never executed.
2. Target dependencies are never installed.
3. Repository boundaries are enforced.
4. No arbitrary external commands are executed against target content.
5. Runtime dependencies are zero.
6. Findings retain evidence.
7. Risk is explainable.
8. Risk is not a malware verdict.
9. Dynamic behavior is marked uncertain.
10. Baseline does not prove safety.
11. Change does not imply maliciousness.
12. Output is deterministic.
```

These align with the final implementation gate in the research. fileciteturn12file1L339-L355

---

# 100. Performance/Safety Guardrails

Implement:

- maximum scan depth,
- maximum graph depth,
- maximum file size,
- binary skipping,
- ignored generated/vendor directories,
- cycle detection,
- symlink policy,
- repository boundary,
- deterministic traversal.

These guardrails are explicitly called out in the research. fileciteturn12file4L775-L787

---

# 101. Feature Priority

## P0 — absolutely required

```text
repository scanner
surface normalization
Claude adapter
VS Code adapter
Cursor adapter
npm adapter
basic dev-hook adapter
trigger extraction
command extraction
reference resolution
execution graph
capability inference
path-based risk
human output
JSON output
safe analysis
tests
zero runtime dependencies
```

## P1 — highly valuable

```text
baseline
file hash diff
structural diff
capability diff
strict mode
better evidence rendering
```

## P2 — stretch

```text
semantic path diff
more agent adapters
SARIF
policy files
interactive graph
HTML report
additional ecosystems
```

---

# 102. Explicitly Out of MVP

Do not implement:

- full shell AST,
- full JavaScript static analysis,
- full YAML parser,
- every AI agent,
- every IDE,
- every CI system,
- dynamic sandbox execution,
- perfect malware detection,
- cloud backend,
- ML model,
- full registry intelligence,
- external threat-intelligence dependency,
- complete Git semantic engine.

The research explicitly recommends excluding these to protect the 72-hour scope. fileciteturn11file3L599-L617

---

# 103. 72-Hour Build Contract

## Day 1 — Surface Engine

Must finish:

```text
CLI
repository boundary
scanner
Claude parser
VS Code parser
Cursor parser
npm parser
normalized surface model
trigger extraction
command extraction
basic report
```

End-of-day acceptance:

```text
fixture repository
→ surface detected
→ trigger shown
→ command shown
```

This mirrors the research's Day 1 milestone. fileciteturn12file4L660-L685

---

# 104. Day 2 — Graph + Risk

Must finish:

```text
reference resolver
recursive traversal
cycle handling
execution graph
capability analyzer
cross-link analysis
path-based risk
JSON output
fixture expansion
```

End-of-day acceptance:

```text
config
→ script
→ secondary script
→ capability
```

appears as one explainable path.

The research explicitly defines this as the Day 2 milestone. fileciteturn12file4L687-L710

---

# 105. Day 3 — Trust + Proof + Polish

Must finish:

```text
baseline
diff
capability-change summary
strict exit codes
security hardening
deterministic output
complete tests
README
STDLIB.md
dependency proof
demo fixture
demo video
```

This mirrors the research's Day 3 milestone. fileciteturn12file4L712-L727

---

# 106. Time-Pressure Cut Order

If behind schedule:

## Cut first

```text
HTML
interactive graph
SARIF
extra agents
extra ecosystems
full semantic diff
fancy terminal UI
```

## Protect

```text
surface extraction
reference resolution
execution graph
capability detection
risk explanation
safe analysis
baseline/diff
tests
zero-dependency proof
```

The graph must survive.

---

# 107. “If We Lose 6 Hours”

Cut:

- extra adapter,
- semantic diff,
- advanced terminal UI.

Keep:

```text
Claude
VS Code
Cursor
npm
graph
risk
baseline
```

---

# 108. “If We Lose 12 Hours”

Reduce supported development hooks.

Keep:

```text
Claude
VS Code
Cursor
npm
graph
risk
baseline
```

---

# 109. “If We Lose 24 Hours”

Reduce to:

```text
Claude
VS Code
npm
```

with strong graph resolution.

Protect the product thesis.

---

# 110. Acceptance Criteria — Product

HookAudit passes the MVP gate only if:

### A1

It scans an unfamiliar repository without executing the repository.

### A2

It detects supported automatic execution surfaces.

### A3

It identifies triggers.

### A4

It identifies commands.

### A5

It follows supported local references.

### A6

It constructs a multi-hop execution graph.

### A7

It identifies at least the core capabilities.

### A8

It produces a deterministic risk explanation.

### A9

It supports human and JSON output.

### A10

It supports trusted baseline/diff.

### A11

It remains zero-runtime-dependency.

### A12

It passes security fixture tests.

---

# 111. Acceptance Criteria — Graph

Given:

```text
A → B → C → network
```

the graph must show:

```text
A → B → C → network
```

not three unrelated findings.

---

# 112. Acceptance Criteria — Boundary

Given:

```text
A → ../outside
```

HookAudit must:

```text
not read outside
```

and must provide a diagnostic.

---

# 113. Acceptance Criteria — Safety

Given a target script that creates a file when executed:

```text
hookaudit fixture
```

must not create the file.

---

# 114. Acceptance Criteria — Diff

Given:

```text
baseline:
automatic local execution
```

then:

```text
current:
automatic network execution
```

the diff should identify:

```text
NEW CAPABILITY:
NETWORK
```

where implemented.

---

# 115. Acceptance Criteria — Explainability

For each HIGH/CRITICAL result:

The user can answer:

```text
WHAT
WHEN
WHERE
PATH
CAPABILITY
WHY
```

without opening source code manually.

---

# 116. Acceptance Criteria — No Overclaim

The output must never imply:

```text
“This repository is malware.”
```

from heuristic evidence alone.

---

# 117. Quality Gates

## Gate 1 — Functional

All P0 features work.

## Gate 2 — Security

No target execution.

## Gate 3 — Dependency

No runtime third-party package.

## Gate 4 — Determinism

Repeated scan is stable.

## Gate 5 — Testing

Core fixtures pass.

## Gate 6 — Documentation

README/STDLIB complete.

## Gate 7 — Demo

Five-minute flow is deterministic.

---

# 118. Final Demo Contract

The demo should prove:

```text
1. Hidden execution surface exists.
2. Existing categories of scanning answer different questions.
3. HookAudit discovers the surface.
4. HookAudit builds an execution path.
5. HookAudit infers reachable capability.
6. HookAudit gives explainable risk.
7. Baseline captures trusted state.
8. Diff identifies a new/changed surface.
9. HookAudit never executes target code.
10. Zero runtime dependencies are visible.
```

---

# 119. Demo Fixture

Use one controlled repository with:

```text
.claude/settings.json
scripts/bootstrap.mjs
scripts/helper.sh
.vscode/tasks.json
package.json
```

Build a path such as:

```text
SessionStart
→ bootstrap.mjs
→ helper.sh
→ remote download
→ process execution
```

Use inert/harmless demonstration content.

---

# 120. Demo Script

## 0:00–0:30

Problem:

> Modern repositories contain executable configuration in addition to source code.

## 0:30–1:00

Show repository surfaces.

## 1:00–2:20

Run:

```bash
hookaudit .
```

Show graph.

## 2:20–3:00

Explain path-based risk.

## 3:00–4:00

Run:

```bash
hookaudit baseline .
```

make a controlled change.

Run:

```bash
hookaudit diff .
```

## 4:00–4:40

Show semantic/capability change.

## 4:40–5:00

Show:

```text
dependencies: {}
```

and standard-library modules.

Finish:

> **Before you trust a repository, know what it can execute.**

---

# 121. Judge Questions and Answers

## “Isn't this just grep?”

Answer:

> The scanner uses patterns as evidence, but the core unit is the execution path. It parses triggers, resolves references, constructs a graph, and combines capabilities along reachable paths.

## “Don't existing tools already scan agent configs?”

Answer:

> Yes, there is overlap. HookAudit is not positioned as a generic agent-config linter. Its differentiation is repository-wide execution topology, cross-tool reachability, and execution-surface change tracking.

## “Why zero dependencies?”

Answer:

> The target repository is untrusted. HookAudit can inspect supported execution surfaces without installing or executing the target's dependency tree, while the auditor itself has zero third-party runtime dependencies.

## “Can you prove this is malware?”

Answer:

> No. HookAudit is a static execution-surface auditor. It provides evidence and risk signals, not a definitive malware verdict.

## “Why not build it into the IDE?”

Answer:

> HookAudit is intentionally cross-tool and local, so the same repository can be evaluated before entering a particular agent, editor, package workflow, or CI environment.

---

# 122. Competitive Positioning Contract

Do not claim:

```text
first
only
nobody
blue ocean
```

Instead:

> Existing tools cover pieces of repository, dependency, agent, and configuration security. HookAudit focuses on the normalized execution topology connecting those surfaces and the way that topology changes over time.

The research explicitly warns that existing tools overlap with portions of the problem. fileciteturn11file0L31-L35

---

# 123. Product Positioning

## Primary

> **HookAudit — See what a repository can execute before you trust it.**

## Technical

> A local repository execution-topology auditor.

## Security

> Evidence-backed analysis of repository-controlled execution surfaces.

## Zero-dependency

> Analyze supported repository execution surfaces without requiring the target repository's dependency tree to be installed or executed.

---

# 124. Product Anti-Positioning

HookAudit is not:

```text
generic malware scanner
dependency vulnerability scanner
SAST
SBOM verifier
Claude-only hook scanner
AI detector
```

It may complement these systems.

---

# 125. Long-Term Product Direction

After MVP:

```text
scan once
+
baseline
+
execution-surface history
+
semantic execution diff
```

The research identifies baseline plus future semantic change detection as the strongest long-term direction. fileciteturn12file6L1030-L1052

Potential products:

- repository pre-trust CLI,
- CI gate,
- PR execution-surface analyzer,
- baseline monitor,
- incident-response helper,
- security review component. fileciteturn12file6L1030-L1040

---

# 126. Implementation Contract — What Must Not Drift

Do not allow the coding agent/team to silently change:

```text
Product question
Execution-surface abstraction
Graph-first architecture
No-target-execution rule
Zero-runtime-dependency rule
Evidence requirement
Risk ≠ malware
Boundary enforcement
Depth-over-breadth strategy
Deterministic output
```

Any change must be explicitly recorded.

---

# 127. Change Control

When adding a feature, answer:

```text
Does it support the core product question?
Does it strengthen the execution graph?
Does it improve evidence?
Does it fit zero-dependency rules?
Can it be tested?
Can it fit the 72-hour scope?
```

If no:

CUT IT.

---

# 128. Final MVP Feature Matrix

| Feature | Priority | Exact Contract | Acceptance Test |
|---|---|---|---|
| Repository scanning | P0 | Walk bounded repository safely | scans fixture |
| Claude adapter | P0 | Detect supported hooks | Claude fixture |
| VS Code adapter | P0 | Detect supported tasks/automatic surfaces | VS Code fixture |
| Cursor adapter | P0 | Detect documented project hooks | Cursor fixture |
| npm adapter | P0 | Detect supported lifecycle scripts | npm fixture |
| Dev-hook adapter | P0/P1 | Detect selected committed hooks | Husky fixture |
| Trigger extraction | P0 | Normalize trigger semantics | trigger tests |
| Command extraction | P0 | Normalize command representation | command tests |
| Reference resolution | P0 | Safe multi-hop local resolution | nested fixture |
| Graph | P0 | Nodes + edges + path evidence | graph fixture |
| Capability inference | P0 | Core capabilities | signal tests |
| Path risk | P0 | deterministic contextual rules | risk tests |
| Human report | P0 | concise + evidence | CLI snapshot |
| JSON report | P0 | stable schema | JSON tests |
| Baseline | P1 | trusted snapshot | baseline test |
| File diff | P1 | new/changed/removed | diff test |
| Structural diff | P1 | trigger/command/reference changes | diff test |
| Capability diff | P1 | new capability | diff test |
| Strict mode | P1 | CI exit code | CLI test |
| Semantic diff | P2 | behavioral path comparison | stretch |
| SARIF | P2 | standards output | stretch |
| Interactive graph | P2 | visual graph | stretch |
| Extra agents | P2 | adapter architecture | stretch |

---

# 129. Architecture Directory Contract

Recommended source layout:

```text
src/
├── cli/
│   ├── args.js
│   ├── commands.js
│   └── exitCodes.js
│
├── scanner/
│   ├── repository.js
│   ├── boundary.js
│   ├── files.js
│   └── limits.js
│
├── adapters/
│   ├── base.js
│   ├── claude.js
│   ├── vscode.js
│   ├── cursor.js
│   ├── npm.js
│   └── devhooks.js
│
├── model/
│   ├── executionSurface.js
│   ├── graph.js
│   ├── evidence.js
│   └── capabilities.js
│
├── resolver/
│   ├── paths.js
│   ├── references.js
│   └── cycles.js
│
├── analysis/
│   ├── capabilities.js
│   ├── risk.js
│   └── rules.js
│
├── snapshot/
│   ├── baseline.js
│   ├── diff.js
│   └── hashes.js
│
└── report/
    ├── text.js
    ├── json.js
    └── format.js
```

A single-file build remains optional.

The research explicitly says single-file distribution should only be pursued if it does not compromise maintainability/readability. fileciteturn12file0L124-L146

---

# 130. Model Example

```js
{
  id: "sha256:...",
  sourcePath: ".claude/settings.json",
  surfaceType: "CLAUDE_HOOK",
  triggerType: "SESSION_START",
  triggerCondition: {
    type: "automatic",
    description: "Runs when a supported Claude session-start event occurs."
  },
  command: {
    raw: "node scripts/bootstrap.mjs",
    executable: "node",
    arguments: ["scripts/bootstrap.mjs"],
    shell: false
  },
  referencedPaths: [
    "scripts/bootstrap.mjs"
  ],
  capabilities: [
    "PROCESS_EXECUTION",
    "NETWORK_ACCESS"
  ],
  evidence: [
    {
      path: ".claude/settings.json",
      line: 17,
      field: "hooks.SessionStart",
      detector: "CLAUDE_HOOK",
      reason: "Supported automatic hook definition"
    }
  ],
  resolutionState: "RESOLVED",
  severity: "HIGH",
  confidence: "HIGH"
}
```

The exact runtime representation can differ, but the semantics must remain.

---

# 131. Graph Example

```js
{
  nodes: [
    { id: "n1", type: "CONFIG", path: ".claude/settings.json" },
    { id: "n2", type: "TRIGGER", name: "SessionStart" },
    { id: "n3", type: "SCRIPT", path: "scripts/bootstrap.mjs" },
    { id: "n4", type: "CAPABILITY", name: "NETWORK_ACCESS" },
    { id: "n5", type: "CAPABILITY", name: "PROCESS_EXECUTION" }
  ],
  edges: [
    { from: "n1", to: "n2", type: "TRIGGERS" },
    { from: "n2", to: "n3", type: "EXECUTES" },
    { from: "n3", to: "n4", type: "CONNECTS_TO" },
    { from: "n3", to: "n5", type: "SPAWNS" }
  ]
}
```

---

# 132. Risk Example

```js
{
  severity: "HIGH",
  confidence: "HIGH",
  factors: [
    "AUTOMATIC_TRIGGER",
    "PROJECT_CONTROLLED",
    "NETWORK_ACCESS",
    "PROCESS_EXECUTION"
  ],
  ruleId: "AUTO_NETWORK_PROCESS",
  explanation:
    "An automatic repository-controlled execution path reaches network access and process execution."
}
```

---

# 133. Diagnostic Types

Suggested:

```text
INVALID_JSON
UNSUPPORTED_FORMAT
UNRESOLVED_REFERENCE
PARTIAL_RESOLUTION
BOUNDARY_VIOLATION
SYMLINK_SKIPPED
FILE_TOO_LARGE
BINARY_SKIPPED
CYCLE_DETECTED
DEPTH_LIMIT_REACHED
DYNAMIC_EXECUTION
PERMISSION_DENIED
BASELINE_INVALID
```

Diagnostics must not be treated as security findings unless policy says so.

---

# 134. Severity vs Diagnostic

Separate:

```text
DIAGNOSTIC
```

from:

```text
SECURITY_FINDING
```

Example:

```text
DEPTH_LIMIT_REACHED
```

is not automatically:

```text
HIGH
```

It means:

> analysis could not safely traverse further.

---

# 135. Finding Model

```text
Finding
{
    id,
    severity,
    confidence,
    ruleId,
    surfaceId,
    pathId?,
    title,
    explanation,
    evidence[],
    capabilities[],
    recommendation
}
```

---

# 136. Path Model

```text
ExecutionPath
{
    id,
    trigger,
    nodes[],
    edges[],
    capabilities[],
    findings[],
    resolutionState,
    severity,
    confidence
}
```

This becomes the unit displayed for important findings.

---

# 137. Baseline Model

```text
Baseline
{
    schemaVersion,
    repositoryIdentity,
    generatedAt,
    surfaces[],
    fileHashes{},
    capabilitySummary{}
}
```

Do not use machine-specific absolute paths as stable identities.

---

# 138. Diff Model

```text
ExecutionDiff
{
    newSurfaces[],
    changedSurfaces[],
    removedSurfaces[],
    newTriggers[],
    changedCommands[],
    newReferences[],
    newCapabilities[],
    diagnostics[]
}
```

---

# 139. Configuration Versioning

Every stored JSON schema must have:

```text
schemaVersion
```

This prevents future changes from breaking old baselines silently.

---

# 140. Backward Compatibility

If baseline schema is unsupported:

```text
BASELINE_VERSION_UNSUPPORTED
```

Offer recreation.

Do not silently reinterpret old data.

---

# 141. CLI Help Contract

`hookaudit --help` should explain:

```text
What the tool does
Commands
Key options
Safety model
Exit codes
```

Example:

```text
HookAudit — repository execution-surface auditor

Usage:
  hookaudit <path>
  hookaudit baseline <path>
  hookaudit diff <path>

Options:
  --json
  --strict
  --help
```

---

# 142. Logging

Default:

```text
minimal
```

Optional:

```text
--verbose
```

could expose parser diagnostics.

Do not print target source wholesale.

---

# 143. Secret Handling

If environment/credential access signals appear, output:

```text
CREDENTIAL_ACCESS_SIGNAL
```

Do not print actual secrets discovered in files.

Do not intentionally exfiltrate or transmit sensitive content.

---

# 144. Source Excerpts

Default evidence excerpts should be:

- short,
- local,
- redaction-aware.

If a detected line contains credential-like content, redact the value.

---

# 145. File Writing

Default scan:

```text
READ-ONLY
```

Except explicit baseline command.

`scan` should not modify repository content.

---

# 146. Baseline Write Safety

Baseline command must:

- create only intended `.hookaudit` files,
- not execute any repository code,
- not run package managers,
- not run Git,
- not install dependencies.

---

# 147. Diff Write Safety

`diff` should be read-only by default.

It must not modify target repository.

---

# 148. Error Recovery

If one adapter fails:

```text
record diagnostic
continue other adapters
```

If graph resolver fails for one file:

```text
mark unresolved
continue graph
```

Robustness is part of security.

---

# 149. Unsupported Surface Handling

If a repository appears to use an unsupported execution surface:

```text
UNSUPPORTED_EXECUTION_SURFACE
```

Potential future:

```text
SURFACE_DETECTED_BUT_UNSUPPORTED
```

This is preferable to silently ignoring it.

---

# 150. Coverage Reporting

Optional scan summary:

```text
Supported surfaces analyzed: 6
Unsupported candidate surfaces: 2
Unresolved references: 1
```

This helps users understand analysis coverage.

---

# 151. “No Findings” Output

Do not say:

```text
Repository safe.
```

Say:

```text
No high-risk execution paths detected in supported surfaces.
```

This is scientifically safer.

---

# 152. “No Surfaces” Output

```text
No supported repository-controlled execution surfaces detected.
```

This does not imply no execution behavior exists anywhere.

---

# 153. “Unsupported” Warning

If unsupported formats are found:

```text
2 candidate execution surfaces were not analyzed because their
formats are not currently supported.
```

This prevents false confidence.

---

# 154. Security Review Checklist

Before demo:

```text
[ ] No target import
[ ] No target require
[ ] No child_process on target commands
[ ] No package install
[ ] No target build
[ ] No network required
[ ] Boundary tests pass
[ ] Symlink tests pass
[ ] Cycle tests pass
[ ] Malformed config tests pass
[ ] Large-file guard passes
[ ] JSON stable
[ ] Baseline safe
```

---

# 155. Dependency Review Checklist

```text
[ ] package.json runtime dependencies empty
[ ] source imports only built-ins
[ ] no dynamic package loading
[ ] no hidden external binaries
[ ] no shell utilities required
[ ] dependency tree empty at runtime
[ ] STDLIB.md complete
```

---

# 156. Demo Review Checklist

```text
[ ] Fixture is deterministic
[ ] No actual malicious payload
[ ] No external internet dependency
[ ] Graph visibly works
[ ] Risk explanation visible
[ ] Baseline/diff works
[ ] zero-dependency proof visible
[ ] 5-minute flow rehearsed
```

---

# 157. Judge-Defense Checklist

If challenged on uniqueness:

```text
Do not say:
“Nobody else does this.”

Say:
“Existing tools cover pieces of this space. Our focus is the repository-wide execution topology connecting supported surfaces and tracking changes to that topology.”
```

If challenged on static analysis:

```text
“We do not claim perfect semantic understanding. We show what we can resolve, preserve evidence, and mark dynamic behavior as unresolved.”
```

If challenged on security:

```text
“We analyze the repository as inert data and never execute the target to determine the result.”
```

---

# 158. Technical Debt Rules

Do not take debt in:

- target execution safety,
- repository boundary,
- dependency compliance,
- evidence integrity,
- deterministic graph identity.

Acceptable debt:

- terminal styling,
- additional adapters,
- semantic diff,
- SARIF,
- interactive visualization.

---

# 159. Scope Lock

Once Day 1 starts:

No new primary ecosystem unless:

1. current P0 surfaces are stable,
2. graph engine is stable,
3. tests are passing,
4. demo path works.

This protects the core.

---

# 160. Definition of Done — Scanner

Scanner is done when:

```text
given repository path
→ safely walks repository
→ identifies supported surfaces
→ does not execute anything
→ produces deterministic normalized surfaces
```

---

# 161. Definition of Done — Resolver

Resolver is done when:

```text
config
→ local script
→ secondary script
→ capability
```

can be traced with evidence, cycle handling, and boundary enforcement.

---

# 162. Definition of Done — Graph

Graph is done when:

```text
multi-file path
```

is represented explicitly and displayed as a path.

---

# 163. Definition of Done — Capability Engine

Capability engine is done when:

```text
core signals
```

produce reproducible evidence.

---

# 164. Definition of Done — Risk

Risk engine is done when every HIGH/CRITICAL result can be explained through a deterministic rule.

---

# 165. Definition of Done — Baseline

Baseline is done when a trusted execution-surface snapshot can be created without modifying the target beyond intended metadata.

---

# 166. Definition of Done — Diff

Diff is done when:

```text
new
changed
removed
```

surfaces can be identified reliably.

---

# 167. Definition of Done — Zero Dependency

Zero-dependency is done when:

- runtime dependency manifest is empty,
- runtime source imports only standard library,
- no external runtime tool is required,
- proof is documented and reproducible.

---

# 168. Definition of Done — Documentation

README answers:

```text
what
why
how
limitations
zero-dependency
supported ecosystems
```

STDLIB answers:

```text
what package functionality was replaced
what standard library API replaced it
why
```

---

# 169. Final Implementation Priority Graph

```text
                    CORE VALUE
                        │
                        ▼
              EXECUTION SURFACE
                        │
                        ▼
                    TRIGGER
                        │
                        ▼
                    COMMAND
                        │
                        ▼
                   REFERENCE
                        │
                        ▼
                      GRAPH
                        │
                        ▼
                   CAPABILITY
                        │
                        ▼
                       RISK
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
           REPORT              BASELINE
                                  │
                                  ▼
                                 DIFF
```

If a feature does not strengthen this flow, it is probably secondary.

---

# 170. Final Engineering Priority Order

The final research identifies the priority as:

```text
1. Execution-surface normalization
2. Reference resolution
3. Execution graph
4. Capability inference
5. Path-based risk
6. Baseline/diff
7. Reporting / UX
```

This ordering is explicitly supported by the consolidated research. fileciteturn11file3L731-L745

---

# 171. Final Product Contract

## Name

**HookAudit**

## Category

**Repository Execution-Surface Auditor**

## Primary user

Developer working with an unfamiliar or changing repository.

## Primary moment

Before trust.

## Secondary moment

After trust, when execution behavior changes.

## Primary engine

Execution graph.

## Primary output

Evidence-backed execution paths.

## Primary risk model

Deterministic rules.

## Primary persistence

Baseline + diff.

## Runtime

Node.js standard library only.

## Network

Not required for core analysis.

## Target repository execution

Never.

---

# 172. Final Non-Goals

The product does not promise:

```text
malware detection
vulnerability management
dependency vulnerability scanning
complete source SAST
complete SBOM verification
complete provenance verification
full code interpretation
full shell interpretation
perfect execution prediction
```

---

# 173. Final MVP Contract in One Block

```text
INPUT
Repository path

DISCOVER
Supported execution surfaces

NORMALIZE
Canonical ExecutionSurface objects

EXTRACT
Triggers + commands + references

RESOLVE
Safe local references

GRAPH
Multi-hop execution topology

INFER
Reachable capabilities

SCORE
Deterministic path-based risk

REPORT
Human + JSON evidence

BASELINE
Trusted execution snapshot

DIFF
New/changed/removed execution surfaces

INVARIANTS
No target execution
Zero runtime dependencies
Bounded repository access
Deterministic results
Evidence-backed findings
Honest uncertainty
```

---

# 174. Final Go-Live Checklist

## Product

- [ ] Core user question locked
- [ ] Primary use case locked
- [ ] Positioning locked
- [ ] Scope locked

## Architecture

- [ ] normalized model
- [ ] adapters
- [ ] resolver
- [ ] graph
- [ ] capabilities
- [ ] risk
- [ ] baseline
- [ ] diff
- [ ] reporting

## Security

- [ ] no target execution
- [ ] boundary enforcement
- [ ] symlink policy
- [ ] cycle handling
- [ ] size limits
- [ ] dynamic behavior reporting

## Zero Dependency

- [ ] zero runtime dependencies
- [ ] built-ins only
- [ ] no hidden commands
- [ ] dependency proof
- [ ] STDLIB.md

## Testing

- [ ] safe fixture
- [ ] network fixture
- [ ] download fixture
- [ ] bootstrap fixture
- [ ] obfuscation fixture
- [ ] cross-tool fixture
- [ ] nested fixture
- [ ] cycle fixture
- [ ] malformed fixture
- [ ] traversal fixture
- [ ] baseline fixture
- [ ] diff fixture

## Demo

- [ ] 5-minute flow
- [ ] deterministic
- [ ] no real malware
- [ ] graph visible
- [ ] baseline/diff visible
- [ ] zero-dependency proof visible

---

# 175. Final Acceptance Decision

The implementation is ready for hackathon submission only when:

```text
CORE SCANNER
        +
EXECUTION GRAPH
        +
CAPABILITY ANALYSIS
        +
PATH-BASED RISK
        +
BASELINE/DIFF
        +
SAFE ANALYSIS
        +
ZERO DEPENDENCY
        +
TESTS
        +
DOCUMENTATION
```

all work together end-to-end.

---

# 176. Final Product Thesis

> **HookAudit does not ask merely which files look suspicious. It asks what execution behavior the repository can reach, through which trust boundary, with which capabilities, and how that execution surface changes over time.**

This is the implementation thesis we should preserve.

---

# 177. Final Implementation Instruction

Before beginning coding, the implementation team/agent must treat this document as the contract.

Do not:

- broaden scope without justification,
- change the core abstraction,
- add hidden dependencies,
- execute target content,
- weaken boundary controls,
- replace deterministic risk with opaque scoring,
- remove evidence from findings,
- turn risk into a malware verdict,
- add integrations before the graph engine is stable.

Do:

- build the execution graph deeply,
- make relationships explicit,
- preserve evidence,
- prioritize safe analysis,
- keep the core local,
- keep runtime dependencies at zero,
- test adversarially,
- document limitations honestly.

---

# 178. Final One-Line Build Rule

> **Build the graph first, prove the safety second, polish the experience third.**

---

# 179. Final One-Line Product Rule

> **Before you trust a repository, know what it can execute.**

---

# 180. Final Status

**IMPLEMENTATION READY — SUBJECT TO OFFICIAL RULE VERIFICATION AND CURRENT PLATFORM-SEMANTICS CHECKS BEFORE SUBMISSION.**

The research baseline is a GO for HookAudit with the execution-topology framing. fileciteturn11file9L1671-L1692

The MVP is intentionally deeper rather than broader, with the graph/ref-resolution engine protected as the central technical differentiator. fileciteturn11file1L191-L228

