'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadIndexScript, ROOT } = require('./helpers');

const REPO = path.join(ROOT, '..');
const BASE = 'https://github.com/tejitpabari99/tejit-np-auto/blob/main/';

test('footer shows exact notice and Terms/Privacy links with safe attributes', () => {
  const { html } = loadIndexScript();
  assert.ok(html.includes('Your personal details stay anonymous. We collect your organization name.'));
  for (const f of ['TERMS.md', 'PRIVACY.md']) {
    const m = html.match(new RegExp(`<a [^>]*href="${BASE}${f}"[^>]*>`));
    assert.ok(m, f);
    assert.match(m[0], /target="_blank"/);
    assert.match(m[0], /rel="noopener noreferrer"/);
  }
  assert.match(html, />Terms<\/a>\s*(?:&middot;|·)\s*<a[^>]*>Privacy<\/a>/);
});

test('TERMS.md and PRIVACY.md exist with required content only', () => {
  const terms = fs.readFileSync(path.join(REPO, 'TERMS.md'), 'utf8');
  const priv = fs.readFileSync(path.join(REPO, 'PRIVACY.md'), 'utf8');
  assert.match(terms, /Tejit Pabari/);
  assert.match(terms, /free/i);
  assert.match(terms, /as is/i);
  assert.match(terms, /usage counts/i);
  assert.match(terms, /GitHub issues/i);
  for (const k of ['tool and version', 'event type', 'test-or-real', 'organization name', 'random code', 'counts', 'failing step', 'UTC time', 'run code', 'which AI or app']) {
    assert.ok(priv.toLowerCase().includes(k.toLowerCase()), k);
  }
  assert.match(priv, /never/i);
  for (const k of ['IP address', 'country', 'user-agent', 'emails', 'names', 'recipients', 'draft', 'sheet']) {
    assert.ok(priv.toLowerCase().includes(k.toLowerCase()), k);
  }
  for (const txt of [terms, priv]) {
    assert.doesNotMatch(txt, /delet|retention|retain|host(ed|ing)|opt[- ]?out|fund(er|ing)/i);
  }
});
