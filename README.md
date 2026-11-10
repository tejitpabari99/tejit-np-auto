# tejit-np-auto — automations for nonprofits

Free, simple automations that take repetitive work off a nonprofit team's plate. Each one has a plain-language guide written for people who are not technical.

## Automations

| Automation | What it does | Guide | Open the tool |
|---|---|---|---|
| `auto-emailer` | Sends a personal email to many people at once, using a list in a Google Sheet and a Gmail draft as the template. | [Installation guide](auto-emailer/INSTALLATION_GUIDE.md) | [Open NGO Auto Emailer](https://script.google.com/macros/s/AKfycbw3OyqV-_Q4ubNhc4Rwjz0YeS3lmKdCaITJx3rsnp9CFzLpMvWW2XilI9LNTHIXsmle/exec) |

## Get help installing

If you use the **tejit-np-plugin** with your AI assistant, ask it to help you install any automation above. It reads the latest guide from this repo and walks you through it step by step.

## Adding a new automation

1. Create a folder for it at the top of this repo (kebab-case name, e.g. `thank-you-letters/`).
2. Put the code in that folder, plus an `INSTALLATION_GUIDE.md` written for non-technical users. Keep pictures in `<folder>/docs/images/`.
3. Add **one row** to the Automations table above. Keep the format exactly the same:
   - first column: the folder name in backticks,
   - second: one plain sentence,
   - third: a link to its `INSTALLATION_GUIDE.md`,
   - fourth: an `https://` link to open the tool (or `—` if there is none).
   Keep the 4 columns and the heading `Automations` unchanged.
4. Every `INSTALLATION_GUIDE.md` must have a **What you need** section (the plugin reads it) and an **Open the tool** link that is an `https://` link.

The tejit-np-plugin `install-automation` skill reads this table from
<https://raw.githubusercontent.com/tejitpabari99/tejit-np-auto/main/README.md>, so a new row shows up for plugin users without a plugin update.
