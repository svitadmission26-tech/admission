import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { supabase, getSession, userProfile },
}) => {
  const session = await getSession();

  if (!session) {
    throw redirect(303, "/login");
  }

  if (
    userProfile?.role !== "univ_auth" &&
    userProfile?.role !== "university_auth"
  ) {
    throw redirect(303, "/login");
  }

  const universityId = userProfile.university_id;

  if (!universityId) {
    return {
      error: "No university assigned to this user.",
      stats: null,
      collegeStats: [],
    };
  }

  // 1. Fetch Colleges under this University
  const { data: colleges, error: collegesError } = await supabase
    .from("colleges")
    .select("id, name, code")
    .eq("university_id", universityId);

  if (collegesError) {
    console.error("Error fetching colleges:", collegesError.message);
    return { error: "Failed to load colleges" };
  }

  const collegeIds = colleges.map((c) => c.id);

  if (collegeIds.length === 0) {
    return {
      stats: { total: 0, admitted: 0, pending: 0, collegesCount: 0 },
      collegeStats: [],
    };
  }

  // 2. Fetch Courses for these colleges (to get intake capacity and map apps)
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select(
      "id, name, college_id, intake_capacity, branches(id, name, intake_capacity)",
    )
    .in("college_id", collegeIds);

  if (coursesError) {
    console.error("Error fetching courses:", coursesError.message);
  }

  // Calculate Total Capacity per College and Maps
  const collegeCapacity: Record<string, number> = {};
  const courseIds: string[] = [];
  const courseToCollege: Record<string, string> = {};
  const courseMap: Record<string, any> = {};
  const branchMap: Record<string, any> = {};

  courses?.forEach((c) => {
    // College Capacity Logic
    if (!collegeCapacity[c.college_id]) collegeCapacity[c.college_id] = 0;
    let capacity = c.intake_capacity || 0;

    // Branch Logic
    if (c.branches && c.branches.length > 0) {
      const branchCap = c.branches.reduce(
        (sum: number, b: any) => sum + (b.intake_capacity || 0),
        0,
      );
      if (branchCap > 0) capacity = branchCap;

      // Initialize Branch Map
      c.branches.forEach((b: any) => {
        branchMap[b.id] = {
          name: b.name,
          courseName: c.name,
          total: 0,
          admitted: 0,
          pending: 0,
          capacity: b.intake_capacity || 0,
        };
      });
    }

    collegeCapacity[c.college_id] += capacity;
    courseIds.push(c.id);
    courseToCollege[c.id] = c.college_id;

    // Initialize Course Map
    courseMap[c.id] = {
      name: c.name,
      total: 0,
      admitted: 0,
      pending: 0,
      capacity: capacity,
    };
  });

  // 3. Fetch Applications for these courses
  const { data: applications, error: appError } = await supabase
    .from("applications")
    .select("id, status, course_id, branch_id")
    .in("course_id", courseIds);

  if (appError) {
    console.error("Error fetching applications:", appError.message);
  }

  // 4. Aggregate Data

  const overallStats = {
    total: 0,
    admitted: 0,
    pending: 0,
    collegesCount: colleges.length,
  };

  const collegeMap: Record<
    string,
    {
      id: string;
      name: string;
      total: number;
      admitted: number;
      pending: number;
      capacity: number;
    }
  > = {};

  colleges.forEach((c) => {
    collegeMap[c.id] = {
      id: c.id,
      name: c.name,
      total: 0,
      admitted: 0,
      pending: 0,
      capacity: collegeCapacity[c.id] || 0,
    };
  });

  applications?.forEach((app: any) => {
    if (app.status === "draft") return; // Ignore drafts?

    overallStats.total++;

    // College Stats
    const collegeId = courseToCollege[app.course_id];
    if (collegeId && collegeMap[collegeId]) {
      collegeMap[collegeId].total++;

      if (app.status === "approved") {
        overallStats.admitted++;
        collegeMap[collegeId].admitted++;
      } else if (
        ["submitted", "verified", "needs_correction"].includes(app.status)
      ) {
        overallStats.pending++;
        collegeMap[collegeId].pending++;
      }
    }

    // Course Stats
    if (courseMap[app.course_id]) {
      courseMap[app.course_id].total++;
      if (app.status === "approved") {
        courseMap[app.course_id].admitted++;
      } else if (
        ["submitted", "verified", "needs_correction"].includes(app.status)
      ) {
        courseMap[app.course_id].pending++;
      }
    }

    // Branch Stats
    if (app.branch_id && branchMap[app.branch_id]) {
      branchMap[app.branch_id].total++;
      if (app.status === "approved") {
        branchMap[app.branch_id].admitted++;
      } else if (
        ["submitted", "verified", "needs_correction"].includes(app.status)
      ) {
        branchMap[app.branch_id].pending++;
      }
    }
  });

  const collegeStats = Object.values(collegeMap).sort(
    (a: any, b: any) => b.total - a.total,
  );
  const courseStats = Object.values(courseMap).sort(
    (a: any, b: any) => b.total - a.total,
  );
  const branchStats = Object.values(branchMap).sort(
    (a: any, b: any) => b.total - a.total,
  );

  // Compute college-wise course stats
  const collegeCourseStats = colleges.map((college) => {
    const collegeCourses =
      courses?.filter((c) => c.college_id === college.id) || [];
    return {
      collegeId: college.id,
      collegeName: college.name,
      courses: collegeCourses.map((course) => {
        const stats = courseMap[course.id] || { capacity: 0, admitted: 0 };
        return {
          name: course.name,
          capacity: stats.capacity,
          admitted: stats.admitted,
        };
      }),
    };
  });

  // Compute college-wise branch stats (grouped by course)
  const collegeBranchStats = colleges.map((college) => {
    const collegeCourses =
      courses?.filter((c) => c.college_id === college.id) || [];
    
    const coursesWithBranches = collegeCourses.map(course => {
        const branches = course.branches?.map(branch => {
            const stats = branchMap[branch.id] || { capacity: 0, admitted: 0 };
            return {
                name: branch.name,
                capacity: stats.capacity,
                admitted: stats.admitted
            };
        }) || [];
        
        return {
            courseName: course.name,
            branches
        };
    }).filter(c => c.branches.length > 0);

    return {
      collegeId: college.id,
      collegeName: college.name,
      courses: coursesWithBranches
    };
  });

  // Pie chart data for admitted by college
  const admittedByCollegePie = Object.values(collegeMap).map((college) => ({
    name: college.name,
    value: college.admitted,
  }));

  // Pie chart data for admitted by branch
  const admittedByBranchPie = Object.values(branchMap).map((branch) => ({
    name: branch.courseName
      ? `${branch.name} (${branch.courseName})`
      : branch.name,
    value: branch.admitted,
  }));

  return {
    stats: overallStats,
    collegeStats,
    courseStats,
    branchStats,
    collegeCourseStats,
    collegeBranchStats,
    admittedByCollegePie,
    admittedByBranchPie,
  };
};
