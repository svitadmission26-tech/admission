-- Migration 048: Four portal login - Chairman portal support
-- Adds the Chairman staff role, its read-only executive permissions and the
-- Chairman login module. Idempotent and safe to re-run.

insert into public.staff_roles (code, label)
values ('chairman', 'Chairman')
on conflict (code) do nothing;

update public.staff_roles
set default_modules = array['admissions']
where code = 'chairman' and cardinality(default_modules) = 0;

insert into public.role_permissions (role_code, permission)
values
  ('chairman', 'page:Dashboard'),
  ('chairman', 'page:Chairman Dashboard'),
  ('chairman', 'page:Final Admissions'),
  ('chairman', 'page:Fee Assignments'),
  ('chairman', 'page:Payments'),
  ('chairman', 'page:Reports'),
  ('chairman', 'page:Intake Report'),
  ('chairman', 'page:Lateral Entry Intake'),
  ('chairman', 'page:Applications'),
  ('chairman', 'page:Inquiries'),
  ('chairman', 'page:Notice Board'),
  ('chairman', 'applications.read'),
  ('chairman', 'admissions.read'),
  ('chairman', 'reports.read'),
  ('chairman', 'accounts.read'),
  ('chairman', 'inquiries.read')
on conflict (role_code, permission) do nothing;

insert into public.login_modules (
  id, name, description, icon, portal_id, entry_page,
  display_order, enabled, allowed_roles
)
values
  ('chairman', 'Chairman', 'Executive dashboard, intake, admissions, fees and reports', '👔', 'admissions', 'Chairman Dashboard', 9, true, array['chairman'])
on conflict (id) do nothing;
