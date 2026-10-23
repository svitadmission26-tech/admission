import { redirect, error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({
  params,
  locals: { getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  const applicationId = params.id;
  if (!applicationId) {
    throw error(400, "Application ID is required");
  }

  // Use Service Role for robust fetching across roles
  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  // Fetch Application Details for Admission Slip
  const { data: application, error: fetchError } = await supabaseAdmin
    .from("applications")
    .select(
      `
            id,
            student_id,
            course_id,
            cycle_id,
            form_type,
            admission_type,
            status,
            student_user:users!applications_student_id_fkey(full_name, email, student_profiles(enrollment_number)),
            courses(id, name, code, colleges(id, name, code, logo_url, address, universities(name, logo_url, address, contact_email, website))),
            branches(id, name, code),
            account_admissions(admission_number),
            admission_cycles(name, academic_years(name)),
            form_types(name, code, is_prov)
        `,
    )
    .eq("id", applicationId)
    .single();

  if (fetchError || !application) {
    console.error("Error fetching admission slip data:", fetchError?.message);
    throw error(404, "Application not found");
  }

  // Access Control
  const allowedRoles = [
    "admin",
    "fee_collector",
    "university_auth",
    "univ_auth",
    "college_auth",
    "adm_officer",
    "deo",
  ];
  const isStaff = allowedRoles.includes(userProfile?.role || "");
  const isOwnApplication =
    userProfile?.role === "student" &&
    application.student_id === authenticatedUser.id;

  if (!isStaff && !isOwnApplication) {
    throw error(403, "Unauthorized to view this admission slip");
  }

  return {
    application,
    university: application.courses?.colleges?.universities,
    college: application.courses?.colleges,
  };
};
