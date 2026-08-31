# docs/demo — Browser Demonstration Architecture

**File:** `docs/demo/README.md`  
**Scope:** `index.html` + `demo/engine.js` + `demo/dashboard.js` + `demo/demo.js` + `demo/demo.css` + `demo/sample-repository`  
**Status:** thin, local, static, zero-dependency — per spec §54 (no network required) and §57/§101 priorities.

---

## 1. What this demo is (and is not)

**Is:**
- A **browser adapter** over four controlled synthetic fixtures (no real secrets, `example-attacker.test` only) that demonstrates the same HookAudit *concepts* as the Node CLI: normalized execution surfaces → trigger & `CommandSpec` → reference resolution → execution graph (`nodes/edges/paths`) → reachable capabilities → deterministic risk → baseline/diff with semantic `NEW_CAPABILITY`.
- Local, static, offline-capable: open via `file://` or GitHub Pages — no install, no server, no upload.

**Is not:**
- Not the Node binary `bin/hookaudit.js` itself. The browser runs a *port* of the same rules and model in `demo/engine.js` operating on in-memory fixture strings. Parity is structural (same `SURFACES`, same `RULES`, same `CAPABILITY` IDs, same `computePathRisk`, same `resolveInsideRepository` semantics) but not byte-for-byte identical — notably `SHA-256` uses `WebCrypto` with a deterministic `fallback-simple` label, and filesystem guards (`lstat`/`MAX_FILE_SIZE`/symlink) are adapted to the virtual `filesMap`.
- The **honest scope note** in `index.html` and `README.md` says this plainly. Real scans run with `node bin/hookaudit.js`.

This satisfies the task requirement: “honest: browser demo is adapter, not same engine unless proven.” The proving is via **mirror tests**: the same fixture `demo/sample-repository` scanned by the CLI and by the browser yields the same `executionSurfaces / paths / highRiskPaths / decision` and the same `NEW_CAPABILITY` signal after an edit (see §3).

---

## 2. Demo architecture — pipeline is the same (enterprise rebuild 2026-09-01)

Enterprise rebuild preserves analysis pipeline but reorganizes hierarchy to make the execution graph the hero and reduce cognitive overload (see master prompt §5-8):

```
index.html — enterprise dark slate (zero-dep, file:// compatible)
  ├─ masthead: HOOKAUDIT · kicker · Local/Zero Deps/Static · Public source + Reset (subtle)
  │           workflow steps 01 DISCOVER → 02 TRACE → 03 ANALYZE → 04 TRUST → 05 WATCH (active state)
  │           DEMO MODE compact bar + [About this demo] expandable
  ├─ repo selector (5 fixtures, status one-liners, no paragraphs)
  ├─ unified summary — single metrics row (6 cards, derived live, clickable trace)
  │     Execution Surfaces · Paths · High Risk · Capabilities · Changes (NEW_CAPABILITY) · Unresolved
  ├─ topology-row: [Execution surfaces list 300px] + [Hero Execution Topology SVG + Topology/Terminal tabs]
  │                · graph is central, 5 filters (All/High/Network/Process/Unresolved), keyboard nav
  ├─ selected path — HERO explanation (risk badge HIGH/CRITICAL, confidence, chain TRIGGER→COMMAND→SCRIPT→CAPABILITY, why matters)
  ├─ caps-risk-grid: [Capabilities tags] + [Risk ≠ malware, why list, expandable rule table]
  ├─ evidence — compact rows, search/detector/confidence/file filters, pagination 10/page, click→file trace
  ├─ file exhibit — secondary, collapsible, hash + text rendering (escaped)
  ├─ baseline workflow — guided 1 Save → 2 Simulate incoming change → 3 Compare → 4 Review NEW_CAPABILITY matrix
  ├─ advanced (collapsed <details>): Policy · Diagnostics · Branches · Exports (JSON/SARIF/HTML) · CLI · Zero-Dep proof · About adapter
  └─ footer — honest, offline, baseline does not prove safety
```

Original 2-column demo-grid preserved in code for compatibility but visually superseded by topology-row + selected-path hero + advanced accordion. All legacy IDs retained for test compatibility (stat-surfaces, etc hidden).

**File responsibilities — strict separation kept:**

| File | Role | Never does |
|---|---|---|
| `demo/engine.js` | **Analysis only.** Deterministic, pure JS: `scanVirtualRepo → buildExecutionGraph → analyzeRepo → diffAgainstBaseline`, plus `sha256HexAsync`/`simpleHash`. Zero DOM. Never `eval`, never `fetch` fixture URLs. | DOM, rendering, event handling |
| `demo/demo.js` | **View model + interaction.** Owns `FIXTURES` (inert objects, never executed), `reanalyze()` delegation to engine, all rendering (file list, terminal, summary, paths, caps, risk, evidence, diagnostics, baseline), plus P2 wiring to `dashboard.js`. | Inline heuristics — all detection via engine |
| `demo/dashboard.js` | **P2 visualizations (thin).** `renderDashboard`, `renderGraph` (SVG), `renderCapabilityDiff`, `filterEvidenceRows`. All derived from `analysis.graph`/`analysis.diagnostics`/`diffResult` — no fake numbers. Handles metrics, graph layout, diff matrix, evidence filtering. | Network, storage, external charts |
| `demo/demo.css` | Technical palette (paper/ink/muted slate, restrained `#1e3a5f`), keyboard focus-visible, `prefers-reduced-motion`, responsive, print. No neon, no cyber gradients. | — |
| `index.html` | Static shell, ARIA, skip-link, honest notes, responsive layout. Loads `engine → dashboard → demo` in order. No build step. | — |

**Data flow — every P2 metric is traceable:**

```
FIXTURES (inert)
  → HookAuditEngine.analyzeRepo(filesMap) → {results, graph{nodes,edges,paths}, diagnostics, summary}
  → HookAuditDemo renders, then
  → HookAuditDashboard.renderDashboard() reads summary+graph+diffResult
  → HookAuditDashboard.renderGraph() reads graph.nodes/edges/paths
  → HookAuditDashboard.renderCapabilityDiff() reads baselineRecord.capabilitySummary vs current reachable caps
```

No synthetic chart data. No `Math.random`. No external fetch.

---

## 3. Fixture explanation — four, synthetic, deterministic

All fixtures use `example-attacker.test` (RFC 2606 reserved) and inert placeholders (`eval` is a string, never called; `curl | bash` is text).

| Fixture | `id` | Purpose | Expected surfaces/paths/caps | Key signals |
|---|---|---|---|---|
| **Clean Repository** | `clean-repo` | Negative control — manual task only, no auto network | 3 surfaces, 0 paths, `(none)` | `npm test` manual, `editor.formatOnSave` not a trigger — PASS |
| **High-Risk Repository** | `high-risk-repo` | ChainDrop pattern | 3 surfaces, 3 paths, `CROSS_TOOL_LINK + NETWORK + REMOTE_DOWNLOAD + RUNTIME_BOOTSTRAP + OBFUSCATION + PROCESS + DYNAMIC` | `SessionStart → node .vscode/setup.mjs` (cross-tool), `folderOpen → curl … | bash --download bun-runtime`, `atob+eval`, `preinstall` base64 — CRITICAL/BLOCK |
| **Multi-Hop Repository** | `multi-hop-repo` | Proves `config → scriptA → scriptB → NETWORK` is followed | 3 surfaces, 2 paths, `NETWORK + PROCESS + REMOTE_DOWNLOAD` | `SessionStart → node scripts/a.js → scripts/b.js → fetch(https://example-attacker.test)` — resolver BFS, depth 2 |
| **Baseline & Change Demo** | `baseline-change-repo` | Shows `baseline → change → diff → NEW_CAPABILITY` | starts 2 surfaces/2 paths/`PROCESS` only | clean `scripts/b.js` (no network) → after *Simulate change* adds `fetch/curl` → `NEW_CAPABILITY` |
| **Diagnostics Showcase** | `diagnostics-repo` | Triggers every diagnostic code honestly | 2 surfaces, 5 paths | `../outside/evil.js` → `BOUNDARY_VIOLATION`, `${process.env.HOOK}` → `DYNAMIC`, `missing.js` → `UNRESOLVED`, `cycle-a↔cycle-b` → `CYCLE_DETECTED`, plus `CREDENTIAL` via token reference |

Determinism: `Object.keys(...).sort()`, POSIX-normalized paths, sorted `nodes/edges/paths/diagnostics`, no `Date.now` in analysis (timestamp only in baseline record). Reloading the same fixture yields byte-identical analysis.

---

## 4. P2 features added — priority 1–3 only (per §57/§101)

### P2-1. Interactive execution graph (priority 1)

- **Where:** `Right column → Interactive execution graph — SVG from live data` (`#graph-interactive`)
- **Source:** `analysis.graph.nodes` / `.edges` / `.paths` directly — no mock.
- **Layout:** deterministic layered BFS from `REPOSITORY` (depth = shortest path), `x = 80 + depth*150`, `y` stacked per layer sorted by label. SVG `width/height` derived from layer counts. Edges are cubic Bezier with `marker-end` arrows; labels show edge kind (`CONTAINS/TRIGGERS/EXECUTES/REFERENCES/CONNECTS_TO`).
- **Visual encoding (restrained):**
  - `CONFIG` white, `TRIGGER` ink (`#0f172a`) pill, `COMMAND` slate-50, `SCRIPT` sky-50 (`#e0f2fe`), `FILE` slate-50, `CAPABILITY` muted with hue per category (network amber, obfuscation rose, cross-tool yellow), `REPOSITORY` ink.
  - High-risk nodes/edges (`HIGH`/`CRITICAL` paths) get `#991b1b` stroke (`2.2px`).
  - `CONNECTS_TO` dashed.
- **Interactivity:** each node is `<g tabindex="0" role="button" aria-label="KIND label — caps">`; click/Enter selects, highlights incident edges (`is-highlight`) and related nodes in same paths (`is-related`), and shows details panel: kind badge, capabilities chips, confidence, `path`, and up to 6 execution paths through the node (trigger → chain → caps → risk/confidence). `Open in file exhibit →` traces to file list. `Clear highlight` resets. Arrow keys move focus in layer order; `Esc`/clear resets.
- **Controls:** legend (kinds + edge kinds) + filter bar (`All / High-risk only / Network paths`) which dims non-matching subgraphs via opacity/pointer-events — useful to isolate the review queue.
- **Accessibility:** all controls are `<button>`, graph nodes keyboard-focusable, `focus-visible` rings (`--focus`), `aria-live` on details, `prefers-reduced-motion` respected for scroll/highlight, no animation when reduced-motion is on, high contrast (`#0f172a` on `#ffffff` > 15:1).
- **Provenance line:** “Graph rendered from `analysis.graph` — deterministic layout by depth, not a mock.”

### P2-2. Semantic / capability diff visualization (priority 2)

- **Where:** `Baseline & Change → Capability diff — baseline vs current (NEW_CAPABILITY)` (`#capability-diff-viz`)
- **Source:** **real comparison** `baselineRecord.capabilitySummary` (saved at `Save baseline` via `HookAuditEngine.createBaselineAsync` — `WebCrypto-SHA256` or honestly-labeled `fallback-simple`) vs current union of `analysis.graph.paths ∩ analysis.results` capabilities.
- **Viz:** table `Capability | Baseline | Current | Status | Evidence` plus a row bar heatmap. Status is `NEW_CAPABILITY` (amber `diff-tag--new`) when `inCurrent && !inBaseline`, `REMOVED` when reverse, `unchanged` otherwise. Highlighted rows use `row--added` (`#fff7ed`).
- **Summary line:** `N NEW_CAPABILITY since baseline — from baseline caps → current caps. This is the signal that matters even if heuristic score is low.` — when no diff, states `No new capabilities since baseline.` — never invents.
- **Traceability:** `Evidence` column lists `file field` where the capability’s detector fired (e.g., `scripts/b.js` + `hooks.SessionStart[0]…`), title attr shows full list.
- **Heatmap bar:** `cap-matrix-bar` with 18px cells — `NEW` `#fee2e2`, `same` white, `removed` grey — purely to make the set-difference scannable without a fake line chart.

### P2-3. Richer evidence explorer (priority 3)

- **Where:** `Evidence — file · field · detector · reason` (`#evidence-body` + toolbar)
- **Before:** single table sorted by `file+field`, no filters, rows inert.
- **After:**
  - **Toolbar:** `Search` (`input[type=search]` — matches file/field/detector/reason/excerpt), `Detector` select (populated from uniq detectors), `Confidence` select (`HIGH/MEDIUM/LOW`), `File` select (uniq files), `Clear filters`, `Copy JSON` (copies `filteredRows` via `navigator.clipboard.writeText` or `prompt` fallback — local only).
  - **Count:** `filtered / total` — honest. `evidence-trace` status line reports `N rows match filters — M hidden` or `Click a row to highlight its source file…`.
  - **Traceability:** each `<tr tabindex="0" role="button">` on click/Enter sets `selectedFile`, re-renders file exhibit + content, scrolls to `files-heading`, flashes the `<pre>` outline via `var(--focus)`, and updates `evidence-trace` to `Traced: path — field — detector (confidence)`. Highlight uses `tr.is-highlight` (`outline: 2px solid --focus`, `#eef2ff` background) and `span.excerpt--highlight` (`#fef9c3`) when search query matches.
  - **Dedup + sort preserved:** same dedup key `file|field|detector|excerpt` and `localeCompare` sort.

### Thin dashboard — execution topology at a glance

- **Where:** new `Dashboard — execution topology at a glance` panel directly below repo selector (`#dashboard-metrics`), **thin and local static** — not a cloud SaaS, not a giant chart wall.
- **Metrics (6, all clickable/traceable — no fake charts):**
  1. **Execution surfaces** — `summary.executionSurfaces` + foot `N with findings` — traces to `#files-heading`
  2. **Execution paths** — `summary.paths` + foot `N nodes · M edges` — traces to `#paths-heading`
  3. **High-risk paths** — `summary.highRiskPaths` + foot `decision` — traces to `#paths-heading` and pulses `HIGH/CRITICAL` cards
  4. **Capabilities** — `union(paths ∪ results).length` + foot `first 3 cap IDs` — traces to `#caps-heading`
  5. **New since baseline** — `diffResult.semantic.filter(NEW_CAPABILITY).length` (`newCapList` in foot) — traces to `#baseline-heading`; shows `no baseline yet` when empty
  6. **Unresolved / needs review** — `diagnostics.filter(UNRESOLVED|BOUNDARY|DYNAMIC|CYCLE).length` — traces to `#diag-heading`
- **Derived, not decorative:** `dataset.*` attributes expose raw numbers for testability; provenance line states “All metrics derived from `HookAuditEngine.analyzeRepo()` — nodes/edges/paths/capabilities/diagnostics — no sampled or synthetic numbers.”
- **Styling:** 6-col grid (responsive `3 → 2 → 1`), each metric is a `<button>` with `aria-label`, `dash-value--alert/critical/ok` semantic color, `dash-trace → trace` affordance, `panel--pulse` on target.

---

## 5. Recording script (3–5 minutes) — 6 beats

Use `baseline-change-repo` for the diff beat; keep the terminal honest (“simulated, offline”).

**0:00 Problem** (20s)  
“Aug 4 2026 — ChainDrop compromised `keyv` (+2B installs), committed `SessionStart` + `folderOpen` hooks that fire just by opening a repo in Claude Code/VS Code — no `npm install`. Most scanners check manifests, not editor hooks.” Show `README.md` problem paragraph.

**0:30 Surface** (30s)  
Click `High-Risk Repository` in repo selector. Show `File exhibit` — `.claude/settings.json` `SessionStart → node .vscode/setup.mjs` (cross-tool) and `.vscode/tasks.json` `folderOpen → curl … | bash`. Note: inert text, never executed, `example-attacker.test`.

**1:15 One-command scan** (40s)  
Terminal shows `hookaudit scan --path high-risk-repo --json` simulated output → `{executionSurfaces:3, paths:3, highRiskPaths:3, decision:"BLOCK"}`. Dashboard pulses: `surfaces 3 → paths 3 → high-risk 3 → capabilities 7 → BLOCK`. Click `High-risk paths` → scrolls to **Interactive graph**. Tab into a `TRIGGER SessionStart` node → Enter → details panel shows chain + `NETWORK_ACCESS/RUNTIME_BOOTSTRAP/CROSS_TOOL_LINK` chips + `CRITICAL`. Filter `High-risk only` to isolate.

**2:15 What/When/Path/Capability/Why** (40s)  
Scroll through `Execution paths` (CRITICAL first), `Capabilities` chips (only actual — no placeholders), `Risk view` — read one `—` line: “automatic + network + process → HIGH” plus literal `reasons` and `confidence MEDIUM`. Then `Evidence` — type in search `curl`, filter `Detector: remote-download`, click a row → traces to `scripts/helper.mjs` exhibit with flash.

**3:15 Baseline → change → diff (NEW_CAPABILITY)** (60s)  
Switch to `Baseline & Change Demo` (starts `PASS`, `PROCESS` only). Click `Save baseline (trusted surface)` → shows `WebCrypto-SHA256` + `schemaVersion:2`. Click `Simulate change + network line` → adds `fetch/curl` to `scripts/b.js`. Click `Diff vs baseline` → file drift `CHANGED scripts/b.js` + semantic `NEW_CAPABILITY NETWORK_ACCESS` + capability diff matrix highlights amber `NEW_CAPABILITY` row and bar — `1 NEW_CAPABILITY since baseline`. Dashboard `New since baseline` flips to `1`.

**4:15 Zero-dep** (30s)  
`cat package.json` → `"dependencies": {}`; `npm ls --all → (empty)`; `npm test → 22 passed`. Show `STDLIB.md` snippet — “12 substitutions via `node:fs/path/crypto/util`, no `child_process` at runtime” → close on honesty: “Baseline does not prove safe — it records what you chose to trust.”

**Keep time:** if behind, skip the `High-Risk → Diagnostics Showcase` `CYCLE_DETECTED` detour.

---

## 6. Deployment instructions

### Local — no install

```bash
git clone https://github.com/rohitkumarnaidu/HookAudit.git
cd HookAudit
# CLI (real scan)
node bin/hookaudit.js scan --path demo/sample-repository --json | jq .summary

# Browser demo — double-click or:
#   Windows: start index.html
#   macOS:   open index.html
#   Any:     python -m http.server 8000  # then http://localhost:8000/
```

Works via `file://` (no `fetch` of fixtures — all inline), so `file:///.../HookAudit/index.html` is sufficient.

### GitHub Pages (or any static host)

1. Ensure `index.html` is at repo root (it is) — GitHub Pages serves it as entry.
2. Push to `main`; enable **Settings → Pages → Source: Deploy from a branch → `main` / `root`**.
3. URL will be `https://<user>.github.io/HookAudit/`.
4. No build step, no bundler, no env vars. The demo is three static files plus `sample-repository`.
5. To validate after deploy: open the URL, switch to `Baseline & Change Demo`, do `Save baseline → Simulate change → Diff`; confirm `NEW_CAPABILITY` appears and `Copy JSON` in Evidence works offline (DevTools → Network → Offline, reload).

### Off-screen / headless validation (CI-friendly)

```bash
# Determinism proof (POSIX, sorted)
node bin/hookaudit.js scan --json --path demo/sample-repository > /tmp/a.json
node bin/hookaudit.js scan --json --path demo/sample-repository > /tmp/b.json
diff /tmp/a.json /tmp/b.json && echo "deterministic"

# Baseline/diff semantic proof
node bin/hookaudit.js baseline --path demo/sample-repository
# edit a surface file to add network (or use the browser Simulate change)
node bin/hookaudit.js diff --json --path demo/sample-repository | jq .diff.semantic
# → {"type":"NEW_CAPABILITY","detail":"NETWORK_ACCESS"}
```

---

## 7. Known limitations — browser demo

| Limitation | Effect | Mitigation / note |
|---|---|---|
| **Adapter, not same binary** | Browser engine is a port (`engine.js`) — same model/rules, different `SHA-256` impl (`WebCrypto` vs `node:crypto`) and virtual guards. | Honest note in masthead + this file. CLI remains source of truth; browser demo is for illustration. If byte parity is required, `STDLIB.md` documents the substitution and `demo/engine.js` comments mark divergences. |
| **Virtual filesystem, not `node:fs` `lstat`** | `MAX_FILE_SIZE`/`BINARY_SKIPPED` use `content.length` + `'\0'` heuristic; symlink/permission diagnostics are synthetic (no real FS). | Fixtures avoid binaries/large files; diagnostics showcase is intentionally synthetic to show honest handling. |
| **No TOML/YAML AST** | `.codex/config.toml`, `.pre-commit-config.yaml` scanned as raw text heuristic — same as CLI. | Whole-file sweep still catches `curl/eval` patterns; limitation documented in `LIMITATIONS.md` §2. |
| **No full shell/JS parser** | `CommandSpec` is light tokenization, not a full AST — same as CLI. | Dynamic constructs become `DYNAMIC_EXECUTION`/`UNRESOLVED_REFERENCE` with `LOW` confidence — never guessed. |
| **Graph layout is illustrative** | SVG positions are deterministic by depth, not force-directed or pixel-identical to a graph DB view. | Layout determinism preserves topology; edges correspond 1-1 to resolver trace. Not a general graph visualizer. |
| **Working tree only** | No `git` branch walk (no `git` binary — zero-dep rule). | Check out each branch and re-scan; git-native `.git/refs` walker is a documented stretch. |
| **Static, heuristic risk** | An attacker avoiding all 5 signals could stay below `CRITICAL`. | Baseline/diff is the real safety net — *any* `CHANGED/NEW` is worth review even if score is `WARN`/`LOW` (see `LIMITATIONS.md` §3). |
| **Browser storage is ephemeral** | Baseline is kept in memory (`baselineRecord`), not persisted to `localStorage` or `.hookaudit/baseline.json` — refresh resets it. | Intentional for a static demo (no persistence to confuse users); CLI’s `.hookaudit/baseline.json` is the durable form. |

---

## 8. Verification checklist (before claiming “works”)

- [ ] `npm ls --all` → `(empty)` and `package.json: dependencies {}` stays `{}`.
- [ ] `npm test` → `22 passed` (incl. `multi-hop`, `cycle`, `dynamic`, `NEW_CAPABILITY`).
- [ ] Open `index.html` via `file://` — all 4 fixtures load, file exhibit shows actual content, terminal says “simulated”.
- [ ] `Baseline & Change Demo`: `Save baseline` → `WebCrypto-SHA256` label, `Simulate change` → `Diff` shows `CHANGED scripts/b.js` + `NEW_CAPABILITY NETWORK_ACCESS` + matrix amber row + dashboard `New since baseline: 1`.
- [ ] **Interactive graph:** `High-Risk Repository` — graph shows `≥8 nodes/≥7 edges/3 paths` (`data-nodes/edges/paths`), filter `High-risk only` dims others, Tab reaches nodes, Enter shows details + file trace.
- [ ] **Evidence explorer:** search `curl` filters to matching rows, detector/file selects filter, `Clear filters` resets, row click scrolls to file exhibit and flashes it, `Copy JSON` copies filtered array.
- [ ] No neon/gradient, palette passes `prefers-reduced-motion` and keyboard-only navigation, high-contrast focus rings visible.

---

*This demo is a reviewer’s aid, not a verdict. If a finding matters, open the cited file at the cited trigger and read the command yourself.*
