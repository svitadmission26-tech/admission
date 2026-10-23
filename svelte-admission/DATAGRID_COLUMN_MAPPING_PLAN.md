# Datagrid Column Mapping & Merit Score Plan

## Objective
Enhance the datagrid (`table` layout) to support explicit column mapping for fields, particularly for merit scores. This will allow row headers (e.g., Subject Names like "Physics") to have multiple columns (e.g., "Theory", "Practical") where each column can have its own maximum score and act as an independent merit component.

## Current Architecture State
Currently, a `FormSection` with `layout: 'table'` defines `tableColumns`. Fields assigned to this section act as **Rows** (e.g., "Physics", "Chemistry"). The datagrid renders inputs for every column for every row. If a field has `is_merit: true`, a single "Max Score" column is appended at the end of the row, applying to the row as a whole.

## Proposed Enhancements

### 1. Schema Interface Updates (`src/lib/components/DynamicForm.svelte` & `FormBuilder.svelte`)
We need to shift the `is_merit` and `max_score` properties from the **Row Field** level to the **Column** level within table layouts, or allow fields to map directly to specific `row x column` intersections.

**Updated `TableColumn` Interface:**
```typescript
interface TableColumn {
    key: string;
    label: string;
    type: 'number' | 'text' | 'calculated';
    formula?: string;
    // New properties for Merit Calculation per column
    is_merit?: boolean; 
    default_max_score?: number; 
}
```

**Updated `FormField` Interface (for Table Rows):**
Allow rows to override the default max scores for specific columns if a subject has a different max score (e.g., Physics Theory is out of 70, but Math Theory is out of 100).
```typescript
interface FormField {
    // ... existing properties ...
    // Map of columnKey -> max_score for row-specific overrides
    column_max_scores?: Record<string, number>; 
}
```

### 2. Form Builder UI Updates (`src/lib/components/FormBuilder.svelte`)
*   **Column Configuration:** When defining a `TableColumn` in the section editor, add a checkbox for "Is Merit Score?". If checked, show an input for "Default Max Score".
*   **Field (Row) Configuration:** When a field is added to a table section, and that section has merit columns, display a configuration block allowing the admin to override the max score for each merit column specifically for that row. 

### 3. Dynamic Form Rendering (`src/lib/components/DynamicForm.svelte`)
*   **Header Rendering:** Render the max score column headers directly adjacent to their respective value columns (e.g., `Theory Value | Theory Max | Practical Value | Practical Max`), or handle them dynamically based on the column definition.
*   **Cell Rendering:**
    *   Instead of a single `formData[rowKey].max_score`, the form data structure will become:
        `formData['physics']['theory_score'] = { value: 60, max_score: 70 }`
        `formData['physics']['practical_score'] = { value: 25, max_score: 30 }`
    *   Update the `{#snippet sectionContent}` to iterate through columns and render the input group (Value + Max Score) if the column is marked as `is_merit`.
*   **Data Initialization:** Update the `$:` reactive block that initializes datagrid data to structure the object correctly per column and apply the row-specific or column-default max scores.

### 4. Downstream Impacts
*   **Merit Calculation Engine:** The calculation logic (`src/lib/server/merit.ts` or similar) and `merit_formulas` table will need to be able to target specific columns within a row (e.g., `physics.theory_score.value` instead of just `physics.value`).
*   **Profile Auto-fill:** The profile merging logic might need slight adjustments if profile fields map to specific `row -> column` paths.

## 5. Dependent Field Visibility (`showWhen`) Analysis
I have analyzed the current implementation of `showWhen` in `DynamicForm.svelte` to ensure it works properly with this new datagrid mapping.

**Current Behavior:**
The visibility logic relies on simple bracket notation: `const parentVal = formData[field.showWhen.field];`. In the datagrid layout, the `visibleFields[key]` toggle wraps the entire `<tr>` tag, showing or hiding the whole row.

**Impacts of the New Plan:**
1.  **Top-Level Dependencies (Works Perfectly):** If a row in the datagrid (e.g., `physics`) depends on a top-level field (e.g., `showWhen: { field: 'stream', equals: 'Science' }`), it will continue to work exactly as it does now. Hiding or showing the `physics` row will succeed because `formData['stream']` remains unaffected.
2.  **Nested Field Dependencies (Needs Update):** Because the new plan nests values (e.g., `formData['physics']['theory_score']`), if a field outside the table tries to depend on a specific datagrid cell (e.g., `showWhen: { field: 'physics.theory_score', equals: '50' }`), the current reactivity block will fail. `formData['physics.theory_score']` will evaluate to `undefined`. 
    *   **Solution:** We must implement a "path resolver" (like a custom dot-notation getter or lodash's `_.get()`) inside the `showWhen` reactivity block in `DynamicForm.svelte` to allow it to resolve nested dependencies (e.g., `parentVal = resolvePath(formData, field.showWhen.field)`).
3.  **Column-Level Visibility (New Feature Required):** Currently, the schema does not support `showWhen` on a `TableColumn`. You can only hide entire rows, not columns. If you need a checkbox to hide the "Practical" column for all rows, we would need to add a `showWhen` property to the `TableColumn` interface and implement visibility checks inside the `<th>` and `<td>` loops.

## 6. Merit Calculation Engine (`src/lib/server/merit.ts`) Analysis
I have analyzed how the proposed changes will affect the merit calculation logic.

**Current Behavior (`src/lib/server/merit.ts`):**
The engine builds an evaluation context for `mathjs` by iterating over `app.form_data`. If it encounters a structured object with `value` and `max_score` properties, it adds two variables to the context:
1.  `context[key] = Number(val.value)`
2.  `context[\`\${key}_max\`] = Number(val.max_score)`

For example, `formData['physics'] = { value: 60, max_score: 100 }` becomes `context['physics'] = 60` and `context['physics_max'] = 100`.

**Impacts of the New Plan:**
The new datagrid structure deeply nests these values (e.g., `formData['physics']['theory_score'] = { value: 60, max_score: 100 }` or `formData['physics']['theory_score'] = 60`).

Because `merit.ts` currently only loops through the *first level* of `Object.entries(app.form_data)`, it will encounter the nested object `formData['physics'] = { theory_score: ..., practical_score: ... }`. Since this object does not directly have `value` and `max_score` properties at its root, the calculation engine will currently **skip** these values entirely, resulting in broken merit formulas.

**Solution for Implementation:**
To fix this, the context builder in `src/lib/server/merit.ts` must be updated to recursively flatten the `form_data` object or explicitly look for nested `table` fields.
When building the context, a recursive function should navigate the object. If it finds:
`formData['physics']['theory_score'] = { value: 60, max_score: 70 }`
It should flatten the key and append it to the context, creating variables like:
*   `context['physics_theory_score'] = 60`
*   `context['physics_theory_score_max'] = 70`

Admins will then use these flattened dot-notation style keys (`physics_theory_score`) in their Merit Formula Expressions.

## Next Steps
1.  Review this plan and confirm if the "Value + Max Score per Column" approach matches your expected UX.
2.  Confirm if we should include the "Nested Field Dependencies" path resolver update during the implementation.
3.  Confirm the strategy for flattening nested datagrid keys in the Merit Calculation Engine.
4.  Once approved, we will begin implementation iteratively, starting with the Schema interfaces and Form Builder UI.