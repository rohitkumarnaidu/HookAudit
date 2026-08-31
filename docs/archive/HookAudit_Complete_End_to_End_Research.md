# HookAudit — End-to-End Real-World Research & Product Investigation

## Zero Dependency 72-Hour Hackathon 2026

> **Research status:** Deep investigation of the HookAudit concept against the current 2026 developer/security ecosystem, the uploaded HookAudit specification, the existing Preflight and trust-local research, and the Zero Dependency methodology/rules.
>
> **Important:** This document distinguishes source-supported facts from analysis, inference, and product recommendations. Some earlier claims in the research were intentionally corrected where current evidence showed they were too broad.

---

# 1. Executive Summary

## Current conclusion

**HookAudit remains the strongest candidate among Preflight, trust-local, and HookAudit, but the winning concept is NOT merely “a hook scanner.”**

The stronger concept is:

> **A zero-dependency repository execution-surface auditor that maps repository-controlled automatic execution paths across AI agents, editors, package managers, and development automation; correlates those paths into an execution graph; explains reachable capabilities; and detects changes to those execution surfaces over time.**

The strongest user question is:

> **“What can this repository cause to execute, through which trigger, and what changed since I trusted it?”**

The strongest architectural abstraction is:

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
Execution Graph
    ↓
Risk / Evidence
    ↓
Baseline / Diff
```

The project should **not** be positioned as:

- a generic malware scanner,
- a generic dependency scanner,
- a Claude-only hook scanner,
- a perfect static-analysis engine,
- or “the first tool to scan AI hooks.”

The research found existing projects that already scan individual AI-agent/configuration surfaces. The differentiation must therefore come from **repository-wide execution topology, cross-tool reachability, evidence-based path reasoning, and execution-surface change detection**.

---

# 2. Starting Research Materials

This investigation is based on:

1. **HookAudit specification**
   - Zero-dependency repository execution-surface security auditor.
   - Defines the core execution-graph concept, signals, baseline/diff, threat model, workflows, architecture, MVP and limitations.

2. **Zero Dependency 2026 — Deep Research & Winning Idea**
   - Prior broad problem landscape.
   - Preflight candidate.
   - Supply-chain research.
   - Competitive analysis.
   - Track and hackathon analysis.

3. **From SBOM Generation to Trust**
   - Prior trust-local/SBOM research.
   - SBOM authenticity/integrity concept.
   - Technical feasibility and crypto-risk analysis.

4. **The Anatomy of a Comprehensive Study**
   - Research methodology.
   - Emphasis on system definition, lifecycle analysis, stakeholder mapping, granular failure modes, causal modeling, validation, and contradictory evidence.

5. **Zero Dependency 2026 official rule/context material**
   - Six tracks.
   - Runtime dependency constraints.
   - New-code rule.
   - Submission requirements.
   - Zero-dependency proof.
   - Security and CLI expectations.

---

# 3. Research Methodology

The investigation follows the uploaded methodological framework.

The methodology requires:

- precise system definition,
- explicit research boundaries,
- component decomposition,
- stakeholder identification,
- end-to-end lifecycle analysis,
- real-world evidence,
- failure-mode investigation,
- cross-checking,
- causal modeling,
- and active search for evidence that contradicts the initial hypothesis.

The key principle is:

> **Do not start with the idea and search only for evidence that supports it. Start with the real system and discover where the evidence leads.**

This is especially important for HookAudit because earlier research overstated the degree to which the space was “blue ocean.”

---

# 4. Research Scope

## Primary domain

Software repository execution and trust.

## Focus areas

- AI coding agents
- IDE/workspace automation
- repository-local hooks
- package lifecycle execution
- Git/development automation
- setup/bootstrap scripts
- repository-controlled command execution
- cross-file execution chains
- static capability analysis
- baseline/diff
- local/offline security
- software supply-chain security
- AI-assisted development

## Time emphasis

Primarily 2025–2026.

Older incidents are used for historical context where necessary.

## Geographic scope

Global.

## Technical scope

Local developer/security tooling that can plausibly operate with zero third-party runtime dependencies.

---

# 5. The Real System

The traditional model of a repository is:

```text
Repository
    ├── Source
    ├── Dependencies
    └── Configuration
```

That model is increasingly incomplete.

A modern repository may contain:

```text
Repository
    ├── Source code
    ├── Dependency manifests
    ├── Lockfiles
    ├── AI-agent configuration
    ├── IDE/workspace configuration
    ├── Hooks
    ├── Task definitions
    ├── Setup scripts
    ├── Build automation
    └── Development automation
```

Some of these artifacts can influence or trigger execution.

Therefore the security model should become:

```text
Repository
    ↓
Executable configuration
    ↓
Automatic trigger
    ↓
Execution path
    ↓
Capabilities
```

The repository is not only code.

It is also a potential **execution control plane**.

---

# 6. Complete Lifecycle

A complete investigation should trace the lifecycle:

```text
Developer / AI Agent
        ↓
Dependency or repository selected
        ↓
Repository cloned
        ↓
Repository inspected
        ↓
Repository opened / trusted in tooling
        ↓
Project-local configuration loaded
        ↓
Automatic trigger
        ↓
Command / script
        ↓
Secondary file / command
        ↓
Network / filesystem / process behavior
        ↓
Build / packaging
        ↓
Release
        ↓
Deployment
        ↓
Runtime
```

For dependency-specific flows, also consider:

```text
Dependency Intent
        ↓
Manifest
        ↓
Version Resolution
        ↓
Lockfile
        ↓
Registry
        ↓
Package Download
        ↓
Install
        ↓
Lifecycle Scripts
        ↓
Build
```

The key research question is:

> **At which point does repository-controlled executable behavior become visible, and what is currently verifying it?**

---

# 7. Stakeholders

## AI-assisted developers

Need to know whether a repository contains behavior that will be activated by an agent or tool.

## Security engineers

Need evidence when reviewing repositories, PRs, vendors, and developer environments.

## Open-source maintainers

Need to know whether changes introduce new repository-controlled execution paths.

## Platform / DevOps / CI engineers

Need a machine-readable gate before allowing repositories into automation environments.

## Incident responders

Need a way to identify suspicious or newly introduced execution surfaces after a compromise.

## Tool vendors

Provide overlapping capabilities such as agent scanning, static analysis, dependency analysis, provenance, or configuration validation.

---

# 8. The Core Problem

The core problem is not simply:

> “Hooks are dangerous.”

It is:

> **Repository-controlled configuration can create execution paths that are difficult to see when reviewing source code or individual files in isolation.**

Examples include:

- AI-agent hooks
- editor/workspace tasks
- package lifecycle scripts
- development hooks
- setup/bootstrap scripts
- repository automation

A developer might inspect:

```text
src/
package.json
README.md
```

while overlooking:

```text
.claude/settings.json
.vscode/tasks.json
.github/hooks/
.husky/
scripts/bootstrap.*
```

or the relationships among them.

---

# 9. What HookAudit Should Answer

Every scan should answer:

### What can execute?

Identify the actual execution surface.

### When can it execute?

Identify the trigger:

- session start
- tool lifecycle
- folder/workspace event
- install
- package lifecycle
- Git/development event
- other supported event

### What executes?

Identify command/script/process.

### What does it reference?

Trace local files and scripts.

### What capabilities are reachable?

Examples:

- network
- remote download
- process spawning
- runtime bootstrap
- environment access
- filesystem interaction
- suspicious decoding
- shell execution

### Has it changed?

Compare the current execution surface to a trusted baseline.

---

# 10. Core Execution-Surface Model

Represent the system as a graph.

## Nodes

- Repository
- Configuration
- Trigger
- Command
- Script
- File
- Process
- Network
- Environment
- Capability

## Edges

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

The graph, not the individual keyword, is the core technical object.

---

# 11. Why Cross-Link Analysis Matters

A malicious execution chain does not have to live in one obvious file.

Example:

```text
File A
  ↓
File B
  ↓
File C
  ↓
Network
```

Individually:

```text
A = ordinary configuration
B = normal-looking setup script
C = helper script
```

Together:

```text
A → B → C → external execution
```

may represent a high-risk execution path.

Therefore HookAudit should analyze relationships rather than simply report:

```text
“File A is suspicious.”
```

Instead:

```text
EXECUTION PATH

Trigger
  ↓
Configuration
  ↓
Script
  ↓
Secondary script
  ↓
Network / process capability
```

This is the strongest candidate for the project's unique technical value.

---

# 12. Current 2026 Reality: The Space Is Not Empty

Earlier Qwen analysis claimed:

> “NO ONE IS SCANNING THIS.”

That should **not** be used.

Current tooling already includes projects that inspect AI-agent and repository configuration surfaces.

Examples researched include:

- Snyk Agent Scan
- agent-hook-scan
- AgentGuard
- Claude-specific hook scanners
- other AI-agent security/configuration scanners

Therefore:

### False positioning

> “The first AI hook security scanner.”

### Better positioning

> **“A repository-wide execution-surface analyzer.”**

The difference matters.

---

# 13. Competitive Category Map

Current security tooling is roughly divided into:

```text
Dependency scanners
        ↓
Package / CVE risk

SAST
        ↓
Source-code vulnerabilities

Secret scanners
        ↓
Credentials

Agent / plugin scanners
        ↓
Agent configuration / MCP / skills / hooks

SBOM / provenance systems
        ↓
Artifact / build trust

Repository execution topology
        ↓
Potential HookAudit space
```

The last category must be defined carefully.

We should not claim there are no competing capabilities.

The defensible claim is:

> Existing tools often focus on individual configuration ecosystems, individual risk patterns, or individual file classes. HookAudit's proposed differentiation is to construct a **single repository-wide execution graph** across multiple supported execution surfaces and track how that graph changes over time.

That claim should remain subject to continued feature-level competitor validation.

---

# 14. AI-Agent Execution Surfaces

Current AI coding systems increasingly expose project/repository-level configuration and hooks.

Relevant surfaces researched include:

- Claude Code hooks and project settings
- Cursor project hooks
- VS Code/agent hooks
- GitHub Copilot repository-scoped hooks
- plugin/agent configurations
- MCP-related configuration

This means repository configuration can become a form of executable behavior rather than merely editor preference.

Important distinction:

> AI did not invent repository execution surfaces. AI-assisted tools are expanding the number and sophistication of repository-controlled automation points.

---

# 15. Important Correction About “Automatic Execution”

Do NOT say:

> “A malicious repository will always execute the instant you clone it.”

That is too broad.

Current tools include trust mechanisms and configuration changes that can delay execution until a trust decision or other condition.

For example:

- patched Claude Code versions have changed when project-local configuration is processed,
- VS Code's automatic tasks have workspace-trust conditions,
- other agent systems differ in when and how project hooks activate.

Therefore HookAudit should model:

```text
EXECUTION CONDITION
```

rather than assuming:

```text
CLONE = EXECUTION
```

The more defensible question is:

> **What execution behavior becomes reachable after a repository enters a user's trusted tool context?**

---

# 16. Package Lifecycle Execution

Package lifecycle execution remains relevant, but the threat model has evolved.

Do not assume all package managers execute install scripts identically.

Current ecosystems have different controls, defaults, and allowlisting behavior.

Therefore HookAudit should detect:

- lifecycle presence
- script presence
- policy/allowlist configuration where supported
- relationships to repository scripts

It should say:

```text
INSTALL-TIME EXECUTION SURFACE
```

rather than automatically:

```text
MALWARE
```

---

# 17. Git Hook Handling

Native Git hooks require special handling.

Do not treat:

```text
.git/hooks/
```

as a normal version-controlled repository directory.

Git hooks normally reside within Git's internal directory structure or configured hook path.

The analyzer should distinguish:

```text
repository-committed hook configuration
```

from:

```text
local machine hook state
```

Potential committed surfaces:

- `.husky/`
- setup scripts that install hooks
- configured hook paths
- other repository-tracked hook automation

This avoids an inaccurate Git model.

---

# 18. Detection Signals

## Signal 1 — Automatic execution

Detect whether a configuration can execute without a direct manual command.

Examples:

- startup
- session start
- folder/workspace event
- tool lifecycle
- install
- postinstall
- Git event

Risk increases when:

```text
AUTOMATIC
+
PROJECT-CONTROLLED
+
USER/AGENT PRIVILEGES
```

---

## Signal 2 — Network access

Detect:

- HTTP clients
- download commands
- remote endpoints
- fetch operations
- remote script retrieval

Report:

```text
NETWORK ACCESS
```

not automatically:

```text
MALWARE
```

---

## Signal 3 — Runtime/bootstrap behavior

Detect:

- downloading runtimes
- downloading executables
- installing binaries
- fetching setup scripts
- executing a newly acquired runtime

Example:

```text
download runtime
   ↓
execute runtime
   ↓
execute script
```

---

## Signal 4 — Cross-directory / cross-tool linking

Detect a configuration file that references files or execution surfaces in another tool/configuration area.

This is one of HookAudit's signature concepts.

---

## Signal 5 — Obfuscation

Potential signals:

- base64 blobs
- encoded commands
- dynamically reconstructed commands
- eval-like patterns
- compressed/encoded payloads where practical

These must be reported as:

```text
OBFUSCATION / REVIEW SIGNAL
```

not proof of malware.

---

# 19. Path-Based Risk Model

A weak model is:

```text
curl = HIGH
```

A stronger model is:

```text
automatic trigger
+
project-controlled
+
network access
+
remote download
+
process execution
```

→ potentially HIGH or CRITICAL.

The risk should be assigned to an **execution path**, not just a token.

Recommended levels:

### LOW

Execution surface exists, but evidence suggests routine/manual or low-risk behavior.

### MEDIUM

Automatic execution or suspicious behavior requires review.

### HIGH

Multiple concerning signals combine.

### CRITICAL

A high-impact automatic execution path reaches multiple strong capabilities, for example:

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

---

# 20. Risk Is Not a Malware Verdict

HookAudit must explicitly state:

> **RISK SCORE ≠ MALWARE VERDICT**

Static analysis cannot perfectly determine whether arbitrary code is malicious.

Limitations include:

- dynamic code
- arbitrary shell semantics
- downloaded code
- indirect execution
- encrypted payloads
- platform-specific behavior
- user-defined scripts
- runtime-dependent behavior

Therefore output should emphasize:

```text
EVIDENCE
+
SIGNALS
+
EXECUTION PATH
```

rather than claiming perfect malware detection.

---

# 21. The “Reachability” Concept

The research suggests an even stronger abstraction:

# Execution Reachability

For each trigger determine what capabilities are transitively reachable.

Example:

```text
SessionStart
   ↓
setup.mjs
   ↓
child_process
   ↓
curl
   ↓
remote host
```

The tool can report:

```text
REACHABLE CAPABILITIES

NETWORK
PROCESS SPAWN
REMOTE DOWNLOAD
```

This is more informative than:

```text
curl found
```

because it explains why the finding matters.

---

# 22. Behavioral Execution-Surface Diff

Baseline/diff should not remain merely a file-hash comparison.

The stronger future capability is:

```text
TRUSTED EXECUTION GRAPH
        ↓
CURRENT EXECUTION GRAPH
        ↓
SEMANTIC DIFF
```

Example:

Before:

```text
SessionStart
→ local formatter
```

After:

```text
SessionStart
→ local formatter
→ network request
```

Report:

```text
BEHAVIOR CHANGE

New reachable capability:
NETWORK

Existing execution path:
SessionStart → formatter

New execution path:
SessionStart → formatter → external request
```

That is substantially more useful than:

```text
SHA-256 changed
```

A semantic execution diff should be a major future direction and, if time permits, a high-value MVP enhancement.

---

# 23. Baseline / Trust-on-First-Use

Static scanning gives a snapshot.

Baseline turns the tool into a change detector.

Workflow:

```text
Trusted repository
        ↓
hookaudit baseline .
        ↓
Trusted execution state
```

Later:

```text
Updated repository
        ↓
hookaudit diff .
        ↓
NEW
CHANGED
REMOVED
```

Important:

A changed execution surface is a:

```text
REVIEW EVENT
```

not automatically malicious.

---

# 24. Primary User Workflows

## Workflow A — Before Trusting a Repository

```text
Clone repository
        ↓
Do not open it in the target agent/editor yet
        ↓
hookaudit scan .
        ↓
Review execution-surface report
        ↓
TRUST / REVIEW / REMOVE / BLOCK
```

---

## Workflow B — Before Installing Dependencies

```text
Repository exists
        ↓
hookaudit scan .
        ↓
Review:
- package lifecycle
- agent hooks
- editor tasks
- development hooks
        ↓
Install only after review
```

---

## Workflow C — Pull Request Review

```text
PR modifies repository configuration
        ↓
HookAudit detects new execution surface
        ↓
Reviewer sees trigger + path + capability
```

---

## Workflow D — Continuous Trust Baseline

```text
hookaudit baseline .
        ↓
time passes
        ↓
repository changes
        ↓
hookaudit diff .
        ↓
new/changed execution path
```

---

## Workflow E — CI Gate

```text
hookaudit . --strict
        ↓
PASS
REVIEW
BLOCK
```

Machine-readable output can support CI without requiring an external service.

---

# 25. Zero-Dependency Advantage

The strongest zero-dependency argument is not:

> “The hackathon requires no packages.”

It is:

> **A security auditor intended for untrusted repositories should not require the target repository's dependency tree to be installed or executed merely to inspect its execution surfaces.**

The ideal workflow is:

```text
Untrusted repository
        ↓
NO npm install
NO pip install
NO target build
NO target execution
        ↓
Run standalone HookAudit
        ↓
Read configuration/scripts as inert data
        ↓
Analyze
```

This creates real benefits:

- low bootstrap friction
- local operation
- offline capability for supported checks
- easier auditability
- small runtime dependency surface
- predictable behavior
- simple distribution

Do not claim “zero security risk.” The precise claim is:

> **HookAudit introduces zero third-party runtime dependencies and does not need to execute the target repository to inspect supported execution surfaces.**

---

# 26. Standard-Library Feasibility

Node.js is currently the strongest fit for this project because the target ecosystem contains substantial JavaScript/JSON configuration.

Useful standard-library/runtime primitives include:

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

Potential core uses:

```text
filesystem walking
JSON parsing
SHA-256
path resolution
CLI parsing
streams
process information
testing
```

No runtime packages should be required.

---

# 27. Technical Architecture

```text
                INPUT
                  ↓
        Repository Discovery
                  ↓
        Execution Surface Parser
                  ↓
        Trigger Extraction
                  ↓
        Command Extraction
                  ↓
        Reference Resolver
                  ↓
        Behavior / Capability Analyzer
                  ↓
        Execution Graph Builder
                  ↓
        Path-Based Risk Engine
                  ↓
        Human + JSON Reporter
                  ↓
        Baseline / Diff Engine
```

Logical modules:

```text
scanner
parser
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

---

# 28. Reference Resolution Is the Hard Engineering Problem

Filesystem walking and JSON parsing are easy.

The important technical problem is:

> **Resolving execution references without running them.**

Example:

```text
settings.json
    ↓
./scripts/setup.mjs
    ↓
../shared/bootstrap.sh
    ↓
bootstrap.sh
    ↓
node another.js
```

The resolver should:

1. identify a reference,
2. normalize the path,
3. ensure it remains inside the relevant repository boundary where appropriate,
4. load the referenced file as inert data,
5. extract further references,
6. recursively expand the graph,
7. stop cycles,
8. retain evidence for every edge.

This is where the project gains genuine engineering depth.

---

# 29. Cross-Platform Capability Normalization

Do not attempt to fully interpret shell languages.

Instead normalize common behaviors.

Examples:

```text
curl / wget / Invoke-WebRequest
        ↓
NETWORK_DOWNLOAD
```

```text
bash -c / sh -c / powershell -Command
        ↓
SHELL_EXECUTION
```

```text
node / python / direct executable
        ↓
PROCESS_EXECUTION
```

```text
base64 -d / certutil / encoded blobs
        ↓
DECODED_PAYLOAD_SIGNAL
```

This provides explainability without pretending to be a full interpreter.

---

# 30. Supported Execution Surfaces

Recommended initial scope:

## AI / agent

- Claude Code project settings/hooks
- Cursor project hooks
- other documented JSON-based agent surfaces where formats are stable

## IDE / workspace

- VS Code tasks and supported hook/configuration surfaces
- GitHub/Copilot repository hook configurations where format is known

## Package lifecycle

- `package.json`
- package lifecycle fields
- related lockfile metadata where useful

## Development hooks

- committed hook directories such as `.husky`
- other clearly repository-controlled hook configuration

Avoid attempting to support every ecosystem in the first release.

---

# 31. What NOT to Support in MVP

Do not attempt:

- a full shell AST
- a full JavaScript static analyzer
- a complete YAML parser
- every AI agent
- every IDE
- every CI provider
- perfect malware detection
- dynamic sandbox execution
- a full package registry intelligence system
- cloud backend
- ML model
- external threat-intelligence service
- full Git semantic modeling

A smaller, deeply coherent engine is better.

---

# 32. Recommended MVP

## Must Have

1. Repository scanner
2. Surface normalization
3. Agent configuration detection
4. Editor/workspace detection
5. Package lifecycle detection
6. Development-hook detection
7. Trigger extraction
8. Command/script extraction
9. Reference resolution
10. Recursive execution graph
11. Network/download detection
12. Runtime/bootstrap detection
13. Process execution detection
14. Obfuscation/review signals
15. Path-based risk score
16. Human-readable report
17. JSON report
18. SHA-256 baseline
19. Diff
20. Safe inert analysis
21. Tests
22. Zero third-party runtime dependencies

## Should Have

- richer shell heuristics
- more agent formats
- better capability correlation
- semantic diff summaries
- CI policy mode

## Nice to Have

- interactive graph
- HTML report
- policy files
- SARIF
- more ecosystems

---

# 33. Testing Strategy

Create fixtures representing:

## Safe repository

No execution surfaces.

Expected:

```text
PASS
```

## Safe hook

Automatic hook that runs a harmless local formatter.

Expected:

```text
LOW / MEDIUM
```

depending on policy.

## Network hook

Automatic hook that performs network access.

Expected:

```text
HIGH signal
```

## Runtime bootstrap

Downloads and executes a runtime.

Expected:

```text
HIGH / CRITICAL
```

## Obfuscated script

Encoded execution behavior.

Expected:

```text
OBFUSCATION signal
```

## Cross-linked execution chain

Configuration references secondary configuration/script.

Expected:

```text
CROSS-LINK finding
```

## Baseline change

Trusted baseline, then modified hook.

Expected:

```text
CHANGED EXECUTION SURFACE
```

## False positives

Legitimate development hooks.

Expected:

```text
No critical classification merely because a hook exists.
```

---

# 34. Demo Strategy

The demo should be completely deterministic.

## 0:00–0:40 — The problem

Show a seemingly ordinary repository.

Say:

> Modern repositories can contain executable configuration, not just source code.

Show:

```text
.claude/
.vscode/
scripts/
package.json
```

---

## 0:40–1:20 — Existing controls

Do not falsely claim:

> “Existing tools say this repository is safe.”

Instead demonstrate a narrower point:

> Traditional dependency/vulnerability scanning answers different questions. It does not explain the repository's entire automatic execution topology.

Show a repository with:

```text
0 known dependency vulnerabilities
```

but a suspicious execution path.

---

## 1:20–2:50 — HookAudit

Run:

```bash
node hookaudit.js .
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

Explain:

> HookAudit analyzes the repository as data and does not execute its hooks during the scan.

---

## 2:50–3:50 — Baseline / Diff

Run:

```bash
hookaudit baseline .
```

Make a controlled fixture change.

Run:

```bash
hookaudit diff .
```

Show:

```text
NEW EXECUTION PATH
```

and explain what changed.

---

## 3:50–4:30 — Path-based reasoning

Show:

```text
AUTOMATIC TRIGGER
+
REMOTE DOWNLOAD
+
PROCESS EXECUTION
```

→

```text
HIGH / CRITICAL
```

Then explain why the tool does not claim “malware.”

---

## 4:30–5:00 — Zero-dependency proof

Show:

```text
package.json
dependencies: {}
```

Show:

```text
stdlib-only
```

Show build/run command.

Finish with:

> **“Before you trust a repository, know what it can execute.”**

---

# 35. Strongest Demo Graph

Ideal visual:

```text
.claude/settings.json
        │
        ▼
   SessionStart
        │
        ▼
scripts/bootstrap.mjs
        │
        ├──────► process spawn
        │
        ▼
.vscode/tasks.json
        │
        ▼
   setup script
        │
        ▼
 remote download
```

Then:

```text
RISK: HIGH

REACHABLE CAPABILITIES:
- Process execution
- Network access
- Remote download

ACTION:
Review before trust.
```

---

# 36. Key Differentiation

## Weak differentiation

```text
Zero dependencies
Offline
CLI
AI security
```

These are useful properties, but not sufficient as the product's primary differentiation.

## Strong differentiation

```text
Repository-wide execution topology
+
Cross-tool relationship analysis
+
Capability reachability
+
Path-based risk
+
Execution-surface baseline/diff
```

That is the product wedge to investigate and defend.

---

# 37. Existing Scanner vs HookAudit Positioning

## Existing agent/configuration linter

```text
Find suspicious configuration.
```

## HookAudit

```text
Find execution surfaces.
Resolve their references.
Build an execution graph.
Determine reachable capabilities.
Explain the execution path.
Track how that execution topology changes.
```

The distinction should be demonstrated in the output, not merely stated in marketing copy.

---

# 38. Why This Is Not Just Grep

A grep-style tool might find:

```text
curl
eval
base64
```

HookAudit should understand:

```text
.claude/settings.json
        ↓
SessionStart
        ↓
scripts/init.sh
        ↓
curl
```

The important unit is therefore:

```text
execution path
```

not:

```text
matching string
```

The project becomes materially stronger when the graph is explicit.

---

# 39. Security Model

Threat sequence:

```text
Attacker / compromised contributor
        ↓
Repository-controlled configuration
        ↓
Developer clones repository
        ↓
Developer opens / trusts / installs / interacts
        ↓
Agent / editor / package / development automation
        ↓
Automatic execution
        ↓
Network / filesystem / credential / process capability
```

HookAudit intervenes at:

```text
REVIEW BEFORE EXECUTION
```

It does not need to execute the suspicious repository content to analyze the supported surfaces.

---

# 40. Security Limitations

HookAudit cannot guarantee:

- repository safety
- absence of malware
- absence of vulnerabilities
- absence of backdoors
- complete shell understanding
- complete dynamic behavior analysis

It can provide:

- execution-surface inventory
- trigger visibility
- evidence-backed path analysis
- capability signals
- baseline/diff
- machine-readable output

This limitation should be prominently documented.

---

# 41. Trust Boundary Concept

The project can be framed as a **pre-trust visibility layer**.

Traditional thinking:

```text
clone
 ↓
open
 ↓
trust
 ↓
tools execute
 ↓
detect something
```

HookAudit proposes:

```text
clone
 ↓
HookAudit
 ↓
understand execution surface
 ↓
trust decision
 ↓
open / install / interact
```

This is the cleanest product story.

---

# 42. Relation to Preflight

Preflight asks:

> **“What dependency am I about to trust?”**

HookAudit asks:

> **“What can this repository automatically execute?”**

These are different security questions.

Preflight is more exposed to existing dependency-security competition.

HookAudit's strongest potential differentiation comes from execution topology.

---

# 43. Relation to Trust-Local

Trust-local asks:

> **“Can I verify the integrity/authenticity of this software inventory?”**

HookAudit asks:

> **“What executable behavior is embedded in this repository's configuration and automation?”**

Again, these are different trust boundaries.

Trust-local has greater cryptographic implementation complexity.

HookAudit has a simpler standard-library path.

---

# 44. Current Major Risks

## Risk 1 — Existing competition

There are already agent/configuration scanners.

### Mitigation

Make execution-graph construction the core innovation.

---

## Risk 2 — False positives

Static heuristics may flag legitimate scripts.

### Mitigation

Use path/context-aware scoring and evidence explanations.

---

## Risk 3 — Scope explosion

Supporting every ecosystem can consume the entire hackathon.

### Mitigation

Start with a small number of high-value surfaces.

---

## Risk 4 — Shell parsing complexity

Regex cannot perfectly interpret arbitrary shell.

### Mitigation

Explicitly position detection as heuristic capability analysis, not execution emulation.

---

## Risk 5 — Current platform security changes

AI/editor platforms may add trust prompts or stronger defaults.

### Mitigation

Detect and report execution surfaces regardless of whether a platform currently blocks or gates them.

The tool should answer:

> “What is configured and what becomes reachable under the relevant execution condition?”

---

# 45. What We Should NOT Claim

Avoid:

```text
“The first AI security scanner.”
```

Avoid:

```text
“Nobody checks these files.”
```

Avoid:

```text
“Existing tools are completely blind to this.”
```

Avoid:

```text
“This repository is malware.”
```

Avoid:

```text
“Zero dependencies means zero security risk.”
```

Avoid:

```text
“Any automatic hook is malicious.”
```

Avoid:

```text
“Opening a repository always executes hooks immediately.”
```

These claims are too broad.

---

# 46. Strong Product Positioning

Recommended:

> **HookAudit — See what a repository can execute before you trust it.**

Alternative:

> **Audit repository execution surfaces before they become execution.**

Long-form positioning:

> **HookAudit is a zero-dependency local security tool that maps repository-controlled automatic execution paths across supported AI agents, editors, package managers, and development automation, explains the capabilities reachable through those paths, and detects how those surfaces change over time.**

---

# 47. Strong One-Sentence Product Value

> **HookAudit turns hidden repository automation into an explicit, reviewable execution graph.**

This is better than:

> “HookAudit detects malicious hooks.”

---

# 48. Potential Semantic Data Model

```text
ExecutionSurface
{
    sourcePath,
    surfaceType,
    triggerType,
    command,
    referencedPaths[],
    capabilities[],
    evidence[],
    severity,
    confidence
}
```

Graph:

```text
ExecutionNode
ExecutionEdge
```

Baseline:

```text
ExecutionSnapshot
{
    version,
    surfaces[],
    graphHash,
    fileHashes[]
}
```

Diff:

```text
ExecutionDiff
{
    newPaths[],
    changedPaths[],
    removedPaths[],
    newCapabilities[],
    removedCapabilities[]
}
```

---

# 49. Recommended CLI

```bash
hookaudit .
```

Scan repository.

```bash
hookaudit baseline .
```

Create trusted execution-surface baseline.

```bash
hookaudit diff .
```

Compare current state to baseline.

```bash
hookaudit . --json
```

Machine-readable report.

```bash
hookaudit . --strict
```

Return non-zero status for policy-defined high-risk findings.

Potential future command:

```bash
hookaudit explain <finding>
```

to expand the exact execution path.

---

# 50. Recommended Default Output

Start with:

```text
HOOKAUDIT

Repository: example-project

Execution surfaces: 6
High-risk paths:     2
New since baseline:  1

Trust decision: REVIEW
```

Then show the highest-risk paths first.

Example:

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

This is much better than a list of 40 raw findings.

---

# 51. Research-Based Final Score

Current assessment:

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
| Post-hackathon usefulness | 9/10 |
| Overall potential | **~9/10** |

These numbers are analytical judgments, not official hackathon scores.

---

# 52. Final Strategic Comparison

| Candidate | Core Question | Main Strength | Main Weakness |
|---|---|---|---|
| Preflight | What dependency am I about to trust? | Useful pre-install supply-chain signal | Crowded dependency-security market |
| trust-local | Can I verify this SBOM/software state? | Strong integrity concept | Crypto/format complexity and narrower workflow |
| HookAudit | What can this repository automatically execute? | Strong execution-surface concept + excellent demoability | Existing overlap requires a genuine graph/topology wedge |

---

# 53. Why HookAudit Currently Wins

HookAudit has the best combination of:

```text
Real problem
+
Current relevance
+
Simple core abstraction
+
Strong technical depth
+
Strong zero-dependency story
+
Excellent local/offline story
+
Clear demo
+
Baseline/diff
```

The key point is not that the market is empty.

The key point is:

> **The product can occupy a distinct abstraction if it treats repository execution as a graph of reachable behavior rather than a set of suspicious configuration files.**

---

# 54. The Final Product Thesis

The final thesis should be:

```text
Modern repositories increasingly contain executable configuration.

Existing tools often examine:
- dependencies,
- vulnerabilities,
- source code,
- secrets,
- individual agent configurations,
- artifacts,
- provenance.

HookAudit focuses on a different abstraction:

REPOSITORY EXECUTION TOPOLOGY.

It answers:
1. What can execute?
2. What triggers it?
3. What does it invoke?
4. What can that invocation reach?
5. What capabilities become reachable?
6. What changed since the repository was trusted?
```

---

# 55. Final MVP Architecture

```text
                    REPOSITORY
                        │
                        ▼
                SURFACE DISCOVERY
                        │
                        ▼
               CONFIG / HOOK PARSERS
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
        HUMAN REPORT          JSON REPORT
              │
              ▼
        BASELINE / DIFF
```

---

# 56. Final Build Priority

Order engineering effort like this:

## Priority 1

Execution-surface normalization.

## Priority 2

Reference resolution.

## Priority 3

Execution graph.

## Priority 4

Capability inference.

## Priority 5

Path-based risk.

## Priority 6

Baseline/diff.

## Priority 7

Reporting / UX.

This prevents the project from becoming a pile of regexes.

---

# 57. Final Go / No-Go Gate

HookAudit should proceed to implementation only if these remain true:

- Real users have the problem.
- The problem is current.
- Existing tools do not provide the exact proposed workflow adequately.
- The graph/topology abstraction is materially differentiated.
- Zero dependencies create real operational/security value.
- Standard-library implementation is feasible.
- The project can be completed in 72 hours.
- The project can be demonstrated in five minutes.
- Security claims remain modest and defensible.
- Scope can remain controlled.

At present:

**GO**

with the execution-graph framing.

---

# 58. Final Research Conclusion

The original HookAudit proposal was directionally correct but overly broad in several claims.

The research supports the existence of a real and growing problem:

```text
Repository-controlled automation
+
AI/editor integration
+
automatic execution
+
developer trust
```

The research does **not** support:

```text
“Nobody else scans this.”
```

The strongest opportunity therefore is not “hook scanning.”

It is:

# REPOSITORY EXECUTION TOPOLOGY

Specifically:

```text
discover
→ normalize
→ resolve
→ graph
→ infer capabilities
→ score paths
→ baseline
→ diff
```

The most important product sentence is:

> **HookAudit turns hidden repository automation into an explicit, reviewable execution graph.**

The most important user question is:

> **“What can this repository cause to execute, through which trigger, and what changed since I trusted it?”**

The most important design principle is:

> **Analyze the repository as inert data; never execute its suspicious automation during analysis.**

The most important differentiation is:

> **Execution graph + cross-tool reachability + capability-aware path reasoning + execution-surface change detection.**

That is the version of HookAudit worth building.

---

# 59. Sources / Verification Notes

The final implementation and claims should continue to use primary/strong sources, especially:

- Official Zero Dependency Hackathon website and cheat sheets
- Official platform documentation for Claude Code
- Official VS Code documentation
- Official GitHub Copilot hook documentation
- Official Cursor hook documentation
- Git documentation
- npm documentation
- Relevant CVEs and vendor security advisories
- Peer-reviewed / preprint research on agent/plugin ecosystems
- Current GitHub repositories/issues for competing scanners

Competitor examples identified during this investigation include:

- Snyk Agent Scan
- agent-hook-scan
- AgentGuard
- Claude-specific hook-security scanners
- Other agent/configuration security scanners

These examples are important because they invalidate a blanket “nobody does this” claim.

---

# 60. Final Position

## PROJECT

**HookAudit**

## TRACK

**Track E — Security & Crypto Utilities** is defensible because the official track explicitly includes local security scanners and file-integrity/security tooling.

Track A remains a plausible alternative because the product is also a developer CLI.

## ONE-LINE PITCH

> **A zero-dependency local security auditor that maps repository-controlled execution paths, explains what they can reach, and detects changes to those paths before they become incidents.**

## CORE QUESTION

> **What can this repository cause to execute automatically?**

## KILLER FEATURE

> **Execution Graph + Capability Reachability**

## SECOND KILLER FEATURE

> **Execution-Surface Baseline / Diff**

## ZERO-DEPENDENCY STORY

> **Inspect an untrusted repository without installing or executing its dependency tree, while the auditor itself introduces zero third-party runtime dependencies.**

## MOST IMPORTANT LIMITATION

> **Static analysis provides evidence and risk signals, not proof that arbitrary code is malicious or safe.**

## FINAL STATUS

**Proceed with HookAudit, but build the execution-topology product—not a generic hook linter.**
