-- Admission chatbot and visit appointment foundation. Apply after 025.
create table if not exists public.admission_visit_settings (
 college_id uuid primary key, timezone text not null default 'Asia/Kolkata',
 opening_time time not null default '09:00', closing_time time not null default '17:00',
 lunch_start time default '13:00', lunch_end time default '14:00',
 slot_minutes integer not null default 60 check (slot_minutes between 15 and 180),
 capacity integer not null default 5 check (capacity between 1 and 100),
 booking_enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 check (opening_time < closing_time),
 check ((lunch_start is null and lunch_end is null) or (lunch_start is not null and lunch_end is not null and lunch_start < lunch_end))
);
create table if not exists public.admission_visit_holidays (
 college_id uuid not null, closed_date date not null, reason text not null default '',
 primary key (college_id, closed_date)
);
create table if not exists public.admission_chatbot_faq (
 id uuid primary key default gen_random_uuid(), college_id uuid not null,
 department text not null default '', language text not null default 'gu',
 category text not null default 'admission', question text not null, answer text not null,
 display_order integer not null default 0, enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create index if not exists admission_chatbot_lookup on public.admission_chatbot_faq(college_id, language, enabled, display_order);
create table if not exists public.admission_visit_appointments (
 id uuid primary key default gen_random_uuid(), college_id uuid not null,
 inquiry_id uuid not null, department text not null default '',
 visit_date date not null, start_time time not null, end_time time not null,
 status text not null default 'booked' check (status in ('booked','visited','absent','cancelled','rescheduled')),
 contact_consent boolean not null default false, followup_notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (start_time < end_time)
);
create unique index if not exists admission_one_active_visit_per_inquiry
 on public.admission_visit_appointments(inquiry_id) where status = 'booked';
create index if not exists admission_visit_capacity_lookup
 on public.admission_visit_appointments(college_id, visit_date, start_time, status);
-- All tables deny client access by default. Public FAQ must be served by a controlled API.
alter table public.admission_visit_settings enable row level security;
alter table public.admission_visit_holidays enable row level security;
alter table public.admission_chatbot_faq enable row level security;
alter table public.admission_visit_appointments enable row level security;
-- Execute through a trusted server with the service-role key, never from a public browser.
create or replace function public.reserve_admission_visit(
 p_college_id uuid, p_inquiry_id uuid, p_department text,
 p_date date, p_start time, p_consent boolean default false
) returns uuid language plpgsql security invoker set search_path = public as $$
declare s public.admission_visit_settings%rowtype; v_count integer; v_id uuid; v_end time;
begin
 -- Serialize all bookings for the same college and date, including concurrent requests.
 perform pg_advisory_xact_lock(hashtextextended(p_college_id::text || ':' || p_date::text, 0));
 select * into s from public.admission_visit_settings where college_id = p_college_id;
 if not found or not s.booking_enabled then raise exception 'Visit booking is unavailable'; end if;
 if p_date < (now() at time zone s.timezone)::date then raise exception 'Past date'; end if;
 if extract(isodow from p_date) = 7 then raise exception 'College closed on Sunday'; end if;
 if exists (select 1 from public.admission_visit_holidays where college_id=p_college_id and closed_date=p_date) then raise exception 'College holiday'; end if;
 v_end := p_start + make_interval(mins => s.slot_minutes);
 if p_start < s.opening_time or v_end > s.closing_time or
    (s.lunch_start is not null and p_start < s.lunch_end and v_end > s.lunch_start) or
    (extract(epoch from (p_start - s.opening_time))::integer % (s.slot_minutes * 60)) <> 0
 then raise exception 'Invalid slot'; end if;
 if p_date = (now() at time zone s.timezone)::date and p_start <= (now() at time zone s.timezone)::time then raise exception 'Past time'; end if;
 select count(*) into v_count from public.admission_visit_appointments
 where college_id=p_college_id and visit_date=p_date and start_time=p_start and status='booked';
 if v_count >= s.capacity then raise exception 'Slot full, select another time'; end if;
 insert into public.admission_visit_appointments(college_id,inquiry_id,department,visit_date,start_time,end_time,contact_consent)
 values(p_college_id,p_inquiry_id,coalesce(p_department,''),p_date,p_start,v_end,p_consent) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.reserve_admission_visit(uuid,uuid,text,date,time,boolean) from public, anon, authenticated;
grant execute on function public.reserve_admission_visit(uuid,uuid,text,date,time,boolean) to service_role;
