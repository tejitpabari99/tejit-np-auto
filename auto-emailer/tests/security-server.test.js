'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCodeGs, makeSheet, makeSpreadsheet, makeDraft, ROOT } = require('./helpers');

const SUBJECT = 'Quarterly Appeal 2026';
const USER = 'staff.private@example.org';

function fixture(extra = {}) {
  const sheet = makeSheet('Donors', [['Email', 'Donor Name', 'Sent'], ['alice.secret@x.org', 'Alice', ''], ['bob.secret@x.org', 'Bob', 'false']]);
  const ss = makeSpreadsheet([sheet]);
  ss.getName = () => 'Private Donor Spreadsheet';
  return loadCodeGs({ spreadsheets: { S1: ss }, drafts: [makeDraft(SUBJECT, '<p>Hi {{Donor Name}}</p>')], userEmail: USER, props: { usage_org: 'Test Org' }, ...extra });
}

test('getOAuthToken is removed', () => {
  const { ctx } = fixture();
  assert.strictEqual(typeof ctx.getOAuthToken, 'undefined');
});

test('doGet does not allow framing (no ALLOWALL / setXFrameOptionsMode)', () => {
  const { ctx } = fixture();
  const out = ctx.doGet({});
  assert.ok(!out.xframeSet);
  assert.ok(!/ALLOWALL/.test(fs.readFileSync(path.join(ROOT, 'code.gs'), 'utf8')));
});

test('doGet error page escapes error message', () => {
  const { ctx } = fixture({ templateThrows: '<img src=x onerror=alert(1)>"><script>x</script>' });
  const out = ctx.doGet({});
  assert.ok(!out.html.includes('<img src=x'));
  assert.ok(!out.html.includes('<script>'));
  assert.ok(out.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('logs contain no personal data across all flows', () => {
  const { ctx, logs } = fixture();
  ctx.doGet({});
  ctx.getRecentSheets();
  ctx.getGmailDrafts();
  ctx.getSheetTabs('S1');
  ctx.getPreviewData('S1', 'Donors');
  ctx.getEmailPreview('S1', SUBJECT, 'Email', 'Donors');
  ctx.sendTestEmail('S1', SUBJECT, 'Email', 'Donors');
  const info = ctx.sendEmailBatch('S1', SUBJECT, 'Email', 1, null, true, 'Sent', 'Donors');
  ctx.sendSingleEmail('S1', SUBJECT, 'Email', 1, info.sentColIndex, info.errorColIndex, true, info.conditionalColIndex, 'Donors');
  ctx.processAndSend('S1', SUBJECT, 'Email', 1, 'Donors');
  assert.throws(() => ctx.getEmailPreview('S1', 'Missing draft', 'Email', 'Donors'));
  const all = logs.join('\n');
  for (const secret of [USER, 'alice.secret@x.org', 'bob.secret@x.org', SUBJECT, 'Private Donor Spreadsheet', 'Headers:', 'Available draft subjects']) {
    assert.ok(!all.includes(secret), `log leaks: ${secret}`);
  }
  assert.ok(logs.length > 10, 'non-personal logs are kept');
});

test('errors stay useful: missing draft error still names the subject to the user', () => {
  const { ctx } = fixture();
  assert.throws(() => ctx.getEmailPreview('S1', 'Nope', 'Email', 'Donors'), /Draft with subject "Nope" not found/);
});

test('appsscript.json: external_request scope present, Drive advanced service removed, others kept', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8'));
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
  assert.ok(!(m.dependencies && m.dependencies.enabledAdvancedServices && m.dependencies.enabledAdvancedServices.length));
  for (const s of ['drive.readonly', 'gmail.readonly', 'gmail.send', 'spreadsheets', 'userinfo.email']) {
    assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/' + s), s);
  }
});
