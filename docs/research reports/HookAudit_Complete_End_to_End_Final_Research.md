# HookAudit — Complete End-to-End Research & Product Definition

## Zero Dependency 72-Hour Hackathon 2026

> **Status:** Consolidated research baseline for HookAudit.
>
> **Purpose:** Establish the problem, threat model, user workflow, competitive position, execution-surface model, architecture, technical feasibility, MVP scope, security boundaries, testing strategy, demo strategy, hackathon fit, and implementation gate before production coding.
>
> **Core thesis:** HookAudit should be built as a **repository execution-topology auditor**, not as a generic hook scanner.

---

# 1. Executive Summary

## 1.1 Final direction

HookAudit is a proposed local security tool that treats modern repositories as potential **execution control planes**.

A repository may contain more than application code and dependency manifests. It can also contain:

- AI-agent configuration
- IDE/workspace configuration
- automatic tasks
- package lifecycle scripts
- development hooks
- setup/bootstrap scripts
- automation relationships

These artifacts can create execution paths that are difficult to understand when each file is examined in isolation.

HookAudit's purpose is therefore:

> **Discover, normalize, resolve, graph, explain, and track repository-controlled execution surfaces.**

The strongest user question is:

> **“What can this repository cause to execute, through which trigger, with which reachable capabilities, and what changed since I trusted it?”**

The strongest product sentence is:

> **HookAudit turns hidden repository automation into an explicit, reviewable execution graph.**

The project should not be framed as:

- a generic malware detector,
- a dependency vulnerability scanner,
- a Claude-only hook scanner,
- a perfect static analyzer,
- or the first AI security scanner.

Existing tools already overlap with pieces of this space. The defensible wedge is:

```text
Repository-wide execution topology
+
Cross-tool relationship analysis
+
Reference resolution
+
Capability reachability
+
Path-based risk reasoning
+
Execution-surface baseline/diff
+
Zero third-party runtime dependencies
```

---

# 2. Research Starting Point

This consolidated document combines:

1. The prior broad Zero Dependency research.
2. The independent trust-local/SBOM research.
3. The HookAudit specification.
4. The comprehensive-study methodology.
5. The latest HookAudit-specific research.
6. The current 2026 ecosystem findings referenced by those reports.

The prior research first compared:

- **Preflight**
- **trust-local**
- **HookAudit**

and then moved HookAudit forward as the strongest candidate.

The latest HookAudit research explicitly concludes that the idea is stronger when framed as **repository execution topology** rather than simple hook scanning.

---

# 3. Research Methodology

The investigation follows a systems-oriented methodology:

```text
DEFINE THE SYSTEM
        ↓
DEFINE BOUNDARIES
        ↓
MAP COMPONENTS
        ↓
MAP STAKEHOLDERS
        ↓
TRACE COMPLETE LIFECYCLE
        ↓
IDENTIFY FAILURE MODES
        ↓
MAP EXISTING CONTROLS
        ↓
MAP EXISTING TOOLS
        ↓
FIND GAPS
        ↓
TEST COUNTER-EVIDENCE
        ↓
BUILD CAUSAL MODEL
        ↓
DEFINE INTERVENTION
        ↓
VALIDATE TECHNICAL FEASIBILITY
        ↓
VALIDATE USER VALUE
        ↓
RED-TEAM
        ↓
FINAL PRODUCT DECISION
```

A major principle is:

> **Do not begin by defending HookAudit. Begin by investigating whether the problem and gap are real.**

The research must actively seek evidence that would invalidate:

- the problem,
- the urgency,
- the differentiation,
- the execution-graph value,
- the zero-dependency advantage,
- the 72-hour feasibility,
- or the adoption case.

---

# 4. Research Scope

## 4.1 Primary domain

Software repository execution and trust.

## 4.2 Main focus

- AI coding agents
- AI-agent hooks
- IDE/workspace automation
- repository-local hooks
- package lifecycle execution
- Git/development automation
- setup/bootstrap scripts
- configuration-controlled commands
- cross-file execution chains
- capability inference
- baseline/diff
- local/offline security
- software supply-chain security
- AI-assisted development

## 4.3 Time scope

Primary emphasis:

**2025–2026**

Older incidents are used for historical context.

## 4.4 Geographic scope

Global.

## 4.5 Technical scope

Local developer/security software that can plausibly run with:

- no third-party runtime dependencies,
- no target-repository installation,
- no target-repository execution,
- no cloud backend required for the core scan.

---

# 5. The Real Problem

## 5.1 Traditional repository model

Historically:

```text
Repository
├── source
├── dependencies
└── configuration
```

## 5.2 Modern repository model

Increasingly:

```text
Repository
├── source
├── dependency manifests
├── lockfiles
├── AI-agent configuration
├── IDE/workspace configuration
├── hooks
├── tasks
├── setup scripts
├── build automation
└── development automation
```

Some of these files can influence or trigger execution.

Therefore:

```text
Repository
        ↓
Executable configuration
        ↓
Trigger
        ↓
Execution path
        ↓
Capabilities
```

The repository is not only a source tree.

It can also act as an **execution control plane**.

---

# 6. Why This Matters

Modern developer environments increasingly include automation and AI agents that can:

- execute commands,
- call tools,
- run scripts,
- read project configuration,
- react to lifecycle events,
- invoke local processes,
- access local files,
- and interact with external resources.

This creates a new trust boundary:

```text
repository content
        ↓
development tool
        ↓
execution
```

The security question shifts from:

> “Does this source code contain a known vulnerability?”

to:

> **“What behavior can this repository cause my development environment to perform?”**

---

# 7. Important 2026 Nuance

A simplistic statement such as:

> “Cloning a repository immediately executes malicious hooks.”

is too broad.

Modern tooling includes:

- trust prompts,
- workspace trust,
- execution restrictions,
- allowlists,
- safer defaults,
- changing hook activation behavior.

Therefore HookAudit should not assume:

```text
CLONE = EXECUTION
```

Instead model:

```text
REPOSITORY
    ↓
EXECUTION CONDITION
    ↓
TRIGGER
    ↓
COMMAND
    ↓
CAPABILITY
```

The correct security question is:

> **What execution behavior becomes reachable once the repository enters a user's relevant trusted or active tool context?**

---

# 8. Complete Lifecycle

## 8.1 Repository / agent lifecycle

```text
Developer / AI agent
        ↓
Repository selected
        ↓
Repository cloned
        ↓
Repository inspected
        ↓
Repository opened / trusted
        ↓
Project configuration loaded
        ↓
Automatic trigger
        ↓
Command / script
        ↓
Secondary script / file
        ↓
Process / filesystem / network
        ↓
Build
        ↓
Release
        ↓
Deployment
        ↓
Runtime
```

## 8.2 Dependency lifecycle

```text
Dependency intent
        ↓
Manifest
        ↓
Version resolution
        ↓
Lockfile
        ↓
Registry
        ↓
Download
        ↓
Install
        ↓
Lifecycle scripts
        ↓
Build
```

HookAudit does not replace dependency scanners. It focuses on the repository-controlled execution surfaces that sit around this lifecycle.

---

# 9. Stakeholders

## 9.1 AI-assisted developer

Problem:

May not know that project configuration can trigger commands or affect agent behavior.

Need:

Fast, understandable pre-trust visibility.

## 9.2 Security engineer

Problem:

Must evaluate repository risk across multiple execution environments.

Need:

Evidence, execution paths, and machine-readable results.

## 9.3 Open-source maintainer

Problem:

Repository changes can introduce new automated behavior.

Need:

Execution-surface visibility and meaningful change detection.

## 9.4 Platform / CI engineer

Problem:

Repositories entering CI can carry automation surfaces.

Need:

Deterministic gates and JSON/exit-code integration.

## 9.5 Incident responder

Problem:

After compromise, difficult to identify newly introduced automation.

Need:

Baseline/diff and execution-path history.

---

# 10. Execution-Surface Taxonomy

HookAudit should define an execution surface as:

> **A repository-controlled configuration, script, or automation relationship that can cause commands or code to execute under a user's development-tool context.**

## 10.1 AI-agent surfaces

Examples:

- Claude Code project settings/hooks
- Cursor project hooks
- repository-local agent configuration
- plugin/skill configuration where supported
- other documented agent-local execution surfaces

## 10.2 IDE/workspace surfaces

Examples:

- VS Code tasks
- workspace hooks
- automatic folder/workspace events
- workspace-controlled automation

## 10.3 Package lifecycle surfaces

Examples:

- `preinstall`
- `install`
- `postinstall`
- `prepare`
- package-manager-controlled bootstrap scripts

## 10.4 Development-hook surfaces

Examples:

- `.husky/`
- committed development automation
- setup scripts that install/configure hooks
- repository-controlled hook paths

## 10.5 Build/CI surfaces

Potential future scope:

- repository-controlled workflows
- build scripts
- CI setup scripts

The MVP should avoid uncontrolled expansion.

---

# 11. Initial Ecosystem Focus

The recommended primary focus is:

### 1. Claude Code

Reason:

- central to the original problem model,
- documented repository-local hooks/settings,
- strong relevance to AI-assisted development.

### 2. VS Code

Reason:

- large developer ecosystem,
- repository/workspace automation,
- well-known task execution surface.

### 3. Cursor

Reason:

- project-level hooks,
- AI-agent integration,
- relevant modern agent execution surface.

Additional support:

- npm lifecycle
- committed development-hook mechanisms such as Husky

Do not make every AI agent a core requirement.

The architecture should use adapters:

```text
Claude adapter ─┐
VS Code adapter ├──> normalized execution surface
Cursor adapter ─┤
npm adapter ────┤
Husky adapter ──┘
```

This gives breadth through the architecture without forcing shallow support for many ecosystems.

---

# 12. Depth vs Breadth

The 72-hour constraint strongly favors **depth**.

Preferred:

```text
3 primary ecosystems
+
strong parsing
+
accurate reference resolution
+
execution graph
+
capability inference
+
path-based reasoning
```

over:

```text
12 ecosystems
+
basic regex
+
weak relationships
+
high false-positive rate
```

The core engineering priority should be:

```text
Execution graph quality
>
Number of integrations
```

---

# 13. Core User Questions

Every scan should answer:

### Q1 — What can execute?

Identify execution surfaces.

### Q2 — When can it execute?

Identify triggers and conditions.

### Q3 — What executes?

Identify command/script/process.

### Q4 — What does it reach?

Resolve referenced files and scripts.

### Q5 — What capabilities become reachable?

Examples:

- network
- remote download
- process spawn
- runtime bootstrap
- filesystem access
- environment/credential access
- shell execution
- obfuscation signal

### Q6 — What changed?

Compare against a trusted baseline.

---

# 14. Core Execution Graph

## 14.1 Nodes

Potential nodes:

- Repository
- Config
- Trigger
- Command
- Script
- File
- Process
- Network endpoint
- Environment
- Capability

## 14.2 Edges

Potential edges:

- TRIGGERS
- EXECUTES
- REFERENCES
- SPAWNS
- CONNECTS_TO
- DOWNLOADS
- LOADS
- READS
- WRITES

Example:

```text
.claude/settings.json
        │
        ├── TRIGGERS ──> SessionStart
        │
        └── EXECUTES ──> scripts/setup.mjs
                              │
                              ├── SPAWNS ──> powershell
                              │
                              └── CONNECTS_TO ──> remote host
```

The graph is the core technical object.

---

# 15. Why the Graph Matters

A file-by-file scanner may produce:

```text
settings.json → suspicious
setup.mjs → network
tasks.json → automatic
```

HookAudit should connect these into:

```text
SessionStart
    ↓
settings.json
    ↓
setup.mjs
    ↓
tasks.json
    ↓
remote request
```

This is more informative because the risk often exists in the **relationship**, not in one file.

---

# 16. Cross-Tool Relationship Analysis

Potential pattern:

```text
.claude/settings.json
        ↓
scripts/bootstrap.mjs
        ↓
.vscode/tasks.json
        ↓
setup.ps1
        ↓
network download
```

Even if each individual file appears relatively benign, the combined execution path may warrant review.

This is the strongest candidate for the product's differentiation.

---

# 17. Reference Resolution

The hardest core problem is not JSON parsing.

It is resolving execution references without executing target code.

Example:

```text
settings.json
    ↓
./scripts/setup.mjs
    ↓
../shared/bootstrap.sh
    ↓
node another.js
```

Resolver responsibilities:

1. detect a reference,
2. normalize it,
3. enforce repository boundary rules,
4. read referenced content as inert data,
5. identify further references,
6. recursively expand the graph,
7. detect cycles,
8. retain evidence for every graph edge.

Resolution states:

```text
RESOLVED
PARTIALLY_RESOLVED
UNRESOLVED
```

Do not pretend arbitrary dynamic references can always be statically resolved.

---

# 18. Capability Inference

The tool should infer capabilities without executing target code.

Examples:

```text
curl
wget
Invoke-WebRequest
        ↓
NETWORK_DOWNLOAD
```

```text
bash -c
sh -c
powershell -Command
        ↓
SHELL_EXECUTION
```

```text
node
python
direct executable
        ↓
PROCESS_EXECUTION
```

```text
base64 -d
certutil
encoded blob
        ↓
OBFUSCATION / DECODED_PAYLOAD_SIGNAL
```

The goal is **explainable capability inference**, not perfect language interpretation.

---

# 19. Path-Based Risk Model

Weak:

```text
curl = HIGH
```

Stronger:

```text
automatic trigger
+
repository-controlled
+
network
+
remote download
+
process execution
```

Potentially:

```text
HIGH / CRITICAL
```

Risk should be a property of the **execution path**.

---

# 20. Recommended Risk Levels

## LOW

Execution surface exists but behavior appears routine/low-impact.

## MEDIUM

Automatic or unusual behavior requires review.

## HIGH

Multiple concerning signals combine along an executable path.

## CRITICAL

A high-impact combination exists, for example:

```text
automatic trigger
+
remote network access
+
download
+
process execution
+
obfuscation
```

These categories are analytical policy, not absolute proof of maliciousness.

---

# 21. Critical Security Boundary: Risk ≠ Malware

HookAudit must explicitly state:

> **RISK SCORE ≠ MALWARE VERDICT**

Static analysis cannot guarantee:

- malware absence
- vulnerability absence
- backdoor absence
- safe behavior
- complete shell understanding
- complete dynamic behavior

Potential blind spots:

- dynamic command construction
- arbitrary shell semantics
- remote payloads
- encrypted/packed content
- environment-dependent execution
- indirect execution
- platform-specific behavior

The correct output model is:

```text
EVIDENCE
+
SIGNALS
+
EXECUTION PATH
+
LIMITATIONS
```

---

# 22. Safe-Analysis Principle

This is non-negotiable.

## Never do this

```text
hookaudit
   ↓
execute target setup
   ↓
observe what happens
```

## Do this

```text
hookaudit
   ↓
read configuration
   ↓
extract trigger
   ↓
extract command
   ↓
resolve referenced files
   ↓
analyze content
   ↓
build graph
   ↓
report
```

The target repository remains inert during analysis.

---

# 23. Pre-Trust Workflow

The strongest workflow is:

```text
Clone repository
        ↓
DO NOT trust/open it in the target tool yet
        ↓
hookaudit .
        ↓
Execution-surface report
        ↓
TRUST / REVIEW / REMOVE / BLOCK
        ↓
Open / install / interact
```

This turns HookAudit into a **pre-trust visibility layer**.

---

# 24. Continuous Trust Workflow

After the repository is trusted:

```text
hookaudit baseline .
        ↓
trusted execution state
        ↓
repository changes
        ↓
hookaudit diff .
        ↓
new / changed / removed execution surfaces
```

This supports a second product question:

> **“Has the repository's automatic execution behavior changed since I trusted it?”**

A changed surface is a **review event**, not automatically malicious.

---

# 25. Baseline / Diff Design

## 25.1 Level 1 — File diff

Use SHA-256.

Detect:

- NEW
- CHANGED
- REMOVED

## 25.2 Level 2 — Structural diff

Detect:

- new trigger
- removed trigger
- changed command
- new referenced path
- removed referenced path

## 25.3 Level 3 — Capability diff

Detect:

- new network capability
- new download capability
- new process spawn
- new runtime bootstrap
- new obfuscation signal
- new environment/credential access

## 25.4 Level 4 — Execution-path diff

Future/high-value enhancement:

```text
BEFORE:
SessionStart
→ formatter

AFTER:
SessionStart
→ formatter
→ network
```

Report:

```text
NEW REACHABLE CAPABILITY:
NETWORK

NEW EXECUTION PATH:
SessionStart → formatter → external request
```

The MVP should guarantee file-level diff and structural/capability summaries where feasible. Full semantic execution diff is a stretch goal.

---

# 26. Important Git Hook Modeling

Do not treat:

```text
.git/hooks/
```

as ordinary version-controlled content.

Native Git hooks have repository-internal semantics and configurable hook paths.

The analyzer should distinguish:

```text
repository-committed automation
```

from:

```text
local machine Git hook state
```

Potential committed surfaces:

- `.husky/`
- hook-install/setup scripts
- configured hook paths
- other repository-controlled development automation

---

# 27. npm Lifecycle Modeling

npm lifecycle scripts remain a relevant execution surface, but modern npm behavior changes the threat model.

The analyzer should detect:

- lifecycle scripts
- script presence
- relevant policy/allowlist settings where supported
- package-lock metadata where useful
- relationships to setup scripts

The output should describe:

```text
INSTALL-TIME EXECUTION SURFACE
```

rather than:

```text
MALWARE
```

A lifecycle script is not inherently malicious.

---

# 28. Existing Competitive Landscape

The research identified meaningful overlap.

Relevant examples include:

- Snyk Agent Scan
- agent-hook-scan
- AgentGuard
- Claude-specific hook scanners
- other agent/configuration security scanners
- dependency scanners
- SAST
- secret scanners

Therefore:

> **“Nobody scans this.”**

must not be used.

Nor:

> **“HookAudit is the first AI hook scanner.”**

The competitive question is:

> **What does HookAudit do at the execution-topology level that individual configuration scanners do not provide adequately?**

---

# 29. Competitive Positioning

## Dependency scanners

Question:

> “Is package X vulnerable?”

## SAST

Question:

> “Does application source contain a code vulnerability?”

## Secret scanners

Question:

> “Does source contain credential-like material?”

## Agent/configuration scanners

Question:

> “Does this agent configuration contain suspicious patterns?”

## HookAudit

Question:

> **“What automatic execution paths can this repository create across its supported development surfaces, what capabilities are reachable along those paths, and what changed since the trusted baseline?”**

This is the desired distinction.

---

# 30. The Real Differentiator

Weak differentiators:

```text
zero dependencies
offline
CLI
AI security
```

These are useful, but not sufficient on their own.

Strong differentiators:

```text
Repository-wide execution topology
+
Cross-tool relationship analysis
+
Reference resolution
+
Capability reachability
+
Path-based risk
+
Execution-surface baseline/diff
```

The feature must be visible in the product behavior, not only in marketing.

---

# 31. The “Not Just Grep” Test

A grep tool can find:

```text
curl
eval
base64
```

HookAudit should determine:

```text
.claude/settings.json
        ↓
SessionStart
        ↓
scripts/init.sh
        ↓
curl
```

The important unit is:

```text
EXECUTION PATH
```

not:

```text
MATCHED STRING
```

---

# 32. The “Not Just a Hook Linter” Test

Weak:

```text
Found .claude/settings.json
```

Stronger:

```text
TRIGGER:
SessionStart

PATH:
.claude/settings.json
   ↓
scripts/setup.mjs
   ↓
network download
   ↓
process execution

REACHABLE CAPABILITIES:
NETWORK
REMOTE DOWNLOAD
PROCESS SPAWN

RISK:
HIGH

ACTION:
REVIEW
```

This is the intended product behavior.

---

# 33. AI-Agent Security Relevance

AI did not create repository execution surfaces.

However, AI-assisted development increases the number of systems that:

- consume repository configuration,
- execute commands,
- invoke tools,
- use project-local instructions,
- load hooks/plugins/skills.

Therefore the thesis is:

> **Repository-local configuration is becoming an increasingly important execution boundary in AI-assisted development.**

Do not frame AI as inherently malicious.

---

# 34. Product Framing

## Primary positioning

> **HookAudit — See what a repository can execute before you trust it.**

Alternative:

> **Audit repository execution surfaces before they become execution.**

Long-form:

> HookAudit is a zero-dependency local security auditor that maps repository-controlled automatic execution paths across supported AI agents, editors, package managers, and development automation, explains the capabilities reachable through those paths, and detects how those surfaces change over time.

---

# 35. User Journey

```text
DISCOVERY
   ↓
DOWNLOAD / RUN
   ↓
SCAN
   ↓
FINDING
   ↓
UNDERSTAND PATH
   ↓
TRUST DECISION
   ↓
BASELINE
   ↓
FUTURE DIFF
```

The user should not have to understand a security framework.

They should be able to answer:

```text
WHAT?
WHEN?
WHY?
WHERE?
WHAT DOES IT REACH?
WHAT CHANGED?
```

---

# 36. Recommended CLI

```bash
hookaudit .
```

Scan.

```bash
hookaudit baseline .
```

Create baseline.

```bash
hookaudit diff .
```

Compare to baseline.

```bash
hookaudit . --json
```

Machine-readable report.

```bash
hookaudit . --strict
```

Return non-zero status for policy-defined high-risk paths.

Potential future:

```bash
hookaudit explain <finding>
```

---

# 37. Recommended Default Output

Start with a concise summary:

```text
HOOKAUDIT

Repository: example-project

Execution surfaces: 6
High-risk paths:     2
New since baseline:  1

Trust decision: REVIEW
```

Then explain the highest-risk path:

```text
[HIGH] SessionStart

.claude/settings.json
        ↓
scripts/bootstrap.mjs
        ↓
NETWORK DOWNLOAD
        ↓
PROCESS EXECUTION

Why:
Automatic repository-controlled execution reaches an external
resource and a process-launch capability.
```

Avoid dumping dozens of raw findings first.

---

# 38. Machine-Readable Output

Minimum:

```json
{
  "repository": "...",
  "risk": "high",
  "executionSurfaces": [],
  "paths": [],
  "capabilities": [],
  "recommendation": "review"
}
```

Potential future:

- SARIF
- CI annotations
- policy files

Only implement these if they provide real value within the time limit.

---

# 39. Zero-Dependency Advantage

The strongest argument is:

> A security scanner intended for untrusted repositories should not require the target repository's dependency tree to be installed or executed merely to inspect its execution surfaces.

Ideal model:

```text
Untrusted repository
        ↓
NO npm install
NO pip install
NO target build
NO target execution
        ↓
HookAudit
        ↓
Read configuration as inert data
        ↓
Analyze
```

Benefits:

- low bootstrap friction
- local operation
- offline capability for supported checks
- easier auditability
- small runtime dependency surface
- predictable behavior
- simple distribution

Do not claim:

```text
ZERO SECURITY RISK
```

Use:

> **Zero third-party runtime dependencies.**

---

# 40. Standard-Library Feasibility

Node.js is the preferred implementation language in the current design.

Core capabilities can use:

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

Potential uses:

```text
filesystem walking
JSON parsing
SHA-256
path normalization
CLI handling
streams
testing
process metadata
```

No runtime packages.

---

# 41. Example Package Substitutions

Potential STDLIB substitutions:

```text
glob
→ node:fs + recursive traversal

commander / yargs
→ process.argv / node:util

chalk
→ ANSI escape codes

uuid
→ internal deterministic IDs / suitable standard primitive

table formatter
→ custom fixed-width renderer

diff package
→ custom structural diff

external hashing utility
→ node:crypto
```

Only meaningful substitutions should be included in `STDLIB.md`.

---

# 42. Technical Architecture

```text
                         REPOSITORY
                              │
                              ▼
                     SURFACE DISCOVERY
                              │
                              ▼
                     CONFIGURATION PARSERS
                              │
                              ▼
                      TRIGGER EXTRACTION
                              │
                              ▼
                      COMMAND EXTRACTION
                              │
                              ▼
                     REFERENCE RESOLVER
                              │
                              ▼
                   EXECUTION GRAPH ENGINE
                              │
                              ▼
                   CAPABILITY INFERENCE
                              │
                              ▼
                     PATH-BASED RISK
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              HUMAN REPORT        JSON REPORT
                    │
                    ▼
                BASELINE
                    │
                    ▼
                  DIFF
```

---

# 43. Logical Modules

```text
scanner
parser
surface
extractor
resolver
graph
capability
risk
hash
baseline
diff
report
cli
```

Suggested responsibility:

## scanner

Find candidate files.

## parser

Interpret supported structured formats.

## surface

Normalize ecosystem-specific execution surfaces.

## extractor

Extract triggers and commands.

## resolver

Resolve referenced local files.

## graph

Build nodes/edges.

## capability

Infer reachable behaviors.

## risk

Score execution paths.

## hash

SHA-256.

## baseline

Persist trusted execution state.

## diff

Compare current and trusted state.

## report

Human and JSON output.

## cli

Commands/arguments/exit codes.

---

# 44. Canonical Data Model

## ExecutionSurface

```text
ExecutionSurface
{
    sourcePath
    surfaceType
    triggerType
    command
    referencedPaths[]
    capabilities[]
    evidence[]
    severity
    confidence
}
```

## Execution graph

```text
ExecutionNode
ExecutionEdge
```

## Snapshot

```text
ExecutionSnapshot
{
    version
    surfaces[]
    graphHash
    fileHashes[]
}
```

## Diff

```text
ExecutionDiff
{
    newPaths[]
    changedPaths[]
    removedPaths[]
    newCapabilities[]
    removedCapabilities[]
}
```

---

# 45. Repository Boundary Security

The scanner itself must have a secure filesystem model.

Research and handle:

- `../`
- absolute paths
- symlinks
- Windows junctions
- drive paths
- UNC paths
- cycles
- oversized files
- very deep directories

Default policy should prevent uncontrolled traversal outside the intended repository boundary unless explicitly supported.

---

# 46. Performance / Scale

The tool must account for:

- monorepos
- `node_modules`
- generated directories
- binaries
- very large files
- deep nesting

Recommended behavior:

- exclude obvious generated/vendor directories by default where appropriate,
- only inspect prioritized execution surfaces deeply,
- avoid reading arbitrary binaries,
- cap recursion depth where necessary,
- cap file size for content scanning,
- detect cycles,
- preserve deterministic traversal order.

---

# 47. Cross-Platform Analysis

Target:

- Windows
- Linux
- macOS

Need to account for:

- path separators
- shell types
- PowerShell
- Bash/sh
- command syntax
- executable extensions
- symlinks
- permissions

Do not promise complete behavioral equivalence across shells.

---

# 48. Shell Analysis Strategy

Do not build a full shell interpreter.

Use normalized high-signal patterns.

Example:

```text
curl / wget / Invoke-WebRequest
→ network/download capability
```

```text
bash -c / sh -c / powershell -Command
→ shell execution
```

```text
node / python / executable
→ process execution
```

```text
eval / dynamic reconstruction
→ dynamic execution signal
```

```text
base64 / certutil / encoded blobs
→ obfuscation signal
```

Always include evidence.

---

# 49. False-Positive Analysis

Legitimate execution surfaces include:

- formatters
- tests
- code generation
- environment setup
- language server bootstrap
- workspace tasks
- package preparation

Therefore:

```text
hook exists
```

must not imply:

```text
HIGH
```

Use context:

```text
automaticity
+
reachability
+
capability
+
externality
+
obfuscation
+
novelty
```

to determine severity.

---

# 50. False-Negative Analysis

Potential evasion:

- dynamic commands
- indirect execution
- runtime-generated scripts
- remote second stages
- environment-dependent branches
- unusual interpreters
- encoded payloads
- multi-stage chains
- generated configuration

The correct response is:

```text
UNRESOLVED
DYNAMIC
REVIEW
```

rather than pretending certainty.

---

# 51. Adversarial Attacks Against HookAudit

## Attack 1 — “It is just grep.”

Response:

The graph resolves triggers and references across files.

Remaining weakness:

Static analysis still has language/semantic limits.

## Attack 2 — “Other tools already scan this.”

Response:

Do not compete as a generic scanner. Demonstrate execution-topology analysis.

Remaining weakness:

Feature-level overlap must continue to be measured.

## Attack 3 — “Workspace trust already protects users.”

Response:

HookAudit provides explainability and review before the user enters the relevant trusted execution condition.

Remaining weakness:

The value depends on the user actually running the scanner.

## Attack 4 — “Shell regex creates false positives.”

Response:

Treat shell scanning as evidence signals, not full interpretation.

## Attack 5 — “Baseline is only hashing.”

Response:

MVP file hash is a foundation; semantic capability diff can add behavior-level meaning.

## Attack 6 — “Why not build this into the IDE?”

Response:

HookAudit is intentionally cross-tool and local.

Remaining weakness:

Incumbents can potentially copy features.

---

# 52. Current Major Risks

## Risk 1 — Competition

Existing agent/configuration scanners already exist.

### Mitigation

Own the normalized execution graph and path reasoning.

## Risk 2 — Scope explosion

Many ecosystems are possible.

### Mitigation

Deep MVP with three primary ecosystems and selected automation surfaces.

## Risk 3 — Static-analysis limitations

Arbitrary scripts cannot be perfectly interpreted.

### Mitigation

Transparent evidence, confidence and limitations.

## Risk 4 — False positives

Legitimate automation can look suspicious.

### Mitigation

Context-aware path scoring.

## Risk 5 — Adoption

A developer must remember to run the tool.

### Mitigation

Make the pre-trust workflow extremely simple.

## Risk 6 — Platform changes

Security controls may evolve.

### Mitigation

Model configured execution surfaces and execution conditions rather than relying on one vulnerable platform behavior.

---

# 53. What HookAudit Should NOT Claim

Never claim:

```text
“The first AI security scanner.”
```

Never claim:

```text
“Nobody checks these files.”
```

Never claim:

```text
“Existing security tools are completely blind.”
```

Never claim:

```text
“This repository is malware.”
```

Never claim:

```text
“Zero dependencies means zero security risk.”
```

Never claim:

```text
“Any automatic hook is malicious.”
```

Never claim:

```text
“Opening any repository immediately executes code.”
```

Use precise, evidence-backed language.

---

# 54. Strong Product Story

### Step 1

You receive an unfamiliar repository.

### Step 2

You do not know what its automation can execute.

### Step 3

Run:

```bash
hookaudit .
```

### Step 4

HookAudit maps the repository's execution surfaces.

### Step 5

It shows:

```text
trigger
→ command
→ file
→ capability
```

### Step 6

You review the evidence.

### Step 7

You decide:

```text
TRUST
REVIEW
REMOVE
BLOCK
```

### Step 8

Later:

```bash
hookaudit baseline .
hookaudit diff .
```

and you know when the execution surface changes.

---

# 55. Strongest Demo

## 0:00–0:40

Introduce the problem:

> Modern repositories can contain executable configuration, not just source code.

Show:

```text
.claude/
.vscode/
.cursor/
scripts/
package.json
```

## 0:40–1:20

Establish the distinction:

> Dependency vulnerability scanning answers a different question from repository execution analysis.

Do not falsely claim every existing tool misses the surface.

## 1:20–2:50

Run:

```bash
hookaudit .
```

Show:

```text
Trigger
 ↓
Script
 ↓
Secondary file
 ↓
Network / Process
```

Explain:

> HookAudit analyzes target files as inert data.

## 2:50–3:50

Run:

```bash
hookaudit baseline .
```

Change a controlled fixture.

Run:

```bash
hookaudit diff .
```

Show:

```text
NEW EXECUTION PATH
```

## 3:50–4:30

Explain path-based risk:

```text
Automatic trigger
+
Remote download
+
Process execution
```

→

```text
HIGH
```

## 4:30–5:00

Show:

```text
package.json
dependencies: {}
```

and the standard-library implementation.

Finish:

> **“Before you trust a repository, know what it can execute.”**

---

# 56. Demo Fixture Design

Use completely controlled local fixtures.

Required fixtures:

## SAFE

Normal formatter/test hook.

## NETWORK

Automatic hook with harmless network-looking command.

## RUNTIME BOOTSTRAP

Controlled fixture showing download + execution pattern.

## OBFUSCATED

Encoded command signal.

## CROSS-LINKED

Agent config → script A → another tool/config → script B.

## BASELINE CHANGE

Trusted state → new execution path.

## FALSE POSITIVE

Legitimate development automation.

Never execute actual malicious payloads during the demo.

---

# 57. Testing Strategy

Minimum tests:

1. repository with no surfaces
2. legitimate automatic hook
3. network surface
4. runtime/bootstrap surface
5. obfuscated command
6. cross-link
7. nested references
8. cycles
9. missing referenced file
10. malformed JSON
11. path traversal attempt
12. symlink behavior
13. large file
14. baseline
15. changed surface
16. removed surface
17. new capability
18. false-positive fixture

Testing goal:

```text
CORE CORRECTNESS
+
EDGE CASES
+
SECURITY BOUNDARIES
+
DETERMINISM
```

---

# 58. Determinism

The scan should produce deterministic output for the same repository state.

Avoid nondeterministic:

- file ordering
- graph traversal ordering
- report ordering
- generated IDs
- timestamps unless explicitly required

Determinism strengthens:

- testing
- reproducibility
- diffing
- CI behavior
- judge confidence

---

# 59. CI Integration

Core:

```bash
hookaudit . --json
```

Potential strict mode:

```bash
hookaudit . --strict
```

Policy outcome:

```text
PASS
REVIEW
BLOCK
```

Use exit codes intentionally.

Do not require a cloud service.

---

# 60. MVP

## MUST HAVE

1. repository scanner
2. execution-surface normalization
3. Claude configuration/hooks
4. VS Code workspace/task surfaces
5. Cursor hooks
6. npm lifecycle
7. development-hook support where practical
8. trigger extraction
9. command extraction
10. reference resolution
11. recursive execution graph
12. network/download detection
13. process detection
14. runtime-bootstrap detection
15. obfuscation signal
16. capability-aware path risk
17. human report
18. JSON report
19. SHA-256 baseline
20. diff
21. safe inert analysis
22. tests
23. zero runtime dependencies

## SHOULD HAVE

- richer shell heuristics
- more agent adapters
- capability correlation
- semantic diff summaries
- CI strict mode

## NICE TO HAVE

- interactive graph
- HTML report
- policy files
- SARIF
- additional ecosystems

---

# 61. Features Explicitly Out of MVP

Do not attempt:

- full shell AST
- full JavaScript static analysis
- complete YAML parser
- every AI agent
- every IDE
- every CI platform
- perfect malware detection
- dynamic sandboxing
- full registry intelligence
- cloud backend
- machine-learning model
- external threat-intelligence service
- complete Git semantic engine

This is a scope-defense decision.

---

# 62. 72-Hour Execution Plan

## Day 1 — Surface Engine

Deliver:

- CLI skeleton
- repository boundary
- scanner
- Claude parser
- VS Code parser
- Cursor parser
- npm parser
- normalized surface model
- trigger extraction
- command extraction
- basic end-to-end output

End-of-day requirement:

```text
Given fixture repository
→ detect execution surface
→ show trigger
→ show command
```

## Day 2 — Graph + Risk

Deliver:

- reference resolver
- graph
- recursive traversal
- cycle detection
- capability analyzer
- path-based risk engine
- cross-link reporting
- JSON output
- fixture expansion

End-of-day requirement:

```text
config
→ script
→ secondary script
→ capability
```

must be visible as one execution path.

## Day 3 — Trust + Proof + Polish

Deliver:

- baseline
- diff
- capability-change summary
- strict exit codes
- security boundary hardening
- deterministic output
- complete tests
- README
- STDLIB.md
- dependency proof
- demo fixture
- demo video

---

# 63. Engineering Priority Order

The research recommends:

```text
1. Execution-surface normalization
2. Reference resolution
3. Execution graph
4. Capability inference
5. Path-based risk
6. Baseline/diff
7. Reporting / UX
```

This prevents the product from becoming a collection of regexes.

---

# 64. Hardest Technical Problems

## Problem 1 — Reference resolution

Need to resolve local references without execution.

## Problem 2 — Cross-tool normalization

Different ecosystems express triggers and commands differently.

## Problem 3 — Path-based capability inference

Need to reason across multiple files and actions.

## Problem 4 — Cross-platform commands

Need a normalized model without writing full shell interpreters.

## Problem 5 — False-positive control

Need context, not raw keywords.

These deserve more engineering time than terminal decoration.

---

# 65. Performance / Safety Guardrails

Implement:

- maximum scan depth
- maximum file size
- binary detection/skip
- ignored generated/vendor directories
- cycle detection
- symlink policy
- repository-boundary enforcement
- deterministic traversal
- parser timeouts/defensive limits where appropriate

Never import or execute a target source module during static analysis.

---

# 66. Hackathon Rule Fit

HookAudit is most naturally aligned with:

## Track E — Security & Crypto Utilities

Reason:

The tool is a local security auditor and security analysis utility.

Track A — Developer Tools & CLI is also defensible because the product is a developer-facing CLI.

Final track selection should be confirmed against the current official competition wording before submission.

---

# 67. Zero-Dependency Proof

The repository should visibly demonstrate:

```text
runtime dependencies = 0
```

Examples:

```text
package.json
dependencies: {}
```

Runtime imports should be only:

```text
Node built-ins
```

Proof should include:

- dependency manifest
- imports
- dependency tree output
- build command
- test command

The judge should be able to verify the claim quickly.

---

# 68. STDLIB.md Strategy

Document:

```text
Normally:
glob

Instead:
node:fs + node:path

Why:
Recursive local traversal without runtime dependency.
```

And:

```text
Normally:
commander

Instead:
process.argv / node:util

Why:
CLI parsing without a runtime package.
```

And:

```text
Normally:
chalk

Instead:
ANSI escape sequences

Why:
Terminal styling without a package.
```

Only meaningful substitutions count.

---

# 69. Package-Killer Strategy

If pursuing the bonus, identify real package replacements relevant to the actual product:

- CLI parser
- globbing
- terminal formatting
- table rendering
- diff logic
- utility packages
- hashing

Do not build toy clones just for bonus points.

---

# 70. Single-File Strategy

Potential:

```text
hookaudit.js
```

with all core functionality.

Advantages:

- easy distribution
- stronger zero-dependency story
- possible bonus

Risks:

- maintainability
- readability
- debugging complexity

Only do this if it does not compromise engineering quality.

---

# 71. Reproducible Build Strategy

Investigate whether the final build can be deterministic.

Need to control:

- timestamps
- ordering
- generated metadata
- archive details
- Node/runtime version

A reproducible build is valuable only if it can be completed without jeopardizing the core project.

---

# 72. Adoption Model

Potential real triggers:

1. cloning an unfamiliar repository
2. adding a project to an AI coding environment
3. reviewing an unfamiliar PR
4. before enabling workspace trust
5. before installing dependencies
6. after a security incident
7. periodically in CI

Strongest likely initial workflow:

> **Before trusting an unfamiliar repository.**

Secondary:

> **Detecting execution-surface changes after trust.**

---

# 73. Post-Hackathon Product Potential

HookAudit could become:

- standalone developer CLI
- repository pre-trust utility
- CI execution-surface gate
- PR execution-surface analyzer
- baseline monitor
- incident-response helper
- security review component

The strongest long-term direction is likely:

```text
scan once
+
baseline
+
semantic change detection
```

rather than a one-time scanner.

---

# 74. Product Defensibility

Potential defensibility is not “we wrote regex.”

Potential defensibility comes from:

```text
canonical execution-surface model
+
cross-tool normalization
+
execution graph
+
capability ontology
+
path reasoning
+
trusted baseline
+
execution-surface diff
+
local-first architecture
```

However, do not assume this is impossible for incumbents to copy.

The differentiation needs to be demonstrated in the workflow.

---

# 75. Why HookAudit Beats Preflight

Preflight asks:

> **“What dependency am I about to trust?”**

HookAudit asks:

> **“What can this repository automatically execute?”**

Preflight competes more directly with mature dependency-security ecosystems.

HookAudit targets a different trust boundary.

---

# 76. Why HookAudit Beats trust-local

trust-local asks:

> **“Can I verify the integrity/authenticity of a software inventory?”**

HookAudit asks:

> **“What executable behavior is embedded in this repository's configuration and automation?”**

trust-local has a more difficult cryptographic/format-verification path under zero-dependency constraints.

HookAudit has a cleaner standard-library implementation path.

---

# 77. Current Research-Based Assessment

Analytical estimate:

| Dimension | Score |
|---|---:|
| Real-world problem | 9.5/10 |
| 2026 relevance | 10/10 |
| Evidence quality | 9/10 |
| Generic hook-scanner uniqueness | 4/10 |
| Execution-graph uniqueness | 8.5/10 potential |
| Cross-tool correlation | 9/10 potential |
| Baseline/diff value | 9/10 |
| Zero-dependency value | 9/10 |
| Technical depth | 9/10 |
| 72-hour feasibility | 8.5/10 |
| Demo strength | 10/10 |
| Post-hackathon value | 9/10 |
| Overall potential | ~9/10 |

These are analytical estimates, not official competition scores.

---

# 78. Go / No-Go Gate

Proceed to implementation only if:

- [ ] real users have the problem
- [ ] the problem is current
- [ ] current evidence supports the threat model
- [ ] existing tools do not adequately provide the exact workflow
- [ ] execution topology adds real value
- [ ] cross-tool graph analysis is meaningful
- [ ] zero dependencies create real value
- [ ] standard-library feasibility is demonstrated
- [ ] security claims remain modest and defensible
- [ ] scope is controlled
- [ ] 72-hour build is realistic
- [ ] five-minute demo is compelling

Current research status:

# GO

with the **execution-topology framing**.

---

# 79. Final Product Definition

## Project

**HookAudit**

## Category

**Repository Execution-Surface Auditor**

## Core question

> **What can this repository cause to execute automatically, through which trigger, with which reachable capabilities, and what changed since I trusted it?**

## One-line pitch

> **A zero-dependency local security auditor that maps repository-controlled execution paths, explains what they can reach, and detects changes to those paths before they become incidents.**

## Killer feature

**Execution Graph + Capability Reachability**

## Second killer feature

**Execution-Surface Baseline / Diff**

## Core security principle

> **Analyze the repository as inert data; never execute its suspicious automation during analysis.**

---

# 80. Final MVP Architecture

```text
                    REPOSITORY
                        │
                        ▼
                SURFACE DISCOVERY
                        │
                        ▼
              ECOSYSTEM ADAPTERS
        ┌────────┬────────┬────────┐
        ▼        ▼        ▼        ▼
     Claude    VS Code   Cursor    npm
        │        │        │        │
        └────────┴────────┴────────┘
                        │
                        ▼
               NORMALIZED SURFACES
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
                ┌───────┴───────┐
                ▼               ▼
          HUMAN REPORT      JSON REPORT
                │
                ▼
             BASELINE
                │
                ▼
               DIFF
```

---

# 81. Final Decision

## Build HookAudit.

But build this version:

> **Repository Execution-Topology Auditor**

not:

> **Generic Hook Scanner**

The project should own the question:

> **“What can this repository make execute?”**

and answer it through:

```text
DISCOVER
→ NORMALIZE
→ RESOLVE
→ GRAPH
→ INFER
→ EXPLAIN
→ BASELINE
→ DIFF
```

The strongest evidence in the consolidated research supports the existence of an expanding repository-controlled execution surface, while the research also clearly invalidates the simplistic claim that there are no competing scanners. The best defensible strategy is therefore to differentiate through **relationship-aware execution topology**, not through the mere existence of scanning.

---

# 82. Final Research Principle

The project succeeds if the user can run:

```bash
hookaudit .
```

and understand, within seconds:

```text
WHAT CAN EXECUTE?
        ↓
WHEN?
        ↓
FROM WHERE?
        ↓
WHAT DOES IT REACH?
        ↓
WHAT CAPABILITIES ARE INVOLVED?
        ↓
HAS THAT SURFACE CHANGED?
```

That is the product.

---

# 83. Final Source Categories

For the final implementation/readme, continue validating claims against:

- official Zero Dependency Hackathon sources
- official Claude Code documentation
- official Cursor documentation
- official VS Code documentation
- official GitHub Copilot documentation
- official Git documentation
- official npm documentation
- CVEs/security advisories
- security research labs
- academic/preprint research
- GitHub repositories/issues for competing tools
- relevant developer/community evidence

Competitor categories already identified include:

- Snyk Agent Scan
- agent-hook-scan
- AgentGuard
- Claude-specific scanners
- dependency scanners
- SAST
- secret scanners
- SBOM/provenance tools

---

# 84. Final Implementation Gate

**Do not start feature expansion until the implementation preserves these invariants:**

```text
1. Target repository is never executed.
2. Runtime has zero third-party dependencies.
3. Repository boundaries are enforced.
4. Findings retain evidence.
5. Risk is explainable.
6. Risk is not presented as proof of malware.
7. Execution relationships are represented explicitly.
8. Supported ecosystems are parsed according to documented semantics.
9. Unsupported/dynamic behavior is reported honestly.
10. Baseline/diff distinguishes change from maliciousness.
11. Output is deterministic.
12. Scope remains feasible for the hackathon.
```

---

# 85. Final One-Line Conclusion

> **HookAudit is worth building because it reframes repository security from “what files look suspicious?” to “what execution behavior can this repository reach, through which trust boundary, and what changed?”**
