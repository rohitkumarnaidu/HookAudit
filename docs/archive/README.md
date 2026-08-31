# HookAudit Archive

**Purpose:** Holds byte-identical duplicates and historical research copies that are NOT canonical, to keep `docs/research/` and `docs/spec/` clean while preserving audit trail per Master Prompt §6.

**Policy:** Do not delete without first verifying `Get-FileHash SHA256` shows identical content to canonical copy. No unique information is lost by archiving — all moves were hash-verified 2026-08-31.

## Contents (2026-08-31)

All files below are duplicates of canonical files elsewhere:

| Archived File | Duplicate Of | Canonical Location | SHA256 prefix |
|---|---|---|---|
| `From Blind Spot to Audit Trail_ Securing the Modern Development Supply Chain with HookAudit.md` | same name | `docs/research/` | 41B7CE98 |
| `HookAudit_ Architecting a Zero-Dependency Defense...` | same name | `docs/research/` | E8B9B53D |
| `HookAudit_Complete_End_to_End_Final_Research.md` | `HookAudit_Complete_End_to_End_Final_Research(1).md` | `docs/research/` (original without `(1)` now archived, canonical removed? — see manifest) | 5B2D1475 |
| `HookAudit_Complete_End_to_End_Final_Research(1).md` | above | `docs/research/` | 5B2D1475 |
| `HookAudit_Complete_End_to_End_Research.md` | `HookAudit_Complete_End_to_End_Research(1).md` | `docs/research/` | D3A4F829 |
| `HookAudit_Complete_End_to_End_Research(1).md` | above | `docs/research/` | D3A4F829 |
| `Mapping the Attack Surface_ ...` | same name | `docs/research/` | 5798D9FE |
| `HookAudit_Final_Technical_Specification_MVP_Contract.md` | spec | `docs/spec/` | 1A5F40A9 |
| `HookAudit_Final_Technical_Specification_MVP_Contract_Master_Prompt.md` | spec | `docs/spec/` | — |

**Former location:** `docs/research reports/` (now removed, empty after move). All 7 files there were duplicates.

**To restore:** Copy back to `docs/research/` or `docs/spec/` if needed, but canonical copies already exist there.

**Do not confuse with `docs/decisions/`** — which holds implementation decision records, not research duplicates.
