# Changelog: Branch Auto-Assignment & Payment Security Enhancements

**Date:** 2026-06-02

## Overview
This update improves the application workflow by automatically carrying over branch selections for multi-category applications and enhances payment integrity by restricting manual overrides for DEO roles.

## Changes Implemented

### 1. Branch Auto-Assignment Logic
*   **Automatic Inheritance**: Implemented backend logic in both Student and DEO application servers (`src/routes/student/apply/+page.server.ts` and `src/routes/deo/apply/+page.server.ts`) to automatically assign a `branch_id` if:
    1.  The incoming application has no `branch_id` selected.
    2.  The form's schema has `enableBranchSelection` set to `false` (standard for Vacant/MQ-NRI quotas).
*   **Contextual Matching**: The system searches for the most recently updated application by the same student for the **same course** that contains a valid branch selection and inherits it.

### 2. Staff Visibility Enhancements
*   **Admission Officer Details**: Added branch display to the "Course & Status" card in the application details view.
*   **College Authority View**: 
    *   Updated the server-side load function to fetch branch names and codes.
    *   Modified the application list and details view to display the branch alongside the course.
*   **University Authority View**:
    *   Updated the server-side load function to fetch branch metadata.
    *   Enhanced the application details modal to clearly show the Course and Branch information.

### 3. Payment Security & Integrity
*   **Restricted DEO Manual Overrides**: Disabled the "Record Offline Payment" button in the DEO application submission modal (`src/routes/deo/apply/+page.svelte`).
*   **Gateway Enforcement**: This change ensures that all applications processed by DEOs must use the integrated PayU online gateway, maintaining a secure and auditable financial trail.

## Files Modified
*   `src/routes/student/apply/+page.server.ts`
*   `src/routes/deo/apply/+page.server.ts`
*   `src/routes/deo/apply/+page.svelte`
*   `src/routes/adm-officer/applications/[id]/+page.svelte`
*   `src/routes/college-auth/applications/+page.server.ts`
*   `src/routes/college-auth/applications/+page.svelte`
*   `src/routes/university-auth/applications/+page.server.ts`
*   `src/routes/university-auth/applications/+page.svelte`
