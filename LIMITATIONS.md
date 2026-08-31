# LIMITATIONS.md — What HookAudit Cannot Determine

**Version:** 0.1.0 — 2026-08-31  
**Honesty rule:** Unknown is better than invented certainty. This file exists to avoid false confidence.

HookAudit is a **static, local, file-integrity tripwire** — not a sandbox, not a proof of safety. Please read these limits before relying on its output.

## 1. Working Tree + Local Git Branch Walker

**Working tree:** HookAudit scans the **currently checked-out working tree** via direct filesystem reads. **New in this build:** `hookaudit branches .` also reads **local** branch execution surfaces without `git` exec — via `.git/HEAD` + `refs/heads/*` + `packed-refs` and `node:zlib` inflate of `commit/tree/blob` objects (bounded: 5 MiB object, 64-depth, 4096 entries, 64 branches). This covers committed branch drift (`NEW_TRIGGER/NEW_CAPABILITY`) locally. It does NOT fetch remotes, clone, or access credentials/server-side history. If you need multi-branch assurance, use `hookaudit branches . --json` or `git worktree`.

**Why not `git` binary:** Shelling out would be a hidden runtime dependency (DSQ). The walker reads `.git` on-disk format legally under zero-dep rules.

**Limitation:** Branch walker reads **committed** trees only; `.git/hooks` is local machine state (not committed) and is excluded. Packed-refs deltas that require packfile delta resolution beyond loose objects are reported as `UNSUPPORTED_FORMAT` where not yet supported. Treat branch objects as untrusted (malformed→diagnostic, not crash).

## 2. TOML / YAML — Heuristic Scan + Minimal Policy Parsers

**Surfaces still heuristic:**

- `.codex/config.toml`, `.pre-commit-config.yaml` — raw-text heuristic (no full AST), same as before.
- `.github/workflows/*.yml` — new in this build: `run:` heuristic via `on:` + `run:` regex (no YAML AST), documented as heuristic.

**Why heuristic for surfaces:** Node has no stdlib YAML/TOML reader and a full ASTM would be unbounded; heuristic catches blunt `curl|eval` via whole-file sweep but can miss multiline split.

**New — Policy parsers (subset, stdlib only):** `policy.yaml/yml` → 140-line `parseYamlPolicy()` (mappings, block lists `- CRITICAL`, inline arrays `["CRITICAL","HIGH"]`, `#` comments, 64 KiB/8-depth caps) and `policy.toml` → 120-line `parseTomlPolicy()` (tables, string arrays `blockOn = ["CRITICAL"]`, scalars). Unsupported features (tags `!include`, anchors `&*`, `[[array.tables]]`, `"""` multiline) → `UNSUPPORTED_FORMAT` diagnostic, not crash. See `STDLIB.md:12-13`.

## 3. Heuristic, Not Exhaustive — Designed to Under-Flag

Every rule requires a **specific, named signal** to fire:

- `network-fetch` — `curl|wget|Invoke-WebRequest|fetch("https:`
- `runtime-bootstrap` — `bun|node|python` + `install|download|--install`
- `obfuscation` — 200-char base64 blob or `eval`/`new Function`/`atob`
- `shell-out` — `rm -rf|chmod +x|nohup|&$`
- `cross-reference` — path under a *different* surface’s directory (`.claude/` vs `.vscode/` vs `.cursor/` …)
- auto-trigger weight — `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `folderOpen`, `preinstall|postinstall|prepare|install|prepublish`

An attacker who **avoids every one** of those five signals (no network call, no runtime download, no cross-reference, no obfuscation, and accepts the `WARN`-level “it auto-fires” flag alone) would **not** be scored `CRITICAL`. That’s intentional — we chose to under-flag rather than train users to ignore a noisy tool.

**The real safety net is `baseline/diff`:** *Any* change to a tracked hook file is reported as `CHANGED`/`NEW`/`REMOVED` regardless of its heuristic score. Even a “clean-looking” one-liner edit creates drift.

## 4. No Full Shell / Language Parsing — Bounded Static Analysis

HookAudit does **not** contain a full shell AST, JS/Python interpreter, or PowerShell parser. It normalizes commands to `CommandSpec{raw, executable, args, shell, references}` via light tokenization and regex, and resolves `config → script → script` statically up to `MAX_GRAPH_DEPTH=32` with cycle (`CYCLE_DETECTED`) and depth guards — never executing target code.

Correctly handled (now implemented):
- `path = process.env.X + "/setup.sh"` → `DYNAMIC_EXECUTION` / `UNRESOLVED_REFERENCE` with `LOW` confidence + `BOUNDARY_VIOLATION` if outside root (resolver via `resolveInsideRepository`).
- `command = variableA + variableB` → `DYNAMIC_EXECUTION` + `PARTIALLY_RESOLVED` where appropriate.
- `config → script A → script B → capability` is followed as a multi-hop execution graph (`SCRIPT` nodes, `REFERENCES` edges, `ExecutionPath[]` with `capabilities` + `risk` + `confidence`). Verified via `multi-hop` fixture (`NETWORK_ACCESS` reachable).

We will never build a general-purpose interpreter — only a bounded resolver. Anything requiring runtime evaluation remains `DYNAMIC_EXECUTION`/`UNRESOLVED_REFERENCE` with evidence.

## 5. Dynamic Code & Dynamic Paths (now explicit)

When static analysis encounters:

```
eval(...)
command = variableA + variableB
path = process.env.X + "/setup.sh"
```

it **must not guess** — implemented:

```
DYNAMIC_EXECUTION + UNRESOLVED_REFERENCE/PARTIALLY_RESOLVED + evidence + LOW confidence
```

Obfuscation (`eval(`, `new Function(`, `atob`, 200-char base64) → `OBFUSCATION`/`DYNAMIC_EXECUTION` with evidence. Variable-constructed paths → `DYNAMIC_EXECUTION` + `BOUNDARY_VIOLATION`/`UNRESOLVED_REFERENCE` via `resolveInsideRepository`, confidence `LOW`.

Example output (implemented):

```
Severity: HIGH
Confidence: LOW
Trigger: SessionStart
Path: .claude/settings.json → ${process.env.HOOK}/setup.sh (DYNAMIC)
Capabilities: DYNAMIC_EXECUTION
Evidence: dynamic reference ${process.env.HOOK}/setup.sh
Why: potential impact high but static interpretation incomplete (dynamic construction)
```

## 6. Supported / Unsupported Ecosystems

**Supported today (12):** Claude Code, MCP, VS Code (tasks + settings), Cursor, Gemini, Codex (heuristic), npm lifecycle, Husky, git hooks, pre-commit, **GitHub Actions (`.github/workflows` heuristic)**.

**Not supported (future adapters, not MVP blockers):** GitHub Copilot, Windsurf, other AI agents, additional IDEs, other CI beyond GitHub, additional MCP project configs, other task runners (see `docs/spec` §5). If a repository uses an unsupported surface, HookAudit will emit **no finding** for it and will not warn — which is why the human report will add (Day-1 stretch):

```
Unsupported execution surfaces were not analyzed.
```

## 7. False Positives & False Negatives

- **False negatives** (missed malicious behavior) are **more likely** than false positives, because every rule requires a specific signal. A patient attacker can stay below `CRITICAL` threshold. Use `baseline` as the compensating control.
- **False positives** do occur: a legitimate `postinstall: echo done` is correctly scored `WARN` (it *does* fire automatically with no separate approval), even though `echo` is harmless. Similarly, a `SessionStart` hook that cross-references `.vscode/` for a legitimate reason (e.g., shared setup script) will be scored `CRITICAL`. These are **review signals, not verdicts**. HookAudit never outputs `MALWARE DETECTED`; it outputs `HIGH-RISK EXECUTION PATH` plus `why` + `evidence`.

## 8. Remote Second-Stage Behavior

HookAudit never fetches remote URLs, never executes extracted commands, never loads target modules. It **cannot** tell you what a remote endpoint *would* have returned at hook time. A `curl https://example.com/bootstrap | bash` is flagged as `NETWORK_ACCESS` + `REMOTE_DOWNLOAD` + `CRITICAL`, but the *content* of `https://example.com/bootstrap` is not inspected.

## 9. Determinism & Platform

- Results are **deterministic for identical repository state** after Day-1 hardening (POSIX-normalized paths, lexicographically sorted files/findings/changes). Before the fix, Windows emitted `\` separators and unsorted `readdir` order.
- File hashes are `SHA-256` via `node:crypto` — stable across platforms.
- Baseline files are **platform-portable** after the fix (POSIX keys). Old baselines created on Windows before the fix contain `\` keys and should be regenerated (`rm -rf .hookaudit && hookaudit baseline .`).

## 10. What to Do Instead

| Concern | Mitigation |
|---|---|
| “Is this repo safe?” | **Never say so from one tool.** HookAudit answers one slice (config-file execution topology). Combine with dependency/CVE scanning, code review, and branch-aware checks. |
| Multi-branch worm | `hookaudit branches .` for local committed drift, or `git worktree` per branch. |
| New commit after trust | `hookaudit diff .` on every pull/checkout — any `NEW`/`CHANGED`/`REMOVED` is worth review even if heuristics score it low. |
| Need stricter CI gate | Use `hookaudit . --strict` (Day-1) — exits 1 on `WARN` as well as `CRITICAL`. |
| Need to prove “never executes” | See `test/hookaudit.test.js` `never-execute` — `echo pwned > marker` after `scan` asserts `marker` does NOT exist (permanent regression). |

---

*If a finding matters, verify it by opening the cited file at the cited trigger and reading the command yourself. HookAudit is a reviewer’s aid, not a verdict.*
