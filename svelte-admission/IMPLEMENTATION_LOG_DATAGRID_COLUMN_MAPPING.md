# Datagrid Column Mapping & Merit Score - Implementation Log

## Date: April 12, 2026

This document logs all implementation changes made to support enhanced datagrid column mapping for merit scores.

---

## 1. FormBuilder.svelte Updates

### File: `src/lib/components/FormBuilder.svelte`

#### 1.1 Interface Updates (Lines 4-18)

Extended the `tableColumns` type in the schema interface to include merit-related properties:

```typescript
tableColumns?: {
    key: string;
    label: string;
    type: string;
    formula?: string;
    is_merit?: boolean;          // NEW: Marks column as merit-scored
    default_max_score?: number;  // NEW: Default max score for column
}[]
```

#### 1.2 Reactive Merit Column Detection (Lines 32-49)

Added reactive detection of merit columns when editing fields in table sections:

```typescript
$: currentSectionMeritColumns = (() => {
  const section = schema.sections?.find((s) => s.id === sectionId);
  if (section?.layout === "table" && section.tableColumns) {
    return section.tableColumns.filter(
      (col) => col.is_merit && col.default_max_score,
    );
  }
  return [];
})();
```

#### 1.3 Save Row-Specific Overrides (Lines 199-210)

Updated `constructCustomFieldObject()` to save `column_max_scores` when different from defaults:

```typescript
// Table Section: Save row-specific max score overrides for merit columns
if (isTableSection && currentSectionMeritColumns.length > 0) {
  const hasOverrides = Object.entries(columnMaxScores).some(
    ([colKey, score]) => {
      const col = currentSectionMeritColumns.find((c) => c.key === colKey);
      return score !== (col?.default_max_score || 100);
    },
  );
  if (hasOverrides) {
    field.column_max_scores = { ...columnMaxScores };
  }
}
```

#### 1.4 Load Row-Specific Overrides (Lines 275-286)

Updated `editField()` to load existing `column_max_scores` when editing:

```typescript
// Load column_max_scores for table sections
if (isTableSection && currentSectionMeritColumns.length > 0) {
  if (field.column_max_scores) {
    columnMaxScores = { ...field.column_max_scores };
  } else {
    // Initialize with defaults
    const defaults: Record<string, number> = {};
    currentSectionMeritColumns.forEach((col) => {
      defaults[col.key] = col.default_max_score || 100;
    });
    columnMaxScores = defaults;
  }
}
```

#### 1.5 UI Section for Max Score Overrides (Lines 615-636)

Added UI block in the Add/Edit Field modal for row-specific max score overrides:

```svelte
<!-- Table Section: Row-specific Max Score Overrides for Merit Columns -->
{#if isTableSection && currentSectionMeritColumns.length > 0}
    <div class="mt-3 p-2 border rounded bg-light">
        <h6><i class="bi bi-table me-1"></i>Table Section: Max Score Overrides</h6>
        <p class="small text-muted mb-2">Override default max scores for this row (field) in the table.</p>
        {#each currentSectionMeritColumns as col}
            <div class="row g-2 mb-2 align-items-center">
                <div class="col-6">
                    <label class="form-label small mb-0">
                        {col.label}
                        <span class="text-muted">(default: {col.default_max_score || 100})</span>
                    </label>
                </div>
                <div class="col-6">
                    <input type="number" class="form-control form-control-sm"
                           bind:value={columnMaxScores[col.key]} min="1" />
                </div>
            </div>
        {/each}
    </div>
{/if}
```

---

## 2. DynamicForm.svelte Updates

### File: `src/lib/components/DynamicForm.svelte`

#### 2.1 Visual Badge for Custom Max Scores (Lines 596-598)

Added "Custom" badge to datagrid rows that have row-specific max score overrides:

```svelte
{#if field.column_max_scores && Object.keys(field.column_max_scores).length > 0}
    <span class="badge bg-info ms-1" title="This row has custom max scores">Custom</span>
{/if}
```

---

## 3. Merit Formulas Page Updates

### File: `src/routes/admin/merit-formulas/+page.svelte`

#### 3.1 Svelte 5 Runes Migration

Updated to use Svelte 5 runes for proper reactivity:

```typescript
// Changed from: export let data: PageData;
// To:
let { data }: { data: PageData } = $props();

// Changed reactive variables to use $state:
let showAddModal = $state(false);
let showEditModal = $state(false);
let showDeleteModal = $state(false);
let selectedCourseIdForAdd = $state("");
let selectedFormTypeForAdd = $state("Provisional");
let selectedModeForAdd = $state("weighted");
let addExpressionStr = $state("");

// Changed $: to $derived:
let addModalMeritFields = $derived(
  getMeritFields(selectedCourseIdForAdd, selectedFormTypeForAdd),
);
let editModalMeritFields = $derived(
  getMeritFields(
    $currentMeritFormula.course_id,
    $currentMeritFormula.form_type,
  ),
);
```

#### 3.2 Enhanced Merit Field Detection (Lines 27-74)

Added interface and function to detect merit fields from both table and column layouts:

```typescript
interface MeritFieldEntry {
  key: string;
  label: string;
  type: "table" | "column";
  sectionTitle?: string;
  columnLabel?: string;
}

function getMeritFields(courseId: string, formType: string): MeritFieldEntry[] {
  // Extracts merit fields from:
  // 1. Table layout columns (flattened keys like 'physics_theory')
  // 2. Column layout direct merit fields
}
```

#### 3.3 Fixed Template Scope Issue (Lines 244-250, 353-359)

Fixed "field is not defined" error by removing loop-variable references from outside `{#each}` blocks:

```svelte
<!-- BEFORE (caused error): -->
<small>{#if selectedModeForAdd === 'weighted'}For table fields, use <code>weight_{field.key}</code>{/if}</small>

<!-- AFTER (correct): -->
<small>Click a field to insert it into your formula. Weight will be added to JSON.</small>
```

---

## 4. Merit Calculation Engine (Pre-existing)

### File: `src/lib/server/merit.ts`

The merit calculation engine already handles nested datagrid structures via `flattenContext()`:

```typescript
const flattenContext = (obj: any, prefix = "") => {
  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (
      typeof val === "object" &&
      val !== null &&
      "value" in val &&
      "max_score" in val
    ) {
      // Structured Merit Field
      context[newKey] = Number(val.value) || 0;
      context[`${newKey}_max`] = Number(val.max_score) || 1;
    } else if (typeof val === "object" && val !== null) {
      // Nested datagrid or object - recurse
      flattenContext(val, newKey);
    }
  }
};
flattenContext(app.form_data);
```

This creates flattened keys like:

- `physics_theory` (value)
- `physics_theory_max` (max score)

---

## 5. Server-Side Updates

### File: `src/routes/admin/merit-formulas/+page.server.ts`

Updated to fetch admission forms with schema for merit field detection:

```typescript
const { data: admissionForms, error: formsError } = await supabase
  .from("admission_forms")
  .select("course_id, form_type, schema_json");
```

---

## Summary of Data Flow

### Creating a Merit Formula with Table Layout:

1. **Admin creates form** with table section containing merit columns (e.g., "Theory" with `default_max_score: 70`)

2. **Admin adds row field** (e.g., "Physics") to table section
   - FormBuilder auto-detects merit columns
   - Shows UI for row-specific max score overrides
   - Saves `column_max_scores: { theory: 70 }` to field

3. **Student fills form** with table layout
   - FormData structure: `formData['physics'] = { theory: { value: 60, max_score: 70 } }`

4. **Admin creates merit formula**
   - Page auto-detects all merit fields (table & column layouts)
   - Admin selects fields to insert into formula
   - Formula saved as: `{ mode: 'expression', expression: '(physics_theory / physics_theory_max) * 100' }`

5. **Merit calculation runs**
   - `flattenContext()` creates context variables
   - `mathjs.evaluate()` computes final score

---

## Key Files Modified

| File                                              | Changes                                                  |
| ------------------------------------------------- | -------------------------------------------------------- |
| `src/lib/components/FormBuilder.svelte`           | Interface, reactivity, save/load overrides, UI section   |
| `src/lib/components/DynamicForm.svelte`           | Visual badge for custom rows                             |
| `src/routes/admin/merit-formulas/+page.svelte`    | Svelte 5 runes, enhanced field detection, template fixes |
| `src/routes/admin/merit-formulas/+page.server.ts` | Fetch admission forms with schema                        |

---

## Notes

- Backward compatible with existing column-layout merit fields
- Row-specific overrides only saved when different from column defaults
- Merit formulas can reference both table (flattened) and column (direct) fields
- UI uses badges to differentiate: `btn-outline-info` for table, `btn-outline-secondary` for column

---

## 6. Receipt Sequence Management UI

### Date: April 12, 2026

Added admin UI for managing receipt sequences (edit, reset, delete).

### Files Created

#### `src/routes/admin/receipt-sequences/+page.server.ts`

Server-side load and form actions:

- **Load**: Fetches receipt_sequences with joins (colleges, courses, academic_years), plus paymentTypes list
- **Actions**: create, update, reset, delete

#### `src/routes/admin/receipt-sequences/+page.svelte`

Client-side UI with:

- Filter section (College, Academic Year, Payment Type, Course)
- Table view of all sequences with preview
- Edit modal (prefix, current sequence)
- Reset button (to 0)
- Delete button
- Add modal for new sequences

### Navigation Updated

#### `src/lib/config/navigation.ts`

Added navigation item under admin section:

```typescript
{ title: "Receipt Sequences", href: "/admin/receipt-sequences", icon: "bi-receipt" },
```

### Features

- **Filter**: Filter sequences by college, year, payment type, course
- **View**: See current sequence number and preview of next receipt
- **Edit**: Update prefix and current sequence number
- **Reset**: Reset sequence to 0 with confirmation
- **Delete**: Remove sequence configuration
- **Create**: Add new sequence configuration

### Database Schema

```sql
receipt_sequences:
  - id (UUID, PK)
  - college_id (UUID, FK)
  - course_id (UUID, FK) - optional
  - payment_type (TEXT) - application_fee, provisional_fee, tuition_fee, etc.
  - academic_year_id (UUID, FK)
  - current_sequence (INTEGER, default 0)
  - prefix (TEXT, default 'REC-')
  - UNIQUE(college_id, payment_type, academic_year_id)
```

### Notes

- Admin only access (same as admission-sequences)
- Course field is optional for generic numbering
- Preview shows what the next receipt number would look like

---

## 7. Enhanced Conditional Visibility (showWhen)

### Date: April 12, 2026

Added support for multi-value conditional field visibility.

### Files Modified

#### `src/lib/components/DynamicForm.svelte`

**1. Extended showWhen Interface (Line 30-35):**

```typescript
showWhen?: {
    field: string;
    operator?: 'equals' | 'notEquals' | 'in';
    equals?: string | string[];  // string[] for 'in' operator
}
```

**2. Added Visibility Check Helper (Lines 197-213):**

```typescript
function checkVisibility(
  showWhen: FormField["showWhen"],
  formData: Record<string, any>,
): boolean {
  const parentVal = resolvePath(formData, showWhen.field);
  const checkValue =
    parentVal && typeof parentVal === "object" && "value" in parentVal
      ? parentVal.value
      : parentVal;

  const { operator = "equals", equals } = showWhen;

  if (operator === "in" && Array.isArray(equals)) {
    return equals.includes(checkValue);
  }
  if (operator === "notEquals") {
    return checkValue !== equals;
  }
  return checkValue === equals;
}
```

**3. Updated Reactivity Block:**

```typescript
$: {
  schema.fields.forEach((field) => {
    const key = getKey(field);
    if (field.showWhen) {
      visibleFields[key] = checkVisibility(field.showWhen, formData);
    } else {
      visibleFields[key] = true;
    }
  });
}
```

#### `src/lib/components/FormBuilder.svelte`

**1. New State Variables (Lines 41-43):**

```typescript
let showWhenField = "";
let showWhenOperator = "equals";
let showWhenValues = "";
```

**2. Updated saveField Logic (Lines 218-233):**

```typescript
if (showWhenField && showWhenField.trim()) {
  if (showWhenOperator === "in" && showWhenValues) {
    const values = showWhenValues
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length > 0) {
      field.showWhen = {
        field: showWhenField.trim(),
        operator: "in",
        equals: values,
      };
    }
  } else if (showWhenOperator === "notEquals") {
    field.showWhen = {
      field: showWhenField.trim(),
      operator: "notEquals",
      equals: showWhenValues.trim(),
    };
  } else if (showWhenValues) {
    field.showWhen = {
      field: showWhenField.trim(),
      operator: "equals",
      equals: showWhenValues.trim(),
    };
  }
}
```

**3. Updated editField Logic (Lines 286-299):**
Loads existing showWhen with operator support.

**4. New UI Section (Lines 717-745):**
Enhanced UI with dropdown for operator selection and support for comma-separated values.

### Example Usage

**Schema Configuration:**

```json
{
  "fields": [
    {
      "key": "stream",
      "label": "Stream",
      "type": "select",
      "sectionId": "academics"
    },
    {
      "key": "math",
      "label": "Mathematics",
      "type": "number",
      "sectionId": "academics",
      "showWhen": {
        "field": "stream",
        "operator": "in",
        "equals": ["science", "commerce"]
      }
    },
    {
      "key": "biology",
      "label": "Biology",
      "type": "number",
      "sectionId": "academics",
      "showWhen": {
        "field": "stream",
        "operator": "equals",
        "equals": "medical"
      }
    },
    {
      "key": "history",
      "label": "History",
      "type": "number",
      "sectionId": "academics",
      "showWhen": {
        "field": "stream",
        "operator": "notEquals",
        "equals": "science"
      }
    }
  ]
}
```

**FormBuilder UI:**

- Select "Field to Check": `stream`
- Select "Operator": `In (Multiple)`
- Enter "Values": `science, medical, vocational`

**Result:**

- Math row shows when stream is "science" OR "medical" OR "commerce"
- Biology row shows only when stream is "medical"
- History row shows when stream is NOT "science"

### Backward Compatibility

Old format still works:

```json
{ "showWhen": { "field": "stream", "equals": "science" } }
```

Automatically converted to new format with default operator `equals`.

---

## 8. Hybrid Table Layout (inDatagrid Support)

### Date: April 12, 2026

Added support for hybrid form layout in table sections where some fields are regular form fields and others are datagrid rows.

### Files Modified

#### `src/lib/components/DynamicForm.svelte`

**1. Interface Update (Line ~37):**

```typescript
interface FormField {
  // ... existing properties
  inDatagrid?: boolean; // true = datagrid row, false = regular field (default true for table sections)
}
```

**2. Updated sectionContent Snippet:**

```typescript
{@const sectionFields = getFieldsForSection(section.id)}
{@const regularFields = sectionFields.filter(f => f.inDatagrid === false)}
{@const datagridFields = sectionFields.filter(f => f.inDatagrid !== false)}
```

- Regular fields (`inDatagrid === false`) are rendered first as normal form fields
- Datagrid fields (`inDatagrid !== false`) are rendered as table rows
- Backward compatible: if `inDatagrid` is undefined, field is treated as datagrid row

#### `src/lib/components/FormBuilder.svelte`

**New Features:**

1. "Include in Datagrid" checkbox for table sections
2. Searchable field dropdown using HTML5 datalist
3. `inDatagrid` state variable with save/load logic

### Example Schema

```json
{
  "sections": [
    {
      "id": "academics",
      "layout": "table",
      "tableColumns": [
        { "key": "theory", "label": "Theory" },
        { "key": "practical", "label": "Practical" }
      ]
    }
  ],
  "fields": [
    {
      "key": "stream",
      "label": "Stream",
      "sectionId": "academics",
      "inDatagrid": false
    },
    {
      "key": "physics",
      "label": "Physics",
      "sectionId": "academics",
      "inDatagrid": true
    }
  ]
}
```

### Backward Compatibility

- Existing forms without `inDatagrid` work as before (all fields = datagrid rows)
- `inDatagrid` is optional, defaults to `true` for table sections

---

## 9. Fix: Admin Forms Edit Page Reactivity

### Date: April 12, 2026

Fixed the admin/forms edit page to fetch schema when configuration (Course/Cycle/Form Type) changes.

### Files Modified

#### `src/routes/admin/forms/[id]/edit/+page.svelte`

**1. Converted to Svelte 5 Runes Mode:**

```typescript
// Changed from:
export let data: PageData;
export let form: ActionData;

// To:
let { data, form }: { data: PageData; form: ActionData } = $props();
```

**2. Added Reactive Schema Fetching:**

```typescript
// Fetch schema when configuration changes
$effect(() => {
  const courseId = currentForm.course_id;
  const cycleId = currentForm.cycle_id;
  const formType = selectedFormType;

  // Skip if this is the initial load
  if (
    courseId === initialConfig.course_id &&
    cycleId === initialConfig.cycle_id &&
    formType === initialConfig.form_type
  ) {
    return;
  }

  fetchSchemaForConfig(courseId, cycleId, formType);
});

async function fetchSchemaForConfig(courseId, cycleId, formType) {
  // Fetches existing form schema via API
  // Updates builderSchema and form fields accordingly
}
```

**3. Updated Duplicate Check Logic:**

```typescript
// Watch for config changes and check for duplicates
$effect(() => {
  const courseId = currentForm.course_id;
  const cycleId = currentForm.cycle_id;
  const formType = selectedFormType;

  // Skip initial load
  if (
    courseId === initialConfig.course_id &&
    cycleId === initialConfig.cycle_id &&
    formType === initialConfig.form_type
  ) {
    duplicateFormId = null;
    isConfigUnique = false;
    return;
  }

  checkDuplicateForm();
});
```

#### `src/routes/api/admin/get-form-schema/+server.ts` (NEW)

Created new API endpoint to fetch form schema by configuration:

```typescript
export const GET: RequestHandler = async ({ url, locals }) => {
  // Validates admin role
  // Queries admission_forms by course_id, cycle_id, form_type
  // Returns form with schema_json
  // Returns { form: null } if not found
};
```

### Key Behavior

- **Initial Load**: Uses existing form's schema
- **Config Change**: Automatically fetches schema for new configuration
- **Duplicate Detection**: Shows warning if another form exists for same config
- **New Config**: Shows message that form doesn't exist for this configuration

---

## 10. Editable Max Score for Merit Fields in Datagrid

### Date: April 12, 2026

Made the "Max Score" column editable for DEO/Student users filling out dynamic forms with table layouts.

### Files Modified

#### `src/lib/components/DynamicForm.svelte`

**Changed the max score input in datagrid table (lines 690-701):**

```svelte
<!-- BEFORE: readonly max score -->
<input type="number" class="form-control bg-light" readonly value={...} />

<!-- AFTER: editable max score -->
<input
    type="number"
    class="form-control"
    value={formData[key]?.[col.key]?.max_score ?? field.column_max_scores?.[col.key] ?? col.default_max_score ?? 100}
    min="1"
    oninput={(e) => {
        const targetValue = (e.target as HTMLInputElement).value;
        if (!formData[key]) formData[key] = {};
        if (!formData[key][col.key]) formData[key][col.key] = {};
        formData[key][col.key].max_score = parseFloat(targetValue) || 100;
    }}
    disabled={readonly}
/>
```

**Key Changes:**

1. Removed `readonly` attribute
2. Added `class="form-control"` (removed `bg-light`)
3. Added `oninput` handler to update `formData[key][col.key].max_score`
4. Added `min="1"` validation
5. Added `disabled={readonly}` for consistency with other inputs
6. Changed to use `field.column_max_scores?.[col.key]` as fallback (row-specific override)
7. Made row label `fw-semibold` for better visibility

**Behavior:**

- DEO/Student users can now edit the max score for each merit column in table rows
- Initial value shows: row-specific override > column default max score > 100
- Changes are saved to formData and will be used in merit calculations
- In readonly mode (e.g., viewing submitted applications), max score remains editable only by admin

---

## 11. Fix: Regular Fields in Table Sections Not Showing Saved Values

### Date: April 12, 2026

Fixed an issue where regular fields (like select fields) in table sections were not showing their saved values when editing an application.

### Root Cause

When a field was added to a table section in FormBuilder:

1. `inDatagrid` defaulted to `true`
2. Fields with `inDatagrid === true` were filtered to datagrid rows
3. The datagrid rendering only handled text/number inputs, not select fields
4. Result: Select fields in table sections weren't rendered correctly

### Files Modified

#### `src/lib/components/FormBuilder.svelte`

**1. Changed default for `inDatagrid`:**

```typescript
// BEFORE: Default to datagrid row
let inDatagrid = true;

// AFTER: Default to regular field (above datagrid)
let inDatagrid = false;
```

**2. Updated `openAddFieldModal`:**

```typescript
function openAddFieldModal() {
  clearInputs();
  // Default to regular field (not in datagrid) for table sections
  if (isTableSection) {
    inDatagrid = false;
  }
  showAddFieldModal = true;
}
```

**3. Updated `editField` load logic:**

```typescript
// BEFORE: Default to true if not explicitly set
inDatagrid = field.inDatagrid !== false;

// AFTER: Default to false
inDatagrid = field.inDatagrid === true;
```

#### `src/lib/components/DynamicForm.svelte`

**Updated filter logic:**

```svelte
<!-- BEFORE: Fields without inDatagrid go to datagrid -->
{@const datagridFields = sectionFields.filter(f => f.inDatagrid !== false)}

<!-- AFTER: Only fields explicitly marked inDatagrid go to datagrid -->
{@const regularFields = sectionFields.filter(f => f.inDatagrid === false)}
{@const datagridFields = sectionFields.filter(f => f.inDatagrid === true)}
```

### Behavior After Fix

- Fields added to table sections are now regular fields by default (rendered above the datagrid)
- Select fields (like "Board Selection") work correctly
- Admins can still opt to include fields in the datagrid by checking "Include in Datagrid"
