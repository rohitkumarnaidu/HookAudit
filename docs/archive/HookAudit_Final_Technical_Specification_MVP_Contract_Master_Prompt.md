# HOOKAUDIT — MASTER PROMPT
# Final Technical Specification + MVP Contract → Day-1 Implementation Readiness
## Zero Dependency 72-Hour Hackathon 2026

---

# 0. ROLE

You are acting as the **Lead Security Architect + Principal Engineer + Product Engineer + Hackathon Technical Lead** for the HookAudit project.

Your task is to take the existing HookAudit research/specification files as the starting knowledge base and convert them into one **authoritative, implementation-ready technical contract**.

This is the final planning stage before production implementation.

You must be rigorous.

You must not blindly accept previous research.

You must preserve useful decisions already established in the research while resolving contradictions, removing overclaims, narrowing scope, and converting the product idea into exact engineering requirements.

---

# 1. PRIMARY OBJECTIVE

Create the final:

> **HookAudit Technical Specification + MVP Contract**

that is detailed enough that a coding agent can implement the MVP without needing to guess:

- what the product does,
- what it does not do,
- which ecosystems it supports,
- how every adapter behaves,
- how execution surfaces are normalized,
- how reference resolution works,
- how the execution graph works,
- how capabilities are inferred,
- how risk is scored,
- how evidence is represented,
- how baseline/diff works,
- how CLI behavior works,
- how JSON output works,
- what security invariants exist,
- what tests must pass,
- what the 72-hour build order is,
- what features are forbidden from entering MVP scope.

The result must become the **single source of truth for implementation**.

---

# 2. SOURCE MATERIALS

Before producing the specification, inspect all available HookAudit research and specification files in the conversation.

At minimum use:

1. `HookAudit_Complete_End_to_End_Final_Research(1).md`
2. `Mapping the Attack Surface_ A Zero-Dependency Strategy for Auditing Automatic Execution in Development Repositories.md`
3. Any earlier HookAudit specification available in the conversation
4. Earlier Preflight research for comparative context
5. Earlier trust-local/SBOM research for comparative context
6. Research methodology documents used to evaluate HookAudit

The latest consolidated HookAudit research defines the product as a:

> **Repository Execution-Topology Auditor**

rather than a generic hook scanner.

It establishes the core workflow:

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

and identifies the primary technical differentiators as:

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

Treat these as the starting architecture, but validate every assumption before freezing the contract.

---

# 3. IMPORTANT: DO NOT RESEARCH FROM MEMORY ALONE

When the specification depends on current platform behavior, verify against current primary documentation.

Especially verify:

- Claude Code hooks/configuration
- Cursor project hooks
- VS Code tasks/workspace behavior
- GitHub Copilot repository hooks if considered
- npm lifecycle behavior
- Git hook semantics
- Husky behavior
- current hackathon rules
- current competitor capabilities

Do not turn an old research claim into an implementation assumption without checking it.

---

# 4. FACT DISCIPLINE

Every important decision must be classified as one of:

```text
FACT
INFERENCE
DESIGN DECISION
MVP ASSUMPTION
LIMITATION
FUTURE FEATURE
```

Do not present:

- a product recommendation as a fact,
- an inferred platform behavior as documented behavior,
- a competitor claim without evidence,
- a security assumption as guaranteed.

---

# 5. PRODUCT THESIS

Start by validating the following candidate thesis:

> HookAudit is a zero-dependency local security tool that statically discovers repository-controlled execution surfaces across supported AI-agent, editor/workspace, package-lifecycle, and development-hook systems; resolves their reachable execution paths; represents those paths as an execution graph; infers reachable capabilities; explains contextual risk; and detects changes to those execution surfaces over time.

Core user question:

> **What can this repository cause to execute, through which trigger, with which reachable capabilities, and what changed since I trusted it?**

Product sentence:

> **HookAudit turns hidden repository automation into an explicit, reviewable execution graph.**

If any part of this thesis is invalidated by the source materials or current ecosystem, revise it.

---

# 6. PRODUCT NON-THESIS

Explicitly state what HookAudit is NOT:

```text
Not a generic malware detector.
Not a dependency vulnerability scanner.
Not SAST.
Not an SBOM verifier.
Not a package reputation engine.
Not a full shell interpreter.
Not a perfect static analyzer.
Not a Claude-only scanner.
Not a cloud security platform.
```

Do not let implementation drift into these categories.

---

# 7. PRIMARY USE CASE

The primary user workflow is:

```text
UNFAMILIAR REPOSITORY
        ↓
DO NOT INSTALL / EXECUTE TARGET
        ↓
RUN HOOKAUDIT
        ↓
DISCOVER EXECUTION SURFACES
        ↓
UNDERSTAND EXECUTION PATHS
        ↓
SEE REACHABLE CAPABILITIES
        ↓
REVIEW RISK
        ↓
TRUST / REVIEW / REMOVE / BLOCK
```

Secondary workflow:

```text
TRUSTED REPOSITORY
        ↓
CREATE BASELINE
        ↓
REPOSITORY CHANGES
        ↓
DIFF EXECUTION SURFACE
        ↓
NEW / CHANGED / REMOVED PATHS
        ↓
REVIEW
```

---

# 8. MVP ECOSYSTEM SCOPE

The default recommended MVP scope is:

```text
1. Claude Code
2. VS Code
3. Cursor
4. npm lifecycle
5. selected committed development-hook surfaces
```

Do not add every AI agent.

Do not make Gemini, Codex, Windsurf, Copilot, etc. mandatory unless the research proves they are necessary to the core product or can be added without risking the 72-hour delivery.

The architecture must be adapter-based so future ecosystems can be added without modifying the core graph engine.

---

# 9. DEPTH VS BREADTH

Lock:

> **Depth over breadth.**

The graph engine and reference resolver are more important than the number of integrations.

Preferred:

```text
few ecosystems
+
accurate semantics
+
multi-hop resolution
+
capability inference
+
path-based reasoning
```

Avoid:

```text
many ecosystems
+
weak parsers
+
simple grep
+
poor relationship analysis
```

The research explicitly prioritizes execution graph quality over integration count.

---

# 10. EXECUTION-SURFACE DEFINITION

Define formally:

> An execution surface is a repository-controlled configuration, script, task, hook, or automation relationship that can cause code or commands to execute under a relevant developer-tool, package, or development workflow context.

Define what does NOT qualify.

Examples that may qualify:

```text
agent hook
workspace task
package lifecycle script
development hook
repository-controlled bootstrap
```

Examples that do not automatically qualify:

```text
ordinary README
random file containing the word "hook"
plain documentation containing "curl"
non-executable project instructions
```

---

# 11. EXECUTION-SURFACE TAXONOMY

Define:

## AI/Agent

```text
CLAUDE_HOOK
CURSOR_HOOK
FUTURE_AGENT_SURFACE
```

## IDE/Workspace

```text
VSCODE_TASK
WORKSPACE_HOOK
```

## Package

```text
NPM_LIFECYCLE
```

## Development

```text
HUSKY_HOOK
DEV_SETUP
```

## Future

```text
CI_SURFACE
PLUGIN_SURFACE
MCP_SURFACE
```

Only freeze surfaces whose semantics are sufficiently documented and implementable.

---

# 12. PRIMARY TRUST BOUNDARIES

Explicitly model:

```text
Repository
    ↓
Development tool
    ↓
Trust decision
    ↓
Configuration
    ↓
Trigger
    ↓
Command
    ↓
Script
    ↓
Process
    ↓
Filesystem / Network / Environment
```

Also model:

```text
Repository
    ↓
Package manager
    ↓
Lifecycle script
```

The architecture must explain where HookAudit intervenes.

---

# 13. SECURITY INTERVENTION POINT

HookAudit is a:

> **pre-trust visibility and execution-surface-change analysis layer**

It is NOT:

```text
sandbox
endpoint protection
runtime firewall
complete malware detector
```

The product should identify possible execution behavior before the user relies on it.

---

# 14. SAFETY INVARIANT — ABSOLUTE

The target repository must be treated as inert data.

Never:

```text
import target code
require target code
execute target scripts
run target package manager
run target build
run target shell
run target interpreter
install target dependencies
execute target hooks
invoke target task runners
```

This invariant must be tested.

---

# 15. ZERO-DEPENDENCY INVARIANT

Runtime dependency count must be:

```text
0 third-party runtime dependencies
```

The core scan must not require:

```text
npm install
pip install
cargo install
external SaaS
target dependency installation
```

The product may identify strings representing:

```text
npm
curl
wget
python
bash
powershell
```

inside target files, but must not invoke them as part of target analysis.

---

# 16. STANDARD LIBRARY

If Node.js remains the final language, standard-library building blocks should include:

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

Map every feature to its standard-library implementation.

Example:

```text
File walking
→ node:fs + node:path

SHA-256
→ node:crypto

CLI
→ process.argv / node:util

Terminal output
→ stdout/stderr + ANSI sequences

JSON
→ JSON.parse / JSON.stringify
```

Do not add third-party runtime packages.

---

# 17. LANGUAGE DECISION

Compare Node.js and Python briefly before freezing the architecture.

Evaluation criteria:

```text
JSON handling
filesystem APIs
CLI
hashing
graph implementation
cross-platform handling
developer ecosystem alignment
72-hour speed
single-file distribution
testing
```

If Node.js clearly wins, freeze Node.js.

Do not keep cross-language implementation as active scope.

---

# 18. CORE ARCHITECTURE

The final architecture should be:

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
          ┌────────┬────────┬────────┬─────────┐
          ▼        ▼        ▼        ▼         ▼
       Claude   VS Code   Cursor     npm    Dev Hooks
          │        │        │        │         │
          └────────┴────────┴────────┴─────────┘
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
                  ┌────────┴─────────┐
                  ▼                  ▼
             HUMAN REPORT       JSON REPORT
                  │
                  ▼
               BASELINE
                  │
                  ▼
                 DIFF
```

Explain every stage.

---

# 19. MODULE CONTRACTS

Define exact responsibilities for:

```text
cli
scanner
boundary
adapters
model
extractor
resolver
graph
capability
risk
snapshot
baseline
diff
report
```

For each module define:

```text
Input
Output
Responsibilities
Dependencies
Failure behavior
Security requirements
Tests
```

No module should own responsibilities belonging elsewhere.

---

# 20. CANONICAL DATA MODEL

Freeze an implementation-neutral schema.

## ExecutionSurface

```text
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

## ExecutionNode

```text
{
    id,
    type,
    path?,
    name?,
    metadata?
}
```

## ExecutionEdge

```text
{
    from,
    to,
    type,
    evidence[]
}
```

## Finding

```text
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

## ExecutionPath

```text
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

---

# 21. EVIDENCE MODEL

Every important conclusion must retain evidence.

Example:

```text
Evidence
{
    path,
    line?,
    column?,
    field?,
    excerpt?,
    detector,
    reason
}
```

Evidence must remain tied to:

```text
surface
edge
capability
finding
```

Avoid unexplained severity.

---

# 22. ECOSYSTEM ADAPTER API

Define a common adapter contract such as:

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

The adapter must not contain:

- risk logic,
- CLI rendering,
- baseline storage,
- terminal formatting.

---

# 23. CLAUDE ADAPTER

Define exact supported configuration paths based on current documented semantics.

It must:

- parse valid JSON,
- detect supported hooks,
- extract triggers,
- extract commands,
- extract local references,
- retain evidence,
- record execution conditions.

Do not interpret undocumented fields as executable.

Malformed files:

```text
diagnostic
+
continue
```

---

# 24. VS CODE ADAPTER

Support documented execution surfaces only.

Potential initial surface:

```text
.vscode/tasks.json
```

Detect:

- task identity,
- command,
- args,
- execution trigger,
- automatic execution condition.

Do not treat arbitrary settings as commands.

Model workspace-trust or execution-condition semantics where relevant and documented.

---

# 25. CURSOR ADAPTER

Support documented project hook configuration.

Detect:

- project hook surface,
- trigger,
- command,
- local references,
- execution condition.

Do not treat instruction-only project files as direct execution surfaces unless their documented semantics establish execution.

---

# 26. NPM ADAPTER

Parse:

```text
package.json
```

Detect supported lifecycle scripts.

Minimum:

```text
preinstall
install
postinstall
prepare
```

Where relevant distinguish:

```text
root project script
```

from:

```text
dependency package lifecycle
```

Do not assume historical npm execution behavior remains unchanged.

---

# 27. DEVELOPMENT-HOOK ADAPTER

Support selected committed mechanisms such as:

```text
.husky/
setup scripts
hook installation scripts
```

Do not treat:

```text
.git/hooks/
```

as ordinary tracked repository files.

Distinguish:

```text
repository-controlled
```

from:

```text
local machine state
```

---

# 28. TRIGGER MODEL

Canonical triggers:

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

Not every ecosystem must support every trigger.

Trigger metadata must include:

```text
automatic
manual
event-driven
condition
source evidence
```

---

# 29. COMMAND MODEL

Normalize commands into:

```text
CommandSpec
{
    raw,
    executable?,
    arguments[],
    shell?,
    references[]
}
```

Handle:

- direct command,
- command + args,
- shell command,
- script reference,
- local path.

Do not execute to interpret.

---

# 30. REFERENCE RESOLUTION ENGINE

This is the core engineering problem.

Input:

```text
configuration
```

Output:

```text
resolved execution path
```

Required behavior:

1. identify references,
2. normalize paths,
3. resolve relative references according to the source's semantics,
4. enforce repository boundary,
5. read local target,
6. parse/analyze target,
7. discover additional references,
8. recursively traverse,
9. detect cycles,
10. preserve evidence,
11. stop safely at limits.

---

# 31. REFERENCE RESOLUTION STATES

Use:

```text
RESOLVED
PARTIALLY_RESOLVED
UNRESOLVED
```

Examples:

```text
resolved local file
dynamic variable path
missing file
remote reference
outside boundary
unsupported interpreter
```

Do not guess.

---

# 32. GRAPH TRAVERSAL

Recommended algorithm:

```text
queue = initial execution surfaces
visited = empty

while queue not empty:
    current = queue.pop()

    if current already visited:
        continue

    mark current visited

    extract supported references

    for reference:
        resolve safely

        add graph edge

        if target is analyzable:
            enqueue target
```

Carry:

```text
rootTrigger
currentNode
path
depth
evidence
```

---

# 33. GRAPH LIMITS

Recommended defaults:

```text
MAX_GRAPH_DEPTH = 32
MAX_FILE_SIZE = 1 MiB
```

These are initial engineering defaults and may be tuned.

When limits are reached:

```text
diagnostic
+
partial result
```

Do not fail the entire scan.

---

# 34. CYCLE DETECTION

Example:

```text
A → B → C → A
```

Must terminate.

Use canonical path/identity tracking.

Emit:

```text
CYCLE_DETECTED
```

as a diagnostic.

---

# 35. CAPABILITY TAXONOMY

Minimum:

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

Define each precisely.

---

# 36. CAPABILITY DETECTORS

## Network

Examples:

```text
curl
wget
Invoke-WebRequest
Invoke-RestMethod
HTTP client APIs
network URLs in executable contexts
```

## Process

Examples:

```text
node
python
powershell
bash
spawn
exec
direct executable
```

## Runtime bootstrap

Patterns indicating:

```text
download runtime
+
execute runtime
```

## Obfuscation

Examples:

```text
base64 decode
eval
dynamic command construction
large encoded payload
```

Do not overinterpret.

---

# 37. DOCUMENTATION CONTEXT

Do not treat:

```text
curl https://example.com
```

inside README documentation as executable.

Execution context must be part of the detector.

Potential context levels:

```text
EXECUTABLE
POTENTIALLY_EXECUTABLE
DOCUMENTATION
UNKNOWN
```

---

# 38. PATH-BASED RISK ENGINE

Use a deterministic, transparent rule-based model.

Do NOT use:

```text
opaque ML score
```

Preferred:

```text
signals
+
context
+
path combination
=
severity
```

---

# 39. RISK RULE EXAMPLES

```text
Automatic trigger
→ MEDIUM
```

```text
Automatic trigger
+
network
→ HIGH
```

```text
Automatic trigger
+
remote download
+
process execution
→ CRITICAL
```

```text
Manual local formatter
→ LOW
```

Rules must be centralized.

---

# 40. RISK VS CONFIDENCE

Keep separate:

```text
risk = impact/context estimate
confidence = static-analysis confidence
```

Examples:

```text
Risk: HIGH
Confidence: MEDIUM
```

This means:

> the path is concerning, but the static interpretation is partial.

---

# 41. RISK VS MALWARE

Never output:

```text
MALWARE
```

solely because a rule fires.

Use:

```text
HIGH-RISK EXECUTION PATH
```

or:

```text
CRITICAL EXECUTION SURFACE
```

with evidence.

---

# 42. FINDING EXPLANATION

Every meaningful finding should contain:

```text
Severity
Confidence
Trigger
Source
Execution path
Capabilities
Evidence
Reason
Recommendation
```

Example:

```text
[HIGH] SessionStart

Trigger:
.claude/settings.json

Path:
.claude/settings.json
  ↓
scripts/bootstrap.mjs
  ↓
NETWORK DOWNLOAD
  ↓
PROCESS EXECUTION

Why:
A repository-controlled automatic trigger reaches external network
behavior and process execution.

Evidence:
scripts/bootstrap.mjs:19
```

---

# 43. BASELINE MODEL

Baseline means:

> **Trusted execution-surface snapshot**

not:

> **Proof of repository safety**

Store:

```text
schemaVersion
repository identity
surface identities
relevant hashes
normalized surface state
capability summary
```

Use repository-relative identities.

---

# 44. BASELINE STORAGE

Recommended:

```text
.hookaudit/baseline.json
```

Determine whether it should be committed or local-only based on workflow.

Do not modify anything during normal scan.

Only explicit baseline command may write baseline metadata.

---

# 45. HASHING

Use:

```text
node:crypto
```

with SHA-256.

Hash:

- relevant execution-surface files,
- normalized state where practical.

Do not hash every repository file unless required.

---

# 46. DIFF MODEL

Minimum:

```text
NEW
CHANGED
REMOVED
```

## NEW

Surface does not exist in baseline.

## CHANGED

Surface exists but relevant state changed.

## REMOVED

Baseline surface no longer exists.

---

# 47. STRUCTURAL DIFF

Where feasible detect:

```text
NEW TRIGGER
CHANGED TRIGGER
NEW COMMAND
CHANGED COMMAND
NEW REFERENCE
REMOVED REFERENCE
```

---

# 48. CAPABILITY DIFF

Where feasible detect:

```text
NEW NETWORK
NEW REMOTE DOWNLOAD
NEW PROCESS EXECUTION
NEW RUNTIME BOOTSTRAP
NEW OBFUSCATION
NEW ENVIRONMENT ACCESS
```

---

# 49. SEMANTIC DIFF

Full semantic program diffing is NOT MVP.

Stretch goal:

```text
BEFORE
SessionStart → local script

AFTER
SessionStart → local script → network
```

Report:

```text
NEW REACHABLE CAPABILITY:
NETWORK

NEW EXECUTION PATH:
SessionStart → local script → external request
```

Only implement if the graph engine already makes it easy.

---

# 50. CLI CONTRACT

Required:

```bash
hookaudit .
hookaudit . --json
hookaudit . --strict
hookaudit baseline .
hookaudit diff .
```

Optional future:

```bash
hookaudit explain <finding>
```

Do not make optional commands part of MVP acceptance.

---

# 51. CLI BEHAVIOR

Define:

```text
--help
--json
--strict
--verbose (optional)
```

Exit codes:

```text
0 = success / no policy violation
1 = strict-policy violation
2 = invalid usage
3 = internal/scanner error
```

Document exactly.

---

# 52. HUMAN OUTPUT

First show:

```text
HOOKAUDIT

Repository: example-project

Execution surfaces: 6
High-risk paths:     2
New since baseline:  1

Trust decision: REVIEW
```

Then show highest-priority execution paths.

Do not dump every raw match first.

---

# 53. JSON OUTPUT

Minimum:

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

Make field ordering stable where practical.

---

# 54. DIAGNOSTICS

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

Diagnostics are not automatically security findings.

---

# 55. COVERAGE REPORTING

Consider:

```text
Supported execution surfaces analyzed: 6
Unsupported candidate surfaces: 2
Unresolved references: 1
```

This reduces false confidence.

Do not claim:

> “Nothing dangerous exists.”

Say:

> “No high-risk execution paths were detected in supported/analyzed surfaces.”

---

# 56. NO-FINDING UX

Use:

```text
No high-risk execution paths detected in supported surfaces.
```

Do not use:

```text
Repository SAFE
```

unless a separate trusted assurance model exists.

---

# 57. UNSUPPORTED UX

Use:

```text
2 candidate execution surfaces were not analyzed because their
formats are currently unsupported.
```

This is important for security honesty.

---

# 58. ERROR HANDLING

A malformed individual config should not crash the entire scanner.

Pattern:

```text
adapter failure
→ diagnostic
→ continue
```

Resolver failure:

```text
unresolved node
→ evidence
→ continue
```

Only fatal errors:

- invalid root,
- unreadable root,
- internal invariant violation.

---

# 59. SECURITY OF FILE ACCESS

Implement:

- path normalization,
- boundary enforcement,
- symlink policy,
- maximum depth,
- maximum file size,
- binary detection,
- cycle detection.

No uncontrolled filesystem traversal.

---

# 60. PERFORMANCE

Optimize for:

```text
typical repository
```

while remaining bounded on:

```text
large repository
monorepo
node_modules
generated files
binary-heavy repository
```

Use:

- prioritized surface discovery,
- file-size limits,
- ignored generated/vendor directories,
- cached file reads,
- deterministic traversal,
- bounded graph depth.

---

# 61. PRIVACY

Default behavior:

```text
LOCAL ONLY
NO TELEMETRY
NO CLOUD
NO UPLOAD
NO EXTERNAL THREAT INTELLIGENCE
NO TARGET CONTENT TRANSMISSION
```

Core scan should not need network access.

---

# 62. NO AUTOMATIC REMEDIATION

MVP should only report.

Do not automatically:

- delete hooks,
- edit package scripts,
- disable tasks,
- modify settings,
- rewrite scripts.

Possible future command:

```text
hookaudit fix
```

but not MVP.

---

# 63. TEST ARCHITECTURE

Create:

```text
unit tests
integration tests
security tests
CLI tests
determinism tests
baseline/diff tests
```

---

# 64. REQUIRED FIXTURES

```text
fixtures/
├── safe/
├── legitimate-hook/
├── network/
├── remote-download/
├── runtime-bootstrap/
├── obfuscated/
├── cross-tool/
├── nested/
├── cyclic/
├── malformed/
├── traversal/
├── dynamic/
├── baseline/
└── large-file/
```

---

# 65. SAFE FIXTURE

Expected:

```text
No high-risk execution paths.
```

Proves baseline scanner behavior.

---

# 66. LEGITIMATE HOOK FIXTURE

Example:

```text
automatic
→ formatter
```

Expected:

```text
LOW or MEDIUM
```

This proves the scanner does not equate hooks with malware.

---

# 67. NETWORK FIXTURE

Example:

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

# 68. REMOTE DOWNLOAD FIXTURE

Example:

```text
automatic trigger
→ remote download
```

Expected:

```text
REMOTE_DOWNLOAD
```

---

# 69. RUNTIME BOOTSTRAP FIXTURE

Example:

```text
automatic trigger
→ download runtime
→ execute runtime
```

Expected elevated risk.

---

# 70. OBFUSCATION FIXTURE

Example:

```text
encoded payload
→ decode
→ dynamic execution
```

Expected:

```text
OBFUSCATION
DYNAMIC_EXECUTION
```

without execution.

---

# 71. CROSS-TOOL FIXTURE

Example:

```text
Claude
→ script A
→ VS Code/task surface
→ script B
→ network
```

Expected:

```text
CROSS_TOOL_LINK
```

and one graph path.

---

# 72. NESTED FIXTURE

Example:

```text
config
→ A
→ B
→ C
→ capability
```

Expected:

complete supported multi-hop path.

---

# 73. CYCLIC FIXTURE

Example:

```text
A → B → C → A
```

Expected:

```text
CYCLE_DETECTED
```

No infinite loop.

---

# 74. MALFORMED FIXTURE

Invalid JSON.

Expected:

```text
diagnostic
+
remaining scan continues
```

---

# 75. TRAVERSAL FIXTURE

Reference:

```text
../outside-repository
```

Expected:

```text
BOUNDARY_VIOLATION
```

and no outside file access.

---

# 76. DYNAMIC FIXTURE

Example:

```text
path = env + "/setup.sh"
```

Expected:

```text
UNRESOLVED_REFERENCE
```

or:

```text
DYNAMIC_EXECUTION
```

Do not guess.

---

# 77. NEVER-EXECUTE TEST

Include a target script that would create a marker file if executed.

Run HookAudit.

Assert:

```text
marker file does not exist
```

This is a mandatory security regression test.

---

# 78. DETERMINISM TEST

Run the same repository twice.

Compare:

```text
surfaces
paths
findings
risk
JSON
ordering
```

Expected:

```text
same analytical result
```

---

# 79. BASELINE TESTS

Test:

```text
create baseline
unchanged repository
new surface
changed surface
removed surface
invalid baseline
missing baseline
```

---

# 80. CAPABILITY-DIFF TEST

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

# 81. REFERENCE TESTS

Test:

- relative reference
- nested reference
- duplicate reference
- missing reference
- external reference
- cycle
- path traversal
- dynamic reference

---

# 82. ADAPTER TESTS

Every adapter requires:

```text
valid safe fixture
valid suspicious fixture
malformed fixture
unsupported fixture
```

---

# 83. CLI TESTS

Test:

```text
--help
scan
--json
--strict
baseline
diff
invalid command
invalid path
```

Check exit codes.

---

# 84. DOCUMENTATION CONTRACT

Final repository must contain at minimum:

```text
README.md
STDLIB.md
```

Recommended:

```text
SECURITY.md
LIMITATIONS.md
```

---

# 85. README CONTRACT

README must explain:

1. what HookAudit is,
2. problem,
3. users,
4. supported surfaces,
5. architecture,
6. execution graph,
7. risk model,
8. baseline/diff,
9. zero-dependency design,
10. installation/run,
11. limitations,
12. safe-analysis behavior.

---

# 86. STDLIB CONTRACT

Explain meaningful replacements:

```text
Typical package
→ Node standard-library API
→ reason
→ limitation
```

Do not create artificial package substitutions.

---

# 87. ZERO-DEPENDENCY PROOF CONTRACT

The repository should show:

```text
runtime dependencies = 0
```

Proof:

```text
package.json
source imports
dependency tree
build command
test command
```

The research explicitly recommends visible dependency proof for judges.

---

# 88. SINGLE-FILE STRATEGY

Evaluate:

```text
hookaudit.js
```

vs modular source tree.

Single-file distribution is optional.

Only pursue it if it does not damage:

- maintainability,
- readability,
- testing,
- architecture.

The modular implementation is the default engineering choice.

---

# 89. REPRODUCIBILITY

Evaluate whether a deterministic build is practical.

Control where needed:

- file order
- graph order
- generated metadata
- timestamps
- runtime version

Do not sacrifice core functionality for a bonus.

---

# 90. BONUS FEATURES

Potential:

- Package Killer
- single-file runtime
- reproducible build
- SARIF
- policy engine

Do not implement bonus features before the core product passes all acceptance tests.

---

# 91. SECURITY RULES

The codebase must never:

```text
execute target command
import target package
install target dependency
follow unsafe path
silently ignore unsupported surfaces
claim malware from heuristics
leak target contents
use external network for core scan
introduce runtime dependency
```

---

# 92. ARCHITECTURAL ANTI-PATTERNS

Reject implementations that:

```text
use grep as the main engine
use regex findings without graph context
score files without execution context
hard-code risk inside adapters
mix terminal rendering into analysis logic
execute target code to improve detection
depend on npm packages at runtime
silently skip errors
assume every hook is malicious
assume every URL is executable
```

---

# 93. GRAPH-FIRST PRINCIPLE

The core engineering priority is:

```text
Execution Surface
        ↓
Trigger
        ↓
Command
        ↓
Reference
        ↓
Graph
        ↓
Capability
        ↓
Risk
```

Do not reverse this into:

```text
regex
→ score
→ invent graph
```

The graph must derive from real execution relationships.

---

# 94. RISK-FIRST PRINCIPLE

The risk engine operates after graph construction.

Correct:

```text
parse
→ resolve
→ graph
→ capabilities
→ risk
```

Not:

```text
regex
→ immediate HIGH
```

---

# 95. EXPLANATION-FIRST PRINCIPLE

Every high-risk path must be explainable.

The product should prioritize:

```text
Why?
```

over:

```text
How many?
```

---

# 96. TRUST-FIRST PRINCIPLE

The product's primary purpose is:

```text
help user decide whether to trust
```

not:

```text
produce the largest possible number of findings
```

---

# 97. BASELINE-FIRST PRINCIPLE

Baseline should answer:

> What was the repository's execution surface when I accepted it?

Diff should answer:

> What changed after that?

Do not imply:

```text
baseline = safe
```

---

# 98. FINAL MVP DEFINITION

The mandatory MVP is:

```text
1. bounded repository scanner
2. execution-surface normalization
3. Claude support
4. VS Code support
5. Cursor support
6. npm lifecycle support
7. selected development-hook support
8. trigger extraction
9. command extraction
10. reference resolution
11. recursive execution graph
12. capability inference
13. path-based deterministic risk
14. evidence-backed findings
15. human CLI output
16. JSON output
17. baseline
18. file/structural diff
19. capability diff where feasible
20. strict mode
21. safe inert analysis
22. security tests
23. deterministic output
24. zero runtime dependencies
25. README
26. STDLIB.md
```

---

# 99. MVP STRETCH

Only after MVP is stable:

```text
semantic execution-path diff
SARIF
policy file
interactive graph
HTML report
additional agents
additional IDEs
additional CI surfaces
```

---

# 100. EXPLICITLY OUT OF SCOPE

Do not build:

```text
full malware engine
full shell parser
full JavaScript static analyzer
full YAML parser
all agents
all IDEs
all package managers
dynamic sandbox
cloud backend
ML detector
threat-intelligence service
complete Git semantic engine
```

---

# 101. 72-HOUR BUILD PLAN

## PHASE 0 — Foundation

Before coding:

```text
repository layout
data model
adapter interface
CLI skeleton
fixtures
```

## DAY 1 — Surface Engine

Deliver:

```text
repository boundary
scanner
Claude adapter
VS Code adapter
Cursor adapter
npm adapter
normalized surface
trigger extraction
command extraction
basic output
```

Acceptance:

```text
fixture
→ surface
→ trigger
→ command
```

---

# 102. DAY 2 — GRAPH ENGINE

Deliver:

```text
reference resolver
recursive graph
cycle handling
capability engine
cross-tool relationships
path-based risk
JSON
```

Acceptance:

```text
config
→ script
→ secondary script
→ capability
```

appears as one explainable path.

---

# 103. DAY 3 — TRUST + POLISH

Deliver:

```text
baseline
diff
capability change
strict mode
security hardening
deterministic output
tests
README
STDLIB.md
dependency proof
demo fixture
demo recording
```

The latest research identifies this exact ordering and milestone structure. 

---

# 104. DAY 1 IMPLEMENTATION ORDER

Within Day 1:

```text
1. repository boundary
2. file scanner
3. normalized data model
4. adapter interface
5. Claude adapter
6. VS Code adapter
7. Cursor adapter
8. npm adapter
9. trigger extraction
10. command extraction
11. basic report
12. tests
```

Do not build fancy UI first.

---

# 105. DAY 1 ACCEPTANCE GATE

Before Day 2:

```text
[ ] CLI works
[ ] repository boundary works
[ ] no target execution
[ ] Claude detected
[ ] VS Code detected
[ ] Cursor detected
[ ] npm detected
[ ] normalized surface model works
[ ] trigger extracted
[ ] command extracted
[ ] malformed input doesn't crash
[ ] deterministic output
[ ] basic tests passing
```

---

# 106. DAY 2 ACCEPTANCE GATE

Before Day 3:

```text
[ ] local references resolve
[ ] nested references resolve
[ ] cycles terminate
[ ] boundary enforced
[ ] graph visible
[ ] network capability works
[ ] process capability works
[ ] bootstrap capability works
[ ] risk rules work
[ ] evidence retained
[ ] JSON works
```

---

# 107. FINAL ACCEPTANCE GATE

Before submission:

```text
[ ] all P0 features pass
[ ] no target code executed
[ ] zero runtime dependencies
[ ] repository boundary secure
[ ] deterministic
[ ] security fixtures pass
[ ] baseline works
[ ] diff works
[ ] capability diff works where supported
[ ] README complete
[ ] STDLIB complete
[ ] dependency proof complete
[ ] demo reproducible
```

---

# 108. CUT ORDER

If time is lost, cut in this order:

```text
1. interactive graph
2. HTML
3. SARIF
4. extra agents
5. extra ecosystems
6. full semantic diff
7. advanced UI
```

Protect:

```text
surface detection
reference resolution
graph
capabilities
risk
baseline/diff
safe analysis
tests
zero dependency
```

---

# 109. SIX-HOUR LOSS PLAN

Cut:

```text
extra adapter
semantic diff
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

# 110. TWELVE-HOUR LOSS PLAN

Reduce development-hook coverage.

Protect:

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

# 111. TWENTY-FOUR-HOUR LOSS PLAN

Reduce to:

```text
Claude
VS Code
npm
```

with strong graph resolution.

Do not sacrifice:

```text
safe analysis
graph
evidence
risk
```

---

# 112. PRODUCT ACCEPTANCE TEST

The final MVP must let a developer run:

```bash
hookaudit .
```

and understand:

```text
WHAT CAN EXECUTE?
WHEN?
WHERE?
WHAT DOES IT REACH?
WHAT CAPABILITIES ARE INVOLVED?
HOW RISKY IS THE PATH?
WHY?
```

---

# 113. BASELINE ACCEPTANCE TEST

Developer can run:

```bash
hookaudit baseline .
```

then after a repository change:

```bash
hookaudit diff .
```

and see:

```text
NEW
CHANGED
REMOVED
```

surfaces plus available capability changes.

---

# 114. SAFE-ANALYSIS ACCEPTANCE TEST

Target repository contains executable content.

HookAudit runs.

No target command executes.

This must be proven with a regression fixture.

---

# 115. ZERO-DEPENDENCY ACCEPTANCE TEST

Check:

```text
package.json
source imports
dependency tree
runtime startup
```

Everything must show:

```text
zero third-party runtime dependency
```

---

# 116. COMPETITIVE ACCEPTANCE TEST

The final README must not claim:

```text
first
only
nobody
blue ocean
completely unique
```

unless independently proven.

Recommended language:

> Existing tools cover pieces of repository, dependency, agent, and configuration security. HookAudit focuses on normalized repository execution topology and the way that topology changes over time.

---

# 117. FINAL POSITIONING

## Name

HookAudit

## Category

Repository Execution-Surface Auditor

## One-line pitch

> **A zero-dependency local security auditor that maps repository-controlled execution paths, explains what they can reach, and detects changes to those paths before they become incidents.**

## Core differentiator

```text
Execution Graph
+
Capability Reachability
+
Cross-Tool Resolution
+
Execution-Surface Diff
```

## Primary workflow

> Before trusting an unfamiliar repository.

## Secondary workflow

> After trust, detect changes in automatic execution behavior.

---

# 118. FINAL JUDGE STORY

The product story should be:

```text
Modern repository
        ↓
contains executable configuration
        ↓
developer may not notice it
        ↓
HookAudit maps it
        ↓
execution path becomes visible
        ↓
capabilities become visible
        ↓
risk becomes explainable
        ↓
developer decides whether to trust
```

Then:

```text
repository changes
        ↓
HookAudit diff
        ↓
execution surface changes become visible
```

---

# 119. FINAL DEMO

Demo one controlled repository.

Show:

```text
.claude/
.vscode/
.cursor/
scripts/
package.json
```

Then:

```bash
hookaudit .
```

Show:

```text
TRIGGER
 ↓
SCRIPT
 ↓
SECONDARY FILE
 ↓
NETWORK / PROCESS
```

Then:

```bash
hookaudit baseline .
```

Change fixture.

Then:

```bash
hookaudit diff .
```

Show:

```text
NEW EXECUTION PATH
```

Then prove:

```text
dependencies = 0
```

and explain:

> The repository was analyzed as data; its automation was never executed.

---

# 120. FINAL RED TEAM

Before freezing the contract, answer:

## Attack

“It is just grep.”

## Attack

“Existing agent scanners already do this.”

## Attack

“IDE trust mechanisms already solve this.”

## Attack

“Static analysis can't understand arbitrary scripts.”

## Attack

“False positives will make people ignore it.”

## Attack

“Baseline is just hashing.”

## Attack

“Why do we need a graph?”

## Attack

“Why not use Snyk/Socket?”

## Attack

“Why isn't this built into the IDE?”

For every attack:

```text
Claim
Evidence
Defense
Remaining weakness
Mitigation
```

---

# 121. FINAL CONTRADICTION CHECK

Compare the current technical contract against all research.

For every disagreement:

```text
Research says A
Research says B
Current primary evidence says C
```

Then decide:

```text
KEEP
REWRITE
NARROW
REMOVE
```

Do not silently overwrite earlier work.

---

# 122. FINAL REQUIREMENT TRACEABILITY

Create:

| Product Requirement | Design Decision | Module | Test | Demo |
|---|---|---|---|---|

Every major requirement must trace to implementation and proof.

Example:

```text
Never execute target
→ inert analysis
→ scanner/resolver
→ never-execute fixture
→ demo explanation
```

---

# 123. FINAL RISK REGISTER

Create:

| Risk | Probability | Impact | Detection | Mitigation | Owner |
|---|---:|---:|---|---|---|

Minimum:

- ecosystem semantics change
- parser bug
- reference resolution failure
- path traversal
- false positive
- false negative
- runtime dependency leakage
- scope explosion
- 72-hour schedule failure
- misleading security claim

---

# 124. FINAL DECISION LOG

Freeze decisions:

```text
Language:
Node.js

Runtime dependency:
0 third-party

Primary ecosystems:
Claude
VS Code
Cursor
npm
selected dev hooks

Architecture:
adapter + normalized graph engine

Graph priority:
depth

Risk:
deterministic rule-based

Baseline:
SHA-256

Diff:
file + structural + capability where feasible

Semantic diff:
stretch

Core operation:
local/offline

Target execution:
never
```

Each decision must include rationale.

---

# 125. FINAL IMPLEMENTATION CONTRACT

The coding agent MUST NOT:

```text
change the product thesis without instruction
expand ecosystem scope silently
add runtime packages
execute target repository content
skip evidence
turn risk into malware verdict
remove boundary protections
assume dynamic behavior
build non-MVP features before P0
```

The coding agent MUST:

```text
follow canonical data model
follow adapter interface
preserve graph semantics
preserve safety invariants
preserve deterministic output
write tests for each P0 feature
document limitations
maintain zero runtime dependencies
```

---

# 126. REQUIRED FINAL DOCUMENT STRUCTURE

Return the technical specification with exactly these sections:

## 1. Executive Decision

## 2. Source Material Reviewed

## 3. Verified Decisions vs Assumptions

## 4. Product Definition

## 5. User Personas

## 6. Primary User Workflow

## 7. Secondary Workflow

## 8. Trust Boundaries

## 9. Threat Model

## 10. Execution-Surface Taxonomy

## 11. Ecosystem Scope

## 12. Adapter Architecture

## 13. Canonical Data Model

## 14. Evidence Model

## 15. Repository Scanner

## 16. Repository Boundary

## 17. Trigger Extraction

## 18. Command Extraction

## 19. Reference Resolution

## 20. Graph Engine

## 21. Capability Model

## 22. Capability Detection

## 23. Risk Engine

## 24. Confidence Model

## 25. Human Reporting

## 26. JSON Contract

## 27. Baseline

## 28. Diff

## 29. Semantic Diff Stretch Goal

## 30. CLI Contract

## 31. Exit Codes

## 32. Diagnostics

## 33. Privacy

## 34. Zero-Dependency Architecture

## 35. Standard-Library Mapping

## 36. Performance

## 37. Security Invariants

## 38. Failure Handling

## 39. Testing Strategy

## 40. Fixture Matrix

## 41. Security Test Plan

## 42. Determinism Tests

## 43. Documentation Contract

## 44. STDLIB.md Contract

## 45. Dependency Proof

## 46. 72-Hour Plan

## 47. Cut Strategy

## 48. Acceptance Criteria

## 49. Requirement Traceability

## 50. Risk Register

## 51. Competitive Guardrails

## 52. Demo Contract

## 53. Judge Defense

## 54. Decision Log

## 55. Final MVP Contract

## 56. Explicit Non-Goals

## 57. Implementation Gate

---

# 127. FINAL MVP CONTRACT TABLE

End with:

| Feature | Priority | Exact Behavior | Input | Output | Dependencies | Test | Demo |
|---|---|---|---|---|---|---|---|
| Repository scanner | P0 | | | | | | |
| Claude adapter | P0 | | | | | | |
| VS Code adapter | P0 | | | | | | |
| Cursor adapter | P0 | | | | | | |
| npm adapter | P0 | | | | | | |
| Dev-hook adapter | P0/P1 | | | | | | |
| Trigger extraction | P0 | | | | | | |
| Command extraction | P0 | | | | | | |
| Reference resolver | P0 | | | | | | |
| Execution graph | P0 | | | | | | |
| Capability engine | P0 | | | | | | |
| Risk engine | P0 | | | | | | |
| Human report | P0 | | | | | | |
| JSON | P0 | | | | | | |
| Baseline | P1 | | | | | | |
| Structural diff | P1 | | | | | | |
| Capability diff | P1 | | | | | | |
| Strict mode | P1 | | | | | | |
| Semantic path diff | P2 | | | | | | |
| SARIF | P2 | | | | | | |
| Interactive graph | P2 | | | | | | |
| Extra ecosystems | P2 | | | | | | |

---

# 128. FINAL ACCEPTANCE CHECKLIST

Before declaring the specification complete:

```text
[ ] product definition frozen
[ ] user problem frozen
[ ] primary workflow frozen
[ ] primary ecosystems frozen
[ ] depth-over-breadth decision frozen
[ ] adapter contract frozen
[ ] normalized data model frozen
[ ] graph model frozen
[ ] reference resolver contract frozen
[ ] capability taxonomy frozen
[ ] risk rules frozen
[ ] confidence semantics frozen
[ ] evidence contract frozen
[ ] baseline semantics frozen
[ ] diff semantics frozen
[ ] CLI contract frozen
[ ] JSON contract frozen
[ ] repository boundary frozen
[ ] safe-analysis invariant frozen
[ ] zero-dependency invariant frozen
[ ] standard-library mapping complete
[ ] fixture plan complete
[ ] test plan complete
[ ] 72-hour plan complete
[ ] cut strategy complete
[ ] demo complete
[ ] rule-compliance mapped
[ ] competitive claims controlled
[ ] security claims controlled
[ ] implementation gate complete
```

---

# 129. FINAL OUTPUT RULE

Do NOT output vague statements such as:

```text
“We should probably...”
“Maybe support...”
“Could potentially...”
```

For MVP decisions, say:

```text
MUST
MUST NOT
SHOULD
STRETCH
OUT OF SCOPE
```

Every ambiguous area must be classified.

---

# 130. FINAL IMPLEMENTATION GATE

The technical specification is complete only when a developer can open it and answer:

```text
What are we building?
Why?
For whom?
What exactly is supported?
How is the data represented?
How does graph traversal work?
How are capabilities inferred?
How is risk determined?
How is evidence retained?
How does baseline/diff work?
What cannot the tool do?
How do we test security?
How do we prove zero dependencies?
How do we complete this in 72 hours?
What gets cut first?
What exactly counts as DONE?
```

If any answer is missing:

DO NOT START CODING.

---

# 131. FINAL HANDOFF

After the Technical Specification + MVP Contract is complete, produce a second artifact:

# DAY-1 IMPLEMENTATION PROMPT

This must be a separate implementation prompt for a coding agent.

It must instruct the coding agent to:

1. inspect the current repository,
2. preserve existing useful code where appropriate,
3. verify current state before changing anything,
4. implement only Day-1 scope,
5. use Node.js standard library only,
6. never execute target repository content,
7. create normalized execution-surface types,
8. create repository boundary protections,
9. create the adapter interface,
10. implement Claude,
11. implement VS Code,
12. implement Cursor,
13. implement npm,
14. implement trigger extraction,
15. implement command extraction,
16. implement deterministic human output,
17. create Day-1 fixtures,
18. create tests,
19. run tests,
20. prove zero runtime dependencies,
21. document what was completed,
22. explicitly list anything deferred to Day 2.

The Day-1 coding prompt must NOT implement:

```text
full graph
full capability engine
full risk engine
baseline
diff
semantic diff
extra ecosystems
```

unless a tiny foundation is required for integration.

---

# 132. DAY-1 IMPLEMENTATION ACCEPTANCE

Day 1 is complete only if:

```text
hookaudit .
```

can successfully:

```text
discover repository
→ detect supported surface
→ identify trigger
→ identify command
→ produce normalized surface
→ produce deterministic report
```

and:

```text
target code is never executed
runtime dependencies remain zero
tests pass
boundary protections work
```

---

# 133. FINAL DAY-1 REPORT

The coding agent must return:

```text
1. Files created/modified
2. Architecture implemented
3. Features completed
4. Tests added
5. Test results
6. Zero-dependency verification
7. Security verification
8. Known limitations
9. Deferred Day-2 items
10. Exact commands to run
```

No feature should be marked complete without evidence.

---

# 134. MOST IMPORTANT RULE

> **Do not build a generic scanner. Build the execution-topology engine.**

The adapter is how HookAudit understands an ecosystem.

The graph is what makes HookAudit itself.

---

# 135. FINAL PRODUCT FLOW

```text
                    HOOKAUDIT

                       INPUT
                         │
                         ▼
                    REPOSITORY
                         │
                         ▼
                  SURFACE DISCOVERY
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
               ┌─────────┴─────────┐
               ▼                   ▼
         HUMAN REPORT          JSON REPORT
               │
               ▼
             TRUSTED
             BASELINE
               │
               ▼
              DIFF
               │
               ▼
       EXECUTION-SURFACE CHANGE
```

---

# 136. FINAL PRINCIPLE

The implementation should make the invisible visible:

```text
Hidden repository automation
            ↓
Explicit execution surface
            ↓
Explicit execution path
            ↓
Explicit capability
            ↓
Explainable risk
            ↓
Trackable change
```

---

# 137. FINAL HANDOFF RULE

When the Technical Specification + MVP Contract is complete:

**STOP.**

Do not add unrelated features.

Do not start Day 2.

Do not expand ecosystem coverage.

Do not rewrite the product.

Generate the Day-1 implementation prompt from this frozen contract.

Then and only then begin implementation.

---

# END OF MASTER PROMPT
