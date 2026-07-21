/**
 * Matching @mentions against real people.
 *
 * Splitting on whitespace only ever highlights the first word, so "@Bhavesh
 * Bhoi" lit up "@Bhavesh" and left "Bhoi" as plain text. Names are matched
 * against the actual member list instead, longest first, so a full name wins
 * over the first name it starts with.
 */

export interface MentionablePerson {
  id: string;
  name: string | null;
  surname?: string | null;
}

export function personFullName(p: MentionablePerson) {
  return [p.name, p.surname].filter(Boolean).join(" ").trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type MentionToken =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; person: MentionablePerson };

/**
 * Splits text into plain runs and mention runs.
 *
 * Longest-first ordering matters: with both "Bhavesh" and "Bhavesh Bhoi" in the
 * list, the shorter one would otherwise match first and strand the surname.
 */
export function tokenizeMentions(text: string, people: MentionablePerson[]): MentionToken[] {
  const candidates = people
    .map((p) => ({ person: p, full: personFullName(p), first: (p.name ?? "").trim() }))
    .filter((c) => c.full.length > 0);

  if (candidates.length === 0) return [{ type: "text", value: text }];

  // Every form someone might have typed: full name, and the first name alone.
  const forms: { label: string; person: MentionablePerson }[] = [];
  for (const c of candidates) {
    forms.push({ label: c.full, person: c.person });
    if (c.first && c.first !== c.full) forms.push({ label: c.first, person: c.person });
  }
  forms.sort((a, b) => b.label.length - a.label.length);

  const pattern = forms.map((f) => escapeRegExp(f.label)).join("|");
  // The @ is part of the match so the highlight includes it.
  const re = new RegExp(`@(?:${pattern})`, "gi");

  const tokens: MentionToken[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const matched = match[0];
    const label = matched.slice(1).toLowerCase();
    const person = forms.find((f) => f.label.toLowerCase() === label)?.person;
    if (!person) continue;
    if (match.index > last) tokens.push({ type: "text", value: text.slice(last, match.index) });
    tokens.push({ type: "mention", value: matched, person });
    last = match.index + matched.length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens.length ? tokens : [{ type: "text", value: text }];
}
