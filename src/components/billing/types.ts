export type QuotationStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED";
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "PARTIAL_PAYMENT" | "OVERDUE" | "CANCELLED";

export interface LineItem {
  description: string;
  hsnSac?: string | null;
  qty: number;
  unitPrice: number;
  gstRate: number;
  lineTotal?: number;
}

export interface CompanyProfile {
  id: string;
  name: string;
  addressLines: string | null;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  signatoryName: string | null;
  logoDataUrl: string | null;
  signatureDataUrl: string | null;
}

/** Per-document seller (company) header, snapshotted onto each invoice/quotation. */
export interface SellerInfo {
  name: string;
  address: string;
  gstin: string;
  phone: string;
  email: string;
  website: string;
  signatory: string;
  logoDataUrl: string | null;
  signatureDataUrl: string | null;
}

export function emptySeller(): SellerInfo {
  return { name: "", address: "", gstin: "", phone: "", email: "", website: "", signatory: "", logoDataUrl: null, signatureDataUrl: null };
}

/** Pre-fills seller fields from the global company profile. */
export function sellerFromProfile(p: CompanyProfile | null): SellerInfo {
  if (!p) return emptySeller();
  return {
    name: p.name ?? "",
    address: p.addressLines ?? "",
    gstin: p.gstin ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    website: p.website ?? "",
    signatory: p.signatoryName ?? "",
    logoDataUrl: p.logoDataUrl ?? null,
    signatureDataUrl: p.signatureDataUrl ?? null,
  };
}

/** Seller fields as stored on a document (invoice/quotation). */
export interface DocumentSellerFields {
  sellerName: string | null;
  sellerAddress: string | null;
  sellerGstin: string | null;
  sellerPhone: string | null;
  sellerEmail: string | null;
  sellerWebsite: string | null;
  sellerSignatory: string | null;
  sellerLogoDataUrl: string | null;
  sellerSignatureDataUrl: string | null;
}

/** Reads a document's snapshotted seller into a SellerInfo, falling back to the profile. */
export function sellerFromDocument(doc: Partial<DocumentSellerFields>, profile: CompanyProfile | null): SellerInfo {
  const base = sellerFromProfile(profile);
  const has =
    doc.sellerName ||
    doc.sellerAddress ||
    doc.sellerGstin ||
    doc.sellerLogoDataUrl ||
    doc.sellerPhone ||
    doc.sellerEmail ||
    doc.sellerWebsite;
  if (!has) return base;
  return {
    name: doc.sellerName ?? "",
    address: doc.sellerAddress ?? "",
    gstin: doc.sellerGstin ?? "",
    phone: doc.sellerPhone ?? "",
    email: doc.sellerEmail ?? "",
    website: doc.sellerWebsite ?? "",
    signatory: doc.sellerSignatory ?? "",
    logoDataUrl: doc.sellerLogoDataUrl ?? null,
    signatureDataUrl: doc.sellerSignatureDataUrl ?? null,
  };
}

/** Maps SellerInfo to the API payload field names. */
export function sellerToPayload(s: SellerInfo) {
  return {
    sellerName: s.name || null,
    sellerAddress: s.address || null,
    sellerGstin: s.gstin || null,
    sellerPhone: s.phone || null,
    sellerEmail: s.email || null,
    sellerWebsite: s.website || null,
    sellerSignatory: s.signatory || null,
    sellerLogoDataUrl: s.logoDataUrl,
    sellerSignatureDataUrl: s.signatureDataUrl,
  };
}

export interface Department {
  id: string;
  name: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER";
}

export interface QuotationSummary {
  id: string;
  quotationNumber: string;
  clientName: string;
  clientEmail: string | null;
  status: QuotationStatus;
  subtotal: number;
  gstAmount: number;
  discount: number;
  total: number;
  validUntil: string | null;
  currentVersion: number;
  department: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  _count: { items: number; invoices: number };
}

export interface QuotationVersionItem {
  id: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

export interface QuotationApprovalItem {
  id: string;
  decision: string;
  comment: string | null;
  decidedAt: string;
  approver: { id: string; name: string };
}

export interface QuotationDetail extends DocumentSellerFields {
  id: string;
  quotationNumber: string;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string | null;
  clientGstin: string | null;
  shipToAddress: string | null;
  shipToGstin: string | null;
  placeOfSupply: string | null;
  subject: string | null;
  notes: string | null;
  status: QuotationStatus;
  subtotal: number;
  gstAmount: number;
  discount: number;
  total: number;
  validUntil: string | null;
  currentVersion: number;
  department: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  lead: { id: string; name: string } | null;
  items: (LineItem & { id: string; lineTotal: number })[];
  versions: QuotationVersionItem[];
  approvals: QuotationApprovalItem[];
  invoices: { id: string; invoiceNumber: string; status: InvoiceStatus }[];
  createdAt: string;
}

export interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string | null;
  status: InvoiceStatus;
  subtotal: number;
  gstAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  invoiceDate: string;
  dueDate: string | null;
  department: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  _count: { items: number };
}

export interface PaymentItem {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
  recordedBy: { id: string; name: string };
}

export interface InvoiceDetail extends DocumentSellerFields {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string | null;
  clientGstin: string | null;
  shipToAddress: string | null;
  shipToGstin: string | null;
  status: InvoiceStatus;
  subtotal: number;
  gstAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  invoiceDate: string;
  dueDate: string | null;
  terms: string | null;
  poNumber: string | null;
  placeOfSupply: string | null;
  subject: string | null;
  notes: string | null;
  department: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  quotation: { id: string; quotationNumber: string } | null;
  items: (LineItem & { id: string; lineTotal: number })[];
  payments: PaymentItem[];
  createdAt: string;
}

export const QUOTATION_STATUSES: { value: QuotationStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
];

/** Statuses a user may set directly on a quotation; APPROVED/REJECTED go through the approval flow. */
export const QUOTATION_EDITABLE_STATUSES: { value: QuotationStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "EXPIRED", label: "Expired" },
];

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL_PAYMENT", label: "Partial payment" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** Statuses a user may set directly on an invoice; PAID/PARTIAL/OVERDUE are derived from payments. */
export const INVOICE_EDITABLE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const QUOTATION_STATUS_VARIANT: Record<QuotationStatus, "secondary" | "default" | "success" | "destructive" | "warning"> = {
  DRAFT: "secondary",
  SENT: "default",
  APPROVED: "success",
  REJECTED: "destructive",
  EXPIRED: "warning",
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, "secondary" | "default" | "success" | "destructive" | "warning"> = {
  DRAFT: "secondary",
  SENT: "default",
  PAID: "success",
  PARTIAL_PAYMENT: "warning",
  OVERDUE: "destructive",
  CANCELLED: "secondary",
};

export function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}
