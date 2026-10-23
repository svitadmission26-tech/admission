# Isolated UI Template Builder - Implementation Detail Plan

## Project Requirements
- **Isolation**: Completely isolated from current codebase
- **Zero Modifications**: Don't modify existing files/routes
- **Backend Integration**: Use existing APIs for variables/data only
- **Non-Breaking**: No impact on current functionality
- **New Files Only**: All new features in dedicated directories
- **Output Format**: Generate HTML compatible with existing print-profile and pdfmake

---

## **1. Architecture & Isolation Strategy**

### **1.1 Directory Structure**
```
src/routes/admin/template-builder/
├── +page.svelte              # Main editor UI
├── +page.server.ts           # API endpoints (read-only)
├── +layout.svelte            # Layout wrapper
├── lib/
│   ├── canvas/
│   │   ├── Canvas.svelte     # A4 workspace
│   │   ├── Grid.svelte       # Grid overlay
│   │   └── Viewport.svelte   # Zoom/pan controls
│   ├── components/
│   │   ├── ComponentPalette.svelte  # Draggable items
│   │   ├── PropertyEditor.svelte    # Style controls
│   │   └── Layers.svelte            # Layer hierarchy
│   ├── engine/
│   │   ├── store.ts          # Isolated state (Svelte store)
│   │   ├── compiler.ts       # JSON → HTML converter
│   │   ├── parser.ts         # HTML → JSON converter
│   │   └── types.ts          # Type definitions
│   └── preview/
│       ├── Preview.svelte    # Live preview pane
│       └── PDFPreview.svelte # PDF rendering
└── data/
    ├── variables.ts          # Read from backend
    └── schema.ts             # Template schema definitions
```

### **1.2 Key Principle: Zero Codebase Modifications**

| Current Codebase | Template Builder | Interaction |
|------------------|------------------|-------------|
| `/admin/report-builder` | `/admin/template-builder` | Independent |
| `src/lib/server/pdf.ts` | Uses only (no modify) | Read-only |
| `report_templates` table | Reads/writes | Via API endpoint only |
| Print profile routes | Uses exported HTML | Consumes output |

---

## **2. Detailed Component Architecture**

### **2.1 Frontend Components**

#### **A. Main Editor (`+page.svelte`)**
```
┌─────────────────────────────────────┐
│ Toolbar (Save, Preview, Export)     │
├────────┬──────────────┬──────────────┤
│        │              │              │
│Palette │  A4 Canvas   │  Properties  │
│        │  (Designer)  │  Sidebar     │
│        │              │              │
└────────┴──────────────┴──────────────┘
```

**State Management** (Isolated Svelte Store):
```typescript
// NO modifications to existing stores
// Completely new: src/routes/admin/template-builder/lib/engine/store.ts
export const templateStore = writable({
  canvas: { zoom: 100, scrollX: 0, scrollY: 0 },
  elements: [],        // Tree of components
  selected: null,      // Currently selected element
  clipboard: null,
  history: [],         // Undo/redo
})
```

#### **B. Canvas Component (`Canvas.svelte`)**
- A4 page (210mm × 297mm = 793px × 1122px)
- Grid overlay (12-column, 12.5mm cells)
- Snap-to-grid logic (no external modifications)
- Mouse tracking for drop zones
- Selection highlight

#### **C. Component Palette (`ComponentPalette.svelte`)**
```
Categories:
├── Typography
│   ├── Label (Text)
│   ├── Paragraph
│   └── Heading
├── Layout
│   ├── Section/Container
│   ├── Row (flexible columns)
│   └── Column
├── Media
│   ├── Image
│   └── QR Code
├── Data
│   ├── Variable ({{student.name}})
│   └── Dynamic Field
├── Tables
│   ├── Static Table
│   └── Dynamic Table (array data)
└── Visual
    ├── Divider
    ├── Shape (rect, circle)
    └── Line
```

#### **D. Property Editor (`PropertyEditor.svelte`)**
- When element selected, show panels:
  - **Text**: Font family, size, weight, color, alignment
  - **Spacing**: Padding, margin (visual controls)
  - **Box Model**: Border, shadow, radius, background
  - **Conditional**: Visibility rules (if/then logic)
  - **Data Binding**: Select variable from schema

#### **E. Preview Pane (`Preview.svelte`)**
- Real-time rendering with sample data
- Side-by-side with editor
- Toggleable to full-screen

### **2.2 Engine Layer (Pure Logic - No Dependencies)**

#### **A. Data Model** (`types.ts`)
```typescript
interface TemplateElement {
  id: string;
  type: 'text' | 'image' | 'container' | 'row' | 'column' | 'table' | 'variable';
  props: {
    content?: string;
    style: CSS;
    condition?: ConditionalRule;
    dataBinding?: DataBinding;
  };
  children?: TemplateElement[];
}

interface TemplateConfig {
  version: '1.0';
  name: string;
  description: string;
  layout: TemplateElement[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  };
}
```

#### **B. Compiler** (`compiler.ts`)
```typescript
// JSON → HTML (for export)
export function compileToHTML(config: TemplateConfig): string {
  // Returns Handlebars-ready HTML string
  // Compatible with existing pdfmake engine
  // Uses existing print-profile template patterns
}

// Example output:
// <div class="profile-header">
//   <h1>{{ student.full_name }}</h1>
//   <img src="{{ college.logo_url }}" />
// </div>
```

#### **C. Parser** (`parser.ts`)
```typescript
// HTML → JSON (for import from existing templates)
export function parseFromHTML(html: string): TemplateConfig {
  // Reverse-engineer JSON from existing HTML templates
  // Optional: allows migration of old templates
}
```

#### **D. Store** (`store.ts`)
```typescript
// Local state - no global modifications
export const templateStore = writable<TemplateConfig>({...});
export const selectedElement = writable<string | null>(null);
export const editMode = writable<'edit' | 'preview'>('edit');
```

---

## **3. Backend Integration (Read-Only)**

### **3.1 New API Endpoint** (`+page.server.ts`)

**Purpose**: Provide variables and schema info to frontend

```typescript
// GET /admin/template-builder/api/variables
// Returns: Available placeholders for data binding
export async function getVariables(): {
  student: {...},
  application: {...},
  college: {...},
  payment: {...}
}

// GET /admin/template-builder/api/schema
// Returns: Field definitions for UI hints
export async function getSchema(): SchemaDefinition
```

**Key Principle**: 
- ✅ Read-only endpoints
- ✅ No modifications to existing tables
- ✅ Can use existing `dbInspector.ts` utility
- ✅ Returns cached schema info

### **3.2 Save/Load Flow**

**On Save**:
```
User clicks "Save" 
  → JSON config serialized
  → Posted to /admin/template-builder/actions/save
  → NEW SQL: INSERT into report_templates 
           OR UPDATE template_builder_configs
  → Returns: { success, id, message }
```

**Never touches**:
- ❌ admissions table
- ❌ applications table
- ❌ student_profiles table
- ❌ existing report_templates (if using separate table)

---

## **4. Isolated Route & Navigation**

### **4.1 Routing Structure**
```
/admin
├── /admission-sequences      (existing)
├── /reports                  (existing)
├── /template-builder/        (NEW - ISOLATED)
│   ├── +page.svelte         (editor)
│   ├── +page.server.ts      (APIs)
│   ├── [id]/+page.svelte    (edit mode)
│   └── lib/                 (isolated)
└── ...
```

### **4.2 No Navigation Changes**
- Add link in admin sidebar (new line, no modifications)
- Icon: `<FiEdit3 />` or similar
- Label: "Template Designer" or "Visual Editor"

---

## **5. Data Storage Strategy**

### **Option A: New Dedicated Table** (RECOMMENDED)
```sql
-- NO MODIFICATIONS TO EXISTING TABLES
CREATE TABLE template_builder_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  config_json JSONB NOT NULL,
  html_output TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  version INTEGER DEFAULT 1,
  is_public BOOLEAN DEFAULT false
);
```

**Advantages**:
- ✅ Completely isolated
- ✅ No risk of breaking existing data
- ✅ Clean separation of concerns
- ✅ Easy to extend later

### **Option B: Store in `report_templates.template_config`** (Alternative)
- Add `template_config JSONB` column to existing `report_templates` table
- Less isolation but reuses existing table
- Would require ONE schema migration (your choice)

---

## **6. Feature Breakdown: Phase-by-Phase**

### **Phase 1: Foundation** (2-3 days)
- [ ] Route structure created
- [ ] Canvas with A4 viewport
- [ ] Grid system (12-column)
- [ ] Basic Svelte stores (isolated)
- [ ] No database yet - localStorage only

### **Phase 2: Components & DnD** (3-4 days)
- [ ] Component palette (draggable items)
- [ ] Drop zones on canvas
- [ ] Selection highlighting
- [ ] Delete/duplicate actions
- [ ] Layer panel (hierarchy view)

### **Phase 3: Property Editor** (2-3 days)
- [ ] Style controls (text, spacing, colors)
- [ ] Conditional logic UI
- [ ] Data binding picker (reads from backend)
- [ ] Live update on canvas

### **Phase 4: Compiler & Export** (2-3 days)
- [ ] JSON → HTML converter
- [ ] Handlebars template generation
- [ ] Export as file
- [ ] Copy to clipboard

### **Phase 5: Backend + Save** (1-2 days)
- [ ] API endpoints for variables/schema
- [ ] Save to database
- [ ] Load existing configs
- [ ] Preview with real data

### **Phase 6: Polish & Preview** (1-2 days)
- [ ] PDF preview pane
- [ ] Undo/redo
- [ ] Keyboard shortcuts
- [ ] Mobile-responsive canvas

---

## **7. Data Flow Diagram**

```
User Actions (Canvas)
    ↓
Isolated Svelte Store
    ↓
Canvas Renderer (Svelte Component)
    ├→ Preview Pane (Real-time)
    └→ Property Editor (Read/Update State)
    
Save Action
    ↓
Compiler (JSON → HTML)
    ↓
POST /admin/template-builder/actions/save
    ↓
New Database Table (Isolated)
    ↓
Success Response
```

---

## **8. Export & Integration Points**

### **8.1 Export Format**
```typescript
{
  "version": "1.0",
  "html": "<div class='profile'>{{student.full_name}}</div>",
  "config": {
    "layout": [...],
    "metadata": {...}
  }
}
```

### **8.2 Use in Existing System**
```typescript
// In /admin/reports or /print-profile routes
// NO MODIFICATIONS - just use the exported HTML
const customHTML = loadFromTemplateBuilder(templateId);
// Pass to existing pdfmake/print engine
```

---

## **9. UI/UX Wireframe**

```
┌──────────────────────────────────────────────────────────────┐
│  Template Builder  [Save] [Preview] [Export] [Help]          │
├────────┬──────────────────────────────┬─────────────────────┤
│        │                              │                     │
│  Comp  │     A4 CANVAS                │  PROPERTIES         │
│ Palette│     (Designer View)          │  ┌──────────────┐   │
│        │                              │  │ Text         │   │
│ [Text] │     ┌──────────────────┐     │  │ Font: Arial  │   │
│ [Image]│     │ A4 Page (793x1122)│     │  │ Size: 14px  │   │
│ [Table]│     │ ┌──────────────┐ │     │  │             │   │
│ [Row]  │     │ │ College Logo │ │     │  │ [Remove]    │   │
│ [Var]  │     │ └──────────────┘ │     │  └──────────────┘   │
│        │     │ Name: {{s.name}} │     │                     │
│ [+New] │     │ ┌──────────────┐ │     │  Layers:            │
│        │     │ │ Table Data   │ │     │  ├─ Row 1          │
│        │     │ └──────────────┘ │     │  │ └─ Logo (sel)   │
│        │     └──────────────────┘     │  └─ Row 2          │
│        │     [Zoom] [Grid] [Snap]     │                     │
└────────┴──────────────────────────────┴─────────────────────┘
```

---

## **10. Security & Permissions**

### **10.1 Access Control**
```typescript
// In +page.server.ts
export async function load({ locals }) {
  // Only admin can access
  if (locals.userProfile?.role !== 'admin') {
    throw redirect(303, '/login');
  }
  return { ...data };
}
```

### **10.2 SQL Injection Prevention**
- All data through Supabase client (parameterized queries)
- JSON validation before saving
- No raw SQL in template builder code

---

## **11. Migration & Rollback Plan**

### **11.1 Database Migration** (If needed)
```sql
-- New isolated table - ZERO risk to existing tables
CREATE TABLE template_builder_configs (
  id UUID PRIMARY KEY,
  ...
);

-- If Option B chosen: Add column to existing report_templates
-- ALTER TABLE report_templates ADD COLUMN template_config JSONB;
```

### **11.2 Rollback**
- Simply delete `/admin/template-builder` route
- Drop new table (if created)
- No changes to existing code = easy rollback

---

## **12. Testing Strategy**

### **12.1 Unit Tests** (Isolated)
```typescript
// test/compiler.test.ts
test('JSON → HTML compilation', () => {
  const config = {...};
  const html = compileToHTML(config);
  expect(html).toContain('{{student.full_name}}');
});

// test/parser.test.ts
test('HTML → JSON parsing', () => {
  const html = '<div>{{student.name}}</div>';
  const config = parseFromHTML(html);
  expect(config.layout).toBeDefined();
});
```

### **12.2 Integration Tests**
- Save & load flow
- Export functionality
- Backend API responses
- No tests on existing routes (safe)

---

## **13. Documentation Requirements**

### **13.1 Admin Guide** (New file)
```
/documentation/TEMPLATE_BUILDER_GUIDE.md

1. Getting Started
2. Component Reference
3. Data Binding Guide
4. Conditional Rules
5. Export & Integration
6. Troubleshooting
```

### **13.2 Developer Guide** (New file)
```
/documentation/TEMPLATE_BUILDER_DEV.md

1. Architecture
2. Store Structure
3. Adding New Components
4. Extending Compiler
5. API Reference
```

---

## **14. Risk Assessment**

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Database conflict | Low | Low | Use new table |
| Route conflict | Very Low | Med | Use /template-builder path |
| Performance impact | Very Low | Low | Isolated components |
| Breaking existing features | Very Low | High | Zero modifications |

---

## **15. Implementation Checklist**

```
PREPARATION
- [ ] Approve plan structure
- [ ] Decide on database option (A or B)
- [ ] Design final UI/UX mockups

FOUNDATION
- [ ] Create route directory structure
- [ ] Initialize Svelte components scaffold
- [ ] Set up isolated store
- [ ] Create data types (types.ts)

CANVAS & COMPONENTS
- [ ] Build A4 canvas with grid
- [ ] Implement drag-and-drop
- [ ] Create component palette
- [ ] Build layer panel

PROPERTY EDITOR
- [ ] Style controls UI
- [ ] Data binding picker
- [ ] Conditional logic UI

COMPILER & ENGINE
- [ ] JSON → HTML compiler
- [ ] Template validation
- [ ] Export functionality

BACKEND INTEGRATION
- [ ] Create API endpoints for variables
- [ ] Database save/load logic
- [ ] RLS policies (if needed)

TESTING & POLISH
- [ ] Unit tests
- [ ] Integration tests
- [ ] PDF preview
- [ ] Performance optimization

DOCUMENTATION
- [ ] Admin guide
- [ ] Developer guide
- [ ] API documentation
```

---

## **16. Success Criteria**

✅ **Phase 1 Success**:
- Route accessible at `/admin/template-builder`
- Canvas renders with A4 grid
- No errors in console
- Existing functionality unaffected

✅ **Phase 5 Success**:
- Templates can be created visually
- JSON config saved to database
- HTML exported with Handlebars syntax
- Zero modifications to existing code

✅ **Final Success**:
- 100% isolated feature
- Easy to extend/modify
- Zero breaking changes
- Fully documented

---

## **17. Key Principles Summary**

1. **Complete Isolation**: All code lives in `/admin/template-builder`
2. **Read-Only Backend**: Never modify existing tables
3. **Zero Codebase Changes**: Don't touch any existing files
4. **Clean Export**: Generate compatible HTML for existing system
5. **Easy Rollback**: Can be deleted without affecting codebase
6. **Scalable Design**: Easy to extend with new components
7. **No Performance Impact**: Isolated from main app state

---

## **18. Technologies Used**

- **Frontend**: Svelte 5 + TypeScript
- **State**: Writable stores (isolated)
- **Drag-and-Drop**: Implement custom logic or `svelte-dnd-action`
- **Styling**: Tailwind CSS (no custom changes needed)
- **Database**: Supabase (read/write isolated table)
- **Export**: JSON + HTML generation
- **Preview**: Real-time with sample data from backend

---

## **Final Notes**

This plan ensures:
- ✅ **Zero risk** to existing functionality
- ✅ **Complete isolation** from current codebase
- ✅ **Easy maintenance** and future extensions
- ✅ **Clean integration** with existing print system
- ✅ **Professional implementation** with minimal footprint

The template builder can be implemented incrementally (Phase 1-6) without any impact on the current application at any stage.
