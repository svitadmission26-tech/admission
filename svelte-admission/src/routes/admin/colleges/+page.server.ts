import { redirect, fail } from "@sveltejs/kit";
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

  const { data: colleges, error: collegesError } = await supabase
    .from("colleges")
    .select("id, university_id, name, code, address, logo_url, universities(name)");
  const { data: universities, error: universitiesError } = await supabase
    .from("universities")
    .select("id, name");

  if (collegesError) {
    console.error("Error fetching colleges:", collegesError.message);
    return { colleges: [], universities: [] };
  }

  return { colleges: colleges || [], universities: universities || [] };
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
    const university_id = formData.get("university_id") as string;
    const name = formData.get("name") as string;
    const code = formData.get("code") as string;
    const address = formData.get("address") as string;
    const logo_url = (formData.get("logo_url") as string) || null;

    const { error } = await supabase.from("colleges").insert({
      university_id,
      name,
      code,
      address,
      logo_url
    });

    if (error) {
      console.error("Error creating college:", error.message);
      return fail(500, { success: false, message: error.message });
    }

    return { success: true, message: "College created successfully!" };
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
    const university_id = formData.get("university_id") as string;
    const name = formData.get("name") as string;
    const code = formData.get("code") as string;
    const address = formData.get("address") as string;
    const logo_url = (formData.get("logo_url") as string) || null;

    const { error } = await supabase
      .from("colleges")
      .update({
        university_id,
        name,
        code,
        address,
        logo_url
      })
      .eq("id", id);

    if (error) {
      console.error("Error updating college:", error.message);
      return fail(500, { success: false, message: error.message });
    }

    return { success: true, message: "College updated successfully!" };
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

    const { error } = await supabase.from("colleges").delete().eq("id", id);

    if (error) {
      console.error("Error deleting college:", error.message);
      return fail(500, { success: false, message: error.message });
    }

    return { success: true, message: "College deleted successfully!" };
  },
};
