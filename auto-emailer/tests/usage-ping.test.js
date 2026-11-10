'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { loadCodeGs } = require('./helpers');

test('VERSION is 0.1.1', () => {
  const { ctx } = loadCodeGs();
  assert.strictEqual(vm.runInContext('VERSION', ctx), '0.1.1');
});

test('fakes: UrlFetchApp records, UserProperties persists, getUuid is deterministic and unique', () => {
  const { ctx, fetches, props } = loadCodeGs();
  ctx.UrlFetchApp.fetch('https://x/y', { muteHttpExceptions: true });
  assert.deepStrictEqual(fetches, [{ url: 'https://x/y', options: { muteHttpExceptions: true } }]);
  ctx.PropertiesService.getUserProperties().setProperty('a', 'b');
  assert.strictEqual(ctx.PropertiesService.getUserProperties().getProperty('a'), 'b');
  assert.strictEqual(props.a, 'b');
  const u1 = ctx.Utilities.getUuid(), u2 = ctx.Utilities.getUuid();
  assert.match(u1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notStrictEqual(u1, u2);
  const { ctx: c2 } = loadCodeGs({ fetchThrows: true });
  assert.throws(() => c2.UrlFetchApp.fetch('u', {}));
});

// ---- Task 2: logUsage_ / classifyReason_ ----
const PING = 'https://ping.tejitpabari.com/ping?';
const parse = (url) => Object.fromEntries(new URL(url).searchParams.entries());
const UID = 'u_0a1b2c3d';

function withOrg(extra = {}) {
  return loadCodeGs({ props: { usage_org: 'Red Cross', usage_uid: UID }, ...extra });
}

test('logUsage_ builds the ping URL with fixed params, encoded values, random t, muteHttpExceptions', () => {
  const { ctx, fetches } = withOrg();
  ctx.logUsage_('batch_done', { mode: 'prod', n: 10, ok: 8, fail: 2 }, { x_stopped: 1, x_run: 'abcd1234efgh' });
  assert.strictEqual(fetches.length, 1);
  const { url, options } = fetches[0];
  assert.ok(url.startsWith(PING), url);
  assert.ok(url.includes('tool_type=script&tool_name=auto-emailer'), url);
  assert.strictEqual(JSON.stringify(options), '{"muteHttpExceptions":true}');
  assert.ok(url.includes('org=Red%20Cross'), 'org is encoded');
  const q = parse(url);
  assert.strictEqual(q.event, 'batch_done');
  assert.strictEqual(q.origin, 'google_script');
  assert.strictEqual(q.v, '0.1.1');
  assert.match(q.uid, /^u_[0-9a-f]{8}$/);
  assert.match(q.t, /^[0-9a-f]{8}$/);
  assert.strictEqual(q.x_run, 'abcd1234efgh');
  assert.strictEqual(q.x_stopped, '1');
  assert.strictEqual(q.mode, 'prod');
  assert.strictEqual(q.n, '10'); assert.strictEqual(q.ok, '8'); assert.strictEqual(q.fail, '2');
});

test('logUsage_ every key and value is encodeURIComponent-ed (org with reserved chars)', () => {
  const { ctx, fetches } = loadCodeGs({ props: { usage_org: 'A&B=C #1+x', usage_uid: UID } });
  ctx.logUsage_('batch_done', {}, {});
  const url = fetches[0].url;
  assert.ok(url.includes('org=' + encodeURIComponent('A&B=C #1+x')), url);
  assert.strictEqual(parse(url).org, 'A&B=C #1+x');
});

test('logUsage_ omits org when unset and still sends', () => {
  const { ctx, fetches } = loadCodeGs({ props: { usage_uid: UID } });
  ctx.logUsage_('batch_done', { mode: 'test' }, {});
  assert.strictEqual(fetches.length, 1);
  assert.ok(!('org' in parse(fetches[0].url)));
});

test('logUsage_ creates and reuses a uid when none stored', () => {
  const { ctx, fetches, props } = loadCodeGs({ props: { usage_org: 'Red Cross' } });
  ctx.logUsage_('batch_done', {}, {});
  ctx.logUsage_('batch_done', {}, {});
  const u = parse(fetches[0].url).uid;
  assert.match(u, /^u_[0-9a-f]{8}$/);
  assert.strictEqual(parse(fetches[1].url).uid, u);
  assert.strictEqual(props.usage_uid, u);
});

test('logUsage_ rejects bad event names (no fetch)', () => {
  const { ctx, fetches } = withOrg();
  for (const e of ['Batch', 'a b', '', 'x'.repeat(51), 'a@b', 'a&b=c', undefined, null, 5]) ctx.logUsage_(e, {}, {});
  assert.strictEqual(fetches.length, 0);
});

test('logUsage_ allowlist: disallowed fields dropped, counts clamped/coerced, enums enforced', () => {
  const { ctx, fetches } = withOrg();
  ctx.logUsage_('step_failed', {
    mode: 'weird', n: 999999, ok: -4, fail: 'x', step: 'load_sheet', reason: 'zzz',
    subject: 'S', email: 'a@b.org', org: 'Evil', uid: 'u_deadbeef', origin: 'claude', v: '9', tool_name: 'x', t: 'T',
  }, {});
  const q = parse(fetches[0].url);
  assert.strictEqual(q.n, '5000'); assert.strictEqual(q.ok, '0');
  assert.ok(!('fail' in q)); assert.ok(!('mode' in q));
  assert.strictEqual(q.step, 'load_sheet'); assert.strictEqual(q.reason, 'other');
  assert.strictEqual(q.org, 'Red Cross'); assert.strictEqual(q.uid, UID);
  assert.strictEqual(q.origin, 'google_script'); assert.strictEqual(q.v, '0.1.1');
  assert.strictEqual(q.tool_name, 'auto-emailer');
  assert.ok(!('subject' in q) && !('email' in q));
  assert.notStrictEqual(q.t, 'T');
  ctx.logUsage_('step_failed', { step: 'Drop Table' }, {});
  assert.ok(!('step' in parse(fetches[1].url)));
});

test('logUsage_ extras: only x_ keys with numbers/booleans/safe strings; @ and free text dropped; bad run replaced', () => {
  const { ctx, fetches } = withOrg();
  ctx.logUsage_('batch_done', {}, {
    x_ok_num: 3, x_flag: true, x_word: 'abc_1', x_at: 'a@b.org', x_text: 'hello world', x_long: 'a'.repeat(31),
    notx: 'abc', X_UP: 1, x_: 1, x_obj: { a: 1 }, x_nan: NaN, ['x_' + 'a'.repeat(29)]: 1, x_run: 'bad run!',
  });
  const q = parse(fetches[0].url);
  assert.strictEqual(q.x_ok_num, '3'); assert.strictEqual(q.x_flag, 'true'); assert.strictEqual(q.x_word, 'abc_1');
  for (const k of ['x_at', 'x_text', 'x_long', 'notx', 'X_UP', 'x_', 'x_obj', 'x_nan', 'x_' + 'a'.repeat(29)]) assert.ok(!(k in q), k);
  assert.match(q.x_run, /^[a-z0-9]{12}$/);
  assert.ok(!fetches[0].url.includes('%40'));
});

test('logUsage_ without x_run gets a server random one', () => {
  const { ctx, fetches } = withOrg();
  ctx.logUsage_('batch_done', {}, {});
  ctx.logUsage_('batch_done', {}, {});
  const a = parse(fetches[0].url).x_run, b = parse(fetches[1].url).x_run;
  assert.match(a, /^[a-z0-9]{12}$/);
  assert.notStrictEqual(a, b);
});

test('no PII from user email / subject / sheet / recipients reaches any URL; logs never contain the URL', () => {
  const { ctx, fetches, logs } = withOrg({ userEmail: 'staff.private@example.org' });
  const secrets = ['staff.private@example.org', 'Quarterly Appeal 2026', 'Private Donor Spreadsheet', 'alice.secret@x.org', 'Donors'];
  ctx.logUsage_('batch_done', { n: 1, subject: secrets[1], sheet: secrets[2], to: secrets[3], email: secrets[0] },
    { x_email: secrets[0], x_subject: secrets[1], x_sheet: secrets[2], x_to: secrets[3], x_tab: secrets[4] });
  const all = fetches.map(f => decodeURIComponent(f.url)).join('\n');
  for (const s of secrets) assert.ok(!all.includes(s), s);
  const { ctx: c2, logs: l2 } = withOrg({ fetchThrows: true });
  c2.logUsage_('batch_done', {}, {});
  const joined = l2.join('\n');
  assert.ok(!joined.includes('ping.tejitpabari.com') && !joined.includes('Red') && !joined.includes('fetch failed'));
  assert.deepStrictEqual(l2, ['usage ping failed']);
  assert.ok(!logs.join('\n').includes('ping.tejitpabari.com'));
});

test('logUsage_ swallows fetch and props failures and returns normally', () => {
  const { ctx } = withOrg({ fetchThrows: true });
  assert.doesNotThrow(() => ctx.logUsage_('batch_done', {}, {}));
  const { ctx: c2 } = withOrg();
  c2.PropertiesService = { getUserProperties: () => { throw new Error('props'); } };
  assert.doesNotThrow(() => c2.logUsage_('batch_done', {}, {}));
});

test('classifyReason_ maps messages in order, never returns the message', () => {
  const { ctx } = loadCodeGs();
  const c = (m) => ctx.classifyReason_(new Error(m));
  assert.strictEqual(c('Service invoked too many times for one day'), 'quota');
  assert.strictEqual(c('Limit Exceeded: email'), 'quota');
  assert.strictEqual(c('You do not have permission'), 'no_access');
  assert.strictEqual(c('Authorization is required'), 'no_access');
  assert.strictEqual(c('Access denied: DriveApp'), 'no_access');
  assert.strictEqual(c('You do not have access to this'), 'no_access');
  assert.strictEqual(c('Spreadsheet not found'), 'not_found');
  assert.strictEqual(c('Unable to open (perhaps it was deleted)'), 'not_found');
  assert.strictEqual(c('Invalid start row'), 'bad_input');
  assert.strictEqual(c('Sheet ID is required'), 'bad_input');
  assert.strictEqual(c('No data found'), 'bad_input');
  assert.strictEqual(c('kaboom'), 'other');
  assert.strictEqual(ctx.classifyReason_(undefined), 'other');
  assert.strictEqual(ctx.classifyReason_('permission denied'), 'no_access');
  assert.strictEqual(c('quota: permission invalid'), 'quota');
  assert.strictEqual(c('permission invalid'), 'no_access');
  assert.strictEqual(c('not found invalid'), 'not_found');
});
