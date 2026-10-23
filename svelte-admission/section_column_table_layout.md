# Plan: Implement Section-Level Table Layout in Dynamic Forms

## Objective
Add the ability to specify a layout per section in the dynamic form builder (`/admin/forms/new` and `/admin/forms/[id]`). 
The supported layouts will be:
1.  **Column (Default)**: The existing responsive grid layout.
2.  **Table**: A new layout where fields are rendered in a table structure, with field labels as column headers (`<thead>`) and inputs as cells in a row (`<tbody>`).

## 1. Schema Updates
Update the schema interfaces in both `src/lib/components/FormBuilder.svelte` and `src/lib/components/DynamicForm.svelte`.

```typescript
interface FormSection {
    id: string;
    title: string;
    layout?: 'column' | 'table'; // <-- NEW PROPERTY
}
```

## 2. Form Builder UI Updates (`src/lib/components/FormBuilder.svelte`)
-   **Section Editor**: Currently, sections are added via a simple input and listed in the sidebar. We need to allow users to select the layout for a section.
-   **Implementation**: 
    -   Modify the "Sections" list in the sidebar. Next to each section title, add a small `<select>` dropdown to choose between "Column" and "Table" layout.
    -   Alternatively, introduce an "Edit Section" modal (similar to the "Add/Edit Field" modal) to configure the section's title and layout.
    -   Ensure `layout` defaults to `'column'` when a new section is created.

## 3. Dynamic Form Rendering Updates (`src/lib/components/DynamicForm.svelte`)
-   **Refactor Field Rendering**: Currently, the logic to render fields (`<input>`, `<select>`, `<textarea>`, etc.) is duplicated three times (for `tabs`, `cards`, and `list` global layouts). Before adding more complexity, it is highly recommended to extract this into a Svelte snippet (`{#snippet fieldInput(field)}`) or a separate smaller component (`DynamicFormField.svelte`). This will make adding the table layout much cleaner.
-   **Table Layout Implementation**:
    -   Within the `tabs` and `cards` global layouts, before rendering the fields for a section, check the section's layout property.
    -   If `section.layout !== 'table'` (or is undefined): Render the existing `<div class="row">` logic.
    -   If `section.layout === 'table'`: Render an HTML `<table>`.
        -   **`<thead>`**: Iterate over `getFieldsForSection(section.id)` and render `<th>` for each `field.label`. Include the required asterisk if `field.required`.
        -   **`<tbody>`**: Render a single `<tr>`. Iterate over the same fields and render `<td>` containing the input controls, *without* their individual `<label>` tags, as the label is already in the header.

**Mockup of Table Layout Rendering:**
```html
{#if section.layout === 'table'}
    <div class="table-responsive mb-3">
        <table class="table table-bordered align-middle">
            <thead class="table-light">
                <tr>
                    {#each getFieldsForSection(section.id) as field}
                        {#if visibleFields[getKey(field)]}
                            <th>
                                {field.label}
                                {#if field.required}<span class="text-danger">*</span>{/if}
                            </th>
                        {/if}
                    {/each}
                </tr>
            </thead>
            <tbody>
                <tr>
                    {#each getFieldsForSection(section.id) as field}
                        {#if visibleFields[getKey(field)]}
                            <td>
                                <!-- Render the input control only (no label) -->
                                <!-- e.g., {@render fieldInput(field)} -->
                            </td>
                        {/if}
                    {/each}
                </tr>
            </tbody>
        </table>
    </div>
{#else}
    <!-- Existing row/column layout -->
{/if}
```

## 4. Multi-Row Support (Future Consideration)
-   The initial implementation will render a single row of inputs. If the business requirement is for the applicant to add *multiple* rows (e.g., multiple educational qualifications), the `formData` structure will need to be refactored to support arrays for that specific section (e.g., `formData.education_details = [{ school: '', year: '' }]`). This is a significantly more complex change affecting validation and data storage. The current plan addresses the *visual layout* aspect as requested.