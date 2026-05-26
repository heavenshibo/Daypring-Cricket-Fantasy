# Dayspring Personal Finance

A mobile-first personal finance tracker. Runs entirely in your browser, installs to your phone's home screen like a native app, and stores all data locally — nothing leaves your device.

## What it tracks

- **Bank accounts** — multiple accounts with balances
- **Credit cards** — statement spent, statement date, due date, limit, utilization
- **Loans** — home, car, personal, etc. with EMI, principal, remaining, next due date
- **Lending & borrowing** — money you've lent or borrowed, per person, with optional due dates
- **Transactions** — income and expenses by category
- **Dashboard** — net worth, upcoming dues, monthly in/out, top spending categories

## Run it

No build step. Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Install on your phone

1. Open the URL in Safari (iOS) or Chrome (Android)
2. Tap Share / menu → **Add to Home Screen**
3. Launch from the icon — it runs fullscreen like a native app, works offline

## Data

- Stored in `localStorage` under the key `dayspring_finance_v1`
- Export / Import JSON from the **More** tab to back up or move between devices
- Reset wipes everything

## Files

- `index.html` — shell, app bar, bottom tab bar
- `styles.css` — mobile-first design system
- `app.js` — all app logic (router, state, screens, CRUD)
- `manifest.webmanifest` + `sw.js` + `icon.svg` — PWA bits
