# Implementation Plan: Datagrid Summary Row

Add a **Summary Row** feature to table layouts in datagrid that automatically calculates sum/mean/max/min of visible rows.

---

## Overview

This feature enables administrators to add a summary/total row at the bottom of datagrid tables that automatically calculates aggregate values (sum, mean, max, min, count) from all visible data rows.

**Example Use Case:**

- A table with subject scores (Physics, Chemistry, Math)
- Summary row shows "Total: 450" (sum of all rows)
- Or "Average: 75" (mean of all rows)

---

## Current Implementation

The system already has:

1. **Calculated column type** - Formulas like `col1 + col2`
2. **Per-row calculations** - Each row calculates its own values

---

## Phase 1: Data Structure

### Add to `TableColumn` Interface (DynamicForm.svelte)

```typescript
interface TableColumn {
  key: string;
  label: string;
  type: "number" | "text" | "calculated";
  formula?: string; // Existing: formula for calculated column
  is_merit?: boolean; // Existing: merit score flag
  default_max_score?: number; // Existing

  // NEW: Aggregate function for summary row
  aggregate?: "sum" | "mean" | "max" | "min" | "count";
}
```

### Add to Section Interface

```typescript
interface FormSection {
  id: string;
  title: string;
  layout?: "column" | "table";
  rowHeaderLabel?: string;
  tableColumns?: TableColumn[];

  // NEW:
  showSummaryRow?: boolean;
  summaryRowLabel?: string;
}
```

---

## Phase 2: FormBuilder UI

**Location:** `src/lib/components/FormBuilder.svelte` - Section editor for table layout (around line 500)

### New UI Elements

1. **Checkbox**: "Show Summary Row" toggle
2. **Text input**: "Summary Row Label" (e.g., "Total", "Average")
3. **Per-column aggregate selector**: Dropdown with sum/mean/max/min/count options

### Example UI

```
☐ Show Summary Row
   Label: [Total________]

   Physics: [Sum ▼]
   Chemistry: [Mean ▼]
   Math: [Sum ▼]
```

### Implementation in FormBuilder

Add these fields after the tableColumns loop:

```svelte
<!-- Summary Row Settings -->
<div class="border p-2 mt-2 rounded">
    <h6>Summary Row</h6>
    <div class="form-check">
        <input type="checkbox" bind:checked={section.showSummaryRow} id="show-summary">
        <label for="show-summary">Show Summary Row</label>
    </div>

    {#if section.showSummaryRow}
        <input type="text" bind:value={section.summaryRowLabel} class="form-control" placeholder="Label (e.g., Total, Average)" />

        <label class="small mt-2">Column Aggregation</label>
        {#each section.tableColumns || [] as col}
            <div class="row g-2">
                <div class="col-6">{col.label}</div>
                <div class="col-6">
                    <select bind:value={col.aggregate} class="form-select form-select-sm">
                        <option value="">-- None --</option>
                        <option value="sum">Sum</option>
                        <option value="mean">Mean</option>
                        <option value="max">Max</option>
                        <option value="min">Min</option>
                        <option value="count">Count</option>
                    </select>
                </div>
            </div>
        {/each}
    {/if}
</div>
```

---

## Phase 3: DynamicForm Rendering

**Location:** `src/lib/components/DynamicForm.svelte` - Datagrid section (around line 750)

### Add Summary Row Rendering

```svelte
<!-- Summary Row - after datagrid body -->
{#if isTableLayout && section.showSummaryRow}
    <tfoot class="table-light">
        <tr>
            <td><strong>{section.summaryRowLabel || 'Total'}</strong></td>
            {#each section.tableColumns || [] as col}
                <td>
                    {#if col.aggregate && datagridFields.length > 0}
                        {@const values = datagridFields.map(f => {
                            const val = formData[getKey(f)]?.[col.key]?.value ?? formData[getKey(f)]?.[col.key];
                            return val ? Number(val) : 0;
                        }).filter(v => !isNaN(v))}

                        {#if col.aggregate === 'sum'}
                            {values.reduce((a, b) => a + b, 0)}
                        {:else if col.aggregate === 'mean'}
                            {(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}
                        {:else if col.aggregate === 'max'}
                            {Math.max(...values)}
                        {:else if col.aggregate === 'min'}
                            {Math.min(...values)}
                        {:else if col.aggregate === 'count'}
                            {values.length}
                        {/if}
                    {:else}
                        -
                    {/if}
                </td>
                {#if col.is_merit}
                    <td></td>
                {/if}
            {/each}
        </tr>
    </tfoot>
{/if}
```

---

## Phase 4: Summary Row Calculation Logic

### Aggregation Functions

1. **Sum**: `values.reduce((a, b) => a + b, 0)`
2. **Mean**: `values.reduce((a, b) => a + b, 0) / values.length`
3. **Max**: `Math.max(...values)`
4. **Min**: `Math.min(...values)`
5. **Count**: `values.length`

### Notes

- Only count rows with valid numeric values
- Handle empty rows gracefully
- Update reactively when user adds/removes rows

---

## Files to Modify

| File                                    | Changes                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/components/DynamicForm.svelte` | Add TableColumn.aggregate, section.showSummaryRow; Add summary row rendering |
| `src/lib/components/FormBuilder.svelte` | Add summary row UI in section editor                                         |

---

## Implementation Order

1. Update interfaces in DynamicForm.svelte
2. Add summary row UI in FormBuilder.svelte
3. Add summary row rendering in DynamicForm.svelte
4. Test with sample data

---

## Example

Given a table with subjects and scores:

| Subject   | Theory (Max 70) | Practical (Max 30) | Total |
| --------- | --------------- | ------------------ | ----- |
| Physics   | 60              | 25                 | 85    |
| Chemistry | 55              | 28                 | 83    |
| Math      | 65              | 30                 | 95    |

**With Summary Row enabled:**

| Subject   | Theory (Max 70) | Practical (Max 30) | Total   |
| --------- | --------------- | ------------------ | ------- |
| Physics   | 60              | 25                 | 85      |
| Chemistry | 55              | 28                 | 83      |
| Math      | 65              | 30                 | 95      |
| **Total** | **180**         | **83**             | **263** |

**Theory column shows sum: 60+55+65 = 180**
**Mean shows: 180/3 = 60**
