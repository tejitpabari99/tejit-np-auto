'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadIndexScript } = require('./helpers');

const SEL = { sheetSelect: 'S1', draftSelect: 'D', emailColumn: 'Email', tabSelect: 'Vols' };
const names = (h) => h.run.state.calls.map(c => c.name);

test('org box is above step 1 with required helper text', () => {
  const { html } = loadIndexScript();
  assert.ok(html.includes('id="orgName"'));
  assert.ok(html.includes("Your organization's name, not your email."));
  assert.ok(html.indexOf('id="orgName"') < html.indexOf('1. Select Your Spreadsheet'));
});

test('org input is pre-filled from getUsageSettings (via .value)', () => {
  const h = loadIndexScript();
  h.ctx.loadUsageSettings();
  assert.deepStrictEqual(h.run.state.calls[0], { name: 'getUsageSettings', args: [] });
  h.run.state.ok({ org: 'Red <b>Cross' });
  assert.strictEqual(h.el('orgName').value, 'Red <b>Cross');
  assert.strictEqual(h.el('orgName').innerHTML, '');
});

test('Test/Send with missing or invalid org alert and make no server call', () => {
  for (const bad of ['', '   ', 'a@b.org', 'x'.repeat(101)]) {
    for (const fn of ['sendTest', 'startSending']) {
      const h = loadIndexScript({ values: { ...SEL, orgName: bad } });
      h.ctx[fn]();
      assert.strictEqual(h.alerts.length, 1, `${fn} ${bad}`);
      assert.match(h.alerts[0], /organization/i);
      assert.strictEqual(h.run.state.calls.length, 0);
    }
  }
});

test('saveOrganization is the first call; flow continues only after it succeeds', () => {
  let h = loadIndexScript({ values: { ...SEL, orgName: '  Red   Cross ' } });
  h.ctx.sendTest();
  assert.deepStrictEqual(h.run.state.calls, [{ name: 'saveOrganization', args: ['Red Cross'] }]);
  h.run.state.ok({ org: 'Red Cross' });
  assert.strictEqual(h.el('orgName').value, 'Red Cross');
  assert.deepStrictEqual(names(h), ['saveOrganization', 'sendTestEmail']);

  h = loadIndexScript({ values: { ...SEL, orgName: 'Acme' } });
  h.ctx.startSending();
  assert.deepStrictEqual(names(h), ['saveOrganization']);
  h.run.state.ok({ org: 'Acme' });
  assert.deepStrictEqual(names(h), ['saveOrganization', 'sendEmailBatch']);
});

test('save failure alerts and does not continue', () => {
  const h = loadIndexScript({ values: { ...SEL, orgName: 'Acme' } });
  h.ctx.sendTest();
  h.run.state.fail({ message: 'Organization name is required' });
  assert.match(h.alerts[0], /Organization name is required/);
  assert.deepStrictEqual(names(h), ['saveOrganization']);
});

function startBatch(rows) {
  const h = loadIndexScript({ values: { ...SEL, orgName: 'Acme' } });
  h.ctx.startSending();
  h.run.state.ok({ org: 'Acme' });
  h.run.state.ok({ totalRows: rows, eligibleRowIndices: Array.from({ length: rows }, (_, i) => i + 1), sentColIndex: 4, errorColIndex: 5 });
  return h;
}
const reports = (h) => h.run.state.calls.filter(c => c.name === 'reportBatch');

test('completion calls reportBatch once; skipped excluded from ok; on-screen Sent unchanged', () => {
  const h = startBatch(4);
  h.run.state.ok({ success: true });
  h.run.state.ok({ success: true, skipped: true });
  h.run.state.ok({ success: false, error: 'x' });
  assert.strictEqual(reports(h).length, 0);
  h.run.state.ok({ success: true });
  const r = reports(h);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].args.slice(0, 3), [2, 1, false]);
  assert.match(r[0].args[3], /^[a-z0-9]{8,32}$/);
  assert.match(h.el('status').innerHTML, /Sent: 3\/4/);
  assert.strictEqual(h.el('sendBtn').disabled, false);
});

test('5-error stop (result errors and failure handler) calls reportBatch once with stopped=true', () => {
  let h = startBatch(8);
  h.run.state.ok({ success: true });
  for (let i = 0; i < 5; i++) h.run.state.ok({ success: false, error: 'e' });
  let r = reports(h);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].args.slice(0, 3), [1, 5, true]);

  h = startBatch(8);
  for (let i = 0; i < 5; i++) h.run.state.fail({ message: 'boom' });
  r = reports(h);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].args.slice(0, 3), [0, 5, true]);
});

test('each batch gets its own run id', () => {
  const a = startBatch(1); a.run.state.ok({ success: true });
  const b = startBatch(1); b.run.state.ok({ success: true });
  assert.notStrictEqual(reports(a)[0].args[3], reports(b)[0].args[3]);
});
