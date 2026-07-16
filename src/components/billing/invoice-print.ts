import { formatMoney, amountToWords } from "@/lib/utils";
import { sellerFromDocument, type CompanyProfile, type InvoiceDetail } from "@/components/billing/types";

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function nl2br(s: string) {
  return esc(s).replace(/\n/g, "<br/>");
}

function fmtDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** Representative GST rate if all lines share one, else null. */
function commonRate(invoice: InvoiceDetail): number | null {
  const rates = new Set(invoice.items.map((i) => i.gstRate));
  return rates.size === 1 ? [...rates][0] : null;
}

/**
 * Builds the print-ready TAX INVOICE HTML matching the Zoho-style layout.
 * The footer (totals, amount in words, notes, signature) is kept together and
 * flows to a new page if the item list overflows the first page.
 */
export interface DocRenderOptions {
  /** Add page padding for on-screen preview (no @page margins apply there). */
  padded?: boolean;
  /** Auto-trigger the browser print dialog on load (print flow only). */
  autoPrint?: boolean;
}

export function buildInvoiceHtml(invoice: InvoiceDetail, company: CompanyProfile | null, opts: DocRenderOptions = {}) {
  const { autoPrint = false } = opts;
  const rate = commonRate(invoice);
  const igstLabel = rate !== null ? `IGST${rate % 1 === 0 ? rate : rate.toFixed(2)}` : "IGST";
  const ratePct = rate !== null ? `${rate % 1 === 0 ? rate : rate.toFixed(2)}%` : "";

  const rows = invoice.items
    .map((it, idx) => {
      const gst = Math.round(it.lineTotal * (it.gstRate / 100) * 100) / 100;
      const descLines = it.description.split("\n");
      const title = esc(descLines[0] ?? "");
      const sub = descLines.slice(1).join("\n");
      return `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>
          <div class="item-name">${title}</div>
          ${sub ? `<div class="item-sub">${nl2br(sub)}</div>` : ""}
        </td>
        <td>${esc(it.hsnSac ?? "")}</td>
        <td class="r">${it.qty.toFixed(2)}</td>
        <td class="r">${formatMoney(it.unitPrice).replace("₹", "")}</td>
        <td class="r">${formatMoney(gst).replace("₹", "")}<div class="pct">${it.gstRate}%</div></td>
        <td class="r">${formatMoney(it.lineTotal).replace("₹", "")}</td>
      </tr>`;
    })
    .join("");

  // Prefer the document's own snapshotted seller, falling back to the company profile.
  const seller = sellerFromDocument(invoice, company);
  const companyBlock = `
      ${seller.logoDataUrl ? `<img class="logo" src="${seller.logoDataUrl}" alt="logo" />` : ""}
      <div class="co-name">${esc(seller.name || invoice.department?.name || "Your Company")}</div>
      ${seller.address ? `<div class="co-line">${nl2br(seller.address)}</div>` : ""}
      ${seller.gstin ? `<div class="co-line">GSTIN ${esc(seller.gstin)}</div>` : ""}
      ${seller.phone ? `<div class="co-line">${esc(seller.phone)}</div>` : ""}
      ${seller.email ? `<div class="co-line">${esc(seller.email)}</div>` : ""}
      ${seller.website ? `<div class="co-line">${esc(seller.website)}</div>` : ""}`;

  const signatureBlock = `
    <div class="sign">
      ${seller.signatureDataUrl ? `<img class="sign-img" src="${seller.signatureDataUrl}" alt="signature" />` : `<div class="sign-space"></div>`}
      <div class="sign-line"></div>
      <div class="sign-cap">${esc(seller.signatory || "Authorized Signature")}</div>
    </div>`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice ${esc(invoice.invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html { -ms-overflow-style: none; scrollbar-width: none; }
  html::-webkit-scrollbar { display: none; }
  /* Print uses @page margins; on-screen preview and rasterized PDF need the margin baked into the body. */
  body { font-family: Helvetica, Arial, sans-serif; color: #2b2b2b; font-size: 12px; margin: 0; background: #fff; padding: ${autoPrint ? "0" : "14mm"}; }
  /* Fill the printable A4 area so the footer sits at the bottom even with few items. */
  .page { display: flex; flex-direction: column; min-height: 269mm; }
  .content { flex: 0 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { max-height: 46px; max-width: 200px; margin-bottom: 8px; display: block; }
  .co-name { font-weight: 700; font-size: 13px; }
  .co-line { color: #444; line-height: 1.5; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 1px; color: #1a1a1a; }
  .doc-num { color: #555; margin-top: 2px; }
  .bal-box { margin-top: 14px; }
  .bal-box .lbl { color: #666; font-size: 11px; }
  .bal-box .val { font-size: 15px; font-weight: 700; }
  .parties { display: flex; justify-content: space-between; margin-top: 22px; gap: 24px; }
  .party-label { color: #34557a; font-weight: 600; margin-bottom: 3px; }
  .strong { font-weight: 700; }
  .muted { color: #555; line-height: 1.5; }
  .meta { text-align: right; min-width: 220px; }
  .meta div { display: flex; justify-content: space-between; gap: 20px; padding: 1px 0; }
  .meta .k { color: #666; }
  .meta .v { font-weight: 600; }
  .pos { margin-top: 16px; }
  .subject { margin-top: 10px; }
  .subject .party-label { margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  thead th { background: #3c3c3c; color: #fff; font-weight: 600; padding: 8px 8px; text-align: left; font-size: 11px; }
  thead th.r { text-align: right; }
  thead th.c { text-align: center; width: 26px; }
  tbody td { padding: 8px 8px; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
  tbody td.r { text-align: right; }
  tbody td.c { text-align: center; color: #666; }
  .item-name { font-weight: 500; }
  .item-sub { color: #8a8a8a; font-size: 10.5px; margin-top: 2px; white-space: pre-line; }
  .pct { color: #7aa06a; font-size: 10px; }
  .footer { break-inside: avoid; page-break-inside: avoid; margin-top: auto; padding-top: 12px; }
  .totals { width: 300px; margin-left: auto; margin-top: 10px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 8px; }
  .totals .row.grand { border-top: 1px solid #ccc; font-weight: 700; }
  .totals .row.bal { background: #efefef; font-weight: 700; margin-top: 2px; }
  .words { margin-top: 16px; }
  .words .party-label { display: inline; }
  .words .txt { font-style: italic; font-weight: 600; }
  .notes-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; gap: 24px; }
  .notes .party-label { margin-bottom: 4px; }
  .sign { text-align: center; min-width: 200px; }
  .sign-img { max-height: 46px; max-width: 180px; display: block; margin: 0 auto 2px; }
  .sign-space { height: 46px; }
  .sign-line { border-top: 1px solid #999; width: 190px; margin: 0 auto; }
  .sign-cap { color: #444; margin-top: 4px; font-size: 11px; }
</style>
</head>
<body>
 <div class="page">
  <div class="content">
  <div class="head">
    <div class="co">${companyBlock}</div>
    <div class="doc-title">
      <h1>TAX INVOICE</h1>
      <div class="doc-num"># ${esc(invoice.invoiceNumber)}</div>
      <div class="bal-box">
        <div class="lbl">Balance Due</div>
        <div class="val">${formatMoney(invoice.balance)}</div>
      </div>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">Bill To</div>
      <div class="strong">${esc(invoice.clientName)}</div>
      ${invoice.clientAddress ? `<div class="muted">${nl2br(invoice.clientAddress)}</div>` : ""}
      ${invoice.clientGstin ? `<div class="muted">GSTIN ${esc(invoice.clientGstin)}</div>` : ""}
      ${
        invoice.shipToAddress || invoice.shipToGstin
          ? `<div class="party-label" style="margin-top:12px">Ship To</div>
             ${invoice.shipToAddress ? `<div class="muted">${nl2br(invoice.shipToAddress)}</div>` : ""}
             ${invoice.shipToGstin ? `<div class="muted">GSTIN ${esc(invoice.shipToGstin)}</div>` : ""}`
          : ""
      }
    </div>
    <div class="meta">
      <div><span class="k">Invoice Date :</span><span class="v">${fmtDate(invoice.invoiceDate)}</span></div>
      ${invoice.terms ? `<div><span class="k">Terms :</span><span class="v">${esc(invoice.terms)}</span></div>` : ""}
      ${invoice.dueDate ? `<div><span class="k">Due Date :</span><span class="v">${fmtDate(invoice.dueDate)}</span></div>` : ""}
      ${invoice.poNumber ? `<div><span class="k">P.O.# :</span><span class="v">${esc(invoice.poNumber)}</span></div>` : ""}
    </div>
  </div>

  ${invoice.placeOfSupply ? `<div class="pos"><span class="muted">Place Of Supply: ${esc(invoice.placeOfSupply)}</span></div>` : ""}
  ${invoice.subject ? `<div class="subject"><div class="party-label">Subject :</div><div>${esc(invoice.subject)}</div></div>` : ""}

  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>Item &amp; Description</th>
        <th>HSN/SAC</th>
        <th class="r">Qty</th>
        <th class="r">Rate</th>
        <th class="r">${esc(igstLabel.replace(/IGST\d.*/, "IGST"))}</th>
        <th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  </div>

  <div class="footer">
    <div class="totals">
      <div class="row"><span>Sub Total</span><span>${formatMoney(invoice.subtotal).replace("₹", "")}</span></div>
      <div class="row"><span>${esc(igstLabel)} ${ratePct ? `(${ratePct})` : ""}</span><span>${formatMoney(invoice.gstAmount).replace("₹", "")}</span></div>
      <div class="row grand"><span>Total</span><span>${formatMoney(invoice.total)}</span></div>
      <div class="row bal"><span>Balance Due</span><span>${formatMoney(invoice.balance)}</span></div>
    </div>

    <div class="words">
      <span class="party-label">Total In Words :</span>
      <span class="txt">${esc(amountToWords(invoice.total))}</span>
    </div>

    <div class="notes-row">
      <div class="notes">
        ${invoice.notes ? `<div class="party-label">Notes</div><div class="muted">${nl2br(invoice.notes)}</div>` : ""}
      </div>
      ${signatureBlock}
    </div>
  </div>
 </div>

  ${
    autoPrint
      ? `<script>
    window.onload = function () {
      var imgs = Array.prototype.slice.call(document.images);
      var pending = imgs.filter(function (i) { return !i.complete; }).length;
      function go() { window.focus(); window.print(); }
      if (pending === 0) { go(); return; }
      imgs.forEach(function (i) {
        if (i.complete) return;
        i.addEventListener('load', function () { if (--pending === 0) go(); });
        i.addEventListener('error', function () { if (--pending === 0) go(); });
      });
    };
  </script>`
      : ""
  }
</body>
</html>`;

  return html;
}

/** Opens the invoice in a print-ready window; the user saves it as a PDF. */
export function printInvoice(invoice: InvoiceDetail, company: CompanyProfile | null) {
  const html = buildInvoiceHtml(invoice, company, { autoPrint: true });
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
