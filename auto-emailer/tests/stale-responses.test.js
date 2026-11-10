'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { loadIndexScript } = require('./helpers');

// Fake google.script.run that keeps each request's own handlers so responses can arrive out of order.
function installQueueRun(ctx) {
  const reqs = [];
  const make = () => {
    const req = { ok: null, fail: null };
    const run = new Proxy({}, {
      get: (_, name) => {
        if (name === 'withSuccessHandler') return (f) => { req.ok = f; return run; };
        if (name === 'withFailureHandler') return (f) => { req.fail = f; return run; };
        return (...args) => { req.name = name; req.args = args; reqs.push(req); };
      },
    });
    return run;
  };
  Object.defineProperty(ctx.google.script, 'run', { get: make });
  return reqs;
}

const dataFor = (tag) => ({ headers: ['Email', tag], rows: [['a@x.org', tag]] });

test('late getSheetTabs response for sheet A is ignored after switching to B', () => {
  const { ctx, el } = loadIndexScript();
  const reqs = installQueueRun(ctx);
  vm.runInContext("currentSheetId = 'A'", ctx);
  ctx.loadTabs('A');
  vm.runInContext("currentSheetId = 'B'", ctx);
  ctx.loadTabs('B');
  const [a, b] = reqs;
  b.ok([{ name: 'BTab', index: 0 }]);
  assert.strictEqual(el('tabSelect').value, 'BTab');
  a.ok([{ name: 'ATab', index: 0 }]);
  assert.strictEqual(el('tabSelect').value, 'BTab');
  assert.ok(!/ATab/.test(el('tabSelect').innerHTML));
  assert.ok(!reqs.some(r => r.name === 'getPreviewData' && r.args[0] === 'A'));
});

test('late getSheetTabs failure for sheet A does not overwrite B', () => {
  const { ctx, el } = loadIndexScript();
  const reqs = installQueueRun(ctx);
  vm.runInContext("currentSheetId = 'A'", ctx);
  ctx.loadTabs('A');
  vm.runInContext("currentSheetId = 'B'", ctx);
  ctx.loadTabs('B');
  const [a, b] = reqs;
  b.ok([{ name: 'BTab', index: 0 }]);
  a.fail({ message: 'boom-A' });
  assert.ok(!/Error loading tabs/.test(el('tabSelect').innerHTML));
  assert.ok(!/boom-A/.test(el('previewDataTable').innerHTML));
});

test('late getPreviewData for sheet A is ignored after switching to B', () => {
  const { ctx, el } = loadIndexScript({ values: { tabSelect: 'T' } });
  const reqs = installQueueRun(ctx);
  vm.runInContext("currentSheetId = 'A'", ctx);
  ctx.loadPreviewData('A', 'T');
  vm.runInContext("currentSheetId = 'B'", ctx);
  ctx.loadPreviewData('B', 'T');
  const [a, b] = reqs;
  b.ok(dataFor('B'));
  a.ok(dataFor('A'));
  assert.strictEqual(vm.runInContext('previewData.headers[1]', ctx), 'B');
  assert.ok(!/>A</.test(el('previewDataTable').innerHTML));
});

test('late getPreviewData failure for old sheet is ignored', () => {
  const { ctx, el } = loadIndexScript({ values: { tabSelect: 'T' } });
  const reqs = installQueueRun(ctx);
  vm.runInContext("currentSheetId = 'A'", ctx);
  ctx.loadPreviewData('A', 'T');
  vm.runInContext("currentSheetId = 'B'", ctx);
  ctx.loadPreviewData('B', 'T');
  const [a, b] = reqs;
  b.ok(dataFor('B'));
  a.fail({ message: 'boom-A' });
  assert.strictEqual(vm.runInContext('previewData.headers[1]', ctx), 'B');
  assert.ok(!/boom-A/.test(el('previewDataTable').innerHTML));
});

test('late preview for old tab is ignored after switching tabs', () => {
  const { ctx, el } = loadIndexScript();
  const reqs = installQueueRun(ctx);
  vm.runInContext("currentSheetId = 'S'", ctx);
  el('tabSelect').value = 'T1';
  ctx.onTabChange();
  el('tabSelect').value = 'T2';
  ctx.onTabChange();
  const [t1, t2] = reqs;
  t2.ok(dataFor('T2'));
  t1.ok(dataFor('T1'));
  assert.strictEqual(vm.runInContext('previewData.headers[1]', ctx), 'T2');
  t1.fail({ message: 'boom-T1' });
  assert.strictEqual(vm.runInContext('previewData.headers[1]', ctx), 'T2');
});
