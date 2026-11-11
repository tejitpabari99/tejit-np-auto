'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers');

const guide = fs.readFileSync(path.join(ROOT, 'INSTALLATION_GUIDE.md'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, '..', 'README.md'), 'utf8');

const TABLE = `| Automation | What it does | Guide | Open the tool |
|---|---|---|---|
| \`auto-emailer\` | Sends a personal email to many people at once, using a list in a Google Sheet and a Gmail draft as the template. | [Installation guide](auto-emailer/INSTALLATION_GUIDE.md) | [Open NGO Auto Emailer](https://go.tejitpabari.com/tejit-np-auto-emailer) |
`;

test('guide: org name box in dashboard step, screenshots present', () => {
  const step4 = guide.slice(guide.indexOf('## Step 4'), guide.indexOf('## Step 5'));
  assert.match(step4, /\*\*Organization name\*\*/);
  assert.match(step4, /not your email/i);
  assert.ok(!guide.includes('SCREENSHOT NEEDED'));
  for (const f of ['gmail-draft-variables.png', 'dashboard.png', 'sheet-result-columns.png']) {
    assert.ok(guide.includes('src="docs/images/' + f + '"'), f);
    assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname, '..', 'docs', 'images', f)), f + ' exists');
  }
  assert.ok(guide.includes('Scroll to the bottom of the screen and click **Continue**.'));
  assert.ok(!guide.includes('dashboard-overview.png'));
  assert.ok(!guide.includes('org-name-box'));
  assert.ok(!guide.includes('Picture coming soon'));
});

test('guide: headings the install skill reads, and short', () => {
  assert.match(guide, /^## What it does$/m);
  assert.match(guide, /^## What you need$/m);
  assert.match(guide, /^\*\*Open the tool:\*\* <https:\/\/go\.tejitpabari\.com\/tejit-np-auto-emailer>$/m);
  assert.ok(guide.split('\n').filter((l) => l.trim()).length < 110);
});

test('guide: external service permission row', () => {
  assert.match(guide, /\| Connect to an external service \| Only used to send anonymous usage counts to ping\.tejitpabari\.com\. Never your emails, drafts or sheet content\. \|/);
});

test('guide: privacy section is an accurate short list linking legal docs', () => {
  const priv = guide.slice(guide.indexOf('## Privacy'));
  assert.ok(!guide.includes('does not send your data to the developer'));
  assert.match(priv, /anonymous usage counts/i);
  assert.match(priv, /organization name/i);
  assert.match(priv, /never/i);
  assert.match(priv, /\]\(\.\.\/PRIVACY\.md\)|blob\/main\/PRIVACY\.md/);
  assert.match(priv, /\]\(\.\.\/TERMS\.md\)|blob\/main\/TERMS\.md/);
});

test('guide: no re-authorization wording', () => {
  assert.doesNotMatch(guide, /re-?authori[sz]|authori[sz]e again|approve again|allow again/i);
  assert.doesNotMatch(guide, /_Updated November 2026/);
});

test('README: one usage-counts line with Terms/Privacy links; Automations table untouched', () => {
  assert.ok(readme.includes(TABLE));
  assert.ok(readme.includes('## Automations\n\n' + TABLE));
  assert.match(readme, /anonymous usage counts[^\n]*\[Terms\]\(TERMS\.md\)[^\n]*\[Privacy\]\(PRIVACY\.md\)/i);
  assert.strictEqual((readme.match(/usage counts/gi) || []).length, 1);
});

test('guide: Pages rendering safety (raw wrap, table spacing, img tags)', () => {
  const lines = guide.split('\n');
  assert.strictEqual(lines[0], '<!-- {% raw %} -->');
  assert.strictEqual(lines.filter((l) => l.trim()).pop(), '<!-- {% endraw %} -->');
  assert.strictEqual((guide.match(/\{% raw %\}/g) || []).length, 1);
  lines.forEach((l, i) => {
    if (/^\|\s*:?-{3,}/.test(l)) {
      assert.ok(/^\|/.test(lines[i - 1]), 'header before separator at ' + i);
      assert.strictEqual(lines[i - 2].trim(), '', 'blank line before table at line ' + (i - 1));
    }
  });
  assert.ok(!/!\[/.test(guide), 'no markdown images');
  assert.ok(/<img src="docs\/images\/[^"]+" alt="[^"]*" width="\d+">/.test(guide));
  assert.ok(!guide.includes('send-test-email.png'));
});
