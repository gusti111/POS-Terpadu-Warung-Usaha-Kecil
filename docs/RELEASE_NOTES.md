# Release Notes — POS Terpadu v1.0.0

## Included
- Responsive web/PWA starter with Owner and Cashier roles.
- Local workspace setup and PIN login using Web Crypto PBKDF2 + salt.
- POS checkout for cash, QRIS and bank transfer.
- Pending verification workflow; pending payments do not count as revenue or reduce stock.
- Product/category management, inventory movements, shifts, expenses, transaction history, reports and exports.
- Demo data, theme toggle, browser receipt printing, backup JSON.
- Supabase PostgreSQL starter migration with RLS/RPC design.
- Domain unit tests and setup/QA documentation.

## Validation evidence
- JavaScript syntax checks: passed.
- Node.js unit tests: 17 passed, 0 failed.
- Local HTTP smoke checks: 200 for root, stylesheet, main modules, manifest, service worker and icon.
- Browser E2E: not verified in this build environment; Chromium/Playwright navigation was blocked by the host browser policy.
- Supabase migration: not executed against a real PostgreSQL/Supabase staging database.

## Known limitations
- The application is a local single-browser demo, not a production multi-device POS.
- Frontend is native HTML/CSS/JavaScript ES modules to avoid external dependency installation in this build environment. This is a delivery choice; the PRD's production recommendation remains React + TypeScript + Vite.
- Supabase Auth/PostgREST/RPC adapter is not connected to the UI.
- Payment verification is manual simulation; no bank/QRIS provider integration exists.
- Receipt printing uses the browser print dialog; Bluetooth printer integration is not implemented.
- Full offline transaction queue, multi-branch, split payment and partial returns are outside MVP scope.
