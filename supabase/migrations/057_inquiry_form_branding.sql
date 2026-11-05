-- Migration 057: configurable branding for public inquiry pages

alter table public.inquiry_forms
  add column if not exists branding jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(branding) = 'object'
      and octet_length(branding::text) <= 8192
    );
