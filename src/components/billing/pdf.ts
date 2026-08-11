import { buildInvoiceHtml } from "@/components/billing/invoice-print";
import { buildQuotationHtml } from "@/components/billing/quotation-print";
import type { CompanyProfile, InvoiceDetail, QuotationDetail } from "@/components/billing/types";
import { downloadHtmlAsPdf } from "@/lib/html-to-pdf";

export async function downloadInvoicePdf(invoice: InvoiceDetail, company: CompanyProfile | null) {
  const html = buildInvoiceHtml(invoice, company, { padded: false, autoPrint: false });
  await downloadHtmlAsPdf(html, `${invoice.invoiceNumber}.pdf`);
}

export async function downloadQuotationPdf(q: QuotationDetail, company: CompanyProfile | null) {
  const html = buildQuotationHtml(q, company, { padded: false, autoPrint: false });
  await downloadHtmlAsPdf(html, `${q.quotationNumber}.pdf`);
}
