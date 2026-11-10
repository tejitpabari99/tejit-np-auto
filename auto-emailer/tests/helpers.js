'use strict';
// Zero-dependency test helpers: load code.gs / index.html into vm contexts with fakes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function makeSheet(name, data) {
  const cells = data.map(r => r.slice());
  const sheet = {
    name,
    writes: [],
    getName: () => name,
    getLastColumn: () => cells.reduce((m, r) => Math.max(m, r.length), 0),
    getDataRange: () => ({ getDisplayValues: () => cells.map(r => r.map(String)) }),
    getRange: (row, col, nRows = 1, nCols = 1) => ({
      getValues: () => {
        const out = [];
        for (let r = 0; r < nRows; r++) {
          const line = [];
          for (let c = 0; c < nCols; c++) line.push((cells[row - 1 + r] || [])[col - 1 + c] ?? '');
          out.push(line);
        }
        return out;
      },
      setValue: (v) => {
        while (cells.length < row) cells.push([]);
        cells[row - 1][col - 1] = v;
        sheet.writes.push({ row, col, value: v });
      },
    }),
    cells,
  };
  return sheet;
}

function makeSpreadsheet(sheets) {
  return { getName: () => 'Fake Spreadsheet', getSheets: () => sheets };
}

function makeDraft(subject, html) {
  return {
    getId: () => 'draft-' + subject,
    getMessage: () => ({
      getSubject: () => subject,
      getBody: () => html,
      getPlainBody: () => html.replace(/<[^>]+>/g, ''),
      getAttachments: () => [],
    }),
  };
}

// opts: { spreadsheets: {id: spreadsheet}, drafts: [draft], userEmail }
function loadCodeGs(opts = {}) {
  const logs = [];
  const sent = [];
  const capture = (...a) => logs.push(a.map(String).join(' '));
  const ctx = {
    console: { log: capture, warn: capture, error: capture, info: capture },
    SpreadsheetApp: {
      openById: (id) => {
        const s = (opts.spreadsheets || {})[id];
        if (!s) throw new Error('Unable to open (perhaps it was deleted) ' + id);
        return s;
      },
      flush: () => {},
    },
    GmailApp: {
      getDrafts: () => opts.drafts || [],
      sendEmail: (to, subject, text, options) => sent.push({ to, subject, text, options }),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => opts.userEmail || 'staff@example.org' }),
      getScriptTimeZone: () => 'UTC',
    },
    Utilities: {
      formatDate: () => '2026-11-10 12:00:00',
      sleep: () => {},
    },
    DriveApp: { searchFiles: () => ({ hasNext: () => false }) },
    ScriptApp: { getOAuthToken: () => 'tok' },
    HtmlService: (() => {
      const out = () => {
        const o = {
          setTitle: () => o,
          setXFrameOptionsMode: () => { o.xframeSet = true; return o; },
          addMetaTag: () => o,
        };
        return o;
      };
      return {
        XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
        createTemplateFromFile: () => {
          if (opts.templateThrows) throw new Error(opts.templateThrows);
          return { evaluate: out };
        },
        createHtmlOutput: (html) => ({ html }),
      };
    })(),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'code.gs'), 'utf8'), ctx, { filename: 'code.gs' });
  return { ctx, logs, sent };
}

// Fake google.script.run: records every server call and keeps the last handlers.
function makeRun() {
  const state = { calls: [], ok: null, fail: null };
  const run = new Proxy({}, {
    get: (_, name) => {
      if (name === 'withSuccessHandler') return (f) => { state.ok = f; return run; };
      if (name === 'withFailureHandler') return (f) => { state.fail = f; return run; };
      if (name === 'state') return state;
      return (...args) => { state.calls.push({ name, args }); };
    },
  });
  return run;
}

// Loads the inline <script> of index.html with minimal browser fakes.
// opts.values: {elementId: value}; every element records its innerHTML.
function loadIndexScript(opts = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  const code = scripts.map(m => m[1]).join('\n');
  const noop = () => {};
  const elements = {};
  const el = (id) => elements[id] || (elements[id] = {
    innerHTML: '', value: (opts.values || {})[id] ?? '', disabled: false, checked: true,
    classList: { toggle: noop },
  });
  const alerts = [];
  const run = makeRun();
  const ctx = {
    console: { log: noop, warn: noop, error: noop },
    window: {},
    setTimeout: (f) => f(),
    alert: (m) => alerts.push(m),
    confirm: () => true,
    document: { getElementById: el, querySelectorAll: () => [] },
    navigator: { userAgent: 'test' },
    $: () => ({ val: () => '' }),
    google: { script: { run } },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'index.html<script>' });
  return { ctx, html, el, elements, alerts, run };
}

module.exports = { loadCodeGs, loadIndexScript, makeSheet, makeSpreadsheet, makeDraft, ROOT };
