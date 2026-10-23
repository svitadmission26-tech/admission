# Plan: Centralized Report Template System

## Objective
Create a **Report Template Builder** for Admins to define datasets (tables, columns, relations) and save them as reusable templates. Other roles (Adm Officer, DEO) simply execute these templates.

## 1. Database Schema Changes
*   **New Table: `report_templates`**
    *   `id` (UUID, PK)
    *   `name` (Text): "Admitted Students Contact List", "Fee Payment Summary".
    *   `description` (Text): Optional description.
    *   `base_table` (Text): The root table for the query (e.g., `'applications'`, `'users'`, `'payments'`).
    *   `configuration` (JSONB): The core logic. Stores the selected columns, joins, and filters.
        *   Example Structure:
            ```json
            {
              "columns": [
                { "table": "applications", "field": "status", "label": "Status", "path": "status" },
                { "table": "users", "field": "full_name", "label": "Student Name", "path": "student_user.full_name" },
                { "table": "student_profiles", "field": "enrollment_number", "label": "Enrollment ID", "path": "student_user.student_profiles.enrollment_number" }
              ],
              "filters": { "status": "approved" } // Optional default filters
            }
            ```
    *   `allowed_roles` (Text[]): Array of roles allowed to use this template (e.g., `['adm_officer', 'deo']`).
    *   `created_by` (UUID) / `created_at`.

## 2. Admin UI: Template Builder (`/admin/reports/builder`)
This is the "Easy to use UI".

*   **Step 1: Base Selection**: Admin selects the "Root" entity (e.g., "Student Applications", "Users", "Payments").
*   **Step 2: Column Picker (The "Magic" Part)**:
    *   **Visual Tree**: Display the Base Table.
    *   **Expandable Relations**: Next to a foreign key field (e.g., `student_id` in `applications`), show a "+" button. Clicking it expands the related table (`Users`). Inside `Users`, if there's a relation to `Student Profiles`, expand that.
    *   **Checkbox Selection**: Admin checks specific columns (e.g., `applications.id`, `users.email`, `courses.name`).
    *   **Alias/Labeling**: Admin can rename a column (e.g., `users.full_name` to "Student Name") for the CSV header.
    *   **Relationship Path Generation**: Automatically build the PostgREST-style relationship path (e.g., `student_user.student_profiles.enrollment_number`).
*   **Step 3: Preview**: Show a live sample of 5 rows based on the selection, or a representation of the generated query.
*   **Step 4: Save**: Enter Template Name, Description, and assign `allowed_roles`.

## 3. Backend Logic (The Query Engine)
*   **Schema Introspection Service (`lib/server/dbInspector.ts`)**:
    *   A helper to dynamically read the database schema, including tables, columns, and foreign key relationships. This will power the frontend's "Visual Tree".
*   **Query Construction Service (`lib/server/reportQueryBuilder.ts`)**:
    *   Takes the `report_templates.configuration` (JSONB) and `base_table`.
    *   Converts it into a Supabase/PostgREST `.select()` query string, dynamically constructing nested joins (e.g., `'id, status, student_user:users!student_id(full_name, email, student_profiles(enrollment_number))'`).
    *   Applies filters if present.
*   **Data Export Service (`lib/server/reportExporter.ts`)**:
    *   Takes the raw query result (nested JSON).
    *   Flattens it into a tabular format suitable for CSV.
    *   Handles column headers based on `label` in `configuration.columns`.

## 4. End-User UI (Adm Officer/DEO) (`/adm-officer/reports`, `/deo/reports`)
*   **Reports Page**: Instead of a "Builder", users see a list of "Available Report Templates".
*   **Template Listing**: Filters templates by `allowed_roles` for the current user.
*   **Action**:
    *   Select a template from the list.
    *   (Optional) Apply runtime filters: If the template configuration allows, display date ranges, course filters, etc., that the user can apply before export.
    *   Click "Export CSV" or "Generate Report".

---

## Implementation Roadmap

1.  **Database Migration**: Create the `report_templates` table.
2.  **Backend (`lib/server/dbInspector.ts`)**: Implement functions to fetch table/column metadata and relationships.
3.  **Backend (`lib/server/reportQueryBuilder.ts`)**: Implement the PostgREST query builder.
4.  **Backend (`lib/server/reportExporter.ts`)**: Implement data flattening and CSV generation.
5.  **Admin UI (`/admin/reports/builder`)**:
    *   Build the interactive UI for selecting `base_table`, columns, and defining `configuration`.
    *   Implement "Save Template" action.
6.  **End-User UI (`/adm-officer/reports`, `/deo/reports`)**:
    *   Fetch and display `report_templates` based on user role.
    *   Implement "Generate/Export Report" action which uses the saved template.

This plan centralizes report definition, making it robust and consistent, and empowers the Admin to create powerful, reusable data extracts.