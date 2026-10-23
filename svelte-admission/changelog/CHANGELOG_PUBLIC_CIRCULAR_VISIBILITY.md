# Changelog: Public Circulars & Visibility System 
**Date:** 2026-05-12 (v3)

## Summary of Changes
This update introduces the ability for Admission Officers to publish "Public" circulars that are visible to guest users on the main landing page without requiring a login.

### 1. Database & Security
*   **SQL Migration (`new_database/circular.sql`):** 
    *   Added `is_public` column to the `circulars` table to track landing page visibility.
    *   Added `college_id` to allow for multi-college circular management in the future.
    *   Implemented RLS policies that allow anonymous (guest) users to read only active, public circulars.

### 2. Admission Officer Dashboard (`/adm-officer/circulars`)
*   **Edit Circular:** Implemented full edit functionality. Officers can now update circular titles, descriptions, target courses, visibility, and replace existing attachments.
*   **Public Visibility Toggle:** Added a "Show on Main Page (Public)" checkbox to the circular creation and edit modals.
*   **Status Management:** 
    *   Added a "Public" status column to the circulars list.
    *   Admission Officers can now toggle between "Public" and "Internal" visibility with a single click.
*   **Persistence:** Updated server actions to handle the new visibility field during creation and updates.

### 3. Public Landing Page (`/`)
*   **Latest Notices Section:** Implemented a new "Latest Circulars & Notices" section on the main landing page.
*   **Guest Access:** Guest users can now see the top 5 latest public notices.
*   **Secure File Access:** Implemented long-lived signed URLs (24 hours) to ensure guests can view/download attachments securely from Supabase Storage.

## Impact
This feature improves institutional communication by allowing key announcements (e.g., fee schedules, admission dates) to be shared with prospective students and the general public instantly, without requiring them to create an account or log in.
