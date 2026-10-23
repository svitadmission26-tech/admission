# Implementation Plan: Public Circular System (Extension)

This plan outlines how to enable public access to circulars using the existing database table and storage bucket.

## 1. Database Schema Update
Instead of creating a new table, we will extend the existing `public.circulars` table to support public visibility.

**Action:** Run the following SQL (Manual):
```sql
-- Add is_public column to existing circulars table
ALTER TABLE public.circulars 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- (Optional) Add college_id to track which college the circular belongs to
ALTER TABLE public.circulars 
ADD COLUMN IF NOT EXISTS college_id UUID REFERENCES public.colleges(id);

-- Update RLS to allow guest users to read public circulars
CREATE POLICY "Circulars: Public Read" ON public.circulars 
FOR SELECT USING (is_public = true AND is_active = true);
```

## 2. Storage Strategy
- **Bucket:** We will continue to use the existing `circulars` bucket (which is already set to `public: true`).
- **Access:** 
    - **Public Circulars:** Guest users can access these directly via public URLs.
    - **Private Circulars:** Will continue to follow existing visibility rules (e.g., specific courses or cycles).

## 3. Administrative UI (`/adm-officer/circulars`)
Update the circular management page to allow setting public visibility.

- **Create Modal:** Add a checkbox labeled "Show on Main Page (Public)".
- **Listing Table:** Add a column or icon to indicate "Public" status.
- **Server Action:** Update the `create` action to save the `is_public` value.

## 4. Public Landing Page (`/`)
Update the main landing page to display active public circulars to guest users.

- **Server Load:** Update `src/routes/+page.server.ts` to fetch circulars where `is_public = true` and `is_active = true`.
- **UI Component:** Add a section on the landing page to list these circulars with "Download/View" buttons.

## 5. Security & Conflicts
- **No New Tables:** Reusing the existing table prevents data duplication and keeps the system clean.
- **No Conflicts:** This change is additive and does not break existing logic for private/course-specific circulars.
- **Bucket Reuse:** Since the `circulars` bucket is already public, no new storage configuration is required, though RLS should be verified for sensitive files.
