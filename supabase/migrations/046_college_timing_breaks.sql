-- Migration 046: multiple recess timings for college and module timings.
-- Adds a `breaks` JSONB column that holds an array of {start, end} recess
-- windows, so a timing can carry more than one break. The legacy
-- break_start / break_end columns are kept in step with the first break for
-- older readers.

alter table public.college_timings
	add column if not exists breaks jsonb not null default '[]'::jsonb;

alter table public.erp_module_timings
	add column if not exists breaks jsonb not null default '[]'::jsonb;

-- Backfill the new column from the legacy single-break columns.
update public.college_timings
	set breaks = jsonb_build_array(
		jsonb_build_object('start', break_start, 'end', break_end)
	)
	where break_start is not null
		and break_end is not null
		and (breaks is null or breaks = '[]'::jsonb);

update public.erp_module_timings
	set breaks = jsonb_build_array(
		jsonb_build_object('start', break_start, 'end', break_end)
	)
	where break_start is not null
		and break_end is not null
		and (breaks is null or breaks = '[]'::jsonb);