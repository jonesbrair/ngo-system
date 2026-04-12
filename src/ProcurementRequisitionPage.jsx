import { useEffect, useRef, useState } from "react";
import { IconBadge } from "./uiIcons";
const PROCUREMENT_STORAGE_KEY = "inspire-youth-procurement-requisitions";
const PO_LPO_THRESHOLD = 500000;
const INSPIRE_YOUTH_LOGO = "https://inspireyouthdev.org/wp-content/uploads/2024/10/cropped-Asset-260.png";
const INSPIRE_YOUTH_ORG = "Inspire Youth For Development";
const INSPIRE_YOUTH_MODULE = "Procurement Module";
const EXECUTIVE_APPROVAL_PENDING = "Awaiting Executive Approval";
const PURCHASE_DOCUMENT_DRAFT = "Draft";
const PDF_PAGE_WIDTH = 1240;
const PDF_PAGE_HEIGHT = 1754;
const PDF_MARGIN_X = 84;
const PDF_MARGIN_TOP = 70;
const PDF_MARGIN_BOTTOM = 84;

function ActionButtonIcon({ name, tone = "navy", size = 14 }) {
  return <IconBadge name={name} tone={tone} size={size} />;
}

const PROCUREMENT_STATUS_META = {
  Draft: { color: "#6b7280", background: "#f3f4f6", border: "1px solid #d1d5db" },
  Submitted: { color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d" },
  "Supervisor Approved": { color: "#1e40af", background: "#dbeafe", border: "1px solid #93c5fd" },
  "Accountant Approved": { color: "#065f46", background: "#d1fae5", border: "1px solid #6ee7b7" },
  "Rejected by Supervisor": { color: "#991b1b", background: "#fee2e2", border: "1px solid #fca5a5" },
  "Rejected by Accountant": { color: "#991b1b", background: "#fee2e2", border: "1px solid #fca5a5" },
};

function loadProcurementRequisitions() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(PROCUREMENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProcurementRequisitions(records) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROCUREMENT_STORAGE_KEY, JSON.stringify(records));
}

function buildActivityOptions(projects = []) {
  const options = [];

  projects.forEach(project => {
    (project.activities || []).forEach(activity => {
      options.push({
        code: activity.code || "",
        label: `${activity.code || "Uncoded"} - ${activity.name || "Untitled Activity"}${project.name ? ` (${project.name})` : ""}`,
      });
    });
  });

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

function createRequestItem(item = {}) {
  return {
    id: item.id || `req-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemDescription: item.itemDescription || "",
    quantity: String(item.quantity || ""),
    estimatedBudget: String(item.estimatedBudget || ""),
  };
}

function normalizeRequestItems(items = []) {
  if (!Array.isArray(items) || !items.length) return [createRequestItem()];
  return items.map(item => createRequestItem(item));
}

function getNormalizedRecordItems(record = {}) {
  if (Array.isArray(record.items) && record.items.length) return normalizeRequestItems(record.items);
  return normalizeRequestItems([{
    itemDescription: record.itemDescription || "",
    quantity: record.quantity || "",
    estimatedBudget: record.estimatedBudget || "",
  }]);
}

function summarizeRequestItems(items = []) {
  const normalizedItems = normalizeRequestItems(items)
    .map(item => ({
      ...item,
      itemDescription: String(item.itemDescription || "").trim(),
      quantity: Number(item.quantity || 0),
      estimatedBudget: Number(item.estimatedBudget || 0),
    }))
    .filter(item => item.itemDescription || item.quantity > 0 || item.estimatedBudget > 0);

  const primaryItem = normalizedItems[0] || { itemDescription: "", quantity: 0, estimatedBudget: 0 };
  const totalBudget = normalizedItems.reduce((sum, item) => sum + Number(item.estimatedBudget || 0), 0);

  return {
    items: normalizedItems,
    primaryItem,
    totalBudget,
    itemCount: normalizedItems.length,
  };
}

function getRequestItemsSummaryText(record = {}) {
  const { items } = summarizeRequestItems(getNormalizedRecordItems(record));
  if (!items.length) return "-";
  if (items.length === 1) return items[0].itemDescription || "-";
  return `${items[0].itemDescription || "Item 1"} +${items.length - 1} more item${items.length - 1 === 1 ? "" : "s"}`;
}

function getSavedUserSignature(currentUser = null) {
  return normalizeSignatureValue(currentUser?.eSignature || null);
}

function createEmptyForm(defaultActivityCode = "", currentUser = null) {
  return {
    items: [createRequestItem()],
    activityCode: defaultActivityCode,
    expectedDeliveryDate: "",
    deliveryLocation: "",
    notes: "",
    requesterSignature: getSavedUserSignature(currentUser),
    samplePhoto: null,
  };
}

function formFromRecord(record, defaultActivityCode = "", currentUser = null) {
  return {
    items: getNormalizedRecordItems(record),
    activityCode: record.activityCode || defaultActivityCode,
    expectedDeliveryDate: record.expectedDeliveryDate || "",
    deliveryLocation: record.deliveryLocation || "",
    notes: record.notes || "",
    requesterSignature: normalizeSignatureValue(record.requesterSignature) || getSavedUserSignature(currentUser),
    samplePhoto: record.samplePhoto || null,
  };
}

function nextRequisitionId(records = []) {
  const maxId = records.reduce((maxValue, record) => {
    const match = String(record.id || "").match(/^PR-(\d+)$/);
    if (!match) return maxValue;
    return Math.max(maxValue, Number(match[1]));
  }, 0);

  return `PR-${String(maxId + 1).padStart(4, "0")}`;
}

function normalizeForm(form) {
  const summary = summarizeRequestItems(form.items);
  return {
    items: summary.items,
    itemDescription: summary.primaryItem.itemDescription || "",
    quantity: Number(summary.primaryItem.quantity || 0),
    estimatedBudget: Number(summary.totalBudget || 0),
    activityCode: String(form.activityCode || "").trim().toUpperCase(),
    expectedDeliveryDate: form.expectedDeliveryDate || "",
    deliveryLocation: String(form.deliveryLocation || "").trim(),
    notes: form.notes.trim(),
    requesterSignature: normalizeSignatureValue(form.requesterSignature),
    samplePhoto: form.samplePhoto || null,
  };
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createRfqProvider(provider = {}) {
  return {
    id: provider.id || `provider-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    companyName: provider.companyName || "",
    email: provider.email || "",
    contactPerson: provider.contactPerson || "",
  };
}

function normalizeRfqProviders(providers = []) {
  if (!Array.isArray(providers) || !providers.length) return [createRfqProvider()];
  return providers.map(provider => createRfqProvider(provider));
}

function getAutoRfqReferenceNumber(record = {}) {
  const cleanId = String(record.id || "REQUEST").replace(/[^A-Z0-9-]/gi, "").toUpperCase();
  return `RFQ-${cleanId}`;
}

function getRfqProviderNames(record = {}) {
  if (Array.isArray(record.rfq?.providers) && record.rfq.providers.length) {
    return record.rfq.providers
      .map(provider => provider.companyName?.trim())
      .filter(Boolean);
  }

  return Array.isArray(record.rfq?.supplierList) ? record.rfq.supplierList.filter(Boolean) : [];
}

function createRfqItem(item = {}, index = 0) {
  return {
    serialNumber: item.serialNumber || index + 1,
    itemDescription: item.itemDescription || "",
    specifications: item.specifications || "",
    quantity: Number(item.quantity || 0),
    amount: item.amount || "",
    totalAmount: item.totalAmount || "",
  };
}

function buildRfqItems(record = {}) {
  if (Array.isArray(record.rfq?.items) && record.rfq.items.length) {
    return record.rfq.items.map((item, index) => createRfqItem(item, index));
  }
  return getNormalizedRecordItems(record).map((item, index) => createRfqItem({
    itemDescription: item.itemDescription || record.rfq?.itemDescription || record.itemDescription || "",
    specifications: record.rfq?.specifications || record.notes || item.itemDescription || "",
    quantity: Number(item.quantity || 0),
  }, index));
}

function buildRfqForm(record = null, currentUser = null) {
  return {
    referenceNumber: record?.rfq?.referenceNumber || (record ? getAutoRfqReferenceNumber(record) : ""),
    providers: normalizeRfqProviders(record?.rfq?.providers),
    submissionDeadline: record?.rfq?.submissionDeadline || "",
    additionalNotes: record?.rfq?.additionalNotes || "",
    procurementOfficerName: record?.rfq?.procurementOfficerName || (currentUser?.role === "procurement_officer" ? currentUser.name : ""),
    procurementOfficerSignature: normalizeSignatureValue(record?.rfq?.procurementOfficerSignature) || getSavedUserSignature(currentUser),
  };
}

function createBidAnalysisProviderRow(provider = {}) {
  return {
    id: provider.id || `bid-provider-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    providerId: provider.providerId || provider.id || "",
    serviceProviderName: provider.serviceProviderName || provider.companyName || "",
    quotedPrice: String(provider.quotedPrice || ""),
    deliveryTime: provider.deliveryTime || "",
    compliance: provider.compliance || "Yes",
    notes: provider.notes || "",
    isBestProvider: Boolean(provider.isBestProvider),
    email: provider.email || "",
    contactPerson: provider.contactPerson || "",
  };
}

function buildBidAnalysisForm(record = null) {
  const baseProviders = record?.bidAnalysis?.providers?.length
    ? record.bidAnalysis.providers
    : (record?.rfq?.providers || []).map(provider => ({
        providerId: provider.id,
        serviceProviderName: provider.companyName,
        email: provider.email,
        contactPerson: provider.contactPerson,
      }));

  return {
    providers: baseProviders.length ? baseProviders.map(provider => createBidAnalysisProviderRow(provider)) : [],
    selectedProviderId: record?.bidAnalysis?.selectedProviderId || "",
    comparisonNotes: record?.bidAnalysis?.comparisonNotes || "",
  };
}

function buildCommitteeMinutesForm(record = null) {
  return record?.committeeMinutes || null;
}

function getSelectedBidAnalysisProvider(record = {}) {
  const providers = Array.isArray(record.bidAnalysis?.providers) ? record.bidAnalysis.providers : [];
  return providers.find(provider => provider.providerId === record.bidAnalysis?.selectedProviderId || provider.id === record.bidAnalysis?.selectedProviderId)
    || providers.find(provider => provider.isBestProvider)
    || null;
}

function nextLpoNumber(records = []) {
  const maxId = records.reduce((maxValue, record) => {
    const match = String(record.purchaseDocument?.lpoNumber || "").match(/^LPO-(\d+)$/i);
    if (!match) return maxValue;
    return Math.max(maxValue, Number(match[1]));
  }, 0);

  return `LPO-${String(maxId + 1).padStart(4, "0")}`;
}

function normalizeExecutiveApprovalStatus(status) {
  if (status === "Awaiting ED Approval") return EXECUTIVE_APPROVAL_PENDING;
  return status || PURCHASE_DOCUMENT_DRAFT;
}

function buildLpoDeliveryTerms(record = {}, provider = null) {
  const parts = [];
  if (provider?.deliveryTime) parts.push(provider.deliveryTime);
  if (record.expectedDeliveryDate) parts.push(`Expected by ${formatDate(record.expectedDeliveryDate)}`);
  if (record.deliveryLocation) parts.push(`Deliver to ${record.deliveryLocation}`);
  return parts.join(" || ") || "As agreed with the selected service provider";
}

function buildLpoForm(record = null, currentUser = null, records = []) {
  if (!record) return null;

  const existingDocument = record.purchaseDocument?.type === "LPO" ? record.purchaseDocument : null;
  const selectedProvider = getSelectedBidAnalysisProvider(record);
  const totalCost = Number(
    existingDocument?.totalCost
    || existingDocument?.amount
    || record.bidAnalysis?.amount
    || selectedProvider?.quotedPrice
    || 0
  );
  const quantity = Number(existingDocument?.quantity || record.quantity || 0);
  const agreedPrice = Number(existingDocument?.agreedPrice || (quantity > 0 ? totalCost / quantity : totalCost));

  return {
    lpoNumber: existingDocument?.lpoNumber || nextLpoNumber(records),
    procurementOfficerName: existingDocument?.procurementOfficerName || (currentUser?.role === "procurement_officer" ? currentUser.name : ""),
    date: existingDocument?.date || todayDateValue(),
    procurementOfficerSignature: normalizeSignatureValue(existingDocument?.procurementOfficerSignature) || getSavedUserSignature(currentUser),
    selectedServiceProvider: existingDocument?.selectedServiceProvider || record.bidAnalysis?.selectedProviderName || selectedProvider?.serviceProviderName || "",
    itemDescription: existingDocument?.itemDescription || record.itemDescription || "",
    quantity: String(quantity || ""),
    agreedPrice: String(agreedPrice || ""),
    totalCost: String(totalCost || ""),
    deliveryTerms: existingDocument?.deliveryTerms || buildLpoDeliveryTerms(record, selectedProvider),
    edStatus: normalizeExecutiveApprovalStatus(existingDocument?.edStatus || PURCHASE_DOCUMENT_DRAFT),
  };
}

function buildGoodsReceivedForm(record = null) {
  return {
    grn: record?.goodsReceived?.grn || "",
    signature: record?.goodsReceived?.signature || "",
    deliveryNote: record?.goodsReceived?.deliveryNote || null,
  };
}

function normalizeStoredAttachment(attachment = null, fallbackName = "Attachment") {
  if (!attachment) return null;

  return {
    id: attachment.id || `${fallbackName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    name: attachment.name || fallbackName,
    size: Number(attachment.size || 0),
    type: attachment.type || "",
    dataUrl: attachment.dataUrl || "",
    uploadedAt: attachment.uploadedAt || null,
  };
}

function normalizeSignatureValue(signature = null) {
  if (!signature) return null;

  if (typeof signature === "string") {
    const trimmed = signature.trim();
    return trimmed ? { type: "typed", value: trimmed } : null;
  }

  if (typeof signature === "object" && typeof signature.value === "string") {
    const trimmed = signature.value.trim();
    if (!trimmed) return null;
    return {
      type: signature.type === "drawn" ? "drawn" : "typed",
      value: trimmed,
    };
  }

  return null;
}

function normalizeQuotationList(record = {}) {
  if (!Array.isArray(record.quotations)) return [];

  return record.quotations.map((quotation, index) => ({
    id: quotation.id || `quotation-${index + 1}`,
    name: quotation.name || `Quotation ${index + 1}`,
    size: Number(quotation.size || 0),
    type: quotation.type || "",
    dataUrl: quotation.dataUrl || "",
    uploadedAt: quotation.uploadedAt || null,
  }));
}

function normalizeBidAnalysis(record = {}) {
  if (!record.bidAnalysis) return null;

  const providers = Array.isArray(record.bidAnalysis.providers)
    ? record.bidAnalysis.providers.map(provider => createBidAnalysisProviderRow(provider))
    : [];
  const selectedProvider = providers.find(provider => provider.providerId === record.bidAnalysis.selectedProviderId || provider.id === record.bidAnalysis.selectedProviderId)
    || providers.find(provider => provider.isBestProvider)
    || null;

  return {
    providers,
    selectedProviderId: record.bidAnalysis.selectedProviderId || selectedProvider?.providerId || selectedProvider?.id || "",
    selectedProviderName: record.bidAnalysis.selectedProviderName || selectedProvider?.serviceProviderName || "",
    amount: Number(record.bidAnalysis.amount || selectedProvider?.quotedPrice || 0),
    comparisonNotes: record.bidAnalysis.comparisonNotes || "",
    savedAt: record.bidAnalysis.savedAt || null,
  };
}

function normalizeCommitteeMinutes(record = {}) {
  return normalizeStoredAttachment(record.committeeMinutes, "Committee Minutes");
}

function normalizePurchaseDocument(record = {}) {
  if (!record.purchaseDocument) return null;

  const type = record.purchaseDocument.type || "PO";
  const selectedProvider = getSelectedBidAnalysisProvider(record);
  const amount = Number(record.purchaseDocument.amount || record.bidAnalysis?.amount || selectedProvider?.quotedPrice || 0);
  const quantity = Number(record.purchaseDocument.quantity || record.quantity || 0);

  return {
    type,
    lpoNumber: record.purchaseDocument.lpoNumber || "",
    selectedServiceProvider: record.purchaseDocument.selectedServiceProvider || record.bidAnalysis?.selectedProviderName || selectedProvider?.serviceProviderName || "",
    itemDescription: record.purchaseDocument.itemDescription || record.itemDescription || "",
    quantity,
    agreedPrice: Number(record.purchaseDocument.agreedPrice || (quantity > 0 ? amount / quantity : amount)),
    totalCost: Number(record.purchaseDocument.totalCost || amount),
    deliveryTerms: record.purchaseDocument.deliveryTerms || buildLpoDeliveryTerms(record, selectedProvider),
    procurementOfficerName: record.purchaseDocument.procurementOfficerName || "",
    date: record.purchaseDocument.date || "",
    procurementOfficerSignature: normalizeSignatureValue(record.purchaseDocument.procurementOfficerSignature),
    amount,
    generatedAt: record.purchaseDocument.generatedAt || null,
    submittedAt: record.purchaseDocument.submittedAt || null,
    edStatus: normalizeExecutiveApprovalStatus(record.purchaseDocument.edStatus || (type === "LPO" ? PURCHASE_DOCUMENT_DRAFT : EXECUTIVE_APPROVAL_PENDING)),
    edDecisionAt: record.purchaseDocument.edDecisionAt || null,
    edDecisionById: record.purchaseDocument.edDecisionById || null,
    edDecisionByName: record.purchaseDocument.edDecisionByName || null,
  };
}

function normalizeGoodsReceived(record = {}) {
  if (!record.goodsReceived) return null;

  return {
    grn: record.goodsReceived.grn || "",
    deliveryNote: normalizeStoredAttachment(record.goodsReceived.deliveryNote, "Delivery Note"),
    signature: record.goodsReceived.signature || "",
    status: record.goodsReceived.status || "Completed",
    completedAt: record.goodsReceived.completedAt || null,
  };
}

function GoodsReceivedStatusPill({ status }) {
  if (!status) return <span className="text-gray">Pending</span>;

  return (
    <span className="sbadge" style={{ background: "#d1fae5", color: "#065f46" }}>
      {status}
    </span>
  );
}

function fileToStoredAttachment(file, prefix = "attachment") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve({
        id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: event.target?.result || "",
        uploadedAt: new Date().toISOString(),
      });
    };
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function fileToStoredQuotation(file) {
  return fileToStoredAttachment(file, "quotation");
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function truncateText(value, maxLength = 120) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function isImageAttachment(attachment) {
  return !!attachment?.type?.startsWith("image/") && !!attachment?.dataUrl;
}

function getSignatureLabel(signature) {
  const normalized = normalizeSignatureValue(signature);
  if (!normalized) return "-";
  return normalized.type === "typed" ? normalized.value : "Drawn e-signature attached";
}

function SignatureValue({ signature, height = 40 }) {
  const normalized = normalizeSignatureValue(signature);

  if (!normalized) return <div style={{ fontWeight: 600 }}>-</div>;

  if (normalized.type === "typed") {
    return (
      <div style={{ fontFamily: "'Roboto', system-ui, sans-serif", fontStyle: "italic", fontSize: 20, color: "#0f2744" }}>
        {normalized.value}
      </div>
    );
  }

  return <img src={normalized.value} alt="Signature" style={{ height, maxWidth: "100%" }} />;
}

function getApprovalHistory(record = {}) {
  if (!Array.isArray(record.approvalHistory)) return [];

  return record
    .approvalHistory
    .filter(Boolean)
    .map((entry, index) => ({
      id: entry.id || `approval-${index + 1}`,
      role: entry.role || "",
      decision: entry.decision || "",
      byId: entry.byId || null,
      byName: entry.byName || "",
      signature: normalizeSignatureValue(entry.signature || null),
      at: entry.at || null,
      note: entry.note || "",
    }))
    .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
}

function getLatestApprovalEntry(record = {}, userId = "", decision = "approved") {
  if (!userId) return null;

  return [...getApprovalHistory(record)]
    .reverse()
    .find(entry => entry.byId === userId && entry.decision === decision) || null;
}

function getApprovalEntryLabel(entry = {}) {
  const roleLabel = getRoleLabel(entry.role);
  const action = entry.decision === "rejected" ? "rejected" : "approved";
  return `${roleLabel} ${action}`;
}

function SignaturePad({ value, onChange }) {
  const normalizedValue = normalizeSignatureValue(value);
  const [mode, setMode] = useState(normalizedValue?.type === "drawn" ? "drawn" : "typed");
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const ctx = useRef(null);

  useEffect(() => {
    if (mode === "typed") return;

    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = 110 * window.devicePixelRatio;
    const context = canvas.getContext("2d");
    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    context.strokeStyle = "#0f2744";
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    ctx.current = context;

    if (normalizedValue?.type === "drawn" && normalizedValue.value) {
      const img = new Image();
      img.onload = () => context.drawImage(img, 0, 0, canvas.offsetWidth, 110);
      img.src = normalizedValue.value;
    }
  }, [mode, normalizedValue?.type, normalizedValue?.value]);

  const getXY = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return [source.clientX - rect.left, source.clientY - rect.top];
  };

  const onStart = (event) => {
    event.preventDefault();
    drawing.current = true;
    const [x, y] = getXY(event);
    ctx.current.beginPath();
    ctx.current.moveTo(x, y);
  };

  const onMove = (event) => {
    event.preventDefault();
    if (!drawing.current) return;
    const [x, y] = getXY(event);
    ctx.current.lineTo(x, y);
    ctx.current.stroke();
  };

  const onEnd = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange({ type: "drawn", value: canvasRef.current.toDataURL() });
  };

  const clear = () => {
    if (ctx.current && canvasRef.current) {
      ctx.current.clearRect(0, 0, canvasRef.current.offsetWidth, 110);
    }
    onChange(null);
  };

  return (
    <div className="sig-pad-wrap">
      <div className="sig-tabs">
        <button type="button" className={`sig-tab ${mode === "typed" ? "active" : ""}`} onClick={() => setMode("typed")}>Type Signature</button>
        <button type="button" className={`sig-tab ${mode === "drawn" ? "active" : ""}`} onClick={() => setMode("drawn")}>Draw Signature</button>
      </div>
      {mode === "typed" ? (
        <input
          className="sig-typed"
          placeholder="Type your full name as signature..."
          value={normalizedValue?.type === "typed" ? normalizedValue.value : ""}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue ? { type: "typed", value: nextValue } : null);
          }}
        />
      ) : (
        <div className="sig-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="sig-canvas"
            style={{ height: 110 }}
            onMouseDown={onStart}
            onMouseMove={onMove}
            onMouseUp={onEnd}
            onMouseLeave={onEnd}
            onTouchStart={onStart}
            onTouchMove={onMove}
            onTouchEnd={onEnd}
          />
          <button type="button" className="btn btn-ghost btn-sm sig-clear" onClick={clear}>Clear</button>
        </div>
      )}
      {normalizedValue && (
        <div className="sig-preview">
          {normalizedValue.type === "typed"
            ? normalizedValue.value
            : <img src={normalizedValue.value} alt="Signature" style={{ height: 40, maxWidth: "100%" }} />}
        </div>
      )}
    </div>
  );
}

function getCompactRecordDetail(record = {}, approvalEntry = null) {
  const parts = [
    record.requesterName && approvalEntry ? `Requester: ${record.requesterName}` : "",
    record.quantity ? `Qty ${record.quantity}` : "",
    Number(record.estimatedBudget) ? `UGX ${formatAmount(record.estimatedBudget)}` : "",
    record.deliveryLocation ? `Delivery: ${record.deliveryLocation}` : "",
    approvalEntry?.at ? `${getApprovalEntryLabel(approvalEntry)} on ${formatDateTime(approvalEntry.at)}` : "",
    !approvalEntry && (record.updatedAt || record.createdAt) ? `Updated ${formatDateTime(record.updatedAt || record.createdAt)}` : "",
  ].filter(Boolean);

  return truncateText(parts.join(" · "), 170);
}

function getDecisionAmount(record = null) {
  if (!record) return 0;
  const bidAmount = Number(record.bidAnalysis?.amount || 0);
  if (bidAmount > 0) return bidAmount;
  return Number(record.estimatedBudget || 0);
}

function getDocumentTypeForRecord(record = null) {
  return getDecisionAmount(record) < PO_LPO_THRESHOLD ? "PO" : "LPO";
}

function normalizeRfq(record = {}) {
  if (!record.rfq) return null;

  return {
    referenceNumber: record.rfq.referenceNumber || getAutoRfqReferenceNumber(record),
    items: buildRfqItems(record),
    itemDescription: record.rfq.itemDescription || record.itemDescription || "",
    quantity: Number(record.rfq.quantity || record.quantity || 0),
    specifications: record.rfq.specifications || record.notes || record.itemDescription || "",
    budget: Number(record.rfq.budget || record.estimatedBudget || 0),
    deliveryDate: record.rfq.deliveryDate || record.expectedDeliveryDate || "",
    providers: normalizeRfqProviders(record.rfq.providers),
    supplierList: Array.isArray(record.rfq.supplierList) ? record.rfq.supplierList.filter(Boolean) : getRfqProviderNames(record),
    submissionDeadline: record.rfq.submissionDeadline || "",
    additionalNotes: record.rfq.additionalNotes || "",
    procurementOfficerName: record.rfq.procurementOfficerName || "",
    procurementOfficerSignature: normalizeSignatureValue(record.rfq.procurementOfficerSignature),
    generatedAt: record.rfq.generatedAt || null,
    status: record.rfq.status || "Draft",
    sentAt: record.rfq.sentAt || null,
  };
}

function getRfqStatusMeta(status) {
  if (status === "Draft") {
    return { bg: "#e2e8f0", color: "#475569" };
  }
  if (status === "RFQ Sent") {
    return { bg: "#d1fae5", color: "#065f46" };
  }

  return { bg: "#dbeafe", color: "#1e40af" };
}

function RfqStatusPill({ status }) {
  if (!status) return <span className="text-gray">Not generated</span>;

  const meta = getRfqStatusMeta(status);
  return (
    <span className="sbadge" style={{ background: meta.bg, color: meta.color }}>
      {status}
    </span>
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPrintBrandStyles() {
  return `
      .brand-header {
        display: flex;
        align-items: center;
        gap: 16px;
        padding-bottom: 18px;
        margin-bottom: 18px;
        border-bottom: 2px solid #dbe4f0;
      }
      .brand-logo {
        width: 68px;
        height: 68px;
        object-fit: contain;
        border-radius: 16px;
        background: #fff;
      }
      .brand-copy {
        flex: 1;
      }
      .brand-org {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: #9a6700;
        margin-bottom: 6px;
      }
      .brand-title {
        font-size: 26px;
        font-weight: 800;
        color: #0f2744;
        margin-bottom: 2px;
      }
      .brand-sub {
        font-size: 13px;
        color: #475569;
      }
  `;
}

function buildPrintBrandHeader(title, subtitle) {
  return `
    <div class="brand-header">
      <img class="brand-logo" src="${INSPIRE_YOUTH_LOGO}" alt="${escapeHtml(INSPIRE_YOUTH_ORG)} logo" />
      <div class="brand-copy">
        <div class="brand-org">${escapeHtml(INSPIRE_YOUTH_ORG)}</div>
        <div class="brand-title">${escapeHtml(title)}</div>
        <div class="brand-sub">${escapeHtml(subtitle || INSPIRE_YOUTH_MODULE)}</div>
      </div>
    </div>
  `;
}

function sanitizeFilenamePart(value) {
  return String(value || "document")
    .trim()
    .split("")
    .map(char => {
      const code = char.charCodeAt(0);
      return (code <= 31 || '<>:"/\\|?*'.includes(char)) ? "-" : char;
    })
    .join("")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "document";
}

function base64ToUint8Array(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatUint8Arrays(chunks = []) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach(chunk => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

function downloadBlob(blob, filename) {
  if (typeof window === "undefined" || !blob) return false;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    window.URL.revokeObjectURL(url);
  }, 0);
  return true;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

function wrapCanvasText(ctx, text, maxWidth) {
  const normalized = String(text || "-").replace(/\r/g, "");
  const paragraphs = normalized.split("\n");
  const lines = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
    } else {
      let currentLine = words[0];
      for (let index = 1; index < words.length; index += 1) {
        const candidate = `${currentLine} ${words[index]}`;
        if (ctx.measureText(candidate).width <= maxWidth) {
          currentLine = candidate;
        } else {
          lines.push(currentLine);
          currentLine = words[index];
        }
      }
      lines.push(currentLine);
    }

    if (paragraphIndex < paragraphs.length - 1) lines.push("");
  });

  return lines.length ? lines : ["-"];
}

function drawWrappedCanvasText(ctx, {
  text,
  x,
  y,
  maxWidth,
  fontSize = 22,
  fontWeight = 400,
  color = "#0f172a",
  lineHeight = 1.45,
  fontFamily = "Arial",
}) {
  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  const lines = wrapCanvasText(ctx, text, maxWidth);
  lines.forEach((line, index) => {
    ctx.fillText(line || " ", x, y + (index * fontSize * lineHeight));
  });
  ctx.restore();
  return lines.length * fontSize * lineHeight;
}

async function renderProcurementReportCanvases(record) {
  const logoImage = await loadImageElement(INSPIRE_YOUTH_LOGO).catch(() => null);
  const signature = normalizeSignatureValue(record.purchaseDocument?.procurementOfficerSignature);
  const signatureImage = signature?.type === "drawn"
    ? await loadImageElement(signature.value).catch(() => null)
    : null;

  const pages = [];
  let canvas = null;
  let ctx = null;
  let cursorY = 0;

  const contentWidth = PDF_PAGE_WIDTH - (PDF_MARGIN_X * 2);
  const bottomLimit = PDF_PAGE_HEIGHT - PDF_MARGIN_BOTTOM;

  const drawPageHeader = () => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);

    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(PDF_MARGIN_X, 28, contentWidth, 120);
    ctx.strokeStyle = "#dbe4f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(PDF_MARGIN_X, 28, contentWidth, 120);

    if (logoImage) {
      ctx.drawImage(logoImage, PDF_MARGIN_X + 20, 46, 80, 80);
    } else {
      ctx.fillStyle = "#0f2744";
      ctx.beginPath();
      ctx.arc(PDF_MARGIN_X + 60, 86, 34, 0, Math.PI * 2);
      ctx.fill();
    }

    drawWrappedCanvasText(ctx, {
      text: INSPIRE_YOUTH_ORG,
      x: PDF_MARGIN_X + 122,
      y: 46,
      maxWidth: contentWidth - 160,
      fontSize: 18,
      fontWeight: 700,
      color: "#9a6700",
    });
    drawWrappedCanvasText(ctx, {
      text: "Procurement Dossier",
      x: PDF_MARGIN_X + 122,
      y: 68,
      maxWidth: contentWidth - 160,
      fontSize: 34,
      fontWeight: 700,
      color: "#0f2744",
    });
    drawWrappedCanvasText(ctx, {
      text: `Reference ${record.id}`,
      x: PDF_MARGIN_X + 122,
      y: 108,
      maxWidth: contentWidth - 160,
      fontSize: 18,
      fontWeight: 400,
      color: "#475569",
    });

    cursorY = 176;
  };

  const addPage = () => {
    canvas = document.createElement("canvas");
    canvas.width = PDF_PAGE_WIDTH;
    canvas.height = PDF_PAGE_HEIGHT;
    ctx = canvas.getContext("2d");
    pages.push(canvas);
    drawPageHeader();
  };

  const ensureSpace = (heightNeeded, repeatTitle = "") => {
    if (!canvas) addPage();
    if (cursorY + heightNeeded <= bottomLimit) return;
    addPage();
    if (repeatTitle) drawSectionTitle(repeatTitle);
  };

  const drawSectionTitle = (title) => {
    ensureSpace(60);
    ctx.fillStyle = "#0f2744";
    ctx.fillRect(PDF_MARGIN_X, cursorY, contentWidth, 34);
    drawWrappedCanvasText(ctx, {
      text: title,
      x: PDF_MARGIN_X + 16,
      y: cursorY + 7,
      maxWidth: contentWidth - 32,
      fontSize: 22,
      fontWeight: 700,
      color: "#ffffff",
    });
    cursorY += 50;
  };

  const drawInfoRows = (rows) => {
    rows.forEach(row => {
      ctx.save();
      ctx.font = "600 16px Arial";
      const labelLines = wrapCanvasText(ctx, row.label, contentWidth - 40);
      ctx.font = "400 22px Arial";
      const valueLines = wrapCanvasText(ctx, row.value, contentWidth - 40);
      ctx.restore();

      const cardHeight = 18 + (labelLines.length * 20) + (valueLines.length * 30) + 18;
      ensureSpace(cardHeight + 12);

      ctx.fillStyle = "#f8fafc";
      ctx.strokeStyle = "#dbe4f0";
      ctx.lineWidth = 1.5;
      ctx.fillRect(PDF_MARGIN_X, cursorY, contentWidth, cardHeight);
      ctx.strokeRect(PDF_MARGIN_X, cursorY, contentWidth, cardHeight);

      drawWrappedCanvasText(ctx, {
        text: row.label,
        x: PDF_MARGIN_X + 16,
        y: cursorY + 14,
        maxWidth: contentWidth - 32,
        fontSize: 16,
        fontWeight: 700,
        color: "#64748b",
      });
      drawWrappedCanvasText(ctx, {
        text: row.value,
        x: PDF_MARGIN_X + 16,
        y: cursorY + 14 + (labelLines.length * 20) + 6,
        maxWidth: contentWidth - 32,
        fontSize: 22,
        fontWeight: 400,
        color: "#0f172a",
      });

      cursorY += cardHeight + 12;
    });
  };

  const drawTable = (title, headers, rows, columnRatios) => {
    drawSectionTitle(title);
    const tableWidth = contentWidth;
    const columnWidths = columnRatios.map(ratio => tableWidth * ratio);
    const headerHeight = 38;

    const drawHeaderRow = () => {
      ensureSpace(headerHeight + 8, title);
      let x = PDF_MARGIN_X;
      headers.forEach((header, index) => {
        const width = columnWidths[index];
        ctx.fillStyle = "#eaf2ff";
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.2;
        ctx.fillRect(x, cursorY, width, headerHeight);
        ctx.strokeRect(x, cursorY, width, headerHeight);
        drawWrappedCanvasText(ctx, {
          text: header,
          x: x + 8,
          y: cursorY + 9,
          maxWidth: width - 16,
          fontSize: 15,
          fontWeight: 700,
          color: "#334155",
        });
        x += width;
      });
      cursorY += headerHeight;
    };

    drawHeaderRow();

    rows.forEach(row => {
      const cellLayouts = row.map((cell, index) => {
        ctx.save();
        ctx.font = "400 18px Arial";
        const lines = wrapCanvasText(ctx, cell, columnWidths[index] - 16);
        ctx.restore();
        return lines;
      });
      const rowHeight = Math.max(...cellLayouts.map(lines => Math.max(28, lines.length * 26))) + 12;

      if (cursorY + rowHeight > bottomLimit) {
        addPage();
        drawSectionTitle(title);
        drawHeaderRow();
      }

      let x = PDF_MARGIN_X;
      row.forEach((cell, index) => {
        const width = columnWidths[index];
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#dbe4f0";
        ctx.lineWidth = 1;
        ctx.fillRect(x, cursorY, width, rowHeight);
        ctx.strokeRect(x, cursorY, width, rowHeight);
        drawWrappedCanvasText(ctx, {
          text: cell,
          x: x + 8,
          y: cursorY + 8,
          maxWidth: width - 16,
          fontSize: 18,
          fontWeight: 400,
          color: "#0f172a",
        });
        x += width;
      });
      cursorY += rowHeight;
    });

    cursorY += 12;
  };

  addPage();

  drawSectionTitle("Summary");
  drawInfoRows([
    { label: "Procurement Request", value: record.id },
    { label: "Procurement Status", value: getProcurementStage(record) },
    { label: "Approval Workflow Status", value: record.status || "-" },
  ]);

  drawSectionTitle("1. Request Form");
  drawInfoRows([
    { label: "Requester", value: record.requesterName || "-" },
    { label: "Activity Code", value: record.activityCode || "-" },
    { label: "Item Description", value: record.itemDescription || "-" },
    { label: "Quantity", value: String(record.quantity || "-") },
    { label: "Estimated Budget", value: `UGX ${formatAmount(record.estimatedBudget)}` },
    { label: "Expected Delivery", value: formatDate(record.expectedDeliveryDate) },
    { label: "Delivery Location", value: record.deliveryLocation || "-" },
    { label: "Notes", value: record.notes || "-" },
    { label: "Requester Signature", value: getSignatureLabel(record.requesterSignature) },
  ]);

  const approvalRows = [
    ...getApprovalHistory(record).map(entry => [
      getRoleLabel(entry.role),
      entry.decision === "rejected" ? "Rejected" : "Approved",
      entry.byName || "-",
      formatDateTime(entry.at),
    ]),
    [
      "Senior Accountant",
      record.financeDecisionStatus || "Not recorded in this workflow",
      record.financeDecisionByName || "-",
      formatDateTime(record.financeDecisionAt),
    ],
    [
      `Executive Director (${record.purchaseDocument?.type || "PO/LPO"})`,
      record.purchaseDocument?.edStatus || "-",
      record.purchaseDocument?.edDecisionByName || "-",
      formatDateTime(record.purchaseDocument?.edDecisionAt),
    ],
  ];
  drawTable(
    "2. Approval History",
    ["Step", "Status", "Decision By", "Timestamp"],
    approvalRows.length ? approvalRows : [["No approvals recorded", "-", "-", "-"]],
    [0.28, 0.18, 0.24, 0.30]
  );

  drawSectionTitle("3. RFQ Document");
  drawInfoRows([
    { label: "RFQ Reference", value: record.rfq?.referenceNumber || getAutoRfqReferenceNumber(record) },
    { label: "RFQ Status", value: record.rfq?.status || "Not generated" },
    { label: "Submission Deadline", value: formatDate(record.rfq?.submissionDeadline) },
    { label: "Generated", value: formatDateTime(record.rfq?.generatedAt) },
    { label: "Sent", value: formatDateTime(record.rfq?.sentAt) },
    { label: "Additional Notes", value: record.rfq?.additionalNotes || "-" },
    {
      label: "Service Providers",
      value: (record.rfq?.providers || [])
        .map((provider, index) => `${index + 1}. ${provider.companyName || "-"} (${provider.email || "-"})`)
        .join("\n") || "No service providers recorded",
    },
  ]);

  const bidRows = (record.bidAnalysis?.providers || []).map(provider => [
    provider.serviceProviderName || "-",
    `UGX ${formatAmount(provider.quotedPrice)}`,
    provider.deliveryTime || "-",
    provider.compliance || "-",
    provider.notes || "-",
  ]);
  drawTable(
    "4. Bid Analysis Table",
    ["Provider", "Quoted Price", "Delivery", "Compliance", "Notes"],
    bidRows.length ? bidRows : [["No bid analysis recorded", "-", "-", "-", "-"]],
    [0.22, 0.18, 0.18, 0.16, 0.26]
  );

  drawSectionTitle("5. Final LPO");
  drawInfoRows([
    { label: "LPO Number", value: record.purchaseDocument?.lpoNumber || "-" },
    { label: "Selected Service Provider", value: record.purchaseDocument?.selectedServiceProvider || record.bidAnalysis?.selectedProviderName || "-" },
    { label: "Item Description", value: record.purchaseDocument?.itemDescription || record.itemDescription || "-" },
    { label: "Quantity", value: String(record.purchaseDocument?.quantity || record.quantity || "-") },
    { label: "Agreed Price", value: `UGX ${formatAmount(record.purchaseDocument?.agreedPrice)}` },
    { label: "Total Cost", value: `UGX ${formatAmount(record.purchaseDocument?.totalCost || record.purchaseDocument?.amount)}` },
    { label: "Delivery Terms", value: record.purchaseDocument?.deliveryTerms || "-" },
    { label: "Procurement Officer", value: record.purchaseDocument?.procurementOfficerName || "-" },
    { label: "Date", value: formatDate(record.purchaseDocument?.date) },
    { label: "Executive Approval Status", value: record.purchaseDocument?.edStatus || "-" },
  ]);

  const signatureHeight = signature?.type === "drawn" && signatureImage ? 170 : 120;
  ensureSpace(signatureHeight + 26);
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#dbe4f0";
  ctx.lineWidth = 1.5;
  ctx.fillRect(PDF_MARGIN_X, cursorY, contentWidth, signatureHeight);
  ctx.strokeRect(PDF_MARGIN_X, cursorY, contentWidth, signatureHeight);
  drawWrappedCanvasText(ctx, {
    text: "Signed LPO",
    x: PDF_MARGIN_X + 16,
    y: cursorY + 14,
    maxWidth: contentWidth - 32,
    fontSize: 16,
    fontWeight: 700,
    color: "#64748b",
  });
  if (signature?.type === "drawn" && signatureImage) {
    const targetWidth = Math.min(340, signatureImage.naturalWidth || 340);
    const targetHeight = Math.min(110, signatureImage.naturalHeight || 110);
    ctx.drawImage(signatureImage, PDF_MARGIN_X + 16, cursorY + 48, targetWidth, targetHeight);
  } else {
    drawWrappedCanvasText(ctx, {
      text: signature?.value || "No digital signature attached",
      x: PDF_MARGIN_X + 16,
      y: cursorY + 56,
      maxWidth: contentWidth - 32,
      fontSize: signature?.value ? 34 : 22,
      fontWeight: signature?.value ? 400 : 400,
      color: "#0f2744",
      fontFamily: signature?.value ? "Georgia" : "Arial",
    });
  }
  cursorY += signatureHeight + 18;

  pages.forEach((pageCanvas, index) => {
    const pageCtx = pageCanvas.getContext("2d");
    pageCtx.strokeStyle = "#dbe4f0";
    pageCtx.lineWidth = 1.2;
    pageCtx.beginPath();
    pageCtx.moveTo(PDF_MARGIN_X, PDF_PAGE_HEIGHT - 56);
    pageCtx.lineTo(PDF_PAGE_WIDTH - PDF_MARGIN_X, PDF_PAGE_HEIGHT - 56);
    pageCtx.stroke();
    drawWrappedCanvasText(pageCtx, {
      text: INSPIRE_YOUTH_ORG,
      x: PDF_MARGIN_X,
      y: PDF_PAGE_HEIGHT - 44,
      maxWidth: 400,
      fontSize: 14,
      fontWeight: 400,
      color: "#64748b",
    });
    drawWrappedCanvasText(pageCtx, {
      text: `Page ${index + 1} of ${pages.length}`,
      x: PDF_PAGE_WIDTH - PDF_MARGIN_X - 150,
      y: PDF_PAGE_HEIGHT - 44,
      maxWidth: 150,
      fontSize: 14,
      fontWeight: 700,
      color: "#64748b",
    });
  });

  return pages;
}

function createPdfBlobFromCanvases(canvases = []) {
  if (!canvases.length) return null;

  const encoder = new TextEncoder();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const objects = [];
  const pageCount = canvases.length;
  const pagesObjectNumber = pageCount * 3 + 1;
  const catalogObjectNumber = pagesObjectNumber + 1;

  canvases.forEach((canvas, index) => {
    const imageObjectNumber = (index * 3) + 1;
    const contentObjectNumber = imageObjectNumber + 1;
    const pageObjectNumber = imageObjectNumber + 2;
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const imageBase64 = imageDataUrl.split(",")[1] || "";
    const imageBytes = base64ToUint8Array(imageBase64);
    const imageDictionary = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
    const imageFooter = encoder.encode(`\nendstream`);
    objects[imageObjectNumber] = concatUint8Arrays([imageDictionary, imageBytes, imageFooter]);

    const contentStream = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im${index + 1} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    objects[contentObjectNumber] = encoder.encode(`<< /Length ${contentBytes.length} >>\nstream\n${contentStream}endstream`);

    objects[pageObjectNumber] = encoder.encode(
      `<< /Type /Page /Parent ${pagesObjectNumber} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
  });

  const pageReferences = Array.from({ length: pageCount }, (_, index) => `${(index * 3) + 3} 0 R`).join(" ");
  objects[pagesObjectNumber] = encoder.encode(`<< /Type /Pages /Kids [${pageReferences}] /Count ${pageCount} >>`);
  objects[catalogObjectNumber] = encoder.encode(`<< /Type /Catalog /Pages ${pagesObjectNumber} 0 R >>`);

  const chunks = [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xFF, 0xFF, 0xFF, 0xFF, 0x0A])];
  const offsets = [0];
  let cursor = chunks[0].length;

  for (let objectNumber = 1; objectNumber <= catalogObjectNumber; objectNumber += 1) {
    offsets[objectNumber] = cursor;
    const prefix = encoder.encode(`${objectNumber} 0 obj\n`);
    const suffix = encoder.encode(`\nendobj\n`);
    chunks.push(prefix, objects[objectNumber], suffix);
    cursor += prefix.length + objects[objectNumber].length + suffix.length;
  }

  const xrefOffset = cursor;
  let xref = `xref\n0 ${catalogObjectNumber + 1}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber <= catalogObjectNumber; objectNumber += 1) {
    xref += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${catalogObjectNumber + 1} /Root ${catalogObjectNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encoder.encode(xref), encoder.encode(trailer));

  return new Blob(chunks, { type: "application/pdf" });
}

async function downloadProcurementReportPdf(record) {
  if (typeof window === "undefined" || !record) return false;

  const canvases = await renderProcurementReportCanvases(record);
  const blob = createPdfBlobFromCanvases(canvases);
  if (!blob) return false;

  return downloadBlob(blob, `${sanitizeFilenamePart(record.id)}-procurement-dossier.pdf`);
}

function openRequisitionPrintWindow(record) {
  if (typeof window === "undefined" || !record) return false;

  const requisitionWindow = window.open("", "_blank", "width=1080,height=820");
  if (!requisitionWindow) return false;

  const approvalRows = getApprovalHistory(record)
    .map(entry => `
      <tr>
        <td>${escapeHtml(getRoleLabel(entry.role))}</td>
        <td>${escapeHtml(entry.decision === "rejected" ? "Rejected" : "Approved")}</td>
        <td>${escapeHtml(entry.byName || "-")}</td>
        <td>${escapeHtml(formatDateTime(entry.at))}</td>
        <td>${escapeHtml(entry.note || "-")}</td>
      </tr>
    `)
    .join("");

  const samplePhotoMarkup = isImageAttachment(record.samplePhoto)
    ? `
      <div class="section">
        <h2>Sample Photo</h2>
        <img class="sample-photo" src="${record.samplePhoto.dataUrl}" alt="Sample item" />
      </div>
    `
    : "";

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Procurement Requisition ${escapeHtml(record.id)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 28px 34px; color: #0f172a; line-height: 1.5; background: #fff; }
      h1,h2 { margin: 0 0 10px; color: #0f2744; }
      h1 { font-size: 28px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin-top: 24px; }
      ${getPrintBrandStyles()}
      .sub { color: #475569; font-size: 13px; margin-bottom: 18px; }
      .section { margin-bottom: 18px; page-break-inside: avoid; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .meta-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #f8fafc; }
      .meta-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
      .meta-value { font-weight: 600; white-space: pre-wrap; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
      .sample-photo { max-width: 100%; max-height: 360px; border-radius: 16px; border: 1px solid #cbd5e1; }
      .footer { margin-top: 28px; font-size: 12px; color: #64748b; }
      @media print {
        body { padding: 18px; }
      }
    </style>
  </head>
  <body>
    ${buildPrintBrandHeader("Procurement Requisition Summary", `Reference ${record.id}`)}
    <h1>Procurement Requisition Summary</h1>
    <div class="sub">Current-stage printable summary for reference <strong>${escapeHtml(record.id)}</strong>.</div>

    <div class="section">
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Reference</div>
          <div class="meta-value">${escapeHtml(record.id || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Status</div>
          <div class="meta-value">${escapeHtml(record.status || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Requester</div>
          <div class="meta-value">${escapeHtml(record.requesterName || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Activity Code</div>
          <div class="meta-value">${escapeHtml(record.activityCode || "-")}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Request Details</h2>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Item Description</div>
          <div class="meta-value">${escapeHtml(record.itemDescription || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Quantity / Budget</div>
          <div class="meta-value">${escapeHtml(String(record.quantity || "-"))} / UGX ${escapeHtml(formatAmount(record.estimatedBudget))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Expected Delivery Date</div>
          <div class="meta-value">${escapeHtml(formatDate(record.expectedDeliveryDate))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Delivery Location</div>
          <div class="meta-value">${escapeHtml(record.deliveryLocation || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Notes</div>
          <div class="meta-value">${escapeHtml(record.notes || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Requester Signature</div>
          <div class="meta-value">${escapeHtml(getSignatureLabel(record.requesterSignature))}</div>
        </div>
      </div>
    </div>

    ${samplePhotoMarkup}

    <div class="section">
      <h2>Approval History</h2>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Decision</th>
            <th>By</th>
            <th>Date</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${approvalRows || '<tr><td colspan="5">No approvals recorded yet.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="footer">Generated from the Inspire Youth procurement module. Use the browser print dialog to save as PDF.</div>
    <script>
      window.onload = function () {
        window.print();
      };
    </script>
  </body>
</html>`;

  requisitionWindow.document.open();
  requisitionWindow.document.write(html);
  requisitionWindow.document.close();
  return true;
}

function openRfqPrintWindow(record) {
  if (typeof window === "undefined" || !record?.rfq) return false;

  const rfqWindow = window.open("", "_blank", "width=980,height=780");
  if (!rfqWindow) return false;
  const items = buildRfqItems(record);
  const itemRows = items
    .map(item => `
      <tr>
        <td>${escapeHtml(String(item.serialNumber || "-"))}</td>
        <td>${escapeHtml(item.itemDescription || "-")}</td>
        <td>${escapeHtml(item.specifications || "-")}</td>
        <td>${escapeHtml(String(item.quantity || "-"))}</td>
        <td class="blank-cell">&nbsp;</td>
        <td class="blank-cell">&nbsp;</td>
      </tr>
    `)
    .join("");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>RFQ ${escapeHtml(record.id)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; line-height: 1.5; }
      h1,h2,h3 { margin: 0; color: #0f2744; }
      ${getPrintBrandStyles()}
      .rfq-title-wrap { margin-bottom: 18px; }
      .rfq-title { font-size: 30px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 8px; }
      .rfq-from { font-size: 14px; color: #334155; }
      .rfq-table { width: 100%; border-collapse: collapse; margin: 20px 0 24px; table-layout: fixed; }
      .rfq-table th, .rfq-table td { border: 1px solid #cbd5e1; padding: 12px 10px; text-align: left; vertical-align: top; }
      .rfq-table th { background: #eff6ff; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #0f2744; }
      .rfq-table td { min-height: 48px; }
      .blank-cell { background: #fff; height: 48px; }
      .rfq-footer-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; margin-top: 8px; }
      .rfq-footer-item { border-bottom: 1px solid #cbd5e1; padding: 0 0 10px; min-height: 42px; }
      .rfq-footer-label { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
      .rfq-footer-value { font-size: 14px; color: #0f172a; min-height: 18px; }
      .footer { margin-top: 28px; font-size: 12px; color: #475569; }
    </style>
  </head>
  <body>
    ${buildPrintBrandHeader("Request for Quotation", `RFQ Reference ${escapeHtml(record.rfq.referenceNumber || getAutoRfqReferenceNumber(record))}`)}
    <div class="rfq-title-wrap">
      <h1 class="rfq-title">Request for Quotation</h1>
      <div class="rfq-from"><strong>RFQ From:</strong> ${escapeHtml(record.rfq.procurementOfficerName || "Procurement Officer")}</div>
    </div>
    <table class="rfq-table">
      <thead>
        <tr>
          <th style="width: 9%;">Serial Number</th>
          <th style="width: 25%;">Item Description</th>
          <th style="width: 26%;">Specifications</th>
          <th style="width: 12%;">Quantity</th>
          <th style="width: 14%;">Amount</th>
          <th style="width: 14%;">Total Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <div class="rfq-footer-grid">
      <div class="rfq-footer-item">
        <div class="rfq-footer-label">Delivery Date</div>
        <div class="rfq-footer-value">${escapeHtml(formatDate(record.rfq.deliveryDate || record.expectedDeliveryDate))}</div>
      </div>
      <div class="rfq-footer-item">
        <div class="rfq-footer-label">Return RFQ By</div>
        <div class="rfq-footer-value">${escapeHtml(formatDate(record.rfq.submissionDeadline))}</div>
      </div>
      <div class="rfq-footer-item">
        <div class="rfq-footer-label">Quotation Submitted By</div>
        <div class="rfq-footer-value">-</div>
      </div>
      <div class="rfq-footer-item">
        <div class="rfq-footer-label">Date</div>
        <div class="rfq-footer-value">-</div>
      </div>
    </div>
    <div class="footer">Generated from the Inspire Youth procurement module. Use the browser print dialog to save as PDF.</div>
    <script>
      window.onload = function () {
        window.print();
      };
    </script>
  </body>
</html>`;

  rfqWindow.document.open();
  rfqWindow.document.write(html);
  rfqWindow.document.close();
  return true;
}

function openPurchaseDocumentPrintWindow(record) {
  if (typeof window === "undefined" || !record?.purchaseDocument) return false;

  const docWindow = window.open("", "_blank", "width=980,height=780");
  if (!docWindow) return false;

  const title = record.purchaseDocument.type === "LPO" ? "Local Purchase Order" : "Purchase Order";
  const supplierName = record.bidAnalysis?.selectedProviderName || record.bidAnalysis?.selectedSupplier || record.bidAnalysis?.supplierName || "To be confirmed";
  const committeeMinutesLine = record.committeeMinutes
    ? `<div class="meta-row"><strong>Committee Minutes:</strong> ${escapeHtml(record.committeeMinutes.name)}</div>`
    : "";
  const signature = normalizeSignatureValue(record.purchaseDocument.procurementOfficerSignature);
  const signatureMarkup = !signature
    ? `<div style="font-weight:600;">-</div>`
    : signature.type === "drawn"
      ? `<img src="${signature.value}" alt="Procurement Officer Signature" style="height:56px; max-width:220px;" />`
      : `<div style="font-style:italic; font-size:22px; color:#0f2744;">${escapeHtml(signature.value)}</div>`;
  const lpoMetaBlock = record.purchaseDocument.type === "LPO"
    ? `
    <div class="meta">
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">LPO Number</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument.lpoNumber || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Selected Service Provider</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument.selectedServiceProvider || supplierName)}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Item Description</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument.itemDescription || record.itemDescription || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Quantity</div>
          <div class="meta-value">${escapeHtml(String(record.purchaseDocument.quantity || record.quantity || "-"))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Agreed Price</div>
          <div class="meta-value">UGX ${escapeHtml(formatAmount(record.purchaseDocument.agreedPrice))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Total Cost</div>
          <div class="meta-value">UGX ${escapeHtml(formatAmount(record.purchaseDocument.totalCost || record.purchaseDocument.amount))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Delivery Terms</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument.deliveryTerms || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Status</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument.edStatus || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Procurement Officer</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument.procurementOfficerName || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Date</div>
          <div class="meta-value">${escapeHtml(formatDate(record.purchaseDocument.date))}</div>
        </div>
      </div>
      <div style="margin-top:18px;">
        <div class="meta-label">Procurement Officer Signature</div>
        ${signatureMarkup}
      </div>
    </div>`
    : "";

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(record.purchaseDocument.type)} ${escapeHtml(record.id)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; line-height: 1.5; }
      h1,h2,h3 { margin: 0 0 12px; color: #0f2744; }
      ${getPrintBrandStyles()}
      .meta { margin: 20px 0; padding: 16px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .meta-card { border: 1px solid #dbe4f0; border-radius: 12px; padding: 12px; background: #fff; }
      .meta-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
      .meta-value { font-weight: 600; }
      .meta-row { margin-bottom: 8px; }
      .meta-row:last-child { margin-bottom: 0; }
      .footer { margin-top: 28px; font-size: 12px; color: #475569; }
    </style>
  </head>
  <body>
    ${buildPrintBrandHeader(title, `Reference ${record.id}`)}
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <div class="meta-row"><strong>Reference:</strong> ${escapeHtml(record.id)}</div>
      <div class="meta-row"><strong>Item Details:</strong> ${escapeHtml(record.itemDescription || "-")}</div>
      <div class="meta-row"><strong>Quantity:</strong> ${escapeHtml(record.quantity || "-")}</div>
      <div class="meta-row"><strong>Supplier:</strong> ${escapeHtml(supplierName)}</div>
      <div class="meta-row"><strong>Amount:</strong> UGX ${escapeHtml(formatAmount(record.purchaseDocument.amount))}</div>
      <div class="meta-row"><strong>Generated:</strong> ${escapeHtml(formatDateTime(record.purchaseDocument.generatedAt))}</div>
      ${committeeMinutesLine}
    </div>
    ${lpoMetaBlock}
    <div class="footer">Generated from the Inspire Youth procurement module. Use the browser print dialog to save as PDF.</div>
    <script>
      window.onload = function () {
        window.print();
      };
    </script>
  </body>
</html>`;

  docWindow.document.open();
  docWindow.document.write(html);
  docWindow.document.close();
  return true;
}

function buildProcurementTimeline(record) {
  const events = [];
  const approvalHistory = getApprovalHistory(record);
  const supervisorHistory = approvalHistory.find(entry => entry.role === "supervisor");
  const accountantHistory = approvalHistory.find(entry => entry.role === "accountant");

  if (record.createdAt) events.push({ at: record.createdAt, label: "Requisition created" });
  if (record.submittedAt) events.push({ at: record.submittedAt, label: "Requisition submitted" });
  if (supervisorHistory?.at) {
    events.push({
      at: supervisorHistory.at,
      label: `Supervisor ${supervisorHistory.decision === "rejected" ? "rejected" : "approved"}`
    });
  } else if (record.supervisorDecisionAt) {
    events.push({
      at: record.supervisorDecisionAt,
      label: `Supervisor ${record.status === "Rejected by Supervisor" ? "rejected" : "approved"}`
    });
  }
  if (accountantHistory?.at) {
    events.push({
      at: accountantHistory.at,
      label: `Grants accountant ${accountantHistory.decision === "rejected" ? "rejected" : "approved"}`
    });
  } else if (record.accountantDecisionAt) {
    events.push({
      at: record.accountantDecisionAt,
      label: `Grants accountant ${record.status === "Rejected by Accountant" ? "rejected" : "approved"}`
    });
  }
  if (record.rfq?.generatedAt) events.push({ at: record.rfq.generatedAt, label: "RFQ generated" });
  if (record.rfq?.sentAt) events.push({ at: record.rfq.sentAt, label: "RFQ sent" });
  (record.quotations || []).forEach((quotation, index) => {
    if (quotation.uploadedAt) {
      events.push({ at: quotation.uploadedAt, label: `Quotation uploaded: ${quotation.name || `Quotation ${index + 1}`}` });
    }
  });
  if (record.bidAnalysis?.savedAt) events.push({ at: record.bidAnalysis.savedAt, label: "Bid analysis saved" });
  if (record.purchaseDocument?.generatedAt) events.push({ at: record.purchaseDocument.generatedAt, label: `${record.purchaseDocument.type} generated` });
  if (record.purchaseDocument?.edDecisionAt) {
    events.push({
      at: record.purchaseDocument.edDecisionAt,
      label: `Executive Director ${record.purchaseDocument.edStatus === "Rejected" ? "rejected" : "approved"} ${record.purchaseDocument.type}`
    });
  }
  if (record.goodsReceived?.completedAt) events.push({ at: record.goodsReceived.completedAt, label: "Goods received completed" });
  if (record.procurementCompletedAt) events.push({ at: record.procurementCompletedAt, label: "Procurement closed and archived" });

  return events
    .filter(event => !!event.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

function _openFinalProcurementReportWindow(record) {
  if (typeof window === "undefined" || !record) return false;

  const reportWindow = window.open("", "_blank", "width=1080,height=820");
  if (!reportWindow) return false;

  const timelineItems = buildProcurementTimeline(record)
    .map(event => `
      <div class="timeline-item">
        <div class="timeline-date">${escapeHtml(formatDateTime(event.at))}</div>
        <div class="timeline-copy">${escapeHtml(event.label)}</div>
      </div>
    `)
    .join("");

  const quotationRows = (record.quotations || [])
    .map(quotation => `
      <tr>
        <td>${escapeHtml(quotation.name || "-")}</td>
        <td>${escapeHtml(quotation.type || "-")}</td>
        <td>${escapeHtml(formatFileSize(quotation.size))}</td>
        <td>${escapeHtml(formatDateTime(quotation.uploadedAt))}</td>
      </tr>
    `)
    .join("");

  const providerList = (record.rfq?.providers || [])
    .map((provider, index) => `<li>${index + 1}. ${escapeHtml(provider.companyName || "-")} (${escapeHtml(provider.email || "-")})</li>`)
    .join("");
  const bidAnalysisRows = (record.bidAnalysis?.providers || [])
    .map(provider => `
      <tr>
        <td>${escapeHtml(provider.serviceProviderName || "-")}</td>
        <td>UGX ${escapeHtml(formatAmount(provider.quotedPrice))}</td>
        <td>${escapeHtml(provider.deliveryTime || "-")}</td>
        <td>${escapeHtml(provider.compliance || "-")}</td>
        <td>${escapeHtml(provider.notes || "-")}</td>
      </tr>
    `)
    .join("");
  const approvalRows = getApprovalHistory(record)
    .map(entry => `
      <tr>
        <td>${escapeHtml(getRoleLabel(entry.role))}</td>
        <td>${escapeHtml(entry.decision === "rejected" ? "Rejected" : "Approved")}</td>
        <td>${escapeHtml(entry.byName || "-")}</td>
        <td>${escapeHtml(formatDateTime(entry.at))}</td>
      </tr>
    `)
    .join("");
  const samplePhotoBlock = isImageAttachment(record.samplePhoto)
    ? `
      <div class="section">
        <h2>Sample Photo</h2>
        <img src="${record.samplePhoto.dataUrl}" alt="Sample item" style="max-width:100%; max-height:320px; border-radius:16px; border:1px solid #cbd5e1;" />
      </div>
    `
    : "";

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Procurement Report ${escapeHtml(record.id)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 28px 34px; color: #0f172a; line-height: 1.5; background: #fff; }
      h1,h2,h3 { margin: 0 0 10px; color: #0f2744; }
      h1 { font-size: 28px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin-top: 26px; }
      ${getPrintBrandStyles()}
      .sub { color: #475569; font-size: 13px; margin-bottom: 18px; }
      .section { margin-bottom: 20px; page-break-inside: avoid; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .meta-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #f8fafc; }
      .meta-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
      .meta-value { font-weight: 600; }
      .timeline { border-left: 3px solid #cbd5e1; padding-left: 16px; margin-top: 8px; }
      .timeline-item { margin-bottom: 12px; }
      .timeline-date { font-size: 12px; color: #64748b; margin-bottom: 2px; }
      .timeline-copy { font-size: 14px; color: #0f172a; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
      ul { margin: 8px 0 0; padding-left: 18px; }
      .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #e2e8f0; color: #0f172a; }
      .footer { margin-top: 28px; font-size: 12px; color: #64748b; }
      @media print {
        body { padding: 20px; }
      }
    </style>
  </head>
  <body>
    ${buildPrintBrandHeader("Final Procurement Report", `Reference ${record.id}`)}
    <h1>Final Procurement Report</h1>
    <div class="sub">Chronological procurement report generated from the procurement module for reference <strong>${escapeHtml(record.id)}</strong>.</div>

    <div class="section">
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Procurement Request</div>
          <div class="meta-value">${escapeHtml(record.id)}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Procurement Status</div>
          <div class="meta-value">${escapeHtml(getProcurementStage(record))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Approval Workflow Status</div>
          <div class="meta-value">${escapeHtml(record.status || "-")}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>1. Requisition</h2>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Requester</div>
          <div class="meta-value">${escapeHtml(record.requesterName || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Activity Code</div>
          <div class="meta-value">${escapeHtml(record.activityCode || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Item Description</div>
          <div class="meta-value">${escapeHtml(record.itemDescription || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Quantity / Budget</div>
          <div class="meta-value">${escapeHtml(String(record.quantity || "-"))} / UGX ${escapeHtml(formatAmount(record.estimatedBudget))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Expected Delivery</div>
          <div class="meta-value">${escapeHtml(formatDate(record.expectedDeliveryDate))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Delivery Location</div>
          <div class="meta-value">${escapeHtml(record.deliveryLocation || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Notes</div>
          <div class="meta-value">${escapeHtml(record.notes || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Requester Signature</div>
          <div class="meta-value">${escapeHtml(getSignatureLabel(record.requesterSignature))}</div>
        </div>
      </div>
    </div>

    ${samplePhotoBlock}

    <div class="section">
      <h2>2. All Approvals</h2>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Status</th>
            <th>Decision By</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${approvalRows || `
          <tr>
            <td>Supervisor / Accountant</td>
            <td>${escapeHtml(record.supervisorDecisionAt || record.accountantDecisionAt ? "Decision recorded" : "Pending / Not recorded")}</td>
            <td>${escapeHtml(record.accountantDecisionByName || record.supervisorDecisionByName || "-")}</td>
            <td>${escapeHtml(formatDateTime(record.accountantDecisionAt || record.supervisorDecisionAt))}</td>
          </tr>`}
          <tr>
            <td>Finance Manager</td>
            <td>${escapeHtml(record.financeDecisionStatus || "Not recorded in this workflow")}</td>
            <td>${escapeHtml(record.financeDecisionByName || "-")}</td>
            <td>${escapeHtml(formatDateTime(record.financeDecisionAt))}</td>
          </tr>
          <tr>
            <td>Executive Director (${escapeHtml(record.purchaseDocument?.type || "PO/LPO")})</td>
            <td>${escapeHtml(record.purchaseDocument?.edStatus || "-")}</td>
            <td>${escapeHtml(record.purchaseDocument?.edDecisionByName || "-")}</td>
            <td>${escapeHtml(formatDateTime(record.purchaseDocument?.edDecisionAt))}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>3. RFQ</h2>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">RFQ Reference</div>
          <div class="meta-value">${escapeHtml(record.rfq?.referenceNumber || getAutoRfqReferenceNumber(record))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Status</div>
          <div class="meta-value">${escapeHtml(record.rfq?.status || "Not generated")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Submission Deadline</div>
          <div class="meta-value">${escapeHtml(formatDate(record.rfq?.submissionDeadline))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Generated</div>
          <div class="meta-value">${escapeHtml(formatDateTime(record.rfq?.generatedAt))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Sent</div>
          <div class="meta-value">${escapeHtml(formatDateTime(record.rfq?.sentAt))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Additional Notes</div>
          <div class="meta-value">${escapeHtml(record.rfq?.additionalNotes || "-")}</div>
        </div>
      </div>
      <h3 style="margin-top:16px;">Service Providers</h3>
      <ul>${providerList || "<li>No service providers recorded</li>"}</ul>
    </div>

    <div class="section">
      <h2>4. Quotations</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Type</th>
            <th>Size</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          ${quotationRows || '<tr><td colspan="4">No quotations uploaded</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>5. Bid Analysis</h2>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Selected Provider</div>
          <div class="meta-value">${escapeHtml(record.bidAnalysis?.selectedProviderName || record.bidAnalysis?.selectedSupplier || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Approved Amount</div>
          <div class="meta-value">UGX ${escapeHtml(formatAmount(record.bidAnalysis?.amount))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Saved</div>
          <div class="meta-value">${escapeHtml(formatDateTime(record.bidAnalysis?.savedAt))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Comparison Notes</div>
          <div class="meta-value">${escapeHtml(record.bidAnalysis?.comparisonNotes || "-")}</div>
        </div>
      </div>
      <h3 style="margin-top:16px;">Provider Comparison</h3>
      <table>
        <thead>
          <tr>
            <th>Service Provider Name</th>
            <th>Quoted Price</th>
            <th>Delivery Time</th>
            <th>Compliance</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${bidAnalysisRows || '<tr><td colspan="5">No bid analysis recorded</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>6. Final ${escapeHtml(record.purchaseDocument?.type || "PO / LPO")}</h2>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">Document</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument?.type || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">LPO Number</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument?.lpoNumber || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Selected Service Provider</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument?.selectedServiceProvider || record.bidAnalysis?.selectedProviderName || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Amount</div>
          <div class="meta-value">UGX ${escapeHtml(formatAmount(record.purchaseDocument?.amount))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Generated</div>
          <div class="meta-value">${escapeHtml(formatDateTime(record.purchaseDocument?.generatedAt))}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Executive Approval Status</div>
          <div class="meta-value">${escapeHtml(record.purchaseDocument?.edStatus || "-")}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>7. Goods Received Note (GRN)</h2>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">GRN</div>
          <div class="meta-value">${escapeHtml(record.goodsReceived?.grn || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Delivery Note</div>
          <div class="meta-value">${escapeHtml(record.goodsReceived?.deliveryNote?.name || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Signature</div>
          <div class="meta-value">${escapeHtml(record.goodsReceived?.signature || "-")}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Completed</div>
          <div class="meta-value">${escapeHtml(formatDateTime(record.goodsReceived?.completedAt))}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Chronological Timeline</h2>
      <div class="timeline">
        ${timelineItems || '<div class="timeline-item"><div class="timeline-copy">No procurement events recorded.</div></div>'}
      </div>
    </div>

    <div class="footer">Generated from the Inspire Youth procurement module. Use the browser print dialog to save as PDF.</div>
    <script>
      window.onload = function () {
        window.print();
      };
    </script>
  </body>
</html>`;

  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  return true;
}

function getRoleLabel(role) {
  if (role === "supervisor") return "Program Manager";
  if (role === "accountant") return "Accountant";
  if (role === "procurement_officer") return "Procurement Officer";
  if (role === "executive_director") return "Executive Director";
  if (role === "finance_manager") return "Senior Accountant";
  if (role === "payment_accountant") return "Accounts Assistant";
  if (role === "admin") return "Administrator";
  return "Program Officer";
}

function getExecutiveDirector(users = []) {
  return users.find(user => user.role === "executive_director") || null;
}

function getEdStatusMeta(status) {
  if (status === PURCHASE_DOCUMENT_DRAFT) return { bg: "#e5e7eb", color: "#374151" };
  if (status === "Approved") return { bg: "#d1fae5", color: "#065f46" };
  if (status === "Rejected") return { bg: "#fee2e2", color: "#991b1b" };
  return { bg: "#fef3c7", color: "#92400e" };
}

function EdStatusPill({ status }) {
  if (!status) return <span className="text-gray">Not submitted</span>;

  const meta = getEdStatusMeta(status);
  return (
    <span className="sbadge" style={{ background: meta.bg, color: meta.color }}>
      {status}
    </span>
  );
}

function getSupervisors(users = []) {
  return users.filter(user => user.role === "supervisor");
}

function getPrimaryAccountant(users = []) {
  return users.find(user => user.role === "accountant") || null;
}

function getAssignedSupervisor(requester, users = []) {
  if (!requester) return getSupervisors(users)[0] || null;

  const supervisors = getSupervisors(users);
  if (!supervisors.length) return null;

  const directSupervisor = requester.supervisorId
    ? supervisors.find(user => user.id === requester.supervisorId)
    : null;

  return directSupervisor || supervisors.find(user => user.id !== requester.id) || supervisors[0] || null;
}

function normalizeProcurementRecord(record, users = []) {
  const requester = users.find(user => user.id === record.requesterId) || null;
  const supervisor = users.find(user => user.id === record.supervisorId && user.role === "supervisor")
    || getAssignedSupervisor(requester, users);
  const accountant = users.find(user => user.id === record.accountantId && user.role === "accountant")
    || getPrimaryAccountant(users);
  const status = record.status || "Draft";
  const createdAt = record.createdAt || new Date().toISOString();
  const updatedAt = record.updatedAt || createdAt;
  const submittedAt = record.submittedAt || (status !== "Draft" ? updatedAt : null);

  return {
    ...record,
    items: getNormalizedRecordItems(record),
    requesterName: record.requesterName || requester?.name || "Unknown User",
    requesterRole: record.requesterRole || requester?.role || "requester",
    status,
    createdAt,
    updatedAt,
    submittedAt,
    supervisorId: supervisor?.id || null,
    supervisorName: supervisor?.name || "Unassigned",
    accountantId: accountant?.id || null,
    accountantName: accountant?.name || "Unassigned",
    supervisorDecisionAt: record.supervisorDecisionAt || null,
    supervisorDecisionById: record.supervisorDecisionById || null,
    supervisorDecisionByName: record.supervisorDecisionByName || null,
    accountantDecisionAt: record.accountantDecisionAt || null,
    accountantDecisionById: record.accountantDecisionById || null,
    accountantDecisionByName: record.accountantDecisionByName || null,
    rejectionReason: record.rejectionReason || "",
    procurementStage: record.procurementStage || "",
    deliveryLocation: record.deliveryLocation || "",
    requesterSignature: normalizeSignatureValue(record.requesterSignature),
    samplePhoto: normalizeStoredAttachment(record.samplePhoto, "Sample Photo"),
    approvalHistory: getApprovalHistory(record),
    rfq: normalizeRfq(record),
    quotations: normalizeQuotationList(record),
    bidAnalysis: normalizeBidAnalysis(record),
    committeeMinutes: normalizeCommitteeMinutes(record),
    purchaseDocument: normalizePurchaseDocument(record),
    goodsReceived: normalizeGoodsReceived(record),
  };
}

function getInitialProcurementState(user, users = [], defaultActivityCode = "") {
  const requisitions = loadProcurementRequisitions().map(record => normalizeProcurementRecord(record, users));
  const canCreateProcurementRequest = user.role !== "executive_director";
  const userDraft = canCreateProcurementRequest
    ? requisitions.find(record => record.requesterId === user.id && record.status === "Draft")
    : null;
  const supervisorQueueItem = requisitions.find(record => record.supervisorId === user.id && record.status === "Submitted");
  const accountantQueueItem = requisitions.find(record => record.accountantId === user.id && record.status === "Supervisor Approved");
  const executiveQueueItem = user.role === "executive_director"
    ? requisitions.find(record => record.purchaseDocument?.edStatus === EXECUTIVE_APPROVAL_PENDING)
    : null;
  const ownRecord = canCreateProcurementRequest
    ? requisitions.find(record => record.requesterId === user.id)
    : null;
  const initialRecord = userDraft || supervisorQueueItem || accountantQueueItem || executiveQueueItem || ownRecord || null;

  return {
    requisitions,
    selectedId: initialRecord?.id || null,
    form: initialRecord ? formFromRecord(initialRecord, defaultActivityCode, user) : createEmptyForm(defaultActivityCode, user),
  };
}

function statusStyles(status) {
  return PROCUREMENT_STATUS_META[status] || PROCUREMENT_STATUS_META.Draft;
}

function StatusPill({ status }) {
  return (
    <span
      style={{
        ...statusStyles(status),
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: ".04em",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function getProcurementStage(record = {}) {
  if (record.procurementStage) return record.procurementStage;
  if (record.financeRequestId || record.financeSentAt) return "Sent to Finance";
  if (record.goodsReceived?.completedAt) return "Completed";
  if (record.purchaseDocument?.edStatus === "Approved") return "Approved";
  if (record.purchaseDocument?.generatedAt) return "LPO Created";
  if (record.bidAnalysis?.savedAt) return "Bid Analysis";
  if (record.rfq?.sentAt || record.rfq?.status === "RFQ Sent") return "RFQ Sent";
  if (record.procurementStage === "Processing" || record.rfq?.generatedAt) return "Processing";
  return "New";
}

function getProcurementStageMeta(stage) {
  const map = {
    New: { bg: "#e2e8f0", color: "#475569" },
    Processing: { bg: "#dbeafe", color: "#1d4ed8" },
    "RFQ Sent": { bg: "#fef3c7", color: "#92400e" },
    "Bid Analysis": { bg: "#ede9fe", color: "#6d28d9" },
    "Bid Analysis Completed": { bg: "#ddd6fe", color: "#5b21b6" },
    "LPO Created": { bg: "#d1fae5", color: "#065f46" },
    Approved: { bg: "#dcfce7", color: "#166534" },
    "Sent to Finance": { bg: "#dbeafe", color: "#1d4ed8" },
    Completed: { bg: "#dcfce7", color: "#166534" },
  };

  return map[stage] || map.New;
}

function ProcurementStagePill({ stage }) {
  const meta = getProcurementStageMeta(stage);

  return (
    <span className="sbadge" style={{ background: meta.bg, color: meta.color }}>
      {stage}
    </span>
  );
}

function SummaryField({ label, value, children }) {
  return (
    <div>
      <div className="text-xs text-gray mb-1">{label}</div>
      {children || <div style={{ fontWeight: 600, whiteSpace: "pre-wrap" }}>{value || "-"}</div>}
    </div>
  );
}

function AttachmentPreviewCard({ title, attachment, emptyText }) {
  return (
    <div className="form-section" style={{ marginBottom: 0 }}>
      <div className="form-section-title">{title}</div>
      {!attachment ? (
        <div className="text-xs text-gray">{emptyText}</div>
      ) : (
        <>
          {isImageAttachment(attachment) && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={attachment.dataUrl}
                alt={title}
                style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 16, border: "1px solid #dbe4f0" }}
              />
            </div>
          )}
          <div className="text-xs text-gray mb-1">File</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{attachment.name}</div>
          <div className="text-xs text-gray mb-1">Size</div>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{formatFileSize(attachment.size)}</div>
          {attachment.dataUrl ? (
            <a href={attachment.dataUrl} download={attachment.name} className="btn btn-ghost btn-sm">Download</a>
          ) : (
            <span className="text-xs text-gray">Unavailable</span>
          )}
        </>
      )}
    </div>
  );
}

function ApprovalHistoryPanel({ record }) {
  const history = getApprovalHistory(record);

  return (
    <div className="form-section" style={{ marginBottom: 0 }}>
      <div className="form-section-title">Approval History</div>
      {!history.length ? (
        <div className="text-xs text-gray">No approval actions have been recorded yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {history.map(entry => (
            <div
              key={entry.id}
              style={{
                border: "1px solid #dbe4f0",
                borderRadius: 16,
                padding: "12px 14px",
                background: "#f8fbff",
              }}
            >
              <div className="flex gap-2" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 6 }}>
                <div style={{ fontWeight: 700 }}>{getRoleLabel(entry.role)}</div>
                <span
                  className="sbadge"
                  style={{
                    background: entry.decision === "rejected" ? "#fee2e2" : "#d1fae5",
                    color: entry.decision === "rejected" ? "#991b1b" : "#065f46",
                  }}
                >
                  {entry.decision === "rejected" ? "Rejected" : "Approved"}
                </span>
              </div>
              <div className="text-xs text-gray" style={{ lineHeight: 1.8 }}>
                {entry.byName || "-"} · {formatDateTime(entry.at)}
              </div>
              {entry.note && (
                <div style={{ marginTop: 8, color: "var(--g700)", fontSize: 13 }}>{entry.note}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactRecordList({
  records,
  selectedId,
  onSelectRecord,
  emptyIcon,
  emptyText,
  emptySub,
  showRequester = false,
  approvalUserId = "",
}) {
  if (!records.length) {
    return (
      <div className="empty-state" style={{ padding: "36px 18px" }}>
        <div className="empty-icon">
          {["requests", "workflow", "approve", "reject", "payments", "prc", "doc", "ast", "com"].includes(emptyIcon)
            ? <IconBadge name={emptyIcon} tone={emptyIcon === "approve" ? "green" : emptyIcon === "reject" ? "red" : emptyIcon === "workflow" ? "amber" : "blue"} size={22} />
            : emptyIcon}
        </div>
        <div className="empty-text">{emptyText}</div>
        <div className="empty-sub">{emptySub}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {records.map(record => {
        const approvalEntry = approvalUserId ? getLatestApprovalEntry(record, approvalUserId, "approved") : null;
        const isSelected = record.id === selectedId;

        return (
          <div
            key={record.id}
            style={{
              border: isSelected ? "1px solid #93c5fd" : "1px solid #dbe4f0",
              borderRadius: 18,
              background: isSelected ? "#f8fbff" : "#ffffff",
              padding: "14px 16px",
              boxShadow: isSelected ? "0 10px 28px rgba(59, 130, 246, 0.10)" : "0 8px 22px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div className="flex gap-3" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <span className="ref">{record.id}</span>
                  <StatusPill status={record.status} />
                </div>
                <div style={{ fontWeight: 700, color: "var(--g900)", marginBottom: 4 }}>
                  {truncateText(record.itemDescription, 90)}
                </div>
                <div className="text-xs text-gray" style={{ lineHeight: 1.7 }}>
                  {truncateText(
                    `${showRequester ? `${record.requesterName || "Requester"} · ` : ""}${getCompactRecordDetail(record, approvalEntry)}`,
                    180
                  )}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onSelectRecord(record, { openDetails: true, scrollToSummary: true })}
              >
                See details
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getRequesterApprovalQueueMeta(record = {}) {
  if (record.status === "Submitted") {
    return {
      stage: "Awaiting Supervisor Review",
      assignee: record.supervisorName || "Assigned supervisor",
    };
  }
  if (record.status === "Supervisor Approved") {
    return {
      stage: "Awaiting Accountant Review",
      assignee: record.accountantName || "Assigned grants accountant",
    };
  }
  if (record.status === "Rejected by Supervisor" || record.status === "Rejected by Accountant") {
    return {
      stage: "Returned to Requester",
      assignee: "Needs revision",
    };
  }
  return {
    stage: record.status || "In progress",
    assignee: record.accountantName || record.supervisorName || "Workflow route set",
  };
}

function RequesterProcurementWorkspace({
  ownRecords,
  requesterQueueRecords,
  selectedId,
  onSelectRecord,
  onCreateRequest,
  searchInput,
  onSearchInputChange,
  onSearch,
  onClearSearch,
  searchTerm,
  showAllRecords,
  onToggleShowAll,
}) {
  const latestRecord = ownRecords[0] || null;
  const visibleRecords = searchTerm ? ownRecords : ownRecords.slice(0, 3);
  const canShowMore = !searchTerm && ownRecords.length > 3;
  const showingRecords = showAllRecords ? ownRecords : visibleRecords;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div
        className="card"
        style={{
          overflow: "hidden",
          background: "linear-gradient(135deg, #fff8ec 0%, #ffffff 58%, #eef6ff 100%)",
          border: "1px solid #e6edf6",
          boxShadow: "0 18px 42px rgba(15, 39, 68, 0.08)",
        }}
      >
        <div className="card-body" style={{ padding: 22 }}>
          <div className="requester-procurement-hero">
            <div>
              <div className="requester-procurement-kicker">Requester Workspace</div>
              <div className="requester-procurement-title">Create and track procurement requests from one clean workspace</div>
              <div className="requester-procurement-sub">Start a new requisition quickly, review your latest request at a glance, and search older records when you need them.</div>
            </div>
            <div className="requester-procurement-actions">
              <button type="button" className="btn btn-amber btn-lg" onClick={onCreateRequest}>
                <ActionButtonIcon name="add" tone="amber" />
                Create New Procurement Request
              </button>
            </div>
          </div>
          <div className="requester-procurement-search">
            <input
              value={searchInput}
              onChange={event => onSearchInputChange(event.target.value)}
              placeholder="Search by PR number, item, delivery location, or status"
            />
            <button type="button" className="btn btn-primary" onClick={onSearch}>
              <ActionButtonIcon name="view" tone="navy" />
              Search
            </button>
            {searchTerm && (
              <button type="button" className="btn btn-ghost" onClick={onClearSearch}>
                <ActionButtonIcon name="back" tone="blue" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Latest Request Summary</div>
              <div className="page-sub">Only the key fields are shown here. Open details for the full procurement record.</div>
            </div>
          </div>
          <div className="card-body">
            {!latestRecord ? (
              <div className="empty-state" style={{ padding: "30px 18px" }}>
                <div className="empty-icon"><IconBadge name="requests" tone="blue" size={22} /></div>
                <div className="empty-text">No procurement requests yet</div>
                <div className="empty-sub">Your newest request will appear here once you save or submit one.</div>
              </div>
            ) : (
              <div className="requester-summary-card">
                <div className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                  <span className="ref">{latestRecord.id}</span>
                  <StatusPill status={latestRecord.status} />
                </div>
                <div className="requester-summary-grid">
                  <SummaryField label="PR Number" value={latestRecord.id} />
                  <SummaryField label="Expected Delivery Date" value={formatDate(latestRecord.expectedDeliveryDate)} />
                  <SummaryField label="Amount" value={`UGX ${formatAmount(summarizeRequestItems(latestRecord.items).totalBudget || latestRecord.estimatedBudget)}`} />
                  <SummaryField label="Delivery Location" value={latestRecord.deliveryLocation || "-"} />
                </div>
                <div className="requester-summary-footer">
                  <div className="text-xs text-gray">Updated {formatDateTime(latestRecord.updatedAt || latestRecord.createdAt)}</div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onSelectRecord(latestRecord, { openDetails: true, scrollToSummary: true })}
                  >
                    <ActionButtonIcon name="view" tone="blue" />
                    Details
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Assigned Approval Queue</div>
              <div className="page-sub">See which of your requests are currently waiting on review and who is expected to act next.</div>
            </div>
          </div>
          <div className="card-body">
            {!requesterQueueRecords.length ? (
              <div className="empty-state" style={{ padding: "30px 18px" }}>
                <div className="empty-icon"><IconBadge name="workflow" tone="amber" size={22} /></div>
                <div className="empty-text">No requests currently in review</div>
                <div className="empty-sub">Submitted requests waiting on supervisor or accountant action will appear here.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {requesterQueueRecords.map(record => {
                  const queueMeta = getRequesterApprovalQueueMeta(record);
                  const isSelected = record.id === selectedId;
                  return (
                    <div
                      key={`queue-${record.id}`}
                      className="requester-queue-card"
                      style={isSelected ? { borderColor: "#93c5fd", background: "#f8fbff" } : undefined}
                    >
                      <div className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                        <span className="ref">{record.id}</span>
                        <StatusPill status={record.status} />
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--g900)", marginBottom: 6 }}>
                        {truncateText(getRequestItemsSummaryText(record), 80)}
                      </div>
                      <div className="text-xs text-gray" style={{ lineHeight: 1.7 }}>
                        <strong>{queueMeta.stage}</strong> · {queueMeta.assignee}
                      </div>
                      <div className="text-xs text-gray" style={{ marginTop: 6 }}>
                        Expected delivery {formatDate(record.expectedDeliveryDate)} · UGX {formatAmount(summarizeRequestItems(record.items).totalBudget || record.estimatedBudget)}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onSelectRecord(record, { openDetails: true, scrollToSummary: true })}
                        >
                          <ActionButtonIcon name="view" tone="blue" />
                          Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">My Procurement Records</div>
            <div className="page-sub">
              {searchTerm
                ? `Showing search results for "${searchTerm}".`
                : "Showing your latest three records first. Use More Records to open the full history."}
            </div>
          </div>
          <div className="procurement-chip-grid">
            {canShowMore && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleShowAll}>
                <ActionButtonIcon name="requests" tone="blue" />
                {showAllRecords ? "Show Recent Only" : "More Records"}
              </button>
            )}
          </div>
        </div>
        <div className="card-body">
          {!showingRecords.length ? (
            <div className="empty-state" style={{ padding: "30px 18px" }}>
              <div className="empty-icon"><IconBadge name="requests" tone="blue" size={22} /></div>
              <div className="empty-text">{searchTerm ? "No matching records found" : "No procurement records yet"}</div>
              <div className="empty-sub">{searchTerm ? "Try another PR number, item name, or location." : "Your drafts and submitted procurement requests will appear here."}</div>
            </div>
          ) : (
            <div className="requester-record-grid">
              {showingRecords.map(record => {
                const isSelected = record.id === selectedId;
                return (
                  <div
                    key={record.id}
                    className="requester-record-card"
                    style={isSelected ? { borderColor: "#93c5fd", background: "#f8fbff" } : undefined}
                  >
                    <div className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                      <span className="ref">{record.id}</span>
                      <StatusPill status={record.status} />
                    </div>
                    <div style={{ fontWeight: 700, color: "var(--g900)", marginBottom: 6 }}>
                      {truncateText(getRequestItemsSummaryText(record), 80)}
                    </div>
                    <div className="text-xs text-gray" style={{ lineHeight: 1.7 }}>
                      Expected delivery {formatDate(record.expectedDeliveryDate)}
                    </div>
                    <div className="text-xs text-gray" style={{ lineHeight: 1.7 }}>
                      Delivery location: {record.deliveryLocation || "-"}
                    </div>
                    <div className="text-xs text-gray" style={{ lineHeight: 1.7 }}>
                      Amount: UGX {formatAmount(summarizeRequestItems(record.items).totalBudget || record.estimatedBudget)}
                    </div>
                    <div className="requester-summary-footer" style={{ marginTop: 12 }}>
                      <div className="text-xs text-gray">Updated {formatDateTime(record.updatedAt || record.createdAt)}</div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onSelectRecord(record, { openDetails: true, scrollToSummary: true })}
                      >
                        <ActionButtonIcon name="view" tone="blue" />
                        Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProcurementOfficerDashboard({ requisitions, onSelectRecord }) {
  const approvedRequests = requisitions
    .filter(record => record.status === "Accountant Approved")
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const pendingItems = requisitions
    .filter(record => ["Submitted", "Supervisor Approved"].includes(record.status))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const statusLabels = [
    { label: "Draft", count: requisitions.filter(record => record.status === "Draft").length, bg: "#f3f4f6", color: "#6b7280" },
    { label: "Submitted", count: requisitions.filter(record => record.status === "Submitted").length, bg: "#fef3c7", color: "#92400e" },
    { label: "Supervisor Approved", count: requisitions.filter(record => record.status === "Supervisor Approved").length, bg: "#dbeafe", color: "#1e40af" },
    { label: "Accountant Approved", count: approvedRequests.length, bg: "#d1fae5", color: "#065f46" },
  ];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div className="page-title">Procurement Officer Dashboard</div>
        <div className="page-sub">Monitor approved procurement requests, pending items, and current workflow status labels.</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#d1fae5", color: "#065f46" }}><IconBadge name="approve" tone="green" size={17} /></div>
          <div className="stat-val">{approvedRequests.length}</div>
          <div className="stat-label">Approved Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#fef3c7", color: "#92400e" }}><IconBadge name="workflow" tone="amber" size={17} /></div>
          <div className="stat-val">{pendingItems.length}</div>
          <div className="stat-label">Pending Items</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Status Labels</div>
            <div className="page-sub">Live counts across the procurement workflow.</div>
          </div>
        </div>
        <div className="card-body">
          <div className="procurement-chip-grid">
            {statusLabels.map(status => (
              <span
                key={status.label}
                className="sbadge"
                style={{ background: status.bg, color: status.color }}
              >
                {status.label} | {status.count}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: "start", marginBottom: 18 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Approved Requests</div>
              <div className="page-sub">Requests fully approved by the grants accountant.</div>
            </div>
          </div>
          <div className="card-body">
            {!approvedRequests.length ? (
              <div className="empty-state" style={{ padding: "36px 18px" }}>
                <div className="empty-icon"><IconBadge name="approve" tone="green" size={22} /></div>
                <div className="empty-text">No approved requests yet</div>
                <div className="empty-sub">Fully approved procurement requests will appear here.</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Status</th>
                      <th>RFQ</th>
                      <th>Requester</th>
                      <th>Item</th>
                      <th>Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedRequests.map(record => (
                      <tr key={record.id} className="clickable" onClick={() => onSelectRecord(record)}>
                        <td><span className="ref">{record.id}</span></td>
                        <td><StatusPill status={record.status} /></td>
                        <td><RfqStatusPill status={record.rfq?.status} /></td>
                        <td>{record.requesterName}</td>
                        <td>{getRequestItemsSummaryText(record)}</td>
                        <td>UGX {formatAmount(record.estimatedBudget)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Pending Items</div>
              <div className="page-sub">Requests still moving through procurement approvals.</div>
            </div>
          </div>
          <div className="card-body">
            {!pendingItems.length ? (
              <div className="empty-state" style={{ padding: "36px 18px" }}>
                <div className="empty-icon"><IconBadge name="workflow" tone="amber" size={22} /></div>
                <div className="empty-text">No pending items</div>
                <div className="empty-sub">Submitted and supervisor-approved requests will appear here.</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Requester</th>
                      <th>Item</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingItems.map(record => (
                      <tr key={record.id} className="clickable" onClick={() => onSelectRecord(record)}>
                        <td><span className="ref">{record.id}</span></td>
                        <td><StatusPill status={record.status} /></td>
                        <td>{record.requesterName}</td>
                        <td>{record.itemDescription || "-"}</td>
                        <td>{formatDateTime(record.updatedAt || record.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ProcurementOfficerWorkspaceDashboard({ requisitions, selectedId, onSelectRecord, onProcessRequest, onSendToFinance, onClearSelection, onCreateRequest }) {
  const approvedRequests = requisitions
    .filter(record => record.status === "Accountant Approved")
    .sort((a, b) => new Date(b.accountantDecisionAt || b.updatedAt || b.createdAt || 0) - new Date(a.accountantDecisionAt || a.updatedAt || a.createdAt || 0));
  const activeRecord = approvedRequests.find(record => record.id === selectedId) || null;
  const processingCount = approvedRequests.filter(record => getProcurementStage(record) === "Processing").length;
  const completedCount = approvedRequests.filter(record => getProcurementStage(record) === "Completed").length;
  const sentToFinanceCount = approvedRequests.filter(record => getProcurementStage(record) === "Sent to Finance").length;
  const completedProcurements = approvedRequests.filter(record => ["Completed", "Sent to Finance"].includes(getProcurementStage(record)));
  const stageLabels = ["New", "Processing", "RFQ Sent", "Bid Analysis", "Bid Analysis Completed", "LPO Created", "Approved", "Completed", "Sent to Finance"].map(label => ({
    label,
    count: approvedRequests.filter(record => getProcurementStage(record) === label).length,
    ...getProcurementStageMeta(label),
  }));

  return (
    <>
      <div className="procurement-hero">
        <div className="procurement-hero-main">
          <div className="procurement-hero-logo">
            <img src={INSPIRE_YOUTH_LOGO} alt={`${INSPIRE_YOUTH_ORG} logo`} />
          </div>
          <div>
            <div className="procurement-hero-tag">{INSPIRE_YOUTH_ORG}</div>
            <div className="procurement-hero-title">Procurement Officer Dashboard</div>
            <div className="procurement-hero-sub">Process grants-accountant-approved requests from one organized workspace and move each item through RFQ, bid analysis, LPO approval, goods received, and finance handoff.</div>
          </div>
        </div>
        <div className="procurement-hero-panel">
          <div className="procurement-hero-panel-title">Workflow Snapshot</div>
          <div className="procurement-hero-metrics">
            <div className="procurement-hero-metric"><strong>{approvedRequests.length}</strong><span>Approved Queue</span></div>
            <div className="procurement-hero-metric"><strong>{processingCount}</strong><span>Processing</span></div>
            <div className="procurement-hero-metric"><strong>{completedCount}</strong><span>Completed</span></div>
            <div className="procurement-hero-metric"><strong>{sentToFinanceCount}</strong><span>Sent to Finance</span></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-amber" onClick={onCreateRequest}><ActionButtonIcon name="add" tone="amber" />Create New Procurement Request</button>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#d1fae5", color: "#065f46" }}><IconBadge name="approve" tone="green" size={17} /></div>
          <div className="stat-val">{approvedRequests.length}</div>
          <div className="stat-label">Approved by Accountant</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#dbeafe", color: "#1d4ed8" }}><IconBadge name="workflow" tone="blue" size={17} /></div>
          <div className="stat-val">{processingCount}</div>
          <div className="stat-label">Processing</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#dcfce7", color: "#166534" }}><IconBadge name="approve" tone="green" size={17} /></div>
          <div className="stat-val">{completedCount}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#dbeafe", color: "#1d4ed8" }}><IconBadge name="payments" tone="navy" size={17} /></div>
          <div className="stat-val">{sentToFinanceCount}</div>
          <div className="stat-label">Sent to Finance</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Procurement Status Flow</div>
            <div className="page-sub">Every approved request stays in this dashboard and moves through the procurement stages below.</div>
          </div>
        </div>
        <div className="card-body">
          <div className="procurement-chip-grid">
            {stageLabels.map(status => (
              <span key={status.label} className="sbadge" style={{ background: status.bg, color: status.color }}>
                {status.label} | {status.count}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Approved Requests Queue</div>
            <div className="page-sub">Click Process to change a request from New to Processing and open its RFQ work area without leaving this dashboard.</div>
          </div>
        </div>
        <div className="card-body">
          {!approvedRequests.length ? (
            <div className="empty-state" style={{ padding: "36px 18px" }}>
                <div className="empty-icon"><IconBadge name="approve" tone="green" size={22} /></div>
              <div className="empty-text">No approved requests yet</div>
              <div className="empty-sub">Requests approved by the grants accountant will appear here for procurement action.</div>
            </div>
          ) : (
            <div className="table-wrap procurement-mobile-table">
              <table>
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Item Description</th>
                    <th>Quantity</th>
                    <th>Budget</th>
                    <th>Requestor Name</th>
                    <th>Date Approved</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedRequests.map(record => {
                    const stage = getProcurementStage(record);
                    const isActive = record.id === selectedId;
                    const actionLabel = stage === "New" ? "Process" : "Open";

                    return (
                      <tr
                        key={record.id}
                        className="clickable"
                        onClick={() => onSelectRecord(record, { openDetails: true, scrollToSummary: true })}
                        style={isActive ? { background: "#f8fbff" } : undefined}
                      >
                        <td data-label="Request ID"><span className="ref">{record.id}</span></td>
                        <td data-label="Item Description">{truncateText(getRequestItemsSummaryText(record), 76)}</td>
                        <td data-label="Quantity">{record.quantity || "-"}</td>
                        <td data-label="Budget">UGX {formatAmount(summarizeRequestItems(record.items).totalBudget || record.estimatedBudget)}</td>
                        <td data-label="Requestor Name">{record.requesterName || "-"}</td>
                        <td data-label="Date Approved">{formatDateTime(record.accountantDecisionAt)}</td>
                        <td data-label="Status"><ProcurementStagePill stage={stage} /></td>
                        <td data-label="Action">
                          <button
                            className="btn btn-amber btn-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              onProcessRequest(record);
                            }}
                          >
                            <ActionButtonIcon name={stage === "New" ? "process" : "view"} tone="amber" />
                            {actionLabel}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Completed Procurements</div>
            <div className="page-sub">Completed procurement files can now be handed over to Finance for payment processing without reopening the procurement workflow.</div>
          </div>
        </div>
        <div className="card-body">
          {!completedProcurements.length ? (
            <div className="empty-state" style={{ padding: "26px 18px" }}>
              <div className="empty-icon"><IconBadge name="ast" tone="green" size={22} /></div>
              <div className="empty-text">No completed procurements yet</div>
              <div className="empty-sub">Completed procurement files will appear here after the GRN is captured.</div>
            </div>
          ) : (
            <div className="table-wrap procurement-mobile-table">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Project</th>
                    <th>Activity Code</th>
                    <th>Vendor</th>
                    <th>Total Amount</th>
                    <th>Status</th>
                    <th>Finance</th>
                  </tr>
                </thead>
                <tbody>
                  {completedProcurements.map(record => {
                    const stage = getProcurementStage(record);
                    const isSent = stage === "Sent to Finance" || !!record.financeRequestId || !!record.financeSentAt;
                    const vendorName = record.purchaseDocument?.selectedServiceProvider || record.bidAnalysis?.selectedProviderName || "-";
                    const totalAmount = Number(record.purchaseDocument?.totalCost || record.purchaseDocument?.amount || record.bidAnalysis?.amount || 0);

                    return (
                      <tr
                        key={`completed-${record.id}`}
                        className="clickable"
                        onClick={() => onSelectRecord(record, { openDetails: true, scrollToSummary: true })}
                        style={record.id === selectedId ? { background: "#f8fbff" } : undefined}
                      >
                        <td data-label="Reference"><span className="ref">{record.id}</span></td>
                        <td data-label="Project">{record.projectName || "-"}</td>
                        <td data-label="Activity Code">{record.activityCode || "-"}</td>
                        <td data-label="Vendor">{vendorName}</td>
                        <td data-label="Total Amount">UGX {formatAmount(totalAmount)}</td>
                        <td data-label="Status"><ProcurementStagePill stage={stage} /></td>
                        <td data-label="Finance">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!isSent) onSendToFinance?.(record);
                            }}
                            disabled={isSent}
                          >
                            <ActionButtonIcon name="payments" tone="navy" />
                            {isSent ? "Sent" : "Send to Finance"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 18,
          transition: "all .24s ease",
          border: activeRecord ? "1px solid #bfdbfe" : "1px dashed #dbe4f0",
          boxShadow: activeRecord ? "0 16px 36px rgba(59, 130, 246, 0.10)" : "none",
          background: activeRecord ? "linear-gradient(135deg, #f8fbff 0%, #ffffff 70%)" : "#ffffff",
        }}
      >
        <div className="card-header">
          <div>
            <div className="card-title">Active Processing Workspace</div>
            <div className="page-sub">The selected request stays inside this dashboard while the RFQ, bid analysis, and LPO workflow continues below.</div>
          </div>
          <div className="procurement-chip-grid">
            {activeRecord && <ProcurementStagePill stage={getProcurementStage(activeRecord)} />}
            {activeRecord && <button className="btn btn-ghost btn-sm" type="button" onClick={onClearSelection}><ActionButtonIcon name="back" tone="blue" />Back</button>}
          </div>
        </div>
        <div className="card-body">
          {!activeRecord ? (
            <div className="empty-state" style={{ padding: "26px 18px" }}>
              <div className="empty-icon"><IconBadge name="workflow" tone="blue" size={22} /></div>
              <div className="empty-text">No active request selected</div>
              <div className="empty-sub">Use Process on any approved request to start working on it here.</div>
            </div>
          ) : (
            <div className="grid-2" style={{ alignItems: "start" }}>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Current Request</div>
                <SummaryField label="Request ID" value={activeRecord.id} />
                <SummaryField label="Items" value={getRequestItemsSummaryText(activeRecord)} />
                <SummaryField label="Primary Quantity" value={String(activeRecord.quantity || "-")} />
                <SummaryField label="Budget" value={`UGX ${formatAmount(summarizeRequestItems(activeRecord.items).totalBudget || activeRecord.estimatedBudget)}`} />
              </div>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Routing</div>
                <SummaryField label="Requestor" value={activeRecord.requesterName || "-"} />
                <SummaryField label="Approved By Accountant" value={activeRecord.accountantDecisionByName || activeRecord.accountantName || "-"} />
                <SummaryField label="Date Approved" value={formatDateTime(activeRecord.accountantDecisionAt)} />
                <SummaryField label="Executive Approval" value={activeRecord.purchaseDocument?.edStatus || "Pending"} />
                <SummaryField label="RFQ Status" value={activeRecord.rfq?.status || "RFQ ready to prepare"} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ExecutiveDirectorDashboard({ requisitions, onSelectRecord }) {
  const documentQueue = requisitions
    .filter(record => !!record.purchaseDocument && [EXECUTIVE_APPROVAL_PENDING, "Approved", "Rejected"].includes(record.purchaseDocument.edStatus))
    .sort((a, b) => new Date(b.purchaseDocument?.generatedAt || b.updatedAt || 0) - new Date(a.purchaseDocument?.generatedAt || a.updatedAt || 0));
  const awaiting = documentQueue.filter(record => record.purchaseDocument?.edStatus === EXECUTIVE_APPROVAL_PENDING);
  const approved = documentQueue.filter(record => record.purchaseDocument?.edStatus === "Approved");
  const rejected = documentQueue.filter(record => record.purchaseDocument?.edStatus === "Rejected");

  return (
    <>
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div className="page-title">Executive Director Approval</div>
        <div className="page-sub">Review generated PO or LPO documents and record executive approval inside the procurement module.</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#fef3c7", color: "#92400e" }}><IconBadge name="workflow" tone="amber" size={17} /></div>
          <div className="stat-val">{awaiting.length}</div>
          <div className="stat-label">{EXECUTIVE_APPROVAL_PENDING}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#d1fae5", color: "#065f46" }}><IconBadge name="approve" tone="green" size={17} /></div>
          <div className="stat-val">{approved.length}</div>
          <div className="stat-label">Approved</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#fee2e2", color: "#991b1b" }}><IconBadge name="reject" tone="red" size={17} /></div>
          <div className="stat-val">{rejected.length}</div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <div className="card-title">PO / LPO Queue</div>
            <div className="page-sub">Only generated procurement documents appear here for executive review.</div>
          </div>
        </div>
        <div className="card-body">
          {!documentQueue.length ? (
            <div className="empty-state" style={{ padding: "36px 18px" }}>
              <div className="empty-icon"><IconBadge name="workflow" tone="amber" size={22} /></div>
              <div className="empty-text">No PO or LPO documents yet</div>
              <div className="empty-sub">Generated purchase documents will appear here for Executive Director action.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Document</th>
                    <th>Executive Approval Status</th>
                    <th>Requester</th>
                    <th>Amount</th>
                    <th>Generated</th>
                  </tr>
                </thead>
                <tbody>
                  {documentQueue.map(record => (
                    <tr key={record.id} className="clickable" onClick={() => onSelectRecord(record)}>
                      <td><span className="ref">{record.id}</span></td>
                      <td>{record.purchaseDocument?.type || "-"}</td>
                      <td><EdStatusPill status={record.purchaseDocument?.edStatus} /></td>
                      <td>{record.requesterName}</td>
                      <td>UGX {formatAmount(record.purchaseDocument?.amount)}</td>
                      <td>{formatDateTime(record.purchaseDocument?.generatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function ProcurementRequisitionPage({ user, users = [], projects = [], onSendToFinance, onCreateNotification }) {
  const activityOptions = buildActivityOptions(projects);
  const defaultActivityCode = activityOptions[0]?.code || "";
  const summaryCardRef = useRef(null);
  const procurementWorkspaceRef = useRef(null);
  const requestFormRef = useRef(null);
  const [initialState] = useState(() => getInitialProcurementState(user, users, defaultActivityCode));
  const [requisitions, setRequisitions] = useState(initialState.requisitions);
  const [selectedId, setSelectedId] = useState(initialState.selectedId);
  const [form, setForm] = useState(initialState.form);
  const [rfqForm, setRfqForm] = useState(() => {
    const initialRecord = initialState.requisitions.find(record => record.id === initialState.selectedId) || null;
    return buildRfqForm(initialRecord, user);
  });
  const [bidAnalysisForm, setBidAnalysisForm] = useState(() => {
    const initialRecord = initialState.requisitions.find(record => record.id === initialState.selectedId) || null;
    return buildBidAnalysisForm(initialRecord);
  });
  const [committeeMinutesForm, setCommitteeMinutesForm] = useState(() => {
    const initialRecord = initialState.requisitions.find(record => record.id === initialState.selectedId) || null;
    return buildCommitteeMinutesForm(initialRecord);
  });
  const [goodsReceivedForm, setGoodsReceivedForm] = useState(() => {
    const initialRecord = initialState.requisitions.find(record => record.id === initialState.selectedId) || null;
    return buildGoodsReceivedForm(initialRecord);
  });
  const [lpoForm, setLpoForm] = useState(() => {
    const initialRecord = initialState.requisitions.find(record => record.id === initialState.selectedId) || null;
    return buildLpoForm(initialRecord, user, initialState.requisitions);
  });
  const [isUploadingQuotations, setIsUploadingQuotations] = useState(false);
  const [isUploadingCommitteeMinutes, setIsUploadingCommitteeMinutes] = useState(false);
  const [isUploadingDeliveryNote, setIsUploadingDeliveryNote] = useState(false);
  const [isUploadingSamplePhoto, setIsUploadingSamplePhoto] = useState(false);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [showSelectedDetails, setShowSelectedDetails] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [focusProcurementWorkspace, setFocusProcurementWorkspace] = useState(false);
  const [requesterSearchInput, setRequesterSearchInput] = useState("");
  const [requesterSearchTerm, setRequesterSearchTerm] = useState("");
  const [showAllRequesterRecords, setShowAllRequesterRecords] = useState(false);
  const activeActivityCode = form.activityCode || defaultActivityCode;
  const canCreateProcurementRequest = user.role !== "executive_director";

  const ownRecords = requisitions
    .filter(record => canCreateProcurementRequest && record.requesterId === user.id)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  const requesterApprovalQueueRecords = ownRecords.filter(record => ["Submitted", "Supervisor Approved"].includes(record.status));

  const supervisorQueue = requisitions
    .filter(record => record.supervisorId === user.id && record.status === "Submitted")
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  const accountantQueue = requisitions
    .filter(record => record.accountantId === user.id && record.status === "Supervisor Approved")
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  const assignedQueue = user.role === "supervisor"
    ? supervisorQueue
    : user.role === "accountant"
      ? accountantQueue
      : [];

  const approvedByUserRecords = ["supervisor", "accountant"].includes(user.role)
    ? requisitions
      .filter(record => getApprovalHistory(record).some(entry => entry.byId === user.id && entry.decision === "approved"))
      .sort((a, b) => {
        const left = getLatestApprovalEntry(a, user.id, "approved")?.at || a.updatedAt || a.createdAt || 0;
        const right = getLatestApprovalEntry(b, user.id, "approved")?.at || b.updatedAt || b.createdAt || 0;
        return new Date(right) - new Date(left);
      })
    : [];

  const selectedRecord = requisitions.find(record => record.id === selectedId) || null;
  const canEditSelected = canCreateProcurementRequest
    && (!selectedRecord || (selectedRecord.requesterId === user.id && selectedRecord.status === "Draft"));
  const canSupervisorApprove = !!selectedRecord && user.role === "supervisor" && selectedRecord.supervisorId === user.id && selectedRecord.status === "Submitted";
  const canAccountantApprove = !!selectedRecord && user.role === "accountant" && selectedRecord.accountantId === user.id && selectedRecord.status === "Supervisor Approved";
  const canEdApprovePurchaseDocument = !!selectedRecord
    && user.role === "executive_director"
    && !!selectedRecord.purchaseDocument
    && selectedRecord.purchaseDocument.edStatus === EXECUTIVE_APPROVAL_PENDING;
  const canTakeApprovalAction = canSupervisorApprove || canAccountantApprove;
  const pendingAssignedCount = assignedQueue.length;
  const filteredRequesterRecords = requesterSearchTerm
    ? ownRecords.filter(record => {
      const term = requesterSearchTerm.toLowerCase();
      return [
        record.id,
        getRequestItemsSummaryText(record),
        record.deliveryLocation,
        record.status,
        record.expectedDeliveryDate,
      ].filter(Boolean).join(" ").toLowerCase().includes(term);
    })
    : ownRecords;
  const canAccessProcurementDashboard = user.role === "procurement_officer";
  const canAccessExecutiveDirectorDashboard = user.role === "executive_director";
  const procurementStage = getProcurementStage(selectedRecord || {});
  const hasProcurementWorkspace = canAccessProcurementDashboard
    && !!selectedRecord
    && selectedRecord.status === "Accountant Approved"
    && (procurementStage !== "New" || !!selectedRecord.rfq || !!selectedRecord.bidAnalysis || !!selectedRecord.purchaseDocument);
  const canManageRfq = hasProcurementWorkspace && ["Processing", "RFQ Sent", "Bid Analysis", "Bid Analysis Completed", "LPO Created"].includes(procurementStage);
  const canManageQuotations = hasProcurementWorkspace && ["RFQ Sent", "Bid Analysis", "Bid Analysis Completed", "LPO Created"].includes(procurementStage);
  const canManageBidAnalysis = hasProcurementWorkspace && ["RFQ Sent", "Bid Analysis", "Bid Analysis Completed", "LPO Created"].includes(procurementStage);
  const canManagePurchaseDocument = hasProcurementWorkspace && ["Bid Analysis", "Bid Analysis Completed", "LPO Created"].includes(procurementStage);
  const canDownloadApprovedLpo = canAccessProcurementDashboard
    && !!selectedRecord?.purchaseDocument
    && selectedRecord.purchaseDocument.edStatus === "Approved";
  const canManageGoodsReceived = canAccessProcurementDashboard
    && !!selectedRecord?.purchaseDocument
    && selectedRecord.purchaseDocument.edStatus === "Approved"
    && !["Completed", "Sent to Finance"].includes(procurementStage);
  const decisionAmount = getDecisionAmount(selectedRecord);
  const targetDocumentType = getDocumentTypeForRecord(selectedRecord);
  const requiresBidAnalysis = targetDocumentType === "LPO";
  const requiresCommitteeMinutes = targetDocumentType === "LPO";
  const canEditLpoTemplate = canManagePurchaseDocument
    && targetDocumentType === "LPO"
    && !!selectedRecord?.purchaseDocument
    && ![EXECUTIVE_APPROVAL_PENDING, "Approved"].includes(selectedRecord.purchaseDocument.edStatus);
  const executiveDirector = getExecutiveDirector(users);
  const shouldShowSummaryCard = !!selectedRecord && (!canEditSelected || selectedRecord.status !== "Draft");

  useEffect(() => {
    if (!focusProcurementWorkspace || !canManageRfq) return;
    procurementWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusProcurementWorkspace(false);
  }, [focusProcurementWorkspace, canManageRfq]);

  useEffect(() => {
    if (!showRequestForm) return;
    requestAnimationFrame(() => {
      requestFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [showRequestForm, selectedId]);

  const syncRecords = (nextRecords, nextSelectedRecordId = selectedId, nextToast = null) => {
    saveProcurementRequisitions(nextRecords);
    setRequisitions(nextRecords);
    setSelectedId(nextSelectedRecordId);
    setShowSelectedDetails(false);

    const selected = nextRecords.find(record => record.id === nextSelectedRecordId) || null;
    setForm(selected ? formFromRecord(selected, defaultActivityCode, user) : createEmptyForm(defaultActivityCode, user));
    setRfqForm(buildRfqForm(selected, user));
    setBidAnalysisForm(buildBidAnalysisForm(selected));
    setCommitteeMinutesForm(buildCommitteeMinutesForm(selected));
    setGoodsReceivedForm(buildGoodsReceivedForm(selected));
    setLpoForm(buildLpoForm(selected, user, nextRecords));
    setErrors({});
    setToast(nextToast);
  };

  const setField = (key, value) => {
    if (!canEditSelected) return;
    setForm(current => ({ ...current, [key]: value }));
  };

  const setItemField = (itemId, key, value) => {
    if (!canEditSelected) return;
    setForm(current => ({
      ...current,
      items: (current.items || []).map(item => (
        item.id === itemId ? { ...item, [key]: value } : item
      )),
    }));
  };

  const addRequestItem = () => {
    if (!canEditSelected) return;
    setForm(current => ({
      ...current,
      items: [...normalizeRequestItems(current.items), createRequestItem()],
    }));
  };

  const removeRequestItem = (itemId) => {
    if (!canEditSelected) return;
    setForm(current => {
      const nextItems = normalizeRequestItems(current.items).filter(item => item.id !== itemId);
      return {
        ...current,
        items: nextItems.length ? nextItems : [createRequestItem()],
      };
    });
  };

  const selectRecord = (record, options = {}) => {
    setSelectedId(record.id);
    setErrors({});
    setToast(null);
    setShowSelectedDetails(Boolean(options.openDetails));
    setShowRequestForm(Boolean(record && record.requesterId === user.id && record.status === "Draft"));
    setForm(formFromRecord(record, defaultActivityCode, user));
    setRfqForm(buildRfqForm(record, user));
    setBidAnalysisForm(buildBidAnalysisForm(record));
    setCommitteeMinutesForm(buildCommitteeMinutesForm(record));
    setGoodsReceivedForm(buildGoodsReceivedForm(record));
    setLpoForm(buildLpoForm(record, user, requisitions));

    if (options.scrollToSummary) {
      requestAnimationFrame(() => {
        summaryCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const resetForm = () => {
    if (!canCreateProcurementRequest) return;
    setShowRequestForm(true);
    clearSelection();
  };

  const handleRequesterSearch = () => {
    setRequesterSearchTerm(requesterSearchInput.trim());
    setShowAllRequesterRecords(true);
  };

  const clearRequesterSearch = () => {
    setRequesterSearchInput("");
    setRequesterSearchTerm("");
    setShowAllRequesterRecords(false);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setErrors({});
    setToast(null);
    setShowSelectedDetails(false);
    setForm(createEmptyForm(defaultActivityCode, user));
    setRfqForm(buildRfqForm(null, user));
    setBidAnalysisForm(buildBidAnalysisForm(null));
    setCommitteeMinutesForm(buildCommitteeMinutesForm(null));
    setGoodsReceivedForm(buildGoodsReceivedForm(null));
    setLpoForm(buildLpoForm(null, user, requisitions));
  };

  const setRfqField = (key, value) => {
    if (!canManageRfq) return;
    setRfqForm(current => ({ ...current, [key]: value }));
  };

  const setRfqProviderField = (providerId, key, value) => {
    if (!canManageRfq) return;
    setRfqForm(current => ({
      ...current,
      providers: (current.providers || []).map(provider =>
        provider.id === providerId ? { ...provider, [key]: value } : provider
      ),
    }));
  };

  const addRfqProvider = () => {
    if (!canManageRfq) return;
    setRfqForm(current => ({
      ...current,
      providers: [...(current.providers || []), createRfqProvider()],
    }));
  };

  const setBidAnalysisProviderField = (providerId, key, value) => {
    if (!canManageBidAnalysis) return;
    setBidAnalysisForm(current => ({
      ...current,
      providers: (current.providers || []).map(provider => {
        const isTarget = provider.id === providerId || provider.providerId === providerId;
        if (!isTarget) {
          return key === "isBestProvider" ? { ...provider, isBestProvider: false } : provider;
        }

        if (key === "isBestProvider") {
          return { ...provider, isBestProvider: true };
        }

        return { ...provider, [key]: value };
      }),
      selectedProviderId: key === "isBestProvider" ? providerId : current.selectedProviderId,
    }));
  };

  const setGoodsReceivedField = (key, value) => {
    if (!canManageGoodsReceived) return;
    setGoodsReceivedForm(current => ({ ...current, [key]: value }));
  };

  const setLpoField = (key, value) => {
    if (!canEditLpoTemplate) return;
    setLpoForm(current => ({
      ...(current || buildLpoForm(selectedRecord, user, requisitions)),
      [key]: value,
    }));
  };

  const handleSamplePhotoUpload = async (event) => {
    if (!canEditSelected) return;

    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingSamplePhoto(true);
    setErrors(current => ({ ...current, samplePhoto: null }));

    try {
      const storedPhoto = await fileToStoredAttachment(file, "sample-photo");
      setForm(current => ({ ...current, samplePhoto: storedPhoto }));
    } catch (error) {
      setErrors(current => ({
        ...current,
        samplePhoto: error instanceof Error ? error.message : "Unable to upload the sample photo.",
      }));
    } finally {
      setIsUploadingSamplePhoto(false);
      event.target.value = "";
    }
  };

  const handleDownloadStageForm = () => {
    if (!selectedRecord || selectedRecord.status === "Draft") {
      setErrors(current => ({ ...current, stageDownload: "Submit the requisition before downloading the current-stage form." }));
      return;
    }

    const ok = openRequisitionPrintWindow(selectedRecord);
    if (!ok) {
      setToast({ tone: "amber", message: "Unable to open the requisition print window. Please allow pop-ups and try again." });
      return;
    }

    setErrors(current => ({ ...current, stageDownload: null }));
    setToast({ tone: "blue", message: "Current-stage requisition summary opened. Save it as PDF from the browser dialog." });
  };

  const handleProcessApprovedRequest = (record) => {
    if (!record || user.role !== "procurement_officer") return;

    const currentStage = getProcurementStage(record);
    const now = new Date().toISOString();
    const nextRecords = requisitions.map(item =>
      item.id === record.id
        ? {
            ...item,
            updatedAt: now,
            procurementStage: currentStage === "New" ? "Processing" : (item.procurementStage || currentStage),
            rfq: item.rfq || {
              referenceNumber: getAutoRfqReferenceNumber(item),
              items: buildRfqItems(item),
              itemDescription: item.itemDescription,
              quantity: Number(item.quantity || 0),
              specifications: item.notes || item.itemDescription || "",
              budget: Number(item.estimatedBudget || 0),
              deliveryDate: item.expectedDeliveryDate || "",
              providers: [createRfqProvider()],
              supplierList: [],
              submissionDeadline: "",
              additionalNotes: "",
              generatedAt: now,
              status: "Draft",
              sentAt: null,
            },
          }
        : item
    );

    syncRecords(nextRecords, record.id, {
      tone: "blue",
      message: currentStage === "New"
        ? "Request moved to Processing and the RFQ workspace is ready below."
        : "Processing workspace opened for the selected request.",
    });
    setShowSelectedDetails(true);
    setFocusProcurementWorkspace(true);
  };

  const validate = (status) => {
    const nextErrors = {};

    if (status === "Submitted") {
      const supervisor = getAssignedSupervisor(user, users);
      const accountant = getPrimaryAccountant(users);
      const itemSummary = summarizeRequestItems(form.items);

      if (!itemSummary.items.length) nextErrors.items = "Add at least one procurement item.";
      if (itemSummary.items.some(item => !item.itemDescription)) nextErrors.items = "Each item needs a description.";
      if (itemSummary.items.some(item => !Number(item.quantity) || Number(item.quantity) <= 0)) nextErrors.items = "Each item quantity must be greater than zero.";
      if (itemSummary.items.some(item => !Number(item.estimatedBudget) || Number(item.estimatedBudget) <= 0)) nextErrors.items = "Each item amount must be greater than zero.";
      if (!String(activeActivityCode || "").trim()) nextErrors.activityCode = "Please select an activity code.";
      if (!form.expectedDeliveryDate) nextErrors.expectedDeliveryDate = "Expected delivery date is required.";
      if (!form.deliveryLocation.trim()) nextErrors.deliveryLocation = "Delivery location is required.";
      if (!normalizeSignatureValue(form.requesterSignature)?.value) nextErrors.requesterSignature = "Requester signature is required before submission.";
      if (!supervisor) nextErrors.form = "No supervisor is assigned to this requester.";
      if (!accountant) nextErrors.form = "No grants accountant is available for the procurement workflow.";
    }

    return nextErrors;
  };

  const persist = (status) => {
    if (!canCreateProcurementRequest) {
      setErrors({ form: "The Executive Director cannot create procurement requisitions." });
      return;
    }

    const nextErrors = validate(status);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const normalized = normalizeForm(form);
    normalized.activityCode = String(activeActivityCode || "").trim().toUpperCase();
    const now = new Date().toISOString();
    const supervisor = getAssignedSupervisor(user, users);
    const accountant = getPrimaryAccountant(users);
    let nextRecords = requisitions;
    let nextSelectedRecordId = selectedId;

    if (selectedRecord) {
      nextRecords = requisitions.map(record =>
        record.id === selectedRecord.id
          ? {
              ...record,
              ...normalized,
              status,
              updatedAt: now,
              submittedAt: status === "Submitted" ? (record.submittedAt || now) : null,
              supervisorId: supervisor?.id || record.supervisorId || null,
              supervisorName: supervisor?.name || record.supervisorName || "Unassigned",
              accountantId: accountant?.id || record.accountantId || null,
              accountantName: accountant?.name || record.accountantName || "Unassigned",
              rejectionReason: "",
              approvalHistory: record.approvalHistory || [],
              supervisorDecisionAt: status === "Draft" ? null : record.supervisorDecisionAt,
              supervisorDecisionById: status === "Draft" ? null : record.supervisorDecisionById,
              supervisorDecisionByName: status === "Draft" ? null : record.supervisorDecisionByName,
              accountantDecisionAt: status === "Draft" ? null : record.accountantDecisionAt,
              accountantDecisionById: status === "Draft" ? null : record.accountantDecisionById,
              accountantDecisionByName: status === "Draft" ? null : record.accountantDecisionByName,
            }
          : record
      );
    } else {
      nextSelectedRecordId = nextRequisitionId(requisitions);
      nextRecords = [
        {
          id: nextSelectedRecordId,
          requesterId: user.id,
          requesterName: user.name,
          requesterRole: user.role,
          createdAt: now,
          updatedAt: now,
          submittedAt: status === "Submitted" ? now : null,
          status,
          supervisorId: supervisor?.id || null,
          supervisorName: supervisor?.name || "Unassigned",
          accountantId: accountant?.id || null,
          accountantName: accountant?.name || "Unassigned",
          supervisorDecisionAt: null,
          supervisorDecisionById: null,
          supervisorDecisionByName: null,
          accountantDecisionAt: null,
          accountantDecisionById: null,
          accountantDecisionByName: null,
          rejectionReason: "",
          approvalHistory: [],
          ...normalized,
        },
        ...requisitions,
      ];
    }

    syncRecords(
      nextRecords,
      nextSelectedRecordId,
      {
        tone: status === "Submitted" ? "green" : "blue",
        message: status === "Submitted"
          ? "Purchase requisition submitted to the assigned supervisor."
          : "Purchase requisition saved as draft.",
      }
    );
    if (status === "Submitted" && supervisor?.id && typeof onCreateNotification === "function") {
      onCreateNotification(
        supervisor.id,
        `Approval needed: Procurement requisition ${nextSelectedRecordId} from ${user.name} has been submitted and is awaiting your review.`,
        nextSelectedRecordId,
      );
    }
  };

  const handleApprovalAction = (decision) => {
    if (!selectedRecord || !canTakeApprovalAction) return;

    const now = new Date().toISOString();
    const nextRecords = requisitions.map(record => {
      if (record.id !== selectedRecord.id) return record;

      if (canSupervisorApprove) {
        return {
          ...record,
          status: decision === "approve" ? "Supervisor Approved" : "Rejected by Supervisor",
          updatedAt: now,
          approvalHistory: [
            ...(record.approvalHistory || []),
            {
              id: `approval-${now}-${user.id}`,
              role: "supervisor",
              decision: decision === "approve" ? "approved" : "rejected",
              byId: user.id,
              byName: user.name,
              signature: getSavedUserSignature(user),
              at: now,
              note: decision === "reject" ? "Rejected by supervisor." : "",
            },
          ],
          supervisorDecisionAt: now,
          supervisorDecisionById: user.id,
          supervisorDecisionByName: user.name,
          rejectionReason: decision === "reject" ? "Rejected by supervisor." : "",
        };
      }

      if (canAccountantApprove) {
        return {
          ...record,
          status: decision === "approve" ? "Accountant Approved" : "Rejected by Accountant",
          updatedAt: now,
          approvalHistory: [
            ...(record.approvalHistory || []),
            {
              id: `approval-${now}-${user.id}`,
              role: "accountant",
              decision: decision === "approve" ? "approved" : "rejected",
              byId: user.id,
              byName: user.name,
              signature: getSavedUserSignature(user),
              at: now,
              note: decision === "reject" ? "Rejected by grants accountant." : "",
            },
          ],
          accountantDecisionAt: now,
          accountantDecisionById: user.id,
          accountantDecisionByName: user.name,
          rejectionReason: decision === "reject" ? "Rejected by grants accountant." : "",
        };
      }

      return record;
    });

    syncRecords(
      nextRecords,
      selectedRecord.id,
      {
        tone: decision === "approve" ? "green" : "amber",
        message: decision === "approve"
          ? "Procurement requisition updated successfully."
          : "Procurement requisition rejected.",
      }
    );
  };

  const handleGenerateRfq = () => {
    if (!canManageRfq || !selectedRecord) return;

    const providers = (rfqForm.providers || [])
      .map(provider => ({
        ...provider,
        companyName: provider.companyName.trim(),
        email: provider.email.trim(),
        contactPerson: provider.contactPerson.trim(),
      }))
      .filter(provider => provider.companyName || provider.email || provider.contactPerson);
    const supplierList = providers.map(provider => provider.companyName).filter(Boolean);
    const nextErrors = {};

    if (!rfqForm.referenceNumber.trim()) nextErrors.rfqReferenceNumber = "RFQ reference number is required.";
    if (!providers.length) nextErrors.rfqProviders = "Add at least one service provider.";
    providers.forEach(provider => {
      if (!provider.companyName) nextErrors.rfqProviders = "Each provider must have a company name.";
      if (!provider.email) nextErrors.rfqProviders = "Each provider must have an email address.";
    });
    if (!rfqForm.submissionDeadline) nextErrors.rfqDeadline = "Submission deadline is required.";
    if (!rfqForm.procurementOfficerName.trim()) nextErrors.rfqProcurementOfficerName = "Procurement officer name is required.";
    if (!normalizeSignatureValue(rfqForm.procurementOfficerSignature)?.value) nextErrors.rfqProcurementOfficerSignature = "Procurement officer signature is required.";

    if (Object.keys(nextErrors).length) {
      setErrors(current => ({ ...current, ...nextErrors }));
      return;
    }

    const now = new Date().toISOString();
    const nextRecords = requisitions.map(record =>
      record.id === selectedRecord.id
        ? {
            ...record,
            updatedAt: now,
            procurementStage: record.procurementStage || "Processing",
            rfq: {
              referenceNumber: rfqForm.referenceNumber.trim(),
              items: buildRfqItems(record),
              itemDescription: record.itemDescription,
              quantity: Number(record.quantity || 0),
              specifications: record.notes || record.itemDescription || "",
              budget: Number(record.estimatedBudget || 0),
              deliveryDate: record.expectedDeliveryDate || "",
              providers,
              supplierList,
              submissionDeadline: rfqForm.submissionDeadline,
              generatedAt: record.rfq?.generatedAt || now,
              additionalNotes: rfqForm.additionalNotes.trim(),
              procurementOfficerName: rfqForm.procurementOfficerName.trim(),
              procurementOfficerSignature: normalizeSignatureValue(rfqForm.procurementOfficerSignature),
              status: record.rfq?.status === "RFQ Sent" ? "RFQ Sent" : "Draft",
              sentAt: record.rfq?.sentAt || null,
            },
          }
        : record
    );

    syncRecords(nextRecords, selectedRecord.id, {
      tone: "green",
      message: "RFQ form saved successfully.",
    });
  };

  const handleDownloadRfqPdf = () => {
    if (!selectedRecord?.rfq) {
      setErrors(current => ({ ...current, rfqDownload: "Generate the RFQ before downloading the PDF." }));
      return;
    }
    if (!selectedRecord.rfq.procurementOfficerName?.trim()) {
      setErrors(current => ({ ...current, rfqDownload: "Save the RFQ with the procurement officer name before downloading the PDF." }));
      return;
    }
    if (!normalizeSignatureValue(selectedRecord.rfq.procurementOfficerSignature)?.value) {
      setErrors(current => ({ ...current, rfqDownload: "Save the RFQ with the procurement officer signature before downloading the PDF." }));
      return;
    }

    const ok = openRfqPrintWindow(selectedRecord);
    if (!ok) {
      setToast({ tone: "amber", message: "Unable to open the RFQ print window. Please allow pop-ups and try again." });
      return;
    }

    setErrors(current => ({ ...current, rfqDownload: null }));
    setToast({ tone: "blue", message: "RFQ print preview opened. Save it as PDF from the browser dialog." });
  };

  const handleMarkRfqSent = () => {
    const providers = (rfqForm.providers || [])
      .map(provider => ({
        ...provider,
        companyName: provider.companyName.trim(),
        email: provider.email.trim(),
        contactPerson: provider.contactPerson.trim(),
      }))
      .filter(provider => provider.companyName || provider.email || provider.contactPerson);
    if (!selectedRecord?.rfq) {
      setErrors(current => ({ ...current, rfqSent: "Complete the RFQ form before sending it." }));
      return;
    }
    if (!rfqForm.referenceNumber.trim()) {
      setErrors(current => ({ ...current, rfqReferenceNumber: "RFQ reference number is required." }));
      return;
    }
    if (!providers.length || providers.some(provider => !provider.companyName || !provider.email)) {
      setErrors(current => ({ ...current, rfqProviders: "Add at least one provider with a company name and email before sending the RFQ." }));
      return;
    }
    if (!rfqForm.submissionDeadline) {
      setErrors(current => ({ ...current, rfqDeadline: "Submission deadline is required before sending the RFQ." }));
      return;
    }
    if (!rfqForm.procurementOfficerName.trim()) {
      setErrors(current => ({ ...current, rfqProcurementOfficerName: "Procurement officer name is required before sending the RFQ." }));
      return;
    }
    if (!normalizeSignatureValue(rfqForm.procurementOfficerSignature)?.value) {
      setErrors(current => ({ ...current, rfqProcurementOfficerSignature: "Procurement officer signature is required before sending the RFQ." }));
      return;
    }

    const now = new Date().toISOString();
    const nextRecords = requisitions.map(record =>
      record.id === selectedRecord.id
        ? {
            ...record,
            updatedAt: now,
            procurementStage: "RFQ Sent",
            rfq: {
              ...record.rfq,
              referenceNumber: rfqForm.referenceNumber.trim(),
              items: buildRfqItems(record),
              providers,
              supplierList: providers.map(provider => provider.companyName).filter(Boolean),
              submissionDeadline: rfqForm.submissionDeadline,
              additionalNotes: rfqForm.additionalNotes.trim(),
              specifications: record.rfq?.specifications || record.notes || record.itemDescription || "",
              budget: Number(record.rfq?.budget || record.estimatedBudget || 0),
              deliveryDate: record.rfq?.deliveryDate || record.expectedDeliveryDate || "",
              procurementOfficerName: rfqForm.procurementOfficerName.trim(),
              procurementOfficerSignature: normalizeSignatureValue(rfqForm.procurementOfficerSignature),
              status: "RFQ Sent",
              sentAt: record.rfq.sentAt || now,
            },
          }
        : record
    );

    syncRecords(nextRecords, selectedRecord.id, {
      tone: "green",
      message: "RFQ sent successfully and the bid analysis form is now ready as the next step.",
    });
  };

  const handleProceedBidAnalysis = () => {
    if (!canManageBidAnalysis || !selectedRecord) return;

    const providers = (bidAnalysisForm.providers || []).map(provider => ({
      ...provider,
      serviceProviderName: provider.serviceProviderName.trim(),
      quotedPrice: String(provider.quotedPrice || "").trim(),
      deliveryTime: provider.deliveryTime.trim(),
      notes: provider.notes.trim(),
      email: provider.email?.trim() || "",
      contactPerson: provider.contactPerson?.trim() || "",
    }));
    const selectedProvider = providers.find(provider => provider.providerId === bidAnalysisForm.selectedProviderId || provider.id === bidAnalysisForm.selectedProviderId)
      || providers.find(provider => provider.isBestProvider)
      || null;
    const nextErrors = {};

    if (!providers.length) nextErrors.bidAnalysisProviders = "RFQ providers were not found. Send the RFQ first.";
    providers.forEach(provider => {
      if (!provider.serviceProviderName) nextErrors.bidAnalysisProviders = "Each row must have a service provider name.";
      if (!Number(provider.quotedPrice) || Number(provider.quotedPrice) <= 0) nextErrors.bidAnalysisProviders = "Enter a valid quoted price for every provider.";
      if (!provider.deliveryTime) nextErrors.bidAnalysisProviders = "Enter delivery time for every provider.";
      if (!provider.compliance) nextErrors.bidAnalysisProviders = "Select compliance for every provider.";
    });
    if (!selectedProvider) nextErrors.bidAnalysisSelectedProvider = "Select the best provider before proceeding.";

    if (Object.keys(nextErrors).length) {
      setErrors(current => ({ ...current, ...nextErrors }));
      return;
    }

    const now = new Date().toISOString();
    const lpoAmount = Number(selectedProvider.quotedPrice || 0);
    const documentType = getDocumentTypeForRecord(selectedRecord);
    const nextRecords = requisitions.map(record =>
      record.id === selectedRecord.id
        ? {
            ...record,
            updatedAt: now,
            procurementStage: documentType === "LPO" ? "LPO Created" : "Bid Analysis Completed",
            bidAnalysis: {
              providers,
              selectedProviderId: selectedProvider.providerId || selectedProvider.id,
              selectedProviderName: selectedProvider.serviceProviderName,
              amount: lpoAmount,
              comparisonNotes: bidAnalysisForm.comparisonNotes.trim(),
              savedAt: now,
            },
            purchaseDocument: documentType === "LPO"
              ? {
                  type: "LPO",
                  lpoNumber: record.purchaseDocument?.lpoNumber || nextLpoNumber(requisitions),
                  selectedServiceProvider: selectedProvider.serviceProviderName,
                  itemDescription: record.itemDescription || "",
                  quantity: Number(record.quantity || 0),
                  agreedPrice: Number(record.quantity || 0) > 0 ? lpoAmount / Number(record.quantity || 0) : lpoAmount,
                  totalCost: lpoAmount,
                  deliveryTerms: buildLpoDeliveryTerms(record, selectedProvider),
                  procurementOfficerName: user.role === "procurement_officer" ? user.name : (record.purchaseDocument?.procurementOfficerName || ""),
                  date: record.purchaseDocument?.date || todayDateValue(),
                  procurementOfficerSignature: getSavedUserSignature(user),
                  amount: lpoAmount,
                  generatedAt: now,
                  submittedAt: null,
                  edStatus: PURCHASE_DOCUMENT_DRAFT,
                  edDecisionAt: null,
                  edDecisionById: null,
                  edDecisionByName: null,
                }
              : record.purchaseDocument,
          }
        : record
    );

    syncRecords(nextRecords, selectedRecord.id, {
      tone: "green",
      message: documentType === "LPO"
        ? "Best provider saved and an LPO draft template has been generated automatically."
        : "Best provider saved and bid analysis completed successfully.",
    });
  };

  const handleQuotationUpload = async (event) => {
    if (!canManageQuotations || !selectedRecord) return;

    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setIsUploadingQuotations(true);
    setErrors(current => ({ ...current, quotations: null }));

    try {
      const uploads = await Promise.all(files.map(fileToStoredQuotation));
      const now = new Date().toISOString();
      const nextRecords = requisitions.map(record =>
        record.id === selectedRecord.id
          ? {
              ...record,
              updatedAt: now,
              quotations: [...(record.quotations || []), ...uploads],
            }
          : record
      );

      syncRecords(nextRecords, selectedRecord.id, {
        tone: "green",
        message: `${uploads.length} quotation file${uploads.length === 1 ? "" : "s"} uploaded successfully.`,
      });
    } catch (error) {
      setErrors(current => ({
        ...current,
        quotations: error instanceof Error ? error.message : "Unable to upload quotation files.",
      }));
    } finally {
      setIsUploadingQuotations(false);
      event.target.value = "";
    }
  };

  const handleCommitteeMinutesUpload = async (event) => {
    if (!canManagePurchaseDocument || !selectedRecord) return;

    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingCommitteeMinutes(true);
    setErrors(current => ({ ...current, committeeMinutes: null }));

    try {
      const storedFile = await fileToStoredAttachment(file, "committee-minutes");
      const now = new Date().toISOString();
      const nextRecords = requisitions.map(record =>
        record.id === selectedRecord.id
          ? {
              ...record,
              updatedAt: now,
              committeeMinutes: storedFile,
            }
          : record
      );

      syncRecords(nextRecords, selectedRecord.id, {
        tone: "green",
        message: "Committee minutes uploaded successfully.",
      });
    } catch (error) {
      setErrors(current => ({
        ...current,
        committeeMinutes: error instanceof Error ? error.message : "Unable to upload committee minutes.",
      }));
    } finally {
      setIsUploadingCommitteeMinutes(false);
      event.target.value = "";
    }
  };

  const handleGeneratePurchaseDocument = () => {
    if (!canManagePurchaseDocument || !selectedRecord) return;
    if (targetDocumentType === "LPO") {
      setToast({ tone: "blue", message: "The LPO template is generated automatically after bid analysis. Complete it below and submit it for approval." });
      return;
    }

    const nextErrors = {};
    if (requiresBidAnalysis && !selectedRecord.bidAnalysis) {
      nextErrors.purchaseDocument = "Bid analysis is required before generating an LPO.";
    }
    if (requiresCommitteeMinutes && !selectedRecord.committeeMinutes) {
      nextErrors.purchaseDocument = "Committee minutes must be uploaded before generating an LPO.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(current => ({ ...current, ...nextErrors }));
      return;
    }

    const now = new Date().toISOString();
    const nextRecords = requisitions.map(record =>
      record.id === selectedRecord.id
        ? {
            ...record,
            updatedAt: now,
            procurementStage: "LPO Created",
            purchaseDocument: {
              type: getDocumentTypeForRecord(record),
              amount: getDecisionAmount(record),
              generatedAt: now,
              submittedAt: now,
              edStatus: EXECUTIVE_APPROVAL_PENDING,
              edDecisionAt: null,
              edDecisionById: null,
              edDecisionByName: null,
            },
          }
        : record
    );

    syncRecords(nextRecords, selectedRecord.id, {
      tone: "green",
      message: `${targetDocumentType} generated successfully.`,
    });
  };

  const handleSubmitLpoForApproval = () => {
    if (!selectedRecord?.purchaseDocument || !lpoForm || !canEditLpoTemplate) return;

    const nextErrors = {};
    if (!lpoForm.procurementOfficerName.trim()) nextErrors.lpoProcurementOfficerName = "Procurement officer name is required.";
    if (!lpoForm.date) nextErrors.lpoDate = "Date is required.";
    if (!normalizeSignatureValue(lpoForm.procurementOfficerSignature)?.value) nextErrors.lpoProcurementOfficerSignature = "Digital signature is required before submission.";

    if (Object.keys(nextErrors).length) {
      setErrors(current => ({ ...current, ...nextErrors }));
      return;
    }

    const now = new Date().toISOString();
    const nextRecords = requisitions.map(record =>
      record.id === selectedRecord.id
        ? {
            ...record,
            updatedAt: now,
            procurementStage: "LPO Created",
            purchaseDocument: {
              ...record.purchaseDocument,
              type: "LPO",
              lpoNumber: lpoForm.lpoNumber,
              selectedServiceProvider: lpoForm.selectedServiceProvider,
              itemDescription: lpoForm.itemDescription,
              quantity: Number(lpoForm.quantity || 0),
              agreedPrice: Number(lpoForm.agreedPrice || 0),
              totalCost: Number(lpoForm.totalCost || 0),
              deliveryTerms: lpoForm.deliveryTerms,
              procurementOfficerName: lpoForm.procurementOfficerName.trim(),
              date: lpoForm.date,
              procurementOfficerSignature: normalizeSignatureValue(lpoForm.procurementOfficerSignature),
              amount: Number(lpoForm.totalCost || lpoForm.agreedPrice || record.bidAnalysis?.amount || 0),
              generatedAt: record.purchaseDocument?.generatedAt || now,
              submittedAt: now,
              edStatus: EXECUTIVE_APPROVAL_PENDING,
              edDecisionAt: null,
              edDecisionById: null,
              edDecisionByName: null,
            },
          }
        : record
    );

    syncRecords(nextRecords, selectedRecord.id, {
      tone: "green",
      message: "LPO submitted to the Executive Director for approval.",
    });
  };

  const handleDownloadPurchaseDocument = () => {
    if (!selectedRecord?.purchaseDocument) {
      setErrors(current => ({ ...current, purchaseDocument: "Generate the PO/LPO before downloading it." }));
      return;
    }

    const ok = openPurchaseDocumentPrintWindow(selectedRecord);
    if (!ok) {
      setToast({ tone: "amber", message: "Unable to open the print window. Please allow pop-ups and try again." });
      return;
    }

    setErrors(current => ({ ...current, purchaseDocument: null }));
    setToast({ tone: "blue", message: `${selectedRecord.purchaseDocument.type} print preview opened. Save it as PDF from the browser dialog.` });
  };

  const handleExecutiveDirectorDecision = (decision) => {
    if (!canEdApprovePurchaseDocument || !selectedRecord?.purchaseDocument) return;

    const now = new Date().toISOString();
    const nextRecords = requisitions.map(record =>
      record.id === selectedRecord.id
        ? {
            ...record,
            updatedAt: now,
            procurementStage: decision === "approve" ? "Approved" : "LPO Created",
            purchaseDocument: {
              ...record.purchaseDocument,
              edStatus: decision === "approve" ? "Approved" : "Rejected",
              edDecisionAt: now,
              edDecisionById: user.id,
              edDecisionByName: user.name,
            },
          }
        : record
    );

    syncRecords(nextRecords, selectedRecord.id, {
      tone: decision === "approve" ? "green" : "amber",
      message: `${selectedRecord.purchaseDocument.type} ${decision === "approve" ? "approved" : "rejected"} by the Executive Director.`,
    });
  };

  const handleDownloadFinalProcurementReport = async () => {
    if (!selectedRecord) {
      setErrors(current => ({ ...current, finalReport: "Select a procurement request before downloading the final report." }));
      return;
    }

    const ok = await downloadProcurementReportPdf(selectedRecord);
    if (!ok) {
      setToast({ tone: "amber", message: "Unable to generate the procurement PDF." });
      return;
    }

    setErrors(current => ({ ...current, finalReport: null }));
    setToast({ tone: "blue", message: "Final procurement PDF downloaded successfully." });
  };

  const handleDeliveryNoteUpload = async (event) => {
    if (!canManageGoodsReceived || !selectedRecord) return;

    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingDeliveryNote(true);
    setErrors(current => ({ ...current, deliveryNote: null }));

    try {
      const storedFile = await fileToStoredAttachment(file, "delivery-note");
      setGoodsReceivedForm(current => ({ ...current, deliveryNote: storedFile }));
    } catch (error) {
      setErrors(current => ({
        ...current,
        deliveryNote: error instanceof Error ? error.message : "Unable to upload delivery note.",
      }));
    } finally {
      setIsUploadingDeliveryNote(false);
      event.target.value = "";
    }
  };

  const handleMarkProcurementComplete = () => {
    if (!canManageGoodsReceived || !selectedRecord) return;

    const nextErrors = {};
    if (!goodsReceivedForm.grn.trim()) nextErrors.goodsReceivedGrn = "Goods Received Note is required.";
    if (!goodsReceivedForm.deliveryNote) nextErrors.deliveryNote = "Delivery note upload is required.";
    if (!goodsReceivedForm.signature.trim()) nextErrors.goodsReceivedSignature = "Signature is required.";

    if (Object.keys(nextErrors).length) {
      setErrors(current => ({ ...current, ...nextErrors }));
      return;
    }

    const now = new Date().toISOString();
    const nextRecords = requisitions.map(record =>
      record.id === selectedRecord.id
        ? {
            ...record,
            updatedAt: now,
            procurementStage: "Completed",
            procurementCompletedAt: now,
            goodsReceived: {
              grn: goodsReceivedForm.grn.trim(),
              deliveryNote: goodsReceivedForm.deliveryNote,
              signature: goodsReceivedForm.signature.trim(),
              status: "Completed",
              completedAt: now,
            },
          }
        : record
    );

    syncRecords(nextRecords, selectedRecord.id, {
      tone: "green",
      message: "Procurement marked complete with goods received details.",
    });
  };

  const handleSendCompletedProcurementToFinance = (record) => {
    if (!record || typeof onSendToFinance !== "function") {
      setToast({ tone: "amber", message: "Finance integration is not available right now." });
      return;
    }

    const stage = getProcurementStage(record);
    if (!["Completed", "Sent to Finance"].includes(stage)) return;

    const result = onSendToFinance(record);
    if (!result?.ok) {
      setToast({ tone: "amber", message: "Unable to send this procurement file to Finance right now." });
      return;
    }

    const now = new Date().toISOString();
    const nextRecords = requisitions.map(item =>
      item.id === record.id
        ? {
            ...item,
            updatedAt: now,
            procurementStage: "Sent to Finance",
            financeRequestId: result.financeRequestId || item.financeRequestId || null,
            financeSentAt: item.financeSentAt || now,
            financeSentById: user.id,
            financeSentByName: user.name,
          }
        : item
    );

    syncRecords(nextRecords, record.id, {
      tone: result.alreadySent ? "blue" : "green",
      message: result.alreadySent
        ? "This procurement file was already sent to Finance. The procurement status has been synced."
        : "Successfully sent to Finance",
    });
  };

  return (
    <div className="page new-request-page procurement-page-shell">
      <style>{`
        .procurement-page-shell .procurement-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(260px, .9fr);
          gap: 18px;
          padding: 22px;
          border-radius: 24px;
          margin-bottom: 18px;
          background: linear-gradient(135deg, #0f2744 0%, #1f4f80 62%, #eff6ff 180%);
          color: #fff;
          overflow: hidden;
        }
        .procurement-page-shell .procurement-hero-main {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }
        .procurement-page-shell .procurement-hero-logo {
          width: 72px;
          height: 72px;
          border-radius: 18px;
          background: rgba(255,255,255,.96);
          padding: 8px;
          flex-shrink: 0;
          box-shadow: 0 10px 24px rgba(7,16,31,.18);
        }
        .procurement-page-shell .procurement-hero-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .procurement-page-shell .procurement-hero-tag {
          font-size: 11px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgba(255,255,255,.72);
          margin-bottom: 8px;
          font-weight: 800;
        }
        .procurement-page-shell .procurement-hero-title {
          font-size: 30px;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: 8px;
        }
        .procurement-page-shell .procurement-hero-sub {
          max-width: 720px;
          color: rgba(255,255,255,.84);
          font-size: 14px;
        }
        .procurement-page-shell .procurement-hero-panel {
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 20px;
          background: rgba(255,255,255,.10);
          backdrop-filter: blur(10px);
          padding: 16px;
        }
        .procurement-page-shell .procurement-hero-panel-title {
          font-size: 11px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: rgba(255,255,255,.66);
          margin-bottom: 12px;
          font-weight: 800;
        }
        .procurement-page-shell .procurement-hero-metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .procurement-page-shell .procurement-hero-metric {
          padding: 12px;
          border-radius: 16px;
          background: rgba(255,255,255,.08);
        }
        .procurement-page-shell .procurement-hero-metric strong {
          display: block;
          font-size: 24px;
          line-height: 1;
          margin-bottom: 4px;
        }
        .procurement-page-shell .procurement-hero-metric span {
          font-size: 11px;
          color: rgba(255,255,255,.74);
          text-transform: uppercase;
          letter-spacing: .06em;
        }
        .procurement-page-shell .procurement-chip-grid {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .procurement-page-shell .procurement-mobile-table table {
          width: 100%;
        }
        @media (max-width: 920px) {
          .procurement-page-shell .procurement-hero {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 820px) {
          .procurement-page-shell .procurement-mobile-table {
            overflow-x: visible;
          }
          .procurement-page-shell .procurement-mobile-table table,
          .procurement-page-shell .procurement-mobile-table thead,
          .procurement-page-shell .procurement-mobile-table tbody,
          .procurement-page-shell .procurement-mobile-table tr,
          .procurement-page-shell .procurement-mobile-table th,
          .procurement-page-shell .procurement-mobile-table td {
            display: block;
            width: 100%;
          }
          .procurement-page-shell .procurement-mobile-table thead {
            display: none;
          }
          .procurement-page-shell .procurement-mobile-table tr {
            border: 1px solid #dbe4f0;
            border-radius: 18px;
            background: #fff;
            padding: 12px 14px;
            margin-bottom: 12px;
            box-shadow: 0 10px 26px rgba(15, 39, 68, 0.06);
          }
          .procurement-page-shell .procurement-mobile-table td {
            border: none;
            padding: 8px 0;
            display: grid;
            grid-template-columns: minmax(110px, 40%) 1fr;
            gap: 12px;
            align-items: start;
            min-width: 0 !important;
          }
          .procurement-page-shell .procurement-mobile-table td::before {
            content: attr(data-label);
            font-size: 10.5px;
            font-weight: 800;
            letter-spacing: .08em;
            text-transform: uppercase;
            color: #64748b;
          }
          .procurement-page-shell .procurement-mobile-table td > * {
            min-width: 0;
          }
          .procurement-page-shell .procurement-mobile-table td .btn,
          .procurement-page-shell .procurement-mobile-table td input,
          .procurement-page-shell .procurement-mobile-table td select,
          .procurement-page-shell .procurement-mobile-table td textarea {
            width: 100%;
          }
        }
        @media (max-width: 560px) {
          .procurement-page-shell .procurement-hero {
            padding: 18px;
            border-radius: 20px;
          }
          .procurement-page-shell .procurement-hero-main {
            flex-direction: column;
          }
          .procurement-page-shell .procurement-hero-title {
            font-size: 25px;
          }
          .procurement-page-shell .procurement-hero-metrics {
            grid-template-columns: 1fr;
          }
          .procurement-page-shell .procurement-mobile-table td {
            grid-template-columns: 1fr;
            gap: 6px;
          }
        }
        .procurement-page-shell .requester-procurement-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) auto;
          gap: 18px;
          align-items: center;
        }
        .procurement-page-shell .requester-procurement-kicker {
          font-size: 11px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: #9a6700;
          font-weight: 800;
          margin-bottom: 8px;
        }
        .procurement-page-shell .requester-procurement-title {
          font-size: 28px;
          font-weight: 800;
          color: #0f2744;
          line-height: 1.08;
          margin-bottom: 8px;
        }
        .procurement-page-shell .requester-procurement-sub {
          color: #5b6778;
          font-size: 14px;
          max-width: 760px;
        }
        .procurement-page-shell .requester-procurement-actions {
          display: flex;
          justify-content: flex-end;
        }
        .procurement-page-shell .requester-procurement-search {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 10px;
          margin-top: 18px;
        }
        .procurement-page-shell .requester-summary-card,
        .procurement-page-shell .requester-record-card,
        .procurement-page-shell .requester-queue-card {
          border: 1px solid #dbe4f0;
          border-radius: 18px;
          background: #fff;
          padding: 16px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
        }
        .procurement-page-shell .requester-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .procurement-page-shell .requester-summary-footer {
          display: flex;
          gap: 12px;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
        }
        .procurement-page-shell .requester-record-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }
        @media (max-width: 820px) {
          .procurement-page-shell .requester-procurement-hero {
            grid-template-columns: 1fr;
          }
          .procurement-page-shell .requester-procurement-actions {
            justify-content: flex-start;
          }
          .procurement-page-shell .requester-procurement-search {
            grid-template-columns: 1fr;
          }
          .procurement-page-shell .requester-summary-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      {canAccessProcurementDashboard ? (
        <ProcurementOfficerWorkspaceDashboard
          requisitions={requisitions}
          selectedId={selectedId}
          onSelectRecord={selectRecord}
          onProcessRequest={handleProcessApprovedRequest}
          onSendToFinance={handleSendCompletedProcurementToFinance}
          onClearSelection={clearSelection}
          onCreateRequest={resetForm}
        />
      ) : canAccessExecutiveDirectorDashboard ? (
        <ExecutiveDirectorDashboard requisitions={requisitions} onSelectRecord={selectRecord} />
      ) : (
        <div className="page-header">
          <div className="page-title">Purchase Requisition</div>
          <div className="page-sub">Create procurement requests and route approvals inside the procurement module only.</div>
        </div>
      )}

      {!activityOptions.length && (
        <div className="alert alert-amber">
          No activity codes are available yet. Add project activities under Project Budgets before submitting a requisition.
        </div>
      )}

      {pendingAssignedCount > 0 && (
        <div className="alert alert-blue">
          {pendingAssignedCount} procurement requisition{pendingAssignedCount === 1 ? "" : "s"} {user.role === "supervisor" ? "await" : "awaits"} your approval action.
        </div>
      )}

      {toast && <div className={`alert alert-${toast.tone}`}>{toast.message}</div>}

      {canAccessProcurementDashboard && selectedRecord && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Final Procurement Report</div>
              <div className="page-sub">Download a clean, chronological PDF-ready report for the selected procurement request.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="grid-2" style={{ marginBottom: 18 }}>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Selected Request</div>
                <div className="text-xs text-gray mb-1">Reference</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord.id}</div>
                <div className="text-xs text-gray mb-1">Item</div>
                <div style={{ fontWeight: 600 }}>{selectedRecord.itemDescription || "-"}</div>
              </div>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Included Sections</div>
                <div className="text-xs text-gray" style={{ lineHeight: 1.8 }}>
                  Request form, approval history with timestamps, RFQ document, bid analysis table, and the final signed LPO in one downloadable PDF with branding and page numbering.
                </div>
              </div>
            </div>

            {errors.finalReport && <div className="alert alert-red">{errors.finalReport}</div>}

            <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={handleDownloadFinalProcurementReport}><ActionButtonIcon name="download" tone="navy" />Download Final Procurement Report PDF</button>
            </div>
          </div>
        </div>
      )}

      {canDownloadApprovedLpo && selectedRecord && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Approved LPO Return Flow</div>
              <div className="page-sub">The Executive Director has approved this LPO. It is now locked for editing and ready to share with the selected service provider while the goods received step is completed.</div>
            </div>
            <ProcurementStagePill stage={getProcurementStage(selectedRecord)} />
          </div>
          <div className="card-body">
            <div className="grid-2" style={{ marginBottom: 18 }}>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Status</div>
                <SummaryField label="Procurement Stage" value={getProcurementStage(selectedRecord)} />
                <SummaryField label="Executive Approval" value={selectedRecord.purchaseDocument?.edStatus || "-"} />
                <SummaryField label="Approved By" value={selectedRecord.purchaseDocument?.edDecisionByName || "-"} />
                <SummaryField label="Approved At" value={formatDateTime(selectedRecord.purchaseDocument?.edDecisionAt)} />
              </div>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Available Actions</div>
                <div className="text-xs text-gray" style={{ lineHeight: 1.8 }}>
                  Download the approved LPO for the service provider, then continue to the goods received process below to complete procurement after delivery.
                </div>
              </div>
            </div>

            <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={handleDownloadPurchaseDocument}><ActionButtonIcon name="download" tone="navy" />Download LPO</button>
            </div>
          </div>
        </div>
      )}

      {canManageRfq && (
        <div ref={procurementWorkspaceRef} className="card" style={{ marginBottom: 18, transition: "all .24s ease" }}>
          <div className="card-header">
            <div>
              <div className="card-title">RFQ Workspace</div>
              <div className="page-sub">The RFQ form appears here automatically after you click Process. Complete the provider list, deadline, and notes, then send the RFQ from this same dashboard.</div>
            </div>
            <RfqStatusPill status={selectedRecord?.rfq?.status} />
          </div>
          <div className="card-body">
            <div
              className="form-section"
              style={{
                marginBottom: 18,
                border: "1px solid #dbe4f0",
                borderRadius: 20,
                padding: 18,
                background: "linear-gradient(135deg, #f8fbff 0%, #ffffff 72%)",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                <div className="procurement-hero-logo" style={{ width: 56, height: 56, borderRadius: 16, boxShadow: "0 8px 18px rgba(15,39,68,.10)" }}>
                  <img src={INSPIRE_YOUTH_LOGO} alt={`${INSPIRE_YOUTH_ORG} logo`} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "#9a6700", marginBottom: 4 }}>
                    {INSPIRE_YOUTH_ORG}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#0f2744", lineHeight: 1.1 }}>Request for Quotation</div>
                  <div className="text-sm text-gray" style={{ marginTop: 4 }}>
                    RFQ From: {rfqForm.procurementOfficerName || "Procurement Officer"}
                  </div>
                </div>
              </div>

              <div className="table-wrap procurement-mobile-table">
                <table>
                  <thead>
                    <tr>
                      <th>Serial Number</th>
                      <th>Item Description</th>
                      <th>Specifications</th>
                      <th>Quantity</th>
                      <th>Amount</th>
                      <th>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildRfqItems(selectedRecord).map(item => (
                      <tr key={`rfq-preview-${item.serialNumber}`}>
                        <td data-label="Serial Number">{item.serialNumber}</td>
                        <td data-label="Item Description">{item.itemDescription || "-"}</td>
                        <td data-label="Specifications">{item.specifications || "-"}</td>
                        <td data-label="Quantity">{item.quantity || "-"}</td>
                        <td data-label="Amount">To be filled by quoter</td>
                        <td data-label="Total Amount">To be filled by quoter</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="form-section" style={{ marginBottom: 18 }}>
              <div className="form-section-title">Auto-filled Requisition Details</div>
              <div className="grid-2">
                <div>
                  <div className="text-xs text-gray mb-1">Request ID</div>
                  <div style={{ fontWeight: 600 }}>{selectedRecord.id}</div>
                </div>
                <div>
                  <div className="text-xs text-gray mb-1">Budget</div>
                  <div style={{ fontWeight: 600 }}>UGX {formatAmount(selectedRecord.estimatedBudget)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray mb-1">Item Description</div>
                  <div style={{ fontWeight: 600 }}>{getRequestItemsSummaryText(selectedRecord)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray mb-1">Quantity</div>
                  <div style={{ fontWeight: 600 }}>{selectedRecord.quantity || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray mb-1">Specifications</div>
                  <div style={{ fontWeight: 600 }}>{selectedRecord.notes || selectedRecord.itemDescription || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray mb-1">Delivery Date</div>
                  <div style={{ fontWeight: 600 }}>{formatDate(selectedRecord.expectedDeliveryDate)}</div>
                </div>
              </div>
            </div>

            <div className="form-section" style={{ marginBottom: 18 }}>
              <div className="form-section-title">RFQ Details</div>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="rfqReferenceNumber">RFQ Reference Number *</label>
                  <input
                    id="rfqReferenceNumber"
                    value={rfqForm.referenceNumber}
                    onChange={(event) => setRfqField("referenceNumber", event.target.value)}
                    placeholder="Auto-generated RFQ reference"
                  />
                  {errors.rfqReferenceNumber && <div className="field-error">{errors.rfqReferenceNumber}</div>}
                </div>

                <div className="form-group">
                  <label htmlFor="rfqDeadline">Submission Deadline *</label>
                  <input
                    id="rfqDeadline"
                    type="date"
                    value={rfqForm.submissionDeadline}
                    onChange={(event) => setRfqField("submissionDeadline", event.target.value)}
                    />
                  {errors.rfqDeadline && <div className="field-error">{errors.rfqDeadline}</div>}
                </div>

                <div className="form-group">
                  <label htmlFor="rfqProcurementOfficerName">Procurement Officer Name *</label>
                  <input
                    id="rfqProcurementOfficerName"
                    value={rfqForm.procurementOfficerName}
                    onChange={(event) => setRfqField("procurementOfficerName", event.target.value)}
                    placeholder="Enter procurement officer name"
                  />
                  {errors.rfqProcurementOfficerName && <div className="field-error">{errors.rfqProcurementOfficerName}</div>}
                </div>

                <div className="form-group full">
                  <label>Procurement Officer Signature *</label>
                  <SignaturePad value={rfqForm.procurementOfficerSignature} onChange={(value) => setRfqField("procurementOfficerSignature", value)} />
                  <div className="field-hint">This signature will appear on the downloaded RFQ document.</div>
                  {errors.rfqProcurementOfficerSignature && <div className="field-error">{errors.rfqProcurementOfficerSignature}</div>}
                </div>

                <div className="form-group full">
                  <label>List of Service Providers *</label>
                  <div style={{ display: "grid", gap: 12 }}>
                    {(rfqForm.providers || []).map((provider, index) => (
                      <div
                        key={provider.id}
                        style={{
                          border: "1px solid #dbe4f0",
                          borderRadius: 16,
                          padding: "14px 14px 12px",
                          background: "#f8fbff",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#64748b", marginBottom: 12 }}>
                          Provider {index + 1}
                        </div>
                        <div className="grid-2">
                          <div>
                            <label style={{ display: "block", marginBottom: 6 }}>Company Name *</label>
                            <input
                              value={provider.companyName}
                              onChange={(event) => setRfqProviderField(provider.id, "companyName", event.target.value)}
                              placeholder="Enter company name"
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: 6 }}>Email *</label>
                            <input
                              type="email"
                              value={provider.email}
                              onChange={(event) => setRfqProviderField(provider.id, "email", event.target.value)}
                              placeholder="provider@example.com"
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: 6 }}>Contact Person</label>
                            <input
                              value={provider.contactPerson}
                              onChange={(event) => setRfqProviderField(provider.id, "contactPerson", event.target.value)}
                              placeholder="Optional contact person"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="field-hint">Add all service providers you want the RFQ sent to.</div>
                  {errors.rfqProviders && <div className="field-error">{errors.rfqProviders}</div>}
                  <div style={{ marginTop: 12 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={addRfqProvider}><ActionButtonIcon name="add" tone="blue" />Add More</button>
                  </div>
                </div>

                <div className="form-group full">
                  <label htmlFor="rfqAdditionalNotes">Additional Notes</label>
                  <textarea
                    id="rfqAdditionalNotes"
                    rows={4}
                    value={rfqForm.additionalNotes}
                    onChange={(event) => setRfqField("additionalNotes", event.target.value)}
                    placeholder="Add any RFQ instructions, submission conditions, or clarifications"
                  />
                </div>

                <div className="form-group">
                  <label>Current RFQ Status</label>
                  <div style={{ paddingTop: 11 }}>
                    <RfqStatusPill status={selectedRecord?.rfq?.status} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 18 }}>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">RFQ Audit</div>
                <div className="text-xs text-gray mb-1">RFQ Reference Number</div>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>{selectedRecord?.rfq?.referenceNumber || rfqForm.referenceNumber || "-"}</div>
                <div className="text-xs text-gray mb-1">Generated</div>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>{formatDateTime(selectedRecord?.rfq?.generatedAt)}</div>
                <div className="text-xs text-gray mb-1">Sent</div>
                <div style={{ fontWeight: 600 }}>{formatDateTime(selectedRecord?.rfq?.sentAt)}</div>
              </div>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Transition</div>
                <div className="text-xs text-gray" style={{ lineHeight: 1.7 }}>
                  Sending the RFQ changes the procurement status to RFQ Sent and unlocks the bid analysis form as the next step.
                </div>
              </div>
            </div>

            {(errors.rfqDownload || errors.rfqSent) && (
              <div className="alert alert-red">
                {errors.rfqDownload || errors.rfqSent}
              </div>
            )}

            <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost" onClick={handleGenerateRfq}><ActionButtonIcon name="save" tone="blue" />Save RFQ Draft</button>
              <button type="button" className="btn btn-primary" onClick={handleDownloadRfqPdf}><ActionButtonIcon name="download" tone="navy" />Download RFQ PDF</button>
              <button type="button" className="btn btn-green" onClick={handleMarkRfqSent}><ActionButtonIcon name="submit" tone="green" />Send RFQ</button>
            </div>
          </div>
        </div>
      )}

      {canManageQuotations && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Quotation Uploads</div>
              <div className="page-sub">Attach supplier quotations to the currently selected procurement request.</div>
            </div>
            <span className="sbadge" style={{ background: "#eff6ff", color: "#1e40af" }}>
              {selectedRecord?.quotations?.length || 0} uploaded
            </span>
          </div>
          <div className="card-body">
            <div className="form-section" style={{ marginBottom: 18 }}>
              <div className="form-section-title">Attach to Request</div>
              <div className="grid-2">
                <div>
                  <div className="text-xs text-gray mb-1">Procurement Request</div>
                  <div style={{ fontWeight: 600 }}>{selectedRecord.id}</div>
                </div>
                <div>
                  <div className="text-xs text-gray mb-1">Item Details</div>
                  <div style={{ fontWeight: 600 }}>{selectedRecord.itemDescription || "-"}</div>
                </div>
              </div>
            </div>

            <div className="form-section" style={{ marginBottom: 18 }}>
              <div className="form-section-title">Upload Quotations</div>
              <div className="file-drop">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  onChange={handleQuotationUpload}
                  disabled={isUploadingQuotations}
                />
                <div style={{ fontSize: 26, marginBottom: 6 }}><IconBadge name="download" tone="blue" size={18} /></div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--g700)" }}>
                  {isUploadingQuotations ? "Uploading quotations..." : "Upload quotation files"}
                </div>
                <div className="text-xs text-gray" style={{ marginTop: 3 }}>
                  Select multiple PDF or image files to attach to this procurement request.
                </div>
              </div>
              {errors.quotations && <div className="field-error" style={{ marginTop: 8 }}>{errors.quotations}</div>}
            </div>

            <div className="form-section" style={{ marginBottom: 0 }}>
              <div className="form-section-title">Uploaded Quotations</div>
              {!selectedRecord?.quotations?.length ? (
                <div className="empty-state" style={{ padding: "24px 18px" }}>
                  <div className="empty-icon"><IconBadge name="doc" tone="blue" size={22} /></div>
                  <div className="empty-text">No quotations uploaded yet</div>
                  <div className="empty-sub">Uploaded PDFs and images will be listed here for this procurement request.</div>
                </div>
              ) : (
                <div className="table-wrap procurement-mobile-table">
                  <table>
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Uploaded</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecord.quotations.map(quotation => (
                        <tr key={quotation.id}>
                          <td data-label="File">{quotation.name}</td>
                          <td data-label="Type">{quotation.type || "-"}</td>
                          <td data-label="Size">{formatFileSize(quotation.size)}</td>
                          <td data-label="Uploaded">{formatDateTime(quotation.uploadedAt)}</td>
                          <td data-label="Action">
                            {quotation.dataUrl ? (
                              <a href={quotation.dataUrl} download={quotation.name} className="btn btn-ghost btn-sm">Download</a>
                            ) : (
                              <span className="text-xs text-gray">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {canManageBidAnalysis && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Bid Analysis</div>
              <div className="page-sub">Compare all RFQ service providers, capture their offers, and select the best provider in this dashboard.</div>
            </div>
            <span className="sbadge" style={{ background: "#ede9fe", color: "#6d28d9" }}>
              {selectedRecord?.bidAnalysis?.savedAt ? "Best provider saved" : "Pending analysis"}
            </span>
          </div>
          <div className="card-body">
            {!bidAnalysisForm.providers?.length ? (
              <div className="empty-state" style={{ padding: "24px 18px" }}>
                <div className="empty-icon"><IconBadge name="reports" tone="violet" size={22} /></div>
                <div className="empty-text">No RFQ providers available for analysis</div>
                <div className="empty-sub">Send the RFQ first so the service providers can flow into this comparison table.</div>
              </div>
            ) : (
              <>
                <div className="form-section" style={{ marginBottom: 18 }}>
                  <div className="form-section-title">Provider Comparison Table</div>
                  <div className="table-wrap procurement-mobile-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Service Provider Name</th>
                          <th>Quoted Price</th>
                          <th>Delivery Time</th>
                          <th>Compliance</th>
                          <th>Notes</th>
                          <th>Best Provider</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bidAnalysisForm.providers.map(provider => {
                          const isBestProvider = (bidAnalysisForm.selectedProviderId || "") === provider.id || provider.isBestProvider;
                          return (
                            <tr key={provider.id} style={isBestProvider ? { background: "#f0fdf4" } : undefined}>
                              <td data-label="Service Provider Name" style={{ minWidth: 220 }}>
                                <div style={{ fontWeight: 700, color: "var(--g900)" }}>{provider.serviceProviderName || "-"}</div>
                                {(provider.email || provider.contactPerson) && (
                                  <div className="text-xs text-gray" style={{ marginTop: 4 }}>
                                    {[provider.email, provider.contactPerson].filter(Boolean).join(" || ")}
                                  </div>
                                )}
                              </td>
                              <td data-label="Quoted Price" style={{ minWidth: 160 }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={provider.quotedPrice}
                                  onChange={(event) => setBidAnalysisProviderField(provider.id, "quotedPrice", event.target.value)}
                                  placeholder="Enter amount"
                                />
                              </td>
                              <td data-label="Delivery Time" style={{ minWidth: 170 }}>
                                <input
                                  value={provider.deliveryTime}
                                  onChange={(event) => setBidAnalysisProviderField(provider.id, "deliveryTime", event.target.value)}
                                  placeholder="e.g. 5 working days"
                                />
                              </td>
                              <td data-label="Compliance" style={{ minWidth: 140 }}>
                                <select
                                  value={provider.compliance}
                                  onChange={(event) => setBidAnalysisProviderField(provider.id, "compliance", event.target.value)}
                                >
                                  <option value="Yes">Yes</option>
                                  <option value="No">No</option>
                                </select>
                              </td>
                              <td data-label="Notes" style={{ minWidth: 220 }}>
                                <textarea
                                  rows={2}
                                  value={provider.notes}
                                  onChange={(event) => setBidAnalysisProviderField(provider.id, "notes", event.target.value)}
                                  placeholder="Add evaluation notes"
                                />
                              </td>
                              <td data-label="Best Provider" style={{ minWidth: 150 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                                  <input
                                    type="radio"
                                    name="bestProvider"
                                    checked={isBestProvider}
                                    onChange={() => setBidAnalysisProviderField(provider.id, "isBestProvider", true)}
                                  />
                                  {isBestProvider ? "Selected" : "Select"}
                                </label>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {errors.bidAnalysisProviders && <div className="field-error" style={{ marginTop: 10 }}>{errors.bidAnalysisProviders}</div>}
                  {errors.bidAnalysisSelectedProvider && <div className="field-error" style={{ marginTop: 6 }}>{errors.bidAnalysisSelectedProvider}</div>}
                </div>

                <div className="form-section" style={{ marginBottom: 18 }}>
                  <div className="form-section-title">Comparison Notes</div>
                  <textarea
                    id="bidAnalysisComparisonNotes"
                    rows={4}
                    value={bidAnalysisForm.comparisonNotes}
                    onChange={(event) => setBidAnalysisForm(current => ({ ...current, comparisonNotes: event.target.value }))}
                    placeholder="Summarize why the selected provider offers the best value, compliance, and delivery terms."
                  />
                </div>

                <div className="grid-2" style={{ marginBottom: 18 }}>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">RFQ Reference</div>
                    <div className="text-xs text-gray mb-1">Request ID</div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord.id}</div>
                    <div className="text-xs text-gray mb-1">RFQ Reference Number</div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord?.rfq?.referenceNumber || rfqForm.referenceNumber || "-"}</div>
                    <div className="text-xs text-gray mb-1">Service Providers</div>
                    <div style={{ fontWeight: 600 }}>{bidAnalysisForm.providers.length}</div>
                  </div>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Saved Decision</div>
                    {!selectedRecord?.bidAnalysis ? (
                      <div className="text-xs text-gray">No provider has been selected yet.</div>
                    ) : (
                      <>
                        <div className="text-xs text-gray mb-1">Best Provider</div>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord.bidAnalysis.selectedProviderName || "-"}</div>
                        <div className="text-xs text-gray mb-1">Approved Amount</div>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>UGX {formatAmount(selectedRecord.bidAnalysis.amount)}</div>
                        <div className="text-xs text-gray mb-1">Saved</div>
                        <div style={{ fontWeight: 600 }}>{formatDateTime(selectedRecord.bidAnalysis.savedAt)}</div>
                      </>
                    )}
                  </div>
                </div>

                {!!selectedRecord?.quotations?.length && (
                  <div className="form-section" style={{ marginBottom: 18 }}>
                    <div className="form-section-title">Uploaded Quotation References</div>
                    <div className="table-wrap procurement-mobile-table">
                      <table>
                        <thead>
                          <tr>
                            <th>File</th>
                            <th>Type</th>
                            <th>Size</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRecord.quotations.map(quotation => (
                            <tr key={quotation.id}>
                              <td data-label="File">{quotation.name}</td>
                              <td data-label="Type">{quotation.type || "-"}</td>
                              <td data-label="Size">{formatFileSize(quotation.size)}</td>
                              <td data-label="Action">
                                {quotation.dataUrl ? (
                                  <a href={quotation.dataUrl} download={quotation.name} className="btn btn-ghost btn-sm">Download</a>
                                ) : (
                                  <span className="text-xs text-gray">Unavailable</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-amber" onClick={handleProceedBidAnalysis}><ActionButtonIcon name="process" tone="amber" />Proceed</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {canManagePurchaseDocument && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">PO / LPO Generation</div>
              <div className="page-sub">
                {targetDocumentType === "LPO"
                  ? "The LPO template is generated immediately after bid analysis and stays here until the procurement officer submits it for Executive Director approval."
                  : "Generate a PO for low-value requests ready for Executive Director review."}
              </div>
            </div>
            <span className="sbadge" style={{ background: targetDocumentType === "LPO" ? "#ede9fe" : "#dbeafe", color: targetDocumentType === "LPO" ? "#6d28d9" : "#1e40af" }}>
              {targetDocumentType}
            </span>
          </div>
          <div className="card-body">
            <div className="grid-2" style={{ marginBottom: 18 }}>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Decision Logic</div>
                <div className="text-xs text-gray mb-1">Applicable Amount</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>UGX {formatAmount(decisionAmount)}</div>
                <div className="text-xs text-gray mb-1">Generated Document</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{targetDocumentType}</div>
                <div className="text-xs text-gray" style={{ lineHeight: 1.7 }}>
                  Amounts below UGX 500,000 generate a PO. Amounts at or above UGX 500,000 generate an LPO draft after bid analysis, and committee minutes can be attached to the supporting record.
                </div>
              </div>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Generation Status</div>
                <div className="text-xs text-gray mb-1">Bid Analysis</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord?.bidAnalysis ? "Available" : "Not saved"}</div>
                <div className="text-xs text-gray mb-1">Committee Minutes</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord?.committeeMinutes ? selectedRecord.committeeMinutes.name : "Not uploaded"}</div>
                <div className="text-xs text-gray mb-1">Generated</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{formatDateTime(selectedRecord?.purchaseDocument?.generatedAt)}</div>
                <div className="text-xs text-gray mb-1">Executive Director</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{executiveDirector?.name || "Unassigned"}</div>
                <div className="text-xs text-gray mb-1">Executive Approval Status</div>
                <div><EdStatusPill status={selectedRecord?.purchaseDocument?.edStatus} /></div>
              </div>
            </div>

            {requiresCommitteeMinutes && (
              <div className="form-section" style={{ marginBottom: 18 }}>
                <div className="form-section-title">Committee Minutes Upload</div>
                <div className="file-drop">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleCommitteeMinutesUpload}
                    disabled={isUploadingCommitteeMinutes}
                  />
                  <div style={{ fontSize: 26, marginBottom: 6 }}><IconBadge name="download" tone="blue" size={18} /></div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--g700)" }}>
                    {isUploadingCommitteeMinutes ? "Uploading committee minutes..." : "Upload committee minutes"}
                  </div>
                  <div className="text-xs text-gray" style={{ marginTop: 3 }}>
                    Attach committee minutes to the LPO record for supporting documentation.
                  </div>
                </div>
                {errors.committeeMinutes && <div className="field-error" style={{ marginTop: 8 }}>{errors.committeeMinutes}</div>}
                {committeeMinutesForm && (
                  <div className="file-info" style={{ marginTop: 12 }}>
                    <div className="file-icon"><IconBadge name="doc" tone="blue" size={16} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--g800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{committeeMinutesForm.name}</div>
                      <div className="text-xs text-gray">{formatFileSize(committeeMinutesForm.size)} · {committeeMinutesForm.type || "file"}</div>
                    </div>
                    {committeeMinutesForm.dataUrl ? (
                      <a href={committeeMinutesForm.dataUrl} download={committeeMinutesForm.name} className="btn btn-ghost btn-sm">Download</a>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {errors.purchaseDocument && (
              <div className="alert alert-red">{errors.purchaseDocument}</div>
            )}

            {targetDocumentType === "LPO" && lpoForm ? (
              <>
                <div className="grid-2" style={{ marginBottom: 18 }}>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Auto-filled Data</div>
                    <SummaryField label="LPO Number" value={lpoForm.lpoNumber} />
                    <SummaryField label="Selected Service Provider" value={lpoForm.selectedServiceProvider || "-"} />
                    <SummaryField label="Item Description" value={lpoForm.itemDescription || "-"} />
                    <SummaryField label="Quantity" value={lpoForm.quantity || "-"} />
                    <SummaryField label="Agreed Price" value={`UGX ${formatAmount(lpoForm.agreedPrice)}`} />
                    <SummaryField label="Total Cost" value={`UGX ${formatAmount(lpoForm.totalCost)}`} />
                    <SummaryField label="Delivery Terms" value={lpoForm.deliveryTerms || "-"} />
                  </div>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Procurement Officer Fields</div>
                    <div className="form-group">
                      <label htmlFor="lpoProcurementOfficerName">Procurement Officer Name *</label>
                      <input
                        id="lpoProcurementOfficerName"
                        value={lpoForm.procurementOfficerName}
                        onChange={(event) => setLpoField("procurementOfficerName", event.target.value)}
                        placeholder="Enter procurement officer name"
                        disabled={!canEditLpoTemplate}
                      />
                      {errors.lpoProcurementOfficerName && <div className="field-error">{errors.lpoProcurementOfficerName}</div>}
                    </div>
                    <div className="form-group">
                      <label htmlFor="lpoDate">Date *</label>
                      <input
                        id="lpoDate"
                        type="date"
                        value={lpoForm.date}
                        onChange={(event) => setLpoField("date", event.target.value)}
                        disabled={!canEditLpoTemplate}
                      />
                      {errors.lpoDate && <div className="field-error">{errors.lpoDate}</div>}
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label htmlFor="lpoProcurementOfficerSignature">Digital Signature *</label>
                      <div id="lpoProcurementOfficerSignature" style={!canEditLpoTemplate ? { opacity: 0.75, pointerEvents: "none" } : undefined}>
                        <SignaturePad value={lpoForm.procurementOfficerSignature} onChange={(value) => setLpoField("procurementOfficerSignature", value)} />
                      </div>
                      <div className="field-hint">This signature is attached to the LPO sent to the Executive Director dashboard.</div>
                      {errors.lpoProcurementOfficerSignature && <div className="field-error">{errors.lpoProcurementOfficerSignature}</div>}
                    </div>
                  </div>
                </div>

                <div className="grid-2" style={{ marginBottom: 18 }}>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Approval Routing</div>
                    <SummaryField label="Executive Director Dashboard" value={executiveDirector?.name || "Unassigned"} />
                    <SummaryField label="Current Status" value={selectedRecord?.purchaseDocument?.edStatus || PURCHASE_DOCUMENT_DRAFT} />
                    <SummaryField label="Submitted For Approval" value={formatDateTime(selectedRecord?.purchaseDocument?.submittedAt)} />
                  </div>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Submission Logic</div>
                    <div className="text-xs text-gray" style={{ lineHeight: 1.8 }}>
                      Clicking <strong>Submit for Approval</strong> sends this LPO to the Executive Director dashboard and changes the status to <strong>{EXECUTIVE_APPROVAL_PENDING}</strong>.
                    </div>
                  </div>
                </div>

                <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary" onClick={handleDownloadPurchaseDocument}><ActionButtonIcon name="download" tone="navy" />Download LPO</button>
                  {canEditLpoTemplate && <button type="button" className="btn btn-amber btn-lg" onClick={handleSubmitLpoForApproval}><ActionButtonIcon name="submit" tone="amber" />Submit for Approval</button>}
                </div>
              </>
            ) : (
              <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-amber" onClick={handleGeneratePurchaseDocument}><ActionButtonIcon name="process" tone="amber" />Generate {targetDocumentType}</button>
                <button type="button" className="btn btn-primary" onClick={handleDownloadPurchaseDocument}><ActionButtonIcon name="download" tone="navy" />Download {targetDocumentType}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedRecord?.purchaseDocument && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Executive Director Approval</div>
              <div className="page-sub">ED approval is tracked on the generated PO or LPO within the procurement module only.</div>
            </div>
            <EdStatusPill status={selectedRecord.purchaseDocument.edStatus} />
          </div>
          <div className="card-body">
            <div className="grid-2" style={{ marginBottom: canEdApprovePurchaseDocument ? 18 : 0 }}>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Approval Summary</div>
                <div className="text-xs text-gray mb-1">Document</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord.purchaseDocument.type}</div>
                <div className="text-xs text-gray mb-1">Status</div>
                <div style={{ marginBottom: 8 }}><EdStatusPill status={selectedRecord.purchaseDocument.edStatus} /></div>
                <div className="text-xs text-gray mb-1">Generated</div>
                <div style={{ fontWeight: 600 }}>{formatDateTime(selectedRecord.purchaseDocument.generatedAt)}</div>
              </div>
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Decision Trail</div>
                <div className="text-xs text-gray mb-1">Executive Director</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{executiveDirector?.name || "Unassigned"}</div>
                <div className="text-xs text-gray mb-1">Decision By</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord.purchaseDocument.edDecisionByName || "-"}</div>
                <div className="text-xs text-gray mb-1">Decision At</div>
                <div style={{ fontWeight: 600 }}>{formatDateTime(selectedRecord.purchaseDocument.edDecisionAt)}</div>
              </div>
            </div>

            {canEdApprovePurchaseDocument && (
              <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-red" onClick={() => handleExecutiveDirectorDecision("reject")}><ActionButtonIcon name="reject" tone="red" />Reject</button>
                <button type="button" className="btn btn-green" onClick={() => handleExecutiveDirectorDecision("approve")}><ActionButtonIcon name="approve" tone="green" />Approve</button>
              </div>
            )}
          </div>
        </div>
      )}

      {(canManageGoodsReceived || selectedRecord?.goodsReceived) && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Goods Received Process</div>
              <div className="page-sub">Capture receipt confirmation after Executive Director approval and complete the procurement flow.</div>
            </div>
            <GoodsReceivedStatusPill status={selectedRecord?.goodsReceived?.status} />
          </div>
          <div className="card-body">
            {!canManageGoodsReceived && !selectedRecord?.goodsReceived ? (
              <div className="empty-state" style={{ padding: "24px 18px" }}>
                <div className="empty-icon"><IconBadge name="ast" tone="amber" size={22} /></div>
                <div className="empty-text">Awaiting approved PO or LPO</div>
                <div className="empty-sub">Goods received can be captured after the Executive Director approves the procurement document.</div>
              </div>
            ) : (
              <>
                <div className="form-section" style={{ marginBottom: 18 }}>
                  <div className="form-section-title">Receipt Form</div>
                  <div className="form-grid">
                    <div className="form-group full">
                      <label htmlFor="goodsReceivedGrn">Goods Received Note (GRN) *</label>
                      <textarea
                        id="goodsReceivedGrn"
                        rows={4}
                        value={goodsReceivedForm.grn}
                        onChange={(event) => setGoodsReceivedField("grn", event.target.value)}
                        placeholder="Enter the goods received note details"
                        disabled={!canManageGoodsReceived}
                      />
                      {errors.goodsReceivedGrn && <div className="field-error">{errors.goodsReceivedGrn}</div>}
                    </div>

                    <div className="form-group full">
                      <label>Delivery Note *</label>
                      {goodsReceivedForm.deliveryNote ? (
                        <div className="file-info">
                          <div className="file-icon"><IconBadge name="doc" tone="blue" size={16} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--g800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{goodsReceivedForm.deliveryNote.name}</div>
                            <div className="text-xs text-gray">{formatFileSize(goodsReceivedForm.deliveryNote.size)} · {goodsReceivedForm.deliveryNote.type || "file"}</div>
                          </div>
                          {goodsReceivedForm.deliveryNote.dataUrl ? (
                            <a href={goodsReceivedForm.deliveryNote.dataUrl} download={goodsReceivedForm.deliveryNote.name} className="btn btn-ghost btn-sm">Download</a>
                          ) : null}
                        </div>
                      ) : (
                        <div className="file-drop">
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            onChange={handleDeliveryNoteUpload}
                            disabled={!canManageGoodsReceived || isUploadingDeliveryNote}
                          />
                          <div style={{ fontSize: 26, marginBottom: 6 }}><IconBadge name="download" tone="blue" size={18} /></div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--g700)" }}>
                            {isUploadingDeliveryNote ? "Uploading delivery note..." : "Upload delivery note"}
                          </div>
                          <div className="text-xs text-gray" style={{ marginTop: 3 }}>
                            Upload the supplier delivery note in PDF or image format.
                          </div>
                        </div>
                      )}
                      {errors.deliveryNote && <div className="field-error" style={{ marginTop: 8 }}>{errors.deliveryNote}</div>}
                    </div>

                    <div className="form-group full">
                      <label htmlFor="goodsReceivedSignature">Signature *</label>
                      <input
                        id="goodsReceivedSignature"
                        value={goodsReceivedForm.signature}
                        onChange={(event) => setGoodsReceivedField("signature", event.target.value)}
                        placeholder="Enter receiving officer signature or full name"
                        disabled={!canManageGoodsReceived}
                      />
                      {errors.goodsReceivedSignature && <div className="field-error">{errors.goodsReceivedSignature}</div>}
                    </div>
                  </div>
                </div>

                <div className="grid-2" style={{ marginBottom: canManageGoodsReceived ? 18 : 0 }}>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Completion Summary</div>
                    <div className="text-xs text-gray mb-1">Status</div>
                    <div style={{ marginBottom: 8 }}><GoodsReceivedStatusPill status={selectedRecord?.goodsReceived?.status} /></div>
                    <div className="text-xs text-gray mb-1">Completed At</div>
                    <div style={{ fontWeight: 600 }}>{formatDateTime(selectedRecord?.goodsReceived?.completedAt)}</div>
                  </div>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Linked Document</div>
                    <div className="text-xs text-gray mb-1">Purchase Document</div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedRecord?.purchaseDocument?.type || "-"}</div>
                    <div className="text-xs text-gray mb-1">Executive Approval Status</div>
                    <div><EdStatusPill status={selectedRecord?.purchaseDocument?.edStatus} /></div>
                  </div>
                </div>

                {canManageGoodsReceived && (
                  <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-green" onClick={handleMarkProcurementComplete}><ActionButtonIcon name="approve" tone="green" />Mark Procurement Complete</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {shouldShowSummaryCard && selectedRecord && (
        <div ref={summaryCardRef} className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Procurement Request Summary</div>
              <div className="page-sub">
                Submitted requests open in summary view first. Use "See details" whenever you want the full request information.
              </div>
            </div>
            <div className="procurement-chip-grid">
              <StatusPill status={selectedRecord.status} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearSelection}><ActionButtonIcon name="back" tone="blue" />Back</button>
              {canCreateProcurementRequest && <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm}><ActionButtonIcon name="add" tone="amber" />New Requisition</button>}
            </div>
          </div>
          <div className="card-body">
            <div
              style={{
                marginBottom: 18,
                padding: "16px 18px",
                borderRadius: 20,
                background: "linear-gradient(135deg, #f8fbff 0%, #eef6ff 100%)",
                border: "1px solid #dbeafe",
              }}
            >
              <div className="grid-2">
                <SummaryField label="Reference" value={selectedRecord.id} />
                <SummaryField label="Requester" value={selectedRecord.requesterName} />
                <SummaryField label="Items" value={truncateText(getRequestItemsSummaryText(selectedRecord), 140)} />
                <SummaryField label="Budget" value={`UGX ${formatAmount(summarizeRequestItems(selectedRecord.items).totalBudget || selectedRecord.estimatedBudget)}`} />
                <SummaryField label="Expected Delivery" value={formatDate(selectedRecord.expectedDeliveryDate)} />
                <SummaryField label="Delivery Location" value={selectedRecord.deliveryLocation || "-"} />
                <SummaryField label="Requester Signature">
                  <SignatureValue signature={selectedRecord.requesterSignature} />
                </SummaryField>
                <SummaryField label="Current Stage" value={selectedRecord.status} />
              </div>
            </div>

            {selectedRecord.rejectionReason && (
              <div className="alert alert-red">{selectedRecord.rejectionReason}</div>
            )}

            {errors.stageDownload && <div className="alert alert-red">{errors.stageDownload}</div>}

            {showSelectedDetails && (
              <>
                <div className="grid-2" style={{ marginBottom: 18, alignItems: "start" }}>
                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Full Request Details</div>
                    <div className="grid-2">
                      <SummaryField label="Activity Code" value={selectedRecord.activityCode || "-"} />
                      <SummaryField label="Quantity" value={String(selectedRecord.quantity || "-")} />
                      <SummaryField label="Expected Delivery" value={formatDate(selectedRecord.expectedDeliveryDate)} />
                      <SummaryField label="Delivery Location" value={selectedRecord.deliveryLocation || "-"} />
                      <SummaryField label="Submitted At" value={formatDateTime(selectedRecord.submittedAt)} />
                      <SummaryField label="Updated At" value={formatDateTime(selectedRecord.updatedAt || selectedRecord.createdAt)} />
                      <div style={{ gridColumn: "1 / -1" }}>
                        <SummaryField label="Notes" value={selectedRecord.notes || "-"} />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <SummaryField label="Items" value={getRequestItemsSummaryText(selectedRecord)} />
                      </div>
                    </div>
                  </div>

                  <div className="form-section" style={{ marginBottom: 0 }}>
                    <div className="form-section-title">Workflow Snapshot</div>
                    <div className="grid-2">
                      <SummaryField label="Requester Role" value={getRoleLabel(selectedRecord.requesterRole)} />
                      <SummaryField label="Assigned Supervisor" value={selectedRecord.supervisorName || "-"} />
                      <SummaryField label="Grants Accountant" value={selectedRecord.accountantName || "-"} />
                      <SummaryField
                        label="Supervisor Decision"
                        value={
                          selectedRecord.supervisorDecisionAt
                            ? `${selectedRecord.supervisorDecisionByName || "Supervisor"} on ${formatDateTime(selectedRecord.supervisorDecisionAt)}`
                            : "-"
                        }
                      />
                      <SummaryField
                        label="Accountant Decision"
                        value={
                          selectedRecord.accountantDecisionAt
                            ? `${selectedRecord.accountantDecisionByName || "Grants Accountant"} on ${formatDateTime(selectedRecord.accountantDecisionAt)}`
                            : "-"
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="grid-2" style={{ alignItems: "start" }}>
                  <AttachmentPreviewCard
                    title="Sample Photo"
                    attachment={selectedRecord.samplePhoto}
                    emptyText="No sample photo was attached to this request."
                  />
                  <ApprovalHistoryPanel record={selectedRecord} />
                </div>
              </>
            )}

            <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap", marginTop: 18 }}>
              {selectedRecord.status !== "Draft" && (
                <button type="button" className="btn btn-primary" onClick={handleDownloadStageForm}><ActionButtonIcon name="download" tone="navy" />Download Current Form PDF</button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setShowSelectedDetails(current => !current)}>
                {showSelectedDetails ? "Hide details" : "See details"}
              </button>
              {canTakeApprovalAction && <button type="button" className="btn btn-red" onClick={() => handleApprovalAction("reject")}><ActionButtonIcon name="reject" tone="red" />Reject</button>}
              {canTakeApprovalAction && <button type="button" className="btn btn-green btn-lg" onClick={() => handleApprovalAction("approve")}><ActionButtonIcon name="approve" tone="green" />Approve</button>}
            </div>
          </div>
        </div>
      )}

      {canCreateProcurementRequest ? (
        showRequestForm && (!selectedRecord || canEditSelected) ? (
        <div ref={requestFormRef} className="card new-request-card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Procurement Request Form</div>
            <div className="page-sub">
              Drafts stay fully editable. Submitted requests switch to summary view automatically so the workflow stays clean.
            </div>
          </div>
          <div className="procurement-chip-grid">
            {selectedRecord && <StatusPill status={selectedRecord.status} />}
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm}><ActionButtonIcon name="add" tone="amber" />New Requisition</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRequestForm(false)}><ActionButtonIcon name="back" tone="blue" />Hide Form</button>
          </div>
        </div>
        <div className="card-body">
          {errors.form && <div className="alert alert-red">{errors.form}</div>}

          <div
            style={{
              marginBottom: 18,
              padding: "18px 20px",
              borderRadius: 22,
              background: "linear-gradient(135deg, #fffdf4 0%, #f8fbff 100%)",
              border: "1px solid #e5eef8",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#9a6700", marginBottom: 8 }}>
              Structured Request Intake
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f2744", marginBottom: 6 }}>
              Raise a procurement request with approval-ready details
            </div>
            <div className="text-xs text-gray" style={{ lineHeight: 1.8 }}>
              Add the request details, delivery point, sample photo, and your signature so approvers can work from a concise summary instead of reopening the whole form.
            </div>
          </div>

          <div className="form-section" style={{ marginBottom: 18 }}>
            <div className="form-section-title">Request Items</div>
            <div style={{ display: "grid", gap: 14 }}>
              {normalizeRequestItems(form.items).map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #dbe4f0",
                    borderRadius: 18,
                    padding: 16,
                    background: "#f8fbff",
                  }}
                >
                  <div className="procurement-chip-grid" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>
                      Item {index + 1}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeRequestItem(item.id)}
                      disabled={!canEditSelected || normalizeRequestItems(form.items).length === 1}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid">
                    <div className="form-group full">
                      <label htmlFor={`itemDescription-${item.id}`}>Item Description *</label>
                      <textarea
                        id={`itemDescription-${item.id}`}
                        rows={3}
                        value={item.itemDescription}
                        onChange={(event) => setItemField(item.id, "itemDescription", event.target.value)}
                        placeholder="Describe the item or service being requested"
                        disabled={!canEditSelected}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`quantity-${item.id}`}>Quantity *</label>
                      <input
                        id={`quantity-${item.id}`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) => setItemField(item.id, "quantity", event.target.value)}
                        placeholder="Enter quantity"
                        disabled={!canEditSelected}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`estimatedBudget-${item.id}`}>Estimated Amount *</label>
                      <input
                        id={`estimatedBudget-${item.id}`}
                        type="number"
                        min="0"
                        value={item.estimatedBudget}
                        onChange={(event) => setItemField(item.id, "estimatedBudget", event.target.value)}
                        placeholder="Enter amount"
                        disabled={!canEditSelected}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {errors.items && <div className="field-error" style={{ marginTop: 10 }}>{errors.items}</div>}
            <div className="procurement-chip-grid" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addRequestItem} disabled={!canEditSelected}>
                <ActionButtonIcon name="add" tone="blue" />Add Another Item
              </button>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f2744" }}>
                Total Request Amount: UGX {formatAmount(summarizeRequestItems(form.items).totalBudget)}
              </div>
            </div>
          </div>

          <div className="form-section" style={{ marginBottom: 18 }}>
            <div className="form-section-title">Request Details</div>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="activityCode">Activity Code *</label>
                <select
                  id="activityCode"
                  value={activeActivityCode}
                  onChange={(event) => setField("activityCode", event.target.value)}
                  disabled={!canEditSelected || !activityOptions.length}
                >
                  {!activityOptions.length && <option value="">No activity codes available</option>}
                  {activityOptions.map(option => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.activityCode && <div className="field-error">{errors.activityCode}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="expectedDeliveryDate">Expected Delivery Date *</label>
                <input
                  id="expectedDeliveryDate"
                  type="date"
                  value={form.expectedDeliveryDate}
                  onChange={(event) => setField("expectedDeliveryDate", event.target.value)}
                  disabled={!canEditSelected}
                />
                {errors.expectedDeliveryDate && <div className="field-error">{errors.expectedDeliveryDate}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="deliveryLocation">Delivery Location *</label>
                <input
                  id="deliveryLocation"
                  value={form.deliveryLocation}
                  onChange={(event) => setField("deliveryLocation", event.target.value)}
                  placeholder="Enter delivery office, branch, or site"
                  disabled={!canEditSelected}
                />
                {errors.deliveryLocation && <div className="field-error">{errors.deliveryLocation}</div>}
              </div>

              <div className="form-group full">
                <label htmlFor="notes">Notes</label>
                <textarea
                  id="notes"
                  rows={4}
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  placeholder="Add any extra procurement context"
                  disabled={!canEditSelected}
                />
              </div>
            </div>
          </div>

          <div className="form-section" style={{ marginBottom: 0 }}>
            <div className="form-section-title">Delivery & Authorization</div>
            <div className="grid-2" style={{ alignItems: "start" }}>
              <div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="requesterSignature">Requester Signature *</label>
                  <div id="requesterSignature" style={!canEditSelected ? { opacity: 0.75, pointerEvents: "none" } : undefined}>
                    <SignaturePad value={form.requesterSignature} onChange={(value) => setField("requesterSignature", value)} />
                  </div>
                  <div className="field-hint">This signature is attached to the request summary sent for approval.</div>
                  {errors.requesterSignature && <div className="field-error">{errors.requesterSignature}</div>}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray mb-1">Sample Photo</div>
                {form.samplePhoto ? (
                  <>
                    {isImageAttachment(form.samplePhoto) && (
                      <div style={{ marginBottom: 12 }}>
                        <img
                          src={form.samplePhoto.dataUrl}
                          alt="Sample item"
                          style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 16, border: "1px solid #dbe4f0" }}
                        />
                      </div>
                    )}
                    <div className="file-info">
                      <div className="file-icon">Photo</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--g800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.samplePhoto.name}</div>
                        <div className="text-xs text-gray">{formatFileSize(form.samplePhoto.size)} · {form.samplePhoto.type || "image"}</div>
                      </div>
                      {form.samplePhoto.dataUrl && (
                        <a href={form.samplePhoto.dataUrl} download={form.samplePhoto.name} className="btn btn-ghost btn-sm">Download</a>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setField("samplePhoto", null)} disabled={!canEditSelected}>Remove</button>
                    </div>
                  </>
                ) : (
                  <div className="file-drop">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSamplePhotoUpload}
                      disabled={!canEditSelected || isUploadingSamplePhoto}
                    />
                    <div style={{ fontSize: 26, marginBottom: 6 }}>Photo</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--g700)" }}>
                      {isUploadingSamplePhoto ? "Uploading sample photo..." : "Attach sample photo"}
                    </div>
                    <div className="text-xs text-gray" style={{ marginTop: 3 }}>
                      Add one image that helps the approver identify the requested item quickly.
                    </div>
                  </div>
                )}
                {errors.samplePhoto && <div className="field-error" style={{ marginTop: 8 }}>{errors.samplePhoto}</div>}
              </div>
            </div>
          </div>

          <div className="form-section" style={{ marginBottom: 0, marginTop: 18 }}>
            <div className="form-section-title">Workflow Snapshot</div>
            <div className="grid-2">
              <div>
                <div className="text-xs text-gray mb-1">Requester</div>
                <div style={{ fontWeight: 600 }}>{selectedRecord?.requesterName || user.name}</div>
              </div>
              <div>
                <div className="text-xs text-gray mb-1">Requester Role</div>
                <div style={{ fontWeight: 600 }}>{getRoleLabel(selectedRecord?.requesterRole || user.role)}</div>
              </div>
              <div>
                <div className="text-xs text-gray mb-1">Assigned Supervisor</div>
                <div style={{ fontWeight: 600 }}>{selectedRecord?.supervisorName || getAssignedSupervisor(user, users)?.name || "Unassigned"}</div>
              </div>
              <div>
                <div className="text-xs text-gray mb-1">Assigned Grants Accountant</div>
                <div style={{ fontWeight: 600 }}>{selectedRecord?.accountantName || getPrimaryAccountant(users)?.name || "Unassigned"}</div>
              </div>
              <div>
                <div className="text-xs text-gray mb-1">Estimated Budget</div>
                <div style={{ fontWeight: 600 }}>UGX {formatAmount(form.estimatedBudget)}</div>
              </div>
              <div>
                <div className="text-xs text-gray mb-1">Expected Delivery</div>
                <div style={{ fontWeight: 600 }}>{formatDate(form.expectedDeliveryDate)}</div>
              </div>
              <div>
                <div className="text-xs text-gray mb-1">Supervisor Decision</div>
                <div style={{ fontWeight: 600 }}>
                  {selectedRecord?.supervisorDecisionAt
                    ? `${selectedRecord.supervisorDecisionByName || "Supervisor"} on ${formatDateTime(selectedRecord.supervisorDecisionAt)}`
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray mb-1">Accountant Decision</div>
                <div style={{ fontWeight: 600 }}>
                  {selectedRecord?.accountantDecisionAt
                    ? `${selectedRecord.accountantDecisionByName || "Grants Accountant"} on ${formatDateTime(selectedRecord.accountantDecisionAt)}`
                    : "-"}
                </div>
              </div>
            </div>
          </div>

          {selectedRecord?.rejectionReason && (
            <div className="alert alert-red" style={{ marginTop: 18, marginBottom: 0 }}>
              {selectedRecord.rejectionReason}
            </div>
          )}

          <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap", marginTop: 18 }}>
            {canEditSelected && <button type="button" className="btn btn-ghost" onClick={() => persist("Draft")}><ActionButtonIcon name="save" tone="blue" />Save Draft</button>}
            {canEditSelected && (
              <button type="button" className="btn btn-amber btn-lg" onClick={() => persist("Submitted")}>
                <ActionButtonIcon name="submit" tone="amber" />Submit Requisition
              </button>
            )}
          </div>
        </div>
        </div>
        ) : null
      ) : (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Procurement Request Access</div>
              <div className="page-sub">The Executive Director can review and approve procurement documents but cannot raise procurement requisitions.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="alert alert-blue" style={{ marginBottom: 0 }}>
              Procurement requisitions remain available to all other logged-in users.
            </div>
          </div>
        </div>
      )}

      {(canCreateProcurementRequest || user.role === "supervisor" || user.role === "accountant") && (
        <div style={{ display: "grid", gap: 18 }}>
        {canCreateProcurementRequest && user.role !== "procurement_officer" ? (
          <RequesterProcurementWorkspace
            ownRecords={filteredRequesterRecords}
            requesterQueueRecords={requesterApprovalQueueRecords}
            selectedId={selectedId}
            onSelectRecord={selectRecord}
            onCreateRequest={resetForm}
            searchInput={requesterSearchInput}
            onSearchInputChange={setRequesterSearchInput}
            onSearch={handleRequesterSearch}
            onClearSearch={clearRequesterSearch}
            searchTerm={requesterSearchTerm}
            showAllRecords={showAllRequesterRecords}
            onToggleShowAll={() => setShowAllRequesterRecords(current => !current)}
          />
        ) : (
          <div className="grid-2" style={{ alignItems: "start" }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">My Procurement Records</div>
                  <div className="page-sub">Short, one-line procurement updates for your drafts, submissions, and outcomes.</div>
                </div>
              </div>
              <div className="card-body">
                <CompactRecordList
                  records={ownRecords}
                  selectedId={selectedId}
                  onSelectRecord={selectRecord}
                  emptyIcon="requests"
                  emptyText="No procurement requisitions yet"
                  emptySub="Your saved drafts and submitted records will appear here."
                />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Assigned Approval Queue</div>
                  <div className="page-sub">
                    {user.role === "supervisor" || user.role === "accountant"
                      ? "Approvers receive a short summary first and can open full details only when needed."
                      : "This queue becomes available for supervisors and grants accountants."}
                  </div>
                </div>
              </div>
              <div className="card-body">
                <CompactRecordList
                  records={user.role === "supervisor" || user.role === "accountant" ? assignedQueue : []}
                  selectedId={selectedId}
                  onSelectRecord={selectRecord}
                  emptyIcon="workflow"
                  emptyText={user.role === "supervisor" || user.role === "accountant" ? "No assigned requisitions" : "No approval queue for this role"}
                  emptySub={user.role === "supervisor" || user.role === "accountant"
                    ? "Only records currently assigned to your approval step are listed here."
                    : "Supervisors and grants accountants review procurement requisitions here."}
                  showRequester
                />
              </div>
            </div>
          </div>
        )}
        {["supervisor", "accountant"].includes(user.role) && (
          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-header">
              <div>
                <div className="card-title">Approved by Me</div>
                <div className="page-sub">Keeps a running record of procurement requests you have already approved.</div>
              </div>
            </div>
            <div className="card-body">
              <CompactRecordList
                records={approvedByUserRecords}
                selectedId={selectedId}
                onSelectRecord={selectRecord}
                emptyIcon="approve"
                emptyText="No approved requests yet"
                emptySub="Requests you approve will stay listed here for quick reference."
                showRequester
                approvalUserId={user.id}
              />
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}

