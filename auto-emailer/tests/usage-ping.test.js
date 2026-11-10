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
