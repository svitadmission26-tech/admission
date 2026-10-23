# Data Autofill & Redundancy Management Plan (Dynamic Profile)

This document outlines the strategy to enable auto-filling of student data using a **Dynamic Student Profile**, definable by Admins and integrated into the Form Builder.

## 1. Core Concept: Dynamic Centralized Profile

Instead of a fixed schema, the Student Profile will be dynamic, stored as JSON, and its structure defined by Admins. This allows the university to adapt what "common data" means over time (e.g., adding "ABC ID" later).

### **Database Schema**

#### **1. `student_profile_fields` (Definition)**
Defines the "Template" for the student profile. Admins manage this list.
| Column Name | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | |
| `key` | TEXT | Unique key (e.g., `dob`, `father_name`) |
| `label` | TEXT | Display label (e.g., "Date of Birth") |
| `type` | TEXT | Input type (text, date, number, select) |
| `options` | JSONB | Options for select types |
| `is_required` | BOOL | |

#### **2. `student_profiles` (Data)**
Stores the actual data for each student.
| Column Name | Type | Description |
| :--- | :--- | :--- |
| `user_id` | UUID (PK) | References `users.id` |
| `enrollment_number` | TEXT | Unique University/College Enrollment ID |
| `profile_data` | JSONB | Key-value pairs matching `student_profile_fields` keys |
| `admission_status` | TEXT | Overall status: 'Applicant', 'Admitted', 'Cancelled', 'Alumni' |
| `active_application_id` | UUID | Reference to the currently approved application (if any) |
| `updated_at` | TIMESTAMP | |

## 2. Admin Workflows

### **A. Defining the Profile Schema (`/admin/profile-schema`)**
*   **UI**: A builder interface similar to the Form Builder.
*   **Action**: Admin adds fields like "Date of Birth", "Category", "Aadhar No".
*   **Result**: Saves definitions to `student_profile_fields`.

### **B. Building Admission Forms (Integration)**
*   **UI Update**: In the existing **Form Builder** (`/admin/forms/[id]`), adding a field now offers two modes:
    1.  **Custom Field**: Define a new field specific to this form (e.g., "Why do you want to join?").
    2.  **Profile Field**: Select from a dropdown of existing `student_profile_fields`.
*   **Mapping**: When a "Profile Field" is selected, the Form Builder automatically uses the `key` from the profile schema. This guarantees 100% mapping accuracy without complex heuristics.

## 3. Student Workflows

### **A. "My Profile" Page (`/student/profile`)**
*   Students can view and edit their central profile data directly, independent of any specific application.
*   This data acts as the "Master Record".

### **B. Applying for a Course (Auto-Fill)**
1.  **Initialization**: When the form loads, the system checks `student_profiles.profile_data`.
2.  **Hydration**: Any field in the form that matches a key in the profile is pre-filled.
3.  **Synchronization**: When the form is submitted:
    *   The application data is saved to `applications`.
    *   **Crucially**, any changes to "Profile Fields" within this form are **synced back** to `student_profiles`, keeping the master record up-to-date.

## 4. Enrollment & Status Management

*   **Enrollment Number**:
    *   Moved/Linked to `student_profiles`.
    *   Generated upon "Approval" of an application (as per existing logic).
    *   Stored here to provide a quick lookup for the student's official ID.

*   **Admission Status**:
    *   **'Applicant'**: Default state.
    *   **'Admitted'**: Set automatically when an application status becomes `approved`. The `active_application_id` links to that specific course.
    *   **'Cancelled'**: Set if the Admission Officer performs the "Cancel Admission" action.
    *   **'Transferred'**: Updated if `transferStudent` action occurs.

## 5. Implementation Roadmap

1.  **Database**:
    *   Create tables `student_profile_fields` and `student_profiles`.
    *   Migrate existing `users.enrollment_number` to `student_profiles`.

2.  **Admin UI**:
    *   Create `src/routes/admin/profile-schema` page.
    *   Update `FormBuilder.svelte` component to support "Select Profile Field".

3.  **Backend Logic**:
    *   Update `student/apply/+page.server.ts` to merge profile data.
    *   Update `approveApplicationLogic` to update `student_profiles.admission_status` and `enrollment_number`.

4.  **Student UI**:
    *   Create `src/routes/student/profile` page.