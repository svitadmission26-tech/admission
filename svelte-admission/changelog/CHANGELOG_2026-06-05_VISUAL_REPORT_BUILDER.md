# Changelog: Visual Report Builder Enhancements & Fixes
**Date:** June 5, 2026

This changelog summarizes the modifications made to the Visual Report Builder, the interpolation engine, the PDF generation logic, and the `profile-data` backend API during this session.

## 🌟 Features & Enhancements
* **Dual-Property Sidebar:** Updated the properties sidebar to simultaneously display the properties of a selected child component AND the parent `LayoutTable`'s grid management controls.
* **Dynamic Layout Table Resizing:** Re-engineered `LayoutTable` components to automatically expand their width and height (`fit-content`, `min-width`, `min-height`) based on the size of dropped child components to prevent content cut-offs.
* **Persistent Visual Grid:** Enabled a permanent 10px visual grid background in the design canvas to aid alignment, while disabling mathematical snap-to-grid to allow pixel-perfect, freeform component placement.
* **Default Text Value:** Changed the default text for newly dropped Text components from "New Text Block" to "Hello There".
* **Flexible Interpolation Syntax:** Upgraded the interpolation engine to support both single brace `{variable}` and double brace `{{variable}}` syntax for broader template compatibility.
* **Smart `.value` Extraction:** The interpolation engine now automatically detects nested JSON object structures (like academic marks `{value: 55, max_score: 100}`) and extracts the `.value` property instead of rendering them as blank strings.

## 🐛 Bug Fixes
* **Layout Table Movement:** Fixed a bubbling conflict where clicking inside a table cell swallowed the movement event. Users can now click anywhere on a Layout Table to move it.
* **Child Component Selection:** Implemented a deep-selection check (`_selectionHandled`) to ensure clicking a nested component (like text inside a cell) successfully selects the child instead of defaulting to the parent table.
* **Restored Empty Cell Drop Zones:** Fixed an issue where removing a component from a Layout Table cell prevented new components from being dropped in. Added `min-height: 20px` and explicit `pointer-events: auto` to maintain active drop zones.

## 🔌 API & Data Resolution (`/api/reports/profile-data`)
* **Extreme Data Redundancy:** Refactored data formatting to provide variables across multiple chained paths. Nested objects (like `student` and `course`) are now accessible via `application.student`, directly as `student`, or via fallback aliases like `applications` and `students`.
* **Root-Level JSON Flattening:** Automatically extracts and flattens all properties from `form_data` (Applications) and `profile_data` (Student Profiles) and injects them into the root context for maximum pathing fallback.
* **Isolated Fallback Fetching:** If primary table joins fail or are missing relationships, the API now triggers secondary, isolated database fetches for `users`, `courses`, and `admission_cycles` using foreign keys to guarantee data availability.
* **Restored Fetch Logic:** Restored missing API logic for fetching signed `photoUrl` links from the storage bucket and building the `formattedMarks` object mapping (e.g., mapping `mathematics` to `math`).

## 📄 PDF Engine Updates (`htmlToPdf.ts`)
* **Image Absolute Positioning:** Fixed PDF rendering overlap issues where images lost their absolute coordinates. Removed a hardcoded center-aligned `<div>` wrapper and directly applied scaled `x/y` coordinates to the `pdfMake` image object.
* **Dynamic Sizing Support:** Added parsing support for `minWidth` and `minHeight` on absolute positioned elements to match the newly responsive Layout Tables.
* **Table Cell Width Overflow:** Fixed a critical bug where `width: 100%` was incorrectly applied to `<tr>` and `<td>` elements in the Layout Table. This prevented multi-column tables from exceeding 100% of the page width and breaking out of their cells in the final PDF.
