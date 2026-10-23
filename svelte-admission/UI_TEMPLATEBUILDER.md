# Plan: Visual Drag-and-Drop Template Builder

## Objective
To provide a Figma/Canva-like visual design interface for Admin users to create and manage HTML templates for student profiles and reports. This system will augment the current raw HTML text editor with a grid-based, component-driven layout engine.

## 1. Core Features

### **A. Visual Canvas (The Designer)**
*   **A4 Workspace**: A calibrated workspace representing a standard A4 page (210mm x 297mm).
*   **Grid System**: A snap-to-grid layout (12-column system) for precise alignment of components.
*   **Drag-and-Drop**: Ability to drag components from a sidebar onto the canvas and reposition them.
*   **Resizing**: Visual handles to resize containers and images.

### **B. Component Library**
*   **Typography**: 
    *   **Label**: Inline text for titles and field names.
    *   **Paragraph**: Block-level text for descriptions or multi-line content.
*   **Data Bindings (Variables)**: 
    *   Draggable placeholders linked to the database schema (e.g., `{{student.full_name}}`, `{{application.id}}`).
*   **Layout Elements**:
    *   **Section/Container**: Box to group related fields.
    *   **Grid Row**: Horizontal container with flexible column support.
    *   **Divider**: Horizontal lines for visual separation.
*   **Media**: 
    *   **Image**: For logos and student photos.
*   **Tables**: 
    *   Dynamic data grids for marks, subjects, and payment history.

### **C. Property Editor (The Sidebar)**
*   **Styling**: Configure font family, size, weight, color, and alignment.
*   **Spacing**: Visual controls for Padding and Margins.
*   **Borders**: Add borders, shadows, and rounded corners to containers.
*   **Conditional Logic**: UI toggle to set visibility rules (e.g., "Show only if Category is OBC").

## 2. Technical Architecture

### **A. Tech Stack**
*   **Framework**: Svelte 5 (utilizing runes for reactive state management).
*   **Drag-and-Drop Engine**: `svelte-dnd-action` or `dnd-kit` approach for high-performance interaction.
*   **State Management**: A JSON-based Document Object Model (DOM) representing the template.
*   **Layout Engine**: Standard CSS Grid and Flexbox for native responsiveness and PDF fidelity.

### **B. Data Model (JSON Schema)**
The template will be saved as a JSON tree in the `html_content` field (or a new `visual_config` field):
```json
{
  "version": "1.0",
  "layout": [
    {
      "type": "row",
      "columns": [
        {
          "width": 4,
          "components": [
            { "type": "image", "src": "{{college.logo_url}}", "style": { "width": "50px" } }
          ]
        },
        {
          "width": 8,
          "components": [
            { "type": "label", "text": "{{college.name}}", "style": { "fontSize": "20px", "fontWeight": "bold" } }
          ]
        }
      ]
    }
  ]
}
```

### **C. Compiler/Renderer**
*   **Editor Renderer**: Converts the JSON config into an editable UI.
*   **HTML Compiler**: Converts the JSON config into the final Handlebars-ready HTML string used by the existing `print-profile` route and `pdfmake` engine.

## 3. User Experience (UX) Workflow

1.  **Selection**: Admin enters the Report Builder and chooses "Visual Mode".
2.  **Design**: Drag components (Text, Variables, Images) onto the Grid.
3.  **Configure**: Click a component to open the Property Sidebar and adjust styles.
4.  **Preview**: Switch to "Preview Mode" to see how the template looks with real student data.
5.  **Save**: The design is serialized to JSON and saved to the `report_templates` table.

## 4. Implementation Roadmap

### **Phase 1: Foundation (Grid & Canvas)**
*   Implement the A4 canvas with snap-to-grid logic.
*   Create basic Row/Column containers.

### **Phase 2: Components & Drag-and-Drop**
*   Build the Component Palette (Label, Paragraph, Image).
*   Implement basic drag-and-drop from sidebar to canvas.

### **Phase 3: Property Editor**
*   Develop the sidebar for styling selected components.
*   Implement CSS-in-JS style application for the live preview.

### **Phase 4: Data Integration**
*   Link the Variable Picker to the designer.
*   Implement the Handlebars HTML compiler.

### **Phase 5: Advanced Features**
*   Multi-page support.
*   Reusable "Global Snippets" (e.g., standard Header/Footer).
