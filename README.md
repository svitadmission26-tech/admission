> **Active application:** this repository now runs the SVIT Admission ERP with React, Vite, Supabase Auth/PostgreSQL, and an optional Express health endpoint. Follow the [ERP setup guide](docs/ERP_SETUP.md). The Dynamic Form Builder material below describes the earlier SvelteKit prototype and is retained as a legacy reference.

# Dynamic Form Builder

A customizable, database-backed form designer built with **SvelteKit, TypeScript, Tailwind CSS, and Supabase (PostgreSQL)**.

The goal is to let an administrator create and manage forms without changing application code: add fields, arrange rows and columns, set field dimensions, configure validation, preview the form, collect submissions, search records, and export data.

> **Project status:** This README is a development blueprint. Authentication, database policies, drag-and-drop behavior, PDF/Excel export, and deployment must be implemented and tested before production use.

## 1. Core Features

### Form Designer
- Create, rename, duplicate, publish, archive, and version forms.
- Drag fields from a field palette onto a canvas.
- Reorder fields and move them between sections.
- Configure one-, two-, three-, or custom-column layouts.
- Set field width, height, label width, font size, alignment, spacing, and visibility.
- Preview desktop and mobile layouts.
- Save drafts and publish a version for data entry.

### Supported Field Types
- Text, long text, number, currency, percentage
- Date, time, date-time
- Email, phone, URL
- Dropdown, multi-select, radio buttons, checkboxes, yes/no
- File upload, image upload, signature (requires implementation and storage policies)
- Address, read-only text, hidden field
- Auto-number / generated reference
- Repeating table with configurable columns and add/remove rows
- Calculated field using a restricted, safe formula engine

### Field Properties
Each field can have:
- Label and internal key
- Field type and help text
- Width and height
- Required / optional
- Default value and placeholder
- Min/max length, min/max number, allowed options
- Read-only, hidden, disabled
- Validation rules and error message
- Conditional visibility
- Display order, section, row, and column
- Unique-value requirement where supported

### Data Management
- Create, view, edit, and delete submissions according to permissions.
- Search and filter submitted records.
- Pagination for large datasets.
- Export CSV; Excel export can be added with a library such as `xlsx`.
- Print-friendly view and PDF export can be added after the print layout is finalized.
- Form-level access permissions and audit history.

### Conditional Logic
Examples:
- If `course = "Nursing"`, show nursing-specific fields.
- If `payment_mode = "Online"`, show transaction ID.
- If `payment_mode = "Cash"`, show cash receipt number.

Conditions must be evaluated by trusted application code and validated again on the server. Never execute arbitrary JavaScript entered by users.

## 2. Recommended Technology

| Layer | Technology |
|---|---|
| UI | SvelteKit + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| File storage | Supabase Storage |
| Drag and drop | A maintained Svelte-compatible drag-and-drop library |
| Validation | Zod or equivalent schema validation |
| Hosting | Vercel or another SvelteKit-compatible host |
| Source control | GitHub |

## 3. Getting Started

### Prerequisites
- Node.js LTS and npm
- Git
- A Supabase project
- A GitHub repository (optional for local development)

### Create the project

```bash
npx sv create dynamic-form-builder
cd dynamic-form-builder
npm install
npx sv add tailwindcss
npm install @supabase/supabase-js zod
npm run dev -- --open
```

When creating the SvelteKit app, choose TypeScript. Add a compatible drag-and-drop library when implementing the designer, and verify its current Svelte compatibility before installing it.

### Environment variables

Create `.env` in the project root:

```env
PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Use the variable names expected by your Supabase client setup. Never place a Supabase service-role key in browser-accessible variables or commit secrets to GitHub.

### Suggested Supabase client

Create `src/lib/supabaseClient.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY
);
```

For production, use the recommended SvelteKit/Supabase SSR integration so authentication cookies and server-side sessions are handled safely.

## 4. Project Structure

```text
dynamic-form-builder/
├── README.md
├── package.json
├── .env.example
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
└── src/
    ├── app.html
    ├── routes/
    │   ├── +layout.svelte
    │   ├── +page.svelte
    │   ├── login/
    │   │   └── +page.svelte
    │   ├── dashboard/
    │   │   └── +page.svelte
    │   ├── forms/
    │   │   ├── +page.svelte
    │   │   ├── new/
    │   │   │   └── +page.svelte
    │   │   └── [formId]/
    │   │       ├── designer/
    │   │       │   └── +page.svelte
    │   │       ├── preview/
    │   │       │   └── +page.svelte
    │   │       ├── entries/
    │   │       │   └── +page.svelte
    │   │       └── submit/
    │   │           └── +page.server.ts
    │   └── settings/
    │       └── +page.svelte
    └── lib/
        ├── components/
        │   ├── designer/
        │   │   ├── FieldPalette.svelte
        │   │   ├── FormCanvas.svelte
        │   │   ├── FieldSettings.svelte
        │   │   └── FormPreview.svelte
        │   └── fields/
        │       ├── TextField.svelte
        │       ├── SelectField.svelte
        │       ├── DateField.svelte
        │       └── RepeatingTable.svelte
        ├── schemas/
        │   └── formSchema.ts
        └── supabaseClient.ts
```

This is a suggested structure; files are created as each feature is implemented.

## 5. Screens and Workflow

1. **Login** — sign in using Supabase Auth.
2. **Dashboard** — see forms, submission counts, and recent activity.
3. **Forms list** — create, duplicate, archive, or open a form.
4. **Form designer** — drag a field onto the canvas.
5. **Field settings** — edit label, key, type, width, height, required status, options, and validation.
6. **Layout settings** — set sections, rows, columns, and spacing.
7. **Conditional logic** — choose a field, operator, comparison value, and show/hide action.
8. **Preview** — test the form as a user would see it.
9. **Publish** — publish a version for data entry.
10. **Data entry** — users fill out the published form.
11. **Submissions** — search, filter, inspect, edit, and export records.
12. **Print/export** — produce a print layout and CSV/Excel/PDF outputs as implemented.

## 6. Field Layout Model

Store layout properties in the form definition, for example:

```json
{
  "id": "student_name",
  "key": "student_name",
  "label": "Student Name",
  "type": "text",
  "required": true,
  "placeholder": "Enter student name",
  "layout": {
    "section": "personal_details",
    "row": 1,
    "column": 1,
    "columnSpan": 1,
    "width": "50%",
    "height": 40,
    "labelWidth": "35%",
    "fontSize": 14
  },
  "validation": {
    "minLength": 2,
    "maxLength": 100
  }
}
```

The designer should store numeric dimensions in a constrained set of units (for example, pixels or percentages) and validate them before saving. Responsive CSS should prevent fields from overflowing small screens.

## 7. Database Design

The schema below separates form metadata, versions, fields, and submissions. Submission answers are stored as JSONB so custom forms can change without adding a new SQL column for every field.

### Initial Supabase SQL

Save this as `supabase/migrations/001_initial_schema.sql` and run it in the Supabase SQL Editor or through Supabase migrations.

```sql
create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner', 'admin', 'editor', 'viewer', 'data_entry')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  slug text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  current_version integer not null default 1 check (current_version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  schema_json jsonb not null default '{"sections":[],"fields":[]}'::jsonb,
  layout_json jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (form_id, version_number)
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  form_version_id uuid not null references public.form_versions(id) on delete restrict,
  submission_number bigint generated always as identity,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'archived')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.form_audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index forms_workspace_idx on public.forms(workspace_id);
create index form_versions_form_idx on public.form_versions(form_id, version_number desc);
create index submissions_form_date_idx on public.form_submissions(form_id, submitted_at desc);
create index submissions_data_gin_idx on public.form_submissions using gin (data);
create index audit_workspace_date_idx on public.form_audit_logs(workspace_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.form_submissions enable row level security;
alter table public.form_audit_logs enable row level security;
```

### Important security note

Enabling Row Level Security (RLS) without policies blocks normal client access, which is a safe starting point but means the app cannot read or write these tables yet. Before connecting the UI, add and test policies that restrict every operation to authorized workspace members and enforce role permissions. Public forms require a deliberate, limited submission endpoint or narrowly scoped policy. Do not create a broad anonymous policy that exposes form definitions, submissions, or personal information.

For stronger production security:
- Use server-side authorization checks for every read/write.
- Verify the user belongs to the workspace and has the required role.
- Validate answers against the exact published form version on the server.
- Do not trust client-submitted field keys, hidden fields, formulas, or role values.
- Restrict uploads by file type, size, path, and user permission.
- Log sensitive administrative actions without logging unnecessary personal data.

## 8. Suggested Form Schema

Example `schema_json`:

```json
{
  "sections": [
    {
      "id": "personal_details",
      "title": "Personal Details",
      "columns": 2
    }
  ],
  "fields": [
    {
      "id": "full_name",
      "key": "full_name",
      "label": "Full Name",
      "type": "text",
      "required": true,
      "sectionId": "personal_details",
      "layout": {
        "row": 1,
        "column": 1,
        "columnSpan": 1,
        "width": "100%",
        "height": 40
      },
      "validation": {
        "minLength": 2,
        "maxLength": 120
      }
    },
    {
      "id": "course",
      "key": "course",
      "label": "Course",
      "type": "select",
      "required": true,
      "options": [
        { "label": "B.E.", "value": "be" },
        { "label": "BCA", "value": "bca" },
        { "label": "Nursing", "value": "nursing" }
      ]
    }
  ],
  "rules": [
    {
      "when": { "field": "course", "operator": "equals", "value": "nursing" },
      "effect": { "action": "show", "targetFieldIds": ["nursing_registration"] }
    }
  ]
}
```

Treat this as an example contract. Define and validate a TypeScript/Zod schema before allowing saved definitions to be used for rendering or submission.

## 9. Form Designer Interaction

Recommended desktop layout:
- **Left panel:** field palette.
- **Center:** drag-and-drop canvas and live preview.
- **Right panel:** selected field properties.
- **Top toolbar:** form name, undo/redo, preview, save draft, publish.

Expected flow:
1. Select or drag a field type.
2. Drop it into a section or row.
3. Select the field to edit properties.
4. Update width/height and layout.
5. Reorder fields with drag-and-drop or accessible move controls.
6. Save the draft as a new version.
7. Preview at desktop and mobile widths.
8. Publish only after validation passes.

Provide keyboard-accessible controls as an alternative to drag-and-drop.

## 10. Validation and Calculation Rules

- Validate form definitions when saving them.
- Validate each submission against the published schema version.
- Use allowlisted operators for conditional logic (`equals`, `notEquals`, `contains`, `greaterThan`, `lessThan`, `isEmpty`, `isNotEmpty`).
- Do not use `eval()` or execute arbitrary formulas.
- Implement calculations with a parser that supports only approved operators and functions.
- Normalize phone/email/number inputs where appropriate.
- For auto-numbering, generate identifiers server-side to avoid duplicates.

## 11. GitHub Workflow

```bash
git init
git add .
git commit -m "Initial dynamic form builder blueprint"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/dynamic-form-builder.git
git push -u origin main
```

Before pushing, create `.gitignore` and ensure `.env` is excluded. Commit `.env.example` with placeholder values only.

Suggested `.gitignore` additions:

```gitignore
node_modules/
.svelte-kit/
build/
.env
.env.*
!.env.example
.vercel/
.DS_Store
```

## 12. Implementation Roadmap

### Phase 1 — Foundation
- Create SvelteKit project and Supabase connection.
- Configure authentication and workspace membership.
- Add database migrations and RLS policies.

### Phase 2 — Form Builder
- Field palette and canvas.
- Field settings and layout controls.
- Save/load JSON form definitions.
- Preview and responsive behavior.

### Phase 3 — Submissions
- Render published forms dynamically.
- Server-side validation and save.
- Submission list, search, filter, edit, and pagination.

### Phase 4 — Advanced Features
- Conditional visibility and calculated fields.
- Repeating tables and file uploads.
- Version history and audit logs.
- CSV/Excel export, print layouts, and PDF output.

### Phase 5 — Production
- Permission testing and security review.
- Backups and error monitoring.
- Accessibility and mobile testing.
- Load testing and deployment configuration.

## 13. Acceptance Checklist

- [ ] Admin can create and rename a form.
- [ ] Admin can add, remove, and reorder fields.
- [ ] Admin can set field width and height.
- [ ] Admin can configure required, default, and validation rules.
- [ ] Admin can create sections and columns.
- [ ] Preview matches the published form.
- [ ] Published form answers are validated on the server.
- [ ] Users can search and filter authorized submissions.
- [ ] Workspace roles prevent unauthorized access.
- [ ] RLS policies are tested for cross-workspace data leakage.
- [ ] Export files contain only records the current user may access.
- [ ] Mobile and keyboard-accessible workflows are usable.

## 14. License

Choose a license before distributing the project (for example, MIT for a permissively licensed open-source project). Do not claim a license until it has been selected and added to the repository.
