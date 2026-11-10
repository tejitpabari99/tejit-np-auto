---
status: done
summary: PASS WITH 1 MEDIUM - XSS/clickjacking/token/log fixes verified complete; sheet-controlled recipient list (+ unescaped HTML in email body) lets a public-form submitter relay NGO-branded mail
date: 2026-11-10
---

# Security review - auto-emailer (whole app)

Scope: auto-emailer/code.gs, index.html, appsscript.json, .github/workflows/ci.yml. Read-only; `node --test auto-emailer/tests/*.test.js` = 34/34 pass.
Trust model: web app runs as visiting user (USER_ACCESSING); sheet cells (public Google Form) are the untrusted input; the NGO user is the victim/sender.

## Verdict
No HIGH/CRITICAL. 1 MEDIUM (Alert 1). Prior fixes verified complete (below).

### Alert 1
**File:** auto-emailer/code.gs:502 (`to` taken from cell), :683, :758, :1005 (`GmailApp.sendEmail(emailData.to, ...)`); body injection at :448-458 (`fillInTemplateFromObject_`) feeding `htmlBody` at :684/:1006
**Category:** StringInjection
**Severity: MEDIUM | Confidence: 8/10**
**Problem:** The recipient cell is passed unvalidated to `GmailApp.sendEmail`, whose `recipients` arg is a comma-separated list. A form submitter who enters `me@x.com,victim1@y.com,victim2@y.com` in the email field (or any free-text field mapped as email column) makes the NGO's Gmail send the template to all of them. Combined with unescaped cell values in the HTML body (any other cell, e.g. "Name", can hold `<a href="https://evil">...</a>` or `<img src=https://tracker/..>`), the attacker gets NGO-branded, NGO-sent phishing/spam with attacker-chosen links, plus tracking pixels. Only row 1 is previewed/tested, so later malicious rows are never seen before bulk send. HTML injection alone is low impact (mail goes to the row's own address, usually the submitter), so the recipient list is what makes it exploitable. Impact limited by Gmail send quotas but harms sender reputation/trust.
**Evidence:** `[verified: row[emailColIndex-1] -> emailData.to -> sendEmail, only check is empty string (code.gs:674,987); fillIn escapes only for JSON (escapeData_), not HTML]`
**Suggested fix:** Before send, require `to` to match a single-address regex (reject `,` `;` whitespace `<>`), else mark row "Invalid email address"; HTML-escape cell values for the `html` field only (not subject/text), converting newlines to `<br>`.

## Verified complete (no gaps)
- Client sinks: every `innerHTML` in index.html with data from server/sheet passes `escapeHtml` (sheet/tab/draft/header options, preview table, all error messages, `res.sentTo`, `result.error`, `err.message`). Remaining interpolations are numbers or constants. No jQuery `.html()/.append()`, no `eval`, no `window.open`, no `<?= ?>` scriptlets. Select2 4.1 uses default escaping (no `templateResult`/`escapeMarkup`). `getEmailPreview` is not called by the client, so email HTML is never rendered in-page.
- doGet error page escaped (code.gs:18). No XFrame ALLOWALL (default framing protection). `getOAuthToken` gone. Logs carry no PII beyond sheet ID / counts (subject no longer logged except error message at :320 returned to caller only).
- SRI present on all 8 CDN tags, exact versions pinned.
- Scopes: drive.readonly (searchFiles), gmail.readonly (getDrafts), gmail.send, spreadsheets (openById + write), userinfo.email (getActiveUser). All used.
- Direct `google.script.run` calls with arbitrary args: run as the visiting user with their own grants; reach only their Drive/Gmail/Sheets. Cross-site invocation is impossible (calls only work from inside the HtmlService iframe). Self-harm only; not reported.
- Formula injection: every `setValue` string is fixed-prefixed ("Invalid conditional...", "Failed to process email row: ...", "No email address", timestamped headers); none can begin with `=`/`+`/`-`/`@` from cell content. Not exploitable.
- `escapeData_` + `JSON.parse`: backslash and quote escaped first, replacement is function-based (no `$&` patterns), single pass (a cell containing `{{x}}` is not re-expanded). No breakout. Residual: raw control chars other than \b\f\n\r\t (e.g. \v, \u0001) make `JSON.parse` throw, so that one row errors; U+2028/2029 are valid JSON. Reliability only, not security.
- Draft lookup by subject: exact match against the visitor's own drafts; first match wins on duplicate subjects (wrong template risk, not a vuln).
- CI: `actions/*@v4` from official namespace, no secrets, no `pull_request_target`; default token permissions not narrowed (LOW, below bar).

## Considered, not reported
- Subject CRLF from cell: GmailApp builds MIME via Google service (not raw SMTP); could not verify behaviour offline, <6 confidence.
- Spreadsheets scope is broad (needed for `openById` + write); no narrower scope available for this flow.
