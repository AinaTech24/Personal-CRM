import type { Metadata } from "next";
import Image from "next/image";
import { AssessmentConsole } from "@/components/consulting/assessment-console";
import { RespondentSubmit } from "@/components/consulting/respondent-submit";
import { db } from "@/lib/db";
import { loadAnswerSheet } from "@/lib/mfd/answer-sheet";
import { resolveRespondent } from "@/lib/mfd/respondent";
import { getRec } from "@/lib/mfd/store";

export const metadata: Metadata = { title: "Business diagnostic — Aina", robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:py-12">
      <Image src="/logo.png" alt="Aina" width={96} height={32} className="h-8 w-auto self-start" priority />
      {children}
    </main>
  );
}

/**
 * Public answer sheet for one assessment, reached only through the client
 * contact's signed, expiring link (AUT-07). Shows that assessment's
 * questions and the respondent's own answers — nothing else.
 */
export default async function RespondPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await resolveRespondent(token).catch(() => null);
  if (!session) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">This link isn&apos;t valid any more</h1>
        <p className="text-muted-foreground">It may have expired or been replaced. Ask your Aina consultant to send you a new one.</p>
      </Shell>
    );
  }
  const { asm } = session;
  const [org, contact, sheet] = await Promise.all([
    getRec(db, "mfd_organizations", asm.mfd_org_id as string, asm.workspace_id as string),
    getRec(db, "mfd_contacts", session.contactId, asm.workspace_id as string),
    loadAnswerSheet(asm, true),
  ]);
  const due = asm.due_at ? new Date(asm.due_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : null;
  const url = `/api/respond/${token}`;

  return (
    <Shell>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{(org?.brand_name ?? org?.legal_name) as string}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Business diagnostic</h1>
        <p className="text-sm text-muted-foreground">
          {contact?.full_name ? `For ${contact.full_name as string} · ` : ""}
          {asm.assessment_number as string}
          {due ? ` · due ${due}` : ""}
        </p>
      </div>
      {session.open ? (
        <>
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Rate each statement for how your business works <em>today</em>, from 1 (depends on the founder / not in place) to 5 (technology-enabled and continuously improving).
            Answers save as you go — you can close this page and come back with the same link.
          </p>
          <AssessmentConsole
            assessmentId={asm.id as string}
            canAnswer
            respondentView
            questions={sheet.questions}
            answers={sheet.answers}
            endpoint={{ url, extra: { op: "answer" } }}
          />
          <div className="flex justify-end">
            <RespondentSubmit url={url} />
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-border bg-card p-4 text-sm">Thank you — your answers have been submitted. Your Aina consultant will review them with you.</p>
      )}
    </Shell>
  );
}
