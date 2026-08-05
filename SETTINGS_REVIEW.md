# Aina CRM — Settings Module Review

Scope: the Settings module only. No changes proposed to Leads (frozen), and no
redesign of the wider CRM. Every recommendation respects the fixed constraints:
MySQL only, monolithic deployment, Socket.io realtime, dark-mode-first, custom
SVG icons, Framer Motion, and a bias against unnecessary complexity.

---

## 1. Baseline — what Settings contains today

After this session's work, the Settings dialog is:

**PERSONAL**
- **Profile** — photo, name, surname, mobile, email (read-only)
- **Preferences** — dark mode, timezone, default landing page, density, language (English-only)
- **Notifications** — per-category in-app toggles (Leads, Tasks, Projects, Quotations)
- **Security** — password change, active sessions with per-device revoke and "sign out everywhere else"

**WORKSPACE**
- **Company profile** — logo, name, address, GSTIN, phone, email, website, signature, signatory

Sessions are now real rows in MySQL. The JWT carries a `sid` claim pointing at a
`Session` row, so revocation is genuinely server-side rather than waiting out a
7-day token. This is the foundation most of the SECURITY recommendations below
build on — they are now incremental rather than architectural.

Still outside Settings: **Users & invites** (`/admin/users`), **Departments**
(`/admin/departments`), **Email SMTP** (`/admin/email`).

---

## 2. The two structural findings

Everything else in this document is a feature. These two are not — they shape
what the features can express, so they come first.

### 2.1 CEO and HR are personas, not roles

You asked for recommendations classified across All Users / Department Users /
Admin / Super Admin / **CEO** / **HR**. The schema has three roles:

```
enum Role { SUPER_ADMIN  ADMIN  DEPARTMENT_USER }
```

There is no CEO and no HR. Today a CEO would be a `SUPER_ADMIN` (and so would
the IT person who manages SMTP), and HR would be an `ADMIN` (and so would a
sales manager). That conflation is the single biggest limiter on this module:
"approve quotations over ₹5,00,000" and "reset SMTP credentials" are the same
permission today, and they should not be.

Two ways to model it, in increasing cost:

- **Capability flags on the existing roles** (recommended). Keep the three
  roles; add a small set of booleans or a `capabilities` join table
  (`canApproveHighValue`, `canManagePeople`, `canViewCompanyFinancials`). A CEO
  is a `SUPER_ADMIN` with the financial capabilities; HR is an `ADMIN` with the
  people capabilities. No role explosion, no permission matrix UI to build.
- **New roles `CEO` and `HR`**. Cleaner conceptually, but every `isAdmin()`
  call site and every department-scoping check needs revisiting, and the enum
  will keep growing (COO? Finance?). Avoid unless the org chart is stable.

Throughout this document, **CEO** and **HR** in the Target Users field mean the
persona. Where a recommendation depends on the distinction actually existing,
it is called out.

### 2.2 Settings is three places pretending to be one

The unified dialog was the right call, but `/admin/users`, `/admin/departments`
and `/admin/email` are still full pages outside it. Admins currently learn two
navigation models for one concept. The WORKSPACE recommendations below assume
these fold in — a modal pane and a page are the same React component with a
different shell, so this is cheap, and it is what makes the WORKSPACE group
worth expanding at all.

One caveat worth respecting: Users & invites is a table with search, pagination
and row actions. Inside an 85vh modal that gets cramped. Recommendation: fold
Departments and SMTP into the dialog; leave Users & invites as a full page and
link to it from a WORKSPACE row. Consolidation is a means, not a goal.

---

## 3. Review of the thirteen categories

Condensed gap analysis. Detailed recommendations follow in §4.

| # | Category | Verdict |
|---|---|---|
| 1 | Missing settings sections | INTEGRATIONS, AUTOMATION, SYSTEM don't exist. SECURITY and WORKSPACE are thin. |
| 2 | Personal settings | Solid after this session. Gaps: email delivery channel, quiet hours, out-of-office, saved views, reduced motion. |
| 3 | Admin settings | Scattered across `/admin/*`. No document numbering (and the hardcoded one has a race — see W-1), no business hours, no approval thresholds. |
| 4 | Enterprise settings | No audit trail, no data retention, no legal-entity/financial-year config. This is the weakest area. |
| 5 | Security settings | Sessions now exist. Missing: 2FA, password policy, login history, **session revocation on password change (a live gap — see S1)**. |
| 6 | Notification settings | Per-category in-app toggles exist. Missing: email channel, digest, quiet hours, per-department defaults. |
| 7 | Branding settings | Company profile covers quotation/invoice letterhead only. No in-app branding (accent, login logo), no email branding. |
| 8 | Integrations settings | Only SMTP, and it lives elsewhere. No calendar, no webhooks, no API keys. |
| 9 | Audit settings | **Nothing exists.** No record of who changed what, anywhere in the app. |
| 10 | System settings | Nothing exists. No module toggles, no announcements, no health surface. |
| 11 | Automation settings | Nothing exists. Approval thresholds and task escalation are the high-value ones. |
| 12 | User preference settings | Good. Reduced motion and date format are the remaining honest gaps. |
| 13 | Organization settings | Departments exist as a page; no org-level config (business hours, holidays, fiscal year). |

---

## 4. Recommendations

Priority is P0 (do first) → P3 (later). Complexity is engineering effort:
Low ≈ under a day, Medium ≈ a few days, High ≈ a week or more.

---

### PERSONAL

#### P-1. Email delivery channel per notification category
- **Feature Name:** Email delivery channel
- **Target Users:** All Users
- **Business Value:** In-app notifications only work for people already in the app. Field sales and management live in email. This is the difference between a notification system and a notification system people act on.
- **Complexity:** Medium
- **Priority:** P1
- **Suggested UI placement:** Settings → Notifications. Turn the current one-toggle rows into a two-column matrix: In-app | Email.
- **Database impact:** `NotificationPreference.email Boolean @default(false)` — one column on an existing table.
- **Realtime impact:** None. Email is a side channel; `notifyUser` already gates in-app delivery and would fan out to the mailer alongside the Socket.io emit.
- **Note:** SMTP already exists and is already hardened (IPv4 forcing, bounded timeouts). This is wiring, not new infrastructure. Default email to **off** — defaulting on would email every user for every event on day one.

#### P-2. Quiet hours and daily digest
- **Feature Name:** Quiet hours & digest
- **Target Users:** All Users
- **Business Value:** The natural consequence of P-1. Without it, email delivery becomes noise and gets filtered, taking the useful notifications with it.
- **Complexity:** Medium
- **Priority:** P2
- **Suggested UI placement:** Settings → Notifications, below the channel matrix.
- **Database impact:** `quietHoursStart`/`quietHoursEnd`/`digestMode` on `User`. Digest needs a queue table (`PendingDigestItem`) or a `sentAt`-nullable column on `Notification`.
- **Realtime impact:** None on in-app. Quiet hours suppress *email*, not the Socket.io emit — the bell badge should still be live.
- **Note:** Digest needs a scheduler. In a single-process monolith on Render Starter that means an in-process timer, which fires once per instance and dies on restart. Honest options: accept the imprecision, or use Render Cron hitting an authenticated endpoint. **Do P-1 first and see whether digest is still wanted** — often it isn't once quiet hours exist.

#### P-3. Out-of-office & task delegation
- **Feature Name:** Out-of-office
- **Target Users:** All Users, HR
- **Business Value:** The most under-rated internal-CRM feature. Today, work assigned to someone on leave sits invisible until they're back. HR knows who's on leave; the CRM doesn't.
- **Complexity:** Medium
- **Priority:** P2
- **Suggested UI placement:** Settings → Preferences (personal), plus an HR view under WORKSPACE → People.
- **Database impact:** `outOfOfficeFrom`/`outOfOfficeTo`/`delegateUserId` on `User`.
- **Realtime impact:** Yes — notifications route to the delegate, so `notifyUser` resolves the active delegate before emitting. Fits the existing chokepoint cleanly.
- **Note:** Scope it to *notification routing*, not reassignment. Auto-reassigning records is a much bigger blast radius and much harder to undo.

#### P-4. Saved views / default module filters
- **Feature Name:** Saved views
- **Target Users:** All Users, Department Users
- **Business Value:** Everyone re-applies the same filter every morning. Pairs naturally with the default landing page that now exists.
- **Complexity:** Medium
- **Priority:** P3
- **Suggested UI placement:** Saved *from* each module's filter bar; managed under Settings → Preferences.
- **Database impact:** New `SavedView` table (`userId`, `module`, `name`, `filtersJson`, `isDefault`).
- **Realtime impact:** None.
- **Note:** Excludes Leads (frozen). That weakens it — Leads is where filtering matters most — so it may be worth deferring until Leads unfreezes.

#### P-5. Reduced motion
- **Feature Name:** Reduced motion
- **Target Users:** All Users
- **Business Value:** Accessibility, and a genuine constraint-fit: the app leans on Framer Motion throughout, and some users get motion sickness from animated panes and accordions. Also the cheapest item in this document.
- **Complexity:** Low
- **Priority:** P1
- **Suggested UI placement:** Settings → Preferences, next to Density.
- **Database impact:** `reducedMotion Boolean @default(false)` on `User` — or none at all, if it reads `prefers-reduced-motion` from the OS.
- **Realtime impact:** None.
- **Note:** Framer Motion has `MotionConfig reducedMotion="user"` — wrapping the root respects the OS setting with roughly one line and no schema change. Do that first; add the explicit toggle only if someone asks to override their OS.

#### P-6. Date & number format
- **Feature Name:** Date & number format
- **Target Users:** All Users
- **Business Value:** Timezone now exists but dates still render in one format. For a GSTIN/₹ business, DD/MM/YYYY and lakh/crore grouping are the expectation.
- **Complexity:** Low
- **Priority:** P3
- **Suggested UI placement:** Settings → Preferences, grouped with Timezone.
- **Database impact:** `dateFormat`/`numberFormat` on `User`.
- **Realtime impact:** None.
- **Note:** Arguably an org default, not a personal one — a single Indian company doesn't need per-user number formats. Consider putting it in WORKSPACE and skipping the personal override entirely.

---

### WORKSPACE

#### W-1. Document numbering scheme
- **Feature Name:** Quotation & invoice numbering
- **Target Users:** Admin, CEO
- **Business Value:** Highest-value item in WORKSPACE. Invoice numbering is a statutory concern under GST — sequential, non-reusable, resetting per financial year. Hardcoded numbering is a compliance liability, and it's the kind of thing discovered during an audit rather than before.
- **Complexity:** Medium
- **Priority:** P0
- **Suggested UI placement:** Settings → WORKSPACE → Documents.
- **Database impact:** New `DocumentSequence` table (`docType`, `prefix`, `nextNumber`, `resetPolicy`, `financialYear`). Needs a transaction or `SELECT ... FOR UPDATE`, for the reason below.
- **Realtime impact:** None.
- **Note — there is a live race here.** `nextQuotationNumber()` (`src/lib/quotations.ts:6`, and the invoice twin) reads the latest number and writes `lastSeq + 1` with no transaction or lock. Two quotations created in the same moment both read the same latest value and both compute the same next number. `quotationNumber`/`invoiceNumber` are `@unique`, so the database prevents an actual duplicate — instead the second create fails a unique constraint and surfaces as a 500. Rare, self-correcting on retry, and invisible until two people happen to click Save together. Two further notes: the calendar year (`new Date().getFullYear()`) is not the Indian financial year, so numbering resets in January rather than April; and `orderBy: { quotationNumber: "desc" }` is a lexical string sort that holds only while the sequence stays zero-padded to a fixed width. Building W-1 on a `DocumentSequence` row incremented inside a transaction fixes all three at once — which is why this is P0 and a bug fix, not a feature.

#### W-2. Financial year & tax defaults
- **Feature Name:** Financial year and tax defaults
- **Target Users:** Admin, CEO
- **Business Value:** GSTIN is already captured but tax rates presumably live in code or per-line entry. Default GST rate, place of supply, and an April–March financial year are table stakes for an Indian CRM, and W-1's reset policy depends on the FY boundary.
- **Complexity:** Low
- **Priority:** P1
- **Suggested UI placement:** Settings → WORKSPACE → Company profile, new "Financial" section.
- **Database impact:** Extends the existing company profile row. No new table.
- **Realtime impact:** None.

#### W-3. Default terms & conditions
- **Feature Name:** Document templates
- **Target Users:** Admin
- **Business Value:** Every quotation retypes the same payment terms and validity clause. One place to edit them, versioned by nothing more than "current".
- **Complexity:** Low
- **Priority:** P2
- **Suggested UI placement:** Settings → WORKSPACE → Documents, below numbering.
- **Database impact:** Text columns on the company profile row.
- **Realtime impact:** None.
- **Note:** Resist a rich-text editor. A textarea matches the existing signature/address fields and the minimal design language.

#### W-4. Business hours & holiday calendar
- **Feature Name:** Business hours & holidays
- **Target Users:** HR, Admin, CEO
- **Business Value:** Makes "due in 2 days" mean two *working* days. Prerequisite for any credible task escalation (A-2) and the natural home for the HR persona in Settings.
- **Complexity:** Medium
- **Priority:** P2
- **Suggested UI placement:** Settings → WORKSPACE → Organization.
- **Database impact:** New `BusinessHours` (single row) and `Holiday` (`date`, `name`) tables.
- **Realtime impact:** None directly; changes what A-2's scheduler considers overdue.

#### W-5. Departments in Settings
- **Feature Name:** Departments pane
- **Target Users:** Super Admin, HR
- **Business Value:** Consolidation per §2.2. Departments is a short list with a name field — it fits a modal pane naturally, unlike Users.
- **Complexity:** Low
- **Priority:** P2
- **Suggested UI placement:** Settings → WORKSPACE → Departments.
- **Database impact:** None. Existing `Department` model and API.
- **Realtime impact:** None.

#### W-6. In-app branding
- **Feature Name:** In-app branding
- **Target Users:** Super Admin, CEO
- **Business Value:** The company logo appears on quotations but not in the app or on the login screen. Low functional value for an internal tool.
- **Complexity:** Medium
- **Priority:** P3
- **Suggested UI placement:** Settings → WORKSPACE → Branding.
- **Database impact:** Columns on the company profile row.
- **Realtime impact:** None.
- **Note:** **Recommend against the accent-color picker specifically.** The red accent is load-bearing in the design system, the dark palette is tuned around it, and a user-chosen accent will produce contrast failures the team never sees. A login-screen logo is the useful 20% here. This is the clearest "avoid unnecessary complexity" cut in the document.

---

### SECURITY

#### S-1. Revoke other sessions on password change ⚠️
- **Feature Name:** Session revocation on credential change
- **Target Users:** All Users
- **Business Value:** **This is a live gap, not a nice-to-have.** Sessions and password change both exist right now, and they don't talk to each other. Someone who changes their password because they think they're compromised still leaves the attacker's session alive for up to 7 days — the exact scenario the change was meant to end. Users universally assume changing a password logs everyone else out.
- **Complexity:** Low — one `updateMany` in the password-change branch of `PUT /api/profile`, reusing the logic already written for `/api/sessions/revoke-others`.
- **Priority:** **P0**
- **Suggested UI placement:** No new UI. A toast confirming "Signed out on all other devices" after a password change.
- **Database impact:** None. `Session.revokedAt` already exists.
- **Realtime impact:** Optional — emit a `session_revoked` event so open tabs redirect to login immediately rather than on next navigation.

#### S-2. Two-factor authentication (TOTP)
- **Feature Name:** Two-factor authentication
- **Target Users:** All Users; enforceable by Super Admin
- **Business Value:** The CRM holds the customer pipeline and GSTIN-bearing financial documents. Password-only access to that is below the bar any enterprise customer or auditor expects.
- **Complexity:** Medium
- **Priority:** P1
- **Suggested UI placement:** Settings → Security, above Active sessions.
- **Database impact:** `totpSecret`, `totpEnabledAt` on `User`; a `RecoveryCode` table.
- **Realtime impact:** None.
- **Note:** TOTP (`otplib`) over SMS/email codes — no per-message cost, no delivery failure, and the email-code flow already exists for password reset if a fallback is needed. Recovery codes are not optional; without them, a lost phone means a DB edit. Enforcement ("require 2FA for all admins") is a good P2 follow-up, but ship self-service first.

#### S-3. Login history
- **Feature Name:** Login & security history
- **Target Users:** All Users; all-user view for Super Admin
- **Business Value:** "Was that login me?" is unanswerable today. Active sessions show what's live now, not the failed attempt from an unfamiliar IP last Tuesday.
- **Complexity:** Low
- **Priority:** P2
- **Suggested UI placement:** Settings → Security, below Active sessions.
- **Database impact:** New `AuthEvent` table (`userId`, `type`, `ip`, `userAgent`, `createdAt`). Successful logins already create a `Session` row — this adds the *failures*, which is the actually interesting half.
- **Realtime impact:** None.
- **Note:** Cheap now, because `Session` already captures device and IP. Needs a retention policy (see Y-2) or it grows unbounded.

#### S-4. Password policy & failed-login lockout
- **Feature Name:** Password policy
- **Target Users:** Super Admin (sets), All Users (subject to)
- **Business Value:** The current floor is 8 characters with no lockout, so the login endpoint is open to unlimited online guessing. Lockout matters considerably more than composition rules.
- **Complexity:** Medium
- **Priority:** P1
- **Suggested UI placement:** Settings → WORKSPACE → Security policy (admin-only), separate from personal Security.
- **Database impact:** `failedLoginCount`/`lockedUntil` on `User`; policy columns on a settings row.
- **Realtime impact:** None.
- **Note:** Prioritise **lockout/rate-limiting** and skip forced rotation — NIST has advised against mandatory expiry since 2017; it reliably produces `Password1!` → `Password2!`. Recommending it because it looks enterprise would make this product worse.

#### S-5. Idle timeout & session lifetime
- **Feature Name:** Session policy
- **Target Users:** Super Admin (sets), All Users (subject to)
- **Business Value:** 7 days is generous for a CRM on shared or unattended machines. `Session.lastSeenAt` already exists, so idle timeout is now mostly a policy read.
- **Complexity:** Low
- **Priority:** P2
- **Suggested UI placement:** Settings → WORKSPACE → Security policy.
- **Database impact:** Policy columns only.
- **Realtime impact:** Optional — emit on forced expiry so open tabs don't sit on a dead session.
- **Note:** `lastSeenAt` is throttled to 5 minutes to avoid a write per request. An idle timeout can therefore be up to 5 minutes imprecise — fine for a 30-minute policy, wrong for a 2-minute one. Don't offer a granularity the data can't honour.

---

### INTEGRATIONS

#### I-1. SMTP in Settings
- **Feature Name:** Email delivery pane
- **Target Users:** Super Admin
- **Business Value:** Consolidation per §2.2, and P-1 makes SMTP a user-visible dependency rather than an admin curiosity — when email notifications stop, this is where people will look.
- **Complexity:** Low
- **Priority:** P2
- **Suggested UI placement:** Settings → INTEGRATIONS → Email.
- **Database impact:** None. Existing model, API and test-connection endpoint.
- **Realtime impact:** None.

#### I-2. Outbound webhooks
- **Feature Name:** Webhooks
- **Target Users:** Super Admin
- **Business Value:** The general-purpose escape hatch — Slack, Zapier, an internal dashboard — without building each integration. One feature that closes many requests.
- **Complexity:** Medium
- **Priority:** P3
- **Suggested UI placement:** Settings → INTEGRATIONS → Webhooks.
- **Database impact:** `Webhook` (`url`, `events`, `secret`, `isActive`) and `WebhookDelivery` for retry/debug.
- **Realtime impact:** Shares the `notifyUser` event chokepoint. Delivery must be fire-and-forget — a slow endpoint must never block the request that triggered it.
- **Note:** In a single-process monolith with no queue, retries mean an in-process timer. Be honest that this is best-effort, or don't ship retries.

#### I-3. Calendar sync
- **Feature Name:** Google/Outlook calendar sync
- **Target Users:** All Users
- **Business Value:** Task due dates in the calendar people actually watch.
- **Complexity:** High
- **Priority:** P3
- **Suggested UI placement:** Settings → INTEGRATIONS → Calendar.
- **Database impact:** OAuth token storage per user (encrypted at rest, not plain columns).
- **Realtime impact:** None.
- **Note:** Highest complexity-to-value ratio here. OAuth consent screens, refresh-token rotation, two-way conflict handling, Google review. **A one-way read-only `.ics` feed URL delivers most of the value for a fraction of the cost** — no OAuth, no tokens, one endpoint. Do that first; only build real sync if the feed proves demand.

#### I-4. API keys
- **Feature Name:** API access tokens
- **Target Users:** Super Admin
- **Business Value:** Programmatic access for internal scripts and reporting.
- **Complexity:** Medium
- **Priority:** P3
- **Suggested UI placement:** Settings → INTEGRATIONS → API keys.
- **Database impact:** `ApiKey` (`hashedKey`, `name`, `scopes`, `lastUsedAt`, `revokedAt`).
- **Realtime impact:** None.
- **Note:** Store a hash, show the key exactly once. The `Session` revocation pattern just built is the right model to copy.

---

### AUTOMATION

#### A-1. Quotation approval thresholds
- **Feature Name:** Approval thresholds
- **Target Users:** CEO, Admin
- **Business Value:** The clearest CEO-persona feature in the document, and the clearest case for §2.1. Today `canApproveQuotation` is `isAdmin` — every admin can approve any amount. A ₹50,000 quotation and a ₹50,00,000 quotation should not route identically.
- **Complexity:** Medium
- **Priority:** P1
- **Suggested UI placement:** Settings → AUTOMATION → Approvals.
- **Database impact:** `ApprovalRule` (`docType`, `minAmount`, `maxAmount`, `approverRole` or `approverUserId`).
- **Realtime impact:** Yes — routes the approval notification to a different approver. Uses the existing `notifyUser` path.
- **Note:** Depends on §2.1. Without a CEO distinct from Admin, "escalate to the CEO" has no one to escalate to. Two tiers (standard / high-value) covers the real workflow; a general rules engine does not earn its keep here.

#### A-2. Task escalation & reminders
- **Feature Name:** Overdue escalation
- **Target Users:** All Users, Department Users, Admin
- **Business Value:** Overdue tasks are currently only visible to whoever looks. Escalation makes the CRM push rather than wait.
- **Complexity:** Medium
- **Priority:** P2
- **Suggested UI placement:** Settings → AUTOMATION → Reminders.
- **Database impact:** `EscalationRule` (`daysOverdue`, `notifyRole`); reuses `Notification`.
- **Realtime impact:** Yes — emits through the existing chokepoint, so preferences and out-of-office routing apply for free.
- **Note:** Same scheduler caveat as P-2, and should respect W-4's business hours or it'll escalate on a Sunday. **Build it after W-4, or not at all.**

#### A-3. Round-robin task assignment
- **Feature Name:** Auto-assignment
- **Target Users:** Admin, Department Users
- **Business Value:** Distributes incoming work without a manager triaging.
- **Complexity:** Medium
- **Priority:** P3
- **Suggested UI placement:** Settings → AUTOMATION → Assignment.
- **Database impact:** `AssignmentRule` (`departmentId`, `strategy`, `lastAssignedUserId`).
- **Realtime impact:** Yes — assignment notification via `notifyUser`.
- **Note:** Must respect out-of-office (P-3) or it assigns work to people on leave, which is worse than not automating. Explicitly **excludes Leads** (frozen) — which is where round-robin is most commonly wanted, so this may be premature.

---

### SYSTEM

#### Y-1. Audit log
- **Feature Name:** Audit log
- **Target Users:** Super Admin, CEO
- **Business Value:** Category 9 scored a flat "nothing exists", and it's the biggest enterprise gap in the product. Nobody can answer who discounted that quotation, who changed the GSTIN, or who deactivated a user. Once financial documents are involved, this shifts from a feature to an expectation.
- **Complexity:** Medium
- **Priority:** P1
- **Suggested UI placement:** Settings → SYSTEM → Audit log, with filters for user, action and date.
- **Database impact:** New `AuditEvent` (`actorId`, `action`, `entityType`, `entityId`, `diffJson`, `createdAt`, indexed on `entityType,entityId` and `createdAt`). The highest-write table in the app — needs retention (Y-2) from day one.
- **Realtime impact:** None. Deliberately: an audit log that emits live is a log people watch instead of a record they query.
- **Note:** Scope to **mutations that matter** — approvals, financial edits, permission and user-lifecycle changes, settings changes. Logging every read produces a table nobody can query and a bill nobody wants. Write it at the API layer, and don't let a logging failure fail the request.

#### Y-2. Data retention
- **Feature Name:** Retention policy
- **Target Users:** Super Admin
- **Business Value:** S-3, I-2 and Y-1 all create unbounded-growth tables. Retention is what keeps them from becoming the reason the database falls over.
- **Complexity:** Low
- **Priority:** P2 (ship with whichever of Y-1/S-3 lands first)
- **Suggested UI placement:** Settings → SYSTEM → Data.
- **Database impact:** Policy columns; a periodic `deleteMany` past the horizon.
- **Realtime impact:** None.
- **Note:** Financial audit records have statutory retention minimums under Indian tax law. Do not let this UI delete them — check before shipping the control.

#### Y-3. Module toggles
- **Feature Name:** Module enablement
- **Target Users:** Super Admin
- **Business Value:** Hide unused modules per department.
- **Complexity:** Medium
- **Priority:** P3
- **Suggested UI placement:** Settings → SYSTEM → Modules.
- **Database impact:** `ModuleSetting` (`module`, `departmentId`, `isEnabled`).
- **Realtime impact:** Sidebar re-render on change.
- **Note:** **Recommend deferring.** This is a multi-tenant SaaS feature in a single-company internal tool. It adds a permission dimension to every route and menu for a problem — "Sales sees an Invoices tab they don't use" — that a tab they don't click already solves. Revisit only if Aina CRM is ever sold to a second company.

#### Y-4. Announcement banner
- **Feature Name:** System announcement
- **Target Users:** Super Admin, CEO, HR
- **Business Value:** Broadcast maintenance windows or policy notices without email. The one genuine Socket.io-native Settings feature — a banner that appears without a refresh is the realtime layer doing something only it can do.
- **Complexity:** Low
- **Priority:** P3
- **Suggested UI placement:** Settings → SYSTEM → Announcements.
- **Database impact:** `Announcement` (`message`, `level`, `startsAt`, `endsAt`, `isActive`).
- **Realtime impact:** Yes — broadcast to all connected clients.

---

## 5. Suggested sequence

Grouped by what each phase actually buys you.

**Phase 1 — close what's open.**
S-1 (revoke on password change, P0 — the security hole in what just shipped),
W-1 (document numbering, P0 — compliance, and a confirmed concurrency race),
P-5 (reduced motion, one line via `MotionConfig`),
W-2 (financial year & tax defaults, unblocks W-1's reset policy).

**Phase 2 — the enterprise floor.**
Y-1 (audit log) with Y-2 (retention),
S-2 (2FA) and S-4 (lockout),
P-1 (email notifications).
This is the phase that makes the module survive scrutiny.

**Phase 3 — decide §2.1, then automate.**
Settle CEO/HR as capability flags, then A-1 (approval thresholds) becomes
expressible. W-4 (business hours) before A-2 (escalation), in that order.

**Phase 4 — consolidation and the rest.**
W-5, I-1, P-3, S-3, S-5, then reassess. Much of P-4/A-3 depends on Leads
unfreezing, and half of INTEGRATIONS may never be worth building.

**Recommended against, explicitly:** accent-color picker (W-6), module toggles
(Y-3), forced password rotation (S-4), full OAuth calendar sync before trying an
`.ics` feed (I-3). Each looks like an enterprise settings panel. None of them
makes this one better.

---

## 6. What this module should feel like

Linear, Notion and GitHub Enterprise share one property worth copying: **their
settings pages are boring, and the interesting decisions were made before the UI
was designed.** Linear has no accent picker. GitHub buries audit log filters
behind a query syntax rather than a filter builder. What makes those panels feel
premium is not the surface area — it's that each control does exactly what it
says, immediately, with no ambiguity about whether it saved.

Aina CRM's Settings is closer to that than the "Coming soon" placeholders
suggested. The dialog shell, the sidebar, and the per-pane save affordances are
right. What's missing is not polish — it's an audit log, a numbering scheme, and
a CEO who isn't also the person with the SMTP password.

The single highest-leverage change in this document is **§2.1**. Every
recommendation classified CEO or HR either depends on it or degrades to "Admin"
without it. It is worth settling before building any of them.
