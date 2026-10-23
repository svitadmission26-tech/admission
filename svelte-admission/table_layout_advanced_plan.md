# Advanced Table Layout Plan

Based on your request, you want to elevate the table layout from a simple "1 Label + 1 Value" grid to a more complex data grid that can support multiple columns (values) per row, including calculated columns.

There are two ways to interpret "multiple label header and value pair" and "more columns with calculated values". I have outlined the most robust approach (The Data Grid / Matrix Approach) which I believe fits your requirement perfectly.

## Proposed Approach: The Data Grid (Matrix)

Instead of the table just showing one field per row (with a single input), we will upgrade the `table` layout to act as a **Data Grid**. 

In this approach:
1. **Section configures the Columns:** You define the columns for the table (e.g., "Theory Marks", "Practical Marks", "Total (Calculated)", "Max Marks").
2. **Fields act as the Rows:** The fields you add to the section (e.g., "Math", "Science") will represent the rows.
3. **Intersection = Inputs:** Each row will render an input for each defined column.

### Example Visual Output
| Subject (Row Label) | Theory (Input) | Practical (Input) | Total (Calculated) |
| :--- | :--- | :--- | :--- |
| **Math** | [ Input ] | [ Input ] | `Theory + Practical` |
| **Science** | [ Input ] | [ Input ] | `Theory + Practical` |

---

### 1. Schema Updates
We will update the `FormSection` interface to support dynamic column definitions.
```typescript
interface TableColumn {
    key: string;
    label: string;
    type: 'number' | 'text' | 'calculated';
    formula?: string; // e.g., "theory + practical"
}

interface FormSection {
    id: string;
    title: string;
    layout?: 'column' | 'table';
    rowHeaderLabel?: string; // e.g., "Subject"
    tableColumns?: TableColumn[]; // The dynamic columns
}
```

*(Note: If you literally meant having multiple "Label | Value | Label | Value" side-by-side to save vertical space like a 2-column layout rendered as a table, let me know. However, the Data Grid approach is much better for calculated values.)*

### 2. Form Builder UI Updates (`src/lib/components/FormBuilder.svelte`)
- **Section Configuration:**
  - If `layout === 'table'`, display a UI to manage `tableColumns`.
  - The user can add columns, specifying the `label`, `key`, and `type` (Number, Text, Calculated).
  - If `type === 'calculated'`, show a `formula` input.
  - The `tableHeaderLabel` and `tableHeaderValue` inputs will be replaced by `rowHeaderLabel` and the dynamic column builder.
- **Field Configuration:**
  - When adding a field to a table section, the field only needs a `Label` and a `Key` (representing the row). The `type`, `is_merit`, etc., will be ignored or hidden since the inputs are governed by the columns.

### 3. Dynamic Form Rendering Updates (`src/lib/components/DynamicForm.svelte`)
- **Data Structure:** The `formData` will need to store these nested values, likely as `formData[rowKey][columnKey]`. E.g., `formData['math']['theory'] = 85`.
- **`<thead>` Rendering:** Render the `rowHeaderLabel`, followed by a `<th>` for each column in `section.tableColumns`.
- **`<tbody>` Rendering:**
  - Iterate over the section's fields (Rows).
  - First `<td>`: Render the row's `field.label`.
  - Subsequent `<td>`s: Iterate over `section.tableColumns`.
    - If `col.type === 'calculated'`: Evaluate the formula using the other column values in the current row. We can use a library like `mathjs` (which is already in `package.json`) or simple Javascript evaluation to compute the result dynamically.
    - Otherwise: Render the appropriate input (`<input type="number">` or `text`), bound to `formData[field.key][col.key]`.

---

### Alternative Interpretation (Side-by-Side Pairs)
If you simply meant:
| Label 1 | Value 1 | Label 2 | Value 2 |
| :--- | :--- | :--- | :--- |
| First Name | [ Input ] | Last Name | [ Input ] |

This is just a standard column layout wrapped in a `<table>` tag. Calculated values here would just be standard fields with a "calculated" type.

**Please review the Data Grid approach. If this aligns with what you want (especially for things like Subject + Marks combinations), reply with "proceed", or clarify if you meant the Side-by-Side approach!**