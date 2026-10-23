# Implementation Plan: Saved Report Templates

## Objective
Allow Admission Officers to save their column selections and filter configurations as reusable templates for generating reports. This eliminates the need to manually re-select columns every time a specific type of report (e.g., "Daily Fees", "Merit List Summary") is needed.

## 1. Database Schema

Create a new table `public.report_templates` to store the template definitions.

```sql
CREATE TABLE public.report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    
    -- The core configuration
    columns JSONB NOT NULL, -- Array of selected column keys e.g., ["full_name", "email", "merit_score"]
    filters JSONB, -- Optional: Saved filter state e.g., { "status": "approved", "course_id": "..." }
    
    -- Ownership & Visibility
    created_by UUID REFERENCES public.users(id),
    is_public BOOLEAN DEFAULT false, -- If true, other Adm Officers can use it
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookup by user
CREATE INDEX idx_report_templates_user ON public.report_templates(created_by);
```

## 2. Row Level Security (RLS)

- **Insert/Update/Delete:** Allow `adm_officer` to manage their *own* templates (`created_by = auth.uid()`).
- **Select:** Allow `adm_officer` to view their *own* templates OR templates where `is_public = true`.

## 3. UI/UX Implementation (Admission Officer)

### A. Add "Save Template" Feature to Report Page
- **Location:** On `/adm-officer/reports`.
- **Action:** Next to the "Generate Report" button, add a "Save as Template" button.
- **Modal:** When clicked, open a modal asking for:
    - Template Name (Required)
    - Description (Optional)
    - Checkbox: "Share with other officers?" (`is_public`)

### B. Template Selection Dropdown
- **Location:** Top of the Report Configuration section.
- **Component:** A `<select>` or Combobox labeled "Load Template".
- **Behavior:**
    - fetching data from `report_templates`.
    - When a template is selected, automatically populate the `selectedColumns` array and (optionally) the filter inputs with the data stored in the template's JSON.
    - Show a "Reset" or "Clear" option to revert to default.

### C. Manage Templates Tab
- **Location:** A new tab or modal on the Reports page.
- **Features:** List saved templates with options to **Delete** or **Rename**.

## 4. Backend Logic (`+page.server.ts`)

- **Load Function:** Fetch available templates for the user.
    ```typescript
    const { data: templates } = await supabase
        .from('report_templates')
        .select('*')
        .or(`created_by.eq.${userId},is_public.eq.true`);
    ```
- **Actions:**
    - `saveTemplate`: Insert new row into `report_templates`.
    - `deleteTemplate`: Remove row (ensure ownership check).

## 5. Development Steps

1.  **Migration:** Run SQL to create `report_templates` table.
2.  **RLS Policies:** Apply security policies.
3.  **Backend:** Update `src/routes/adm-officer/reports/+page.server.ts` to load templates and handle saving.
4.  **Frontend:** Update `src/routes/adm-officer/reports/+page.svelte` to include the "Load Template" dropdown and "Save" modal.
