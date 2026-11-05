-- Migration 058: save the preferred timing on public inquiries

drop function if exists public.submit_public_inquiry_with_other(
  text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, text, text, text, text, text, jsonb
);

create function public.submit_public_inquiry_with_other(
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
  p_website text,
  p_college_id text,
  p_department text,
  p_faculty_id text,
  p_gender text,
  p_student_id text,
  p_course_id text,
  p_branch_id text,
  p_timing_slot text,
  p_other_responses jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_number text;
  v_response record;
begin
  if p_other_responses is null
    or jsonb_typeof(p_other_responses) <> 'object'
    or octet_length(p_other_responses::text) > 8192 then
    raise exception 'Invalid additional inquiry responses';
  end if;

  if length(coalesce(p_timing_slot, '')) > 120 then
    raise exception 'Invalid preferred timing';
  end if;

  for v_response in
    select key, value from jsonb_each(p_other_responses)
  loop
    if length(v_response.key) > 100
      or jsonb_typeof(v_response.value) <> 'object'
      or jsonb_typeof(v_response.value->'label') <> 'string'
      or jsonb_typeof(v_response.value->'value') <> 'string'
      or length(v_response.value->>'label') > 200
      or length(v_response.value->>'value') > 500 then
      raise exception 'Invalid additional inquiry response';
    end if;
  end loop;

  v_number := public.submit_public_inquiry(
    p_student_name,
    p_mobile,
    p_email,
    p_course_interest,
    p_branch_interest,
    p_qualification,
    p_city,
    p_source,
    p_message,
    p_consent,
    p_website,
    p_college_id,
    p_department,
    p_faculty_id,
    p_gender,
    p_student_id,
    p_course_id,
    p_branch_id
  );

  update public.inquiries
  set other_responses = p_other_responses,
      timing_slot = nullif(trim(coalesce(p_timing_slot, '')), '')
  where inquiry_number = v_number;

  return v_number;
end;
$$;

revoke all on function public.submit_public_inquiry_with_other(
  text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, text, text, text, text, text, text, jsonb
) from public;
grant execute on function public.submit_public_inquiry_with_other(
  text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, text, text, text, text, text, text, jsonb
) to anon, authenticated;
