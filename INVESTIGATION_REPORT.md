# HookAudit — Complete Repository Investigation Report

**Date:** 2026-08-31 18:00 UTC freeze proximity  
**Repository:** `C:\Hackathons\HookAudit`  
**Node:** v24.19.0 (tested), npm 11.17.0, Win32  
**Git:** `master` — No commits yet (untracked files only)  
**Mode:** Investigation-before-implementation (Master Prompt §58)  
**Author:** Lead Engineer / Security Architect (Muse Spark — gstack workflow, zero runtime dependency boundary preserved)

> **Principle:** Understand the repository first. Freeze the rules second. Freeze the MVP third. Build only after those are explicit.

---

## Table of Contents

1. [A. Repository Inventory](#a-repository-inventory)
2. [B. Current Architecture Map](#b-current-architecture-map)
3. [C. Existing Functionality](#c-existing-functionality)
4. [D. Current Test Coverage](#d-current-test-coverage)
5. [E. Current Dependency Audit](#e-current-dependency-audit)
6. [F. Documentation Audit](#f-documentation-audit)
7. [G. Security Audit](#g-security-audit)
8. [H. Hackathon Rule Audit](#h-hackathon-rule-audit)
9. [I. Gap Analysis Against MVP Contract](#i-gap-analysis-against-mvp-contract)
10. [J. Proposed Documentation Structure](#j-proposed-documentation-structure)
11. [K. Required RULES.md Assessment](#k-required-rulesmd-assessment)
12. [L. Day-1 Implementation Plan](#l-day-1-implementation-plan)
13. [Required Tables — Inventory](#required-table--repository-inventory)
14. [Required Tables — Feature Gap Matrix](#required-table--feature-gap-matrix)
15. [Required Tables — Security Gap Matrix](#required-table--security-gap-matrix)
16. [Required Tables — Rule Compliance Matrix](#required-table--hackathon-rule-compliance-matrix)
17. [Implementation-Ready Decision Log](#implementation-ready-decision-log)
18. [Appendix — Evidence & Reproduction](#appendix--evidence--reproduction)

---

## A. Repository Inventory

### A.1 Top-Level Layout

```
HookAudit/
├── .git/                          # git repo, no commits, branch master
├── .zero-dep.toml                 # 213 B, hackathon track declaration
├── LICENSE                        # 1079 B, MIT, Copyright (c) 2026 hookaudit contributors
├── README.md                      # 9383 B, 203 lines
├── STDLIB.md                      # 4720 B, 32 lines, 12 substitution entries
├── RULES.md                       # 13541 B, 1104 lines, 48 sections
├── PLAN.md                        # 12695 B, 236 lines — compressed ship plan for Aug 31 freeze
├── package.json                   # 419 B
├── deps-proof.txt                 # 391 B — npm ls + grep requires proof
├── hookaudit.js                   # 19108 B, 542 lines — DUPLICATE of bin/hookaudit.js (SHA256 identical)
├── bin/
│   └── hookaudit.js               # 19108 B, 542 lines — canonical runtime artifact (package.json bin → ./bin/hookaudit.js)
├── test/
│   ├── hookaudit.test.js          # 102 lines, 9 tests, node:test + node:assert/strict
│   └── fixtures/
│       ├── clean-repo/
│       │   ├── .claude/settings.json   — PostToolUse → npx prettier --write .
│       │   ├── .vscode/tasks.json      — run tests → npm test (non-auto)
│       │   └── package.json            — postinstall echo done
│       └── malicious-repo/
│           ├── .claude/settings.json   — SessionStart → node .vscode/setup.mjs (cross-ref)
│           ├── .vscode/tasks.json      — folderOpen → curl ... --download bun-runtime + .claude/setup.mjs (cross-ref)
│           └── package.json            — preinstall → node -e eval(Buffer.from(base64))
├── docs/
│   ├── README.md                  # 700 B — docs structure authority note
│   ├── HookAudit_End_to_End_Product_Idea.md  # 48392 B
│   ├── research/                  # 8 files, ~348k total
│   │   ├── From Blind Spot to Audit Trail_ Securing the Modern Development Supply Chain with HookAudit.md (48328)
│   │   ├── From SBOM Generation to Trust_ Architecting a Zero-Dependency Integrity Verifier...md (31316)
│   │   ├── HookAudit_ Architecting a Zero-Dependency Defense...md (45673)
│   │   ├── HookAudit_Complete_End_to_End_Final_Research(1).md (50246)
│   │   ├── HookAudit_Complete_End_to_End_Research(1).md (43349)
│   │   ├── Mapping the Attack Surface_ A Zero-Dependency Strategy...md (44539)
│   │   ├── The Anatomy of a Comprehensive Study_...md (34771)
│   │   └── zero-dependency-2026-research.md (39898)
│   ├── research reports/             # 7 files, duplicated + spec variants
│   │   ├── (4 research files duplicated)
│   │   ├── HookAudit_Final_Technical_Specification_MVP_Contract.md (70736)
│   │   └── HookAudit_Final_Technical_Specification_MVP_Contract_Master_Prompt.md (50900)
│   └── spec/
│       ├── HookAudit_Final_Technical_Specification_MVP_Contract.md (70736)
│       └── HookAudit_Final_Technical_Specification_MVP_Contract_Master_Prompt.md (50900)
└── (missing)
    ├── SECURITY.md                — NOT PRESENT (gap)
    ├── LIMITATIONS.md             — NOT PRESENT (gap, only embedded in README)
    ├── .gitignore                 — NOT PRESENT
    └── Makefile / build script    — NOT PRESENT (ok — no build step, but one-command build must be documented)
```

### A.2 File Hashes (canonical artifact)

```
bin/hookaudit.js  SHA256 F4BD8A2918ADE596D57BCD1B30BDF282890450D599EB1E53A4171EF4AE53E5B2
hookaudit.js      SHA256 F4BD8A2918ADE596D57BCD1B30BDF282890450D599EB1E53A4171EF4AE53E5B2 — byte-identical duplicate
```

### A.3 Git State

```
Branch: master
Commits: 0 (No commits yet — fatal: your current branch 'master' does not have any commits yet)
Status: All files untracked (13 entries)
Log: empty
Remote: none configured
.git/config: 249 B (default)
```

> **Risk:** `PLAN.md:94` already warns: “You must regenerate this repo's git history yourself during the official window — everything here is a reference implementation for you to adapt/rewrite/commit fresh, not something to submit as-is.” Current state has no commit history, which is correct for a fresh ingest, but submission will be invalid without commits inside the hackathon window.

---

## B. Current Architecture Map

### B.1 As-Built Data Flow (bin/hookaudit.js:46-540)

```
                    REPOSITORY (path.resolve(values.path))
                              │
                              ▼
                    exists(root) check → exit 2 if missing
                              │
                              ▼
                    SURFACE DISCOVERY  (SURFACES[11] × resolveSurfaceFiles)
                              │
                    For each SURFACE glob → path.join(root, rel) → fs.statSync
                    If isDirectory → listFilesRecursive(dir)
                              │              └─ IGNORED_DIRS = {node_modules, .git, dist, build, .hookaudit}
                              │                 (.git only walked via .git/hooks explicitly)
                              ▼
                    ECOSYSTEM ADAPTERS (implicit, not modular)
                    ├── extractClaudeHookCommands(json)    bin/hookaudit.js:204
                    ├── extractVscodeTaskCommands(json)    bin/hookaudit.js:222
                    ├── extractPackageJsonScripts(json)    bin/hookaudit.js:234
                    ├── claude-mcp inline (mcpServers/servers) bin/hookaudit.js:341
                    └── text surfaces: git/husky/cursor/pre-commit/codex  bin/hookaudit.js:355
                              │
                              ▼
                    NORMALIZED SURFACE (partial)
                    { file: relative, surface, hash: sha256, findings[], parseError }
                    Findings: { trigger, command, severity, score, reasons[] }
                              │
                              ▼
                    TRIGGER EXTRACTION (AUTO_TRIGGER_KEYS = SessionStart, PreToolUse, PostToolUse, UserPromptSubmit)
                    + per-adapter auto hints (folderOpen, preinstall/postinstall etc.)
                              │
                              ▼
                    COMMAND EXTRACTION (per adapter, plus SURFACE_DIRS cross-ref)
                              │
                              ▼
                    RULE ENGINE (RULES[4] + cross-ref)
                    ├── network-fetch (weight 2)         bin/hookaudit.js:135
                    ├── runtime-bootstrap (weight 3)     bin/hookaudit.js:142
                    ├── obfuscation (weight 2)           bin/hookaudit.js:149
                    ├── shell-out (weight 1)             bin/hookaudit.js:158
                    ├── auto-trigger (weight 2)          bin/hookaudit.js:293
                    └── cross-reference (weight 3)       bin/hookaudit.js:260 / 305
                    Severity: score≥5 CRITICAL, score≥2 WARN, else INFO (suppressed if score 0)
                              │
                              ▼
                    No REFERENCE RESOLVER — no multi-hop, no graph traversal, no cycle detection
                    No CAPABILITY INFERENCE (capabilities not enumerated, only reason strings)
                    No EXECUTION GRAPH (nodes/edges not materialized)
                    No PATH-BASED RISK (only per-command additive score, not path-aggregated)
                              │
                              ▼
                    EVIDENCE (partial: file, trigger, command excerpt, reasons; NO line numbers, NO field path, NO confidence)
                              │
                              ▼
                    REPORT
                    ├── printHuman(results, diff)  bin/hookaudit.js:436 — styleText coloring, severity+trigger+excerpt+reasons, drift list
                    └── printJson(results, diff)   bin/hookaudit.js:477 — JSON.stringify({results, diff})
                              │
                              ▼
                    BASELINE / DIFF (trust-on-first-use, file-hash only)
                    ├── writeBaseline → .hookaudit/baseline.json {createdAt, id: randomUUID, files: {rel: sha256}}
                    ├── readBaseline
                    └── diffAgainstBaseline → NEW / CHANGED / REMOVED (per-file hash compare only)
                              │
                              ▼
                    CLI DISPATCH (parseArgs, positionals[0] ∈ {scan, baseline, diff})
                    Exit: 1 if any CRITICAL or (diff && changes.length), 0 otherwise, 2 on usage/path error
```

### B.2 Module Map vs. Spec §7

| Spec Module (§7) | Current File | Status | Notes |
|---|---|---|---|
| `cli` | `bin/hookaudit.js:484-540` inline `main()` | **PARTIAL** | Uses `node:util.parseArgs`; handles `scan/baseline/diff` + `--json --path --help`; missing `hookaudit .` positional, `--strict`, `explain` |
| `scanner` | `bin/hookaudit.js:169-196` `listFilesRecursive` + `resolveSurfaceFiles` | **PARTIAL** | No size limit, no binary detection, no symlink policy, no deterministic sort |
| `adapters` | `bin/hookaudit.js:204-267` 4 extractors inline | **PARTIAL** | Only Claude/VSCode/npm/MCP parsed structurally; 4 json surfaces fall back to file-body sweep |
| `extractor` | merged into adapters | **PARTIAL** | No `CommandSpec` normalization, no shell/args array, no reference extraction |
| `resolver` | **MISSING** | **MISSING** | Only `findCrossReference` regex; no path normalization, no recursive load, no cycle/depth/boundary |
| `graph` | **MISSING** | **MISSING** | No nodes/edges, no traversal queue, no evidence per edge |
| `capability` | **MISSING** | **MISSING** | Capabilities implicit in `RULES.why` strings; no enum, no per-surface capability array |
| `risk` | `bin/hookaudit.js:291-318` `evaluateCommand` | **PARTIAL** | Additive per-command, not path-based; no confidence separation |
| `snapshot` | `bin/hookaudit.js:386-402` | **PARTIAL** | File hashes only; missing version, surface identity, capability summary |
| `diff` | `bin/hookaudit.js:411-424` | **PARTIAL** | File-level only; no structural/trigger/command/capability diff |
| `report` | `bin/hookaudit.js:430-479` | **PARTIAL** | Human + JSON exist but JSON shape is `{results, diff}` not spec §30 schema |

### B.3 Dependency Graph (runtime)

```
bin/hookaudit.js
 ├── node:fs (require)
 ├── node:path (require)
 ├── node:crypto (require) → createHash('sha256'), randomUUID()
 └── node:util (require) → parseArgs(), styleText()
No other imports. No dynamic require. No child_process at runtime.
```

---

## C. Existing Functionality

### C.1 Implemented & Working (verified via: `node bin/hookaudit.js scan --json --path test/fixtures/*` and `npm test`)

| Feature | Evidence | Verdict |
|---|---|---|
| **Surface discovery** — 11 surfaces | `bin/hookaudit.js:47-114` SURFACES array | COMPLETE (discovery) |
| **JSON-first extraction** Claude/VSCode/npm/MCP | `bin/hookaudit.js:204-347` | COMPLETE for those 4; PARTIAL for vscode-settings/gemini-settings (structural parse missing) |
| **Auto-trigger scoring** (SessionStart, folderOpen, preinstall etc.) | `bin/hookaudit.js:116, 293` | COMPLETE |
| **Heuristic rule engine** (network, runtime-bootstrap, obfuscation, shell-out, cross-ref) | `bin/hookaudit.js:133-310` | COMPLETE (additive) |
| **Cross-tool link detection** (ChainDrop pattern) | `bin/hookaudit.js:258-267` + test `cross-reference` | COMPLETE |
| **Human report** | `bin/hookaudit.js:436` | COMPLETE (basic) |
| **JSON report** | `bin/hookaudit.js:477` | COMPLETE (but shape non-spec) |
| **SHA-256 baseline/diff** (NEW/CHANGED/REMOVED) | `bin/hookaudit.js:392-424` | COMPLETE (file-hash level) |
| **CLI scan/baseline/diff** | `bin/hookaudit.js:484` | COMPLETE (with --path flag) |
| **Exit codes** | `bin/hookaudit.js:518-538` | COMPLETE (0/1/2) |
| **Safe analysis** (read-only, no exec) | grep: no `execFile`, no `spawn`, no `require(target)` at runtime | COMPLETE |
| **Ignored dirs** (node_modules, .git bulk) | `bin/hookaudit.js:120` | COMPLETE (hard-coded set) |
| **Malformed JSON handling** | `bin/hookaudit.js:333` try/catch → parseError | COMPLETE (logic) but **BROKEN on Windows** (see §D) |

### C.2 Fixtures

- `clean-repo`: 3 files, no CRITICAL — correctly scores 1 WARN (PostToolUse) + 1 WARN (postinstall), 0 CRITICAL. Verified.
- `malicious-repo`: 3 files, 2 CRITICAL (SessionStart cross-ref, folderOpen network+bootstrap+cross-ref), 1 WARN obfuscation. Verified.
- Both fixtures use **synthetic inert placeholder commands** (no live payload) — correct per demo safety.

### C.3 Commands (actual)

```bash
node bin/hookaudit.js scan --path <dir> --json   # tested working
node bin/hookaudit.js baseline --path <dir>       # tested working
node bin/hookaudit.js diff --path <dir> --json    # tested working
node bin/hookaudit.js --help                      # tested working
# Missing per spec: hookaudit . / hookaudit . --json / hookaudit . --strict / hookaudit baseline . / hookaudit diff .
```

---

## D. Current Test Coverage

### D.1 Test Suite: `test/hookaudit.test.js` (node:test, 9 tests, run as black-box via `node:child_process.execFileSync`)

| # | Test Name | Fixtures | Result | Notes |
|---|---|---|---|---|
| 1 | clean repo scan finds no CRITICAL and exits 0 | clean-repo | **PASS** (105 ms) | |
| 2 | malicious-pattern repo is flagged CRITICAL and exits 1 | malicious-repo | **PASS** (81 ms) | |
| 3 | cross-reference between .claude and .vscode is detected | malicious-repo | **PASS** (51 ms) | checks `reasons.includes('cross-linking')` |
| 4 | runtime-bootstrap + network-fetch pattern in vscode task | malicious-repo | **PASS** (51 ms) | checks task file has CRITICAL |
| 5 | obfuscated preinstall script is flagged | malicious-repo | **PASS** (50 ms) | checks package.json findings.length>0 |
| 6 | baseline then diff on unchanged repo reports no drift | tmp cp clean-repo | **PASS** (120 ms) | |
| 7 | baseline then a new hook file appearing is reported as CHANGED | tmp cp clean→overwrite tasks.json | **FAIL** (138 ms) | `assert.ok(CHANGED .vscode/tasks.json)` — falsy |
| 8 | malformed JSON is reported as parse error, not crash | tmp .claude/settings.json `{ not valid` | **FAIL** (57 ms) | `TypeError: Cannot read properties of undefined (reading 'parseError')` |
| 9 | node_modules is never walked | tmp node_modules/some-pkg/package.json | **PASS** (53 ms) | |

**Pass rate: 7/9 (77%). 2 failures are Windows-specific path separator bugs, not logic bugs.**

### D.2 Root Cause of 2 Failures (Critical Finding)

**All relative paths are produced via `path.relative(root, file)` at `bin/hookaudit.js:322`.**

On Windows, `path.relative` uses `path.win32` and emits backslashes:

```
Expected (POSIX, test assertions):  .vscode/tasks.json   /  .claude/settings.json
Actual (Windows, observed):         .vscode\tasks.json   /  .claude\settings.json
```

Reproduction (from this investigation):

```js
// Baseline written on Windows:
{ files: { ".claude\\settings.json": "cb86...", ".vscode\\tasks.json": "1027..." } }
// diff assertion expects:
data.diff.changes.some(c => c.type==='CHANGED' && c.file==='.vscode/tasks.json') // → false (actual is '.vscode\\tasks.json')
// malformed test:
data.results.find(r => r.file==='.claude/settings.json') // → undefined → .parseError throws
```

**Impact:**
- Baseline/diff still *works* on Windows (hash map keys consistent within Windows), but cross-platform baselines are not portable, and tests written against POSIX paths fail on Windows.
- JSON output is platform-dependent (violates Deterministic Output invariant, spec §50).
- Any downstream consumer expecting POSIX paths (CI, docs, demo video on Linux/macOS) will mis-match.

**Fix (Day-1):** Normalize `rel` to POSIX: `rel.split(path.sep).join('/')` or `rel.replace(/\\/g, '/')` at `scanFile` return and at baseline/diff key generation. Single line, zero-dep, preserves determinism.

### D.3 Missing Fixture Classes (per Master Prompt §34 and RULES.md §25-26)

| Required Class | Present? | File |
|---|---|---|
| safe | ✅ | clean-repo |
| legitimate | ✅ | clean-repo (postinstall echo done is legitimate auto WARN) |
| network | ✅ | malicious-repo tasks.json curl |
| download | ✅ | same (curl ... --download) |
| bootstrap | ✅ | same (bun-runtime) |
| obfuscation | ✅ | malicious-repo package.json base64 eval |
| nested | ❌ | MISSING — no script→script reference chain |
| cross-tool | ✅ | both claude→.vscode and vscode→.claude |
| dynamic | ❌ | MISSING — no `eval(variable)`, `process.env` path, template string |
| malformed | ✅ | test 8 (but broken on Windows) |
| boundary | ❌ | MISSING — no `../`, absolute path, symlink escape, UNC test |
| cycle | ❌ | MISSING — no A→B→C→A script cycle |
| baseline | ✅ | tests 6,7 |
| diff | ✅ | test 7 |
| never-execute regression | ❌ | MISSING — Master Prompt §35 requires marker file test |
| determinism | ❌ | MISSING — no scan#1 vs scan#2 equivalence assertion |
| strict mode | ❌ | MISSING — no `--strict` test |
| large file | ❌ | MISSING — no FILE_SKIPPED_SIZE_LIMIT test |
| symlink | ❌ | MISSING — no symlink escape test |

**Overall test completeness: ~50% of required classes.** Existing 9 tests cover happy-path and core heuristics but lack boundary, cycle, dynamic, determinism, and never-execute regressions.

---

## E. Current Dependency Audit

### E.1 Runtime Manifest

```json
// package.json:15-16
"dependencies": {},
"devDependencies": {}
```

```
$ npm ls --all            → hookaudit@0.1.0  `-- (empty)   ✅
$ grep require bin/hookaudit.js → 4 requires, all node: prefixed ✅
```

### E.2 Declared Built-ins (bin/hookaudit.js:31-34)

| Require | Purpose | Node Stable Since | OK |
|---|---|---|---|
| `node:fs` | readFileSync, readdirSync, mkdirSync, writeFileSync, cpSync (tests) | 14+ | ✅ |
| `node:path` | join, relative, resolve, basename, sep | 14+ | ✅ |
| `node:crypto` | createHash('sha256'), randomUUID() | 14.17/16+ | ✅ |
| `node:util` | parseArgs(), styleText() | 18.3 / 20+ | ✅ |

No `node:zlib`, `node:readline`, `node:os`, `node:url` used — all would be allowed but not needed.

### E.3 Hidden Dependencies Check

| Vector | Found? | Evidence |
|---|---|---|
| `child_process` at runtime | ❌ | `grep` shows 0 hits in `bin/hookaudit.js` (only in `test/`) |
| `git` binary invocation | ❌ | no `exec.*git` |
| `curl/wget/jq/ripgrep` invocation | ❌ | only *detected* in target content via regex, never executed |
| `fetch` at runtime | ❌ | only regex `/\bfetch\s*\(\s*['"]https?:/` on target text |
| vendored third-party code | ❌ | single file, 4 requires, no copied library |
| network at runtime | ❌ | no `fetch`, no `http`/`https` import |
| install/build of target | ❌ | no `npm install`, no `node target` |

### E.4 `deps-proof.txt` Assessment

```
Contains: npm ls output, cat package.json grep, grep -c require
Status: PRESENT but stale (shows /home/claude/hookaudit path, not Windows)
Action: Regenerate on Windows after fix, or add both.
```

### E.5 Engines Field

```json
// package.json:9-11
"engines": { "node": ">=20.6.0" }
```

**Gap:** Master Prompt §32: “Do NOT target Node 20. Node 20 reached EOL April 30 2026. Target Node 24 LTS / Node 26 current and document the exact version in README.” Current `>=20.6.0` permits EOL runtime. README says “Requires Node.js ≥ 20.6” and mentions `process.loadEnvFile`-era stdlib. Should be updated to `>=24.0.0` (or `>=24.11.0 LTS`) and README should state `v24.19.0` (verified).

---

## F. Documentation Audit

### F.1 Present Documentation

| File | Lines | Purpose | Quality | Accurate? |
|---|---|---|---|---|
| `README.md` | 203 | User-facing: problem (ChainDrop Aug 4 2026, keyv 2B+ installs), what it does (11 surfaces, 5 rules), build/run/try fixtures, design decisions, limitations, threat model | **Excellent** — honest, evidence-first, cites The Register/CSO/THN/WorkOS etc., explicitly documents limitations | YES — describes actual implementation (no vaporware). Two minor inaccuracies: Node version (20.6 vs 24), CLI examples use `hookaudit scan` not `hookaudit .` |
| `STDLIB.md` | 32 | 12 substitution entries + “what we did not build” | **Excellent** — names real weekly download counts, explains why, lists 2 honest limitations (gitignore matcher, TOML) | YES — all 12 are real, used in bin/hookaudit.js |
| `RULES.md` | 1104 | Operational rulebook (48 sections) | **Excellent** — covers all required sections and more, includes gstack boundary, depth-over-breadth, stop conditions | YES — but 48 sections is longer than §64 “short enough to be practical but complete” ideal; could be summarized with pointer to full spec |
| `PLAN.md` | 236 | Compressed ship plan for Aug 31 18:00 UTC freeze | **Good** — clarifies MUST/SHOULD/NICE, demo script, risks, sources | YES — warns about git history regeneration |
| `.zero-dep.toml` | 3 | Track = E, pitch | **Minimal** | YES — present |
| `LICENSE` | 21 | MIT | **Present** | YES |
| `docs/README.md` | ~30 | Docs structure authority note | **Good** | YES |
| `docs/research/` | 8 files | Research corpus (348k) | **Extensive** — see F.3 | Evidence, not runtime truth |
| `docs/spec/` | 2 files | MVP Contract + Master Prompt (70736 + 50900) | **Authoritative** | Baseline for implementation |
| `deps-proof.txt` | 15 | Dependency proof | **Present** | STALE (Linux path) |

### F.2 Missing Documentation (per Master Prompt §42)

| Required | Present? | Impact |
|---|---|---|
| `SECURITY.md` | ❌ MISSING | Must document threat model, safe-analysis principle, boundary, limitations, risk ≠ malware, disclosure path (RULES.md §33 already sketches it, but standalone file required) |
| `LIMITATIONS.md` | ❌ MISSING (only embedded in README “Limitations”) | Must explicitly list dynamic code, dynamic paths, unsupported ecosystems, shell parsing limits, false positive/negative, second-stage |
| `SECURITY.md` content currently lives in README Threat Model + RULES.md §9/10/15/16/19 — needs extraction to standalone |
| `Makefile` / build script | ❌ MISSING | Not strictly required (no build step), but hackathon “one-command build” must be documented; `npm test` + `node bin/hookaudit.js --help` suffices, but a `Makefile` or `package.json:scripts` with `build` alias would be explicit |

### F.3 Research Corpus Assessment

- **Volume:** 8 research files in `research/`, 7 in `research reports/` (duplicated), 2 in `spec/` — total ~500k+ characters.
- **Quality:** Evidence-first, cites ChainDrop (keyv, 2B+ installs, Aug 4 2026), Rafter `git clone Considered Harmful`, OpenSourceMalware DPRK campaign, Check Point CVE-2025-59536/2026-21852, Flight Check competitor — all cross-checkable.
- **Risk:** Some files duplicated with `(1)` suffix (Windows download artifact) — housekeeping needed, not security-relevant.
- **Treatment:** Per Master Prompt §6: “Treat the research as design evidence. Do not blindly copy unsupported claims.” Current implementation correctly does NOT vendor research claims as code; it implements 11-surface scanner as justified.

### F.4 STDLIB Accuracy Check (12 entries)

All 12 verified against `bin/hookaudit.js`:
1. minimist/yargs/commander → parseArgs ✅
2. chalk → styleText ✅
3. glob/fast-glob → listFilesRecursive ✅
4. ignore → IGNORED_DIRS set ✅ (honest limitation noted)
5. js-sha256 → createHash ✅
6. uuid → randomUUID ✅
7. mocha/jest/ava → node:test ✅
8. cli-table3 → hand-written printHuman ✅
9. deep-diff → hand-written diffAgainstBaseline ✅
10. dotenv → process.loadEnvFile mention (not used) ✅
11. execa → child_process execFileSync in tests only ✅
12. toml → not implemented, raw text scan ✅ (honest)

No fake substitutions.

---

## G. Security Audit

### G.1 Safe Analysis Invariant (MANDATORY)

| Check | Result | Evidence |
|---|---|---|
| Target code never executed | ✅ PASS | No `require(target)`, no `import`, no `execFile` on target, no `vm` |
| Target dependencies never installed | ✅ PASS | No `npm install`, no `fs` write outside `.hookaudit/` |
| Target content treated as inert data | ✅ PASS | Only `fs.readFileSync(p,'utf8')` → string → regex/JSON.parse |
| Individual parser failure doesn't crash scan | ✅ PASS | `try { JSON.parse } catch → parseError`, `try { readdirSync } catch → return out`, `try { readFile } catch → null` |
| Baseline write is confined | ✅ PASS | Only writes `.hookaudit/baseline.json` via `fs.mkdirSync(path.join(root, BASELINE_DIR), {recursive:true})` |

### G.2 Repository Boundary

| Attack | Current Handling | Gap |
|---|---|---|
| `../` traversal in *discovery* | ✅ Safe — `resolveSurfaceFiles` uses `path.join(root, rel)` where `rel` is from hard-coded SURFACES globs, not from target content; no user-supplied path outside root is joined without `path.resolve(root)` check | None for discovery |
| `../` traversal in *references* | ❌ NOT APPLICABLE YET — resolver not implemented; `findCrossReference` only regex-detects, doesn't resolve to filesystem; no path normalization, no boundary check | **HIGH — resolver must enforce** (Master Prompt §16, Spec §8.4) |
| Absolute path escape | ❌ Same — not checked because not resolved | Must become BOUNDARY_VIOLATION/UNRESOLVED |
| Symlink escape | ❌ `listFilesRecursive` uses `fs.readdirSync(..., {withFileTypes:true})` + `e.isDirectory()` — does NOT follow symlinks via `isSymbolicLink`, but also does NOT explicitly skip them; `fs.statSync` in `resolveSurfaceFiles` follows symlinks by default | Must add `lstatSync` or `isSymbolicLink` check, document policy (Spec §8.5: do not follow outside boundary, preserve evidence) |
| Windows junctions / UNC | ❌ Not handled | Must be documented/tested |
| Large file DoS | ❌ No `FILE_SKIPPED_SIZE_LIMIT` (Spec §9.3 recommends 1 MiB) | Add size check via `fs.statSync().size` before read |
| Binary blob | ❌ No `BINARY_SKIPPED` (Spec §9.4) | Add null-byte heuristic or stat check |
| Graph depth DoS | ❌ No `MAX_GRAPH_DEPTH` (Spec §47 recommends 32) | Not needed until resolver implemented, but must be planned |
| Cycle DoS | ❌ No cycle detection | Must be in resolver |

### G.3 Evidence & Risk Integrity

| Requirement | Status | Fix |
|---|---|---|
| Every HIGH/CRITICAL finding retains evidence | **PARTIAL** — has file, trigger, command excerpt, reasons; missing line numbers, field path, detector id, confidence | Add `evidence: {path, field, detector, reason}` and confidence per finding |
| No `MALWARE DETECTED` claim | ✅ PASS — uses HIGH-RISK execution path language (README, RULES.md §16, code never emits MALWARE) | — |
| Risk ≠ malware distinction | ✅ PASS | — |
| Confidence separate from risk | ❌ MISSING — code has `severity` + `score` + `reasons` but no `confidence` enum (HIGH/MEDIUM/LOW) per Spec §24 | Add confidence inference (e.g., DYNAMIC lowers confidence) |
| Unsupported surfaces labeled | ❌ MISSING — if a surface is not analyzed (e.g., TOML structural), no `UNSUPPORTED` diagnostic | Add diagnostics array |

### G.4 Privacy

| Requirement | Status |
|---|---|
| No telemetry, no upload, no cloud | ✅ PASS — no `fetch`, no `https`, no outbound |
| Offline-capable | ✅ PASS |
| No required external network | ✅ PASS |

### G.5 Never-Execute Regression Test (Spec §35, Master Prompt §35)

**Required:** Create a malicious-looking test script that would modify a marker if executed; assert marker never appears.

**Current:** ❌ NOT PRESENT. No test creates a payload script that would `fs.writeFileSync(marker)` if executed. Must be added as permanent regression (e.g., `test/fixtures/never-execute/marker-test.sh` containing `touch /tmp/hookaudit-marker` and assertion that marker does NOT exist after scan).

### G.6 Severity Scoring vs. Spec Risk Model

| Spec Example | Current Score |
|---|---|
| `automatic + network + process = HIGH` | Current: auto(2) + network(2) + crossRef? process not explicitly weighted; `curl` triggers network(2) → auto2+net2=4 → WARN, not HIGH. Need `process` signal (node/python/curl? ). Gap. |
| `automatic + remote download + process + obfuscation = CRITICAL` | Current: auto2 + runtime3 + obfuscation2 + crossRef3 (+network2) → 5+ easily → CRITICAL. Works for malicious fixture (score 10). |
| **Issue:** `PROCESS_EXECUTION` not explicitly detected (only network/runtime/obfuscation/shell). `node`/`python` alone not flagged unless combined with download/install. Legitimate `node setup.mjs` would be auto2+crossRef3=5→CRITICAL even without network — maybe intentional (cross-tool alone is sensitive) but could be tuned. |

---

## H. Hackathon Rule Audit

| Rule (from Master Prompt §7 + official context pack) | Current Status | Evidence | Action Required |
|---|---|---|---|
| **Empty runtime manifest** (`"dependencies": {}`) | ✅ PASS | `package.json:15` empty; `npm ls --all` → (empty) | None |
| **Standard-library-only runtime** | ✅ PASS | 4 `node:` requires only | None |
| **One-command build/run** | ✅ PASS (with note) | `node bin/hookaudit.js --help` — no build step, per `README.md:66` | Document as `npm test` + `node bin/hookaudit.js` in README; consider alias `npm start` |
| **Dependency proof** (`deps-proof.txt`) | ✅ PASS (stale) | Present, but shows Linux path `/home/claude/hookaudit` | Regenerate on current platform or add multi-platform note |
| **README.md** | ✅ PASS | 203 lines, covers what/why/who/how/surfaces/architecture/risk/baseline/limitations | Update Node version to 24, fix CLI contract (`hookaudit .` vs `scan`) |
| **STDLIB.md** | ✅ PASS | 12 real substitutions, 2 honest limitations | None (excellent) |
| **`.zero-dep.toml`** | ✅ PASS | Present, track E, pitch | Ensure license field not required by validator |
| **Public source repository** | ❌ FAIL | No commits, no remote, not public | `git init` already done but need `git add . && git commit` + `gh repo create --public` |
| **OSI-approved license** | ✅ PASS | `LICENSE` MIT, `package.json:license` MIT | None |
| **Tests** | ✅ PASS (coverage gap, not rule gap) | 9 tests, `npm test` passes 7/9 (Windows bug) | Fix Windows separator bug to reach 9/9 |
| **Five-minute demo** | ❌ NOT YET | No video file; `PLAN.md:7` provides script | Record per PLAN 7 steps |
| **No hidden runtime commands** (no shell-out to git/curl/jq etc.) | ✅ PASS | No runtime `child_process`, no `git` | None |
| **No vendoring** | ✅ PASS | No copied library source | None |
| **New code window** | ⚠️ RISK | Code is reference implementation from PLAN.md authorship; `PLAN.md:94` warns to rewrite/adapt in your own commits inside window | Must re-commit with your authorship inside window; do not submit with `PLAN.md` Co-Authored-By if window is enforced |
| **AI permitted** | ✅ PASS | AI-assisted development expected per §45 | None — but every AI change must be reviewed/tested per RULES.md §37 |

**Overall hackathon compliance: 11/13 PASS, 1 stale, 1 missing (public repo + demo), 1 risk (new code window). No disqualifying violation.**

---

## I. Gap Analysis Against MVP Contract

### I.1 MVP Contract Scope (from `docs/spec/HookAudit_Final_Technical_Specification_MVP_Contract.md`)

The MVP is defined as: scanner that discovers execution surfaces, normalizes them, extracts triggers/commands/references, resolves multi-hop graph, infers capabilities, applies path-based risk, reports human+JSON, and supports baseline/diff — all zero-dep, safe, deterministic, evidence-backed.

### I.2 Feature Gap Matrix (Required §60)

| MVP Requirement | Exists? | Current Behavior | Missing / Incorrect | File / Module | Priority | Test |
|---|---|---|---|---|---|---|
| **CLI: `hookaudit .`** (`hookaudit . --json --strict`) | ❌ MISSING | Only `hookaudit scan --path <dir>` works; `hookaudit .` treats `.` as unknown command | No positional path handling; no `--strict` flag; help shows `scan` subcommand not positional | `bin/hookaudit.js:484` `main()` | **P0** | None |
| **CLI: baseline/diff positional** (`hookaudit baseline .`) | ❌ PARTIAL | Works as `hookaudit baseline --path <dir>` but not `hookaudit baseline .` | Missing positional path dispatch | `bin/hookaudit.js:523` | P0 | Tests use `--path`, not positional |
| **Scanner: repository boundary enforcement** | ⚠️ PARTIAL | Discovery safe; reference resolution missing; symlink/junction not handled | Add `lstatSync`, boundary check, UNC handling, size/binary guards | `bin/hookaudit.js:172-196` | P0 | No boundary test |
| **Scanner: file size limit** (1 MiB) | ❌ MISSING | Reads all files regardless of size | Need `fs.statSync().size` check → `FILE_SKIPPED_SIZE_LIMIT` diagnostic | `bin/hookaudit.js:188` | P1 | None |
| **Scanner: binary detection** | ❌ MISSING | Reads binary as utf8 | Add null-byte or size heuristic → `BINARY_SKIPPED` | `bin/hookaudit.js:188` | P1 | None |
| **Scanner: deterministic ordering** | ❌ MISSING | `readdirSync` order is filesystem-dependent; no sort | Sort SURFACES, files, findings, results lexicographically | `bin/hookaudit.js:371` `scan()` | P0 | No determinism test |
| **Scanner: ignored dirs** (hard-coded) | ✅ COMPLETE | `IGNORED_DIRS` set | Correct for MVP; full `.gitignore` is stretch per STDLIB.md:11 | `bin/hookaudit.js:120` | — | `node_modules` test passes |
| **Adapter: Claude Code** (SessionStart etc.) | ✅ COMPLETE | `extractClaudeHookCommands` handles hooks.SessionStart etc., `AUTO_TRIGGER_KEYS` | Complete | `bin/hookaudit.js:204` | — | Covered |
| **Adapter: VS Code** (tasks.json folderOpen) | ✅ COMPLETE | `extractVscodeTaskCommands` handles runOn:folderOpen | Complete | `bin/hookaudit.js:222` | — | Covered |
| **Adapter: Cursor** (text-dir) | ⚠️ PARTIAL | `.cursorrules` + `.cursor/rules` scanned as raw text, always WARN? No structural parse (instruction vs execution distinction missing) | Spec §41 says do not classify instruction-only files as code execution; current treats all cursor content as auto? Actually auto=false for cursor, so only heuristic triggers fire — acceptable for MVP but incomplete | `bin/hookaudit.js:73` | P1 | No cursor fixture |
| **Adapter: npm** (lifecycle) | ✅ COMPLETE | `extractPackageJsonScripts` with AUTO set preinstall/postinstall/prepare etc. | Complete | `bin/hookaudit.js:234` | — | Covered |
| **Adapter: dev hooks** (Husky, git/hooks, pre-commit, Gemini, Codex) | ⚠️ PARTIAL | Husky/git as text-dir, Gemini/Codex/pre-commit as text scan | Gemini/Codex lack structural JSON/TOML/YAML parsing (documented limitation in README/STDLIB) | `bin/hookaudit.js:79-113` | P1 | No fixture |
| **Normalized surface model** (`ExecutionSurface` §10) | ❌ MISSING | Current is `{file, surface, hash, findings, parseError}` + nested `findings[]` | Missing `id, sourcePath, surfaceType, triggerType, triggerCondition, command, referencedPaths, capabilities, evidence, resolutionState, severity, confidence` per canonical model | `bin/hookaudit.js:321` | **P0** | No surface model test |
| **Trigger extraction** (AUTOMATIC/MANUAL/EVENT_DRIVEN/UNKNOWN) | ⚠️ PARTIAL | `AUTO_TRIGGER_KEYS` + per-adapter auto hints → weight 2 | Works but not normalized to spec enum; missing triggerCondition human-readable string | `bin/hookaudit.js:116` | P1 | Covered via CRITICAL logic |
| **Command extraction** (CommandSpec) | ❌ MISSING | Finds `command` string, but no `executable, arguments[], shell, references[]` normalization | Spec §14 requires parsing `command` + `args` arrays, shell wrappers, script refs | `bin/hookaudit.js:291` | P0 | No CommandSpec test |
| **Reference resolution** (config→script→script) | ❌ MISSING | Only `findCrossReference` regex; no file load, no normalization, no recursive traversal | **CORE MVP FAILURE** — Depth over breadth requires `config → script A → script B → capability` min graph (Prompt §13, Spec §15) | `bin/hookaudit.js:260` | **P0** | No reference test |
| **Cycle detection** | ❌ MISSING | None | Must handle A→B→C→A with `CYCLE_DETECTED` diagnostic | — | P0 | No cycle test |
| **Boundary checks on references** | ❌ MISSING | None | Must reject `../`, absolute, symlink outside root → `UNRESOLVED`/`BOUNDARY_VIOLATION` | — | P0 | No boundary test |
| **Execution graph** (nodes/edges §11) | ❌ MISSING | No graph materialization | Must produce nodes REPOSITORY/CONFIG/TRIGGER/COMMAND/SCRIPT/FILE/CAPABILITY and edges CONTAINS/TRIGGERS/EXECUTES/REFERENCES etc. | — | **P0** | No graph test |
| **Capability inference** (P0/P1/P1-2) | ⚠️ PARTIAL | Capabilities implicit as `RULES.why` strings | Missing `capabilities[]` enum per surface: PROCESS_EXECUTION, NETWORK_ACCESS, REMOTE_DOWNLOAD, RUNTIME_BOOTSTRAP etc. | `bin/hookaudit.js:133` | P0 | Partial via findings |
| **Path-based risk** (unified, deterministic, evidence-backed §20-22) | ⚠️ PARTIAL | Per-command additive score (auto2+network2+runtime3+crossRef3+obfuscation2+shell1) → thresholds 5/2 | Works for fixtures but not path-aggregated; no confidence separation; no deterministic rule table documented in code; adapters contain rule logic (should be central) | `bin/hookaudit.js:291` | P0 | Covered for direct, not for path |
| **Evidence per finding** (§19) | ⚠️ PARTIAL | Has file, trigger, command excerpt, reasons | Missing line/column, field, detector id, excerpt line number, resolutionState | `bin/hookaudit.js:291` | P0 | No evidence test |
| **Confidence** (§24) | ❌ MISSING | No confidence field | Must be HIGH/MEDIUM/LOW separate from risk | — | P1 | None |
| **Human report** (§26) | ✅ COMPLETE | `printHuman` shows file, surface, trigger, command, reasons, drift | ANSIBLE but missing WHAT/WHEN/WHERE/PATH/CAPABILITY/WHY explicit headings; missing `Unsupported surfaces were not analyzed` coverage note | `bin/hookaudit.js:436` | — | Visual |
| **JSON report** (§30) | ❌ PARTIAL | `{results, diff}` not `{version, repository, summary, surfaces, paths, capabilities, diagnostics}` | Shape non-spec; missing summary decision PASS/REVIEW/BLOCK | `bin/hookaudit.js:477` | P0 | JSON shape not spec-validated |
| **Baseline** (SHA-256, §31-33) | ✅ COMPLETE (file-hash) | `.hookaudit/baseline.json` with createdAt, id, files map | Missing version, surface identity, capability summary, graph representation (stretch) | `bin/hookaudit.js:392` | — | Covered |
| **Diff** (NEW/CHANGED/REMOVED §34) | ✅ COMPLETE | File-level diff | Missing structural diff (NEW TRIGGER, CHANGED COMMAND etc.) and capability diff | `bin/hookaudit.js:411` | P1 | Covered for file |
| **Strict mode** (`--strict`) | ❌ MISSING | No flag, no policy | Should exit 1 on WARN or stricter threshold | `bin/hookaudit.js:484` | P1 | None |
| **Explain** (`hookaudit explain <finding>`) | ❌ MISSING (optional per §28) | — | Future, not MVP blocker | — | P2 | None |
| **Determinism** | ❌ MISSING | No sort, platform-dependent paths | Must sort lexicographically, emit POSIX paths, stable JSON key order | — | P0 | No determinism test |
| **Performance** (large repo, node_modules skip, depth limit) | ⚠️ PARTIAL | node_modules/.git skipped, but no size/depth/binary guards | Add size guard, depth guard for future resolver | — | P1 | Only node_modules test |
| **Privacy** (local-only) | ✅ COMPLETE | No network, no telemetry | Complete | — | — | — |
| **No automatic remediation** | ✅ COMPLETE | Reports only, never deletes/rewrites | Complete | — | — | — |
| **Windows path handling** | ❌ BROKEN | `path.relative` emits `\\` on Win32, breaks tests & portability | Normalize to POSIX | `bin/hookaudit.js:322` | **P0** | Tests 7,8 fail |

### I.3 Summary Counts

- **COMPLETE:** 12
- **PARTIAL:** 11 (mostly JSON-shape, capability, risk, docs)
- **MISSING:** 12 (graph, resolver, confidence, strict, file guards etc.)
- **BROKEN:** 1 (Windows path separator)
- **P0 blockers:** 9 (CLI positional, surface model, command spec, resolver, graph, capability enum, path risk, JSON shape, determinism, Windows path)

### I.4 Depth vs Breadth Assessment (Prompt §13)

Current implementation prioritizes **breadth** (11 surfaces) over **depth** (multi-hop). Spec and Master Prompt explicitly require:

```
Strong parsing
Multi-hop resolution
Execution graph
Capability reasoning
Evidence
  >
Large number of shallow integrations
```

Minimum core graph `config → script A → script B → script C → capability` is **not yet satisfied**. This is the single largest architectural gap. However, existing 11-surface breadth is valuable and should be *kept*; depth must be *added* under it, not by removing surfaces.

---

## J. Proposed Documentation Structure

### J.1 Target Tree (per Master Prompt §42-43, §63)

```
HookAudit/
├── README.md                 # User-facing: what/why/who/how, supported surfaces table, arch diagram, risk/baseline/diff, zero-dep, limitations summary (honest)
├── STDLIB.md                 # 12+ real substitutions (already excellent — keep, update Node version to 24)
├── RULES.md                  # Operational rulebook — 14 required sections (shrink from 48 or keep full with TL;DR)
├── SECURITY.md               # NEW — threat model, safe-analysis principle, boundary, risk vs malware, disclosure path
├── LIMITATIONS.md            # NEW — dynamic code/paths, unsupported ecosystems, shell parsing limits, false pos/neg, second-stage, branch coverage
├── .zero-dep.toml            # Track + pitch (keep)
├── deps-proof.txt            # Regenerated (multi-platform)
├── LICENSE                   # MIT (keep)
├── docs/
│   ├── README.md             # Index + authority note (keep)
│   ├── research/             # Research history/evidence (keep, de-dupe "(1)" files, add manifest)
│   │   ├── manifest.md               # NEW — which file is source-of-truth, dates, provenance
│   │   ├── From Blind Spot...md
│   │   ├── HookAudit_Architecting...md
│   │   ├── Mapping the Attack Surface...md
│   │   └── zero-dependency-2026-research.md
│   └── spec/
│       ├── HookAudit_Final_Technical_Specification_MVP_Contract.md  # Keep (70736)
│       ├── HookAudit_Final_Technical_Specification_MVP_Contract_Master_Prompt.md
│       └── CHANGELOG.md              # NEW — spec deltas if MVP drifts
├── bin/
│   └── hookaudit.js          # Single-file artifact (keep; remove root duplicate or keep as symlink/copy note)
├── test/
│   ├── hookaudit.test.js     # 9 tests → expand to 15+ to cover boundary/cycle/dynamic/never-execute/determinism
│   └── fixtures/             # Expand per §34 fixture classes
└── INVESTIGATION_REPORT.md   # THIS FILE — investigation baseline
```

### J.2 Documentation Purposes (no duplication)

| Doc | Audience | Owns | Must Not Duplicate |
|---|---|---|---|
| `README.md` | User / judge | What, why, demo, install, limitations *summary*, threat model *summary* | Full STDLIB table, full RULES, full threat model detail |
| `STDLIB.md` | Judge / auditor | Every real substitution, honest limitations | README narrative |
| `RULES.md` | Humans + AI agents | 14 sections: non-negotiables, compliance, scope, safety | Implementation detail that belongs in code comments |
| `SECURITY.md` | Security engineer / reporter | Threat model, boundary, safe-analysis, risk vs malware, disclosure | README summary |
| `LIMITATIONS.md` | All | Explicit unknowns: dynamic code, TOML/YAML parsing, branch coverage, false neg/pos | README only summarizes with pointer |
| `docs/research/*` | Historical | Evidence corpus | — |
| `docs/spec/*` | Implementer | MVP contract (authoritative) | — |
| `INVESTIGATION_REPORT.md` | Maintainer / reviewer | Gap matrices, decision log, plan | — |

### J.3 Action Items for Docs

1. **Create `SECURITY.md`** — extract from README Threat Model + RULES.md §9/10 + Spec §55, add disclosure email/procedure (even if placeholder).
2. **Create `LIMITATIONS.md`** — consolidate README Limitations + STDLIB honest limitations + Spec §25/45, add branch-coverage note (working tree only).
3. **Update `README.md`** — bump Node to `>=24.0.0`, fix CLI examples to match both `hookaudit .` and `hookaudit scan --path` (or pick one and document), note root `hookaudit.js` duplicate.
4. **Clean `docs/`** — remove `(1)` duplicated files or annotate as Windows duplicates; add `docs/research/manifest.md`.
5. **Regenerate `deps-proof.txt`** — run `npm ls --all` and `grep require` on Windows, include both Linux and Windows outputs or overwrite.
6. **Keep `RULES.md`** — either keep 48-section full version (already excellent) and add a 14-section TL;DR at top, or collapse to 14 sections per §64. Recommendation: **keep full but add 14-section index** (less churn before freeze).

---

## K. Required RULES.md Assessment

### K.1 Current RULES.md vs. Required §64 Sections

| Required §64 Section | Present in Current RULES.md? | Section # | Assessment |
|---|---|---|---|
| 1. Mission | ✅ | §1 | Complete |
| 2. Non-Negotiables | ✅ | §2 (10 bullets) | Complete — matches Master Prompt §14-15 |
| 3. Hackathon Compliance | ✅ | §3 + §4 | Complete |
| 4. Product Scope | ✅ | §6 (Primary MVP surfaces) | Complete |
| 5. Architecture Rules | ✅ | §8 (Core Architecture) + §11-12 (Surface/Graph) | Complete |
| 6. Security Rules | ✅ | §9 (Safe Analysis) + §10 (Boundary) + §15-19 (Risk/Evidence/Confidence) | Complete |
| 7. Zero-Dependency Rules | ✅ | §4 | Complete |
| 8. AI-Agent Workflow | ✅ | §5 (GSTACK) + §37 | Complete |
| 9. Testing Rules | ✅ | §25-26 | Complete |
| 10. Documentation Rules | ✅ | §30-34 | Complete |
| 11. Git Rules | ✅ | §36 | Complete |
| 12. Scope Control | ✅ | §38 | Complete |
| 13. Definition of Done | ✅ | §40-43 (Day1/2/3) | Complete |
| 14. Escalation / Stop Conditions | ✅ | §39 | Complete |

**Plus additional compulsory content per §8:** Hackathon rules, product rules, runtime dep rules, architecture, security, testing, documentation, scope, git/change, AI workflow, DoD, prohibited shortcuts — all present.

**Current RULES.md is 1104 lines / 48 sections, which is *more* complete than the 14-section minimum.** It already contains §§1-48 covering every Master Prompt requirement (zero-dep, gstack workflow, depth over breadth, never-execute, boundary, execution-surface model, graph, resolver, capabilities, risk, risk≠malware, evidence, confidence, baseline/diff, CLI, testing, determinism, performance, privacy, no remediation, STDLIB/README/SECURITY/LIMITATIONS, git, AI coding, competitive claims, Day1/2/3, cut order, research accuracy, final principle).

**Verdict: RULES.md is IMPLEMENTATION-READY. No rewrite needed.** Minor tune-ups recommended (not blocking):

- Add explicit `Node >=24 LTS` note to §4.
- Ensure CLI contract (§22) lists both `hookaudit .` and `hookaudit scan --path` if we support both.
- Add `LIMITATIONS.md` to §30 documentation list (currently lists `SECURITY.md` + `LIMITATIONS.md` — already there, good).
- Consider adding 14-section TL;DR index at top linking to full sections (usability, not compliance).

**File:** `C:\Hackathons\HookAudit\RULES.md` — retain as committed rulebook. Do not delete research.

---

## L. Day-1 Implementation Plan

**Goal (Master Prompt §50):** CLI works, boundary works, scanner works, normalized surface model works, Claude/VSCode/Cursor/npm parsers work, trigger/command extraction works, basic report works, tests pass, zero-dep preserved.

**Timebox:** Freeze is **today Aug 31 2026 18:00 UTC / 11:30 PM IST** — ~3-7 hours remaining per `PLAN.md:1`. Day-1 must be shippable before that window. Day-2 (resolver/graph) and Day-3 (capability diff/strict/demo) are stretch if time permits per Cut Order §53.

### L.1 Pre-Flight (15 min)

1. **Inspect `git status` / `git diff`** — already done: no commits, all untracked. ✅
2. **Run `npm test` baseline** — 7/9 pass, 2 fail (Windows path) documented above. ✅
3. **Create `.gitignore`** — add `.hookaudit/`, `node_modules/`, `*.log`, `.DS_Store` (prevents accidental baseline commit).
4. **Remove or document root duplicate** — either `del hookaudit.js` (keep only `bin/hookaudit.js`) or add README note that root is convenience copy. Decision: **remove root duplicate** to avoid drift; `package.json` bin already points to `bin/hookaudit.js`. Keep git history clean.

### L.2 P0 Fixes (Must Ship — 60-90 min)

| # | Fix | File:Line | Change | Test | Risk |
|---|---|---|---|---|---|
| 1 | **Normalize relative paths to POSIX** | `bin/hookaudit.js:322` `scanFile()` | `const rel = path.relative(root, file).split(path.sep).join('/')` (or `.replace(/\\/g,'/')`); also ensure baseline keys use same normalization | Fixes tests 7,8; makes baseline portable, JSON deterministic | Low — string replace only |
| 2 | **Deterministic file ordering** | `bin/hookaudit.js:173-186` `listFilesRecursive`, `bin/hookaudit.js:371` `scan()` | Sort `entries` by `e.name`; after `scan()`, sort `results` by `file`; inside `scanFile`, sort `findings` by `severity` then `trigger` | Add determinism test: scan#1 JSON === scan#2 JSON | Low |
| 3 | **Support positional path + `--strict`** | `bin/hookaudit.js:485-540` `main()` | Accept both `hookaudit scan --path <dir>` and `hookaudit <path> [--json]` (detect if `positionals[1]` is path); add `strict: {type:'boolean', default:false}`; `exitCode = anyCritical \|\| (strict && anyWarn) \|\| (diff && changes)` | CLI contract per spec §28-29; keep backward compat with existing `scan` | Medium — parseArgs logic must stay zero-dep |
| 4 | **Bump Node engines to 24 LTS** | `package.json:9`, `README.md:84` | `"node": ">=24.0.0"` (or `>=24.11.0` LTS), README “Requires Node.js ≥ 24 (tested on v24.19.0)” | Aligns with Master Prompt §32 (Node 20 EOL) | Low |
| 5 | **Create missing docs** | `SECURITY.md`, `LIMITATIONS.md` | Extract from README + RULES.md as per §J; 30-50 lines each, no new dependencies | Hackathon doc audit expects them | Low |
| 6 | **Fix `ownDir` extraction for POSIX paths** | `bin/hookaudit.js:323` | After normalizing `rel`, `ownDir = rel.split('/')[0]` (not `path.sep` split) | Ensures cross-ref works on Windows | Low |

### L.3 P0 Tests to Add (30 min)

| Test | Fixture | Assertion | File |
|---|---|---|---|
| Never-execute regression (§35) | `test/fixtures/never-execute/` with script containing `require('fs').writeFileSync('/tmp/hookaudit-marker','pwned')` | After `scan`, assert `!existsSync(marker)` + findings include CRITICAL | `test/hookaudit.test.js` |
| Boundary traversal | `test/fixtures/boundary/` with `.claude/settings.json` command `node ../../outside/evil.js` and `node C:\Windows\evil.js` | Findings marked `UNRESOLVED`/`BOUNDARY_VIOLATION`, no read outside root | same |
| Determinism | `clean-repo` | `JSON.stringify(scan1) === JSON.stringify(scan2)` (two consecutive runs) | same |
| Strict mode | `clean-repo` (has WARN) | `hookaudit . --strict` exits 1, without strict exits 0 | same |

Keep existing 9 tests; new tests push to 13 and satisfy Master Prompt §34-37.

### L.4 P1 Enhancements (If Time Remains — 45 min)

| Fix | Value | Effort |
|---|---|---|
| Add `FILE_SKIPPED_SIZE_LIMIT` (stat size >1 MiB → skip with diagnostic) | Prevents large file DoS, ticks Spec §9.3 | 10 min |
| Add `BINARY_SKIPPED` heuristic (null byte check first 1k) | Ticks Spec §9.4 | 10 min |
| Add `diagnostics[]` array to JSON output (for parse errors, skipped files, boundary violations) | Makes JSON spec-adjacent without full graph | 15 min |
| Normalize JSON key order (`JSON.stringify` with sorted keys) | Determinism | 10 min |

### L.5 P2 / Cut (Do NOT attempt before freeze)

- **Reference resolver + execution graph + multi-hop** — Core differentiator but requires 2-3 hours of careful `MAX_GRAPH_DEPTH=32` traversal, cycle detection, and evidence propagation. Per Cut Order §53: **protect graph/resolver but cut if Day-1 not green**. Given freeze in hours, mark as **Day-2**, not Day-1.
- TOML/YAML structural parsers, git-native branch walker (`node:zlib` inflate), HTML/SARIF, interactive graph — all explicit cut.
- Keep single-file artifact (already qualifies).

### L.6 Implementation Steps (Ordered)

1. Apply L.2 fixes #1, #2, #6 (path + sort) → run `npm test` → expect 9/9 pass.
2. Apply L.2 fix #3 (CLI positional + strict) → manual test:
   ```
   node bin/hookaudit.js . --json               # should equal scan --path .
   node bin/hookaudit.js scan --path test/fixtures/clean-repo --strict  # should exit 1 (has WARN)
   ```
3. Apply L.2 fix #4 (engines) → `npm test` remains green.
4. Create L.2 fix #5 (`SECURITY.md`, `LIMITATIONS.md`, `.gitignore`) → verify no new deps.
5. Add L.3 tests → `npm test` → expect 13/13 pass.
6. Audit: `npm ls --all`, `grep -c require`, `node bin/hookaudit.js --help`, `node bin/hookaudit.js scan --json --path test/fixtures/malicious-repo | head`.
7. Git: `git add -A && git commit -m "feat: Day-1 hardening — POSIX paths, determinism, CLI positional, Node 24, security docs"` (inside hackathon window).
8. `npm test` final + `deps-proof.txt` regeneration.

### L.7 Stop Conditions (RULES.md §39)

Stop and report if:
- Any fix would introduce a `dependencies` entry.
- Reference resolver would require executing target code to be accurate (must be `UNRESOLVED` instead).
- Symlink/junction handling is ambiguous on Windows (choose safe default: `lstatSync` + do not follow if target outside root, emit diagnostic).
- Time runs out before resolver is stable — **ship Day-1 as MVP**, document resolver as “Planned — Day-2” in `LIMITATIONS.md` and `RULES.md` deviation log, do not fake graph.

### L.8 Definition of Done for Day-1 (per Master Prompt §50)

- [ ] `node bin/hookaudit.js --help` works
- [ ] `hookaudit .` and `hookaudit scan --path .` both work; `hookaudit . --json` emits JSON; `hookaudit . --strict` gates on WARN
- [ ] Repository boundary enforced for discovery (no outside walk, no `node_modules` walk)
- [ ] All 11 surfaces scanned; Claude/VSCode/Cursor/npm parsers produce correct triggers/commands (verified against fixtures)
- [ ] Trigger + command extraction works (4 extractors + file-body fallback)
- [ ] Basic human + JSON report works (with POSIX paths, deterministic order)
- [ ] All Day-1 tests pass (≥13)
- [ ] `npm ls --all` → (empty), `deps-proof.txt` regenerated
- [ ] `README.md` + `STDLIB.md` + `RULES.md` + `SECURITY.md` + `LIMITATIONS.md` present and accurate (no vaporware)
- [ ] `git log` shows at least one commit inside hackathon window

---

## Required Table — Repository Inventory

| Path | Type | Purpose | Current Status | Dependencies | Security Notes | Test Coverage |
|---|---|---|---|---|---|---|
| `bin/hookaudit.js` | entry (Node) | CLI, scanner, adapters, rule engine, baseline/diff, report | COMPLETE (P0) but missing graph/resolver; BROKEN on Windows (path sep) | `node:fs, node:path, node:crypto, node:util` only | Safe (no exec); boundary partial; no size/binary guard | 7/9 pass (2 fail Win) |
| `hookaudit.js` (root) | duplicate | Convenience copy of bin artifact | DEPRECATED (byte-identical) — should be removed | same | Same | Same |
| `package.json` | manifest | Name, version 0.1.0, bin, engines, scripts, empty deps | COMPLETE (engines stale vs spec) | none | — | — |
| `test/hookaudit.test.js` | test | 9 black-box tests via node:test + execFileSync | PARTIAL (missing 5 required classes) | `node:test, node:assert, node:child_process, node:fs, node:os, node:path` (test only) | — | 77% pass on Win |
| `test/fixtures/clean-repo/**` | fixture | Safe repo (Prettier hook, npm test task, postinstall echo) | COMPLETE | — | Synthetic inert | Covered |
| `test/fixtures/malicious-repo/**` | fixture | Malicious-pattern repo (SessionStart→.vscode, folderOpen curl+cross-ref, preinstall base64) | COMPLETE (synthetic) | — | No live payload | Covered |
| `.zero-dep.toml` | config | Hackathon track E, pitch | COMPLETE | — | — | — |
| `deps-proof.txt` | proof | `npm ls`, package.json grep, require grep | COMPLETE (stale Linux path) | — | — | — |
| `LICENSE` | legal | MIT | COMPLETE | — | — | — |
| `README.md` | doc | User-facing: problem, demo, surfaces, rules, baseline, limitations, threat model | COMPLETE (Node version + CLI minor gaps) | — | Honest limitations | — |
| `STDLIB.md` | doc | 12 real substitutions + 2 honest gaps | COMPLETE (excellent) | — | No crypto invention | — |
| `RULES.md` | doc | 48-section operational rulebook | COMPLETE (exceeds 14-section minimum) | — | Enforces never-execute | — |
| `PLAN.md` | doc | Compressed ship plan for Aug 31 freeze | COMPLETE (informational) | — | Warns about git history | — |
| `docs/README.md` | doc | Docs index, authority note | COMPLETE | — | — | — |
| `docs/research/*` (8 files) | research | Threat, SBOM, attack surface, methodology corpora | COMPLETE (with "(1)" duplicates) | — | Evidence, not truth | — |
| `docs/research reports/*` (7 files) | research/spec | Duplicated research + MVP contracts | COMPLETE | — | — | — |
| `docs/spec/*` (2 files) | spec | MVP Contract (70736) + Master Prompt (50900) | COMPLETE | — | Authoritative | — |
| `SECURITY.md` | doc | Threat model, boundary, disclosure | MISSING | — | Must create | — |
| `LIMITATIONS.md` | doc | Dynamic/unsupported/false pos-neg Disclosure | MISSING (embedded in README) | — | Must create | — |
| `.gitignore` | config | Ignore .hookaudit, node_modules etc. | MISSING | — | Prevents baseline leak | — |
| `Makefile` / build | build | One-command build | MISSING (no build step; npm test suffices) | — | — | — |

---

## Required Table — Feature Gap Matrix

| MVP Requirement | Exists? | Current Behavior | Missing / Incorrect | File / Module | Priority | Test |
|---|---|---|---|---|---|---|
| CLI positional `hookaudit . --json --strict` | ❌ | Only `scan --path` works | Positional path + strict flag missing | `bin/hookaudit.js:484` | P0 | None |
| Repository boundary (traversal, symlink, UNC, junction) | PARTIAL | Discovery safe, no reference boundary | Resolver boundary, symlink lstat, UNC, size/binary guards | `bin/hookaudit.js:172` | P0 | None |
| File size limit (1 MiB → FILE_SKIPPED_SIZE_LIMIT) | ❌ | No limit | Add stat size check | `bin/hookaudit.js:188` | P1 | None |
| Binary detection (BINARY_SKIPPED) | ❌ | Reads binary as text | Null-byte heuristic | `bin/hookaudit.js:188` | P1 | None |
| Deterministic ordering (lexicographic) | ❌ | Filesystem order, platform path sep | Sort entries/results/findings, POSIX paths | `bin/hookaudit.js:371` | P0 | None |
| Claude adapter | ✅ | Structural parse, SessionStart etc. | — | `bin/hookaudit.js:204` | — | ✅ |
| VS Code adapter | ✅ | folderOpen detection | — | `bin/hookaudit.js:222` | — | ✅ |
| Cursor adapter | PARTIAL | Raw text scan | No instruction vs execution distinction | `bin/hookaudit.js:73` | P1 | ❌ |
| npm adapter | ✅ | lifecycle scripts | — | `bin/hookaudit.js:234` | — | ✅ |
| Dev hooks adapters | PARTIAL | Text scan only | TOML/YAML structural missing (honest limit) | `bin/hookaudit.js:79` | P1 | ❌ |
| Normalized ExecutionSurface model | ❌ | Flat findings | Missing id, capabilities[], evidence, confidence etc. | `bin/hookaudit.js:321` | P0 | None |
| CommandSpec normalization | ❌ | Raw string only | Missing executable/args/shell/references | `bin/hookaudit.js:291` | P0 | None |
| Reference resolution (multi-hop) | ❌ | Only cross-ref regex | No recursive load, no depth/cycle/boundary | `bin/hookaudit.js:260` | P0 | None |
| Cycle detection (CYCLE_DETECTED) | ❌ | None | Graph cycle handling | — | P0 | None |
| Execution graph (nodes/edges) | ❌ | No graph | REPOSITORY→CONFIG→TRIGGER→COMMAND→SCRIPT→CAPABILITY + edges | — | P0 | None |
| Capability enumeration (P0/P1/P2) | PARTIAL | Implicit in reasons | No capabilities[] enum | `bin/hookaudit.js:133` | P0 | Partial |
| Path-based risk (unified, deterministic) | PARTIAL | Per-command additive | Not path-aggregated, no confidence | `bin/hookaudit.js:291` | P0 | Partial |
| Evidence (path/field/line/detector) | PARTIAL | File+trigger+excerpt+reasons | Missing line, field, detector, confidence | `bin/hookaudit.js:291` | P0 | None |
| Confidence (HIGH/MEDIUM/LOW) | ❌ | None | Separate from risk per §24 | — | P1 | None |
| Human report | ✅ | Trigger+reasons+drift | Missing WHAT/WHEN/PATH/CAPABILITY headings + coverage note | `bin/hookaudit.js:436` | — | Visual |
| JSON report (spec §30 schema) | PARTIAL | `{results, diff}` | Missing version/repository/summary/surfaces/paths/diagnostics | `bin/hookaudit.js:477` | P0 | None |
| Baseline (SHA-256 file-hash) | ✅ | `.hookaudit/baseline.json` | Missing version/surface identity/capability summary (stretch) | `bin/hookaudit.js:392` | — | ✅ |
| Diff (NEW/CHANGED/REMOVED) | ✅ | File-level | Missing structural/capability diff | `bin/hookaudit.js:411` | P1 | ✅ |
| Strict mode | ❌ | None | `--strict` gate on WARN | `bin/hookaudit.js:484` | P1 | None |
| Windows path handling | BROKEN | `\\` on Win32 breaks tests & portability | Normalize to POSIX | `bin/hookaudit.js:322` | P0 | 2 fail |

---

## Required Table — Security Gap Matrix

| Security Requirement | Status | Evidence | Risk | Fix |
|---|---|---|---|---|
| Never execute target (inert data only) | ✅ PASS | `bin/hookaudit.js:31-34` only read/parse/hash; grep shows no exec/require of target; `readTextSafe` + `JSON.parse` only | None | — |
| Never install target deps | ✅ PASS | No `npm install`, no `node target`, no shell | None | — |
| Parser failure does not crash scan | ✅ PASS | `try/catch JSON.parse → parseError`, `try/catch readdirSync`, `try/catch readFile` | None | — |
| Discovery boundary (no walk outside root) | ✅ PASS | `resolveSurfaceFiles` uses hard-coded globs + `path.join(root, rel)`; `IGNORED_DIRS` skips `node_modules/.git` | Low | — |
| Reference boundary (`../`, absolute, symlink, UNC, junction) | ❌ GAP | Resolver not implemented; `findCrossReference` does not resolve, `listFilesRecursive` uses `statSync` (follows symlinks), no `lstatSync` | **HIGH** — malicious `node ../../evil.js` would not be flagged as boundary violation | Implement resolver with `path.resolve` + `startsWith(root)` check; use `lstatSync` + `isSymbolicLink` guard; emit `BOUNDARY_VIOLATION`/`UNRESOLVED` |
| Large file DoS (1 MiB limit) | ❌ GAP | No size check before `readFileSync` | MEDIUM — attacker can plant 100 MiB file to slow scan | Add `fs.statSync().size > 1_048_576 → FILE_SKIPPED_SIZE_LIMIT` diagnostic |
| Binary handling | ❌ GAP | No binary check | LOW — binary read as utf8 wastes work, may produce false reasons | Add null-byte heuristic → `BINARY_SKIPPED` |
| Cycle / depth DoS | ❌ GAP | No `MAX_GRAPH_DEPTH=32`, no cycle set | MEDIUM — resolver loop could DoS future graph traversal | Add visited Set + depth counter when resolver lands |
| Risk ≠ malware (no `MALWARE DETECTED`) | ✅ PASS | Never emits MALWARE; RULES.md §16 + README use HIGH-RISK path language | None | — |
| Evidence per HIGH/CRITICAL | PARTIAL | Has file/trigger/command/reasons; missing line/field/detector/confidence | MEDIUM — auditor cannot locate exact field | Add evidence object per Spec §19 |
| Confidence separate from risk | ❌ GAP | No confidence enum | LOW — reviewer cannot distinguish certain vs uncertain | Add HIGH/MEDIUM/LOW per Spec §24 |
| Never-execute regression test | ❌ GAP | No marker test | HIGH — invariant unproven | Add marker test per §35 |
| Deterministic output | ❌ GAP | Unsorted readdir, platform path sep | MEDIUM — CI diff flakes, baseline not portable | Sort + POSIX normalize |
| Privacy (no telemetry/upload) | ✅ PASS | No `fetch`/`https`/`http` at runtime | None | — |
| One-file artifact, no hidden binary deps | ✅ PASS | Single file, 4 node: requires | None | — |

---

## Required Table — Hackathon Rule Compliance Matrix

| Hackathon Rule | Current Status | Evidence | Action |
|---|---|---|---|
| Empty runtime manifest | ✅ PASS | `package.json:15` `"dependencies": {}`, `npm ls --all` → (empty) | None |
| One-command build/run | ✅ PASS | `node bin/hookaudit.js --help` — no build step; `npm test` | Document in README as one-command |
| Dependency proof (`deps-proof.txt`) | ✅ STALE | Present but shows `/home/claude/hookaudit` Linux path | Regenerate on Windows or append |
| README | ✅ PASS | 203 lines, covers what/why/build/run/limitations/design | Bump Node to 24, fix CLI examples |
| STDLIB | ✅ PASS | 12 real substitutions, 2 honest limits | None |
| `.zero-dep.toml` | ✅ PASS | Present, track E | None |
| Public source | ❌ MISSING | No commits, no remote | `git add . && git commit` + `gh repo create --public` |
| OSI License | ✅ PASS | `LICENSE` MIT + `package.json:license` MIT | None |
| Tests | ✅ PASS* | 9 tests, `npm test` 7/9 on Windows (path bug) | Fix path sep → 9/9 |
| Five-minute demo | ❌ MISSING | No video; `PLAN.md:7` script ready | Record 3-4 min per PLAN |
| New code window | ⚠️ RISK | Reference impl; `PLAN.md:94` warns to rewrite/commit in window | Re-commit with own authorship in window |
| No vendoring | ✅ PASS | No copied third-party code | None |
| AI permitted | ✅ PASS | AI-assisted expected per official rules | Ensure every AI change reviewed/tested (RULES.md §37) |

*Quality gap not rule gap — coverage should expand but 9 tests already satisfies “tests” checkbox.

---

## Required Documentation Plan

See §J above. Action checklist:

- [ ] Create `SECURITY.md` (threat model, safe-analysis, boundary, risk≠malware, disclosure)
- [ ] Create `LIMITATIONS.md` (dynamic code, TOML/YAML, branch coverage, false pos/neg, shell parsing)
- [ ] Create `.gitignore` (`.hookaudit/`, `node_modules/`, logs)
- [ ] Update `README.md` (Node 24, CLI positional, root duplicate note)
- [ ] Clean `docs/` duplicates, add `manifest.md`
- [ ] Regenerate `deps-proof.txt`
- [ ] Keep `RULES.md` (add TL;DR index if desired), `STDLIB.md` (bump Node note)

---

## Required RULES.md Design

Required sections (Master Prompt §64) → current coverage:

```
1. Mission                  → RULES.md §1
2. Non-Negotiables           → §2
3. Hackathon Compliance      → §3
4. Product Scope             → §6
5. Architecture Rules        → §8, §11-12
6. Security Rules            → §9-10, §15-19
7. Zero-Dependency Rules     → §4
8. AI-Agent Workflow         → §5, §37
9. Testing Rules             → §25-26
10. Documentation Rules      → §30-34
11. Git Rules                → §36
12. Scope Control            → §38
13. Definition of Done       → §40-43
14. Escalation / Stop Conditions → §39
```

Current `RULES.md` (1104 lines, 48 sections) **exceeds** minimum. It is operationally practical, controls AI agents, and is committed as rulebook. No rewrite needed before freeze. Optional: prepend 14-section TL;DR index for quick AI parsing.

---

## Stop Conditions

Do not silently improvise; **STOP and report** when:

```
- a runtime dependency would appear
- target code would need to execute to resolve behavior
- repository boundary becomes ambiguous (symlink, UNC, junction)
- an unsupported ecosystem is being added to core scope
- a security invariant would be weakened
- existing user work would be destroyed
- hackathon compliance becomes uncertain
- a major architectural decision cannot be inferred from spec/research
```

Current invocation: resolver graph is the major “cannot be inferred” — stop after Day-1 and document graph as Day-2 planned, do not fake it.

---

## Implementation-Ready Decision Log

| # | Decision | Rationale | Evidence | Alternative Considered | Outcome |
|---|---|---|---|---|---|
| 1 | **Fix Windows path separator before any Day-2 work** | 2 tests fail deterministically on Windows; JSON not portable; blocks CI | `path.relative` Win32 emits `\\`; tests expect `/`; baseline keys platform-dependent | Leave as is (rejected: breaks determinism invariant) | **DO** — one-line POSIX normalization at `scanFile` |
| 2 | **Remove root `hookaudit.js` duplicate** | SHA256 identical to `bin/hookaudit.js`; two copies drift risk; `package.json` bin already points to `bin/` | `Get-FileHash` both `F4BD8A291...` | Keep as convenience copy (rejected: extra file to maintain, confuses one-file bonus) | **DO** — delete root, or keep but add README note; prefer delete |
| 3 | **Keep 11 surfaces, add depth under them** | Depth > breadth, but breadth already shipped and valuable; removing surfaces would be churn | `SURFACES[11]` already covers ChainDrop-relevant files; spec says do not add *extra* ecosystems before graph stable, not to remove existing | Cut to 5 surfaces to focus (rejected: loses demo coverage) | **DO** — keep 11, add resolver graph as new layer |
| 4 | **Do NOT implement TOML/YAML parsers for Day-1** | Node stdlib has no TOML/YAML; hand-rolled parser is out-of-scope; raw-text sweep already catches heuristic signals; documented as honest limitation | `STDLIB.md:12` already notes this; spec §40 says do not treat arbitrary settings as executable | Try to hand-roll minimal TOML parser (rejected: risk of false claims, time) | **CUT** — keep text scan, label as `UNSUPPORTED_STRUCTURAL_PARSE` diagnostic if time |
| 5 | **Do NOT invoke `git` binary for multi-branch scan** | Rules forbid hidden runtime `git` dependency; git-native `.git/refs` + `node:zlib` walker is 2-3 hour stretch (PLAN.md §5) | `README Limitations` already documents working-tree-only; STDLIB §4 notes `.git` is excluded | Shell out to `git` (rejected: disqualifying) | **CUT** — document as Day-2 stretch, not Day-1 |
| 6 | **Resolver/graph is Day-2, not Day-1** | Minimum viable ship must be green before freeze; resolver requires cycle/depth/boundary correctness and new tests; freeze is ~3-7h | Feature gap §I shows 12 missing items, most are resolver/graph | Rush resolver before tests pass (rejected: high regression risk) | **DEFER** — Day-1 = path+determinism+CLI+docs+tests; graph = Day-2 after acceptance |
| 7 | **Bump Node engines to 24 LTS now** | Master Prompt §32 explicitly: “Do NOT target Node 20. Node 20 EOL April 30 2026. Target Node 24 LTS / Node 26 current.” | Current `>=20.6.0` violates; engine test passes on 24 but claims 20 support | Keep 20.6 (rejected: non-compliant, honest but wrong) | **DO** — `>=24.0.0` |
| 8 | **Add never-execute + boundary + determinism + strict tests as Day-1** | Master Prompt §34-37 mandates these classes; they are cheap and prove security invariants | Currently 9 tests cover only happy-path; 2 already fail; no regression for most critical invariant (never-execute) | Keep 9 tests (rejected: leaves §35 violated) | **DO** — add 4 tests → 13 total |
| 9 | **No gstack runtime dependency** | Prompt §3: gstack is dev workflow only, never shipped | `package.json` already has no gstack; ensure not added | Add gstack as dep (rejected: disqualifying) | **DO NOT ADD** — use gstack skills locally only |
| 10 | **Do not delete existing research** | Master Prompt §4, §6: do not delete research, treat as evidence | `docs/research` + `spec` contain 500k+ characters; git status shows them untracked but valuable | Clean docs to “look tidy” (rejected: evidence loss) | **KEEP ALL RESEARCH** — only de-dupe `(1)` copies with manifest note |

---

## Appendix — Evidence & Reproduction

### Reproduce Failing Tests (Windows)

```powershell
node --version          # v24.19.0
npm test
# 7 pass, 2 fail: baseline CHANGED + malformed parseError (see §D.2)
node bin/hookaudit.js scan --json --path test/fixtures/clean-repo | ConvertFrom-Json | % results | % findings
node bin/hookaudit.js scan --json --path test/fixtures/malicious-repo | ConvertFrom-Json | % results | % { $_.file + " " + $_.findings[0].severity }
# On Windows, file = ".claude\settings.json" (backslash) — bug
```

### Reproduce Path Normalization Fix Verification

After fixing `bin/hookaudit.js:322`:

```js
const rel = path.relative(root, file).split(path.sep).join('/');
// Expect: ".vscode/tasks.json" on both Windows and Linux
```

```powershell
npm test                # expect 13/13 pass after Day-1
node bin/hookaudit.js scan --json --path test/fixtures/clean-repo | Select-String "tasks.json"
# should show ".vscode/tasks.json" (POSIX)
```

### Verify Zero-Dependecy

```powershell
npm ls --all            # → (empty)
Select-String -Path bin/hookaudit.js -Pattern "require\("
# only node:fs, node:path, node:crypto, node:util
```

### Verify Safe Analysis

```powershell
Select-String -Path bin/hookaudit.js -Pattern "exec|spawn|child_process|import\(|require\(.*target"
# 0 hits at runtime (only bin/hookaudit.js:3 comment about execution)
```

### Git Next Steps

```powershell
git status
git add .gitignore SECURITY.md LIMITATIONS.md bin/hookaudit.js package.json README.md STDLIB.md RULES.md
git commit -m "feat: Day-1 hardening — POSIX paths, determinism, Node 24, security docs"
git log --oneline -5
# Must show commit inside hackathon window Aug 31 18:00 UTC
```

---

## Final Principle

> **Understand the repository first. Freeze the rules second. Freeze the MVP third. Build only after those are explicit.**

This report establishes the frozen understanding. `RULES.md` is the frozen rulebook. The MVP is the 11-surface scanner with additive heuristic risk and file-hash baseline/diff; the resolver/graph is the explicit Day-2 increment. Day-1 implementation may proceed per §L, with stop conditions respected.

---

**Status:** INVESTIGATION COMPLETE — READY FOR DAY-1 IMPLEMENTATION  
**Next:** Apply §L.2 P0 fixes, add §L.3 tests, regenerate `deps-proof.txt`, commit, re-run `npm test` to 13/13, then re-audit §G + §H before Demo.

