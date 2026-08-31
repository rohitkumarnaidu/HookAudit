# Zero Dependency 2026 — Deep Research & Winning Idea

**Hackathon:** Zero Dependency 72-Hour Hackathon 2026 · Hackathon Raptors · [zerodepshack.com](https://zerodepshack.com/)
**Window:** Aug 28, 18:00 UTC → Aug 31, 18:00 UTC 2026 · **Prize pool:** $1,800
**Rule source of truth:** official site + `zerodepshack.com/cheatsheets/` (your uploaded rules doc, treated as authoritative). Anything not directly confirmed there is marked **UNVERIFIED**.

---

## 1. Executive Summary

The strongest opportunity isn't a generic dependency scanner — it's a **pre-install trust check that runs before `npm install` ever executes a line of code**, built with zero packages of its own. 2025–2026 gave an unusually rich, well-documented evidence trail for exactly this problem:

- **ChainDrop (Aug 4, 2026):** a self-propagating npm worm compromised the `keyv` maintainer's GitHub account and poisoned 400–868+ packages (2B+ combined monthly downloads) in under 4 hours, shipping with **valid build provenance** because the pipeline itself was compromised — provenance proved origin, not safety.
- **Slopsquatting is confirmed to persist on frontier 2026 models:** an April 2026 replication study found Claude Sonnet 4.6, GPT-5.4-mini, Gemini 2.5 Pro, Haiku 4.5, and DeepSeek V3.2 still hallucinate package names at 4.6–6.1%, with 127 names hallucinated identically across all five models.
- **npm itself just admitted lifecycle scripts were the #1 code-execution surface:** npm v12 (shipped July 2026) blocks `preinstall`/`install`/`postinstall` scripts by default, a direct response to the Axios RAT (Mar 2026) and Shai-Hulud family attacks — but the fix is forward-looking; it doesn't help you *see* the risk in your current manifest, and CI/older environments lag behind it.
- **The alert-fatigue data is damning:** Aikido's 2026 report found 65% of teams bypass or delay fixes due to noise; an npm-developer survey found only 40% are satisfied with existing security tooling, citing false positives as the top barrier.

**The winning project — "Preflight"** — is a zero-dependency CLI that reads a project's `package.json` + `package-lock.json` (no install required) and produces a deterministic, evidence-based trust report covering: nonexistent/typosquat-distance package names (slopsquatting defense), freshly-published versions inside a configurable "cooldown" window (the exact ChainDrop pattern), lifecycle-script surface area (using the lockfile's own `hasInstallScript` field — no tarball execution needed), and manifest/lockfile drift. It never runs `npm install`, never executes third-party code, and its own `dependencies` field is `{}`. That last fact is the whole pitch in one screenshot.

Full research trail, 25 scored candidates, and two runner-up deep dives follow below.

---

## 2. Problem Landscape

| Theme | What the evidence shows | Primary sources |
|---|---|---|
| Supply-chain compromise via trusted maintainers | ChainDrop (Aug 2026), Shai-Hulud 1.0/2.0 (Sep/Nov 2025), Axios RAT (Mar 2026), Mastra (Jun 2026), Miasma (Jun 2026), xz-utils (2024), chalk+debug (Sep 2025), left-pad (2016) | Elastic Security Labs, StepSecurity, OPSWAT, Datadog Security Labs, CrowdStrike, Sonatype |
| AI-generated dependency hallucination (slopsquatting) | 4.6–6.1% hallucination rate persists on 2026 frontier models; 127 names hallucinated identically across 5 models, 53 still unregistered as of Apr 2026; real registered malicious packages already exploiting hallucinated names (`unused-imports`) | arXiv 2605.17062 (Churilov), Socket, CSO Online, Cloud Security Alliance |
| Lifecycle-script code execution at install time | ~2.2% of npm packages use install scripts, but they're the single largest historical attack vector; npm v12 (Jul 2026) now blocks them by default via an allowlist, following pnpm (18 months earlier) and Bun | Semgrep, TechTimes, npm/GitHub advisory, depsguard.com |
| Alert fatigue / tool distrust | 65% of teams bypass/delay fixes due to noise (Aikido 2026); only 40% of npm developers satisfied with current security tooling (academic survey, 75 npm maintainers, 2026) | Aikido State of AI in Security & Development 2026, arXiv 2601.20240 |
| Registry-scale malware volume | 454,600+ new malicious packages catalogued in 2025 alone; cumulative catalogued malicious packages >1.2M | Sonatype 2026 State of the Software Supply Chain |

**Read on this evidence:** the market has moved from "scan for known CVEs" (npm audit, Dependabot) toward "detect fresh/unknown/behavioral risk before it's a CVE" (Socket, StepSecurity, Aikido) — but every one of those newer tools is itself a SaaS product, a paid API, or a scanner you `npm install`, which means using a supply-chain security tool means extending your supply chain. That's the gap.

---

## 3. Emerging Problems (2026-specific, becoming more relevant, not less)

1. **Provenance ≠ safety.** ChainDrop shipped with valid, signed GitHub Actions provenance. Any project whose demo pitch is "we verify provenance" is already behind the threat model.
2. **The industry default just changed underneath everyone.** npm v12's script-blocking-by-default (Jul 2026) means a large population of projects now have an `approve-scripts` allowlist file nobody has audited — a fresh, currently-underserved surface.
3. **Hallucination rates compressed but didn't disappear** across frontier models — meaning the risk is now *cross-model-correlated* (same fake name, multiple AI tools) rather than diffuse, which is a stronger, more attackable signal than before.
4. **"Fresh-publish cooldown" is now a recognized, named defense pattern** (StepSecurity's PR checks), but it lives inside paid CI products, not as something a developer can run locally against any manifest before opening a PR.
5. **Multi-manager reality**: npm, pnpm, and Bun now have three different default security postures for the same ecosystem — a tool that normalizes "what will actually execute on install" across managers is newly valuable.

---

## 4. Developer Pain Map (ranked, strongest first)

| Rank | Pain | Frequency | Cost/Risk | Who feels it |
|---|---|---|---|---|
| 1 | "I don't know what will execute the moment I run install" | Every install | Credential theft, RAT, worm propagation | All JS/TS devs, CI/CD engineers |
| 2 | "My scanner has 40 warnings I've learned to ignore" | Daily/weekly | Real criticals hide in noise | Security eng, platform teams |
| 3 | "AI suggested a package — is it real, and is it *this exact* real one?" | Every AI-assisted session | Slopsquatting, wrong-package installs | AI-assisted devs (majority now) |
| 4 | "This version was published 40 minutes ago and my build already pulled it" | Occasional but catastrophic when it hits | Zero-day supply-chain exposure | CI engineers, platform teams |
| 5 | "I inherited 79 transitive dependencies I never reviewed" | Constant background state | Unbounded attack surface | Solo devs, OSS maintainers |
| 6 | "Local dev networking breaks and I need 4 different CLI tools to find out why" | Weekly | Debugging time | Backend/platform engineers |
| 7 | "My lockfile and manifest disagree and I don't know which one is real" | Occasional | Non-reproducible builds | All teams |
| 8 | "I have no offline-capable way to check any of this in a restricted/air-gapped environment" | Regulated/enterprise/CI-restricted teams | Compliance blockers | Security-conscious enterprises |

---

## 5. Competitive Landscape

| Tool | What it does | Weakness relative to a zero-dep pre-install checker |
|---|---|---|
| `npm audit` | CVE-database diff against installed tree | Post-install only; CVSS-theoretical scoring; widely cited as "broken by design" and a top alert-fatigue driver |
| Dependabot / Renovate | Automated PR bumps + known-CVE alerts | Reactive (after disclosure), not behavioral; doesn't see fresh-publish or script-surface risk |
| Socket.dev / Socket CLI | Behavioral + reputation scoring, SaaS | Requires account/API, itself a package you install, cloud-dependent |
| Aikido Security | Unified scanner platform | SaaS, paid, not a standalone offline binary |
| StepSecurity (GitHub Checks) | PR-level cooldown + compromised-package checks | GitHub Actions only, not a portable local CLI; not something you can run against any manifest pre-PR |
| Snyk | Vuln DB + license scanning | SaaS/paid tiers, heavy CLI with its own dependency tree |
| `@lavamoat/preinstall-always-fail` | Manual dummy-package trick to test if scripts are blocked | One narrow signal, not a report |
| pnpm / npm v12 defaults | Block scripts unless allow-listed | Solves *future* installs; doesn't audit what's already in your allowlist or manifest today |

**The pattern:** every serious competitor either (a) requires you to install more code to check your code, (b) requires a cloud account, or (c) only fires after `npm install` already ran. None combine "zero additional trust surface" with "runs before install" with "offline-capable."

---

## 6. White-Space Opportunities

- A **pre-install** (not post-install) check that a solo developer or a CI job can run against a bare `package.json`/`package-lock.json` with no network account and no new dependency of its own.
- A tool that treats **freshness of a specific resolved version** as a first-class signal, locally, for any manifest — not bundled inside a paid CI product.
- A tool that cross-references **AI-hallucination-shaped naming** (edit-distance to popular names) as a distinct signal from "known malware," since most scanners only match against known-bad lists.
- A tool whose own supply chain is empty — which is the one differentiator no SaaS competitor can copy without abandoning their business model.

---

## 7. Zero-Dependency Opportunity Map (package → stdlib substitution)

| Normally reached for | Provides | Stdlib replacement | Notes |
|---|---|---|---|
| `axios` / `node-fetch` / `got` | HTTP client | global `fetch` (Node ≥18) / `https` module | Used for optional online registry checks |
| `chalk` / `picocolors` / `kleur` | Terminal color | Raw ANSI escape codes | **Package Killer candidate** — chalk was literally the payload vector in the Sept 2025 npm attack |
| `commander` / `yargs` / `minimist` | CLI arg parsing | `util.parseArgs` (Node ≥18) | |
| `semver` | Version range parsing/compare | Hand-written SemVer parser + range satisfier | **Package Killer candidate** — semver sees hundreds of millions of weekly downloads |
| `fast-levenshtein` / `leven` | Edit-distance | ~15-line Levenshtein implementation | Powers typosquat/slopsquat detection |
| `lodash` / `underscore` | Utility functions | Native `Array`/`Object`/`Map` methods | |
| `glob` / `fast-glob` | File walking | `fs.readdirSync` recursive walk (or `fs.globSync`, Node ≥22) | |
| `dotenv` | Env loading | `process.loadEnvFile()` (Node ≥20.6) or 10-line parser | |
| `cli-table3` / `table` | Terminal tables | Manual column-width text renderer | |
| `uuid` | ID generation | `crypto.randomUUID()` | |
| `tar` / `tar-stream` | Tarball reading | `zlib` (stdlib) + minimal hand-written tar reader | Only needed for should-have deep script inspection |
| `ini` / `toml` | Config parsing | Hand-written line parser | For should-have multi-ecosystem support |

12 real, non-trivial substitutions — clears the **STDLIB LOG** bonus bar (10+) on its own.

---

## 8. Problem Inventory (curated, by track)

*(Condensed from 100+ raw candidates researched; each row = problem, who feels it, why current tools fall short, track.)*

### Track A — Developer Tools & CLI
| Problem | Who | Current gap |
|---|---|---|
| No pre-install trust signal for a manifest | All JS devs | Scanners are post-install or cloud |
| "Why is this transitive dependency here" is opaque | OSS maintainers | `npm why` exists but is npm-only, post-install |
| Repo health (stale branches, churn, large blobs) requires GitHub UI or extra tools | Platform teams | No offline `.git`-native tool |
| Lockfile/manifest drift silently breaks reproducibility | All teams | No standalone drift linter |
| Install-time script surface is invisible until it runs | All teams | npm v12 mitigates *future* runs only |

### Track B — Parsers & Data Formats
| Problem | Who | Current gap |
|---|---|---|
| No offline SBOM generator that reads straight from a lockfile | Compliance/security teams | CycloneDX/SPDX tools are heavy, often SaaS-backed |
| Structured-log querying needs `jq` + `grep` chained awkwardly | SRE/backend devs | No single focused tool |
| Markdown docs rot (broken anchors, malformed tables) silently | OSS maintainers | Linters exist but pull in many deps |
| Config format sprawl (JSON/TOML/ENV) has no common AST with position-aware errors | Platform/DX teams | Ad hoc per-format parsing |

### Track C — Web & Network
| Problem | Who | Current gap |
|---|---|---|
| Diagnosing "why can't my service reach X" needs curl+dig+nc+openssl chained | Backend/platform engineers | No single stdlib-only tool |
| API debugging needs an account-based proxy (ngrok, Postman cloud) | Solo/backend devs | Heavy, cloud-tied tooling |
| CI health-check scripts reinvent curl-loop boilerplate every time | DevOps | No focused, portable tool |
| Local demo sharing requires a cloud tunnel account | Solo devs, hackathon teams | ngrok/cloudflared account friction |

### Track D — Data & Storage
| Problem | Who | Current gap |
|---|---|---|
| No local, tamper-evident history of dependency-manifest changes over time | Security/platform teams | Git blame works but isn't purpose-built or queryable |
| Teaching-grade embedded KV store with real crash recovery is rare outside SQLite | Systems learners, small tools | SQLite is the de facto answer, but heavy for tiny local stores |
| Local full-text search over a repo without Elasticsearch | Solo devs | grep doesn't rank/index |
| HTTP response caching for offline dev loops ignores real cache-control semantics | Frontend/backend devs | Ad hoc caching each time |

### Track E — Security & Crypto Utilities
| Problem | Who | Current gap |
|---|---|---|
| Secrets end up in commits despite scanners | All devs | Existing scanners often cloud-upload content |
| Local encrypted secret storage without a SaaS vault | Solo devs, small teams | 1Password/Vault are heavy for a single dev |
| TOTP generation for personal 2FA needs no cloud dependency | Individuals | Most apps are mobile-only or SaaS |
| Verifying a directory tree hasn't been tampered with (build artifacts, cert files) | Security-conscious teams | tripwire/AIDE are heavy, OS-package installs |

### Track F — Open / Wildcard
| Problem | Who | Current gap |
|---|---|---|
| Learning how interpreters/VMs work has few from-scratch, runnable examples | Students, educators | Most teaching VMs pull dependencies |
| Compression is treated as a black box (`zlib` wraps it, nobody reimplements it) | Systems learners | Rare to see a real from-scratch DEFLATE |
| Local cron replacement with dependency-aware DAG scheduling has no small stdlib tool | Solo devs/homelab | Most schedulers are full frameworks |

---

## 9. Candidate Ideas — Scored (25)

Scored 1–10 on Problem severity (**PS**), Uniqueness (**U**), Zero-dep feasibility (**ZD**), 72-hour feasibility (**72h**), Demo strength (**DS**), Adoption potential (**AP**). Overall = weighted per §17 formula (Problem 12%, Uniqueness 12%, ZD-feasibility 12%, 72h 8%, Demo 8%, Adoption 5%, remaining categories folded into a qualitative track-fit/innovation adjustment of ±0.5).

| # | Idea | Track | PS | U | ZD | 72h | DS | AP | Overall |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Preflight** — pre-install manifest/lockfile trust checker | A | 9 | 8 | 9 | 8 | 9 | 8 | **8.6** |
| 2 | **LockWatch** — tamper-evident dependency-change timeline store | D | 7 | 8 | 8 | 6 | 6 | 6 | 7.0 |
| 3 | **Probe** — unified local network diagnostic | C | 6 | 5 | 9 | 8 | 8 | 7 | 6.9 |
| 4 | **Sniffout** — local secrets-in-code scanner, no cloud upload | E | 8 | 6 | 8 | 7 | 7 | 7 | 7.2 |
| 5 | **WhyDep** — offline "why is this dependency here" + unused finder | A | 6 | 5 | 8 | 7 | 6 | 6 | 6.3 |
| 6 | **SBOMLite** — from-scratch CycloneDX/SPDX-lite from lockfiles | B | 7 | 6 | 8 | 6 | 6 | 6 | 6.6 |
| 7 | **VaultLite** — local encrypted secrets store (stdlib AES-GCM/PBKDF2) | E | 6 | 5 | 7 | 7 | 7 | 6 | 6.3 |
| 8 | **EmbedKV** — WAL-based embedded KV store, crash recovery | D | 5 | 5 | 8 | 5 | 5 | 5 | 5.5 |
| 9 | **LoopProxy** — local HTTP request/response inspector | C | 5 | 4 | 7 | 6 | 7 | 6 | 5.7 |
| 10 | **LogLens** — structured-log query language/parser | B | 5 | 5 | 8 | 6 | 6 | 6 | 5.9 |
| 11 | Driftline — CI bot failing PRs on manifest/lockfile drift | A | 6 | 5 | 8 | 6 | 5 | 5 | 5.8 |
| 12 | Reposcope — local repo health scanner via raw `.git/` parsing | A | 5 | 5 | 6 | 5 | 6 | 5 | 5.3 |
| 13 | MiniConf — unified JSON/TOML/ENV parser with position-aware errors | B | 4 | 5 | 8 | 6 | 5 | 4 | 5.1 |
| 14 | MDCheck — Markdown docs linter (links/tables/headings) | B | 4 | 4 | 8 | 7 | 5 | 4 | 4.9 |
| 15 | Beacon — stdlib service health-check runner | C | 4 | 3 | 8 | 7 | 4 | 5 | 4.8 |
| 16 | Tunnel0 — offline-first LAN service exposer | C | 4 | 5 | 6 | 5 | 6 | 4 | 4.9 |
| 17 | GrepIndex — local full-text search index (inverted index) | D | 5 | 5 | 7 | 5 | 5 | 5 | 5.2 |
| 18 | CacheJar — local HTTP cache honoring real cache-control semantics | D | 4 | 4 | 8 | 6 | 4 | 4 | 4.7 |
| 19 | TOTPke — minimal TOTP/2FA generator | E | 4 | 3 | 9 | 8 | 6 | 5 | 5.1 |
| 20 | Integrity — directory tree tamper-check tool (tripwire-lite) | E | 5 | 4 | 8 | 6 | 5 | 4 | 5.0 |
| 21 | TinyVM — small bytecode interpreter/VM (teaching) | F | 3 | 6 | 9 | 5 | 6 | 3 | 4.7 |
| 22 | GzipCraft — from-scratch DEFLATE/gzip | F | 3 | 6 | 7 | 4 | 5 | 3 | 4.2 |
| 23 | Schedulr — local cron w/ dependency-aware DAG execution | F | 4 | 4 | 8 | 5 | 5 | 4 | 4.6 |
| 24 | ReplTUI — raw-ANSI terminal UI toolkit demo | F | 3 | 3 | 8 | 5 | 5 | 3 | 3.9 |
| 25 | Scriptwatch — real-time install-time syscall/file auditor | A | 6 | 6 | 4 | 3 | 6 | 5 | 4.6 *(rejected: too OS-dependent/RED for 72h)* |

---

## 10. Top 10

| Rank | Idea | Track | Gap it exploits | Why Zero Dependency matters here | Overall |
|---|---|---|---|---|---|
| 1 | **Preflight** | A | Pre-install trust signal nobody offers offline & account-free | The checker itself must be trustworthy — an empty manifest *is* the credibility | 8.6 |
| 2 | **Sniffout** | E | Cloud-upload-free secrets scanning | Secrets shouldn't leave the machine to be checked for leaks — irony of a cloud secrets scanner | 7.2 |
| 3 | **LockWatch** | D | No queryable, tamper-evident manifest-change history | Local, append-only store needs no external DB engine | 7.0 |
| 4 | **Probe** | C | Diagnostic tool sprawl (curl+dig+nc+openssl) | One static binary replaces a 4-tool chain in restricted environments | 6.9 |
| 5 | **SBOMLite** | B | SBOM tools are heavy/SaaS-backed | Generating a security artifact with a security-relevant empty manifest is a strong story | 6.6 |
| 6 | **WhyDep** | A | `npm why` is npm-only, post-install | Offline dependency-graph reasoning needs no runtime lookup | 6.3 |
| 7 | **VaultLite** | E | 1Password/Vault too heavy for solo devs | A secrets tool with third-party runtime deps is a contradiction in terms | 6.3 |
| 8 | **LogLens** | B | grep+jq chaining is clunky | Log parsing is inherently a stdlib-string-processing problem | 5.9 |
| 9 | **Driftline** | A | No standalone lockfile-drift linter | CI-safe, no external tool shellouts | 5.8 |
| 10 | **LoopProxy** | C | ngrok/Postman cloud-tied debugging | Local-only inspection keeps traffic on-machine | 5.7 |

---

## 11. Top 3 Deep Dives

### 11.1 Preflight — Track A (WINNER — full spec in §12–19)

### 11.2 LockWatch — Track D (runner-up)

**Problem:** Teams have no queryable, tamper-evident record of *when* a dependency first appeared, was bumped, downgraded, or removed — that history exists only as scattered `git log` noise across `package.json`/`package-lock.json`. When an incident like ChainDrop hits, the first question is "which of our repos ever resolved a poisoned version, and when did it enter?" — and today that's a manual `git log -p` archaeology exercise per repo.

**Users:** security/platform teams doing incident response, OSS maintainers auditing their own history.

**Existing solutions:** GitHub's dependency graph (cloud, GitHub-only, no local query), plain `git log`, Socket's timeline features (SaaS).

**Unique solution:** a local, single-file, append-only log-structured store (WAL + simple B-tree-ish index, written from scratch) that ingests a repo's git history for manifest/lockfile files and lets you run point-in-time and range queries: `lockwatch when keyv` → every commit where `keyv`'s resolved version changed, with before/after diff and the exact timestamp — entirely offline, no `git` shell-out (reads `.git/` objects directly via zlib inflate, which is why it's Track D *and* a serious "difficult part" for judges).

**Why it lost to Preflight:** weaker demoability (a 3-minute demo of "here's history" is less visceral than "here's a live threat caught right now"), and its core engineering — a WAL/B-tree from scratch — carries real crash-recovery edge-case risk inside a 72-hour box (higher YELLOW/RED surface than Preflight's mostly-GREEN JSON/HTTP work).

### 11.3 Probe — Track C (third)

**Problem:** diagnosing "why can't my service reach X" normally means chaining `curl`, `dig`, `nc`, `openssl s_client`, and `traceroute` by hand, especially painful in restricted/air-gapped CI or locked-down corporate laptops where installing more tools isn't an option.

**Users:** backend/platform engineers, on-call SREs, anyone in a locked-down environment.

**Existing solutions:** `httpie`, `dog`, `gping` — each solves one slice; no single stdlib-only, zero-install binary that chains DNS → TCP → TLS → HTTP in one report.

**Unique solution:** one binary, one command (`probe example.com:443`) that walks the full connection path (DNS resolution → TCP handshake timing → TLS handshake + cert chain inspection → HTTP response) using only `net`, `crypto/tls`-equivalent stdlib, and reports exactly where it failed.

**Why it lost to Preflight:** genuinely useful, very GREEN on feasibility, but the market is more crowded (several credible existing CLI alternatives) and the evidence base for "acute, costly, frequently-complained-about pain" is weaker than the supply-chain evidence trail behind Preflight — it scores as a good utility, not a "this just disappeared a real, documented, dated incident" story.

---

## 12. Final Winner

# Preflight
**One-line pitch:** A zero-dependency CLI that tells you whether your `package.json` can be trusted — before `npm install` runs a single line of code.

**One-sentence problem:** Developers (and their AI assistants) add dependencies faster than they can verify them, and every existing verification tool either runs *after* the risky install already happened or requires you to trust a new cloud account or package to check the ones you already have.

**Target users:** solo developers, OSS maintainers, CI/platform engineers, AI-assisted developers reviewing agent-proposed dependency changes.

**Why now:** ChainDrop (Aug 2026) proved provenance-signed packages can still be malicious within hours of publish; npm v12 (Jul 2026) just admitted lifecycle scripts were the top attack surface; frontier-model slopsquatting is confirmed to persist into 2026's newest models — three independent, dated 2026 data points converging on the same gap.

**Why existing tools fail:** post-install timing (npm audit, Dependabot), cloud/account requirement (Socket, Aikido, Snyk), CI-platform lock-in (StepSecurity), or narrow single-signal scope (`preinstall-always-fail`).

**Unique wedge:** the only check of its kind that is simultaneously (a) pre-install, (b) offline-capable, (c) account-free, and (d) has an empty dependency manifest itself — so using it to reduce your supply-chain exposure doesn't increase it.

**Track:** A — Developer Tools & CLI (dependency analysis is explicitly listed under Track A's scope; the project is a CLI/analysis tool, not a crypto primitive, so it fits A cleaner than E).

---

## 13. Why This Idea — Evidence-Backed Justification

| Judge question (§42 filter) | Answer |
|---|---|
| Would a real developer use this? | Yes — it's a `npx`-able one-shot check that fits directly into an existing `npm install` habit and a CI gate |
| Is the pain strong enough to change behavior? | Yes — three dated, named 2026 incidents (ChainDrop, Axios RAT, Miasma) show the cost is credential theft/RAT/worm propagation, not a hypothetical |
| Is the existing solution genuinely inadequate? | Yes — every capable competitor is SaaS, requires an account, or only fires post-install |
| Is the wedge genuinely different? | Yes — pre-install + offline + zero-trust-surface-of-its-own is not simultaneously offered anywhere researched |
| Is zero dependency a real benefit, not a stunt? | Yes — the entire pitch is "a supply-chain tool that doesn't add to your supply chain"; an empty manifest is the security claim |
| Buildable in 72 hours? | Yes — nearly all required capability (JSON parsing, HTTPS GET, string diffing) is GREEN-rated stdlib work |
| Provable? | Yes — `hasInstallScript` is a real, documented `package-lock.json` field (confirmed against npm's own docs); registry existence/publish-date checks hit a public, unauthenticated JSON API |
| Memorable to a judge? | Yes — "type `cat package.json`, see `dependencies: {}`, then watch it catch a fake package name in 200ms" is a strong, concrete demo beat |

---

## 14. Architecture

```
Input                         Core processing                    Output
─────                         ───────────────                    ──────
package.json         ──┐
package-lock.json     ─┼──▶  Manifest/Lockfile Parser  ──▶  Dependency Graph (in-memory)
(read-only, local)     │            │
                        │            ▼
optional: registry.npmjs.org ──▶  Signal Engine:
  (stdlib https/fetch,        ┌─ Existence check (does name resolve on registry?)
   read-only GET only,        ├─ Edit-distance vs. offline top-N corpus (slopsquat heuristic)
   never writes/publishes)    ├─ Publish-freshness vs. cooldown window
                              ├─ hasInstallScript surface vs. allowlist
                              └─ Manifest⇄lockfile drift / semver-range satisfaction
                                        │
                                        ▼
                              Findings[] { package, severity, code, message, evidence }
                                        │
                                        ▼
                              Deterministic scorer  ──▶  Report {score, findings, summary}
                                                              │
                                                    ┌─────────┴─────────┐
                                                    ▼                   ▼
                                          Human report (ANSI)   Machine report (JSON)
                                          to stdout              for CI (--json, --fail-on)
```

**Standard-library modules used (Node.js, ≥20):**
`node:fs` / `node:fs/promises` (read manifest/lockfile), `node:https` + global `fetch` (registry lookups), `node:crypto` (hashing/UUIDs if needed), `node:util` (`parseArgs` for CLI flags), `node:path`, `node:zlib` (only if should-have tarball inspection is reached), `node:test` + `node:assert` (test runner).

**Data model**
```ts
ManifestEntry  { name, versionRange, direct: boolean }
LockEntry      { name, version, resolved, integrity, hasInstallScript, dependencies: string[] }
RegistryInfo   { exists: boolean, publishedAt?: Date, latestVersions?: string[] }
Finding        { pkg, severity: "CRITICAL"|"WARN"|"INFO"|"OK", code, message, evidence }
Report         { projectPath, generatedAt, findings: Finding[], score, summary }
```

**Persistence:** none required for MVP (stateless per-run); should-have `--diff` mode persists the previous report as a flat JSON file in `.preflight/last-report.json` for before/after CI comparisons — plain `fs.writeFile`, no database.

**Error handling:** missing lockfile → warn and degrade to manifest-only heuristic mode; registry unreachable → automatically fall back to `--offline` corpus-only mode (never hard-fail the whole run on a network blip — this is a security tool, it must degrade gracefully, not become another CI flake source).

**Concurrency:** registry lookups batched with a small worker pool (`Promise.all` in chunks) to keep a large dependency tree fast without hammering the registry — no external HTTP client needed for this, `fetch` handles it natively.

**Security boundary:** Preflight **never executes any code from the analyzed project** and **never runs `npm install`**. It only reads local text files and issues read-only HTTPS GETs to a public registry API. This is a design invariant worth stating explicitly in the README — the tool cannot itself become an attack vector the way an installed scanner package could.

---

## 15. 72-Hour Build Strategy

**Day 1 — Skeleton + core path**
- Repo scaffold, `.zero-dep.toml`, empty `package.json`
- `package.json`/`package-lock.json` parser → in-memory dependency graph
- CLI shell (`util.parseArgs`): `preflight audit [path] [--offline] [--json] [--cooldown=Nh] [--fail-on=level]`
- First end-to-end path: parse → trivial "package count" report → exit code

**Day 2 — Signal engine + persistence**
- Hand-written SemVer parser/range-satisfier (Package Killer #1)
- Hand-written Levenshtein + bundled offline top-N popular-package-name corpus (JSON snapshot)
- Registry existence + publish-date check via `fetch` (batched, with offline fallback)
- `hasInstallScript` extraction + curated native-build allowlist (esbuild, sharp, node-gyp, sqlite3, playwright, puppeteer, etc.)
- Manifest⇄lockfile drift detector
- Deterministic scorer + `Finding[]` aggregation
- `node:test` unit tests for each detector (edge cases: scoped packages `@org/name`, pre-release versions, missing lockfile, malformed JSON)

**Day 3 — Hardening, proof, polish**
- ANSI-colorized human report (Package Killer #2: chalk replacement) + JSON report writer
- `--diff` should-have (cut if behind schedule)
- Dependency proof: `deps-proof.txt` (`cat package.json`, `npm ls --all` on an empty manifest, `find . -name node_modules`)
- Reproducible-build bonus: two clean `git archive` builds, `sha256sum` both, publish both hashes (near-free since there's no bundler/minifier step)
- README.md, STDLIB.md (12+ substitutions), `.zero-dep.toml`
- 5-minute demo recording
- Optional single-file bundle via `cat` concatenation (own code only) for the Single-File bonus, attempted only after everything above is solid

**Cuttable without losing the core value proposition:** `--diff` mode, multi-manager (pnpm/Bun) lockfile support, second-ecosystem (PyPI) support, single-file bundling. The MVP (manifest parse + registry existence + freshness + script-surface + drift, human + JSON report, tests, docs, dependency proof) stands alone as a genuinely useful, demoable, judgeable submission even if every "should/nice-have" is cut.

---

## 16. Demo Strategy (5-minute script)

| Time | Beat |
|---|---|
| 0:00–0:30 | Hook: state the ChainDrop numbers (868 packages, 2B+ downloads, valid provenance, under 4 hours) — "npm audit wouldn't have caught this; nothing was a known CVE yet." |
| 0:30–1:15 | `cat package.json` on Preflight itself → `"dependencies": {}`. Run `preflight audit .` on itself — clean report, few seconds. |
| 1:15–2:30 | Run against a prepared demo repo containing: a name one edit-distance from a top-package (simulated slopsquat), a dependency pinned to a version "published" inside the cooldown window, and a package with `hasInstallScript: true` outside the allowlist. Show the colorized CRITICAL/WARN/INFO report with reasons and evidence for each. |
| 2:30–3:15 | `preflight audit --json --fail-on=critical` piped into a mock CI step; show non-zero exit code. |
| 3:15–4:00 | Flip to STDLIB.md, walk through 3–4 substitutions live (chalk, semver, levenshtein, fetch). |
| 4:00–4:45 | Dependency proof on camera: `npm ls`, `find . -name node_modules`, reproducible-build hash comparison. |
| 4:45–5:00 | Close line: "Preflight doesn't ask you to trust a new package to check whether you should trust the ones you already have." |

---

## 17. Rule Compliance

| Requirement (official rules doc) | How Preflight satisfies it |
|---|---|
| Empty dependency manifest | `package.json` → `"dependencies": {}`, verifiable on sight |
| Standard library only | Node.js built-ins only: `fs`, `https`/`fetch`, `util`, `crypto`, `path`, `zlib`, `node:test` |
| No vendoring | All parsing/scoring code written during the window; disclosed substitutions in STDLIB.md, not copied source |
| No hidden external tool calls | Never shells out to `npm`, `git`, or any external binary; reads `.git`/lockfile files directly if extended, never invokes them |
| New code only | All implementation written inside the 72-hour window; pre-kickoff work limited to this research/spec |
| One-command build | `node preflight.js` (or a thin shell wrapper) — no compile step needed for plain JS |
| Dependency proof | `deps-proof.txt` with `cat package.json`, `npm ls --all`, `find . -name node_modules` output |
| README.md / STDLIB.md / tests / demo / `.zero-dep.toml` | All produced Day 3, per build plan above |
| Track fit | Track A — "dependency analysis," "local project analysis," "AI-assisted coding workflows" are explicitly in-scope for Track A |

---

## 18. Bonus Strategy

| Bonus | Plan | Confidence |
|---|---|---|
| **STDLIB LOG (+3)** | 12+ real substitutions documented with one-line rationale each (§7) | High — nearly free given the tech choice |
| **PACKAGE KILLER (+3)** | Reimplement `semver` (range parsing/satisfaction) and `chalk` (ANSI coloring) — both real, high-download packages; chalk doubles as a callback to the Sept 2025 incident in the org's own incident log | High |
| **REPRODUCIBLE BUILD (+5)** | No bundler/minifier step means two `git archive` builds are byte-identical by construction; just need to publish both SHA-256 hashes | High — nearly free |
| **SINGLE FILE (+5)** | Attempt only after MUST/SHOULD-haves are done: `cat src/*.js > dist/preflight.single.js` (own code only, no bundler) | Medium — Day-3 stretch, cleanly cuttable |

Realistic best case: all four bonuses (+16) on top of a placement prize, achieved largely as natural byproducts of the "plain Node.js, no bundler" architecture rather than extra scope.

---

## 19. Risks

| Risk | Type | Mitigation |
|---|---|---|
| Live registry calls could rate-limit or flake during the judged demo | Technical | Primary demo path runs `--offline` against a prepared fixture; live registry check is a secondary "bonus" beat, not load-bearing |
| Judges see it as "just another dependency scanner" | Product/judging | Lead with the specific, dated, narrow wedge (pre-install + fresh-publish cooldown + zero-trust-surface-of-its-own), not a generic vuln-scan pitch |
| False positives on legitimate native-build packages (esbuild, sharp, node-gyp) | Security/usability | Curated allowlist + explicit `.preflight-allow` override, documented and honest about the trade-off (per the hackathon's own "honesty rule") |
| Track ambiguity (A vs. E) | Judging | README explicitly states the Track A rationale (dependency analysis / CLI tool, not a crypto primitive) |
| "Is a stdlib HTTP call to a public registry a hidden dependency?" | Rule compliance | It is not — Track C explicitly sanctions stdlib networking; the registry is a public, unauthenticated, read-only API, not an installed external tool |
| Scope creep into multi-ecosystem (PyPI, Go) support inside 72 hours | 72h feasibility | Explicitly cuttable per the build plan; MVP is npm-only and still stands alone |
| Offline corpus for slopsquat heuristic goes stale | Product | Ship a `preflight update-corpus` online-optional command; document as a known limitation, not hidden |

---

## 20. Research Sources

**Official hackathon sources**
- Zero Dependency 2026 — official site: https://zerodepshack.com/
- DEV Community announcement (Hackathon Raptors): https://dev.to/raptorsdev/zero-dependency-2026-build-real-software-with-no-packages-prove-it-hnc
- Your uploaded rules doc + deep-research master prompt (treated as authoritative for rules/tracks/timeline)

**Supply-chain incident evidence**
- Elastic Security Labs — ChainDrop / Shai-Hulud: https://www.elastic.co/security-labs/shai-hulud-chaindrop-npm-supply-chain
- StepSecurity — ChainDrop technical analysis: https://www.stepsecurity.io/blog/chaindrop-npm-worm
- OPSWAT — ChainDrop overview: https://www.opswat.com/blog/shai-hulud-returns-chaindrop-worm-hits-npm-infecting-hundreds-of-packages
- Infosecurity Magazine — ChainDrop scale: https://www.infosecurity-magazine.com/news/chaindrop-worm-400-npm-two-billion/
- Integrity360 — ChainDrop deep dive: https://insights.integrity360.com/threat-advisories/chaindrop-the-keyv-and-cacheable-npm-supply-chain-attack
- BleepingComputer — ChainDrop coverage: https://www.bleepingcomputer.com/news/security/massive-chaindrop-npm-supply-chain-attack-infects-hundreds-of-packages/
- Semgrep — npm v12 kills postinstall-by-default: https://semgrep.dev/blog/2026/rip-npm-postinstall-scripts-npm-v12-default-change/
- TechTimes — npm v12 ships, blocks install scripts: https://www.techtimes.com/articles/319890/20260708/npm-v12-ships-this-month-blocking-install-scripts-that-enabled-year-supply-chain-attacks.htm
- The Hacker News — GitHub disabling npm install scripts by default: https://thehackernews.com/2026/06/github-to-disable-npm-install-scripts.html
- OpenReplay — a simple defense against npm supply-chain attacks: https://blog.openreplay.com/npm-supply-chain-defense/

**Slopsquatting / AI package hallucination**
- Socket — 53 slopsquatting targets across 5 frontier LLMs: https://socket.dev/blog/slopsquatting-targets-across-frontier-llms
- arXiv 2605.17062 — "The Range Shrinks, the Threat Remains" (Churilov, 2026): https://arxiv.org/abs/2605.17062
- CSO Online — top AIs invent same fake package names: https://www.csoonline.com/article/4201164/top-ais-invent-same-fake-pypl-and-npm-package-names-2.html
- Cloud Security Alliance — slopsquatting research note: https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/
- Wikipedia — Slopsquatting: https://en.wikipedia.org/wiki/Slopsquatting

**Tooling pain / alert fatigue**
- Aikido Security — npm audit guide / State of AI in Security & Development 2026: https://www.aikido.dev/blog/npm-audit-guide
- PkgPulse — Why npm audit is broken: https://www.pkgpulse.com/guides/why-npm-audit-is-broken
- arXiv 2601.20240 — "Understanding npm Developers' Practices, Challenges, and Recommendations for Secure Package Development": https://arxiv.org/html/2601.20240v1

**Technical reference**
- npm `package-lock.json` manual (`hasInstallScript` field): https://manpages.ubuntu.com/manpages/resolute/man5/package-lock-json.5.html

---

*Report generated for the Zero Dependency 72-Hour Hackathon 2026 (Aug 28–31, 2026). Where a claim could not be traced to a source above, it is framed as reasoned synthesis, not fact.*
