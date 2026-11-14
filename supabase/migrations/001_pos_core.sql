-- POS Terpadu — PostgreSQL/Supabase starter migration
-- Apply only to a fresh development/staging project after reviewing the PRD and this migration.
-- Browser clients must never receive the service_role key.

create extension if not exists pgcrypto;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  address text,
  phone text,
  timezone text not null default 'Asia/Pontianak',
  logo_path text,
  receipt_width text not null default '80' check (receipt_width in ('58','80')),
  cashier_expense_permission boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  username text not null,
  full_name text not null check (length(trim(full_name)) > 0),
  role text not null check (role in ('owner','cashier')),
  is_active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, username)
);

create unique index if not exists profiles_one_owner_per_store
  on public.profiles(store_id) where role = 'owner';

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  sku text,
  selling_price numeric(14,2) not null check (selling_price > 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  image_path text,
  unit text not null default 'pcs',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  opening_cash numeric(14,2) not null default 0 check (opening_cash >= 0),
  cash_sales numeric(14,2) not null default 0 check (cash_sales >= 0),
  non_cash_sales numeric(14,2) not null default 0 check (non_cash_sales >= 0),
  cash_expenses numeric(14,2) not null default 0 check (cash_expenses >= 0),
  cash_refunds numeric(14,2) not null default 0 check (cash_refunds >= 0),
  non_cash_refunds numeric(14,2) not null default 0 check (non_cash_refunds >= 0),
  expected_cash numeric(14,2) not null default 0,
  counted_cash numeric(14,2),
  cash_difference numeric(14,2),
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null))
);

create unique index if not exists shifts_one_open_per_cashier
  on public.shifts(cashier_id) where status = 'open';

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  shift_id uuid references public.shifts(id) on delete restrict,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  invoice_no text not null,
  status text not null check (status in ('pending_payment','completed','failed','voided')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  grand_total numeric(14,2) not null check (grand_total >= 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  failed_at timestamptz,
  failure_reason text,
  unique (store_id, invoice_no),
  unique (store_id, idempotency_key)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  quantity integer not null check (quantity > 0),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  method text not null check (method in ('cash','qris','bank_transfer')),
  status text not null check (status in ('pending','paid','failed','refunded')),
  amount numeric(14,2) not null check (amount >= 0),
  cash_received numeric(14,2),
  change_amount numeric(14,2),
  reference_no text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  shift_id uuid references public.shifts(id) on delete restrict,
  category_id uuid references public.expense_categories(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','bank_transfer')),
  status text not null default 'active' check (status in ('active','voided')),
  occurred_at timestamptz not null default now(),
  notes text,
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  performed_by uuid not null references public.profiles(id) on delete restrict,
  movement_type text not null check (movement_type in ('initial','sale','adjustment_in','adjustment_out','void_return')),
  qty_change integer not null check (qty_change <> 0),
  stock_before integer not null check (stock_before >= 0),
  stock_after integer not null check (stock_after >= 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists products_store_active_idx on public.products(store_id, is_active);
create index if not exists sales_store_created_idx on public.sales(store_id, created_at desc);
create index if not exists sales_shift_status_idx on public.sales(shift_id, status);
create index if not exists stock_movements_product_created_idx on public.stock_movements(product_id, created_at desc);
create index if not exists expenses_store_occurred_idx on public.expenses(store_id, occurred_at desc);

-- SECURITY DEFINER helpers avoid recursive profiles RLS evaluation.
create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public
as $$ select store_id from public.profiles where id = auth.uid() and is_active = true limit 1 $$;

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and is_active = true limit 1 $$;

create or replace function public.is_store_owner(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and store_id = p_store_id and role = 'owner' and is_active = true) $$;

create or replace function public.write_audit(
  p_store_id uuid, p_entity_type text, p_entity_id uuid, p_action text,
  p_before jsonb default null, p_after jsonb default null
) returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs(store_id, actor_id, entity_type, entity_id, action, before_data, after_data)
  values (p_store_id, auth.uid(), p_entity_type, p_entity_id, p_action, p_before, p_after);
end;
$$;

-- Owner setup runs after Auth user sign-up. A trigger or a trusted server workflow should call this once.
create or replace function public.setup_owner_store(
  p_store_name text, p_owner_name text, p_username text,
  p_address text default null, p_phone text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'profile_already_initialized'; end if;
  if length(trim(coalesce(p_store_name,''))) = 0 or length(trim(coalesce(p_owner_name,''))) = 0 then raise exception 'required_fields_missing'; end if;
  insert into public.stores(owner_id, name, address, phone)
  values (auth.uid(), trim(p_store_name), nullif(trim(p_address),''), nullif(trim(p_phone),''))
  returning id into v_store_id;
  insert into public.profiles(id, store_id, username, full_name, role)
  values (auth.uid(), v_store_id, lower(trim(p_username)), trim(p_owner_name), 'owner');
  perform public.write_audit(v_store_id, 'store', v_store_id, 'setup_owner', null, jsonb_build_object('name', trim(p_store_name)));
  return v_store_id;
end;
$$;

create or replace function public.create_sale(
  p_shift_id uuid,
  p_payment_method text,
  p_cash_received numeric default null,
  p_reference_no text default null,
  p_verified boolean default false,
  p_items jsonb default '[]'::jsonb,
  p_idempotency_key uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_store_id uuid; v_role text; v_sale_id uuid; v_invoice text; v_status text;
  v_total numeric(14,2) := 0; v_item jsonb; v_product public.products%rowtype;
  v_qty integer; v_paid boolean; v_shift public.shifts%rowtype; v_count integer;
begin
  v_store_id := public.current_store_id(); v_role := public.current_role();
  if v_store_id is null then raise exception 'profile_not_found'; end if;
  if v_role not in ('owner','cashier') then raise exception 'permission_denied'; end if;
  if p_payment_method not in ('cash','qris','bank_transfer') then raise exception 'invalid_payment_method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'cart_empty'; end if;

  -- Check the idempotency key before requiring an open shift. A network retry after
  -- the original request succeeded must return the original sale, not create a new one.
  select id into v_sale_id from public.sales where store_id = v_store_id and idempotency_key = p_idempotency_key;
  if v_sale_id is not null then
    return (select jsonb_build_object('sale_id', id, 'invoice_no', invoice_no, 'status', status, 'replayed', true) from public.sales where id = v_sale_id);
  end if;

  select * into v_shift from public.shifts where id = p_shift_id and store_id = v_store_id and cashier_id = auth.uid() and status = 'open' for update;
  if not found then raise exception 'active_shift_required'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty <= 0 then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and store_id = v_store_id and is_active = true
      for update;
    if not found then raise exception 'product_not_available'; end if;
    if v_product.stock_qty < v_qty then raise exception 'insufficient_stock:%:%', v_product.name, v_product.stock_qty; end if;
    v_total := v_total + (v_product.selling_price * v_qty);
  end loop;

  v_paid := case when p_payment_method = 'cash' then coalesce(p_cash_received,0) >= v_total else coalesce(p_verified,false) end;
  if p_payment_method = 'cash' and coalesce(p_cash_received,0) < v_total then raise exception 'cash_received_insufficient'; end if;
  v_status := case when v_paid then 'completed' else 'pending_payment' end;
  v_invoice := 'INV-' || to_char(now() at time zone 'Asia/Pontianak','YYYYMMDD') || '-' || lpad((floor(random()*999999)::int)::text,6,'0');

  insert into public.sales(store_id, shift_id, cashier_id, invoice_no, status, subtotal, grand_total, idempotency_key, completed_at)
  values (v_store_id, p_shift_id, auth.uid(), v_invoice, v_status, v_total, v_total, p_idempotency_key, case when v_paid then now() else null end)
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and store_id = v_store_id for update;
    insert into public.sale_items(sale_id, product_id, product_name_snapshot, sku_snapshot, unit_price, unit_cost, quantity, subtotal)
    values (v_sale_id, v_product.id, v_product.name, v_product.sku, v_product.selling_price, v_product.cost_price, v_qty, v_product.selling_price * v_qty);
    if v_paid then
      update public.products set stock_qty = stock_qty - v_qty, updated_at = now() where id = v_product.id and stock_qty >= v_qty;
      if not found then raise exception 'insufficient_stock'; end if;
      insert into public.stock_movements(store_id, product_id, performed_by, movement_type, qty_change, stock_before, stock_after, reference_type, reference_id, note)
      values (v_store_id, v_product.id, auth.uid(), 'sale', -v_qty, v_product.stock_qty, v_product.stock_qty - v_qty, 'sale', v_sale_id, 'Penjualan ' || v_invoice);
    end if;
  end loop;

  insert into public.payments(sale_id, method, status, amount, cash_received, change_amount, reference_no, paid_at)
  values (v_sale_id, p_payment_method, case when v_paid then 'paid' else 'pending' end, v_total,
    case when p_payment_method = 'cash' then p_cash_received else null end,
    case when p_payment_method = 'cash' and v_paid then p_cash_received - v_total else null end,
    nullif(trim(p_reference_no),''), case when v_paid then now() else null end);

  if v_paid then
    if p_payment_method = 'cash' then update public.shifts set cash_sales = cash_sales + v_total where id = p_shift_id;
    else update public.shifts set non_cash_sales = non_cash_sales + v_total where id = p_shift_id;
    end if;
  end if;
  perform public.write_audit(v_store_id, 'sale', v_sale_id, 'create_' || v_status, null, jsonb_build_object('invoice_no',v_invoice,'total',v_total,'payment_method',p_payment_method,'status',v_status));
  return jsonb_build_object('sale_id',v_sale_id,'invoice_no',v_invoice,'status',v_status,'total',v_total,'replayed',false);
end;
$$;

create or replace function public.verify_pending_sale(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid; v_sale public.sales%rowtype; v_payment public.payments%rowtype; v_shift public.shifts%rowtype; v_item record; v_product public.products%rowtype;
begin
  v_store_id := public.current_store_id();
  if public.current_role() <> 'owner' then raise exception 'permission_denied'; end if;
  select * into v_sale from public.sales where id = p_sale_id and store_id = v_store_id for update;
  if not found or v_sale.status <> 'pending_payment' then raise exception 'sale_not_pending'; end if;
  select * into v_payment from public.payments where sale_id = p_sale_id for update;
  if v_payment.status <> 'pending' then raise exception 'payment_not_pending'; end if;
  select * into v_shift from public.shifts where id = v_sale.shift_id and status = 'open' for update;
  if not found then raise exception 'origin_shift_not_open'; end if;
  for v_item in select * from public.sale_items where sale_id = p_sale_id
  loop
    select * into v_product from public.products where id = v_item.product_id and store_id = v_store_id and is_active = true for update;
    if not found or v_product.stock_qty < v_item.quantity then raise exception 'insufficient_stock:%', v_item.product_name_snapshot; end if;
    update public.products set stock_qty = stock_qty - v_item.quantity, updated_at = now() where id = v_product.id;
    insert into public.stock_movements(store_id, product_id, performed_by, movement_type, qty_change, stock_before, stock_after, reference_type, reference_id, note)
    values (v_store_id, v_product.id, auth.uid(), 'sale', -v_item.quantity, v_product.stock_qty, v_product.stock_qty - v_item.quantity, 'sale', p_sale_id, 'Verifikasi pembayaran pending');
  end loop;
  update public.sales set status = 'completed', completed_at = now() where id = p_sale_id;
  update public.payments set status = 'paid', paid_at = now() where sale_id = p_sale_id;
  if v_payment.method = 'cash' then update public.shifts set cash_sales = cash_sales + v_sale.grand_total where id = v_sale.shift_id;
  else update public.shifts set non_cash_sales = non_cash_sales + v_sale.grand_total where id = v_sale.shift_id;
  end if;
  perform public.write_audit(v_store_id, 'sale', p_sale_id, 'verify_payment', jsonb_build_object('status','pending_payment'), jsonb_build_object('status','completed'));
  return jsonb_build_object('sale_id',p_sale_id,'status','completed');
end;
$$;

create or replace function public.fail_pending_sale(p_sale_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid; v_sale public.sales%rowtype; v_payment public.payments%rowtype;
begin
  v_store_id := public.current_store_id();
  if public.current_role() <> 'owner' then raise exception 'permission_denied'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'failure_reason_required'; end if;
  select * into v_sale from public.sales where id = p_sale_id and store_id = v_store_id for update;
  if not found or v_sale.status <> 'pending_payment' then raise exception 'sale_not_pending'; end if;
  select * into v_payment from public.payments where sale_id = p_sale_id for update;
  if not found or v_payment.status <> 'pending' then raise exception 'payment_not_pending'; end if;
  update public.sales set status = 'failed', failure_reason = trim(p_reason), failed_at = now() where id = p_sale_id;
  update public.payments set status = 'failed' where sale_id = p_sale_id;
  -- Failed pending payments never decrement stock or affect cash/non-cash shift totals.
  perform public.write_audit(v_store_id, 'sale', p_sale_id, 'fail_pending_payment',
    jsonb_build_object('status','pending_payment','payment_status','pending'),
    jsonb_build_object('status','failed','payment_status','failed','reason',trim(p_reason)));
  return jsonb_build_object('sale_id',p_sale_id,'status','failed');
end;
$$;

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid; v_sale public.sales%rowtype; v_payment public.payments%rowtype; v_item record; v_product public.products%rowtype;
begin
  v_store_id := public.current_store_id();
  if public.current_role() <> 'owner' then raise exception 'permission_denied'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'void_reason_required'; end if;
  select * into v_sale from public.sales where id = p_sale_id and store_id = v_store_id for update;
  if not found or v_sale.status <> 'completed' then raise exception 'sale_not_voidable'; end if;
  select * into v_payment from public.payments where sale_id = p_sale_id for update;
  for v_item in select * from public.sale_items where sale_id = p_sale_id
  loop
    if v_item.product_id is not null then
      select * into v_product from public.products where id = v_item.product_id and store_id = v_store_id for update;
      if found then
        update public.products set stock_qty = stock_qty + v_item.quantity, updated_at = now() where id = v_product.id;
        insert into public.stock_movements(store_id, product_id, performed_by, movement_type, qty_change, stock_before, stock_after, reference_type, reference_id, note)
        values (v_store_id, v_product.id, auth.uid(), 'void_return', v_item.quantity, v_product.stock_qty, v_product.stock_qty + v_item.quantity, 'sale_void', p_sale_id, 'Void ' || v_sale.invoice_no || ': ' || trim(p_reason));
      end if;
    end if;
  end loop;
  if v_payment.method = 'cash' then
    update public.shifts set cash_refunds = cash_refunds + v_sale.grand_total where id = v_sale.shift_id;
    -- Keep a closed shift's expected cash/difference consistent after a post-close cash refund.
    update public.shifts
      set expected_cash = opening_cash + cash_sales - cash_expenses - cash_refunds,
          cash_difference = counted_cash - (opening_cash + cash_sales - cash_expenses - cash_refunds)
      where id = v_sale.shift_id and status = 'closed' and counted_cash is not null;
  else
    update public.shifts set non_cash_refunds = non_cash_refunds + v_sale.grand_total where id = v_sale.shift_id;
  end if;
  update public.sales set status = 'voided', void_reason = trim(p_reason), voided_at = now() where id = p_sale_id;
  update public.payments set status = 'refunded', refunded_at = now() where sale_id = p_sale_id;
  perform public.write_audit(v_store_id, 'sale', p_sale_id, 'void', jsonb_build_object('status','completed'), jsonb_build_object('status','voided','reason',trim(p_reason)));
  return jsonb_build_object('sale_id',p_sale_id,'status','voided');
end;
$$;

create or replace function public.adjust_stock(
  p_product_id uuid, p_quantity integer, p_direction text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid; v_product public.products%rowtype; v_delta integer;
begin
  v_store_id := public.current_store_id();
  if public.current_role() <> 'owner' then raise exception 'permission_denied'; end if;
  if p_quantity <= 0 or p_direction not in ('in','out') or length(trim(coalesce(p_reason,''))) = 0 then raise exception 'invalid_adjustment'; end if;
  select * into v_product from public.products where id = p_product_id and store_id = v_store_id and is_active = true for update;
  if not found then raise exception 'product_not_found'; end if;
  v_delta := case when p_direction = 'in' then p_quantity else -p_quantity end;
  if v_product.stock_qty + v_delta < 0 then raise exception 'insufficient_stock'; end if;
  update public.products set stock_qty = stock_qty + v_delta, updated_at = now() where id = p_product_id;
  insert into public.stock_movements(store_id, product_id, performed_by, movement_type, qty_change, stock_before, stock_after, reference_type, reference_id, note)
  values (v_store_id, p_product_id, auth.uid(), case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end, v_delta, v_product.stock_qty, v_product.stock_qty + v_delta, 'manual_adjustment', null, trim(p_reason));
  perform public.write_audit(v_store_id, 'product', p_product_id, 'stock_adjustment', jsonb_build_object('stock_qty',v_product.stock_qty), jsonb_build_object('stock_qty',v_product.stock_qty + v_delta,'reason',trim(p_reason)));
  return jsonb_build_object('product_id',p_product_id,'stock_qty',v_product.stock_qty + v_delta);
end;
$$;

create or replace function public.open_shift(p_opening_cash numeric default 0)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid; v_id uuid;
begin
  v_store_id := public.current_store_id();
  if v_store_id is null or p_opening_cash < 0 then raise exception 'invalid_open_shift'; end if;
  insert into public.shifts(store_id, cashier_id, opening_cash, expected_cash, status)
  values (v_store_id, auth.uid(), p_opening_cash, p_opening_cash, 'open') returning id into v_id;
  perform public.write_audit(v_store_id, 'shift', v_id, 'open', null, jsonb_build_object('opening_cash',p_opening_cash));
  return v_id;
end;
$$;

create or replace function public.close_shift(p_shift_id uuid, p_counted_cash numeric)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_store_id uuid; v_shift public.shifts%rowtype; v_expected numeric(14,2); v_difference numeric(14,2);
begin
  v_store_id := public.current_store_id();
  select * into v_shift from public.shifts where id = p_shift_id and store_id = v_store_id and cashier_id = auth.uid() and status = 'open' for update;
  if not found or p_counted_cash < 0 then raise exception 'shift_not_open'; end if;
  v_expected := v_shift.opening_cash + v_shift.cash_sales - v_shift.cash_expenses - v_shift.cash_refunds;
  v_difference := p_counted_cash - v_expected;
  update public.shifts set expected_cash = v_expected, counted_cash = p_counted_cash, cash_difference = v_difference, status = 'closed', closed_at = now() where id = p_shift_id;
  perform public.write_audit(v_store_id, 'shift', p_shift_id, 'close', jsonb_build_object('status','open'), jsonb_build_object('expected_cash',v_expected,'counted_cash',p_counted_cash,'cash_difference',v_difference));
  return jsonb_build_object('shift_id',p_shift_id,'expected_cash',v_expected,'counted_cash',p_counted_cash,'cash_difference',v_difference,'status','closed');
end;
$$;

-- RLS
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.shifts enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_logs enable row level security;

create policy stores_select_own on public.stores for select using (id = public.current_store_id());
create policy stores_update_owner on public.stores for update using (public.is_store_owner(id)) with check (public.is_store_owner(id));
create policy profiles_select_scope on public.profiles for select using (store_id = public.current_store_id() and (id = auth.uid() or public.current_role() = 'owner'));
create policy profiles_update_owner on public.profiles for update using (store_id = public.current_store_id() and public.current_role() = 'owner') with check (store_id = public.current_store_id());
create policy categories_select_scope on public.product_categories for select using (store_id = public.current_store_id());
create policy categories_owner_write on public.product_categories for all using (store_id = public.current_store_id() and public.current_role() = 'owner') with check (store_id = public.current_store_id() and public.current_role() = 'owner');
create policy products_select_scope on public.products for select using (store_id = public.current_store_id() and (is_active = true or public.current_role() = 'owner'));
create policy products_owner_write on public.products for all using (store_id = public.current_store_id() and public.current_role() = 'owner') with check (store_id = public.current_store_id() and public.current_role() = 'owner');
create policy shifts_select_scope on public.shifts for select using (store_id = public.current_store_id() and (cashier_id = auth.uid() or public.current_role() = 'owner'));
create policy sales_select_scope on public.sales for select using (store_id = public.current_store_id() and (cashier_id = auth.uid() or public.current_role() = 'owner'));
create policy sale_items_select_scope on public.sale_items for select using (exists (select 1 from public.sales s where s.id = sale_id and s.store_id = public.current_store_id() and (s.cashier_id = auth.uid() or public.current_role() = 'owner')));
create policy payments_select_scope on public.payments for select using (exists (select 1 from public.sales s where s.id = sale_id and s.store_id = public.current_store_id() and (s.cashier_id = auth.uid() or public.current_role() = 'owner')));
create policy expense_categories_select_scope on public.expense_categories for select using (store_id = public.current_store_id());
create policy expense_categories_owner_write on public.expense_categories for all using (store_id = public.current_store_id() and public.current_role() = 'owner') with check (store_id = public.current_store_id() and public.current_role() = 'owner');
create policy expenses_select_scope on public.expenses for select using (store_id = public.current_store_id() and (public.current_role() = 'owner' or created_by = auth.uid()));
create policy expenses_insert_scope on public.expenses for insert with check (store_id = public.current_store_id() and created_by = auth.uid() and (public.current_role() = 'owner' or (select cashier_expense_permission from public.stores where id = public.current_store_id()) = true));
create policy expenses_update_scope on public.expenses for update using (store_id = public.current_store_id() and (public.current_role() = 'owner' or created_by = auth.uid())) with check (store_id = public.current_store_id());
create policy movements_select_owner on public.stock_movements for select using (store_id = public.current_store_id() and public.current_role() = 'owner');
create policy audit_select_owner on public.audit_logs for select using (store_id = public.current_store_id() and public.current_role() = 'owner');

-- Deny direct client mutation of transaction-critical tables. Only SECURITY DEFINER RPCs write them.
revoke insert, update, delete on public.sales, public.sale_items, public.payments, public.stock_movements, public.audit_logs from anon, authenticated;
revoke insert, update, delete on public.shifts from anon, authenticated;

-- Tighten helper-function execution. RLS helpers are callable by signed-in clients;
-- write_audit remains internal to SECURITY DEFINER RPCs and cannot be called directly.
revoke all on function public.write_audit(uuid,text,uuid,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.current_store_id() from public, anon;
revoke all on function public.current_role() from public, anon;
revoke all on function public.is_store_owner(uuid) from public, anon;
grant execute on function public.current_store_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_store_owner(uuid) to authenticated;

-- Restrict which profile/store columns an authenticated Owner may change.
revoke update on public.profiles, public.stores from anon, authenticated;
grant update (username, full_name, is_active, permissions) on public.profiles to authenticated;
grant update (name, address, phone, timezone, logo_path, receipt_width, cashier_expense_permission) on public.stores to authenticated;

-- Category/product data is archived, not hard-deleted, by the application.
revoke delete on public.product_categories, public.products, public.expense_categories from anon, authenticated;
grant select on public.stores, public.profiles, public.product_categories, public.products, public.shifts,
  public.sales, public.sale_items, public.payments, public.expense_categories, public.expenses,
  public.stock_movements, public.audit_logs to authenticated;
grant insert, update on public.product_categories, public.products, public.expense_categories to authenticated;
grant insert, update on public.expenses to authenticated;

-- Execute grants for RPCs. setup_owner_store is called by an authenticated newly registered user.
revoke all on function public.setup_owner_store(text,text,text,text,text) from public, anon;
revoke all on function public.create_sale(uuid,text,numeric,text,boolean,jsonb,uuid) from public, anon;
revoke all on function public.verify_pending_sale(uuid) from public, anon;
revoke all on function public.fail_pending_sale(uuid,text) from public, anon;
revoke all on function public.void_sale(uuid,text) from public, anon;
revoke all on function public.adjust_stock(uuid,integer,text,text) from public, anon;
revoke all on function public.open_shift(numeric) from public, anon;
revoke all on function public.close_shift(uuid,numeric) from public, anon;
grant execute on function public.setup_owner_store(text,text,text,text,text) to authenticated;
grant execute on function public.create_sale(uuid,text,numeric,text,boolean,jsonb,uuid) to authenticated;
grant execute on function public.verify_pending_sale(uuid) to authenticated;
grant execute on function public.fail_pending_sale(uuid,text) to authenticated;
grant execute on function public.void_sale(uuid,text) to authenticated;
grant execute on function public.adjust_stock(uuid,integer,text,text) to authenticated;
grant execute on function public.open_shift(numeric) to authenticated;
grant execute on function public.close_shift(uuid,numeric) to authenticated;

-- Important implementation note:
-- Cashier Auth users must be provisioned by a trusted Edge Function / server workflow using an
-- admin-only secret, then linked to the correct store_id as role='cashier'. Never expose the
-- service_role key or create a cashier profile with a shared Owner Auth session.
