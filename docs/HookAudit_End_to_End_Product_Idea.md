# HookAudit — End-to-End Product Idea
## Repository Execution-Topology Security Auditor
### Zero Dependency 72-Hour Hackathon 2026

> **Purpose of this document:** This is the single end-to-end description of the HookAudit idea that the team can keep inside the repository as the product/product-strategy baseline.
>
> **Core thesis:** HookAudit should be built as a **repository execution-topology auditor**, not as a generic hook scanner.
>
> **Core question:**  
> **“What can this repository cause to execute, through which trigger, with which reachable capabilities, and what changed since I trusted it?”**

---

# 1. The Idea in One Page

Modern repositories can contain more than:

- application source code,
- dependency manifests,
- lockfiles,
- documentation.

They can also contain repository-controlled configuration and automation for:

- AI coding agents,
- IDEs/workspaces,
- package managers,
- development hooks,
- setup/bootstrap scripts,
- other automation.

Some of these surfaces can trigger commands or scripts when a developer reaches a particular execution condition.

That creates an important security question:

> **Before I trust or interact with this repository, what can it cause my development environment to execute?**

HookAudit answers that question locally.

Instead of examining only individual suspicious files, it builds an **execution graph**:

```text
Repository
    ↓
Execution Surface
    ↓
Trigger
    ↓
Command / Script
    ↓
Referenced File
    ↓
Reachable Capability
    ↓
Execution Path
    ↓
Risk + Evidence
```

It then adds a second capability:

```text
Trusted Baseline
      ↓
Repository changes
      ↓
Execution-Surface Diff
      ↓
New / Changed / Removed Paths
```

The final experience is:

```text
UNFAMILIAR REPOSITORY
        ↓
hookaudit .
        ↓
SEE WHAT CAN EXECUTE
        ↓
SEE WHEN IT CAN EXECUTE
        ↓
SEE WHAT IT REACHES
        ↓
SEE WHAT CAPABILITIES ARE INVOLVED
        ↓
REVIEW / TRUST / REMOVE / BLOCK
```

---

# 2. The Product Statement

## Short

> **HookAudit — See what a repository can execute before you trust it.**

## One sentence

> HookAudit is a zero-dependency local security tool that maps repository-controlled execution paths, explains what those paths can reach, and detects changes to those execution surfaces over time.

## Technical definition

> HookAudit is a repository execution-topology analyzer that discovers supported repository-controlled execution surfaces, normalizes their triggers and commands, resolves local execution references, builds an evidence-backed execution graph, infers reachable capabilities, applies deterministic path-based risk rules, and compares execution state against a trusted baseline.

## Security definition

> HookAudit is a pre-trust visibility and execution-surface change-analysis layer for modern repositories.

---

# 3. The Fundamental Problem

## Traditional repository mindset

```text
Repository
├── source
├── dependencies
└── configuration
```

A developer usually thinks:

```text
Is the source safe?
Are dependencies vulnerable?
```

## Modern development environment

```text
Repository
├── source
├── dependencies
├── AI-agent configuration
├── IDE/workspace configuration
├── tasks
├── hooks
├── package lifecycle scripts
├── setup scripts
└── development automation
```

Some of these artifacts can control the behavior of the tools operating on the repository.

Therefore:

```text
Repository
    ↓
Development Tool
    ↓
Configuration
    ↓
Trigger
    ↓
Execution
```

The repository can become an **execution control plane**.

---

# 4. The Security Question HookAudit Introduces

Existing security workflows frequently ask:

```text
Is this dependency vulnerable?
Does this source contain a security flaw?
Are there secrets in this repository?
```

HookAudit asks:

> **What automatic execution behavior is controlled by this repository?**

More specifically:

```text
WHAT?
WHEN?
FROM WHERE?
WHAT DOES IT INVOKE?
WHAT DOES THAT INVOKE?
WHAT CAPABILITIES ARE REACHABLE?
WHAT CHANGED?
```

---

# 5. Why This Matters Now

The development environment increasingly combines:

```text
IDE
+
AI coding agent
+
package manager
+
version control
+
automation
+
repository configuration
```

The research corpus identifies documented security issues and incidents involving project-local configuration, hooks, workspace tasks, package lifecycle scripts, and development automation.

The important point is not that AI created this problem.

The more defensible statement is:

> **AI-assisted development has increased the number of tools that can consume repository-local configuration and execute actions on a developer's behalf.**

Therefore repository-controlled execution deserves explicit analysis.

---

# 6. Important Nuance About Execution

HookAudit must NOT make the simplistic claim:

> “Every repository executes code as soon as it is cloned.”

Real tools have:

- trust prompts,
- workspace trust,
- allowlists,
- execution restrictions,
- version-specific behavior,
- manual confirmation,
- safer defaults.

The correct model is:

```text
Repository
    ↓
Execution Condition
    ↓
Trigger
    ↓
Command
    ↓
Capability
```

HookAudit therefore asks:

> **What execution behavior becomes reachable under the documented execution condition?**

This makes the product more accurate and resilient to changes in platform defaults.

---

# 7. Real-World Attack Pattern

A general attack pattern can look like:

```text
Attacker / compromised repository
        ↓
Repository-local configuration
        ↓
Developer opens / trusts / installs / interacts
        ↓
Tool reaches repository-controlled trigger
        ↓
Command executes
        ↓
Script executes
        ↓
Network / process / filesystem capability
        ↓
Impact
```

The payload may be spread across multiple files.

For example:

```text
Config A
   ↓
Script B
   ↓
Script C
   ↓
Remote Download
   ↓
Process Execution
```

A file-by-file review may miss the relationship.

---

# 8. The Core Insight: Execution Topology

The key idea is to treat repository automation as a graph.

Not:

```text
file = suspicious
```

but:

```text
trigger
   ↓
command
   ↓
reference
   ↓
capability
```

A complete graph might be:

```text
.claude/settings.json
        │
        ▼
    SessionStart
        │
        ▼
scripts/bootstrap.mjs
        │
        ├──────────────► PROCESS_EXECUTION
        │
        ▼
   helper.sh
        │
        ▼
  NETWORK_DOWNLOAD
```

This is the core product abstraction.

---

# 9. Why the Graph Is Important

Attack logic can be fragmented.

For example:

```text
A:
defines automatic trigger

B:
contains harmless-looking launcher

C:
contains network operation

D:
contains second-stage process
```

Individually:

```text
A = configuration
B = helper
C = downloader
D = launcher
```

Together:

```text
A → B → C → D
```

can form a high-impact execution path.

HookAudit's objective is to expose that relationship.

---

# 10. HookAudit Is Not Just a Hook Scanner

A hook scanner asks:

> Is there a hook?

HookAudit asks:

```text
What is the hook?
        ↓
When does it fire?
        ↓
What command does it invoke?
        ↓
What file does that command reach?
        ↓
What does that file invoke?
        ↓
What capabilities become reachable?
        ↓
What is the resulting execution path?
```

This distinction is central.

---

# 11. Execution-Surface Definition

An **execution surface** is:

> A repository-controlled configuration, script, task, hook, or automation relationship that can cause commands or code to execute under a relevant development-tool, package, or development workflow context.

Examples:

```text
AI-agent hook
IDE workspace task
npm lifecycle script
Husky hook
repository bootstrap script
```

Not automatically an execution surface:

```text
README text
ordinary source file named hook.js
documentation containing curl
random settings that do not trigger execution
```

The semantics matter.

---

# 12. Primary Ecosystems

The MVP prioritizes depth in:

```text
1. Claude Code
2. VS Code
3. Cursor
4. npm lifecycle
5. selected committed development hooks
```

These are adapters, not separate products.

Architecture:

```text
Claude adapter ─┐
VS Code adapter ├──→ Normalized Execution Surface
Cursor adapter ─┤
npm adapter ────┤
Dev-hook adapter┘
```

Future adapters may include:

```text
GitHub Copilot
Gemini
Windsurf
other AI agents
additional IDEs
CI/workflow surfaces
```

These are not MVP requirements.

---

# 13. Why We Choose Depth Over Breadth

The 72-hour constraint favors:

```text
few surfaces
+
strong semantics
+
deep reference resolution
+
real execution graph
+
capability reasoning
```

over:

```text
many surfaces
+
basic detection
+
lots of regex
+
weak relationships
```

The graph is the differentiator.

Ecosystem coverage is only useful if the normalized model remains strong.

---

# 14. Claude Code Surface

HookAudit should support documented project-local Claude execution surfaces.

The adapter should:

- locate supported settings,
- parse valid structured data,
- identify supported hooks,
- identify triggers,
- extract commands,
- identify local references,
- preserve execution conditions,
- retain evidence.

The adapter should not:

- assume undocumented fields are executable,
- treat every project instruction as code,
- execute any hook to discover behavior.

---

# 15. VS Code Surface

HookAudit should support documented workspace execution surfaces.

Primary MVP example:

```text
.vscode/tasks.json
```

The adapter should identify:

- task identity,
- command,
- args,
- supported automatic trigger,
- execution condition,
- local references.

Do not treat all `.vscode/settings.json` content as executable.

Where workspace trust affects execution behavior, record that context.

---

# 16. Cursor Surface

HookAudit should support documented project hook mechanisms.

The adapter should:

- identify supported project hook configuration,
- extract trigger,
- extract command,
- resolve supported local references,
- preserve execution condition.

Do not automatically classify instruction-only configuration as direct code execution.

---

# 17. npm Surface

HookAudit should inspect project package lifecycle execution.

Primary examples:

```text
preinstall
install
postinstall
prepare
```

The adapter should:

- parse `package.json`,
- identify supported lifecycle scripts,
- extract commands,
- resolve supported local scripts,
- attach lifecycle trigger metadata.

It should not claim that the presence of a lifecycle script means malware.

---

# 18. Development Hook Surface

Support selected committed development automation such as:

```text
.husky/
hook setup scripts
```

Native `.git/hooks/` must be handled carefully because it is not simply ordinary tracked repository content.

The system should distinguish:

```text
repository-controlled configuration
```

from:

```text
local machine state
```

---

# 19. Core Product Flow

```text
Repository
   ↓
Surface Discovery
   ↓
Ecosystem Adapter
   ↓
Normalized Execution Surface
   ↓
Trigger Extraction
   ↓
Command Extraction
   ↓
Reference Resolution
   ↓
Execution Graph
   ↓
Capability Inference
   ↓
Path-Based Risk
   ↓
Human + JSON Report
```

For continuous trust:

```text
Repository
   ↓
Baseline
   ↓
Repository changes
   ↓
New scan
   ↓
Diff
   ↓
Execution-surface changes
```

---

# 20. Repository Scanner

The repository scanner:

- receives a root path,
- establishes a safe repository boundary,
- walks relevant files,
- prioritizes execution-related surfaces,
- avoids binaries and unnecessary generated content,
- never executes target code.

Suggested files/paths:

```text
.claude/
.vscode/
.cursor/
package.json
.husky/
known bootstrap/setup scripts
```

---

# 21. Repository Boundary

The scanner must be resistant to:

- `../` traversal,
- absolute path escapes,
- symlinks,
- Windows junctions,
- UNC paths,
- deeply nested directories.

Rule:

> A referenced file must not silently cause analysis outside the allowed repository boundary.

If a path cannot be safely resolved:

```text
UNRESOLVED_REFERENCE
```

or:

```text
BOUNDARY_VIOLATION
```

---

# 22. Safe-by-Design Analysis

HookAudit must be able to analyze an untrusted repository without requiring it to execute.

Do not:

```text
npm install
npm run
node target.js
python target.py
bash target.sh
powershell target.ps1
```

Do not import target modules.

Do not load target plugins.

Do not invoke target tools.

Read target files as data.

---

# 23. Standard-Library Architecture

Node.js is the preferred implementation language.

Primary standard-library building blocks:

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

Core uses:

```text
filesystem traversal
JSON parsing
SHA-256
CLI
path resolution
testing
terminal output
```

No third-party runtime dependency.

---

# 24. Why Zero Dependency Matters

Zero dependency is not just a hackathon checkbox.

The product's target repository may be unfamiliar or potentially hostile.

Therefore:

```text
Untrusted repository
        ↓
No target install
No target execution
        ↓
Standalone HookAudit
        ↓
Static local analysis
```

This:

- minimizes the scanner's own runtime dependency surface,
- reduces bootstrap friction,
- enables offline analysis,
- keeps the core behavior inspectable,
- avoids requiring the target dependency tree.

Important language:

> **Zero third-party runtime dependencies.**

Not:

> zero security risk.

---

# 25. Canonical Execution Surface

Every ecosystem adapter outputs something like:

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

This normalization is what allows the core engine to remain cross-ecosystem.

---

# 26. Graph Model

## Nodes

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

## Edges

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

Example:

```text
CONFIG
  ↓ TRIGGERS
TRIGGER
  ↓ EXECUTES
SCRIPT
  ↓ REFERENCES
SCRIPT
  ↓ CONNECTS_TO
NETWORK
```

---

# 27. Reference Resolution

Reference resolution is the most important engineering challenge.

Given:

```text
settings.json
    ↓
scripts/setup.mjs
    ↓
../shared/bootstrap.sh
    ↓
node helper.js
```

HookAudit should attempt to resolve the path without execution.

Resolution process:

```text
detect reference
↓
normalize
↓
boundary check
↓
read target as data
↓
analyze target
↓
extract additional references
↓
continue graph traversal
```

---

# 28. Resolution States

Every reference should be one of:

```text
RESOLVED
PARTIALLY_RESOLVED
UNRESOLVED
```

Examples:

```text
local script exists
→ RESOLVED

dynamic path
→ UNRESOLVED

script found but nested behavior is dynamic
→ PARTIALLY_RESOLVED
```

Unknown is better than false certainty.

---

# 29. Graph Limits

Protect the analyzer with:

```text
MAX_GRAPH_DEPTH
MAX_FILE_SIZE
MAX_SCAN_DEPTH
```

Initial engineering defaults can be tuned during testing.

When a limit is reached:

```text
diagnostic
+
partial graph
```

not a crash.

---

# 30. Cycle Handling

Example:

```text
A → B → C → A
```

The scanner must terminate.

Record:

```text
CYCLE_DETECTED
```

and continue.

---

# 31. Capability Model

Priority:

## P0

```text
PROCESS_EXECUTION
NETWORK_ACCESS
REMOTE_DOWNLOAD
```

## P1

```text
ENVIRONMENT_ACCESS
CREDENTIAL_ACCESS_SIGNAL
RUNTIME_BOOTSTRAP
```

## P1/P2

```text
FILE_READ
FILE_WRITE
OBFUSCATION
DYNAMIC_EXECUTION
CROSS_TOOL_LINK
```

The exact risk impact comes from context and path combinations.

---

# 32. Process Execution

Signals may include:

```text
node
python
bash
sh
powershell
spawn
exec
direct executable
```

The detector should report:

```text
PROCESS_EXECUTION
```

with evidence.

It must not execute the identified process.

---

# 33. Network Access

Potential signals:

```text
curl
wget
Invoke-WebRequest
Invoke-RestMethod
HTTP client APIs
fetch()
explicit executable URLs
```

But:

```text
URL in README
```

is not automatically:

```text
NETWORK_EXECUTION
```

Context is required.

---

# 34. Remote Download

This is stronger than generic network access.

Example:

```text
automatic trigger
→ script
→ download remote artifact
```

Potential capabilities:

```text
NETWORK_ACCESS
REMOTE_DOWNLOAD
```

---

# 35. Runtime Bootstrap

Potential pattern:

```text
download runtime/interpreter
        ↓
execute downloaded runtime
```

Examples might involve:

```text
Node
Python
Bun
other runtime/bootstrap artifacts
```

This should be treated as a strong review signal.

---

# 36. Environment Access

Possible signals:

```text
process.env
environment-variable expansion
credential/config file access
```

Do not claim that environment access equals credential theft.

Use:

```text
ENVIRONMENT_ACCESS
CREDENTIAL_ACCESS_SIGNAL
```

---

# 37. Obfuscation

Potential signals:

```text
base64 decoding
encoded command blobs
eval-like execution
dynamic command construction
excessive escaping
```

Obfuscation is:

```text
REVIEW SIGNAL
```

not:

```text
MALWARE PROOF
```

---

# 38. Cross-Tool Links

A cross-tool relationship might be:

```text
Claude
   ↓
script
   ↓
VS Code task
   ↓
another script
```

The graph should preserve the ecosystem boundary.

Cross-tool linking alone is not malicious.

It becomes more interesting when combined with:

```text
automatic trigger
+
network
+
process
+
obfuscation
```

---

# 39. Unified Risk Engine

The risk engine should be:

```text
UNIFIED
+
DETERMINISTIC
+
RULE-BASED
+
EXPLAINABLE
```

Adapters do not own risk scoring.

They only normalize evidence.

---

# 40. Risk Inputs

Possible inputs:

```text
automatic trigger
project control
execution condition
reachable capabilities
execution depth
network
remote download
process execution
environment access
credential signal
obfuscation
cross-tool link
baseline novelty
confidence
```

---

# 41. Risk Examples

### Low

```text
manual local formatter
```

→ LOW

### Medium

```text
automatic local task
```

→ MEDIUM / policy dependent

### High

```text
automatic trigger
+
network
+
process execution
```

→ HIGH

### Critical

```text
automatic trigger
+
remote download
+
process execution
+
obfuscation
```

→ CRITICAL

Exact rules should be centralized and documented.

---

# 42. Risk vs Confidence

These must be separate.

```text
Risk:
HIGH

Confidence:
MEDIUM
```

means:

> The potential impact is high, but the static interpretation is incomplete.

This is important for dynamic scripts.

---

# 43. Risk vs Malware

HookAudit must never imply:

```text
Risk = malware
```

Correct output:

```text
HIGH-RISK EXECUTION PATH
```

with:

```text
why
evidence
capabilities
confidence
limitations
```

---

# 44. Evidence Model

Every important detection should retain:

```text
path
line
column (if available)
field
excerpt (when safe)
detector
reason
```

Example:

```text
Path:
.claude/settings.json

Field:
hooks.SessionStart

Target:
scripts/bootstrap.mjs

Signal:
PROCESS_EXECUTION

Reason:
Automatic repository-controlled hook reaches a process-launch path.
```

---

# 45. Finding Model

Conceptual:

```text
Finding
{
    id,
    severity,
    confidence,
    ruleId,
    surfaceId,
    pathId,
    title,
    explanation,
    evidence[],
    capabilities[],
    recommendation
}
```

---

# 46. Execution Path Model

Conceptual:

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

This is the primary unit for important findings.

---

# 47. Human Output

Default output should be compact.

Example:

```text
HOOKAUDIT

Repository: example-project

Execution surfaces: 6
High-risk paths:     2
New since baseline:  1

Trust decision: REVIEW
```

Then:

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

Confidence:
HIGH
```

---

# 48. JSON Output

Required:

```bash
hookaudit . --json
```

Conceptual output:

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

---

# 49. Trust Decision

Recommended:

```text
PASS
REVIEW
BLOCK
```

Suggested semantics:

```text
PASS:
No high-risk supported execution path detected.

REVIEW:
Potentially concerning execution surface exists.

BLOCK:
Critical path or strict policy violation.
```

Do not claim:

```text
PASS = repository is safe
```

---

# 50. Baseline

Baseline represents:

> **The execution-surface state the user chose to trust at a point in time.**

It does not prove that the baseline was safe.

Command:

```bash
hookaudit baseline .
```

Store:

```text
schemaVersion
repository identity
surface identities
relevant hashes
normalized execution state
capability summary
```

---

# 51. Baseline Storage

Potential location:

```text
.hookaudit/baseline.json
```

Normal scans remain read-only.

Only explicit baseline creation writes metadata.

---

# 52. SHA-256

Use:

```text
node:crypto
```

for SHA-256.

Relevant artifacts:

- execution-surface files,
- normalized execution representation where practical.

Avoid unnecessarily hashing the entire repository.

---

# 53. Diff

Command:

```bash
hookaudit diff .
```

Minimum:

```text
NEW
CHANGED
REMOVED
```

---

# 54. Structural Diff

Detect:

```text
new trigger
changed trigger
new command
changed command
new reference
removed reference
```

---

# 55. Capability Diff

Where practical:

```text
NEW NETWORK
NEW REMOTE DOWNLOAD
NEW PROCESS EXECUTION
NEW RUNTIME BOOTSTRAP
NEW OBFUSCATION
NEW ENVIRONMENT ACCESS
```

---

# 56. Semantic Execution Diff

Stretch goal:

```text
BEFORE

SessionStart
   ↓
local script
```

AFTER:

```text
SessionStart
   ↓
local script
   ↓
network
```

Report:

```text
BEHAVIOR CHANGE

New reachable capability:
NETWORK

New execution path:
SessionStart → local script → external request
```

Do not attempt full semantic equivalence of arbitrary programs.

---

# 57. CLI

Core:

```bash
hookaudit .
```

```bash
hookaudit . --json
```

```bash
hookaudit . --strict
```

```bash
hookaudit baseline .
```

```bash
hookaudit diff .
```

Future:

```bash
hookaudit explain <finding>
```

---

# 58. Strict Mode

Suggested:

```text
LOW      → allow
MEDIUM   → warn
HIGH     → fail
CRITICAL → fail
```

Actual policy should be explicit and centralized.

---

# 59. Diagnostics

Suggested diagnostics:

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

Diagnostics are distinct from security findings.

---

# 60. Coverage Transparency

If the tool cannot inspect a candidate surface:

```text
Supported surfaces analyzed: 6
Unsupported candidate surfaces: 2
Unresolved references: 1
```

This avoids false confidence.

---

# 61. Privacy Model

Core operation should be:

```text
LOCAL
OFFLINE
NO TELEMETRY
NO CLOUD
NO REPOSITORY UPLOAD
```

No network is required for the core scan.

---

# 62. No Automatic Remediation in MVP

Do not automatically:

- delete files,
- rewrite hooks,
- disable tasks,
- edit package scripts,
- change configuration.

HookAudit is an analysis and decision-support tool.

---

# 63. Core Architecture

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
               ┌────────┴────────┐
               ▼                 ▼
          HUMAN REPORT       JSON REPORT
               │
               ▼
            BASELINE
               │
               ▼
              DIFF
```

---

# 64. Module Responsibilities

## CLI

Arguments and command dispatch.

## Scanner

Safe filesystem traversal.

## Adapter

Ecosystem semantics and normalization.

## Extractor

Trigger/command/reference extraction.

## Resolver

Safe local reference traversal.

## Graph

Execution topology.

## Capability

Behavior inference.

## Risk

Contextual severity.

## Baseline

Trusted snapshot.

## Diff

Execution-surface change detection.

## Report

Human and machine output.

---

# 65. Adapter Principle

Adapters must NOT contain:

- risk scoring,
- terminal formatting,
- baseline logic,
- persistence.

Adapters only answer:

> What execution surface does this ecosystem define?

Everything else is centralized.

---

# 66. Why This Architecture Matters

Without normalization:

```text
Claude risk logic
VS Code risk logic
Cursor risk logic
npm risk logic
```

becomes duplicated and inconsistent.

With normalization:

```text
Claude ─┐
VS Code ├──→ ExecutionSurface
Cursor ─┤
npm ────┘
               ↓
        common graph
               ↓
        common risk
```

This is cleaner, more testable, and more extensible.

---

# 67. MVP Feature Set

## P0 — Core

```text
Repository scanner
Claude support
VS Code support
Cursor support
npm lifecycle support
Selected development-hook support
Trigger extraction
Command extraction
Reference resolution
Execution graph
Capability inference
Path-based risk
Evidence
Human report
JSON report
Safe analysis
Tests
Zero runtime dependencies
```

## P1 — High Value

```text
Baseline
SHA-256 diff
Structural execution diff
Capability diff
Strict mode
Better evidence output
```

## P2 — Stretch

```text
Semantic path diff
SARIF
Policy file
Interactive graph
HTML
More ecosystems
More agents
```

---

# 68. Explicit Non-Goals

Do NOT attempt in the first 72 hours:

```text
Full malware detection
Full shell parser
Full JavaScript analyzer
Full YAML parser
All AI agents
All IDEs
All package managers
Dynamic sandbox
Cloud backend
ML model
External threat intelligence
Complete Git semantic analysis
```

---

# 69. Why We Are Not Building a Malware Detector

Arbitrary static behavior is too complex to classify perfectly.

Instead:

```text
observable evidence
+
execution context
+
reachable capability
+
path
=
risk
```

This is more defensible.

---

# 70. Why We Are Not Building SAST

SAST asks:

> Is application source insecure?

HookAudit asks:

> What execution behavior is controlled by the repository?

These are complementary.

---

# 71. Why We Are Not Building an SCA Tool

SCA asks:

> Are dependencies vulnerable?

HookAudit asks:

> Can repository-controlled configuration cause execution?

Again complementary.

---

# 72. Why We Are Not Building an SBOM Tool

SBOM describes software composition.

HookAudit describes repository execution behavior.

Different layers.

---

# 73. Existing Competition

The research identifies overlap with:

- Snyk Agent Scan
- agent-hook-scan
- AgentGuard
- Claude-specific hook scanners
- general dependency/security scanners
- SAST
- secret scanners

Therefore:

> **Do not claim HookAudit is the first or only AI-agent security scanner.**

The differentiation must come from:

```text
repository-wide execution topology
+
cross-tool relationships
+
reference resolution
+
capability reachability
+
path-based risk
+
execution-surface baseline/diff
```

---

# 74. Competitive Positioning

## Dependency Scanner

```text
What packages are vulnerable?
```

## SAST

```text
What code is insecure?
```

## Secret Scanner

```text
What secrets are present?
```

## Agent Config Scanner

```text
What suspicious configuration exists?
```

## HookAudit

```text
What execution paths can repository-controlled configuration
create, what capabilities can those paths reach, and what
changed since the trusted state?
```

---

# 75. Why the Graph Must Be Visible in the Demo

If the demo only shows:

```text
HIGH
curl found
```

it looks like a regex scanner.

If the demo shows:

```text
SessionStart
    ↓
bootstrap.mjs
    ↓
helper.sh
    ↓
network download
    ↓
process execution
```

the technical thesis becomes obvious.

The graph is the product's “wow” moment.

---

# 76. Demo Story

## Scene 1 — Unfamiliar repository

Show:

```text
.claude/
.vscode/
.cursor/
scripts/
package.json
```

Explain:

> The repository contains instructions for tools that operate on it.

## Scene 2 — Run HookAudit

```bash
hookaudit .
```

Show execution surface summary.

## Scene 3 — Show path

```text
trigger
→ script
→ secondary script
→ capability
```

## Scene 4 — Explain risk

Show deterministic reasons.

## Scene 5 — Baseline

```bash
hookaudit baseline .
```

## Scene 6 — Change repository

Add a new execution path.

## Scene 7 — Diff

```bash
hookaudit diff .
```

Show:

```text
NEW EXECUTION SURFACE
```

## Scene 8 — Zero dependency

Show:

```text
dependencies: {}
```

and standard-library implementation.

---

# 77. Demo Safety

Only use controlled fixture repositories.

Do not execute actual malicious payloads.

Use:

```text
harmless scripts
fake endpoints
inert commands
static indicators
```

The demo must prove analysis without executing target behavior.

---

# 78. Fixture Design

Recommended:

```text
fixtures/
├── safe/
├── legitimate/
├── automatic/
├── network/
├── remote-download/
├── runtime-bootstrap/
├── obfuscation/
├── cross-tool/
├── nested/
├── cyclic/
├── malformed/
├── traversal/
├── dynamic/
└── baseline/
```

---

# 79. Safe Fixture

No execution surfaces.

Expected:

```text
No high-risk execution paths detected.
```

---

# 80. Legitimate Fixture

Example:

```text
automatic local formatter
```

Expected:

```text
LOW/MEDIUM
```

This proves hooks are not inherently malicious.

---

# 81. Automatic Network Fixture

```text
automatic trigger
→ network operation
```

Expected:

```text
NETWORK_ACCESS
```

plus contextual risk.

---

# 82. Remote Download Fixture

```text
automatic trigger
→ remote download
```

Expected:

```text
REMOTE_DOWNLOAD
```

---

# 83. Bootstrap Fixture

```text
trigger
→ download runtime
→ execute runtime
```

Expected:

```text
RUNTIME_BOOTSTRAP
```

---

# 84. Cross-Tool Fixture

```text
Claude
→ script
→ VS Code
→ script
→ network
```

Expected:

```text
cross-tool execution path
```

---

# 85. Evasion Fixture

Use:

```text
dynamic path
encoded command
indirect execution
```

Expected:

```text
UNRESOLVED
DYNAMIC
REVIEW
```

not a false certainty.

---

# 86. Security Test

Create a target script that would create:

```text
executed-marker.txt
```

if executed.

Run HookAudit.

Expected:

```text
executed-marker.txt DOES NOT EXIST
```

This proves the core safety invariant.

---

# 87. Boundary Test

Fixture references:

```text
../outside-file
```

Expected:

```text
BOUNDARY_VIOLATION
```

No outside file read.

---

# 88. Cycle Test

Fixture:

```text
A → B → C → A
```

Expected:

```text
CYCLE_DETECTED
```

No infinite traversal.

---

# 89. Determinism Test

Run:

```bash
hookaudit fixture --json
```

twice.

Expected:

```text
same analytical result
```

---

# 90. Baseline Test

1. create baseline,
2. scan unchanged repository,
3. add surface,
4. modify surface,
5. remove surface.

Expected:

```text
NEW
CHANGED
REMOVED
```

---

# 91. Capability-Diff Test

Before:

```text
automatic → local
```

After:

```text
automatic → network
```

Expected:

```text
NEW CAPABILITY: NETWORK
```

---

# 92. Documentation

The final repository should explain:

```text
What HookAudit does
Why it exists
How it works
Supported ecosystems
Risk model
Safe analysis
Limitations
Baseline/diff
Zero dependencies
Usage
```

---

# 93. README Core Narrative

Recommended order:

```text
Problem
↓
Solution
↓
Example
↓
How it works
↓
Execution graph
↓
Risk
↓
Baseline/diff
↓
Zero dependency
↓
Installation
↓
Limitations
```

---

# 94. STDLIB Documentation

Record actual substitutions.

Example:

```text
glob package
→ node:fs recursive traversal
```

```text
CLI library
→ process.argv / node:util
```

```text
chalk
→ ANSI escape sequences
```

```text
hash library
→ node:crypto
```

The substitutions must be meaningful.

---

# 95. Dependency Proof

Show:

```text
package.json
dependencies = {}
```

Then:

```text
source imports
```

and:

```text
dependency tree
```

The proof must be reproducible.

---

# 96. Production-Level Security Principles

## Principle 1

Never execute target repository code.

## Principle 2

Never install target dependencies.

## Principle 3

Never silently cross repository boundaries.

## Principle 4

Never treat every hook as malicious.

## Principle 5

Never treat risk as malware proof.

## Principle 6

Never hide unresolved behavior.

## Principle 7

Never introduce third-party runtime dependencies.

---

# 97. Performance Strategy

Prioritize execution-relevant content.

Avoid expensive analysis of:

```text
node_modules
build
dist
coverage
large binaries
generated content
```

where safe.

Use:

```text
file-size limit
graph depth limit
cycle detection
cache
deterministic ordering
```

---

# 98. Monorepo Consideration

A repository may contain multiple projects.

The architecture should allow multiple surfaces from:

```text
services/
apps/
packages/
tools/
```

but the MVP should avoid expensive whole-tree semantic analysis.

Execution surfaces should be prioritized.

---

# 99. Multi-Platform Strategy

Target:

```text
Linux
macOS
Windows
```

But do not attempt full shell-language interpretation.

Normalize common behavior.

Examples:

```text
bash
sh
powershell
pwsh
node
python
```

as process/interpreter signals.

---

# 100. Shell Analysis Boundary

Do not build a shell compiler.

Use heuristic signals.

Example:

```text
curl | sh
```

should produce:

```text
NETWORK_DOWNLOAD
SHELL_EXECUTION
```

with evidence.

But arbitrary shell behavior remains partially unresolved.

---

# 101. Security Coverage Model

HookAudit should be able to say:

```text
WHAT WE ANALYZED
WHAT WE RESOLVED
WHAT WE COULD NOT RESOLVE
```

This gives the user an honest model of coverage.

---

# 102. Confidence

Confidence should come from the certainty of the static interpretation.

Possible:

```text
HIGH
MEDIUM
LOW
```

Examples:

```text
Direct command:
HIGH

Nested but statically resolved:
MEDIUM/HIGH

Dynamic command:
LOW
```

---

# 103. Recommended Finding

```text
[HIGH]
Automatic repository-controlled execution path

Trigger:
SessionStart

Path:
.claude/settings.json
→ scripts/setup.mjs
→ helper.sh
→ network download
→ process execution

Capabilities:
NETWORK_ACCESS
REMOTE_DOWNLOAD
PROCESS_EXECUTION

Why:
The path combines automatic execution with external retrieval
and process launch.

Confidence:
HIGH

Action:
REVIEW BEFORE TRUST
```

---

# 104. Why Baseline Matters

A repository that is safe enough today can change later.

Possible:

```text
maintainer compromise
malicious pull request
configuration injection
workflow modification
new bootstrap script
new agent hook
```

Baseline answers:

> What did I trust?

Diff answers:

> What changed?

---

# 105. Baseline Is Not “Safe State”

Important distinction:

```text
trusted
≠
safe
```

A baseline says:

> This was the state I accepted at time T.

It does not prove:

> This state was harmless.

---

# 106. Execution-Surface Change

A changed file is not necessarily a malicious change.

Examples:

```text
formatter command changed
```

could be legitimate.

But:

```text
local command
→ network download
```

is a materially more significant execution change.

Therefore capability-aware diff is valuable.

---

# 107. Long-Term Product

Potential evolution:

```text
HookAudit CLI
      ↓
CI gate
      ↓
PR execution-surface review
      ↓
execution-surface history
      ↓
organization policy
```

Still local-first.

---

# 108. Post-Hackathon Users

Potential users:

- AI-assisted developers
- security engineers
- open-source maintainers
- platform engineers
- CI engineers
- incident responders

Potential moments:

```text
before cloning/trusting
before enabling workspace/agent access
before installation
during PR review
in CI
during incident response
```

---

# 109. Product Adoption Goal

Make the common case one command:

```bash
hookaudit .
```

The user should not need:

```text
configuration
cloud account
API key
database
dependency install
complex setup
```

---

# 110. Why Developers Could Care

The tool answers an otherwise difficult question:

> “What could this repository make my development environment do?”

It turns:

```text
hidden config
```

into:

```text
visible execution path
```

That is actionable.

---

# 111. Why Security Engineers Could Care

It provides:

```text
execution topology
evidence
confidence
risk
baseline
diff
JSON
```

This can complement existing SAST/SCA/secret scanning.

---

# 112. Why Maintainers Could Care

It gives a way to identify:

```text
new execution surface
changed trigger
changed command
new capability
```

during repository evolution.

---

# 113. Why CI Engineers Could Care

Use:

```bash
hookaudit . --json
```

and:

```bash
hookaudit . --strict
```

for deterministic policy enforcement.

---

# 114. Core Differentiation

The project should defend:

```text
NOT:
“we scan hooks.”

BUT:
“we normalize repository execution surfaces into one graph,
resolve their relationships, infer reachable capabilities,
and track how that graph changes.”
```

---

# 115. Product Anti-Claims

Do not say:

```text
“The first AI security tool.”
“The only hook scanner.”
“Nobody else does this.”
“Every repository executes automatically.”
“Zero dependencies = zero risk.”
“HookAudit proves malware.”
```

These are unnecessarily broad.

---

# 116. Honest Positioning

Use:

> Existing security tools cover dependencies, source code, secrets, artifacts, and individual agent/configuration concerns. HookAudit focuses on the repository's **execution topology**: how repository-controlled triggers connect to commands, files, processes, and reachable capabilities, and how that topology changes over time.

---

# 117. Technical Differentiation Test

HookAudit is strongest if it can demonstrate:

```text
A config file
→ trigger
→ script
→ secondary script
→ capability
```

as one path.

If the implementation only produces:

```text
curl found
hook found
task found
```

the product has not achieved its intended differentiation.

---

# 118. 72-Hour Scope

## Day 1

```text
scanner
boundary
models
adapters
trigger extraction
command extraction
basic output
tests
```

## Day 2

```text
reference resolver
graph
capabilities
risk
cross-tool analysis
JSON
```

## Day 3

```text
baseline
diff
security hardening
tests
README
STDLIB
proof
demo
```

---

# 119. Day 1 Priority

Day 1 should NOT start with:

```text
pretty terminal graph
HTML
all agents
complex shell parser
ML
```

Day 1 starts with:

```text
repository
→ surface
→ trigger
→ command
```

Then Day 2 turns it into a graph.

---

# 120. Day 2 Priority

The most important Day-2 milestone:

```text
config
→ script
→ secondary script
→ capability
```

appears as one path.

That is the core product test.

---

# 121. Day 3 Priority

Day 3 should prove:

```text
I trusted this repository
        ↓
repository changed
        ↓
execution topology changed
        ↓
HookAudit noticed
```

Then prove:

```text
the analyzer itself has no runtime dependency chain
```

---

# 122. Cut Strategy

If behind schedule:

Cut:

```text
extra agents
extra IDEs
HTML
interactive graph
SARIF
full semantic diff
advanced shell parser
```

Protect:

```text
graph
reference resolution
capabilities
risk
baseline/diff
safety
tests
zero dependencies
```

---

# 123. “Lose 6 Hours” Plan

Remove:

```text
semantic diff
extra adapter
fancy output
```

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

# 124. “Lose 12 Hours” Plan

Reduce development-hook support.

Protect:

```text
core four
graph
capabilities
risk
baseline
```

---

# 125. “Lose 24 Hours” Plan

Reduce ecosystem scope to:

```text
Claude
VS Code
npm
```

but retain:

```text
reference resolution
execution graph
risk
evidence
safe analysis
```

The product thesis must survive.

---

# 126. Final Acceptance Criteria

HookAudit is MVP-complete when:

```text
[ ] Can scan an unfamiliar repository
[ ] Does not execute target code
[ ] Detects supported execution surfaces
[ ] Extracts triggers
[ ] Extracts commands
[ ] Resolves local references
[ ] Builds multi-hop graph
[ ] Infers core capabilities
[ ] Produces deterministic risk
[ ] Retains evidence
[ ] Produces human output
[ ] Produces JSON
[ ] Creates baseline
[ ] Computes diff
[ ] Detects capability changes where supported
[ ] Enforces repository boundary
[ ] Handles cycles
[ ] Handles malformed input
[ ] Tests never-execute property
[ ] Runtime dependencies remain zero
```

---

# 127. Final Product Flow

```text
                         HOOKAUDIT
                             │
                             ▼
                        REPOSITORY
                             │
                             ▼
                    SAFE DISCOVERY
                             │
                             ▼
                 EXECUTION SURFACES
                             │
                             ▼
                    NORMALIZATION
                             │
                             ▼
                TRIGGER + COMMAND
                             │
                             ▼
                 REFERENCE RESOLVER
                             │
                             ▼
                  EXECUTION GRAPH
                             │
                             ▼
              CAPABILITY REACHABILITY
                             │
                             ▼
                  PATH-BASED RISK
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
          HUMAN REPORT               JSON REPORT
                │
                ▼
             BASELINE
                │
                ▼
               DIFF
                │
                ▼
      EXECUTION-SURFACE CHANGE
```

---

# 128. Final Product Philosophy

HookAudit should follow five principles:

### 1. See before execute

Provide visibility before trust.

### 2. Graph before score

Understand execution relationships before assigning risk.

### 3. Evidence before verdict

Show why a path matters.

### 4. Change before panic

A change is a review event, not automatically an attack.

### 5. Simplicity before scope

A smaller deep system is better than a shallow collection of integrations.

---

# 129. Final Product Identity

```text
ZERO-DEPENDENCY
+
LOCAL
+
OFFLINE
+
EXECUTION-SURFACE
+
AI/EDITOR SECURITY
+
SUPPLY-CHAIN DEFENSE
+
EXECUTION GRAPH
+
BASELINE/DIFF
```

This is the product identity.

---

# 130. Final One-Line Product

> **HookAudit is a zero-dependency repository execution-topology auditor that shows what a repository can automatically execute, what those execution paths can reach, and what changed since you trusted it.**

---

# 131. Final User Promise

> **Before you trust a repository, know what it can execute.**

---

# 132. Final Engineering Promise

> **Analyze the repository as inert data; never execute the target to determine its execution surface.**

---

# 133. Final Security Promise

> **Every important risk finding should be explainable as an evidence-backed execution path, not an opaque score.**

---

# 134. Final Differentiation Promise

> **HookAudit turns fragmented repository automation into one explicit execution topology.**

---

# 135. Final Baseline Promise

> **Know not only what a repository can execute today, but when that execution surface changes.**

---

# 136. Final MVP Contract

```text
INPUT:
Repository path

DISCOVER:
Supported execution surfaces

NORMALIZE:
ExecutionSurface objects

EXTRACT:
Trigger + command + references

RESOLVE:
Safe local references

GRAPH:
Multi-hop execution topology

INFER:
Reachable capabilities

SCORE:
Deterministic path-based risk

EXPLAIN:
Evidence + confidence + reason

REPORT:
Human + JSON

BASELINE:
Trusted execution state

DIFF:
New + Changed + Removed + capability changes

SECURITY:
Never execute target
Never install target dependencies
Enforce repository boundaries

RUNTIME:
Node.js standard library
Zero third-party runtime dependencies
```

---

# 137. Final Non-Negotiable Boundaries

The project must never silently become:

```text
another dependency scanner
another SAST tool
another malware detector
another Claude-only linter
another cloud security dashboard
```

The product stays focused on:

```text
REPOSITORY EXECUTION TOPOLOGY
```

---

# 138. Final Decision

## BUILD HOOKAUDIT

But build:

> **Repository Execution-Topology Auditor**

not:

> **Generic Hook Scanner**

The research supports this as the strongest product direction because it combines:

```text
real repository execution problem
+
modern AI/editor relevance
+
cross-file reasoning
+
technical depth
+
zero-dependency fit
+
local/offline workflow
+
strong demo
+
baseline/diff
```

while acknowledging that pieces of the market already have competing scanners.

The defensible innovation is the **unified execution graph and its use for capability-aware, evidence-backed risk and execution-surface change detection**.

---

# 139. What Success Looks Like

A developer receives:

```text
some-new-repository/
```

They run:

```bash
hookaudit .
```

And immediately see:

```text
Execution surfaces: 5

[HIGH]
SessionStart
   ↓
setup.mjs
   ↓
helper.sh
   ↓
NETWORK DOWNLOAD
   ↓
PROCESS EXECUTION

Trust decision:
REVIEW
```

They then decide what to do.

Later:

```bash
hookaudit diff .
```

And see:

```text
NEW EXECUTION SURFACE

Trigger:
SessionStart

New capability:
NETWORK_ACCESS

Action:
REVIEW CHANGE
```

That is HookAudit.

---

# 140. End State

The final product should make this transformation visible:

```text
HIDDEN AUTOMATION
        ↓
DISCOVERED SURFACE
        ↓
EXPLICIT EXECUTION PATH
        ↓
REACHABLE CAPABILITIES
        ↓
EVIDENCE-BACKED RISK
        ↓
TRUST DECISION
        ↓
TRACKED CHANGE
```

# END OF HOOKAUDIT END-TO-END IDEA
