# Zero Dependency 2026 — hookaudit: research summary + ship plan for today

**Read this first:** code freeze is **today, Aug 31 2026, 18:00 UTC / 11:30 PM
IST**. The full 42-section research process in your second document is
built for the *start* of a 3-day event. I've compressed it into what
actually matters for shipping in the hours you have left, and I've
already built and tested a working starter repo (see `hookaudit/`)
rather than just describing one.

---

## 1. The idea

**hookaudit** — a zero-dependency local scanner that flags
auto-executing AI-agent / editor / package-lifecycle hooks (`.claude/`
hooks, `.vscode/tasks.json` auto-run tasks, npm lifecycle scripts, git
hooks, Cursor/Gemini/Codex config), the exact class of file that the
August 2026 **ChainDrop** worm used to get code execution just from a
developer opening a cloned repo — no `npm install` required.

- **Track:** E — Security & Crypto Utilities (the rules literally list
  "local security scanner" and "file integrity tooling" as Track E
  examples).
- **One-liner** (already in `.zero-dep.toml`): *"A zero-dependency
  local scanner that catches auto-executing AI-agent, editor, and
  package-lifecycle hooks — the config-file execution path that
  dependency scanners don't look at."*

## 2. Why this, evidence-first

**The problem is real and dated, not speculative.** On August 4, 2026,
attackers compromised the GitHub account behind the `keyv` npm
package family (`keyv`, `flat-cache`, `cache-manager`, `cacheable`,
`file-entry-cache` — combined over 2 billion monthly installs) and
shipped the ChainDrop worm. Beyond the ordinary `npm install`-time
`preinstall` payload, it committed a `.claude/settings.json`
`SessionStart` hook and a `.vscode/tasks.json` `folderOpen` task into
every reachable branch, each pointing at a script inside *the other*
tool's directory — reported by multiple outlets (The Register,
CSO Online, The Hacker News, Check Point-adjacent coverage, WorkOS,
GBHackers, HiveDro) as a deliberate evasion trick so a reviewer
checking one directory sees a command that looks like it "belongs" to
the other tool. Opening the repo in Claude Code or VS Code was then
enough to execute the payload.

**Existing tools genuinely miss this class of attack.** Security
press covering the incident stated plainly that this technique falls
outside what most dependency scanners look at, since they examine
manifests and lockfiles for downloaded packages, not project-level
editor/agent configuration. Incident responders' actual remediation
advice was manual: open `.claude/settings.json` and
`.vscode/tasks.json` and look for hooks you didn't add — on every
branch, not just `main`.

**It's not a novel vulnerability class either — this is a pattern,
not a one-off.** Separate reporting (OpenSourceMalware.com, Check
Point CVE research on Claude Code's hook system, a "Rafter" blog post
titled "`git clone` Considered Harmful") documents unrelated campaigns
using the identical mechanism against `.vscode/tasks.json`,
`.cursor/rules/*.mdc` (via prompt injection), and `.gemini/settings.json`
— this is a known, recurring technique across multiple AI coding
tools and editors, not something specific to one incident.

**White space:** there is at least one commercial competitor (a
product called "Flight Check" mentioned in the Rafter post) and
several ad hoc shell one-liners circulating (`find . -name
"settings.json" -path "*/.claude/*"`). There is *not* a zero-dependency,
inspectable, offline, open-source CLI that (a) structurally parses the
actual hook commands rather than just checking file existence, (b)
scores them against a named, documented rule set instead of a black
box, and (c) gives you a baseline/diff workflow for every subsequent
pull. That's the wedge.

**Zero-dependency value is real here, not decorative.** A tool whose
entire purpose is "tell me whether I can trust this repository before
I open it in my AI agent" is far more credible with an empty
dependency manifest — you are not asking the user to trust a tool
built on 40 layers of exactly the kind of supply chain it warns them
about.

## 3. Rule compliance quick-check

| Requirement | Status |
|---|---|
| Empty dependency manifest | ✅ `package.json` → `"dependencies": {}` |
| Standard-library only | ✅ `node:fs`, `node:path`, `node:crypto`, `node:util` only |
| No hidden shell-outs | ✅ No `git`/other binary invoked; documented explicitly as a design constraint in README |
| One-command build/run | ✅ `node bin/hookaudit.js --help` — no build step |
| Tests proving core + edge cases | ✅ 9 passing tests, incl. malformed JSON and `node_modules` exclusion |
| README (what/problem/build/run/usage/limitations/design) | ✅ done |
| STDLIB.md (real substitutions) | ✅ 12 entries, includes 2 honest "not implemented" limitations |
| `.zero-dep.toml` | ✅ done |
| Dependency proof | ✅ `deps-proof.txt` (npm ls output) |
| New code only, written during the window | ⚠️ **You must regenerate this repo's git history yourself during the official window** — everything here is a reference implementation for you to adapt/rewrite/commit fresh, not something to submit as-is with my authorship. See §6. |

## 4. What's still missing before you can submit

1. **A public GitHub repo** with an OSI license (MIT is already
   declared in `package.json`; add a `LICENSE` file).
2. **A 5-minute demo video** — script is in §7.
3. **Your own commit history inside the actual hackathon window.** Use
   this repo as a reference/scaffold, not a copy-paste submission —
   re-type or substantially rewrite it yourself so the "new code
   only" rule is unambiguous, and so you can actually defend every
   line to a judge (required either way).
4. Decide how much of §5's "should have" list you have time for.

## 5. Scope: what's already built vs. what's left

**Already built and tested (this is your MUST HAVE, done):**
- `scan`, `baseline`, `diff` commands
- 11 known surfaces (Claude, MCP, VS Code x2, Cursor, Gemini, Codex,
  package.json, Husky, git hooks, pre-commit)
- 5-rule heuristic engine (auto-trigger, network-fetch,
  runtime-bootstrap, cross-reference, obfuscation) with human-readable
  reasons per finding
- JSON + human-readable output, correct exit codes for CI use
- SHA-256 baseline/diff drift detection
- 9 passing tests, two realistic fixture repos (clean + malicious-pattern)
- README, STDLIB.md, `.zero-dep.toml`, deps-proof.txt

**SHOULD HAVE (do these next if you have ~2-4 more hours):**
- `LICENSE` file + push to GitHub, make public
- A short `hookaudit ci` mode / GitHub Actions example showing the
  exit code gating a PR (great demo material, ~20 min of work)
- Tighten the `.gitignore`-aware directory walk beyond the hard-coded
  deny list (documented limitation — even a minimal `.gitignore`
  line-reader, no full spec, would strengthen STDLIB.md)
- A couple more fixture variants: a `.cursor/rules/*.mdc`
  prompt-injection example, a raw git `post-checkout` hook example

**NICE TO HAVE / explicit stretch (cut these first if time runs out):**
- Git-native multi-branch scanning: read `.git/refs/heads/*` +
  `.git/packed-refs`, inflate loose objects with `node:zlib`, walk
  each branch's tree *without shelling out to git*. This is the
  single most impressive thing you could add — it directly answers
  the documented "check every branch, not just main" advice — but it
  is real engineering (git's object format, tree/blob parsing,
  packfile deltas are the hard part and can be skipped/documented as
  a known gap for loose-object-only support). Budget 2-3 hours; only
  attempt if the MUST HAVE list is solid and pushed.
- `Package Killer` bonus: `ignore` (gitignore matcher) is a real,
  meaningfully-downloaded npm package — a documented, honest partial
  reimplementation (support `*`, `**`, directory-only patterns,
  negation; document what's unsupported) would qualify.
- `Single File` bonus: the entire tool is already one file
  (`bin/hookaudit.js`) — you likely already qualify; just make sure
  your test file doesn't count against you (tests are conventionally
  excluded, but confirm in Discord per the rules' own "ask before the
  freeze" note).
- `Reproducible Build` bonus: trivial here since there's no build step
  — `sha256sum bin/hookaudit.js` run twice is byte-identical by
  construction. Cheap bonus, just publish the two hashes.
- `STDLIB Log` bonus: already qualifies — 12 documented substitutions
  in `STDLIB.md`, ≥10 required.

## 6. If you have almost no time left

Minimum viable submission, in priority order:
1. Push `hookaudit/` (rewritten in your own commits) to a public repo
   with an MIT `LICENSE`.
2. Record a 2-3 minute screen capture: run `scan` on the
   malicious-repo fixture, show the CRITICAL cross-reference finding,
   show `npm ls` proving the empty manifest. That alone tells the
   whole story.
3. Confirm `.zero-dep.toml`, `STDLIB.md`, `README.md`, `deps-proof.txt`
   are present — they're the fastest points to lose if forgotten.

## 7. Demo script (aim for 3-4 minutes, doc allows up to 5)

1. **(20s)** One sentence on ChainDrop: Aug 4 2026, keyv compromise,
   2B+ monthly installs, planted hooks that fire just from opening a
   repo in Claude Code or VS Code — no install needed.
2. **(20s)** "Most scanners check your dependency tree. They don't
   check this." Show the WorkOS/Register headline or just say it —
   don't over-explain, judges likely already know the incident.
3. **(60s)** `node bin/hookaudit.js scan --path test/fixtures/malicious-repo`
   — walk through the CRITICAL output live: point at the
   cross-reference line, the runtime-bootstrap line, the obfuscation
   line. Say out loud: "this is a synthetic fixture modeled on the
   real pattern, not live malware."
4. **(20s)** `node bin/hookaudit.js scan --path test/fixtures/clean-repo`
   — show it's not just alarmist; a normal repo gets WARN at most, 0
   CRITICAL.
5. **(30s)** `npm test` — 9 green tests. `cat package.json` — empty
   `dependencies`. `npm ls --all` — empty tree. This is your
   dependency proof, on camera.
6. **(30s)** `hookaudit baseline` then edit a hook file then
   `hookaudit diff` — show `CHANGED` being detected. This is the real
   day-to-day workflow: run once, get warned on every future drift.
7. **(20s)** Close on STDLIB.md for two seconds — "12 real
   substitutions, documented, including what we honestly couldn't
   replace" — this is what Zero-Dependency Craft is scored on.

## 8. Risks / what a skeptical judge will push on

- *"Isn't this just `grep`?"* — No: it structurally parses JSON to
  extract the actual command field per hook trigger (not "does this
  file exist"), scores it against 5 named rules, and adds a
  baseline/diff integrity model grep can't give you. Say this if
  asked.
- *"Why not just use git to check other branches?"* — Because the
  rules explicitly forbid shelling out to installed tools as a hidden
  dependency; that's exactly why it's scoped as a documented
  limitation instead of silently done via `child_process.exec('git
  ...')`.
- *"High false-negative risk"* — acknowledged directly in the README
  Threat Model section; the honest answer is the baseline/diff model,
  not a claim of perfect detection.

## 9. Sources consulted (paraphrased above, not quoted)

- The Register — "ChainDrop worm crawls into npm supply chain, evades
  standard defenses" (Aug 2026)
- CSO Online — "ChainDrop credential stealing worm infects over 400
  npm packages"
- The Hacker News — "Keyv-Linked npm Worm Poisons Hundreds of
  Packages, Plants Claude Code and VS Code Hooks"
- WorkOS blog — "The npm worm that installs itself into your coding
  agent"
- GBHackers — "ChainDrop Publishes Initial Malware Without Stealing a
  Long-Lived npm Token"
- HiveDro / hivepro.com threat advisory on ChainDrop
- Integrity360 threat advisory — "ChainDrop: The Keyv and Cacheable
  npm Supply Chain Attack"
- Rafter blog — "`git clone` Considered Harmful: How Malicious Repos
  Exploit AI Coding Tools" (names the "Flight Check" competing product)
- OpenSourceMalware.com — "Small Open-Source Maintainers Targeted by
  VS Code Tasks Malware" (separate DPRK-linked campaign, same TTP)
- Check Point Research — CVE-2025-59536 / CVE-2026-21852, Claude Code
  hook RCE disclosure timeline
- daily.dev, Scienspire, FastRuby.io, Jamie Lord's blog — additional
  independent coverage of the same incident, cross-checked for
  consistency
- zerodepshack.com and zerodepshack.com/cheatsheets — official rules
  and stdlib capability reference (fetched directly, primary source)
