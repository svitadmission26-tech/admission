create table if not exists public.admission_sequences (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges (id),
  academic_year text not null,
  course_id uuid references public.courses (id),
  admission_type text not null,
  prefix text not null,
  current_sequence integer not null default 0 check (current_sequence >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admission_sequences_configuration_unique
  on public.admission_sequences (
    college_id,
    academic_year,
    (coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    lower(admission_type)
  );

create table if not exists public.payment_gateways (
  id uuid primary key default gen_random_uuid(),
  college_id uuid references public.colleges (id),
  name text not null,
  provider text not null,
  environment text not null default 'test'
    check (environment in ('test', 'production')),
  public_key text,
  description text not null default '',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_gateways_configuration_unique
  on public.payment_gateways (
    (coalesce(college_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    lower(name)
  );

create table if not exists public.bus_seva_qr_configs (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges (id),
  route_code text not null,
  route_name text not null,
  qr_base_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bus_seva_qr_configs_route_unique
  on public.bus_seva_qr_configs (college_id, lower(route_code));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admission_sequences',
    'payment_gateways',
    'bus_seva_qr_configs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists admin_all on public.%I', table_name);
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      table_name
    );
  end loop;
end
$$;
