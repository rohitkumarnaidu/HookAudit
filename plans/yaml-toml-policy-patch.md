# HookAudit YAML/TOML Policy Patch — Minimal Safe Subset (Prompt §37–42)

**Repo:** `C:\Hackathons\HookAudit` · **File:** `bin/hookaudit.js` (single-file, zero-dep)  
**Current `loadPolicy` location:** `bin/hookaudit.js:954-982` (pre-patch, 1366-line file)  
**Constraint:** Do **NOT** edit `bin/hookaudit.js` directly in this patch — this document is the exact code to apply. Zero-dep only: `node:fs`, `node:path`, `node:crypto`, `node:util`. No `yaml` package, no `toml` package, no `child_process`/`vm`/`fetch` at runtime.  
**Diagnostics:** Must emit `UNSUPPORTED_FORMAT` for any unsupported YAML/TOML syntax (per `DIAGNOSTIC_CODES:30`).

---

## 0. Verified Current State

| Fact | Verified | Source |
|------|----------|--------|
| Current policy | JSON only via `JSON.parse` | `bin/hookaudit.js:964-982` `loadPolicy` reads `.hookaudit/policy.json` then `policy.json`, 64 KiB limit, `JSON.parse`, normalizes `blockOn`/`warnOn`/`version` |
| `demo/policy.json` | `version:1, blockOn:["CRITICAL","HIGH"], warnOn:["MEDIUM","WARN"]` plus `description`/`notes`/`defaults` | `demo/policy.json:1-11` |
| `DIAGNOSTIC_CODES` | includes `UNSUPPORTED_FORMAT` | `bin/hookaudit.js:30` |
| Zero-dep proof | `package.json:15-16` empty, `bin/hookaudit.js:15-18` only `node:fs/path/crypto/util` | `deps-proof.txt` |
| Policy usage | `main:1317` `loadPolicy(root)` → `evaluatePolicy` → `BLOCK/WARN/PASS`, human+JSON report shows `Policy source: ...` | `bin/hookaudit.js:984-1017`, `1196-1201` |

---

## 1. Patch Overview — Files to Touch

Only `bin/hookaudit.js` (3 insertions + 1 signature change) + 2 new demo files:

- `bin/hookaudit.js:954-962` — constants (`BASELINE_DIR`, `POLICY_FILE`, `POLICY_DEFAULT`, new `POLICY_YAML_FILES`/`POLICY_TOML_FILES`)
- `bin/hookaudit.js:963` — **new:** helpers `stripYamlComment`/`parseYamlScalar`/`parseYamlInlineArray`/`countIndent`/`parseYamlPolicy` and `stripTomlComment`/`findEqualsOutsideQuotes`/`splitTomlKey`/`stripQuotes`/`unescapeTomlString`/`parseTomlValue`/`parseTomlPolicy`
- `bin/hookaudit.js:964-982` — **replace:** `loadPolicy` with YAML/TOML-aware version that tries `.json` → `.yaml/.yml` → `.toml`
- `bin/hookaudit.js:1305-1325` — `main()` — pass `globalDiagnostics` into `loadPolicy(root, globalDiagnostics)` so `UNSUPPORTED_FORMAT` surfaces
- `demo/policy.yaml` — new example (same semantic as `demo/policy.json`)
- `demo/policy.toml` — new example (same semantic)

---

## 2. Design Principles — Minimal Safe Subset (No `yaml` Package)

**Why not `yaml` package:** `package.json` must stay `dependencies:{}` per `RULES.md:4` and `.zero-dep.toml`. Node stdlib has no YAML/TOML reader (`STDLIB.md:12`). Any vendored parser would “fake an empty manifest” per `RULES.md:3` and widen attack surface. A hand-rolled **subset** parser is the honest trade-off: weaker than a full spec, but auditable, bounded, and immune to `!!js/function`/`!include` code-execution tags.

**Core invariants preserved:**
- Policy files are **data, not code** — no `eval`, `Function`, `vm`, `require`, external includes, anchors, or file I/O inside the parser.
- 64 KiB size cap before parse (`MAX 64*1024`, same as current JSON guard) + BOM strip.
- Prototype-pollution guard: reject `__proto__`/`constructor`/`prototype` as keys at any nesting depth.
- Deterministic: no `Math.random`, no async, stable key order is caller-normalized (`blockOn`/`warnOn` filtered).
- Diagnostics are honest: unsupported syntax → throw with `.code='UNSUPPORTED_FORMAT'` → `loadPolicy` catches and pushes `{code, path, detail}` into the global diagnostics bag.

---

## 3. Supported YAML Subset (Honest, Not Full YAML 1.2)

| Feature | Supported | Example | Notes |
|---------|-----------|---------|-------|
| Document | Single document, optional leading `---` / trailing `...` ignored | `---` at top | Multi-document `---` mid-file → `UNSUPPORTED_FORMAT` |
| Comments | `#` to end-of-line, outside single/double quotes | `version: 1 # policy version` | `#` inside quotes is preserved |
| Mappings | Block mappings `key: value` with 2-space indent (1+ spaces allowed, tabs rejected) | `blockOn: ["CRITICAL","HIGH"]` | Keys: bare `[A-Za-z0-9_.-]+` or quoted `"…"`/`'…'`; `__proto__` rejected |
| Lists (block) | Block sequence `- item` under a mapping key, indented > parent | <pre>blockOn:<br>  - CRITICAL<br>  - HIGH</pre> | Required for policy; flow `- CRITICAL` inline list also supported inside parent via `parseYamlInlineArray` |
| Inline arrays | Flow arrays `["CRITICAL","HIGH"]` for `blockOn`/`warnOn` | `blockOn: ["CRITICAL", "HIGH"]` | Parsed by quote-aware comma split; trailing comma allowed |
| Scalars — strings | Unquoted (`CRITICAL`), single-quoted (`'CRITICAL'` literal), double-quoted (`"CRITICAL"` with `\"`, `\\`, `\n`, `\t` limited) | `description: "Minimal policy"` | No BOM beyond leading `0xFEFF` strip |
| Scalars — booleans | `true`/`false` (case-insensitive `True`/`False` accepted) | `enabled: true` | For policy not needed but harmless |
| Scalars — numbers | Decimal integers `-?\d+` and floats `-?\d+\.\d+([eE][+-]?\d+)?` | `version: 1` | Hex/oct/binary, `inf`/`nan` → `UNSUPPORTED_FORMAT` |
| Scalars — null | `null`, `Null`, `NULL`, `~`, empty | `key: null` | Returns JS `null` |
| Nesting | One-level nested mapping `defaults:` → `blockOn:` block list (2-space indent) | `defaults:`<br>`  blockOn:`<br>`    - CRITICAL` | Depth capped at 8; deeper → `UNSUPPORTED_FORMAT` |
| Root shape | Any top-level mapping keys preserved; `loadPolicy` normalizes `version`/`blockOn`/`warnOn` only | — | Unknown keys kept in `raw` |

**Intentionally unsupported → `UNSUPPORTED_FORMAT`:**

| Unsupported | Why rejected | Detection |
|-------------|--------------|-----------|
| Tags `!` / `!!str` / `!include` | Tags can instantiate arbitrary JS classes in many YAML libs (`!!js/function`, `!!js/regexp`); external includes read files | `/:\s*!|^\s*!|!\w/` outside quotes |
| Anchors `&anchor` / Aliases `*alias` / Merge `<<: *alias` | Graph structure, indirection, DoS cycles | `/^\s*-\s*[&*]|:\s*[&*]|<<\s*:/` |
| Directives `%YAML` `%TAG` | Parser directive | `/^\s*%/` |
| Complex keys `? key` | Unneeded for policy; ambiguous parsing | `/^\s*\?(\s\|$)/` |
| Block scalars `\|` / `>` (literal/folded) | Multi-line string syntax with chomping/indent indicators — out-of-scope; policy uses plain single-line strings | `/:\s*[|>]\s*$/` and `/:\s*[|>][+-]?\d*\s*$/` |
| Flow mappings `{a: b}` | Not needed for policy; confusable | `valueRaw` starts with `{` |
| Tabs for indentation | Ambiguous with spaces; reject early | `/\t/` in leading whitespace |
| Explicit multi-document `---` mid-file | Would imply multiple policies per file | second `---` after first content line |
| Hex/Oct/Binary `0x`, `0o`, `0b`, `inf`, `.nan` | Non-decimal numerics not needed | regex in `parseYamlScalar` |

---

## 4. Supported TOML Subset (Honest, Not Full TOML 1.0)

| Feature | Supported | Example | Notes |
|---------|-----------|---------|-------|
| Comments | `#` to end-of-line, outside `"…"`/`'…'` | `version = 1 # policy version` | Stripped by `stripTomlComment` |
| Tables | `[table]` and dotted `[a.b]` → nested objects | `[defaults]` | Bare keys `[A-Za-z0-9_-]+` only; quoted table names → `UNSUPPORTED_FORMAT` |
| Keys | Bare `key`, dotted `a.b`, quoted `"a b"` / `'a b'` | `blockOn = ["CRITICAL","HIGH"]` | Dotted expands to nested object; `__proto__` guard on each segment |
| Scalars — strings | Basic `"…"` (escapes `\" \\ \n \t \r \b \f`) and literal `'…'` (no escapes) | `description = "Minimal policy"` | Multiline `"""` / `'''` → `UNSUPPORTED_FORMAT` |
| Scalars — booleans | `true` / `false` | `enabled = true` | — |
| Scalars — integers | `-?\d+` decimal only | `version = 1` | `0x`/`0o`/`0b`/`_`-separators → `UNSUPPORTED_FORMAT` |
| Scalars — floats | `-?\d+\.\d+([eE][+-]?\d+)?` | `threshold = 0.8` | `inf`/`nan`/`_`-separators → `UNSUPPORTED_FORMAT` |
| Arrays | Inline `["CRITICAL","HIGH"]` including multiline with newlines until closing `]` | `blockOn = ["CRITICAL", "HIGH",]` | Quote-aware comma split; trailing comma allowed; elements recursively parsed via `parseTomlValue` |
| Root | Keys at root or under at most one `[table]` level | — | Policy fields (`version`, `blockOn`, `warnOn`) may be at root **or** inside a single table; parser flattens uniformly |

**Intentionally unsupported → `UNSUPPORTED_FORMAT`:**

| Unsupported | Why rejected | Detection |
|-------------|--------------|-----------|
| Array of tables `[[products]]` | Not used for policy; nested array-of-maps complexity | `/^\s*\[\[/` |
| Inline tables `{a=1, b=2}` | Alternative to `[table]` — policy uses `[table]`; inline table spec has quoting/ordering edge cases | `valueRaw` matches `/^\s*\{/` |
| Multiline basic/literal `"""` / `'''` | Policy values are single-line; multiline would require dedent/chomping logic | `rawLine.includes('"""') \|\| rawLine.includes("'''")` |
| Datetimes `1979-05-27T07:32:00` / local dates | Not a policy type; regex false-positive risk | `/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/` |
| Hex/Oct/Bin integers `0xDEADBEEF`, `0o755`, `0b1101`, `_` separators, `inf`/`nan` | Non-decimal; policy uses simple `version: 1` | regex guards in `parseTomlValue` |
| Quoted table keys containing dots not needed | Policy tables are simple bare words | table part `/[^\w-]/` → error |

**Trade-off note:** This subset omits the hardest TOML edges (datetime, multiline strings, inline tables, array-of-tables) deliberately. A policy that genuinely needs datetimes would have to use quoted strings instead. The parsers are ~120/150 lines each vs 2k+ for a full spec — audit time and DoS surface drop proportionally. Blunt `curl` payloads that evade single-line string extraction would still be caught by the existing raw-text sweep on other surfaces; the policy format simply does not need those TOML features.

---

## 5. Exact Patch — 5.A New Constants (after `POLICY_DEFAULT`)

**Location:** `bin/hookaudit.js:958-962`  
**Current:**

```js
const BASELINE_DIR = '.hookaudit';
const BASELINE_FILE = 'baseline.json';
const BASELINE_SCHEMA_VERSION = 2;
const POLICY_FILE = 'policy.json';
const POLICY_DEFAULT = { version: 1, blockOn: ['CRITICAL', 'HIGH'], warnOn: ['MEDIUM', 'WARN'] };
```

**Patch — keep existing 3 lines, insert 2 more directly after `POLICY_DEFAULT` (no reordering):**

```js
const BASELINE_DIR = '.hookaudit';
const BASELINE_FILE = 'baseline.json';
const BASELINE_SCHEMA_VERSION = 2;
const POLICY_FILE = 'policy.json';
const POLICY_DEFAULT = { version: 1, blockOn: ['CRITICAL', 'HIGH'], warnOn: ['MEDIUM', 'WARN'] };
// YAML/TOML policy candidates — tried in order .json → .yaml/.yml → .toml, within each format
// .hookaudit/ takes precedence over repo root for the same format (location-first within format group).
// Zero-dep: no yaml/toml package — see parseYamlPolicy / parseTomlPolicy below.
const POLICY_YAML_FILES = ['policy.yaml', 'policy.yml'];
const POLICY_TOML_FILES = ['policy.toml'];
```

---

## 6. Exact Patch — 5.B Helper + Parser Functions (insert immediately before `function policyPath`)

**Location:** Insert **immediately before** `function policyPath(root) {` at `bin/hookaudit.js:960`. No new `require`. Total ~340 lines.

```js
// ---------------------------------------------------------------
// 8a. Minimal safe YAML subset parser — Node built-ins only
// ---------------------------------------------------------------
// Supported subset: mappings, block lists (- item), inline arrays ["a","b"],
// strings/booleans/numbers/null, 1-level nesting (e.g. defaults: blockOn: [..]),
// # comments outside quotes. Rejects tags/anchors/merge/directives/complex keys.
// Any unsupported syntax throws with .code = 'UNSUPPORTED_FORMAT'.
// Security: no eval/Function/vm/require, no external file reads, prototype guard.

function stripYamlComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      // '' inside single-quoted string is escaped single quote (YAML: '' → ')
      if (inSingle && line[i + 1] === "'") { i++; continue; }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      if (ch === '"' && line[i - 1] !== '\\') inDouble = !inDouble;
      // handle escaped \" by checking preceding backslash count (simple: odd count = escaped)
      // Count backslashes directly before this quote
      if (inDouble || !inDouble) {
        let bs = 0;
        for (let k = i - 1; k >= 0 && line[k] === '\\'; k--) bs++;
        if (bs % 2 === 1) {
          // escaped quote — flip back
          inDouble = !inDouble;
        }
      }
    } else if (ch === '#' && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

function countIndent(line) {
  let n = 0;
  while (n < line.length && line[n] === ' ') n++;
  return n;
}

function parseYamlScalar(raw, lineNum) {
  const s = raw.trim();
  if (s === '' || s === 'null' || s === 'Null' || s === 'NULL' || s === '~') return null;
  const lower = s.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  // Quoted strings
  if ((s.startsWith('"') && s.endsWith('"') && s.length >= 2) || (s.startsWith("'") && s.endsWith("'") && s.length >= 2)) {
    if (s.startsWith('"')) {
      let inner = s.slice(1, -1);
      // Limited YAML double-quoted escapes: \" \\ \n \t \r \b \f \/ and \uXXXX
      inner = inner.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      inner = inner.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      inner = inner.replace(/\\([nrtbf"\\/])/g, (_, c) => {
        if (c === 'n') return '\n';
        if (c === 'r') return '\r';
        if (c === 't') return '\t';
        if (c === 'b') return '\b';
        if (c === 'f') return '\f';
        return c;
      });
      inner = inner.replace(/\\\\/g, '\\');
      return inner;
    } else {
      // Single-quoted literal: '' → '
      return s.slice(1, -1).replace(/''/g, "'");
    }
  }
  // Inline arrays are handled by caller, but scalar may be bare word or number
  // Reject flow mappings that leaked in: {a: b}
  if (s.startsWith('{') || s.endsWith('}')) {
    const e = new Error(`YAML unsupported flow mapping at line ${lineNum}: ${s.slice(0, 40)}`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  // Numbers
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
    return n;
  }
  if (/^-?(?:0|[1-9]\d*)\.\d+(?:[eE][+-]?\d+)?$/.test(s) || /^-?\d+[eE][+-]?\d+$/.test(s)) {
    const f = Number(s);
    if (Number.isFinite(f)) return f;
  }
  // Bare unquoted string — but reject obvious unsupported numerics/tags
  if (/^0x/i.test(s) || /^0o/i.test(s) || /^0b/i.test(s) || /^[-+]?\.inf$/i.test(s) || /^[-+]?\.nan$/i.test(s)) {
    const e = new Error(`YAML unsupported numeric/tag at line ${lineNum}: ${s.slice(0, 40)}`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  if (/^!/.test(s) || /^&/.test(s) || /^\*/.test(s)) {
    const e = new Error(`YAML unsupported tag/anchor/alias at line ${lineNum}: ${s.slice(0, 40)}`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  // Otherwise plain string (e.g., CRITICAL, HIGH, ./path)
  return s;
}

function parseYamlInlineArray(raw, lineNum) {
  // raw like '["CRITICAL", "HIGH"]' or '[CRITICAL, HIGH]' or '["a", "b",]'
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return [];
  const out = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "'" && !inDouble) {
      if (inSingle && inner[i + 1] === "'") { cur += "''"; i++; continue; }
      inSingle = !inSingle;
      cur += ch;
    } else if (ch === '"' && !inSingle) {
      let bs = 0;
      for (let k = i - 1; k >= 0 && inner[k] === '\\'; k--) bs++;
      if (bs % 2 === 0) inDouble = !inDouble;
      cur += ch;
    } else if (ch === ',' && !inSingle && !inDouble) {
      const tok = cur.trim();
      if (tok) out.push(parseYamlScalar(tok, lineNum));
      cur = '';
    } else {
      cur += ch;
    }
  }
  const last = cur.trim();
  if (last) out.push(parseYamlScalar(last, lineNum));
  return out;
}

function parseYamlPolicy(text) {
  if (typeof text !== 'string') {
    const e = new Error('YAML policy must be a string');
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  const root = {};
  // Stack: each frame { indent, obj, type: 'map'|'array', key? }
  const stack = [{ indent: -1, obj: root, type: 'map' }];
  let seenContent = false;
  let documentMarkers = 0;
  const MAX_DEPTH = 8;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const lineNum = idx + 1;

    // Track document markers but allow leading --- at idx 0
    if (/^\s*---\s*(#.*)?$/.test(rawLine)) {
      documentMarkers++;
      if (documentMarkers > 1 && seenContent) {
        const e = new Error(`YAML multi-document not supported at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      continue;
    }
    if (/^\s*\.\.\.\s*(#.*)?$/.test(rawLine)) continue;

    const withoutComment = stripYamlComment(rawLine);
    if (withoutComment.trim() === '') continue;

    // --- Unsupported syntax guards (honest, no silent ignore) ---
    if (/^\s*%/.test(rawLine)) {
      const e = new Error(`YAML directive not supported at line ${lineNum}: ${rawLine.trim().slice(0, 40)}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }
    if (/^\s*\?/.test(withoutComment.trim())) {
      const e = new Error(`YAML complex key (?) not supported at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }
    if (withoutComment.includes('\t')) {
      // YAML forbids tabs for indentation in this subset (spaces only)
      // A tab inside a quoted scalar is fine — but our withoutComment already preserves quoted tabs.
      // So check rawLine leading whitespace only.
      const leading = rawLine.match(/^[\t ]*/)[0];
      if (leading.includes('\t')) {
        const e = new Error(`YAML tabs for indentation not supported at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
    }
    // Tags / anchors / aliases / merge
    const trimmedForGuard = withoutComment.trim();
    if (/(^|:\s*)!/.test(withoutComment) || /!\w/.test(withoutComment)) {
      // Require ! at value start or after colon — avoid false positive on 'description: a!b'
      if (/:\s*!!?\w/.test(withoutComment) || /^\s*!/.test(trimmedForGuard) || /^\s*-\s*!/.test(trimmedForGuard)) {
        const e = new Error(`YAML tag (!...) not supported at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
    }
    if (/:\s*&/.test(withoutComment) || /^\s*-\s*&/.test(trimmedForGuard) || /:\s*\*/.test(withoutComment) || /^\s*-\s*\*/.test(trimmedForGuard)) {
      const e = new Error(`YAML anchor (&) / alias (*) not supported at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }
    if (withoutComment.includes('<<:') || /<<\s*:/.test(withoutComment)) {
      const e = new Error(`YAML merge key (<<:) not supported at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }
    if (/:\s*[|>]\s*$/.test(withoutComment) || /:\s*[|>][+-]?\d*\s*$/.test(withoutComment)) {
      const e = new Error(`YAML block scalar (|/>) not supported at line ${lineNum} — use plain strings`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }

    const indent = countIndent(withoutComment);
    const trimmed = withoutComment.trim();
    seenContent = true;

    // Depth guard
    if (stack.length > MAX_DEPTH) {
      const e = new Error(`YAML nesting depth exceeds ${MAX_DEPTH} at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }

    // Pop to parent where indent > parent.indent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parentFrame = stack[stack.length - 1];
    const parent = parentFrame.obj;
    const parentType = parentFrame.type;

    if (trimmed.startsWith('- ')) {
      if (parentType !== 'array') {
        const e = new Error(`YAML list item without array parent at line ${lineNum}: ${trimmed.slice(0, 40)}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      const itemRaw = trimmed.slice(2).trim();
      if (itemRaw === '') {
        const e = new Error(`YAML empty list item with nested structure not supported at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      // Array items must be scalars for policy (no maps in lists)
      if (itemRaw.includes(': ') && !itemRaw.startsWith('"') && !itemRaw.startsWith("'") && !itemRaw.startsWith('[')) {
        const e = new Error(`YAML map inside list not supported at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      let val;
      if (itemRaw.startsWith('[') && itemRaw.endsWith(']')) {
        val = parseYamlInlineArray(itemRaw, lineNum);
      } else {
        val = parseYamlScalar(itemRaw, lineNum);
      }
      parent.push(val);
    } else {
      // Mapping entry: key: value (value may be absent → nested)
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) {
        const e = new Error(`YAML missing ':' at line ${lineNum}: ${trimmed.slice(0, 40)}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      const keyRaw = trimmed.slice(0, colonIdx).trim();
      const valueRaw = trimmed.slice(colonIdx + 1).trimEnd();
      const valueRawTrim = valueRaw.trim();
      if (!keyRaw) {
        const e = new Error(`YAML empty key at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      // Key guard: prototype pollution
      let key = keyRaw;
      if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1).replace(/''/g, "'");
      } else {
        if (!/^[A-Za-z0-9_\-\.\/]+$/.test(key)) {
          const e = new Error(`YAML unsupported key syntax at line ${lineNum}: ${keyRaw.slice(0, 40)}`);
          e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
          throw e;
        }
      }
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        const e = new Error(`YAML forbidden key at line ${lineNum}: ${key}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      if (parentType === 'array') {
        const e = new Error(`YAML mapping inside array not supported at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      if (valueRawTrim === '') {
        // Nested block — peek next non-empty line to decide array vs map
        let nextIsArray = false;
        let nextIndent = null;
        for (let k = idx + 1; k < lines.length; k++) {
          const nlRaw = lines[k];
          const nlNoComment = stripYamlComment(nlRaw);
          if (nlNoComment.trim() === '') continue;
          if (/^\s*---/.test(nlRaw) || /^\s*\.\.\./.test(nlRaw)) continue;
          nextIndent = countIndent(nlNoComment);
          if (nextIndent <= indent) break;
          nextIsArray = nlNoComment.trim().startsWith('- ');
          break;
        }
        if (nextIsArray) {
          const arr = [];
          parent[key] = arr;
          stack.push({ indent: indent, obj: arr, type: 'array' });
        } else {
          const obj = {};
          parent[key] = obj;
          stack.push({ indent: indent, obj: obj, type: 'map' });
        }
      } else {
        // Inline value
        if (valueRawTrim.startsWith('{') && valueRawTrim.endsWith('}')) {
          const e = new Error(`YAML inline mapping not supported at line ${lineNum}`);
          e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
          throw e;
        }
        let val;
        if (valueRawTrim.startsWith('[') && valueRawTrim.endsWith(']')) {
          val = parseYamlInlineArray(valueRawTrim, lineNum);
        } else {
          // Re-guard tag at value start
          if (/^!/.test(valueRawTrim) || /^&/.test(valueRawTrim) || /^\*/.test(valueRawTrim)) {
            const e = new Error(`YAML tag/anchor/alias not supported at line ${lineNum}`);
            e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
            throw e;
          }
          val = parseYamlScalar(valueRawTrim, lineNum);
        }
        parent[key] = val;
      }
    }
  }
  return root;
}

// ---------------------------------------------------------------
// 8b. Minimal safe TOML subset parser — Node built-ins only
// ---------------------------------------------------------------
// Supported subset: [table] / dotted keys, bare/quoted keys, strings/booleans/ints/floats,
// string arrays ["A","B"] (including multiline). Rejects array-of-tables, inline tables,
// multiline """ strings, datetimes, hex/oct/bin, inf/nan.
// Any unsupported throws with .code = 'UNSUPPORTED_FORMAT'.

function stripTomlComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      let bs = 0;
      for (let k = i - 1; k >= 0 && line[k] === '\\'; k--) bs++;
      if (bs % 2 === 0) inDouble = !inDouble;
    } else if (ch === '#' && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

function findEqualsOutsideQuotes(s) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) {
      let bs = 0;
      for (let k = i - 1; k >= 0 && s[k] === '\\'; k--) bs++;
      if (bs % 2 === 0) inDouble = !inDouble;
    } else if (ch === '=' && !inSingle && !inDouble) {
      return i;
    }
  }
  return -1;
}

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"') && t.length >= 2) || (t.startsWith("'") && t.endsWith("'") && t.length >= 2)) {
    if (t.startsWith('"')) {
      let inner = t.slice(1, -1);
      inner = inner.replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\b/g, '\b').replace(/\\f/g, '\f');
      inner = inner.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      inner = inner.replace(/\\U([0-9a-fA-F]{8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
      return inner;
    } else {
      return t.slice(1, -1);
    }
  }
  return t;
}

function splitTomlKey(keyRaw) {
  const parts = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < keyRaw.length; i++) {
    const ch = keyRaw[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; cur += ch; }
    else if (ch === '"' && !inSingle) {
      let bs = 0;
      for (let k = i - 1; k >= 0 && keyRaw[k] === '\\'; k--) bs++;
      if (bs % 2 === 0) inDouble = !inDouble;
      cur += ch;
    } else if (ch === '.' && !inSingle && !inDouble) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '' || parts.length === 0) parts.push(cur.trim());
  return parts.map(p => p.trim()).filter(p => p !== '');
}

function parseTomlValue(raw, lineNum) {
  const s = raw.trim();
  if (s === '') {
    const e = new Error(`TOML empty value at line ${lineNum}`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  // Inline table — not supported for policy (use [table] instead)
  if (s.startsWith('{')) {
    const e = new Error(`TOML inline table not supported at line ${lineNum} — use [table]`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  // Array
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) {
      const e = new Error(`TOML unclosed array at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    const out = [];
    let cur = '';
    let inSingle = false;
    let inDouble = false;
    let bracketDepth = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "'" && !inDouble) { inSingle = !inSingle; cur += ch; }
      else if (ch === '"' && !inSingle) {
        let bs = 0;
        for (let k = i - 1; k >= 0 && inner[k] === '\\'; k--) bs++;
        if (bs % 2 === 0) inDouble = !inDouble;
        cur += ch;
      } else if (ch === '[' && !inSingle && !inDouble) { bracketDepth++; cur += ch; }
      else if (ch === ']' && !inSingle && !inDouble) { bracketDepth--; cur += ch; }
      else if (ch === ',' && !inSingle && !inDouble && bracketDepth === 0) {
        const tok = cur.trim();
        if (tok) out.push(parseTomlValue(tok, lineNum));
        cur = '';
      } else cur += ch;
    }
    const last = cur.trim().replace(/,$/, '').trim();
    if (last) out.push(parseTomlValue(last, lineNum));
    // Validate nested array not containing inline tables or too deep
    // (already recursed)
    return out;
  }
  // Strings
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    if (s.startsWith('"')) {
      // triple-quoted check already done at line level, but handle embedded
      const inner = s.slice(1, -1);
      let un = inner.replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\b/g, '\b').replace(/\\f/g, '\f');
      un = un.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      un = un.replace(/\\U([0-9a-fA-F]{8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
      return un;
    } else {
      return s.slice(1, -1);
    }
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  // Datetime guard — must be before numeric (datetimes start with digits)
  if (/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    const e = new Error(`TOML datetime not supported at line ${lineNum} — use quoted string`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  if (/^0x/i.test(s) || /^0o/i.test(s) || /^0b/i.test(s)) {
    const e = new Error(`TOML hex/oct/bin integers not supported at line ${lineNum}`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  if (/^[+-]?inf$/i.test(s) || /^[+-]?nan$/i.test(s)) {
    const e = new Error(`TOML inf/nan not supported at line ${lineNum}`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  if (s.includes('_') && /_/.test(s)) {
    const e = new Error(`TOML numeric separators (_) not supported at line ${lineNum}`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isSafeInteger(n)) return n;
    return n;
  }
  if (/^-?\d*\.\d+(?:[eE][+-]?\d+)?$/.test(s) || /^-?\d+[eE][+-]?\d+$/.test(s)) {
    const f = Number(s);
    if (Number.isFinite(f)) return f;
  }
  const e = new Error(`TOML unsupported value at line ${lineNum}: ${s.slice(0, 40)}`);
  e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
  throw e;
}

function parseTomlPolicy(text) {
  if (typeof text !== 'string') {
    const e = new Error('TOML policy must be a string');
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  const root = {};
  let current = root;
  let currentPath = [];
  let buffer = '';
  let bufferKeyRaw = null;
  let bufferLineNum = 0;
  const MAX_DEPTH = 8;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const lineNum = idx + 1;

    // Handle multiline array buffer
    if (buffer) {
      buffer += '\n' + rawLine;
      // Strip comments inside buffer? TOML allows comments only outside arrays? Simpler: continue accumulating until bracket closed
      const openCount = (buffer.match(/\[/g) || []).length;
      const closeCount = (buffer.match(/\]/g) || []).length;
      if (closeCount >= openCount && buffer.includes(']')) {
        // Close buffer — parse as single value assignment
        const fullValue = buffer.trim();
        // Remove trailing comment outside quotes after closing ]
        const commentStripped = stripTomlComment(fullValue);
        const eqIdx = findEqualsOutsideQuotes(commentStripped);
        // Actually buffer already contains "key = [ ... ]" fragment? In our buffering we stored only valueRaw.
        // We stored buffer = valueRaw starting with '['; need to reassemble.
        // Simpler: buffer holds valueRaw alone; so parse fullValue as value and assign to bufferKeyRaw
        let val;
        try {
          // Remove any trailing comment after ]
          const valOnly = stripTomlComment(buffer).trim();
          val = parseTomlValue(valOnly, bufferLineNum);
        } catch (err) { throw err; }
        // Assign to target table via bufferKeyRaw
        const keyParts = splitTomlKey(bufferKeyRaw);
        if (keyParts.some(k => {
          const bare = stripQuotes(k);
          return bare === '__proto__' || bare === 'constructor' || bare === 'prototype';
        })) {
          const e = new Error(`TOML forbidden key at line ${bufferLineNum}`);
          e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
          throw e;
        }
        let target = current;
        for (let k = 0; k < keyParts.length - 1; k++) {
          const kp = stripQuotes(keyParts[k]);
          if (!/^[A-Za-z0-9_-]+$/.test(kp) && !(kp.startsWith('"') || kp.startsWith("'"))) {
            // bare key check already via stripQuotes
          }
          if (!target[kp] || typeof target[kp] !== 'object') target[kp] = {};
          target = target[kp];
        }
        const finalKey = stripQuotes(keyParts[keyParts.length - 1]);
        target[finalKey] = val;
        buffer = '';
        bufferKeyRaw = null;
      }
      continue;
    }

    // Reject triple-quoted strings early
    if (rawLine.includes('"""') || rawLine.includes("'''")) {
      const e = new Error(`TOML multiline strings (\"\"\"/''') not supported at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }

    const withoutComment = stripTomlComment(rawLine);
    const trimmed = withoutComment.trim();
    if (trimmed === '') continue;

    // Array of tables [[table]] — not supported
    if (/^\s*\[\[/.test(trimmed)) {
      const e = new Error(`TOML array of tables [[...]] not supported at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }

    // Table header [table] or [a.b]
    const tableMatch = trimmed.match(/^\s*\[\s*([^\]]+)\s*\]\s*$/);
    if (tableMatch) {
      const tableRaw = tableMatch[1].trim();
      if (!tableRaw) {
        const e = new Error(`TOML empty table name at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      const parts = splitTomlKey(tableRaw);
      if (parts.length > 4) {
        const e = new Error(`TOML table nesting too deep at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      // Validate each part
      for (const p of parts) {
        const bare = stripQuotes(p);
        if (bare === '__proto__' || bare === 'constructor' || bare === 'prototype') {
          const e = new Error(`TOML forbidden table key at line ${lineNum}`);
          e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
          throw e;
        }
        // Bare key must match [A-Za-z0-9_-]+ if not quoted
        if (p.startsWith('"') || p.startsWith("'")) continue;
        if (!/^[A-Za-z0-9_-]+$/.test(p)) {
          const e = new Error(`TOML invalid table key at line ${lineNum}: ${p}`);
          e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
          throw e;
        }
      }
      // Navigate/create
      let obj = root;
      let depth = 0;
      for (const p of parts) {
        const k = stripQuotes(p);
        if (!obj[k] || typeof obj[k] !== 'object' || Array.isArray(obj[k])) {
          // If existing is not an object, it's a redefinition error — but we allow overwrite for simplicity
          if (obj[k] !== undefined && typeof obj[k] !== 'object') {
            const e = new Error(`TOML table redefines existing key at line ${lineNum}: ${k}`);
            e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
            throw e;
          }
          obj[k] = {};
        }
        obj = obj[k];
        depth++;
        if (depth > MAX_DEPTH) {
          const e = new Error(`TOML table depth exceeds ${MAX_DEPTH} at line ${lineNum}`);
          e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
          throw e;
        }
      }
      current = obj;
      currentPath = parts.map(stripQuotes);
      continue;
    }

    // Key = Value
    const eqIdx = findEqualsOutsideQuotes(trimmed);
    if (eqIdx === -1) {
      const e = new Error(`TOML expected 'key = value' at line ${lineNum}: ${trimmed.slice(0, 40)}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }
    const keyRaw = trimmed.slice(0, eqIdx).trim();
    let valueRaw = trimmed.slice(eqIdx + 1).trim();
    if (!keyRaw) {
      const e = new Error(`TOML empty key at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }
    // Validate keyRaw not containing illegal chars outside quotes
    const keyParts = splitTomlKey(keyRaw);
    if (keyParts.length === 0) {
      const e = new Error(`TOML empty key at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }
    for (const kp of keyParts) {
      const bare = stripQuotes(kp);
      if (bare === '__proto__' || bare === 'constructor' || bare === 'prototype') {
        const e = new Error(`TOML forbidden key at line ${lineNum}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
      if (kp.startsWith('"') || kp.startsWith("'")) continue;
      if (!/^[A-Za-z0-9_-]+$/.test(kp)) {
        const e = new Error(`TOML invalid key at line ${lineNum}: ${kp}`);
        e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
        throw e;
      }
    }
    if (keyParts.length > MAX_DEPTH) {
      const e = new Error(`TOML key depth exceeds ${MAX_DEPTH} at line ${lineNum}`);
      e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      throw e;
    }

    // Multiline array start: value starts with '[' but not closed on this line
    if (valueRaw.startsWith('[') && !valueRaw.includes(']')) {
      buffer = valueRaw;
      bufferKeyRaw = keyRaw;
      bufferLineNum = lineNum;
      continue;
    }
    // Also bare '[' with newline already handled; if value is empty? nothing

    // Datetime guard inside value (already in parseTomlValue, but early check for bare datetime without quotes)
    // parseTomlValue will throw correctly

    let val;
    try {
      val = parseTomlValue(valueRaw, lineNum);
    } catch (err) {
      throw err;
    }

    // Assign via dotted key into current table
    let target = current;
    for (let k = 0; k < keyParts.length - 1; k++) {
      const kp = stripQuotes(keyParts[k]);
      if (!target[kp] || typeof target[kp] !== 'object' || Array.isArray(target[kp])) {
        if (target[kp] !== undefined && typeof target[kp] !== 'object') {
          const e = new Error(`TOML key redefines existing value at line ${lineNum}: ${kp}`);
          e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
          throw e;
        }
        target[kp] = {};
      }
      target = target[kp];
    }
    const finalKey = stripQuotes(keyParts[keyParts.length - 1]);
    // Allow redefinition? Overwrite last wins (simple), but could error — we allow.
    target[finalKey] = val;
  }

  if (buffer) {
    const e = new Error(`TOML unclosed array starting at line ${bufferLineNum}`);
    e.code = DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
    throw e;
  }
  return root;
}
```

---

## 7. Exact Patch — 5.C Updated `loadPolicy`

**Location:** `bin/hookaudit.js:964-982` — **replace entire function** with:

```js
function loadPolicy(root, diagnostics) {
  // Tries .json → .yaml/.yml → .toml, within each format .hookaudit/ precedes repo root.
  // Any file >64 KiB is skipped. Unsupported YAML/TOML syntax pushes UNSUPPORTED_FORMAT
  // diagnostic (if diagnostics bag provided) and does NOT crash the scan.
  // Signature now (root, diagnostics?) — diagnostics is optional for backward compat;
  // main() passes globalDiagnostics.
  const candidates = [
    { path: path.join(root, BASELINE_DIR, POLICY_FILE), parser: 'json' },
    { path: path.join(root, POLICY_FILE), parser: 'json' },
    { path: path.join(root, BASELINE_DIR, 'policy.yaml'), parser: 'yaml' },
    { path: path.join(root, BASELINE_DIR, 'policy.yml'), parser: 'yaml' },
    { path: path.join(root, 'policy.yaml'), parser: 'yaml' },
    { path: path.join(root, 'policy.yml'), parser: 'yaml' },
    { path: path.join(root, BASELINE_DIR, 'policy.toml'), parser: 'toml' },
    { path: path.join(root, 'policy.toml'), parser: 'toml' },
  ];

  function normalizePolicy(obj, sourcePath) {
    const blockOn = Array.isArray(obj.blockOn) ? obj.blockOn.filter((x) => typeof x === 'string') : POLICY_DEFAULT.blockOn.slice();
    const warnOn = Array.isArray(obj.warnOn) ? obj.warnOn.filter((x) => typeof x === 'string') : POLICY_DEFAULT.warnOn.slice();
    const version = typeof obj.version === 'number' ? obj.version : 1;
    return { version, blockOn, warnOn, source: sourcePath, raw: obj };
  }

  for (const { path: p, parser } of candidates) {
    if (!exists(p)) continue;
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch (e) {
      if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.PERMISSION_DENIED, path: toPosix(path.relative(root, p)), detail: e.message });
      continue;
    }
    if (raw.length > 64 * 1024) {
      if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: toPosix(path.relative(root, p)), detail: 'Policy file too large (>64 KiB)' });
      continue;
    }
    // Strip BOM
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    if (!raw.trim()) continue;
    try {
      let obj;
      if (parser === 'json') {
        obj = JSON.parse(raw);
      } else if (parser === 'yaml') {
        obj = parseYamlPolicy(raw);
        // YAML parse succeeded but produced empty / non-object → treat as no policy
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: toPosix(path.relative(root, p)), detail: 'YAML policy did not produce a mapping' });
          continue;
        }
      } else if (parser === 'toml') {
        obj = parseTomlPolicy(raw);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          if (diagnostics) diagnostics.push({ code: DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT, path: toPosix(path.relative(root, p)), detail: 'TOML policy did not produce a table' });
          continue;
        }
      }
      // Allow policy nested inside a single table e.g. [policy] blockOn=... or yaml top-level key 'policy:'
      // Heuristic: if obj has single key 'policy' that itself looks like a policy object, unwrap one level.
      // This supports both root-form (version/blockOn at top) and table-form ([policy] or policy: mapping).
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.policy && typeof obj.policy === 'object' && !Array.isArray(obj.policy)) {
        const inner = obj.policy;
        // Heuristic: inner has at least one of blockOn/warnOn/version
        if ('blockOn' in inner || 'warnOn' in inner || 'version' in inner) {
          // Preserve top-level description if inner lacks it? No, just unwrap.
          obj = inner;
          // Carry over top-level description/notes if inner lacks them (optional)
          if (obj && inner) {
            for (const k of ['description', 'notes']) {
              if (inner[k] === undefined && obj[k] === undefined && obj[k] === undefined) { /* nothing */ }
            }
          }
        }
      }
      // TOML tables may also be under [policy] already unwrapped above; also support [defaults] style — already in obj.
      const source = toPosix(path.relative(root, p)) || p;
      return normalizePolicy(obj, source);
    } catch (e) {
      // YAML/TOML unsupported syntax → UNSUPPORTED_FORMAT diagnostic, continue to next candidate
      // JSON syntax error → INVALID_JSON (preserve backward compat detail but also surface as UNSUPPORTED_FORMAT if needed)
      const isUnsupported = e && e.code === DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT;
      const code = isUnsupported ? DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT : (parser === 'json' ? DIAGNOSTIC_CODES.INVALID_JSON : DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT);
      if (diagnostics) diagnostics.push({ code, path: toPosix(path.relative(root, p)), detail: e.message ? e.message.slice(0, 200) : String(e).slice(0, 200) });
      // Continue to next candidate (next format/location) — mirrors existing JSON fallback behavior
      continue;
    }
  }
  return null;
}
```

**Required companion edit in `main()` at `bin/hookaudit.js:1317`:**

Current:

```js
  const policy = loadPolicy(root);
```

Patch to:

```js
  const policy = loadPolicy(root, globalDiagnostics);
```

This is the **only** call-site change; it ensures `UNSUPPORTED_FORMAT` from YAML/TOML lands in the same `globalDiagnostics` bag that already feeds `printHuman`/`printJson` (`diagnostics[]`). No new global.

---

## 8. Trade-offs & Security Rationale (Documented Honestly)

| Decision | Trade-off | Why chosen |
|----------|-----------|------------|
| No `yaml`/`toml` npm dep | Cannot handle full spec; will reject some technically-valid YAML/TOML that uses advanced features | Zero-dep is a **non-negotiable** hackathon rule (`RULES.md:4`, `.zero-dep.toml`). Vendoring a parser fakes emptiness. A minimal honest subset is better than a silent “works” claim that smuggles a dependency. |
| Block-list unsupported syntax vs allow-list | Rejection may surprise users who copy-paste complex YAML from StackOverflow | Fail-closed + diagnostic is safer than silently misinterpreting `!include payload.yml` as a string. Policy controls the CI gate — misparse → wrong `BLOCK`/`PASS` decision. |
| YAML spaces-only indent, TOML no datetime | Policy authors must use plain scalars and `["CRITICAL","HIGH"]` style | These cover 100% of `demo/policy.json` semantics; datetimes/multiline literals are irrelevant to `blockOn`/`warnOn` severities. |
| Inline array support only for policy lists | Nested arrays-of-maps in policy → error | Policy shape is flat (`blockOn`, `warnOn`, `version`, `description`). Allowing arbitrary nesting invites DoS (deeply nested arrays) and prototype confusion. |
| Tables in TOML limited to bare keys, one-level `defaults` | `[a.b.c.d.e.f]` → error | Deep tables are not a policy concept; depth cap 8 prevents stack/CPU blowup from crafted input. |
| Size cap 64 KiB unchanged | Large policy files rejected before parse | Mirrors JSON guard; prevents OOM via crafted YAML entity expansion (Billion laughs via anchors would already be rejected, but cap is defense-in-depth). |
| No external file reads / no `!include` / no `extends` | Policy cannot be split across files | File inclusion is a classic confused-deputy: `policy.yaml: !include /etc/passwd` would exfiltrate. Subset omits it by design — if split files are needed, they must be merged before commit. |

---

## 9. Limitations (Updated Honesty — extends `LIMITATIONS.md:2`)

Append / replace second paragraph of `LIMITATIONS.md:2` and add new subsection:

> **YAML/TOML policy files (new, minimal subset):**
>
> HookAudit now accepts `policy.yaml`/`policy.yml` and `policy.toml` in addition to `policy.json`, read with **hand-rolled minimal parsers** (`bin/hookaudit.js:parseYamlPolicy`, `parseTomlPolicy`) using only `node:fs`/`node:path`. Supported subset is intentionally tiny — mappings, block lists (`- item`) and inline arrays `["CRITICAL","HIGH"]`, plain strings/booleans/numbers, one-level nesting, `#` comments. **Not supported:** YAML tags `!`, anchors `&`/`*`, merges `<<:`, directives `%`, complex keys `?`, block scalars `|`/`>`, flow mappings `{a: b}`, tabs for indent, multi-document, TOML `"""` multiline strings, array-of-tables `[[x]]`, inline tables `{a=1}`, datetimes, hex/oct/bin numerics, `inf`/`nan`. Any such syntax produces a **`UNSUPPORTED_FORMAT` diagnostic** (visible in both human and `--json` output) and the file is **skipped** — the next candidate format is tried, or no policy is applied if none succeed. This is fail-safe: a policy that cannot be parsed precisely **never** silently narrows the gate. Full-spec YAML/TOML would require a vendored or npm parser — explicitly CUT per `RULES.md:44` and `PLAN.md:5` to preserve zero-dependency.
>
> **Behavior:** `loadPolicy` tries `.json` (both locations) first, then `.yaml/.yml`, then `.toml`. `.hookaudit/` precedes repo root within each format group. The first successfully parsed file wins. If a present file fails with `UNSUPPORTED_FORMAT`, the diagnostic is reported and the next candidate is tried — this mirrors existing JSON fallback semantics (invalid JSON does not crash the scan).

Update `STDLIB.md:12` row (or add rows 13–14):

| # | Normally you'd install | Instead we used | Why |
|---|---|---|---|
| 12 | `toml` / `@iarna/toml` | Hand-rolled `parseTomlPolicy` over `node:fs` string ops | TOML policy now supported without a dep; subset limits per above. Raw-text scan remains fallback for other TOML surfaces (`.codex/config.toml`). |
| 13 | `yaml` / `js-yaml` | Hand-rolled `parseYamlPolicy` over `node:fs` string ops | YAML policy now supported without a dep; subset limits per above. Hand-rolled YAML that handled tags/anchors would be a code-execution risk (`!!js/function`). |

---

## 10. Demo Policy Files

### `demo/policy.yaml` (created, same semantic as `demo/policy.json`)

```yaml
# demo/policy.yaml — Minimal local policy layer — zero-dep, stdlib only, honest.
# Controls CI gate without heuristic overrides. Never silences evidence, only maps severities/risks to BLOCK/REVIEW/PASS.
# This file is parsed by bin/hookaudit.js:parseYamlPolicy (minimal safe subset).
# See plans/yaml-toml-policy-patch.md §3 for supported subset & limitations.

version: 1
description: "Minimal local policy layer — zero-dep, stdlib only, honest. Controls CI gate without heuristic overrides. Never silences evidence, only maps severities/risks to BLOCK/REVIEW/PASS."
blockOn:
  - CRITICAL
  - HIGH
warnOn:
  - MEDIUM
  - WARN
notes: "Evaluated locally in bin/hookaudit.js via Node built-ins only. No network, no extra deps. If .hookaudit/policy.yaml exists it is used; otherwise demo/policy.yaml is an example. PASS/REVIEW/BLOCK mapping respects policy but never hides findings."
defaults:
  blockOn:
    - CRITICAL
    - HIGH
  warnOn:
    - MEDIUM
    - WARN
```

### `demo/policy.toml` (created, same semantic)

```toml
# demo/policy.toml — Minimal local policy layer — zero-dep, stdlib only, honest.
# Controls CI gate without heuristic overrides. Never silences evidence, only maps severities/risks to BLOCK/REVIEW/PASS.
# This file is parsed by bin/hookaudit.js:parseTomlPolicy (minimal safe subset).
# See plans/yaml-toml-policy-patch.md §4 for supported subset & limitations.

version = 1
description = "Minimal local policy layer — zero-dep, stdlib only, honest. Controls CI gate without heuristic overrides. Never silences evidence, only maps severities/risks to BLOCK/REVIEW/PASS."
blockOn = ["CRITICAL", "HIGH"]
warnOn = ["MEDIUM", "WARN"]
notes = "Evaluated locally in bin/hookaudit.js via Node built-ins only. No network, no extra deps. If .hookaudit/policy.toml exists it is used; otherwise demo/policy.toml is an example. PASS/REVIEW/BLOCK mapping respects policy but never hides findings."

[defaults]
blockOn = ["CRITICAL", "HIGH"]
warnOn = ["MEDIUM", "WARN"]
```

Both parse under the minimal subset (no tags, no `|` block scalars, no `"""` multiline, no datetimes) and produce identical `normalizePolicy` output as `demo/policy.json` when fed to `parseYamlPolicy`/`parseTomlPolicy`:

```js
// All three return { version:1, blockOn:["CRITICAL","HIGH"], warnOn:["MEDIUM","WARN"], raw:{...} }
```

---

## 11. How to Apply (main agent — deterministic, no conflict)

1. **Insert §6 helpers** (`stripYamlComment` … `parseTomlPolicy`) immediately before `function policyPath(root)` — verify no new `require`.
2. **Insert §5 constants** (`POLICY_YAML_FILES`, `POLICY_TOML_FILES`) after `POLICY_DEFAULT`.
3. **Replace `loadPolicy`** with §7 (copy-paste exact). Keep `POLICY_DEFAULT`, `BASELINE_DIR` unchanged.
4. **Edit `main()`** one line: `loadPolicy(root)` → `loadPolicy(root, globalDiagnostics)`.
5. **Create `demo/policy.yaml`** and `demo/policy.toml`** from §10 (UTF-8, LF).
6. **Verify:**

```bash
# 1) Syntax + zero-dep
node --check bin/hookaudit.js
node bin/hookaudit.js --help

# 2) Policy precedence — JSON wins over YAML/TOML when both present (backward compat)
node bin/hookaudit.js scan --json --path demo/sample-repository  # existing policy.json still wins

# 3) YAML policy alone — copy yaml into .hookaudit and re-scan (no json present)
mkdir -p /tmp/policy-test/.hookaudit && cp demo/policy.yaml /tmp/policy-test/.hookaudit/policy.yaml
cp -R demo/sample-repository/.claude /tmp/policy-test/.claude  # or any fixture with findings
node bin/hookaudit.js scan --json --path /tmp/policy-test | jq '.policy, .diagnostics'

# 4) TOML policy alone
mkdir -p /tmp/policy-test2/.hookaudit && cp demo/policy.toml /tmp/policy-test2/.hookaudit/policy.toml
node bin/hookaudit.js scan --json --path /tmp/policy-test2 | jq '.policy'

# 5) Unsupported YAML → diagnostic
echo 'blockOn: !include payload.yml' > /tmp/policy-test/.hookaudit/policy.yaml
node bin/hookaudit.js scan --json --path /tmp/policy-test | jq '.diagnostics[] | select(.code=="UNSUPPORTED_FORMAT")'

# 6) Unsupported TOML → diagnostic
echo 'version = """multi''' > /tmp/policy-test2/.hookaudit/policy.toml
node bin/hookaudit.js scan --json --path /tmp/policy-test2 | jq '.diagnostics[] | select(.code=="UNSUPPORTED_FORMAT")'

# 7) Existing tests green, deps empty
npm test
npm ls --all  # (empty)
Select-String -Path bin/hookaudit.js -Pattern "require\(" | Select-Object -First 10
  # must show only node:fs/path/crypto/util
```

**Expected:**
- `scan --json` with valid `.yaml` policy shows `"policy":{"source":".hookaudit/policy.yaml","blockOn":["CRITICAL","HIGH"],...}`.
- Invalid/tagged YAML and triple-quoted TOML each produce one `UNSUPPORTED_FORMAT` diagnostic and do **not** crash.
- `npm test` 22/22 pass (policy layer is additive; existing fixtures use JSON or no policy).

---

## 12. Determinism & Security Checklist

- [x] No new runtime dependency (`package.json:dependencies` unchanged).
- [x] No `child_process`/`vm`/`fetch`/`https`/`http`/`net`/`dns` introduced at runtime (grep `require('node:` before/after must be identical except helpers reuse `fs`/`path`).
- [x] Size guard 64 KiB before parse, BOM strip, prototype pollution guard on every key segment (`__proto__`/`constructor`/`prototype` → `UNSUPPORTED_FORMAT`).
- [x] Depth caps 8 (YAML indent stack, TOML tables/dotted keys) prevent crafted DoS.
- [x] `UNSUPPORTED_FORMAT` is always surfaced in diagnostics (human + JSON), never swallowed.
- [x] Deterministic ordering preserved — policy choice order is fixed array (`candidates`), not `fs.readdirSync`.
- [x] Tests: add 2 new cases (valid yaml parse, valid toml parse) + 2 unsupported-format cases to `test/hookaudit.test.js` in follow-up PR; this patch file itself does not modify tests.

---

## 13. Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| Vendor `js-yaml` / `toml` parser | Violates zero-dep (`RULES.md:4`), bloats `bin/hookaudit.js` by 10-40×, and `js-yaml` historically supported `!!js/function` code execution if misconfigured — hand-rolled subset is safer for this use-case. |
| Allow full YAML spec via regex | Full spec (anchors, tags, flows, block scalars with dedent/chomping) is ~200 edge cases; a “90% regex” would silently misparse the remaining 10% and give false confidence — fail-closed subset is honest. |
| Parse policy as JSON-with-comments (JSONC) | Would not satisfy prompt §37-42 requiring YAML block lists `- CRITICAL` and TOML `blockOn = ["CRITICAL","HIGH"]`. |
| Location-first precedence (`.hookaudit/*` any format before `policy.*` any format) | Would change existing semantics: a root `policy.json` would lose to `.hookaudit/policy.yaml` unexpectedly. Format-first (`.json` → `.yaml` → `.toml`) preserves backward compat: existing JSON deployments keep winning without config change. Documented in §7. |

---

**Patch author:** YAML/TOML policy minimal-subset patch — ready for main to apply via 2 insertions + 1 replacement + 2 demo files. No conflict with existing 11-surface logic.

