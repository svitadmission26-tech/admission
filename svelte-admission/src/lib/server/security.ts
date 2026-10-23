
/**
 * Applies college filtering to a Supabase query based on the user's role and assignment.
 * 
 * Logic:
 * 1. Admin & Adm Officer: ALWAYS Global Access (Bypass filtering regardless of college_id).
 * 2. DEO & Fee Collector: 
 *    - If college_id is set -> Restricted to that college.
 *    - If college_id is null -> Global Access.
 * 
 * @param query The Supabase query builder object
 * @param userProfile The user's profile object (must contain role and college_id)
 * @param entityType The type of entity being queried to determine the join path
 */
export function applyRoleBasedCollegeFilter(query: any, userProfile: any, entityType: 'applications' | 'payments' | 'courses' | 'admissions' | 'fee_structures' | 'circulars') {
    // 1. Global Access Roles
    if (['admin', 'adm_officer'].includes(userProfile.role)) {
        return query; 
    }

    // 2. Conditional Filtering for Restricted Roles
    if (userProfile.college_id) {
        const cid = userProfile.college_id;
        
        switch (entityType) {
            case 'applications':
                // applications -> courses -> college_id
                // Note: The query MUST have .select('..., courses!inner(college_id)') for this to work efficiently
                // If using simple join syntax 'courses(college_id)', filtering on it works in PostgREST
                return query.eq('courses.college_id', cid);
            
            case 'payments':
                // payments -> applications -> courses -> college_id
                return query.eq('applications.courses.college_id', cid);

            case 'courses':
                // courses -> college_id
                return query.eq('college_id', cid);

            case 'admissions': // account_admissions
                 // account_admissions -> applications -> courses -> college_id
                return query.eq('applications.courses.college_id', cid);
                
            case 'fee_structures':
                 return query.eq('courses.college_id', cid); // Join path 'courses' must be included in .select()
            
            case 'circulars':
                // circulars -> course_id -> college_id OR college_id column if exists
                // Assuming circulars might be linked to course OR directly to college.
                // If linked to course:
                return query.eq('courses.college_id', cid);
        }
    }

    // 3. Global Access (No college_id set for DEO/Fee Collector)
    return query;
}
