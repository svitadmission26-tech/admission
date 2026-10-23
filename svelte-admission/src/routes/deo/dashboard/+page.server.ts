import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { applyRoleBasedCollegeFilter } from "$lib/server/security";

export const load: PageServerLoad = async ({
  url,
  locals: { supabase, getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "deo") {
    throw redirect(303, "/login");
  }

  // 1. Setup individual queries
  let draftQuery = supabase
    .from("applications")
    .select("id, courses!inner(college_id)", { count: "exact", head: true })
    .eq("status", "draft");
  draftQuery = applyRoleBasedCollegeFilter(
    draftQuery,
    userProfile,
    "applications",
  );

  let submittedQuery = supabase
    .from("applications")
    .select("id, courses!inner(college_id)", { count: "exact", head: true })
    .eq("status", "submitted");
  submittedQuery = applyRoleBasedCollegeFilter(
    submittedQuery,
    userProfile,
    "applications",
  );

  let verifiedQuery = supabase
    .from("applications")
    .select("id, courses!inner(college_id)", { count: "exact", head: true })
    .eq("status", "verified");
  verifiedQuery = applyRoleBasedCollegeFilter(
    verifiedQuery,
    userProfile,
    "applications",
  );

  // Pagination and Filtering
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const formType = url.searchParams.get("form_type") || "all";
  const offset = (page - 1) * limit;

  // Fetch incomplete applications (draft or needs_correction)
  let incompleteQuery = supabase
    .from("applications")
    .select(
      `
            id,
            status,
            updated_at,
            form_type,
            users!applications_student_id_fkey (id, full_name, email),
            courses!inner (name, college_id),
            branches (name),
            admission_cycles (name)
        `,
      { count: "exact" },
    )
    .in("status", ["draft", "needs_correction"]);

  incompleteQuery = applyRoleBasedCollegeFilter(
    incompleteQuery,
    userProfile,
    "applications",
  );

  if (formType !== "all") {
    incompleteQuery = incompleteQuery.eq("form_type", formType);
  }

  // Fetch recent SUBMITTED/VERIFIED applications to list separately
  let recentQuery = supabase
    .from("applications")
    .select(
      `
            id,
            status,
            updated_at,
            form_type,
            users!applications_student_id_fkey (id, full_name, email),
            courses!inner (name, college_id),
            branches (name),
            admission_cycles (name),
            payments (id, status, payment_type, amount)
        `,
    )
    .in("status", [
      "submitted",
      "verified",
      "approved",
      "rejected",
      "cancelled",
      "waitlisted",
    ]);

  recentQuery = applyRoleBasedCollegeFilter(
    recentQuery,
    userProfile,
    "applications",
  );

  if (formType !== "all") {
    recentQuery = recentQuery.eq("form_type", formType);
  }

  // 2. Fetch all data in parallel
  const [
    draftRes,
    submittedRes,
    verifiedRes,
    formTypesRes,
    incompleteRes,
    recentRes
  ] = await Promise.all([
    draftQuery,
    submittedQuery,
    verifiedQuery,
    supabase.from("form_types").select("name").order("name"),
    incompleteQuery
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1),
    recentQuery
      .order("updated_at", { ascending: false })
      .limit(10)
  ]);

  const { count: draftCount } = draftRes;
  const { count: submittedCount } = submittedRes;
  const { count: verifiedCount } = verifiedRes;
  const { data: formTypes } = formTypesRes;
  const { data: incompleteApplications, count: incompleteCount, error: incompleteError } = incompleteRes;
  const { data: recentApplications, error: recentError } = recentRes;

  if (incompleteError) {
    console.error("Error fetching incomplete apps:", incompleteError);
  }
  if (recentError) {
    console.error("Error fetching recent apps:", recentError);
  }

  return {
    stats: {
      draft: draftCount || 0,
      submitted: submittedCount || 0,
      verified: verifiedCount || 0,
    },
    incompleteApplications: incompleteApplications || [],
    recentApplications: recentApplications || [],
    incompleteCount: incompleteCount || 0,
    formTypes: formTypes || [],
    page,
    limit,
    selectedFormType: formType
  };
};
