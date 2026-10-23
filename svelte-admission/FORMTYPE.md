# Dynamic Form Type Management Plan

To manage form types dynamically from the database instead of having them hardcoded, the following architectural changes are required:

### 1. Database Layer (Schema Changes)

A new "Source of Truth" for valid form types is needed.

*   **Create a new table** (e.g., `public.form_types`).
    *   Columns: `id` (UUID, PK), `name` (Text, Unique - e.g., 'ACPC', 'Provisional'), `code` (Text, Unique - e.g., 'acpc', 'provisional'), `description` (Text), `is_active` (Boolean), and `created_at` (Timestamp with Time Zone).
*   **Populate Data**: Insert your existing hardcoded form types ('Provisional', 'ACPC', 'MQ/NRI', 'Vacant') into this new `form_types` table.
*   **Remove Constraints**: Drop the existing SQL `CHECK` constraints on `form_type` columns in tables like `admission_forms`, `fee_structures`, and `applications` that currently restrict values to the hardcoded list.
*   **Foreign Keys (Optional but Recommended)**: Consider altering the `form_type` columns in `admission_forms`, `fee_structures`, and `applications` to reference `form_types(code)` or `form_types(name)` to enforce data integrity. This ensures that only valid, existing form types can be used.

### 2. Backend Layer (API & Logic)

The backend must stop relying on hardcoded enums in its TypeScript code and dynamically fetch form types.

*   **New Admin Management Route**: Create a new route in the admin panel (e.g., `src/routes/admin/form-types/`) to provide full CRUD (Create, Read, Update, Delete) functionality for `form_types`. This allows administrators to manage available form types directly from the UI.
*   **Data Fetching**:
    *   Modify existing server `load` functions (e.g., for `src/routes/admin/forms/+page.server.ts`, `src/routes/admin/fee-structures/+page.server.ts`, `src/routes/student/apply/+page.server.ts`, etc.) to fetch the list of *active* form types from the new `public.form_types` table:
        ```typescript
        const { data: formTypes, error: formTypesError } = await supabase
            .from('form_types')
            .select('id, name, code')
            .eq('is_active', true)
            .order('name');
        ```
    *   Ensure this `formTypes` data is returned in the `load` function's `return` object so it's available to the frontend.
*   **Validation**: Update Zod schemas used in form `actions` (e.g., `create`, `update` actions in `+page.server.ts` files). Instead of a hardcoded `z.enum(['ACPC', ...])`, you would:
    1.  Fetch the active form types.
    2.  Create a dynamic Zod enum using the fetched types (e.g., `z.enum(fetchedFormTypeNames as [string, ...string[]])`).
    3.  Alternatively, validate that the submitted `form_type` string exists in the fetched list of active types.

### 3. Frontend Layer (UI Components)

All UI elements that previously used hardcoded form types must be updated to be dynamic.

*   **Dropdowns/Select Elements**: Locate every `<select name="form_type">` in your Svelte components (e.g., in admin panels for forms, fee structures, merit formulas, and student application pages).
*   **Dynamic Rendering**: Replace the hardcoded `<option>` tags with a `{#each data.formTypes as type}` Svelte loop:
    ```svelte
    <select class="form-select" id="some-form-type" name="form_type" required>
        {#each data.formTypes as type}
            <option value={type.code}>{type.name}</option>
        {/each}
    </select>
    ```

### 4. Handling Special Logic (Crucial Refactoring)

Code that relies on specific hardcoded form type names for conditional behavior needs careful refactoring.

*   **Behavior Flags**: When creating the `form_types` table, consider adding columns that represent *behavioral flags* rather than just names.
    *   Example new columns in `public.form_types`: `requires_merit_calculation` (boolean), `allow_partial_payment` (boolean), `is_government_quota` (boolean), `application_fee_required` (boolean).
*   **Refactor Conditional Logic**: Update your business logic and `if`/`else` statements to check these new flags instead of directly comparing string names.
    *   *Old Code:* `if (form_type === 'ACPC') { /* ACPC specific logic */ }`
    *   *New Code (after fetching the form type object):* `if (formTypeObject.is_government_quota) { /* Government quota specific logic */ }`
    *   This makes the system much more flexible; adding a new form type with `is_government_quota: true` will automatically inherit the associated logic.

### Summary of Workflow to Implement Dynamically Managed Form Types:
1.  **Create** `public.form_types` table and define behavioral flag columns.
2.  **Seed** `public.form_types` with existing data ('Provisional', 'ACPC', 'MQ/NRI', 'Vacant').
3.  **Create a database migration** to remove existing `CHECK` constraints on `form_type` columns in `admission_forms`, `fee_structures`, and `applications`.
4.  **Implement** the Admin CRUD UI at `src/routes/admin/form-types/` to manage form types.
5.  **Update** all relevant `load` functions in `+page.server.ts` files to fetch the dynamic `form_types` list from the database.
6.  **Modify** all form `actions` (create/update) to validate against the dynamic list of form types (or use foreign key constraints).
7.  **Update** all front-end Svelte `<select>` elements to dynamically populate options from the fetched `formTypes` data.
8.  **Refactor** any backend or frontend business logic that conditionally executes based on form type names to instead use the new behavioral flags from the `form_types` table.
