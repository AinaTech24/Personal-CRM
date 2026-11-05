import { db } from "@/lib/db";

export interface CompanyBrand {
  name: string;
  logoDataUrl: string | null;
}

/** Shared across every outgoing email so the header/logo stays consistent. */
export async function getCompanyBrand(): Promise<CompanyBrand> {
  const company = await db.companyProfile.findUnique({ where: { id: "default" } }).catch(() => null);
  return { name: company?.name || "Aina CRM", logoDataUrl: company?.logoDataUrl ?? null };
}

/** The red CTA button every templated email uses for its main action link. */
export function emailButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;padding:10px 20px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">${label}</a>`;
}

/**
 * Wraps a template's body in the shared header (company logo/name, red accent
 * border) and footer (automated-message disclaimer) so every transactional
 * email looks like it came from the same system instead of each hand-rolling
 * its own div.
 */
export function emailLayout(opts: { brand: CompanyBrand; heading: string; bodyHtml: string; footerNote?: string }): string {
  const { brand, heading, bodyHtml, footerNote } = opts;
  const logo = brand.logoDataUrl
    ? `<img src="${brand.logoDataUrl}" alt="${brand.name}" style="max-height:48px;max-width:180px;object-fit:contain;" />`
    : `<div style="font-size:20px;font-weight:700;color:#111;">${brand.name}</div>`;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
    <div style="padding:20px 0;border-bottom:2px solid #dc2626;">${logo}</div>
    <h2 style="margin:24px 0 4px;">${heading}</h2>
    ${bodyHtml}
    <p style="margin:28px 0 0;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px;">
      ${footerNote ?? `This is an automated message from ${brand.name}. Please don't reply directly to this email.`}
    </p>
  </div>`;
}
