export interface MenuItem {
  title: string;
  href: string;
  icon: string;
  exact?: boolean; // If true, only matches exact path. Default false (matches prefix).
}

export interface RoleNavigation {
  title: string; // The header title (e.g., "Admin Dashboard")
  items: MenuItem[];
}

export const NAVIGATION_CONFIG: Record<string, RoleNavigation> = {
  admin: {
    title: "Admin Dashboard",
    items: [
      {
        title: "Dashboard",
        href: "/admin/dashboard",
        icon: "bi-speedometer2",
        exact: true,
      },
      { title: "Manage Users", href: "/admin/users", icon: "bi-people" },
      { title: "Universities", href: "/admin/universities", icon: "bi-bank" },
      { title: "Colleges", href: "/admin/colleges", icon: "bi-building" },
      { title: "Courses", href: "/admin/courses", icon: "bi-book" },
      { title: "Branches", href: "/admin/branches", icon: "bi-diagram-3" },
      { title: "New Student Admissions", href: "/admin/new-student-admissions", icon: "bi-person-plus" },
      {
        title: "Academic Calendar",
        href: "/admin/academic-calendar",
        icon: "bi-calendar-event",
      },
      {
        title: "Admission Sequences",
        href: "/admin/admission-sequences",
        icon: "bi-123",
      },
      {
        title: "Receipt Sequences",
        href: "/admin/receipt-sequences",
        icon: "bi-receipt",
      },
      { title: "Form Types", href: "/admin/form-types", icon: "bi-tags" },
      {
        title: "Student Profile Schema",
        href: "/admin/profile-schema",
        icon: "bi-person-lines-fill",
      },
      {
        title: "Dynamic Forms",
        href: "/admin/forms",
        icon: "bi-file-earmark-text",
      },
      {
        title: "Fee Structures",
        href: "/admin/fee-structures",
        icon: "bi-cash-coin",
      },
      {
        title: "Fee Schemes",
        href: "/admin/fee-schemes",
        icon: "bi-patch-check",
      },
      {
        title: "Payment Gateways",
        href: "/admin/payment-gateways",
        icon: "bi-credit-card",
      },
      {
        title: "Merit Formulas",
        href: "/admin/merit-formulas",
        icon: "bi-calculator",
      },
      {
        title: "Calculate Merit",
        href: "/admin/merit-calculation",
        icon: "bi-lightning",
      },
      {
        title: "Inquiry Forms",
        href: "/admin/inquiry-forms",
        icon: "bi-question-square",
      },
      {
        title: "Report Builder",
        href: "/admin/report-builder",
        icon: "bi-tools",
      },
      { title: "Documentation", href: "/admin/docs", icon: "bi-book-half" },
      {
        title: "Config Guide",
        href: "/admin/config-guide",
        icon: "bi-gear-wide-connected",
      },
      {
        title: "Bus Seva QR Config",
        href: "/admin/busseva",
        icon: "bi-qr-code",
      },
    ],
  },
  adm_officer: {
    title: "Admission Office",
    items: [
      {
        title: "Dashboard",
        href: "/adm-officer/dashboard",
        icon: "bi-speedometer2",
        exact: true,
      },
      {
        title: "Applications",
        href: "/adm-officer/applications",
        icon: "bi-file-earmark-text",
      },
      {
        title: "Bulk Verify",
        href: "/adm-officer/verification/bulk",
        icon: "bi-grid-3x3-gap",
      },
      {
        title: "Merit List",
        href: "/adm-officer/merit-list",
        icon: "bi-list-ol",
      },
      {
        title: "Public Inquiries",
        href: "/adm-officer/inquiries",
        icon: "bi-chat-left-dots",
      },
      {
        title: "Reports (Custom)",
        href: "/adm-officer/reports",
        icon: "bi-bar-chart",
        exact: true,
      },
      {
        title: "Capacity Report",
        href: "/adm-officer/capacity-report",
        icon: "bi-bar-chart-line",
      },
      {
        title: "Admission Report",
        href: "/adm-officer/admission-report",
        icon: "bi-file-earmark-person-fill",
      },
      {
        title: "Saved Reports",
        href: "/adm-officer/saved-reports",
        icon: "bi-file-earmark-spreadsheet",
      },
      {
        title: "Circulars & Notices",
        href: "/adm-officer/circulars",
        icon: "bi-megaphone",
      },
    ],
  },
  deo: {
    title: "DEO Dashboard",
    items: [
      {
        title: "Dashboard",
        href: "/deo/dashboard",
        icon: "bi-speedometer2",
        exact: true,
      },
      {
        title: "New Application",
        href: "/deo/apply",
        icon: "bi-plus-circle",
        exact: true,
      },
      {
        title: "Applications",
        href: "/deo/applications",
        icon: "bi-file-earmark-text",
      },
      {
        title: "Bulk Verify",
        href: "/deo/verification/bulk",
        icon: "bi-grid-3x3-gap",
      },
      {
        title: "Saved Reports",
        href: "/deo/saved-reports",
        icon: "bi-file-earmark-spreadsheet",
      },
      { title: "Help", href: "/deo/help", icon: "bi-question-circle" },
      {
        title: "Bus Seva Fees",
        href: "/busseva",
        icon: "bi-bus-front",
      },
    ],
  },
  fee_collector: {
    title: "Fee Collector",
    items: [
      {
        title: "Dashboard",
        href: "/fee-collector/dashboard",
        icon: "bi-speedometer2",
        exact: true,
      },
      {
        title: "Payments",
        href: "/fee-collector/payments",
        icon: "bi-cash-coin",
      },
      {
        title: "Reports",
        href: "/fee-collector/reports",
        icon: "bi-bar-chart",
      },
      {
        title: "Saved Reports",
        href: "/fee-collector/saved-reports",
        icon: "bi-file-earmark-spreadsheet",
      },
      {
        title: "Help",
        href: "/fee-collector/help",
        icon: "bi-question-circle",
      },
      {
        title: "Bus Seva Fees",
        href: "/busseva",
        icon: "bi-bus-front",
      },
    ],
  },
  student: {
    title: "Student Dashboard",
    items: [
      {
        title: "Dashboard",
        href: "/student",
        icon: "bi-speedometer2",
        exact: true,
      },
      {
        title: "My Profile",
        href: "/student/profile",
        icon: "bi-person-badge",
        exact: true,
      },
      {
        title: "Apply Now",
        href: "/student/apply",
        icon: "bi-pencil-square",
        exact: true,
      },
      {
        title: "My Documents",
        href: "/student/documents",
        icon: "bi-file-earmark-text",
      },
      {
        title: "Fees & Payments",
        href: "/student/payments",
        icon: "bi-credit-card",
      },
      { title: "Help", href: "/student/help", icon: "bi-question-circle" },
      { title: "Support", href: "/student/support", icon: "bi-life-preserver" },
    ],
  },
  college_auth: {
    title: "College Admin",
    items: [
      {
        title: "Dashboard",
        href: "/college-auth/dashboard",
        icon: "bi-speedometer2",
        exact: true,
      },
      {
        title: "Applications",
        href: "/college-auth/applications",
        icon: "bi-file-earmark-text",
      },
      {
        title: "Reports",
        href: "/college-auth/reports",
        icon: "bi-file-bar-graph",
      },
      { title: "Circulars", href: "/college-auth/circulars", icon: "bi-bell" },
      { title: "Help", href: "/college-auth/help", icon: "bi-question-circle" },
    ],
  },
  university_auth: {
    // Handle potential role alias 'univ_auth' in layout logic if needed, or duplicate key here
    title: "University Admin",
    items: [
      {
        title: "Dashboard",
        href: "/university-auth/dashboard",
        icon: "bi-speedometer2",
        exact: true,
      },
      {
        title: "Applications",
        href: "/university-auth/applications",
        icon: "bi-file-earmark-text",
      },
      {
        title: "Circulars",
        href: "/university-auth/circulars",
        icon: "bi-megaphone",
      },
      {
        title: "Reports",
        href: "/university-auth/reports",
        icon: "bi-file-bar-graph",
      },
      {
        title: "Help",
        href: "/university-auth/help",
        icon: "bi-question-circle",
      },
    ],
  },
  univ_auth: {
    // Alias for university_auth to be safe
    title: "University Admin",
    items: [
      {
        title: "Dashboard",
        href: "/university-auth/dashboard",
        icon: "bi-speedometer2",
        exact: true,
      },
      {
        title: "Applications",
        href: "/university-auth/applications",
        icon: "bi-file-earmark-text",
      },
      {
        title: "Circulars",
        href: "/university-auth/circulars",
        icon: "bi-megaphone",
      },
      {
        title: "Reports",
        href: "/university-auth/reports",
        icon: "bi-file-bar-graph",
      },
      {
        title: "Help",
        href: "/university-auth/help",
        icon: "bi-question-circle",
      },
    ],
  },
  hod: {
    title: "HOD Dashboard",
    items: [
      {
        title: "Department Report",
        href: "/hod",
        icon: "bi-file-earmark-spreadsheet-fill",
        exact: true,
      },
    ],
  },
  authenticated: {
    // Fallback for generic authenticated users
    title: "Authenticated",
    items: [
      { title: "Dashboard", href: "/", icon: "bi-speedometer2" },
      { title: "Profile", href: "/profile", icon: "bi-person-circle" },
      { title: "Settings", href: "/settings", icon: "bi-gear" },
    ],
  },
};
