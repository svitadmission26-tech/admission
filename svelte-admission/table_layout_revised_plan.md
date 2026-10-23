# Revised Plan: Key-Value Grid Table Layout

## Objective
Revise the Table Layout implementation based on the new requirement. Instead of fields acting as column headers, **each field will act as a row** in a key-value grid.

**Example Structure:**
| Subject Name (Label Column) | Subject Score (Value Column) | Max Score (If Merit Field Exists) |
| :--- | :--- | :--- |
| Math (Field 1) | [ Input for Math Score ] | [ Input for Max Score ] |
| Physics (Field 2) | [ Input for Physics Score ] | [ Input for Max Score ] |

## 1. Schema Update
Update the `FormSection` interface in both `FormBuilder.svelte` and `DynamicForm.svelte` to remove `tableRows` and instead allow customizing the header names.
```typescript
interface FormSection {
    id: string;
    title: string;
    layout?: 'column' | 'table';
    tableHeaderLabel?: string; // e.g., 'Subject Name'
    tableHeaderValue?: string; // e.g., 'Score'
}
```

## 2. Form Builder UI Updates (`src/lib/components/FormBuilder.svelte`)
- **Sidebar Configuration:** When a section's layout is set to `table`, remove the "Number of Rows" input. Add two new text inputs for configuring `tableHeaderLabel` (default: "Field Name") and `tableHeaderValue` (default: "Value").
- **Add/Edit Field Modal:** Revert the dynamic labels ("Column Header Label Name") back to the standard "Label" and "Key", as they now correctly represent the row's label and data key. Continue hiding the "Column Width" selector for table layout sections since fields will span the table cells.

## 3. Dynamic Form Rendering Updates (`src/lib/components/DynamicForm.svelte`)
- **Validation Reversion:** Revert the `validate()` function to its original logic, removing the multiple-row loop, since each field is once again a single data point.
- **Table Rendering Logic:** Update the `sectionContent` snippet for `section.layout === 'table'`:
    - Determine if the section contains any merit fields: `{@const hasMerit = getFieldsForSection(section.id).some(f => f.is_merit)}`
    - **`<thead>`**:
        - `<th>{section.tableHeaderLabel || 'Field Name'}</th>`
        - `<th>{section.tableHeaderValue || 'Value'}</th>`
        - `{#if hasMerit}<th>Max Score</th>{/if}`
    - **`<tbody>`**:
        - Iterate through the fields. For each field, render a `<tr>`.
        - **Cell 1 (Label):** Render `{field.label}` along with the required asterisk `*`.
        - **Cell 2 (Value Input):** 
            - If `field.is_merit`: Render *only* the input bound to `formData[key].value`.
            - If not merit: Render the standard input control (text, select, file, etc.).
            - Render error messages here.
        - **Cell 3 (Max Score Input):** (Only rendered if `hasMerit` is true for the section)
            - If `field.is_merit`: Render the input bound to `formData[key].max_score`.
            - Otherwise, render an empty `<td></td>`.