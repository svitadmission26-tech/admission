create or replace function public.student_get_my_inquiry_prefill()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
  v_inquiry jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to load your inquiry details';
  end if;

  select account.email
  into v_email
  from auth.users account
  where account.id = auth.uid()
    and account.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'Verify your login email to load inquiry details';
  end if;

  select jsonb_build_object(
    'inquiry_number', inquiry.inquiry_number,
    'student_name', inquiry.student_name,
    'mobile', inquiry.mobile,
    'email', inquiry.email,
    'course_interest', inquiry.course_interest,
    'branch_interest', inquiry.branch_interest,
    'qualification', inquiry.qualification,
    'city', inquiry.city
  )
  into v_inquiry
  from public.inquiries inquiry
  where lower(trim(inquiry.email)) = lower(trim(v_email))
  order by inquiry.created_at desc
  limit 1;

  return v_inquiry;
end;
$$;

revoke all on function public.student_get_my_inquiry_prefill() from public;
revoke all on function public.student_get_my_inquiry_prefill() from anon;
grant execute on function public.student_get_my_inquiry_prefill() to authenticated;
