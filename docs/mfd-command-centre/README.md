# MFD Command Centre — implementation notes

The AINA MFD Consulting CRM from `technical-spec.md` + `field-dictionary.json`, built inside this app at **/consulting** on the existing stack (Next.js, MySQL, Prisma, existing login).

## What's here

| Spec | Implementation |
|---|---|
| 26 modules, 31 support tables, 1,004 fields | `scripts/mfd/generate.mjs` turns the dictionary into 57 Prisma models (`Cc*`, tables `cc_*`, appended to `prisma/schema.prisma` between markers) and a typed catalog (`src/lib/mfd/catalog.generated.ts`). |
| 82 picklists / 481 values | Stored as varchar, validated on every write against the catalog. |
| GV-01..12 global rules | `src/lib/mfd/engine.ts` — the single read/write path: workspace scoping, server-owned audit fields, `row_version` locking (409 on stale, 428 if missing), same-MFD references, archive instead of delete, role + grant checks, explicit status transitions, idempotent outbox. |
| Module validation rules (LEAD-01 … SUP-03) | `src/lib/mfd/rules.ts`, rule IDs in the messages. |
| 12 roles × CRUAPE matrix, record scope | `src/lib/mfd/access.ts`. Company Super Admin = `platform_admin`, Admin = `aina_admin`; everyone else via **Role assignments**; MFD data via **MFD access grants**. Workspace-wide: platform/aina admin, director, auditor. |
| Field classification | Restricted / Sensitive / Confidential fields are blanked in responses and exports by role (`canSeeField`). |
| Audit, approval trail | `cc_audit_events` (every mutation, classified values recorded as "changed" only), `cc_approval_audit_events` (every status change). Cc tables are excluded from the company-wide AuditLog. |
| REST API | `/api/v1/{resource}` (list, `?lookup=1`, `?format=csv`, create), `/api/v1/{resource}/{id}` (get, PATCH, DELETE for link rows only), `/api/v1/{resource}/{id}/{action}`, `/api/v1/files/{id}`, `/api/v1/me`, `/api/v1/users`, `/api/v1/automations/run`, `/api/v1/setup`. Resource slugs are the spec's (`mfd-organizations`, `action-tasks`, …). |
| Workflow actions | `src/lib/mfd/actions.ts`: lead **convert** (AT-06), template/scheme **publish** + **new-version** (AT-10), assessment **issue / answer / submit / start-review / approve / reopen** (append-only answers, corrections need a reason — AT-11), scorecard **calculate** (AT-12), KPI **correct** (AT-15), document/media **upload**, **archive/unarchive**. |
| Automations AUT-01..16 | `src/lib/mfd/automations.ts` — outbox processor + jobs. They only draft work (tasks, draft engagements/scorecards/findings/reviews, document requests) and notify; nothing is approved or shared automatically. |
| Files (GV-07, AT-05) | `src/lib/mfd/storage.ts` — 10 MB cap, extension allowlist, content-signature check, executables/scripts rejected → `quarantined`; bytes AES-256-GCM encrypted in `cc_file_blobs`; downloads only via a 120-second, user-bound HMAC link, re-checked against a record the user can read. |
| UI | `/consulting` overview, per-module lists (search, status, archive filter, CSV), create/edit forms generated from the dictionary, record pages with workflow buttons, child records, file panel, history, **MFD 360** on each organization (AT-07), and the assessment answer sheet. |
| Kit content | **Install AINA diagnostic template** (overview page, admins) creates scoring scheme `AINA-MATURITY` v1 and template `AINA-DIAG` v1 — the kit's 7 Functions + 10 Systems audits, 65 checkpoints on the 1–5 maturity ladder — both published. |

## Acceptance tests

Unit tests: `src/lib/mfd/mfd.test.ts` (catalog/config consistency, normalization, access, scoring, file scanning, download tokens). Exercised end-to-end against a local database: AT-01 (other MFD's org/document/file → 404), AT-02 (finance can't read recordings/transcripts/sessions), AT-03 (stale update → 409), AT-05, AT-06, AT-07, AT-09 (ENG-02/03), AT-10, AT-11, AT-12, BILL-01/02 and the AUT-01/02/03/08/09 chains.

## Deliberate differences from the spec (current stack)

- **MySQL instead of PostgreSQL**: `uuid` → `varchar(191)`, `jsonb` → `json`, `timestamptz` → `datetime(3)` in UTC. No row-level security in MySQL; isolation is enforced in the one engine path (every query is built from `scopeWhere`).
- **No Prisma relations**: foreign keys are indexed columns, checked by the engine (existence, same workspace, same MFD, not archived).
- **Object storage**: files live encrypted in MySQL (`cc_file_blobs`). Swap `putBlob/getBlob` in `storage.ts` for S3-compatible storage later.
- **Malware scanning**: built-in checks only (allowlist, signatures, executables, script content). Plug ClamAV into `scanBytes()` for full AV.
- **Login**: the existing login. OIDC/MFA and the MFD client portal (respondent tokens for AUT-07) are follow-ups; for now consultants enter answers in consultant-assisted mode.
- **Job queue**: the outbox runs in-process right after each write, plus the scheduled sweep below — no separate worker.
- **AUT-01**: a lead has no MFD before conversion, so the discovery step is scheduled as the lead's next follow-up (a task is created when the lead already has an MFD).
- **AUT-06**: transcription isn't wired to a provider; the job checks consent and notifies.

## Deploying

1. Deploy as usual — the build's `prisma db push` adds the 59 `cc_*` tables (additive only).
2. Schedule the time-based automations (AUT-05 overdue tasks, AUT-14 month close, AUT-16 renewals), e.g. hourly:
   `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<host>/api/v1/automations/run`
3. As an Admin open **MFD Command Centre** → **Install AINA diagnostic template**.
4. Add the consulting team under **Internal Consulting Team**, give each person a role under **Role assignments**, and grant MFD access under **MFD access grants** (or on the organization's page).

## Changing the dictionary

```
python scripts/mfd/xlsx-to-json.py <Field_Dictionary.xlsx> docs/mfd-command-centre/field-dictionary.json
node scripts/mfd/generate.mjs
```
Never run `prisma format` on the whole schema (it reflows existing models). Then update `module-config.ts` / `rules.ts` if new tables or rules appear — `mfd.test.ts` fails on any config that references a missing column.
