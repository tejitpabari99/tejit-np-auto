'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadCodeGs, makeSheet, makeSpreadsheet, makeDraft } = require('./helpers');

function fixture() {
  const first = makeSheet('Old', [['Email', 'Name'], ['old@x.org', 'Olga']]);
  const second = makeSheet('Donors', [['Email', 'Name', 'Sent'], ['d1@x.org', 'Dan', ''], ['d2@x.org', 'Dee', 'TRUE'], ['d3@x.org', 'Di', 'false']]);
  const ss = makeSpreadsheet([first, second]);
  const drafts = [makeDraft('Hello', '<p>Hi {{Name}}</p>')];
  return { first, second, ...loadCodeGs({ spreadsheets: { S1: ss }, drafts }) };
}

test('getSheetTabs lists all tabs with index', () => {
  const { ctx } = fixture();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.getSheetTabs('S1'))), [{ name: 'Old', index: 0 }, { name: 'Donors', index: 1 }]);
});

test('getSheetTabs rejects empty id', () => {
  const { ctx } = fixture();
  assert.throws(() => ctx.getSheetTabs(''), /required/i);
});

test('getTargetSheet_ defaults to first tab', () => {
  const { ctx, first } = fixture();
  const ss = ctx.SpreadsheetApp.openById('S1');
  assert.strictEqual(ctx.getTargetSheet_(ss, undefined), first);
  assert.strictEqual(ctx.getTargetSheet_(ss, ''), first);
});

test('getTargetSheet_ finds named tab and errors clearly when missing', () => {
  const { ctx, second } = fixture();
  const ss = ctx.SpreadsheetApp.openById('S1');
  assert.strictEqual(ctx.getTargetSheet_(ss, 'Donors'), second);
  assert.throws(() => ctx.getTargetSheet_(ss, 'Nope'), { message: 'Tab "Nope" not found in this spreadsheet.' });
});

test('getPreviewData uses selected tab; default stays first', () => {
  const { ctx } = fixture();
  assert.deepStrictEqual(Array.from(ctx.getPreviewData('S1', 'Donors').headers), ['Email', 'Name', 'Sent']);
  assert.deepStrictEqual(Array.from(ctx.getPreviewData('S1').headers), ['Email', 'Name']);
});

test('getEmailPreview uses selected tab', () => {
  const { ctx } = fixture();
  const p = ctx.getEmailPreview('S1', 'Hello', 'Email', 'Donors');
  assert.strictEqual(p.to, 'd1@x.org');
  assert.match(p.body, /Hi Dan/);
});

test('prepareEmailContext uses selected tab', () => {
  const { ctx } = fixture();
  assert.strictEqual(ctx.prepareEmailContext('S1', 'Hello', 'Email', 'Donors').rows.length, 3);
  assert.strictEqual(ctx.prepareEmailContext('S1', 'Hello', 'Email').rows.length, 1);
});

test('sendTestEmail uses selected tab data', () => {
  const { ctx, sent } = fixture();
  ctx.sendTestEmail('S1', 'Hello', 'Email', 'Donors');
  assert.match(sent[0].options.htmlBody, /Hi Dan/);
});

test('sendEmailBatch writes result columns to selected tab and reads conditional header there', () => {
  const { ctx, first, second } = fixture();
  const info = ctx.sendEmailBatch('S1', 'Hello', 'Email', 1, null, true, 'Sent', 'Donors');
  assert.strictEqual(info.conditionalColIndex, 3);
  assert.deepStrictEqual(Array.from(info.eligibleRowIndices), [1, 3]);
  assert.strictEqual(first.writes.length, 0);
  assert.ok(second.writes.some(w => w.row === 1 && /Email Sent/.test(w.value)));
});

test('sendEmailBatch without sheetName still uses first tab (backward compatible)', () => {
  const { ctx, first, second } = fixture();
  ctx.sendEmailBatch('S1', 'Hello', 'Email', 1, null, true, '');
  assert.ok(first.writes.length > 0);
  assert.strictEqual(second.writes.length, 0);
});

test('sendSingleEmail marks result in selected tab (sheetName after conditionalColIndex)', () => {
  const { ctx, first, second, sent } = fixture();
  const r = ctx.sendSingleEmail('S1', 'Hello', 'Email', 1, 4, 5, true, null, 'Donors');
  assert.strictEqual(r.success, true);
  assert.strictEqual(sent[0].to, 'd1@x.org');
  assert.strictEqual(first.writes.length, 0);
  assert.deepStrictEqual(second.writes.map(w => [w.row, w.col, w.value]), [[2, 4, true], [2, 5, '']]);
});

test('processAndSend uses selected tab', () => {
  const { ctx, first, second } = fixture();
  const r = ctx.processAndSend('S1', 'Hello', 'Email', 1, 'Donors');
  assert.strictEqual(r.emailsSent, 3);
  assert.strictEqual(first.writes.length, 0);
  assert.ok(second.writes.length > 0);
});

test('missing tab gives clear error through public functions', () => {
  const { ctx } = fixture();
  assert.throws(() => ctx.getPreviewData('S1', 'Nope'), /Tab "Nope" not found in this spreadsheet\./);
});
