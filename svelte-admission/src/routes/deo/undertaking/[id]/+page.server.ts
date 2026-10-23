import { redirect, error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { log } from "console";

export const load: PageServerLoad = async ({
  locals: { supabase, getAuthenticatedUser, userProfile },
  params,
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "deo") {
    throw redirect(303, "/login");
  }

  const applicationId = params.id;

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select(
      `
      id,
      status,
      form_type,
      course_id,
      cycle_id,
      form_data,
      student_user:users!applications_student_id_fkey (
        id,
        full_name,
        email,
        student_profiles (
          enrollment_number,
          profile_data
        )
      ),
      courses (
        id,
        name,
        code,
        college_id,
        colleges (
          id,
          name
        )
      ),
      branches (
        id,
        name
      ),
      admission_cycles (
        id,
        name,
        academic_years (
          id,
          name
        )
      ),
      payments (
        id,
        amount,
        status,
        payment_type,
        receipt_number,
        payment_date
      )
    `,
    )
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw error(404, "Application not found");
  }

  const app = application as any;

  const { data: admissionForm } = await supabase
    .from("admission_forms")
    .select("id, prov_fee")
    .eq("course_id", app.course_id)
    .eq("cycle_id", app.cycle_id)
    .eq("form_type", app.form_type)
    .maybeSingle();

  const provPayment = app.payments?.find(
    (p: any) =>
      p.payment_type === "provisional_fee" && p.status === "completed",
  );

  const profileData = app.student_user?.student_profiles?.profile_data || {};
  const formData = app.form_data || {};
// Find student name
  // Find parent name (Father first, then Guardian)



  console.log("Profile Data:", profileData)
  const parentName = 
    profileData.father_name || 
    profileData.father_full_name ||
    formData.father_name || 
    profileData.guardian_name || 
    formData.guardian_name || 
    profileData.fatherName || 
    formData.fatherName || 
    "";

  // Find student phone
  const studentPhone = 
    profileData.student_mobile || 
    profileData.contact_number ||
    formData.student_mobile || 
    profileData.mobile || 
    formData.mobile || 
    profileData.phone || 
    formData.phone || 
    profileData.studentPhone || 
    formData.studentPhone || 
    "";

  // Find parent/father phone
  const parentPhone =
    profileData.father_mobile ||
    profileData.father_contact_number ||
    formData.father_mobile ||
    profileData.father_phone ||
    formData.father_phone ||
    profileData.guardian_mobile ||
    formData.guardian_mobile ||
    profileData.guardian_phone ||
    formData.guardian_phone ||
    profileData.fatherPhone ||
    formData.fatherPhone ||
    "";

  const undertakingData = {
    applicationId: app.id,
    studentName: app.student_user?.full_name || "",
    studentEmail: app.student_user?.email || "",
    enrollmentNumber:
      app.student_user?.student_profiles?.enrollment_number || "",
    courseName: app.courses?.name || "",
    branchName: app.branches?.name || "",
    academicYear: app.admission_cycles?.academic_years?.name || "",
    provisionalFee: admissionForm?.prov_fee || 0,
    collegeName: app.courses?.colleges?.name || "",
    paymentDate: provPayment?.payment_date || "",
    receiptNumber: provPayment?.receipt_number || "",
    parentName,
    studentPhone,
    parentPhone,
    date: new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
  };

  return {
    undertaking: undertakingData,
  };
};
