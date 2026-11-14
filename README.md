# POS Terpadu — Warung & Usaha Kecil

A responsive web/PWA Point of Sale (POS) application designed for small shops and micro businesses. Built as a local demo MVP with browser-based data storage (`localStorage`) and a Supabase backend schema draft ready for production integration.

> **Current Status: Local Demo MVP.** The UI and operational flow run in the browser with data stored in `localStorage`. The Supabase backend is not yet connected. **Do not use this local mode as a production cashier system or to store sensitive financial/identity data.**

## Live Demo

Visit the deployed site: **[POS Terpadu on GitHub Pages](https://gusti111.github.io/POS-Terpadu-Warung-Usaha-Kecil/)**  
*(Or run locally — see "Running the App" below.)*

## Features

- **Workspace & Owner setup** — Create a shop workspace and Owner account without a default PIN.
- **Local login** — Owner/Cashier accounts with PIN derived via PBKDF2 + salt using Web Crypto.
- **Dashboard** — Net revenue, gross profit, expenses, low stock alerts, 7-day trend, and recent transactions.
- **POS / Cashier** — SKU/name search, category filter, cart, quantity control, checkout (cash / QRIS / bank transfer).
- **Pending payments** — QRIS/transfer can be saved as **Pending**. Pending does not add revenue or reduce stock. Owner can verify payment while the originating shift is still open.
- **CRUD / Archive** — Products and categories with selling price, COH (cost of goods), minimum stock, and unique SKU.
- **Stock adjustment** — Stock in/out with reason and mutation ledger.
- **Transaction history** — Invoice details, receipt printing, CSV export, and void with reason.
- **Shift management** — Open/close shift, opening cash, expected cash, actual cash, and variance.
- **Expenses** — Cash/non-cash expenses, edit, and void with audit trail.
- **Reports** — Today / 7-day / 30-day periods; revenue, COGS, gross profit, expenses, estimated operating profit, and payment mix.
- **Employees** — Add, edit, activate/deactivate, and reset PIN for cashier accounts.
- **Store profile** — Light/dark theme, JSON backup export, PWA shell cache.
## Tech Stack

- **HTML5, CSS3, JavaScript (ES Modules)** — No external npm dependencies; zero `node_modules` required.
- **Service Worker (PWA)** — Shell caching for offline use.
- **Web Crypto API** — PBKDF2 PIN derivation for local authentication.
- **localStorage** — Client-side data persistence (demo mode).
- **Supabase (draft)** — PostgreSQL schema, RLS, and RPC functions prepared in `supabase/migrations/001_pos_core.sql`.

## Project Structure

```
pos-terpadu-app/
├── index.html              # Entry point
├── styles.css              # Modern Clean design system
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Service Worker (PWA shell cache)
├── server.mjs              # Local dev server (Node.js)
├── package.json            # Project metadata & scripts
├── .gitignore              # Git ignore rules
├── README.md               # This file
│
├── src/                    # Application source
│   ├── main.js             # Screen rendering, event handlers, navigation, modals
│   ├── domain.js           # Business rules & state transitions
│   ├── store.js            # Local persistence, PIN hashing, seed data, backup
│   ├── format.js           # Rupiah, dates, escaping, identifiers
│   └── icons.js            # Inline SVG icon set
│
├── supabase/               # Backend schema (draft)
│   ├── migrations/001_pos_core.sql
│   └── README.md
│
├── tests/                  # Unit tests (Node.js built-in test runner)
│   ├── domain.test.mjs
│   └── store.test.mjs
│
└── docs/
    ├── IMPLEMENTATION_NOTES.md
    └── QA_CHECKLIST.md
```

## Running the App

### Option 1: Node.js (recommended)

Requires Node.js 18+ (Node 20+ recommended). No external dependencies to install.

```bash
# 1. Open the project folder
cd pos-terpadu-app

# 2. Start the local server
npm run dev

# 3. Open in browser
# http://localhost:4173
```

### Option 2: Python (no Node.js)

```bash
python -m http.server 4173
# Then open http://localhost:4173
```

> **Important:** Web Crypto API and the PWA Service Worker require `localhost` or HTTPS. Do not open `index.html` directly via `file://`.
## First-Time Setup

1. Fill in shop name, Owner name, username, and a personal 4–6 digit PIN.
2. Choose **Load sample data** to load catalog, simulated transactions, stock mutations, and example shifts.
3. Log in using the Owner username and PIN you created.
4. Go to **Employees** to create a Cashier account and PIN.
5. Log out, then log in as Cashier to try the restricted views and shift flow.

Sample data is fictional and local. It can be deleted via **Settings → Reset workspace demo**.

## User Roles (Demo Mode)

| Role | Permissions |
|------|-------------|
| **Owner** | Dashboard, POS, all transactions, products, categories, inventory, all shifts, expenses, reports, employees, and settings. |
| **Cashier** | POS, own transactions, own shifts, and own expenses (if Owner enables cashier expense permission). No access to products, inventory, reports, employees, or store settings. |

> Menu protection in demo mode is UX/frontend only. In production, the same rules must be enforced by Supabase Auth + RLS + RPC, not just frontend navigation.

## Business Rules (Demo Mode)

- Only transactions with `sale.status = completed` and `payment.status = paid` count as revenue. Failed and voided transactions are excluded.
- Payment method (`cash`, `qris`, `bank_transfer`) is separate from stock movement.
- Cash/QRIS/bank transfer marked **Pending** do not add revenue or reduce stock. Pending must be verified or marked failed by the Owner before the originating shift is closed.
- Selling price, COGS, SKU, and product name are snapshotted at transaction completion.
- Stock cannot go negative; stock reduction/return is recorded as a mutation.
- Completed sales cannot be edited or deleted. Corrections are made via void with reason and a reversing stock mutation.
- Expected cash = opening cash + cash sales − cash expenses − cash refunds.
- One local account can have only one active shift at a time.

## Testing

Run the built-in Node.js test suite:

```bash
npm test
```

Tests cover core domain rules using Node's native test runner. They do not cover browser integration, Supabase, RLS, physical printers, or cross-device behavior. Use `docs/QA_CHECKLIST.md` for manual testing before pilot deployment.

## Design System

The app uses a **Modern Clean** design system with:

- **Palette** — Navy/Blue brand (`#2563eb`), with semantic success (emerald), warning (amber), and danger (rose) colors.
- **Dual theme** — Light and dark mode via CSS variables.
- **Typography** — Inter/system-ui font stack with a modular type scale.
- **Components** — Cards, buttons, badges, modals, toasts, metric cards, product grid, cart panel, and sidebar navigation drawer.
- **Responsive** — Breakpoints at 1024px, 768px, and 480px. Sidebar becomes an off-canvas drawer on mobile.

## Backend — Supabase (Not Connected Yet)

The file `supabase/migrations/001_pos_core.sql` contains a draft PostgreSQL schema with constraints, authorization helpers, RLS policies, and RPC functions for Owner setup, atomic checkout, pending payment verification, void, stock adjustment, and shifts.

Before using the backend:

1. Create a Supabase development project.
2. Review and run the migration on an empty/staging database.
3. Test Owner setup, dual-account/two-shop RLS, RPC rollback, idempotency, concurrent stock, and void.
4. Implement the Auth/PostgREST/RPC adapter on the frontend and replace the local repository.
5. Ensure each Cashier has their own Auth identity; do not run all Cashier queries through the Owner session.

**Never** store the `service_role` key in the browser. The browser may only use the anon/publishable key with tested RLS policies.

## License

This project is provided as a demo/MVP for small business use. See the repository for details.

## Repository

[https://github.com/gusti111/POS-Terpadu-Warung-Usaha-Kecil](https://github.com/gusti111/POS-Terpadu-Warung-Usaha-Kecil)