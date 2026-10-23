# Plan: Enhanced Report Template Management

## Objective
Upgrade the existing Report Builder to a full **Report Template Management System**. This includes editing existing templates, previewing saved templates without re-building, and integrating with the Admin Dashboard.

## 1. Feature Enhancements

### **A. Edit Template**
*   **Current State**: Only Create and Delete are supported.
*   **Requirement**: Allow modifying an existing template's name, description, roles, and configuration.
*   **UI Workflow**:
    *   Add an "Edit" button to the template list row.
    *   Clicking "Edit" loads the template data into the "Configuration" and "Save Template" forms above.
    *   Change the "Save Template" button to "Update Template" (upsert logic).
    *   Pre-select the `base_table` and populate `selectedColumns`.

### **B. Preview Saved Template**
*   **Current State**: Preview only works for the current *unsaved* configuration in the builder form.
*   **Requirement**: Quickly see data for a template already in the list.
*   **UI Workflow**:
    *   Add a "Run/Preview" button to the template list row.
    *   Clicking it triggers the `preview` action using the *saved* configuration from the DB (instead of form data).
    *   Displays the "Preview Results" card populated with the saved template's output.

### **C. Admin Dashboard Integration**
*   **Requirement**: Quick access to Report Builder from `/admin/dashboard`.
*   **UI Update**:
    *   Add a "Report Templates" card to the dashboard.
    *   Show count of templates.
    *   Link to `/admin/report-builder`.

---

## 2. Technical Implementation

### **A. Backend Updates (`/admin/report-builder/+page.server.ts`)**
1.  **Update Action**:
    *   Add `update` action (or modify `create` to handle `id`).
    *   Logic: `UPDATE report_templates SET ... WHERE id = ?`.
2.  **Preview Action**:
    *   Modify `preview` action to accept `template_id` (optional).
    *   If `template_id` is provided, fetch config from DB.
    *   If `configuration` JSON is provided (builder mode), use that.

### **B. Frontend Updates (`/admin/report-builder/+page.svelte`)**
1.  **State Management**:
    *   Add `editingTemplateId` variable.
    *   Function `editTemplate(template)`: Sets `selectedTable`, `selectedColumns`, `templateName`, etc., from the template object.
2.  **Buttons**:
    *   Update form to handle "Update" vs "Create".
    *   Add "Edit" button to list.
    *   Add "Run" button to list (submits to `?/preview` with `template_id`).

### **C. Dashboard Update (`/admin/dashboard/+page.svelte`)**
1.  **Loader**: Fetch count of `report_templates`.
2.  **UI**: Add the shortcut card.

---

## 3. Roadmap

1.  **Refactor Preview Action**: Support previewing by ID.
2.  **Implement Edit Logic**: Frontend state population + Backend update action.
3.  **Dashboard**: Add widget.
