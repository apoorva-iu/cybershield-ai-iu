# Cyber Shield Browser Extension (v0.2.0)

Developer preview browser extension for Google Chrome, Microsoft Edge, and Brave.

Screen suspicious job postings, UPI payment requests, and unsolicited messages for scam indicators directly in your browser.

> **Screening aid, not a legal finding.** All assessments indicate where evidence suggests warning signs or consistency.

---

## What It Does

1. **Inline Selection Check**: Select 30+ characters of text on any web page (or 10+ characters via the right-click menu **"Check selection with Cyber Shield"**). A small **Check this** chip appears next to your selection.
2. **Ready State Before Sending**: Clicking the chip or context menu item opens the verdict bubble in a **ready state**. Nothing is sent yet.
   - Choose how to check your text: **Job offer**, **UPI or payment**, or **Message**.
   - Review or edit the text in the preview box (up to 20,000 characters).
   - Your last selected option is remembered for next time.
3. **Instant In-Page Verdict**: Clicking **Check** analyzes the selected text and displays:
   - Objective risk level chip (`Low risk`, `Medium risk`, `High risk`, or `Unable to verify`).
   - Scam category badge and risk score (0–100, shown when numeric and verified).
   - Confidence band (`High`, `Medium`, `Low`) based strictly on API findings.
   - Headline sentence and top 3 findings or failed checks with clear text labels (never color alone).
   - One honest advisory line (e.g. sender authenticity note for messages, UPI PIN rule for payment requests, or threat intel evidence tally for jobs).
   - Tamper-evident ledger Proof ID with a 1-click copy button.
   - Collapsible **What was sent** section showing the exact parameters transmitted.
4. **Full Report & Downloads**:
   - **Open full report**: Opens the complete report on the Cyber Shield website with prefilled parameters (never runs automatically).
   - **Download receipt**: Saves the verification receipt JSON file (`<proof-id>.json`), byte-for-byte identical to the website's receipt.
   - **Download PDF**: Available for Job offers using the bundled report template. For UPI and Message checks, full printable reports are accessible on the web report page.
   - **Check again**: Returns to the ready state to refine your text or switch check types.

---

## Important Limitations

- **Selected Text Only**: The extension only reads text that you explicitly select.
- **Screenshots Are Not Read**: The extension does not capture, read, or upload screenshots. To scan screenshots, use the screenshot uploaders on the Cyber Shield website.
- **Developer Preview**: This package is installed unpacked via Developer mode. It is not currently hosted on a commercial extension store.

---

## What Each Call Sends and When

**Nothing is read, stored, or sent until you explicitly click "Check" in the bubble.**

All network calls are initiated by the background service worker without credentials, cookies, or authorization headers:

1. **Job offer** (`POST /api/verify`):
   - `url`: Current page URL without `#hash` fragments and stripped of sensitive query parameters (`token`, `key`, `auth`, `session`, `sid`, `password`, `secret`, `code`).
   - `company`: Site name from metadata or cleaned hostname (max 200 characters).
   - `email`: Recruiter email address only if exactly one email address is found in selected text, otherwise empty (max 200 characters).
   - `desc`: Selected text (10 to 20,000 characters).
2. **UPI or payment** (`POST /api/upi/check`):
   - `input`: Selected payment or transaction text (10 to 20,000 characters).
   - `source`: `"text"` (with `"pasted"` fallback if required by server validation).
3. **Message** (`POST /api/message/check`):
   - `input`: Selected message or conversation text (10 to 20,000 characters).
   - `source`: `"text"`.

---

## Rate Limits

To prevent automated abuse, per-IP rate limits apply to all extension requests:
- **Job offer (`POST /api/verify`)**: 6 requests per minute, 60 requests per day per IP.
- **UPI or payment (`POST /api/upi/check`)**: 120 requests per minute per IP.
- **Message (`POST /api/message/check`)**: 120 requests per minute per IP.

If a limit is exceeded, the bubble displays: *"Too many checks right now. Please try again in a minute."*

---

## Where It Cannot Run

Browser security policies prevent content scripts from executing on:
- Internal browser pages (`chrome://`, `edge://`, `brave://`)
- Browser web extension stores (e.g. Chrome Web Store)
- Built-in browser PDF viewers and local `file://` scheme pages without explicit user permission

---

## Loading Unpacked (Chrome, Edge, Brave)

1. Build the extension package:
   ```bash
   npm run extension:build
   ```
2. Open your browser's extension management page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
3. Enable **Developer mode** (toggle in the top-right or sidebar).
4. Click **Load unpacked**.
5. Select the `extension/` directory (or unzipped `cyber-shield-extension` folder).
6. Pin **Cyber Shield** to your browser toolbar.

---

## How to Rebuild

- **Build extension bundle**:
  ```bash
  npm run extension:build
  ```
  Bundles `extension/src/content.js` and `extension/src/background.js` into `extension/dist/` using esbuild and generates icons.

- **Create zip distribution**:
  ```bash
  npm run extension:zip
  ```
  Packages `cyber-shield-extension.zip` and `extension-info.json` into `web/public/downloads/` and `public/downloads/`.

- **Build everything (extension zip + web app)**:
  ```bash
  npm run build:all
  ```
