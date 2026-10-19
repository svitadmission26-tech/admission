-- Migration 029: Allow public (anon) read of active inquiry forms
-- So the public /inquiry page can dynamically render form fields from the builder config

drop policy if exists inquiry_forms_public_read on public.inquiry_forms;

create policy inquiry_forms_public_read on public.inquiry_forms
	for select to anon, authenticated
	using (
		is_active = true
	);