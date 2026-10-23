# Implementation Plan: Default Values in Dynamic Forms

This plan outlines how to enable **Default Values** for dynamic fields, allowing administrators to pre-set common answers directly within the Form Builder.

---

### 1. Schema Specification Update
We will introduce a new optional property, `defaultValue`, to the field object structure within the `schema_json`.

*   **Property:** `defaultValue`
*   **Data Type:** Dynamic (matches the field type: `string`, `number`, or `boolean`).
*   **Example Schema Fragment:**
    ```json
    {
      "key": "nationality",
      "type": "text",
      "label": "Nationality",
      "defaultValue": "Indian"
    }
    ```

---

### 2. Form Builder Enhancements (Admin Interface)
**Component:** `src/lib/components/FormBuilder.svelte`

1.  **UI Addition:** Inside the "Add/Edit Field" modal, a new input section labeled **"Default Value"** will be added.
2.  **Context-Aware Inputs:** The input type for the default value will change based on the selected field type:
    *   **Text/Email:** Standard text box.
    *   **Select/Radio:** A dropdown list containing the options defined for that field.
    *   **Number:** A numeric input.
    *   **Checkbox:** A toggle/switch.
    *   **Date:** A date picker.
3.  **State Management:** When saving a field, the `defaultValue` will be bundled into the field object before updating the main schema state.

---

### 3. Dynamic Form Logic (Rendering Interface)
**Component:** `src/lib/components/DynamicForm.svelte`

1.  **Initialization Strategy:** The component will check for default values during the initial state setup (using Svelte 5 `$effect` or `onMount`).
2.  **Logic for Pre-filling:**
    *   Iterate through all fields in the provided schema.
    *   If a field has a `defaultValue` AND the current `formData[key]` is empty, null, or undefined:
        *   Assign the `defaultValue` to `formData[key]`.
3.  **Data Priority (Hierarchy):**
    To ensure we don't overwrite user-provided or imported data, the system will follow this priority:
    1.  **Existing Saved Data:** Values already stored in the database for that record.
    2.  **Autofill Data:** Values pulled from external sources like Student Profile or Inquiry.
    3.  **Schema Default:** The value defined by the Admin in the form structure.

---

### 4. Technical Considerations
*   **Validation:** Ensure that the `defaultValue` provided by the Admin passes the field's own validation rules (e.g., if a field is "Numbers Only", the default value must be a number).
*   **Empty Strings:** Treat empty strings as "No Default" to avoid cluttering the UI.
*   **Reset Capability:** Ensure that if a user manually clears a field that had a default value, the default doesn't "re-appear" unless the record is re-initialized from scratch.

---

### Summary of Workflow
1.  **Admin** edits the Admission Form, clicks on the "Country" field, and sets the Default Value to "India".
2.  **Student** opens the application for the first time.
3.  **System** sees the "Country" field is empty.
4.  **System** automatically populates the input with "India" based on the schema definition.
