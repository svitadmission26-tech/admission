-- Migration 049: Dynamic fees management enhancements
-- Adds branch, admission type and fee category applicability to fee structures,
-- a receipt attachment column on payments, and database-level over-collection
-- prevention. Idempotent and safe to re-run.

alter table public.fee_structures
  add column if not exists branch_id uuid references public.branches (id) on delete set null,
  add column if not exists admission_type text,
  add column if not exists fee_category text;

create index if not exists fee_structures_branch_idx on public.fee_structures (branch_id);
create index if not exists fee_structures_admission_type_idx on public.fee_structures (admission_type);

alter table public.payments
  add column if not exists receipt_url text;

create or replace function public.prevent_fee_over_collection()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assigned bigint;
  v_paid bigint;
begin
  if new.assignment_id is null then
    return new;
  end if;
  select amount_paise into v_assigned
  from public.fee_assignments
  where id = new.assignment_id;
  if v_assigned is null then
    return new;
  end if;
  select coalesce(sum(amount_paise), 0) into v_paid
  from public.payments
  where assignment_id = new.assignment_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_paid + coalesce(new.amount_paise, 0) > v_assigned then
    raise exception 'Payment would exceed the assigned fee amount.';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_prevent_over_collection on public.payments;
create trigger payments_prevent_over_collection
  before insert or update on public.payments
  for each row execute function public.prevent_fee_over_collection();
