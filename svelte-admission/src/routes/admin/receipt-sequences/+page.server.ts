import { redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({
  locals: { supabase, getSession, userProfile },
}) => {
  const session = await getSession();

  if (!session) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "admin") {
    throw redirect(303, "/login");
  }

  const { data: sequences, error: sequencesError } = await supabase
    .from("receipt_sequences")
    .select("*, colleges(name), courses(name), academic_years(name)");

  const { data: colleges, error: collegesError } = await supabase
    .from("colleges")
    .select("id, name");
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, name");
  const { data: academicYears, error: academicYearsError } = await supabase
    .from("academic_years")
    .select("id, name");

  if (sequencesError) {
    console.error("Error fetching receipt sequences:", sequencesError.message);
    return { sequences: [], colleges: [], courses: [], academicYears: [] };
  }
  if (collegesError) {
    console.error("Error fetching colleges:", collegesError.message);
    return {
      sequences: sequences || [],
      colleges: [],
      courses: [],
      academicYears: [],
    };
  }
  if (coursesError) {
    console.error("Error fetching courses:", coursesError.message);
    return {
      sequences: sequences || [],
      colleges: colleges || [],
      courses: [],
      academicYears: [],
    };
  }
  if (academicYearsError) {
    console.error("Error fetching academic years:", academicYearsError.message);
    return {
      sequences: sequences || [],
      colleges: colleges || [],
      courses: courses || [],
      academicYears: [],
    };
  }

  const paymentTypes = [
    { value: "application_fee", label: "Application Fee" },
    { value: "provisional_fee", label: "Provisional Fee" },
    { value: "tuition_fee", label: "Tuition Fee" },
    { value: "seat_reservation_fee", label: "Seat Reservation Fee" },
    { value: "general", label: "General" },
  ];

  return {
    sequences: sequences || [],
    colleges: colleges || [],
    courses: courses || [],
    academicYears: academicYears || [],
    paymentTypes,
    admissionTypes: [
      { value: "Regular", label: "Regular" },
      { value: "D2D", label: "D2D (Diploma to Degree)" },
      { value: "C2D", label: "C2D (Certificate to Degree)" }
    ]
  };
};

export const actions: Actions = {
  create: async ({
    request,
    locals: { supabase, getSession, userProfile },
  }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== "admin") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const college_id = formData.get("college_id") as string;
    const course_id = formData.get("course_id") as string;
    const academic_year_id = formData.get("academic_year_id") as string;
    const payment_type = formData.get("payment_type") as string;
    const admission_type = formData.get("admission_type") as string || 'Regular';
    const prefix = formData.get("prefix") as string;
    const current_sequence =
      parseInt(formData.get("current_sequence") as string) || 0;

    const resolved_admission_type = (payment_type === 'tuition_fee')
        ? admission_type
        : 'Regular';

    const { error } = await supabase.from("receipt_sequences").insert({
      college_id,
      course_id,
      academic_year_id,
      payment_type,
      admission_type: resolved_admission_type,
      prefix,
      current_sequence,
    });

    if (error) {
      console.error("Error creating receipt sequence:", error.message);
      return { success: false, message: error.message };
    }

    return { success: true, message: "Receipt sequence created successfully!" };
  },

  update: async ({
    request,
    locals: { supabase, getSession, userProfile },
  }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== "admin") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const id = formData.get("id") as string;
    const prefix = formData.get("prefix") as string;
    const current_sequence =
      parseInt(formData.get("current_sequence") as string) || 0;

    const { error } = await supabase
      .from("receipt_sequences")
      .update({
        prefix,
        current_sequence,
      })
      .eq("id", id);

    if (error) {
      console.error("Error updating receipt sequence:", error.message);
      return { success: false, message: error.message };
    }

    return { success: true, message: "Receipt sequence updated successfully!" };
  },

  reset: async ({ request, locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== "admin") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const id = formData.get("id") as string;

    const { error } = await supabase
      .from("receipt_sequences")
      .update({
        current_sequence: 0,
      })
      .eq("id", id);

    if (error) {
      console.error("Error resetting receipt sequence:", error.message);
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: "Receipt sequence reset to 0 successfully!",
    };
  },

  delete: async ({
    request,
    locals: { supabase, getSession, userProfile },
  }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== "admin") {
      throw redirect(303, "/login");
    }

    const formData = await request.formData();
    const id = formData.get("id") as string;

    const { error } = await supabase
      .from("receipt_sequences")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting receipt sequence:", error.message);
      return { success: false, message: error.message };
    }

    return { success: true, message: "Receipt sequence deleted successfully!" };
  },
};
