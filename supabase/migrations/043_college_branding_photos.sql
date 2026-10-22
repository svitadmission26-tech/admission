-- Migration 043: College branding photos and university logos
-- Idempotent and safe to re-run.

-- University logo support.
alter table public.universities
  add column if not exists logo_url text;

-- College photos (up to four) for the login page carousel.
alter table public.colleges
  add column if not exists photo_1_url text,
  add column if not exists photo_2_url text,
  add column if not exists photo_3_url text,
  add column if not exists photo_4_url text;

-- Extend the college branding read so the login page can show the college
-- name, logo and up to four dynamic photos.
create or replace function public.get_college_branding()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'name', college.name,
        'logo_url', college.logo_url,
        'university_name', college.university_name,
        'photos', jsonb_build_array(
          nullif(trim(coalesce(college.photo_1_url, '')), ''),
          nullif(trim(coalesce(college.photo_2_url, '')), ''),
          nullif(trim(coalesce(college.photo_3_url, '')), ''),
          nullif(trim(coalesce(college.photo_4_url, '')), '')
        )
      )
      from public.colleges college
      where college.active
        and nullif(trim(coalesce(college.logo_url, '')), '') is not null
      order by college.name
      limit 1
    ),
    (
      select jsonb_build_object(
        'name', college.name,
        'logo_url', college.logo_url,
        'university_name', college.university_name,
        'photos', jsonb_build_array(
          nullif(trim(coalesce(college.photo_1_url, '')), ''),
          nullif(trim(coalesce(college.photo_2_url, '')), ''),
          nullif(trim(coalesce(college.photo_3_url, '')), ''),
          nullif(trim(coalesce(college.photo_4_url, '')), '')
        )
      )
      from public.colleges college
      where college.active
      order by college.name
      limit 1
    ),
    jsonb_build_object('name', 'SVIT', 'logo_url', null, 'university_name', null, 'photos', '[]'::jsonb)
  );
$$;

revoke all on function public.get_college_branding() from public;
grant execute on function public.get_college_branding() to anon, authenticated;
