# Aina CRM — Project Overview

Aina CRM is an internal operations platform built for AinaTech: a single Next.js
application covering Leads, Tasks, Projects, Quotations, and Invoices, with
invite-only authentication, live realtime updates, and a dark-mode-first UI.

This document is a complete reference for what the software does. For how to
deploy it, see [DEPLOYMENT.md](DEPLOYMENT.md) (Hostinger VPS) and
[RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) (Render — recommended).

---

## 1. Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, CSS variables for theming, `next-themes` for dark/light |
| Database | MySQL, accessed via Prisma 7 (`@prisma/adapter-mariadb` driver adapter) |
| Realtime | Socket.io, running inside a custom `server.js` alongside the Next.js request handler |
| Auth | Hand-rolled JWT sessions (`jose`), httpOnly cookie, bcrypt password hashing |
| Forms/validation | `react-hook-form`, `zod`, custom `Input`/`Textarea` with themed validation tooltips (native browser bubbles suppressed) |
| UI primitives | Custom components on top of Radix UI (Dialog, Dropdown, Popover, Select, Tabs, Toast, Avatar, Checkbox) — no external icon library, all icons are hand-drawn inline SVGs |
| Animation | Framer Motion throughout (page transitions, toasts, tooltips, charts, sidebar) |
| PDF generation | `jspdf` + `html2canvas`, rendered from an offscreen print-HTML template, one-click direct download |
| Email | `nodemailer`, SMTP config stored in the database (admin-configurable in-app) with `.env` fallback |
| File storage | All uploads (profile photos, company logo/signature, task attachments, project documents) are stored as base64 in MySQL — **no filesystem/object storage dependency** |

---

## 2. Architecture

- **Single deployable process.** `server.js` creates one Node HTTP server, attaches
  Next.js's request handler and a Socket.io server to it, and listens on one port.
  This is why the app must run on a platform that supports a persistent Node
  process (Render, a VPS, etc.) rather than serverless-only platforms.
- **Database access** goes through `src/lib/db.ts`, which builds a `mariadb` pool
  config from `DATABASE_URL` (see `src/lib/mysql-pool-config.ts`). That helper
  also normalizes managed-provider connection strings (`ssl-mode=REQUIRED`,
  IPv4-safe timeouts) so it works with Aiven/PlanetScale/Railway-style MySQL out
  of the box.
- **Realtime.** `src/lib/socket-emit.ts` exposes `emitToUser`, `emitToDepartment`,
  `emitToEntity`, and `emitToAdmins` helpers. Every mutating API route calls one
  of these after writing to the database, so every list/board/dashboard in the
  app refreshes live — no polling.
- **Permissions.** `src/lib/permissions.ts` is the single source of truth for the
  role matrix (see §4). Every API route and every list-query "where" clause is
  built from these helpers so visibility rules can't drift between endpoints.
- **File uploads.** `src/lib/uploads.ts` reads an uploaded `File` into a base64
  string; API routes store it on a `data` (LongText) column and omit that column
  from list/detail JSON responses (it's only read back when actually serving the
  file at `/api/uploads/[...path]`).

---

## 3. Modules

### 3.1 Leads
- Pipeline (Kanban) and List views, toggleable.
- Fields: name, company, email, phone, source, product, priority
  (Low/Medium/High/Urgent), status (New → Contacted → Qualified → Proposal Sent →
  Negotiation → Won/Lost), lead-arrival date, meeting date + meeting status
  (Scheduled/Due/Completed), assignee, department.
- Drag-and-drop between pipeline columns (auto-scrolls the board near the edges
  while dragging).
- Per-lead detail dialog: notes thread, reminders (with due dates, completion
  toggle), and a full activity/audit log (status changes, assignment changes).
- Multi-select via hover-revealed animated checkboxes (no separate "select
  mode" toggle) → bulk delete with a confirm dialog.
- Realtime: new/updated/deleted leads push to admins and the owning department
  instantly.

### 3.2 Tasks
- Pipeline (Kanban: Todo/In Progress/Review/Completed/Cancelled) and List views.
- Fields: title, description, priority, due date, assignee, "assigned by"
  (captured at creation).
- Comments thread and file attachments per task (attachments stored in MySQL,
  viewable inline in a themed modal viewer or downloadable).
- Same hover-checkbox multi-select + bulk delete pattern as Leads.
- Tasks can also exist as **subtasks of a Project Task** (see §3.3) — a `Task`
  row can link back to a `ProjectTask` via `projectTaskParentId`.

### 3.3 Projects
- Grid of project cards (not a table) — each shows status, progress bar, member
  count, task count, assignee, and a "Disabled" badge when deactivated.
- Card hover reveals a three-dot menu: **Edit**, **Delete**, **Disable/Enable**
  (soft-deactivate without losing data).
- New Project form: name, description, department, status, dates, **Assigned by**
  (read-only, current user) and **Assigned to** (any assignable user) — visible
  to admins.
- Project workspace page (`/projects/[id]`) includes:
  - **Members** — add/remove team members (department-scoped for non-admins).
  - **Milestones** — title, due date, status (Pending/Working/Done).
  - **Project tasks** — nested subtasks, assignee, progress %, linked to
    milestones, with dependency links between tasks.
  - **Documents** — upload with an optional custom display name (defaults to the
    file name), stored in MySQL; the viewer shows only the document/image itself
    (no browser PDF-viewer chrome), with view/download actions.
  - **Activity feed** — full audit trail (member added/removed, milestone
    created, document uploaded, status changes, etc.).
- Admins see and can manage every project regardless of department;
  department users see their own department's projects plus ones they're a
  member/assignee of.

### 3.4 Quotations
- Table view with search, row-click preview (themed print-style modal), and
  per-row Share / Edit / Delete actions.
- Full invoice-parity document fields: seller header (logo, name, address,
  GSTIN, phone, email, website, signatory — editable per-document, pre-filled
  from the company profile), client name/email/address/GSTIN, ship-to
  address/GSTIN, place of supply, subject, notes, valid-until date.
- Line items with description, HSN/SAC code, qty, unit price, GST rate; discount
  applied at the document level.
- **Approval workflow**: Draft → Sent → an admin Approves or Rejects (with an
  optional comment) → Approved quotations can be **converted to an Invoice**
  in one click.
- Full version history — every edit that changes items/discount snapshots a new
  version.
- One-click direct PDF download (no browser print dialog) via an offscreen
  render + `jsPDF`/`html2canvas`, laid out as a single A4 page with the totals/
  signature block pinned to the bottom.
- Multi-select via hover checkboxes → bulk delete.

### 3.5 Invoices
- Same table/preview/PDF pattern as Quotations, styled as a formal "TAX INVOICE"
  (company header with logo, Bill To / Ship To blocks, HSN/SAC per line, IGST
  breakdown, amount-in-words, authorized-signature block).
- Can be created standalone or generated from an approved Quotation (carries
  over client/seller/line-item data).
- **Payments**: record partial/full payments against an invoice; status
  (Draft/Sent/Paid/Partial Payment/Overdue/Cancelled) is derived automatically
  from the payment total vs. the invoice total.
- Terms (Net 15/30/45/Due on Receipt), PO number, due date.

### 3.6 Admin area
- **Departments** — create/rename departments; every record in the system can
  be scoped to one.
- **Users & Invites** — single page combining:
  - A capped-height, scrollable "All users" table (Edit / Block / Unblock /
    Delete row actions, all with tooltips) with an **All users / Users /
    Admins** filter dropdown.
  - A **Send invite** button (header, top-right) that opens the invite form in
    a popup — invite-only signup restricted to `@ainatech.in` email addresses.
  - Fully realtime — user create/edit/block/delete reflect live without a
    reload.
- **Email (SMTP)** — a dedicated settings page (not a popup) where an admin
  configures the outgoing mail server (host, port, username, password with a
  show/hide toggle, TLS/SSL switch, from name/email) used to send invites. A
  **Test connection** button verifies the config live (bounded to an 8-second
  timeout so a bad config fails fast instead of hanging). Settings are stored
  in the database and take precedence over `.env` SMTP variables, so they can
  be changed without redeploying.
- **Company Profile** (in the user menu, admin-only) — the org's default
  letterhead: name, address, GSTIN, phone, email, website, signatory name,
  logo, and signature image. This is the fallback seller identity for
  quotations/invoices that don't override it per-document.

### 3.7 Dashboard (admin/super-admin home)
- Six metric cards in one row (Users, Leads, Tasks, Projects, Quotations,
  Invoices), each with its **own dropdown** to switch what figure it shows
  (e.g. Users: All users / Admins / Department / Active / Inactive; entity
  cards: Total or any individual status).
- Three visualization cards — **Chart**, **Graph**, **Nodes** — each with two
  dropdowns: a **dataset** selector (which module's data to show) and a
  **chart-type** selector:
  - Chart: Bar, Column (horizontal), Line, Area
  - Graph: Donut, Pie, Rose (Nightingale), Radial bars
  - Nodes: Bubbles, Treemap, Radar
  - All hand-built animated SVG (no charting library), with a cursor-following
    tooltip showing label/value/percentage on hover.
- The whole dashboard is **live** — every create/update/delete anywhere in the
  app (including user management) triggers a realtime refresh of every number
  and chart, with no page reload.
- Non-admin users see a simple module-launcher grid instead of the stats
  dashboard.

### 3.8 Global chrome (present on every page)
- **Sidebar** — collapsible (persisted per-browser), icons stay left-aligned
  when collapsed, smooth width animation; nav labels show themed tooltips on
  hover while collapsed.
- **Topbar** — command palette search (⌘K/Ctrl+K), theme toggle, notification
  bell, account menu (avatar with transparent background + generic user-icon
  fallback when no photo is set, bordered).
- **Command palette** — search across Leads/Tasks/Projects/Quotations/Invoices
  from one box; shows Recent Searches and Recent Pages (each with a Clear
  button) when the query is empty; press Enter to save a search term; clear
  icon in the input itself.
- **Notifications** — bell with unread-count badge; popover lists recent
  notifications (actor name + what happened, e.g. "Priya assigned you to the
  lead 'Acme Corp'"), with **Mark all as read** and **Clear all** icon actions;
  clicking a notification deep-links to the relevant record.
- **Toasts** — top-center, stacked "deck" effect (newest in front), color-coded
  by variant (success/error/warning/info), auto-dismiss after 4s, smooth
  enter/exit animation, vertically centered content for single-line messages.
- **Tooltips** — a single reusable, portal-rendered, animated tooltip component
  used everywhere (icon buttons, sidebar, dialog close buttons, table row
  actions) — escapes any parent `overflow:hidden`/clipping, fades/slides in and
  out smoothly.
- **Custom form validation** — native browser "Please fill out this field"
  bubbles are suppressed globally; a themed red tooltip is shown instead,
  positioned under the invalid field, auto-clearing as soon as the user
  corrects it.
- **Custom checkboxes** — used for every multi-select list (Leads, Tasks,
  Projects, Quotations, Invoices): invisible until the row/card is hovered (or
  already checked), then slides in from zero width with an animated,
  hand-drawn checkmark draw-in + spring "pop" — no reserved empty space when
  idle.
- **Global red focus ring** — consistent keyboard-focus outline color across
  every interactive element (replacing each browser's default), snaps in
  instantly (no color-transition flash).

---

## 4. Roles & permissions

| Capability | Department User | Admin | Super Admin |
| --- | --- | --- | --- |
| See/manage records in their own department | ✅ | ✅ | ✅ |
| See/manage records in **other** departments | only if assigned/creator/member | ✅ (all) | ✅ (all) |
| Manage Departments | ❌ | ❌ | ✅ |
| Invite / edit / block / delete users | ❌ | ✅ (not other admins/super-admin, unless super admin) | ✅ |
| Approve/reject Quotations | ❌ | ✅ | ✅ |
| See the live Dashboard | ❌ (module launcher instead) | ✅ | ✅ |
| Configure Company Profile / SMTP | ❌ | ✅ | ✅ |

Additional guardrails: a user can't block/delete their own account; the system
always keeps at least one active Super Admin (demoting/blocking/deleting the
last one is rejected).

---

## 5. Authentication & account flows

- **Invite-only.** Only an existing Admin/Super Admin can create an `Invite`
  (email must end in `@ainatech.in`); the invitee follows a tokenized link
  (`/invite/[token]`, 7-day expiry) to set their name and password.
- **Login.** Email + password, JWT session in an httpOnly cookie (7-day TTL).
- **Forgot password / passwordless code login.** From the login page: enter
  your email → a 6-digit code is emailed (10-minute expiry, bcrypt-hashed at
  rest) → entering the correct code signs you in directly (no separate
  "reset password" step needed). Wrong/expired codes are rejected; there is no
  fallback that lets a bad code through.
- **Session** is verified via `jose` (`HS256`, `JWT_SECRET`); all auth API
  routes are wrapped in try/catch so a database/config failure returns a clean
  JSON error (toast-friendly) instead of an unhandled 500.
- Password fields have a show/hide eye-icon toggle everywhere they appear
  (login, profile settings, SMTP settings).

---

## 6. Data model summary

Grouped by module (see `prisma/schema.prisma` for the authoritative definitions):

- **Core**: `Department`, `User`, `Invite`, `Notification`
- **Leads**: `Lead`, `LeadNote`, `LeadActivity`, `LeadReminder`
- **Tasks**: `Task`, `TaskComment`, `TaskAttachment`
- **Projects**: `Project`, `ProjectMember`, `Milestone`, `ProjectTask`,
  `ProjectTaskDependency`, `ProjectDocument`, `ProjectActivity`
- **Quotations**: `Quotation`, `QuotationItem`, `QuotationVersion`,
  `QuotationApproval`
- **Invoices**: `Invoice`, `InvoiceItem`, `Payment`
- **Settings**: `CompanyProfile` (singleton), `SmtpSettings` (singleton)

All primary keys are `cuid()` strings. Money fields are `Decimal(12,2)`
(GST rate `Decimal(5,2)`, quantities `Decimal(10,2)`). File-bearing models
(`User.avatarDataUrl`, `CompanyProfile.logoDataUrl`/`signatureDataUrl`,
`Quotation`/`Invoice` seller logo/signature, `TaskAttachment.data`,
`ProjectDocument.data`) are `@db.LongText` base64 columns.

---

## 7. API surface

All routes live under `src/app/api/`, grouped by resource:

```
auth/          login, logout, me, forgot, verify-code
company-profile
dashboard/     stats
departments
invites        (+ [token] accept)
invoices       (+ [id], [id]/payments)
leads          (+ [id], [id]/notes, [id]/reminders, [id]/reminders/[id])
notifications
profile
projects       (+ [id], [id]/documents, [id]/members, [id]/members/[userId],
                [id]/milestones, [id]/milestones/[id], [id]/tasks, [id]/tasks/[id])
quotations     (+ [id], [id]/approve, [id]/convert)
search
smtp-settings  (+ test)
tasks          (+ [id], [id]/attachments, [id]/comments)
uploads/[...path]   (gated file serving — checks record access before streaming)
users          (+ [id], assignable)
```

Every list endpoint applies the department-scope `where` clause from
`lib/permissions.ts`; every mutating endpoint validates input with `zod` and
broadcasts the relevant Socket.io event on success.

---

## 8. Form fields reference

Every form in the app, field by field. Unless noted, text fields are optional
and validated only for type (email format, number range, etc.) — the custom
themed validation tooltip (see §3.8) fires on any field marked **required**.

### 8.1 Auth
**Login** — Email (required), Password (required, show/hide eye toggle),
"Forgot password?" link.
**Forgot password (step 1)** — Email (required).
**Forgot password (step 2 — verify code)** — 6-digit code (required, numeric,
auto-formatted), "Resend code" / "Change email" links.
**Accept invite** (`/invite/[token]`) — Name (required), Password (required,
min 8 characters).

### 8.2 Users & Invites (admin)
**Send invite** (popup) — Email (required, must end `@ainatech.in`), Role
(dropdown: Department User / Admin / Super Admin), Department (dropdown,
optional).
**Edit user** (popup) — Role (dropdown), Department (dropdown) — email is
shown read-only.

### 8.3 Leads
**New lead** — Name (required), Company, Source, Email, Phone, Product,
Priority (dropdown: Low/Medium/High/Urgent), Assign to (dropdown of
assignable users), Lead arrive date (date picker), Meeting date (date
picker), Meeting status (dropdown: Scheduled/Due/Completed), Department
(dropdown, admin only).
**Lead detail** — same fields as New Lead (editable inline) plus: Add note
(textarea), Add reminder (Due date picker + optional Note text).

### 8.4 Tasks
**New task** — Assigned by (read-only, current user), Title (required),
Description (textarea), Priority (dropdown), Assign to (dropdown), Due date
(date picker).
**Task detail** — same fields editable inline, plus: Add comment (textarea),
Add attachment (file picker, any file type).

### 8.5 Projects
**New project** — Name (required), Description (textarea), Department
(dropdown, admin only), Status (dropdown: Planned/Active/On Hold/
Completed/Cancelled), Assigned by (read-only, current user), Assigned to
(dropdown), Start date, End date (date pickers), Team members (dropdown +
"Add" button, builds a removable chip list).
**Project workspace — header** — Status (dropdown), Progress % (number
input, 0–100), Start date, End date.
**Add team member** — member picker (dropdown) + Add button.
**Add milestone** — Title (text), Due date (date picker), Add button; each
existing milestone has its own Status dropdown (Pending/Working/Done).
**New project task** — Title (required), Description (textarea), Assign to
(dropdown), Due date (date picker), Milestone (dropdown, optional), Parent
task (dropdown — makes it a subtask), Depends on (dropdown + Add button,
builds a removable chip list of blocking tasks). Existing project tasks are
edited inline: Status, Assignee, Due date, Progress % (0–100).
**Add document** (popup) — Document file (file picker, required), Document
name (text, optional — defaults to the file name).

### 8.6 Quotations
**New quotation / edit** — Seller block: Logo (image upload), Company name,
Address (textarea), GSTIN, Phone, Email, Website, Signatory name, Signature
(image upload) — all pre-filled from the Company Profile and editable per
document. Client block: Client name (required), Client email, Client
address (textarea), Client GSTIN. Ship To: Shipping address (textarea),
Ship-to GSTIN. Details: Valid until (date picker), Place of supply,
Department (dropdown, admin only), Subject. Line items (repeatable):
Description, HSN/SAC, Qty, Rate, GST %, Amount (auto-calculated). Discount
(number, applied to the document total). Notes (textarea). Status (edit
only — dropdown: Draft/Sent/Expired; Approved/Rejected are set via the
approval flow, not directly editable). Approval decision (admin, when
Draft/Sent): Approve or Reject button + optional Comment (textarea).

### 8.7 Invoices
**New invoice / edit** — Seller block: identical fields to Quotations.
Bill To: Client name (required), Client email, Billing address (textarea),
Client GSTIN. Ship To: Shipping address (textarea), Ship-to GSTIN. Details:
Invoice date, Due date (date pickers), Terms (dropdown: Due on Receipt/Net
15/Net 30/Net 45), P.O. #, Place of supply, Department (dropdown, admin
only), Subject. Line items (repeatable): Description, HSN/SAC, Qty, Rate,
GST %, Amount. Notes (textarea). Status (dropdown: Draft/Sent/Cancelled —
Paid/Partial/Overdue are derived automatically from payments, not
directly settable).
**Record a payment** — Amount (required, number), Method (dropdown), Note
(text, optional).

### 8.8 Settings
**Profile settings** (every user) — Profile photo (image upload/remove),
Name, Surname, Mobile number, Email (read-only, login identity), Current
password + New password (both required together to change password, min 8
characters).
**Company profile** (admin) — Logo (image upload/remove), Company name,
Address (textarea), GSTIN, Phone, Email, Website, Authorized signature
(image upload/remove), Signatory name (printed under the signature).
**Email (SMTP)** (admin) — Host, Port, Username, Password (show/hide eye
toggle, "leave blank to keep existing" on edit), Use TLS/SSL (toggle
switch), From name, From email. "Test connection" button verifies the
config live before saving.
**Departments** (super admin) — New department: Name (required, text).

---

## 9. What makes this app distinctive

- **Zero external file storage** — every uploaded file lives in the same MySQL
  database as everything else, so a single database backup is a complete
  backup (no S3/disk to separately manage or lose sync with).
- **Fully live, no polling** — Socket.io pushes changes to exactly the users
  who should see them (their own room, their department's room, or the admins'
  room), so boards, lists, and the dashboard update instantly for everyone
  looking at them.
- **No icon/chart library dependency** — every icon and every dashboard
  visualization is hand-built inline SVG/Framer Motion, keeping the bundle
  lean and the visual language perfectly consistent with the rest of the UI.
- **Document-accurate PDFs** — quotations and invoices render to a single A4
  page with GST breakdown, amount-in-words, and signature block, downloadable
  with one click (no browser print dialog in the way).
