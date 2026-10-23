import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";

export const load: PageServerLoad = async ({
  params,
  locals: { supabase, getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();

  if (!authenticatedUser) {
    throw redirect(303, "/login");
  }

  if (userProfile?.role !== "admin") {
    throw redirect(303, "/login");
  }

  const { id } = params;

  // Fetch the form to edit
  const { data: form, error: formError } = await supabase
    .from("admission_forms")
    .select("*")
    .eq("id", id)
    .single();

  if (formError || !form) {
    console.error("Error fetching admission form:", formError?.message);
    throw redirect(303, "/admin/forms");
  }

  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, name");
  const { data: admissionCycles, error: cyclesError } = await supabase
    .from("admission_cycles")
    .select("id, name, academic_years(name)");
  const { data: formTypes, error: formTypesError } = await supabase
    .from("form_types")
    .select("name, is_prov, application_fee_required")
    .eq("is_active", true)
    .order("name");

  if (coursesError)
    console.error("Error fetching courses:", coursesError.message);
  if (cyclesError)
    console.error("Error fetching admission cycles:", cyclesError.message);
  if (formTypesError)
    console.error("Error fetching form types:", formTypesError.message);

  // Fetch Student Profile Fields using Service Role to bypass RLS
  const supabaseAdmin = createClient(
    PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );
  const { data: studentProfileFields, error: profileFieldsError } =
    await supabaseAdmin
      .from("student_profile_fields")
      .select("*")
      .order("label");

  if (profileFieldsError) {
    console.error(
      "Error fetching student profile fields:",
      profileFieldsError.message,
    );
  }

  return {
    admissionForm: form,
    courses: courses || [],
    admissionCycles: admissionCycles || [],
    formTypes: formTypes || [],
    studentProfileFields: studentProfileFields || [],
  };
};

export const actions: Actions = {
  default: async ({
    request,
    params,
    locals: { supabase, getAuthenticatedUser, userProfile },
  }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || userProfile?.role !== "admin") {
      throw redirect(303, "/login");
    }

    const { id } = params;
    const formData = await request.formData();
    const course_id = formData.get("course_id") as string;
    const cycle_id = formData.get("cycle_id") as string;
    const form_type = formData.get("form_type") as string;
    const form_fee = parseFloat(formData.get("form_fee") as string) || 0;
    const prov_fee = parseFloat(formData.get("prov_fee") as string) || 0;
    const qr_code_url = (formData.get("qr_code_url") as string) || null;
    const schema_json_str = formData.get("schema_json") as string;
    const is_enabled = formData.get("is_enabled") === "on";

    let schema_json;
    try {
      schema_json = JSON.parse(schema_json_str);
    } catch (e) {
      return fail(400, { message: "Invalid schema JSON", error: true });
    }

    const { error } = await supabase
      .from("admission_forms")
      .update({
        course_id,
        cycle_id,
        form_type,
        form_fee,
        prov_fee,
        qr_code_url,
        schema_json,
        is_enabled,
      })
      .eq("id", id);

    if (error) {
      console.error("Error updating admission form:", error.message);
      return fail(500, { success: false, message: error.message });
    }

    throw redirect(303, "/admin/forms");
  },
};
