'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadIndexScript } = require('./helpers');

const EVIL1 = '<img src=x onerror=alert(1)>';
const EVIL2 = '"><script>alert(2)</script>';

function assertSafe(html) {
  assert.ok(!html.includes('<img'), 'raw <img: ' + html);
  assert.ok(!html.includes('<script'), 'raw <script: ' + html);
  assert.ok(!html.includes('"><script'), 'attribute breakout: ' + html);
}

test('escapeHtml escapes & < > " \'', () => {
  const { ctx } = loadIndexScript();
  assert.strictEqual(ctx.escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.strictEqual(ctx.escapeHtml(null), '');
  assert.strictEqual(ctx.escapeHtml(undefined), '');
  assert.strictEqual(ctx.escapeHtml(5), '5');
});

test('tab dropdown renders evil sheet names as text', () => {
  const { ctx } = loadIndexScript();
  const out = ctx.buildTabOptionsHtml([{ name: EVIL1, index: 0 }, { name: EVIL2, index: 1 }]);
  assertSafe(out);
  assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(out.includes('&quot;&gt;&lt;script&gt;'));
});

test('spreadsheet and draft option builders escape values and text', () => {
  const { ctx } = loadIndexScript();
  assertSafe(ctx.buildSheetOptionsHtml([{ id: EVIL2, name: EVIL1 }]));
  assertSafe(ctx.buildDraftOptionsHtml([{ id: 'd', subject: EVIL2 }, { id: 'e', subject: EVIL1 }]));
});

test('column options escape headers (value attr and text)', () => {
  const { ctx } = loadIndexScript();
  assertSafe(ctx.buildColumnOptionsHtml([EVIL1, EVIL2, '']));
  assert.match(ctx.buildColumnOptionsHtml(['', 'B']), /Column 1/);
});

test('preview table escapes headers and cells', () => {
  const { ctx } = loadIndexScript();
  const out = ctx.buildPreviewTableHtml({ headers: [EVIL1, EVIL2], rows: [[EVIL2, EVIL1]] });
  assertSafe(out);
  assert.match(out, /<table/);
});

test('error/status messages are escaped (test email, preview, tabs, batch)', () => {
  const vals = { sheetSelect: 'S1', draftSelect: 'D', emailColumn: 'E', tabSelect: 'T' };
  let h = loadIndexScript({ values: vals });
  h.ctx.sendTest();
  h.run.state.ok({ sentTo: EVIL1 });
  assertSafe(h.el('status').innerHTML);
  h.run.state.fail({ message: EVIL2 });
  assertSafe(h.el('status').innerHTML);

  h = loadIndexScript({ values: vals });
  h.ctx.loadPreviewData('S1', 'T');
  h.run.state.fail({ message: EVIL1 });
  assertSafe(h.el('previewDataTable').innerHTML);

  h = loadIndexScript({ values: vals });
  h.ctx.loadTabs('S1');
  h.run.state.fail({ message: EVIL2 });
  assertSafe(h.el('previewDataTable').innerHTML);

  h = loadIndexScript({ values: vals });
  h.ctx.startSending();
  h.run.state.fail({ message: EVIL1 });
  assertSafe(h.el('status').innerHTML);
});

test('sequential send: result.error and err.message escaped in stopped message', () => {
  const vals = { sheetSelect: 'S1', draftSelect: 'D', emailColumn: 'E', tabSelect: 'T' };
  let h = loadIndexScript({ values: vals });
  h.ctx.startSending();
  h.run.state.ok({ totalRows: 6, eligibleRowIndices: [1, 2, 3, 4, 5, 6] });
  for (let i = 0; i < 5; i++) h.run.state.ok({ success: false, error: EVIL1 });
  assert.match(h.el('status').innerHTML, /Stopped/);
  assertSafe(h.el('status').innerHTML);

  h = loadIndexScript({ values: vals });
  h.ctx.startSending();
  h.run.state.ok({ totalRows: 6, eligibleRowIndices: [1, 2, 3, 4, 5, 6] });
  for (let i = 0; i < 5; i++) h.run.state.fail({ message: EVIL2 });
  assert.match(h.el('status').innerHTML, /Stopped/);
  assertSafe(h.el('status').innerHTML);
});

test('lint: every dynamic value interpolated into HTML goes through escapeHtml', () => {
  const { html } = loadIndexScript();
  const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
    .replace(/^\s*console\.\w+\(.*$/gm, ''); // console output is not HTML
  const risky = /\$\{(?![^}]*escapeHtml)[^}]*(\.message|\.error|\.sentTo|\.name|\.subject|\bheader\b|cellValue|optionValue|displayName|\.id\b)[^}]*\}/g;
  const hits = (script.match(risky) || []);
  assert.deepStrictEqual(hits, []);
});
