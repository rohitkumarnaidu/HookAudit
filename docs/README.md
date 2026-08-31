# HookAudit Documentation

This directory contains the research and implementation specifications used as the working source of truth for HookAudit.

## Structure

- `research/` — canonical research reports, threat analysis, competitive analysis, methodology, zero-dep 2026 research (6 files, `manifest.md` indexes provenance). Duplicates moved to `archive/`.
- `spec/` — final technical specification/MVP contract + master prompt (authoritative for implementation).
- `archive/` — byte-identical duplicates + historical copies (hash-verified, not canonical). See `archive/README.md`.
- `decisions/` — implementation decision records (ADR-style, if any).

## Authority

For implementation decisions, prefer the latest validated technical specification in `spec/` (70000+ B MVP contract). For ecosystem/security facts that may change over time, re-verify against current primary documentation before turning them into README claims or implementation assumptions.

Research is evidence, not runtime truth. No deletions without `Get-FileHash SHA256` verification — see `research/manifest.md`.

## Hygiene (2026-08-31)

- Former `docs/research reports/` (7 duplicates) → `docs/archive/` (hash-verified).
- Windows `(1)` suffix duplicates → `docs/archive/`.
- `docs/research/` now holds 6 canonical files + `manifest.md`.
- `docs/spec/` holds 2 authoritative files (no duplicates).
