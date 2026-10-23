# Plan: Advanced Dynamic Report Builder with Nested JSON & Conditional Logic

## Objective
Enhance the Report Builder and PDF generation engine to support deeply nested JSON data (organized by form sections) and advanced conditional rendering logic using comparison operators.

## Key Changes

### 1. Recursive Schema Definition (`src/lib/server/dbInspector.ts`)
- Modify the `JsonColumnKey` interface to be recursive: `jsonKeys?: JsonColumnKey[]`.
- This enables representing hierarchies within JSON columns, such as Folders (Sections) containing Fields.

### 2. Hierarchical Metadata Extraction (`src/routes/admin/report-builder/+page.server.ts`)
- Update the server-side extraction logic for `admission_forms`:
    - Group fields by their parent **Section**.
    - Create a structured `jsonKeys` array for the `form_data` column where each section is a "folder" key.
    - **Filtering:** Exclude "Control" field types (Headers, Spacers, Static Text) and "Document/File" types.
- Ensure unique fields are still handled across different form versions.

### 3. Recursive Variable Picker UI (`src/lib/components/SchemaTree.svelte`)
- Implement a recursive snippet or nested component structure to render `jsonKeys` at any depth.
- Maintain the folder/toggle icon (▶ / ▼) for any JSON key that contains sub-keys.
- Ensure the click-to-insert functionality (`+` button) correctly emits the full path to the leaf field.

### 4. Advanced Logic & Type Safety (`src/routes/print-profile/[applicationId]/+page.svelte`)
- **Comparison Operators:** Upgrade the `#if` logic parser to support `==`, `!=`, `>`, `<`, `>=`, `<=`.
    - Example syntax: `{{#if category == 'OBC'}}`, `{{#if marks >= 35}}`.
- **TypeScript Fixes:**
    - Explicitly type the regex replace callback parameters (`match`, `path`, etc.) to resolve `implicitly has an 'any' type` errors.
    - Enhance `getNestedValue` to safely cast and compare values of different types (String vs Number).

### 5. Codebase Verification & Stability
- Address specific errors in `src/lib/server/reportQueryBuilder.ts` where the `match` operator was incorrectly typed.
- Ensure the `mapPathToVariable` utility in the Report Builder correctly extracts the field name regardless of the section/folder nesting.

## Implementation Steps

1.  **Phase 1: Recursive Schema & Server Logic**
    - Update `dbInspector.ts` interface.
    - Refactor `+page.server.ts` to build the section-based field tree.
2.  **Phase 2: Recursive UI Implementation**
    - Update `SchemaTree.svelte` to handle `jsonKeys` recursively.
    - Style nested folders for clarity and depth visibility.
3.  **Phase 3: Enhanced Rendering Engine**
    - Update the interpolation logic in the `print-profile` route.
    - Fix identified TypeScript errors in the rendering and query building logic.
4.  **Phase 4: Validation**
    - Run `npx svelte-check` focused on the modified files.
    - Test the Variable Picker to ensure Sections -> Fields hierarchy is correct.
    - Test a template using a comparison operator.
