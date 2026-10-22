-- Migration 027: Inquiry college, department and faculty linkage
-- Adds college_id, department and faculty_id to inquiries so the inquiry
-- management dashboard can link each incoming inquiry to a specific college,
-- department, and the staff member charged with handling it.

alter table if exists public.inquiries
	add column if not exists student_id uuid references public.students(id) on delete set null;

alter table if exists public.inquiries
	add column if not exists course_id uuid references public.courses(id) on delete set null;

alter table if exists public.inquiries
	add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table if exists public.inquiries
	add column if not exists college_id uuid references public.colleges(id) on delete set null;

alter table if exists public.inquiries
	add column if not exists department text not null default '';

alter table if exists public.inquiries
	add column if not exists faculty_id uuid references public.profiles(id) on delete set null;

alter table if exists public.inquiries
	add column if not exists gender text check (gender in ('male', 'female', 'other')) default '';

alter table if exists public.inquiries
	add column if not exists timing_slot text default '';

drop policy if exists inquiry_college_read on public.inquiries;
create policy inquiry_college_read on public.inquiries
	for select to authenticated
	using (
		public.has_permission('inquiries.manage')
		or public.has_permission('inquiries.read')
	);

drop policy if exists inquiry_college_update on public.inquiries;
create policy inquiry_college_update on public.inquiries
	for update to authenticated
	using (public.has_permission('inquiries.manage'))
	with check (public.has_permission('inquiries.manage'));

create or replace function public.submit_public_inquiry(
	p_student_name text,
	p_mobile text,
	p_email text,
	p_course_interest text,
	p_branch_interest text,
	p_qualification text,
	p_city text,
	p_source text,
	p_message text,
	p_consent boolean,
	p_website text default '',
	p_college_id text default '',
	p_department text default '',
	p_faculty_id text default '',
	p_gender text default '',
	p_student_id text default '',
	p_course_id text default '',
	p_branch_id text default ''
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	v_number text;
begin
	if coalesce(p_website, '') <> '' then
		raise exception 'Invalid submission';
	end if;
	if p_consent is distinct from true then
		raise exception 'Consent required';
	end if;
	if length(trim(coalesce(p_student_name, ''))) not between 2 and 120
		or coalesce(p_mobile, '') !~ '^[6-9][0-9]{9}$' then
		raise exception 'Invalid required fields';
	end if;
	if length(trim(coalesce(p_course_interest, ''))) not between 2 and 120 then
		raise exception 'Invalid required fields';
	end if;
	if length(coalesce(p_email, '')) > 254
		or (
			nullif(trim(coalesce(p_email, '')), '') is not null
			and p_email !~* '^[^ @]+@[^ @]+[.][^ @]+$'
		)
	then
		raise exception 'Invalid optional fields';
	end if;

	insert into public.inquiries (
		student_name,
		mobile,
		email,
		course_interest,
		branch_interest,
		qualification,
		city,
		source,
		message,
		consent,
		assigned_to,
		next_follow_up_at,
		created_at,
		updated_at,
		college_id,
		department,
		faculty_id,
		gender,
		student_id,
		course_id,
		branch_id
	)
	values (
		trim(p_student_name),
		p_mobile,
		nullif(trim(coalesce(p_email, '')), ''),
		trim(p_course_interest),
		trim(p_branch_interest),
		left(nullif(trim(p_qualification), ''), 120),
		left(nullif(trim(p_city), ''), 120),
		left(coalesce(nullif(trim(p_source), ''), 'website'), 40),
		nullif(trim(coalesce(p_message, '')), ''),
		auth.uid() /* default assignee = current staff if any */,
		now(),
		now(),
		case when trim(p_college_id) <> '' then p_college_id::uuid end,
		coalesce(trim(p_department), ''),
		case when trim(p_faculty_id) <> '' then p_faculty_id::uuid end,
		coalesce(trim(p_gender), ''),
		case when trim(p_student_id) <> '' then p_student_id::uuid end,
		case when trim(p_course_id) <> '' then p_course_id::uuid end,
		case when trim(p_branch_id) <> '' then p_branch_id::uuid end
	)
	returning inquiry_number into v_number;
	return v_number;
end;
$$;

revoke all on function public.submit_public_inquiry(
	text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.submit_public_inquiry(
	text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, text, text
) to anon, authenticated;
