# HookAudit — Repository Rules

## 1. Mission

HookAudit is a **Repository Execution-Topology Auditor**.

The core question is:

> What can this repository cause to execute, through which trigger, with which reachable capabilities, and what changed since I trusted it?

The implementation must preserve this product identity.

---

# 2. Non-Negotiables

1. The target repository is treated as untrusted data.
2. HookAudit must never execute target repository code during scanning.
3. HookAudit must never install target repository dependencies during scanning.
4. HookAudit must enforce repository boundaries.
5. HookAudit must use zero third-party runtime dependencies.
6. Findings must retain evidence.
7. Risk is not proof of malware.
8. Dynamic/unresolved behavior must be reported honestly.
9. Output must be deterministic.
10. Multi-hop execution-path resolution is a core MVP capability.

---

# 3. Hackathon Compliance

The shipped artifact must comply with the Zero Dependency Hackathon rules.

Required:

- empty runtime dependency manifest,
- standard-library-only runtime,
- one-command build,
- dependency proof,
- `README.md`,
- `STDLIB.md`,
- `deps-proof.txt`,
- `.zero-dep.toml`,
- public source repository,
- OSI-approved license,
- tests,
- five-minute demo.

Do not hide runtime dependencies through external commands.

Do not vendor third-party code to fake an empty manifest.

AI-assisted development is permitted.

---

# 4. Zero-Dependency Rules

## Runtime

Node.js standard library only.

Preferred built-ins:

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

## Forbidden at runtime

```text
npm packages
pip packages
external binaries
Git commands
curl
wget
jq
ripgrep
third-party CLIs
cloud APIs
required network services
```

The tool may analyze references to these commands in target repositories. It must not execute them as part of the target analysis.

## Development tooling

Development-only AI/tooling is allowed when permitted by the official event rules, but it must not become part of the shipped runtime artifact.

---

# 5. GSTACK RULES

gstack is a **development workflow tool**, not a HookAudit runtime dependency.

Use gstack skills where useful for:

```text
/office-hours
/plan-ceo-review
/plan-eng-review
/review
/investigate
/document-generate
/qa
/cso
/autoplan
/careful
/freeze
/guard
```

Never:

- import gstack from HookAudit,
- add gstack to `package.json` runtime dependencies,
- vendor gstack,
- require gstack for HookAudit execution.

---

# 6. Product Scope

Primary MVP surfaces:

```text
Claude Code
VS Code
Cursor
npm lifecycle
selected committed development-hook surfaces
```

Do not add extra ecosystems before the core execution graph is stable.

Future ecosystems are adapter candidates only.

---

# 7. Depth Over Breadth

The MVP prioritizes:

```text
reference resolution
execution graph
capability inference
path-based risk
evidence
```

over ecosystem count.

Core supported path:

```text
config
→ script A
→ script B
→ capability
```

Direct-only scanning is not sufficient.

---

# 8. Core Architecture

Maintain:

```text
Repository
    ↓
Boundary
    ↓
Surface Discovery
    ↓
Adapters
    ↓
Normalized Surface
    ↓
Trigger
    ↓
Command
    ↓
Reference Resolver
    ↓
Execution Graph
    ↓
Capability Inference
    ↓
Path-Based Risk
    ↓
Evidence
    ↓
Human + JSON Report
    ↓
Baseline / Diff
```

Adapters must not contain their own independent risk engines.

---

# 9. Safe Analysis

Target content is always inert data.

Allowed:

```text
read
parse
hash
match
normalize
resolve
graph
report
```

Forbidden:

```text
execute
import target modules
require target modules
npm install
npm run
target build
target tests
target hooks
target shell
target interpreters
target plugins
```

A scan must never need the target dependency tree installed.

---

# 10. Repository Boundary

All local reference resolution must remain inside the target repository boundary.

Protect against:

```text
../
absolute path escape
symlink escape
Windows junctions
UNC paths
```

Unsafe references become:

```text
UNRESOLVED
```

or:

```text
BOUNDARY_VIOLATION
```

Never silently traverse outside the repository.

---

# 11. Execution Surface

Canonical concept:

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

Every ecosystem adapter normalizes to this model.

---

# 12. Execution Graph

Nodes may include:

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

Edges may include:

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

Every important edge should preserve evidence.

---

# 13. Reference Resolution

MVP must support multi-hop static resolution.

Required:

```text
config → script
script → script
script → secondary file
cross-file relationship
cross-tool relationship where safely supported
cycle detection
depth limits
boundary checks
```

Never build a full language interpreter.

Unknown dynamic behavior:

```text
UNRESOLVED
PARTIALLY_RESOLVED
DYNAMIC
```

---

# 14. Capability Priorities

## P0

```text
PROCESS_EXECUTION
NETWORK_ACCESS
REMOTE_DOWNLOAD
```

## P1

```text
RUNTIME_BOOTSTRAP
ENVIRONMENT_ACCESS
CREDENTIAL_ACCESS_SIGNAL
```

## P1/P2

```text
FILE_READ
FILE_WRITE
OBFUSCATION
DYNAMIC_EXECUTION
CROSS_TOOL_LINK
```

Do not equate all capabilities with equal risk.

---

# 15. Risk Model

Risk is:

```text
unified
deterministic
rule-based
transparent
evidence-backed
```

Risk is based on:

```text
trigger context
+
execution path
+
reachable capabilities
+
project control
+
novelty
+
confidence
```

Example policy:

```text
automatic
+
network
+
process
=
HIGH
```

Example:

```text
automatic
+
remote download
+
process
+
obfuscation
=
CRITICAL
```

These are analytical rules, not malware proof.

---

# 16. Risk Is Not Malware

Never output:

```text
MALWARE DETECTED
```

from static heuristics alone.

Use:

```text
HIGH-RISK EXECUTION PATH
```

and show:

```text
why
evidence
capabilities
confidence
recommendation
```

---

# 17. Evidence

Every meaningful detection must preserve evidence such as:

```text
path
line
field
detector
reason
excerpt when safe
```

No unexplained high-severity finding.

---

# 18. Confidence

Keep separate:

```text
risk
confidence
```

Example:

```text
Risk: HIGH
Confidence: MEDIUM
```

Meaning:

> potential impact is high, but static interpretation is incomplete.

---

# 19. Coverage and Uncertainty

If something cannot be analyzed:

```text
UNSUPPORTED
UNRESOLVED
PARTIALLY_RESOLVED
DYNAMIC
```

Do not silently omit it.

Do not claim total repository safety.

Preferred no-finding wording:

> No high-risk execution paths detected in supported/analyzed surfaces.

---

# 20. Baseline

Baseline means:

> The execution-surface state the user chose to trust at a point in time.

Recommended location:

```text
.hookaudit/baseline.json
```

Baseline does not prove safety.

---

# 21. Diff

MVP must detect:

```text
NEW
CHANGED
REMOVED
```

Also track normalized execution changes where feasible:

```text
trigger change
command change
reference change
capability change
```

Full arbitrary program semantic equivalence is out of scope.

---

# 22. CLI

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

---

# 23. Output

Human output must answer:

```text
WHAT
WHEN
WHERE
PATH
CAPABILITY
WHY
```

JSON must preserve structured evidence.

Do not overwhelm the user with raw low-value matches before meaningful execution paths.

---

# 24. No Automatic Remediation

MVP only reports.

Do not automatically:

```text
delete
rewrite
disable
modify
```

target configuration.

---

# 25. Security Tests

Mandatory:

```text
never-execute test
boundary traversal test
symlink test
cycle test
malformed input test
large file test
dynamic reference test
baseline test
diff test
determinism test
```

The never-execute regression test must prove a target payload marker is never created.

---

# 26. Fixture Classes

Maintain fixtures for:

```text
safe
legitimate
automatic
network
remote-download
runtime-bootstrap
obfuscation
cross-tool
nested
cyclic
malformed
traversal
dynamic
baseline
```

---

# 27. Determinism

For identical repository state:

```text
scan result
graph
findings
risk
JSON
ordering
```

should be deterministic.

---

# 28. Performance

Protect against:

```text
large repositories
monorepos
node_modules
generated directories
binaries
huge files
deep graphs
```

Use:

```text
size limits
depth limits
cycle detection
binary skipping
safe exclusions
caching where useful
```

---

# 29. Privacy

Default behavior:

```text
local
offline-capable
no telemetry
no upload
no required cloud
no external threat intelligence
```

Do not transmit target repository content.

---

# 30. Documentation

Maintain:

```text
README.md
STDLIB.md
RULES.md
SECURITY.md
LIMITATIONS.md
```

Research/specification history:

```text
docs/research/
docs/spec/
```

Do not duplicate content unnecessarily.

---

# 31. STDLIB

`STDLIB.md` must document real replacements such as:

```text
CLI parsing
filesystem traversal
hashing
terminal formatting
testing
diff logic
```

For every meaningful substitution explain:

```text
what would normally be imported
what stdlib API replaces it
why
limitations
```

---

# 32. README

README must explain:

```text
what
why
who
how
supported surfaces
architecture
graph
risk
baseline/diff
zero dependency
limitations
```

Do not overclaim uniqueness.

---

# 33. Security Documentation

`SECURITY.md` should document:

```text
threat model
safe-analysis principle
repository boundary
limitations
risk vs malware
reporting
disclosure path
```

---

# 34. Limitations

`LIMITATIONS.md` should explicitly mention:

```text
dynamic code
dynamic paths
unsupported ecosystems
shell/language parsing limits
false positives
false negatives
remote second-stage behavior
```

---

# 35. Competitive Claims

Never claim:

```text
first
only
nobody
completely unique
```

unless independently proven.

Preferred:

> Existing tools cover parts of repository, dependency, agent, and configuration security. HookAudit focuses on normalized repository execution topology and execution-surface changes.

---

# 36. Git Rules

Before changing:

```text
inspect git status
inspect relevant files
understand current behavior
```

After changing:

```text
inspect git diff
run tests
run dependency audit
run security checks
```

Never destroy unrelated user work.

---

# 37. AI Coding Rules

AI tools are allowed.

Every AI-generated change must be:

```text
reviewed
tested
understood
documented where significant
```

Do not blindly paste generated code.

Do not allow an AI coding agent to introduce dependencies without explicit approval and rule verification.

---

# 38. Scope Control

A new feature must pass:

```text
supports core product?
strengthens graph?
improves evidence?
preserves zero dependency?
testable?
72-hour feasible?
```

Otherwise:

```text
CUT
```

---

# 39. Stop Conditions

STOP and report when:

- a runtime dependency appears,
- target execution seems necessary,
- repository boundary is ambiguous,
- current platform semantics are unclear,
- an unsupported ecosystem is becoming core,
- a security invariant would weaken,
- existing work might be destroyed,
- hackathon compliance is uncertain,
- a major architecture change cannot be justified.

Do not silently improvise through a stop condition.

---

# 40. Definition of Done

A feature is DONE only if it is:

```text
implemented
tested
reviewed
documented
secure
deterministic
within scope
```

---

# 41. Day 1

Must establish:

```text
CLI
repository boundary
scanner
normalized model
Claude adapter
VS Code adapter
Cursor adapter
npm adapter
trigger extraction
command extraction
basic report
tests
```

---

# 42. Day 2

Must establish:

```text
reference resolver
multi-hop graph
cycle handling
capability engine
cross-tool links
risk engine
JSON
```

---

# 43. Day 3

Must establish:

```text
baseline
diff
capability diff where feasible
strict mode
security hardening
full tests
README
STDLIB
dependency proof
demo
```

---

# 44. Cut Order

Cut first:

```text
interactive graph
HTML
SARIF
extra ecosystems
extra agents
full semantic diff
full shell AST
advanced UI
```

Protect:

```text
graph
resolver
capabilities
risk
evidence
baseline/diff
safe analysis
tests
zero dependency
```

---

# 45. Documentation Accuracy Rule

Documentation must describe what the current implementation actually does.

Never document a future feature as if it already exists.

When a feature is planned but not implemented, label it:

```text
Planned
Future
Stretch
Not implemented
```

---

# 46. Research Accuracy Rule

Research files are evidence, not runtime truth.

When implementing an ecosystem:

```text
verify current documented semantics
```

before hard-coding behavior.

---

# 47. Final Product Rule

The project must remain:

```text
repository execution-topology auditor
```

not:

```text
generic hook grep
```

The execution graph is the central technical asset.

---

# 48. Final Principle

> Understand first. Preserve safety. Build the graph. Prove the behavior. Polish last.
