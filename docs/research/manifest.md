# HookAudit Research Manifest

**Purpose:** Canonical index for research provenance — what is source-of-truth, what is archived duplicate.

**Classification per Master Prompt §6:** `canonical` = active truth, `duplicate` = byte-identical copy moved to `docs/archive/`, `historical` = prior candidate research kept for audit trail, `archive candidate` = duplicated files awaiting move.

## Canonical (active)

| File | SHA256 (prefix) | Purpose | Status |
|---|---|---|---|
| `From Blind Spot to Audit Trail_ Securing the Modern Development Supply Chain with HookAudit.md` | 41B7CE98 | Threat + SBOM + trust narrative | canonical |
| `From SBOM Generation to Trust_ Architecting a Zero-Dependency Integrity Verifier for Supply Chain Security.md` | — | SBOM-to-trust architecture | canonical |
| `HookAudit_ Architecting a Zero-Dependency Defense Against the New Attack Surface of AI-Powered Development Environments.md` | E8B9B53D | AI-powered dev environments defense | canonical |
| `Mapping the Attack Surface_ A Zero-Dependency Strategy for Auditing Automatic Execution in Development Repositories.md` | 5798D9FE | Attack surface mapping | canonical |
| `The Anatomy of a Comprehensive Study_ A Methodological Guide to End-to-End Real-World Research.md` | — | Methodology guide | canonical |
| `zero-dependency-2026-research.md` | — | Zero-dep 2026 research corpus | canonical |

**Note:** Two files with Windows `(1)` suffix were byte-identical duplicates of `HookAudit_Complete_End_to_End_Final_Research.md` (`5B2D1475`) and `HookAudit_Complete_End_to_End_Research.md` (`D3A4F829`) — moved to `docs/archive/` 2026-08-31. No unique info lost (verified via `Get-FileHash SHA256`).

## Archive

`docs/archive/` contains 9 byte-identical duplicates from former `docs/research reports/` (research + spec copies) and the two `(1)` files. All hashes verified identical to canonical copies before move. See `docs/archive/README.md`.

## Spec Authority

`docs/spec/` holds MVP contract (70736 B, `1A5F40A9`) + Master Prompt (50900 B). These are authoritative over research for implementation decisions. Research is evidence, not runtime truth.

## Decisions

Archived decisions (if any) go to `docs/decisions/`. No deletions without hash verification.

## Verification

```powershell
Get-FileHash -Algorithm SHA256 docs/research/*.md
Get-FileHash -Algorithm SHA256 docs/archive/*.md
Get-FileHash -Algorithm SHA256 docs/spec/*.md
# Duplicates must show identical hashes before any deletion
```
