const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function setup(invoke) {
  let now = 1;
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/online-session.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Date: { now: () => now }, window: { potato: { invoke } } });
  return { ...exports, advance: ms => { now += ms; } };
}
test('session cache survives repeated navigation, expires and supports explicit refresh', async () => {
  const calls = [];
  const session = setup(async method => { calls.push(method); return { service: true, loggedIn: true }; });
  await session.connectOnline('netease');
  session.advance(10000); await session.connectOnline('netease');
  assert.equal(calls.length, 1);
  session.advance(300000); await session.connectOnline('netease');
  assert.equal(calls.length, 2);
  await session.connectOnline('netease', true); assert.equal(calls.length, 3);
  await session.connectOnline('qq'); assert.equal(calls.at(-1), 'qq.status');
  session.rememberOnlineStatus('netease', { service: true, loggedIn: false });
  assert.equal((await session.connectOnline('netease')).loggedIn, false, 'logout invalidates cached identity');
  assert.equal((await session.connectOnline('qq')).loggedIn, true, 'providers stay independent');
});
test('overlapping mounts share status and start requests', async () => {
  const calls = []; let release;
  const session = setup(async method => {
    calls.push(method);
    if (method.endsWith('.status')) await new Promise(resolve => { release = resolve; });
    return { service: method.endsWith('.startService'), canStart: true };
  });
  const first = session.connectOnline('netease');
  const second = session.connectOnline('netease'); assert.equal(first, second);
  release(); await first;
  assert.deepEqual(calls, ['netease.status', 'netease.startService']);
  await session.connectOnline('netease'); assert.equal(calls.length, 2);
});
test('failed automatic start retains retry information and never loops on navigation', async () => {
  const calls = [];
  const session = setup(async method => {
    calls.push(method);
    if (method.endsWith('.startService')) throw Error('fixture startup failure');
    return { service: false, canStart: true, apiBase: 'local fixture' };
  });
  await assert.rejects(session.connectOnline('netease'), /startup failure/);
  assert.equal(session.onlineStatus('netease').canStart, true);
  await session.connectOnline('netease'); assert.equal(calls.length, 2);
  await session.connectOnline('netease', true); assert.equal(calls.at(-1), 'netease.status');
  assert.equal(calls.filter(m => m.endsWith('.startService')).length, 1);
});
