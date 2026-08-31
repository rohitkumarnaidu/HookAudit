# HookAudit — Git Multi-Branch Walker Patch Design

> **Status:** Design-only. Do NOT edit `bin/hookaudit.js` directly.
> **Requirement:** §48–56 (MVP spec: offline multi-branch walk, zero-dep, no `git` exec, `node:zlib` inflate, `commit→tree→blob`, branch compare). Authority: `RULES.md > SPEC §48-56 > STDLIB.md`.
> **Scope:** Add `hookaudit branches` / `hookaudit git-branches` that audits **committed** execution surfaces per branch and diffs them. Does not change `scan`/`baseline`/`diff` working-tree semantics.
> **Zero-dep delta:** `+ node:zlib` (built-in, already allowed per `RULES.md §4` `node:zlib` is standard-library; add row 13 to `STDLIB.md`). No new runtime deps, no `child_process`, no `git` binary.

---

## 1. Live `.git` Inspection (2026-08-31, `C:\Hackathons\HookAudit\.git`)

This is what the design is built against — not a guess.

```
HEAD          : 72 65 66 3A 20 72 65 66 73 2F 68 65 61 64 73 2F 6D 61 73 74 65 72 0A
              → ASCII "ref: refs/heads/master\n" (symbolic ref, LF-terminated)
              → No detached HEAD case live, but design must handle `^[0-9a-f]{40}\n?$`

config        : [core] repositoryformatversion 0, filemode false, bare false,
              logallrefupdates true, symlinks false, ignorecase true
              [remote "origin"] url https://github.com/rohitkumarnaidu/HookAudit.git
              fetch = +refs/heads/*:refs/remotes/origin/*
              [branch "master"] remote origin / merge refs/heads/master

refs/heads/   : master → 829e55074c8ff773a3556a6c673e585be207fa3e (41 bytes, \n-terminated)
refs/remotes/ : origin/master → 829e55074c8ff773a3556a6c673e585be207fa3e (mirror; see §3.4)
refs/tags/    : empty

packed-refs   : ABSENT (Test-Path → False). All refs are loose.
              → After `git gc`/`git pack-refs` this file appears; walker must handle both.

objects/      : 111 loose objects under objects/xx/yyyy... (no packfiles live — no objects/pack/*.pack)
              → Verified inflate: compressed 792 B → inflated 1250 B via node:zlib.inflateSync
              → Commit header: "commit 1238\x00" + body → tree/parent/author/committer/gpgsig/message
              → Tree header: "tree 703\x00" → binary entries (see §5)
              → Blob header: "blob 437\x00" → utf8 body
              → Smoke tree (master HEAD tree 6e83fb...): 19 entries (100644 blobs + 40000 trees, bin tree c8daf6... → 1 entry hookaudit.js)

hooks/        : 14 *.sample files only (applypatch-msg.sample, pre-commit.sample, …). No active hooks.
              → Important: .git/hooks is LOCAL state, NOT committed content (see §9).

.gitignore    : ignores .hookaudit/, node_modules/, dist/, build/, coverage/, *.log, .env, hookaudit-*, /tmp/
              → .git itself is in IGNORED_DIRS in scanner (bin/hookaudit.js:77) — correct for working-tree walk,
                but the git walker MUST read .git explicitly via a separate code path that does NOT go through listFilesRecursive.

index / logs/ : present; not needed for read-only object walk (ignore).
```

**Current HEAD chain (verified via zlib):**
```
829e55074c8ff77… (master, HEAD) — parent 2cb6026c…
  → tree 6e83fb2aca16a1617b885a41fedcbb07ca1d20b5 (19 entries)
```

**Implication:** Until `packed-refs` exists, branch discovery is “scan `refs/heads`”. After GC, ~all refs may live only in `packed-refs`. Both must be supported from day one.

---

## 2. Where It Integrates in `bin/hookaudit.js` today

Read against `bin/hookaudit.js:1`–`1366` (577 → 1366 lines lineage). Relevant seams:

| Area | Lines | Current behavior | Patch seam |
|------|------|------------------|------------|
| Safety constants | `bin/hookaudit.js:24-26` `MAX_FILE_SIZE`, `MAX_GRAPH_DEPTH`, `BINARY_CHECK_BYTES` | working-tree guards | Reuse + add `MAX_GIT_OBJECT_SIZE = 5<<20`, `MAX_TREE_ENTRIES = 4096`, `MAX_COMMITS_PER_BRANCH = 512`, `MAX_BRANCHES = 64`, `MAX_GIT_TREE_DEPTH = 64` |
| `IGNORED_DIRS` | `:77` `new Set(['node_modules','.git','dist',…])` | prevents walking `.git` during `scan` | **Do not change.** Git walker bypasses this via dedicated `readGit*` helpers that address `.git` directly |
| `DIAGNOSTIC_CODES` | `:28-42` | `INVALID_JSON`…`BASELINE_INVALID` (13 codes) | Extend with `GIT_MALFORMED_OBJECT`, `GIT_OBJECT_TOO_LARGE`, `GIT_REF_INVALID`, `GIT_PACKED_REFS_MALFORMED`, `GIT_TREE_TOO_DEEP`, `GIT_TOO_MANY_BRANCHES`, `GIT_TOO_MANY_COMMITS` — diagnostics, not crashes |
| `SURFACES` | `:62-74` `SURFACES[11]` globs (`.claude/settings.json`, `.vscode/tasks.json`, `package.json`, `.husky`, `.git/hooks`…) | `resolveSurfaceFiles(root, surface)` walks working tree | Reuse verbatim for committed walk, but match against **commit tree paths** (in-memory) not `fs.readdir`. Same glob list → apples-to-apples compare |
| `exists`, `toPosix`, `isBinaryContent`, `resolveInsideRepository`, `readTextSafeWithGuards`, `sha256` | `:153-283` | working-tree safety | Keep for working-tree. Git walker adds parallel `inflateObject`, `parseCommit`, `parseTree` that treat objects as **untrusted bytes** |
| `scan(root)` | `:599-611` | `for (surface) resolveSurfaceFiles → scanFile` | **Do not modify.** New `scanBranch(root, branchName, commitOid)` mirrors its file-selection + `scanFile` logic but sources content from blobs, not `fs` |
| `resolveExecutionGraph` | `:642-948` | BFS `config→script→script` with `visited`, depth `MAX_GRAPH_DEPTH=32`, `inferCapabilities`, `computePathRisk` | Reuse entire engine per branch by feeding synthetic `scanResults` (same shape) into existing `resolveExecutionGraph` with an **in-memory FS shim** or by refactoring resolver to accept a `readFile(abs)→{content,size}` provider. Minimal patch: inject `readProvider` param defaulting to `fs` — zero behavior change for existing call sites |
| `writeBaseline`/`readBaseline`/`diffAgainstBaseline` | `:1022-1103` | baseline v2 `{files, surfaces, capabilitySummary, graphSummary}` | Git branch compare is a **new comparison axis** (committed branch A vs B), not a mutation of baseline file. Output reuses `diff` semantic types (`NEW_TRIGGER`, `NEW_CAPABILITY`, …) but source is two branch scans |
| `main()` CLI | `:1252-1354` `parseArgs` + `known = Set(['scan','baseline','diff'])` | dispatches `scan|baseline|diff` | Add `branches` + alias `git-branches` to `known`; route to `cmdBranches(root, values)` |

**Export surface** `module.exports` (`:1360`): add new helpers under same guard (`CAPABILITY`, `DIAGNOSTIC_CODES`, …, plus `discoverBranches`, `readGitRef`, `inflateObject`, `parseCommit`, `parseTree`, `walkBranch`, `scanBranch`) for tests without widening runtime imports.

---

## 3. Minimal Walker Design

### 3.1 Goals / Non-Goals

**Goals:** Zero-dep, no `git` exec, inflate loose objects via `node:zlib`, walk `commit→tree→blob`, audit only **SURFACES**-relevant blobs, bounded, treat objects as untrusted (malformed → diagnostic), deterministic, committed-vs-local distinction explicit.

**Non-Goals:** Packfile (`.pack`/`.idx`) traversal, `objects/pack` delta resolution, reflog archaeology, index/stash/worktree, remote fetch, signature verification, full `.gitignore` semantics inside trees, interpreting pack-refs peeled tags beyond dereferencing.

Packfiles are intentionally deferred: current repo has none; a future patch can add `objects/pack/*.pack` streaming after this lands. Document as `UNSUPPORTED_GIT_PACKFILE` diagnostic if encountered.

### 3.2 Data Flow

```
discoverBranches(gitDir)                // refs/heads/* + packed-refs → Map<branchName, oid>
        │
        ├── readGitRef(gitDir, refPath) → oid | {symref} | null   // HEAD, per-branch
        ├── parsePackedRefs(gitDir)     // if exists
        └── HEAD resolution             // symref vs detached

walkBranch(gitDir, branchOid, opts)     // bounded commit traversal if history needed (see §3.5)
        └── readCommit(gitDir, oid)     // inflate + parseCommit → {tree, parents, message, gpgsigStripped}

scanBranch(gitDir, branchName, commitOid)
        ├── readTreeRecursive(gitDir, treeOid, prefix, depth, out) // inflate + parseTree → entries
        │       └── for each blob entry whose path matches SURFACES globs → readBlob(gitDir, oid) → content
        └── synthesize scanResults[]    // same shape as working-tree scan() → feed resolveExecutionGraph with memFS

compareBranches(aResults, bResults, aGraph, bGraph)
        └── reuse diffAgainstBaseline semantic layer (NEW/CHANGED/REMOVED + NEW_TRIGGER/NEW_CAPABILITY)
            but keyed by branch, not baseline file
```

### 3.3 Discovery: `discoverBranches(gitDir)`

```js
// Returns Map<string, {oid, refPath, peeled?}>  sorted by branchName
// gitDir = path.join(root, '.git')
function discoverBranches(gitDir, diagnostics) {
  const out = new Map();
  // 1. Loose refs: walk .git/refs/heads recursively (depth-limited, bounded)
  //    Each file = 40-hex + \n  (allow optional \n, trim, validate /^[0-9a-f]{40}$/)
  //    Name = relative to refs/heads/ with toPosix() (e.g. "feature/foo")
  //    Max branches 64 → GIT_TOO_MANY_BRANCHES
  // 2. packed-refs: if exists, parse line-by-line (see §3.4) and merge
  //    Loose wins over packed for same name (git semantics: loose overrides), but warn diagnostic if mismatch
  // 3. Diagnostics: BOUNDARY_VIOLATION-style not needed — only reading inside gitDir
  // 4. Determinism: sort keys lexicographically, insertion order stable
}
```

Constraints: never follow symlink outside `gitDir`; `lstatSync` + `isSymbolicLink()` per existing style; reject entries containing `..` or absolute paths; cap recursion depth 32.

### 3.4 `packed-refs` Format (must-handle, even though absent live)

```
# pack-refs with: peeled fully-peeled sorted         ← header line, ignore but validate starts with "#"
<40-hex> refs/heads/master
<40-hex> refs/heads/feature/x
<40-hex> refs/tags/v1.0
^<40-hex>   ← peeled line for annotated tag (preceded by ^), associate with previous
```

Parsing rules:
- Skip empty lines and `#`-comment lines.
- Lines starting with `^` are `peeled` — attach to `prevOid` entry as `peeled`.
- Otherwise `<oid> <ref>` split on first space/tab; validate oid hex, validate ref starts with `refs/`.
- Only `refs/heads/*` become branches; `refs/heads/*` → strip prefix for map key.
- Malformed line → push `GIT_PACKED_REFS_MALFORMED` diagnostic, skip line, continue (never throw).
- Deterministic: sort loose+packed merged keys.

### 3.5 HEAD Handling: `readGitRef(gitDir, ref)`

Two shapes — handle both:

```js
function readGitRef(gitDir, ref /* e.g. 'HEAD' or 'refs/heads/master' */, diagnostics) {
  const p = path.join(gitDir, ref); // but sanitize: reject ref containing ".." or absolute or UNC
  // 1. Try fs.readFileSync(p,'utf8')
  // 2. If content startsWith 'ref: ' → symbolic: {symref: content.slice(4).trim()}
  //    Recurse once: return readGitRef(gitDir, symref)
  //    Cycle guard: max 5 hops → GIT_REF_INVALID
  // 3. Else if /^[0-9a-f]{40}\s*$/ → {oid: trimmed}
  // 4. Else if file missing and packed-refs has it → returned via discoverBranches fallback
  // 5. Else → {oid:null, diagnostic: GIT_REF_INVALID} and push diagnostic
}
```

HEAD semantics for the walker:
- If `HEAD` is symbolic → current branch name = symref suffix, but `git-branches` should enumerate **all** branches regardless (HEAD just marks default).
- If `HEAD` is detached → treat as synthetic branch name `(detached HEAD)` with its oid (or `HEAD` key). Do not synthesize a `refs/heads/*` entry.
- If no HEAD and no refs → diagnostic `GIT_REF_INVALID`, empty branch set (honest, not crash).

### 3.6 Scope: Which Commits to Walk?

MVP (bounded, simple, matches spec wording “walk commit→tree→blob, compare branches”):

- **Default:** Compare **tip-commit trees** only — each branch is its single commit's tree. This is the committed execution surface at branch tip and is exactly comparable to working-tree `scan` semantics. No history walk needed.
- **Optional flag (future, not MVP-blocking):** `--history N` to walk `N` commits back via `parent` chain to detect history-only surfaces. Cap `MAX_COMMITS_PER_BRANCH = 512`; if parents exceed cap → `GIT_TOO_MANY_COMMITS` and stop. For MVP, parents are parsed but not traversed unless flag given.

Rationale: Resolving the full commit graph is O(commits) and needs packfile support for repos with GC. Tip-only gives 90% value (branch drift) at bounded cost, matching the baseline/diff mental model already in the product.

### 3.7 Object Inflation & Header Validation: `inflateObject(gitDir, oid)`

Single source of truth for loose objects; treat every byte as attacker-controlled:

```js
const zlib = require('node:zlib'); // add to require block
const MAX_GIT_OBJECT_SIZE = 5 * 1024 * 1024; // distinct from MAX_FILE_SIZE (committed blobs can be larger than working-tree scan cap)

function inflateObject(gitDir, oidHex, diagnostics) {
  // 1. Validate oidHex: /^[0-9a-f]{40}$/ else diagnostic GIT_MALFORMED_OBJECT + throw soft
  // 2. Path = .git/objects/aa/bb... (aa = oid.slice(0,2))
  //    Boundary: ensure resolved path stays inside gitDir/objects (toPosix + startsWith guard)
  // 3. lstat → size > 20<<20? → GIT_OBJECT_TOO_LARGE (avoid decompression bomb)
  // 4. fs.readFileSync → Buffer (compressed)
  // 5. try zlib.inflateSync(compressed) catch → GIT_MALFORMED_OBJECT, return null
  //    Also cap inflated length > MAX_GIT_OBJECT_SIZE → GIT_OBJECT_TOO_LARGE
  // 6. Find NUL (0x00) at offset `nul = raw.indexOf(0)`; if -1 → malformed
  // 7. Header = raw.slice(0,nul).toString('utf8')  must match /^(commit|tree|blob|tag) \d+$/
  //    Parse: [type, sizeStr] = header.split(' ')
  //    Declared size must equal raw.length - nul -1 else diagnostic GIT_MALFORMED_OBJECT
  //    Declared size > MAX_GIT_OBJECT_SIZE → truncate/diagnostic
  // 8. Body = raw.slice(nul+1)  (Buffer, preserve binary for tree)
  // 9. Return {oid, type, size: declared, body: Buffer, header}
}
```

Why `inflateSync` not `inflate`: synchronous matches existing scanner style (`readFileSync`), no streaming needed (objects capped at 5 MiB). `zlib` is the only new builtin — node:zlib has zero deps and is explicitly standard library.

Do **not** support `tag` objects for branch walking beyond dereferencing: if a branch ref happens to point to a tag object, peeled line in `packed-refs` gives the commit; otherwise if `inflate` returns `tag`, parse its `object <oid>` target and dereference one hop (diagnostic if loop).

### 3.8 Commit Parsing: `parseCommit(bodyBuffer)`

Commit bodies are UTF-8 text with a header block, optional `gpgsig`, then `\n\n` + message. Live example included `gpgsig -----BEGIN PGP SIGNATURE----- … -----END PGP SIGNATURE-----` as multiline header continuation — must NOT be mis-parsed as `tree`/`parent` lines.

```
header:
  tree <40-hex>
  parent <40-hex>        ← zero or more (merge commits)
  author <name> <email> <unix-ts> <tz>
  committer <same>
  gpgsig -----BEGIN PGP SIGNATURE-----
   <wrapped, each continuation line starts with space>
   -----END PGP SIGNATURE-----
  (blank line)
message...
```

Parser algorithm:

```js
function parseCommit(bodyBuffer, diagnostics) {
  const text = bodyBuffer.toString('utf8'); // commits are utf8, tolerate replacement
  // 1. Split header vs message at first "\n\n" (body may contain "\n\n" in gpgsig context? No — gpgsig line folds with leading space, so header lines all start without blank line)
  const sep = text.indexOf('\n\n');
  const headerText = sep === -1 ? text : text.slice(0, sep);
  const message = sep === -1 ? '' : text.slice(sep+2);
  const lines = headerText.split('\n');
  let tree = null;
  const parents = [];
  let author = null, committer = null;
  let gpgsig = null;
  for (let i=0; i<lines.length; ) {
    const line = lines[i];
    if (line.startsWith('tree ')) { tree = line.slice(5).trim(); i++; }
    else if (line.startsWith('parent ')) { parents.push(line.slice(7).trim()); i++; }
    else if (line.startsWith('author ')) { author = line.slice(7); i++; }
    else if (line.startsWith('committer ')) { committer = line.slice(10); i++; }
    else if (line.startsWith('gpgsig ')) {
      // Consume continuation lines that begin with ' '
      let sig = line.slice(7);
      i++;
      while (i < lines.length && lines[i].startsWith(' ')) { sig += '\n' + lines[i].slice(1); i++; }
      gpgsig = sig;
    }
    else if (line === '') { i++; }
    else {
      // Unknown header (e.g. mergetag, encoding) — skip honestly, push diagnostic GIT_MALFORMED_OBJECT (mild)
      diagnostics && diagnostics.push({code:'GIT_MALFORMED_OBJECT', path: 'commit:'+tree, detail: 'unknown commit header: '+line.slice(0,80)});
      i++;
    }
  }
  // Validation
  if (!tree || !/^[0-9a-f]{40}$/.test(tree)) { diagnostics.push({code:'GIT_MALFORMED_OBJECT', detail:'missing/invalid tree '+tree}); return null; }
  for (const p of parents) if (!/^[0-9a-f]{40}$/.test(p)) diagnostics.push({code:'GIT_MALFORMED_OBJECT', detail:'invalid parent '+p});
  return {tree, parents, author, committer, gpgsig, message, rawHeader: headerText};
}
```

Notes: strip `gpgsig` before reusing text for any hashing; never verify signature in MVP (no crypto policy dependency). Multiple parents (octopus merges) — walker still only needs `tree` for tip comparison; parent traversal only matters if `--history` is on.

### 3.9 Tree Parsing: `parseTree(bodyBuffer)`

Tree bodies are **binary**, not text. Each entry:

```
[mode ascii] SP [name bytes (no NUL, no /)] NUL [20-byte SHA-1 binary]
```

Mode is octal-ascii: `100644` (blob), `100755` (executable blob), `120000` (symlink), `040000` / `40000` (tree), `160000` (gitlink/submodule commit). Name is raw bytes — decode as utf8 with replacement, but reject entries containing `/` or `\` or empty name.

```js
function parseTree(bodyBuffer, diagnostics) {
  const entries = [];
  let off = 0;
  if (bodyBuffer.length > MAX_GIT_OBJECT_SIZE) { /* diagnostic */ return entries; }
  if (bodyBuffer.length > 4096 * 40) { /* heuristic: >4096 entries implies malformed */ }
  while (off < bodyBuffer.length) {
    const sp = bodyBuffer.indexOf(0x20, off); // space
    if (sp === -1) { diag('missing mode SP'); break; }
    const mode = bodyBuffer.slice(off, sp).toString('utf8');
    if (!/^(100644|100755|120000|40000|040000|160000)$/.test(mode)) {
      // Still allow unknown modes honestly but mark diagnostic; normalize 040000→40000
    }
    const nul = bodyBuffer.indexOf(0x00, sp+1);
    if (nul === -1) { diag('missing NUL after name'); break; }
    const nameBuf = bodyBuffer.slice(sp+1, nul);
    if (nameBuf.length === 0 || nameBuf.length > 255) { diag('bad name length'); break; }
    const name = nameBuf.toString('utf8');
    if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      diag('tree entry name escapes: '+name); off = nul+21; continue; // skip entry honestly
    }
    if (nul + 21 > bodyBuffer.length) { diag('truncated oid'); break; }
    const oid = bodyBuffer.slice(nul+1, nul+21).toString('hex');
    const kind = (mode === '40000' || mode === '040000') ? 'tree'
               : (mode === '120000') ? 'symlink'
               : (mode === '160000') ? 'commit' // submodule gitlink — treat as boundary
               : 'blob';
    entries.push({mode: mode==='040000'?'40000':mode, name, oid, kind});
    off = nul + 21;
    if (entries.length > MAX_TREE_ENTRIES) { diag('GIT_TREE_TOO_DEEP / too many entries'); break; }
  }
  // Determinism: git trees are already sorted by git's bytewise name sort (mode prefix aware),
  // but we sort output entries by name for stable matching — preserve original order for diagnostics?
  // For MVP: do NOT resort; rely on git order and sort only when comparing branch SURFACES.
  return entries;
}
```

Security: `MAX_TREE_ENTRIES = 4096` prevents a malformed tree from allocating unbounded. Binary oid slice is always exactly 20 bytes — validate before `toString('hex')`. Symlink/gitlink entries become `SYMLINK_SKIPPED` / `UNRESOLVED_REFERENCE` diagnostics downstream, matching working-tree policy.

### 3.10 Blob Reading: `readBlob(gitDir, oid)`

```js
function readBlob(gitDir, oid, diagnostics) {
  const obj = inflateObject(gitDir, oid, diagnostics);
  if (!obj) return null;
  if (obj.type !== 'blob') { diag('expected blob got '+obj.type); return null; }
  // Reuse working-tree guards:
  // 1. Declared size > MAX_FILE_SIZE (1 MiB) → diagnostic FILE_TOO_LARGE (keep code name stable),
  //    but still return null so SURFACES heavy blobs don't OOM the walker
  // 2. Binary check: reuse isBinaryContent(body.toString('utf8')) — but blobs may be binary legitimately (images)
  //    For MVP: same semantics as working-tree — binary → BINARY_SKIPPED and not scanned for capabilities
  // 3. Otherwise body.toString('utf8') → content string (with replacement for invalid utf8)
  // Cap: always reject blobs > MAX_GIT_OBJECT_SIZE even if MAX_FILE_SIZE is smaller
}
```

Important: committed blobs can be analysed even though `.git` is ignored by the working-tree walk — the two code paths are deliberately distinct.

### 3.11 Recursive Tree Walk: `readTreeRecursive(gitDir, treeOid, prefix, depth, out, diagnostics, visitedTrees)`

Depth-bounded DFS that collects only SURFACES-relevant blob paths (to avoid reading every blob in a monorepo):

```js
function readTreeRecursive(gitDir, treeOid, prefix, depth, out, diagnostics, visitedTrees, blobCache) {
  if (depth > MAX_GIT_TREE_DEPTH) { diag('GIT_TREE_TOO_DEEP @ '+prefix); return; }
  if (visitedTrees.has(treeOid)) { /* cycle? trees shouldn't cycle, but malformed objects could alias */ diag('CYCLE_DETECTED tree '+treeOid); return; }
  visitedTrees.add(treeOid);
  const obj = inflateObject(gitDir, treeOid, diagnostics);
  if (!obj || obj.type !== 'tree') { diag('expected tree'); return; }
  const entries = parseTree(obj.body, diagnostics);
  for (const e of entries) {
    const fullPosix = prefix ? prefix + '/' + e.name : e.name;
    // Early prune: does any SURFACES glob have this path as prefix or exact?
    // SURFACES globs include file and directory globs; implement matchesSurfacePath(fullPosix, e.kind)
    // e.g. '40000 .claude' is prefix for '.claude/settings.json' → must descend
    // If no SURFACES path has prefix fullPosix nor equals fullPosix, skip subtree entirely (still deterministic)
    if (!isSurfaceRelevant(fullPosix, e.kind)) {
      // For trees, check if ANY surface glob is under this subtree; else prune
      if (e.kind === 'tree' && !isSurfacePrefix(fullPosix)) continue;
      // For blobs at irrelevant paths → skip read
      continue;
    }
    if (e.kind === 'tree') {
      readTreeRecursive(gitDir, e.oid, fullPosix, depth+1, out, diagnostics, visitedTrees, blobCache);
    } else if (e.kind === 'blob') {
      // Only read if matchesSurfacePath exactly (post-filter)
      if (matchesSurfaceFile(fullPosix)) {
        // bounded: consult blobCache first
        let content = blobCache.get(e.oid);
        if (content === undefined) {
          const blob = readBlob(gitDir, e.oid, diagnostics);
          content = blob ? blob.content : null;
          blobCache.set(e.oid, content);
        }
        if (content !== null) out.push({path: fullPosix, oid: e.oid, content, mode: e.mode});
        // else diagnostic already emitted
      } else if (e.kind === 'symlink') {
        diagnostics.push({code:'SYMLINK_SKIPPED', path: fullPosix, detail:'symlink entry in committed tree'});
      } else if (e.kind === 'commit') {
        diagnostics.push({code:'UNRESOLVED_REFERENCE', path: fullPosix, detail:'submodule gitlink skipped'});
      }
    }
  }
}
```

Pruning helper sketch:

```js
function isSurfaceRelevant(posixPath, kind) {
  // SURFACES flat globs: ['.claude/settings.json', '.husky' (dir), '.git/hooks' (dir), ...]
  // Relevant if posixPath === glob || posixPath startsWith glob+'/' || glob startsWith posixPath+'/'
  for (const s of SURFACES) for (const g of s.glob) {
    if (posixPath === g) return true;
    if (posixPath.startsWith(g + '/')) return true; // e.g. posixPath='.claude/settings.json' under g='.claude' prefix
    if (g.startsWith(posixPath + '/')) return true; // posixPath='.claude' is prefix for g='.claude/settings.json'
  }
  return false;
}
```

This keeps the walk O(surfaces) not O(repo). For the live repo, that’s ~19 root entries → descends only into `bin`, `test`, `docs`, etc. only if surfaces live there — in practice only `.claude`, `.vscode`, `.cursor`, `.husky`, `.github`, plus root `package.json` and `.codex/config.toml` need traversal.

### 3.12 Branch Scan Synthesis: `scanBranch(gitDir, branchName, commitOid)`

```js
function scanBranch(gitDir, branchName, commitOid, rootDiagnostics) {
  const diags = [];
  const commitObj = inflateObject(gitDir, commitOid, diags);
  if (!commitObj || commitObj.type !== 'commit') { diags.push({code:'GIT_MALFORMED_OBJECT', detail:'branch '+branchName+' oid not a commit'}); return {branch:branchName, oid:commitOid, results:[], graph:null, diagnostics:diags}; }
  const commit = parseCommit(commitObj.body, diags);
  if (!commit) return {branch:branchName, oid:commitOid, results:[], graph:null, diagnostics:diags};

  const treeEntries = [];
  const visitedTrees = new Set();
  const blobCache = new Map(); // oid → content|null, per-branch single-scan cache
  readTreeRecursive(gitDir, commit.tree, '', 0, treeEntries, diags, visitedTrees, blobCache);
  // treeEntries is now [{path, oid, content, mode}] only for SURFACES-relevant blobs

  // Synthesize scanResults in the exact shape scan() produces, so resolver/graph can be reused verbatim:
  // Each SURFACES file becomes one result object {file, surface, hash, findings, diagnostics, capabilities}
  // Strategy: group treeEntries by SURFACES id via reverse lookup of path→surface
  const results = [];
  for (const ent of treeEntries.sort((a,b)=> a.path.localeCompare(b.path))) {
    const surface = SURFACES.find(s => s.glob.some(g => ent.path === g || (g.endsWith('/')? false : false) || matchesSurfaceFileForSurface(ent.path, s)));
    // More precise: match exactly SURFACES glob patterns; for dir globs like '.husky' match prefix
    if (!surface) continue;
    // Binary/size guards already applied in readBlob, but re-check isBinaryContent for safety
    if (isBinaryContent(ent.content)) {
      diags.push({code:'BINARY_SKIPPED', path: ent.path});
      results.push({file: ent.path, surface: surface.id, hash: null, findings:[], parseError:null, diagnostics:[{code:'BINARY_SKIPPED', path: ent.path}], capabilities:[]});
      continue;
    }
    if (ent.content.length > MAX_FILE_SIZE) {
      diags.push({code:'FILE_TOO_LARGE', path: ent.path});
      results.push({file: ent.path, surface: surface.id, hash: null, findings:[], parseError:null, diagnostics:[{code:'FILE_TOO_LARGE', path: ent.path}], capabilities:[]});
      continue;
    }
    const hash = sha256(ent.content);
    // Delegate to existing scanFile logic: synthesize a tmp via in-memory content
    // Minimal: reuse scanFile's JSON/text branch by calling a helper scanContent(surface, relPath, content, diags)
    const fileResult = scanContentFromString(surface, ent.path, ent.content, diags);
    // scanContentFromString is scanFile refactored to accept string content (extract the surface.kind === 'json' branch)
    // It must set .hash, .file, .surface same as working-tree scan
    results.push(fileResult);
  }
  // Surfaces with no committed file: no result entry (same as working-tree scan) — diff will show REMOVED/NEW accordingly

  // Build execution graph with in-memory readProvider so script→script resolution reads from blobCache/treeEntries
  // Two options (pick one, minimal patch):
  // A) Refactor resolveExecutionGraph(root, results, diagnostics, readProvider?)
  //    where readProvider(absPath) checks blobCache by path before falling back to fs.
  // B) Temporarily materialize committed blobs to os.tmpdir and point a synthetic root there, reuse existing resolver verbatim.
  // Recommendation: A (cleaner, no tmp dir, deterministic). Provide default provider = fs variant.

  const memProvider = makeMemReadProvider(treeEntries, blobCache, gitDir, commit.tree);
  const graph = resolveExecutionGraphWithProvider(/*syntheticRoot=*/ branchName, results, diags, memProvider);

  diags.sort((a,b)=> (a.code+a.path).localeCompare(b.code+b.path));
  return {branch: branchName, oid: commitOid, tree: commit.tree, results, graph, diagnostics: diags};
}
```

`scanContentFromString` is a mechanical extraction of `scanFile`'s second half (post-guard) so JSON vs text handling, `evaluateCommand`, `inferCapabilities`, etc. are shared, not forked.

`resolveExecutionGraphWithProvider` is the existing `resolveExecutionGraph` with its `fs.lstatSync`/`fs.readFileSync`/`fs.statSync` calls abstracted behind `provider.lstat(relativePosix)`, `provider.read(relativePosix)`, `provider.exists(relativePosix)`. The commit tree is the virtual filesystem root; absolute resolution uses `path.posix.join` within that virtual root and enforces boundary (no `..` above root, no absolute, no UNC inside committed paths). Cycle/depth/boundary/dynamic diagnostics reuse existing codes.

### 3.13 Comparing Branches

Branch drift is **not** a `baseline.json` mutation — it is an ephemeral comparison between two `scanBranch` outputs. Reuse the semantic diff already proven for baseline:

```js
function diffBranches(aScan, bScan) {
  // aScan, bScan each = {branch, oid, results, graph}
  // Reuse diffAgainstBaseline's semantic layer by adapting its inputs:
  // Treat aScan as "baseline" (Map file→hash + surfaces[].findings/capabilities) and bScan as "current"
  // Return {a:{branch,oid}, b:{branch,oid}, changes: [{file,type}], semantic:[{file,type,detail}], graphs:{a,b}}
  // Types: NEW / CHANGED / REMOVED  (file-level, via oid/hash) + NEW_TRIGGER / REMOVED_TRIGGER / NEW_COMMAND / NEW_CAPABILITY / NEW_REFERENCE (via findings/capabilities)
  // Deterministic: sort changes/semantic lexicographically
}
```

Rendered similarly to `printHuman(results, diff, graph, diagnostics)` but extended:
- Header shows both branches and their commit oids: `Comparing refs/heads/master@829e550… vs refs/heads/staging@abc123…`
- `Drift since baseline:` section becomes `Branch drift:`
- JSON adds `branches: {a:{name,oid,tree}, b:{name,oid,tree}}` alongside `diff`, preserving backward compat (still `version:1`).

Special case: single-branch mode (`hookaudit branches` with one branch present) → just audit that branch’s committed surface (no drift section), useful for CI on feature branches.

---

## 4. Detailed Helper Signatures (copy-paste ready)

### `readGitRef(gitDir, ref, diagnostics)`
- Input: `gitDir` absolute, `ref` like `'HEAD'` or `'refs/heads/master'` (relative to `gitDir`), `diagnostics[]`.
- Returns: `{oid: '40-hex'|null, symref: string|null, diagnostic?: code}`.
- Behavior: `fs.readFileSync` + trim; symbolic `ref:` dereference up to 5 hops with cycle guard; missing file → try `packed-refs` lookup; detached `40-hex` accepted; else `GIT_REF_INVALID`.

### `parsePackedRefs(gitDir, diagnostics)`
- Reads `.git/packed-refs` if `exists`.
- Guards: size > `MAX_GIT_OBJECT_SIZE` → `FILE_TOO_LARGE` / `GIT_PACKED_REFS_MALFORMED`; line count > 10000 → cap.
- Returns: `Map<refName, {oid, peeled}>` for all refs (caller filters `refs/heads/*`).

### `inflateObject(gitDir, oidHex, diagnostics)` → `§3.7`
### `parseCommit(bodyBuffer, diagnostics)` → `§3.8`
### `parseTree(bodyBuffer, diagnostics)` → `§3.9`
### `readBlob(gitDir, oidHex, diagnostics)` → `§3.10`
### `readTreeRecursive(gitDir, treeOid, prefix, depth, out, diagnostics, visitedTrees, blobCache)` → `§3.11`
### `scanBranch(gitDir, branchName, commitOid, diagnostics)` → `§3.12`
### `discoverBranches(gitDir, diagnostics)` → `§3.3`
### `diffBranches(aScan, bScan)` → `§3.13`
### `makeMemReadProvider(treeEntries, blobCache, ...)` → shim implementing `{lstat, read, exists, isFile, isDir}` over committed tree

All functions are pure aside from `fs`/`zlib`, push diagnostics instead of throwing, and return `null`/empty on malformed input (never crash).

---

## 5. Security & Bounds (invariant-preserving)

| Guard | Existing constant | Git walker addition | Diagnostic |
|-------|-------------------|---------------------|------------|
| Object inflate size | `MAX_FILE_SIZE 1 MiB` (working tree) | `MAX_GIT_OBJECT_SIZE 5 MiB` for `.git/objects/*` inflated; `FILE_TOO_LARGE` reuse for blobs > 1 MiB | `GIT_OBJECT_TOO_LARGE` / `FILE_TOO_LARGE` |
| Graph depth | `MAX_GRAPH_DEPTH 32` | Reuse for script→script chain per branch; add `MAX_GIT_TREE_DEPTH 64` for commit tree descent recursion | `DEPTH_LIMIT_REACHED` / `GIT_TREE_TOO_DEEP` |
| Cycle | `visited:Set` on script path | Additional `visitedTrees:Set<treeOid>` and `MAX_COMMITS_PER_BRANCH 512` for parent chain + object-oid cycle for blobs | `CYCLE_DETECTED` |
| Branch fan-out | — | `MAX_BRANCHES 64` loose+packed merged; `MAX_TREE_ENTRIES 4096` per tree | `GIT_TOO_MANY_BRANCHES` / `GIT_MALFORMED_OBJECT` |
| Blob fan-out | — | `MAX_BLOBS_PER_BRANCH 1024` (SURFACES-relevant only) | `GIT_TOO_MANY_COMMITS` style |
| Symlink / boundary | `resolveInsideRepository` + `lstat isSymbolicLink` | For committed content: tree entry `120000` → `SYMLINK_SKIPPED`; `160000` gitlink → `UNRESOLVED_REFERENCE`; no `fs` symlink follow inside walker; virtual FS forbids `..` above virtual root, absolute, UNC | `SYMLINK_SKIPPED` / `BOUNDARY_VIOLATION` |
| Dynamic | `DYNAMIC_EXECUTION` | Same — committed command strings still checked for `${}`, `process.env`, `` ` `` | `DYNAMIC_EXECUTION` |
| Binary | `isBinaryContent` | Reuse on blob content | `BINARY_SKIPPED` |
| Malformed objects | — | Every `inflateObject`/`parseTree`/`parseCommit` wraps in try/catch, validates header, validates sizes, validates oid hex | `GIT_MALFORMED_OBJECT` / `GIT_REF_INVALID` / `GIT_PACKED_REFS_MALFORMED` |
| Packfile encounter | — | If `objects/pack/*.pack` exists while scanning, emit `UNSUPPORTED_GIT_PACKFILE` diagnostic per branch (not a crash), still compare loose objects | `UNSUPPORTED_FORMAT` variant |
| Determinism | `toPosix`, sorted `results/nodes/edges/paths` | Branch map sorted, `treeEntries` sorted by path, `changes/semantic` sorted, `diagnostics` sorted, no random IDs in branch compare | — |
| Secrets | never print secrets | Excerpts sliced to 200 chars, same redaction discipline | — |

**Untrusted object principle:** Every `.git/objects/*` byte is attacker-controllable (malicious branch could contain crafted commits/trees/blobs). All parsers validate length fields, reject negative/NaN sizes, bound loops, reject embedded NUL in tree names, reject mode strings not in allowlist (with diagnostic, not throw), and never allocate `Buffer.alloc(size)` from declared size without capping by `MAX_GIT_OBJECT_SIZE`.

**No new ambient authority:** Git walker never writes to `.git` or the working tree except the two existing baseline paths (`.hookaudit/baseline.json`); `branches` is read-only.

---

## 6. CLI Contract Proposal

Additive, no breaking change to existing commands.

```
hookaudit branches [path] [--json] [--strict]
hookaudit git-branches [path] [--json] [--strict]   # alias (preferred per SPEC §48's "git-branches" wording)
hookaudit compare-branches [path] [--json] [--strict] # alias
```

**Arguments:**
- `[path]` positional repository root, default `.`, identical to `scan`/`baseline`/`diff`. Resolved via `path.resolve`.
- `--json` machine-readable envelope (extends v1 without breaking shape).
- `--strict` same CI gate as `scan`/`diff` (HIGH/CRITICAL or `CHANGED` critical capability → exit 1).
- Optional future (not MVP): `--base <branch>` `--head <branch>` `--history <n>` but not required for first land.

**Behavior:**
- Resolve `gitDir = path.join(root,'.git')`; if missing → `git repository not found at <root>` exit 2 (same class as missing root), diagnostic `GIT_REF_INVALID`.
- `discoverBranches(gitDir)` → map. If 0 branches → `No committed branches found.` human + JSON with `branches:[]`.
- If 1 branch → single-branch audit mode: scan that branch tip, print its surfaces/paths/risks (same report as `scan` but labeled `Committed branch refs/heads/master@<oid>`). Good for `--json` consumption in CI that checks “does this feature branch add a new capability?”.
- If 2+ branches → default drift mode: pick ordered pair `(a,b)` where `a` is HEAD’s target if valid and present in map, else lexicographically first branch; `b` is lexicographically next (or `--base`/`--head` if flags existed). For full matrix mode, future flag `--all` can compare every pair; MVP compares one pair and prints `Other branches: […]` note so output stays bounded. Full all-pairs is not MVP-required.
- For each selected branch, `scanBranch` → `resolveExecutionGraph` via mem provider → `diffBranches`.
- Human and JSON both render with identical deterministic ordering to `scan`/`diff`.
- Exit codes: mirror `scan`/`diff`: `0` no BLOCK/high-risk drift, `1` violation/strict/drift, `2` usage.

**Examples (mirroring Master Plan demo style):**

```bash
hookaudit branches .
hookaudit branches . --json
hookaudit branches --path C:\repos\example --json --strict
hookaudit git-branches . --json   # canonical alias
```

**JSON envelope addition (backward-compat):**

```json
{
  "version": 1,
  "repository": {"path":".", "absolute":"C:/..."},
  "branches": [
    {"name":"master","oid":"829e550...","tree":"6e83fb2...","commitMessage":"feat: ..."},
    {"name":"feature/x","oid":"abc123...","tree":"def456..."}
  ],
  "compared": {"a":"master","b":"feature/x"},
  "diff": {"changes":[{"file":".claude/settings.json","type":"CHANGED"}], "semantic":[{"file":".claude/settings.json","type":"NEW_CAPABILITY","detail":"NETWORK_ACCESS"}]},
  "branchScans": {
    "master":   {"results":[…], "paths":[…], "graph":{"nodes":[…],"edges":[…]}, "diagnostics":[…]},
    "feature/x":{"results":[…], "paths":[…], "graph":{"nodes":[…],"edges":[…]}, "diagnostics":[…]}
  },
  "summary": {"branches":2,"executionSurfacesA":3,"executionSurfacesB":4,"highRiskPathsA":0,"highRiskPathsB":2,"decision":"BLOCK"},
  "diagnostics": […]
}
```

When only one branch exists, `compared` and `diff` are `null`; `branchScans` has one key.

**Human report sections** (mirrors `printHuman` priority):

```
hookaudit — 2 committed branch(es) scanned (master@829e550, feature/x@abc)
  Branch drift: CHANGED .claude/settings.json  NEW_CAPABILITY NETWORK_ACCESS
  High-risk execution paths (feature/x):
    HIGH confidence=HIGH trigger="SessionStart"  Chain: .claude/settings.json → scripts/a.js → scripts/b.js  Caps: NETWORK_ACCESS, PROCESS_EXECUTION

Comparison master → feature/x:
  COMMIT master 829e550 feat: interactive browser demo…
  COMMIT feature/x abc123 feat: add hooks
  (then per-branch finding detail, deduplicated)

Diagnostics: …
Summary: …
Policy: …
  Note: Committed branch content; local .git/hooks not equivalent (see §9).
```

---

## 7. The `§49` Distinction: Committed Content vs Local `.git/hooks`

This is a correctness requirement, not a footnote.

- **Committed surfaces** (walker audits): `.claude/settings.json`, `.vscode/tasks.json`, `.cursor/rules`, `package.json` scripts, `.husky/*`, `.pre-commit-config.yaml`, `.codex/config.toml`, `.gemini/settings.json`, `.mcp.json`, etc. These are `tree→blob` paths in commits and therefore comparable across branches. Their absence in a tree is meaningful (`REMOVED`).

- **Local-only surfaces** (walker must **not** conflate):
  - `.git/hooks/*` (excluding `*.sample`) — local hooks activated by `git commit`/`pre-push` etc. They are **not versioned by default** (git does not commit `.git/`). They vary per clone even when branches are identical. Current `SURFACES` row `git-hooks` glob `.git/hooks` is accurate for **working-tree local** `scan` but semantically different from a committed branch comparison.
  - `.git/MERGE_HEAD`, `.git/rebase-merge`, `.git/index.lock`, `.git/opencode`, etc. — local state.
  - Untracked files, staged but uncommitted files.

**Patch rule:**
- In `scanBranch` / `readTreeRecursive`, **exclude** `git-hooks` surface from committed walk. Either filter `SURFACES` to `SURFACES_COMMITTABLE = SURFACES.filter(s=>s.id!=='git-hooks')` when scanning commits, or keep the entry but never expect `.git/hooks` inside a commit tree (it will simply never match, which is also correct — but be explicit so a future reader doesn't think “why does branches miss git hooks?”).
- In `branches` report, include a fixed coverage footnote: `Local hooks (.git/hooks) are not committed content — run 'hookaudit scan .' to audit local hooks. Committed comparison covers versioned execution surfaces only.`
- In spec docs / `LIMITATIONS.md` add: branch comparison is **committed-state** comparison; local state requires `scan`.
- The current working-tree `scan` keeps auditing `.git/hooks` — no change. This dualism is intentional and must be labeled everywhere `branches` output appears.

---

## 8. Patch Plan (files to touch, in order)

**Do not edit `bin/hookaudit.js` directly.** This design is the patch file; implementation proceeds by applying a single additive diff迭 after review.

**Proposed diff outline (mechanical, no semantic change to existing paths):**

```diff
 // bin/hookaudit.js
 const fs = require('node:fs');
 const path = require('node:path');
 const crypto = require('node:crypto');
 const { parseArgs, styleText } = require('node:util');
+const zlib = require('node:zlib');

 // constants
 const MAX_FILE_SIZE = 1 * 1024 * 1024;
 const MAX_GRAPH_DEPTH = 32;
+const MAX_GIT_OBJECT_SIZE = 5 * 1024 * 1024;
+const MAX_GIT_TREE_DEPTH = 64;
+const MAX_TREE_ENTRIES = 4096;
+const MAX_COMMITS_PER_BRANCH = 512;
+const MAX_BRANCHES = 64;

 DIAGNOSTIC_CODES += {
   GIT_MALFORMED_OBJECT: 'GIT_MALFORMED_OBJECT',
   GIT_OBJECT_TOO_LARGE: 'GIT_OBJECT_TOO_LARGE',
   GIT_REF_INVALID: 'GIT_REF_INVALID',
   GIT_PACKED_REFS_MALFORMED: 'GIT_PACKED_REFS_MALFORMED',
   GIT_TREE_TOO_DEEP: 'GIT_TREE_TOO_DEEP',
   GIT_TOO_MANY_BRANCHES: 'GIT_TOO_MANY_BRANCHES',
   GIT_TOO_MANY_COMMITS: 'GIT_TOO_MANY_COMMITS',
 }

 // SURFACES: keep array as-is; add const SURFACES_COMMITTABLE = SURFACES.filter(s=>s.id!=='git-hooks');

 // helpers: add inflateObject, parseCommit, parseTree, readBlob, readTreeRecursive,
 //          readGitRef, parsePackedRefs, discoverBranches, isSurfaceRelevant, matchesSurfaceFile,
 //          scanContentFromString (extract from scanFile), makeMemReadProvider,
 //          resolveExecutionGraphWithProvider (refactor existing resolver to provider), scanBranch, diffBranches

 // exports: extend module.exports with discoverBranches…

 // main(): extend known = new Set(['scan','baseline','diff','branches','git-branches','compare-branches'])
 //         and add else-if (command==='branches'||command==='git-branches'||command==='compare-branches') → cmdBranches(root, values)
 //         helpers printHumanBranches / printJsonBranches

 // STDLIB.md: add row 13  node:zlib inflateSync for .git object decompression
 // SECURITY.md / LIMITATIONS.md: note committed-vs-local distinction + packfile deferral
```

**Refactor guard:** `resolveExecutionGraph`’s new provider param defaults to `fs` helpers, so all 22 existing tests remain green without fixture changes.

**Single-file discipline:** Per `plans/HookAudit_Master_Implementation_Plan.md:58`, stay single-file `bin/hookaudit.js` until module extraction is justified — this patch respects that (all additions land in the same file).

---

## 9. Bounded Traversal & Resource Capping (checklist)

- [ ] Every `fs.readFileSync` on `.git/objects/*` preceded by `lstatSync` size check vs `MAX_GIT_OBJECT_SIZE`.
- [ ] `zlib.inflateSync` wrapped in try/catch → `GIT_MALFORMED_OBJECT`.
- [ ] Inflated length validated against declared header size; mismatch → diagnostic (handles truncated/corrupt objects).
- [ ] `parseTree` loop bounded by `MAX_TREE_ENTRIES` and byte-length; NUL/space search bounded.
- [ ] `readTreeRecursive` depth incremented per tree level, capped `MAX_GIT_TREE_DEPTH`.
- [ ] `visitedTrees` prevents tree-oid alias loops (malformed repo could share tree oid across branches intentionally — still bounded).
- [ ] Branch discovery caps `MAX_BRANCHES`; commit walk caps `MAX_COMMITS_PER_BRANCH` (even though tip-only doesn’t need it, guard the future `--history`).
- [ ] Blob reads only for SURFACES-relevant paths (pruning via `isSurfaceRelevant`/`isSurfacePrefix`); no reading of arbitrary large committed blobs (e.g., `dist/bundle.js` is never touched).
- [ ] `blobCache` per branch prevents redundant inflate of shared blobs (e.g., unchanged `package.json` across branches).
- [ ] Per-branch `diagnostics` sorted; global diagnostics merge is deterministic.
- [ ] No `child_process`, no `fetch`, no `vm`, no `http`, no `net` — grep-verifiable.

---

## 10. Treating Git Objects as Untrusted (failure modes)

| Malformed input | Handling | Diagnostic | Continues? |
|-----------------|----------|------------|------------|
| OID not hex / short | reject before read | `GIT_MALFORMED_OBJECT` | yes — skip branch |
| `.git/HEA D` with CRLF, trailing spaces, missing `ref:` | trim + validate; if `ref:` value contains `..` or absolute → `GIT_REF_INVALID` | `GIT_REF_INVALID` | yes |
| `packed-refs` line without space | skip line | `GIT_PACKED_REFS_MALFORMED` | yes — continue lines |
| `commit` object missing `tree` or `tree abc` invalid | emit, return null branch scan | `GIT_MALFORMED_OBJECT` | yes |
| `commit` with `gpgsig` multiline (live case) | parseContinuation correctly (lines starting ` `), not as new header | — | yes |
| `tree` entry missing NUL / short oid | break loop | `GIT_MALFORMED_OBJECT` | yes — partial entries kept |
| `tree` entry mode not in allowlist | allow but log | `GIT_MALFORMED_OBJECT` | yes |
| `tree` entry name with `/` or `..` | skip entry, log | `BOUNDARY_VIOLATION` | yes |
| `blob` exceeds `MAX_FILE_SIZE` | do not read into graph, push `FILE_TOO_LARGE` α | `FILE_TOO_LARGE` | yes |
| Inflated size > declared | diagnostic, cap | `GIT_MALFORMED_OBJECT` | yes |
| Truncated zlib stream (`Block length…` error from System.IO.Compression equivalent) | catch `zlib.inflateSync` | `GIT_MALFORMED_OBJECT` | yes |
| Symlink entry `120000` | do not follow | `SYMLINK_SKIPPED` | yes |
| Submodule `160000` | do not recurse | `UNRESOLVED_REFERENCE` | yes |
| `objects/pack/*.pack` exists, branch oid not found loose | report unsupported | `UNSUPPORTED_FORMAT` / `GIT_MALFORMED_OBJECT` | yes — branch shows as sparse |

All diagnostics flow to `diagnostics[]` and appear in human report `Diagnostics:` and JSON `diagnostics`/`branchScans[*].diagnostics`, never throwing to top-level (fatal only for invalid root path / unreadable `.git` directory itself).

---

## 11. Test Fixture Ideas (to land alongside the patch)

Keep fixtures small, synthetic, inert — same discipline as `test/fixtures/clean-repo` / `malicious-repo`.

### 11.1 Unit fixtures (helpers, no repo needed)

| Test | Purpose | Assertion |
|------|---------|-----------|
| `inflateObject` on live loose object | prove `node:zlib` path matches UTF8 header + NUL split | `header === 'commit 1238'` for HEAD |
| `parseCommit` on gpgsig commit | handle multiline continuation | `tree` correctly extracted, `gpgsig` stripped, message intact |
| `parseTree` on binary buffer | mode SP name NUL 20-byte hex | `entries.length === 19` for master tree `6e83fb…` |
| `parseTree` malformed (no NUL, short oid) | robustness | `GIT_MALFORMED_OBJECT` diagnostic, no throw |
| `parsePackedRefs` synthetic packed-refs | both `refs/heads/*` and `^peeled` lines | map size correct, `peeled` attached |

### 11.2 Integration fixtures (synthetic `.git` repos via object construction)

Craft each repo by writing loose objects + `refs/heads/*` + `HEAD` into `os.tmpdir()/hookaudit-git-*` using `zlib.deflateSync(Buffer.concat([Buffer.from('commit 1238\\0'), body]))` — no `git` invocation.

**Fixture A — Single branch:**
- `HEAD → refs/heads/master@aaa…` whose tree contains only `README.md` (no SURFACES)
- Assert: `branches --json` → `branches:[{name:'master'}]`, `compared:null`, `branchScans.master.results=[]`

**Fixture B — Two branches, diverged SURFACES:**
- `master@aaa…` tree: `package.json` with `scripts.postinstall: "echo ok"`
- `feature/x@bbb…` tree: same tree + `.claude/settings.json` `SessionStart → node scripts/a.js` where `scripts/a.js → fetch("https://evil.test")`
- Assert: `compared {a:master,b:feature/x}`, `diff.changes` includes `.claude/settings.json NEW`, `semantic` includes `NEW_CAPABILITY NETWORK_ACCESS`, `branchScans.feature/x.graph` has `NETWORK_ACCESS` path

**Fixture C — Packed-refs only (post-`gc`):**
- Remove `refs/heads/master` loose file, write `packed-refs` containing `829e550… refs/heads/master` + header + duplicate for `refs/heads/other`
- Assert: `discoverBranches` still finds both, loose-wins-if-present semantics validated, no reliance on `refs/heads/*` existence

**Fixture D — Malformed commit:**
- Branch `bad@ccc…` whose commit body is `tree nothex\n\nmsg` (invalid tree oid)
- Assert: `branchScans.bad.diagnostics` includes `GIT_MALFORMED_OBJECT`, `results==[]`, scan continues for other branches

**Fixture E — Symlink + submodule in committed tree:**
- Tree containing entries `120000 evil-link → ../outside` and `160000 submodule → abc…`
- Assert: walker does not traverse, diagnostics `SYMLINK_SKIPPED` / `UNRESOLVED_REFERENCE`, no BOUNDARY violation read outside `gitDir`, no `fs` follow

**Fixture F — Large blob cap:**
- Branch with tree containing `package.json` 2 MiB (declare `blob 2097152`)
- Assert: `FILE_TOO_LARGE` / `GIT_OBJECT_TOO_LARGE` diagnostic, blob content not fed to capability engine, scan terminates without OOM

**Fixture G — Determinism:**
- Run `branches --json` twice on Fixture B → `JSON.stringify(branchScans)` deepEqual (sort stable).

**Existing regression preservation:**
- After patch, all 22 tests in `test/hookaudit.test.js` still pass (`scan` path unaffected because it bypasses git walker).
- New `test/git-branches.test.js` with fixtures A–G adds ~8 tests, reusing `execFileSync('node',[BIN,'branches','--json','--path',tmp])` harness and `node:assert/strict`.

### 11.3 Negative / Security tests

- `never-execute`: branch tip `package.json` `postinstall: "node -e \"fs.writeFileSync(marker)\""` — assert marker not created after `branches` scan (walker is read-only).
- `boundary`: committed tree name `../evil` not descended.
- `packed-refs` with 100k lines (cap `MAX_BLOBS_PER_BRANCH`) → `GIT_TOO_MANY_BRANCHES` / `GIT_PACKED_REFS_MALFORMED` not OOM.

---

## 12. Doc & Proof Updates (ship blockers)

- [ ] `STDLIB.md` row 13: `node:zlib` → `inflateSync` for `.git/objects/*` (why not `git` binary: zero-dep + no external tool, deterministic, local).
- [ ] `LIMITATIONS.md` add: packfile traversal deferred (loose objects only); symlinks/gitlinks not followed in commits; `--history` not in MVP (tip-only).
- [ ] `SECURITY.md` add: committed vs local distinction (`.git/hooks` local) and untrusted-object handling.
- [ ] `README.md` add `hookaudit branches` to usage block (not as “default” — scan remains entrypoint) and branch-comparison example under Baseline/Diff.
- [ ] `deps-proof.txt` regenerated (still `node:fs, node:path, node:crypto, node:util, node:zlib` only).
- [ ] `package.json` `engines` unchanged (node >=24 has `node:zlib` stable).

---

## 13. Alternatives Considered (and rejected)

- **Shelling out to `git log`/`git ls-tree`**: rejected — violates `RULES.md §4` forbidden `Git commands`, hides dep on external binary, platform-variant output, TOCTOU.
- **Full packfile parser**: deferred — complexity (delta offsets, `.idx` fan-out, zlib stream inside pack) exceeds MVP budget; live repo has no packfiles, and loose-object branch comparison already proves branch-drift value. Future patch can add streaming `objects/pack/*.pack` without changing this design’s interfaces.
- **Filesystem materialization of each branch to `os.tmpdir`**: rejected for main path — introduces `tmpdir` lifecycle, symlink attacks via committed symlink entries, slower. Kept as design note for a quick initial spike, but the mem provider is cleaner and is the recommended implementation.
- **Mutating `baseline.json` to store per-branch snapshots**: rejected — conflates ephemeral comparison with trust persistence; branch comparison should be stateless (like `diff` is), not append to baseline file.

---

## 14. Implementation Checklist (apply patch atomically)

1. Add `node:zlib` require + `MAX_GIT_*` constants + diagnostic codes.
2. Add git helpers (`inflateObject` → `parseCommit`/`parseTree` → `discoverBranches` → `readTreeRecursive` → `scanBranch` → `diffBranches`).
3. Refactor `scanFile` tail into `scanContentFromString` + add `makeMemReadProvider` shim for resolver.
4. Extend `main()` `known` set + dispatcher + `cmdBranches` + `printHumanBranches`/`printJsonBranches`.
5. Add `SURFACES_COMMITTABLE` filter and committed-vs-local footnote.
6. Update `STDLIB.md`/`LIMITATIONS.md`/`SECURITY.md`/`README.md`.
7. Add `test/git-branches.test.js` fixtures A–G + negative tests.
8. Verify: `npm test` 30/30 (22 existing + 8 new), `npm ls --all` empty, `grep -R "child_process\|\bexecFile\b\|spawn" bin/hookaudit.js` shows only test harness (not scanner), `node bin/hookaudit.js branches . --json` against live repo shows `master` tip with 19-entry tree surfaces matching working-tree `scan` sans `.git/hooks`, `node bin/hookaudit.js --help` lists `branches`/`git-branches`/`compare-branches`.

---

## 15. Summary (what to tell a reviewer in 60s)

- Live `.git` is HEAD-symbolic `refs/heads/master@829e550…`, all loose objects, no `packed-refs`/packfiles — design handles both loose and packed, bounded and untrusted.
- Patch reuses the entire existing pipeline (`SURFACES`, `scanFile` tail, `resolveExecutionGraph`, `computePathRisk`, `diffAgainstBaseline` semantics) by synthesizing per-branch `scanResults` from committed blobs read via `node:zlib` inflate of `commit→tree→blob`; working-tree `scan` is untouched.
- Committed state is deliberately distinct from local state: `.git/hooks` is excluded from branch comparison and flagged in output — “committed branches vs local hooks are different trust domains.”
- CLI is `hookaudit branches .` (aliases `git-branches`, `compare-branches`), `--json`/`--strict` compatible, tip-only comparison by default, deterministic, read-only, zero new deps.
- Test plan proves value with synthetic `.git` repos (single branch, two-branch drift, packed-refs, malformed object, symlink/gitlink, large blob) without ever executing `git`.
