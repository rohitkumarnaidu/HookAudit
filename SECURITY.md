# SECURITY.md — HookAudit Threat Model & Security Posture

**Version:** 0.1.0 — 2026-08-31  
**Scope:** `bin/hookaudit.js` (zero-dependency, stdlib-only)  
**Contact:** See `README.md` / repository Issues for disclosure

## 1. Threat Model

### In Scope

HookAudit defends a developer who has just **cloned or pulled an unfamiliar repository** (open-source dependency, contributor fork, take-home assignment, CTF/hackathon submission) and wants to know — *before* opening it in an AI agent or editor — whether that repository contains configuration that will **execute automatically**.

Covered surfaces (11, see `bin/hookaudit.js:47` SURFACES):

```
.claude/settings.json      (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit)
.mcp.json / .claude/mcp.json (MCP server launch)
.vscode/tasks.json         (runOn: folderOpen)
.vscode/settings.json
.cursorrules / .cursor/rules
.gemini/settings.json
.codex/config.toml         (heuristic text scan — see Limitations)
package.json               (preinstall/postinstall/prepare/install/prepublish)
.husky/*
.git/hooks/*               (excluding *.sample)
.pre-commit-config.yaml
```

The question HookAudit answers is:

> What can this repository cause to execute, through which trigger, with which reachable capabilities, and what changed since I trusted it?

### Out of Scope

- Attacker already has a foothold on the developer's machine (compromised `node` binary, compromised OS, compromised HookAudit itself).
- Malicious *package code* vs. *lifecycle/hook config* — that's what SBOM/CVE scanners cover; HookAudit is not a replacement.
- Zero-day vulnerabilities in Claude Code, VS Code, or any agent/editor itself.
- Network second-stage payloads — HookAudit is static; it never fetches remote URLs it finds.

## 2. Safe-Analysis Principle (Non-Negotiable)

The target repository is **untrusted input**. HookAudit must:

```
Allowed: read, parse, hash, normalize, match, resolve, graph, report
Forbidden: execute, import, require, load plugin, install, build, run
```

Verified (`bin/hookaudit.js:31-34`):

- Only imports: `node:fs`, `node:path`, `node:crypto`, `node:util` — all `node:` built-ins.
- No `node:child_process`, no `vm`, no `fetch`/`https` at runtime.
- Target content is read via `fs.readFileSync(p,'utf8')` and inspected as a string/regex/JSON — never `eval`'d, never spawned.

Individual parser failures do **not** crash the scan:

```
bad JSON → diagnostic {parseError: 'invalid JSON'} → continue other surfaces
unreadable file → diagnostic {parseError: 'unreadable'} → continue
```

Fatal errors are limited to: invalid root path, unreadable root.

## 3. Repository Boundary

**All discovery is confined to the target root** (`path.resolve(values.path)`).

- `resolveSurfaceFiles` joins only hard-coded SURFACES globs via `path.join(root, rel)` — never user-supplied paths.
- `IGNORED_DIRS = {node_modules, .git, dist, build, .hookaudit}` — never bulk-walks `node_modules` (which could be huge or attacker-controlled) or `.git` objects.
- `.git/hooks` is walked separately (only to detect committed hook scripts) and `*.sample` templates are ignored.

**Reference resolution boundary** (future graph, per `RULES.md:10`):

- `../` , absolute paths, Windows drive letters, UNC paths, symlink/junction escapes outside `root` must be rejected as:
  ```
  UNRESOLVED or BOUNDARY_VIOLATION (diagnostic, not crash)
  ```
- Symlinks: MVP policy is to **not follow symlinks outside the root** (`fs.lstatSync` + `isSymbolicLink` check, preserve evidence that symlink was skipped). If a symlink target remains within root it may be followed — otherwise emit diagnostic.
- Large files: `FILE_SKIPPED_SIZE_LIMIT` (default 1 MiB) — skip and emit diagnostic.
- Binary blobs: `BINARY_SKIPPED` — skip.

Boundary violations never cause outside reads.

## 4. Execution-Surface Model & Evidence

Every surface normalizes toward:

```
ExecutionSurface { id, sourcePath, surfaceType, triggerType, triggerCondition,
                   command, referencedPaths, capabilities, evidence, resolutionState,
                   severity, confidence }
```

Current `bin/hookaudit.js:321` returns `{file, surface, hash, findings, parseError}` where
`findings[] = {trigger, command, severity, score, reasons}` — `reasons` already explain *why* in plain language, and all paths are now POSIX-normalized and deterministically sorted.

Every meaningful edge/finding should retain evidence:

```
path, field, detector, reason, excerpt (capped at 120 chars in report)
```

## 5. Capabilities & Risk

Capabilities are inferred, not executed:

```
P0: PROCESS_EXECUTION, NETWORK_ACCESS, REMOTE_DOWNLOAD
P1: RUNTIME_BOOTSTRAP, ENVIRONMENT_ACCESS, CREDENTIAL_ACCESS_SIGNAL
P1/P2: FILE_READ, FILE_WRITE, OBFUSCATION, DYNAMIC_EXECUTION, CROSS_TOOL_LINK
```

Risk is **unified, deterministic, rule-based, transparent, evidence-backed** (RULES.md:15).
Adapters do not have independent risk engines. Example policy:

```
automatic + network + process = HIGH
automatic + remote download + process + obfuscation = CRITICAL
```

Risk is **not** proof of malware. HookAudit never outputs `MALWARE DETECTED`. It outputs
`HIGH-RISK EXECUTION PATH` plus evidence + confidence + recommendation.

Confidence is **separate** from risk:

```
Risk: HIGH, Confidence: MEDIUM — potential impact high, but static interpretation incomplete (e.g. dynamic path)
```

Unsupported/dynamic behavior is explicit:

```
DYNAMIC, UNRESOLVED, PARTIALLY_RESOLVED
```

Unknown is better than invented certainty.

## 6. Baseline / Diff Integrity

- Baseline is stored at `.hookaudit/baseline.json` as `{createdAt, id: randomUUID, files: {posixPath: sha256}}`.
- Hash uses `node:crypto.createHash('sha256')` — audited primitive, not custom crypto (see `STDLIB.md:5`).
- Diff detects `NEW`, `CHANGED`, `REMOVED` by hash comparison; future should also report structural changes (new trigger, changed command, new capability) — honest limitation until resolver/graph lands.
- Baseline does **not** prove safety — it records *what you chose to trust* at a point in time.

## 7. Privacy

- Local only, offline-capable, no telemetry, no repository upload, no cloud dependency, no required external network.
- No target content is transmitted anywhere. There is no `fetch` or `https` import.
- If an optional online feature is ever added it must be explicit and opt-in; core scan remains local.

## 8. What HookAudit Does Not Do

Per `README.md:178` and `LIMITATIONS.md`:

- It does not automatically remediate (no deleting hooks, rewriting scripts, disabling tasks, editing `package.json`).
- It does not sandbox-execute hooks to observe behavior.
- It scans the **working tree only** today — not every branch (to avoid hidden `git` runtime dependency; git-native `.git/refs` + `node:zlib` walker is a Day-2 stretch).

## 9. Reporting & Disclosure

- **Found a vulnerability in HookAudit itself?** Please open an issue or email the maintainer listed in `package.json` / GitHub repo. Do not open a public issue with a working exploit until a fix is available.
- **Found a false negative/positive?** Open an issue with a minimal redacted fixture (synthetic placeholder commands only — do not upload live malware).
- **Responsible language:** Please reproduce HookAudit's own phrasing in reports:

```
No high-risk execution paths detected in supported/analyzed surfaces.
Unsupported execution surfaces were not analyzed.
```

Never claim “Repository is completely safe” from a single tool.

## 10. Hardening Checklist (for reviewers)

- [ ] `npm ls --all` → (empty)
- [ ] `grep -c "require(" bin/hookaudit.js` → 4, all `node:` prefixed
- [ ] No `child_process`, `vm`, `fetch`, `https` at runtime
- [ ] `node bin/hookaudit.js scan --path test/fixtures/malicious-repo` flags CRITICAL cross-ref
- [ ] `node bin/hookaudit.js scan --path test/fixtures/clean-repo` has 0 CRITICAL
- [ ] Malformed JSON fixture → `parseError` diagnostic, exit 0
- [ ] `node_modules` fixture → 0 results (never walked)
- [ ] `npm test` → 9/9 pass (plus planned 4 new: never-execute, boundary, determinism, strict)
- [ ] Paths in JSON are POSIX (`/`) on Windows and Linux (deterministic)

