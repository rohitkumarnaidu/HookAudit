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

**Reference resolution boundary** (implemented, per `RULES.md:10`):

- `../` , absolute paths, Windows drive letters, UNC paths, symlink/junction escapes outside `root` are rejected as:
  ```
  BOUNDARY_VIOLATION / UNRESOLVED_REFERENCE (diagnostic, not crash) — via central resolveInsideRepository(root,candidate)
  ```
  Verified: `node bin/hookaudit.js` now uses `path.resolve(root,candidate)` + `path.relative` + `isAbsolute` + `\\` UNC check + case-insensitive `startsWith(root)` on Win32.
- Symlinks: **never followed outside root** — `fs.lstatSync` + `isSymbolicLink` in both `listFilesRecursive` (discovery) and resolver; emits `SYMLINK_SKIPPED` and continues. Inside-root symlinks also skipped conservatively (MVP) with diagnostic.
- Large files: `MAX_FILE_SIZE=1MiB` via `lstat.size` before `readFileSync` → `FILE_TOO_LARGE`.
- Binary blobs: null-byte / non-printable heuristic → `BINARY_SKIPPED`.
- Cycle/depth: `visited:Set`, `MAX_GRAPH_DEPTH=32` → `CYCLE_DETECTED`/`DEPTH_LIMIT_REACHED`, preserves partial graph.

Boundary violations never cause outside reads; tested via `boundary traversal` and `symlink` fixtures.

## 4. Execution-Surface Model & Evidence

Every surface normalizes toward:

```
ExecutionSurface { id, sourcePath, surfaceType, triggerType, triggerCondition,
                   command, referencedPaths, capabilities, evidence, resolutionState,
                   severity, confidence }
```

Current `bin/hookaudit.js` returns `{file, surface, hash, findings, parseError, diagnostics, capabilities}` where
`findings[] = {trigger, command, commandSpec{raw,executable,args,shell,references,isDynamic}, severity, score, reasons, capabilities[], reachableCapabilities[], pathRisk, confidence, evidence[], field, sourcePath}` — `reasons` explain *why*, `capabilities` are structured (`PROCESS_EXECUTION` etc.), and all paths are POSIX-normalized and deterministically sorted. Graph adds `{nodes, edges, paths}` with evidence per edge.

Every meaningful edge/finding retains evidence:

```
path, field, detector, reason, excerpt (capped at 200 chars in evidence, 120 in report)
field pointer e.g. hooks.SessionStart[0].hooks[0].command
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

- Baseline is stored at `.hookaudit/baseline.json` as `{schemaVersion:2, createdAt, id: randomUUID, files:{posixPath:sha256}, surfaces:[{file,surface,hash,capabilities,findings}], capabilitySummary, graphSummary:{nodes,edges,paths}}` — hash uses `node:crypto.createHash('sha256')` (see `STDLIB.md:5`), files still POSIX-sorted.
- Legacy baseline `{files}` without `schemaVersion` is still readable (migration via `BASELINE_INVALID` if corrupt).
- Diff detects `NEW/CHANGED/REMOVED` file-level plus semantic `NEW_TRIGGER/REMOVED_TRIGGER/NEW_COMMAND/NEW_CAPABILITY/REMOVED_SURFACE` via normalized trigger/command/capability comparison. Graph-aware where resolvable.
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
- [ ] No `child_process`, `vm`, `fetch`, `https` at runtime (grep: 0 hits beyond test file)
- [ ] `node bin/hookaudit.js scan --path test/fixtures/malicious-repo` flags CRITICAL cross-ref + BLOCK, `paths` shows HIGH risk
- [ ] `node bin/hookaudit.js scan --path test/fixtures/clean-repo` has 0 CRITICAL, 2 WARN, `decision: REVIEW`
- [ ] `node bin/hookaudit.js . --json --strict` gates WARN (exit 1) vs `hookaudit . --json` (exit 0)
- [ ] Malformed JSON fixture → `parseError` + `INVALID_JSON` diagnostic, exit 0
- [ ] `node_modules` fixture → 0 results (never walked via IGNORED_DIRS)
- [ ] Large file (>1MiB) → `FILE_TOO_LARGE`, binary → `BINARY_SKIPPED`, symlink → `SYMLINK_SKIPPED`, boundary `../` → `BOUNDARY_VIOLATION` no outside read
- [ ] Multi-hop `config → script A → script B → network` yields `NETWORK_ACCESS` path; cycle `A→B→C→A` → `CYCLE_DETECTED`; dynamic `process.env` → `DYNAMIC_EXECUTION` `LOW`
- [ ] `npm test` → 22/22 pass (9 original + 13 safety/graph contracts)
- [ ] Paths in JSON are POSIX (`/`) on Windows and Linux (deterministic, sorted)
- [ ] Baseline `schemaVersion:2` present, diff shows `NEW_CAPABILITY` semantic

