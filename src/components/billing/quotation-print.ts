import { formatMoney, amountToWords } from "@/lib/utils";
import { sellerFromDocument, type CompanyProfile, type QuotationDetail } from "@/components/billing/types";

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
function commonRate(q: QuotationDetail): number | null {
  const rates = new Set(q.items.map((i) => i.gstRate));
  return rates.size === 1 ? [...rates][0] : null;
}

/** Builds the print-ready QUOTATION HTML (mirrors the tax-invoice layout). */
export function buildQuotationHtml(
  q: QuotationDetail,
  company: CompanyProfile | null,
  opts: { padded?: boolean; autoPrint?: boolean } = {}
) {
  const { autoPrint = false } = opts;
  const rate = commonRate(q);
  const igstLabel = rate !== null ? `IGST${rate % 1 === 0 ? rate : rate.toFixed(2)}` : "IGST";
  const ratePct = rate !== null ? `${rate % 1 === 0 ? rate : rate.toFixed(2)}%` : "";

  const rows = q.items
    .map((it, idx) => {
      const gst = Math.round(it.lineTotal * (it.gstRate / 100) * 100) / 100;
      const descLines = it.description.split("\n");
      const title = esc(descLines[0] ?? "");
      const sub = descLines.slice(1).join("\n");
      return `
      <tr>
        <td class="c">${idx + 1}</td>
        <td><div class="item-name">${title}</div>${sub ? `<div class="item-sub">${nl2br(sub)}</div>` : ""}</td>
        <td>${esc(it.hsnSac ?? "")}</td>
        <td class="r">${it.qty.toFixed(2)}</td>
        <td class="r">${formatMoney(it.unitPrice).replace("₹", "")}</td>
        <td class="r">${formatMoney(gst).replace("₹", "")}<div class="pct">${it.gstRate}%</div></td>
        <td class="r">${formatMoney(it.lineTotal).replace("₹", "")}</td>
      </tr>`;
    })
    .join("");

  const seller = sellerFromDocument(q, company);
  const companyBlock = `
      ${seller.logoDataUrl ? `<img class="logo" src="${seller.logoDataUrl}" alt="logo" />` : ""}
      <div class="co-name">${esc(seller.name || q.department?.name || "Your Company")}</div>
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

  const discountRow = q.discount > 0 ? `<div class="row"><span>Discount</span><span>− ${formatMoney(q.discount).replace("₹", "")}</span></div>` : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Quotation ${esc(q.quotationNumber)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html { -ms-overflow-style: none; scrollbar-width: none; }
  html::-webkit-scrollbar { display: none; }
  body { font-family: Helvetica, Arial, sans-serif; color: #2b2b2b; font-size: 12px; margin: 0; background: #fff; padding: ${autoPrint ? "0" : "14mm"}; }
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
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  thead th { background: #3c3c3c; color: #fff; font-weight: 600; padding: 8px; text-align: left; font-size: 11px; }
  thead th.r { text-align: right; }
  thead th.c { text-align: center; width: 26px; }
  tbody td { padding: 8px; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
  tbody td.r { text-align: right; }
  tbody td.c { text-align: center; color: #666; }
  .item-name { font-weight: 500; }
  .item-sub { color: #8a8a8a; font-size: 10.5px; margin-top: 2px; white-space: pre-line; }
  .pct { color: #7aa06a; font-size: 10px; }
  .footer { break-inside: avoid; page-break-inside: avoid; margin-top: auto; padding-top: 12px; }
  .totals { width: 300px; margin-left: auto; margin-top: 10px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 8px; }
  .totals .row.grand { border-top: 1px solid #ccc; font-weight: 700; }
  .words { margin-top: 16px; }
  .words .txt { font-style: italic; font-weight: 600; }
  .notes-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; gap: 24px; }
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
      <h1>QUOTATION</h1>
      <div class="doc-num"># ${esc(q.quotationNumber)}</div>
      <div class="bal-box"><div class="lbl">Total</div><div class="val">${formatMoney(q.total)}</div></div>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">Quotation For</div>
      <div class="strong">${esc(q.clientName)}</div>
      ${q.clientEmail ? `<div class="muted">${esc(q.clientEmail)}</div>` : ""}
      ${q.clientAddress ? `<div class="muted">${nl2br(q.clientAddress)}</div>` : ""}
      ${q.clientGstin ? `<div class="muted">GSTIN ${esc(q.clientGstin)}</div>` : ""}
      ${
        q.shipToAddress || q.shipToGstin
          ? `<div class="party-label" style="margin-top:12px">Ship To</div>
             ${q.shipToAddress ? `<div class="muted">${nl2br(q.shipToAddress)}</div>` : ""}
             ${q.shipToGstin ? `<div class="muted">GSTIN ${esc(q.shipToGstin)}</div>` : ""}`
          : ""
      }
    </div>
    <div class="meta">
      <div><span class="k">Date :</span><span class="v">${fmtDate(q.createdAt)}</span></div>
      ${q.validUntil ? `<div><span class="k">Valid Until :</span><span class="v">${fmtDate(q.validUntil)}</span></div>` : ""}
      <div><span class="k">Version :</span><span class="v">v${q.currentVersion}</span></div>
    </div>
  </div>

  ${q.placeOfSupply ? `<div class="pos"><span class="muted">Place Of Supply: ${esc(q.placeOfSupply)}</span></div>` : ""}
  ${q.subject ? `<div class="subject"><div class="party-label">Subject :</div><div>${esc(q.subject)}</div></div>` : ""}

  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>Item &amp; Description</th>
        <th>HSN/SAC</th>
        <th class="r">Qty</th>
        <th class="r">Rate</th>
        <th class="r">IGST</th>
        <th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  </div>

  <div class="footer">
    <div class="totals">
      <div class="row"><span>Sub Total</span><span>${formatMoney(q.subtotal).replace("₹", "")}</span></div>
      <div class="row"><span>${esc(igstLabel)} ${ratePct ? `(${ratePct})` : ""}</span><span>${formatMoney(q.gstAmount).replace("₹", "")}</span></div>
      ${discountRow}
      <div class="row grand"><span>Total</span><span>${formatMoney(q.total)}</span></div>
    </div>

    <div class="words">
      <span class="party-label">Total In Words :</span>
      <span class="txt">${esc(amountToWords(q.total))}</span>
    </div>

    <div class="notes-row">
      <div class="notes"><div class="party-label">Notes</div><div class="muted">${q.notes ? nl2br(q.notes) : `This quotation is valid${q.validUntil ? ` until ${fmtDate(q.validUntil)}` : ""}.`}</div></div>
      ${signatureBlock}
    </div>
  </div>
 </div>
  ${
    autoPrint
      ? `<script>window.onload=function(){var imgs=[].slice.call(document.images);var p=imgs.filter(function(i){return !i.complete;}).length;function go(){window.focus();window.print();}if(p===0){go();return;}imgs.forEach(function(i){if(i.complete)return;i.addEventListener('load',function(){if(--p===0)go();});i.addEventListener('error',function(){if(--p===0)go();});});};</script>`
      : ""
  }
</body>
</html>`;

  return html;
}

/** Opens the quotation in a print-ready window. */
export function printQuotation(q: QuotationDetail, company: CompanyProfile | null) {
  const html = buildQuotationHtml(q, company, { autoPrint: true });
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
