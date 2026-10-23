import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({
  url,
  locals: { supabase, getAuthenticatedUser, userProfile },
}) => {
  const authenticatedUser = await getAuthenticatedUser();
  if (!authenticatedUser || userProfile?.role !== "admin") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const course_id = url.searchParams.get("course_id");
  const cycle_id = url.searchParams.get("cycle_id");
  const form_type = url.searchParams.get("form_type");

  if (!course_id || !cycle_id) {
    return json({ error: "Missing parameters" }, { status: 400 });
  }

  let query = supabase
    .from("admission_forms")
    .select("id, form_fee, prov_fee, is_enabled, qr_code_url, schema_json")
    .eq("course_id", course_id)
    .eq("cycle_id", cycle_id);

  if (form_type) {
    query = query.eq("form_type", form_type);
  }

  const { data: form, error } = await query.maybeSingle();

  if (error) {
    console.error("Error fetching form schema:", error);
    return json({ error: "Database error" }, { status: 500 });
  }

  if (form) {
    return json({ form });
  } else {
    return json({ form: null });
  }
};
