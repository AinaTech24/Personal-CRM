/**
 * Shares a document via the Web Share API when available, otherwise copies a
 * deep link to the clipboard. Returns "shared" | "copied" | "failed".
 */
export async function shareDocument(opts: {
  kind: "invoice" | "quotation";
  id: string;
  number: string;
  clientName: string;
  amountLabel: string;
}): Promise<"shared" | "copied" | "failed"> {
  const url = `${window.location.origin}/${opts.kind === "invoice" ? "invoices" : "quotations"}?${opts.kind}=${opts.id}`;
  const title = `${opts.kind === "invoice" ? "Invoice" : "Quotation"} ${opts.number}`;
  const text = `${title} — ${opts.clientName} — ${opts.amountLabel}`;

  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title, text, url });
      return "shared";
    } catch {
      // user cancelled or share failed — fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
