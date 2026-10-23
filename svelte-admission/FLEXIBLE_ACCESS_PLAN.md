# Plan: Flexible & Role-Specific Access Control 

## Objective
1.  **DEO & Fee Collector**: Support **Flexible Access**.
    *   If assigned to a College (`college_id` is set): Restricted to that college's data.
    *   If NOT assigned (`college_id` is NULL): Global access (all colleges).
2.  **Admission Officer**: Support **Global Access Always**.
    *   Even if a `college_id` is historically set on the user record, the system must ignore it and show data from **ALL** colleges.

---

## 1. Logic Implementation Strategy

### **A. Centralized Query Filter Helper (`src/lib/server/security.ts`)**
Create a helper function `applyRoleBasedCollegeFilter` to standardize this logic and prevent inconsistencies across different pages.

**Logic:**
```typescript
function applyRoleBasedCollegeFilter(query, userProfile, entityType) {
    // 1. Adm Officer & Admin: ALWAYS Global (Bypass filtering)
    if (['admin', 'adm_officer'].includes(userProfile.role)) {
        return query; 
    }

    // 2. DEO & Fee Collector: Conditional Filtering
    // If they have a college_id, apply the filter. If null, they are Global.
    if (userProfile.college_id) {
        const cid = userProfile.college_id;
        
        switch (entityType) {
            case 'applications':
                // Requires join: .select('*, courses!inner(college_id)')
                return query.eq('courses.college_id', cid);
            case 'payments':
                // Requires join: .select('*, applications!inner(course_id, courses!inner(college_id))')
                return query.eq('applications.courses.college_id', cid);
            case 'courses':
                return query.eq('college_id', cid);
            case 'admissions': // account_admissions
                return query.eq('applications.courses.college_id', cid);
            // ... handle other entities
        }
    }

    // 3. Global Access (No college_id set for DEO/Fee Collector)
    return query;
}
```

---

## 2. Refactoring Target Areas

### **A. Admission Officer Routes (`adm-officer/*`)**
*   **Audit**: Check `dashboard/+page.server.ts` and `applications/+page.server.ts`.
*   **Fix**: Remove any existing manual checks like `if (userProfile.college_id) query.eq(...)`. Replace with the new helper (which will explicitly skip filtering for this role), or simply remove the filter logic entirely if the helper isn't used there.

### **B. DEO Routes (`deo/*`)**
*   **Dashboard & Applications List**:
    *   Update `load` queries to use `applyRoleBasedCollegeFilter`.
    *   Ensure the `.select()` statement includes the necessary joins (`courses!inner`) for the filter to work.
*   **Application Entry (`deo/apply`)**:
    *   **Dropdowns**: Filter the `courses` list based on `college_id` (if set).
    *   **Action Validation**: In `saveApplication` / `createStudent`, verify that the submitted `course_id` belongs to the user's assigned college.

### **C. Fee Collector Routes (`fee-collector/*`)**
*   **Dashboard**: Filter `account_admissions` list using the helper.
*   **Payments List**: Filter `payments` query using the helper.
*   **Record Payment**: Filter the "Select Student" dropdown. Validate that the target application belongs to the user's college before processing.

---

## 3. Admin UI (User Management)
*   **Update**: In `/admin/users`, ensure the "College" dropdown allows "No College (Global)" selection for `deo` and `fee_collector` roles.
*   **Cleanup**: Optionally, offer a migration/button to "Clear College ID" for all existing Admission Officers to clean up the database state.

---

## 4. Implementation Roadmap

1.  **Create Helper**: `src/lib/server/security.ts`.
2.  **Fix Adm Officer**: Remove restrictive filters from `adm-officer` pages immediately.
3.  **Update DEO**: Refactor `deo/dashboard` and `deo/applications` to use the helper.
4.  **Update Fee Collector**: Refactor `fee-collector/payments` and `dashboard` to use the helper.
5.  **Verify**: Test with:
    *   Restricted DEO (sees 1 college).
    *   Global DEO (sees all).
    *   Adm Officer (sees all).
