import type { ActionDef } from "./action-bar";
import type { Row } from "@/lib/mfd/ui-types";

type Rule = ActionDef & { when: (r: Row) => boolean; perm: "U" | "C" | "P" };

const st = (r: Row, ...s: string[]) => s.includes(r.status as string);

/** The workflow actions each table offers, and when (server re-checks everything). */
const ACTIONS: Record<string, Rule[]> = {
  leads: [
    {
      action: "convert",
      label: "Convert to MFD",
      variant: "default",
      perm: "U",
      then: "org",
      when: (r) => st(r, "new", "contact_attempted", "connected", "qualified"),
      prompts: [
        { name: "mfd_org_id", label: "Link to an existing MFD (optional)", type: "lookup", url: "/api/v1/mfd-organizations?lookup=1", help: "Leave empty to create a new MFD organization and its first contact from this lead." },
        { name: "force_new", label: "Duplicates", type: "checkbox", help: "Create a new MFD even if one with the same name/email exists" },
      ],
    },
  ],
  assessment_templates: [
    { action: "publish", label: "Publish", variant: "default", perm: "P", when: (r) => st(r, "draft", "under_review"), confirm: "Publishing locks the question bank — changes then need a new version." },
    { action: "new-version", label: "New version", perm: "C", then: "result", when: (r) => st(r, "published", "retired") },
  ],
  scoring_schemes: [
    { action: "publish", label: "Publish", variant: "default", perm: "P", when: (r) => st(r, "draft", "under_review"), confirm: "A published scheme is immutable." },
    { action: "new-version", label: "New version", perm: "C", then: "result", when: (r) => st(r, "published", "retired") },
  ],
  assessments: [
    {
      action: "issue",
      label: "Issue",
      variant: "default",
      perm: "U",
      when: (r) => st(r, "draft"),
      prompts: [{ name: "due_at", label: "Due", type: "datetime" }],
    },
    { action: "submit", label: "Submit responses", variant: "default", perm: "U", when: (r) => st(r, "issued", "in_progress", "reopened"), confirm: "Submit the current answers for review?" },
    {
      action: "start-review",
      label: "Start review",
      variant: "default",
      perm: "U",
      when: (r) => st(r, "submitted"),
      prompts: [{ name: "reviewer_member_id", label: "Reviewer", type: "lookup", url: "/api/v1/team-members?lookup=1", help: "Someone other than the respondent." }],
    },
    {
      action: "approve",
      label: "Approve",
      variant: "default",
      perm: "P",
      when: (r) => st(r, "under_review"),
      prompts: [{ name: "review_notes", label: "Review notes", type: "textarea" }],
    },
    {
      action: "reopen",
      label: "Reopen",
      variant: "outline",
      perm: "U",
      when: (r) => st(r, "submitted", "under_review"),
      prompts: [{ name: "reason", label: "Why is it being reopened?", type: "textarea", required: true }],
    },
  ],
  maturity_scorecards: [{ action: "calculate", label: "Calculate scores", variant: "default", perm: "U", when: (r) => st(r, "draft", "reviewed") }],
  kpi_observations: [
    {
      action: "correct",
      label: "Post correction",
      perm: "C",
      then: "result",
      when: () => true,
      prompts: [
        { name: "value_numeric", label: "Corrected value", type: "number", required: true },
        { name: "reason", label: "Reason", type: "textarea", required: true, help: "The original reading is kept; this adds a new revision that supersedes it." },
      ],
    },
  ],
  document_records: [
    {
      action: "upload",
      label: "Upload file",
      variant: "default",
      perm: "U",
      when: (r) => !st(r, "archived"),
      prompts: [
        { name: "file", label: "File (max 10MB)", type: "file", required: true, help: "Scanned on upload; anything that fails the scan is quarantined and never downloadable." },
        { name: "change_note", label: "Change note", type: "text" },
      ],
    },
  ],
  media_records: [
    {
      action: "upload",
      label: "Upload recording",
      variant: "default",
      perm: "U",
      when: (r) => st(r, "uploaded", "failed"),
      prompts: [{ name: "file", label: "Audio/video or transcript file (max 10MB)", type: "file", required: true }],
    },
  ],
};

export function actionsFor(table: string, rec: Row, codes: string, archivable: boolean): ActionDef[] {
  const out: ActionDef[] = [];
  if (!rec.archived_at) {
    for (const a of ACTIONS[table] ?? []) {
      if (codes.includes(a.perm) && a.when(rec)) {
        const { when: _w, perm: _p, ...def } = a;
        void _w;
        void _p;
        out.push(def);
      }
    }
  }
  if (archivable && codes.includes("A")) {
    out.push(
      rec.archived_at
        ? { action: "unarchive", label: "Restore" }
        : { action: "archive", label: "Archive", variant: "outline", confirm: "Archive this record? It's hidden from lists but kept (records are never deleted)." }
    );
  }
  return out;
}
