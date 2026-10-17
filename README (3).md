# College Management System — GitHub Starter

Working educational **FastAPI + SQLite + vanilla JavaScript** starter, with separate role-based login and interactive UI. Not production-ready without the hardening listed below. Interface is English; Gujarati labels can be added in `templates/` and `static/`.

## Included

- Main page, Admin/HOD/Faculty login and role checks
- Dynamic CRUD for faculty, students, subjects, inquiries and course intakes
- Download `.xlsx` templates, upload `.xlsx` (max 5 MB / 2,000 rows), validation, export
- Inquiry → final admission with course intake check; cancel returns capacity
- Class/faculty timetable and clash prevention
- Faculty leave application and Admin/HOD approval
- Proxy only on approved leave; faculty and proxy slot clash checks
- Faculty personal timetable shows regular and proxy entries separately (green/amber)
- Student roster loaded by course, semester and division; proxy attendance recorded against **original slot/subject**, with `taken_by` and `attendance_type=PROXY`
- Duplicate attendance submission blocked
- Interactive API docs at `/docs`

## Quick start

Requires Python 3.11+.

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # Windows CMD: copy .env.example .env
```

Edit `.env`: use a random long `SECRET_KEY`, unique `ADMIN_USERNAME`, and strong `ADMIN_PASSWORD` (change the placeholders). Then:

```bash
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000 and sign in. SQLite database `college.db` is generated automatically. Never commit `.env` or `college.db`.

## Suggested first setup

1. Admin logs in. Add intake by course (e.g. BE-CSE, capacity 60).
2. Add faculty, subjects (subject course/semester must match slot), and students. Download Excel template or use manual entry.
3. Create faculty/HOD accounts via `POST /api/accounts` in `/docs` (login cookie applies). Example: `{"username":"faculty1","password":"use-a-strong-unique-password","role":"FACULTY","faculty_id":1}`.
4. Add slots with exact day names (`Monday` etc.) and period numbers.
5. Faculty submits leave; HOD/Admin approves; assign a proxy for a date matching the slot's weekday.
6. Proxy faculty logs in, opens Proxy & Attendance and selects assigned lecture; submits student attendance. It remains associated with the original subject and stores the substitute faculty.

## API overview

| Feature | Endpoint |
|---|---|
| Login / logout / current user | `POST /api/login`, `POST /api/logout`, `GET /api/me` |
| Dynamic master CRUD | `GET/POST /api/master/{module}`, `PUT/DELETE /api/master/{module}/{id}` |
| Excel template / export / upload | `GET /api/template/{module}`, `GET /api/export/{module}`, `POST /api/import/{module}` |
| Faculty/HOD account | `POST /api/accounts` |
| Admissions | `GET /api/admissions`, `POST /api/admissions/finalize`, `POST /api/admissions/{id}/cancel` |
| Timetable | `GET/POST /api/slots`, `GET /api/my-timetable` |
| Leave | `GET/POST /api/leaves`, `POST /api/leaves/{id}/approve` or `/reject` |
| Proxy | `GET/POST /api/proxies`, `POST /api/proxies/{id}/cancel` |
| Attendance | `GET /api/attendance/roster/{slot_id}/{YYYY-MM-DD}`, `POST /api/attendance`, `GET /api/attendance/report` |

### Excel columns

Use the exact template column names and order. Supported modules: `faculty`, `students`, `subjects`, `inquiries`, `intakes`. Blank rows ignored; import is atomic and rejects duplicates/invalid entries. `semester` and `capacity` are numbers. Imports are not automatic upserts.

### Business rules and scope

- Faculty and class cannot share the same day/period twice. Proxy faculty cannot have a regular or proxy lecture at that period.
- Proxy is assigned only when the original faculty has approved leave covering the lecture date.
- Students for attendance are fetched by original slot's course, semester and division.
- Only assigned faculty (or Admin/HOD) can record the lecture attendance. Once submitted, the endpoint refuses overwrites.
- Intake capacity counts only `FINAL` admissions; cancellation marks it `CANCELLED` and frees a seat.
- SQLite is a development default; for concurrent production admissions, use PostgreSQL transactions/locking to prevent oversubscription.

## GitHub upload

```bash
git init
git add .
git commit -m "Initial college management starter"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Create an empty GitHub repository first; replace the URL with your own. `.gitignore` excludes secrets, database and virtual environment.

## Before real college deployment

This is a starter, not a certified college ERP. Add CSRF protection for cookie-based state-changing requests, HTTPS and `COOKIE_SECURE=true`, rate limiting/login lockout, password reset, audit logs, backups, database migrations, scoped HOD department permissions, bulk import dry-run/error export, proper academic-year management, printable receipts with logo/upload, fee/payment ledger, notifications, leave balances, proxy acceptance, holidays, attendance correction approval, full test suite, and transactional PostgreSQL capacity controls. Test with dummy data first. Do not upload actual student personal information to a public GitHub repository.
