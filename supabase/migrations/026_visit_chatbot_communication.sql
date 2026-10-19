-- Migration 026: Communication settings, college visit appointments,
-- FAQ chatbot, faculty visit tracking, reminders and absent follow-ups.
-- Apply after migrations 001-025. Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Dynamic system settings (admin-configurable, no hardcoded credentials)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_settings (
	id text primary key,
	category text not null check (category in ('communication','appointment','college','chatbot','security')),
	setting_key text not null,
	setting_value jsonb not null default '{}'::jsonb,
	is_secret boolean not null default false,
	description text,
	updated_by uuid references public.profiles (id) on delete set null,
	updated_at timestamptz not null default now(),
	unique (category, setting_key)
);

alter table public.erp_settings enable row level security;

drop policy if exists erp_settings_read on public.erp_settings;
create policy erp_settings_read on public.erp_settings
	for select to authenticated
	using (not is_secret or public.is_admin());

drop policy if exists erp_settings_manage on public.erp_settings;
create policy erp_settings_manage on public.erp_settings
	for all to authenticated
	using (public.is_admin())
	with check (public.is_admin());

grant select, insert, update, delete on public.erp_settings to authenticated;

-- Seed default non-secret settings (secrets must be configured by the admin
-- through the secure settings screen; they are never committed here).
insert into public.erp_settings (id, category, setting_key, setting_value, is_secret, description)
values
	('appointment.max_students_per_slot', 'appointment', 'max_students_per_slot', '{"value": 5}'::jsonb, false,
	 'Maximum students allowed per hourly visit slot per college.'),
	('appointment.reminder_hours_before', 'appointment', 'reminder_hours_before', '{"value": 24}'::jsonb, false,
	 'Hours before a visit appointment when the automatic reminder is sent.'),
	('college.timezone', 'college', 'timezone', '{"value": "Asia/Kolkata"}'::jsonb, false,
	 'Default college local timezone used for visit slots and reminders.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. College-wise holidays
-- ---------------------------------------------------------------------------
create table if not exists public.college_holidays (
	id uuid primary key default gen_random_uuid(),
	college_id uuid not null references public.colleges (id) on delete cascade,
	title text not null check (length(trim(title)) > 0),
	holiday_date date not null,
	description text,
	is_recurring boolean not null default false,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	unique (college_id, holiday_date, title)
);

create index if not exists college_holidays_college_idx on public.college_holidays (college_id);
create index if not exists college_holidays_date_idx on public.college_holidays (holiday_date);

alter table public.college_holidays enable row level security;

drop policy if exists college_holidays_read on public.college_holidays;
create policy college_holidays_read on public.college_holidays
	for select to authenticated
	using (
		public.has_permission('academics.read')
		or public.has_permission('academics.manage')
		or public.has_permission('admissions.read')
		or public.has_permission('admissions.manage')
	);

drop policy if exists college_holidays_manage on public.college_holidays;
create policy college_holidays_manage on public.college_holidays
	for all to authenticated
	using (public.has_permission('academics.manage') or public.is_admin())
	with check (public.has_permission('academics.manage') or public.is_admin());

grant select, insert, update, delete on public.college_holidays to authenticated;

-- ---------------------------------------------------------------------------
-- 3. College visit appointment booking
-- ---------------------------------------------------------------------------
create table if not exists public.visit_appointments (
	id uuid primary key default gen_random_uuid(),
	college_id uuid not null references public.colleges (id) on delete cascade,
	department_id uuid references public.departments (id) on delete set null,
	student_name text not null check (length(trim(student_name)) between 2 and 120),
	student_email text check (student_email is null or length(student_email) <= 254),
	student_mobile text not null check (student_mobile ~ '^[6-9][0-9]{9}$'),
	visit_date date not null,
	visit_hour integer not null check (visit_hour between 0 and 23),
	status text not null default 'scheduled'
		check (status in ('scheduled','confirmed','completed','absent','rescheduled','cancelled')),
	faculty_notified boolean not null default false,
	faculty_notified_at timestamptz,
	reminder_sent boolean not null default false,
	reminder_sent_at timestamptz,
	rescheduled_from uuid references public.visit_appointments (id) on delete set null,
	notes text,
	created_by uuid references public.profiles (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint valid_appointment check (visit_date >= current_date)
);

create index if not exists visit_appointments_college_date_idx on public.visit_appointments (college_id, visit_date);
create index if not exists visit_appointments_status_idx on public.visit_appointments (status);
create index if not exists visit_appointments_mobile_idx on public.visit_appointments (student_mobile);
create index if not exists visit_appointments_department_idx on public.visit_appointments (department_id);

-- Prevent the same student from booking the same hourly slot twice.
create unique index if not exists visit_appointments_unique_student_slot_idx
	on public.visit_appointments (college_id, visit_date, visit_hour, student_mobile)
	where status in ('scheduled','confirmed');

alter table public.visit_appointments enable row level security;

drop policy if exists visit_appointments_read on public.visit_appointments;
create policy visit_appointments_read on public.visit_appointments
	for select to authenticated
	using (
		public.has_permission('admissions.read')
		or public.has_permission('admissions.manage')
		or public.has_permission('academics.read')
		or public.has_permission('academics.manage')
		or public.has_permission('inquiries.read')
		or public.has_permission('inquiries.manage')
	);

drop policy if exists visit_appointments_insert on public.visit_appointments;
create policy visit_appointments_insert on public.visit_appointments
	for insert to authenticated
	with check (true);

drop policy if exists visit_appointments_manage on public.visit_appointments;
create policy visit_appointments_manage on public.visit_appointments
	for all to authenticated
	using (
		public.has_permission('admissions.manage')
		or public.has_permission('academics.manage')
		or public.is_admin()
	)
	with check (
		public.has_permission('admissions.manage')
		or public.has_permission('academics.manage')
		or public.is_admin()
	);

grant select, insert, update, delete on public.visit_appointments to authenticated;

-- ---------------------------------------------------------------------------
-- 4. FAQ chatbot content (dynamic Gujarati / English)
-- ---------------------------------------------------------------------------
create table if not exists public.faq_chatbot_content (
	id uuid primary key default gen_random_uuid(),
	question_en text not null check (length(trim(question_en)) > 0),
	question_gu text not null check (length(trim(question_gu)) > 0),
	answer_en text not null check (length(trim(answer_en)) > 0),
	answer_gu text not null check (length(trim(answer_gu)) > 0),
	category text not null default 'general',
	active boolean not null default true,
	display_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists faq_chatbot_content_category_idx on public.faq_chatbot_content (category, active);
create index if not exists faq_chatbot_content_order_idx on public.faq_chatbot_content (display_order);

alter table public.faq_chatbot_content enable row level security;

drop policy if exists faq_chatbot_content_read on public.faq_chatbot_content;
create policy faq_chatbot_content_read on public.faq_chatbot_content
	for select to anon, authenticated
	using (active = true);

drop policy if exists faq_chatbot_content_manage on public.faq_chatbot_content;
create policy faq_chatbot_content_manage on public.faq_chatbot_content
	for all to authenticated
	using (public.is_admin())
	with check (public.is_admin());

grant select, insert, update, delete on public.faq_chatbot_content to authenticated;

-- Seed a small default FAQ in Gujarati and English.
insert into public.faq_chatbot_content (question_en, question_gu, answer_en, answer_gu, category, display_order)
values
	('What are the college visiting hours?', 'કોલેજનું ભીડણ કયા સમયે છે?', 'Visiting hours are Monday to Saturday, 10:00 AM to 4:00 PM.', 'ભરવા માટે સોમવારથી શનિવાર સવારે 10:00 થી સાંજે 4:00 સુધી.', 'general', 1),
	('How do I book a college visit appointment?', 'હું કોલેજ મુલાકાત માટે એપોઇન્ટમેન્ટ કેવી રીતે બુક કરું?', 'Use the College Visit Appointment page, pick a college, date and hourly slot, then confirm.', 'કોલેજ મુલાકાત એપોઇન્ટમેન્ટ પેજ ઉપયોગ કરો, કોલેજ, તારીખ અને કલાકનું સ્લોટ પસંદ કરો પછી કન્ફર્મ કરો.', 'admission', 2),
	('What is the maximum number of students per visit slot?', 'મુલાકાત સ્લોટમાં મહત્તમ કેટલા વિદ્યાર્થી રહી શકે છે?', 'A maximum of 5 students are allowed per hourly slot.', 'પ્રતિ કલાક સ્લોટમાં મહત્તમ 5 વિદ્યાર્થીની મંજૂરી છે.', 'admission', 3),
	('Which documents should I carry for the visit?', 'મુલાકાત માટે કયા દસ્તાવેજ લેવા જોઈએ?', 'Carry your ID proof, mark sheet, and admission enquiry letter if you have one.', 'આઈડી પ્રુફ, માર્કશીટ અને અભ્યાસ પત્ર સાથે રાખો જો તમારે પાસે હોય.', 'documents', 4),
	('How can I reschedule a missed appointment?', 'મુલાકાત ચૂકી ગઈ હોય તો ફરીએ કેવી રીતે શિડ્યૂલ કરું?', 'Use the Absent Follow-Up option or contact the admission office to book a new slot.', 'અગમ મુલાકાત પછી નવું સ્લોટ બુક કરવા માટે absent follow-up વાપરો અથવા એડમિશન ઓફિસ સાથે સંપર્ક કરો.', 'admission', 5)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Faculty visit tracking
-- ---------------------------------------------------------------------------
create table if not exists public.faculty_visit_tracking (
	id uuid primary key default gen_random_uuid(),
	appointment_id uuid references public.visit_appointments (id) on delete set null,
	faculty_id uuid not null references public.faculty (id) on delete cascade,
	college_id uuid not null references public.colleges (id) on delete cascade,
	department_id uuid references public.departments (id) on delete set null,
	visit_date date not null,
	visit_hour integer not null check (visit_hour between 0 and 23),
	student_name text not null,
	student_mobile text not null,
	status text not null default 'scheduled'
		check (status in ('scheduled','completed','absent','rescheduled','cancelled')),
	faculty_notified boolean not null default false,
	faculty_notified_at timestamptz,
	reminder_sent boolean not null default false,
	notes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists faculty_visit_tracking_faculty_idx on public.faculty_visit_tracking (faculty_id);
create index if not exists faculty_visit_tracking_college_date_idx on public.faculty_visit_tracking (college_id, visit_date);
create index if not exists faculty_visit_tracking_department_idx on public.faculty_visit_tracking (department_id);
create index if not exists faculty_visit_tracking_status_idx on public.faculty_visit_tracking (status);

alter table public.faculty_visit_tracking enable row level security;

drop policy if exists faculty_visit_tracking_read on public.faculty_visit_tracking;
create policy faculty_visit_tracking_read on public.faculty_visit_tracking
	for select to authenticated
	using (
		public.has_permission('academics.read')
		or public.has_permission('academics.manage')
		or public.has_permission('admissions.read')
		or public.has_permission('admissions.manage')
	);

drop policy if exists faculty_visit_tracking_manage on public.faculty_visit_tracking;
create policy faculty_visit_tracking_manage on public.faculty_visit_tracking
	for all to authenticated
	using (public.has_permission('academics.manage') or public.has_permission('admissions.manage') or public.is_admin())
	with check (public.has_permission('academics.manage') or public.has_permission('admissions.manage') or public.is_admin());

grant select, insert, update, delete on public.faculty_visit_tracking to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Absent student follow-up and rescheduling
-- ---------------------------------------------------------------------------
create table if not exists public.absent_student_followups (
	id uuid primary key default gen_random_uuid(),
	appointment_id uuid not null references public.visit_appointments (id) on delete cascade,
	student_name text not null,
	student_mobile text not null,
	follow_up_channel text not null check (follow_up_channel in ('whatsapp','sms','email','call')),
	outcome text not null check (length(trim(outcome)) between 2 and 1000),
	rescheduled_to uuid references public.visit_appointments (id) on delete set null,
	followed_up_by uuid references public.profiles (id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists absent_student_followups_appointment_idx on public.absent_student_followups (appointment_id);
create index if not exists absent_student_followups_created_idx on public.absent_student_followups (created_at desc);

alter table public.absent_student_followups enable row level security;

drop policy if exists absent_student_followups_read on public.absent_student_followups;
create policy absent_student_followups_read on public.absent_student_followups
	for select to authenticated
	using (
		public.has_permission('admissions.manage')
		or public.has_permission('academics.manage')
		or public.is_admin()
	);

drop policy if exists absent_student_followups_manage on public.absent_student_followups;
create policy absent_student_followups_manage on public.absent_student_followups
	for all to authenticated
	using (public.has_permission('admissions.manage') or public.has_permission('academics.manage') or public.is_admin())
	with check (public.has_permission('admissions.manage') or public.has_permission('academics.manage') or public.is_admin());

grant select, insert, update, delete on public.absent_student_followups to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Appointment reminder log
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_reminders (
	id uuid primary key default gen_random_uuid(),
	appointment_id uuid not null references public.visit_appointments (id) on delete cascade,
	channel text not null check (channel in ('whatsapp','sms','email')),
	recipient text not null,
	sent_at timestamptz not null default now(),
	status text not null default 'sent'
		check (status in ('sent','failed','pending')),
	provider_message_id text,
	error_message text,
	created_at timestamptz not null default now()
);

create index if not exists appointment_reminders_appointment_idx on public.appointment_reminders (appointment_id);
create index if not exists appointment_reminders_sent_idx on public.appointment_reminders (sent_at desc);

alter table public.appointment_reminders enable row level security;

drop policy if exists appointment_reminders_read on public.appointment_reminders;
create policy appointment_reminders_read on public.appointment_reminders
	for select to authenticated
	using (
		public.has_permission('admissions.manage')
		or public.has_permission('academics.manage')
		or public.is_admin()
	);

drop policy if exists appointment_reminders_insert on public.appointment_reminders;
create policy appointment_reminders_insert on public.appointment_reminders
	for insert to authenticated
	with check (true);

grant select, insert on public.appointment_reminders to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Appointment capacity enforcement trigger
-- ---------------------------------------------------------------------------
create or replace function public.enforce_appointment_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	v_max integer;
	v_count integer;
begin
	select coalesce((setting_value->>'value')::integer, 5) into v_max
	from public.erp_settings
	where category = 'appointment' and setting_key = 'max_students_per_slot';

	if tg_op = 'INSERT' then
		select count(*) into v_count
		from public.visit_appointments
		where college_id = new.college_id
		  and visit_date = new.visit_date
		  and visit_hour = new.visit_hour
		  and status in ('scheduled','confirmed');
		if v_count >= v_max then
			raise exception 'This hourly slot is full (maximum % students per slot).', v_max;
		end if;
	elsif tg_op = 'UPDATE' then
		select count(*) into v_count
		from public.visit_appointments
		where college_id = new.college_id
		  and visit_date = new.visit_date
		  and visit_hour = new.visit_hour
		  and status in ('scheduled','confirmed')
		  and id <> new.id;
		if v_count >= v_max then
			raise exception 'This hourly slot is full (maximum % students per slot).', v_max;
		end if;
	end if;
	return new;
end;
$$;

revoke all on function public.enforce_appointment_capacity() from public;
grant execute on function public.enforce_appointment_capacity() to authenticated;

drop trigger if exists appointment_capacity_trigger on public.visit_appointments;
create trigger appointment_capacity_trigger
	before insert or update on public.visit_appointments
	for each row execute function public.enforce_appointment_capacity();

-- ---------------------------------------------------------------------------
-- 9. Add visit-related columns to faculty for tracking context
-- ---------------------------------------------------------------------------
alter table public.faculty add column if not exists phone text;
alter table public.faculty add column if not exists email text;
