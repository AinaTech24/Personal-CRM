# AINA MFD Consulting Command Centre — Complete Custom CRM Field Dictionary

**Status:** proposed technical specification; confirm product assumptions, role boundaries, legal basis and scoring rules before migration / production.  **Prepared:** 17 October 2026.

## Architecture at a glance

Custom web UI → authenticated API → PostgreSQL + encrypted private object storage + asynchronous background workers. One `workspace_id` isolates a platform tenant; each consulting MFD is an `mfd_organization`. Rows are filtered using explicit MFD access grants and role/field permissions. Object storage never grants public read.

Core chain: `mfd_organizations → consulting_engagements → [assessments, consulting_sessions, delivery_projects, action_tasks, review_reports]`. Supporting normalized tables hold assessment answers, document versions, attendees, KPI definitions, milestones, and audit events.

**Required:** `Y` at create, `N` nullable, `C` conditional (rule/status). `varchar` enums refer to Picklists. `numeric` uses decimal; no floating point for money. Field-level sensitivity: Internal / Confidential / Sensitive / Restricted. Audit base fields repeat for every business module.

## Implementation phases

- **P0 — Platform & Security:** Identity and MFA, role permissions, workspace isolation, grants, audit, S3-compatible private object storage, malware scans, backups, CI/CD, event outbox. **Gate:** Production access boundary + tested restore + permission tests.
- **P1 — Operational CRM:** Leads, MFDs, Contacts, Deals, Engagements, Sessions, Tasks, Media, Documents, Communication, Team, Risks, Finance references. **Gate:** Manage first consulting client end-to-end, including upload, meeting, action, audit and role isolation.
- **P2 — Diagnostics:** Business snapshots, template/question bank, assessments, answers, findings, scorecards. **Gate:** Two assessment cycles, corrections and score provenance verified.
- **P3 — Implementation:** Projects, Milestones, SOPs, Training, Decisions, Support/Change Requests. **Gate:** Signed deliverables, owner handoffs and evidence-driven task completion.
- **P4 — Measurement & Scale:** KPI metrics, business reviews, improvements, longitudinal reporting / client portal. **Gate:** Reconciled KPI snapshots and improvement statements with verified source data.

## Module-by-module physical fields


### 01. Leads (`leads`, P1)

Lead intake, qualification and follow-up. **Owner:** Sales. **Scope:** Workspace.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | N | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `lead_number` | `varchar(32)` | Y | — | Workspace-unique e.g. LEAD-2026-000001; Server-generated reference | Internal |
| `business_name` | `varchar(200)` | Y | — | Trim; at least 2 characters; Unconverted lead's business name | Internal |
| `lead_contact_name` | `varchar(150)` | Y | — | Trim; Primary lead person | Confidential |
| `mobile_e164` | `varchar(20)` | N | — | E.164 when supplied; Store international prefix | Sensitive |
| `email` | `varchar(254)` | N | — | Valid email when supplied; At least one of email and mobile must exist | Sensitive |
| `city` | `varchar(100)` | N | — |  | Internal |
| `state` | `varchar(100)` | N | — |  | Internal |
| `lead_source` | `varchar(40)` | Y | enum: lead_source |  | Internal |
| `source_detail` | `text` | N | — | Campaign/event/referral context | Internal |
| `status` | `varchar(40)` | Y | enum: lead_status | Default new | Internal |
| `priority` | `varchar(20)` | Y | enum: lead_priority | Default medium | Internal |
| `assigned_member_id` | `uuid` | C | FK → team_members.id | Required after qualification | Internal |
| `first_contact_at` | `timestamptz` | N | — |  | Internal |
| `next_follow_up_at` | `timestamptz` | N | — |  | Internal |
| `last_contact_at` | `timestamptz` | N | — |  | Internal |
| `qualification_notes` | `text` | N | — |  | Confidential |
| `unqualified_reason` | `text` | C | — | Required when status unqualified | Confidential |
| `converted_org_id` | `uuid` | N | FK → mfd_organizations.id | Set only by conversion transaction | Internal |
| `converted_at` | `timestamptz` | N | — |  | Internal |

**Module invariants:** 1. Either email or phone required. 2. When unqualified require reason; conversion done atomically with MFD creation. 3. Only one conversion destination; cannot point to another workspace.


### 02. MFD Organizations (`mfd_organizations`, P1)

Canonical organization identity and consent boundaries. **Owner:** Consulting Operations. **Scope:** Workspace.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `org_code` | `varchar(30)` | Y | — | Workspace unique server-issued MFD-000001 | Internal |
| `legal_name` | `varchar(220)` | Y | — | Min 2 chars; normalized search key | Internal |
| `brand_name` | `varchar(220)` | N | — |  | Internal |
| `legal_entity_type` | `varchar(40)` | N | enum: legal_entity_type |  | Internal |
| `primary_arn` | `varchar(40)` | N | — | Informational; multi-ARN support table is canonical | Confidential |
| `arn_verified_at` | `timestamptz` | N | — |  | Confidential |
| `website_url` | `varchar(500)` | N | — | HTTPS URL or null | Internal |
| `primary_email` | `varchar(254)` | N | — | Email syntax | Sensitive |
| `primary_phone` | `varchar(20)` | N | — | E.164 | Sensitive |
| `city` | `varchar(100)` | N | — |  | Internal |
| `state` | `varchar(100)` | N | — |  | Internal |
| `country_iso2` | `char(2)` | Y | — | ISO 3166-1 alpha-2; default IN | Internal |
| `registered_address` | `text` | N | — |  | Confidential |
| `org_status` | `varchar(40)` | Y | enum: org_status | Default prospect | Internal |
| `onboarded_at` | `date` | N | — |  | Internal |
| `source_lead_id` | `uuid` | N | FK → leads.id | One originating lead; can be null | Internal |
| `account_owner_id` | `uuid` | C | FK → team_members.id | Required on active status | Internal |
| `client_data_contact_id` | `uuid` | N | FK → mfd_contacts.id | Primary privacy contact | Sensitive |
| `confidentiality_tier` | `varchar(40)` | Y | enum: document_classification | Default confidential | Confidential |
| `recording_allowed` | `boolean` | Y | — | Default false; not a substitute for per-session consent | Confidential |
| `notes` | `text` | N | — |  | Confidential |

**Module invariants:** 1. Unique within workspace; server issued; immutable. 2. Primary ARN not sole identifier; support multiple registrations; verify before relying. 3. Active organization requires assigned internal account owner.


### 03. MFD Contacts (`mfd_contacts`, P1)

Stakeholders and people at the MFD. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `full_name` | `varchar(180)` | Y | — | Trim name | Sensitive |
| `email` | `varchar(254)` | N | — | Email syntax | Sensitive |
| `mobile_e164` | `varchar(20)` | N | — | E.164 format | Sensitive |
| `job_title` | `varchar(150)` | N | — |  | Internal |
| `contact_type` | `varchar(50)` | Y | enum: contact_type |  | Internal |
| `portal_user_id` | `uuid` | N | FK → users.id | Only invited/verified customer identity; Portal user identity for client access grant | Sensitive |
| `department` | `varchar(100)` | N | — |  | Internal |
| `branch_id` | `uuid` | N | FK → mfd_branches.id | Same organization check | Internal |
| `is_decision_maker` | `boolean` | Y | — | Default false | Internal |
| `is_approver` | `boolean` | Y | — | Default false; authorization must be additionally verified | Internal |
| `preferred_channel` | `varchar(20)` | N | enum: contact_preference |  | Internal |
| `is_primary_contact` | `boolean` | Y | — | Default false; at most one primary per MFD | Internal |
| `consent_to_contact` | `boolean` | N | — | Explicit capture source and timestamp when true | Sensitive |
| `consent_record_id` | `uuid` | N | FK → consent_records.id | Link purpose-specific notice/consent evidence | Sensitive |
| `status_active` | `boolean` | Y | — | Default true | Internal |
| `joined_at` | `date` | N | — |  | Confidential |
| `left_at` | `date` | N | — | Must not precede joined_at | Confidential |
| `relationship_notes` | `text` | N | — |  | Confidential |

**Module invariants:** 1. Require at least one usable contact method for active external contacts unless documented exception. 2. At most one active primary contact per MFD (partial unique index). 3. Branch must belong to the same MFD.


### 04. Proposals & Deals (`sales_opportunities`, P1)

Pipeline, proposals, negotiated commercial terms. **Owner:** Sales. **Scope:** MFD optional.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | N | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `opportunity_no` | `varchar(32)` | Y | — | Workspace-unique server issued | Internal |
| `lead_id` | `uuid` | N | FK → leads.id | At least one lead or MFD | Internal |
| `opportunity_name` | `varchar(220)` | Y | — | Trim | Internal |
| `service_type` | `varchar(50)` | Y | enum: service_type |  | Internal |
| `stage` | `varchar(50)` | Y | enum: opportunity_stage | Default discovery | Internal |
| `probability_pct` | `numeric(5,2)` | N | — | 0–100 inclusive; forecast only | Internal |
| `owner_member_id` | `uuid` | Y | FK → team_members.id | Active internal user | Internal |
| `proposal_version_no` | `integer` | N | — | Positive; track versions in auxiliary table | Internal |
| `proposal_document_id` | `uuid` | N | FK → document_records.id | Must belong to same MFD / opportunity | Confidential |
| `expected_value` | `numeric(18,2)` | N | — | Non-negative | Confidential |
| `currency` | `varchar(8)` | Y | enum: currency_code | Default INR | Internal |
| `estimated_close_date` | `date` | N | — |  | Internal |
| `proposed_start_date` | `date` | N | — |  | Internal |
| `proposal_sent_at` | `timestamptz` | N | — |  | Internal |
| `closed_at` | `timestamptz` | N | — |  | Internal |
| `loss_reason` | `text` | C | — | Required when lost | Confidential |
| `next_step` | `text` | N | — |  | Internal |
| `next_step_due` | `date` | N | — |  | Internal |

**Module invariants:** 1. Lead or organization required; won stage requires organization, approved proposal and acceptance evidence. 2. Nonnegative value, percentage 0–100. 3. Lost stage requires reason; won stage does not auto-activate engagement.


### 05. Consulting Engagements (`consulting_engagements`, P1)

Contracted scope, timing, services and responsibilities. **Owner:** Consulting Head. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `engagement_code` | `varchar(32)` | Y | — | Workspace-unique server issued | Internal |
| `engagement_name` | `varchar(220)` | Y | — |  | Internal |
| `opportunity_id` | `uuid` | N | FK → sales_opportunities.id | Won opportunity; not mandatory for renewals | Internal |
| `service_type` | `varchar(50)` | Y | enum: service_type |  | Internal |
| `contract_status` | `varchar(40)` | Y | enum: contract_status |  | Internal |
| `start_date` | `date` | N | — |  | Internal |
| `end_date` | `date` | N | — | End >= start | Internal |
| `billing_frequency` | `varchar(40)` | N | enum: billing_frequency |  | Confidential |
| `contract_value` | `numeric(18,2)` | N | — | Non-negative | Confidential |
| `currency` | `varchar(8)` | Y | enum: currency_code | Default INR | Internal |
| `contract_document_id` | `uuid` | N | FK → document_records.id | Required before active unless approved exception | Confidential |
| `nda_document_id` | `uuid` | N | FK → document_records.id | If applicable | Confidential |
| `lead_consultant_id` | `uuid` | Y | FK → team_members.id | Must have access to the MFD | Internal |
| `client_sponsor_contact_id` | `uuid` | C | FK → mfd_contacts.id | Required to activate | Confidential |
| `objectives` | `text` | Y | — | Minimum meaningful summary | Confidential |
| `in_scope` | `text` | Y | — | Versioned in contract/change requests | Confidential |
| `out_of_scope` | `text` | N | — |  | Confidential |
| `meeting_cadence` | `varchar(100)` | N | — | Free text human-approved schedule | Internal |
| `renewal_notice_days` | `integer` | N | — | 0..365 | Internal |
| `next_review_date` | `date` | N | — |  | Internal |
| `sign_off_at` | `timestamptz` | N | — |  | Confidential |

**Module invariants:** 1. Valid date range; end on/after start. 2. Active requires contract approval/evidence or authorized exception. 3. Active requires authorized client sponsor and assigned consultant.


### 06. Business Profiles & Baselines (`business_profiles`, P2)

As-of-date business snapshots; do not overwrite prior baselines. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `as_of_date` | `date` | Y | — | Cannot be future-dated for verified historical actuals | Internal |
| `profile_version` | `integer` | Y | — | Positive per org/as_of_date | Internal |
| `source` | `varchar(40)` | Y | enum: baseline_source |  | Internal |
| `verification_status` | `varchar(40)` | Y | enum: verification_status |  | Internal |
| `verified_by` | `uuid` | N | FK → team_members.id | Required when verified | Internal |
| `verified_at` | `timestamptz` | N | — | Required when verified | Internal |
| `aum_inr` | `numeric(20,2)` | N | — | Nonnegative; INR base currency | Confidential |
| `monthly_sip_book_inr` | `numeric(20,2)` | N | — | Nonnegative | Confidential |
| `active_client_families` | `integer` | N | — | Nonnegative; mutually agreed definition | Confidential |
| `folio_count` | `integer` | N | — | Nonnegative | Confidential |
| `team_headcount` | `integer` | N | — | Nonnegative | Confidential |
| `branch_count` | `integer` | N | — | Nonnegative | Internal |
| `revenue_ttm_inr` | `numeric(20,2)` | N | — | Nonnegative; sensitive access | Restricted |
| `net_flows_month_inr` | `numeric(20,2)` | N | — | Signed allowed | Confidential |
| `current_crm` | `varchar(150)` | N | — |  | Internal |
| `transaction_platform` | `varchar(150)` | N | — |  | Confidential |
| `owner_dependency_notes` | `text` | N | — |  | Confidential |
| `top_challenges` | `jsonb` | N | — | Array 0..10 of short strings only | Confidential |
| `short_term_goals` | `text` | N | — |  | Confidential |
| `source_document_id` | `uuid` | N | FK → document_records.id | Evidence link; same organization | Confidential |

**Module invariants:** 1. Unique (workspace,mfd,as_of_date,profile_version); approved records append-only. 2. Verified requires reviewer, time, evidence/source. 3. Nonnegative for volume/book quantities; do not fill missing with 0.


### 07. Assessment Templates (`assessment_templates`, P2)

Reusable and version-controlled assessment instruments. **Owner:** Consulting Head. **Scope:** Workspace.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | N | FK → mfd_organizations.id | Required if is_client_specific=true; Optional client-local assessment template | Internal |
| `template_code` | `varchar(40)` | Y | — | Unique together with template_version/workspace | Internal |
| `template_name` | `varchar(220)` | Y | — |  | Internal |
| `template_version` | `integer` | Y | — | Positive; immutable after publish | Internal |
| `assessment_type` | `varchar(40)` | Y | enum: assessment_type |  | Internal |
| `description` | `text` | N | — |  | Internal |
| `status` | `varchar(40)` | Y | enum: assessment_template_status |  | Internal |
| `scoring_scheme_code` | `varchar(50)` | N | — | Must exist in versioned scoring_scheme if scoring | Internal |
| `scoring_scheme_version` | `integer` | N | — | Version is immutable | Internal |
| `published_at` | `timestamptz` | N | — | Required when published | Internal |
| `published_by` | `uuid` | N | FK → team_members.id | Required when published | Internal |
| `owner_member_id` | `uuid` | Y | FK → team_members.id | Template steward | Internal |
| `is_client_specific` | `boolean` | Y | — | Default false; true requires mfd_org_id | Internal |

**Module invariants:** 1. Unique in workspace; published question set immutable. 2. Published requires approver and complete nonempty question bank. 3. True requires valid MFD organization.


### 08. Assessments & Responses (`assessments`, P2)

Assigned, submitted, and reviewed assessment instances; answers in supporting table. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `assessment_number` | `varchar(40)` | Y | — | Workspace-unique ID | Internal |
| `template_id` | `uuid` | Y | FK → assessment_templates.id | Published template version on issuance | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same organization | Internal |
| `assessment_type` | `varchar(40)` | Y | enum: assessment_type |  | Internal |
| `assessment_mode` | `varchar(40)` | Y | enum: assessment_mode |  | Internal |
| `status` | `varchar(40)` | Y | enum: assessment_status |  | Internal |
| `assigned_contact_id` | `uuid` | N | FK → mfd_contacts.id | Required for client self assessment | Sensitive |
| `assigned_consultant_id` | `uuid` | Y | FK → team_members.id | Consultant on client team | Internal |
| `issued_at` | `timestamptz` | N | — |  | Internal |
| `due_at` | `timestamptz` | N | — | Due not earlier than issue | Internal |
| `submitted_at` | `timestamptz` | N | — | Server-set on submit | Internal |
| `reviewer_member_id` | `uuid` | N | FK → team_members.id | Different from respondent where applicable | Internal |
| `approved_at` | `timestamptz` | N | — | Approval audit required | Internal |
| `response_count` | `integer` | Y | — | Default 0; cached from answer table | Internal |
| `completion_pct` | `numeric(5,2)` | Y | — | 0..100 computed not manually editable | Internal |
| `version_snapshot_hash` | `char(64)` | C | — | Required on issue; SHA-256 question set | Internal |
| `review_notes` | `text` | N | — |  | Confidential |

**Module invariants:** 1. Only a published immutable version can be issued. 2. Submission checks required conditional questions and preserves history. 3. Approval requires reviewer, evidence checks and audit event.


### 09. Findings & Gaps (`findings`, P2)

Evidence-linked issues, root causes and proposed actions. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `finding_number` | `varchar(40)` | Y | — | Unique per workspace | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same org | Internal |
| `assessment_id` | `uuid` | N | FK → assessments.id | Source evidence if any | Internal |
| `session_id` | `uuid` | N | FK → consulting_sessions.id | Source evidence if any | Internal |
| `dimension` | `varchar(50)` | Y | enum: assessment_dimension |  | Internal |
| `category` | `varchar(50)` | Y | enum: finding_category |  | Internal |
| `title` | `varchar(250)` | Y | — |  | Internal |
| `description` | `text` | Y | — | Distinguish fact from interpretation | Confidential |
| `root_cause` | `text` | N | — |  | Confidential |
| `severity` | `varchar(30)` | Y | enum: severity |  | Internal |
| `status` | `varchar(40)` | Y | enum: finding_status |  | Internal |
| `owner_member_id` | `uuid` | Y | FK → team_members.id | Consultant responsible | Internal |
| `client_owner_contact_id` | `uuid` | N | FK → mfd_contacts.id | Person consulted for correction | Confidential |
| `recommendation` | `text` | N | — |  | Confidential |
| `impact_statement` | `text` | N | — |  | Confidential |
| `source_description` | `text` | N | — | Required when assessment and session sources are absent; Free-text source provenance for manually observed gaps | Confidential |
| `evidence_verified` | `boolean` | Y | — | Default false | Internal |
| `accepted_at` | `timestamptz` | N | — | Requires consultant review | Internal |
| `resolved_at` | `timestamptz` | N | — | Must have verified resolution | Internal |

**Module invariants:** 1. At least one link to assessment/session or explicit source description required. 2. Resolution only after verification and linked evidence. 3. High/critical finding requires review by consulting head.


### 10. Business Maturity Scorecards (`maturity_scorecards`, P2)

Versioned assessments of maturity, systemization, dependency and adoption. **Owner:** Consulting Head. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `scorecard_number` | `varchar(40)` | Y | — | Unique per workspace | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same org | Internal |
| `assessment_id` | `uuid` | N | FK → assessments.id | Basis for scoring | Internal |
| `scorecard_type` | `varchar(50)` | Y | enum: scorecard_type |  | Internal |
| `scorecard_date` | `date` | Y | — | Point-in-time assessment | Internal |
| `scoring_scheme_code` | `varchar(50)` | Y | — | Must exist published scoring scheme | Internal |
| `scoring_scheme_version` | `integer` | Y | — | Immutable schema version | Internal |
| `score_value` | `numeric(10,4)` | N | — | Range declared by scheme, not assumed | Internal |
| `maturity_level` | `varchar(5)` | N | enum: maturity_level | Only for maturity scorecards | Internal |
| `status` | `varchar(40)` | Y | enum: scorecard_status |  | Internal |
| `coverage_pct` | `numeric(5,2)` | N | — | 0..100; reflects answered eligible questions | Internal |
| `evidence_coverage_pct` | `numeric(5,2)` | N | — | 0..100; source evidence coverage | Internal |
| `calculated_at` | `timestamptz` | N | — |  | Internal |
| `approved_by` | `uuid` | N | FK → team_members.id | Required if approved | Internal |
| `notes` | `text` | N | — |  | Confidential |

**Module invariants:** 1. Calculate under published immutable rubric; preserve denominator and coverage. 2. Only assigned for maturity type; integer level 1..5. 3. Approved needs independent approval and evidence coverage disclosure.


### 11. Consulting Sessions (`consulting_sessions`, P1)

Meeting record, agenda, participants, minutes, commitments. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `session_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same org | Internal |
| `session_type` | `varchar(50)` | Y | enum: session_type |  | Internal |
| `status` | `varchar(40)` | Y | enum: session_status |  | Internal |
| `title` | `varchar(250)` | Y | — |  | Internal |
| `meeting_mode` | `varchar(30)` | Y | enum: meeting_mode |  | Internal |
| `starts_at` | `timestamptz` | Y | — | Timezone-aware | Internal |
| `ends_at` | `timestamptz` | N | — | Must be later than start | Internal |
| `organizer_member_id` | `uuid` | Y | FK → team_members.id | Organizer has MFD access | Internal |
| `agenda` | `text` | N | — |  | Confidential |
| `minutes_draft` | `text` | N | — |  | Confidential |
| `client_approved_minutes` | `text` | N | — |  | Confidential |
| `minutes_approved_at` | `timestamptz` | N | — | Requires reviewer identity and audit event | Internal |
| `meeting_link` | `varchar(700)` | N | — | HTTPS allowlisted scheme | Confidential |
| `next_session_at` | `timestamptz` | N | — |  | Internal |
| `consent_record_id` | `uuid` | N | FK → consent_records.id | Specific to media processing purpose | Sensitive |
| `recording_expected` | `boolean` | Y | — | Default false; consent check enforced if true | Internal |

**Module invariants:** 1. End strictly after start. 2. Recording requires valid purpose-specific consent/legal authorization. 3. Minutes approval requires appropriate reviewer and event record.


### 12. Action & Task Management (`action_tasks`, P1)

Assigned work, deadline, acceptance and verification. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `task_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same org | Internal |
| `project_id` | `uuid` | N | FK → delivery_projects.id | Same org | Internal |
| `finding_id` | `uuid` | N | FK → findings.id | Originating finding | Internal |
| `session_id` | `uuid` | N | FK → consulting_sessions.id | Originating session | Internal |
| `title` | `varchar(250)` | Y | — | Trim | Internal |
| `description` | `text` | N | — |  | Confidential |
| `status` | `varchar(50)` | Y | enum: task_status | Default not_started | Internal |
| `priority` | `varchar(20)` | Y | enum: task_priority | Default normal | Internal |
| `owner_party` | `varchar(20)` | Y | enum: owner_party |  | Internal |
| `assigned_member_id` | `uuid` | C | FK → team_members.id | Required if owner_party aina/shared | Internal |
| `assigned_contact_id` | `uuid` | C | FK → mfd_contacts.id | Required if owner_party mfd/shared | Confidential |
| `created_from` | `varchar(60)` | N | — | Source rule or manual | Internal |
| `due_at` | `timestamptz` | N | — |  | Internal |
| `started_at` | `timestamptz` | N | — |  | Internal |
| `submitted_at` | `timestamptz` | N | — |  | Internal |
| `verified_at` | `timestamptz` | N | — | Required when completed | Internal |
| `verified_by` | `uuid` | N | FK → team_members.id | Required when completed; permitted verifier | Internal |
| `acceptance_criteria` | `text` | C | — | Required before task submitted for verification | Internal |
| `block_reason` | `text` | C | — | Required when blocked | Confidential |
| `completion_notes` | `text` | N | — |  | Confidential |

**Module invariants:** 1. Assignee required for responsible parties; same MFD scope. 2. Completion requires acceptance criteria, appropriate verification and evidence. 3. Blocked requires reason; reopening retains prior verification history.


### 13. Projects & Milestones (`delivery_projects`, P3)

Implementation projects, milestones and dependencies. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `project_number` | `varchar(40)` | Y | — | Unique per workspace | Internal |
| `engagement_id` | `uuid` | Y | FK → consulting_engagements.id | Same organization | Internal |
| `project_name` | `varchar(250)` | Y | — |  | Internal |
| `service_type` | `varchar(50)` | Y | enum: service_type |  | Internal |
| `status` | `varchar(40)` | Y | enum: project_status |  | Internal |
| `lead_member_id` | `uuid` | Y | FK → team_members.id | Has MFD access | Internal |
| `client_sponsor_contact_id` | `uuid` | N | FK → mfd_contacts.id | Same organization | Confidential |
| `start_plan` | `date` | N | — |  | Internal |
| `end_plan` | `date` | N | — | End >= start | Internal |
| `start_actual` | `date` | N | — |  | Internal |
| `end_actual` | `date` | N | — | Must not precede start_actual | Internal |
| `objective` | `text` | Y | — |  | Internal |
| `in_scope` | `text` | Y | — |  | Internal |
| `out_of_scope` | `text` | N | — |  | Internal |
| `completion_pct` | `numeric(5,2)` | Y | — | 0..100; derived milestone progress | Internal |
| `acceptance_criteria` | `text` | C | — | Required before UAT/completed | Internal |
| `client_acceptance_at` | `timestamptz` | N | — | Required to complete unless documented waiver | Internal |

**Module invariants:** 1. Must refer to engagement same MFD; no project without engagement. 2. Derived from verified milestones; no arbitrary manual percent. 3. Complete requires evidence + client sign-off or authorized waiver.


### 14. Process & SOP Register (`process_sop_register`, P3)

Client processes, SOP ownership, version and adoption. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `process_code` | `varchar(50)` | Y | — | Unique within workspace+org | Internal |
| `process_name` | `varchar(250)` | Y | — |  | Internal |
| `dimension` | `varchar(50)` | Y | enum: assessment_dimension |  | Internal |
| `process_owner_contact_id` | `uuid` | N | FK → mfd_contacts.id | Same MFD | Confidential |
| `aina_owner_member_id` | `uuid` | Y | FK → team_members.id | Consultant responsible | Internal |
| `current_state_summary` | `text` | N | — |  | Confidential |
| `future_state_summary` | `text` | N | — |  | Confidential |
| `trigger_description` | `text` | N | — |  | Internal |
| `sla_hours` | `numeric(10,2)` | N | — | Positive or null; only if measurable in hours | Internal |
| `status` | `varchar(40)` | Y | enum: sop_status |  | Internal |
| `sop_version` | `integer` | Y | — | Positive; use immutable version support table | Internal |
| `current_document_id` | `uuid` | N | FK → document_records.id | Same MFD; accepted version | Confidential |
| `approved_by_contact_id` | `uuid` | N | FK → mfd_contacts.id | Authorized approver | Confidential |
| `approved_at` | `timestamptz` | N | — | Approval event required | Internal |
| `adoption_status` | `varchar(40)` | Y | enum: adoption_status |  | Internal |
| `effective_date` | `date` | N | — |  | Internal |
| `next_review_date` | `date` | N | — |  | Internal |

**Module invariants:** 1. Unique within MFD; no duplicate active process code. 2. Published SOP requires authorized approval and immutable version. 3. Verified adoption requires demonstrated staff usage, not file upload alone.


### 15. Training & Adoption (`training_events`, P3)

Training events, attendance and adoption checks. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `training_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same org | Internal |
| `project_id` | `uuid` | N | FK → delivery_projects.id | Same org | Internal |
| `training_title` | `varchar(250)` | Y | — |  | Internal |
| `dimension` | `varchar(50)` | Y | enum: assessment_dimension |  | Internal |
| `mode` | `varchar(30)` | Y | enum: training_mode |  | Internal |
| `status` | `varchar(40)` | Y | enum: training_status |  | Internal |
| `trainer_member_id` | `uuid` | Y | FK → team_members.id | Active consultant | Internal |
| `starts_at` | `timestamptz` | Y | — |  | Internal |
| `ends_at` | `timestamptz` | N | — | Must exceed starts_at | Internal |
| `agenda` | `text` | N | — |  | Internal |
| `material_document_id` | `uuid` | N | FK → document_records.id | Same MFD | Confidential |
| `recording_id` | `uuid` | N | FK → media_records.id | Recording consent must be valid | Sensitive |
| `attendance_total` | `integer` | Y | — | Default 0, derived from attendance table | Internal |
| `training_feedback_score` | `numeric(5,2)` | N | — | 0..5 where explicitly measured | Confidential |
| `follow_up_check_date` | `date` | N | — |  | Internal |
| `adoption_verified_at` | `timestamptz` | N | — | Must have evidence | Internal |

**Module invariants:** 1. End > start. 2. Derived from attendance rows. 3. Cannot claim verified without evidence from follow-up adoption check.


### 16. Decisions & Approvals (`decisions`, P3)

Business decisions, authorized approval and evidence. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `decision_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same org | Internal |
| `session_id` | `uuid` | N | FK → consulting_sessions.id | Same org | Internal |
| `project_id` | `uuid` | N | FK → delivery_projects.id | Same org | Internal |
| `kind` | `varchar(40)` | Y | enum: decision_kind |  | Internal |
| `subject` | `varchar(250)` | Y | — |  | Internal |
| `context` | `text` | Y | — |  | Confidential |
| `options_considered` | `text` | N | — |  | Confidential |
| `proposed_resolution` | `text` | N | — |  | Confidential |
| `status` | `varchar(40)` | Y | enum: decision_status |  | Internal |
| `requested_by_member_id` | `uuid` | Y | FK → team_members.id | Internal requester | Internal |
| `decision_owner_contact_id` | `uuid` | N | FK → mfd_contacts.id | Authorized decision maker | Confidential |
| `required_by` | `date` | N | — |  | Internal |
| `final_resolution` | `text` | C | — | Required when approved/rejected | Confidential |
| `decided_at` | `timestamptz` | N | — | Server side | Internal |
| `evidence_document_id` | `uuid` | N | FK → document_records.id | Written support for sign-off | Confidential |

**Module invariants:** 1. Final outcome required on approve/reject. 2. Client-side decision needs authorized contact approval evidence. 3. Server-generated event; never editable or back-dated silently.


### 17. Recordings & Transcripts (`media_records`, P1)

Consent-aware recordings, transcripts and QA. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `media_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `session_id` | `uuid` | N | FK → consulting_sessions.id | Strongly encouraged for meeting recordings | Internal |
| `media_type` | `varchar(40)` | Y | enum: media_type |  | Internal |
| `status` | `varchar(40)` | Y | enum: media_status |  | Internal |
| `file_object_id` | `uuid` | C | FK → file_objects.id | Required for uploaded/processed audio/video | Restricted |
| `transcript_document_id` | `uuid` | N | FK → document_records.id | Approved transcript version | Restricted |
| `consent_record_id` | `uuid` | C | FK → consent_records.id | Required for recordings/transcriptions unless verified exception | Restricted |
| `consent_status` | `varchar(40)` | Y | enum: consent_status | Derived from consent record, not authoritative itself | Restricted |
| `recorded_at` | `timestamptz` | N | — |  | Internal |
| `duration_seconds` | `integer` | N | — | Non-negative | Internal |
| `transcript_language` | `varchar(16)` | N | — | BCP47 tag e.g en-IN, gu-IN | Internal |
| `transcript_quality_reviewed` | `boolean` | Y | — | Default false | Internal |
| `ai_processing_allowed` | `boolean` | Y | — | Default false; purpose-specific consent/contract required | Restricted |
| `retention_until` | `date` | N | — | Per policy; cannot evade hold | Restricted |
| `redaction_completed` | `boolean` | Y | — | Default false | Restricted |

**Module invariants:** 1. Audio/video require scanned clean storage object. 2. Enforce purpose-granted permission before upload/transcribe/AI processing. 3. Approved transcript requires human review and source link.


### 18. Document Register (`document_records`, P1)

Secure documents and versions, metadata only in PostgreSQL. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `document_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `document_title` | `varchar(250)` | Y | — |  | Internal |
| `document_category` | `varchar(50)` | Y | enum: document_category |  | Internal |
| `status` | `varchar(40)` | Y | enum: document_status |  | Internal |
| `classification` | `varchar(40)` | Y | enum: document_classification | Default confidential | Restricted |
| `file_object_id` | `uuid` | N | FK → file_objects.id | Most recent approved physical object | Restricted |
| `current_version` | `integer` | Y | — | Positive; document_versions tracks all changes | Internal |
| `requested_from_contact_id` | `uuid` | N | FK → mfd_contacts.id | Same MFD | Sensitive |
| `requested_at` | `timestamptz` | N | — |  | Internal |
| `request_due_at` | `timestamptz` | N | — |  | Internal |
| `received_at` | `timestamptz` | N | — |  | Internal |
| `reviewed_by` | `uuid` | N | FK → team_members.id | Required for accepted status | Internal |
| `reviewed_at` | `timestamptz` | N | — |  | Internal |
| `rejection_reason` | `text` | C | — | Required for rejected status | Confidential |
| `confidential_notes` | `text` | N | — |  | Restricted |
| `retention_until` | `date` | N | — | Apply current policy and legal holds | Restricted |

**Module invariants:** 1. Accepted/received documents require virus-scanned clean file unless metadata-only request. 2. Must match latest immutable document_versions record. 3. Rejected needs reason; accepted requires reviewer.


### 19. Communication History (`communications`, P1)

Emails, messages, call logs and action-linked communications. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `communication_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same MFD | Internal |
| `contact_id` | `uuid` | N | FK → mfd_contacts.id | Same MFD | Sensitive |
| `channel` | `varchar(40)` | Y | enum: communication_channel |  | Internal |
| `direction` | `varchar(40)` | Y | enum: communication_direction |  | Internal |
| `status` | `varchar(40)` | Y | enum: communication_status |  | Internal |
| `subject` | `varchar(300)` | N | — |  | Confidential |
| `summary` | `text` | Y | — | Never insert raw secret in summary | Confidential |
| `body_text` | `text` | N | — | Avoid secrets or unnecessary personal data | Restricted |
| `external_message_id` | `varchar(250)` | N | — | Idempotency unique per source provider | Internal |
| `provider_name` | `varchar(80)` | N | — |  | Internal |
| `communicated_at` | `timestamptz` | Y | — | Actual event time | Internal |
| `follow_up_due_at` | `timestamptz` | N | — |  | Internal |
| `action_required` | `boolean` | Y | — | Default false | Internal |
| `recorded_by_member_id` | `uuid` | Y | FK → team_members.id | Author | Internal |
| `linked_session_id` | `uuid` | N | FK → consulting_sessions.id | Same MFD | Internal |

**Module invariants:** 1. Unique per workspace/provider to deduplicate provider messages. 2. Allow manual historical entry with recorded audit actor. 3. Linked contact must belong to communication MFD.


### 20. KPI & Business Tracking (`kpi_observations`, P4)

Time-series business and operational metric observations. **Owner:** Analytics. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `kpi_definition_id` | `uuid` | Y | FK → kpi_definitions.id | Versioned metric definition required | Internal |
| `period_type` | `varchar(20)` | Y | enum: kpi_period_type |  | Internal |
| `period_start` | `date` | Y | — | Start inclusive | Internal |
| `period_end` | `date` | Y | — | End exclusive; end > start | Internal |
| `value_numeric` | `numeric(24,6)` | Y | — | Allow signed where KPI specifies | Confidential |
| `unit` | `varchar(20)` | Y | enum: unit_code |  | Internal |
| `branch_id` | `uuid` | N | FK → mfd_branches.id | Same MFD | Confidential |
| `source` | `varchar(40)` | Y | enum: baseline_source |  | Internal |
| `source_document_id` | `uuid` | N | FK → document_records.id | Evidence when required | Confidential |
| `data_quality` | `varchar(30)` | Y | enum: kpi_data_quality |  | Internal |
| `entered_by` | `uuid` | Y | FK → team_members.id | Internal contributor | Internal |
| `verified_by` | `uuid` | N | FK → team_members.id | Required for verified | Internal |
| `verified_at` | `timestamptz` | N | — | Required for verified | Internal |
| `revision_number` | `integer` | Y | — | Positive; no silent overwrite | Internal |
| `supersedes_observation_id` | `uuid` | N | FK → kpi_observations.id | Original entry remains immutable | Internal |
| `notes` | `text` | N | — |  | Confidential |

**Module invariants:** 1. Unit/formula validated against metric definition version. 2. End-exclusive period; revisions append rather than overwrite. 3. Verified needs independent evidence and reviewer.


### 21. Review Reports (`review_reports`, P4)

Periodic evidence-backed consulting reviews and sign-off. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `review_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `engagement_id` | `uuid` | Y | FK → consulting_engagements.id | Same org | Internal |
| `review_type` | `varchar(30)` | Y | enum: review_type |  | Internal |
| `period_start` | `date` | Y | — |  | Internal |
| `period_end` | `date` | Y | — | End exclusive; end > start | Internal |
| `status` | `varchar(40)` | Y | enum: review_status |  | Internal |
| `prepared_by_member_id` | `uuid` | Y | FK → team_members.id | Consultant | Internal |
| `reviewed_by_member_id` | `uuid` | N | FK → team_members.id | Different approver preferred | Internal |
| `executive_summary` | `text` | N | — |  | Confidential |
| `progress_highlights` | `text` | N | — |  | Confidential |
| `blockers` | `text` | N | — |  | Confidential |
| `next_period_priorities` | `text` | N | — |  | Confidential |
| `report_document_id` | `uuid` | N | FK → document_records.id | Approved report version | Confidential |
| `shared_at` | `timestamptz` | N | — |  | Internal |
| `client_acknowledged_at` | `timestamptz` | N | — | Requires verifiable acknowledgement | Internal |
| `client_approver_contact_id` | `uuid` | N | FK → mfd_contacts.id | Same MFD and authorized | Confidential |

**Module invariants:** 1. End-exclusive; avoid inverted period. 2. Client-shared review requires approved report document. 3. Acknowledgement must map to verifiable authorized person.


### 22. Improvements & Benefits (`improvements`, P4)

Improvement register, outcomes and attribution confidence. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `improvement_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same org | Internal |
| `finding_id` | `uuid` | N | FK → findings.id | Originating finding | Internal |
| `project_id` | `uuid` | N | FK → delivery_projects.id | Delivery vehicle | Internal |
| `title` | `varchar(250)` | Y | — |  | Internal |
| `description` | `text` | Y | — |  | Confidential |
| `benefit_type` | `varchar(40)` | Y | enum: benefit_type |  | Internal |
| `status` | `varchar(40)` | Y | enum: benefit_status |  | Internal |
| `baseline_kpi_observation_id` | `uuid` | N | FK → kpi_observations.id | Baseline data | Confidential |
| `result_kpi_observation_id` | `uuid` | N | FK → kpi_observations.id | Comparable metric definition | Confidential |
| `validated_at` | `timestamptz` | N | — |  | Internal |
| `validated_by` | `uuid` | N | FK → team_members.id | Different person preferred | Internal |
| `attribution_confidence` | `varchar(40)` | Y | enum: benefit_attribution |  | Internal |
| `benefit_narrative` | `text` | N | — | Do not assert causality solely from correlation | Confidential |
| `evidence_document_id` | `uuid` | N | FK → document_records.id | Supporting proof | Restricted |

**Module invariants:** 1. Comparable KPI definition, unit, scope and period; otherwise narrative only. 2. Validated improvement requires verifier and evidence. 3. Do not report causal impact without defensible attribution evidence.


### 23. Internal Consulting Team (`team_members`, P0)

Internal consultant identity, capacity, specializations. **Owner:** Admin. **Scope:** Workspace.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `auth_user_id` | `uuid` | Y | FK → users.id | Workspace unique 1:1 login profile | Restricted |
| `employee_code` | `varchar(40)` | Y | — | Unique per workspace | Internal |
| `full_name` | `varchar(180)` | Y | — |  | Sensitive |
| `work_email` | `varchar(254)` | Y | — | Workspace unique normalized email | Sensitive |
| `mobile_e164` | `varchar(20)` | N | — | E.164 | Sensitive |
| `job_title` | `varchar(150)` | N | — |  | Internal |
| `manager_member_id` | `uuid` | N | FK → team_members.id | No self-cycle | Internal |
| `status` | `varchar(40)` | Y | enum: internal_team_status |  | Internal |
| `joined_at` | `date` | N | — |  | Internal |
| `separated_at` | `date` | N | — | Cannot precede joined_at | Confidential |
| `weekly_capacity_hours` | `numeric(5,2)` | N | — | 0..168; planning capacity only | Internal |
| `skills` | `jsonb` | N | — | Array of controlled specialization codes | Internal |
| `is_available_for_assignment` | `boolean` | Y | — | Default true | Internal |

**Module invariants:** 1. Unique user and normalized work email per workspace. 2. No self-manager or reporting cycles. 3. Suspended/departed members cannot receive new work.


### 24. Risks & Dependencies (`risks_dependencies`, P1)

Risks, issues, blockers, mitigation and escalation. **Owner:** Consulting Head. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `risk_number` | `varchar(40)` | Y | — | Workspace unique | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same MFD | Internal |
| `project_id` | `uuid` | N | FK → delivery_projects.id | Same MFD | Internal |
| `risk_type` | `varchar(40)` | Y | enum: risk_type |  | Internal |
| `title` | `varchar(250)` | Y | — |  | Internal |
| `description` | `text` | Y | — |  | Confidential |
| `severity` | `varchar(30)` | Y | enum: severity |  | Internal |
| `probability_pct` | `numeric(5,2)` | N | — | 0..100 only if risk; not required for issue | Internal |
| `status` | `varchar(40)` | Y | enum: risk_status |  | Internal |
| `assigned_member_id` | `uuid` | Y | FK → team_members.id | Must have MFD access | Internal |
| `client_owner_contact_id` | `uuid` | N | FK → mfd_contacts.id | Same MFD | Confidential |
| `mitigation_plan` | `text` | N | — |  | Confidential |
| `escalation_due_at` | `timestamptz` | N | — |  | Internal |
| `resolved_at` | `timestamptz` | N | — | Resolution evidence required | Internal |

**Module invariants:** 1. Probability only relevant to future risks and within 0..100. 2. Resolution requires evidence or accepted-risk decision. 3. Critical risk triggers immediate escalation according to service policy.


### 25. Billing & Renewals (`billing_records`, P1)

Commercial schedule, invoicing references, amounts and renewals. **Owner:** Finance. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `finance_number` | `varchar(40)` | Y | — | Workspace unique; not a statutory invoice number without invoice system | Confidential |
| `engagement_id` | `uuid` | Y | FK → consulting_engagements.id | Same MFD | Confidential |
| `record_type` | `varchar(40)` | Y | enum: finance_record_type |  | Confidential |
| `status` | `varchar(40)` | Y | enum: finance_status |  | Confidential |
| `external_invoice_ref` | `varchar(100)` | N | — | Match invoice service of record; immutable if issued | Confidential |
| `issued_date` | `date` | N | — |  | Confidential |
| `due_date` | `date` | N | — | Not earlier than issued_date | Confidential |
| `amount_subtotal` | `numeric(18,2)` | Y | — | Nonnegative | Restricted |
| `tax_amount` | `numeric(18,2)` | Y | — | Nonnegative; no automatic statutory advice | Restricted |
| `amount_total` | `numeric(18,2)` | Y | — | Derived subtotal + tax +/- adjustments | Restricted |
| `amount_received` | `numeric(18,2)` | Y | — | Nonnegative; can be split across payments in support table | Restricted |
| `currency` | `varchar(8)` | Y | enum: currency_code | Default INR | Confidential |
| `payment_mode` | `varchar(30)` | N | enum: payment_mode |  | Confidential |
| `received_at` | `date` | N | — |  | Confidential |
| `renewal_due_date` | `date` | N | — |  | Internal |
| `invoice_document_id` | `uuid` | N | FK → document_records.id | Restricted document | Restricted |
| `notes` | `text` | N | — |  | Restricted |

**Module invariants:** 1. Totals reconcile to source-of-truth invoice; use explicit decimal amounts. 2. Paid status only if allocated payments reconcile; no manual unpaid-to-paid switch. 3. Integration reference immutable after issue; statutory invoice handled by accounting source.


### 26. Support & Change Requests (`support_requests`, P3)

Intake and resolution for support / scope changes. **Owner:** Consultant. **Scope:** MFD.

| SQL column | Type | Req | Enum / FK | Validation & description | Security |
|---|---|:---:|---|---|---|
| `id` | `uuid` | Y | — | PK; server generated; Primary key, recommended UUIDv7 or UUIDv4 | Internal |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Must match auth token scope; never client-supplied; Tenant identifier | Internal |
| `created_at` | `timestamptz` | Y | — | Server-generated immutable; UTC storage | Internal |
| `created_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Created by user | Internal |
| `updated_at` | `timestamptz` | Y | — | Server-generated; UTC storage | Internal |
| `updated_by_user_id` | `uuid` | Y | FK → users.id | Authenticated actor; Updated by user | Internal |
| `row_version` | `integer` | Y | — | >=1; optimistic concurrency increment; Reject stale updates, HTTP 409 | Internal |
| `archived_at` | `timestamptz` | N | — | Soft archive requires authorization; Archive does not imply physical deletion | Internal |
| `archived_by_user_id` | `uuid` | N | FK → users.id | Set with archived_at; Actor who archived record | Internal |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Same workspace/org as parent; required after lead conversion; MFD-scoped row access | Internal |
| `ticket_number` | `varchar(40)` | Y | — | Unique per workspace | Internal |
| `engagement_id` | `uuid` | N | FK → consulting_engagements.id | Same org | Internal |
| `contact_id` | `uuid` | N | FK → mfd_contacts.id | Same org | Sensitive |
| `subject` | `varchar(250)` | Y | — |  | Internal |
| `description` | `text` | Y | — |  | Confidential |
| `category` | `varchar(40)` | Y | enum: support_category |  | Internal |
| `status` | `varchar(40)` | Y | enum: support_status |  | Internal |
| `priority` | `varchar(20)` | Y | enum: task_priority |  | Internal |
| `channel` | `varchar(40)` | Y | enum: support_channel |  | Internal |
| `assigned_member_id` | `uuid` | N | FK → team_members.id | Has MFD access | Internal |
| `opened_at` | `timestamptz` | Y | — | Server timestamp | Internal |
| `first_response_at` | `timestamptz` | N | — |  | Internal |
| `resolution_due_at` | `timestamptz` | N | — |  | Internal |
| `resolved_at` | `timestamptz` | N | — |  | Internal |
| `resolution_summary` | `text` | C | — | Required when resolved/closed | Confidential |
| `change_value_estimate_inr` | `numeric(18,2)` | N | — | Nonnegative; scope change only | Confidential |
| `change_approval_decision_id` | `uuid` | N | FK → decisions.id | Required before change execution where scope/pricing changes | Confidential |

**Module invariants:** 1. Resolved/closed requires resolution summary and requester notification. 2. Scope change implementation requires authorized approval when scope/pricing changes. 3. Resolution not earlier than open; preserve reopen history.


## Proposed UI screens and API resources

| Code | Module | Primary screen | List route | Create route | Update route |
|---|---|---|---|---|---|
| LEAD | Leads | Lead intake, qualification and follow-up board | GET /api/v1/leads | POST /api/v1/leads | PATCH /api/v1/leads/{id} |
| MFD | MFD Organizations | MFD 360 overview and linked workspace | GET /api/v1/mfd-organizations | POST /api/v1/mfd-organizations | PATCH /api/v1/mfd-organizations/{id} |
| CON | MFD Contacts | People / stakeholder directory | GET /api/v1/mfd-contacts | POST /api/v1/mfd-contacts | PATCH /api/v1/mfd-contacts/{id} |
| OPP | Proposals & Deals | Proposal versions, pipeline and conversion | GET /api/v1/sales-opportunities | POST /api/v1/sales-opportunities | PATCH /api/v1/sales-opportunities/{id} |
| ENG | Consulting Engagements | Contract scope, calendar and engagement team | GET /api/v1/consulting-engagements | POST /api/v1/consulting-engagements | PATCH /api/v1/consulting-engagements/{id} |
| BAS | Business Profiles & Baselines | Time series baseline form and history | GET /api/v1/business-profiles | POST /api/v1/business-profiles | PATCH /api/v1/business-profiles/{id} |
| TMP | Assessment Templates | Question bank builder and published versions | GET /api/v1/assessment-templates | POST /api/v1/assessment-templates | PATCH /api/v1/assessment-templates/{id} |
| ASM | Assessments & Responses | Respondent form, submissions, review console | GET /api/v1/assessments | POST /api/v1/assessments | PATCH /api/v1/assessments/{id} |
| FND | Findings & Gaps | Gaps, sources, root causes, action trace | GET /api/v1/findings | POST /api/v1/findings | PATCH /api/v1/findings/{id} |
| SCR | Business Maturity Scorecards | Dimension scoring, evidence and score trend | GET /api/v1/maturity-scorecards | POST /api/v1/maturity-scorecards | PATCH /api/v1/maturity-scorecards/{id} |
| SES | Consulting Sessions | Agenda, participants, MOM, actions, recordings | GET /api/v1/consulting-sessions | POST /api/v1/consulting-sessions | PATCH /api/v1/consulting-sessions/{id} |
| TSK | Action & Task Management | My tasks, client tasks, verification queue | GET /api/v1/action-tasks | POST /api/v1/action-tasks | PATCH /api/v1/action-tasks/{id} |
| PRJ | Projects & Milestones | Project board and milestone approvals | GET /api/v1/delivery-projects | POST /api/v1/delivery-projects | PATCH /api/v1/delivery-projects/{id} |
| SOP | Process & SOP Register | Process inventory and approved SOP versions | GET /api/v1/process-sop-register | POST /api/v1/process-sop-register | PATCH /api/v1/process-sop-register/{id} |
| TRN | Training & Adoption | Training events, attendance, adoption | GET /api/v1/training-events | POST /api/v1/training-events | PATCH /api/v1/training-events/{id} |
| DEC | Decisions & Approvals | Approvals inbox and decision history | GET /api/v1/decisions | POST /api/v1/decisions | PATCH /api/v1/decisions/{id} |
| MED | Recordings & Transcripts | Recording library and timestamp-linked transcripts | GET /api/v1/media-records | POST /api/v1/media-records | PATCH /api/v1/media-records/{id} |
| DOC | Document Register | Client document and request library | GET /api/v1/document-records | POST /api/v1/document-records | PATCH /api/v1/document-records/{id} |
| COM | Communication History | Client communication timeline | GET /api/v1/communications | POST /api/v1/communications | PATCH /api/v1/communications/{id} |
| KPI | KPI & Business Tracking | Metric definition, monthly snapshots and revisions | GET /api/v1/kpi-observations | POST /api/v1/kpi-observations | PATCH /api/v1/kpi-observations/{id} |
| REV | Review Reports | Period report generation and acceptance | GET /api/v1/review-reports | POST /api/v1/review-reports | PATCH /api/v1/review-reports/{id} |
| IMP | Improvements & Benefits | Outcome register and benefit verification | GET /api/v1/improvements | POST /api/v1/improvements | PATCH /api/v1/improvements/{id} |
| TEAM | Internal Consulting Team | Internal capacity, assignment and roles | GET /api/v1/team-members | POST /api/v1/team-members | PATCH /api/v1/team-members/{id} |
| RSK | Risks & Dependencies | Risk register and escalation calendar | GET /api/v1/risks-dependencies | POST /api/v1/risks-dependencies | PATCH /api/v1/risks-dependencies/{id} |
| BILL | Billing & Renewals | Invoices, payment allocation and renewal dates | GET /api/v1/billing-records | POST /api/v1/billing-records | PATCH /api/v1/billing-records/{id} |
| SUP | Support & Change Requests | Support/change tickets and scope approvals | GET /api/v1/support-requests | POST /api/v1/support-requests | PATCH /api/v1/support-requests/{id} |
These routes are proposed Aina-owned REST endpoints, not documented third-party APIs; final naming and contracts require engineering sign-off.


## Picklist catalogs

- `lead_status`: `new`, `contact_attempted`, `connected`, `qualified`, `unqualified`, `converted`, `closed`
- `lead_source`: `referral`, `webinar`, `website`, `social_media`, `event`, `networking`, `outbound`, `partner`, `other`
- `lead_priority`: `low`, `medium`, `high`, `urgent`
- `legal_entity_type`: `proprietorship`, `partnership`, `llp`, `private_limited`, `public_limited`, `other`
- `org_status`: `prospect`, `onboarding`, `active`, `paused`, `former`, `do_not_engage`
- `contact_type`: `owner`, `partner`, `director`, `branch_head`, `management`, `sales`, `operations`, `accounts`, `hr`, `it`, `other`
- `contact_preference`: `email`, `phone`, `whatsapp`, `meeting`, `none`
- `opportunity_stage`: `discovery`, `needs_confirmed`, `proposal_drafting`, `proposal_sent`, `negotiation`, `won`, `lost`, `on_hold`
- `service_type`: `business_consulting`, `crm_implementation`, `sop_design`, `training`, `analytics`, `social_media`, `website`, `automation`, `support`, `other`
- `contract_status`: `draft`, `pending_approval`, `active`, `paused`, `completed`, `terminated`, `expired`
- `billing_frequency`: `one_time`, `monthly`, `quarterly`, `half_yearly`, `annual`, `milestone`
- `baseline_source`: `client_reported`, `statement`, `crm_export`, `audit`, `manual_review`, `other`
- `verification_status`: `unverified`, `pending_evidence`, `verified`, `disputed`, `rejected`
- `assessment_template_status`: `draft`, `under_review`, `published`, `retired`
- `assessment_type`: `initial_diagnostic`, `departmental`, `quick_check`, `follow_up`, `annual_audit`, `other`
- `assessment_status`: `draft`, `issued`, `in_progress`, `submitted`, `under_review`, `approved`, `reopened`, `cancelled`
- `assessment_mode`: `self_assessment`, `consultant_assisted`, `interview`
- `assessment_dimension`: `marketing`, `sales`, `operations`, `legal_protection`, `accounts`, `hr`, `management`, `client_service`, `compliance`, `technology`
- `finding_category`: `missing_process`, `ownership_gap`, `data_quality`, `technology_gap`, `training_gap`, `control_failure`, `growth_opportunity`, `other`
- `severity`: `low`, `medium`, `high`, `critical`
- `finding_status`: `identified`, `validating`, `accepted`, `in_remediation`, `verification`, `resolved`, `rejected`
- `scorecard_type`: `maturity`, `systemization`, `owner_dependency`, `adoption`
- `scorecard_status`: `draft`, `reviewed`, `approved`, `superseded`
- `maturity_level`: `1`, `2`, `3`, `4`, `5`
- `session_type`: `discovery`, `owner_interview`, `department_interview`, `process_mapping`, `management_review`, `training`, `implementation_review`, `quarterly_review`, `other`
- `session_status`: `scheduled`, `completed`, `minutes_draft`, `minutes_review`, `minutes_approved`, `cancelled`, `no_show`
- `meeting_mode`: `in_person`, `video`, `telephone`, `hybrid`
- `task_status`: `not_started`, `in_progress`, `submitted_for_review`, `verification`, `completed`, `blocked`, `cancelled`, `reopened`
- `owner_party`: `aina`, `mfd`, `shared`, `external`
- `task_priority`: `low`, `normal`, `high`, `critical`
- `project_status`: `planned`, `active`, `on_hold`, `uat`, `completed`, `cancelled`
- `sop_status`: `missing`, `draft`, `under_review`, `approved`, `published`, `retired`
- `adoption_status`: `not_started`, `pilot`, `partial`, `operational`, `verified`
- `training_mode`: `online`, `in_person`, `hybrid`, `self_paced`
- `training_status`: `planned`, `scheduled`, `completed`, `cancelled`, `follow_up_due`
- `decision_status`: `proposed`, `awaiting_client`, `awaiting_aina`, `approved`, `rejected`, `withdrawn`, `expired`
- `decision_kind`: `policy`, `scope`, `technical`, `commercial`, `process`, `risk_acceptance`, `other`
- `media_type`: `audio`, `video`, `transcript`
- `media_status`: `uploaded`, `processing`, `draft_transcript`, `human_review`, `approved`, `failed`, `removed`
- `consent_status`: `not_requested`, `requested`, `granted`, `withdrawn`, `not_required`
- `document_category`: `assessment`, `contract`, `process_map`, `sop`, `org_chart`, `evidence`, `training`, `report`, `invoice`, `recording`, `other`
- `document_status`: `requested`, `received`, `under_review`, `accepted`, `rejected`, `superseded`, `archived`
- `document_classification`: `internal`, `confidential`, `restricted`
- `communication_channel`: `email`, `whatsapp`, `phone`, `video`, `in_person`, `sms`, `portal`, `other`
- `communication_direction`: `inbound`, `outbound`, `internal`
- `communication_status`: `draft`, `logged`, `sent`, `delivered`, `failed`, `cancelled`
- `kpi_period_type`: `day`, `week`, `month`, `quarter`, `year`
- `kpi_data_quality`: `unverified`, `estimated`, `verified`, `corrected`, `disputed`
- `review_type`: `weekly`, `monthly`, `quarterly`, `annual`, `milestone`, `ad_hoc`
- `review_status`: `draft`, `under_review`, `client_shared`, `acknowledged`, `approved`, `archived`
- `benefit_type`: `time_saved`, `cost_avoided`, `quality`, `turnaround`, `conversion`, `retention`, `revenue_related`, `risk_reduction`, `other`
- `benefit_status`: `hypothesis`, `tracking`, `observed`, `validated`, `not_realized`
- `benefit_attribution`: `not_assessed`, `weak`, `moderate`, `strong`, `not_attributable`
- `internal_team_status`: `invited`, `active`, `on_leave`, `suspended`, `departed`
- `risk_type`: `risk`, `issue`, `dependency`, `blocker`
- `risk_status`: `open`, `mitigating`, `awaiting_client`, `accepted`, `resolved`, `closed`
- `finance_record_type`: `invoice`, `payment`, `credit_note`, `renewal_schedule`, `billing_milestone`
- `finance_status`: `draft`, `issued`, `part_paid`, `paid`, `overdue`, `cancelled`, `void`
- `payment_mode`: `bank_transfer`, `upi`, `cheque`, `card`, `cash`, `other`
- `support_category`: `bug`, `consulting_query`, `data_request`, `scope_change`, `access_issue`, `training_request`, `other`
- `support_status`: `new`, `triaged`, `in_progress`, `awaiting_client`, `awaiting_aina`, `resolved`, `closed`, `reopened`
- `support_channel`: `portal`, `email`, `whatsapp`, `phone`, `meeting`, `internal`
- `answer_type`: `single_select`, `multi_select`, `boolean`, `number`, `date`, `short_text`, `long_text`, `file`
- `answer_state`: `draft`, `submitted`, `corrected`, `void`
- `approval_status`: `pending`, `approved`, `rejected`, `revoked`
- `file_scan_status`: `pending`, `clean`, `quarantined`, `failed`
- `user_role`: `platform_admin`, `aina_admin`, `director`, `consulting_head`, `senior_consultant`, `consultant`, `analyst`, `sales`, `finance_ops`, `client_owner`, `client_manager`, `auditor`
- `workspace_status`: `active`, `suspended`, `archived`
- `user_account_status`: `invited`, `active`, `locked`, `disabled`
- `question_status`: `active`, `retired`
- `milestone_status`: `not_started`, `in_progress`, `in_review`, `verified`, `blocked`, `cancelled`
- `attendance_state`: `invited`, `attended`, `partial`, `absent`, `excused`
- `dependency_type`: `finish_to_start`, `blocking`, `related`
- `registration_type`: `arn`, `euin`, `other`
- `consent_basis`: `consent`, `contractual_authorization`, `legitimate_use_reviewed`, `other_reviewed`
- `retention_hold_status`: `active`, `released`
- `notification_state`: `queued`, `sent`, `failed`, `suppressed`
- `outbox_state`: `pending`, `published`, `failed`
- `approval_actor_type`: `aina_member`, `mfd_contact`
- `entity_link_type`: `session`, `assessment`, `answer`, `finding`, `task`, `project`, `sop`, `training`, `decision`, `risk`, `review`, `support_request`, `improvement`, `opportunity`, `engagement`, `communication`
- `currency_code`: `INR`, `USD`, `AED`, `GBP`, `EUR`, `OTHER`
- `unit_code`: `INR`, `INR_CR`, `INR_LAKH`, `COUNT`, `PERCENT`, `DAYS`, `HOURS`, `RATIO`, `OTHER`

## Supporting physical tables

| Table | Core columns | Use |
|---|---|---|
| `workspaces` | `id,slug,name,status,created_at` | Tenant boundary. One internal Aina workspace; extensible. |
| `users` | `id,oidc_subject,email,status,mfa_enrolled_at` | Identity; mapped to external OIDC provider; no password copies. |
| `role_assignments` | `id,workspace_id,user_id,role,valid_from,valid_to` | Grant/revoke roles with audit. |
| `client_access_grants` | `id,workspace_id,mfd_org_id,user_id,access_role,granted_by,expires_at` | Row-level scoped access for staff and portal members. |
| `mfd_branches` | `id,workspace_id,mfd_org_id,branch_code,name,city,state,active` | Multiple branches with explicit FK to MFD. |
| `mfd_registrations` | `id,workspace_id,mfd_org_id,registration_type,registration_no,verified_at,valid_from,valid_to` | Support multiple ARNs and other registrations without overwrites. |
| `consent_records` | `id,workspace_id,mfd_org_id,person_id,purpose,notice_version,legal_basis_or_consent,granted_at,withdrawn_at,evidence_document_id` | Purpose-specific processing / recording permission. |
| `assessment_questions` | `id,template_id,question_key,revision,dimension,question_text,answer_type,required,options_json,visibility_rule,weight,order_no` | Immutable after template publish; eligibility rules versioned. |
| `assessment_answers` | `id,workspace_id,mfd_org_id,assessment_id,question_id,respondent_contact_id,response_json,response_state,submitted_at,supersedes_answer_id,original_text` | Append-only response changes; validate JSON by answer_type. |
| `assessment_response_events` | `id,assessment_answer_id,actor_user_id,event_type,occurred_at,details_json` | Response correction / review trail. |
| `scoring_schemes` | `id,workspace_id,scheme_code,version,rubric_json,weights_json,status,published_at` | Published scoring formulas immutable and testable. |
| `scorecard_dimension_scores` | `id,scorecard_id,dimension,raw_score,normalized_score,coverage_pct,evidence_count` | Cross-functional scorecard breakdown. |
| `meeting_attendees` | `id,session_id,contact_id,member_id,role,attendance_state` | Either contact or member; not both. |
| `transcript_segments` | `id,workspace_id,media_record_id,sequence_no,start_ms,end_ms,text_content,speaker_label,reviewed_at` | Timestamp-level searchable transcript records with immutable correction trail. |
| `engagement_staff_assignments` | `id,workspace_id,engagement_id,member_id,responsibility,assigned_at,revoked_at` | Team members and responsibilities per engagement. |
| `mfd_departments` | `id,workspace_id,mfd_org_id,branch_id,department_name,head_contact_id,headcount,active` | Client organization structure and department ownership. |
| `task_dependencies` | `id,task_id,depends_on_task_id,dependency_type` | Block loops with DAG validation. |
| `project_milestones` | `id,project_id,title,planned_due_at,actual_done_at,acceptance_criteria,status,verified_by` | Milestone history and project completion rollup. |
| `sop_versions` | `id,sop_id,version_no,document_id,change_summary,status,approved_by,approved_at` | Immutable published SOP version. |
| `training_attendance` | `id,training_id,contact_id,attendance_state,feedback_score,quiz_score,adoption_check_at` | Actual attendance, not only a count. |
| `decision_approvals` | `id,decision_id,approver_contact_id,approver_member_id,status,comment,actioned_at,evidence_document_id` | Approver authorization and event-level audit. |
| `file_objects` | `id,workspace_id,mfd_org_id,storage_key,sha256,mime_type,size_bytes,scan_status,encryption_key_ref,uploaded_by,created_at` | Object storage key only; never persist public URL. |
| `document_versions` | `id,document_id,version_no,file_object_id,uploaded_at,uploaded_by,change_note` | Immutable binary version references. |
| `document_links` | `id,document_id,entity_type,entity_id,linked_at,linked_by` | Typed targets checked in service; guard same tenant / org. |
| `communication_participants` | `id,communication_id,contact_id,member_id,direction_role` | Recipient/copy and sender parties. |
| `kpi_definitions` | `id,workspace_id,metric_code,version,name,unit,formula,aggregation_rule,sign_rule,evidence_policy,active_from` | Versioned KPI semantics and comparable time-series. |
| `payment_allocations` | `id,billing_record_id,payment_reference,amount,received_at,source_system` | Support partial / multiple payments; never fake allocation. |
| `approval_audit_events` | `id,workspace_id,entity_type,entity_id,actor_user_id,old_state,new_state,event_at,evidence_ref` | Append-only approvals and state transitions. |
| `audit_events` | `id,workspace_id,user_id,entity_table,entity_id,action,changed_columns,recorded_at,ip_class` | Append-only immutable system change trail. |
| `outbox_events` | `id,workspace_id,event_type,aggregate_id,payload_json,published_at,retry_count` | Transactional outbox for reliable async jobs. |
| `notification_deliveries` | `id,workspace_id,recipient_user_id,template_code,channel,state,attempted_at` | Delivery and retry tracking. |
| `retention_holds` | `id,workspace_id,mfd_org_id,entity_type,entity_id,reason,placed_at,released_at` | Prevent purge when preservation is authorized/required. |

## Typed auxiliary table fields


### Support table `workspaces`
Tenant boundary. One internal Aina workspace; extensible.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `slug` | `varchar(80)` | Y | — | Global unique slug, server-generated |
| `name` | `varchar(180)` | Y | — | Aina internal organizational workspace |
| `status` | `varchar(30)` | Y | enum: workspace_status | Default active |

### Support table `users`
Identity; mapped to external OIDC provider; no password copies.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `oidc_subject` | `varchar(255)` | Y | — | Globally unique external identity-provider subject |
| `email` | `varchar(254)` | Y | — | Validated normalized address, not authorization by email alone |
| `status` | `varchar(40)` | Y | enum: user_account_status | Default invited |
| `mfa_enrolled_at` | `timestamptz` | N | — | Required for privileged roles before login |
| `last_login_at` | `timestamptz` | N | — | Informational sign-in audit |

### Support table `role_assignments`
Grant/revoke roles with audit.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `user_id` | `uuid` | Y | FK → users.id | Member of workspace |
| `role` | `varchar(40)` | Y | enum: user_role | Controlled role |
| `valid_from` | `timestamptz` | Y | — | Server time |
| `valid_to` | `timestamptz` | N | — | Greater than valid_from |
| `assigned_by_user_id` | `uuid` | Y | FK → users.id | Authorized administrator |

### Support table `client_access_grants`
Row-level scoped access for staff and portal members.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Client scoping |
| `user_id` | `uuid` | Y | FK → users.id | Authenticated identity |
| `access_role` | `varchar(40)` | Y | enum: user_role | Cannot exceed user's workspace role |
| `is_active` | `boolean` | Y | — | Default true |
| `reason` | `varchar(250)` | N | — | Required for access exceptions |
| `expires_at` | `timestamptz` | N | — | Access expires automatically |
| `approved_by_user_id` | `uuid` | Y | FK → users.id | Access grant approval |

### Support table `mfd_branches`
Multiple branches with explicit FK to MFD.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Org-scoped parent |
| `branch_code` | `varchar(40)` | Y | — | Unique per MFD |
| `name` | `varchar(160)` | Y | — | Branch display name |
| `city` | `varchar(100)` | Y | — | City |
| `state` | `varchar(100)` | N | — | State |
| `postal_code` | `varchar(16)` | N | — | Postal code string |
| `active` | `boolean` | Y | — | Default true |

### Support table `mfd_registrations`
Support multiple ARNs and other registrations without overwrites.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Parent MFD |
| `registration_type` | `varchar(30)` | Y | enum: registration_type | ARN/EUIN/other; model entity-owner distinctions |
| `registration_no` | `varchar(80)` | Y | — | Unique only after business-specific validation |
| `verified_at` | `timestamptz` | N | — | External verification evidence required |
| `verified_by_user_id` | `uuid` | N | FK → users.id | Verifier |
| `valid_from` | `date` | N | — | Effective validity date |
| `valid_to` | `date` | N | — | Must be on/after valid_from |

### Support table `consent_records`
Purpose-specific processing / recording permission.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Associated MFD |
| `person_id` | `uuid` | N | FK → mfd_contacts.id | Specific person where applicable |
| `purpose` | `varchar(120)` | Y | — | E.g. session_recording, transcription, third_party_ai |
| `notice_version` | `varchar(32)` | Y | — | Exact notice shown |
| `consent_basis` | `varchar(40)` | Y | enum: consent_basis | Requires privacy/legal validation |
| `is_granted` | `boolean` | Y | — | Default false |
| `recorded_at` | `timestamptz` | Y | — | Server audit time |
| `granted_at` | `timestamptz` | N | — | Set when authorized |
| `withdrawn_at` | `timestamptz` | N | — | Revocation time; blocks future processing where applicable |
| `evidence_document_id` | `uuid` | N | FK → document_records.id | Permission proof if available |

### Support table `assessment_questions`
Immutable after template publish; eligibility rules versioned.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `template_id` | `uuid` | Y | FK → assessment_templates.id | Locked to template version |
| `question_key` | `varchar(50)` | Y | — | Stable identifier in template, unique |
| `revision` | `integer` | Y | — | Positive |
| `section_name` | `varchar(150)` | Y | — | Readable group |
| `dimension` | `varchar(50)` | Y | enum: assessment_dimension | Seven functions plus overlays |
| `question_text` | `text` | Y | — | Exact text shown to respondent |
| `answer_type` | `varchar(40)` | Y | enum: answer_type | Client renderer validator |
| `required` | `boolean` | Y | — | Default false |
| `options_json` | `jsonb` | N | — | For select lists only; stable option IDs |
| `visibility_rule_json` | `jsonb` | N | — | Declarative conditional rules, no executable JS |
| `weight` | `numeric(8,4)` | N | — | Nonnegative; scheme-specific |
| `order_no` | `integer` | Y | — | Positive; sort within section |
| `status` | `varchar(30)` | Y | enum: question_status | Do not mutate published revision |

### Support table `assessment_answers`
Append-only response changes; validate JSON by answer_type.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Must match assessment |
| `assessment_id` | `uuid` | Y | FK → assessments.id | Placeholder fixed in parser |
| `question_id` | `uuid` | Y | FK → assessment_questions.id | Must belong to issued template version |
| `respondent_contact_id` | `uuid` | N | FK → mfd_contacts.id | Attributable client respondent |
| `respondent_user_id` | `uuid` | N | FK → users.id | Consultant-assisted respondent when appropriate |
| `response_json` | `jsonb` | N | — | Validated against question answer_type and options |
| `response_state` | `varchar(30)` | Y | enum: answer_state | Correction appends a new row |
| `original_text` | `text` | N | — | Verbatim if provided; not rewritten by AI |
| `submitted_at` | `timestamptz` | N | — | Actual submission |
| `supersedes_answer_id` | `uuid` | N | FK → assessment_answers.id | Self FK; preserve earlier entry |
| `skip_reason` | `text` | N | — | Required for skippable question when no answer |

### Support table `assessment_response_events`
Response correction / review trail.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `assessment_answer_id` | `uuid` | Y | FK → assessment_answers.id | Event owner |
| `actor_user_id` | `uuid` | Y | FK → users.id | Actor |
| `entity_event` | `varchar(60)` | Y | — | Submitted, corrected, reviewed or voided |
| `occurred_at` | `timestamptz` | Y | — | Server generated |
| `details_json` | `jsonb` | N | — | Reason, accepted evidence refs |

### Support table `scoring_schemes`
Published scoring formulas immutable and testable.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `scheme_code` | `varchar(50)` | Y | — | Unique workspace+code+version |
| `version` | `integer` | Y | — | Positive, immutable after publish |
| `rubric_json` | `jsonb` | Y | — | Validated scoring rubric |
| `weights_json` | `jsonb` | Y | — | Weights normalized per published rules |
| `status` | `varchar(40)` | Y | enum: assessment_template_status | Published version locked |
| `published_at` | `timestamptz` | N | — | Set at approval |
| `published_by_user_id` | `uuid` | N | FK → users.id | Authoritative approval |

### Support table `scorecard_dimension_scores`
Cross-functional scorecard breakdown.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `scorecard_id` | `uuid` | Y | FK → maturity_scorecards.id | Parent scorecard |
| `dimension` | `varchar(50)` | Y | enum: assessment_dimension | Dimension |
| `answers_eligible` | `integer` | Y | — | Parser replaces leading typo |
| `answers_count` | `integer` | Y | — | Nonnegative |
| `raw_score` | `numeric(12,4)` | N | — | Raw scored sum |
| `normalized_score` | `numeric(10,4)` | N | — | Per scoring scheme |
| `coverage_pct` | `numeric(5,2)` | N | — | 0..100 |
| `evidence_count` | `integer` | Y | — | Default 0, nonnegative |

### Support table `meeting_attendees`
Either contact or member; not both.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `session_id` | `uuid` | Y | FK → consulting_sessions.id | Parent meeting |
| `contact_id` | `uuid` | N | FK → mfd_contacts.id | Exactly one contact or member |
| `member_id` | `uuid` | N | FK → team_members.id | Exactly one contact or member |
| `role` | `varchar(80)` | N | — | Facilitator, observer, speaker, decision maker |
| `attendance_state` | `varchar(30)` | Y | enum: attendance_state | Default invited |

### Support table `transcript_segments`
Timestamp-level searchable transcript records with immutable correction trail.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `media_record_id` | `uuid` | Y | FK → media_records.id | Approved media parent and organization |
| `sequence_no` | `integer` | Y | — | Unique per recording; >= 0 |
| `start_ms` | `bigint` | Y | — | Nonnegative timestamp offset |
| `end_ms` | `bigint` | Y | — | Must be strictly greater than start_ms |
| `speaker_label` | `varchar(120)` | N | — | Speaker identification may be uncertain |
| `text_content` | `text` | Y | — | Raw transcript segment; protect sensitive content |
| `confidence_score` | `numeric(5,4)` | N | — | 0..1 when supplied by engine |
| `human_reviewed_at` | `timestamptz` | N | — | Correction and confidence provenance |
| `corrected_text` | `text` | N | — | Reviewer correction kept alongside raw content |

### Support table `engagement_staff_assignments`
Team members and responsibilities per engagement.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `engagement_id` | `uuid` | Y | FK → consulting_engagements.id | Parent engagement |
| `member_id` | `uuid` | Y | FK → team_members.id | Consultant with MFD grant |
| `responsibility` | `varchar(150)` | Y | — | Named responsibility or function |
| `assigned_at` | `timestamptz` | Y | — | Server timestamp |
| `revoked_at` | `timestamptz` | N | — | Greater than assignment |

### Support table `mfd_departments`
Client organization structure and department ownership.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `mfd_org_id` | `uuid` | Y | FK → mfd_organizations.id | Organization owner |
| `branch_id` | `uuid` | N | FK → mfd_branches.id | Branch in same MFD |
| `parent_department_id` | `uuid` | N | FK → mfd_departments.id | No structural cycles |
| `department_name` | `varchar(160)` | Y | — | Unique in branch when active |
| `head_contact_id` | `uuid` | N | FK → mfd_contacts.id | Same MFD |
| `headcount` | `integer` | N | — | Nonnegative, as-of metadata preferred |
| `active` | `boolean` | Y | — | Default true |

### Support table `task_dependencies`
Block loops with DAG validation.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `task_id` | `uuid` | Y | FK → action_tasks.id | Dependent task |
| `depends_on_task_id` | `uuid` | Y | FK → action_tasks.id | Must not be self, prevent cycles |
| `dependency_type` | `varchar(40)` | Y | enum: dependency_type | Default blocking |

### Support table `project_milestones`
Milestone history and project completion rollup.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `project_id` | `uuid` | Y | FK → delivery_projects.id | Project parent |
| `title` | `varchar(250)` | Y | — | Milestone title |
| `status` | `varchar(30)` | Y | enum: milestone_status | Verification based completion |
| `planned_due_at` | `timestamptz` | N | — | Target completion |
| `actual_done_at` | `timestamptz` | N | — | Set on verified completion |
| `acceptance_criteria` | `text` | Y | — | Definition of done |
| `verified_by_member_id` | `uuid` | N | FK → team_members.id | Completion approver |
| `verified_at` | `timestamptz` | N | — | Set when verified |

### Support table `sop_versions`
Immutable published SOP version.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `sop_id` | `uuid` | Y | FK → process_sop_register.id | Parent process |
| `version_no` | `integer` | Y | — | Unique per SOP |
| `document_id` | `uuid` | Y | FK → document_records.id | Immutable referenced document |
| `change_summary` | `text` | N | — | Version differences |
| `status` | `varchar(40)` | Y | enum: sop_status | Published snapshots immutable |
| `approved_by_contact_id` | `uuid` | N | FK → mfd_contacts.id | Authorized MFD owner |
| `approved_at` | `timestamptz` | N | — | Signoff event |

### Support table `training_attendance`
Actual attendance, not only a count.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `training_id` | `uuid` | Y | FK → training_events.id | Training parent |
| `contact_id` | `uuid` | Y | FK → mfd_contacts.id | Attendee same MFD |
| `attendance_state` | `varchar(30)` | Y | enum: attendance_state | Actual attendance |
| `feedback_score` | `numeric(5,2)` | N | — | 0..5 |
| `quiz_score` | `numeric(5,2)` | N | — | 0..100 |
| `adoption_check_at` | `timestamptz` | N | — | Follow-up |

### Support table `decision_approvals`
Approver authorization and event-level audit.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `decision_id` | `uuid` | Y | FK → decisions.id | Parent decision |
| `approver_contact_id` | `uuid` | N | FK → mfd_contacts.id | Exactly one contact or member |
| `approver_member_id` | `uuid` | N | FK → team_members.id | Exactly one contact or member |
| `actor_type` | `varchar(30)` | Y | enum: approval_actor_type | Must match actual actor |
| `status` | `varchar(30)` | Y | enum: approval_status | Append events for revisions |
| `comment` | `text` | N | — | Approval rationale |
| `actioned_at` | `timestamptz` | N | — | Time of approval |
| `evidence_document_id` | `uuid` | N | FK → document_records.id | Approval proof |

### Support table `file_objects`
Object storage key only; never persist public URL.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `mfd_org_id` | `uuid` | N | FK → mfd_organizations.id | May be workspace-level file |
| `storage_key` | `varchar(800)` | Y | — | Private object key, never exposed as public URL |
| `original_filename` | `varchar(255)` | Y | — | Safe display only, sanitize path text |
| `sha256` | `char(64)` | Y | — | Content hash |
| `mime_type` | `varchar(100)` | Y | — | Server-checked content signature |
| `size_bytes` | `bigint` | Y | — | Positive and under policy size cap |
| `scan_status` | `varchar(30)` | Y | enum: file_scan_status | Require clean prior to access |
| `encryption_key_ref` | `varchar(255)` | N | — | KMS key identifier only |
| `uploaded_by_user_id` | `uuid` | Y | FK → users.id | Uploader identity |

### Support table `document_versions`
Immutable binary version references.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `document_id` | `uuid` | Y | FK → document_records.id | Parent document |
| `version_no` | `integer` | Y | — | Unique per document |
| `file_object_id` | `uuid` | Y | FK → file_objects.id | Private, scanned storage object |
| `uploaded_at` | `timestamptz` | Y | — | Server timestamp |
| `uploaded_by_user_id` | `uuid` | Y | FK → users.id | Uploader |
| `change_note` | `text` | N | — | Change details |

### Support table `document_links`
Typed targets checked in service; guard same tenant / org.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `document_id` | `uuid` | Y | FK → document_records.id | Document |
| `entity_type` | `varchar(50)` | Y | enum: entity_link_type | Allowed typed attachment target |
| `entity_id` | `uuid` | Y | — | Validated in API with entity table + workspace + MFD |
| `linked_at` | `timestamptz` | Y | — | Server timestamp |
| `linked_by_user_id` | `uuid` | Y | FK → users.id | Link creator |

### Support table `communication_participants`
Recipient/copy and sender parties.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `communication_id` | `uuid` | Y | FK → communications.id | Parent communication |
| `contact_id` | `uuid` | N | FK → mfd_contacts.id | Exactly one contact or member |
| `member_id` | `uuid` | N | FK → team_members.id | Exactly one contact or member |
| `participant_role` | `varchar(40)` | Y | — | Sender, recipient, cc, mention |

### Support table `kpi_definitions`
Versioned KPI semantics and comparable time-series.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `metric_code` | `varchar(80)` | Y | — | Workspace unique together with version |
| `version` | `integer` | Y | — | Positive, immutable on use |
| `name` | `varchar(220)` | Y | — | Human friendly metric title |
| `unit` | `varchar(20)` | Y | enum: unit_code | Canonical reporting unit |
| `formula` | `text` | N | — | Documented expression only; no untrusted eval |
| `aggregation_rule` | `varchar(120)` | Y | — | Sum, end-of-period, weighted, ratio etc validated |
| `sign_rule` | `varchar(120)` | Y | — | signed or nonnegative declared |
| `evidence_policy` | `text` | N | — | Documents/source requirements |
| `active_from` | `date` | Y | — | Start use |

### Support table `payment_allocations`
Support partial / multiple payments; never fake allocation.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `billing_record_id` | `uuid` | Y | FK → billing_records.id | Invoice/payment allocation target |
| `payment_reference` | `varchar(150)` | Y | — | Unique with source provider when available |
| `amount` | `numeric(18,2)` | Y | — | Positive allocated amount |
| `received_at` | `timestamptz` | Y | — | Payment timestamp |
| `source_system` | `varchar(80)` | N | — | Zoho Books, other accounting system |

### Support table `approval_audit_events`
Append-only approvals and state transitions.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `entity_type` | `varchar(60)` | Y | — | Approved entity type |
| `entity_id` | `uuid` | Y | — | Target checked in API |
| `actor_user_id` | `uuid` | Y | FK → users.id | Approver identity |
| `old_state` | `varchar(50)` | N | — | State before |
| `new_state` | `varchar(50)` | Y | — | State after |
| `event_at` | `timestamptz` | Y | — | UTC timestamp |
| `evidence_document_id` | `uuid` | N | FK → document_records.id | Proof when relevant |

### Support table `audit_events`
Append-only immutable system change trail.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `user_id` | `uuid` | N | FK → users.id | Null for system events; system identity also logged |
| `entity_table` | `varchar(100)` | Y | — | Changed table |
| `entity_id` | `uuid` | Y | — | Changed record |
| `action` | `varchar(60)` | Y | — | create/update/archive/approve/read_sensitive/download etc |
| `changed_columns` | `jsonb` | N | — | Masked values; never record passwords/tokens |
| `recorded_at` | `timestamptz` | Y | — | Append only, UTC |
| `ip_class` | `varchar(80)` | N | — | Privacy-aware client/source classification |

### Support table `outbox_events`
Transactional outbox for reliable async jobs.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `event_type` | `varchar(100)` | Y | — | Domain event name |
| `aggregate_id` | `uuid` | Y | — | Related entity |
| `payload_json` | `jsonb` | Y | — | Sanitized, minimum required event payload |
| `state` | `varchar(30)` | Y | enum: outbox_state | Default pending |
| `published_at` | `timestamptz` | N | — | Delivery confirmation |
| `retry_count` | `integer` | Y | — | Default 0, nonnegative |
| `idempotency_key` | `varchar(128)` | Y | — | Unique scoped message identity |

### Support table `notification_deliveries`
Delivery and retry tracking.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `recipient_user_id` | `uuid` | Y | FK → users.id | Notify authorized user |
| `template_code` | `varchar(100)` | Y | — | Message template |
| `channel` | `varchar(40)` | Y | enum: communication_channel | Email/portal/etc |
| `state` | `varchar(30)` | Y | enum: notification_state | Default queued |
| `attempted_at` | `timestamptz` | N | — | Last attempt |
| `provider_message_id` | `varchar(180)` | N | — | Dedupe/trace |

### Support table `retention_holds`
Prevent purge when preservation is authorized/required.

| Column | SQL Type | Required | Enum / FK | Rule |
|---|---|:---:|---|---|
| `id` | `uuid` | Y | — | Primary key; UUID generated by server |
| `workspace_id` | `uuid` | Y | FK → workspaces.id | Workspace-scoped physical row |
| `created_at` | `timestamptz` | Y | — | Server-generated UTC timestamp |
| `mfd_org_id` | `uuid` | N | FK → mfd_organizations.id | Optional scope |
| `entity_type` | `varchar(80)` | Y | — | Held record type |
| `entity_id` | `uuid` | Y | — | Held record |
| `reason` | `text` | Y | — | Authorized reason |
| `status` | `varchar(30)` | Y | enum: retention_hold_status | Default active |
| `placed_at` | `timestamptz` | Y | — | Server timestamp |
| `placed_by_user_id` | `uuid` | Y | FK → users.id | Authorized holder |
| `released_at` | `timestamptz` | N | — | Authorized release |

## Global validation rules

- **GV-01 [Database policy + API]:** All reads/writes bound to authenticated workspace; no cross-tenant FK.
- **GV-02 [API + DB]:** Never accept client-provided system audit fields.
- **GV-03 [API + DB]:** Compare expected version on writes; reject outdated changes.
- **GV-04 [DB + API]:** All linked records must share workspace and MFD ID; enforce via composite keys or transaction checks.
- **GV-05 [API + policy]:** Archives do not physically remove related evidence; retention and holds override purge.
- **GV-06 [API]:** Trim and normalize appropriately; escape rendered content, parameterize SQL.
- **GV-07 [Storage service]:** Antivirus scan, MIME signature checks, size caps by policy, encryption, signed short-lived download authorization.
- **GV-08 [API + DB RLS]:** Least-privilege ABAC/RBAC + client grant checks on each access, not only UI.
- **GV-09 [Service + DB]:** Enforce explicit state transitions; log actor, time and reason for reopen/reject/approve.
- **GV-10 [Service]:** Use per-class retention policy and legal hold; confirm deletion request through configured process.
- **GV-11 [API + outbox]:** Async jobs and provider webhooks use idempotency keys; no duplicate communications/tasks.
- **GV-12 [API]:** Store instants as UTC timestamptz; display using viewer timezone; business dates stored as date.

## Permissions

Permission symbols: C=create; R=read; U=update; A=archive; P=approve; E=export; `-`=none. This is an upper limit: identity, workspace, MFD access grant, field classification, document classification, record sharing and active engagement authorization all must pass.

| Module | platform_admin | aina_admin | director | consulting_head | senior_consultant | consultant | analyst | sales | finance_ops | client_owner | client_manager | auditor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| leads | CRUAPE | CRUAPE | RPE | RU | R | - | - | CRU | - | - | - | R |
| mfd_organizations | CRUAPE | CRUAPE | RPE | CRUPE | CRU | R | R | R | R | R | - | R |
| mfd_contacts | CRUAPE | CRUAPE | RPE | CRUPE | CRU | R | R | R | R | R | - | R |
| sales_opportunities | CRUAPE | CRUAPE | RPE | RU | R | - | - | CRU | - | - | - | R |
| consulting_engagements | CRUAPE | CRUAPE | RPE | CRUPE | CRU | R | R | R | R | R | - | R |
| business_profiles | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | R | - | R |
| assessment_templates | CRUAPE | CRUAPE | RPE | CRUPE | CRU | R | R | - | - | - | - | R |
| assessments | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | CRU | CRU | R |
| findings | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | R | - | R |
| maturity_scorecards | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | R | - | R |
| consulting_sessions | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | R | - | R |
| action_tasks | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | CRU | CRU | R |
| delivery_projects | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | R | R | R |
| process_sop_register | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | R | R | R |
| training_events | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | R | R | R |
| decisions | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | - | - | - | CRU | - | R |
| media_records | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | - | - | - | - | - | R |
| document_records | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | - | - | - | R | R | R |
| communications | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | - | - | - | - | - | R |
| kpi_observations | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | CRU | - | - | R | - | R |
| review_reports | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | CRU | - | - | R | R | R |
| improvements | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | CRU | - | - | R | - | R |
| team_members | CRUAPE | CRUAPE | RPE | RU | R | - | - | - | - | - | - | - |
| risks_dependencies | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | - | - | R |
| billing_records | CRUAPE | CRUAPE | RPE | R | R | - | - | - | CRUPE | - | - | R |
| support_requests | CRUAPE | CRUAPE | RPE | CRUPE | CRU | CRU | R | - | - | CRU | CRU | R |

## Schema/indexing/authorization decisions

1. Prefer compound indexes such as `(workspace_id, mfd_org_id, status)` after measuring query plans. Put workspace and MFD scoping in composite FKs or enforced validated service transactions; plain UUID lookups alone are inadequate.
2. Eventual consistency is only for derived aggregates and notifications. Approvals, financial records, uploaded file scan state and assessment versioning are transactional.
3. Keep `document_versions`, `assessment_answers`, approvals, KPI corrections and audit logs append-only.
4. Use workload-proven table partitioning only when volume demands it; start with ordinary PostgreSQL tables.
5. Use an identity provider (OIDC + MFA), short sessions, credential rotation, per-organization client access grants, and step-up access for sensitive exports.
6. Model a change of MFD or workspace as exceptional audited data migration, not ordinary update.
7. Reporting data must preserve period, unit, original source, verification and revision.


## Index proposals

| Table | Index keys | Kind | Why |
|---|---|---|---|
| ALL | workspace_id | btree | tenant filter; usually composite with scoped key |
| ALL | id | primary key | uuid primary key |
| mfd_organizations | workspace_id, org_code | unique | canonical human reference |
| mfd_organizations | workspace_id, lower(legal_name) | btree | search not uniqueness due to naming variants |
| mfd_contacts | mfd_org_id WHERE is_primary_contact AND status_active | partial unique | one active primary per MFD |
| team_members | workspace_id, lower(work_email) | unique | case-normalized workspace uniqueness |
| assessment_templates | workspace_id, template_code, template_version | unique | immutable version |
| assessments | mfd_org_id, status, due_at | btree | assessment queue |
| assessment_answers | assessment_id, question_id, submitted_at DESC | btree | full response history |
| business_profiles | mfd_org_id, as_of_date DESC, profile_version DESC | btree | point-in-time history |
| consulting_sessions | mfd_org_id, starts_at DESC | btree | session timeline |
| action_tasks | mfd_org_id, status, due_at | btree | tasks by client |
| action_tasks | assigned_member_id, status, due_at | btree | personal work queue |
| document_versions | document_id, version_no | unique | no version collisions |
| file_objects | workspace_id, sha256 | btree | sensible dedupe, not shared file access |
| kpi_observations | mfd_org_id, kpi_definition_id, period_start, revision_number | btree | time series + corrections |
| communications | workspace_id, provider_name, external_message_id WHERE external_message_id IS NOT NULL | unique | webhook idempotency |
| audit_events | workspace_id, recorded_at DESC | btree | compliance and incident trace |
| client_access_grants | workspace_id, mfd_org_id, user_id | btree | authorization checks |

## Automations

| Code | Trigger | Job | Guardrails | Phase |
|---|---|---|---|---|
| AUT-01 | lead.qualified | Create discovery task assigned to sales/consultant | Lead assigned; dedupe key lead/status/version | P1 |
| AUT-02 | opportunity.won | Draft consulting engagement and intake checklist | Never activate without signed evidence | P1 |
| AUT-03 | engagement.activated | Create standard kickoff sessions, document requests and initial tasks | Template selected; idempotent event | P1 |
| AUT-04 | session.completed | Request meeting minutes and consent-safe transcript review | No automatic publishing of AI summary | P1 |
| AUT-05 | task.due_breached | Notify assignee; escalate by priority and owner-party | Respect business hours, idempotency, repeat windows | P1 |
| AUT-06 | media.uploaded | Scan file; check purpose consent; transcribe only when enabled | Quarantine / non-public storage until scan clean | P1 |
| AUT-07 | assessment.issued | Invite respondent with expiring scoped token | Never leak other MFD records | P2 |
| AUT-08 | assessment.submitted | Calculate completeness; assign human reviewer; request missing evidence | Do not overwrite response | P2 |
| AUT-09 | assessment.approved | Draft findings, compute versioned scores and create review tasks | Human approval before client-visible recommendations | P2 |
| AUT-10 | finding.accepted | Generate proposed actions from playbook | No automatic claim of implementation | P2 |
| AUT-11 | sop.published | Notify required staff, schedule adoption verification | Authorization + document version locked | P3 |
| AUT-12 | training.completed | Request attendance / feedback and follow-up adoption evidence | Trainer sign-off and participant validation | P3 |
| AUT-13 | scope_change.approved | Create implementation change task and contract amendment review | Check commercial approval chain | P3 |
| AUT-14 | month.closed | Request KPI snapshot and prepare review draft | Missing data stays null; no invented zero | P4 |
| AUT-15 | kpi.corrected | Supersede observation and recalc impacted reports | Retain prior published versions | P4 |
| AUT-16 | engagement.renewal_due | Create renewal review task and commercial notification | Use configured notice date | P1 |

## Acceptance tests

- **AT-01 (P0):** Cross-client isolation — Consultant A cannot query/guess ID or download a file belonging to unassigned MFD B.
- **AT-02 (P0):** Role access — Finance user cannot see transcripts; client portal cannot see consultant-only notes.
- **AT-03 (P0):** Optimistic concurrency — Simultaneous updates with same version return conflict on second update.
- **AT-04 (P0):** Audit immutability — Every mutation records actor, timestamp and diff; normal users cannot edit audit events.
- **AT-05 (P0):** Private file access — Uploaded file quarantined until scan clean; only short-lived authorized download.
- **AT-06 (P1):** Lead conversion — Conversion creates/link MFD and preserves full history without duplicates.
- **AT-07 (P1):** Consulting session trail — Session with participants, consent, recording and tasks resolves correctly in MFD 360 view.
- **AT-08 (P1):** Task completion — Task cannot reach completed without accepted verification evidence and verifier.
- **AT-09 (P1):** Agreement activation — Active engagement rejected if contract evidence/sponsor missing without approved exception.
- **AT-10 (P2):** Template immutability — Published question text/scoring cannot mutate; new version explicitly created.
- **AT-11 (P2):** Response correction — Corrected answer preserves prior text, actor, timestamp and linked reason.
- **AT-12 (P2):** Scorecard reproducibility — Same input answers and scoring version regenerate same score.
- **AT-13 (P3):** SOP sign-off — Published SOP creates immutable version, authorized sign-off and adoption check.
- **AT-14 (P3):** Change control — Scope expansion cannot be implemented under existing fee without authorization.
- **AT-15 (P4):** KPI revisions — Old KPI reading persists and is referenced when correction posted.
- **AT-16 (P4):** Benefit caution — Improvement claim without comparable KPI or evidence remains hypothesis/observed, not validated.

## Engineering handoff checklist

1. Approve product roles and MFD client portal scope.
2. Finalize retention periods and purpose-specific consent policy.
3. Approve questions, scoring rubric, versioning and verification owners.
4. Approve monetary definitions, business KPIs and their data provenance.
5. Generate PostgreSQL DDL and OpenAPI from signed dictionary using versioned migrations.
6. Complete role/RLS and IDOR tests before importing client records.
7. Pilot first real MFD client, verify audit evidence, then expand.
