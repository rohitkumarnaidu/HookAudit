# HookAudit Documentation

This directory contains the working source of truth for HookAudit - from product idea through implementation specification to user-facing guides. All claims are reconciled against `bin/hookaudit.js` (2357 lines, SHA256 A3C45D8…) + observed `npm test` 87/87.

## Structure (enterprise, Diataxis)

| Path | Quadrant | Owns | Audience |
|------|----------|------|----------|
| `tutorial-quickstart.md` | Tutorial | Your first scan in 5 minutes - zero to `NEW_CAPABILITY` | Newcomer |
| `howto-scan.md` | How-to | Scan and gate CI (`--json/--sarif/--html/--strict/branches`) | User who knows basics |
| `howto-baseline.md` | How-to | `baseline → diff` trust workflow with `NEW_CAPABILITY` | User who trusts a repo |
| `howto-custom-policy.md` | How-to | `policy.json/yaml/toml` `blockOn/warnOn` | Power user |
| `reference-cli.md` | Reference | Complete CLI, flags, exit codes, JSON/SARIF/HTML shapes | All |
| `reference-surfaces.md` | Reference | Every surface (12), trigger, `field` pointer | Integrator |
| `reference-capabilities.md` | Reference | 11 capabilities, 9 RULES detectors, evidence | Analyst |
| `reference-graph.md` | Reference | Nodes/edges/paths, diagnostics, determinism | Architect |
| `explanation-architecture.md` | Explanation | Why graph-over-grep, adapter principle, zero-dep trade-offs | Architect |
| `explanation-risk.md` | Explanation | Risk ≠ malware, confidence, `HIGH`/`CRITICAL` rules | Analyst |
| `ZERO_DEPENDENCY_WRITEUP.md` | Explanation | 2026 Side Quest: Building a Security Scanner Without a Supply Chain | Architect / Community |
| `FACT_CHECK_AUDIT.md` | Evidence | Zero-trust verification, screenshot catalog, and video storyboard | Auditor / Reviewer |
| `demo/README.md` | Explanation/How-to | Browser adapter, 5 fixtures, recording script, deploy | Reviewer/demoer |
| `research/` | Evidence | 6 canonical research reports + `manifest.md` | Historical |
| `spec/` | Contract | Final technical spec / MVP contract + master prompt (authoritative) | Implementer |
| `archive/` | Archive | Byte-identical duplicates + historical copies (hash-verified) | Audit trail |
| `decisions/` | ADR | Implementation decision records (if any) | Maintainer |

## Authority (zero-trust)

Source-of-truth order: `1 CURRENT SOURCE CODE → 2 CURRENT TESTS + OBSERVED BEHAVIOR → 3 OFFICIAL HACKATHON RULES → 4 CURRENT ECOSYSTEM DOCS → 5 CURRENT SPEC/MVP CONTRACT → 6 RULES.md → 7 README/SECURITY/LIMITATIONS/STDLIB → 8 CURRENT RESEARCH → 9 HISTORICAL AUDITS`. When sources conflict, report `OLD CLAIM / CURRENT IMPLEMENTATION / CORRECT FACT` - never silently merge (see `README.md` “Implementation truth”).

Research is evidence, not runtime truth. No deletions without `Get-FileHash SHA256` verification - see `research/manifest.md`.

## Hygiene (2026-09-01)

- Former `docs/research reports/` (7 duplicates) → `docs/archive/` (hash-verified, 2026-08-31).
- Windows `(1)` suffix duplicates → `docs/archive/`.
- `docs/research/` now holds 6 canonical files + `manifest.md`.
- `docs/spec/` holds 2 authoritative files (no duplicates).
- **New 2026-09-01:** `tutorial-quickstart` + 3 `howto-*` + 4 `reference-*` + 2 `explanation-*` (Diataxis); `README.md` enterprise rebuild with product vs architecture split, 5-step model, Mermaid, and stale-claim reconciliation table; `SECURITY.md` (12 surfaces, zlib, branches) + `STDLIB.md` (12→18) + `LIMITATIONS.md` version bump; all verified against 87 tests.
- Every doc reachable in ≤2 clicks from `README.md` (Documentation map). Broken `](` links checked via `grep`.

## Quick links (≤2 clicks)

- Newcomer: `tutorial-quickstart.md` → `howto-scan.md` → `reference-cli.md`
- CI: `howto-scan.md` → `howto-custom-policy.md` → `reference-cli.md`
- Drift: `howto-baseline.md` → `reference-graph.md`
- Deep dive: `explanation-architecture.md` → `explanation-risk.md` → `reference-capabilities.md`
- Zero-Dep Postmortem: `ZERO_DEPENDENCY_WRITEUP.md` → `FACT_CHECK_AUDIT.md`
