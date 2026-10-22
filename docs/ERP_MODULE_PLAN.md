# SVIT College ERP — Module-wise Implementation Plan (25 modules)

> Companion to [`ERP_ARCHITECTURE.md`](./ERP_ARCHITECTURE.md).
> Every module below is implemented as a **declarative configuration** in
> `src/lib/erpModules.js` rendered by the shared `ErpModuleScreen`, and backed
> by **real PostgreSQL tables** created by the migrations in the last column.
> Nothing in this plan is a placeholder: each entry names the tables, the
> fields, the filters, the workflow and the permissions that are created.

Legend for the **Pages** column: every module has its own dashboard page plus
its own list/form pages. Every list page has search, filters, Excel export,
Excel template, Excel import (where marked), PDF, and per-role CRUD rights.

> The page names of the tables below are the ones in the module registry
> (`src/lib/erpModules.js`), which is the source of truth. A few of them were
> renamed during the build so that they never collide with the screens of the
> original admission ERP: **Library Catalogue**, **Library Members**,
> **Library Issues**, **Library Reservations**, **Library Fines**,
> **Lecture Rooms**, **Hostel Rooms**. The four modules that already had a
> screen in the original ERP (Admission & Inquiry, Faculty, Timetable and
> Smart ID Card) keep their original screen as the module dashboard and add
> their new record lists next to it.

---

## 1. Super Admin Management — `super_admin`

| Item | Detail |
| --- | --- |
| Pages | Super Admin Dashboard · User Accounts · Roles & Permissions · Module Registry · Login Modules · Audit Trail · System Settings |
| Tables (new) | `erp_modules`, `erp_module_permissions`, `erp_settings` (existing), `erp_audit_log`, `erp_notification_reads` |
| Existing reused | `staff_members`, `staff_roles`, `role_permissions`, `login_modules`, `login_portal_settings`, `profiles`, `audit_logs` |
| Filters | Module (enabled/disabled), role, action, severity, date range |
| Workflow | Enable/disable module · grant/revoke module permission · create role · assign staff · login module rename/order/restrict |
| Permissions | `users.manage`, `modules.manage`, `settings.manage`, `audit.read` |
| Excel | User directory export, role matrix export, audit trail export, template download |
| PDF | User list, audit trail |
| Phase | 2 |

## 2. Admission & Inquiry Management — `admissions`

| Item | Detail |
| --- | --- |
| Pages | Admission Dashboard · Inquiries · Follow-ups · Applications · Final Admissions · Seat Intake · Admission Forms · Fee Assignments · Payments · Merit |
| Tables (new) | `erp_admission_followup_config` (optional), `erp_application_checklist` |
| Existing reused | `inquiries`, `inquiry_followups`, `inquiry_admissions`, `admission_intakes`, `admission_decision_events`, `applications`, `admission_forms`, `fee_assignments`, `payments`, `merit_entries`, `merit_schemes`, `documents` |
| Filters | Status, course, branch, admission type, intake category, date range, fee paid/unpaid |
| Workflow | Inquiry → follow-up → prepare admission → allocate seat → decide (approve/reject) → convert to student → issue ID card |
| Permissions | `inquiries.read/manage`, `admissions.read/prepare/manage`, `intakes.manage`, `applications.read/create/review`, `fees.manage`, `merit.read/manage` |
| Excel | Export inquiries, applications, admissions, seats; templates for inquiries, applications, seat intake; import errors report |
| PDF | Application form, admission letter, fee receipt, allotment letter |
| Phase | 4 (existing behaviour preserved) |

## 3. Student Management — `students`

| Item | Detail |
| --- | --- |
| Pages | Student Dashboard · Student Records · Student Profile · Documents · ID Cards · Attendance Summary · Fees Summary · Transport · Hostel · Library · Discipline |
| Tables (new) | `erp_student_documents`, `erp_student_profiles` (extended master columns are added to `students`, not duplicated) |
| Existing reused | `students`, `applications`, `documents`, `id_cards`, `lecture_attendance`, `fee_assignments`, `payments` |
| Filters | Course, branch, semester, division, admission year, gender, category, fee status, transport/hostel occupancy |
| Workflow | Admit → create/enrol student → verify documents → ID card → portal activation |
| Permissions | `students.read`, `students.manage`, `id_cards.manage` |
| Excel | Student directory export, template + import (with duplicate detection on enrollment / student id code), bulk profile update template |
| PDF | Student profile sheet, bonafide certificate data, ID card |
| Phase | 4 |

## 4. Faculty Management — `faculty`

| Item | Detail |
| --- | --- |
| Pages | Faculty Dashboard · Faculty Directory · Faculty Profile · Teaching Load · Leave · Attendance · Payroll Summary |
| Tables (new) | `erp_faculty_load`, `erp_faculty_achievements` |
| Existing reused | `faculty`, `staff_members`, `subjects`, `timetable_slots`, `faculty_leaves`, `designations`, `departments` |
| Filters | Department, designation, course, branch, employment status, teaching load |
| Workflow | Create faculty → link to portal login → assign subjects → assign timetable → approve leave |
| Permissions | `faculty.read`, `faculty.manage` |
| Excel | Faculty directory export, template + import (duplicate detection on faculty code and email) |
| PDF | Faculty profile, teaching load statement |
| Phase | 4 |

## 5. Accounts & Finance — `accounts`

| Item | Detail |
| --- | --- |
| Pages | Accounts Dashboard · Ledger Heads · Vouchers · Receipts · Payments · Payables · Receivables · Bank Reconciliation · Budgets · Financial Reports |
| Tables (new) | `erp_account_heads`, `erp_ledger_entries`, `erp_vouchers`, `erp_voucher_lines`, `erp_bank_accounts`, `erp_bank_transactions`, `erp_budgets` |
| Existing reused | `fee_structures`, `fee_assignments`, `payments`, `fee_schemes`, `receipt_sequences` |
| Filters | Head, voucher type, date range, bank account, payment mode, course |
| Workflow | Create voucher (receipt / payment / journal) → auto-post to ledger → reconcile against bank statement → close period |
| Permissions | `accounts.read`, `accounts.manage`, `fees.manage`, `accounts.approve` |
| Excel | Ledger export, voucher export, templates for voucher and bank transaction import, reconciliation import with error report |
| PDF | Voucher, receipt (uses the configured receipt template), trial balance, ledger statement |
| Phase | 6 |

## 6. Transport Management — `transport`

| Item | Detail |
| --- | --- |
| Pages | Transport Dashboard · Routes · Vehicles · Drivers · Students Allocation · Staff Allocation · Daily Attendance · Maintenance · Fare Structure · Complaints |
| Tables (new) | `erp_transport_routes`, `erp_transport_stops`, `erp_transport_vehicles`, `erp_transport_drivers`, `erp_transport_allocations`, `erp_transport_attendance`, `erp_transport_maintenance` |
| Existing reused | `students`, `faculty`, `colleges`, `bus_seva_qr_configs` |
| Filters | Route, vehicle, driver, shift, academic year, allocation status |
| Workflow | Define route + stops → allocate vehicle → assign driver → allocate students/staff → daily attendance → maintenance log |
| Permissions | `transport.read`, `transport.manage` |
| Excel | Route/vehicle/student allocation export, templates for routes, vehicles and allocations with duplicate detection (route code, registration number) |
| PDF | Route sheet, allocation list, vehicle fitness certificate data |
| Phase | 6 |

## 7. Academic Management — `academics`

| Item | Detail |
| --- | --- |
| Pages | Academic Dashboard · Academic Years · Calendar · Semester Plan · Curriculum · Credits · Departments · Course Outcomes · Academic Records |
| Tables (new) | `erp_semesters`, `erp_curriculum`, `erp_course_outcomes`, `erp_credit_rules`, `erp_academic_records` |
| Existing reused | `academic_years`, `courses`, `branches`, `departments`, `subjects`, `college_holidays`, `college_timings` |
| Filters | Academic year, course, branch, semester, department |
| Workflow | Plan semester → map curriculum → assign credits → publish academic records → feed timetable & examinations |
| Permissions | `academics.read`, `academics.manage` |
| Excel | Curriculum export, template + import with duplicate detection (course + semester + subject) |
| PDF | Academic plan, curriculum booklet data, credit summary |
| Phase | 5 |

## 8. Timetable Management — `timetable`

| Item | Detail |
| --- | --- |
| Pages | Timetable Dashboard · Weekly Timetable · Slots · Room Allocation · Substitution · Faculty Workload |
| Tables (new) | `erp_timetable_rooms`, `erp_timetable_substitutions` |
| Existing reused | `timetable_slots`, `college_timings`, `subjects`, `faculty`, `branches`, `students`, `lecture_proxies` |
| Filters | Course, branch, semester, faculty, room, day, time slot |
| Workflow | Define slots (inside college timings) → assign subject + faculty + room → detect clashes → substitution/proxy |
| Permissions | `timetable.read`, `timetable.manage` |
| Excel | Timetable export (grid), slot template + import with clash validation, substitution import |
| PDF | Timetable grid (print layout), room timetable, faculty workload |
| Phase | 5 |

## 9. Attendance Management — `attendance`

| Item | Detail |
| --- | --- |
| Pages | Attendance Dashboard · Student Attendance · Faculty Attendance · Daily Register · Defaulter List · Reports |
| Tables (new) | `erp_faculty_attendance`, `erp_attendance_regularisation` |
| Existing reused | `lecture_attendance`, `timetable_slots`, `students`, `faculty`, `subjects` |
| Filters | Course, branch, semester, subject, faculty, date range, present/absent |
| Workflow | Faculty marks register → system computes percentage → defaulter list → parent notification → regularisation request → HOD approval |
| Permissions | `attendance.read`, `attendance.record`, `attendance.approve` |
| Excel | Register export, template + import for bulk marking, defaulter export |
| PDF | Register sheet, defaulter list, attendance certificate data |
| Phase | 5 |

## 10. Examination Management — `examinations`

| Item | Detail |
| --- | --- |
| Pages | Examination Dashboard · Exams · Schedules · Seating Arrangement · Marks Entry · Results · Marksheets · Revaluation · Grading Scale |
| Tables (new) | `erp_exams`, `erp_exam_schedules`, `erp_seating_plans`, `erp_exam_results`, `erp_marksheets`, `erp_grade_scales`, `erp_revaluation_requests` |
| Existing reused | `students`, `subjects`, `courses`, `branches`, `semesters` (new), `applications`, `merit_entries` |
| Filters | Exam, course, branch, semester, subject, result status, revaluation status |
| Workflow | Define exam + schedule → generate seating plan → enter marks → publish result → generate marksheet → revaluation request → re-evaluation → publish |
| Permissions | `examinations.read`, `examinations.manage`, `examinations.publish` |
| Excel | Schedule export, marks entry template + import with range validation, result export, revaluation import |
| PDF | Marksheet, exam timetable, seating plan, result certificate data |
| Phase | 7 |

## 11. Department / HOD Management — `departments`

| Item | Detail |
| --- | --- |
| Pages | Department Dashboard · Departments · HOD Assignment · Department Faculty · Department Students · Department Timetable · Department Results · Department Targets |
| Tables (new) | `erp_department_targets`, `erp_department_notices` |
| Existing reused | `departments`, `faculty`, `courses`, `branches`, `students`, `subjects` |
| Filters | Department, HOD, academic year, course |
| Workflow | Create department → assign HOD (faculty link) → assign faculty & courses → set targets → HOD approval queue |
| Permissions | `departments.read`, `departments.manage` |
| Excel | Department faculty/student export, target template + import |
| PDF | Department report, HOD approval summary |
| Phase | 4 |

## 12. HR & Payroll — `hr`

| Item | Detail |
| --- | --- |
| Pages | HR Dashboard · Employee Directory · Attendance & Leave · Leave Policies · Leave Approvals · Payroll Runs · Payslips · Salary Components · Loans & Advances · HR Reports |
| Tables (new) | `erp_leave_policies`, `erp_leave_balances`, `erp_payroll_components`, `erp_payroll_runs`, `erp_payslips`, `erp_payslip_lines`, `erp_employee_attendance`, `erp_employee_advances` |
| Existing reused | `faculty`, `staff_members`, `faculty_leaves`, `designations`, `departments` |
| Filters | Employee, department, payroll period, leave type, status |
| Workflow | Leave request → policy check → HOD approval → principal approval → balance update → payroll run → payslip generation |
| Permissions | `hr.read`, `hr.manage`, `payroll.read`, `payroll.manage` |
| Excel | Payroll run export, payslip template + import, leave policy export, attendance import |
| PDF | Payslip, leave sanction letter, salary certificate data |
| Phase | 6 |

## 13. Library Management — `library`

| Item | Detail |
| --- | --- |
| Pages | Library Dashboard · Catalogue · Accession Register · Issue / Return · Reservations · Fines · Members · Library Rules |
| Tables (new) | `erp_library_items`, `erp_library_accessions`, `erp_library_members`, `erp_library_issues`, `erp_library_reservations`, `erp_library_fines` |
| Existing reused | `students`, `faculty`, `subjects`, `courses` |
| Filters | Title, author, category, accession number, member, issue status, due date |
| Workflow | Accession → issue → due tracking → return → fine calculation → reservation queue → stock check |
| Permissions | `library.read`, `library.manage` |
| Excel | Catalogue export, accession template + import with duplicate detection (accession number, ISBN), issue register export |
| PDF | Issue slip, return receipt, due-date notice |
| Phase | 7 |

## 14. Hostel Management — `hostel`

| Item | Detail |
| --- | --- |
| Pages | Hostel Dashboard · Hostels · Blocks & Rooms · Room Allocations · Warden · Attendance · Maintenance · Fees · Requests |
| Tables (new) | `erp_hostels`, `erp_hostel_blocks`, `erp_hostel_rooms`, `erp_hostel_allocations`, `erp_hostel_attendance`, `erp_hostel_maintenance`, `erp_hostel_requests` |
| Existing reused | `students`, `faculty` (warden), `colleges`, `courses` |
| Filters | Hostel, block, room type, occupancy status, gender, academic year |
| Workflow | Define hostel → create rooms → allocate student (capacity check) → daily attendance → maintenance request → vacancy report |
| Permissions | `hostel.read`, `hostel.manage` |
| Excel | Room allocation export, template + import with capacity validation, hostel attendance export |
| PDF | Allotment letter, room list, hostel attendance sheet |
| Phase | 7 |

## 15. Smart ID Card — `id_cards`

| Item | Detail |
| --- | --- |
| Pages | ID Card Dashboard · Issue Card · Print Preview · Reprint Log · Revoke · Card Templates · QR Verification |
| Tables (new) | `erp_id_card_templates` |
| Existing reused | `id_cards`, `id_card_events`, `students`, `applications` |
| Filters | Student, course, branch, card status, issue date, template |
| Workflow | Select eligible student → issue card (QR + unique card number) → print → reprint with reason → revoke |
| Permissions | `id_cards.manage`, `id_cards.read` |
| Excel | Issued card register export, template export |
| PDF | Card print layout (existing), reprint log |
| Phase | 7 (existing behaviour preserved) |

## 16. Communication & Notification — `communication`

| Item | Detail |
| --- | --- |
| Pages | Communication Dashboard · Notice Board · Notifications · Message Templates · Announcement Broadcast · Delivery Log |
| Tables (new) | `erp_notification_templates`, `erp_broadcasts`, `erp_message_log` |
| Existing reused | `notices`, `erp_notifications` (new), `profiles`, `students`, `faculty` |
| Filters | Module, severity, audience, delivery status, date range |
| Workflow | Compose template → choose audience (role / course / class) → broadcast → log delivery → user reads in the notification centre |
| Permissions | `communication.read`, `communication.manage` |
| Excel | Notification register export, template export, audience import |
| PDF | Notice print, broadcast summary |
| Phase | 8 |

## 17. Parent Portal — `parents`

| Item | Detail |
| --- | --- |
| Pages | Parent Dashboard · My Children · Attendance · Fees · Results · Timetable · Notices · Grievance |
| Tables (new) | `erp_guardians`, `erp_parent_students` |
| Existing reused | `students`, `lecture_attendance`, `fee_assignments`, `payments`, `erp_exam_results`, `notices`, `erp_grievances` |
| Filters | Child, academic year, month, status |
| Workflow | Student admission → link guardian (verified e-mail/phone) → guardian login → read-only access to the linked student only |
| Permissions | `parents.read`, `parents.manage` (link/unlink) — the portal itself is restricted to the linked guardians by RLS |
| Excel | Guardian directory export, link template + import, child attendance export |
| PDF | Attendance statement, fee statement |
| Phase | 8 |

## 18. Student Portal — `student_portal`

| Item | Detail |
| --- | --- |
| Pages | Student Dashboard · My Application · My Documents · My Fees · My Attendance · My Timetable · My Results · My Library · My Transport · My Hostel · My Certificates · My Grievances |
| Tables (new) | — (reads the shared records) |
| Existing reused | `applications`, `documents`, `fee_assignments`, `payments`, `lecture_attendance`, `timetable_slots`, `erp_exam_results`, `erp_library_issues`, `erp_transport_allocations`, `erp_hostel_allocations`, `erp_certificates`, `erp_grievances` |
| Filters | Academic year, semester, month |
| Workflow | Sign in with the student login module → the portal resolves the single `students` row linked to the profile → every screen is scoped to that row |
| Permissions | `page:Student Portal` for the student role; RLS restricts every read to `students.user_id = auth.uid()` |
| Excel | Personal attendance and fee export |
| PDF | Personal marksheet, fee receipt |
| Phase | 8 |

## 19. Inventory & Purchase — `inventory`

| Item | Detail |
| --- | --- |
| Pages | Inventory Dashboard · Item Master · Stock Register · Suppliers · Purchase Orders · Goods Receipt · Purchase Invoices · Issue & Return · Stock Audit |
| Tables (new) | `erp_inventory_items`, `erp_inventory_categories`, `erp_suppliers`, `erp_purchase_orders`, `erp_purchase_order_lines`, `erp_goods_receipts`, `erp_stock_movements` |
| Existing reused | `students`, `faculty`, `departments` (consumers) |
| Filters | Item, category, supplier, movement type, date range, stock status |
| Workflow | Item master → supplier → purchase order → goods receipt (stock in) → issue to department/student → stock audit → purchase invoice |
| Permissions | `inventory.read`, `inventory.manage`, `inventory.purchase` |
| Excel | Stock register export, item template + import with duplicate detection (item code), purchase order template + import, movement export |
| PDF | Purchase order, goods receipt, stock report, item label |
| Phase | 8 |

## 20. Placement & Training — `placement`

| Item | Detail |
| --- | --- |
| Pages | Placement Dashboard · Recruiters · Drives · Student Applications · Offers · Placement Records · Training Programmes · Training Attendance · Certificates · Company Reports |
| Tables (new) | `erp_companies`, `erp_placement_drives`, `erp_placement_applications`, `erp_placement_offers`, `erp_training_programmes`, `erp_training_enrollments`, `erp_training_attendance` |
| Existing reused | `students`, `courses`, `branches`, `departments`, `erp_certificates` |
| Filters | Company, drive, course, branch, package range, result, training programme |
| Workflow | Register recruiter → schedule drive → students apply → shortlist → offer → accept → placement record → training programme → attendance → certificate |
| Permissions | `placement.read`, `placement.manage`, `training.manage` |
| Excel | Drive roster export, application template + import, offer letter export, training attendance import |
| PDF | Offer letter, drive list, training certificate data, placement report |
| Phase | 8 |

## 21. Certificate Management — `certificates`

| Item | Detail |
| --- | --- |
| Pages | Certificate Dashboard · Templates · Requests · Issuance · Verification · Print · Series |
| Tables (new) | `erp_certificate_templates`, `erp_certificate_requests`, `erp_certificates` |
| Existing reused | `students`, `faculty`, `erp_exam_results` |
| Filters | Certificate type, holder, issue status, series, academic year |
| Workflow | Define template → request (student/faculty/admin) → verification → issue with serial number → print → verify by number |
| Permissions | `certificates.read`, `certificates.manage`, `certificates.issue` |
| Excel | Issued certificate register export, request template + import |
| PDF | Certificate print (templated), verification slip |
| Phase | 8 |

## 22. College Website & Public Portal — `website`

| Item | Detail |
| --- | --- |
| Pages | Website Dashboard · Pages · Posts & News · Events · Gallery · Announcements · Menus · Public View Preview · SEO Settings |
| Tables (new) | `erp_web_pages`, `erp_web_posts`, `erp_web_events`, `erp_web_menu_items`, `erp_web_settings` |
| Existing reused | `colleges` (branding), `notices`, `inquiries`, `admission_forms` (public inquiry + application) |
| Filters | Page, section, publication status, publish date |
| Workflow | Edit page content → publish → public portal renders it → announcements sync with the notice board |
| Permissions | `website.read`, `website.manage`, `website.publish` |
| Excel | Posts/pages export, bulk publish import |
| PDF | Page preview (print), press note |
| Phase | 8 |

## 23. Grievance & Helpdesk — `helpdesk`

| Item | Detail |
| --- | --- |
| Pages | Helpdesk Dashboard · Tickets · My Tickets · Categories · SLA Rules · Assignment · Escalation · Knowledge Base |
| Tables (new) | `erp_grievance_categories`, `erp_grievances`, `erp_grievance_comments`, `erp_sla_rules`, `erp_knowledge_articles` |
| Existing reused | `students`, `faculty`, `profiles`, `inquiries` (chatbot FAQ) |
| Filters | Ticket number, category, priority, status, assignee, module, age |
| Workflow | Raise ticket → auto-classify (category + priority) → assign → respond → escalate by SLA → resolve → close → rate |
| Permissions | `helpdesk.read`, `helpdesk.manage`, `helpdesk.respond` |
| Excel | Ticket register export, ticket template + import (bulk ticket creation), SLA export |
| PDF | Ticket, escalation notice, resolution letter |
| Phase | 8 |

## 24. Reports & Analytics — `reports`

| Item | Detail |
| --- | --- |
| Pages | Analytics Dashboard · Admission Analytics · Academic Performance · Financial Analytics · Attendance Analytics · Custom Reports · Saved Reports · Scheduled Exports |
| Tables (new) | `erp_report_definitions`, `erp_saved_reports`, `erp_report_schedules` |
| Existing reused | `report_templates`, `admissions`, `payments`, `students`, `lecture_attendance`, `erp_exam_results`, `faculty_leaves`, `erp_payroll_runs` |
| Filters | Date range, course, branch, department, academic year, report type |
| Workflow | Pick a report → set filters → preview (policy-scoped) → save as a custom report → share with roles → schedule export |
| Permissions | `reports.read`, `reports.manage` |
| Excel | Every report exports to Excel; custom report definitions export as JSON templates |
| PDF | Report print layout with charts |
| Phase | 8 |

## 25. System Configuration — `settings`

| Item | Detail |
| --- | --- |
| Pages | Configuration Dashboard · General Settings · College Timings (module-wise) · Academic Settings · Finance Settings · Transport Settings · Communication Settings · Receipt Templates · Approval Workflows · Backup & Audit · Feature Flags |
| Tables (new) | `erp_module_timings`, `erp_feature_flags`, `erp_approval_workflows`, `erp_receipt_templates`, `erp_settings` (existing) |
| Existing reused | `college_timings`, `college_holidays`, `erp_settings`, `login_portal_settings`, `bus_seva_qr_configs`, `payment_gateways` |
| Filters | Category, module, key |
| Workflow | Edit setting → audit entry → module reads the setting at runtime → receipt templates / workflows / timings applied to the modules |
| Permissions | `settings.manage` |
| Excel | Settings export, workflow export, receipt template export |
| PDF | Configuration sheet, timing sheet |
| Phase | 3 + 8 |

---

## Cross-cutting requirements (all 25 modules)

| Requirement | Where it is delivered |
| --- | --- |
| Module dashboard | `ErpDashboard` renders each module's KPI set + charts |
| Forms & records | Generic `ErpModuleScreen` form + table, plus module-specific workflows |
| Search & advanced filters | Free-text over `searchFields` + dropdown filters + date range |
| Permissions | `erp_module_permissions` matrix (view/create/edit/delete/export/approve) resolved by `get_my_erp_access()` and enforced by RLS |
| Reports | Module KPIs + `erp_report_definitions` custom reports + the Analytics dashboard |
| Workflows | `erp_approval_workflows` + `erp_workflow_items` + `erp_workflow_action()` |
| Excel import/export/template | `src/lib/erpExcel.js` (shared by every module) |
| Duplicate detection | Natural-key rule per table in the registry + report instead of insert |
| Import error report | Downloadable error sheet with row, column and reason |
| Document upload | Private `erp-documents` storage bucket, 5 MB limit |
| PDF generation | `src/lib/pdf.js` print-ready renderer + receipt templates |
| Audit logging | `erp_audit_log` written by a generic trigger on every domain table |
| No duplicate Student/Faculty | Single `students` / `faculty` master with unique `user_id`; other modules reference them by UUID |
