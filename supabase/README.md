# Supabase setup notes

`migrations/001_pos_core.sql` is a starter migration for a fresh development project, not a migration already applied to a live Supabase project.

## Before deployment

1. Create a Supabase project for development/staging.
2. Review the SQL with a PostgreSQL/Supabase engineer.
3. Run the migration against a fresh project and resolve any project-specific schema conflicts.
4. Create an Owner through Supabase Auth, then call `setup_owner_store` while authenticated.
5. Provision Cashier users with a trusted Edge Function/server-side workflow; do not share the Owner auth session.
6. Test RLS using separate Owner/Cashier accounts and at least two separate stores.
7. Add a client data adapter that uses the authenticated user's Supabase session and calls RPCs for checkout, void, stock adjustment, and shift open/close.

## RPC contract summary

- `setup_owner_store(p_store_name, p_owner_name, p_username, p_address?, p_phone?)` → store UUID.
- `create_sale(p_shift_id, p_payment_method, p_cash_received?, p_reference_no?, p_verified?, p_items, p_idempotency_key)` → invoice/status/total.
- `verify_pending_sale(p_sale_id)` → completed status; stock decremented atomically.
- `fail_pending_sale(p_sale_id, p_reason)` → failed status; no stock or revenue mutation.
- `void_sale(p_sale_id, p_reason)` → voided status; stock returned atomically.
- `adjust_stock(p_product_id, p_quantity, p_direction, p_reason)` → resulting stock.
- `open_shift(p_opening_cash)` → shift UUID.
- `close_shift(p_shift_id, p_counted_cash)` → expected/count/difference.

## Known gaps before a real release

- The static local-demo frontend does not yet include a Supabase Auth/PostgREST client adapter.
- Supabase employee provisioning/invitation workflow is intentionally not implemented in the browser.
- Expense mutations should be moved to dedicated RPCs with cash-shift ledger adjustment and immutable audit records.
- A shift-close/void policy for post-close voids and manual non-cash refunds must be formally approved.
- Add SQL tests for concurrent stock changes, rollback, RLS isolation, and idempotency before pilot.
