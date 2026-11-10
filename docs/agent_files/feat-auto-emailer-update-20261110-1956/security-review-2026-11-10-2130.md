---
status: done
summary: PASS - prior MEDIUM (recipient list + HTML injection) fixed completely in 64b4cb0; re-audit of whole app found nothing at/above floor
date: 2026-11-10
---

# Security re-review - auto-emailer (whole app, after fix 64b4cb0)

Scope: auto-emailer/code.gs, index.html, appsscript.json, .github/workflows/ci.yml. Read-only; `node --test auto-emailer/tests/*.test.js` = 46/46 pass.
Prior audit: security-review-2026-11-10-2110.md (1 MEDIUM). index.html and appsscript.json unchanged since then [verified: git diff 2026f6f..HEAD empty for both].

## Verdict: PASS
No CRITICAL/HIGH/MEDIUM. No alerts at or above floor.

No security vulnerabilities found in the reviewed changes.

## Fix verification (prior Alert 1)

| Check | Result |
|---|---|
| Every `GmailApp.sendEmail` path | 3 call sites. :713 (processAndSend) and :1049 (sendSingleEmail) are both guarded by `isValidSingleEmail_` immediately before, send `to.trim()`. :788 (sendTestEmail) sends only to `Session.getActiveUser()` email, no sheet-controlled recipient. `sendEmailBatch` has no direct send (delegates to sendSingleEmail path). `MailApp`/`createDraft`/`.send()` not used [verified: grep]. |
| Regex bypass | `/^[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+$/` with no `m` flag: `$` anchors at true end, so no trailing-newline trick. Tested rejects: comma, semicolon, space, LF, display-name `"x" <a@b>`, U+2028, U+00A0, U+3000 (`\s` covers). U+200B and U+0085 pass but are not a Gmail list separator and yields one malformed address (self-failing). Validated string == string sent (both `.trim()`), no TOCTOU. |
| HTML escaping coverage | `fillInTemplateFromObject_` substitutes `{{x}}` in exactly two passes: subject+text raw, html through `escapeHtmlValue_` (& < > " ' and newlines to `<br>`). Only substitution path is processEmailRow -> html; no other place interpolates cell data into html. Single pass, so a cell containing `{{y}}` is not re-expanded. Escaping runs before `escapeData_`/JSON.parse; `<br>` and entities survive intact. Quotes escaped so attribute-context placeholders cannot break out. |
| Subject not rendered as HTML | Subject goes only to GmailApp subject (plain header) and `[TEST]` prefix. Never in `htmlBody`. `getEmailPreview` (returns subject/body) is not called from index.html; no client sink receives subject. Draft subjects shown in UI are escaped (`escapeHtml`, index.html:356). |
| Tests | injection.test.js covers recipient and html cases; passes. |

## Re-audit of whole app (nothing reportable)
- Client: all `innerHTML` with server/sheet data escaped (index.html:244,292,356,398,464,482 etc.); rest are constants/numbers. No eval/document.write/jQuery html.
- doGet error page escapes message (code.gs:18). No ALLOWALL framing. No token exposure.
- Scopes all used; web app executeAs USER_ACCESSING so sheet/gmail access is the visitor's own. `access: ANYONE` is required for sharing with NGO users and each visitor authenticates with their own grants (not reported).
- Formula injection: written values are fixed-prefix strings; not exploitable.
- CI: official `actions/*@v4`, `permissions: contents: read`, no secrets, no `pull_request_target`. Prior LOW (token permissions) is now resolved.
- Residual below bar (not reported): subject CRLF from cell goes to GmailApp (Google builds MIME; behavior not verifiable offline, confidence <6). Draft-placeholder in `href` lets a submitter put their own link in a mail sent to their own address only (no cross-recipient impact now that list is blocked).
