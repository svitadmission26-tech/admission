import { redirect, error } from "@sveltejs/kit"; 
import type { PageServerLoad } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({
  url,
  locals: { getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  const paymentId = url.searchParams.get("payment_id");
  if (!paymentId) {
    throw error(400, "Payment ID is required");
  }

  // Use Service Role for robust fetching across roles
  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  // Fetch Payment Details
  const { data: payment, error: fetchError } = await supabaseAdmin
    .from("payments")
    .select(
      `
            *,
            applications (
                id,
                student_id,
                course_id,
                cycle_id,
                form_type,
                student_user:users!applications_student_id_fkey(full_name, email, student_profiles(enrollment_number)),
                courses(name, code, colleges(name, code, logo_url, address, universities(name, logo_url, address, contact_email, website))),
                branches(name, code),
                account_admissions(admission_number),
                admission_cycles(name, academic_years(name)),
                form_types(is_prov)
            )
        `,
    )
    .eq("id", paymentId)
    .single();

  if (fetchError || !payment) {
    console.error("Error fetching receipt:", fetchError?.message);
    throw error(404, "Receipt not found");
  }

  console.log("Receipt Data Debug:", {
    paymentId: payment.id,
    amount: payment.amount,
    appId: payment.applications?.id,
    accAdmissions: payment.applications?.account_admissions,
  });

  let lookupParams = null;
  let debugTrace: string[] = []; // Trace execution

  // Fallback: If payment doesn't have the snapshot (legacy payments), fetch current fee structure
  const breakdown = payment.fee_components_breakdown;
  const isBreakdownEmpty =
    !breakdown || (Array.isArray(breakdown) && breakdown.length === 0);

  if (isBreakdownEmpty && payment.applications) {
    debugTrace.push("Breakdown missing/empty. Attempting fallback.");
    const app = payment.applications;
    debugTrace.push(
      `App Details: Course=${app.course_id}, Cycle=${app.cycle_id}, Type=${app.form_type}`,
    );

    // Need to get academic year id from admission cycle
    const { data: cycle, error: cycleError } = await supabaseAdmin
      .from("admission_cycles")
      .select("academic_year_id")
      .eq("id", app.cycle_id)
      .single();

    if (cycleError) debugTrace.push(`Cycle Error: ${cycleError.message}`);

    if (cycle) {
      lookupParams = {
        course_id: app.course_id,
        academic_year_id: cycle.academic_year_id,
        form_type: app.form_type,
      };
      debugTrace.push(`Found Academic Year: ${cycle.academic_year_id}`);

      const { data: feeStructure, error: fsError } = await supabaseAdmin
        .from("fee_structures")
        .select("fee_components")
        .eq("course_id", app.course_id)
        .eq("academic_year_id", cycle.academic_year_id)
        .eq("form_type", app.form_type)
        .maybeSingle();

      if (fsError) debugTrace.push(`Fee Structure Error: ${fsError.message}`);

      if (feeStructure) {
        debugTrace.push(
          `Found Fee Structure. Components: ${feeStructure.fee_components?.length}`,
        );
        payment.fee_components_breakdown = feeStructure.fee_components;
      } else {
        debugTrace.push("No Fee Structure found matching params.");
      }
    } else {
      debugTrace.push("Cycle not found.");
    }
  } else {
    debugTrace.push("Breakdown exists or App missing. Skipping fallback.");
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
  const isOwnReceipt =
    userProfile?.role === "student" &&
    payment.applications?.student_id === authenticatedUser.id;

  if (!isStaff && !isOwnReceipt) {
    throw error(403, "Unauthorized to view this receipt");
  }

          return {

              payment,

              university: payment.applications?.courses?.colleges?.universities,

              college: payment.applications?.courses?.colleges,

              debugLookup: lookupParams,

              debugTrace, // Pass trace to frontend

          };};
