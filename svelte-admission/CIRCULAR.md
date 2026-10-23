# Implementation Plan: Circulars & Notices System

## Objective
Enable Admission Officers to share important information (circulars, notices, instructions) and files (PDFs) with verified students. Students should be able to easily view and download these notices from their dashboard.

## 1. Database Schema

Create a new table `public.circulars` to store notice metadata.

```sql
CREATE TABLE public.circulars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT, -- Path in Supabase Storage
    created_by UUID REFERENCES public.users(id),
    
    -- Targeting (Optional - if null, visible to all verified students)
    course_id UUID REFERENCES public.courses(id),
    cycle_id UUID REFERENCES public.admission_cycles(id),
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_circulars_course ON public.circulars(course_id);
```

## 2. Storage Configuration

Create a new storage bucket `circulars` for storing documents.

- **Bucket Name:** `circulars`
- **Public:** `false` (Authenticated access only via Signed URLs or RLS)
- **Policies:**
    - `adm_officer`: Full Access (Select, Insert, Update, Delete)
    - `student`: Select (Download) only

## 3. Row Level Security (RLS) Policies

### Table: `public.circulars`

1.  **Adm Officer (Read/Write):**
    - `USING (auth.uid() IN (SELECT id FROM users WHERE role = 'adm_officer'))`

2.  **Student (Read Only):**
    - Logic: Students can see circulars that are:
        - `is_active = true`
        - AND (`course_id` IS NULL OR `course_id` matches one of the student's **applied courses**)
    - `USING (role = 'student' AND is_active = true AND (course_id IS NULL OR course_id IN (SELECT course_id FROM applications WHERE student_id = auth.uid())))`

## 4. UI/UX Implementation

### A. Admission Officer Dashboard (`/adm-officer/circulars`)
- **List View:** Table of created circulars with status toggles and delete options.
- **Create Form:**
    - Title (Text)
    - Description (Textarea)
    - Target Course (Dropdown - Optional "All Courses")
    - File Upload (Input type="file", accepts PDF/Images)

### B. Student Dashboard (`/student`)
- Add a **"Notices & Circulars"** card (similar to "My Applications").
- Fetch circulars matching the student's context.
- Display list with:
    - Title
    - Date
    - "New" badge (if created < 7 days ago)
    - Download/View Button (opens signed URL)

## 5. Development Steps

1.  **Migration:** Run SQL to create table and storage bucket.
2.  **Backend (Server Actions):**
    - Create `src/routes/adm-officer/circulars/+page.server.ts` for handling uploads and DB inserts.
    - Implement `get_circulars` logic in `src/routes/student/+page.server.ts`.
3.  **Frontend (Adm Officer):** Build the management UI.
4.  **Frontend (Student):** Add the notices section to the dashboard.
