# University Admission System - Implementation Plan 

## Overview
This document outlines the step-by-step implementation strategy for the University Admission System using **SvelteKit + Supabase** with **Bootstrap** styling. The design prioritizes flexibility to accommodate changing academic rules, dynamic forms, and multi-tenant requirements.

---

## Phase 1: Foundation & Infrastructure
**Goal:** Establish a secure, scalable base application.

1.  **Project Initialization**
    *   Scaffold SvelteKit project (TypeScript).
    *   Integrate Bootstrap (CSS framework).
    *   Configure Supabase Client.
    *   Set up Global Stores (User state, Theme, Alerts).

2.  **Authentication & Security**
    *   Implement Login / Register pages.
    *   **Role-Based Access Control (RBAC):**
        *   Implement High-Order Component (HOC) or Layout wrappers to protect routes.
        *   Define roles: `student`, `deo`, `college_auth`, `university_auth`, `adm_officer`, `fee_collector`, `admin`.

3.  **Layout System**
    *   Create a **Dynamic Layout** that renders different sidebars/navbars based on the user's role.
    *   Ensure mobile responsiveness.

---

## Phase 2: Administrative Module (The "Admin" Flow)
**Goal:** Enable configuration of the system's core data and rules.

1.  **Master Data Management (CRUD)**
    *   Universities, Colleges, and Courses management.
    *   **Academic Calendar:** Manage Academic Years & Admission Cycles (e.g., "Fall 2026").
    *   **Admission Sequences:** Configure sequence prefixes (e.g., `ADM-2026-CS-`) per college/course for tracking final admissions.

2.  **Dynamic Configuration Engines**
    *   **Form Builder:** A visual or JSON-based editor to define `schema_json` for application forms. This allows changing application questions without code changes.
    *   **Fee Structure Manager:** Define fees per course/year.
    *   **Merit Formula Config:** Define weightage rules (e.g., `HSC * 0.6 + Entrance * 0.4`) stored as JSON.

---

## Phase 3: Student Application Module
**Goal:** Provide a seamless application experience.

1.  **Student Dashboard**
    *   View available courses for the active cycle.
    *   Track application status.
    *   **Notifications:** View system alerts (e.g., "Document Rejected").

2.  **Application Engine**
    *   **Dynamic Form Renderer:** A generic component that takes `schema_json` and renders HTML inputs.
    *   **Document Upload (Centralized):**
        *   Upload interface linking to the `documents` table.
        *   Support for multiple document types (Photos, Marksheets, IDs) per form/college.
    *   **Marks Entry:** Structured input for academic history.
    *   **Validation:** Client-side validation based on the schema.
    *   **Re-upload Workflow:** Dedicated UI for students to view rejected documents and upload replacements.

---

## Phase 4: Processing & Verification
**Goal:** Streamline the workflow for staff.

1.  **Data Entry Operator (DEO) Mode**
    *   "Apply on Behalf" feature for offline students.

2.  **College Authority / Verifier Workflow**
    *   **Application Inbox:** Filterable list of `submitted` apps.
    *   **Verification Interface:**
        *   Split-screen view (Data vs. Document) for rapid verification.
        *   **Document-Level Actions:** `Approve` or `Reject` individual documents.
        *   **Rejection Reason:** If a document is rejected, a reason (e.g., "Blurry", "Wrong Year") must be provided.
    *   **Notification Trigger:** Rejecting a document triggers an email/SMS + Dashboard notification to the student requesting a re-upload.
    *   **Application Status:** If any document is rejected, application status moves to `needs_correction`.

3.  **University Authority Workflow**
    *   Final approval queue.
    *   Bulk actions for approving verified applicants.

---

## Phase 5: Merit & Selection
**Goal:** Automate fair selection.

1.  **Merit Calculation Engine**
    *   Implement Edge Functions or Postgres Functions to calculate scores based on `merit_formulas`.
    *   **Trigger:** Auto-recalculate when marks change or explicitly triggered by Admin.

2.  **Rank List Generation**
    *   Generate lists based on quotas and scores.
    *   Publish Merit Lists to the public/student dashboard.

---

## Phase 6: Admission Finalization & Accounts
**Goal:** Secure financial transaction management and final admission tracking.

1.  **Admission Generation**
    *   **Sequence Number:** Auto-generate unique admission numbers (e.g., `ADM-2026-CS-001`) upon final approval/fee payment using the `admission_sequences` table.

2.  **Student Payments**
    *   Payment Gateway integration (mock or real).
    *   Payment history and receipt download.

3.  **Fee Collector / Accounts Dashboard**
    *   **Account Admissions View:** Read from `account_admissions` table.
    *   View Student Name, Admission Number, and Payment Status (`pending`, `cleared`).
    *   **Action:** Mark payments as `cleared` after verifying bank records.
    *   Fee reconciliation reports.

---

## Phase 7: Analytics & Reporting
**Goal:** Data-driven insights.

1.  **Admission Officer Dashboard**
    *   Real-time counters (Applications Draft vs Submitted vs Approved).
    *   Demographic charts.
    *   Export data to CSV/Excel.

---

## Architectural Flexibility Strategy
To ensure the system adapts easily to new requirements:

1.  **Data-Driven UI (Server-Driven UI):**
    *   **Forms:** The application forms are not hardcoded. They are generated from the `admission_forms` table. Adding a new field (e.g., "Blood Group") is a database update, not a code deploy.
    *   **Menu Items:** Navigation links can be fetched from a config table based on user role.

2.  **Logic stored as Data:**
    *   **Merit Rules:** Formulas are stored as JSON. If the government changes the weightage, admins update the rule in the UI. No backend logic change required.
    *   **Fee Structure:** Installment plans are stored as JSON configurations.

3.  **Modular Svelte Components:**
    *   Create "Atomic" components (Button, Input, Card) wrapped in Bootstrap classes. If the UI library changes, we only update these base components.

4.  **Supabase RLS as the Source of Truth:**
    *   Security logic resides in the Database (Row Level Security). Even if the frontend exposes a button by mistake, the database will reject the unauthorized action.

5.  **Type Safety:**
    *   Strict TypeScript interfaces generated from the Database Schema to ensure reliable refactoring.