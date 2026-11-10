'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { loadIndexScript } = require('./helpers');

test('HTML has "2. Select Tab" section after spreadsheet, with tooltip and renumbered labels', () => {
  const { html } = loadIndexScript();
  const iSheet = html.indexOf('1. Select Your Spreadsheet');
  const iTab = html.indexOf('2. Select Tab');
  assert.ok(iSheet > 0 && iTab > iSheet);
  assert.ok(html.includes('id="tabSelect"'));
  assert.ok(html.includes('Choose which tab (sheet) inside the spreadsheet has your contacts'));
  assert.ok(html.indexOf('3. Select Gmail Draft') > iTab);
  assert.ok(html.indexOf('4. Column to Use for Email') > html.indexOf('3. Select Gmail Draft'));
  assert.ok(!html.includes('2. Select Gmail Draft'));
});

test('buildTabOptionsHtml lists tabs', () => {
  const { ctx } = loadIndexScript();
  const out = ctx.buildTabOptionsHtml([{ name: 'Donors', index: 0 }, { name: 'Vols', index: 1 }]);
  assert.match(out, /<option value="Donors">Donors<\/option>/);
  assert.match(out, /<option value="Vols">Vols<\/option>/);
});

test('loadTabs fills dropdown, selects first tab, loads preview with that tab', () => {
  const { ctx, run, el } = loadIndexScript();
  vm.runInContext("currentSheetId = 'S1'", ctx);
  ctx.loadTabs('S1');
  assert.deepStrictEqual(run.state.calls[0], { name: 'getSheetTabs', args: ['S1'] });
  run.state.ok([{ name: 'Donors', index: 0 }, { name: 'Vols', index: 1 }]);
  assert.strictEqual(el('tabSelect').value, 'Donors');
  assert.match(el('tabSelect').innerHTML, /Vols/);
  const last = run.state.calls[run.state.calls.length - 1];
  assert.deepStrictEqual(last, { name: 'getPreviewData', args: ['S1', 'Donors'] });
});

test('onTabChange reloads preview for chosen tab', () => {
  const { ctx, run } = loadIndexScript({ values: { tabSelect: 'Vols' } });
  vm.runInContext("currentSheetId = 'S1'", ctx);
  ctx.onTabChange();
  assert.deepStrictEqual(run.state.calls.pop(), { name: 'getPreviewData', args: ['S1', 'Vols'] });
});

test('clearTabs empties the tab dropdown', () => {
  const { ctx, el } = loadIndexScript();
  el('tabSelect').innerHTML = '<option>x</option>';
  ctx.clearTabs();
  assert.ok(!/Donors|x</.test(el('tabSelect').innerHTML));
});

test('sendTest passes tab and validates it', () => {
  let h = loadIndexScript({ values: { sheetSelect: 'S1', draftSelect: 'D', emailColumn: 'Email', tabSelect: '' } });
  h.ctx.sendTest();
  assert.match(h.alerts[0], /tab/i);
  assert.strictEqual(h.run.state.calls.length, 0);

  h = loadIndexScript({ values: { sheetSelect: 'S1', draftSelect: 'D', emailColumn: 'Email', tabSelect: 'Vols' } });
  h.ctx.sendTest();
  assert.deepStrictEqual(h.run.state.calls[0], { name: 'sendTestEmail', args: ['S1', 'D', 'Email', 'Vols'] });
});

test('startSending validates tab and passes it to sendEmailBatch and sendSingleEmail', () => {
  let h = loadIndexScript({ values: { sheetSelect: 'S1', draftSelect: 'D', emailColumn: 'Email', tabSelect: '' } });
  h.ctx.startSending();
  assert.match(h.alerts[0], /tab/i);

  h = loadIndexScript({ values: { sheetSelect: 'S1', draftSelect: 'D', emailColumn: 'Email', tabSelect: 'Vols', conditionalColumn: 'Sent' } });
  h.ctx.startSending();
  const call = h.run.state.calls[0];
  assert.strictEqual(call.name, 'sendEmailBatch');
  assert.strictEqual(call.args[call.args.length - 1], 'Vols');
  h.run.state.ok({ totalRows: 1, eligibleRowIndices: [1], sentColIndex: 4, errorColIndex: 5, conditionalColIndex: 3 });
  const single = h.run.state.calls.pop();
  assert.strictEqual(single.name, 'sendSingleEmail');
  assert.deepStrictEqual(single.args, ['S1', 'D', 'Email', 1, 4, 5, true, 3, 'Vols']);
});
