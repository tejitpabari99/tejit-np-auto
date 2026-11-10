'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadCodeGs, makeSheet, makeSpreadsheet, makeDraft } = require('./helpers');

const BAD = 'Invalid email address (must be one address)';

function fixture(rows, draftHtml = '<p>Hi {{Name}}</p>') {
  const sheet = makeSheet('S', [['Email', 'Name', 'Sent', 'Err'], ...rows]);
  return { sheet, ...loadCodeGs({ spreadsheets: { S1: makeSpreadsheet([sheet]) }, drafts: [makeDraft('Hello', draftHtml)] }) };
}

for (const bad of ['a@x.com,b@y.com', 'a@x.com;b@y.com', 'a@x.com b@y.com', 'Bob <a@x.com>', 'a@x']) {
  test(`sendSingleEmail rejects "${bad}"`, () => {
    const { ctx, sent, sheet } = fixture([[bad, 'Al']]);
    const res = ctx.sendSingleEmail('S1', 'Hello', 'Email', 1, 3, 4, true, null, 'S');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, BAD);
    assert.strictEqual(sent.length, 0);
    assert.ok(sheet.writes.some(w => w.col === 4 && w.value === BAD));
    assert.ok(sheet.writes.some(w => w.col === 3 && w.value === false));
  });

  test(`processAndSend rejects "${bad}"`, () => {
    const { ctx, sent, sheet } = fixture([[bad, 'Al'], ['ok@x.com', 'Bo']]);
    try { ctx.processAndSend('S1', 'Hello', 'Email', 1, 'S'); } catch (e) {}
    assert.deepStrictEqual(sent.map(s => s.to), ['ok@x.com']);
    assert.ok(sheet.writes.some(w => w.row === 2 && w.value === BAD));
  });
}

test('normal address is sent (trimmed)', () => {
  const { ctx, sent } = fixture([[' a@x.com ', 'Al']]);
  const res = ctx.sendSingleEmail('S1', 'Hello', 'Email', 1, 3, 4, true, null, 'S');
  assert.strictEqual(res.success, true);
  assert.strictEqual(sent[0].to, 'a@x.com');
});

test('cell html escaped in html, raw in text; newline -> <br>', () => {
  const { ctx, sent } = fixture([['a@x.com', '<img src=x>\nL2 & "q"']], '<p>Hi {{Name}}</p>');
  ctx.sendSingleEmail('S1', 'Hello', 'Email', 1, 3, 4, true, null, 'S');
  const m = sent[0];
  assert.ok(m.options.htmlBody.includes('&lt;img src=x&gt;<br>L2 &amp; &quot;q&quot;'), m.options.htmlBody);
  assert.ok(!m.options.htmlBody.includes('<img'));
  assert.ok(m.text.includes('<img src=x>\nL2 & "q"'), m.text);
});
