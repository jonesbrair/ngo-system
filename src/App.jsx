import { useState, useEffect, useCallback, useRef } from "react";
import ProcurementRequisitionPage from "./ProcurementRequisitionPage";
import { AppIcon, IconBadge } from "./uiIcons";
import MessagesModule from "./hr/messaging/MessagesModule";
import { supabase } from "./lib/supabaseClient";
import { notifyRequestSubmitted, notifyApprovalAction, notifyLeaveSubmitted, notifyLeaveStatusUpdate, notifyFinanceStageUpdate, notifyNextApproverFinance, notifyPaymentReceived } from "./lib/emailService";
const inspireLogo = "https://inspireyouthdev.org/wp-content/uploads/2024/10/cropped-Asset-260.png";

// â"€â"€ Identity â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
async function fetchUsersFromDB() {
  const { data, error } = await supabase.from("users").select("*");
  if (error) { console.warn("Supabase users error:", error.message); return; }
  if (!data?.length) { console.log("Supabase users: table is empty"); return; }
  data.forEach(row => {
    const exists = _users.find(u => u.email === row.email);
    if (exists) {
      // Always sync identity and relationship fields from DB so local IDs
      // match DB-assigned UUIDs and supervisor assignments stay consistent.
      exists.id           = row.id;
      exists.supervisorId = row.supervisor_id ?? exists.supervisorId;
      exists.isActive     = row.is_active ?? true;
      exists.authUserId   = row.auth_user_id || null;
    } else {
      _users.push({
        id:           row.id,
        name:         row.name,
        email:        row.email,
        role:         row.role,
        moduleRole:   row.module_role,
        jobTitle:     row.job_title,
        dept:         row.department,
        avatar:       row.avatar_initials,
        supervisorId: row.supervisor_id,
        eSignature:   row.e_signature,
        isActive:     row.is_active ?? true,
        authUserId:   row.auth_user_id || null,
      });
    }
  });
  console.log("Supabase users synced:", data.length);
}

async function fetchProjectsFromDB() {
  const { data, error } = await supabase
    .from("projects")
    .select("*, project_activities(*)");
  if (error) { console.warn("Supabase projects error:", error.message); return; }
  if (!data?.length) return;
  _projects = data.map(row => ({
    id:          row.id,
    name:        row.name,
    donorName:   row.donor || "",
    totalBudget: Number(row.total_budget) || 0,
    createdAt:   row.created_at,
    activities:  (row.project_activities || []).map(a => ({
      id:           a.id,
      name:         a.name,
      code:         a.budget_line || "",
      budgetAmount: Number(a.allocated_amount) || 0,
    })),
  }));
  console.log("Supabase projects loaded:", _projects.length);
}

// Maps the DB stage column back to the user-role key used by renderChainStep
const STAGE_TO_ROLE = {
  pending_supervisor:          "supervisor",
  pending_accountant:          "accountant",
  pending_finance:             "finance_manager",
  pending_executive_director:  "executive_director",
  approved:                    "payment_accountant",
};
async function fetchRequestsFromDB() {
  const { data, error } = await supabase
    .from("requests")
    .select("*, request_approvals(*)");
  if (error) { console.warn("Supabase requests error:", error.message); return; }
  if (!data?.length) return;
  const userMap    = new Map(_users.map(u => [u.id, u]));
  const projectMap = new Map(_projects.map(p => [p.id, p]));
  data.forEach(row => {
    const exists = _requests.find(r => r.id === row.id || r.id === row.request_number);
    if (exists) {
      exists.status              = row.status              || exists.status;
      exists.supervisorId        = (row.supporting_docs?.supervisorId) ?? exists.supervisorId;
      exists.supervisorName      = (row.supporting_docs?.supervisorName) || exists.supervisorName;
      exists.lastRejectionReason = (row.supporting_docs?.lastRejectionReason) ?? exists.lastRejectionReason;
      if (Array.isArray(row.request_approvals) && row.request_approvals.length >= exists.approvals.length) {
        const userMap2 = new Map(_users.map(u => [u.id, u]));
        exists.approvals = row.request_approvals.map(a => ({
          userId:    a.approver_id,
          role:      STAGE_TO_ROLE[a.stage] || a.stage,
          decision:  a.action,
          note:      a.comment || "",
          at:        a.acted_at,
          stage:     a.stage,
          name:      userMap2.get(a.approver_id)?.name || "",
          signature: a.signature_data ?? null,
        }));
      }
      return;
    }
    const requester = userMap.get(row.requester_id);
    const project   = projectMap.get(row.project_id);
    const activity  = project?.activities?.find(a => a.id === row.activity_id);
    const extra     = row.supporting_docs || {};
    _requests.push({
      id:                  row.request_number || row.id,
      title:               row.title || "",
      description:         row.description || "",
      department:          row.department || "",
      amount:              Number(row.amount_requested) || 0,
      status:              row.status,
      createdAt:           row.submission_date || row.created_at,
      projectId:           row.project_id || "",
      projectName:         project?.name || "",
      donorName:           project?.donorName || "",
      activityId:          row.activity_id || "",
      activityName:        activity?.name || "",
      activityCode:        activity?.code || "",
      activityBudget:      activity?.budgetAmount || 0,
      requesterId:         row.requester_id || "",
      requesterName:       requester?.name || "",
      requesterRole:       requester?.role || "",
      isVendorPayment:     row.request_type === "vendor_payment",
      supervisorId:        extra.supervisorId || null,
      supervisorName:      extra.supervisorName || "Unassigned",
      lastRejectionReason: extra.lastRejectionReason || null,
      approvals:           (row.request_approvals || []).map(a => ({
        userId:    a.approver_id,
        role:      STAGE_TO_ROLE[a.stage] || a.stage,
        decision:  a.action,
        note:      a.comment || "",
        at:        a.acted_at,
        stage:     a.stage,
        name:      userMap.get(a.approver_id)?.name || "",
        signature: a.signature_data ?? null,
      })),
      ...extra,
    });
  });
  console.log("Supabase requests loaded:", data.length);
}

async function fetchLeaveApplicationsFromDB() {
  const { data, error } = await supabase.from("leave_applications").select("*");
  if (error) { console.warn("Supabase leave error:", error.message); return; }
  if (!data?.length) return;
  data.forEach(row => {
    const exists = _leaveApplications.find(a => a.id === row.id);
    if (exists) {
      // Always sync mutable fields so status changes made on another device propagate here.
      exists.status      = row.status      || exists.status;
      exists.approvals   = Array.isArray(row.approvals) ? row.approvals : exists.approvals;
      exists.approvedAt  = row.approved_at  ?? exists.approvedAt;
      exists.rejectedAt  = row.rejected_at  ?? exists.rejectedAt;
      exists.supervisorId = row.supervisor_id ?? exists.supervisorId;
    } else {
      _leaveApplications.push({
        id:               row.id,
        employeeId:       row.employee_id || "",
        employeeEmpId:    row.employee_emp_id || "",
        employeeName:     row.employee_name || "",
        employeeEmail:    row.employee_email || "",
        userId:           row.user_id || "",
        leaveTypeId:      row.leave_type_id || "annual",
        startDate:        row.start_date || "",
        endDate:          row.end_date || "",
        numDays:          row.num_days || 0,
        reason:           row.reason || "",
        delegateTo:       row.delegate_to || "",
        handoverReport:   row.handover_report || "",
        status:           row.status || "pending_supervisor",
        supervisorId:     row.supervisor_id || null,
        approvals:        Array.isArray(row.approvals) ? row.approvals : [],
        appliedAt:        row.applied_at || row.created_at || "",
        approvedAt:       row.approved_at || null,
        rejectedAt:       row.rejected_at || null,
      });
    }
  });
  console.log("Supabase leave applications synced:", data.length);
}

async function fetchEmployeesFromDB() {
  const { data, error } = await supabase.from("employees").select("*");
  if (error) { console.warn("Supabase employees error:", error.message); return; }
  if (!data?.length) return;
  data.forEach(row => {
    const exists = _employees.find(e => e.email?.toLowerCase() === row.email?.toLowerCase() || e.id === row.id);
    if (!exists) {
      _employees.push({
        id:             row.id,
        employeeId:     row.employee_id || "",
        name:           `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        gender:         row.gender || "",
        dob:            row.date_of_birth || "",
        email:          row.email || "",
        phone:          row.phone || "",
        department:     row.department || "",
        position:       row.position || "",
        employmentType: row.employment_type || "Full-time",
        status:         row.status || "Active",
        dateJoined:     row.hire_date || "",
        createdAt:      row.created_at || "",
      });
    }
  });
  console.log("Supabase employees merged:", data.length);
}

async function fetchNotificationsFromDB() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) { console.warn("Supabase notifications error:", error.message); return; }
  if (!data?.length) return;
  data.forEach(row => {
    const exists = _notifications.find(n => n.id === row.id);
    if (exists) {
      if (row.is_read) exists.read = true;
    } else {
      _notifications.push({
        id:        row.id,
        userId:    row.user_id,
        message:   row.message,
        requestId: row.request_id || null,
        read:      row.is_read   || false,
        at:        row.created_at,
        page:      row.page      || null,
      });
    }
  });
}
async function fetchMessagesFromDB() {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*")
    .order("timestamp", { ascending: true })
    .limit(2000);
  if (error) { console.warn("Supabase messages error:", error.message); return; }
  if (!data?.length) return;
  data.forEach(row => {
    const exists = _messages.find(m => m.id === row.id);
    if (exists) {
      if (row.status === "read") exists.status = "read";
    } else {
      _messages.push({
        id:         row.id,
        senderId:   row.sender_id,
        receiverId: row.receiver_id,
        message:    row.message,
        timestamp:  row.timestamp,
        status:     row.status || "delivered",
      });
    }
  });
}
async function fetchAnnouncementsFromDB() {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(500);
  if (error) { console.warn("Supabase announcements error:", error.message); return; }
  if (!data?.length) return;
  data.forEach(row => {
    const exists = _announcements.find(a => a.id === row.id);
    if (exists) {
      const dbReadBy = Array.isArray(row.read_by) ? row.read_by : [];
      dbReadBy.forEach(uid => { if (!exists.readBy.includes(uid)) exists.readBy.push(uid); });
    } else {
      _announcements.push({
        id:           row.id,
        senderId:     row.sender_id,
        audienceType: row.audience_type || "all",
        department:   row.department   || "",
        message:      row.message,
        timestamp:    row.timestamp,
        status:       row.status       || "delivered",
        readBy:       Array.isArray(row.read_by) ? row.read_by : [],
      });
    }
  });
}

const APP_NAME = "INSPIRE YOUTH";
const APP_SUB  = "Inspire Management System (IMS)";
const ORG_NAME = "Inspire Youth For Development";
const STORAGE_KEY = "inspire-youth-erp-state";
const ACCOUNTABILITY_DRAFT_KEY_PREFIX = "ims-accountability-draft-";
const ACCOUNTABILITY_RECEIPT_ACCEPT = ".pdf,.jpg,.jpeg,.png";
const ACCOUNTABILITY_PHOTO_ACCEPT = ".jpg,.jpeg,.png";
const ACCOUNTABILITY_RECEIPT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const ACCOUNTABILITY_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const ACCOUNTABILITY_REFUND_PROOF_ACCEPT = ACCOUNTABILITY_RECEIPT_ACCEPT;
const ACCOUNTABILITY_REFUND_PROOF_EXTENSIONS = [...ACCOUNTABILITY_RECEIPT_EXTENSIONS];

// â"€â"€ Seed Data â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
let _users = [];

const DEFAULT_PROJECTS = [];
let _projects = [...DEFAULT_PROJECTS];

const ROLE_LABELS = {
  requester:"Program Officer", supervisor:"Program Manager", accountant:"Accountant",
  finance_manager:"Senior Accountant", payment_accountant:"Payment Officer", procurement_officer:"Procurement Officer", executive_director:"Executive Director", admin:"Administrator",
  hr_manager:"HR Manager",
};

// ── Module-level RBAC ─────────────────────────────────────────────────────────
// Module roles control which system areas a user can navigate to.
// Workflow roles (above) continue to drive the approval chain logic unchanged.
const MODULE_ROLES = ["admin","hr","finance","procurement","staff"];
const MODULE_ROLE_LABELS = {
  admin:"Administrator", hr:"HR Manager", finance:"Finance", procurement:"Procurement", staff:"Staff",
};
const MODULE_ROLE_COLORS = {
  admin:"#7c3aed", hr:"#0891b2", finance:"#059669", procurement:"#d97706", staff:"#64748b",
};

function inferModuleRole(systemRole) {
  if (systemRole === "admin") return "admin";
  if (systemRole === "hr_manager") return "hr";
  if (["accountant","finance_manager","payment_accountant","supervisor","executive_director"].includes(systemRole)) return "finance";
  if (systemRole === "procurement_officer") return "procurement";
  return "staff";
}

// Positions that always force a specific module role regardless of what is saved.
const POSITION_MODULE_ROLES = {
  "HR Manager": "hr",
};
function getModuleRole(user) {
  return user?.moduleRole || inferModuleRole(user?.role || "requester");
}
function canAccessModule(user, mod) {
  if (!user) return false;
  const mr = getModuleRole(user);
  if (mod === "admin") return mr === "admin";
  if (mod === "hr") return mr === "hr" || mr === "admin";
  return true;
}
// All users can always access their personal workspace (requests / notifications)
const PERSONAL_PAGES = new Set(["my_requests","my_drafts","new_request","notifications","home","my_signature"]);
const HR_WORKSPACE_PAGES = new Set(["human_resource","hr_staff_files","hr_employees","hr_org_structure","hr_departments","hr_positions","hr_users","hr_leave","hr_leave_manage","my_leave","leave_apply","my_signature"]);

function getWorkspaceChromeName(user, page) {
  if (!user) return "";
  const isHrModulePage = page === "human_resource" || String(page || "").startsWith("hr_");
  if (isHrModulePage && getModuleRole(user) === "hr") return "HR Dashboard";
  return user.name;
}

function getAnnouncementDisplayMessage(item, user) {
  const rawMessage = String(item?.message || "");
  if (rawMessage === "Hello, Dashboard welcome") {
    const firstName = String(user?.name || "").trim().split(/\s+/)[0] || "there";
    return `Hello, ${firstName} welcome`;
  }
  return rawMessage;
}

const DEFAULT_POSITIONS = [
  "Volunteer",
  "Project Assistant",
  "Project Officer",
  "Program Officer",
  "Communications Officer",
  "Program Manager",
  "Accountant",
  "Payment Officer",
  "Senior Accountant",
  "Administration Officer",
  "Procurement Officer",
  "Executive Director",
  "System Administrator",
  "HR Manager",
];
let _positions = [...DEFAULT_POSITIONS];
let _deletedPositions = [];

const DEFAULT_POSITION_ROLES = {
  "Volunteer":              "requester",
  "Project Assistant":      "requester",
  "Project Officer":        "requester",
  "Program Officer":        "requester",
  "Communications Officer": "requester",
  "Program Manager":        "supervisor",
  "Accountant":             "accountant",
  "Payment Officer":        "payment_accountant",
  "Senior Accountant":      "finance_manager",
  "Administration Officer": "requester",
  "Procurement Officer":    "procurement_officer",
  "Executive Director":     "executive_director",
  "System Administrator":   "admin",
  "HR Manager":             "hr_manager",
};
let _positionRoles = { ...DEFAULT_POSITION_ROLES };

// ── Leave Management ─────────────────────────────────────────────────────────
const LEAVE_TYPES = [
  { id:"annual",        name:"Annual Leave",                  days:21,   paid:true  },
  { id:"sick",          name:"Sick Leave",                    days:10,   paid:true  },
  { id:"maternity",     name:"Maternity Leave",               days:60,   paid:true  },
  { id:"paternity",     name:"Paternity Leave",               days:10,   paid:true  },
  { id:"compassionate", name:"Compassionate / Bereavement",   days:5,    paid:true  },
  { id:"study",         name:"Study Leave",                   days:14,   paid:true  },
  { id:"unpaid",        name:"Unpaid Leave",                  days:null, paid:false },
];

let _leaveApplications = [];
let _leaveBalances     = {};   // { [employeeInternalId]: { [leaveTypeId]: usedDays } }
let _nextLeaveId       = 1;

// ── Staff Documents ───────────────────────────────────────────────────────────
// Documents stored as base64 dataURLs (localStorage, max ~5 MB each).
const DOC_TYPES = ["Contract","CV / Resume","Academic Document","Certificate","Leave Form","Identity Document","Policy Acknowledgement","Disciplinary Record","Other"];
let _empDocuments = []; // { id, employeeId, docType, displayName, fileName, mimeType, sizeBytes, data, uploadedAt, uploadedBy }
let _messages = []; // { id, senderId, receiverId, message, timestamp, status }
let _announcements = []; // { id, senderId, audienceType, department, message, timestamp, status, readBy }

function initLeaveBalance(empId) {
  if (!_leaveBalances[empId]) {
    _leaveBalances[empId] = {};
    LEAVE_TYPES.forEach(lt => { if (lt.days !== null) _leaveBalances[empId][lt.id] = 0; });
  }
}
function getLeaveBalance(empId, ltId) {
  const lt = LEAVE_TYPES.find(l => l.id === ltId);
  if (!lt || lt.days === null) return null;
  initLeaveBalance(empId);
  return lt.days - (_leaveBalances[empId]?.[ltId] || 0);
}
function deductLeaveBalance(empId, ltId, days) {
  initLeaveBalance(empId);
  _leaveBalances[empId][ltId] = (_leaveBalances[empId][ltId] || 0) + days;
}
function toIsoDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function getUgandaPublicHolidaySet(year) {
  const easterSunday = getEasterSunday(year);
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(easterSunday.getDate() - 2);
  const easterMonday = new Date(easterSunday);
  easterMonday.setDate(easterSunday.getDate() + 1);
  const fixedDates = [
    `${year}-01-01`,
    `${year}-01-26`,
    `${year}-03-08`,
    `${year}-05-01`,
    `${year}-06-03`,
    `${year}-06-09`,
    `${year}-10-09`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];
  return new Set([
    ...fixedDates,
    toIsoDateValue(goodFriday),
    toIsoDateValue(easterMonday),
  ]);
}
function calcLeaveDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  const startDate = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const endDate = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  const holidayCache = new Map();
  let workingDays = 0;
  for (let current = new Date(startDate); current <= endDate; current.setDate(current.getDate() + 1)) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    const year = current.getFullYear();
    if (!holidayCache.has(year)) holidayCache.set(year, getUgandaPublicHolidaySet(year));
    if (holidayCache.get(year).has(toIsoDateValue(current))) continue;
    workingDays += 1;
  }
  return workingDays;
}
function getNextWorkingDate(dateValue) {
  if (!dateValue) return "";
  const source = new Date(dateValue);
  if (Number.isNaN(source.getTime())) return "";
  const current = new Date(source.getFullYear(), source.getMonth(), source.getDate());
  const holidayCache = new Map();
  while (true) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    const year = current.getFullYear();
    if (!holidayCache.has(year)) holidayCache.set(year, getUgandaPublicHolidaySet(year));
    if (holidayCache.get(year).has(toIsoDateValue(current))) continue;
    return toIsoDateValue(current);
  }
}
const LEAVE_STATUS_META = {
  pending_supervisor: { label:"Pending Supervisor", bg:"#fef3c7", color:"#92400e" },
  pending_hr:         { label:"Pending HR Review", bg:"#dbeafe", color:"#1e40af" },
  pending_executive_director: { label:"Pending Executive Director", bg:"#e0e7ff", color:"#3730a3" },
  approved:           { label:"Approved",             bg:"#d1fae5", color:"#065f46" },
  rejected:           { label:"Rejected",             bg:"#fee2e2", color:"#991b1b" },
};
function leaveStatusMeta(s) { return LEAVE_STATUS_META[s] || { label:s, bg:"#f1f5f9", color:"#475569" }; }
function getPendingLeaveApprovalsForUser(user) {
  if (!user) return [];
  const moduleRole = getModuleRole(user);
  const isHR = moduleRole === "hr" || moduleRole === "admin";
  return _leaveApplications.filter(app => {
    if (app.status === "pending_supervisor")
      return app.supervisorId === user.id ||
             (app.supervisorId == null && user.role === "supervisor");
    if (app.status === "pending_hr") return isHR;
    if (app.status === "pending_executive_director") return user.role === "executive_director" || moduleRole === "admin";
    return false;
  });
}
function getLeaveStageItems(application) {
  const approvals = Array.isArray(application?.approvals) ? application.approvals : [];
  const hasApproved = (role) => approvals.some(item => item.role === role && item.decision === "approved");
  const hasRejected = approvals.some(item => item.decision === "rejected");
  const resolvedStatus = application?.status;
  const stages = [
    { id:"supervisor", label:"Supervisor", done:hasApproved("supervisor"), current:resolvedStatus === "pending_supervisor" },
    { id:"hr", label:"HR", done:hasApproved("hr"), current:resolvedStatus === "pending_hr" },
    { id:"executive_director", label:"Executive Director", done:hasApproved("executive_director"), current:resolvedStatus === "pending_executive_director" },
  ];
  if (resolvedStatus === "approved") stages[stages.length - 1].done = true;
  if (hasRejected) {
    return stages.map(stage => ({ ...stage, current:false }));
  }
  return stages;
}
function getLeaveStageSummary(application) {
  if (!application) return "";
  if (application.status === "approved") return "Fully approved";
  if (application.status === "rejected") return "Rejected";
  if (application.status === "pending_supervisor") return "Awaiting supervisor review";
  if (application.status === "pending_hr") return "Awaiting HR review";
  if (application.status === "pending_executive_director") return "Awaiting Executive Director approval";
  return leaveStatusMeta(application.status).label;
}

function buildLeaveApprovalDocumentData(application) {
  const leaveType = LEAVE_TYPES.find(item => item.id === application.leaveTypeId)?.name || application.leaveTypeId || "Leave";
  const fmtD = d => { try { return new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"}); } catch { return d || "—"; } };
  const fmtDT = d => { try { return new Date(d).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); } catch { return d || "—"; } };
  const STAGE_LABEL = { supervisor:"Supervisor", hr:"HR Manager", executive_director:"Executive Director" };
  const approvalRows = (application.approvals || []).map(item => {
    const isApproved = item.decision === "approved";
    return `<tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0a1e3d;">${STAGE_LABEL[item.role] || item.role || "—"}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${item.name || "—"}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;">${fmtDT(item.at)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">
        <span style="background:${isApproved?"#d1fae5":"#fee2e2"};color:${isApproved?"#065f46":"#991b1b"};padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;">
          ${isApproved ? "✓ Approved" : "✗ Rejected"}
        </span>
        ${item.note ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">${item.note}</div>` : ""}
      </td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${application.id} — Approved Leave Form</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:0}
  .page{max-width:720px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)}
  .hdr{background:#0a1e3d;padding:28px 36px;display:flex;align-items:center;gap:20px}
  .hdr-logo{width:52px;height:52px;border-radius:10px;background:#fff;padding:6px;object-fit:contain;flex-shrink:0}
  .hdr-text .org{color:#fff;font-size:17px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
  .hdr-text .sub{color:rgba(255,255,255,.6);font-size:11px;letter-spacing:.07em;text-transform:uppercase;margin-top:2px}
  .title-bar{background:#f59e0b;padding:10px 36px;display:flex;align-items:center;justify-content:space-between}
  .title-bar .ttl{color:#fff;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .title-bar .ref{color:rgba(255,255,255,.85);font-size:12px;font-weight:600}
  .stamp{display:inline-block;border:3px solid #059669;border-radius:8px;padding:5px 16px;color:#059669;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;transform:rotate(-2deg)}
  .body{padding:28px 36px}
  .section{margin-bottom:24px}
  .section-lbl{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
  .info-cell{padding:10px 14px;border-bottom:1px solid #e2e8f0}
  .info-cell:nth-child(odd){background:#f8fafc}
  .info-lbl{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
  .info-val{font-size:14px;color:#0f172a;font-weight:600}
  .approval-table{width:100%;border-collapse:collapse}
  .approval-table th{padding:10px 14px;text-align:left;background:#f1f5f9;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #e2e8f0}
  .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 36px;display:flex;align-items:center;justify-content:space-between}
  .footer-note{font-size:11px;color:#94a3b8;line-height:1.6}
  .print-btn{display:none}
  @media print{.print-btn{display:none!important}}
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <img class="hdr-logo" src="https://inspireyouthdev.org/wp-content/uploads/2024/10/cropped-Asset-260.png" alt="IYD Logo" />
    <div class="hdr-text">
      <div class="org">Inspire Youth For Development</div>
      <div class="sub">Inspire Management System — Leave Approval Form</div>
    </div>
  </div>
  <div class="title-bar">
    <span class="ttl">Approved Leave Form</span>
    <span class="ref">${application.id}</span>
  </div>
  <div class="body">
    <div class="section" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
      <div>
        <div style="font-size:22px;font-weight:800;color:#0a1e3d;">${application.employeeName}</div>
        <div style="font-size:13px;color:#64748b;margin-top:2px;">${application.employeeEmpId || ""}</div>
      </div>
      <div class="stamp">Fully Approved</div>
    </div>
    <div class="section">
      <div class="section-lbl">Leave Details</div>
      <div class="info-grid">
        <div class="info-cell"><div class="info-lbl">Leave Type</div><div class="info-val">${leaveType}</div></div>
        <div class="info-cell"><div class="info-lbl">Working Days</div><div class="info-val">${application.numDays} day${application.numDays !== 1 ? "s" : ""}</div></div>
        <div class="info-cell"><div class="info-lbl">Start Date</div><div class="info-val">${fmtD(application.startDate)}</div></div>
        <div class="info-cell"><div class="info-lbl">End Date</div><div class="info-val">${fmtD(application.endDate)}</div></div>
        <div class="info-cell"><div class="info-lbl">Delegated To</div><div class="info-val">${application.delegateTo || "—"}</div></div>
        <div class="info-cell"><div class="info-lbl">Date Applied</div><div class="info-val">${fmtD(application.appliedAt)}</div></div>
        <div class="info-cell" style="grid-column:1/-1"><div class="info-lbl">Reason / Justification</div><div class="info-val">${application.reason || "—"}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-lbl">Approval Chain</div>
      <table class="approval-table">
        <thead><tr><th>Stage</th><th>Officer</th><th>Date &amp; Time</th><th>Decision</th></tr></thead>
        <tbody>${approvalRows}</tbody>
      </table>
    </div>
    <div style="margin-top:24px;padding:14px 18px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:13px;color:#166534;">
      This leave application has been approved through all three stages of the approval workflow on <strong>${fmtDT(application.approvedAt)}</strong>.
      This document serves as official confirmation of approved leave and has been filed in the employee's staff record.
    </div>
  </div>
  <div class="footer">
    <div class="footer-note">
      Generated by Inspire Management System · Inspire Youth For Development<br/>
      Document Reference: ${application.id} · ${fmtDT(new Date().toISOString())}
    </div>
    <div class="stamp" style="transform:rotate(1deg);font-size:11px;">IYD Official</div>
  </div>
</div>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function fileApprovedLeaveIntoStaffRecord(application, approverName) {
  if (!application?.employeeId || application?.filedDocumentId) return application?.filedDocumentId || null;
  const fileName = `${application.id}-leave-approval.html`;
  const doc = {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employeeId: application.employeeId,
    docType: "Leave Form",
    displayName: `${application.id} Approved Leave Form`,
    fileName,
    mimeType: "text/html",
    sizeBytes: 0,
    data: buildLeaveApprovalDocumentData(application),
    uploadedAt: new Date().toISOString(),
    uploadedBy: approverName || "Executive Director",
  };
  doc.sizeBytes = doc.data.length;
  _empDocuments.push(doc);
  application.filedDocumentId = doc.id;
  return doc.id;
}

// ── HR: Employee Registry ─────────────────────────────────────────────────────
let _employees   = [];
let _nextEmpId   = 20;

function genEmployeeId() {
  // Scan past any IDs already in use (handles counter drift from cancelled forms or imports)
  const used = new Set(_employees.map(e => e.employeeId).filter(Boolean));
  while (used.has(`IYD-${String(_nextEmpId).padStart(3, "0")}`)) {
    _nextEmpId++;
  }
  return `IYD-${String(_nextEmpId++).padStart(3, "0")}`;
}

// ── HR: Org Structure ─────────────────────────────────────────────────────────
const DEPT_COLOR_PALETTE = ["#0891b2","#0f2744","#059669","#7c3aed","#d97706","#dc2626","#2563eb","#be185d","#4338ca","#0f766e"];
const POSITION_GRADES    = ["Entry Level","Junior","Mid Level","Senior","Lead","Manager","Director","Executive"];

const DEFAULT_HR_DEPARTMENTS = [
  { id:"hd1", name:"Programs",       code:"PROG", description:"Program delivery and field operations",     color:"#0891b2" },
  { id:"hd2", name:"Operations",     code:"OPS",  description:"Day-to-day operational management",         color:"#0f2744" },
  { id:"hd3", name:"Finance",        code:"FIN",  description:"Financial management and accountability",   color:"#059669" },
  { id:"hd4", name:"Administration", code:"ADM",  description:"Administration and office management",      color:"#7c3aed" },
  { id:"hd5", name:"Communications", code:"COM",  description:"External communications and media",         color:"#d97706" },
  { id:"hd6", name:"M&E",            code:"ME",   description:"Monitoring, evaluation and learning",       color:"#dc2626" },
  { id:"hd7", name:"HR",             code:"HR",   description:"Human resources and people management",     color:"#2563eb" },
];
let _hrDepartments = DEFAULT_HR_DEPARTMENTS.map(d => ({ ...d, headId:"", createdAt: new Date().toISOString() }));
let _hrPositions   = [];
const SPECIAL_DASHBOARDS = {
  human_resource: {
    label: "HR Manager Dashboard",
    page: "human_resource",
    accessRole: "hr",
  },
  procurement: {
    label: "Procurement Officer Dashboard",
    page: "procurement",
    accessRole: "procurement_officer",
  },
  executive_procurement: {
    label: "Executive Director Approval Dashboard",
    page: "executive_procurement",
    accessRole: "executive_director",
  },
  financial_reports: {
    label: "Senior Accountant Dashboard",
    page: "financial_reports",
    accessRole: "finance_manager",
  },
  payment_queue: {
    label: "Payment Officer Dashboard",
    page: "payment_queue",
    accessRole: "payment_accountant",
  },
};
const DEFAULT_POSITION_DASHBOARDS = {
  "HR Manager": "human_resource",
  "Senior Accountant": "financial_reports",
  "Payment Officer": "payment_queue",
  "Procurement Officer": "procurement",
  "Executive Director": "executive_procurement",
};
let _positionDashboards = { ...DEFAULT_POSITION_DASHBOARDS };
let _dashboardDelegations = [];
const LEGACY_POSITION_RENAMES = {
  requester: "Program Officer",
  "programs officer": "Program Officer",
  supervisor: "Program Manager",
  "finance manager": "Senior Accountant",
  "payment accountant": "Payment Officer",
  "payments accountant": "Payment Officer",
  "accounts assistant": "Payment Officer",
  "grants accountant": "Accountant",
};

// ── Stage labels follow the new deterministic workflow ────────────────────────
const STATUS_CFG = {
  // Pre-approval chain
  draft:              { label:"Draft",                      color:"#6b7280", bg:"#f3f4f6", dot:"#9ca3af" },
  pending_supervisor: { label:"Pending Program Manager",    color:"#92400e", bg:"#fef3c7", dot:"#f59e0b" },
  rejected_supervisor:{ label:"Rejected – Program Manager", color:"#991b1b", bg:"#fee2e2", dot:"#ef4444" },
  pending_accountant: { label:"Pending Accountant",         color:"#92400e", bg:"#fef3c7", dot:"#f59e0b" },
  rejected_accountant:{ label:"Rejected – Accountant",      color:"#991b1b", bg:"#fee2e2", dot:"#ef4444" },
  pending_finance:    { label:"Pending Senior Accountant",  color:"#92400e", bg:"#fef3c7", dot:"#f59e0b" },
  rejected_finance:   { label:"Rejected – Senior Accountant", color:"#991b1b", bg:"#fee2e2", dot:"#ef4444" },
  pending_executive_director: { label:"Pending Executive Director", color:"#1e40af", bg:"#dbeafe", dot:"#3b82f6" },
  rejected_executive_director:{ label:"Rejected – Executive Director", color:"#991b1b", bg:"#fee2e2", dot:"#ef4444" },

  // Stage 1 complete – ED approved, awaiting payment
  approved:                { label:"APPROVED",                   color:"#065f46", bg:"#d1fae5", dot:"#10b981" },
  // Legacy alias so any existing stored requests with old status still render
  pending_payment_accountant: { label:"APPROVED",               color:"#065f46", bg:"#d1fae5", dot:"#10b981" },

  // Stage 2 – Payment recorded
  paid:                    { label:"PAID",                       color:"#1e3a8a", bg:"#dbeafe", dot:"#3b82f6" },

  // Stage 3 – Accountability triggered, requester must act
  pending_accountability:  { label:"PENDING ACCOUNTABILITY",     color:"#92400e", bg:"#fef3c7", dot:"#f59e0b" },

  // Stage 4 – Requester submitted, supervisor reviewing
  accountability_submitted: { label:"ACCOUNTABILITY SUBMITTED",  color:"#1e40af", bg:"#dbeafe", dot:"#3b82f6" },

  // Stage 5 – Supervisor approved, senior accountant reviewing
  supervisor_approved:     { label:"SUPERVISOR APPROVED",        color:"#065f46", bg:"#d1fae5", dot:"#10b981" },

  // Stage 6 – Senior accountant approved, payment officer final review
  senior_accountant_approved: { label:"SENIOR ACCOUNTANT APPROVED", color:"#7c3aed", bg:"#ede9fe", dot:"#7c3aed" },

  // Stage 7 – Closed
  completed:               { label:"COMPLETED",                  color:"#1e40af", bg:"#dbeafe", dot:"#3b82f6" },
};

// Kept for backward-compatibility with any stored legacy accountability sub-objects
const ACCOUNTABILITY_STATUS_CFG = {
  draft:                       { label:"Draft Accountability",       color:"#6b7280", bg:"#f3f4f6", dot:"#9ca3af" },
  pending_supervisor:          { label:"Pending Program Manager",    color:"#92400e", bg:"#fef3c7", dot:"#f59e0b" },
  rejected_supervisor:         { label:"Rejected by Program Manager",color:"#991b1b", bg:"#fee2e2", dot:"#ef4444" },
  pending_accountant:          { label:"Pending Accountant",         color:"#92400e", bg:"#fef3c7", dot:"#f59e0b" },
  rejected_accountant:         { label:"Rejected by Accountant",     color:"#991b1b", bg:"#fee2e2", dot:"#ef4444" },
  pending_finance:             { label:"Pending Senior Accountant",  color:"#92400e", bg:"#fef3c7", dot:"#f59e0b" },
  rejected_finance:            { label:"Rejected by Senior Accountant", color:"#991b1b", bg:"#fee2e2", dot:"#ef4444" },
  rejected_payment_accountant: { label:"Rejected at Final Review",   color:"#991b1b", bg:"#fee2e2", dot:"#ef4444" },
  pending_payment_accountant:  { label:"Pending Payment Officer", color:"#92400e", bg:"#fef3c7", dot:"#f59e0b" },
  cleared:                     { label:"Accountability Settled",     color:"#1e40af", bg:"#dbeafe", dot:"#3b82f6" },
};

// Legacy – not used by new workflow; kept so old stored data renders without crashing
const ACCOUNTABILITY_PENDING_STATES = new Set([
  "draft","pending_supervisor","pending_accountant","pending_finance",
  "pending_payment_accountant","rejected_supervisor","rejected_accountant",
  "rejected_finance","rejected_payment_accountant",
]);

const DEPARTMENTS = ["Programs","Operations","Finance","Administration","Communications","M&E","HR"];

// â"€â"€ In-memory State â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
let _requests     = [];
let _logs         = [];
let _notifications= [];
let _nextId       = 1;

function normalizePositionName(value="") {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return LEGACY_POSITION_RENAMES[normalized.toLowerCase()] || normalized;
}

function getPositionOptions(users=_users, positions=_positions, deletedPositions=_deletedPositions) {
  const deleted = new Set(deletedPositions.map(p => p.toLowerCase()));
  const options = new Set(DEFAULT_POSITIONS);
  Object.values(ROLE_LABELS).forEach(label => options.add(label));
  positions.forEach(position => {
    const normalized = normalizePositionName(position);
    if (normalized) options.add(normalized);
  });
  users.forEach(user => {
    const normalized = normalizePositionName(user.jobTitle);
    if (normalized) options.add(normalized);
  });
  return [...options].filter(p => !deleted.has(p.toLowerCase())).sort((a, b) => a.localeCompare(b));
}

function getPositionAccessRole(position) {
  const normalized = normalizePositionName(position);
  return _positionRoles[normalized] || "requester";
}

function getPositionDashboard(position) {
  const normalized = normalizePositionName(position);
  const dashboardKey = _positionDashboards[normalized] || "";
  return SPECIAL_DASHBOARDS[dashboardKey] ? dashboardKey : "";
}

function getUserPosition(user) {
  return normalizePositionName(user?.jobTitle) || ROLE_LABELS[user?.role] || "Team Member";
}

function isDelegationActive(record, now = new Date()) {
  if (!record || record.isRevoked) return false;
  if (!record.startsOn && !record.endsOn) return true;
  const currentDay = now.toISOString().slice(0, 10);
  const startsOn = record.startsOn || currentDay;
  const endsOn = record.endsOn || currentDay;
  return startsOn <= currentDay && currentDay <= endsOn;
}

function getActiveDashboardDelegationsForUser(userId, delegations=_dashboardDelegations) {
  return delegations.filter(item => item.delegateUserId === userId && isDelegationActive(item));
}

function getAccessibleDashboardKeys(user, delegations=_dashboardDelegations) {
  const owned = getPositionDashboard(getUserPosition(user));
  const keys = new Set();
  if (owned) keys.add(owned);
  getActiveDashboardDelegationsForUser(user?.id, delegations).forEach(item => {
    if (SPECIAL_DASHBOARDS[item.dashboard]) keys.add(item.dashboard);
  });
  return keys;
}

function hasDashboardAccess(user, dashboardKey, delegations=_dashboardDelegations) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return getAccessibleDashboardKeys(user, delegations).has(dashboardKey);
}

function getEffectiveRoleForPage(user, page, delegations=_dashboardDelegations) {
  if (!user) return null;
  const ownedDashboard = getPositionDashboard(getUserPosition(user));
  if (ownedDashboard && SPECIAL_DASHBOARDS[ownedDashboard]?.page === page) {
    return SPECIAL_DASHBOARDS[ownedDashboard].accessRole;
  }
  const delegated = getActiveDashboardDelegationsForUser(user.id, delegations).find(item => SPECIAL_DASHBOARDS[item.dashboard]?.page === page);
  if (delegated && SPECIAL_DASHBOARDS[delegated.dashboard]) {
    return SPECIAL_DASHBOARDS[delegated.dashboard].accessRole;
  }
  return user.role;
}

function saveState() {
  if (typeof window === "undefined") return;
  normalizeState();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    users: _users,
    positions: _positions,
    deletedPositions: _deletedPositions,
    positionRoles: _positionRoles,
    positionDashboards: _positionDashboards,
    dashboardDelegations: _dashboardDelegations,
    employees: _employees,
    nextEmpId: _nextEmpId,
    hrDepartments: _hrDepartments,
    hrPositions: _hrPositions,
    projects: _projects,
    requests: _requests,
    logs: _logs,
    notifications: _notifications,
    messages: _messages,
    announcements: _announcements,
    nextId: _nextId,
    leaveApplications: _leaveApplications,
    leaveBalances: _leaveBalances,
    nextLeaveId: _nextLeaveId,
    empDocuments: _empDocuments,
  }));
}

function loadState() {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    _users = Array.isArray(parsed.users) ? parsed.users : [];
    _positions = Array.isArray(parsed.positions) ? parsed.positions : [...DEFAULT_POSITIONS];
    _deletedPositions = Array.isArray(parsed.deletedPositions) ? parsed.deletedPositions : [];
    _positionRoles = (parsed.positionRoles && typeof parsed.positionRoles === "object") ? { ...DEFAULT_POSITION_ROLES, ...parsed.positionRoles } : { ...DEFAULT_POSITION_ROLES };
    if (_positionRoles["HR Manager"] === "requester") _positionRoles["HR Manager"] = "hr_manager";
    _positionDashboards = (parsed.positionDashboards && typeof parsed.positionDashboards === "object") ? { ...DEFAULT_POSITION_DASHBOARDS, ...parsed.positionDashboards } : { ...DEFAULT_POSITION_DASHBOARDS };
    _dashboardDelegations = Array.isArray(parsed.dashboardDelegations) ? parsed.dashboardDelegations : [];
    _employees      = Array.isArray(parsed.employees)      ? parsed.employees      : [];
    _nextEmpId      = Number.isFinite(parsed.nextEmpId)   ? parsed.nextEmpId      : 20;
    // Backfill employeeId for any employee records that predate this field
    _employees.forEach(e => {
      if (!e.employeeId) { e.employeeId = `IYD-${String(_nextEmpId++).padStart(3, "0")}`; }
    });
    _hrDepartments  = Array.isArray(parsed.hrDepartments) && parsed.hrDepartments.length
                        ? parsed.hrDepartments
                        : DEFAULT_HR_DEPARTMENTS.map(d => ({ ...d, headId:"", createdAt: new Date().toISOString() }));
    _hrPositions    = Array.isArray(parsed.hrPositions)   ? parsed.hrPositions    : [];
    _projects = Array.isArray(parsed.projects) ? parsed.projects : [...DEFAULT_PROJECTS];
    _requests = Array.isArray(parsed.requests) ? parsed.requests : [];
    _logs = Array.isArray(parsed.logs) ? parsed.logs : [];
    _notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
    _messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    _announcements = Array.isArray(parsed.announcements) ? parsed.announcements : [];
    _nextId = Number.isFinite(parsed.nextId) ? parsed.nextId : 1;
    _leaveApplications = Array.isArray(parsed.leaveApplications) ? parsed.leaveApplications : [];
    _leaveBalances     = (parsed.leaveBalances && typeof parsed.leaveBalances === "object") ? parsed.leaveBalances : {};
    _nextLeaveId       = Number.isFinite(parsed.nextLeaveId) ? parsed.nextLeaveId : 1;
    _empDocuments      = Array.isArray(parsed.empDocuments) ? parsed.empDocuments : [];
    _users = _users.map(user => ({
      ...user,
      eSignature: normalizeSignatureValue(user?.eSignature || null),
    }));
  } catch {
    _users = [];
    _positions = [...DEFAULT_POSITIONS];
    _deletedPositions = [];
    _positionRoles = { ...DEFAULT_POSITION_ROLES };
    _positionDashboards = { ...DEFAULT_POSITION_DASHBOARDS };
    _dashboardDelegations = [];
    _employees     = [];
    _nextEmpId     = 20;
    _hrDepartments = DEFAULT_HR_DEPARTMENTS.map(d => ({ ...d, headId:"", createdAt: new Date().toISOString() }));
    _hrPositions   = [];
    _projects = [...DEFAULT_PROJECTS];
    _requests = [];
    _logs = [];
    _notifications = [];
    _messages = [];
    _announcements = [];
    _nextId = 1;
    _leaveApplications = [];
    _leaveBalances     = {};
    _nextLeaveId       = 1;
    _empDocuments      = [];
  }
  normalizeState();
}

function getSupervisors(users=_users) {
  return users.filter(u => u.role === "supervisor");
}
function getEmployeeRecordForUser(user, employees=_employees) {
  if (!user) return null;
  return employees.find(e => String(e.email || "").toLowerCase() === String(user.email || "").toLowerCase()) || null;
}
function getUserDepartment(user, employees=_employees) {
  const employee = getEmployeeRecordForUser(user, employees);
  return employee?.department || user?.dept || "";
}
function canPublishMessagesAnnouncement(user) {
  const moduleRole = getModuleRole(user);
  return moduleRole === "hr" || moduleRole === "admin";
}
function canDirectMessageUser(sender, receiver) {
  if (!sender || !receiver || sender.id === receiver.id) return false;
  if (canPublishMessagesAnnouncement(sender)) return true;
  return true;
}
function getAllowedMessageRecipients(user, users=_users) {
  if (!user) return [];
  return users.filter(candidate => canDirectMessageUser(user, candidate));
}
function isAnnouncementVisibleToUser(announcement, user, employees=_employees) {
  if (!announcement || !user) return false;
  if (announcement.audienceType !== "department") return true;
  return announcement.department === getUserDepartment(user, employees);
}
function getRelevantAnnouncementsForUser(user, announcements=_announcements, employees=_employees) {
  return announcements.filter(item => isAnnouncementVisibleToUser(item, user, employees));
}
function getUnreadMessagesCountForUser(user, messages=_messages, announcements=_announcements, employees=_employees) {
  if (!user) return 0;
  const directUnread = messages.filter(item => item.receiverId === user.id && item.status !== "read").length;
  const announcementUnread = getRelevantAnnouncementsForUser(user, announcements, employees)
    .filter(item => !item.readBy?.includes(user.id))
    .length;
  return directUnread + announcementUnread;
}

function revokeDashboardDelegationRecord(delegationId) {
  _dashboardDelegations = _dashboardDelegations.map(item => item.id === delegationId ? { ...item, isRevoked:true } : item);
}

function getAssignedSupervisor(user, users=_users) {
  if (!user?.supervisorId) return null;
  return users.find(u => u.id === user.supervisorId) || null;
}

function getFallbackSupervisor(userId, users=_users) {
  const supervisors = getSupervisors(users);
  return supervisors.find(u => u.id !== userId) || supervisors[0] || null;
}

function buildRequestSupportingDocs(req) {
  return {
    supervisorId:            req.supervisorId            ?? null,
    supervisorName:          req.supervisorName          || "Unassigned",
    lastRejectionReason:     req.lastRejectionReason     ?? null,
    // Concept note structured fields
    activityTitle:           req.activityTitle           || "",
    startDate:               req.startDate               || "",
    endDate:                 req.endDate                 || "",
    venue:                   req.venue                   || "",
    backgroundJustification: req.backgroundJustification || "",
    targetedParticipants:    req.targetedParticipants    || "",
    methodology:             req.methodology             || "",
    plannedOutputs:          req.plannedOutputs          || "",
    immediateOutcomes:       req.immediateOutcomes       || "",
    intermediateOutcomes:    req.intermediateOutcomes    || "",
    programQualityMarkers:   req.programQualityMarkers   || "",
    genderConsiderations:    req.genderConsiderations    || "",
    inclusiveLeadership:     req.inclusiveLeadership     || "",
    communityResilience:     req.communityResilience     || "",
    budgetRows:              req.budgetRows              || [],
    conceptNote:             req.conceptNote             || "",
    purpose:                 req.purpose                 || "",
    priority:                req.priority                || "",
    durationDays:            req.durationDays            ?? null,
    signature:               req.signature               ?? null,
    file:                    req.file                    ?? null,
  };
}

function getAdminManagedPendingStatuses() {
  return ["pending_supervisor", "pending_accountant", "pending_finance", "pending_executive_director"];
}

function getAdminManagedAccountabilityStatuses() {
  // New workflow: accountability stages are top-level req.status values
  return ["accountability_submitted", "supervisor_approved", "senior_accountant_approved"];
}

function normalizeState() {
  _positionRoles = {
    ..._positionRoles,
    "System Administrator": "admin",
    "HR Manager": "hr_manager",
  };

  _positions = getPositionOptions(_users, _positions);

  const allUserIds = new Set(_users.map(u => u.id));
  _users = _users.map(u => {
    const position = normalizePositionName(u.jobTitle) || ROLE_LABELS[u.role] || "Team Member";
    const isReservedAdmin = u.id === "u5" || String(u.email || "").toLowerCase() === "admin@etara.org" || position === "System Administrator";
    const derivedRole = isReservedAdmin ? "admin" : (getPositionAccessRole(position) || u.role || "requester");
    // Validate that the stored supervisorId references an actual user and is not self.
    // Any user (not just Program Managers) can be a supervisor.
    const hasValidSupervisor = u.supervisorId && allUserIds.has(u.supervisorId) && u.supervisorId !== u.id;
    return {
      ...u,
      eSignature: normalizeSignatureValue(u.eSignature || null),
      role: derivedRole,
      moduleRole: POSITION_MODULE_ROLES[normalizePositionName(u.jobTitle)] || (MODULE_ROLES.includes(u.moduleRole) ? u.moduleRole : inferModuleRole(derivedRole)),
      jobTitle: position,
      isActive: u.isActive !== false,
      failedLoginAttempts: Number.isFinite(u.failedLoginAttempts) ? u.failedLoginAttempts : 0,
      lockedAt: u.lockedAt || null,
      lastPasswordResetAt: u.lastPasswordResetAt || null,
      // Executive directors have no supervisor. For everyone else, keep the
      // explicit assignment if valid; only null out if the referenced user
      // no longer exists. Never silently replace with a fallback — that hides
      // admin-set assignments behind whoever happens to be first in the list.
      supervisorId: derivedRole === "executive_director" ? null
        : hasValidSupervisor ? u.supervisorId
        : null,
    };
  });

  _dashboardDelegations = _dashboardDelegations
    .filter(item => item && item.delegateUserId && item.ownerUserId && SPECIAL_DASHBOARDS[item.dashboard])
    .map(item => ({
      id: item.id || `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dashboard: item.dashboard,
      ownerUserId: item.ownerUserId,
      delegateUserId: item.delegateUserId,
      startsOn: item.startsOn || "",
      endsOn: item.endsOn || "",
      reason: item.reason || "",
      isRevoked: item.isRevoked === true,
      createdAt: item.createdAt || ts(),
    }));

  const seenCodes = new Set();
  _projects = _projects.map((project, index) => {
    const normalizedActivities = Array.isArray(project.activities) ? project.activities : [];
    return {
      id: project.id || `proj-${index + 1}`,
      name: project.name || "Untitled Project",
      donorName: project.donorName || "",
      totalBudget: Number(project.totalBudget || 0),
      createdAt: project.createdAt || ts(),
      activities: normalizedActivities.map((activity, activityIndex) => {
        let code = String(activity.code || `ACT-${index + 1}-${activityIndex + 1}`).trim().toUpperCase();
        if (seenCodes.has(code)) code = `${code}-${activityIndex + 1}`;
        seenCodes.add(code);
        return {
          id: activity.id || `${project.id || `proj-${index + 1}`}-act-${activityIndex + 1}`,
          name: activity.name || "Untitled Activity",
          code,
          budgetAmount: Number(activity.budgetAmount || 0),
        };
      }),
    };
  });

  _requests = _requests.map(r => {
    const requester = _users.find(u => u.id === r.requesterId);
    const supervisor = r.supervisorId
      ? _users.find(u => u.id === r.supervisorId)
      : getAssignedSupervisor(requester);
    const budgetRows = getStructuredBudgetRows(r);
    const accountabilityRefundProof = normalizeStoredUploadList(r.accountabilityRefundProof || r.accountability?.refundProof || []);
    const paymentNumber = String(r.paymentNumber || r.paymentRef || "").trim();
    const paymentCode = String(r.paymentCode || paymentNumber).trim();
    const accountabilityReportData = normalizeAccountabilityReportData(
      r.accountabilityReportData || r.accountability?.reportData || null,
      { ...r, budgetRows, requesterName: requester?.name || r.requesterName, supervisorName: supervisor?.name || r.supervisorName || "" },
      getSavedUserSignature(requester)
    );
    const accountabilityReceipts = normalizeStoredUploadList(r.accountabilityReceipts || r.accountability?.receipts || []);
    const accountabilityPhotos = normalizeStoredUploadList(r.accountabilityPhotos || r.accountability?.photos || []);
    const accountabilityFinanceSummary = createAccountabilityFinancialData({ ...r, budgetRows }, accountabilityReportData.financials);
    const accountabilityRefundStatus = r.isVendorPayment
      ? "NOT_REQUIRED"
      : (accountabilityFinanceSummary.totals.status === "OVERALL UNDERSPENT"
        ? (accountabilityRefundProof.length ? "PROOF_ATTACHED" : "PENDING_PROOF")
        : "NOT_REQUIRED");
    const accountabilityStatus = r.isVendorPayment
      ? "NOT_REQUIRED"
      : (r.accountabilityStatus || (r.accountability?.status === "cleared" || r.status === "completed" ? "CLEARED" : (r.status === "paid" || r.accountability || r.accountabilityReportData || accountabilityReceipts.length || accountabilityPhotos.length ? "PENDING" : "")));
    return {
      ...r,
      signature: normalizeSignatureValue(r.signature || null),
      approvals: Array.isArray(r.approvals)
        ? r.approvals.map(approval => ({ ...approval, signature: normalizeSignatureValue(approval.signature || null) }))
        : [],
      status: r.status === "approved_payment" ? "pending_payment_accountant" : r.status,
      paymentNumber,
      paymentCode,
      paymentRef: paymentNumber,
      accountabilityStatus,
      paidAt: r.paidAt || "",
      supervisorId: supervisor?.id || null,
      supervisorName: supervisor?.name || "Unassigned",
      projectId: r.projectId || "",
      projectName: r.projectName || "",
      donorName: r.donorName || "",
      activityId: r.activityId || "",
      activityName: r.activityName || "",
      activityCode: r.activityCode || "",
      activityBudget: Number(r.activityBudget || 0),
      budgetRows,
      accountabilityReportData,
      accountabilityFinanceSummary,
      accountabilityReceipts,
      accountabilityPhotos,
      accountabilityRefundProof,
      accountabilityRefundStatus,
      accountability: r.accountability ? {
        ...r.accountability,
        signature: normalizeSignatureValue(r.accountability.signature || null),
        approvals: Array.isArray(r.accountability.approvals)
          ? r.accountability.approvals.map(approval => ({ ...approval, signature: normalizeSignatureValue(approval.signature || null) }))
          : [],
      } : null,
    };
  });

  _messages = _messages
    .filter(item => item && item.senderId && item.receiverId && String(item.message || "").trim())
    .map(item => ({
      id: item.id || uid(),
      senderId: item.senderId,
      receiverId: item.receiverId,
      message: String(item.message || "").trim(),
      timestamp: item.timestamp || ts(),
      status: ["sent","delivered","read"].includes(item.status) ? item.status : "delivered",
    }));

  _announcements = _announcements
    .filter(item => item && item.senderId && String(item.message || "").trim())
    .map(item => ({
      id: item.id || uid(),
      senderId: item.senderId,
      audienceType: item.audienceType === "department" ? "department" : "all",
      department: item.department || "",
      message: String(item.message || "").trim(),
      timestamp: item.timestamp || ts(),
      status: item.status || "delivered",
      readBy: Array.isArray(item.readBy) ? Array.from(new Set(item.readBy.filter(Boolean))) : [],
    }));
}

// â"€â"€ Pure helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ts()       { return new Date().toISOString(); }
function uid()      { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function fmtAmt(n)  { return `UGX ${Number(n||0).toLocaleString()}`; }
function normalizeSignatureValue(signature = null) {
  if (!signature) return null;
  if (typeof signature === "string") {
    const trimmed = signature.trim();
    return trimmed ? { type:"typed", value:trimmed } : null;
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
function getSavedUserSignature(userOrId) {
  const targetUser = typeof userOrId === "string"
    ? _users.find(item => item.id === userOrId)
    : userOrId;
  return normalizeSignatureValue(targetUser?.eSignature || null);
}
function amountToWords(value) {
  const ones = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const toWords = (num) => {
    const n = Number(num || 0);
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
    if (n < 1000) return `${ones[Math.floor(n / 100)]} hundred${n % 100 ? ` ${toWords(n % 100)}` : ""}`;
    if (n < 1000000) return `${toWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${toWords(n % 1000)}` : ""}`;
    if (n < 1000000000) return `${toWords(Math.floor(n / 1000000))} million${n % 1000000 ? ` ${toWords(n % 1000000)}` : ""}`;
    return `${toWords(Math.floor(n / 1000000000))} billion${n % 1000000000 ? ` ${toWords(n % 1000000000)}` : ""}`;
  };
  const rounded = Math.round(Number(value || 0));
  return `${toWords(Math.abs(rounded))} Uganda shillings only`;
}
function fmt(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})
       + " " + d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}

function formatFileSize(bytes=0) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getAccountabilityDraftKey(requestId) {
  return `${ACCOUNTABILITY_DRAFT_KEY_PREFIX}${requestId || "new"}`;
}

function normalizeStoredUpload(file = null) {
  if (!file || typeof file !== "object") return null;
  const name = String(file.name || file.fileName || "").trim();
  const dataUrl = String(file.dataUrl || file.data || "").trim();
  if (!name && !dataUrl) return null;
  return {
    id: file.id || `upload-${uid()}`,
    name: name || "Attachment",
    size: Number(file.size || file.sizeBytes || 0),
    type: file.type || file.mimeType || "",
    dataUrl,
    uploadedAt: file.uploadedAt || ts(),
  };
}

function normalizeStoredUploadList(files = []) {
  if (Array.isArray(files)) return files.map(item => normalizeStoredUpload(item)).filter(Boolean);
  const normalized = normalizeStoredUpload(files);
  return normalized ? [normalized] : [];
}

function getStoredUploadExtension(fileName = "") {
  const match = String(fileName || "").toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function isAllowedUploadFile(file, allowedExtensions = []) {
  if (!file?.name) return false;
  const extension = getStoredUploadExtension(file.name);
  return allowedExtensions.includes(extension);
}

function fileToStoredUpload(file, prefix = "upload") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve({
        id: `${prefix}-${uid()}`,
        name: file.name,
        size: file.size,
        type: file.type || "",
        dataUrl: event.target?.result || "",
        uploadedAt: ts(),
      });
    };
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function getDefaultAccountabilityParticipantData(data = {}) {
  return {
    maleBelow16: data.maleBelow16 ?? "",
    male16To30: data.male16To30 ?? "",
    maleAbove30: data.maleAbove30 ?? "",
    femaleBelow16: data.femaleBelow16 ?? "",
    female16To30: data.female16To30 ?? "",
    femaleAbove30: data.femaleAbove30 ?? "",
    pwdFemale: data.pwdFemale ?? "",
    pwdMale: data.pwdMale ?? "",
  };
}

function normalizeAccountabilityToggle(value) {
  if (value === true || value === "yes") return true;
  if (value === false || value === "no") return false;
  return null;
}

function normalizeBudgetCode(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "");
}

function buildSystemBudgetCode(activityCode = "", index = 0) {
  const base = normalizeBudgetCode(activityCode) || "BUD";
  return `${base}-BL${String(index + 1).padStart(2, "0")}`;
}

function computeBudgetVarianceStatus(approvedAmount = 0, actualAmount = "") {
  const approved = Math.max(toNumber(approvedAmount), 0);
  const hasActual = actualAmount !== "" && actualAmount !== null && actualAmount !== undefined;
  if (!hasActual) {
    return {
      approvedAmount: approved,
      actualAmount: "",
      variance: approved,
      status: "PENDING",
      hasActual: false,
    };
  }

  const actual = Math.max(toNumber(actualAmount), 0);
  let status = "BALANCED";
  if (actual > approved) status = "OVERSPENT";
  else if (actual < approved) status = "UNDERSPENT";

  return {
    approvedAmount: approved,
    actualAmount: actual,
    variance: approved - actual,
    status,
    hasActual: true,
  };
}

function summarizeAccountabilityBudgetLines(lines = []) {
  const normalizedLines = Array.isArray(lines) ? lines : [];
  const totalApproved = normalizedLines.reduce((sum, line) => sum + Math.max(toNumber(line.approvedAmount), 0), 0);
  const totalActual = normalizedLines.reduce((sum, line) => {
    if (line.actualAmount === "" || line.actualAmount === null || line.actualAmount === undefined) return sum;
    return sum + Math.max(toNumber(line.actualAmount), 0);
  }, 0);
  const missingActualCount = normalizedLines.filter(line => line.actualAmount === "" || line.actualAmount === null || line.actualAmount === undefined).length;
  const totalVariance = totalApproved - totalActual;
  const status = missingActualCount
    ? "INCOMPLETE"
    : (totalActual > totalApproved
      ? "OVERALL OVERSPENT"
      : (totalActual < totalApproved ? "OVERALL UNDERSPENT" : "BALANCED"));

  return {
    totalApproved,
    totalActual,
    totalVariance,
    missingActualCount,
    status,
    refundAmount: totalVariance > 0 ? totalVariance : 0,
  };
}

function createAccountabilityFinancialData(request = {}, financials = null) {
  const source = financials && typeof financials === "object" ? financials : {};
  const sourceLines = Array.isArray(source.budgetLines) ? source.budgetLines : [];
  const sourceLineMap = new Map(
    sourceLines.map(line => [normalizeBudgetCode(line?.budgetCode), line]).filter(([code]) => !!code)
  );
  const approvedBudgetLines = getStructuredBudgetRows(request).map((row, index) => {
    const approvedAmount = Math.max(getActivityBudgetRowAmount(row), 0);
    const existing = sourceLineMap.get(normalizeBudgetCode(row.budgetCode)) || {};
    const actualInput = existing.actualAmount ?? existing.actualAmountSpent ?? existing.actualSpent ?? "";
    const varianceData = computeBudgetVarianceStatus(approvedAmount, actualInput);
    return {
      id: row.id || `acc-line-${index + 1}`,
      budgetCode: row.budgetCode,
      budgetCategory: row.budgetItem || `Budget Line ${index + 1}`,
      approvedAmount,
      actualAmount: varianceData.hasActual ? varianceData.actualAmount : "",
      variance: varianceData.variance,
      status: varianceData.status,
    };
  });

  const totals = summarizeAccountabilityBudgetLines(approvedBudgetLines);
  return {
    budgetLines: approvedBudgetLines,
    totals,
    overspendingExplanation: String(source.overspendingExplanation || source.explanationForOverspending || "").trim(),
    refundAmount: totals.refundAmount,
  };
}

function getAccountabilitySpendStatusMeta(status = "") {
  switch (status) {
    case "OVERSPENT":
      return { label: "OVERSPENT", className: "over", badgeStyle: { background: "#fee2e2", color: "#b91c1c" } };
    case "UNDERSPENT":
      return { label: "UNDERSPENT", className: "under", badgeStyle: { background: "#ffedd5", color: "#c2410c" } };
    case "BALANCED":
      return { label: "BALANCED", className: "balanced", badgeStyle: { background: "#dcfce7", color: "#166534" } };
    default:
      return { label: "PENDING", className: "pending", badgeStyle: { background: "#e2e8f0", color: "#475569" } };
  }
}

function getAccountabilityOverallStatusMeta(status = "") {
  switch (status) {
    case "OVERALL OVERSPENT":
      return { tone: "red", background: "#fef2f2", border: "#fecaca", color: "#b91c1c" };
    case "OVERALL UNDERSPENT":
      return { tone: "orange", background: "#fff7ed", border: "#fdba74", color: "#c2410c" };
    case "BALANCED":
      return { tone: "green", background: "#f0fdf4", border: "#86efac", color: "#166534" };
    default:
      return { tone: "slate", background: "#f8fafc", border: "#cbd5e1", color: "#475569" };
  }
}

function buildDefaultAccountabilityReportData(request = {}, writerSignature = null) {
  const referenceDate = toDateInputValue(request.paymentDate || request.createdAt || ts()) || toDateInputValue(ts());
  const activityStartDate = request.startDate || referenceDate;
  const activityEndDate = request.endDate || activityStartDate;
  return {
    requestId: request.id || "",
    projectName: request.projectName || "CUGA",
    reportingOfficers: request.accountabilitySubmittedByName || request.requesterName || "",
    reportingDate: referenceDate,
    activityStartDate,
    activityEndDate,
    submissionDate: toDateInputValue(request.accountabilitySubmittedAt || ts()) || toDateInputValue(ts()),
    projectSites: request.venue || request.department || "",
    activityTitle: request.activityTitle || request.title || "",
    financials: createAccountabilityFinancialData(request),
    description: "",
    objectives: "",
    achievements: "",
    immediateOutcomes: request.immediateOutcomes || "",
    outputs: request.plannedOutputs || "",
    participantData: getDefaultAccountabilityParticipantData(),
    programQuality: {
      genderMainstreamed: null,
      inclusiveGovernance: null,
      resilienceMainstreamed: null,
      addressedGbv: null,
      safeguardingIncluded: null,
      implementedWithPartner: null,
    },
    recommendations: "",
    challenges: "",
    lessonsLearned: "",
    reportWriterSignature: normalizeSignatureValue(writerSignature || request.signature || null),
    supervisorComments: "",
    supervisorName: request.supervisorName || "",
    supervisorSignature: null,
    supervisorDate: "",
  };
}

function normalizeAccountabilityReportData(report = null, request = {}, writerSignature = null) {
  const base = buildDefaultAccountabilityReportData(request, writerSignature);
  const source = report && typeof report === "object" ? report : {};
  const participantData = getDefaultAccountabilityParticipantData({
    ...base.participantData,
    ...(source.participantData || {}),
  });
  const sourceProgramQuality = source.programQuality || {};
  return {
    ...base,
    ...source,
    requestId: String(source.requestId ?? base.requestId).trim() || request.id || "",
    projectName: String(source.projectName ?? base.projectName).trim() || "CUGA",
    reportingOfficers: String(source.reportingOfficers ?? base.reportingOfficers).trim(),
    reportingDate: String(source.reportingDate ?? (base.reportingDate || "")),
    activityStartDate: String(source.activityStartDate ?? (base.activityStartDate || "")),
    activityEndDate: String(source.activityEndDate ?? (base.activityEndDate || "")),
    submissionDate: String(source.submissionDate ?? (toDateInputValue(request.accountabilitySubmittedAt || base.submissionDate) || "")),
    projectSites: String(source.projectSites ?? base.projectSites).trim(),
    activityTitle: String(source.activityTitle ?? base.activityTitle).trim(),
    financials: createAccountabilityFinancialData(request, source.financials || base.financials),
    description: String(source.description ?? base.description).trim(),
    objectives: String(source.objectives ?? base.objectives).trim(),
    achievements: String(source.achievements ?? base.achievements).trim(),
    immediateOutcomes: String(source.immediateOutcomes ?? base.immediateOutcomes).trim(),
    outputs: String(source.outputs ?? base.outputs).trim(),
    participantData,
    programQuality: {
      genderMainstreamed: normalizeAccountabilityToggle(sourceProgramQuality.genderMainstreamed ?? source.genderMainstreamed ?? base.programQuality.genderMainstreamed),
      inclusiveGovernance: normalizeAccountabilityToggle(sourceProgramQuality.inclusiveGovernance ?? source.inclusiveGovernance ?? base.programQuality.inclusiveGovernance),
      resilienceMainstreamed: normalizeAccountabilityToggle(sourceProgramQuality.resilienceMainstreamed ?? source.resilienceMainstreamed ?? base.programQuality.resilienceMainstreamed),
      addressedGbv: normalizeAccountabilityToggle(sourceProgramQuality.addressedGbv ?? source.addressedGbv ?? base.programQuality.addressedGbv),
      safeguardingIncluded: normalizeAccountabilityToggle(sourceProgramQuality.safeguardingIncluded ?? source.safeguardingIncluded ?? base.programQuality.safeguardingIncluded),
      implementedWithPartner: normalizeAccountabilityToggle(sourceProgramQuality.implementedWithPartner ?? source.implementedWithPartner ?? base.programQuality.implementedWithPartner),
    },
    recommendations: String(source.recommendations ?? base.recommendations).trim(),
    challenges: String(source.challenges ?? base.challenges).trim(),
    lessonsLearned: String(source.lessonsLearned ?? base.lessonsLearned).trim(),
    reportWriterSignature: normalizeSignatureValue(source.reportWriterSignature || base.reportWriterSignature),
    supervisorComments: String(source.supervisorComments ?? base.supervisorComments).trim(),
    supervisorName: String(source.supervisorName ?? base.supervisorName).trim(),
    supervisorSignature: normalizeSignatureValue(source.supervisorSignature || base.supervisorSignature),
    supervisorDate: String(source.supervisorDate ?? (base.supervisorDate || "")),
  };
}

function getAccountabilityParticipantTotals(participantData = {}) {
  const toCount = (value) => Math.max(Number(value || 0), 0);
  const maleBelow16 = toCount(participantData.maleBelow16);
  const male16To30 = toCount(participantData.male16To30);
  const maleAbove30 = toCount(participantData.maleAbove30);
  const femaleBelow16 = toCount(participantData.femaleBelow16);
  const female16To30 = toCount(participantData.female16To30);
  const femaleAbove30 = toCount(participantData.femaleAbove30);
  const pwdFemale = toCount(participantData.pwdFemale);
  const pwdMale = toCount(participantData.pwdMale);
  const maleTotal = maleBelow16 + male16To30 + maleAbove30;
  const femaleTotal = femaleBelow16 + female16To30 + femaleAbove30;
  return {
    maleBelow16,
    male16To30,
    maleAbove30,
    femaleBelow16,
    female16To30,
    femaleAbove30,
    pwdFemale,
    pwdMale,
    maleTotal,
    femaleTotal,
    overallTotal: maleTotal + femaleTotal,
    pwdTotal: pwdFemale + pwdMale,
  };
}

function getAccountabilityReceiptFiles(request = {}) {
  return normalizeStoredUploadList(request.accountabilityReceipts || request.accountability?.receipts || []);
}

function getAccountabilityPhotoFiles(request = {}) {
  return normalizeStoredUploadList(request.accountabilityPhotos || request.accountability?.photos || []);
}

function hasAccountabilitySubmissionData(request = {}) {
  return Boolean(
    request.accountabilityReportData ||
    getAccountabilityReceiptFiles(request).length ||
    getAccountabilityPhotoFiles(request).length ||
    normalizeStoredUploadList(request.accountabilityRefundProof || request.accountability?.refundProof || []).length ||
    request.accountabilityReport ||
    request.accountabilitySubmittedAt
  );
}

function toNumber(value) { return Number(value || 0); }

function createActivityBudgetRow(row={}) {
  const quantity = row.quantity || "";
  const unitCost = row.unitCost || "";
  const frequency = row.frequency || 1;
  return {
    id: row.id || uid(),
    budgetCode: normalizeBudgetCode(row.budgetCode || ""),
    budgetItem: row.budgetItem || "",
    quantity,
    unitCost,
    frequency,
    amount: getActivityBudgetRowAmount({ quantity, unitCost, frequency }),
    activityCode: row.activityCode || "",
    comments: row.comments || "",
  };
}

function getActivityBudgetRowAmount(row={}) {
  const quantity = Math.max(toNumber(row.quantity), 0);
  const unitCost = Math.max(toNumber(row.unitCost), 0);
  const frequency = Math.max(toNumber(row.frequency), 0);
  return quantity * unitCost * frequency;
}

function getActivityPlanBudgetTotal(rows=[]) {
  return rows.reduce((sum, row) => sum + getActivityBudgetRowAmount(row), 0);
}

function getActivityPlanDurationDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

function getActivityPlanCodes(plan={}) {
  const codes = new Set();
  if (plan.activityCode) codes.add(plan.activityCode);
  (plan.budgetRows || []).forEach(row => {
    if (row.activityCode) codes.add(String(row.activityCode).trim().toUpperCase());
  });
  return [...codes];
}

function formatActivityPlanDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB",{ day:"2-digit", month:"short", year:"numeric" });
}

function formatActivityPlanDateRange(plan={}) {
  if (!plan.startDate && !plan.endDate) return "-";
  if (plan.startDate && plan.endDate) return `${formatActivityPlanDate(plan.startDate)} - ${formatActivityPlanDate(plan.endDate)}`;
  return formatActivityPlanDate(plan.startDate || plan.endDate);
}

function hasStructuredConceptNote(req={}) {
  return !!(
    req.activityTitle ||
    req.startDate ||
    req.endDate ||
    req.venue ||
    req.backgroundJustification ||
    req.targetedParticipants ||
    req.methodology ||
    req.plannedOutputs ||
    req.immediateOutcomes ||
    req.intermediateOutcomes ||
    req.genderConsiderations ||
    req.inclusiveLeadership ||
    req.communityResilience ||
    (req.budgetRows && req.budgetRows.length)
  );
}

function buildLegacyConceptNoteText(form={}) {
  return [
    `Activity Title: ${form.activityTitle || form.title || ""}`,
    `Dates: ${formatActivityPlanDateRange(form)}`,
    `Venue: ${form.venue || ""}`,
    "",
    "Background & Justification",
    form.backgroundJustification || "",
    "",
    "Targeted Participants",
    form.targetedParticipants || "",
    "",
    "Methodology",
    form.methodology || "",
  ].join("\n").trim();
}

function buildLegacyPurposeText(form={}) {
  return [
    "Planned Outputs",
    form.plannedOutputs || "",
    "",
    "Immediate Outcomes",
    form.immediateOutcomes || "",
    "",
    "Intermediate Outcomes",
    form.intermediateOutcomes || "",
    "",
    "Program Quality Markers",
    form.programQualityMarkers || [
      form.genderConsiderations,
      form.inclusiveLeadership,
      form.communityResilience,
    ].filter(Boolean).join("\n"),
  ].join("\n").trim();
}

function getProgramQualityMarkersText(data={}) {
  if (String(data.programQualityMarkers || "").trim()) return String(data.programQualityMarkers || "").trim();
  return [
    data.genderConsiderations && `Gender Considerations: ${data.genderConsiderations}`,
    data.inclusiveLeadership && `Inclusive Leadership / Governance: ${data.inclusiveLeadership}`,
    data.communityResilience && `Community Resilience: ${data.communityResilience}`,
  ].filter(Boolean).join("\n");
}

function getStructuredBudgetRows(req={}) {
  const fallbackActivityCode = req.activityCode || "";
  const sourceRows = Array.isArray(req.budgetRows) && req.budgetRows.length
    ? req.budgetRows
    : [{
        id: req.id || uid(),
        budgetItem: req.activityTitle || req.title || "Approved Budget",
        quantity: 1,
        unitCost: Math.max(toNumber(req.amount), 0),
        frequency: 1,
        amount: Math.max(toNumber(req.amount), 0),
        activityCode: fallbackActivityCode,
      }];

  const seenCodes = new Set();
  return sourceRows.map((row, index) => {
    const baseRow = createActivityBudgetRow({
      ...row,
      activityCode: row.activityCode || fallbackActivityCode,
    });
    let budgetCode = normalizeBudgetCode(baseRow.budgetCode) || buildSystemBudgetCode(baseRow.activityCode || fallbackActivityCode, index);
    while (seenCodes.has(budgetCode)) {
      budgetCode = `${buildSystemBudgetCode(baseRow.activityCode || fallbackActivityCode, index)}-${seenCodes.size + 1}`;
    }
    seenCodes.add(budgetCode);
    return {
      ...baseRow,
      budgetCode,
    };
  });
}

function StructuredConceptNoteDetail({ req }) {
  const budgetRows = getStructuredBudgetRows(req);
  const durationDays = req.durationDays || getActivityPlanDurationDays(req.startDate, req.endDate);
  const activityCodes = getActivityPlanCodes(req);
  const totalBudget = req.amount || getActivityPlanBudgetTotal(budgetRows);

  return (
    <>
      <div className="mb-4">
        <div className="text-xs text-gray mb-2">Concept Note Template</div>
        <div className="grid-2">
          <div style={{ background:"var(--g50)", padding:"11px 13px", borderRadius:"var(--r-sm)" }}>
            <div className="text-xs text-gray mb-1">Project / Initiative Name</div>
            <div style={{ fontWeight:600 }}>{req.projectName || "Not linked"}</div>
          </div>
          <div style={{ background:"var(--g50)", padding:"11px 13px", borderRadius:"var(--r-sm)" }}>
            <div className="text-xs text-gray mb-1">Activity Title</div>
            <div style={{ fontWeight:600 }}>{req.activityTitle || req.title || "Not provided"}</div>
          </div>
          <div style={{ background:"var(--g50)", padding:"11px 13px", borderRadius:"var(--r-sm)" }}>
            <div className="text-xs text-gray mb-1">Dates and Duration</div>
            <div>{formatActivityPlanDateRange(req)}{durationDays ? ` (${durationDays} day${durationDays === 1 ? "" : "s"})` : ""}</div>
          </div>
          <div style={{ background:"var(--g50)", padding:"11px 13px", borderRadius:"var(--r-sm)" }}>
            <div className="text-xs text-gray mb-1">Venue</div>
            <div>{req.venue || "Not provided"}</div>
          </div>
        </div>
        <div style={{ background:"var(--g50)", padding:"11px 13px", borderRadius:"var(--r-sm)", marginTop:12 }}>
          <div className="text-xs text-gray mb-1">Activity Code</div>
          <div>{activityCodes.length ? activityCodes.join(", ") : "Not linked"}</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray mb-2">Content & Strategy</div>
        <div style={{ background:"var(--g50)", padding:"11px 13px", borderRadius:"var(--r-sm)", fontSize:13.5, lineHeight:1.7 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Background & Justification</div>
          <div>{req.backgroundJustification || "Not provided"}</div>
          <div style={{ fontWeight:700, margin:"14px 0 6px" }}>Targeted Participants</div>
          <div>{req.targetedParticipants || "Not provided"}</div>
          <div style={{ fontWeight:700, margin:"14px 0 6px" }}>Methodology</div>
          <div>{req.methodology || "Not provided"}</div>
          <div style={{ fontWeight:700, margin:"14px 0 6px" }}>Planned Outputs</div>
          <div>{req.plannedOutputs || "Not provided"}</div>
          <div style={{ fontWeight:700, margin:"14px 0 6px" }}>Immediate Outcomes</div>
          <div>{req.immediateOutcomes || "Not provided"}</div>
          <div style={{ fontWeight:700, margin:"14px 0 6px" }}>Intermediate Outcomes</div>
          <div>{req.intermediateOutcomes || "Not provided"}</div>
          <div style={{ fontWeight:700, margin:"14px 0 6px" }}>Program Quality Markers</div>
          <div style={{ whiteSpace:"pre-wrap" }}>{getProgramQualityMarkersText(req) || "Not provided"}</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray mb-2">Financial Information</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Budget Item</th><th>Quantity</th><th>Unit Cost</th><th>Frequency</th><th>Amount (UGX)</th><th>Activity Code</th><th>Comments</th></tr></thead>
            <tbody>
              {budgetRows.map(row => (
                <tr key={row.id}>
                  <td>{row.budgetItem || "-"}</td>
                  <td>{row.quantity || "-"}</td>
                  <td>{row.unitCost ? Number(row.unitCost).toLocaleString() : "-"}</td>
                  <td>{row.frequency || "-"}</td>
                  <td>{getActivityBudgetRowAmount(row).toLocaleString()}</td>
                  <td>{row.activityCode || "-"}</td>
                  <td>{row.comments || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="budget-balance-row total" style={{ marginTop:12 }}>
          <span>Total Activity Budget</span>
          <strong>{fmtAmt(totalBudget)}</strong>
        </div>
      </div>
    </>
  );
}

function StructuredConceptNotePDFSections({ req }) {
  const budgetRows = getStructuredBudgetRows(req);
  const durationDays = req.durationDays || getActivityPlanDurationDays(req.startDate, req.endDate);
  const activityCodes = getActivityPlanCodes(req);
  const totalBudget = req.amount || getActivityPlanBudgetTotal(budgetRows);

  return (
    <>
      <div className="pdf-sec">
        <div className="pdf-sec-title">Activity Overview</div>
        <div className="pdf-row">
          <div className="pdf-field"><div className="pdf-fl">Project / Initiative Name</div><div className="pdf-fv">{req.projectName || "Not linked"}</div></div>
          <div className="pdf-field"><div className="pdf-fl">Activity Title</div><div className="pdf-fv">{req.activityTitle || req.title || "Not provided"}</div></div>
        </div>
        <div className="pdf-row mt-2">
          <div className="pdf-field"><div className="pdf-fl">Dates and Duration</div><div className="pdf-fv">{formatActivityPlanDateRange(req)}{durationDays ? ` (${durationDays} day${durationDays === 1 ? "" : "s"})` : ""}</div></div>
          <div className="pdf-field"><div className="pdf-fl">Venue</div><div className="pdf-fv">{req.venue || "Not provided"}</div></div>
        </div>
        <div className="mt-2"><div className="pdf-fl">Activity Code</div><div className="pdf-fv">{activityCodes.length ? activityCodes.join(", ") : "Not linked"}</div></div>
      </div>

      <div className="pdf-sec">
        <div className="pdf-sec-title">Content & Strategy</div>
        <div className="mt-2"><div className="pdf-fl">Background & Justification</div><div className="pdf-fv">{req.backgroundJustification || "Not provided"}</div></div>
        <div className="mt-2"><div className="pdf-fl">Targeted Participants</div><div className="pdf-fv">{req.targetedParticipants || "Not provided"}</div></div>
        <div className="mt-2"><div className="pdf-fl">Methodology</div><div className="pdf-fv">{req.methodology || "Not provided"}</div></div>
        <div className="pdf-row mt-2">
          <div className="pdf-field"><div className="pdf-fl">Planned Outputs</div><div className="pdf-fv">{req.plannedOutputs || "Not provided"}</div></div>
          <div className="pdf-field"><div className="pdf-fl">Immediate Outcomes</div><div className="pdf-fv">{req.immediateOutcomes || "Not provided"}</div></div>
        </div>
        <div className="mt-2"><div className="pdf-fl">Intermediate Outcomes</div><div className="pdf-fv">{req.intermediateOutcomes || "Not provided"}</div></div>
        <div className="mt-2"><div className="pdf-fl">Program Quality Markers</div><div className="pdf-fv" style={{ whiteSpace:"pre-wrap" }}>{getProgramQualityMarkersText(req) || "Not provided"}</div></div>
      </div>

      <div className="pdf-sec">
        <div className="pdf-sec-title">Financial Information</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Budget Item</th><th>Qty</th><th>Unit Cost</th><th>Frequency</th><th>Amount (UGX)</th><th>Activity Code</th><th>Comments</th></tr></thead>
            <tbody>
              {budgetRows.map(row => (
                <tr key={row.id}>
                  <td>{row.budgetItem || "-"}</td>
                  <td>{row.quantity || "-"}</td>
                  <td>{row.unitCost ? Number(row.unitCost).toLocaleString() : "-"}</td>
                  <td>{row.frequency || "-"}</td>
                  <td>{getActivityBudgetRowAmount(row).toLocaleString()}</td>
                  <td>{row.activityCode || "-"}</td>
                  <td>{row.comments || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="budget-balance-row total" style={{ marginTop:12 }}>
          <span>Total Activity Budget</span>
          <strong>{fmtAmt(totalBudget)}</strong>
        </div>
      </div>
    </>
  );
}

function getProjectById(projects, projectId) {
  return projects.find(project => project.id === projectId) || null;
}

function getActivityByCode(projects, projectId, activityCode) {
  const project = getProjectById(projects, projectId);
  return project?.activities?.find(activity => activity.code === activityCode) || null;
}

function isBudgetCommittedStatus(status) {
  return status === "pending_payment_accountant" || status === "completed";
}

function getActivityUsedAmount(requests, activityCode, excludeRequestId=null) {
  return requests.reduce((sum, request) => {
    if (!activityCode || request.activityCode !== activityCode) return sum;
    if (excludeRequestId && request.id === excludeRequestId) return sum;
    if (!isBudgetCommittedStatus(request.status)) return sum;
    return sum + toNumber(request.amount);
  }, 0);
}

function getActivityBudgetSnapshot(projects, requests, projectId, activityCode, excludeRequestId=null) {
  const project = getProjectById(projects, projectId);
  const activity = getActivityByCode(projects, projectId, activityCode);
  const totalBudget = toNumber(activity?.budgetAmount);
  const usedAmount = getActivityUsedAmount(requests, activityCode, excludeRequestId);
  const remainingBalance = totalBudget - usedAmount;
  return {
    project,
    activity,
    totalBudget,
    usedAmount,
    remainingBalance,
  };
}

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function inDateRange(iso, fromDate, toDate) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return false;
  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00`);
    if (value < from) return false;
  }
  if (toDate) {
    const to = new Date(`${toDate}T23:59:59`);
    if (value > to) return false;
  }
  return true;
}

function getConceptReportingDate(request) {
  return request.paymentDate || request.createdAt;
}

function buildBudgetReportData(projects, requests, fromDate, toDate) {
  const approvedConcepts = requests.filter(request =>
    isBudgetCommittedStatus(request.status) &&
    request.projectId &&
    request.activityCode &&
    inDateRange(getConceptReportingDate(request), fromDate, toDate)
  );

  const projectRows = projects.map(project => {
    const projectConcepts = approvedConcepts.filter(request => request.projectId === project.id);
    const allocated = projectConcepts.reduce((sum, request) => sum + toNumber(request.amount), 0);
    const totalBudget = toNumber(project.totalBudget);
    return {
      ...project,
      allocated,
      remaining: totalBudget - allocated,
      concepts: projectConcepts,
    };
  });

  const activityRows = projectRows.flatMap(project =>
    project.activities.map(activity => {
      const activityConcepts = project.concepts.filter(request => request.activityCode === activity.code);
      const used = activityConcepts.reduce((sum, request) => sum + toNumber(request.amount), 0);
      const budgeted = toNumber(activity.budgetAmount);
      return {
        projectId: project.id,
        projectName: project.name,
        donorName: project.donorName,
        name: activity.name,
        code: activity.code,
        budgeted,
        used,
        remaining: budgeted - used,
        concepts: activityConcepts,
      };
    })
  );

  return {
    approvedConcepts,
    projectRows,
    activityRows,
  };
}

// ── Payment helpers (new deterministic workflow) ──────────────────────────────

function getPaymentNumber(request) {
  // Works for both new (transactionId) and legacy (paymentNumber / paymentRef) fields
  return String(request?.transactionId || request?.paymentNumber || request?.paymentRef || "").trim();
}

function isPaidTransaction(request) {
  return ["completed","paid","pending_accountability","accountability_submitted",
          "supervisor_approved","senior_accountant_approved"].includes(request?.status)
         && !!getPaymentNumber(request) && !!request?.paymentDate;
}

function getPaidTransactionPayee(request) {
  return request?.requesterName || request?.paidByName || "Unspecified";
}

/** True when the request is in the APPROVED state (ready for payment). */
function canProcessPayment(request) {
  const readyStatus = request?.status === "approved" || request?.status === "pending_payment_accountant";
  const notYetPaid  = !getPaymentNumber(request) && !request?.paymentDate;
  return readyStatus && notYetPaid;
}

/** True once payment has been recorded – no further payment actions allowed. */
function isPaymentLocked(request) {
  return !!getPaymentNumber(request) ||
    ["paid","pending_accountability","accountability_submitted",
     "supervisor_approved","senior_accountant_approved","completed"].includes(request?.status);
}

// ── payRequest – Stage 2: record payment and wait for requester accountability ─
function payRequest(req, payer, transactionId, paymentDate) {
  if (!req || !payer) return { ok:false, message:"Payment request not found." };

  const target = _requests.find(item => item.id === req.id);
  if (!target) return { ok:false, message:"Payment request not found." };

  const txId    = String(transactionId || "").trim();
  const payDate = String(paymentDate   || "").trim();

  if (!txId)    return { ok:false, message:"Transaction ID is required." };
  if (!payDate) return { ok:false, message:"Payment date is required." };

  const parsedDate = new Date(`${payDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return { ok:false, message:"Payment date is invalid." };

  if (isPaymentLocked(target)) {
    return { ok:false, message:"This payment has already been processed and cannot be edited." };
  }
  if (!canProcessPayment(target)) {
    return { ok:false, message:"Only APPROVED requests can be processed for payment." };
  }

  const paidAt    = ts();
  const payerSig  = getSavedUserSignature(payer);

  // Persist all payment fields
  target.transactionId = txId;
  target.paymentNumber = txId;   // alias kept for PDF voucher / reports
  target.paymentCode   = txId;
  target.paymentRef    = txId;
  target.paymentDate   = payDate;
  target.paidAt        = paidAt;
  target.paidById      = payer.id;
  target.paidByName    = payer.name;
  target.paidBy        = payer.name;

  target.approvals = [
    ...(target.approvals || []).filter(e => e.role !== "payment_accountant"),
    {
      role:"payment_accountant", userId:payer.id, name:payer.name,
      decision:"approved", at:paidAt, stage:"approved",
      signature:payerSig, note:`Transaction ID: ${txId}`,
    },
  ];

  addLog(target.id, payer.id, `Payment recorded – Transaction ID: ${txId}`, `Date: ${payDate}`);

  if (target.isVendorPayment) {
    target.status = "completed";
    addNotif(target.requesterId, `Vendor payment complete for "${target.title}". Transaction ID: ${txId}`, target.id);
  } else {
    // Stage 3: payment is complete; requester can now submit accountability
    target.status = "paid";
    target.accountabilityStatus = "PENDING";
    // Clear any legacy accountability sub-object
    delete target.accountability;

    addLog(target.id, payer.id, "Payment completed – awaiting requester accountability");
    addNotif(
      target.requesterId,
      `Payment received for "${target.title}" (Transaction ID: ${txId}). Please submit your accountability.`,
      target.id,
      { page:"my_requests" },
    );
  }

  return { ok:true, request:target };
}

function buildPaidFinancialReportData(projects, requests, selectedProjectId="", fromDate="", toDate="") {
  const scopedProjects = selectedProjectId
    ? projects.filter(project => project.id === selectedProjectId)
    : projects;

  const projectMap = new Map(scopedProjects.map(project => [project.id, project]));

  const paidItems = requests
    .filter(request => isPaidTransaction(request))
    .filter(request => request.projectId && projectMap.has(request.projectId))
    .filter(request => inDateRange(request.paymentDate, fromDate, toDate))
    .map(request => ({
      id: request.id,
      paymentDate: request.paymentDate,
      payee: getPaidTransactionPayee(request),
      paymentReference: getPaymentNumber(request),
      amountPaid: toNumber(request.amount),
      projectId: request.projectId,
      projectName: request.projectName || projectMap.get(request.projectId)?.name || "Unassigned Project",
    }))
    .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

  const paidAmountByProject = paidItems.reduce((map, item) => {
    map[item.projectId] = (map[item.projectId] || 0) + item.amountPaid;
    return map;
  }, {});

  const summaryRows = scopedProjects.map(project => {
    const totalProjectBudget = toNumber(project.totalBudget);
    const totalSpent = toNumber(paidAmountByProject[project.id] || 0);
    return {
      projectId: project.id,
      projectName: project.name,
      totalProjectBudget,
      totalSpent,
      remainingBalance: totalProjectBudget - totalSpent,
    };
  });

  return {
    paidItems,
    summaryRows,
    totals: {
      paidItemsCount: paidItems.length,
      totalSpent: paidItems.reduce((sum, item) => sum + item.amountPaid, 0),
      projectsCount: summaryRows.length,
    },
  };
}

function addLog(requestId, userId, action, note="") {
  _logs.push({ id:uid(), requestId, userId, action, note, at:ts() });
}
function addNotif(userId, message, requestId, meta={}) {
  const id = uid();
  const at = ts();
  _notifications.push({ id, userId, message, requestId, read:false, at, ...meta });
  // Persist cross-device — fire and forget
  supabase.from("notifications").insert({
    id,
    user_id:    userId,
    message,
    request_id: requestId || null,
    is_read:    false,
    created_at: at,
    page:       meta.page || null,
  }).then(({ error }) => { if (error) console.warn("[notif]", error.message); });
}
function getNotificationTargetPage(user, notification) {
  if (!notification || !user) return "notifications";
  const requestId = String(notification.requestId || "");
  const message = String(notification.message || "").toLowerCase();

  if (notification.page) return notification.page;
  if (message.includes("new message from") || message.includes("posted an announcement")) return "messages_center";

  if (requestId.startsWith("PR-")) return "procurement";

  if (requestId.startsWith("LV-")) {
    if (
      message.includes("approval needed") ||
      message.includes("hr review needed") ||
      message.includes("executive approval needed")
    ) {
      return canAccessLeaveManagement(user) ? "hr_leave_manage" : "my_leave";
    }
    return "my_leave";
  }

  if (requestId.startsWith("REQ-")) {
    if (
      message.includes("approval needed") ||
      message.includes("awaiting your review") ||
      message.includes("new request for review") ||
      message.includes("accountability submitted") ||
      message.includes("accountability awaiting review")
    ) {
      return "pending_approvals";
    }
    if (
      message.includes("approved by") ||
      message.includes("was rejected") ||
      message.includes("payment complete") ||
      message.includes("accountability cleared")
    ) {
      return "my_requests";
    }
  }

  return "notifications";
}
function canAccessLeaveManagement(user) {
  if (!user) return false;
  const moduleRole = getModuleRole(user);
  return moduleRole === "hr" || moduleRole === "admin" || user.role === "supervisor" || user.role === "executive_director";
}
function sendDirectMessage(senderId, receiverId, message) {
  const sender = _users.find(u => u.id === senderId);
  const receiver = _users.find(u => u.id === receiverId);
  const cleanMessage = String(message || "").trim();
  if (!sender || !receiver || !cleanMessage) return { ok:false, message:"Recipient and message are required." };
  if (!canDirectMessageUser(sender, receiver)) return { ok:false, message:"You do not have permission to message this user." };
  const entry = { id:uid(), senderId, receiverId, message:cleanMessage, timestamp:ts(), status:"delivered" };
  _messages.push(entry);
  supabase.from("direct_messages").insert({
    id: entry.id, sender_id: senderId, receiver_id: receiverId,
    message: cleanMessage, timestamp: entry.timestamp, status: "delivered",
  }).then(({ error }) => { if (error) console.warn("[msg]", error.message); });
  addNotif(receiverId, `New message from ${sender.name}`, null);
  return { ok:true, entry };
}
function markConversationRead(userId, partnerId) {
  let changed = false;
  const readIds = [];
  _messages = _messages.map(item => {
    if (item.receiverId === userId && item.senderId === partnerId && item.status !== "read") {
      changed = true;
      readIds.push(item.id);
      return { ...item, status:"read" };
    }
    return item;
  });
  if (readIds.length) {
    supabase.from("direct_messages").update({ status:"read" }).in("id", readIds)
      .then(({ error }) => { if (error) console.warn("[msg-read]", error.message); });
  }
  return changed;
}
function sendAnnouncement(senderId, audienceType, department, message) {
  const sender = _users.find(u => u.id === senderId);
  const cleanMessage = String(message || "").trim();
  if (!sender || !cleanMessage) return { ok:false, message:"Announcement message is required." };
  if (!canPublishMessagesAnnouncement(sender)) return { ok:false, message:"Only HR and Admin can send announcements." };
  if (audienceType === "department" && !department) return { ok:false, message:"Select a department for this announcement." };
  const entry = {
    id: uid(),
    senderId,
    audienceType: audienceType === "department" ? "department" : "all",
    department: audienceType === "department" ? department : "",
    message: cleanMessage,
    timestamp: ts(),
    status: "delivered",
    readBy: [senderId],
  };
  _announcements.unshift(entry);
  supabase.from("announcements").insert({
    id: entry.id, sender_id: senderId,
    audience_type: entry.audienceType, department: entry.department || null,
    message: cleanMessage, timestamp: entry.timestamp,
    status: "delivered", read_by: entry.readBy,
  }).then(({ error }) => { if (error) console.warn("[ann]", error.message); });
  _users
    .filter(candidate => candidate.id !== senderId && isAnnouncementVisibleToUser(entry, candidate))
    .forEach(candidate => addNotif(candidate.id, `${sender.name} posted an announcement`, null));
  return { ok:true, entry };
}
function markAnnouncementsRead(userId) {
  const targetUser = _users.find(u => u.id === userId);
  if (!targetUser) return false;
  let changed = false;
  _announcements = _announcements.map(item => {
    if (!isAnnouncementVisibleToUser(item, targetUser)) return item;
    if (item.readBy?.includes(userId)) return item;
    changed = true;
    const newReadBy = [...(item.readBy || []), userId];
    supabase.from("announcements").update({ read_by: newReadBy }).eq("id", item.id)
      .then(({ error }) => { if (error) console.warn("[ann-read]", error.message); });
    return { ...item, readBy: newReadBy };
  });
  return changed;
}
function getPendingForRole(role, requests, userId=null) {
  if (role === "admin") {
    const statuses = new Set(getAdminManagedPendingStatuses());
    return requests.filter(r => statuses.has(r.status));
  }
  // payment_accountant sees requests with status "approved" (new) or legacy "pending_payment_accountant"
  const map = {
    supervisor:          "pending_supervisor",
    accountant:          "pending_accountant",
    finance_manager:     "pending_finance",
    executive_director:  "pending_executive_director",
    payment_accountant:  "approved",
  };
  const s = map[role];
  if (!s) return [];
  return requests.filter(r => {
    const matches = r.status === s || (s === "approved" && r.status === "pending_payment_accountant");
    if (!matches) return false;
    if (role === "supervisor" && userId)
      return r.supervisorId === userId || r.supervisorId == null;
    return true;
  });
}
function approveRequest(req, approver) {
  const approverSignature = getSavedUserSignature(approver);

  // Stage 1 complete: ED approval → status "approved", assigned to Payment Officer
  const adminStageMap = {
    pending_supervisor:          { status:"pending_accountant",         nextRole:"accountant",         label:"Program Manager"      },
    pending_accountant:          { status:"pending_finance",            nextRole:"finance_manager",     label:"Accountant"           },
    pending_finance:             { status:"pending_executive_director", nextRole:"executive_director",  label:"Senior Accountant"    },
    pending_executive_director:  { status:"approved",                   nextRole:"payment_accountant",  label:"Executive Director"   },
  };

  const next = approver.role === "admin"
    ? adminStageMap[req.status]
    : {
        supervisor:         { status:"pending_accountant",         nextRole:"accountant"        },
        accountant:         { status:"pending_finance",            nextRole:"finance_manager"   },
        finance_manager:    { status:"pending_executive_director", nextRole:"executive_director"},
        executive_director: { status:"approved",                   nextRole:"payment_accountant"},
      }[approver.role];

  const approvalLabel = approver.role === "admin"
    ? `Administrator override (${next?.label || "workflow step"})`
    : ROLE_LABELS[approver.role];

  req.approvals = [
    ...(req.approvals || []).map(a => ({ ...a, role: STAGE_TO_ROLE[a.role] || a.role })),
    { role:approver.role, userId:approver.id, name:approver.name, decision:"approved", at:ts(), stage:req.status, signature:approverSignature },
  ];
  addLog(req.id, approver.id, `Approved by ${approvalLabel}`);
  if (!next) return;

  req.status = next.status;

  if (next.nextRole) {
    const nu = _users.find(u => u.role === next.nextRole);
    if (nu) {
      const msg = next.status === "approved"
        ? `Request APPROVED: "${req.title}" is ready for payment processing.`
        : `New request for review: ${req.title}`;
      addNotif(nu.id, msg, req.id, { page: next.status === "approved" ? "payment_queue" : "pending_approvals" });
    }
  }
  addNotif(req.requesterId, `"${req.title}" approved by ${approvalLabel}`, req.id, { page:"my_requests" });
}
function rejectRequest(req, approver, reason) {
  const approverSignature = getSavedUserSignature(approver);
  const adminStageMap = {
    pending_supervisor: { status:"rejected_supervisor", label:"Program Manager" },
    pending_accountant: { status:"rejected_accountant", label:"Accountant" },
    pending_finance: { status:"rejected_finance", label:"Senior Accountant" },
    pending_executive_director: { status:"rejected_executive_director", label:"Executive Director" },
  };
  const next = approver.role === "admin"
    ? adminStageMap[req.status]
    : { supervisor:{status:"rejected_supervisor"}, accountant:{status:"rejected_accountant"}, finance_manager:{status:"rejected_finance"}, executive_director:{status:"rejected_executive_director"} }[approver.role];
  const rejectionLabel = approver.role === "admin" ? `Administrator override (${next?.label || "workflow step"})` : ROLE_LABELS[approver.role];
  req.approvals = [
    ...(req.approvals||[]).map(a => ({ ...a, role: STAGE_TO_ROLE[a.role] || a.role })),
    { role:approver.role, userId:approver.id, name:approver.name, decision:"rejected", note:reason, at:ts(), stage:req.status, signature:approverSignature },
  ];
  addLog(req.id, approver.id, `Rejected by ${rejectionLabel}`, reason);
  req.status = next?.status || "rejected_finance";
  req.lastRejectionReason = reason;
  addNotif(req.requesterId,`"${req.title}" was rejected: ${reason}`,req.id);
}
// Old payRequest removed – replaced by the new deterministic payRequest above.

// ── Global CSS ────────────────────────────────────────────────────────────────

// ── Accountability workflow functions (new deterministic stages) ───────────────

/**
 * Returns requests that are in the accountability chain and assigned to the
 * given role for review.  All accountability stages are now top-level req.status
 * values – there is no nested accountability sub-object in the new workflow.
 */
function getPendingAccountabilityForRole(role, requests, userId=null) {
  // Admin sees everything in the accountability chain
  if (role === "admin") {
    const statuses = new Set(getAdminManagedAccountabilityStatuses());
    return requests.filter(r => statuses.has(r.status) && !r.isVendorPayment);
  }

  // Requester sees their own requests that need accountability submission / revision
  if (role === "requester" && userId) {
    return requests.filter(r =>
      r.requesterId === userId &&
      !r.isVendorPayment &&
      ["paid", "pending_accountability"].includes(r.status)
    );
  }

  // Reviewers: each role sees the stage assigned to them
  const statusMap = {
    supervisor:         "accountability_submitted",   // Stage 4 → 5
    finance_manager:    "supervisor_approved",         // Stage 5 → 6
    payment_accountant: "senior_accountant_approved", // Stage 6 → 7
  };

  const targetStatus = statusMap[role];
  if (!targetStatus) return [];

  return requests.filter(r => {
    if (r.status !== targetStatus || r.isVendorPayment) return false;
    if (role === "supervisor" && userId) return r.supervisorId === userId;
    return true;
  });
}

/**
 * Stage 4 – Requester submits accountability (structured report + receipts + photos).
 * Moves status from "paid" or "pending_accountability" → "accountability_submitted".
 */
function submitAccountability(req, submitter, form) {
  const isRevision = !!req.accountabilitySubmittedAt;
  const requester  = _users.find(u => u.id === req.requesterId) || submitter;
  const supervisor = getAssignedSupervisor(requester) || getFallbackSupervisor(requester.id);
  const submittedAt = ts();

  req.supervisorId   = supervisor?.id   || req.supervisorId   || null;
  req.supervisorName = supervisor?.name || req.supervisorName || "Unassigned";

  // Persist the structured report template and constrained uploads.
  const normalizedReportData = normalizeAccountabilityReportData({
    ...(form.reportData || {}),
    submissionDate: toDateInputValue(submittedAt),
    requestId: req.id,
    supervisorName: supervisor?.name || form?.reportData?.supervisorName || req.supervisorName || "Unassigned",
    reportWriterSignature: form?.reportData?.reportWriterSignature || getSavedUserSignature(submitter),
    supervisorComments: req.accountabilityReportData?.supervisorComments || form?.reportData?.supervisorComments || "",
    supervisorSignature: req.accountabilityReportData?.supervisorSignature || null,
    supervisorDate: req.accountabilityReportData?.supervisorDate || "",
  }, req, getSavedUserSignature(submitter));
  const accountabilityRefundProof = normalizeStoredUploadList(form.refundProof || form.accountabilityRefundProof || []);
  const accountabilityFinanceSummary = createAccountabilityFinancialData(req, normalizedReportData.financials);
  req.accountabilityReportData = normalizedReportData;
  req.accountabilityFinanceSummary = accountabilityFinanceSummary;
  req.accountabilityReceipts = normalizeStoredUploadList(form.receipts || form.accountabilityReceipts || []);
  req.accountabilityPhotos = normalizeStoredUploadList(form.photos || form.accountabilityPhotos || []);
  req.accountabilityRefundProof = accountabilityRefundProof;
  req.accountabilityRefundStatus = accountabilityFinanceSummary.totals.status === "OVERALL UNDERSPENT"
    ? (accountabilityRefundProof.length ? "PROOF_ATTACHED" : "PENDING_PROOF")
    : "NOT_REQUIRED";
  req.accountabilityReport = null;
  req.accountabilitySubmittedAt     = submittedAt;
  req.accountabilitySubmittedById   = submitter.id;
  req.accountabilitySubmittedByName = submitter.name;

  // Clear any previous rejection data
  req.accountabilityRejectionReason = null;
  req.accountabilityRejectedBy      = null;
  req.accountabilityRejectedByRole  = null;
  req.accountabilityRejectedAt      = null;
  req.accountabilityStatus          = "PENDING";

  req.status = "accountability_submitted";

  addLog(req.id, submitter.id, isRevision ? "Accountability revised and resubmitted" : "Accountability submitted");

  if (req.supervisorId) {
    addNotif(
      req.supervisorId,
      `Accountability submitted for review: "${req.title}" by ${submitter.name}`,
      req.id,
      { page:"pending_approvals" }
    );
  }
}

/**
 * Approve accountability at the current stage.
 * Stages: accountability_submitted → supervisor_approved → senior_accountant_approved → completed
 */
function approveAccountability(req, approver) {
  const approverSig = getSavedUserSignature(approver);
  const now         = ts();
  const currentStatus = req.status;

  req.approvals = [
    ...(req.approvals || []),
    { role:approver.role, userId:approver.id, name:approver.name, decision:"approved", at:now, stage:currentStatus, signature:approverSig },
  ];

  if (currentStatus === "accountability_submitted" && ["supervisor", "admin"].includes(approver.role)) {
    req.accountabilityReportData = normalizeAccountabilityReportData({
      ...(req.accountabilityReportData || {}),
      supervisorName: approver.name,
      supervisorSignature: approverSig,
      supervisorDate: toDateInputValue(now),
    }, req);
  }

  // Determine next stage
  const adminStageMap = {
    accountability_submitted:   { nextStatus:"supervisor_approved",        nextRole:"finance_manager",     label:"Program Manager" },
    supervisor_approved:        { nextStatus:"senior_accountant_approved",  nextRole:"payment_accountant",  label:"Senior Accountant" },
    senior_accountant_approved: { nextStatus:"completed",                   nextRole:null,                  label:"Payment Officer" },
  };

  const roleMap = {
    supervisor:         { nextStatus:"supervisor_approved",        nextRole:"finance_manager"    },
    finance_manager:    { nextStatus:"senior_accountant_approved",  nextRole:"payment_accountant" },
    payment_accountant: { nextStatus:"completed",                   nextRole:null                 },
  };

  const next = approver.role === "admin" ? adminStageMap[currentStatus] : roleMap[approver.role];
  if (!next) return;

  const approvalLabel = approver.role === "admin"
    ? `Administrator override (${next.label || "workflow step"})`
    : ROLE_LABELS[approver.role];

  addLog(req.id, approver.id, `Accountability approved by ${approvalLabel}`);

  req.status = next.nextStatus;

  if (next.nextStatus === "completed") {
    // Stage 7 – close the request
    req.accountabilityStatus = "CLEARED";
    req.completedAt           = now;
    req.completedById         = approver.id;
    req.completedByName       = approver.name;
    addLog(req.id, approver.id, "Request completed and closed");
    addNotif(
      req.requesterId,
      `Your accountability for "${req.title}" has been approved and the request is now COMPLETED.`,
      req.id,
      { page:"my_requests" }
    );
    return;
  }

  req.accountabilityStatus = "PENDING";

  if (next.nextRole) {
    const nu = _users.find(u => u.role === next.nextRole);
    if (nu) {
      addNotif(nu.id, `Accountability awaiting your review: "${req.title}"`, req.id, { page:"pending_approvals" });
    }
  }
  addNotif(
    req.requesterId,
    `Accountability approved by ${approvalLabel} for "${req.title}"`,
    req.id,
    { page:"my_requests" }
  );
}

/**
 * Reject accountability at the current stage.
 * Always returns the request to the requester (status → "pending_accountability").
 */
function rejectAccountability(req, approver, reason) {
  const approverSig   = getSavedUserSignature(approver);
  const rejectedAt    = ts();
  const approvalLabel = ROLE_LABELS[approver.role] || approver.role;

  req.approvals = [
    ...(req.approvals || []),
    { role:approver.role, userId:approver.id, name:approver.name, decision:"rejected", note:reason, at:rejectedAt, stage:req.status, signature:approverSig },
  ];

  // Return to requester for revision
  req.status                        = "pending_accountability";
  req.accountabilityRejectionReason = reason;
  req.accountabilityRejectedBy      = approver.name;
  req.accountabilityRejectedByRole  = approver.role;
  req.accountabilityRejectedAt      = rejectedAt;
  req.accountabilityStatus          = "PENDING";

  addLog(req.id, approver.id, `Accountability rejected by ${approvalLabel}`, reason);
  addNotif(
    req.requesterId,
    `Accountability rejected by ${approvalLabel} for "${req.title}". Reason: ${reason}`,
    req.id,
    { page:"my_requests" }
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#0f2744;--navy-mid:#1a3a6b;--navy-light:#2d5a9e;--navy-pale:#e8eef8;
  --amber:#f59e0b;--amber-dk:#d97706;--amber-pale:#fef3c7;
  --white:#ffffff;--off:#f8f7f4;
  --g50:#f9fafb;--g100:#f3f4f6;--g200:#e5e7eb;--g300:#d1d5db;--g400:#9ca3af;--g500:#6b7280;--g600:#4b5563;--g700:#374151;--g800:#1f2937;
  --green:#10b981;--green-lt:#d1fae5;--red:#ef4444;--red-lt:#fee2e2;--blue:#3b82f6;--blue-lt:#dbeafe;
  --purple:#7c3aed;--purple-lt:#ede9fe;
  --sh-sm:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.05);
  --sh:0 4px 14px rgba(0,0,0,.09),0 2px 6px rgba(0,0,0,.06);
  --sh-lg:0 12px 32px rgba(0,0,0,.14),0 4px 12px rgba(0,0,0,.08);
  --r:12px;--r-sm:8px;--r-xs:5px;
  --serif:'Roboto',system-ui,sans-serif;--sans:'Roboto',system-ui,sans-serif;
  --sw:260px;--sw-collapsed:72px;--th:64px;
}
html,body{height:100%;font-family:var(--sans);background:var(--off);color:var(--g800);font-size:14px;line-height:1.6}

/* â"€â"€ Layout â"€â"€ */
.layout{display:flex;min-height:100vh}
.sidebar{width:var(--sw);min-height:100vh;background:linear-gradient(180deg,#0c2039 0%,#102947 48%,#163459 100%);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100;transition:width .28s cubic-bezier(.4,0,.2,1),transform .25s;box-shadow:18px 0 42px rgba(15,39,68,.14);overflow:hidden}
.sidebar::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at top right,rgba(245,158,11,.18) 0%,transparent 28%),radial-gradient(circle at 20% 80%,rgba(125,211,252,.12) 0%,transparent 34%);pointer-events:none}
.sidebar-logo{padding:18px 18px 16px;margin:16px 14px 6px;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:rgba(255,255,255,.06);backdrop-filter:blur(10px);display:flex;align-items:center;gap:12px;position:relative;z-index:1}
.logo-mark{width:54px;height:54px;background:linear-gradient(145deg,#ffffff 0%,#f7fbff 100%);border-radius:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:7px;box-shadow:0 10px 24px rgba(7,16,31,.18)}
.logo-mark img{width:100%;height:100%;object-fit:contain}
.logo-text{color:#fff;font-family:var(--serif);font-size:17px;line-height:1.1;font-weight:800;letter-spacing:.02em}
.logo-sub{color:rgba(255,255,255,.62);font-size:10.5px;font-family:var(--sans);margin-top:3px}
.nav-sec{padding:18px 22px 8px;color:rgba(226,232,240,.55);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;position:relative;z-index:1}
.nav-item{display:flex;align-items:center;gap:12px;padding:11px 14px;margin:0 14px 8px;border-radius:999px;color:#0f2744;font-size:13px;font-weight:700;cursor:pointer;transition:all .22s ease;user-select:none;position:relative;border:1px solid rgba(15,39,68,.08);background:#fff;box-shadow:0 10px 22px rgba(12,32,57,.12);z-index:1}
.nav-item:hover{background:#fff;border-color:rgba(15,39,68,.14);color:#0f2744;transform:translateX(4px);box-shadow:0 16px 30px rgba(12,32,57,.18)}
.nav-item.active{background:#fff;color:#0f2744;border-color:rgba(245,158,11,.34);box-shadow:0 14px 28px rgba(12,32,57,.18)}
.nav-item.active::before{content:"";position:absolute;left:10px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.12)}
.nav-item.active .nav-icon .app-ui-icon-badge{transform:scale(1.04);box-shadow:0 14px 24px var(--icon-shadow),0 0 0 5px rgba(245,158,11,.12)}
.nav-icon{width:34px;height:34px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.nav-badge{margin-left:auto;background:linear-gradient(135deg,#fcd34d 0%,#f59e0b 100%);color:#0f2744;border-radius:999px;font-size:10px;font-weight:800;padding:3px 8px;min-width:24px;text-align:center;box-shadow:0 8px 18px rgba(245,158,11,.28)}
.sidebar-footer{margin-top:auto;padding:14px;position:relative;z-index:1}
.user-chip{display:flex;align-items:center;gap:10px;padding:12px 13px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);border-radius:22px;transition:all .18s ease;backdrop-filter:blur(10px)}
.user-chip:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.12)}
.user-chip-copy{flex:1;min-width:0}
.u-name{color:#fff;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.u-role{color:rgba(226,232,240,.68);font-size:11px}
.sidebar-logout-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;flex-shrink:0;box-shadow:0 10px 22px rgba(7,16,31,.18);transition:transform .18s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease}
.sidebar-logout-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.24);box-shadow:0 14px 26px rgba(7,16,31,.22)}
.sidebar-logout-btn .app-ui-icon-badge{width:24px !important;height:24px !important;border-radius:10px;box-shadow:0 6px 12px var(--icon-shadow,rgba(15,39,68,.16))}
.sidebar-logout-btn .app-ui-icon-badge::after{border-radius:9px}
.sidebar-logout-btn .app-ui-icon-gloss{border-radius:8px}
.sidebar-logout-label{font-size:12px;font-weight:700;line-height:1}
.main{margin-left:var(--sw);flex:1;display:flex;flex-direction:column;min-height:100vh;transition:margin-left .28s cubic-bezier(.4,0,.2,1)}
.topbar{height:var(--th);background:#fff;border-bottom:1px solid var(--g200);display:flex;align-items:center;padding:0 28px;gap:16px;position:sticky;top:0;z-index:50;box-shadow:0 1px 0 var(--g100)}
.topbar-title{font-family:var(--serif);font-size:21px;color:var(--navy);flex:1}
.topbar-title-wrap{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.topbar-back-btn{display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--g200);border-radius:999px;background:#fff;color:var(--navy);font-weight:700;font-size:12px;cursor:pointer;box-shadow:var(--sh-sm);transition:transform .18s,box-shadow .18s,border-color .18s}
.topbar-back-btn:hover{transform:translateY(-1px);box-shadow:var(--sh)}
.topbar-back-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}
.topbar-actions{display:flex;align-items:center;gap:10px}
.notif-btn{width:44px;height:44px;border-radius:50%;background:var(--g100);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;transition:background .14s;font-size:16px}
.notif-btn:hover{background:var(--g200)}
.notif-dot{position:absolute;top:7px;right:7px;width:8px;height:8px;background:var(--red);border-radius:50%;border:2px solid #fff}
.page{padding:28px;flex:1}
.page-header{margin-bottom:26px}
.page-title{font-family:var(--serif);font-size:26px;color:var(--navy);margin-bottom:3px}
.page-sub{color:var(--g500);font-size:13px}

/* â"€â"€ Avatar â"€â"€ */
.avatar{width:32px;height:32px;border-radius:50%;background:var(--amber);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--navy);flex-shrink:0}
.avatar.lg{width:44px;height:44px;font-size:14px}
.avatar.xl{width:56px;height:56px;font-size:17px}

/* â"€â"€ Cards â"€â"€ */
.card{background:#fff;border-radius:var(--r);border:1px solid var(--g200);box-shadow:var(--sh-sm);overflow:hidden}
.card-header{padding:18px 22px;border-bottom:1px solid var(--g100);display:flex;align-items:center;justify-content:space-between}
.card-title{font-family:var(--serif);font-size:16px;color:var(--navy)}
.card-body{padding:22px}

/* â"€â"€ Stats â"€â"€ */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-bottom:22px}
.stat-card{background:#fff;border-radius:var(--r);border:1px solid var(--g200);padding:18px;display:flex;flex-direction:column;gap:10px;transition:box-shadow .2s,transform .2s}
.stat-card:hover{box-shadow:var(--sh);transform:translateY(-2px)}
.stat-icon{width:48px;height:48px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:19px}
.stat-val{font-family:var(--serif);font-size:30px;color:var(--navy);line-height:1}
.stat-label{font-size:12px;color:var(--g500);font-weight:500}
.stat-trend{font-size:11px;color:var(--g400);margin-top:2px}
.dashboard-stats-grid{grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px;max-width:640px}
.dashboard-stats-grid .stat-card{padding:10px 8px;gap:6px;align-items:center;text-align:center;border-radius:18px}
.dashboard-stats-grid .stat-icon{width:34px;height:34px;border-radius:12px;font-size:14px}
.dashboard-stats-grid .stat-val{font-size:20px}
.dashboard-stats-grid .stat-label{font-size:10.5px}
.dashboard-modules{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:24px}
.module-card{appearance:none;width:100%;border:1px solid var(--module-border,rgba(15,39,68,.1));background:var(--module-bg,linear-gradient(145deg,#fff 0%,#f9fafb 100%));border-radius:22px;padding:9px;cursor:pointer;text-align:center;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;min-height:78px;box-shadow:0 12px 26px rgba(15,39,68,.08);transition:transform .28s ease,box-shadow .28s ease,border-color .28s ease}
.module-card:hover{transform:translateY(-5px);box-shadow:0 18px 32px rgba(15,39,68,.14);border-color:var(--module-accent,rgba(15,39,68,.22))}
.module-card:active{transform:translateY(-1px) scale(.985);box-shadow:0 10px 20px rgba(15,39,68,.12)}
.module-card-top{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0}
.module-card-icon{width:40px;height:40px;border-radius:14px;background:transparent;color:var(--module-icon-color,var(--navy));display:flex;align-items:center;justify-content:center;font-size:15px}
.module-card-copy{display:flex;flex-direction:column;align-items:center;gap:2px}
.module-card-title{font-family:var(--serif);font-size:14px;line-height:1.15;color:var(--navy);font-weight:800}
.module-card-sub{font-size:10.5px;line-height:1.3;color:var(--g600);text-align:center}
.module-card-meta{display:inline-flex;align-self:center;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.55);font-size:9.5px;font-weight:700;letter-spacing:.03em;color:var(--module-accent,var(--navy));backdrop-filter:blur(6px)}

/* â"€â"€ Buttons â"€â"€ */
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:var(--r-sm);font-family:var(--sans);font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .14s;white-space:nowrap;text-decoration:none}
.btn-primary{background:var(--navy);color:#fff}
.btn-primary:hover{background:var(--navy-mid)}
.btn-amber{background:var(--amber);color:var(--navy)}
.btn-amber:hover{background:var(--amber-dk);transform:translateY(-1px)}
.btn-green{background:var(--green);color:#fff}
.btn-green:hover{background:#059669}
.btn-red{background:var(--red);color:#fff}
.app-ui-icon-badge{position:relative;display:inline-flex;align-items:center;justify-content:center;border-radius:16px;background:linear-gradient(180deg,var(--icon-start,#173a68) 0%,var(--icon-end,#0f2744) 100%);color:#fff;box-shadow:0 10px 18px var(--icon-shadow,rgba(15,39,68,.18));overflow:hidden;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}
.app-ui-icon-badge::after{content:"";position:absolute;inset:1px;border-radius:15px;background:linear-gradient(180deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 42%,rgba(7,16,31,.08) 100%);pointer-events:none}
.app-ui-icon-gloss{position:absolute;top:2px;left:3px;right:3px;height:42%;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.34),rgba(255,255,255,0));pointer-events:none}
.app-ui-icon{position:relative;z-index:1}
.nav-item:hover .app-ui-icon-badge,.module-card:hover .app-ui-icon-badge,.btn:hover .app-ui-icon-badge,.topbar-back-btn:hover .app-ui-icon-badge,.stat-card:hover .app-ui-icon-badge{transform:translateY(-1px) scale(1.04);box-shadow:0 14px 24px var(--icon-shadow,rgba(15,39,68,.18)),0 0 0 6px var(--icon-glow,rgba(59,130,246,.12))}
.btn .app-ui-icon-badge{width:28px !important;height:28px !important;border-radius:12px;box-shadow:0 8px 14px var(--icon-shadow,rgba(15,39,68,.16))}
.btn .app-ui-icon-badge::after{border-radius:11px}
.btn .app-ui-icon-gloss{border-radius:10px}
.topbar-back-btn .app-ui-icon-badge{width:26px !important;height:26px !important;border-radius:10px;box-shadow:0 6px 12px var(--icon-shadow,rgba(15,39,68,.16))}
.btn-red:hover{background:#dc2626}
.btn-ghost{background:transparent;color:var(--g600);border:1.5px solid var(--g200)}
.btn-ghost:hover{background:var(--g50);border-color:var(--g300);color:var(--g800)}
.btn-navy-ghost{background:transparent;color:var(--navy);border:1.5px solid var(--navy-pale)}
.btn-navy-ghost:hover{background:var(--navy-pale)}
.btn-sm{padding:6px 13px;font-size:12px}
.btn-lg{padding:12px 26px;font-size:14.5px}
.btn:disabled{opacity:.45;cursor:not-allowed;pointer-events:none}

/* â"€â"€ Status badge â"€â"€ */
.sbadge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11.5px;font-weight:600}
.sdot{width:6px;height:6px;border-radius:50%;flex-shrink:0}

/* â"€â"€ Priority tag â"€â"€ */
.ptag{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}

/* â"€â"€ Table â"€â"€ */
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{padding:10px 15px;text-align:left;font-size:10.5px;font-weight:700;color:var(--g500);text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--g200);background:var(--g50)}
td{padding:13px 15px;border-bottom:1px solid var(--g100);font-size:13px;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--g50)}
.clickable{cursor:pointer}

/* â"€â"€ Forms â"€â"€ */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.form-group{display:flex;flex-direction:column;gap:5px}
.form-group.full{grid-column:1/-1}
label{font-size:12px;font-weight:600;color:var(--g700);letter-spacing:.01em}
input,select,textarea{padding:10px 13px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:var(--sans);font-size:13.5px;color:var(--g800);background:#fff;transition:border-color .15s,box-shadow .15s;outline:none;width:100%}
input:focus,select:focus,textarea:focus{border-color:var(--navy-light);box-shadow:0 0 0 3px rgba(45,90,158,.1)}
input::placeholder,textarea::placeholder{color:var(--g400)}
textarea{resize:vertical;min-height:88px}
.field-hint{font-size:11.5px;color:var(--g400)}
.field-error{font-size:11.5px;color:var(--red);font-weight:500}
.form-section{background:var(--g50);border-radius:var(--r-sm);padding:18px 20px;margin-bottom:14px;border:1px solid var(--g200)}
.form-section-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--g500);margin-bottom:14px;display:flex;align-items:center;gap:7px}
.new-request-page{max-width:1120px;margin:0 auto;overflow-x:hidden}
.new-request-card{overflow:hidden}
.new-request-card .card-body{padding:20px;overflow-x:hidden}
.new-request-form{width:100%;max-width:100%;overflow-x:hidden}
.new-request-form .form-section{overflow:hidden}
.new-request-form .table-wrap{width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding-bottom:4px}
.new-request-form table{min-width:0}
.new-request-form td,.new-request-form th{white-space:normal}
.new-request-budget-wrap{overflow-x:visible}
.new-request-budget-table td[data-label]{position:relative}
.section3-stack{display:grid;gap:14px}
.section3-card{background:#fff;border:1px solid var(--g200);border-radius:14px;padding:14px}
.section3-card-title{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--g500);margin-bottom:10px}
.section3-card .form-group:last-child{margin-bottom:0}
.section3-card textarea{min-height:120px}
.section3-card.compact textarea{min-height:96px}

/* â"€â"€ Modal â"€â"€ */
.overlay{position:fixed;inset:0;background:rgba(15,39,68,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadein .15s ease}
.modal{background:#fff;border-radius:var(--r);box-shadow:var(--sh-lg);width:100%;max-width:560px;max-height:90vh;overflow-y:auto;animation:slideup .2s ease}
.modal-lg{max-width:780px}
.modal-header{padding:18px 22px;border-bottom:1px solid var(--g100);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:10}
.modal-title{font-family:var(--serif);font-size:18px;color:var(--navy)}
.modal-close{width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:50%;color:var(--g400);font-size:17px;transition:all .14s}
.modal-close:hover{background:var(--g100);color:var(--g700)}
.modal-body{padding:22px}
.modal-footer{padding:15px 22px;border-top:1px solid var(--g100);display:flex;justify-content:flex-end;gap:10px}
/* ── Print / PDF – multi-page fix ── */
@media print{
  @page{size:A4 portrait;margin:15mm}
  body *{visibility:hidden}
  .overlay,.modal,.modal-body,.pdf-doc,.pdf-doc *{visibility:visible}
  .overlay{position:static!important;background:none!important;padding:0!important;display:block!important;animation:none!important;height:auto!important;min-height:0!important}
  .modal{position:static!important;max-width:100%!important;max-height:none!important;height:auto!important;overflow:visible!important;box-shadow:none!important;border-radius:0!important;animation:none!important;width:100%!important}
  .modal-header,.modal-footer,.modal-close,.btn,.print-hide{display:none!important}
  .modal-body{padding:0!important;overflow:visible!important;max-height:none!important;height:auto!important}
  .pdf-doc{max-width:100%!important;padding:0!important;box-shadow:none!important;border-radius:0!important;margin:0!important;overflow:visible!important;height:auto!important}
  /* Nothing breaks mid-element — content stays intact, pages add as needed */
  .pdf-sec,.pdf-sig-box,.pdf-row,.pdf-field,.pending-card,.pending-card-body,table,tr,td,th{page-break-inside:avoid!important;break-inside:avoid!important}
  .pdf-sec-title{page-break-after:avoid;break-after:avoid}
  .paid-stamp{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@keyframes fadein{from{opacity:0}to{opacity:1}}
@keyframes slideup{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}

/* ── HR Org Structure ── */
.org-tabs{display:flex;gap:0;border-bottom:2px solid var(--g200);margin-bottom:22px}
.org-tab{padding:10px 20px;font-size:13px;font-weight:600;color:var(--g500);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s}
.org-tab.active{color:var(--navy);border-bottom-color:var(--navy)}
.org-tab:hover:not(.active){color:var(--g700)}
.org-dept-section{margin-bottom:20px}
.org-dept-header{display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:var(--r) var(--r) 0 0;color:#fff;position:relative}
.org-dept-code{font-size:10px;font-weight:800;letter-spacing:.1em;opacity:.75;text-transform:uppercase}
.org-dept-name{font-family:var(--serif);font-size:16px;font-weight:800}
.org-dept-count{margin-left:auto;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700}
.org-dept-body{border:1px solid var(--g200);border-top:none;border-radius:0 0 var(--r) var(--r);overflow:hidden}
.org-pos-group{border-bottom:1px solid var(--g100)}
.org-pos-group:last-child{border-bottom:none}
.org-pos-label{padding:8px 18px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--g400);background:var(--g50);border-bottom:1px solid var(--g100)}
.org-emp-row{display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid var(--g100);background:#fff;transition:background .12s}
.org-emp-row:hover{background:var(--g50)}
.org-emp-row:last-child{border-bottom:none}
.org-emp-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
.org-emp-name{font-weight:600;font-size:13px;color:var(--navy)}
.org-emp-meta{font-size:11.5px;color:var(--g500)}
.org-emp-badge{margin-left:auto;flex-shrink:0}
.org-tree-root{padding:4px 0}
.org-tree-node{display:flex;flex-direction:column}
.org-tree-row{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:var(--r-sm);margin-bottom:3px;background:#fff;border:1px solid var(--g200);box-shadow:var(--sh-sm);transition:box-shadow .14s}
.org-tree-row:hover{box-shadow:var(--sh)}
.org-tree-children{border-left:2px solid var(--g200);margin-left:28px;padding-left:16px;margin-top:4px;margin-bottom:8px}
.org-empty-state{text-align:center;padding:48px 24px;color:var(--g400);font-size:13px}
.hr-pos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.hr-pos-card{background:#fff;border:1px solid var(--g200);border-radius:var(--r-sm);padding:16px;box-shadow:var(--sh-sm);display:flex;flex-direction:column;gap:6px}
.hr-pos-card-name{font-weight:700;font-size:14px;color:var(--navy)}
.hr-pos-card-dept{font-size:11.5px;color:var(--g500)}
.hr-dept-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.hr-dept-card{border-radius:var(--r);overflow:hidden;box-shadow:var(--sh-sm);border:1px solid var(--g200)}
.hr-dept-card-top{padding:18px 20px;color:#fff;position:relative;overflow:hidden}
.hr-dept-card-top::after{content:'';position:absolute;right:-16px;top:-16px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.1)}
.hr-dept-card-code{font-size:10px;font-weight:800;letter-spacing:.12em;opacity:.75;text-transform:uppercase;margin-bottom:2px}
.hr-dept-card-name{font-family:var(--serif);font-size:17px;font-weight:800}
.hr-dept-card-body{background:#fff;padding:14px 20px;display:flex;flex-direction:column;gap:8px}
.hr-dept-card-desc{font-size:12px;color:var(--g500);line-height:1.5}
.hr-dept-card-stats{display:flex;gap:14px}
.hr-dept-stat{display:flex;flex-direction:column}
.hr-dept-stat-val{font-size:18px;font-weight:800;color:var(--navy);font-family:var(--serif);line-height:1}
.hr-dept-stat-label{font-size:10.5px;color:var(--g400)}
.hr-dept-card-actions{display:flex;gap:8px;padding:12px 20px;border-top:1px solid var(--g100);background:var(--g50)}

/* ── HR Module ── */
.hr-home-banner{background:linear-gradient(135deg,#0c4a6e 0%,#0e7490 60%,#0891b2 100%);border-radius:var(--r);padding:32px 36px;color:#fff;margin-bottom:22px;position:relative;overflow:hidden}
.hr-home-banner::after{content:'';position:absolute;right:-30px;top:-30px;width:220px;height:220px;background:rgba(255,255,255,.06);border-radius:50%}
.hr-home-banner::before{content:'';position:absolute;left:40%;bottom:-60px;width:180px;height:180px;background:rgba(255,255,255,.04);border-radius:50%}
.hr-banner-title{font-family:var(--serif);font-size:24px;font-weight:800;margin-bottom:6px;position:relative;z-index:1}
.hr-banner-sub{font-size:13px;color:rgba(255,255,255,.78);position:relative;z-index:1;margin-bottom:20px}
.hr-banner-stats{display:flex;gap:28px;position:relative;z-index:1}
.hr-banner-stat{display:flex;flex-direction:column}
.hr-banner-stat-val{font-size:26px;font-weight:800;font-family:var(--serif);line-height:1}
.hr-banner-stat-label{font-size:11px;color:rgba(255,255,255,.65);margin-top:2px}
.hr-module-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:22px}
.hr-profile-header{background:linear-gradient(135deg,#0c4a6e 0%,#0891b2 100%);border-radius:var(--r) var(--r) 0 0;padding:28px 28px 24px;color:#fff;display:flex;align-items:center;gap:20px}
.hr-profile-avatar{width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;flex-shrink:0;border:3px solid rgba(255,255,255,.4)}
.hr-profile-name{font-family:var(--serif);font-size:22px;font-weight:800;margin-bottom:3px}
.hr-profile-title{font-size:13px;color:rgba(255,255,255,.75)}
.hr-profile-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;margin-top:8px}
.hr-profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
.hr-profile-field{padding:14px 22px;border-bottom:1px solid var(--g100)}
.hr-profile-field:nth-child(odd){border-right:1px solid var(--g100)}
.hr-profile-label{font-size:11px;color:var(--g400);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.hr-profile-value{font-size:13.5px;color:var(--g800);font-weight:500}
@media(max-width:600px){.hr-profile-grid{grid-template-columns:1fr}.hr-profile-field:nth-child(odd){border-right:none}}
.leave-balance-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:12px;margin-bottom:24px}
.leave-balance-card{background:#fff;border:1px solid var(--g100);border-radius:10px;padding:14px 16px;box-shadow:var(--sh-sm)}
.leave-balance-card .lb-type{font-size:10px;font-weight:800;color:var(--g400);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
.leave-balance-card .lb-val{font-family:var(--serif);font-size:26px;font-weight:800;line-height:1;margin-bottom:2px}
.leave-balance-card .lb-sub{font-size:11px;color:var(--g400);margin-bottom:8px}
.leave-balance-card .lb-bar{height:4px;background:var(--g100);border-radius:2px;overflow:hidden}
.leave-balance-card .lb-bar-fill{height:100%;border-radius:2px;transition:width .3s}
.leave-apply-days{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;border-radius:8px;margin:4px 0 8px}
.leave-apply-days.ok{background:#d1fae5;border:1px solid #6ee7b7}
.leave-apply-days.over{background:#fee2e2;border:1px solid #fca5a5}
/* Staff File */
.staff-file-tabs{display:flex;gap:0;border-bottom:2px solid var(--g100);margin-bottom:0;padding:0 22px;background:#fff;position:sticky;top:0;z-index:5}
.staff-file-tab{padding:12px 18px;font-size:13px;font-weight:600;color:var(--g400);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;white-space:nowrap}
.staff-file-tab:hover{color:var(--navy)}
.staff-file-tab.active{color:var(--navy);border-bottom-color:var(--amber);font-weight:800}
.staff-file-section{padding:0}
.doc-card{display:flex;align-items:center;gap:14px;padding:12px 16px;border:1px solid var(--g100);border-radius:8px;background:#fff;margin-bottom:8px;transition:box-shadow .15s}
.doc-card:hover{box-shadow:var(--sh-sm)}
.doc-icon{width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.doc-upload-zone{border:2px dashed var(--g200);border-radius:10px;padding:28px;text-align:center;background:var(--g50);transition:all .15s;cursor:pointer}
.doc-upload-zone:hover{border-color:var(--amber);background:#fffbeb}

/* -- Login -- */
@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.login-screen{min-height:100vh;display:flex;overflow:hidden;background:#0a1e3d}
.login-left{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:64px 56px;position:relative;overflow:hidden}
.login-left-bg{position:absolute;inset:0;background-image:url('https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=1400&q=80');background-size:cover;background-position:center}
.login-left-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(10,30,61,.9) 0%,rgba(15,39,68,.78) 50%,rgba(22,46,82,.85) 100%)}
.login-left-content{position:relative;z-index:1;color:#fff;display:flex;flex-direction:column;align-items:center;text-align:center}
.login-left-logo{width:110px;height:110px;background:#fff;border-radius:22px;display:flex;align-items:center;justify-content:center;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,.28);border:2px solid rgba(255,255,255,.5);margin-bottom:20px}
.login-left-logo img{width:100%;height:100%;object-fit:contain}
.login-left-appname{font-family:'Roboto',system-ui,sans-serif;font-size:22px;font-weight:800;line-height:1.2;margin-bottom:6px;letter-spacing:.03em;text-transform:uppercase}
.login-left-erp{font-family:'Roboto',system-ui,sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,.75);letter-spacing:.04em;margin-bottom:28px}
.login-left-vision-label{font-family:'Roboto',system-ui,sans-serif;font-size:17px;font-weight:700;color:#fff;margin-bottom:10px;letter-spacing:.01em}
.login-left-tagline{font-family:'Roboto',system-ui,sans-serif;font-size:14px;font-weight:300;color:rgba(255,255,255,.78);line-height:1.75;max-width:340px}
.login-left-dots{display:flex;gap:8px;margin-top:48px}
.login-left-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.28)}
.login-left-dot.active{background:#f59e0b;width:26px;border-radius:4px}
.login-right{width:480px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#fff;padding:48px 44px}
.login-card{width:100%;max-width:370px;animation:fadeInUp .5s cubic-bezier(.22,.68,0,1.15) both}
.login-logo-mark{width:52px;height:52px;background:#fff;border-radius:14px;display:flex;align-items:center;justify-content:center;padding:6px;box-shadow:var(--sh-sm);border:1px solid var(--g100);margin-bottom:22px}
.login-logo-mark img{width:100%;height:100%;object-fit:contain}
.login-heading{font-family:var(--serif);font-size:26px;color:var(--navy);margin-bottom:5px;font-weight:800}
.login-sub-text{font-size:13px;color:var(--g500);margin-bottom:26px}
.login-input-wrap{position:relative;display:flex;align-items:center}
.login-input-icon{position:absolute;left:13px;color:var(--g400);display:flex;align-items:center;pointer-events:none;z-index:1}
.login-input-wrap input{padding-left:38px !important}
.login-input-eye{position:absolute;right:11px;background:none;border:none;cursor:pointer;color:var(--g400);display:flex;align-items:center;padding:4px;border-radius:4px;transition:color .14s}
.login-input-eye:hover{color:var(--navy)}
.login-extras{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;margin-top:4px}
.login-remember{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--g600);cursor:pointer;user-select:none}
.login-remember input[type=checkbox]{width:15px;height:15px;border-radius:4px;accent-color:var(--navy);cursor:pointer;flex-shrink:0}
.login-forgot{font-size:13px;color:var(--navy-light);font-weight:600;cursor:pointer;background:none;border:none;padding:0;transition:color .14s}
.login-forgot:hover{color:var(--navy);text-decoration:underline}
.login-btn{width:100%;padding:13px;border-radius:10px;background:linear-gradient(135deg,var(--navy) 0%,var(--navy-mid) 100%);color:#fff;font-size:14px;font-weight:700;border:none;cursor:pointer;transition:transform .15s,box-shadow .15s,filter .15s;box-shadow:0 4px 14px rgba(15,39,68,.35);letter-spacing:.01em}
.login-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(15,39,68,.45);filter:brightness(1.08)}
.login-btn:active{transform:translateY(0);box-shadow:0 2px 8px rgba(15,39,68,.3)}
.login-demo{background:var(--navy-pale);border-radius:var(--r-sm);padding:12px 14px;font-size:11.5px;color:var(--g600);line-height:1.9;margin-top:16px}
.login-demo strong{color:var(--navy)}
.login-footer{text-align:center;margin-top:24px;font-size:11.5px;color:var(--g400)}
@media(max-width:820px){.login-left{display:none}.login-right{width:100%;padding:32px 24px}.login-card{max-width:420px}}
@media(max-width:400px){.page{padding:12px 8px}.card-body{padding:12px}}

/* â"€â"€ Timeline â"€â"€ */
.timeline{display:flex;flex-direction:column}
.tl-item{display:flex;gap:12px;padding-bottom:20px;position:relative}
.tl-item:last-child{padding-bottom:0}
.tl-dot-wrap{display:flex;flex-direction:column;align-items:center;flex-shrink:0}
.tl-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
.tl-line{width:2px;background:var(--g200);flex:1;margin-top:4px}
.tl-item:last-child .tl-line{display:none}
.tl-content{padding-top:3px;flex:1}
.tl-action{font-weight:600;font-size:13px;color:var(--g800)}
.tl-meta{font-size:11.5px;color:var(--g500);margin-top:2px}
.tl-note{margin-top:6px;padding:8px 11px;background:var(--red-lt);border-radius:var(--r-xs);font-size:12px;color:#991b1b}

/* â"€â"€ Approval chain â"€â"€ */
.chain{display:flex;flex-direction:column;gap:10px}
.chain-step{display:flex;align-items:flex-start;gap:13px;padding:13px 15px;background:var(--g50);border-radius:var(--r-sm);border:1.5px solid var(--g200);transition:all .2s}
.chain-step.done{border-color:var(--green);background:var(--green-lt)}
.chain-step.rejected{border-color:var(--red);background:var(--red-lt)}
.chain-step.active{border-color:var(--amber);background:var(--amber-pale)}
.sig-box{flex:1}
.sig-name{font-weight:600;font-size:13px;color:var(--g800);font-family:var(--serif);font-style:italic}
.sig-role{font-size:12px;color:var(--g500);margin-bottom:2px}
.sig-ts{font-size:11px;color:var(--g400);margin-top:3px}

/* â"€â"€ Filters â"€â"€ */
.filters{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
.filters input.f-input{flex:1 1 180px;min-width:0;max-width:280px}
.f-input{padding:8px 13px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-size:13px;color:var(--g700);outline:none;background:#fff}
.f-input:focus{border-color:var(--navy-light)}
.chip{padding:6px 13px;border-radius:20px;border:1.5px solid var(--g200);font-size:12px;font-weight:600;cursor:pointer;background:#fff;color:var(--g600);transition:all .12s}
.chip:hover{border-color:var(--g300);color:var(--g800)}
.chip.active{background:var(--navy);color:#fff;border-color:var(--navy)}

/* â"€â"€ Misc â"€â"€ */
.divider{border:none;border-top:1px solid var(--g200);margin:18px 0}
.alert{padding:11px 15px;border-radius:var(--r-sm);font-size:13px;margin-bottom:14px}
.alert-red{background:var(--red-lt);color:#991b1b;border:1px solid #fca5a5}
.alert-amber{background:var(--amber-pale);color:#92400e;border:1px solid #fcd34d}
.alert-green{background:var(--green-lt);color:#065f46;border:1px solid #6ee7b7}
.alert-blue{background:var(--blue-lt);color:#1e40af;border:1px solid #93c5fd}
.ref{font-family:monospace;font-size:11.5px;background:var(--g100);padding:2px 7px;border-radius:4px;color:var(--g600)}
.amount{font-family:var(--serif);font-size:15px;color:var(--navy)}
.empty-state{text-align:center;padding:56px 20px;color:var(--g400)}
.empty-icon{font-size:40px;margin-bottom:10px}
.empty-text{font-size:15px;color:var(--g500);font-family:var(--serif)}
.empty-sub{font-size:12.5px;margin-top:4px}
.flex{display:flex}.items-center{align-items:center}.justify-between{justify-content:space-between}
.gap-2{gap:8px}.gap-3{gap:12px}.gap-4{gap:16px}
.mt-2{margin-top:8px}.mt-3{margin-top:12px}.mt-4{margin-top:16px}.mt-6{margin-top:24px}
.mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}.mb-4{margin-bottom:16px}
.text-sm{font-size:12.5px}.text-xs{font-size:11px}.text-gray{color:var(--g500)}
.text-navy{color:var(--navy)}.font-bold{font-weight:700}.font-serif{font-family:var(--serif)}
.w-full{width:100%}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* â"€â"€ Signature pad â"€â"€ */
.sig-pad-wrap{border:1.5px solid var(--g200);border-radius:var(--r-sm);overflow:hidden}
.sig-tabs{display:flex;border-bottom:1px solid var(--g200)}
.sig-tab{flex:1;padding:9px;font-size:12.5px;font-weight:600;border:none;background:#fff;cursor:pointer;color:var(--g500);transition:all .14s;font-family:var(--sans)}
.sig-tab.active{background:var(--navy);color:#fff}
.sig-typed{width:100%;padding:14px 16px;border:none;outline:none;font-family:'Roboto',system-ui,sans-serif;font-style:italic;font-size:20px;color:var(--navy);background:#fafafa}
.sig-canvas-wrap{position:relative;background:#fafafa}
.sig-canvas{display:block;width:100%;height:110px;cursor:crosshair;touch-action:none}
.sig-clear{position:absolute;top:8px;right:8px}
.sig-preview{padding:12px 16px;font-family:'Roboto',system-ui,sans-serif;font-style:italic;font-size:20px;color:var(--navy);background:#fafafa;min-height:52px;border-top:1px dashed var(--g200)}

/* â"€â"€ File upload â"€â"€ */
.file-drop{border:2px dashed var(--g300);border-radius:var(--r-sm);padding:22px;text-align:center;cursor:pointer;transition:all .15s;background:var(--g50);position:relative}
.file-drop:hover{border-color:var(--navy-light);background:#f0f4ff}
.file-drop.has-file{border-color:var(--green);background:var(--green-lt);border-style:solid}
.file-drop input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.file-info{display:flex;align-items:center;gap:11px;padding:11px 14px;background:var(--g50);border-radius:var(--r-sm);border:1px solid var(--g200)}
.file-icon{width:38px;height:38px;border-radius:var(--r-xs);background:var(--blue-lt);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}

/* â"€â"€ PDF â"€â"€ */
.pdf-doc{background:#fff;max-width:700px;margin:0 auto;padding:48px;border-radius:var(--r-sm);box-shadow:var(--sh);font-size:13px;line-height:1.7}
.pdf-header{border-bottom:3px solid var(--navy);padding-bottom:18px;margin-bottom:22px}
.pdf-logo{font-family:var(--serif);font-size:22px;color:var(--navy)}
.pdf-sec{margin-bottom:18px}
.pdf-sec-title{font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--g500);margin-bottom:8px}
.pdf-row{display:flex;gap:20px}
.pdf-field{flex:1}
.pdf-fl{font-size:10.5px;color:var(--g500);font-weight:600}
.pdf-fv{font-size:13.5px;color:var(--g800)}
.pdf-sig-box{border:1px solid var(--g200);border-radius:var(--r-xs);padding:12px}
.paid-stamp{display:inline-block;border:3px solid var(--green);color:var(--green);font-weight:800;font-size:22px;padding:5px 18px;border-radius:6px;transform:rotate(-8deg);letter-spacing:.1em;opacity:.85}

/* â"€â"€ Admin-specific â"€â"€ */
.admin-header{background:linear-gradient(135deg,var(--navy) 0%,var(--navy-mid) 100%);border-radius:var(--r);padding:28px;margin-bottom:22px;color:#fff;position:relative;overflow:hidden}
.admin-header::after{content:'';position:absolute;right:-40px;top:-40px;width:200px;height:200px;background:rgba(245,158,11,.08);border-radius:50%}
.admin-header-title{font-family:var(--serif);font-size:24px;margin-bottom:4px}
.admin-header-sub{color:rgba(255,255,255,.55);font-size:13px}
.admin-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}
.admin-stat{background:#fff;border-radius:var(--r);border:1px solid var(--g200);padding:18px;display:flex;align-items:center;gap:14px}
.admin-stat-icon{width:46px;height:46px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.admin-stat-val{font-family:var(--serif);font-size:28px;color:var(--navy);line-height:1}
.admin-stat-label{font-size:11.5px;color:var(--g500);font-weight:500;margin-top:2px}
.admin-two-col{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;margin-bottom:18px}
.pipeline-row{display:flex;align-items:center;gap:12px;padding:10px 13px;border-bottom:1px solid var(--g100)}
.pipeline-row:last-child{border-bottom:none}
.pipeline-label{flex:1;font-size:13px;font-weight:500;color:var(--g700)}
.pipeline-count{font-family:var(--serif);font-size:22px;color:var(--navy);min-width:30px;text-align:right}
.pipeline-bar-wrap{width:64px;height:5px;background:var(--g200);border-radius:3px;overflow:hidden}
.pipeline-bar{height:100%;border-radius:3px}
.activity-item{display:flex;align-items:flex-start;gap:11px;padding:11px 0;border-bottom:1px solid var(--g100)}
.activity-item:last-child{border-bottom:none}
.activity-dot{width:8px;height:8px;border-radius:50%;margin-top:6px;flex-shrink:0}
.control-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:24px}
.ctrl-card{background:#fff;border-radius:24px;border:1px solid rgba(15,39,68,.1);padding:0;cursor:pointer;transition:all .15s;display:block}
.ctrl-card:hover{border-color:var(--navy-light);box-shadow:var(--sh);transform:translateY(-2px)}
.ctrl-icon{width:40px;height:40px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.ctrl-label{font-size:13px;font-weight:600;color:var(--navy)}
.ctrl-sub{font-size:11.5px;color:var(--g500)}
.budget-summary-card{margin-top:14px;padding:16px 18px;border:1px solid #fed7aa;border-radius:var(--r-sm);background:linear-gradient(135deg,#fff7ed 0%,#ffffff 100%)}
.budget-summary-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.budget-summary-title{font-size:15px;font-weight:700;color:var(--navy)}
.budget-summary-sub{font-size:12px;color:var(--g500);margin-top:3px}
.budget-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.budget-stat{padding:12px 14px;border-radius:var(--r-sm);background:#fff;border:1px solid var(--g200);display:flex;flex-direction:column;gap:4px}
.budget-stat-label{font-size:11px;color:var(--g500);text-transform:uppercase;letter-spacing:.06em}
.budget-balance-panel{margin-bottom:14px;padding:14px 16px;border-radius:var(--r-sm);border:1px solid #bfdbfe;background:#eff6ff}
.budget-balance-panel.danger{border-color:#fca5a5;background:#fef2f2}
.budget-balance-row{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:4px 0}
.budget-balance-row.total{margin-top:6px;padding-top:10px;border-top:1px solid rgba(15,39,68,.08);font-weight:700}
.budget-project-grid{display:grid;gap:18px}
.budget-project-card .card-header{align-items:flex-start}
.accountability-budget-table{width:100%;border-collapse:separate;border-spacing:0}
.accountability-budget-table thead th{background:#f8fafc;border-bottom:1px solid var(--g200)}
.accountability-budget-table tfoot th{background:#eff6ff;border-top:1px solid #bfdbfe;font-weight:800}
.accountability-budget-row td,.accountability-budget-table th{padding:12px 10px}
.accountability-budget-row.over td{background:#fef2f2}
.accountability-budget-row.under td{background:#fff7ed}
.accountability-budget-row.balanced td{background:#f0fdf4}
.accountability-budget-row.pending td{background:#f8fafc}
.accountability-budget-row td:first-child{border-left:3px solid transparent}
.accountability-budget-row.over td:first-child{border-left-color:#ef4444}
.accountability-budget-row.under td:first-child{border-left-color:#f97316}
.accountability-budget-row.balanced td:first-child{border-left-color:#22c55e}
.accountability-budget-row.pending td:first-child{border-left-color:#94a3b8}
.accountability-budget-table input[readonly],.accountability-budget-table select:disabled{background:#fff;color:var(--g800);opacity:1}
.report-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:18px;margin-bottom:22px;border-bottom:3px solid var(--navy)}
.report-brand{display:flex;align-items:center;gap:14px}
.report-brand img{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:14px;padding:6px;box-shadow:var(--sh-sm)}

/* â"€â"€ Pending cards â"€â"€ */
.pending-card{background:#fff;border-radius:var(--r);border:1px solid var(--g200);border-left:4px solid var(--amber);box-shadow:var(--sh-sm);margin-bottom:12px;overflow:hidden;transition:box-shadow .2s}
.pending-card:hover{box-shadow:var(--sh)}
.pending-card-body{padding:18px 20px}
.pay-card{border-left-color:var(--green)}

/* â"€â"€ Notification item â"€â"€ */
.notif-item{padding:14px 22px;border-bottom:1px solid var(--g100);display:flex;gap:13px;align-items:flex-start;transition:background .12s}
.notif-item:hover{background:var(--g50)}
.notif-item.unread{background:var(--navy-pale)}
.notif-circle{width:36px;height:36px;background:var(--amber-pale);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}

@media(max-width:1100px){
  .dashboard-modules,.control-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
  .new-request-form .form-grid,.new-request-form .grid-2{grid-template-columns:1fr}
  .new-request-budget-wrap{overflow-x:visible}
  .new-request-budget-table,
  .new-request-budget-table thead,
  .new-request-budget-table tbody,
  .new-request-budget-table tr,
  .new-request-budget-table th,
  .new-request-budget-table td{display:block;width:100%}
  .new-request-budget-table thead{display:none}
  .new-request-budget-table tbody{display:grid;gap:12px}
  .new-request-budget-table tr{background:#fff;border:1px solid var(--g200);border-radius:16px;padding:12px;box-shadow:var(--sh-sm)}
  .new-request-budget-table td{border-bottom:none;padding:0;margin-bottom:10px}
  .new-request-budget-table td:last-child{margin-bottom:0}
  .new-request-budget-table td[data-label]::before{content:attr(data-label);display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--g500);margin-bottom:6px}
  .new-request-budget-table td[data-label="Actions"] .btn{width:100%;justify-content:center}
  .accountability-budget-wrap{overflow-x:visible}
  .accountability-budget-table,
  .accountability-budget-table thead,
  .accountability-budget-table tbody,
  .accountability-budget-table tfoot,
  .accountability-budget-table tr,
  .accountability-budget-table th,
  .accountability-budget-table td{display:block;width:100%}
  .accountability-budget-table thead,
  .accountability-budget-table tfoot{display:none}
  .accountability-budget-table tbody{display:grid;gap:12px}
  .accountability-budget-table tr{border:1px solid var(--g200);border-radius:16px;overflow:hidden}
  .accountability-budget-table td{border-bottom:none;padding:10px 12px}
  .accountability-budget-table td[data-label]::before{content:attr(data-label);display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--g500);margin-bottom:6px}
}

.hamburger-btn{display:none;background:none;border:none;cursor:pointer;padding:0;width:44px;height:44px;align-items:center;justify-content:center;border-radius:var(--r-sm);color:var(--g700);flex-shrink:0}
.hamburger-btn:hover{background:var(--g100)}
.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99}

@media(max-width:900px){
  .hamburger-btn{display:flex}
  .sidebar-overlay{display:block}
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0)}
  .main{margin-left:0}
  .page{padding:20px 16px}
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .sig-canvas{height:160px}
}

@media(max-width:768px){
  .hamburger-btn{display:flex}
  .sidebar-overlay{display:block}
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0)}
  .main{margin-left:0}
  .form-grid,.grid-2,.admin-stats,.admin-two-col,.control-cards,.dashboard-modules{grid-template-columns:1fr}
  .stats-grid{grid-template-columns:1fr 1fr}
  .new-request-card .card-body{padding:16px}
  .new-request-form .form-section{padding:16px}
  .btn{min-height:44px;padding:11px 18px}
  .btn-sm{min-height:44px;padding:10px 13px}
  .btn-lg{min-height:44px}
  .nav-item{min-height:44px;padding:12px 14px}
  .topbar-back-btn{min-height:44px;padding:10px 12px}
  .page{padding:16px 12px}
  .page-header{margin-bottom:16px}
  .card-body{padding:16px}
}

/* ── Collapsible Sidebar ── */
.nav-label{flex:1}
.main.sidebar-collapsed{margin-left:var(--sw-collapsed)}
.sidebar.collapsed{width:var(--sw-collapsed)}
.sidebar.collapsed .nav-sec{display:none}
.sidebar.collapsed .nav-label{display:none}
.sidebar.collapsed .nav-badge{display:none}
.sidebar.collapsed .nav-item{justify-content:center;padding:10px;margin:0 8px 6px;border-radius:14px}
.sidebar.collapsed .nav-item:hover{transform:none}
.sidebar.collapsed .nav-item.active::before{left:50%;transform:translate(-50%,-50%)}
.sidebar.collapsed .sidebar-logo{justify-content:center;padding:10px 8px;border-radius:16px;gap:0}
.sidebar.collapsed .sidebar-logo-text{display:none}
.sidebar.collapsed .user-chip{flex-direction:column;align-items:center;justify-content:center;padding:8px 6px;gap:6px}
.sidebar.collapsed .user-chip-copy{display:none}
.sidebar.collapsed .sidebar-logout-btn{width:32px;height:32px;padding:0;border-radius:50%;gap:0;justify-content:center;align-items:center}
.sidebar.collapsed .sidebar-logout-label{display:none}
.sidebar.collapsed .sidebar-toggle-row{justify-content:center}
.sidebar.collapsed .quick-action-label{display:none}
.sidebar.collapsed .quick-action-item{justify-content:center;padding:10px;border-radius:14px}
.sidebar.collapsed .quick-action-item:hover{transform:none}
.sidebar.collapsed .sidebar-divider{margin:4px 8px}
.sidebar.collapsed .quick-actions-wrap .nav-sec{display:none}

/* Restore all styles on mobile so collapsed state is ignored when sidebar slides in */
@media(max-width:900px){
  .sidebar.collapsed{width:var(--sw)}
  .sidebar.collapsed .nav-sec,.sidebar.collapsed .quick-actions-wrap .nav-sec{display:block}
  .sidebar.collapsed .nav-label,.sidebar.collapsed .quick-action-label{display:inline}
  .sidebar.collapsed .nav-badge{display:inline-flex}
  .sidebar.collapsed .nav-item{justify-content:flex-start;padding:11px 14px;margin:0 14px 8px;border-radius:999px}
  .sidebar.collapsed .nav-item:hover{transform:translateX(4px)}
  .sidebar.collapsed .nav-item.active::before{left:10px;transform:translateY(-50%)}
  .sidebar.collapsed .sidebar-logo{justify-content:flex-start;padding:18px 18px 16px;border-radius:24px;gap:12px}
  .sidebar.collapsed .sidebar-logo-text{display:flex}
  .sidebar.collapsed .user-chip{flex-direction:row;align-items:center;justify-content:flex-start;padding:12px 13px;gap:10px}
  .sidebar.collapsed .user-chip-copy{display:flex}
  .sidebar.collapsed .sidebar-logout-btn{width:auto;height:38px;border-radius:999px;padding:0 12px;gap:8px}
  .sidebar.collapsed .sidebar-logout-label{display:inline}
  .sidebar.collapsed .quick-action-item{justify-content:flex-start;padding:9px 12px;border-radius:999px}
  .sidebar.collapsed .quick-action-item:hover{transform:translateX(3px)}
  .sidebar.collapsed .sidebar-divider{margin:4px 14px}
}

/* ── Sidebar Toggle Button ── */
.sidebar-toggle-row{display:flex;align-items:center;justify-content:flex-end;padding:0 16px 8px;position:relative;z-index:1}
.sidebar-toggle-btn{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.7);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .18s,color .18s;flex-shrink:0}
.sidebar-toggle-btn:hover{background:rgba(255,255,255,.2);color:#fff;border-color:rgba(255,255,255,.3)}
@media(max-width:900px){.sidebar-toggle-row{display:none}}

/* ── Quick Actions Section ── */
.quick-actions-wrap{position:relative;z-index:1}
.quick-actions-section{padding:0 14px 4px}
.quick-action-item{display:flex;align-items:center;gap:10px;padding:9px 12px;margin:0 0 5px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;transition:all .18s ease;border:1px solid rgba(125,211,252,.22);background:rgba(125,211,252,.07);color:#7dd3fc;user-select:none}
.quick-action-item:hover{background:rgba(125,211,252,.14);border-color:rgba(125,211,252,.38);transform:translateX(3px)}
.quick-action-item.active{background:rgba(125,211,252,.19);border-color:rgba(125,211,252,.46)}
.quick-action-label{flex:1}

/* ── Sidebar Divider ── */
.sidebar-divider{height:1px;background:rgba(255,255,255,.08);margin:4px 14px 4px;position:relative;z-index:1}

/* ── Sidebar Home Shortcut ── */
.sidebar-home-link{display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 14px 0;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.6);font-size:11.5px;font-weight:600;cursor:pointer;transition:all .18s ease;position:relative;z-index:1;user-select:none}
.sidebar-home-link:hover{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.18)}
.sidebar-home-link.active{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.18)}
.sidebar.collapsed .sidebar-home-link{margin:6px 8px 0;padding:8px;gap:0;border-radius:12px;justify-content:center}
.sidebar.collapsed .sidebar-home-link-label{display:none}
`;

// â"€â"€ Shared micro-components â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || { label: status, color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" };
  return (
    <span className="sbadge" style={{ background: c.bg, color: c.color }}>
      <span className="sdot" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function PriorityTag({ priority }) {
  const cfg = { low:{ bg:"#d1fae5",color:"#065f46" }, normal:{ bg:"#dbeafe",color:"#1e40af" }, high:{ bg:"#fef3c7",color:"#92400e" }, urgent:{ bg:"#fee2e2",color:"#991b1b" } };
  const c = cfg[priority] || cfg.normal;
  return <span className="ptag" style={{ background: c.bg, color: c.color }}>{priority}</span>;
}

function Avatar({ str, size="" }) {
  return <div className={`avatar ${size}`}>{str}</div>;
}

function Modal({ title, onClose, children, footer, size="", preventOverlayClose=false }) {
  return (
    <div className="overlay" onClick={e => !preventOverlayClose && e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size}`}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <div className="modal-close" onClick={onClose}><AppIcon name="reject" size={16} /></div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// â"€â"€ FormField â€" defined at module level to prevent re-mount on parent re-render â"€â"€
function FormField({ label, error, hint, children, full, style }) {
  return (
    <div className={`form-group${full ? " full" : ""}`} style={style}>
      {label && <label>{label}</label>}
      {children}
      {error && <div className="field-error">{error}</div>}
      {hint  && <div className="field-hint">{hint}</div>}
    </div>
  );
}

const MODULE_CARD_TONES = {
  navy: {
    bg:"linear-gradient(145deg,#eef4fb 0%,#f8fbff 100%)",
    border:"rgba(26,58,107,.14)",
    iconBg:"rgba(15,39,68,.08)",
    iconColor:"#0f2744",
    accent:"#0f2744",
  },
  amber: {
    bg:"linear-gradient(145deg,#fff8eb 0%,#fffdf7 100%)",
    border:"rgba(217,119,6,.16)",
    iconBg:"rgba(245,158,11,.14)",
    iconColor:"#b45309",
    accent:"#b45309",
  },
  teal: {
    bg:"linear-gradient(145deg,#edf8f7 0%,#fbfefd 100%)",
    border:"rgba(13,148,136,.16)",
    iconBg:"rgba(20,184,166,.14)",
    iconColor:"#0f766e",
    accent:"#0f766e",
  },
  blue: {
    bg:"linear-gradient(145deg,#eef5ff 0%,#f8fbff 100%)",
    border:"rgba(59,130,246,.14)",
    iconBg:"rgba(59,130,246,.12)",
    iconColor:"#1d4ed8",
    accent:"#1d4ed8",
  },
  rose: {
    bg:"linear-gradient(145deg,#fff1f2 0%,#fffafb 100%)",
    border:"rgba(244,63,94,.14)",
    iconBg:"rgba(244,63,94,.12)",
    iconColor:"#be123c",
    accent:"#be123c",
  },
  violet: {
    bg:"linear-gradient(145deg,#f4f1ff 0%,#fbfaff 100%)",
    border:"rgba(124,58,237,.14)",
    iconBg:"rgba(124,58,237,.12)",
    iconColor:"#6d28d9",
    accent:"#6d28d9",
  },
};

const NAV_ICON_TONES = {
  home: "blue",
  dashboard: "navy",
  notifications: "teal",
  new_request: "blue",
  my_requests: "navy",
  pending_approvals: "amber",
  approval_history: "violet",
  payment_queue: "green",
  financial_reports: "violet",
  procurement: "amber",
  human_resource: "teal",
  hr_employees: "teal",
  hr_org_structure: "teal",
  hr_departments: "teal",
  hr_positions: "teal",
  project_management: "blue",
  asset_management: "navy",
  document_management: "blue",
  communication: "teal",
  messages_center: "teal",
  admin_center: "blue",
  admin_users: "rose",
  admin_budgets: "amber",
  admin_all_requests: "navy",
  admin_logs: "violet",
};

function AppButtonIcon({ name, tone = "navy", size = 14 }) {
  return <IconBadge name={name} tone={tone} size={size} />;
}

function ModuleNavCard({ icon, label, sub, meta, tone="navy", onClick }) {
  const palette = MODULE_CARD_TONES[tone] || MODULE_CARD_TONES.navy;
  return (
    <button
      type="button"
      className="module-card"
      onClick={onClick}
      style={{
        "--module-bg": palette.bg,
        "--module-border": palette.border,
        "--module-icon-bg": palette.iconBg,
        "--module-icon-color": palette.iconColor,
        "--module-accent": palette.accent,
      }}
    >
      <div className="module-card-top">
        <div className="module-card-icon">
          <IconBadge name={icon} tone={tone} size={18} />
        </div>
      </div>
      <div className="module-card-copy">
        <div className="module-card-title">{label}</div>
        <div className="module-card-sub">{sub}</div>
      </div>
      {meta && <div className="module-card-meta">{meta}</div>}
    </button>
  );
}

// â"€â"€ Signature Pad â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function SignaturePad({ value, onChange }) {
  const [mode, setMode] = useState(value?.type === "drawn" ? "drawn" : "typed");
  const [typed, setTyped] = useState(value?.type === "typed" ? value.value : "");
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const ctx       = useRef(null);

  useEffect(() => {
    if (mode === "drawn" && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const c = canvas.getContext("2d");
      c.scale(window.devicePixelRatio, window.devicePixelRatio);
      c.strokeStyle = "#0f2744";
      c.lineWidth   = 2.2;
      c.lineCap     = "round";
      c.lineJoin    = "round";
      ctx.current   = c;
      if (value?.type === "drawn" && value.value) {
        const img = new Image();
        img.onload = () => c.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
        img.src    = value.value;
      }
    }
  }, [mode, value?.type, value?.value]);

  const getXY = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return [src.clientX - r.left, src.clientY - r.top];
  };
  const onStart = (e) => { e.preventDefault(); drawing.current = true; const [x,y] = getXY(e); ctx.current.beginPath(); ctx.current.moveTo(x,y); };
  const onMove  = (e) => { e.preventDefault(); if (!drawing.current) return; const [x,y] = getXY(e); ctx.current.lineTo(x,y); ctx.current.stroke(); };
  const onEnd   = () => { if (!drawing.current) return; drawing.current = false; onChange({ type:"drawn", value: canvasRef.current.toDataURL() }); };
  const clear   = () => { ctx.current.clearRect(0, 0, canvasRef.current.offsetWidth, canvasRef.current.offsetHeight); onChange(null); };

  return (
    <div className="sig-pad-wrap">
      <div className="sig-tabs">
        <button type="button" className={`sig-tab ${mode==="typed"?"active":""}`} onClick={() => setMode("typed")}><AppButtonIcon name="edit" tone="blue" />Type Signature</button>
        <button type="button" className={`sig-tab ${mode==="drawn"?"active":""}`} onClick={() => setMode("drawn")}><AppButtonIcon name="edit" tone="teal" />Draw Signature</button>
      </div>
      {mode === "typed" ? (
        <input
          className="sig-typed"
          placeholder="Type your full name as signature..."
          value={typed}
          onChange={e => { setTyped(e.target.value); onChange(e.target.value ? { type:"typed", value:e.target.value } : null); }}
        />
      ) : (
        <div className="sig-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="sig-canvas"
            onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
            onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
          />
          <button type="button" className="btn btn-ghost btn-sm sig-clear" onClick={clear}>Clear</button>
        </div>
      )}
      {value && (
        <div className="sig-preview">
          {value.type === "typed"
            ? value.value
            : <img src={value.value} alt="Signature" style={{ height: 40, maxWidth: "100%" }} />}
        </div>
      )}
    </div>
  );
}

// â"€â"€ File Upload â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function FileUpload({ value, onChange, emptyTitle="Attach Concept Note Document", emptyHint="PDF, DOC or DOCX || click or drag to upload" }) {
  const handleChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange({ name: file.name, size: file.size, type: file.type, dataUrl: ev.target.result });
    reader.readAsDataURL(file);
  };
  const remove = (ev) => { ev.stopPropagation(); onChange(null); };
  const fmt = (bytes) => bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;

  if (value) {
    return (
      <div className="file-info">
        <div className="file-icon"><IconBadge name="doc" tone="blue" size={16} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:13, color:"var(--g800)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value.name}</div>
          <div className="text-xs text-gray">{fmt(value.size)} · {value.type}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={remove}>Remove</button>
      </div>
    );
  }
  return (
    <div className="file-drop">
      <input type="file" accept=".pdf,.doc,.docx" onChange={handleChange} />
      <div style={{ fontSize:26, marginBottom:6 }}><IconBadge name="download" tone="blue" size={18} /></div>
      <div style={{ fontSize:13, fontWeight:600, color:"var(--g700)" }}>{emptyTitle}</div>
      <div className="text-xs text-gray" style={{ marginTop:3 }}>{emptyHint}</div>
    </div>
  );
}

// â"€â"€ Login Screen â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function PasswordResetScreen({ onDone }) {
  const [newPass,  setNewPass]  = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState("");
  const [success,  setSuccess]  = useState(false);

  const handleReset = async () => {
    if (!newPass.trim())           { setErr("Please enter a new password."); return; }
    if (newPass.length < 6)        { setErr("Password must be at least 6 characters."); return; }
    if (newPass !== confirm)       { setErr("Passwords do not match."); return; }
    setLoading(true); setErr("");
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setSuccess(true);
    await supabase.auth.signOut();
    setTimeout(onDone, 2500);
  };

  return (
    <div className="login-screen">
      <div className="login-left">
        <div className="login-left-bg" />
        <div className="login-left-overlay" />
        <div className="login-left-content">
          <div className="login-left-logo"><img src={inspireLogo} alt="logo" /></div>
          <div className="login-left-appname">INSPIRE YOUTH FOR DEVELOPMENT (IYD)</div>
          <div className="login-left-erp">Inspire Management System (IMS)</div>
        </div>
      </div>
      <div className="login-right">
        <div className="login-card">
          <div className="login-logo-mark"><img src={inspireLogo} alt="logo" /></div>
          {success ? (
            <>
              <div className="login-heading" style={{ fontSize:21 }}>Password updated</div>
              <div className="login-sub-text" style={{ marginBottom:24 }}>Your password has been changed. Redirecting you to sign in…</div>
              <div style={{ textAlign:"center", fontSize:36 }}>✓</div>
            </>
          ) : (
            <>
              <div className="login-heading" style={{ fontSize:21 }}>Set new password</div>
              <div className="login-sub-text">Choose a strong password for your account.</div>
              {err && <div className="alert alert-red" style={{ marginBottom:14 }}>{err}</div>}
              <div className="form-group" style={{ marginBottom:14 }}>
                <label>New password</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input type={showPass ? "text" : "password"} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="New password" style={{ paddingRight:40 }} onKeyDown={e => e.key === "Enter" && handleReset()} />
                  <button type="button" className="login-input-eye" onClick={() => setShowPass(v => !v)}>
                    {showPass
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:20 }}>
                <label>Confirm new password</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input type={showPass ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm password" onKeyDown={e => e.key === "Enter" && handleReset()} />
                </div>
              </div>
              <button className="login-btn" onClick={handleReset} disabled={loading}>
                {loading ? "Updating…" : "Set new password"}
              </button>
              <div className="login-footer">
                <button className="login-forgot" style={{ fontWeight:400 }} type="button" onClick={onDone}>Back to sign in</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [email,       setEmail]       = useState("");
  const [pass,        setPass]        = useState("");
  const [err,         setErr]         = useState("");
  const [remember,    setRemember]    = useState(false);
  const [showPass,    setShowPass]    = useState(false);
  const [view,        setView]        = useState("login"); // "login" | "forgot" | "sent"
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotErr,   setForgotErr]   = useState("");
  const [cooldown,    setCooldown]    = useState(0); // seconds remaining before next send
  const cooldownRef = useRef(null);

  const startCooldown = (seconds = 60) => {
    setCooldown(seconds);
    cooldownRef.current = window.setInterval(() => {
      setCooldown(s => {
        if (s <= 1) { window.clearInterval(cooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const sendResetLink = async () => {
    if (!forgotEmail.trim()) { setForgotErr("Please enter your email address."); return; }
    if (cooldown > 0) return;
    setForgotLoading(true); setForgotErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setForgotLoading(false);
    if (error) {
      const isRateLimit = error.status === 429 || /rate.limit|too many|over_email/i.test(error.message);
      setForgotErr(isRateLimit
        ? "Too many reset requests. Please wait a few minutes before trying again."
        : error.message
      );
      if (isRateLimit) startCooldown(120);
      return;
    }
    startCooldown(60);
    setView("sent");
  };

  const submit = async () => {
    setErr("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });
    if (error) return setErr("Invalid email or password.");
    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("auth_user_id", data.user.id)
      .single();
    if (!profile) {
      await supabase.auth.signOut();
      return setErr("Account not found. Contact your administrator.");
    }
    if (!profile.is_active) {
      await supabase.auth.signOut();
      return setErr("This account has been deactivated.");
    }
    onLogin({
      id:          profile.id,
      name:        profile.name,
      email:       profile.email,
      role:        profile.role,
      moduleRole:  profile.module_role,
      jobTitle:    profile.job_title,
      dept:        profile.department,
      avatar:      profile.avatar_initials,
      supervisorId: profile.supervisor_id,
      eSignature:  profile.e_signature,
      isActive:    profile.is_active,
    });
  };

  if (view === "forgot") return (
    <div className="login-screen">
      <div className="login-left">
        <div className="login-left-bg" />
        <div className="login-left-overlay" />
        <div className="login-left-content">
          <div className="login-left-logo"><img src={inspireLogo} alt="logo" /></div>
          <div className="login-left-appname">INSPIRE YOUTH FOR DEVELOPMENT (IYD)</div>
          <div className="login-left-erp">Inspire Management System (IMS)</div>
        </div>
      </div>
      <div className="login-right">
        <div className="login-card">
          <div className="login-logo-mark"><img src={inspireLogo} alt="logo" /></div>
          <div className="login-heading" style={{ fontSize:22 }}>Reset your password</div>
          <div className="login-sub-text">Enter the email address for your account and we'll send you a reset link.</div>
          {forgotErr && <div className="alert alert-red" style={{ marginBottom:14 }}>{forgotErr}</div>}
          <div className="form-group" style={{ marginBottom:20 }}>
            <label>Email address</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </span>
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="Enter your email" autoFocus onKeyDown={e => e.key === "Enter" && sendResetLink()} />
            </div>
          </div>
          <button className="login-btn" onClick={sendResetLink} disabled={forgotLoading || cooldown > 0}>
            {forgotLoading ? "Sending…" : cooldown > 0 ? `Wait ${cooldown}s before resending` : "Send reset link"}
          </button>
          <div className="login-footer">
            <button className="login-forgot" style={{ fontWeight:400 }} type="button" onClick={() => setView("login")}>← Back to sign in</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (view === "sent") return (
    <div className="login-screen">
      <div className="login-left">
        <div className="login-left-bg" />
        <div className="login-left-overlay" />
        <div className="login-left-content">
          <div className="login-left-logo"><img src={inspireLogo} alt="logo" /></div>
          <div className="login-left-appname">INSPIRE YOUTH FOR DEVELOPMENT (IYD)</div>
          <div className="login-left-erp">Inspire Management System (IMS)</div>
        </div>
      </div>
      <div className="login-right">
        <div className="login-card">
          <div className="login-logo-mark"><img src={inspireLogo} alt="logo" /></div>
          <div style={{ textAlign:"center", fontSize:40, marginBottom:16 }}>✉️</div>
          <div className="login-heading" style={{ fontSize:21, textAlign:"center" }}>Check your inbox</div>
          <div className="login-sub-text" style={{ textAlign:"center", marginBottom:24 }}>
            We sent a password reset link to <strong>{forgotEmail}</strong>. Click the link in the email to set a new password.
          </div>
          <div style={{ background:"var(--navy-pale)", borderRadius:8, padding:"12px 14px", fontSize:12.5, color:"var(--g600)", marginBottom:20, lineHeight:1.7 }}>
            Didn't receive it? Check your spam folder, or{" "}
            {cooldown > 0
              ? <span style={{ color:"var(--g400)" }}>resend available in {cooldown}s</span>
              : <button className="login-forgot" style={{ fontSize:12.5 }} type="button" onClick={() => setView("forgot")}>try again</button>
            }.
          </div>
          <button className="login-btn" style={{ background:"var(--g100)", color:"var(--navy)", boxShadow:"none" }} onClick={() => setView("login")}>Back to sign in</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="login-screen">
      {/* ── Left branding panel ── */}
      <div className="login-left">
        <div className="login-left-bg" />
        <div className="login-left-overlay" />
        <div className="login-left-content">
          <div className="login-left-logo">
            <img src={inspireLogo} alt="Inspire Youth For Development logo" />
          </div>
          <div className="login-left-appname">INSPIRE YOUTH FOR DEVELOPMENT (IYD)</div>
          <div className="login-left-erp">Inspire Management System (IMS)</div>
          <div className="login-left-vision-label">Vision</div>
          <div className="login-left-tagline">
            A world where all young people and women have been empowered and equipped to realize their potential.
          </div>
          <div className="login-left-dots">
            <div className="login-left-dot active" />
            <div className="login-left-dot" />
            <div className="login-left-dot" />
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="login-right">
        <div className="login-card">
          <div className="login-logo-mark">
            <img src={inspireLogo} alt="logo" />
          </div>

          <div className="login-heading">Welcome back</div>
          <div className="login-sub-text">Sign in to access your workspace</div>

          {err && <div className="alert alert-red" style={{ marginBottom:18 }}>{err}</div>}

          {/* Email field */}
          <div className="form-group" style={{ marginBottom:14 }}>
            <label>Email address</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter Email"
                onKeyDown={e => e.key === "Enter" && submit()}
                autoFocus
              />
            </div>
          </div>

          {/* Password field */}
          <div className="form-group" style={{ marginBottom:6 }}>
            <label>Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                type={showPass ? "text" : "password"}
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="Enter password"
                onKeyDown={e => e.key === "Enter" && submit()}
                style={{ paddingRight:40 }}
              />
              <button
                type="button"
                className="login-input-eye"
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Remember me + Forgot password */}
          <div className="login-extras">
            <label className="login-remember">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              Remember me
            </label>
            <button className="login-forgot" type="button" onClick={() => { setForgotEmail(email); setForgotErr(""); setView("forgot"); }}>Forgot password?</button>
          </div>

          <button className="login-btn" onClick={submit}>Sign In</button>

          <div className="login-footer">© {new Date().getFullYear()} {ORG_NAME}. All rights reserved.</div>
        </div>
      </div>
    </div>
  );
}

// â"€â"€ Sidebar â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// ── HR: Home ──────────────────────────────────────────────────────────────────
function HRHome({ setPage, user }) {
  const total    = _employees.length;
  const active   = _employees.filter(e => e.status === "Active").length;
  const depts    = new Set(_employees.map(e => e.department).filter(Boolean)).size;
  const posCount  = _hrPositions.length;
  const deptCount = _hrDepartments.length;
  const isHRManager = canAccessModule(user, "hr");
  const canReviewLeaveQueue = canAccessLeaveManagement(user);
  const pendingForUser = getPendingLeaveApprovalsForUser(user).length;
  const cards = isHRManager ? [
    { icon:"doc",     label:"Staff Files",              sub:"Open complete employee profiles with biodata, contracts, CVs, certificates, leave history, and linked system records.", tone:"teal",  page:"hr_staff_files"  },
    { icon:"users",   label:"Employee Registry",        sub:"View, add and manage staff biodata, contracts, CVs, certificates, leave history, and linked accounts.",     tone:"teal",  page:"hr_employees"    },
    { icon:"com",     label:"Messages",                 sub:"Open the internal staff messaging workspace and HR announcements center.",                    tone:"amber", page:"messages_center"  },
    { icon:"reports", label:"Organisational Structure", sub:"Reporting lines, hierarchy and org chart.",      tone:"teal",  page:"hr_org_structure" },
    { icon:"doc",     label:"Departments",              sub:`Manage ${deptCount} department${deptCount!==1?"s":""} and their details.`, tone:"teal", page:"hr_departments" },
    { icon:"admin",   label:"Positions",                sub:`Manage ${posCount} position${posCount!==1?"s":""} linked to departments.`, tone:"teal", page:"hr_positions"   },
    { icon:"calendar",label:"Leave Management",         sub:"Apply for leave, track balances and manage approvals.",                       tone:"teal", page:"hr_leave"        },
  ] : [
    { icon:"calendar",label:"Leave Management",         sub:"Apply for leave, track balances, and follow your leave records from the HR module.", tone:"teal", page:"hr_leave" },
    ...(canReviewLeaveQueue ? [{
      icon:"reports",
      label:"Leave Approval Queue",
      sub:`${pendingForUser} leave request${pendingForUser !== 1 ? "s" : ""} currently assigned to you for approval.`,
      tone:"amber",
      page:"hr_leave_manage",
    }] : []),
  ];
  return (
    <div className="page">
      <div className="hr-home-banner">
        <div className="hr-banner-title">Human Resources</div>
        <div className="hr-banner-sub">
          {isHRManager
            ? "Manage employee profiles, biodata forms, contracts, CVs, certificates, leave history, and employment records in one secure HR workspace."
            : canReviewLeaveQueue
              ? "Access your leave workspace and your approval queue from the HR module while restricted HR administration tools remain available only to HR and Admin users."
              : "Access your leave workspace from the HR module while restricted HR administration tools remain available only to HR and Admin users."}
        </div>
        <div className="hr-banner-stats">
          <div className="hr-banner-stat"><span className="hr-banner-stat-val">{total}</span><span className="hr-banner-stat-label">Total Employees</span></div>
          <div className="hr-banner-stat"><span className="hr-banner-stat-val">{active}</span><span className="hr-banner-stat-label">Active</span></div>
          <div className="hr-banner-stat"><span className="hr-banner-stat-val">{depts || "—"}</span><span className="hr-banner-stat-label">Departments</span></div>
        </div>
      </div>
      <div className="hr-module-grid">
        {cards.map(c => (
          <ModuleNavCard key={c.page} icon={c.icon} label={c.label} sub={c.sub} tone={c.tone} onClick={() => setPage(c.page)} />
        ))}
      </div>
    </div>
  );
}

// ── HR: Employee Registry ──────────────────────────────────────────────────────
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Volunteer", "Consultant"];
const EMP_STATUS_OPTS  = ["Active", "Inactive"];

function empInitials(name="") {
  return name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function EmployeeRegistry({ onSystemChange, setPage, user, mode = "registry" }) {
  const [employees, setEmployees] = useState([..._employees]);
  const [positions]               = useState(() => getPositionOptions(_users, _positions));
  const [search,  setSearch]      = useState("");
  const [deptFilter, setDeptFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view,    setView]        = useState("list"); // "list" | "profile"
  const [selected, setSelected]  = useState(null);
  const [showForm, setShowForm]  = useState(false);
  const [editEmp,  setEditEmp]   = useState(null);
  const [toast,     setToast]    = useState("");
  const [saveError, setSaveError] = useState("");
  const [biodataEmp, setBiodataEmp] = useState(null); // employee to show in PDF modal
  const [activeTab, setActiveTab] = useState("biodata");
  const [docForm, setDocForm] = useState({ docType:"Contract", displayName:"" });
  const [activeDocFolder, setActiveDocFolder] = useState("all");
  const [uploadErr, setUploadErr] = useState("");
  const [uploadOk, setUploadOk] = useState("");
  const fileInputRef = useRef(null);
  const filesUploadDocTypeRef = useRef("Contract"); // tracks which section triggered upload in files mode

  const makeBlankForm = () => ({
    // Identity — ID is assigned at save time, not here, to avoid wasting numbers on cancelled forms
    employeeId: "",
    // Personal
    name:"", otherNames:"", gender:"", dob:"", nationality:"Ugandan",
    maritalStatus:"", nationalId:"", passportNo:"", tin:"", nssfNo:"",
    // Contact
    email:"", personalEmail:"", phone:"", altPhone:"",
    address:"", city:"", district:"", country:"Uganda",
    // Employment
    department: _hrDepartments[0]?.name || "Programs",
    position:"", supervisorId:"", employmentType:"Full-time",
    contractEndDate:"", status:"Active",
    dateJoined: new Date().toISOString().slice(0,10),
    // Education
    qualification:"", institution:"", fieldOfStudy:"", yearGraduated:"",
    // Next of kin
    kinName:"", kinRelationship:"", kinPhone:"", kinEmail:"", kinAddress:"",
    // Emergency contact
    emergencyName:"", emergencyRelationship:"", emergencyPhone:"", emergencyAltPhone:"",
  });

  const [form, setForm] = useState(makeBlankForm);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const sync = () => {
    setEmployees([..._employees]);
    saveState();
    if (onSystemChange) onSystemChange();
  };

  const openAdd = () => {
    setEditEmp(null);
    setForm(makeBlankForm());   // pre-generates a new EMP-XXXX
    setShowForm(true);
  };

  const openEdit = (emp) => {
    setEditEmp(emp);
    setForm({
      employeeId: emp.employeeId || "—",
      name: emp.name, otherNames: emp.otherNames||"", gender: emp.gender||"",
      dob: emp.dob||"", nationality: emp.nationality||"Ugandan",
      maritalStatus: emp.maritalStatus||"", nationalId: emp.nationalId||"",
      passportNo: emp.passportNo||"", tin: emp.tin||"", nssfNo: emp.nssfNo||"",
      email: emp.email, personalEmail: emp.personalEmail||"",
      phone: emp.phone||"", altPhone: emp.altPhone||"",
      address: emp.address||"", city: emp.city||"",
      district: emp.district||"", country: emp.country||"Uganda",
      department: emp.department, position: emp.position||"",
      supervisorId: emp.supervisorId||"", employmentType: emp.employmentType||"Full-time",
      contractEndDate: emp.contractEndDate||"", status: emp.status||"Active",
      dateJoined: emp.dateJoined||"",
      qualification: emp.qualification||"", institution: emp.institution||"",
      fieldOfStudy: emp.fieldOfStudy||"", yearGraduated: emp.yearGraduated||"",
      kinName: emp.kinName||"", kinRelationship: emp.kinRelationship||"",
      kinPhone: emp.kinPhone||"", kinEmail: emp.kinEmail||"", kinAddress: emp.kinAddress||"",
      emergencyName: emp.emergencyName||"", emergencyRelationship: emp.emergencyRelationship||"",
      emergencyPhone: emp.emergencyPhone||"", emergencyAltPhone: emp.emergencyAltPhone||"",
    });
    setShowForm(true);
    setView("list");
  };

  const saveEmployee = () => {
    if (!form.name.trim()) { setSaveError("Full Name is required."); return; }
    if (!form.email.trim()) { setSaveError("Work Email is required — scroll down to the Contact Details section."); return; }
    setSaveError("");
    if (editEmp) {
      Object.assign(editEmp, { ...form, name: form.name.trim(), email: form.email.trim() });
      const nameParts = form.name.trim().split(" ");
      supabase.from("employees").update({
        first_name:      nameParts[0] || "",
        last_name:       nameParts.slice(1).join(" ") || "",
        email:           form.email.trim(),
        phone:           form.phone || null,
        gender:          form.gender || null,
        date_of_birth:   form.dob || null,
        position:        form.position || null,
        employment_type: form.employmentType || null,
        status:          form.status || "Active",
        hire_date:       form.dateJoined || null,
      }).eq("id", editEmp.id).then(({ error }) => {
        if (error) console.warn("Could not update employee in Supabase:", error.message);
      });
      showToast(`Updated: ${form.name}`);
      sync();
      setShowForm(false);
      setEditEmp(null);
    } else {
      const newEmp = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        employeeId: genEmployeeId(), // generated at save time so cancelled forms never consume an ID
      };
      _employees.push(newEmp);
      const nameParts = newEmp.name.split(" ");
      supabase.from("employees").insert({
        id:              newEmp.id,
        employee_id:     newEmp.employeeId,
        first_name:      nameParts[0] || "",
        last_name:       nameParts.slice(1).join(" ") || "",
        email:           newEmp.email,
        phone:           newEmp.phone || null,
        gender:          newEmp.gender || null,
        date_of_birth:   newEmp.dob || null,
        position:        newEmp.position || null,
        employment_type: newEmp.employmentType || null,
        status:          newEmp.status || "Active",
        hire_date:       newEmp.dateJoined || null,
      }).then(({ error }) => {
        if (error) console.warn("Could not save employee to Supabase:", error.message);
        else console.log("Employee saved to Supabase:", newEmp.name);
      });
      showToast(`Added: ${form.name}`);
      sync();
      setShowForm(false);
      setEditEmp(null);
      setBiodataEmp(newEmp); // auto-open biodata PDF after adding
    }
  };

  const deleteEmployee = (emp) => {
    if (!window.confirm(`Delete employee "${emp.name}"? This cannot be undone.`)) return;
    _employees = _employees.filter(e => e.id !== emp.id);
    sync();
    if (selected?.id === emp.id) { setSelected(null); setView("list"); }
    showToast(`Removed: ${emp.name}`);
  };

  const openProfile = (emp) => {
    setSelected(emp);
    setView("profile");
    setActiveTab(mode === "files" ? "documents" : "biodata");
    setActiveDocFolder("all");
    setUploadErr("");
    setUploadOk("");
    setDocForm({ docType:"Contract", displayName:"" });
  };

  const filtered = employees
    .filter(e => !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.position || "").toLowerCase().includes(search.toLowerCase()))
    .filter(e => deptFilter === "all" || e.department === deptFilter)
    .filter(e => statusFilter === "all" || e.status === statusFilter);

  const supervisorName = (id) => employees.find(e => e.id === id)?.name || _users.find(u => u.id === id)?.name || "—";

  const statusStyle = (s) => s === "Active"
    ? { background:"#d1fae5", color:"#065f46" }
    : { background:"#fee2e2", color:"#991b1b" };

  // ── Staff File (profile) ──
  if (view === "profile" && selected) {
    const fresh = _employees.find(e => e.id === selected.id) || selected;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"}) : "—";
    const fmtShort = (d) => d ? new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—";
    const isHRAdmin = user && (getModuleRole(user) === "hr" || getModuleRole(user) === "admin");
    const setDF = (k, v) => setDocForm(f => ({ ...f, [k]: v }));
    const docs = _empDocuments.filter(d => d.employeeId === fresh.id);

    const empLeave = _leaveApplications
      .filter(a => a.employeeId === fresh.id || a.userId === (_users.find(u => u.email?.toLowerCase() === fresh.email?.toLowerCase())?.id))
      .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

    const linkedUser = _users.find(u => u.email?.toLowerCase() === fresh.email?.toLowerCase());
    const uMR = linkedUser ? getModuleRole(linkedUser) : null;

    const docIcon = (type) => {
      if (type === "Contract")  return { icon:"📄", bg:"#dbeafe", color:"#1e40af" };
      if (type === "CV / Resume") return { icon:"👤", bg:"#d1fae5", color:"#065f46" };
      if (type === "Certificate") return { icon:"🎓", bg:"#ede9fe", color:"#5b21b6" };
      if (type === "Identity Document") return { icon:"🪪", bg:"#fef3c7", color:"#92400e" };
      return { icon:"📎", bg:"#f1f5f9", color:"#475569" };
    };
    const documentSections = [
      { id:"leave_forms", title:"Leave Forms", types:["Leave Form"] },
      { id:"contracts", title:"Contracts", types:["Contract"] },
      { id:"cvs", title:"CVs / Resumes", types:["CV / Resume"] },
      { id:"certificates", title:"Certificates", types:["Certificate"] },
      { id:"other", title:"Other Supporting Documents", types:["Identity Document","Policy Acknowledgement","Other"] },
    ];
    const docsBySection = documentSections.map(section => ({
      ...section,
      docs: docs.filter(doc => section.types.includes(doc.docType)),
    }));

    const handleUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setUploadErr(""); setUploadOk("");
      if (file.size > 5 * 1024 * 1024) { setUploadErr("File too large — maximum size is 5 MB."); return; }
      const effectiveDocType = mode === "files" ? filesUploadDocTypeRef.current : docForm.docType;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const doc = {
          id: `doc-${Date.now()}`,
          employeeId: fresh.id,
          docType: effectiveDocType,
          displayName: docForm.displayName.trim() || file.name,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          data: ev.target.result,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.name || "HR",
        };
        _empDocuments.push(doc);
        saveState();
        if (mode !== "files") setDocForm({ docType:"Contract", displayName:"" });
        setUploadOk(`"${doc.displayName}" uploaded.`);
        setTimeout(() => setUploadOk(""), 4000);
        if (fileInputRef.current) fileInputRef.current.value = "";
      };
      reader.readAsDataURL(file);
    };

    const triggerSectionUpload = (docType) => {
      filesUploadDocTypeRef.current = docType;
      setDocForm(f => ({ ...f, displayName:"" }));
      if (fileInputRef.current) { fileInputRef.current.value = ""; fileInputRef.current.click(); }
    };

    const deleteDoc = (docId) => {
      if (!window.confirm("Remove this document? This cannot be undone.")) return;
      _empDocuments = _empDocuments.filter(d => d.id !== docId);
      saveState();
    };

    const downloadDoc = (doc) => {
      const a = document.createElement("a");
      a.href = doc.data; a.download = doc.fileName; a.click();
    };

    const fmtBytes = (b) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(1)} MB`;

    const renderProfileSection = (title, fields) => (
      <div>
        <div style={{ padding:"10px 22px", background:"var(--g50)", borderTop:"1px solid var(--g100)", borderBottom:"1px solid var(--g100)", fontSize:11, fontWeight:800, color:"var(--g500)", textTransform:"uppercase", letterSpacing:".08em" }}>{title}</div>
        <div className="hr-profile-grid">
          {fields.filter(([,v]) => v && v !== "—").map(([label, value]) => (
            <div className="hr-profile-field" key={label}>
              <div className="hr-profile-label">{label}</div>
              <div className="hr-profile-value">{value}</div>
            </div>
          ))}
        </div>
      </div>
    );

    const approvedLeaveForStaff = empLeave.filter(a => a.status === "approved");
    const TABS = mode === "files"
      ? [
          { id:"documents", label:"Staff File" },
          { id:"biodata",   label:"Biodata" },
          { id:"leave",     label:`Leave History (${empLeave.length})` },
        ]
      : [
          { id:"biodata",   label:"Biodata" },
          { id:"documents", label:`Documents (${docs.length})` },
          { id:"leave",     label:`Leave (${empLeave.length})` },
          { id:"system",    label:"System Account" },
        ];

    return (
      <div className="page">
        <div style={{ marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
          <button className="btn btn-ghost" onClick={() => { setView("list"); setSelected(null); }}>
            <AppButtonIcon name="back" tone="teal" size={13} /> {mode === "files" ? "Back to Staff Files" : "Back to Registry"}
          </button>
          <div className="flex gap-2">
            {mode !== "files" && (
              <>
                <button className="btn btn-amber" onClick={() => openEdit(fresh)}>
                  <AppButtonIcon name="edit" tone="amber" size={13} /> Edit
                </button>
                <button className="btn btn-primary" onClick={() => setBiodataEmp(fresh)}>
                  <AppButtonIcon name="download" tone="navy" size={13} /> Download Biodata
                </button>
                <button className="btn btn-ghost" style={{ color:"var(--red)", borderColor:"#fecaca" }} onClick={() => deleteEmployee(fresh)}>Delete</button>
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ maxWidth:860, margin:"0 auto", overflow:"hidden" }}>

          {/* Header */}
          <div className="hr-profile-header">
            <div className="hr-profile-avatar">{empInitials(fresh.name)}</div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <div className="hr-profile-name">{fresh.name}{fresh.otherNames ? ` (${fresh.otherNames})` : ""}</div>
                <span style={{ background:"rgba(255,255,255,.22)", border:"1px solid rgba(255,255,255,.35)", borderRadius:6, padding:"2px 10px", fontSize:12, fontWeight:700, letterSpacing:".04em", color:"#fff" }}>
                  {fresh.employeeId || "—"}
                </span>
              </div>
              <div className="hr-profile-title">{fresh.position || "—"} · {fresh.department}</div>
              <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                <span className="hr-profile-badge" style={statusStyle(fresh.status)}>{fresh.status}</span>
                {fresh.employmentType && <span className="hr-profile-badge" style={{ background:"rgba(255,255,255,.18)", color:"#fff" }}>{fresh.employmentType}</span>}
                {fresh.dateJoined && <span className="hr-profile-badge" style={{ background:"rgba(255,255,255,.12)", color:"rgba(255,255,255,.8)" }}>Since {fmtShort(fresh.dateJoined)}</span>}
              </div>
            </div>
            {/* Quick stats */}
            <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", flexShrink:0 }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,.65)", textAlign:"right" }}>{docs.length} document{docs.length!==1?"s":""}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,.65)", textAlign:"right" }}>{empLeave.length} leave application{empLeave.length!==1?"s":""}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,.65)", textAlign:"right" }}>{supervisorName(fresh.supervisorId) !== "—" ? `Reports to ${supervisorName(fresh.supervisorId)}` : "No supervisor set"}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="staff-file-tabs">
            {TABS.map(t => (
              <div key={t.id} className={`staff-file-tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>{t.label}</div>
            ))}
          </div>

          {/* ── BIODATA TAB ── */}
          {activeTab === "biodata" && (
            <div className="staff-file-section">
              {renderProfileSection("Employment Details", [
                ["Employee ID",       fresh.employeeId || "—"],
                ["Department",        fresh.department || "—"],
                ["Position",          fresh.position || "—"],
                ["Employment Type",   fresh.employmentType || "—"],
                ["Status",            fresh.status || "—"],
                ["Date Joined",       fmtDate(fresh.dateJoined)],
                ["Contract End Date", fmtDate(fresh.contractEndDate)],
                ["Reports To",        supervisorName(fresh.supervisorId)],
              ])}
              {renderProfileSection("Personal Information", [
                ["Full Name",       fresh.name || "—"],
                ["Other Names",     fresh.otherNames || "—"],
                ["Gender",          fresh.gender || "—"],
                ["Date of Birth",   fmtDate(fresh.dob)],
                ["Nationality",     fresh.nationality || "—"],
                ["Marital Status",  fresh.maritalStatus || "—"],
                ["National ID",     fresh.nationalId || "—"],
                ["Passport No.",    fresh.passportNo || "—"],
                ["TIN",             fresh.tin || "—"],
                ["NSSF No.",        fresh.nssfNo || "—"],
              ])}
              {renderProfileSection("Contact Details", [
                ["Work Email",        fresh.email || "—"],
                ["Personal Email",    fresh.personalEmail || "—"],
                ["Phone",             fresh.phone || "—"],
                ["Alternative Phone", fresh.altPhone || "—"],
                ["Address",           fresh.address || "—"],
                ["City / Town",       fresh.city || "—"],
                ["District",          fresh.district || "—"],
                ["Country",           fresh.country || "—"],
              ])}
              {renderProfileSection("Education & Qualifications", [
                ["Highest Qualification", fresh.qualification || "—"],
                ["Institution",           fresh.institution || "—"],
                ["Field of Study",        fresh.fieldOfStudy || "—"],
                ["Year Graduated",        fresh.yearGraduated || "—"],
              ])}
              {renderProfileSection("Next of Kin", [
                ["Full Name",    fresh.kinName || "—"],
                ["Relationship", fresh.kinRelationship || "—"],
                ["Phone",        fresh.kinPhone || "—"],
                ["Email",        fresh.kinEmail || "—"],
                ["Address",      fresh.kinAddress || "—"],
              ])}
              {renderProfileSection("Emergency Contact", [
                ["Full Name",         fresh.emergencyName || "—"],
                ["Relationship",      fresh.emergencyRelationship || "—"],
                ["Phone",             fresh.emergencyPhone || "—"],
                ["Alternative Phone", fresh.emergencyAltPhone || "—"],
              ])}
            </div>
          )}

          {/* ── DOCUMENTS TAB (FILES MODE) ── */}
          {activeTab === "documents" && mode === "files" && (() => {
            const sectionDocIcon = (type) => {
              if (type === "Contract")          return "📄";
              if (type === "CV / Resume")       return "👤";
              if (type === "Academic Document") return "🎓";
              if (type === "Certificate")       return "🏅";
              if (type === "Disciplinary Record") return "⚠️";
              if (type === "Identity Document") return "🪪";
              return "📎";
            };
            const SectionHeader = ({ icon, title, subtitle, count, onUpload }) => (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:22 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14, color:"var(--navy)" }}>
                      {title}
                      {count != null && <span style={{ marginLeft:6, fontWeight:600, fontSize:12, color:"var(--g400)" }}>({count})</span>}
                    </div>
                    {subtitle && <div style={{ fontSize:12, color:"var(--g500)", marginTop:1 }}>{subtitle}</div>}
                  </div>
                </div>
                {onUpload && isHRAdmin && (
                  <button className="btn btn-ghost btn-sm" onClick={onUpload}>+ Upload</button>
                )}
              </div>
            );
            const DocRow = ({ doc }) => (
              <div key={doc.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#fff", border:"1px solid var(--g100)", borderRadius:8, marginBottom:6 }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{sectionDocIcon(doc.docType)}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"var(--navy)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{doc.displayName}</div>
                  <div style={{ fontSize:11, color:"var(--g400)", marginTop:2 }}>{doc.fileName} · {fmtBytes(doc.sizeBytes)} · {fmtShort(doc.uploadedAt)}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-primary btn-sm" onClick={() => downloadDoc(doc)}>⬇ Download</button>
                  {isHRAdmin && <button className="btn btn-ghost btn-sm" style={{ color:"#dc2626", borderColor:"#fca5a5" }} onClick={() => deleteDoc(doc.id)}>Remove</button>}
                </div>
              </div>
            );
            const EmptySlot = ({ msg }) => (
              <div style={{ padding:"14px 18px", border:"1px dashed var(--g200)", borderRadius:8, color:"var(--g400)", fontSize:13, background:"#fcfcfd" }}>{msg}</div>
            );
            const contractDocs  = docs.filter(d => d.docType === "Contract");
            const cvDocs        = docs.filter(d => d.docType === "CV / Resume");
            const academicDocs  = docs.filter(d => d.docType === "Academic Document" || d.docType === "Certificate");
            const otherDocs     = docs.filter(d => !["Contract","CV / Resume","Academic Document","Certificate","Leave Form"].includes(d.docType));
            const OTHER_TYPES   = ["Identity Document","Policy Acknowledgement","Disciplinary Record","Other"];
            return (
              <div style={{ padding:"22px", display:"flex", flexDirection:"column", gap:22 }}>
                {/* Shared hidden file input */}
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" style={{ display:"none" }} onChange={handleUpload} />
                {uploadOk && <div className="alert alert-green">{uploadOk}</div>}
                {uploadErr && <div className="alert alert-red">{uploadErr}</div>}

                {/* ── 1. Biodata Form ── */}
                <div>
                  <SectionHeader icon="📋" title="Biodata Form" subtitle="Official employee biodata. Edit only via the Employee Registry." />
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", background:"var(--navy-pale)", border:"1px solid var(--navy-light,#3b5998)22", borderRadius:10 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:"var(--navy)" }}>{fresh.name}</div>
                      <div style={{ fontSize:12, color:"var(--g500)", marginTop:2 }}>{fresh.position || "—"} · {fresh.department} · {fresh.employeeId || "—"}</div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setBiodataEmp(fresh)}>⬇ Download Biodata Form</button>
                  </div>
                  <div style={{ fontSize:11, color:"var(--g400)", marginTop:6 }}>To update biodata details, use the Employee Registry.</div>
                </div>

                {/* ── 2. Approved Leave Forms ── */}
                <div>
                  <SectionHeader icon="🏖️" title="Approved Leave Forms" subtitle="Fully approved leave forms with complete approval trail." count={approvedLeaveForStaff.length} />
                  {approvedLeaveForStaff.length === 0
                    ? <EmptySlot msg="No fully approved leave applications on record for this staff member." />
                    : approvedLeaveForStaff.map(a => {
                        const lt = LEAVE_TYPES.find(l => l.id === a.leaveTypeId);
                        return (
                          <div key={a.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#fff", border:"1px solid var(--g100)", borderRadius:8, marginBottom:6 }}>
                            <span style={{ fontSize:18, flexShrink:0 }}>🏖️</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontWeight:700, fontSize:13, color:"var(--navy)" }}>{a.id} — {lt?.name || a.leaveTypeId}</div>
                              <div style={{ fontSize:11, color:"var(--g400)", marginTop:2 }}>
                                {fmtShort(a.startDate)} – {fmtShort(a.endDate)} · {a.numDays} day{a.numDays !== 1 ? "s" : ""} · Approved {fmtShort(a.approvedAt)}
                              </div>
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={() => {
                              const lf = document.createElement("a");
                              lf.href = buildLeaveApprovalDocumentData(a);
                              lf.download = `${a.id}-approved-leave-form.html`;
                              lf.click();
                            }}>⬇ Download Form</button>
                          </div>
                        );
                      })
                  }
                </div>

                {/* ── 3. Contract ── */}
                <div>
                  <SectionHeader icon="📄" title="Staff Contract" subtitle="Signed employment contract." count={contractDocs.length} onUpload={() => triggerSectionUpload("Contract")} />
                  {contractDocs.length === 0 ? <EmptySlot msg="No contract uploaded yet." /> : contractDocs.map(d => <DocRow key={d.id} doc={d} />)}
                </div>

                {/* ── 4. Curriculum Vitae ── */}
                <div>
                  <SectionHeader icon="👤" title="Curriculum Vitae (CV)" subtitle="Staff CV or résumé." count={cvDocs.length} onUpload={() => triggerSectionUpload("CV / Resume")} />
                  {cvDocs.length === 0 ? <EmptySlot msg="No CV uploaded yet." /> : cvDocs.map(d => <DocRow key={d.id} doc={d} />)}
                </div>

                {/* ── 5. Academic Documents ── */}
                <div>
                  <SectionHeader icon="🎓" title="Academic Documents" subtitle="Degrees, diplomas, certificates, and academic transcripts." count={academicDocs.length} onUpload={() => triggerSectionUpload("Academic Document")} />
                  {academicDocs.length === 0 ? <EmptySlot msg="No academic documents uploaded yet." /> : academicDocs.map(d => <DocRow key={d.id} doc={d} />)}
                </div>

                {/* ── 6. Other Documents ── */}
                <div>
                  <SectionHeader icon="📎" title="Other Documents" subtitle="Identity documents, disciplinary records, policy acknowledgements, and any other supporting files." count={otherDocs.length} />
                  {isHRAdmin && (
                    <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap" }}>
                      <select style={{ flex:"0 0 auto", fontSize:13, padding:"6px 10px", border:"1px solid var(--g200)", borderRadius:6, background:"#fff", color:"var(--navy)" }}
                        value={docForm.docType}
                        onChange={e => setDocForm(f => ({ ...f, docType: e.target.value }))}>
                        {OTHER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input style={{ flex:1, minWidth:160, fontSize:13, padding:"6px 10px", border:"1px solid var(--g200)", borderRadius:6 }}
                        placeholder="Display name (optional)" value={docForm.displayName}
                        onChange={e => setDocForm(f => ({ ...f, displayName: e.target.value }))} />
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        filesUploadDocTypeRef.current = docForm.docType;
                        if (fileInputRef.current) { fileInputRef.current.value = ""; fileInputRef.current.click(); }
                      }}>+ Upload</button>
                    </div>
                  )}
                  {otherDocs.length === 0 ? <EmptySlot msg="No other documents uploaded yet." /> : otherDocs.map(d => <DocRow key={d.id} doc={d} />)}
                </div>
              </div>
            );
          })()}

          {/* ── DOCUMENTS TAB (REGISTRY MODE) ── */}
          {activeTab === "documents" && mode !== "files" && (
            <div style={{ padding:"22px" }}>
              {!isHRAdmin && (
                <div className="alert alert-red" style={{ marginBottom:16 }}>Document management is restricted to HR and Admin users.</div>
              )}

              {/* Upload panel — HR/Admin only */}
              {isHRAdmin && (
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"var(--navy)", marginBottom:12 }}>Upload Document</div>
                  {uploadErr && <div className="alert alert-red" style={{ marginBottom:10 }}>{uploadErr}</div>}
                  {uploadOk  && <div className="alert alert-green" style={{ marginBottom:10 }}>{uploadOk}</div>}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                    <FormField label="Document Type">
                      <select value={docForm.docType} onChange={e => setDF("docType", e.target.value)}>
                        {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Display Name (optional)">
                      <input value={docForm.displayName} onChange={e => setDF("displayName", e.target.value)} placeholder="e.g. Employment Contract 2024" />
                    </FormField>
                  </div>
                  <label className="doc-upload-zone" style={{ display:"block" }}>
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" style={{ display:"none" }} onChange={handleUpload} />
                    <div style={{ fontSize:28, marginBottom:8 }}>📁</div>
                    <div style={{ fontWeight:700, color:"var(--navy)", marginBottom:4 }}>Click to select a file</div>
                    <div style={{ fontSize:12, color:"var(--g400)" }}>PDF, Word, Excel, JPG, PNG — max 5 MB</div>
                  </label>
                </div>
              )}

              <div className="budget-stats" style={{ marginBottom:18 }}>
                <button
                  type="button"
                  className="budget-stat"
                  onClick={() => setActiveDocFolder("all")}
                  style={{ cursor:"pointer", border:activeDocFolder === "all" ? "1px solid var(--navy)" : "1px solid var(--g100)", background:activeDocFolder === "all" ? "var(--navy-pale)" : "#fff" }}
                >
                  <span className="budget-stat-label">All Folders</span>
                  <strong>{docs.length}</strong>
                </button>
                {docsBySection.map(section => (
                  <button
                    type="button"
                    key={section.id}
                    className="budget-stat"
                    onClick={() => setActiveDocFolder(section.id)}
                    style={{ cursor:"pointer", border:activeDocFolder === section.id ? "1px solid var(--navy)" : "1px solid var(--g100)", background:activeDocFolder === section.id ? "var(--navy-pale)" : "#fff" }}
                  >
                    <span className="budget-stat-label">{section.title}</span>
                    <strong>{section.docs.length}</strong>
                  </button>
                ))}
              </div>

              {docs.length === 0 && (
                <div style={{ textAlign:"center", padding:"32px", color:"var(--g400)", fontSize:13, background:"var(--g50)", borderRadius:8, border:"1px solid var(--g100)" }}>
                  No documents uploaded for this employee yet.
                </div>
              )}
              {docsBySection
                .filter(section => activeDocFolder === "all" || section.id === activeDocFolder)
                .map(section => (
                <div key={section.id} style={{ marginTop: section.id === "contracts" ? 0 : 20 }}>
                  <div style={{ fontWeight:800, fontSize:12, color:"var(--g500)", letterSpacing:".08em", textTransform:"uppercase", marginBottom:10 }}>
                    {section.title} <span style={{ fontWeight:600, color:"var(--g400)" }}>({section.docs.length})</span>
                  </div>
                  {section.docs.length === 0 ? (
                    <div style={{ padding:"16px 18px", border:"1px dashed var(--g200)", borderRadius:10, color:"var(--g400)", fontSize:13, background:"#fcfcfd" }}>
                      No {section.title.toLowerCase()} uploaded yet.
                    </div>
                  ) : section.docs.map(doc => {
                    const di = docIcon(doc.docType);
                    return (
                      <div key={doc.id} className="doc-card">
                        <div className="doc-icon" style={{ background:di.bg }}>
                          <span>{di.icon}</span>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:"var(--navy)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{doc.displayName}</div>
                          <div style={{ fontSize:11, color:"var(--g400)", marginTop:2 }}>
                            <span style={{ fontWeight:600, color:di.color, background:di.bg, borderRadius:4, padding:"1px 6px", marginRight:6 }}>{doc.docType}</span>
                            {doc.fileName} · {fmtBytes(doc.sizeBytes)} · Uploaded {fmtShort(doc.uploadedAt)} by {doc.uploadedBy}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="btn btn-primary btn-sm" onClick={() => downloadDoc(doc)}>
                            ↓ Download
                          </button>
                          {isHRAdmin && (
                            <button className="btn btn-ghost btn-sm" style={{ color:"#dc2626", borderColor:"#fca5a5" }} onClick={() => deleteDoc(doc.id)}>Remove</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── LEAVE TAB ── */}
          {activeTab === "leave" && (
            <div style={{ padding:"22px" }}>
              {/* Balance cards */}
              <div style={{ fontWeight:700, fontSize:13, color:"var(--navy)", marginBottom:12 }}>Leave Balances</div>
              <div className="leave-balance-grid" style={{ marginBottom:20 }}>
                {LEAVE_TYPES.filter(lt => lt.days !== null).map(lt => {
                  const empId = fresh.id;
                  const rem   = getLeaveBalance(empId, lt.id);
                  const pct   = Math.max(0, Math.min(100, (rem / lt.days) * 100));
                  const tone  = pct > 50 ? "#059669" : pct > 20 ? "#d97706" : "#dc2626";
                  return (
                    <div key={lt.id} className="leave-balance-card">
                      <div className="lb-type">{lt.name}</div>
                      <div className="lb-val" style={{ color:tone }}>{rem}</div>
                      <div className="lb-sub">of {lt.days} days remaining</div>
                      <div className="lb-bar"><div className="lb-bar-fill" style={{ width:`${pct}%`, background:tone }} /></div>
                    </div>
                  );
                })}
                <div className="leave-balance-card">
                  <div className="lb-type">Unpaid Leave</div>
                  <div className="lb-val" style={{ color:"var(--g400)" }}>∞</div>
                  <div className="lb-sub">No annual limit</div>
                  <div className="lb-bar" />
                </div>
              </div>

              {/* Leave history table */}
              <div style={{ fontWeight:700, fontSize:13, color:"var(--navy)", marginBottom:12 }}>Leave History ({empLeave.length})</div>
              {empLeave.length === 0 ? (
                <div style={{ textAlign:"center", padding:"28px", color:"var(--g400)", fontSize:13, background:"var(--g50)", borderRadius:8, border:"1px solid var(--g100)" }}>No leave applications on record.</div>
              ) : (
                <div className="table-wrap" style={{ borderRadius:"var(--r-sm)", border:"1px solid var(--g100)" }}>
                  <table style={{ fontSize:13 }}>
                    <thead><tr><th>Ref</th><th>Leave Type</th><th>Period</th><th>Days</th><th>Status</th><th>Applied</th><th>Reason</th></tr></thead>
                    <tbody>
                      {empLeave.map(a => {
                        const lt = LEAVE_TYPES.find(l => l.id === a.leaveTypeId);
                        return (
                          <tr key={a.id}>
                            <td><span className="ref" style={{ fontSize:11 }}>{a.id}</span></td>
                            <td style={{ fontWeight:600 }}>{lt?.name}</td>
                            <td className="text-gray" style={{ whiteSpace:"nowrap" }}>{fmtShort(a.startDate)} – {fmtShort(a.endDate)}</td>
                            <td style={{ fontWeight:700, textAlign:"center" }}>{a.numDays}</td>
                            <td><LeaveStatusBadge status={a.status} /></td>
                            <td className="text-gray" style={{ whiteSpace:"nowrap" }}>{fmtShort(a.appliedAt)}</td>
                            <td className="text-gray" style={{ maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.reason}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SYSTEM ACCOUNT TAB ── */}
          {activeTab === "system" && (
            <div style={{ padding:"22px" }}>
              {linkedUser ? (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:14, padding:"16px", background:"var(--navy-pale)", borderRadius:10, marginBottom:20 }}>
                    <div style={{ width:44, height:44, borderRadius:"50%", background:"var(--navy)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, flexShrink:0 }}>
                      {linkedUser.avatar}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:15, color:"var(--navy)" }}>{linkedUser.name}</div>
                      <div style={{ fontSize:12, color:"var(--g500)" }}>{linkedUser.email}</div>
                      <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, fontWeight:700, background:MODULE_ROLE_COLORS[uMR]+"22", color:MODULE_ROLE_COLORS[uMR], border:`1px solid ${MODULE_ROLE_COLORS[uMR]}44`, borderRadius:10, padding:"2px 10px" }}>{MODULE_ROLE_LABELS[uMR]}</span>
                        <span style={{ fontSize:11, fontWeight:600, background:"var(--navy-pale)", color:"var(--navy)", borderRadius:10, padding:"2px 10px" }}>{ROLE_LABELS[linkedUser.role] || linkedUser.role}</span>
                        <span style={{ fontSize:11, fontWeight:600, background: linkedUser.isActive===false ? "#fee2e2" : "#d1fae5", color: linkedUser.isActive===false ? "#991b1b" : "#065f46", borderRadius:10, padding:"2px 10px" }}>
                          {linkedUser.isActive===false ? "Deactivated" : linkedUser.lockedAt ? "Locked" : "Active"}
                        </span>
                      </div>
                    </div>
                    {setPage && isHRAdmin && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setPage("hr_users")}>Manage Account</button>
                    )}
                  </div>
                  <div className="hr-profile-grid" style={{ border:"1px solid var(--g100)", borderRadius:8 }}>
                    {[
                      ["User ID",           linkedUser.id],
                      ["Department",        linkedUser.dept],
                      ["Position",          getUserPosition(linkedUser)],
                      ["Failed Logins",     String(linkedUser.failedLoginAttempts || 0)],
                      ["Account Locked",    linkedUser.lockedAt ? "Yes — " + fmtShort(linkedUser.lockedAt) : "No"],
                      ["Last PW Reset",     linkedUser.lastPasswordResetAt ? fmtShort(linkedUser.lastPasswordResetAt) : "Never"],
                    ].map(([label, value]) => (
                      <div className="hr-profile-field" key={label}>
                        <div className="hr-profile-label">{label}</div>
                        <div className="hr-profile-value">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign:"center", padding:"40px", color:"var(--g400)" }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>🔗</div>
                  <div style={{ fontWeight:700, fontSize:15, color:"var(--navy)", marginBottom:8 }}>No System Account Linked</div>
                  <div style={{ fontSize:13, marginBottom:20 }}>This employee doesn't have a login account yet. Match is based on email address.</div>
                  {setPage && isHRAdmin && (
                    <button className="btn btn-amber" onClick={() => setPage("hr_users")}>Create Account in User Management</button>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {showForm && (
          <EmployeeFormModal
            form={form} setF={setF} positions={positions}
            employees={employees} editEmp={editEmp}
            saveError={saveError}
            onSave={saveEmployee} onClose={() => { setSaveError(""); setShowForm(false); setEditEmp(null); }}
          />
        )}
        {biodataEmp && <BiodataPDFModal emp={biodataEmp} onClose={() => setBiodataEmp(null)} />}
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">{mode === "files" ? "Staff Files" : "Employee Registry"}</div>
          <div className="page-sub">{employees.length} employee{employees.length !== 1 ? "s" : ""} · {employees.filter(e=>e.status==="Active").length} active · {mode === "files" ? "select a staff member to view their documents, leave forms, and uploaded files" : "full staff files with biodata, documents, and leave history"}</div>
        </div>
        {mode !== "files" && (
          <button className="btn btn-amber" onClick={openAdd}>
            <AppButtonIcon name="add" tone="amber" size={13} /> Add Employee
          </button>
        )}
      </div>

      {toast && <div className="alert alert-green" style={{ marginBottom:14 }}>{toast}</div>}

      <div className="filters" style={{ marginBottom:16 }}>
        <input className="f-input" placeholder="Search name, email, position…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="f-input" value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}>
          <option value="all">All Departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="f-input" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {EMP_STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Emp ID</th>
                <th>Employee</th>
                <th>Department</th>
                <th>Position</th>
                <th>Type</th>
                <th>Reports To</th>
                <th>Date Joined</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:"center", padding:"36px", color:"var(--g400)" }}>
                  {employees.length === 0 ? "No employees yet. Click \"Add Employee\" to get started." : "No employees match your filters."}
                </td></tr>
              )}
              {filtered.map(emp => (
                <tr key={emp.id} style={{ cursor:"pointer" }}>
                  <td onClick={() => openProfile(emp)}>
                    <span className="ref" style={{ fontSize:11 }}>{emp.employeeId || "—"}</span>
                  </td>
                  <td onClick={() => openProfile(emp)}>
                    <div className="flex items-center gap-3">
                      <div className="avatar" style={{ background:"#0891b2", color:"#fff" }}>{empInitials(emp.name)}</div>
                      <div>
                        <div style={{ fontWeight:600, color:"var(--navy)" }}>{emp.name}</div>
                        <div className="text-xs text-gray">{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-gray" onClick={() => openProfile(emp)}>{emp.department || "—"}</td>
                  <td className="text-gray" onClick={() => openProfile(emp)}>{emp.position || "—"}</td>
                  <td className="text-gray" onClick={() => openProfile(emp)}>{emp.employmentType || "—"}</td>
                  <td className="text-gray" onClick={() => openProfile(emp)}>{supervisorName(emp.supervisorId)}</td>
                  <td className="text-gray" onClick={() => openProfile(emp)}>
                    {emp.dateJoined ? new Date(emp.dateJoined).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—"}
                  </td>
                  <td onClick={() => openProfile(emp)}>
                    <span className="sbadge" style={statusStyle(emp.status)}>{emp.status || "Active"}</span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(emp)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color:"var(--red)" }} onClick={() => deleteEmployee(emp)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <EmployeeFormModal
          form={form} setF={setF} positions={positions}
          employees={employees} editEmp={editEmp}
          saveError={saveError}
          onSave={saveEmployee} onClose={() => { setSaveError(""); setShowForm(false); setEditEmp(null); }}
        />
      )}
      {biodataEmp && <BiodataPDFModal emp={biodataEmp} onClose={() => setBiodataEmp(null)} />}
    </div>
  );
}

function EmployeeFormModal({ form, setF, positions, employees, editEmp, onSave, onClose, saveError }) {
  const supervisorOptions = employees.filter(e => editEmp ? e.id !== editEmp.id : true);

  // Departments: always use _hrDepartments (the live HR list); fall back to DEPARTMENTS constant only if empty
  const deptOptions = _hrDepartments.length ? _hrDepartments.map(d => d.name) : DEPARTMENTS;

  // Positions: filter _hrPositions by selected department first.
  // If _hrPositions has ANY entries for this department use only those.
  // If _hrPositions is entirely empty fall back to the full system positions list.
  // If _hrPositions has entries but none for this department show a clear "none defined" message.
  const selectedHRDept = _hrDepartments.find(d => d.name === form.department);
  const hrPosForDept   = selectedHRDept
    ? _hrPositions.filter(p => p.departmentId === selectedHRDept.id)
    : [];
  const hrHasAnyPositions = _hrPositions.length > 0;
  // When HR positions exist but none are defined for this dept, positionOptions is empty
  // so the select will show only the blank prompt — intentional, admin should add positions first.
  const positionOptions = hrHasAnyPositions ? hrPosForDept.map(p => p.name) : positions;

  const sectionHead = (title) => (
    <div style={{ gridColumn:"1/-1", padding:"8px 0 4px", borderBottom:"2px solid var(--amber)", marginTop:12, marginBottom:4 }}>
      <span style={{ fontSize:11, fontWeight:800, color:"var(--navy)", textTransform:"uppercase", letterSpacing:".08em" }}>{title}</span>
    </div>
  );

  return (
    <Modal
      title={editEmp ? "Edit Employee" : "Add Employee"}
      onClose={onClose}
      size="modal-lg"
      footer={
        <>
          {saveError && (
            <div style={{ flex:1, color:"#dc2626", fontSize:13, fontWeight:600, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"8px 12px" }}>
              ⚠ {saveError}
            </div>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-amber" onClick={onSave}>Save Employee</button>
        </>
      }
    >
      {/* Employee ID banner */}
      <div style={{ background:"var(--navy-pale)", borderRadius:"var(--r-sm)", padding:"10px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:11, fontWeight:700, color:"var(--g500)", textTransform:"uppercase", letterSpacing:".06em" }}>Employee ID</span>
        <span style={{ fontFamily:"var(--serif)", fontSize:17, fontWeight:800, color: editEmp ? "var(--navy)" : "var(--g400)", letterSpacing:".04em" }}>
          {editEmp?.employeeId || form.employeeId || "Auto-assigned on save"}
        </span>
        <span style={{ fontSize:11, color:"var(--g400)", marginLeft:"auto" }}>Auto-generated · read only</span>
      </div>

      <div className="form-grid">

        {/* ── Personal Information ── */}
        {sectionHead("Personal Information")}
        <FormField label="Full Name *">
          <input value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="First / Last name" autoFocus />
        </FormField>
        <FormField label="Other Names">
          <input value={form.otherNames||""} onChange={e=>setF("otherNames",e.target.value)} placeholder="Middle name(s)" />
        </FormField>
        <FormField label="Gender">
          <select value={form.gender||""} onChange={e=>setF("gender",e.target.value)}>
            <option value="">— Select —</option>
            <option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option>
          </select>
        </FormField>
        <FormField label="Date of Birth">
          <input type="date" value={form.dob||""} onChange={e=>setF("dob",e.target.value)} />
        </FormField>
        <FormField label="Nationality">
          <input value={form.nationality||""} onChange={e=>setF("nationality",e.target.value)} placeholder="e.g. Ugandan" />
        </FormField>
        <FormField label="Marital Status">
          <select value={form.maritalStatus||""} onChange={e=>setF("maritalStatus",e.target.value)}>
            <option value="">— Select —</option>
            <option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
          </select>
        </FormField>
        <FormField label="National ID No.">
          <input value={form.nationalId||""} onChange={e=>setF("nationalId",e.target.value)} placeholder="e.g. CM900100000001A" />
        </FormField>
        <FormField label="Passport No.">
          <input value={form.passportNo||""} onChange={e=>setF("passportNo",e.target.value)} placeholder="e.g. A1234567" />
        </FormField>
        <FormField label="TIN">
          <input value={form.tin||""} onChange={e=>setF("tin",e.target.value)} placeholder="Tax Identification Number" />
        </FormField>
        <FormField label="NSSF No.">
          <input value={form.nssfNo||""} onChange={e=>setF("nssfNo",e.target.value)} placeholder="NSSF Number" />
        </FormField>

        {/* ── Contact Details ── */}
        {sectionHead("Contact Details")}
        <FormField label="Work Email *">
          <input type="email" value={form.email} onChange={e=>setF("email",e.target.value)} placeholder="jane@iyd.org" />
        </FormField>
        <FormField label="Personal Email">
          <input type="email" value={form.personalEmail||""} onChange={e=>setF("personalEmail",e.target.value)} placeholder="jane@gmail.com" />
        </FormField>
        <FormField label="Phone Number">
          <input type="tel" value={form.phone||""} onChange={e=>setF("phone",e.target.value)} placeholder="+256 700 000 000" />
        </FormField>
        <FormField label="Alternative Phone">
          <input type="tel" value={form.altPhone||""} onChange={e=>setF("altPhone",e.target.value)} placeholder="+256 700 000 001" />
        </FormField>
        <FormField label="Home Address" full>
          <input value={form.address||""} onChange={e=>setF("address",e.target.value)} placeholder="Street / Plot / P.O. Box" />
        </FormField>
        <FormField label="City / Town">
          <input value={form.city||""} onChange={e=>setF("city",e.target.value)} placeholder="Kampala" />
        </FormField>
        <FormField label="District">
          <input value={form.district||""} onChange={e=>setF("district",e.target.value)} placeholder="Kampala" />
        </FormField>
        <FormField label="Country">
          <input value={form.country||""} onChange={e=>setF("country",e.target.value)} placeholder="Uganda" />
        </FormField>

        {/* ── Employment Details ── */}
        {sectionHead("Employment Details")}
        <FormField label="Department">
          <select value={form.department} onChange={e=>{ setF("department",e.target.value); setF("position",""); }}>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </FormField>
        <FormField label="Position"
          hint={hrHasAnyPositions && hrPosForDept.length === 0 && form.department
            ? `No positions defined for ${form.department} yet — add them in HR › Positions.`
            : undefined}
        >
          <select value={form.position} onChange={e=>setF("position",e.target.value)}>
            <option value="">— Select position —</option>
            {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </FormField>
        <FormField label="Employment Type">
          <select value={form.employmentType} onChange={e=>setF("employmentType",e.target.value)}>
            {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Status">
          <select value={form.status} onChange={e=>setF("status",e.target.value)}>
            {EMP_STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="Date Joined">
          <input type="date" value={form.dateJoined} onChange={e=>setF("dateJoined",e.target.value)} />
        </FormField>
        <FormField label="Contract End Date">
          <input type="date" value={form.contractEndDate||""} onChange={e=>setF("contractEndDate",e.target.value)} />
        </FormField>
        <FormField label="Supervisor / Reports To" full>
          <select value={form.supervisorId||""} onChange={e=>setF("supervisorId",e.target.value)}>
            <option value="">— No supervisor —</option>
            {supervisorOptions.map(e => <option key={e.id} value={e.id}>{e.name} · {e.position || e.department}</option>)}
          </select>
        </FormField>

        {/* ── Education & Qualifications ── */}
        {sectionHead("Education & Qualifications")}
        <FormField label="Highest Qualification">
          <select value={form.qualification||""} onChange={e=>setF("qualification",e.target.value)}>
            <option value="">— Select —</option>
            {["Certificate","Diploma","Bachelor's Degree","Postgraduate Diploma","Master's Degree","PhD","Other"].map(q=><option key={q}>{q}</option>)}
          </select>
        </FormField>
        <FormField label="Institution">
          <input value={form.institution||""} onChange={e=>setF("institution",e.target.value)} placeholder="University / College name" />
        </FormField>
        <FormField label="Field of Study">
          <input value={form.fieldOfStudy||""} onChange={e=>setF("fieldOfStudy",e.target.value)} placeholder="e.g. Development Studies" />
        </FormField>
        <FormField label="Year Graduated">
          <input type="number" min="1950" max="2099" value={form.yearGraduated||""} onChange={e=>setF("yearGraduated",e.target.value)} placeholder="e.g. 2018" />
        </FormField>

        {/* ── Next of Kin ── */}
        {sectionHead("Next of Kin")}
        <FormField label="Full Name">
          <input value={form.kinName||""} onChange={e=>setF("kinName",e.target.value)} placeholder="Next of kin name" />
        </FormField>
        <FormField label="Relationship">
          <input value={form.kinRelationship||""} onChange={e=>setF("kinRelationship",e.target.value)} placeholder="e.g. Spouse, Parent, Sibling" />
        </FormField>
        <FormField label="Phone">
          <input type="tel" value={form.kinPhone||""} onChange={e=>setF("kinPhone",e.target.value)} placeholder="+256 700 000 000" />
        </FormField>
        <FormField label="Email">
          <input type="email" value={form.kinEmail||""} onChange={e=>setF("kinEmail",e.target.value)} placeholder="kin@email.com" />
        </FormField>
        <FormField label="Address" full>
          <input value={form.kinAddress||""} onChange={e=>setF("kinAddress",e.target.value)} placeholder="Residential address" />
        </FormField>

        {/* ── Emergency Contact ── */}
        {sectionHead("Emergency Contact")}
        <FormField label="Full Name">
          <input value={form.emergencyName||""} onChange={e=>setF("emergencyName",e.target.value)} placeholder="Emergency contact name" />
        </FormField>
        <FormField label="Relationship">
          <input value={form.emergencyRelationship||""} onChange={e=>setF("emergencyRelationship",e.target.value)} placeholder="e.g. Spouse, Parent" />
        </FormField>
        <FormField label="Phone">
          <input type="tel" value={form.emergencyPhone||""} onChange={e=>setF("emergencyPhone",e.target.value)} placeholder="+256 700 000 000" />
        </FormField>
        <FormField label="Alternative Phone">
          <input type="tel" value={form.emergencyAltPhone||""} onChange={e=>setF("emergencyAltPhone",e.target.value)} placeholder="+256 700 000 001" />
        </FormField>

      </div>
    </Modal>
  );
}

// ── Employee Biodata PDF Modal ─────────────────────────────────────────────────
function BiodataPdfRow({ fields }) {
  const formatValue = (value) => value || "—";
  return (
    <div className="pdf-row">
      {fields.map(([label, value]) => (
        <div className="pdf-field" key={label}>
          <div className="pdf-fl">{label}</div>
          <div className="pdf-fv">{formatValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

function BiodataPdfSection({ title, children }) {
  return (
    <div className="pdf-sec">
      <div className="pdf-sec-title">{title}</div>
      {children}
    </div>
  );
}

function BiodataPDFModal({ emp, onClose }) {
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"}) : "—";
  const v = (val) => val || "—";

  const supervisorName = emp.supervisorId
    ? (_employees.find(e => e.id === emp.supervisorId)?.name || _users.find(u => u.id === emp.supervisorId)?.name || "—")
    : "—";

  return (
    <Modal title="Employee Biodata" onClose={onClose} size="modal-lg"
      footer={
        <div className="flex gap-3 items-center">
          <span className="text-xs text-gray">Use Ctrl+P / Cmd+P to save as PDF</span>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <AppButtonIcon name="download" tone="navy" /> Print / Download PDF
          </button>
        </div>
      }
    >
      <div className="pdf-doc" style={{ fontFamily:"Roboto, system-ui, sans-serif" }}>
        {/* Branded header */}
        <div className="report-header">
          <div className="report-brand">
            <img src={inspireLogo} alt="IYD logo" style={{ width:56, height:56, objectFit:"contain", borderRadius:8, background:"#fff", padding:4 }} />
            <div>
              <div className="pdf-logo">{ORG_NAME}</div>
              <div className="text-xs text-gray" style={{ fontWeight:600, letterSpacing:".04em" }}>INSPIRE YOUTH FOR DEVELOPMENT (IYD)</div>
              <div className="text-xs text-gray">Employee Biodata · {APP_SUB}</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="ref" style={{ fontSize:15 }}>{emp.employeeId || "—"}</div>
            <div className="text-xs text-gray mt-1">Generated: {new Date().toLocaleDateString("en-GB")}</div>
            <div style={{ marginTop:6, display:"inline-block", padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700,
              background: emp.status === "Active" ? "#d1fae5" : "#fee2e2",
              color:       emp.status === "Active" ? "#065f46" : "#991b1b" }}>
              {emp.status || "Active"}
            </div>
          </div>
        </div>

        {/* Name banner */}
        <div style={{ background:"var(--navy)", color:"#fff", padding:"14px 20px", marginBottom:0, borderRadius:"var(--r-sm) var(--r-sm) 0 0" }}>
          <div style={{ fontSize:20, fontFamily:"var(--serif)", fontWeight:800 }}>{emp.name}{emp.otherNames ? ` (${emp.otherNames})` : ""}</div>
          <div style={{ fontSize:13, opacity:.8, marginTop:2 }}>{v(emp.position)} · {v(emp.department)} · {v(emp.employmentType)}</div>
        </div>

        <BiodataPdfSection title="Employment Details">
          <BiodataPdfRow fields={[["Employee ID", emp.employeeId], ["Department", emp.department]]} />
          <BiodataPdfRow fields={[["Position", emp.position], ["Employment Type", emp.employmentType]]} />
          <BiodataPdfRow fields={[["Date Joined", fmtDate(emp.dateJoined)], ["Contract End Date", fmtDate(emp.contractEndDate)]]} />
          <BiodataPdfRow fields={[["Reports To", supervisorName], ["Status", emp.status]]} />
        </BiodataPdfSection>

        <BiodataPdfSection title="Personal Information">
          <BiodataPdfRow fields={[["Full Name", emp.name], ["Other Names", emp.otherNames]]} />
          <BiodataPdfRow fields={[["Gender", emp.gender], ["Date of Birth", fmtDate(emp.dob)]]} />
          <BiodataPdfRow fields={[["Nationality", emp.nationality], ["Marital Status", emp.maritalStatus]]} />
          <BiodataPdfRow fields={[["National ID No.", emp.nationalId], ["Passport No.", emp.passportNo]]} />
          <BiodataPdfRow fields={[["TIN", emp.tin], ["NSSF No.", emp.nssfNo]]} />
        </BiodataPdfSection>

        <BiodataPdfSection title="Contact Details">
          <BiodataPdfRow fields={[["Work Email", emp.email], ["Personal Email", emp.personalEmail]]} />
          <BiodataPdfRow fields={[["Phone", emp.phone], ["Alternative Phone", emp.altPhone]]} />
          <BiodataPdfRow fields={[["Address", emp.address], ["City / Town", emp.city]]} />
          <BiodataPdfRow fields={[["District", emp.district], ["Country", emp.country]]} />
        </BiodataPdfSection>

        <BiodataPdfSection title="Education & Qualifications">
          <BiodataPdfRow fields={[["Highest Qualification", emp.qualification], ["Institution", emp.institution]]} />
          <BiodataPdfRow fields={[["Field of Study", emp.fieldOfStudy], ["Year Graduated", emp.yearGraduated]]} />
        </BiodataPdfSection>

        <BiodataPdfSection title="Next of Kin">
          <BiodataPdfRow fields={[["Full Name", emp.kinName], ["Relationship", emp.kinRelationship]]} />
          <BiodataPdfRow fields={[["Phone", emp.kinPhone], ["Email", emp.kinEmail]]} />
          {emp.kinAddress && <BiodataPdfRow fields={[["Address", emp.kinAddress]]} />}
        </BiodataPdfSection>

        <BiodataPdfSection title="Emergency Contact">
          <BiodataPdfRow fields={[["Full Name", emp.emergencyName], ["Relationship", emp.emergencyRelationship]]} />
          <BiodataPdfRow fields={[["Phone", emp.emergencyPhone], ["Alternative Phone", emp.emergencyAltPhone]]} />
        </BiodataPdfSection>

        {/* Signature block */}
        <div className="pdf-sec">
          <div className="pdf-sec-title">Declaration</div>
          <div style={{ fontSize:12, color:"var(--g500)", lineHeight:1.7 }}>
            I hereby confirm that the information provided above is accurate and complete to the best of my knowledge.
          </div>
          <div style={{ display:"flex", gap:40, marginTop:24 }}>
            <div style={{ flex:1 }}>
              <div style={{ borderTop:"1px solid var(--g300)", paddingTop:6, fontSize:11, color:"var(--g400)" }}>Employee Signature &amp; Date</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ borderTop:"1px solid var(--g300)", paddingTop:6, fontSize:11, color:"var(--g400)" }}>HR Officer Signature &amp; Date</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ borderTop:"1px solid var(--g300)", paddingTop:6, fontSize:11, color:"var(--g400)" }}>Supervisor Signature &amp; Date</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop:24, paddingTop:10, borderTop:"1px solid var(--g200)", fontSize:11, color:"var(--g400)", textAlign:"center" }}>
          Generated by {APP_SUB} · {ORG_NAME} · {new Date().toLocaleDateString("en-GB")}
        </div>
      </div>
    </Modal>
  );
}

// ── HR: Org Structure ─────────────────────────────────────────────────────────
function OrgStructurePage({ setPage }) {
  const [tab, setTab] = useState("grouped"); // "grouped" | "tree"

  // Read globals directly on every render — no stale useState snapshots
  const employees   = _employees;
  const departments = _hrDepartments;
  const hrPositions = _hrPositions;       // used to enrich position rows

  // Build lookup maps
  const empMap      = new Map(employees.map(e => [e.id, e]));
  const deptColorMap = new Map(departments.map(d => [d.name, d.color]));
  // hrPos lookup: positionName → hrPosition record (for grade / description)
  const hrPosMap    = new Map(hrPositions.map(p => [p.name, p]));
  // ── Tree helpers ──
  const childrenMap = new Map();
  employees.forEach(e => {
    const pid = e.supervisorId || "__root__";
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid).push(e);
  });
  const rootCandidates = (childrenMap.get("__root__") || []).concat(
    employees.filter(e => e.supervisorId && !empMap.has(e.supervisorId))
  );
  const rootIds    = new Set(rootCandidates.map(e => e.id));
  const uniqueRoots = [...rootIds].map(id => empMap.get(id)).filter(Boolean);

  function TreeNode({ emp }) {
    const children  = childrenMap.get(emp.id) || [];
    const deptColor = deptColorMap.get(emp.department) || "#0891b2";
    const hrPos     = hrPosMap.get(emp.position);
    return (
      <div className="org-tree-node">
        <div className="org-tree-row">
          <div className="org-emp-avatar" style={{ background:deptColor, flexShrink:0, width:34, height:34, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff" }}>
            {empInitials(emp.name)}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="org-emp-name">{emp.name}</div>
            <div className="org-emp-meta">
              {emp.position || "—"}
              {hrPos?.grade ? ` (${hrPos.grade})` : ""}
              {" · "}{emp.department}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            {children.length > 0 && (
              <span style={{ fontSize:11, color:"var(--g400)" }}>{children.length} direct</span>
            )}
            <span className="sbadge" style={emp.status==="Active"?{background:"#d1fae5",color:"#065f46"}:{background:"#fee2e2",color:"#991b1b"}}>
              {emp.status || "Active"}
            </span>
          </div>
        </div>
        {children.length > 0 && (
          <div className="org-tree-children">
            {children.map(c => <TreeNode key={c.id} emp={c} />)}
          </div>
        )}
      </div>
    );
  }

  // ── Grouped view: all HR departments + their defined positions as sub-headings ──
  // For each dept show: defined positions from _hrPositions (with headcount),
  // then employees bucketed under their position.
  const knownDeptNames = new Set(departments.map(d => d.name));
  const unclassified   = employees.filter(e => !knownDeptNames.has(e.department));

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Organisational Structure</div>
          <div className="page-sub">
            {employees.length} employee{employees.length!==1?"s":""} · {departments.length} department{departments.length!==1?"s":""} · {hrPositions.length} defined position{hrPositions.length!==1?"s":""}
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage("hr_departments")}>
            <AppButtonIcon name="doc" tone="teal" size={13} /> Departments
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage("hr_positions")}>
            <AppButtonIcon name="admin" tone="teal" size={13} /> Positions
          </button>
          <button className="btn btn-amber btn-sm" onClick={() => setPage("hr_employees")}>
            <AppButtonIcon name="users" tone="amber" size={13} /> Employees
          </button>
        </div>
      </div>

      <div className="org-tabs">
        <button className={`org-tab${tab==="grouped"?" active":""}`} onClick={()=>setTab("grouped")}>By Department</button>
        <button className={`org-tab${tab==="tree"?" active":""}`}    onClick={()=>setTab("tree")}>Reporting Hierarchy</button>
      </div>

      {/* ── Grouped by Department ── */}
      {tab === "grouped" && (
        <div>
          {departments.map(dept => {
            const deptEmps      = employees.filter(e => e.department === dept.name);
            // Positions defined in HR Positions for this dept (from _hrPositions)
            const definedPos    = hrPositions.filter(p => p.departmentId === dept.id);
            // Build position → employees map using defined position names first, then any free-text positions
            const posEmpMap     = new Map();
            deptEmps.forEach(e => {
              const key = e.position || "Unassigned";
              if (!posEmpMap.has(key)) posEmpMap.set(key, []);
              posEmpMap.get(key).push(e);
            });
            // Order: defined positions first (in order added), then any remaining
            const definedPosNames = definedPos.map(p => p.name);
            const extraPosNames   = [...posEmpMap.keys()].filter(k => !definedPosNames.includes(k));
            const orderedPositions = [...definedPosNames, ...extraPosNames];

            return (
              <div key={dept.id} className="org-dept-section">
                {/* Dept header — rich: code, name, head, description */}
                <div className="org-dept-header" style={{ background: dept.color }}>
                  <div style={{ flex:1 }}>
                    <div className="org-dept-code">{dept.code}</div>
                    <div className="org-dept-name">{dept.name}</div>
                    {dept.description && (
                      <div style={{ fontSize:11, opacity:.75, marginTop:2 }}>{dept.description}</div>
                    )}
                    {dept.headId && empMap.get(dept.headId) && (
                      <div style={{ fontSize:11, opacity:.8, marginTop:4 }}>
                        Head: <strong>{empMap.get(dept.headId).name}</strong>
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                    <span className="org-dept-count">{deptEmps.length} employee{deptEmps.length!==1?"s":""}</span>
                    <span style={{ fontSize:10, opacity:.7 }}>{definedPos.length} position{definedPos.length!==1?"s":""} defined</span>
                  </div>
                </div>

                <div className="org-dept-body">
                  {orderedPositions.length === 0 ? (
                    <div style={{ padding:"14px 18px", color:"var(--g400)", fontSize:12 }}>
                      No employees in this department yet.
                      {definedPos.length > 0 && (
                        <span style={{ marginLeft:6, color:"var(--navy-light)" }}>
                          {definedPos.length} position{definedPos.length!==1?"s":""} defined: {definedPos.map(p=>p.name).join(", ")}.
                        </span>
                      )}
                    </div>
                  ) : (
                    orderedPositions.map(posName => {
                      const posEmps   = posEmpMap.get(posName) || [];
                      const hrPos     = hrPosMap.get(posName);
                      const isDefined = definedPosNames.includes(posName);
                      return (
                        <div key={posName} className="org-pos-group">
                          {/* Position sub-header: name + grade + description from HR Positions */}
                          <div className="org-pos-label" style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span>{posName}</span>
                            {hrPos?.grade && (
                              <span style={{ fontWeight:400, color:"var(--g400)", textTransform:"none", letterSpacing:0 }}>· {hrPos.grade}</span>
                            )}
                            {hrPos?.description && (
                              <span style={{ fontWeight:400, color:"var(--g400)", textTransform:"none", letterSpacing:0, fontStyle:"italic" }}>— {hrPos.description}</span>
                            )}
                            {!isDefined && (
                              <span style={{ fontSize:10, background:"#fef3c7", color:"#92400e", padding:"1px 6px", borderRadius:4, fontWeight:600 }}>not in HR Positions</span>
                            )}
                            <span style={{ marginLeft:"auto", fontWeight:600, color:"var(--navy)" }}>{posEmps.length}</span>
                          </div>
                          {posEmps.map(emp => {
                            const supervisor = emp.supervisorId ? empMap.get(emp.supervisorId) : null;
                            return (
                              <div key={emp.id} className="org-emp-row">
                                <div className="org-emp-avatar" style={{ background:dept.color, width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff" }}>
                                  {empInitials(emp.name)}
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div className="org-emp-name">{emp.name}</div>
                                  <div className="org-emp-meta">
                                    {emp.employmentType || "Full-time"}
                                    {supervisor ? ` · Reports to: ${supervisor.name}` : ""}
                                  </div>
                                </div>
                                <span className="sbadge" style={emp.status==="Active"?{background:"#d1fae5",color:"#065f46"}:{background:"#fee2e2",color:"#991b1b"}}>
                                  {emp.status || "Active"}
                                </span>
                              </div>
                            );
                          })}
                          {/* Show defined positions that have zero employees in them */}
                          {isDefined && posEmps.length === 0 && (
                            <div style={{ padding:"10px 18px", fontSize:12, color:"var(--g400)", fontStyle:"italic" }}>
                              No employees in this position yet.
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}

          {/* Employees whose department isn't in the HR departments list */}
          {unclassified.length > 0 && (
            <div className="org-dept-section">
              <div className="org-dept-header" style={{ background:"#6b7280" }}>
                <div><div className="org-dept-code">OTHER</div><div className="org-dept-name">Other / Unclassified</div></div>
                <span className="org-dept-count">{unclassified.length}</span>
              </div>
              <div className="org-dept-body">
                {unclassified.map(emp => (
                  <div key={emp.id} className="org-emp-row">
                    <div className="org-emp-avatar" style={{ background:"#6b7280", width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff" }}>
                      {empInitials(emp.name)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div className="org-emp-name">{emp.name}</div>
                      <div className="org-emp-meta">{emp.position || "—"} · {emp.department}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {employees.length === 0 && departments.length === 0 && (
            <div className="org-empty-state">
              Nothing set up yet. Start by{" "}
              <span style={{ color:"var(--navy)", cursor:"pointer", fontWeight:600 }} onClick={() => setPage("hr_departments")}>adding departments</span>
              {" "}and{" "}
              <span style={{ color:"var(--navy)", cursor:"pointer", fontWeight:600 }} onClick={() => setPage("hr_employees")}>adding employees</span>.
            </div>
          )}
        </div>
      )}

      {/* ── Reporting Hierarchy (Tree) ── */}
      {tab === "tree" && (
        <div className="card">
          <div className="card-body">
            {employees.length === 0 ? (
              <div className="org-empty-state">No employees yet. <span style={{ color:"var(--navy)", cursor:"pointer", fontWeight:600 }} onClick={() => setPage("hr_employees")}>Add employees →</span></div>
            ) : uniqueRoots.length === 0 ? (
              <div className="org-empty-state">Every employee has a supervisor — no top-level root found. Ensure at least one employee has no supervisor set.</div>
            ) : (
              <div className="org-tree-root">
                {uniqueRoots.map(emp => <TreeNode key={emp.id} emp={emp} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HR: Department Manager ─────────────────────────────────────────────────────
function HRDepartmentManager({ onSystemChange }) {
  const [departments, setDepartments] = useState([..._hrDepartments]);
  const [showForm, setShowForm]       = useState(false);
  const [editDept, setEditDept]       = useState(null);
  const [toast, setToast]             = useState("");
  const blankForm = { name:"", code:"", description:"", color: DEPT_COLOR_PALETTE[0], headId:"" };
  const [form, setForm]               = useState(blankForm);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const sync = () => {
    setDepartments([..._hrDepartments]);
    saveState();
    if (onSystemChange) onSystemChange();
  };

  const openAdd = () => { setEditDept(null); setForm({ ...blankForm, color: DEPT_COLOR_PALETTE[_hrDepartments.length % DEPT_COLOR_PALETTE.length] }); setShowForm(true); };
  const openEdit = (d) => { setEditDept(d); setForm({ name:d.name, code:d.code, description:d.description||"", color:d.color||DEPT_COLOR_PALETTE[0], headId:d.headId||"" }); setShowForm(true); };

  const saveDept = () => {
    if (!form.name.trim()) return;
    if (editDept) {
      Object.assign(editDept, { ...form, name:form.name.trim(), code:form.code.trim().toUpperCase() });
      showToast(`Department updated: ${form.name}`);
    } else {
      const exists = _hrDepartments.some(d => d.name.toLowerCase() === form.name.trim().toLowerCase());
      if (exists) { showToast("A department with that name already exists."); return; }
      _hrDepartments.push({ id:`hd-${Date.now()}`, ...form, name:form.name.trim(), code:form.code.trim().toUpperCase(), createdAt: new Date().toISOString() });
      showToast(`Department added: ${form.name}`);
    }
    sync();
    setShowForm(false);
    setEditDept(null);
  };

  const deleteDept = (dept) => {
    const empCount = _employees.filter(e => e.department === dept.name).length;
    if (empCount > 0) { showToast(`Cannot delete: ${empCount} employee(s) are in this department.`); return; }
    if (!window.confirm(`Delete department "${dept.name}"?`)) return;
    _hrDepartments = _hrDepartments.filter(d => d.id !== dept.id);
    _hrPositions   = _hrPositions.filter(p => p.departmentId !== dept.id);
    sync();
    showToast(`Deleted: ${dept.name}`);
  };

  const empCount  = (deptName) => _employees.filter(e => e.department === deptName).length;
  const posCount  = (deptId)   => _hrPositions.filter(p => p.departmentId === deptId).length;
  const headName  = (headId)   => _employees.find(e => e.id === headId)?.name || _users.find(u => u.id === headId)?.name || "—";

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Departments</div>
          <div className="page-sub">{departments.length} department{departments.length!==1?"s":""} · Define your organisational units</div>
        </div>
        <button className="btn btn-amber" onClick={openAdd}>
          <AppButtonIcon name="add" tone="amber" size={13} /> Add Department
        </button>
      </div>

      {toast && <div className={`alert ${toast.startsWith("Cannot")||toast.startsWith("A dept") ? "alert-red" : "alert-green"}`} style={{ marginBottom:14 }}>{toast}</div>}

      {departments.length === 0 ? (
        <div className="card"><div className="card-body org-empty-state">No departments yet. Click "Add Department" to create your first one.</div></div>
      ) : (
        <div className="hr-dept-grid">
          {departments.map(dept => (
            <div key={dept.id} className="hr-dept-card">
              <div className="hr-dept-card-top" style={{ background: dept.color }}>
                <div className="hr-dept-card-code">{dept.code || "—"}</div>
                <div className="hr-dept-card-name">{dept.name}</div>
              </div>
              <div className="hr-dept-card-body">
                {dept.description && <div className="hr-dept-card-desc">{dept.description}</div>}
                <div className="hr-dept-card-stats">
                  <div className="hr-dept-stat">
                    <span className="hr-dept-stat-val">{empCount(dept.name)}</span>
                    <span className="hr-dept-stat-label">Employees</span>
                  </div>
                  <div className="hr-dept-stat">
                    <span className="hr-dept-stat-val">{posCount(dept.id)}</span>
                    <span className="hr-dept-stat-label">Positions</span>
                  </div>
                </div>
                {dept.headId && (
                  <div style={{ fontSize:12, color:"var(--g500)" }}>Head: <strong style={{ color:"var(--navy)" }}>{headName(dept.headId)}</strong></div>
                )}
              </div>
              <div className="hr-dept-card-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(dept)}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{ color:"var(--red)" }} onClick={() => deleteDept(dept)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editDept ? "Edit Department" : "Add Department"} onClose={() => { setShowForm(false); setEditDept(null); }}
          footer={<><button className="btn btn-ghost" onClick={() => { setShowForm(false); setEditDept(null); }}>Cancel</button><button className="btn btn-amber" onClick={saveDept}>Save</button></>}>
          <div className="form-grid">
            <FormField label="Department Name">
              <input value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="e.g. Programs" autoFocus />
            </FormField>
            <FormField label="Code (short)">
              <input value={form.code} onChange={e=>setF("code",e.target.value.toUpperCase())} placeholder="e.g. PROG" maxLength={6} />
            </FormField>
            <FormField label="Description" full>
              <input value={form.description} onChange={e=>setF("description",e.target.value)} placeholder="Brief description of this department" />
            </FormField>
            <FormField label="Department Head">
              <select value={form.headId} onChange={e=>setF("headId",e.target.value)}>
                <option value="">— None —</option>
                {_employees.map(e => <option key={e.id} value={e.id}>{e.name} · {e.position||e.department}</option>)}
              </select>
            </FormField>
            <FormField label="Colour">
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", paddingTop:4 }}>
                {DEPT_COLOR_PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setF("color",c)}
                    style={{ width:28, height:28, borderRadius:"50%", background:c, border: form.color===c ? "3px solid var(--navy)" : "2px solid transparent", cursor:"pointer", outline: form.color===c ? "2px solid white" : "none" }} />
                ))}
              </div>
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Leave Management Components ───────────────────────────────────────────────

function LeaveStatusBadge({ status }) {
  const m = leaveStatusMeta(status);
  return <span style={{ fontSize:11, fontWeight:700, padding:"2px 10px", borderRadius:10, background:m.bg, color:m.color, whiteSpace:"nowrap" }}>{m.label}</span>;
}

function LeaveBalanceBar({ empId, ltId }) {
  const lt = LEAVE_TYPES.find(l => l.id === ltId);
  if (!lt?.days) return <span style={{ fontSize:12, color:"var(--g400)" }}>Unlimited</span>;
  const rem = getLeaveBalance(empId, ltId);
  const pct = Math.max(0, Math.min(100, (rem / lt.days) * 100));
  const barColor = pct > 50 ? "#059669" : pct > 20 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:4, background:"var(--g100)", borderRadius:2 }}>
        <div style={{ width:`${pct}%`, height:"100%", background:barColor, borderRadius:2, transition:"width .3s" }} />
      </div>
      <span style={{ fontSize:12, fontWeight:700, color:barColor, minWidth:44, textAlign:"right" }}>{rem} / {lt.days}</span>
    </div>
  );
}

// ── Leave Home ────────────────────────────────────────────────────────────────
function HRLeaveHome({ setPage, user }) {
  const [, tick] = useState(0);
  useEffect(() => {
    fetchLeaveApplicationsFromDB().then(() => { saveState(); tick(n => n + 1); });
  }, []);
  const pending = _leaveApplications.filter(a => ["pending_supervisor","pending_hr","pending_executive_director"].includes(a.status)).length;
  const now = new Date();
  const todayIso = toIsoDateValue(now);
  const approvedThisMonth = _leaveApplications.filter(a => {
    if (a.status !== "approved") return false;
    const d = new Date(a.approvedAt || a.appliedAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const myApps = _leaveApplications.filter(a => a.userId === user?.id);
  const mr = getModuleRole(user);
  const isHR = mr === "hr" || mr === "admin";
  const isHROfficer = mr === "hr";
  const pendingForUser = getPendingLeaveApprovalsForUser(user).length;
  const canReviewQueue = canAccessLeaveManagement(user);
  const staffCurrentlyOnLeave = _leaveApplications
    .filter(a => a.status === "approved" && a.startDate && a.endDate && a.startDate <= todayIso && a.endDate >= todayIso)
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))
    .map(a => ({
      ...a,
      leaveTypeName: LEAVE_TYPES.find(item => item.id === a.leaveTypeId)?.name || a.leaveTypeId,
      returnDate: getNextWorkingDate(a.endDate),
    }));
  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";

  return (
    <div className="page">
      <div className="hr-home-banner">
        <div className="hr-banner-title">Leave Management</div>
        <div className="hr-banner-sub">Apply for leave, track balances, and manage the supervisor, HR, and Executive Director approval flow.</div>
        <div className="hr-banner-stats">
          <div className="hr-banner-stat"><span className="hr-banner-stat-val">{_leaveApplications.length}</span><span className="hr-banner-stat-label">Total Applications</span></div>
          <div className="hr-banner-stat"><span className="hr-banner-stat-val">{pending}</span><span className="hr-banner-stat-label">Pending Approval</span></div>
          <div className="hr-banner-stat"><span className="hr-banner-stat-val">{approvedThisMonth}</span><span className="hr-banner-stat-label">Approved This Month</span></div>
        </div>
      </div>
      <div className="hr-module-grid">
        <ModuleNavCard icon="new_request" label="Apply for Leave"   sub="Submit a new leave application."                                               tone="teal"  onClick={() => setPage("leave_apply")} />
        <ModuleNavCard icon="requests"    label="My Leave"          sub={`${myApps.length} application${myApps.length !== 1 ? "s" : ""} on record.`}    tone="navy"  onClick={() => setPage("my_leave")} />
        {canReviewQueue && (
          <ModuleNavCard
            icon="reports"
            label={isHR ? "All Applications" : "Leave Approval Queue"}
            sub={isHR
              ? `${pending} pending approval across the organisation. Review and action leave requests.`
              : `${pendingForUser} leave request${pendingForUser !== 1 ? "s" : ""} currently assigned to you for approval.`}
            tone="amber"
            onClick={() => setPage("hr_leave_manage")}
          />
        )}
      </div>

      {isHROfficer && (
        <div className="card" style={{ marginTop:20 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Staff Currently On Leave</div>
              <div className="page-sub" style={{ marginTop:4 }}>
                Quick HR summary of staff away from work today, their return date, and delegated cover.
              </div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Leave Type</th><th>Period</th><th>Return Date</th><th>Delegated Person</th></tr>
              </thead>
              <tbody>
                {staffCurrentlyOnLeave.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign:"center", padding:"28px", color:"var(--g400)" }}>
                      No staff members are currently on approved leave.
                    </td>
                  </tr>
                ) : staffCurrentlyOnLeave.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight:700 }}>{item.employeeName}</div>
                      {item.employeeEmpId && <div className="text-xs text-gray">{item.employeeEmpId}</div>}
                    </td>
                    <td style={{ fontWeight:600 }}>{item.leaveTypeName}</td>
                    <td className="text-gray" style={{ whiteSpace:"nowrap" }}>{fmtDate(item.startDate)} – {fmtDate(item.endDate)}</td>
                    <td style={{ fontWeight:700, color:"var(--navy)" }}>{fmtDate(item.returnDate)}</td>
                    <td className="text-gray">{item.delegateTo || "No delegate assigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Apply for Leave ───────────────────────────────────────────────────────────
function LeaveApplicationPage({ user, setPage }) {
  const empRecord = _employees.find(e => e.email?.toLowerCase() === user.email?.toLowerCase());
  const empId     = empRecord?.id || user.id;
  // Try ID match first, then fall back to same-dept supervisor so the form always shows someone
  const supervisorUser =
    _users.find(u => u.id === (empRecord?.supervisorId || user.supervisorId)) ||
    _users.find(u => u.role === "supervisor" && u.dept === user.dept && u.id !== user.id && u.isActive !== false);
  const hrApprover     = _users.find(u => getModuleRole(u) === "hr" && u.isActive !== false);
  const execDirector   = _users.find(u => u.role === "executive_director" && u.isActive !== false);
  const colleagues = _users.filter(u => u.id !== user.id);

  const blank = () => ({ leaveTypeId:"annual", startDate:"", endDate:"", reason:"", delegateTo:"", handoverReport:"" });
  const [form, setFormState] = useState(blank);
  const [toast, setToast]   = useState("");
  const [err,   setErr]     = useState("");
  const setF = (k, v) => setFormState(f => ({ ...f, [k]: v }));
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const numDays    = calcLeaveDays(form.startDate, form.endDate);
  const selLT      = LEAVE_TYPES.find(lt => lt.id === form.leaveTypeId);
  const balance    = selLT?.days ? getLeaveBalance(empId, form.leaveTypeId) : null;
  const isOver     = balance !== null && numDays > balance;

  const submit = () => {
    setErr("");
    if (!form.startDate || !form.endDate)   return setErr("Please select start and end dates.");
    if (numDays <= 0)                        return setErr("The selected range does not contain any working leave days after excluding weekends and public holidays.");
    if (isOver)                              return setErr(`Insufficient ${selLT.name} balance — ${balance} day${balance !== 1 ? "s" : ""} remaining.`);
    if (!form.reason.trim())                 return setErr("Please provide a reason for this leave request.");
    const id = `LV-${String(_nextLeaveId++).padStart(4, "0")}`;
    const newApp = {
      id, employeeId:empId, employeeEmpId:empRecord?.employeeId||"",
      employeeName:user.name, employeeEmail:user.email, userId:user.id,
      leaveTypeId:form.leaveTypeId, startDate:form.startDate, endDate:form.endDate,
      numDays, reason:form.reason.trim(), delegateTo:form.delegateTo.trim(),
      handoverReport:form.handoverReport.trim(),
      status:"pending_supervisor", appliedAt:new Date().toISOString(),
      supervisorId:supervisorUser?.id || null, approvals:[],
      approvedAt:null, rejectedAt:null,
    };
    _leaveApplications.push(newApp);
    supabase.from("leave_applications").insert({
      id:               newApp.id,
      employee_id:      newApp.employeeId || null,
      employee_emp_id:  newApp.employeeEmpId || null,
      employee_name:    newApp.employeeName,
      employee_email:   newApp.employeeEmail,
      user_id:          newApp.userId || null,
      leave_type_id:    newApp.leaveTypeId,
      start_date:       newApp.startDate,
      end_date:         newApp.endDate,
      num_days:         newApp.numDays,
      reason:           newApp.reason || null,
      delegate_to:      newApp.delegateTo || null,
      handover_report:  newApp.handoverReport || null,
      status:           newApp.status,
      supervisor_id:    newApp.supervisorId || null,
      approvals:        [],
    }).then(({ error }) => { if (error) console.warn("Leave insert error:", error.message); });
    if (supervisorUser) {
      addNotif(supervisorUser.id, `Leave approval needed: ${id} from ${user.name} has been submitted and is awaiting your review.`, id);
      if (supervisorUser.email) {
        notifyLeaveSubmitted(
          { ...newApp, leaveTypeName: selLT?.name || newApp.leaveTypeId },
          { name: supervisorUser.name, email: supervisorUser.email }
        ).catch(e => console.warn("[email] leave notify failed:", e.message));
      }
    }
    saveState();
    showToast(`Application ${id} submitted — awaiting supervisor approval.`);
    setFormState(blank());
  };

  const today = new Date().toISOString().slice(0,10);

  return (
    <div className="page">
      <div className="page-header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div className="page-title">Apply for Leave</div>
          <div className="page-sub">Complete the form below. Your application will go to your supervisor, then HR, and finally the Executive Director for approval.</div>
          </div>
        <button className="btn btn-ghost" onClick={() => setPage("my_leave")}>My Leave History</button>
      </div>

      {toast && <div className="alert alert-green" style={{ marginBottom:16 }}>{toast}</div>}
      {err   && <div className="alert alert-red"   style={{ marginBottom:16 }}>{err}</div>}

      <div className="card" style={{ maxWidth:740, margin:"0 auto" }}>
        {/* Employee strip */}
        <div style={{ padding:"14px 22px", background:"var(--navy-pale)", borderBottom:"1px solid var(--g100)", display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:38, height:38, borderRadius:"50%", background:"var(--navy)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, flexShrink:0 }}>
            {user.avatar || user.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, color:"var(--navy)", fontSize:14 }}>{user.name}{empRecord?.employeeId && <span style={{ marginLeft:8, fontSize:11, fontWeight:700, background:"var(--navy)", color:"#fff", borderRadius:4, padding:"1px 6px" }}>{empRecord.employeeId}</span>}</div>
            <div style={{ fontSize:12, color:"var(--g500)" }}>{empRecord?.position || getUserPosition(user)} · {empRecord?.department || user.dept || "—"}</div>
            {supervisorUser && <div style={{ fontSize:11, color:"var(--g400)", marginTop:2 }}>Supervisor: <strong>{supervisorUser.name}</strong></div>}
          </div>
        </div>

        <div style={{ padding:"20px 22px" }}>
          <div className="form-grid">

            {/* Leave type */}
            <FormField label="Leave Type" full>
              <select value={form.leaveTypeId} onChange={e => { setF("leaveTypeId", e.target.value); setErr(""); }}>
                {LEAVE_TYPES.map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name}{lt.days ? ` — ${lt.days} days/year` : " — Unlimited"}</option>
                ))}
              </select>
            </FormField>

            {/* Approval chain */}
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--g500)", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>Approval Chain</div>
              <div style={{ display:"flex", gap:0, alignItems:"stretch" }}>
                {[
                  { step:1, label:"Supervisor",         person:supervisorUser,  fallback:"No supervisor assigned" },
                  { step:2, label:"HR Review",          person:hrApprover,      fallback:"No HR approver found"   },
                  { step:3, label:"Executive Director", person:execDirector,    fallback:"No Executive Director"  },
                ].map(({ step, label, person, fallback }, i, arr) => (
                  <div key={step} style={{ display:"flex", alignItems:"center", flex:1 }}>
                    <div style={{ flex:1, background: person ? "var(--navy-pale)" : "var(--g50)", border:"1px solid", borderColor: person ? "var(--navy-light,#3b5998)22" : "var(--g100)", borderRadius: i === 0 ? "8px 0 0 8px" : i === arr.length-1 ? "0 8px 8px 0" : 0, borderLeft: i > 0 ? "none" : undefined, padding:"10px 14px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:22, height:22, borderRadius:"50%", background: person ? "var(--navy)" : "var(--g200)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, flexShrink:0 }}>{step}</div>
                        <div>
                          <div style={{ fontSize:11, color:"var(--g400)", fontWeight:600, textTransform:"uppercase", letterSpacing:".04em" }}>{label}</div>
                          <div style={{ fontSize:13, fontWeight:700, color: person ? "var(--navy)" : "var(--g400)" }}>{person?.name || fallback}</div>
                          {person && <div style={{ fontSize:11, color:"var(--g400)", marginTop:1 }}>{getUserPosition(person)}</div>}
                        </div>
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{ width:20, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--g300)", fontSize:16, zIndex:1, margin:"0 -1px" }}>›</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Balance indicator */}
            {selLT?.days && (
              <div style={{ gridColumn:"1/-1", marginTop:-8, padding:"10px 14px", background:"var(--g50)", borderRadius:8, border:"1px solid var(--g100)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:"var(--g500)", fontWeight:600 }}>Your {selLT.name} balance</span>
                  <span style={{ fontSize:14, fontWeight:800, color: balance <= 0 ? "#dc2626" : balance <= 3 ? "#d97706" : "#059669" }}>
                    {balance} day{balance !== 1 ? "s" : ""} remaining
                  </span>
                </div>
                <LeaveBalanceBar empId={empId} ltId={form.leaveTypeId} />
              </div>
            )}

            <FormField label="Start Date">
              <input type="date" value={form.startDate} min={today}
                onChange={e => { setF("startDate", e.target.value); setErr(""); }} />
            </FormField>
            <FormField label="End Date">
              <input type="date" value={form.endDate} min={form.startDate || today}
                onChange={e => { setF("endDate", e.target.value); setErr(""); }} />
            </FormField>

            {/* Days calculated */}
            {numDays > 0 && (
              <div style={{ gridColumn:"1/-1" }}>
                <div className={`leave-apply-days ${isOver ? "over" : "ok"}`}>
                  <span style={{ fontFamily:"var(--serif)", fontSize:24, fontWeight:800, color: isOver ? "#dc2626" : "#059669" }}>{numDays}</span>
                  <span style={{ fontSize:13, fontWeight:600, color: isOver ? "#991b1b" : "#065f46" }}>
                    working day{numDays !== 1 ? "s" : ""}
                    {isOver ? ` — exceeds your balance of ${balance} day${balance !== 1 ? "s" : ""}` : ""}
                  </span>
                </div>
              </div>
            )}

            <FormField label="Reason for Leave" full>
              <textarea value={form.reason} onChange={e => setF("reason", e.target.value)}
                placeholder="Describe the reason for this leave request…" rows={3} style={{ resize:"vertical" }} />
            </FormField>

            <FormField label="Delegate Activities To" hint="Person who will cover your responsibilities during your absence">
              <input value={form.delegateTo} onChange={e => setF("delegateTo", e.target.value)}
                placeholder="Colleague's name" list="colleague-list" />
              <datalist id="colleague-list">
                {colleagues.map(u => <option key={u.id} value={u.name} />)}
              </datalist>
            </FormField>

            <div style={{ gridColumn:"1/-1" }}>
              <FormField label="Handover Report" hint="Tasks, ongoing work, and responsibilities being handed over to the delegated officer">
                <textarea value={form.handoverReport} onChange={e => setF("handoverReport", e.target.value)}
                  placeholder="List the tasks, responsibilities, ongoing activities and any important notes for the person covering you…"
                  rows={5} style={{ resize:"vertical" }} />
              </FormField>
            </div>
          </div>

          <div style={{ display:"flex", gap:10, marginTop:20, paddingTop:16, borderTop:"1px solid var(--g100)" }}>
            <button className="btn btn-amber" onClick={submit}>Submit Application</button>
            <button className="btn btn-ghost" onClick={() => setFormState(blank())}>Clear</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── My Leave (Employee Dashboard) ─────────────────────────────────────────────
function MyLeavePage({ user, setPage }) {
  const empRecord = _employees.find(e => e.email?.toLowerCase() === user.email?.toLowerCase());
  const empId     = empRecord?.id || user.id;
  const [, tick] = useState(0);
  useEffect(() => {
    fetchLeaveApplicationsFromDB().then(() => { saveState(); tick(n => n + 1); });
  }, []);

  const myApps = [..._leaveApplications]
    .filter(a => a.userId === user.id)
    .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";

  return (
    <div className="page">
      <div className="page-header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div className="page-title">My Leave</div>
          <div className="page-sub">Your annual leave balances and full application history.</div>
        </div>
        <button className="btn btn-amber" onClick={() => setPage("leave_apply")}>
          <AppButtonIcon name="add" tone="amber" size={13} /> Apply for Leave
        </button>
      </div>

      {/* Balance cards */}
      <div className="leave-balance-grid">
        {LEAVE_TYPES.filter(lt => lt.days !== null).map(lt => {
          const rem = getLeaveBalance(empId, lt.id);
          const pct = Math.max(0, Math.min(100, (rem / lt.days) * 100));
          const tone = pct > 50 ? { val:"#059669", bar:"#059669" } : pct > 20 ? { val:"#d97706", bar:"#d97706" } : { val:"#dc2626", bar:"#dc2626" };
          return (
            <div key={lt.id} className="leave-balance-card">
              <div className="lb-type">{lt.name}</div>
              <div className="lb-val" style={{ color:tone.val }}>{rem}</div>
              <div className="lb-sub">of {lt.days} days remaining</div>
              <div className="lb-bar"><div className="lb-bar-fill" style={{ width:`${pct}%`, background:tone.bar }} /></div>
            </div>
          );
        })}
        <div className="leave-balance-card">
          <div className="lb-type">Unpaid Leave</div>
          <div className="lb-val" style={{ color:"var(--g400)" }}>∞</div>
          <div className="lb-sub">No annual limit</div>
          <div className="lb-bar" />
        </div>
      </div>

      {/* History table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Application History</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ref</th><th>Leave Type</th><th>Period</th><th>Days</th><th>Status</th><th>Approval Stage</th><th>Applied</th><th>Reason</th><th>Delegate</th></tr></thead>
            <tbody>
              {myApps.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:"center", padding:"36px", color:"var(--g400)" }}>No leave applications yet. Click "Apply for Leave" to get started.</td></tr>
              )}
              {myApps.map(a => {
                const lt = LEAVE_TYPES.find(l => l.id === a.leaveTypeId);
                const stages = getLeaveStageItems(a);
                return (
                  <tr key={a.id}>
                    <td><span className="ref" style={{ fontSize:11 }}>{a.id}</span></td>
                    <td style={{ fontWeight:600, whiteSpace:"nowrap" }}>{lt?.name}</td>
                    <td className="text-gray" style={{ whiteSpace:"nowrap" }}>{fmtDate(a.startDate)} – {fmtDate(a.endDate)}</td>
                    <td style={{ fontWeight:700, textAlign:"center" }}>{a.numDays}</td>
                    <td><LeaveStatusBadge status={a.status} /></td>
                    <td>
                      <div style={{ minWidth:220 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"var(--navy)", marginBottom:8 }}>{getLeaveStageSummary(a)}</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {stages.map(stage => (
                            <span
                              key={stage.id}
                              style={{
                                fontSize:11,
                                fontWeight:700,
                                padding:"3px 8px",
                                borderRadius:999,
                                background: stage.done ? "#d1fae5" : stage.current ? "#dbeafe" : "#f3f4f6",
                                color: stage.done ? "#065f46" : stage.current ? "#1e40af" : "#6b7280",
                                border: stage.current ? "1px solid #93c5fd" : "1px solid transparent",
                              }}
                            >
                              {stage.done ? "Done" : stage.current ? "Current" : "Next"} · {stage.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="text-gray" style={{ whiteSpace:"nowrap" }}>{fmtDate(a.appliedAt)}</td>
                    <td className="text-gray" style={{ maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.reason}</td>
                    <td className="text-gray">{a.delegateTo || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── HR Leave Management (All Applications) ────────────────────────────────────
function HRLeaveManagement({ user, setPage }) {
  const [, tick]        = useState(0);
  const refresh         = () => tick(n => n + 1);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [typeFilter,    setTypeFilter]    = useState("all");
  const [toast,         setToast]         = useState("");
  const [rejectTarget,  setRejectTarget]  = useState(null);
  const [rejectNote,    setRejectNote]    = useState("");
  const [showSummary,   setShowSummary]   = useState(false);

  // Pull fresh leave data from DB every time the page mounts so cross-device
  // submissions are visible without requiring a full page reload.
  useEffect(() => {
    fetchLeaveApplicationsFromDB().then(() => { saveState(); refresh(); });
  }, []);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 4000); };
  const sync = () => { saveState(); refresh(); };

  const downloadLeaveForm = (app) => {
    const html = buildLeaveApprovalDocumentData(app);
    const a = document.createElement("a");
    a.href = html;
    a.download = `${app.id}-approved-leave-form.html`;
    a.click();
  };

  const mr     = getModuleRole(user);
  const isHR   = mr === "hr" || mr === "admin";
  const isExecutive = user?.role === "executive_director" || mr === "admin";

  const canAct = (app) => {
    if (app.status === "pending_supervisor")
      return app.supervisorId === user.id ||
             (app.supervisorId == null && user.role === "supervisor") ||
             isHR;
    if (app.status === "pending_hr")         return isHR;
    if (app.status === "pending_executive_director") return isExecutive;
    return false;
  };

  const approve = (app) => {
    const action = { userId:user.id, name:user.name, at:new Date().toISOString(), decision:"approved", note:"" };
    const lt = LEAVE_TYPES.find(l => l.id === app.leaveTypeId);
    const leaveTypeName = lt?.name || app.leaveTypeId;
    const appForEmail = { ...app, leaveTypeName };
    const requesterEmail = app.employeeEmail || _users.find(u => u.id === app.userId)?.email || "";
    const requesterForEmail = { name: app.employeeName, email: requesterEmail };

    if (app.status === "pending_supervisor") {
      app.approvals = [...(app.approvals||[]), { ...action, role:"supervisor" }];
      app.status = "pending_hr";
      _users.filter(u => { const r = getModuleRole(u); return r === "hr" || r === "admin"; })
        .forEach(u => addNotif(u.id, `HR review needed: Leave request ${app.id} from ${app.employeeName} has been approved by the supervisor and is awaiting HR review.`, app.id));
      addNotif(app.userId, `Leave update: ${app.id} — your supervisor approved your leave. It has been forwarded to HR for review.`, app.id);
      if (requesterEmail) notifyLeaveStatusUpdate(appForEmail, requesterForEmail, user.name, "pending_hr").catch(e => console.warn("[email] leave status update failed:", e.message));
      showToast(`${app.id} forwarded to HR for review.`);
    } else if (app.status === "pending_hr") {
      app.approvals = [...(app.approvals||[]), { ...action, role:"hr" }];
      app.status    = "pending_executive_director";
      _users.filter(u => u.role === "executive_director")
        .forEach(u => addNotif(u.id, `Executive approval needed: Leave request ${app.id} from ${app.employeeName} is awaiting your final approval.`, app.id));
      addNotif(app.userId, `Leave update: ${app.id} — HR has approved your leave. It is now awaiting the Executive Director's final approval.`, app.id);
      if (requesterEmail) notifyLeaveStatusUpdate(appForEmail, requesterForEmail, user.name, "pending_executive_director").catch(e => console.warn("[email] leave status update failed:", e.message));
      showToast(`${app.id} forwarded to the Executive Director for final approval.`);
    } else if (app.status === "pending_executive_director") {
      app.approvals = [...(app.approvals||[]), { ...action, role:"executive_director" }];
      app.status    = "approved";
      app.approvedAt = new Date().toISOString();
      if (lt?.days) deductLeaveBalance(app.employeeId, app.leaveTypeId, app.numDays);
      fileApprovedLeaveIntoStaffRecord(app, user.name);
      addNotif(app.userId, `Leave approved: ${app.id} has been fully approved and filed in your staff record.`, app.id);
      _users.filter(u => { const r = getModuleRole(u); return r === "hr" || r === "admin"; })
        .forEach(u => addNotif(u.id, `Leave approved: ${app.id} for ${app.employeeName} has been finally approved and filed in the staff record.`, app.id));
      if (requesterEmail) notifyLeaveStatusUpdate(appForEmail, requesterForEmail, user.name, "approved").catch(e => console.warn("[email] leave status update failed:", e.message));
      showToast(`${app.id} approved and filed in ${app.employeeName}'s staff record.`);
    }
    supabase.from("leave_applications").update({
      status:      app.status,
      approvals:   app.approvals,
      approved_at: app.approvedAt || null,
    }).eq("id", app.id).then(({ error }) => { if (error) console.warn("Leave approve sync error:", error.message); });
    sync();
  };

  const confirmReject = () => {
    if (!rejectTarget) return;
    const target = _leaveApplications.find(item => item.id === rejectTarget.id);
    if (!target) return;
    const role = rejectTarget.status === "pending_supervisor" ? "supervisor" : rejectTarget.status === "pending_hr" ? "hr" : "executive_director";
    target.approvals = [...(target.approvals||[]), { userId:user.id, name:user.name, at:new Date().toISOString(), decision:"rejected", note:rejectNote, role }];
    target.status    = "rejected";
    target.rejectedAt = new Date().toISOString();
    supabase.from("leave_applications").update({
      status:      "rejected",
      approvals:   target.approvals,
      rejected_at: target.rejectedAt,
    }).eq("id", target.id).then(({ error }) => { if (error) console.warn("Leave reject sync error:", error.message); });
    addNotif(target.userId, `Leave rejected: ${target.id} — your leave application has been rejected. ${rejectNote ? `Reason: ${rejectNote}` : "Please speak with your supervisor or HR for details."}`, target.id);
    const requesterEmail = target.employeeEmail || _users.find(u => u.id === target.userId)?.email || "";
    if (requesterEmail) {
      const lt = LEAVE_TYPES.find(l => l.id === target.leaveTypeId);
      notifyLeaveStatusUpdate(
        { ...target, leaveTypeName: lt?.name || target.leaveTypeId },
        { name: target.employeeName, email: requesterEmail },
        user.name, "rejected", rejectNote
      ).catch(e => console.warn("[email] leave reject notify failed:", e.message));
    }
    showToast(`${target.id} rejected.`);
    setRejectTarget(null); setRejectNote(""); sync();
  };

  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";

  const apps = _leaveApplications
    .filter(a => !search || a.employeeName.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase()) || a.employeeEmpId?.toLowerCase().includes(search.toLowerCase()))
    .filter(a => statusFilter === "all" || a.status === statusFilter)
    .filter(a => typeFilter  === "all" || a.leaveTypeId === typeFilter)
    .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

  const allApps   = _leaveApplications;
  const pending   = allApps.filter(a => ["pending_supervisor","pending_hr","pending_executive_director"].includes(a.status)).length;
  const approved  = allApps.filter(a => a.status === "approved").length;
  const rejected  = allApps.filter(a => a.status === "rejected").length;

  return (
    <div className="page">
      <div className="page-header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <div className="page-title">Leave Applications</div>
          <div className="page-sub">{allApps.length} total · {pending} pending approval</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button className="btn btn-ghost" onClick={() => setShowSummary(s => !s)}>
            <AppButtonIcon name="reports" tone="teal" size={13} /> {showSummary ? "Hide Summary" : "Staff Leave Summary"}
          </button>
          <button className="btn btn-amber" onClick={() => setPage("leave_apply")}>
            <AppButtonIcon name="add" tone="amber" size={13} /> Apply for Leave
          </button>
        </div>
      </div>

      {toast && <div className="alert alert-green" style={{ marginBottom:14 }}>{toast}</div>}

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Total",    val:allApps.length, color:"var(--navy)"  },
          { label:"Pending",  val:pending,         color:"#d97706"      },
          { label:"Approved", val:approved,         color:"#059669"      },
          { label:"Rejected", val:rejected,         color:"#dc2626"      },
        ].map(s => (
          <div key={s.label} style={{ background:"#fff", border:"1px solid var(--g100)", borderRadius:10, padding:"14px", textAlign:"center", boxShadow:"var(--sh-sm)" }}>
            <div style={{ fontFamily:"var(--serif)", fontSize:30, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:"var(--g500)", fontWeight:600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filters" style={{ marginBottom:16 }}>
        <input className="f-input" placeholder="Search employee, ref, ID…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="f-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="pending_supervisor">Pending Supervisor</option>
          <option value="pending_hr">Pending HR Review</option>
          <option value="pending_executive_director">Pending Executive Director</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className="f-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Leave Types</option>
          {LEAVE_TYPES.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ref</th><th>Employee</th><th>Leave Type</th><th>Period</th><th>Days</th><th>Status</th><th>Applied</th><th>Delegate</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {apps.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:"center", padding:"36px", color:"var(--g400)" }}>
                  {allApps.length === 0 ? "No leave applications yet." : "No applications match your filters."}
                </td></tr>
              )}
              {apps.map(a => {
                const lt = LEAVE_TYPES.find(l => l.id === a.leaveTypeId);
                const actable = canAct(a);
                return (
                  <tr key={a.id}>
                    <td><span className="ref" style={{ fontSize:11 }}>{a.id}</span></td>
                    <td>
                      <div style={{ fontWeight:600 }}>{a.employeeName}</div>
                      {a.employeeEmpId && <div className="text-xs text-gray">{a.employeeEmpId}</div>}
                    </td>
                    <td style={{ fontWeight:600, whiteSpace:"nowrap" }}>{lt?.name}</td>
                    <td className="text-gray" style={{ whiteSpace:"nowrap" }}>{fmtDate(a.startDate)} – {fmtDate(a.endDate)}</td>
                    <td style={{ fontWeight:700, textAlign:"center" }}>{a.numDays}</td>
                    <td><LeaveStatusBadge status={a.status} /></td>
                    <td className="text-gray" style={{ whiteSpace:"nowrap" }}>{fmtDate(a.appliedAt)}</td>
                    <td className="text-gray">{a.delegateTo || "—"}</td>
                    <td>
                      {actable ? (
                        <div className="flex gap-2" style={{ flexWrap:"wrap" }}>
                          <button className="btn btn-ghost btn-sm" style={{ color:"#059669", borderColor:"#6ee7b7" }} onClick={() => approve(a)}>
                            {a.status === "pending_supervisor" ? "Approve → HR" : a.status === "pending_hr" ? "Approve → ED" : "Final Approve"}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color:"#dc2626", borderColor:"#fca5a5" }} onClick={() => setRejectTarget(a)}>Reject</button>
                        </div>
                      ) : a.status === "approved" ? (
                        <div className="flex gap-2" style={{ flexWrap:"wrap", alignItems:"center" }}>
                          <span className="text-xs text-gray" style={{ whiteSpace:"nowrap" }}>Approved {fmtDate(a.approvedAt)}</span>
                          <button className="btn btn-ghost btn-sm" style={{ color:"#0891b2", borderColor:"#a5f3fc", whiteSpace:"nowrap" }} onClick={() => downloadLeaveForm(a)}>⬇ Form</button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray">
                          {a.status === "rejected" ? `Rejected ${fmtDate(a.rejectedAt)}` : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Staff Leave Summary widget ─────────────────────────────────────── */}
      {showSummary && (() => {
        const trackable = LEAVE_TYPES.filter(lt => lt.days !== null);
        const staffRows = _users
          .filter(u => u.isActive !== false && u.role !== "executive_director")
          .map(u => {
            const empRec = _employees.find(e => e.email?.toLowerCase() === u.email?.toLowerCase());
            const empId  = empRec?.id || u.id;
            return {
              name:   u.name,
              dept:   empRec?.department || u.dept || "—",
              empId,
              leaveData: trackable.map(lt => {
                const taken   = _leaveBalances[empId]?.[lt.id] || 0;
                const balance = lt.days - taken;
                return { lt, taken, balance };
              }),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        return (
          <div className="card" style={{ marginTop:24 }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--g100)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontFamily:"var(--serif)", fontSize:18, fontWeight:800, color:"var(--navy)" }}>Staff Leave Summary</div>
                <div style={{ fontSize:13, color:"var(--g500)", marginTop:2 }}>Annual leave allocation, days taken, and remaining balance per staff member.</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSummary(false)}>Close</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    {trackable.map(lt => (
                      <th key={lt.id} colSpan={3} style={{ textAlign:"center", background:"var(--navy-pale)", borderLeft:"2px solid var(--g100)" }}>
                        {lt.name}
                        <div style={{ fontSize:10, fontWeight:600, color:"var(--g500)", marginTop:1 }}>({lt.days} days/yr)</div>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th />
                    <th />
                    {trackable.map(lt => (
                      [
                        <th key={`${lt.id}-e`} style={{ fontSize:10, background:"#f0fdf4", color:"#065f46", textAlign:"center", borderLeft:"2px solid var(--g100)" }}>Entitlement</th>,
                        <th key={`${lt.id}-t`} style={{ fontSize:10, background:"#fff7ed", color:"#c2410c", textAlign:"center" }}>Taken</th>,
                        <th key={`${lt.id}-b`} style={{ fontSize:10, background:"#eff6ff", color:"#1e40af", textAlign:"center" }}>Balance</th>,
                      ]
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffRows.length === 0 && (
                    <tr><td colSpan={2 + trackable.length * 3} style={{ textAlign:"center", padding:"28px", color:"var(--g400)" }}>No staff records found.</td></tr>
                  )}
                  {staffRows.map(row => (
                    <tr key={row.empId}>
                      <td style={{ fontWeight:700 }}>{row.name}</td>
                      <td style={{ color:"var(--g500)", fontSize:13 }}>{row.dept}</td>
                      {row.leaveData.map(({ lt, taken, balance }) => (
                        [
                          <td key={`${row.empId}-${lt.id}-e`} style={{ textAlign:"center", fontWeight:700, color:"var(--navy)", borderLeft:"2px solid var(--g100)" }}>{lt.days}</td>,
                          <td key={`${row.empId}-${lt.id}-t`} style={{ textAlign:"center", fontWeight:600, color: taken > 0 ? "#c2410c" : "var(--g400)" }}>{taken}</td>,
                          <td key={`${row.empId}-${lt.id}-b`} style={{ textAlign:"center", fontWeight:700, color: balance <= 0 ? "#dc2626" : balance <= Math.ceil(lt.days * 0.3) ? "#d97706" : "#059669" }}>{balance}</td>,
                        ]
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding:"10px 20px", background:"var(--g50)", borderTop:"1px solid var(--g100)", fontSize:11, color:"var(--g500)" }}>
              Balances update automatically when leave is fully approved through all three stages.
              Unpaid leave has no annual limit and is excluded from this table.
            </div>
          </div>
        );
      })()}

      {/* Reject modal */}
      {rejectTarget && (
        <Modal title={`Reject Application: ${rejectTarget.id}`} onClose={() => { setRejectTarget(null); setRejectNote(""); }}
          footer={<><button className="btn btn-ghost" onClick={() => { setRejectTarget(null); setRejectNote(""); }}>Cancel</button><button className="btn btn-ghost" style={{ color:"#dc2626", borderColor:"#fca5a5" }} onClick={confirmReject}>Confirm Rejection</button></>}>
          <div style={{ marginBottom:14, fontSize:14, color:"var(--g700)" }}>
            Rejecting <strong>{rejectTarget.employeeName}</strong>'s <strong>{LEAVE_TYPES.find(l=>l.id===rejectTarget.leaveTypeId)?.name}</strong> request for <strong>{rejectTarget.numDays} day{rejectTarget.numDays!==1?"s":""}</strong> ({rejectTarget.startDate} → {rejectTarget.endDate}).
          </div>
          <FormField label="Reason for Rejection (optional)">
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              placeholder="Provide a brief reason for the rejection…" rows={3} />
          </FormField>
        </Modal>
      )}
    </div>
  );
}

// ── HR: Position Manager ───────────────────────────────────────────────────────
function HRPositionManager({ onSystemChange }) {
  const [positions,   setPositions]   = useState([..._hrPositions]);
  const [departments, setDepartments] = useState([..._hrDepartments]);
  const [showForm,  setShowForm]      = useState(false);
  const [editPos,   setEditPos]       = useState(null);
  const [deptFilter, setDeptFilter]   = useState("all");
  const [search,    setSearch]        = useState("");
  const [toast,     setToast]         = useState("");
  const blankForm = { name:"", departmentId:"", grade:"Mid Level", description:"" };
  const [form, setForm]               = useState(blankForm);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const sync = () => {
    setPositions([..._hrPositions]);
    setDepartments([..._hrDepartments]);
    saveState();
    if (onSystemChange) onSystemChange();
  };

  const openAdd  = () => { setEditPos(null); setForm({ ...blankForm, departmentId: departments[0]?.id || "" }); setShowForm(true); };
  const openEdit = (p) => { setEditPos(p); setForm({ name:p.name, departmentId:p.departmentId, grade:p.grade||"Mid Level", description:p.description||"" }); setShowForm(true); };

  const savePos = () => {
    if (!form.name.trim() || !form.departmentId) return;
    if (editPos) {
      Object.assign(editPos, { ...form, name:form.name.trim() });
      showToast(`Position updated: ${form.name}`);
    } else {
      const exists = _hrPositions.some(p => p.name.toLowerCase()===form.name.trim().toLowerCase() && p.departmentId===form.departmentId);
      if (exists) { showToast("That position already exists in this department."); return; }
      _hrPositions.push({ id:`hp-${Date.now()}`, ...form, name:form.name.trim(), createdAt: new Date().toISOString() });
      showToast(`Position added: ${form.name}`);
    }
    sync();
    setShowForm(false);
    setEditPos(null);
  };

  const deletePos = (pos) => {
    const empCount = _employees.filter(e => e.position === pos.name).length;
    if (empCount > 0) { showToast(`Cannot delete: ${empCount} employee(s) hold this position.`); return; }
    if (!window.confirm(`Delete position "${pos.name}"?`)) return;
    _hrPositions = _hrPositions.filter(p => p.id !== pos.id);
    sync();
    showToast(`Deleted: ${pos.name}`);
  };

  const deptMap = new Map(departments.map(d => [d.id, d]));
  const filtered = positions
    .filter(p => deptFilter === "all" || p.departmentId === deptFilter)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  // Group filtered by department for display
  const byDept = new Map();
  filtered.forEach(p => {
    if (!byDept.has(p.departmentId)) byDept.set(p.departmentId, []);
    byDept.get(p.departmentId).push(p);
  });

  const empCountForPos = (posName) => _employees.filter(e => e.position === posName).length;

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Positions</div>
          <div className="page-sub">{positions.length} position{positions.length!==1?"s":""} · Link positions to departments and grades</div>
        </div>
        <button className="btn btn-amber" onClick={openAdd} disabled={departments.length===0}>
          <AppButtonIcon name="add" tone="amber" size={13} /> Add Position
        </button>
      </div>

      {departments.length === 0 && (
        <div className="alert alert-red" style={{ marginBottom:14 }}>Create at least one department before adding positions.</div>
      )}
      {toast && <div className="alert alert-green" style={{ marginBottom:14 }}>{toast}</div>}

      <div className="filters" style={{ marginBottom:16 }}>
        <input className="f-input" placeholder="Search positions…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="f-input" value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}>
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="card-body org-empty-state">{positions.length===0?"No positions yet. Click \"Add Position\" to create one.":"No positions match your filters."}</div></div>
      ) : (
        [...byDept.entries()].map(([deptId, deptPositions]) => {
          const dept = deptMap.get(deptId);
          return (
            <div key={deptId} className="org-dept-section">
              {dept && (
                <div className="org-dept-header" style={{ background: dept.color }}>
                  <div><div className="org-dept-code">{dept.code}</div><div className="org-dept-name">{dept.name}</div></div>
                  <span className="org-dept-count">{deptPositions.length} position{deptPositions.length!==1?"s":""}</span>
                </div>
              )}
              <div className="org-dept-body">
                {deptPositions.map(pos => (
                  <div key={pos.id} className="org-emp-row">
                    <div style={{ flex:1 }}>
                      <div className="org-emp-name">{pos.name}</div>
                      <div className="org-emp-meta">
                        {pos.grade || "—"}
                        {pos.description ? ` · ${pos.description}` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize:12, color:"var(--g500)", marginRight:12 }}>
                      {empCountForPos(pos.name)} employee{empCountForPos(pos.name)!==1?"s":""}
                    </span>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(pos)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color:"var(--red)" }} onClick={()=>deletePos(pos)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {showForm && (
        <Modal title={editPos ? "Edit Position" : "Add Position"} onClose={() => { setShowForm(false); setEditPos(null); }}
          footer={<><button className="btn btn-ghost" onClick={() => { setShowForm(false); setEditPos(null); }}>Cancel</button><button className="btn btn-amber" onClick={savePos}>Save</button></>}>
          <div className="form-grid">
            <FormField label="Position Title">
              <input value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="e.g. Program Officer" autoFocus />
            </FormField>
            <FormField label="Grade / Level">
              <select value={form.grade} onChange={e=>setF("grade",e.target.value)}>
                {POSITION_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </FormField>
            <FormField label="Department" full>
              <select value={form.departmentId} onChange={e=>setF("departmentId",e.target.value)}>
                <option value="">— Select department —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FormField>
            <FormField label="Description" full>
              <input value={form.description} onChange={e=>setF("description",e.target.value)} placeholder="Brief description of this position (optional)" />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AccessDenied({ setPage }) {
  return (
    <div className="page" style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:420 }}>
      <div style={{ textAlign:"center", maxWidth:380 }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:"#fee2e2", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", fontSize:28 }}>🔒</div>
        <div style={{ fontFamily:"var(--serif)", fontSize:22, color:"var(--navy)", fontWeight:800, marginBottom:10 }}>Access Restricted</div>
        <div style={{ color:"var(--g500)", marginBottom:24, lineHeight:1.7, fontSize:14 }}>
          You don't have permission to view this area.<br />Contact your administrator to request access.
        </div>
        <button className="btn btn-primary" onClick={() => setPage("home")}>Return to Home</button>
      </div>
    </div>
  );
}

function MyESignaturePage({ user, onSaveSignature }) {
  const [value, setValue] = useState(() => getSavedUserSignature(user));
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setValue(getSavedUserSignature(user));
  }, [user]);

  const save = () => {
    onSaveSignature(value);
    setNotice(value ? "Your e-signature has been saved and will now attach automatically to requests and approvals." : "Your saved e-signature has been cleared.");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">My E-Signature</div>
        <div className="page-sub">Save one digital signature for automatic use across requests, approvals, payments, and accountability actions.</div>
      </div>

      {notice && <div className="alert alert-green">{notice}</div>}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Saved Signature</div>
        </div>
        <div className="card-body">
          <div className="text-sm text-gray" style={{ marginBottom:12 }}>
            Type or draw your e-signature below. Once saved, the system will attach it automatically whenever you submit or approve eligible records.
          </div>
          <SignaturePad value={value} onChange={setValue} />
          <div className="flex gap-3" style={{ justifyContent:"flex-end", flexWrap:"wrap", marginTop:14 }}>
            <button className="btn btn-ghost" onClick={() => setValue(null)}>Clear</button>
            <button className="btn btn-amber" onClick={save}><AppButtonIcon name="save" tone="amber" />Save E-Signature</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ user, page, setPage, pendingCount, notifCount, paymentQueueCount, pendingAccountabilityCount, draftCount, onLogout, isOpen, onClose, collapsed, onToggleCollapse }) {
  const isApprover = ["supervisor","accountant","finance_manager","executive_director","payment_accountant"].includes(user.role);
  const isAdmin = user.role === "admin";
  const mr = getModuleRole(user);
  const messageUnreadCount = getUnreadMessagesCountForUser(user);
  const canAccessFinancialReports = hasDashboardAccess(user, "financial_reports");
  const canAccessPaymentQueue = hasDashboardAccess(user, "payment_queue");
  const financePages = new Set([
    "dashboard","new_request","my_requests","my_drafts","pending_approvals","approval_history",
    "payment_queue","pending_accountability","paid_vouchers","notifications","financial_reports","my_leave","leave_apply","my_signature",
  ]);
  const adminPages = new Set(["admin_center","admin_users","admin_budgets","admin_all_requests","admin_logs","my_signature"]);
  const hrPages = HR_WORKSPACE_PAGES;
  const messagePages = new Set(["messages_center","my_signature"]);
  const inFinance = financePages.has(page);
  const inAdmin = adminPages.has(page);
  const inHR = hrPages.has(page);
  const inMessages = messagePages.has(page);
  const isHome = page === "home";
  const chromeUserName = getWorkspaceChromeName(user, page);

  const N = (icon, label, id, badge=null, isActive=page===id, targetPage=id) => (
    <div key={id} className={`nav-item ${isActive?"active":""}`} title={label} onClick={() => { setPage(targetPage); onClose(); }}>
      <span className="nav-icon">
        <IconBadge name={icon} tone={NAV_ICON_TONES[targetPage] || NAV_ICON_TONES[id] || "navy"} size={15} />
      </span>
      <span className="nav-label">{label}</span>
      {badge > 0 && <span className="nav-badge">{badge}</span>}
    </div>
  );

  const QA = (icon, label, id, badge) => (
    <div key={`qa-${id}`} className={`quick-action-item ${page===id?"active":""}`} title={label} onClick={() => { setPage(id); onClose(); }}>
      <span className="nav-icon" style={{ width:28, height:28, position:"relative" }}>
        <IconBadge name={icon} tone="blue" size={13} />
        {!!badge && <span style={{ position:"absolute", top:-4, right:-4, background:"#ef4444", color:"#fff", borderRadius:"50%", fontSize:9, fontWeight:700, minWidth:14, height:14, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 2px", lineHeight:1 }}>{badge > 99 ? "99+" : badge}</span>}
      </span>
      <span className="quick-action-label">{label}</span>
    </div>
  );

  return (
    <div className={`sidebar${isOpen ? " open" : ""}${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-logo">
        <div className="logo-mark">
          <img src={inspireLogo} alt="Inspire Youth For Development logo" />
        </div>
        <div className="sidebar-logo-text" style={{ display:"flex", flexDirection:"column", gap:3 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#fff", letterSpacing:".03em", lineHeight:1.35, textAlign:"center" }}>
            INSPIRE YOUTH FOR<br/>DEVELOPMENT
          </div>
          <div style={{ fontSize:8, fontWeight:600, color:"rgba(255,255,255,.52)", letterSpacing:".09em", textAlign:"center", lineHeight:1.4, textTransform:"uppercase" }}>
            Inspire Management System (IMS)
          </div>
        </div>
      </div>

      {/* Home shortcut beneath logo */}
      <div
        className={`sidebar-home-link${page === "home" ? " active" : ""}`}
        onClick={() => { setPage("home"); onClose(); }}
        title="Home"
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && (setPage("home"), onClose())}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span className="sidebar-home-link-label">Home</span>
      </div>

      {/* Collapse toggle — hidden on mobile via CSS */}
      <div className="sidebar-toggle-row">
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          )}
        </button>
      </div>

      {/* Quick Actions — always visible regardless of module */}
      <div className="quick-actions-wrap">
        <div className="nav-sec">Quick Actions</div>
        <div className="quick-actions-section">
          {QA("new_request","New Request","new_request")}
          {QA("calendar","Apply for Leave","leave_apply")}
          {QA("requests","My Requests","my_requests")}
          {(isApprover||isAdmin) && QA("pending_approvals","Pending Approvals","pending_approvals")}
          {QA("workflow","Pending Accountability","pending_accountability", pendingAccountabilityCount || null)}
          {QA("edit","My E-Signature","my_signature")}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-chip">
          <Avatar str={user.avatar} />
          <div className="user-chip-copy">
            <div className="u-name">{chromeUserName}</div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:2 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:MODULE_ROLE_COLORS[getModuleRole(user)] || "#64748b", flexShrink:0 }} />
              <div className="u-role">{MODULE_ROLE_LABELS[getModuleRole(user)] || "Staff"}</div>
            </div>
          </div>
          <button type="button" className="sidebar-logout-btn" onClick={onLogout} title="Log out" aria-label="Log out">
            <AppButtonIcon name="back" tone="slate" size={12} />
            <span className="sidebar-logout-label">Log out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ModulePlaceholderPage({ title, description, icon="doc", tone="navy" }) {
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">{title}</div>
        <div className="page-sub">{description}</div>
      </div>
      <div className="card">
        <div className="card-body" style={{ textAlign:"center", padding:"46px 28px" }}>
          <div style={{ width:64, height:64, borderRadius:22, margin:"0 auto 18px", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(145deg,#eff6ff 0%,#f8fafc 100%)", color:"#0f2744", fontSize:26, boxShadow:"inset 0 1px 0 rgba(255,255,255,.7)" }}>
            <IconBadge name={icon} tone={tone} size={24} />
          </div>
          <div style={{ fontFamily:"var(--serif)", fontSize:22, color:"var(--navy)", marginBottom:8 }}>Module shell ready</div>
          <div style={{ maxWidth:520, margin:"0 auto", color:"var(--g500)" }}>
            This button is now in place for future expansion. The current working ERP remains under the Finance menu and nothing in the approval or request flow has been changed.
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemHome({ setPage, user }) {
  const [, tick] = useState(0);
  // Fetch fresh data from DB on mount so the widget is always current
  useEffect(() => {
    Promise.all([fetchLeaveApplicationsFromDB(), fetchRequestsFromDB(), fetchNotificationsFromDB()])
      .then(() => { saveState(); tick(n => n + 1); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mr = getModuleRole(user);
  const isAdmin = mr === "admin";
  const visibleAnnouncements = getRelevantAnnouncementsForUser(user).slice(0, 3);
  const unreadAnnouncements = getRelevantAnnouncementsForUser(user).filter(item => !item.readBy?.includes(user.id)).length;

  // ── Active Workflows widget data ─────────────────────────────────────────────
  const pendingLeaveApprovals   = getPendingLeaveApprovalsForUser(user);
  const pendingFinanceApprovals = getPendingForRole(user.role, _requests, user.id);
  const pendingAccountabilities = getPendingAccountabilityForRole(user.role, _requests, user.id);

  // In-progress: pending stages + rejected (needs action)
  const myActiveLeave = _leaveApplications.filter(a =>
    a.userId === user.id &&
    ["pending_supervisor","pending_hr","pending_executive_director","rejected"].includes(a.status)
  );
  const myActiveFinance = _requests.filter(r =>
    r.requesterId === user.id &&
    r.status &&
    (r.status.startsWith("pending") || r.status.startsWith("rejected")) &&
    !["pending_payment_accountant","pending_accountability"].includes(r.status)
  );
  const hasAnything = pendingLeaveApprovals.length || pendingFinanceApprovals.length || pendingAccountabilities.length || myActiveLeave.length || myActiveFinance.length;

  const homeCards = [
    { key:"finance",  icon:"finance", label:"Finance",              sub:"Open the current ERP workflows for requests, approvals, payments, and reports.",                              meta:"Live module",       page:"dashboard",          tone:"navy"  },
    { key:"proc",     icon:"prc",     label:"Procurement",          sub:"Open the procurement workspace, including officer tools where you have position or delegated access.",         meta:"Live module",       page:"procurement",        tone:"amber" },
    { key:"messages", icon:"com",     label:"Messages",             sub:"Open the internal messaging workspace for staff conversations and HR announcements.",                           meta:"Live module",       page:"messages_center",    tone:"teal"  },
    { key:"pm",       icon:"pm",      label:"Project Management",   sub:"Reserved entry point for project planning and tracking workflows.",                                           meta:"Coming next",       page:"project_management", tone:"blue"  },
    { key:"ast",      icon:"ast",     label:"Asset Management",     sub:"Reserved entry point for asset registration and lifecycle workflows.",                                        meta:"Coming next",       page:"asset_management",   tone:"navy"  },
    { key:"doc",      icon:"doc",     label:"Document Management",  sub:"Reserved entry point for document storage and approval workflows.",                                          meta:"Coming next",       page:"document_management",tone:"teal"  },
    { key:"com",      icon:"com",     label:"Communication",        sub:"Reserved entry point for messaging and communication workflows.",                                             meta:"Coming next",       page:"communication",      tone:"amber" },
  ];

  if (isAdmin) {
    homeCards.splice(1, 0, { key:"admin", icon:"admin", label:"Admin Center", sub:"Open the administrator workspace for users, budgets, request visibility, and system control.", meta:"Independent module", page:"admin_center", tone:"blue" });
  }

  homeCards.splice(isAdmin ? 3 : 2, 0, {
    key:"hr",
    icon:"hr",
    label: hasDashboardAccess(user, "human_resource") ? "HR Manager" : "Human Resources",
    sub:canAccessModule(user, "hr")
      ? "Manage employee biodata, contracts, CVs, certificates, leave history, and linked user records."
      : "Open the HR leave workspace for leave applications, balances, and personal leave tracking.",
    meta: hasDashboardAccess(user, "human_resource") ? "Specialized dashboard" : canAccessModule(user, "hr") ? "Restricted module" : "Leave workspace",
    page:"human_resource",
    tone:"teal",
  });

  if (hasDashboardAccess(user, "financial_reports")) {
    homeCards.splice(2, 0, {
      key:"fin-reports",
      icon:"reports",
      label:user.role === "finance_manager" ? "Generate Financial Report" : "Financial Reports",
      sub:"Open the paid-only project reporting workspace and export finance reports.",
      meta:"Specialized dashboard",
      page:"financial_reports",
      tone:"violet",
    });
  }

  if (hasDashboardAccess(user, "payment_queue")) {
    homeCards.splice(3, 0, {
      key:"pay-queue",
      icon:"payments",
      label:"Payment Officer",
      sub:"Open the payments dashboard linked to the Payment Officer position.",
      meta:"Specialized dashboard",
      page:"payment_queue",
      tone:"teal",
    });
  }

  if (hasDashboardAccess(user, "executive_procurement")) {
    homeCards.splice(2, 0, {
      key:"exec-proc",
      icon:"approve",
      label:"Executive Approval",
      sub:"Open the Executive Director procurement approval dashboard tied to that position or delegation.",
      meta:"Specialized dashboard",
      page:"executive_procurement",
      tone:"blue",
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Good day, {user.name.split(" ")[0]}</div>
        <div className="page-sub">Choose a system area to continue.</div>
      </div>

      {hasAnything && (
        <div className="card" style={{ marginBottom:18, border:"1px solid rgba(10,30,61,.12)", background:"linear-gradient(145deg,#f8fafc 0%,#ffffff 100%)" }}>
          <div style={{ padding:"16px 20px 0" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:14 }}>
              <div style={{ fontFamily:"var(--serif)", fontSize:18, color:"var(--navy)", fontWeight:800 }}>My Active Workflows</div>
            </div>

            {/* ── Needs Your Action ── */}
            {(pendingLeaveApprovals.length > 0 || pendingFinanceApprovals.length > 0 || pendingAccountabilities.length > 0) && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#b45309", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>Needs Your Action</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                  {pendingLeaveApprovals.length > 0 && (
                    <button onClick={() => setPage("hr_leave_manage")} style={{ display:"flex", alignItems:"center", gap:10, background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:10, padding:"10px 16px", cursor:"pointer", textAlign:"left", minWidth:180 }}>
                      <div style={{ width:36, height:36, borderRadius:"50%", background:"#f59e0b22", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:17 }}>📋</span>
                      </div>
                      <div>
                        <div style={{ fontSize:20, fontWeight:800, color:"#92400e", lineHeight:1 }}>{pendingLeaveApprovals.length}</div>
                        <div style={{ fontSize:12, color:"#b45309", fontWeight:600 }}>Leave {pendingLeaveApprovals.length === 1 ? "request" : "requests"} to review</div>
                      </div>
                    </button>
                  )}
                  {(pendingFinanceApprovals.length > 0 || pendingAccountabilities.length > 0) && (
                    <button onClick={() => setPage("pending_approvals")} style={{ display:"flex", alignItems:"center", gap:10, background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:10, padding:"10px 16px", cursor:"pointer", textAlign:"left", minWidth:180 }}>
                      <div style={{ width:36, height:36, borderRadius:"50%", background:"#3b82f622", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:17 }}>💼</span>
                      </div>
                      <div>
                        <div style={{ fontSize:20, fontWeight:800, color:"#1e40af", lineHeight:1 }}>{pendingFinanceApprovals.length + pendingAccountabilities.length}</div>
                        <div style={{ fontSize:12, color:"#1d4ed8", fontWeight:600 }}>Finance {(pendingFinanceApprovals.length + pendingAccountabilities.length) === 1 ? "item" : "items"} to review</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── My In-Progress Items ── */}
            {(myActiveLeave.length > 0 || myActiveFinance.length > 0) && (
              <div style={{ marginBottom:4 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--g500)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>My In-Progress Submissions</div>
                <div style={{ display:"grid", gap:6 }}>
                  {myActiveLeave.slice(0,3).map(a => {
                    const lt = LEAVE_TYPES.find(l => l.id === a.leaveTypeId);
                    const isRejected = a.status === "rejected";
                    const statusMeta = leaveStatusMeta(a.status);
                    return (
                      <button key={a.id} onClick={() => setPage("my_leave")} style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:`1px solid ${isRejected ? "#fca5a5" : "var(--g100)"}`, borderRadius:8, padding:"10px 14px", cursor:"pointer", textAlign:"left", width:"100%" }}>
                        <span style={{ fontSize:15 }}>{isRejected ? "❌" : "🏖️"}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"var(--navy)" }}>{a.id} — {lt?.name || a.leaveTypeId}</div>
                          <div style={{ fontSize:12, color:"var(--g500)", marginTop:1 }}>
                            {new Date(a.startDate).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} – {new Date(a.endDate).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} · {a.numDays} {a.numDays === 1 ? "day" : "days"}
                          </div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, background: isRejected ? "#fee2e2" : statusMeta.bg, color: isRejected ? "#991b1b" : statusMeta.color, padding:"2px 10px", borderRadius:999, whiteSpace:"nowrap" }}>{isRejected ? "Rejected — Speak to Supervisor" : statusMeta.label}</span>
                      </button>
                    );
                  })}
                  {myActiveFinance.slice(0,3).map(r => {
                    const isRejected = r.status?.startsWith("rejected");
                    return (
                      <button key={r.id} onClick={() => setPage("my_requests")} style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:`1px solid ${isRejected ? "#fca5a5" : "var(--g100)"}`, borderRadius:8, padding:"10px 14px", cursor:"pointer", textAlign:"left", width:"100%" }}>
                        <span style={{ fontSize:15 }}>{isRejected ? "❌" : "📄"}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"var(--navy)" }}>{r.id} — {r.title}</div>
                          <div style={{ fontSize:12, color:"var(--g500)", marginTop:1 }}>UGX {Number(r.amount||0).toLocaleString()}</div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, background: isRejected ? "#fee2e2" : "#fef3c7", color: isRejected ? "#991b1b" : "#92400e", padding:"2px 10px", borderRadius:999, whiteSpace:"nowrap" }}>{isRejected ? "Rejected — Edit & Resubmit" : "In Progress"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div style={{ height:14 }} />
        </div>
      )}

      {visibleAnnouncements.length > 0 && (
        <div style={{ marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--g500)", textTransform:"uppercase", letterSpacing:".1em" }}>HR Announcements</div>
            {unreadAnnouncements > 0 && (
              <span style={{ padding:"2px 8px", borderRadius:999, background:"#fef3c7", color:"#b45309", fontSize:10.5, fontWeight:800 }}>
                {unreadAnnouncements} new
              </span>
            )}
            <button onClick={() => setPage("messages_center")} style={{ marginLeft:"auto", fontSize:12, color:"var(--navy)", fontWeight:600, background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
              View all →
            </button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {visibleAnnouncements.map((item, idx) => {
              const senderName = _users.find(u => u.id === item.senderId)?.name || "HR";
              const msgText = getAnnouncementDisplayMessage(item, user);
              const isUnread = !item.readBy?.includes(user.id);
              return (
                <div
                  key={item.id}
                  onClick={() => setPage("messages_center")}
                  style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 16px", borderRadius:14, background: idx === 0 ? "#fffbeb" : "#fff", border:`1px solid ${isUnread ? "rgba(245,158,11,.28)" : "var(--g200)"}`, cursor:"pointer", transition:"box-shadow .15s" }}
                >
                  <div style={{ width:8, height:8, borderRadius:"50%", background: isUnread ? "#f59e0b" : "var(--g300)", flexShrink:0, marginTop:5 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                      <span style={{ fontSize:12.5, fontWeight:700, color:"var(--navy)" }}>{senderName}</span>
                      <span style={{ fontSize:11, color:"#b45309", fontWeight:600 }}>
                        {item.audienceType === "department" ? item.department : "All Staff"}
                      </span>
                      <span style={{ marginLeft:"auto", fontSize:11, color:"var(--g400)" }}>{fmt(item.timestamp)}</span>
                    </div>
                    <div style={{ fontSize:13, color:"var(--g700)", lineHeight:1.55, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                      {msgText}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="dashboard-modules" style={{ gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", maxWidth:980 }}>
        {homeCards.map(card => (
          <ModuleNavCard
            key={card.key}
            icon={card.icon}
            label={card.label}
            sub={card.sub}
            meta={card.meta}
            tone={card.tone}
            onClick={() => setPage(card.page)}
          />
        ))}
      </div>
    </div>
  );
}

// â"€â"€ Standard Dashboard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function Dashboard({ user, requests, setPage, draftCount }) {
  const mine    = requests.filter(r => r.requesterId===user.id);
  const pendingRequests = getPendingForRole(user.role, requests, user.id);
  const pendingAccountabilities = getPendingAccountabilityForRole(user.role, requests, user.id);
  const pending = pendingRequests.length + pendingAccountabilities.length;
  const isApprover = ["supervisor","accountant","finance_manager","executive_director","payment_accountant"].includes(user.role);
  const approvalsByMe = requests.filter(r =>
    r.approvals?.some(a=>a.userId===user.id&&a.decision==="approved") ||
    r.accountability?.approvals?.some(a=>a.userId===user.id&&a.decision==="approved") ||
    r.accountability?.retiredById===user.id
  ).length;
  const rejectionsByMe = requests.filter(r =>
    r.approvals?.some(a=>a.userId===user.id&&a.decision==="rejected") ||
    r.accountability?.approvals?.some(a=>a.userId===user.id&&a.decision==="rejected")
  ).length;

  const stats = user.role==="requester" ? [
    { icon:"requests", label:"Total Requests", val:mine.length, bg:"#eff6ff", ic:"#3b82f6", tone:"blue" },
    { icon:"workflow", label:"In Progress", val:mine.filter(r=>r.status.startsWith("pending")).length, bg:"#fef3c7", ic:"#f59e0b", tone:"amber" },
    { icon:"approve", label:"Approved/Paid", val:mine.filter(r=>["pending_payment_accountant","paid","completed"].includes(r.status)).length, bg:"#d1fae5", ic:"#10b981", tone:"green" },
    { icon:"reject", label:"Rejected", val:mine.filter(r=>r.status.startsWith("rejected")).length, bg:"#fee2e2", ic:"#ef4444", tone:"red" },
  ] : [
    { icon:"approvals", label:"Awaiting My Action", val:pending, bg:"#fef3c7", ic:"#f59e0b", tone:"amber" },
    { icon:"approve", label:"I've Approved", val:approvalsByMe, bg:"#d1fae5", ic:"#10b981", tone:"green" },
    { icon:"reject", label:"I've Rejected", val:rejectionsByMe, bg:"#fee2e2", ic:"#ef4444", tone:"red" },
    { icon:"reports", label:"Total in System", val:requests.length, bg:"#eff6ff", ic:"#3b82f6", tone:"blue" },
  ];

  const recent = [...requests]
    .filter(r => user.role==="requester" ? r.requesterId===user.id : true)
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);

  const dashboardCards = [
    {
      icon:"requests",
      label:user.role==="requester" ? "Requests" : "All Requests",
      sub:user.role==="requester"
        ? "Open your submitted concept notes and track their progress."
        : "Review the full request register across the organisation.",
      meta:user.role==="requester" ? `${mine.length} in your workspace` : `${requests.length} in the system`,
      page:user.role==="requester" ? "my_requests" : "all_requests",
      tone:"navy",
    },
    {
      icon:"new_request",
      label:"New Request",
      sub:"Create a new concept note without leaving the dashboard.",
      meta:"Start workflow",
      page:"new_request",
      tone:"blue",
    },
    {
      icon:"approvals",
      label:"Approvals",
      sub:isApprover
        ? "Open the review queue and process items awaiting action."
        : "Track approval progress on your submitted requests.",
      meta:isApprover ? `${pending} awaiting action` : `${mine.filter(r=>r.status.startsWith("pending")).length} in review`,
      page:isApprover ? "pending_approvals" : "my_requests",
      tone:"amber",
    },
    {
      icon:user.role==="payment_accountant" ? "payments" : user.role==="finance_manager" ? "reports" : "com",
      label:user.role==="payment_accountant" ? "Payments" : user.role==="finance_manager" ? "Generate Financial Report" : "Notifications",
      sub:user.role==="payment_accountant"
        ? "Manage ready payments, track pending accountability, and complete final accountability review."
        : user.role==="finance_manager"
          ? "Open the paid-only project reporting workspace and export reports."
          : "Check the latest system updates and alerts.",
      meta:user.role==="payment_accountant"
        ? `${requests.filter(r=>["approved","pending_payment_accountant"].includes(r.status)).length} ready · ${requests.filter(r=>["paid","pending_accountability"].includes(r.status)).length} pending accountability · ${requests.filter(r=>r.status==="senior_accountant_approved").length} final review`
        : user.role==="finance_manager"
          ? "Senior Accountant reporting"
          : "Latest updates",
      page:user.role==="payment_accountant" ? "payment_queue" : user.role==="finance_manager" ? "financial_reports" : "notifications",
      tone:user.role==="payment_accountant" ? "teal" : user.role==="finance_manager" ? "violet" : "teal",
    },
    {
      icon:"edit",
      label:"My Drafts",
      sub:"Continue working on saved draft requests before submitting them for approval.",
      meta:draftCount > 0 ? `${draftCount} saved draft${draftCount !== 1 ? "s" : ""}` : "No drafts yet",
      page:"my_drafts",
      tone:"violet",
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Good day, {user.name.split(" ")[0]}</div>
        <div className="page-sub">{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
      </div>

      <div className="dashboard-modules">
        {dashboardCards.map(card => (
          <ModuleNavCard
            key={card.page}
            icon={card.icon}
            label={card.label}
            sub={card.sub}
            meta={card.meta}
            tone={card.tone}
            onClick={()=>setPage(card.page)}
          />
        ))}
      </div>

      <div className="stats-grid dashboard-stats-grid">
        {stats.map((s,i) => (
          <div className="stat-card" key={i}>
            <div className="stat-icon" style={{ background:s.bg, color:s.ic }}><IconBadge name={s.icon} tone={s.tone || "navy"} size={17} /></div>
            <div className="stat-val">{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {pending>0 && (
        <div className="alert alert-amber mb-4">
          âš¡ <strong>{pending}</strong> item{pending>1?"s":""} awaiting your review, including accountability submissions.{" "}
          <span style={{ textDecoration:"underline", cursor:"pointer", fontWeight:600 }} onClick={()=>setPage("pending_approvals")}>Review now</span>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Activity</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setPage(user.role==="requester"?"my_requests":"approval_history")}><AppButtonIcon name="view" tone="blue" />View all</button>
        </div>
        {recent.length===0 ? (
          <div className="empty-state"><div className="empty-icon"><IconBadge name="com" tone="teal" size={22} /></div><div className="empty-text">No activity yet</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ref</th><th>Title</th><th>Dept</th><th>Amount</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id}>
                    <td><span className="ref">{r.id}</span></td>
                    <td style={{ fontWeight:500 }}>{r.title}</td>
                    <td className="text-gray">{r.department}</td>
                    <td><span className="amount">{fmtAmt(r.amount)}</span></td>
                    <td><PriorityTag priority={r.priority} /></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-sm text-gray">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// â"€â"€ Admin Dashboard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function AdminDashboard({ requests, users, logs, projects, setPage }) {
  const total     = requests.length;
  const pending   = requests.filter(r=>r.status.startsWith("pending")).length;
  const completed = requests.filter(r=>r.status==="completed").length;
  const inPayment = requests.filter(r=>r.status==="pending_payment_accountant").length;
  const totalAmt  = requests.filter(r=>r.status==="completed").reduce((s,r)=>s+Number(r.amount||0),0);

  const pipeline = [
    { label:"Pending Program Manager", count:requests.filter(r=>r.status==="pending_supervisor").length, color:"#f59e0b" },
    { label:"Pending Accountant",  count:requests.filter(r=>r.status==="pending_accountant").length,  color:"#3b82f6" },
    { label:"Pending Senior Accountant", count:requests.filter(r=>r.status==="pending_finance").length, color:"#7c3aed" },
    { label:"Pending Executive Director", count:requests.filter(r=>r.status==="pending_executive_director").length, color:"#2563eb" },
    { label:"Pending Payment Officer", count:requests.filter(r=>r.status==="pending_payment_accountant").length, color:"#10b981" },
    { label:"Rejected (any)",      count:requests.filter(r=>r.status.startsWith("rejected")).length,  color:"#ef4444" },
    { label:"Completed",           count:requests.filter(r=>r.status==="completed").length,           color:"#10b981" },
  ];
  const maxPipe = Math.max(...pipeline.map(p=>p.count), 1);

  const recentLogs = [...logs].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,8);

  const adminModuleCards = [
    { icon:"requests", label:"All Requests", sub:"Open the full request register and current submissions.", meta:`${total} total requests`, page:"admin_all_requests", tone:"navy" },
    { icon:"approvals", label:"Pending Approvals", sub:"Review concepts and accountability items awaiting action.", meta:`${pending} pending`, page:"pending_approvals", tone:"amber" },
    { icon:"reports", label:"Financial Reports", sub:"View spending summaries and activity-level reporting.", meta:"Finance overview", page:"financial_reports", tone:"violet" },
    { icon:"payments", label:"Payment Queue", sub:"Process approved requests, track pending accountability, and close final accountability reviews.", meta:`${inPayment} ready`, page:"payment_queue", tone:"teal" },
    { icon:"reports", label:"Project Budgets", sub:"Manage project allocations and activity budget lines.", meta:`${projects.length} projects`, page:"admin_budgets", tone:"blue" },
    { icon:"users", label:"User Management", sub:"Maintain user access, positions, roles, and department assignments.", meta:`${users.length} users · ${getPositionOptions(users, _positions).length} positions`, page:"admin_users", tone:"rose" },
    { icon:"logs", label:"Activity Logs", sub:"Inspect recent workflow events across the ERP system.", meta:`${logs.length} events`, page:"admin_logs", tone:"teal" },
    { icon:"new_request", label:"New Request", sub:"Create a concept note directly from the admin dashboard.", meta:"Create on behalf", page:"new_request", tone:"blue" },
  ];

  const controls = [
    { icon:"users", label:"User Management", sub:`${users.length} users`, page:"admin_users", bg:"#eff6ff", ic:"#3b82f6" },
    { icon:"reports", label:"Project Budgets", sub:`${projects.length} projects`, page:"admin_budgets", bg:"#fff7ed", ic:"#f97316" },
    { icon:"requests", label:"All Requests", sub:`${total} total`, page:"admin_all_requests", bg:"#fef3c7", ic:"#f59e0b" },
    { icon:"reports", label:"Financial Reports", sub:"Export PDF", page:"financial_reports", bg:"#ecfeff", ic:"#0891b2" },
    { icon:"payments", label:"Payment Queue", sub:`${inPayment} ready`, page:"payment_queue", bg:"#d1fae5", ic:"#10b981" },
    { icon:"logs", label:"Activity Logs", sub:`${logs.length} events`, page:"admin_logs", bg:"#ede9fe", ic:"#7c3aed" },
    { icon:"approvals", label:"Pending Approvals", sub:`${pending} pending`, page:"pending_approvals", bg:"#fef3c7", ic:"#f59e0b" },
    { icon:"new_request", label:"New Request", sub:"Create on behalf", page:"new_request", bg:"var(--navy-pale)", ic:"var(--navy)" },
  ];

  void controls;

  return (
    <div className="page">
      <div className="admin-header">
        <div style={{ position:"relative", zIndex:1 }}>
          <div className="admin-header-title">Admin Center</div>
          <div className="admin-header-sub">Full system visibility · {APP_NAME} for {ORG_NAME}</div>
        </div>
        <div style={{ display:"flex", gap:32, marginTop:22, position:"relative", zIndex:1 }}>
          {[
            { l:"Total Requests", v:total },
            { l:"Pending", v:pending },
            { l:"Completed", v:completed },
            { l:"Total Paid", v:`UGX ${(totalAmt/1e6).toFixed(1)}M` },
          ].map((s,i)=>(
            <div key={i}>
              <div style={{ font:"700 26px var(--serif)", color:"#fff" }}>{s.v}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", marginTop:2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="control-cards">
        {adminModuleCards.map(card => (
          <ModuleNavCard
            key={card.page}
            icon={card.icon}
            label={card.label}
            sub={card.sub}
            meta={card.meta}
            tone={card.tone}
            onClick={()=>setPage(card.page)}
          />
        ))}
      </div>

      <div className="admin-two-col">
        <div className="card">
          <div className="card-header"><div className="card-title">Workflow Pipeline</div></div>
          <div>
            {pipeline.map(p => (
              <div key={p.label} className="pipeline-row">
                <div className="pipeline-label">{p.label}</div>
                <div className="pipeline-bar-wrap">
                  <div className="pipeline-bar" style={{ width:`${(p.count/maxPipe)*100}%`, background:p.color }} />
                </div>
                <div className="pipeline-count">{p.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Recent Activity</div></div>
          <div className="card-body" style={{ padding:"12px 18px" }}>
            {recentLogs.length===0
              ? <div className="text-sm text-gray">No activity yet.</div>
              : recentLogs.map(l => {
                const u = _users.find(x=>x.id===l.userId);
                const isRej = l.action.toLowerCase().includes("reject");
                const isApp = l.action.toLowerCase().includes("approve");
                return (
                  <div key={l.id} className="activity-item">
                    <div className="activity-dot" style={{ background: isRej?"#ef4444":isApp?"#10b981":"#3b82f6" }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:500, color:"var(--g800)" }}>{l.action}</div>
                      <div className="text-xs text-gray">{u?.name} · {fmt(l.at)}</div>
                    </div>
                    <span className="ref" style={{ flexShrink:0 }}>{l.requestId}</span>
                  </div>
                );
              })
            }
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">System Users ({users.length})</div>
          <button className="btn btn-amber btn-sm" onClick={()=>setPage("admin_users")}><AppButtonIcon name="users" tone="amber" />Manage Users</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Department</th></tr></thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td><div className="flex items-center gap-2"><Avatar str={u.avatar} /><span style={{ fontWeight:600 }}>{u.name}</span></div></td>
                  <td className="text-gray">{u.email}</td>
                  <td><span className="sbadge" style={{ background:"var(--navy-pale)", color:"var(--navy)" }}>{ROLE_LABELS[u.role]}</span></td>
                  <td className="text-gray">{u.dept}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// â"€â"€ New Request Form â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// FormField is at module level â€" prevents re-mount on re-render (fixes focus bug)
function NewRequestForm({ user, projects, requests, onSave, editRequest=null, onClose, onOpenSignatureSettings }) {
  const assignedSupervisor = getAssignedSupervisor(user) || getFallbackSupervisor(user.id);
  const savedSignature = getSavedUserSignature(user);
  const [form, setForm] = useState({
    title:       editRequest?.title       || "",
    conceptNote: editRequest?.conceptNote || "",
    amount: editRequest?.amount || "",
    purpose: editRequest?.purpose || "",
    department:  editRequest?.department  || user.dept,
    priority:    editRequest?.priority    || "normal",
    projectId:   editRequest?.projectId   || "",
    projectName: editRequest?.projectName || "",
    donorName:   editRequest?.donorName   || "",
    activityId:  editRequest?.activityId  || "",
    activityName:editRequest?.activityName|| "",
    activityCode:editRequest?.activityCode|| "",
    activityBudget: editRequest?.activityBudget || "",
    activityTitle: editRequest?.activityTitle || editRequest?.title || "",
    startDate: editRequest?.startDate || "",
    endDate: editRequest?.endDate || "",
    venue: editRequest?.venue || "",
    backgroundJustification: editRequest?.backgroundJustification || "",
    targetedParticipants: editRequest?.targetedParticipants || "",
    methodology: editRequest?.methodology || "",
    plannedOutputs: editRequest?.plannedOutputs || "",
    immediateOutcomes: editRequest?.immediateOutcomes || "",
    intermediateOutcomes: editRequest?.intermediateOutcomes || "",
    programQualityMarkers: getProgramQualityMarkersText(editRequest || {}),
    genderConsiderations: editRequest?.genderConsiderations || "",
    inclusiveLeadership: editRequest?.inclusiveLeadership || "",
    communityResilience: editRequest?.communityResilience || "",
    budgetRows: getStructuredBudgetRows(editRequest?.budgetRows?.length ? editRequest : { budgetRows:[createActivityBudgetRow({ activityCode: editRequest?.activityCode || "" })], activityCode: editRequest?.activityCode || "" }),
    file:        editRequest?.file        || null,
    signature:   editRequest?.signature   || savedSignature || null,
  });
  const [errors, setErrors] = useState({});
  const [rowErrors, setRowErrors] = useState({});

  const set = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);
  const selectedProject = getProjectById(projects, form.projectId);
  const selectedActivity = getActivityByCode(projects, form.projectId, form.activityCode);
  const budgetSnapshot = getActivityBudgetSnapshot(projects, requests, form.projectId, form.activityCode, editRequest?.id || null);
  const budgetRows = getStructuredBudgetRows({ ...form, budgetRows: form.budgetRows });
  const requestedAmount = getActivityPlanBudgetTotal(budgetRows);
  const projectedRemaining = budgetSnapshot.remainingBalance - requestedAmount;
  const durationDays = getActivityPlanDurationDays(form.startDate, form.endDate);
  const hasBudgetSelection = !!selectedProject && !!selectedActivity;
  const noBudgetSetup = projects.length === 0;

  const handleProjectChange = (projectId) => {
    const project = getProjectById(projects, projectId);
    setForm(current => ({
      ...current,
      projectId,
      projectName: project?.name || "",
      donorName: project?.donorName || "",
      activityId: "",
      activityName: "",
      activityCode: "",
      activityBudget: "",
      budgetRows: current.budgetRows.map(row => createActivityBudgetRow({ ...row, activityCode: "", budgetCode: "" })),
    }));
  };

  const handleActivityChange = (activityCode) => {
    const activity = getActivityByCode(projects, form.projectId, activityCode);
    setForm(current => ({
      ...current,
      activityCode,
      activityId: activity?.id || "",
      activityName: activity?.name || "",
      activityTitle: activity?.name || "",
      activityBudget: activity?.budgetAmount || "",
      budgetRows: current.budgetRows.map(row => createActivityBudgetRow({ ...row, activityCode: activity?.code || "", budgetCode: "" })),
    }));
  };

  const updateBudgetRow = useCallback((rowId, key, value) => {
    setForm(current => ({
      ...current,
      budgetRows: current.budgetRows.map(row =>
        row.id === rowId ? createActivityBudgetRow({ ...row, [key]: value }) : row
      ),
    }));
  }, []);

  const addBudgetRow = () => {
    setForm(current => ({
      ...current,
      budgetRows: [...current.budgetRows, createActivityBudgetRow({ activityCode: current.activityCode || "" })],
    }));
  };

  const removeBudgetRow = (rowId) => {
    setForm(current => ({
      ...current,
      budgetRows: current.budgetRows.filter(row => row.id !== rowId),
    }));
  };

  const validate = () => {
    const e = {};
    const nextRowErrors = {};
    if (!form.title.trim()) e.title = "Required";
    if (!form.projectId) e.projectId = "Select a project";
    if (!form.donorName.trim()) e.donorName = "Donor is required";
    if (!form.activityCode) e.activityCode = "Select an activity";
    if (!form.activityTitle.trim()) e.activityTitle = "Required";
    if (!form.startDate) e.startDate = "Required";
    if (!form.endDate) e.endDate = "Required";
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = "End date must be on or after the start date";
    if (!durationDays) e.durationDays = "Enter a valid activity window";
    if (!form.venue.trim()) e.venue = "Required";
    if (!form.backgroundJustification.trim()) e.backgroundJustification = "Required";
    if (!form.targetedParticipants.trim()) e.targetedParticipants = "Required";
    if (!form.methodology.trim()) e.methodology = "Required";
    if (!form.plannedOutputs.trim()) e.plannedOutputs = "Required";
    if (!form.immediateOutcomes.trim()) e.immediateOutcomes = "Required";
    if (!form.intermediateOutcomes.trim()) e.intermediateOutcomes = "Required";
    if (!form.programQualityMarkers.trim()) e.programQualityMarkers = "Required";
    if (!savedSignature) e.signature = "Upload your e-signature first";
    if (budgetRows.length === 0) e.budgetRows = "Add at least one budget row";

    budgetRows.forEach(row => {
      const issues = [];
      if (!row.budgetItem.trim()) issues.push("budget item");
      if (toNumber(row.quantity) <= 0) issues.push("quantity");
      if (row.unitCost === "" || toNumber(row.unitCost) < 0) issues.push("unit cost");
      if (toNumber(row.frequency) <= 0) issues.push("frequency");
      if (!String(row.activityCode || "").trim()) issues.push("activity code");
      if (form.activityCode && row.activityCode !== form.activityCode) issues.push("activity code alignment");
      if (getActivityBudgetRowAmount(row) <= 0) issues.push("amount");
      if (toNumber(row.amount) !== getActivityBudgetRowAmount(row)) issues.push("amount mismatch");
      if (issues.length) nextRowErrors[row.id] = `Check ${issues.join(", ")}`;
    });

    if (requestedAmount <= 0) e.amount = "Budget total must be greater than zero";
    if (requestedAmount > budgetSnapshot.remainingBalance) e.amount = "Requested amount exceeds the available activity balance";
    if (Object.keys(nextRowErrors).length) e.budgetConsistency = "Budget totals are inconsistent. Review the highlighted rows before submission.";
    setErrors(e);
    setRowErrors(nextRowErrors);
    return Object.keys(e).length === 0;
  };

  const handleSave = (submit=false) => {
    if (submit && !validate()) return;
    if (!submit && !form.title.trim()) { setErrors({ title:"Enter a title to save draft" }); return; }
    onSave({
      ...form,
      budgetRows,
      amount: requestedAmount,
      conceptNote: buildLegacyConceptNoteText(form),
      purpose: buildLegacyPurposeText(form),
      signature: savedSignature || form.signature || null,
    }, submit);
  };

  return (
    <div className="new-request-form">
      {editRequest && <div className="alert alert-amber"><AppButtonIcon name="edit" tone="amber" />Editing rejected request - make changes and resubmit.</div>}

      <div className="form-section">
        <div className="form-section-title"><AppButtonIcon name="requests" tone="blue" />Section 1 - Basic Information</div>
        <FormField label="Request Title *" error={errors.title} style={{ marginBottom:14 }}>
          <input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Community Health Outreach Supplies" />
        </FormField>
        <div className="form-grid">
          <FormField label="Department">
            <select value={form.department} onChange={e=>set("department",e.target.value)}>
              {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </FormField>
          <FormField label="Priority Level">
            <select value={form.priority} onChange={e=>set("priority",e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </FormField>
        </div>
        {noBudgetSetup ? (
          <div className="alert alert-amber" style={{ marginTop:14, marginBottom:0 }}>
            No project budgets have been configured yet. An administrator needs to add a project and activity budget before requests can be submitted.
          </div>
        ) : (
          <>
            <div className="form-grid" style={{ marginTop:14 }}>
              <FormField label="Project Name *" error={errors.projectId}>
                <select value={form.projectId} onChange={e=>handleProjectChange(e.target.value)}>
                  <option value="">Select project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Donor *" error={errors.donorName}>
                <input value={form.donorName || selectedProject?.donorName || ""} readOnly placeholder={form.projectId ? "Linked donor" : "Select project first"} />
              </FormField>
            </div>
            {hasBudgetSelection && (
              <div className="budget-summary-card">
                <div className="budget-summary-head">
                  <div>
                    <div className="budget-summary-title">{selectedProject.name}</div>
                    <div className="budget-summary-sub">{form.donorName || selectedProject.donorName} · {selectedActivity.name} ({selectedActivity.code})</div>
                  </div>
                  <span className="sbadge" style={{ background:"var(--amber-pale)", color:"var(--amber-dk)" }}>Budget Controlled</span>
                </div>
                <div className="budget-stats">
                  <div className="budget-stat">
                    <span className="budget-stat-label">Total Activity Budget</span>
                    <strong>{fmtAmt(budgetSnapshot.totalBudget)}</strong>
                  </div>
                  <div className="budget-stat">
                    <span className="budget-stat-label">Amount Used</span>
                    <strong>{fmtAmt(budgetSnapshot.usedAmount)}</strong>
                  </div>
                  <div className="budget-stat">
                    <span className="budget-stat-label">Current Remaining</span>
                    <strong>{fmtAmt(budgetSnapshot.remainingBalance)}</strong>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div className="field-hint" style={{ marginTop:8 }}>
          Assigned supervisor: {assignedSupervisor?.name || "No supervisor assigned yet"}
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Section 2 - Activity Selection & Overview</div>
        <div className="form-grid">
          <FormField label="Activity *" error={errors.activityCode}>
            <select value={form.activityCode} onChange={e=>handleActivityChange(e.target.value)} disabled={!form.projectId}>
              <option value="">{form.projectId ? "Select activity" : "Select project first"}</option>
              {(selectedProject?.activities || []).map(activity => (
                <option key={activity.id} value={activity.code}>{activity.name} ({activity.code})</option>
              ))}
            </select>
          </FormField>
          <FormField label="Activity Title *" error={errors.activityTitle}>
            <input value={form.activityTitle || selectedActivity?.name || ""} readOnly placeholder="Selected from activity dropdown" />
          </FormField>
        </div>
        <div className="form-grid" style={{ marginTop:14 }}>
          <FormField label="Project / Initiative Name">
            <input value={form.projectName || selectedProject?.name || ""} readOnly placeholder="Selected from Section 1" />
          </FormField>
          <FormField label="Activity Code">
            <input value={form.activityCode || ""} readOnly placeholder="Selected from activity dropdown" />
          </FormField>
        </div>
        <div className="form-grid" style={{ marginTop:14 }}>
          <FormField label="Start Date *" error={errors.startDate}>
            <input type="date" value={form.startDate} onChange={e=>set("startDate",e.target.value)} />
          </FormField>
          <FormField label="End Date *" error={errors.endDate}>
            <input type="date" value={form.endDate} onChange={e=>set("endDate",e.target.value)} />
          </FormField>
        </div>
        <div className="form-grid" style={{ marginTop:14 }}>
          <FormField label="Duration" error={errors.durationDays}>
            <input value={durationDays ? `${durationDays} day${durationDays === 1 ? "" : "s"}` : ""} readOnly placeholder="Automatically calculated from dates" />
          </FormField>
          <FormField label="Venue *" error={errors.venue}>
            <input value={form.venue} onChange={e=>set("venue",e.target.value)} placeholder="Venue / district / platform" />
          </FormField>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Section 3 - Content & Strategy</div>
        <FormField label="Background & Justification *" error={errors.backgroundJustification} hint="Include alignment with project design and approved work plans." style={{ marginBottom:14 }}>
          <textarea rows={4} value={form.backgroundJustification} onChange={e=>set("backgroundJustification",e.target.value)} placeholder="Explain the context, rationale, and alignment to approved plans." />
        </FormField>
        <div className="form-grid">
          <div className="section3-card">
            <div className="section3-card-title">Participation</div>
            <FormField label="Targeted Participants *" error={errors.targetedParticipants} style={{ marginBottom:0 }}>
              <textarea rows={4} value={form.targetedParticipants} onChange={e=>set("targetedParticipants",e.target.value)} placeholder="Who will participate and why were they selected?" />
            </FormField>
          </div>
          <div className="section3-card">
            <div className="section3-card-title">Delivery Approach</div>
            <FormField label="Methodology *" error={errors.methodology} style={{ marginBottom:0 }}>
              <textarea rows={4} value={form.methodology} onChange={e=>set("methodology",e.target.value)} placeholder="Describe delivery approach, facilitation methods, and implementation steps." />
            </FormField>
          </div>
        </div>
        <div className="form-grid" style={{ marginTop:14 }}>
          <div className="section3-card">
            <div className="section3-card-title">Deliverables</div>
            <FormField label="Planned Outputs *" error={errors.plannedOutputs} style={{ marginBottom:0 }}>
              <textarea rows={4} value={form.plannedOutputs} onChange={e=>set("plannedOutputs",e.target.value)} placeholder="Immediate deliverables to be produced." />
            </FormField>
          </div>
          <div className="section3-card">
            <div className="section3-card-title">Short-Term Change</div>
            <FormField label="Immediate Outcomes *" error={errors.immediateOutcomes} style={{ marginBottom:0 }}>
              <textarea rows={4} value={form.immediateOutcomes} onChange={e=>set("immediateOutcomes",e.target.value)} placeholder="Short-term changes expected right after the activity." />
            </FormField>
          </div>
        </div>
        <div className="form-grid" style={{ marginTop:14 }}>
          <div className="section3-card">
            <div className="section3-card-title">Follow-Up Change</div>
            <FormField label="Intermediate Outcomes *" error={errors.intermediateOutcomes} style={{ marginBottom:0 }}>
              <textarea rows={4} value={form.intermediateOutcomes} onChange={e=>set("intermediateOutcomes",e.target.value)} placeholder="Expected change that should emerge after follow-up." />
            </FormField>
          </div>
          <div className="section3-card compact">
            <div className="section3-card-title">Program Quality Markers</div>
            <div className="section3-stack">
              <FormField label="Program Quality Markers *" error={errors.programQualityMarkers} style={{ marginBottom:0 }}>
                <textarea rows={5} value={form.programQualityMarkers} onChange={e=>set("programQualityMarkers",e.target.value)} placeholder="Capture the key program quality markers for this activity in one structured note." />
              </FormField>
            </div>
          </div>
        </div>
        <FormField label="Attach Concept Note Document (optional)" style={{ marginTop:14, marginBottom:0 }}>
          <FileUpload value={form.file} onChange={v=>set("file",v)} />
        </FormField>
      </div>

      <div className="form-section">
        <div className="form-section-title">Section 4 - Financial Information</div>
        <div className="budget-summary-card" style={{ marginTop:0, marginBottom:14 }}>
          <div className="budget-summary-head">
            <div>
              <div className="budget-summary-title">Proposed Detailed Activity Budget</div>
              <div className="budget-summary-sub">Amounts are calculated automatically from quantity x unit cost x frequency.</div>
            </div>
            <span className="sbadge" style={{ background:"var(--navy-pale)", color:"var(--navy)" }}>Concept Note Budget</span>
          </div>
          <div className="budget-stats">
            <div className="budget-stat">
              <span className="budget-stat-label">Budget Lines</span>
              <strong>{budgetRows.length}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Requested Amount</span>
              <strong>{fmtAmt(requestedAmount)}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Current Remaining Balance</span>
              <strong>{fmtAmt(budgetSnapshot.remainingBalance)}</strong>
            </div>
          </div>
        </div>
        {(errors.budgetRows || errors.budgetConsistency || errors.amount) && (
          <div className="alert alert-red">{errors.budgetRows || errors.budgetConsistency || errors.amount}</div>
        )}
        {hasBudgetSelection && (
          <div className={`budget-balance-panel ${projectedRemaining < 0 ? "danger" : ""}`}>
            <div className="budget-balance-row"><span>Total Activity Budget</span><strong>{fmtAmt(budgetSnapshot.totalBudget)}</strong></div>
            <div className="budget-balance-row"><span>Already Used</span><strong>{fmtAmt(budgetSnapshot.usedAmount)}</strong></div>
            <div className="budget-balance-row"><span>Remaining Before This Request</span><strong>{fmtAmt(budgetSnapshot.remainingBalance)}</strong></div>
            <div className="budget-balance-row total"><span>Remaining After This Request</span><strong>{fmtAmt(projectedRemaining)}</strong></div>
            {projectedRemaining < 0 && <div className="field-error" style={{ marginTop:8 }}>This request exceeds the available balance for {selectedActivity.name}. Reduce the detailed budget total or choose another activity.</div>}
          </div>
        )}
        <div className="table-wrap new-request-budget-wrap">
          <table className="new-request-budget-table">
            <thead><tr><th>Budget Code</th><th>Budget Item</th><th>Quantity</th><th>Unit Cost</th><th>Frequency</th><th>Amount (UGX)</th><th>Activity Code</th><th>Comments</th><th></th></tr></thead>
            <tbody>
              {budgetRows.map(row => (
                <tr key={row.id}>
                  <td data-label="Budget Code" style={{ minWidth:140 }}>
                    <input value={row.budgetCode} readOnly placeholder="Auto-generated" />
                  </td>
                  <td data-label="Budget Item"><input value={row.budgetItem} onChange={e=>updateBudgetRow(row.id,"budgetItem",e.target.value)} placeholder="Budget item" /></td>
                  <td data-label="Quantity" style={{ minWidth:110 }}><input type="number" min="0" value={row.quantity} onChange={e=>updateBudgetRow(row.id,"quantity",e.target.value)} placeholder="0" /></td>
                  <td data-label="Unit Cost" style={{ minWidth:130 }}><input type="number" min="0" value={row.unitCost} onChange={e=>updateBudgetRow(row.id,"unitCost",e.target.value)} placeholder="0" /></td>
                  <td data-label="Frequency" style={{ minWidth:110 }}><input type="number" min="0" value={row.frequency} onChange={e=>updateBudgetRow(row.id,"frequency",e.target.value)} placeholder="1" /></td>
                  <td data-label="Amount (UGX)" style={{ minWidth:140 }}><input value={getActivityBudgetRowAmount(row).toLocaleString()} readOnly /></td>
                  <td data-label="Activity Code" style={{ minWidth:130 }}>
                    <input value={row.activityCode} onChange={e=>updateBudgetRow(row.id,"activityCode",e.target.value.toUpperCase())} placeholder={form.activityCode || "ACT-001"} />
                    {form.activityCode && row.activityCode && row.activityCode !== form.activityCode && <div className="field-error" style={{ marginTop:6 }}>Must match the selected activity code.</div>}
                  </td>
                  <td data-label="Comments" style={{ minWidth:180 }}>
                    <input value={row.comments} onChange={e=>updateBudgetRow(row.id,"comments",e.target.value)} placeholder="Optional comment" />
                    {rowErrors[row.id] && <div className="field-error" style={{ marginTop:6 }}>{rowErrors[row.id]}</div>}
                  </td>
                  <td data-label="Actions" style={{ width:62 }}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>removeBudgetRow(row.id)} disabled={budgetRows.length === 1}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 items-center justify-between" style={{ marginTop:14, flexWrap:"wrap" }}>
          <button className="btn btn-navy-ghost" onClick={addBudgetRow}>Add Budget Row</button>
          <div className="budget-balance-row total" style={{ minWidth:260, marginTop:0 }}>
            <span>Total Activity Budget</span>
            <strong>{fmtAmt(requestedAmount)}</strong>
          </div>
        </div>
      </div>

      <div className="form-section" style={{ display:"none" }}>
        <div className="form-section-title" style={{ display:"none" }}><AppButtonIcon name="doc" tone="blue" />Section 2 - Concept Note</div>
        <FormField label="Concept Note *" error={errors.conceptNote} hint="Describe the project background, objectives, target beneficiaries, and alignment with organisational goals." style={{ marginBottom:14, display:"none" }}>
          <textarea rows={5} value={form.conceptNote} onChange={e=>set("conceptNote",e.target.value)} placeholder="Background, objectives, expected outcomes..." />
        </FormField>
        <FormField label="Attach Concept Note Document (optional)" style={{ display:"none" }}>
          <FileUpload value={form.file} onChange={v=>set("file",v)} />
        </FormField>
      </div>

      <div className="form-section" style={{ display:"none" }}>
        <div className="form-section-title" style={{ display:"none" }}><AppButtonIcon name="payments" tone="amber" />Section 3 - Requisition Details</div>
        <FormField label="Amount Requested (UGX) *" error={errors.amount} style={{ marginBottom:12, display:"none" }}>
          <input type="number" value={form.amount} onChange={e=>set("amount",e.target.value)} placeholder="Enter amount in Uganda Shillings" style={{ fontSize:16 }} />
        </FormField>
        <FormField label="Purpose & Justification *" error={errors.purpose} hint="Link the expenditure to programme activities and expected results." style={{ marginBottom:0, display:"none" }}>
          <textarea rows={4} value={form.purpose} onChange={e=>set("purpose",e.target.value)} placeholder="Why is this expenditure necessary? What will it achieve?" />
        </FormField>
      </div>

      <div className="form-section">
        <div className="form-section-title">Section 5 - Requester Signature</div>
        <div className="text-xs text-gray" style={{ marginBottom:10 }}>
          Your saved e-signature will be attached automatically when you submit this request.
        </div>
        {savedSignature ? (
          <div style={{ padding:"10px 14px", background:"var(--g50)", borderRadius:"var(--r-sm)", border:"1px dashed var(--g300)", display:"inline-block" }}>
            {savedSignature.type==="typed"
              ? <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:20, color:"var(--navy)" }}>{savedSignature.value}</span>
              : <img src={savedSignature.value} alt="Saved signature" style={{ height:44 }} />}
          </div>
        ) : (
          <div className="alert alert-amber" style={{ marginBottom:0 }}>
            No saved e-signature found. Please add one before submitting this request.
          </div>
        )}
        {errors.signature && <div className="field-error" style={{ marginTop:6 }}>{errors.signature}</div>}
        {onOpenSignatureSettings && <button className="btn btn-ghost btn-sm" style={{ marginTop:10 }} onClick={onOpenSignatureSettings}>Manage E-Signature</button>}
      </div>

      <div className="flex gap-3" style={{ justifyContent:"flex-end", flexWrap:"wrap", marginTop:6 }}>
        {onClose && <button className="btn btn-ghost" onClick={onClose}>Cancel</button>}
        <button className="btn btn-ghost" onClick={()=>handleSave(false)}><AppButtonIcon name="save" tone="blue" />Save as Draft</button>
        <button className="btn btn-amber btn-lg" onClick={()=>handleSave(true)}><AppButtonIcon name="submit" tone="amber" />Submit for Approval</button>
      </div>
    </div>
  );
}

// â"€â"€ Request Detail Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ActivityPlanPDFModal() { return null; }
/*
  const codeSummary = getActivityPlanCodes(plan);
  return (
    <Modal title="Activity Plan PDF Preview" onClose={onClose} size="modal-lg"
      footer={
        <div className="flex gap-3 items-center">
          <span className="text-xs text-gray">Use Ctrl+P / Cmd+P to save as PDF</span>
          <button className="btn btn-primary" onClick={()=>window.print()}><AppButtonIcon name="download" tone="navy" />Print / Export PDF</button>
        </div>
      }>
      <div className="pdf-doc" style={{ fontFamily:"Roboto, system-ui, sans-serif" }}>
        <div className="report-header">
          <div className="report-brand">
            <img src={inspireLogo} alt="IYFD logo" />
            <div>
              <div className="pdf-logo">{ORG_NAME}</div>
              <div className="text-xs text-gray">Activity Planning Document</div>
              <div className="text-xs text-gray mt-1">{APP_NAME}</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="ref" style={{ fontSize:14 }}>{plan.id}</div>
            <div className="text-xs text-gray mt-1">{plan.submittedAt ? fmt(plan.submittedAt) : fmt(plan.createdAt)}</div>
            <div className="mt-2"><ActivityPlanStatusBadge status={plan.status} /></div>
          </div>
        </div>

        <div className="pdf-sec">
          <div className="pdf-sec-title">Activity Overview</div>
          <div className="pdf-row">
            <div className="pdf-field"><div className="pdf-fl">Project / Initiative Name</div><div className="pdf-fv">{plan.initiativeName}</div></div>
            <div className="pdf-field"><div className="pdf-fl">Activity Title</div><div className="pdf-fv">{plan.activityTitle}</div></div>
          </div>
          <div className="pdf-row mt-2">
            <div className="pdf-field"><div className="pdf-fl">Dates and Duration</div><div className="pdf-fv">{formatActivityPlanDateRange(plan)}{plan.durationDays ? ` (${plan.durationDays} day${plan.durationDays === 1 ? "" : "s"})` : ""}</div></div>
            <div className="pdf-field"><div className="pdf-fl">Venue</div><div className="pdf-fv">{plan.venue}</div></div>
          </div>
          <div className="mt-2"><div className="pdf-fl">Activity Code</div><div className="pdf-fv">{codeSummary.length ? codeSummary.join(", ") : "Not provided"}</div></div>
        </div>

        <div className="pdf-sec">
          <div className="pdf-sec-title">Content & Strategy</div>
          <div className="mt-2"><div className="pdf-fl">Background & Justification</div><div className="pdf-fv">{plan.backgroundJustification}</div></div>
          <div className="mt-2"><div className="pdf-fl">Targeted Participants</div><div className="pdf-fv">{plan.targetedParticipants}</div></div>
          <div className="mt-2"><div className="pdf-fl">Methodology</div><div className="pdf-fv">{plan.methodology}</div></div>
          <div className="pdf-row mt-2">
            <div className="pdf-field"><div className="pdf-fl">Planned Outputs</div><div className="pdf-fv">{plan.plannedOutputs}</div></div>
            <div className="pdf-field"><div className="pdf-fl">Immediate Outcomes</div><div className="pdf-fv">{plan.immediateOutcomes}</div></div>
          </div>
          <div className="mt-2"><div className="pdf-fl">Intermediate Outcomes</div><div className="pdf-fv">{plan.intermediateOutcomes}</div></div>
          <div className="pdf-row mt-2">
            <div className="pdf-field"><div className="pdf-fl">Gender Considerations</div><div className="pdf-fv">{plan.genderConsiderations}</div></div>
            <div className="pdf-field"><div className="pdf-fl">Inclusive Leadership / Governance</div><div className="pdf-fv">{plan.inclusiveLeadership}</div></div>
          </div>
          <div className="mt-2"><div className="pdf-fl">Community Resilience</div><div className="pdf-fv">{plan.communityResilience}</div></div>
        </div>

        <div className="pdf-sec">
          <div className="pdf-sec-title">Financial Information</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Budget Item</th><th>Qty</th><th>Unit Cost</th><th>Frequency</th><th>Amount (UGX)</th><th>Activity Code</th><th>Comments</th></tr></thead>
              <tbody>
                {plan.budgetRows.map(row => (
                  <tr key={row.id}>
                    <td>{row.budgetItem || "-"}</td>
                    <td>{row.quantity || "-"}</td>
                    <td>{row.unitCost ? Number(row.unitCost).toLocaleString() : "-"}</td>
                    <td>{row.frequency || "-"}</td>
                    <td>{getActivityBudgetRowAmount(row).toLocaleString()}</td>
                    <td>{row.activityCode || "-"}</td>
                    <td>{row.comments || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="budget-balance-row total" style={{ marginTop:12 }}>
            <span>Total Activity Budget</span>
            <strong>{fmtAmt(plan.totalBudget)}</strong>
          </div>
        </div>
      </div>
    </Modal>
  );
*/

function ActivityPlanForm() { return null; }
/*
  const [form, setForm] = useState(() => getInitialActivityPlanForm(editPlan));
  const [errors, setErrors] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [notice, setNotice] = useState("");
  const durationDays = getActivityPlanDurationDays(form.startDate, form.endDate);
  const budgetRows = form.budgetRows.map(row => createActivityBudgetRow(row));
  const budgetTotal = getActivityPlanBudgetTotal(budgetRows);

  const set = useCallback((key, value) => {
    setForm(current => ({ ...current, [key]: value }));
  }, []);

  const updateRow = useCallback((rowId, key, value) => {
    setForm(current => ({
      ...current,
      budgetRows: current.budgetRows.map(row =>
        row.id === rowId ? createActivityBudgetRow({ ...row, [key]: value }) : row
      ),
    }));
  }, []);

  const addRow = () => {
    setForm(current => ({
      ...current,
      budgetRows: [...current.budgetRows, createActivityBudgetRow()],
    }));
  };

  const removeRow = (rowId) => {
    setForm(current => ({
      ...current,
      budgetRows: current.budgetRows.filter(row => row.id !== rowId),
    }));
  };

  const validate = () => {
    const nextErrors = {};
    const nextRowErrors = {};
    if (!form.initiativeName.trim()) nextErrors.initiativeName = "Required";
    if (!form.activityTitle.trim()) nextErrors.activityTitle = "Required";
    if (!form.startDate) nextErrors.startDate = "Required";
    if (!form.endDate) nextErrors.endDate = "Required";
    if (form.startDate && form.endDate && form.endDate < form.startDate) nextErrors.endDate = "End date must be on or after the start date";
    if (!durationDays) nextErrors.durationDays = "Enter a valid activity window";
    if (!form.venue.trim()) nextErrors.venue = "Required";
    if (!form.backgroundJustification.trim()) nextErrors.backgroundJustification = "Required";
    if (!form.targetedParticipants.trim()) nextErrors.targetedParticipants = "Required";
    if (!form.methodology.trim()) nextErrors.methodology = "Required";
    if (!form.plannedOutputs.trim()) nextErrors.plannedOutputs = "Required";
    if (!form.immediateOutcomes.trim()) nextErrors.immediateOutcomes = "Required";
    if (!form.intermediateOutcomes.trim()) nextErrors.intermediateOutcomes = "Required";
    if (!form.genderConsiderations.trim()) nextErrors.genderConsiderations = "Required";
    if (!form.inclusiveLeadership.trim()) nextErrors.inclusiveLeadership = "Required";
    if (!form.communityResilience.trim()) nextErrors.communityResilience = "Required";
    if (budgetRows.length === 0) nextErrors.budgetRows = "Add at least one budget row";

    budgetRows.forEach(row => {
      const issues = [];
      const computedAmount = getActivityBudgetRowAmount(row);
      if (!row.budgetItem.trim()) issues.push("budget item");
      if (toNumber(row.quantity) <= 0) issues.push("quantity");
      if (row.unitCost === "" || toNumber(row.unitCost) < 0) issues.push("unit cost");
      if (toNumber(row.frequency) <= 0) issues.push("frequency");
      if (!String(row.activityCode || "").trim()) issues.push("activity code");
      if (computedAmount <= 0) issues.push("amount");
      if (toNumber(row.amount) !== computedAmount) issues.push("amount mismatch");
      if (issues.length) nextRowErrors[row.id] = `Check ${issues.join(", ")}`;
    });

    if (Object.keys(nextRowErrors).length) nextErrors.budgetConsistency = "Budget totals are inconsistent. Review the highlighted rows before submission.";
    if (budgetTotal <= 0) nextErrors.budgetConsistency = "Budget total must be greater than zero.";

    setErrors(nextErrors);
    setRowErrors(nextRowErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = (submit=false) => {
    setNotice("");
    if (submit && !validate()) return;
    if (!submit && !form.activityTitle.trim()) {
      setErrors({ activityTitle:"Enter an activity title to save a draft" });
      return;
    }
    const payload = {
      ...form,
      budgetRows,
      durationDays,
      totalBudget: budgetTotal,
    };
    const result = onSave(payload, submit, editPlan);
    if (result?.ok) {
      setNotice(result.message || (submit ? "Activity plan submitted." : "Draft saved."));
      if (!editPlan) setForm(getInitialActivityPlanForm());
      if (typeof onSaved === "function") onSaved(result);
    }
  };

  return (
    <div>
      {notice && <div className="alert alert-green">{notice}</div>}
      {editPlan && <div className="alert alert-blue">Updating {editPlan.status === "submitted" ? "a submitted activity plan" : "an activity plan draft"}.</div>}

      <div className="form-section">
        <div className="form-section-title">Activity Overview</div>
        <div className="form-grid">
          <FormField label="Project / Initiative Name *" error={errors.initiativeName}>
            <input list="iyfd-project-suggestions" value={form.initiativeName} onChange={e=>set("initiativeName", e.target.value)} placeholder="e.g. Youth Civic Participation Initiative" />
          </FormField>
          <FormField label="Activity Title *" error={errors.activityTitle}>
            <input value={form.activityTitle} onChange={e=>set("activityTitle", e.target.value)} placeholder="e.g. District youth leadership dialogue" />
          </FormField>
        </div>
        <datalist id="iyfd-project-suggestions">
          {projects.map(project => <option key={project.id} value={project.name} />)}
        </datalist>
        <div className="form-grid" style={{ marginTop:14 }}>
          <FormField label="Start Date *" error={errors.startDate}>
            <input type="date" value={form.startDate} onChange={e=>set("startDate", e.target.value)} />
          </FormField>
          <FormField label="End Date *" error={errors.endDate}>
            <input type="date" value={form.endDate} onChange={e=>set("endDate", e.target.value)} />
          </FormField>
        </div>
        <div className="form-grid" style={{ marginTop:14 }}>
          <FormField label="Duration" error={errors.durationDays}>
            <input value={durationDays ? `${durationDays} day${durationDays === 1 ? "" : "s"}` : ""} readOnly placeholder="Automatically calculated from dates" />
          </FormField>
          <FormField label="Venue *" error={errors.venue}>
            <input value={form.venue} onChange={e=>set("venue", e.target.value)} placeholder="Venue / district / platform" />
          </FormField>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Content & Strategy</div>
        <FormField label="Background & Justification *" error={errors.backgroundJustification} hint="Show alignment with project design, work plans, and why the activity is needed." style={{ marginBottom:14 }}>
          <textarea rows={4} value={form.backgroundJustification} onChange={e=>set("backgroundJustification", e.target.value)} placeholder="Explain the context, rationale, and alignment to approved plans." />
        </FormField>
        <div className="form-grid">
          <FormField label="Targeted Participants *" error={errors.targetedParticipants}>
            <textarea rows={4} value={form.targetedParticipants} onChange={e=>set("targetedParticipants", e.target.value)} placeholder="Who will participate and why were they selected?" />
          </FormField>
          <FormField label="Methodology *" error={errors.methodology}>
            <textarea rows={4} value={form.methodology} onChange={e=>set("methodology", e.target.value)} placeholder="Describe delivery approach, facilitation methods, and implementation steps." />
          </FormField>
        </div>
        <div className="form-grid" style={{ marginTop:14 }}>
          <FormField label="Planned Outputs *" error={errors.plannedOutputs}>
            <textarea rows={4} value={form.plannedOutputs} onChange={e=>set("plannedOutputs", e.target.value)} placeholder="Immediate deliverables to be produced." />
          </FormField>
          <FormField label="Immediate Outcomes *" error={errors.immediateOutcomes}>
            <textarea rows={4} value={form.immediateOutcomes} onChange={e=>set("immediateOutcomes", e.target.value)} placeholder="Short-term changes expected right after the activity." />
          </FormField>
        </div>
        <div className="form-grid" style={{ marginTop:14 }}>
          <FormField label="Intermediate Outcomes *" error={errors.intermediateOutcomes}>
            <textarea rows={4} value={form.intermediateOutcomes} onChange={e=>set("intermediateOutcomes", e.target.value)} placeholder="Expected change that should emerge after follow-up." />
          </FormField>
          <div className="form-group">
            <label>Program Quality Markers</label>
            <div className="form-grid" style={{ gridTemplateColumns:"1fr", gap:12 }}>
              <FormField label="Gender Considerations *" error={errors.genderConsiderations}>
                <textarea rows={3} value={form.genderConsiderations} onChange={e=>set("genderConsiderations", e.target.value)} placeholder="How the activity responds to gender needs and barriers." />
              </FormField>
              <FormField label="Inclusive Leadership / Governance *" error={errors.inclusiveLeadership}>
                <textarea rows={3} value={form.inclusiveLeadership} onChange={e=>set("inclusiveLeadership", e.target.value)} placeholder="How inclusive participation and governance will be promoted." />
              </FormField>
              <FormField label="Community Resilience *" error={errors.communityResilience} style={{ marginBottom:0 }}>
                <textarea rows={3} value={form.communityResilience} onChange={e=>set("communityResilience", e.target.value)} placeholder="How the activity strengthens resilience and local ownership." />
              </FormField>
            </div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Financial Information</div>
        <div className="budget-summary-card" style={{ marginTop:0, marginBottom:14 }}>
          <div className="budget-summary-head">
            <div>
              <div className="budget-summary-title">Proposed Detailed Activity Budget</div>
              <div className="budget-summary-sub">Amounts are calculated automatically from quantity x unit cost x frequency.</div>
            </div>
            <span className="sbadge" style={{ background:"var(--navy-pale)", color:"var(--navy)" }}>Planner Budget</span>
          </div>
          <div className="budget-stats">
            <div className="budget-stat">
              <span className="budget-stat-label">Budget Lines</span>
              <strong>{budgetRows.length}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Total</span>
              <strong>{fmtAmt(budgetTotal)}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Prepared By</span>
              <strong>{user.name}</strong>
            </div>
          </div>
        </div>
        {(errors.budgetRows || errors.budgetConsistency) && <div className="alert alert-red">{errors.budgetRows || errors.budgetConsistency}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Budget Item</th><th>Quantity</th><th>Unit Cost</th><th>Frequency</th><th>Amount (UGX)</th><th>Activity Code</th><th>Comments</th><th></th></tr></thead>
            <tbody>
              {budgetRows.map(row => (
                <tr key={row.id}>
                  <td><input value={row.budgetItem} onChange={e=>updateRow(row.id, "budgetItem", e.target.value)} placeholder="Budget item" /></td>
                  <td style={{ minWidth:110 }}><input type="number" min="0" value={row.quantity} onChange={e=>updateRow(row.id, "quantity", e.target.value)} placeholder="0" /></td>
                  <td style={{ minWidth:130 }}><input type="number" min="0" value={row.unitCost} onChange={e=>updateRow(row.id, "unitCost", e.target.value)} placeholder="0" /></td>
                  <td style={{ minWidth:110 }}><input type="number" min="0" value={row.frequency} onChange={e=>updateRow(row.id, "frequency", e.target.value)} placeholder="1" /></td>
                  <td style={{ minWidth:140 }}><input value={getActivityBudgetRowAmount(row).toLocaleString()} readOnly /></td>
                  <td style={{ minWidth:130 }}><input value={row.activityCode} onChange={e=>updateRow(row.id, "activityCode", e.target.value.toUpperCase())} placeholder="ACT-001" /></td>
                  <td style={{ minWidth:180 }}>
                    <input value={row.comments} onChange={e=>updateRow(row.id, "comments", e.target.value)} placeholder="Optional comment" />
                    {rowErrors[row.id] && <div className="field-error" style={{ marginTop:6 }}>{rowErrors[row.id]}</div>}
                  </td>
                  <td style={{ width:62 }}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>removeRow(row.id)} disabled={budgetRows.length === 1}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 items-center justify-between" style={{ marginTop:14, flexWrap:"wrap" }}>
          <button className="btn btn-navy-ghost" onClick={addRow}>Add Budget Row</button>
          <div className="budget-balance-row total" style={{ minWidth:260, marginTop:0 }}>
            <span>Total Activity Budget</span>
            <strong>{fmtAmt(budgetTotal)}</strong>
          </div>
        </div>
      </div>

      <div className="flex gap-3" style={{ justifyContent:"flex-end", flexWrap:"wrap", marginTop:6 }}>
        {onClose && <button className="btn btn-ghost" onClick={onClose}>Cancel</button>}
        <button className="btn btn-ghost" onClick={()=>handleSave(false)}>{editPlan ? "Save Changes" : "Save Draft"}</button>
        <button className="btn btn-amber btn-lg" onClick={()=>handleSave(true)}>{editPlan?.status === "submitted" ? "Update Submission" : "Submit Activity Plan"}</button>
      </div>
    </div>
  );
*/

function ActivityPlansDashboard() { return null; }
/*
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [codeFilter, setCodeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [showNew, setShowNew] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [pdfPlan, setPdfPlan] = useState(null);

  const visiblePlans = getVisibleActivityPlans(activityPlans, user);
  const projectOptions = [...new Set(visiblePlans.map(plan => plan.initiativeName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const codeOptions = [...new Set(visiblePlans.flatMap(plan => getActivityPlanCodes(plan)))].sort((a,b)=>a.localeCompare(b));
  const filteredPlans = visiblePlans
    .filter(plan => !search || [plan.id, plan.initiativeName, plan.activityTitle, plan.venue, plan.createdByName, ...getActivityPlanCodes(plan)].join(" ").toLowerCase().includes(search.toLowerCase()))
    .filter(plan => projectFilter === "all" || plan.initiativeName === projectFilter)
    .filter(plan => codeFilter === "all" || getActivityPlanCodes(plan).includes(codeFilter))
    .filter(plan => statusFilter === "all" || plan.status === statusFilter)
    .filter(plan => {
      const planStart = plan.startDate || plan.createdAt?.slice(0,10) || "";
      const planEnd = plan.endDate || planStart;
      if (fromDate && planEnd < fromDate) return false;
      if (toDate && planStart > toDate) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "earliest") return new Date(a.submittedAt || a.createdAt) - new Date(b.submittedAt || b.createdAt);
      if (sortBy === "project") return (a.initiativeName || "").localeCompare(b.initiativeName || "");
      if (sortBy === "activity_code") return (getActivityPlanCodes(a)[0] || "").localeCompare(getActivityPlanCodes(b)[0] || "");
      return new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt);
    });

  const stats = [
    { icon:"reports", label:"Total Activity Plans", val:visiblePlans.length, bg:"#eff6ff", ic:"#3b82f6" },
    { icon:"approve", label:"Submitted", val:visiblePlans.filter(plan => plan.status === "submitted").length, bg:"#d1fae5", ic:"#10b981" },
    { icon:"save", label:"Drafts", val:visiblePlans.filter(plan => plan.status === "draft").length, bg:"#f3f4f6", ic:"#6b7280" },
    { icon:"payments", label:"Budget Value", val:fmtAmt(visiblePlans.reduce((sum, plan) => sum + toNumber(plan.totalBudget), 0)), bg:"#fff7ed", ic:"#f59e0b" },
  ];

  const canCreate = user.role === "admin";
  const canEditPlan = (plan) => user.role === "admin" || (plan.createdById === user.id && plan.status === "draft");

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Activity Planning Dashboard</div>
          <div className="page-sub">Track planning submissions, budgets, and PDF-ready activity documentation.</div>
        </div>
        <div className="flex gap-3" style={{ flexWrap:"wrap" }}>
          <button className="btn btn-ghost" onClick={()=>setPage("new_request")}>Back to New Request</button>
          {canCreate && <button className="btn btn-amber" onClick={()=>setShowNew(true)}>New Activity Plan</button>}
        </div>
      </div>

      <div className="stats-grid">
        {stats.map(stat => (
          <div key={stat.label} className="stat-card">
            <div className="stat-icon" style={{ background:stat.bg, color:stat.ic }}>{stat.icon}</div>
            <div className="stat-val" style={{ fontSize: typeof stat.val === "string" ? 24 : 30 }}>{stat.val}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="filters">
        <input className="f-input" placeholder="Search plans..." value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="f-input" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}>
          <option value="all">All Projects</option>
          {projectOptions.map(project => <option key={project} value={project}>{project}</option>)}
        </select>
        <select className="f-input" value={codeFilter} onChange={e=>setCodeFilter(e.target.value)}>
          <option value="all">All Activity Codes</option>
          {codeOptions.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
        <select className="f-input" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="latest">Latest first</option>
          <option value="earliest">Earliest first</option>
          <option value="project">Sort by project</option>
          <option value="activity_code">Sort by activity code</option>
        </select>
        <input className="f-input" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} title="From date" />
        <input className="f-input" type="date" value={toDate} onChange={e=>setToDate(e.target.value)} title="To date" />
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {["all","submitted","draft"].map(status => (
            <span key={status} className={`chip ${statusFilter === status ? "active" : ""}`} onClick={()=>setStatusFilter(status)}>
              {status === "all" ? "All Statuses" : ACTIVITY_PLAN_STATUS_CFG[status]?.label || status}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        {filteredPlans.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><IconBadge name="reports" tone="blue" size={22} /></div>
            <div className="empty-text">No activity plans found</div>
            <div className="empty-sub">Adjust the project, dates, or activity code filters to widen the view.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>Project / Initiative</th><th>Activity Title</th><th>Dates</th><th>Venue</th><th>Activity Code</th><th>Total Budget</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
              <tbody>
                {filteredPlans.map(plan => (
                  <tr key={plan.id}>
                    <td><span className="ref">{plan.id}</span></td>
                    <td style={{ fontWeight:600 }}>{plan.initiativeName}</td>
                    <td>{plan.activityTitle}</td>
                    <td className="text-gray">{formatActivityPlanDateRange(plan)}</td>
                    <td className="text-gray">{plan.venue}</td>
                    <td><span className="ref">{getActivityPlanCodes(plan).join(", ") || "-"}</span></td>
                    <td><span className="amount">{fmtAmt(plan.totalBudget)}</span></td>
                    <td><ActivityPlanStatusBadge status={plan.status} /></td>
                    <td className="text-sm text-gray">{plan.submittedAt ? fmt(plan.submittedAt) : "Draft only"}</td>
                    <td>
                      <div className="flex gap-2" style={{ flexWrap:"wrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setPdfPlan(plan)}><AppButtonIcon name="download" tone="blue" />PDF</button>
                        {canEditPlan(plan) && <button className="btn btn-ghost btn-sm" onClick={()=>setEditPlan(plan)}>Edit</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && (
        <Modal title="New Activity Plan" onClose={()=>setShowNew(false)} size="modal-lg">
          <ActivityPlanForm
            user={user}
            projects={projects}
            onSave={onSavePlan}
            onClose={()=>setShowNew(false)}
            onSaved={(result) => {
              if (result?.plan?.status === "submitted") setPdfPlan(result.plan);
              setShowNew(false);
            }}
          />
        </Modal>
      )}
      {editPlan && (
        <Modal title="Edit Activity Plan" onClose={()=>setEditPlan(null)} size="modal-lg">
          <ActivityPlanForm
            user={user}
            projects={projects}
            editPlan={editPlan}
            onSave={onSavePlan}
            onClose={()=>setEditPlan(null)}
            onSaved={(result) => {
              if (result?.plan?.status === "submitted") setPdfPlan(result.plan);
              setEditPlan(null);
            }}
          />
        </Modal>
      )}
      {pdfPlan && <ActivityPlanPDFModal plan={pdfPlan} onClose={()=>setPdfPlan(null)} />}
    </div>
  );
*/

function NewRequestPage({ user, projects, requests, onSaveRequest, onOpenSignatureSettings }) {
  return (
    <div className="page new-request-page">
      <div className="page-header">
        <div className="page-title">New Request</div>
        <div className="page-sub">Submit a financial approval request using the updated concept note template and existing approval workflow.</div>
      </div>
      <div className="card new-request-card"><div className="card-body">
        <NewRequestForm user={user} projects={projects} requests={requests} onSave={(form, submit)=>onSaveRequest(form, submit)} onOpenSignatureSettings={onOpenSignatureSettings} />
      </div></div>
    </div>
  );
}
/*

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">New Request</div>
        <div className="page-sub">Use the existing approval request flow or the new activity planning module without affecting current approvals.</div>
      </div>

      <div className="filters" style={{ marginBottom:20 }}>
        <span className={`chip ${tab === "approval" ? "active" : ""}`} onClick={()=>setTab("approval")}>Approval Request</span>
        <span className={`chip ${tab === "activity_plan" ? "active" : ""}`} onClick={()=>setTab("activity_plan")}>Activity Planning</span>
      </div>

      {tab === "approval" ? (
        <div className="card"><div className="card-body">
          <NewRequestForm user={user} projects={projects} requests={requests} onSave={(form, submit)=>onSaveRequest(form, submit)} />
        </div></div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon" style={{ background:"#eff6ff", color:"#3b82f6" }}><IconBadge name="reports" tone="blue" size={17} /></div>
              <div className="stat-val">{visiblePlans.length}</div>
              <div className="stat-label">Visible Activity Plans</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background:"#d1fae5", color:"#10b981" }}><IconBadge name="approve" tone="green" size={17} /></div>
              <div className="stat-val">{submittedPlans}</div>
              <div className="stat-label">Submitted Plans</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background:"#fff7ed", color:"#f59e0b" }}><IconBadge name="payments" tone="amber" size={17} /></div>
              <div className="stat-val" style={{ fontSize:24 }}>{fmtAmt(visiblePlans.reduce((sum, plan) => sum + toNumber(plan.totalBudget), 0))}</div>
              <div className="stat-label">Planned Budget Value</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom:18 }}>
            <div className="card-header">
              <div>
                <div className="card-title">Activity Planning Module</div>
                <div className="page-sub">A separate planning workflow for documenting activities, strategy, and detailed budgets.</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setPage("activity_plans")}>Open Dashboard</button>
            </div>
            <div className="card-body">
              {canCreateActivityPlan ? (
                <ActivityPlanForm user={user} projects={projects} onSave={onSaveActivityPlan} onSaved={(result) => {
                  if (result?.plan?.status === "submitted") setPage("activity_plans");
                }} />
              ) : (
                <div className="alert alert-blue" style={{ marginBottom:0 }}>
                  Activity plans are created by administrators. Supervisors and admins can review submissions immediately from the activity planning dashboard.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
*/

const RETIRED_ACTIVITY_PLANNER = [ActivityPlanPDFModal, ActivityPlanForm, ActivityPlansDashboard];
void RETIRED_ACTIVITY_PLANNER;

function AccountabilitySectionCard({ title, subtitle, open, onToggle, complete, children }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onToggle}
        style={{
          width: "100%",
          justifyContent: "space-between",
          padding: "18px 20px",
          borderBottom: open ? "1px solid var(--g100)" : "none",
          borderRadius: 0,
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>{title}</div>
          {subtitle && <div className="text-xs text-gray" style={{ marginTop: 4 }}>{subtitle}</div>}
        </div>
        <span className="sbadge" style={{ background: complete ? "#d1fae5" : "#eef2ff", color: complete ? "#065f46" : "#4338ca" }}>
          {complete ? "Complete" : "In progress"}
        </span>
      </button>
      {open && <div className="card-body" style={{ padding: "18px 20px" }}>{children}</div>}
    </div>
  );
}

function AccountabilityToggleField({ label, value, onChange, error }) {
  const optionStyle = (active, tone) => ({
    minWidth: 72,
    justifyContent: "center",
    border: `1px solid ${active ? tone.border : "#d6deea"}`,
    background: active ? tone.background : "#fff",
    color: active ? tone.color : "var(--g600)",
  });

  return (
    <div style={{ padding: "14px 16px", border: "1px solid #dbe4f0", borderRadius: 14, background: "#fff" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--g800)", marginBottom: 10 }}>{label}</div>
      <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-sm"
          style={optionStyle(value === true, { border: "#86efac", background: "#dcfce7", color: "#166534" })}
          onClick={() => onChange(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className="btn btn-sm"
          style={optionStyle(value === false, { border: "#cbd5f5", background: "#eef2ff", color: "#4338ca" })}
          onClick={() => onChange(false)}
        >
          No
        </button>
      </div>
      {error && <div className="field-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function MultiFileUploadField({
  value = [],
  onChange,
  accept,
  allowedExtensions,
  emptyTitle,
  emptyHint,
  icon = "doc",
  error = "",
  minimumHint = "",
  multiple = true,
}) {
  const files = normalizeStoredUploadList(value);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const handleChange = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selectedFiles.length) return;

    const invalid = selectedFiles.find(file => !isAllowedUploadFile(file, allowedExtensions));
    if (invalid) {
      setUploadError(`"${invalid.name}" is not an allowed file type.`);
      return;
    }

    const oversized = selectedFiles.find(file => file.size > 5 * 1024 * 1024);
    if (oversized) {
      setUploadError(`"${oversized.name}" exceeds the 5 MB upload limit.`);
      return;
    }

    setIsUploading(true);
    try {
      const storedFiles = await Promise.all(selectedFiles.map(file => fileToStoredUpload(file, "accountability")));
      onChange(multiple ? [...files, ...storedFiles] : storedFiles.slice(0, 1));
      setUploadError("");
    } catch {
      setUploadError("One or more files could not be processed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (fileId) => onChange(files.filter(file => file.id !== fileId));

  return (
    <div>
      <div className="file-drop" style={{ minHeight: 150 }}>
        <input type="file" accept={accept} multiple={multiple} onChange={handleChange} />
        <div style={{ fontSize: 26, marginBottom: 6 }}>
          <IconBadge name={icon} tone="blue" size={18} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--g700)" }}>
          {isUploading ? "Uploading files..." : emptyTitle}
        </div>
        <div className="text-xs text-gray" style={{ marginTop: 3 }}>{emptyHint}</div>
        {minimumHint && <div className="text-xs text-gray" style={{ marginTop: 6 }}>{minimumHint}</div>}
      </div>

      {(error || uploadError) && <div className="field-error" style={{ marginTop: 8 }}>{error || uploadError}</div>}

      {files.length > 0 && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {files.map(file => {
            const isImage = String(file.type || "").startsWith("image/") || [".jpg", ".jpeg", ".png"].includes(getStoredUploadExtension(file.name));
            return (
              <div key={file.id} className="file-info" style={{ alignItems: "flex-start" }}>
                <div className="file-icon">
                  <IconBadge name={isImage ? "doc" : icon} tone={isImage ? "teal" : "blue"} size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--g800)" }}>{file.name}</div>
                  <div className="text-xs text-gray">{formatFileSize(file.size)} · {file.type || "file"}</div>
                  {isImage && file.dataUrl && (
                    <div style={{ marginTop: 10 }}>
                      <img
                        src={file.dataUrl}
                        alt={file.name}
                        style={{ width: 92, height: 72, objectFit: "cover", borderRadius: 10, border: "1px solid #dbe4f0" }}
                      />
                    </div>
                  )}
                </div>
                {file.dataUrl && (
                  <a href={file.dataUrl} download={file.name} className="btn btn-ghost btn-sm">
                    Download
                  </a>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeFile(file.id)}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Stage 4 – Requester submits the structured activity report plus receipts and photos.
 */
function LegacyAccountabilityForm({ req, onSave, onClose }) {
  const requester = _users.find(user => user.id === req.requesterId) || null;
  const draftKey = getAccountabilityDraftKey(req.id);
  const draftPayload = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const mergedDraftReport = draftPayload?.reportData
    ? {
        ...(req.accountabilityReportData || {}),
        ...draftPayload.reportData,
        participantData: {
          ...(req.accountabilityReportData?.participantData || {}),
          ...(draftPayload.reportData.participantData || {}),
        },
        programQuality: {
          ...(req.accountabilityReportData?.programQuality || {}),
          ...(draftPayload.reportData.programQuality || {}),
        },
      }
    : (req.accountabilityReportData || null);

  const [form, setForm] = useState(() => ({
    reportData: normalizeAccountabilityReportData(mergedDraftReport, req, getSavedUserSignature(requester)),
    receipts: normalizeStoredUploadList(draftPayload?.receipts || req.accountabilityReceipts || []),
    photos: normalizeStoredUploadList(draftPayload?.photos || req.accountabilityPhotos || []),
  }));
  const [errors, setErrors] = useState({});
  const [sectionsOpen, setSectionsOpen] = useState({
    basic: true,
    details: true,
    results: true,
    participants: true,
    quality: false,
    narrative: false,
    signoff: false,
    uploads: true,
  });
  const hasExistingDraft = Boolean(draftPayload);

  const setReportField = useCallback((key, value) => {
    setForm(current => ({ ...current, reportData: { ...current.reportData, [key]: value } }));
  }, []);

  const setParticipantField = useCallback((key, value) => {
    const normalizedValue = value === "" ? "" : String(Math.max(Math.floor(Number(value || 0)), 0));
    setForm(current => ({
      ...current,
      reportData: {
        ...current.reportData,
        participantData: {
          ...current.reportData.participantData,
          [key]: normalizedValue,
        },
      },
    }));
  }, []);

  const setProgramQualityField = useCallback((key, value) => {
    setForm(current => ({
      ...current,
      reportData: {
        ...current.reportData,
        programQuality: {
          ...current.reportData.programQuality,
          [key]: value,
        },
      },
    }));
  }, []);

  const participantTotals = getAccountabilityParticipantTotals(form.reportData.participantData);
  const sectionCompletion = {
    basic: Boolean(
      form.reportData.projectName.trim() &&
      form.reportData.reportingOfficers.trim() &&
      form.reportData.reportingDate &&
      form.reportData.activityStartDate &&
      form.reportData.activityEndDate &&
      form.reportData.projectSites.trim() &&
      form.reportData.activityTitle.trim()
    ),
    details: Boolean(form.reportData.description.trim() && form.reportData.objectives.trim()),
    results: Boolean(form.reportData.achievements.trim() && form.reportData.immediateOutcomes.trim()),
    participants: Boolean(
      Object.values(form.reportData.participantData).every(value => value !== "") &&
      participantTotals.overallTotal > 0
    ),
    quality: Object.values(form.reportData.programQuality).every(value => value !== null),
    narrative: Boolean(
      form.reportData.recommendations.trim() &&
      form.reportData.challenges.trim() &&
      form.reportData.lessonsLearned.trim()
    ),
    signoff: Boolean(form.reportData.reportWriterSignature),
    uploads: form.receipts.length >= 1 && form.photos.length >= 2,
  };
  const totalSections = Object.keys(sectionCompletion).length;
  const completedSections = Object.values(sectionCompletion).filter(Boolean).length;
  const progressPercent = Math.round((completedSections / totalSections) * 100);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      reportData: form.reportData,
      receipts: form.receipts,
      photos: form.photos,
      savedAt: ts(),
    };
    window.localStorage.setItem(draftKey, JSON.stringify(payload));
  }, [draftKey, form]);

  const submit = () => {
    const report = form.reportData;
    const nextErrors = {};

    if (!report.projectName.trim()) nextErrors.projectName = "Project / Initiative Name is required.";
    if (!report.reportingOfficers.trim()) nextErrors.reportingOfficers = "Reporting Officer(s) is required.";
    if (!report.reportingDate) nextErrors.reportingDate = "Reporting Date is required.";
    if (!report.activityStartDate || !report.activityEndDate) {
      nextErrors.activityDates = "Both activity start and end dates are required.";
    } else if (new Date(report.activityEndDate) < new Date(report.activityStartDate)) {
      nextErrors.activityDates = "Activity end date cannot be earlier than the start date.";
    }
    if (!report.projectSites.trim()) nextErrors.projectSites = "Project Site(s) is required.";
    if (!report.activityTitle.trim()) nextErrors.activityTitle = "Activity Title is required.";
    if (!report.description.trim()) nextErrors.description = "Description of Activity is required.";
    if (!report.objectives.trim()) nextErrors.objectives = "Activity Objectives is required.";
    if (!report.achievements.trim()) nextErrors.achievements = "Achievements is required.";
    if (!report.immediateOutcomes.trim()) nextErrors.immediateOutcomes = "Immediate Outcomes is required.";
    if (!Object.values(report.participantData).every(value => value !== "")) {
      nextErrors.participantData = "Enter all participant counts. Use 0 where applicable.";
    } else if (participantTotals.overallTotal <= 0) {
      nextErrors.participantData = "Participant totals must be greater than 0.";
    }
    if (!Object.values(report.programQuality).every(value => value !== null)) {
      nextErrors.programQuality = "Please answer every program quality question.";
    }
    if (!report.recommendations.trim()) nextErrors.recommendations = "Recommendations / Follow-up Actions is required.";
    if (!report.challenges.trim()) nextErrors.challenges = "Challenges Encountered is required.";
    if (!report.lessonsLearned.trim()) nextErrors.lessonsLearned = "Key Lessons Learned is required.";
    if (!report.reportWriterSignature) nextErrors.reportWriterSignature = "Report writer signature is required.";
    if (form.receipts.length < 1) nextErrors.receipts = "Upload at least one receipt file.";
    if (form.photos.length < 2) nextErrors.photos = "Upload at least two activity photos.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setSectionsOpen(current => ({
        ...current,
        basic: current.basic || Boolean(nextErrors.projectName || nextErrors.reportingOfficers || nextErrors.reportingDate || nextErrors.activityDates || nextErrors.projectSites || nextErrors.activityTitle),
        details: current.details || Boolean(nextErrors.description || nextErrors.objectives),
        results: current.results || Boolean(nextErrors.achievements || nextErrors.immediateOutcomes),
        participants: current.participants || Boolean(nextErrors.participantData),
        quality: current.quality || Boolean(nextErrors.programQuality),
        narrative: current.narrative || Boolean(nextErrors.recommendations || nextErrors.challenges || nextErrors.lessonsLearned),
        signoff: current.signoff || Boolean(nextErrors.reportWriterSignature),
        uploads: current.uploads || Boolean(nextErrors.receipts || nextErrors.photos),
      }));
      return;
    }

    if (typeof window !== "undefined") window.localStorage.removeItem(draftKey);
    onSave({
      reportData: normalizeAccountabilityReportData({
        ...report,
        submissionDate: toDateInputValue(ts()),
      }, req, getSavedUserSignature(requester)),
      receipts: form.receipts,
      photos: form.photos,
    });
  };

  const renderSignaturePreview = (signature, emptyText) => {
    if (!signature) {
      return (
        <div style={{ padding: "14px 16px", borderRadius: 12, border: "1px dashed #d6deea", color: "var(--g500)", background: "#f8fafc" }}>
          {emptyText}
        </div>
      );
    }
    return (
      <div style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid #dbe4f0", background: "#fff" }}>
        {signature.type === "typed"
          ? <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 20, color: "var(--navy)" }}>{signature.value}</div>
          : <img src={signature.value} alt="Signature" style={{ height: 54, maxWidth: "100%" }} />}
      </div>
    );
  };

  return (
    <div>
      {req.accountabilityRejectionReason && (
        <div className="alert alert-red" style={{ marginBottom: 16 }}>
          <strong>Rejection Reason:</strong> {req.accountabilityRejectionReason}
          {req.accountabilityRejectedBy && (
            <div className="mt-1 text-sm">
              Feedback from {req.accountabilityRejectedBy}
              {req.accountabilityRejectedAt ? ` on ${fmt(req.accountabilityRejectedAt)}` : ""}. Please revise the report and resubmit.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "#b45309" }}>
                Project Activity Reporting Template
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)", marginTop: 6 }}>
                Structured accountability submission
              </div>
              <div className="text-xs text-gray" style={{ marginTop: 6, lineHeight: 1.7 }}>
                Complete the narrative template, upload only receipts and activity photos, and submit for supervisor review.
              </div>
            </div>
            <div style={{ minWidth: 220, flex: "1 1 220px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, fontWeight: 700, color: "var(--g600)" }}>
                <span>Progress</span>
                <span>{progressPercent}% complete</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
                <div style={{ width: `${progressPercent}%`, height: "100%", background: "linear-gradient(90deg,#0f766e 0%,#1d4ed8 100%)" }} />
              </div>
              <div className="text-xs text-gray" style={{ marginTop: 8 }}>
                {completedSections} of {totalSections} sections completed
                {hasExistingDraft ? " · Draft restored from local auto-save" : " · Auto-save enabled"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="alert alert-blue" style={{ marginBottom: 16 }}>
        Upload restrictions: receipts accept PDF, JPG, and PNG only. Activity photos accept JPG and PNG only, with a minimum of two files.
      </div>

      <AccountabilitySectionCard title="Section 1: Basic Information" subtitle="Core reporting identifiers and activity timing." open={sectionsOpen.basic} onToggle={() => setSectionsOpen(current => ({ ...current, basic: !current.basic }))} complete={sectionCompletion.basic}>
        <div className="form-grid">
          <FormField label="Project / Initiative Name *" error={errors.projectName}><input value={form.reportData.projectName} onChange={e => setReportField("projectName", e.target.value)} /></FormField>
          <FormField label="Reporting Officer(s) *" error={errors.reportingOfficers}><input value={form.reportData.reportingOfficers} onChange={e => setReportField("reportingOfficers", e.target.value)} /></FormField>
          <FormField label="Reporting Date *" error={errors.reportingDate}><input type="date" value={form.reportData.reportingDate} onChange={e => setReportField("reportingDate", e.target.value)} /></FormField>
          <FormField label="Submission Date"><input type="date" value={form.reportData.submissionDate} readOnly /></FormField>
          <FormField label="Activity Start Date *" error={errors.activityDates}><input type="date" value={form.reportData.activityStartDate} onChange={e => setReportField("activityStartDate", e.target.value)} /></FormField>
          <FormField label="Activity End Date *"><input type="date" value={form.reportData.activityEndDate} onChange={e => setReportField("activityEndDate", e.target.value)} /></FormField>
          <FormField label="Project Site(s) *" error={errors.projectSites} full><input value={form.reportData.projectSites} onChange={e => setReportField("projectSites", e.target.value)} /></FormField>
          <FormField label="Activity Title *" error={errors.activityTitle} full><input value={form.reportData.activityTitle} onChange={e => setReportField("activityTitle", e.target.value)} /></FormField>
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 2: Activity Details" subtitle="Describe what was implemented, how it was delivered, and the intended objectives." open={sectionsOpen.details} onToggle={() => setSectionsOpen(current => ({ ...current, details: !current.details }))} complete={sectionCompletion.details}>
        <div className="form-grid">
          <FormField label="Description of Activity *" error={errors.description} hint="Include the introduction, methodology, and approach used during delivery." full>
            <textarea rows={6} value={form.reportData.description} onChange={e => setReportField("description", e.target.value)} />
          </FormField>
          <FormField label="Activity Objectives *" error={errors.objectives} full>
            <textarea rows={4} value={form.reportData.objectives} onChange={e => setReportField("objectives", e.target.value)} />
          </FormField>
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 3: Achievements & Results" subtitle="Capture the immediate delivery picture before the review chain begins." open={sectionsOpen.results} onToggle={() => setSectionsOpen(current => ({ ...current, results: !current.results }))} complete={sectionCompletion.results}>
        <div className="form-grid">
          <FormField label="Achievements *" error={errors.achievements} full><textarea rows={4} value={form.reportData.achievements} onChange={e => setReportField("achievements", e.target.value)} /></FormField>
          <FormField label="Immediate Outcomes *" error={errors.immediateOutcomes} full><textarea rows={4} value={form.reportData.immediateOutcomes} onChange={e => setReportField("immediateOutcomes", e.target.value)} /></FormField>
          <FormField label="Outputs" full><textarea rows={3} value={form.reportData.outputs} onChange={e => setReportField("outputs", e.target.value)} /></FormField>
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 4: Participant Data" subtitle="Enter all participant counts. Totals are calculated automatically." open={sectionsOpen.participants} onToggle={() => setSectionsOpen(current => ({ ...current, participants: !current.participants }))} complete={sectionCompletion.participants}>
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table>
            <thead><tr><th>Category</th><th>Below 16</th><th>16-30</th><th>Above 30</th><th>Total</th></tr></thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Male</td>
                <td><input type="number" min="0" value={form.reportData.participantData.maleBelow16} onChange={e => setParticipantField("maleBelow16", e.target.value)} /></td>
                <td><input type="number" min="0" value={form.reportData.participantData.male16To30} onChange={e => setParticipantField("male16To30", e.target.value)} /></td>
                <td><input type="number" min="0" value={form.reportData.participantData.maleAbove30} onChange={e => setParticipantField("maleAbove30", e.target.value)} /></td>
                <td style={{ fontWeight: 700, color: "var(--navy)" }}>{participantTotals.maleTotal}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Female</td>
                <td><input type="number" min="0" value={form.reportData.participantData.femaleBelow16} onChange={e => setParticipantField("femaleBelow16", e.target.value)} /></td>
                <td><input type="number" min="0" value={form.reportData.participantData.female16To30} onChange={e => setParticipantField("female16To30", e.target.value)} /></td>
                <td><input type="number" min="0" value={form.reportData.participantData.femaleAbove30} onChange={e => setParticipantField("femaleAbove30", e.target.value)} /></td>
                <td style={{ fontWeight: 700, color: "var(--navy)" }}>{participantTotals.femaleTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {errors.participantData && <div className="field-error" style={{ marginBottom: 12 }}>{errors.participantData}</div>}
        <div className="grid-2">
          <FormField label="Persons with Disability - Female"><input type="number" min="0" value={form.reportData.participantData.pwdFemale} onChange={e => setParticipantField("pwdFemale", e.target.value)} /></FormField>
          <FormField label="Persons with Disability - Male"><input type="number" min="0" value={form.reportData.participantData.pwdMale} onChange={e => setParticipantField("pwdMale", e.target.value)} /></FormField>
        </div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 10 }}>
          <div className="file-info"><div style={{ fontWeight: 700, color: "var(--navy)" }}>Overall Participants</div><div>{participantTotals.overallTotal}</div></div>
          <div className="file-info"><div style={{ fontWeight: 700, color: "var(--navy)" }}>PWD Female</div><div>{participantTotals.pwdFemale}</div></div>
          <div className="file-info"><div style={{ fontWeight: 700, color: "var(--navy)" }}>PWD Male</div><div>{participantTotals.pwdMale}</div></div>
          <div className="file-info"><div style={{ fontWeight: 700, color: "var(--navy)" }}>PWD Total</div><div>{participantTotals.pwdTotal}</div></div>
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 5: Program Quality & Impact" subtitle="Respond to every quality marker before submission." open={sectionsOpen.quality} onToggle={() => setSectionsOpen(current => ({ ...current, quality: !current.quality }))} complete={sectionCompletion.quality}>
        {errors.programQuality && <div className="field-error" style={{ marginBottom: 12 }}>{errors.programQuality}</div>}
        <div style={{ display: "grid", gap: 12 }}>
          <AccountabilityToggleField label="Gender mainstreamed?" value={form.reportData.programQuality.genderMainstreamed} onChange={value => setProgramQualityField("genderMainstreamed", value)} />
          <AccountabilityToggleField label="Inclusive governance mainstreamed?" value={form.reportData.programQuality.inclusiveGovernance} onChange={value => setProgramQualityField("inclusiveGovernance", value)} />
          <AccountabilityToggleField label="Resilience mainstreamed?" value={form.reportData.programQuality.resilienceMainstreamed} onChange={value => setProgramQualityField("resilienceMainstreamed", value)} />
          <AccountabilityToggleField label="Activity addressed GBV?" value={form.reportData.programQuality.addressedGbv} onChange={value => setProgramQualityField("addressedGbv", value)} />
          <AccountabilityToggleField label="Safeguarding included?" value={form.reportData.programQuality.safeguardingIncluded} onChange={value => setProgramQualityField("safeguardingIncluded", value)} />
          <AccountabilityToggleField label="Implemented with / through partner?" value={form.reportData.programQuality.implementedWithPartner} onChange={value => setProgramQualityField("implementedWithPartner", value)} />
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 6: Narrative Sections" subtitle="Close the report with follow-up actions, constraints, and learning." open={sectionsOpen.narrative} onToggle={() => setSectionsOpen(current => ({ ...current, narrative: !current.narrative }))} complete={sectionCompletion.narrative}>
        <div className="form-grid">
          <FormField label="Recommendations / Follow-up Actions *" error={errors.recommendations} full><textarea rows={4} value={form.reportData.recommendations} onChange={e => setReportField("recommendations", e.target.value)} /></FormField>
          <FormField label="Challenges Encountered *" error={errors.challenges} full><textarea rows={4} value={form.reportData.challenges} onChange={e => setReportField("challenges", e.target.value)} /></FormField>
          <FormField label="Key Lessons Learned *" error={errors.lessonsLearned} full><textarea rows={4} value={form.reportData.lessonsLearned} onChange={e => setReportField("lessonsLearned", e.target.value)} /></FormField>
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 7: Sign-Off" subtitle="The report writer signs now. Supervisor fields are completed during review." open={sectionsOpen.signoff} onToggle={() => setSectionsOpen(current => ({ ...current, signoff: !current.signoff }))} complete={sectionCompletion.signoff}>
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div>
            <FormField label="Report Writer Signature *" error={errors.reportWriterSignature} hint="Type or draw the reporting officer signature.">
              <SignaturePad value={form.reportData.reportWriterSignature} onChange={value => setReportField("reportWriterSignature", value)} />
            </FormField>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <FormField label="Supervisor Comments" hint="Optional and completed during supervisor review."><textarea rows={4} value={form.reportData.supervisorComments} readOnly placeholder="Supervisor comments will appear here once review is completed." /></FormField>
            <FormField label="Supervisor Name"><input value={form.reportData.supervisorName} readOnly /></FormField>
            <FormField label="Supervisor Signature">{renderSignaturePreview(form.reportData.supervisorSignature, "Supervisor signature will populate after approval.")}</FormField>
            <FormField label="Supervisor Date"><input type="date" value={form.reportData.supervisorDate} readOnly /></FormField>
          </div>
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Uploads" subtitle="Only receipts and activity photos are accepted for this submission." open={sectionsOpen.uploads} onToggle={() => setSectionsOpen(current => ({ ...current, uploads: !current.uploads }))} complete={sectionCompletion.uploads}>
        <div className="grid-2" style={{ alignItems: "start" }}>
          <FormField label="Upload Receipts *" hint="Accepted formats: PDF, JPG, PNG. Multiple files allowed.">
            <MultiFileUploadField value={form.receipts} onChange={files => setForm(current => ({ ...current, receipts: files }))} accept={ACCOUNTABILITY_RECEIPT_ACCEPT} allowedExtensions={ACCOUNTABILITY_RECEIPT_EXTENSIONS} emptyTitle="Upload Receipts" emptyHint="Choose one or more PDF, JPG, or PNG receipt files." minimumHint="At least 1 file is required." icon="payments" error={errors.receipts} />
          </FormField>
          <FormField label="Upload Activity Photos *" hint="Accepted formats: JPG, PNG only.">
            <MultiFileUploadField value={form.photos} onChange={files => setForm(current => ({ ...current, photos: files }))} accept={ACCOUNTABILITY_PHOTO_ACCEPT} allowedExtensions={ACCOUNTABILITY_PHOTO_EXTENSIONS} emptyTitle="Upload Activity Photos" emptyHint="Choose JPG or PNG images only." minimumHint="At least 2 photos are required." icon="doc" error={errors.photos} />
          </FormField>
        </div>
      </AccountabilitySectionCard>

      <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
        {onClose && <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>}
        <button type="button" className="btn btn-amber btn-lg" onClick={submit}>
          <AppButtonIcon name="submit" tone="amber" />
          {req.accountabilityRejectionReason ? "Resubmit Accountability" : "Submit Accountability"}
        </button>
      </div>
    </div>
  );
}

function AccountabilityBudgetTable({ financials, approvedBudgetCodes, errors, onActualChange, readOnly = false }) {
  const totals = financials.totals || summarizeAccountabilityBudgetLines(financials.budgetLines || []);

  return (
    <div className="table-wrap accountability-budget-wrap">
      <table className="accountability-budget-table">
        <thead><tr><th>Budget Code</th><th>Budget Category</th><th>Approved Amount</th><th>Actual Amount Spent</th><th>Variance</th><th>Status</th></tr></thead>
        <tbody>
          {financials.budgetLines.map(line => {
            const statusMeta = getAccountabilitySpendStatusMeta(line.status);
            return (
              <tr key={line.id} className={`accountability-budget-row ${statusMeta.className}`}>
                <td data-label="Budget Code">
                  <select value={line.budgetCode} disabled>
                    {approvedBudgetCodes.map(code => <option key={code} value={code}>{code}</option>)}
                  </select>
                </td>
                <td data-label="Budget Category"><input value={line.budgetCategory} readOnly /></td>
                <td data-label="Approved Amount"><input value={fmtAmt(line.approvedAmount)} readOnly /></td>
                <td data-label="Actual Amount Spent">
                  <input type="number" min="0" value={line.actualAmount} onChange={e => onActualChange(line.id, e.target.value)} placeholder="Enter actual spend" readOnly={readOnly} disabled={readOnly} />
                  {errors?.[line.id] && <div className="field-error" style={{ marginTop: 6 }}>{errors[line.id]}</div>}
                </td>
                <td data-label="Variance"><div style={{ fontWeight: 700, color: statusMeta.badgeStyle.color }}>{fmtAmt(line.variance)}</div></td>
                <td data-label="Status"><span className="sbadge" style={statusMeta.badgeStyle}>{statusMeta.label}</span></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan="2">Totals</th>
            <th>{fmtAmt(totals.totalApproved)}</th>
            <th>{fmtAmt(totals.totalActual)}</th>
            <th>{fmtAmt(totals.totalVariance)}</th>
            <th>{totals.status === "INCOMPLETE" ? "INCOMPLETE" : totals.status}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function AccountabilityFinancialIntro({ totals, hasExistingDraft, progressPercent, completedSections, totalSections }) {
  const overallStatusMeta = getAccountabilityOverallStatusMeta(totals.status);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body" style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "#b45309" }}>
              Financial Accountability Template
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)", marginTop: 6 }}>
              Budget vs actual accountability submission
            </div>
            <div className="text-xs text-gray" style={{ marginTop: 6, lineHeight: 1.7 }}>
              Compare each approved budget line against actual spend, resolve any overspend or refund requirements, and submit the locked package to your supervisor.
            </div>
          </div>
          <div style={{ minWidth: 220, flex: "1 1 220px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, fontWeight: 700, color: "var(--g600)" }}>
              <span>Progress</span>
              <span>{progressPercent}% complete</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
              <div style={{ width: `${progressPercent}%`, height: "100%", background: "linear-gradient(90deg,#0f766e 0%,#1d4ed8 100%)" }} />
            </div>
            <div className="text-xs text-gray" style={{ marginTop: 8 }}>
              {completedSections} of {totalSections} sections completed
              {hasExistingDraft ? " · Draft restored from local auto-save" : " · Auto-save enabled"}
            </div>
          </div>
        </div>
        <div className="budget-stats" style={{ marginTop: 18 }}>
          <div className="budget-stat">
            <span className="budget-stat-label">Approved Budget</span>
            <strong>{fmtAmt(totals.totalApproved)}</strong>
          </div>
          <div className="budget-stat">
            <span className="budget-stat-label">Actual Spend</span>
            <strong>{fmtAmt(totals.totalActual)}</strong>
          </div>
          <div className="budget-stat">
            <span className="budget-stat-label">Current Status</span>
            <strong style={{ color: overallStatusMeta.color }}>{totals.status === "INCOMPLETE" ? "INCOMPLETE" : totals.status}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountabilityForm({ req, onSave, onClose }) {
  const requester = _users.find(user => user.id === req.requesterId) || null;
  const writerSignature = getSavedUserSignature(requester);
  const draftKey = getAccountabilityDraftKey(req.id);
  const draftPayload = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const mergedDraftReport = draftPayload?.reportData
    ? {
        ...(req.accountabilityReportData || {}),
        ...draftPayload.reportData,
        financials: {
          ...(req.accountabilityReportData?.financials || {}),
          ...(draftPayload.reportData?.financials || {}),
          budgetLines: draftPayload.reportData?.financials?.budgetLines || req.accountabilityReportData?.financials?.budgetLines || [],
        },
      }
    : (req.accountabilityReportData || null);

  const [form, setForm] = useState(() => ({
    reportData: normalizeAccountabilityReportData(mergedDraftReport, req, writerSignature),
    receipts: normalizeStoredUploadList(draftPayload?.receipts || req.accountabilityReceipts || []),
    photos: normalizeStoredUploadList(draftPayload?.photos || req.accountabilityPhotos || []),
    refundProof: normalizeStoredUploadList(draftPayload?.refundProof || req.accountabilityRefundProof || []),
  }));
  const [errors, setErrors] = useState({});
  const [sectionsOpen, setSectionsOpen] = useState({
    basic: true,
    budget: true,
    summary: true,
    overspending: false,
    refund: false,
    uploads: true,
    validation: true,
  });

  const report = form.reportData;
  const financials = report.financials || createAccountabilityFinancialData(req);
  const totals = financials.totals || summarizeAccountabilityBudgetLines(financials.budgetLines || []);
  const approvedBudgetCodes = financials.budgetLines.map(line => line.budgetCode);
  const hasExistingDraft = Boolean(draftPayload);
  const overallStatusMeta = getAccountabilityOverallStatusMeta(totals.status);
  const instantWarnings = [];
  if (totals.missingActualCount > 0) instantWarnings.push(`Account for all approved budget lines. ${totals.missingActualCount} line${totals.missingActualCount === 1 ? "" : "s"} still need an actual amount.`);
  if (totals.status === "OVERALL OVERSPENT" && !financials.overspendingExplanation.trim()) instantWarnings.push("Overspending detected. Provide an explanation before submission.");
  if (totals.status === "OVERALL UNDERSPENT" && form.refundProof.length < 1) instantWarnings.push("Under-spending detected. Upload proof of refund before submission.");
  if (form.receipts.length < 1) instantWarnings.push("Upload at least one expense receipt.");
  if (form.photos.length < 2) instantWarnings.push("Upload at least two activity photos.");

  const updateReport = useCallback((updater) => {
    setForm(current => {
      const nextReport = typeof updater === "function" ? updater(current.reportData) : updater;
      return {
        ...current,
        reportData: normalizeAccountabilityReportData(nextReport, req, writerSignature),
      };
    });
  }, [req, writerSignature]);

  const setReportField = useCallback((key, value) => {
    updateReport(current => ({ ...current, [key]: value }));
  }, [updateReport]);

  const setActualAmount = useCallback((lineId, value) => {
    const normalizedValue = value === "" ? "" : String(Math.max(Number(value || 0), 0));
    updateReport(current => ({
      ...current,
      financials: {
        ...(current.financials || {}),
        budgetLines: (current.financials?.budgetLines || []).map(line => (
          line.id === lineId ? { ...line, actualAmount: normalizedValue } : line
        )),
      },
    }));
  }, [updateReport]);

  const setOverspendingExplanation = useCallback((value) => {
    updateReport(current => ({
      ...current,
      financials: {
        ...(current.financials || {}),
        overspendingExplanation: value,
      },
    }));
  }, [updateReport]);

  const sectionCompletion = {
    basic: Boolean(report.requestId && report.projectName.trim() && report.reportingOfficers.trim() && report.activityStartDate && report.activityEndDate && report.submissionDate),
    budget: financials.budgetLines.length > 0 && totals.missingActualCount === 0,
    summary: totals.status !== "INCOMPLETE",
    overspending: totals.status !== "OVERALL OVERSPENT" || Boolean(financials.overspendingExplanation.trim()),
    refund: totals.status !== "OVERALL UNDERSPENT" || form.refundProof.length >= 1,
    uploads: form.receipts.length >= 1 && form.photos.length >= 2,
    validation: instantWarnings.length === 0,
  };
  const totalSections = Object.keys(sectionCompletion).length;
  const completedSections = Object.values(sectionCompletion).filter(Boolean).length;
  const progressPercent = Math.round((completedSections / totalSections) * 100);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(draftKey, JSON.stringify({
      reportData: form.reportData,
      receipts: form.receipts,
      photos: form.photos,
      refundProof: form.refundProof,
      savedAt: ts(),
    }));
  }, [draftKey, form]);

  const submit = () => {
    const nextErrors = { budgetLines: {} };
    if (!report.requestId) nextErrors.requestId = "Request ID is required.";
    if (!report.projectName.trim()) nextErrors.projectName = "Project Name is required.";
    if (!report.reportingOfficers.trim()) nextErrors.reportingOfficers = "Reporting Officer is required.";
    if (!report.activityStartDate || !report.activityEndDate) {
      nextErrors.activityDates = "Both activity start and end dates are required.";
    } else if (new Date(report.activityEndDate) < new Date(report.activityStartDate)) {
      nextErrors.activityDates = "Activity end date cannot be earlier than the start date.";
    }
    if (!report.submissionDate) nextErrors.submissionDate = "Submission Date is required.";
    financials.budgetLines.forEach(line => {
      if (line.actualAmount === "" || line.actualAmount === null || line.actualAmount === undefined) nextErrors.budgetLines[line.id] = "Actual amount spent is required.";
      else if (toNumber(line.actualAmount) < 0) nextErrors.budgetLines[line.id] = "Negative values are not allowed.";
    });
    if (totals.status === "OVERALL OVERSPENT" && !financials.overspendingExplanation.trim()) nextErrors.overspendingExplanation = "Explanation for Overspending is required.";
    if (totals.status === "OVERALL UNDERSPENT" && form.refundProof.length < 1) nextErrors.refundProof = "Proof of Refund is required when the request is underspent.";
    if (form.receipts.length < 1) nextErrors.receipts = "Upload at least one receipt file.";
    if (form.photos.length < 2) nextErrors.photos = "Upload at least two activity photos.";
    if (!Object.keys(nextErrors.budgetLines).length) delete nextErrors.budgetLines;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setSectionsOpen(current => ({
        ...current,
        basic: current.basic || Boolean(nextErrors.requestId || nextErrors.projectName || nextErrors.reportingOfficers || nextErrors.activityDates || nextErrors.submissionDate),
        budget: current.budget || Boolean(nextErrors.budgetLines),
        summary: current.summary || false,
        overspending: current.overspending || Boolean(nextErrors.overspendingExplanation),
        refund: current.refund || Boolean(nextErrors.refundProof),
        uploads: current.uploads || Boolean(nextErrors.receipts || nextErrors.photos),
        validation: true,
      }));
      return;
    }

    if (typeof window !== "undefined") window.localStorage.removeItem(draftKey);
    onSave({
      reportData: normalizeAccountabilityReportData({ ...report, submissionDate: toDateInputValue(ts()) }, req, writerSignature),
      receipts: form.receipts,
      photos: form.photos,
      refundProof: form.refundProof,
    });
  };

  return (
    <div>
      {req.accountabilityRejectionReason && (
        <div className="alert alert-red" style={{ marginBottom: 16 }}>
          <strong>Rejection Reason:</strong> {req.accountabilityRejectionReason}
          {req.accountabilityRejectedBy && (
            <div className="mt-1 text-sm">
              Feedback from {req.accountabilityRejectedBy}
              {req.accountabilityRejectedAt ? ` on ${fmt(req.accountabilityRejectedAt)}` : ""}. Please revise the report and resubmit.
            </div>
          )}
        </div>
      )}

      <AccountabilityFinancialIntro totals={totals} hasExistingDraft={hasExistingDraft} progressPercent={progressPercent} completedSections={completedSections} totalSections={totalSections} />
      <div className="alert alert-blue" style={{ marginBottom: 16 }}>
        Upload restrictions: receipts accept PDF, JPG, and PNG only. Refund proof accepts PDF, JPG, or PNG when required. Activity photos accept JPG and PNG only, with a minimum of two files.
      </div>

      <AccountabilitySectionCard title="Section 1: Basic Details" subtitle="Core reporting identifiers carried from the approved request." open={sectionsOpen.basic} onToggle={() => setSectionsOpen(current => ({ ...current, basic: !current.basic }))} complete={sectionCompletion.basic}>
        <div className="form-grid">
          <FormField label="Request ID" error={errors.requestId}><input value={report.requestId} readOnly /></FormField>
          <FormField label="Project Name" error={errors.projectName}><input value={report.projectName} readOnly /></FormField>
          <FormField label="Reporting Officer *" error={errors.reportingOfficers}><input value={report.reportingOfficers} onChange={e => setReportField("reportingOfficers", e.target.value)} /></FormField>
          <FormField label="Submission Date" error={errors.submissionDate}><input type="date" value={report.submissionDate} readOnly /></FormField>
          <FormField label="Activity Start Date *" error={errors.activityDates}><input type="date" value={report.activityStartDate} onChange={e => setReportField("activityStartDate", e.target.value)} /></FormField>
          <FormField label="Activity End Date *"><input type="date" value={report.activityEndDate} onChange={e => setReportField("activityEndDate", e.target.value)} /></FormField>
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 2: Budget vs Actual Expenditure" subtitle="Every approved budget line must be accounted for. Budget codes are locked to the approved request." open={sectionsOpen.budget} onToggle={() => setSectionsOpen(current => ({ ...current, budget: !current.budget }))} complete={sectionCompletion.budget}>
        {errors.budgetLines && <div className="alert alert-red" style={{ marginBottom: 12 }}>Review the highlighted budget lines before submission.</div>}
        <AccountabilityBudgetTable financials={financials} approvedBudgetCodes={approvedBudgetCodes} errors={errors.budgetLines} onActualChange={setActualAmount} />
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 3: Variance Summary" subtitle="Totals and variance status update automatically as actual expenditure is entered." open={sectionsOpen.summary} onToggle={() => setSectionsOpen(current => ({ ...current, summary: !current.summary }))} complete={sectionCompletion.summary}>
        <div className="budget-stats">
          <div className="budget-stat"><span className="budget-stat-label">Total Budget Approved</span><strong>{fmtAmt(totals.totalApproved)}</strong></div>
          <div className="budget-stat"><span className="budget-stat-label">Total Amount Spent</span><strong>{fmtAmt(totals.totalActual)}</strong></div>
          <div className="budget-stat"><span className="budget-stat-label">Total Balance</span><strong>{fmtAmt(totals.totalVariance)}</strong></div>
        </div>
        <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, border: `1px solid ${overallStatusMeta.border}`, background: overallStatusMeta.background, color: overallStatusMeta.color, fontWeight: 700 }}>
          STATUS: {totals.status === "INCOMPLETE" ? "INCOMPLETE - COMPLETE ALL BUDGET LINES" : totals.status}
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 4: Overspending Handling" subtitle="Required only when total actual expenditure exceeds the approved budget." open={sectionsOpen.overspending} onToggle={() => setSectionsOpen(current => ({ ...current, overspending: !current.overspending }))} complete={sectionCompletion.overspending}>
        {totals.status === "OVERALL OVERSPENT" ? (
          <FormField label="Explanation for Overspending *" error={errors.overspendingExplanation} full>
            <textarea rows={5} value={financials.overspendingExplanation || ""} onChange={e => setOverspendingExplanation(e.target.value)} placeholder="Explain why actual spending exceeded the approved budget and what authorization or mitigation applies." />
          </FormField>
        ) : (
          <div className="alert alert-green" style={{ marginBottom: 0 }}>Overspending handling is not required unless the total actual amount exceeds the approved budget.</div>
        )}
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 5: Under-spending & Refund Handling" subtitle="Refund evidence becomes mandatory when the request is underspent." open={sectionsOpen.refund} onToggle={() => setSectionsOpen(current => ({ ...current, refund: !current.refund }))} complete={sectionCompletion.refund}>
        {totals.status === "OVERALL UNDERSPENT" ? (
          <div className="grid-2" style={{ alignItems: "start" }}>
            <FormField label="Amount to be Refunded" full><input value={fmtAmt(totals.refundAmount)} readOnly /></FormField>
            <div />
            <FormField label="Proof of Refund *" error={errors.refundProof} hint="Accepted formats: PDF, JPG, PNG.">
              <MultiFileUploadField value={form.refundProof} onChange={files => setForm(current => ({ ...current, refundProof: files }))} accept={ACCOUNTABILITY_REFUND_PROOF_ACCEPT} allowedExtensions={ACCOUNTABILITY_REFUND_PROOF_EXTENSIONS} emptyTitle="Upload Refund Proof" emptyHint="Choose the refund receipt or transfer evidence." minimumHint="A refund proof file is required before submission." icon="payments" error={errors.refundProof} multiple={false} />
            </FormField>
          </div>
        ) : (
          <div className="alert alert-green" style={{ marginBottom: 0 }}>Refund accountability is not required unless the total actual amount is lower than the approved budget.</div>
        )}
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 6: Supporting Documents" subtitle="Only expense receipts and activity photos are accepted with this submission." open={sectionsOpen.uploads} onToggle={() => setSectionsOpen(current => ({ ...current, uploads: !current.uploads }))} complete={sectionCompletion.uploads}>
        <div className="grid-2" style={{ alignItems: "start" }}>
          <FormField label="Upload Receipts *" hint="Accepted formats: PDF, JPG, PNG. Multiple files allowed.">
            <MultiFileUploadField value={form.receipts} onChange={files => setForm(current => ({ ...current, receipts: files }))} accept={ACCOUNTABILITY_RECEIPT_ACCEPT} allowedExtensions={ACCOUNTABILITY_RECEIPT_EXTENSIONS} emptyTitle="Upload Receipts" emptyHint="Choose one or more PDF, JPG, or PNG receipt files." minimumHint="At least 1 file is required." icon="payments" error={errors.receipts} />
          </FormField>
          <FormField label="Upload Activity Photos *" hint="Accepted formats: JPG, PNG only.">
            <MultiFileUploadField value={form.photos} onChange={files => setForm(current => ({ ...current, photos: files }))} accept={ACCOUNTABILITY_PHOTO_ACCEPT} allowedExtensions={ACCOUNTABILITY_PHOTO_EXTENSIONS} emptyTitle="Upload Activity Photos" emptyHint="Choose JPG or PNG images only." minimumHint="At least 2 photos are required." icon="doc" error={errors.photos} />
          </FormField>
        </div>
      </AccountabilitySectionCard>

      <AccountabilitySectionCard title="Section 7: Validation Rules" subtitle="Warnings update instantly and submission is blocked until every requirement is satisfied." open={sectionsOpen.validation} onToggle={() => setSectionsOpen(current => ({ ...current, validation: !current.validation }))} complete={sectionCompletion.validation}>
        {instantWarnings.length ? (
          <div className="alert alert-amber" style={{ marginBottom: 12 }}>
            <strong>Submission is blocked until the following items are resolved:</strong>
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {instantWarnings.map((warning, index) => <div key={`${warning}-${index}`}>{warning}</div>)}
            </div>
          </div>
        ) : (
          <div className="alert alert-green" style={{ marginBottom: 12 }}>All validations are satisfied. Submission will lock this form and assign it to the supervisor.</div>
        )}
        <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid #dbe4f0", background: "#f8fbff", color: "var(--g700)", lineHeight: 1.7 }}>
          On submission the request status changes to <strong>ACCOUNTABILITY SUBMITTED</strong>, editing is locked until review feedback reopens it, and the package is routed to the assigned supervisor with all budget variances, refund status, receipts, photos, and refund proof retained for audit traceability.
        </div>
      </AccountabilitySectionCard>

      <div className="flex gap-3" style={{ justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
        {onClose && <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>}
        <button type="button" className="btn btn-amber btn-lg" onClick={submit}>
          <AppButtonIcon name="submit" tone="amber" />
          {req.accountabilityRejectionReason ? "Resubmit Accountability" : "Submit Accountability"}
        </button>
      </div>
    </div>
  );
}

function RequestDetail({
  req,
  user,
  onClose,
  onApprove              = () => {},
  onReject               = () => {},
  onOpenPaymentForm      = () => {},
  onEdit                 = () => {},
  onDownload             = () => {},
  onDelete               = null,
  onSubmitAccountability = () => {},
  onApproveAccountability= () => {},
  onRejectAccountability = () => {},
}) {
  const [rejectReason,    setRejectReason]    = useState("");
  const [showReject,      setShowReject]      = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAccForm,     setShowAccForm]     = useState(false);
  const [showAccReject,   setShowAccReject]   = useState(false);
  const [accRejectReason, setAccRejectReason] = useState("");

  const isOwner    = req.requesterId === user.id;
  const isRejected = req.status.startsWith("rejected");
  const isEditable = isOwner && (req.status === "draft" || isRejected);
  const txId       = getPaymentNumber(req);

  const supervisor = req.supervisorId ? _users.find(u => u.id === req.supervisorId) : null;
  const reqLogs    = _logs.filter(l => l.requestId === req.id);

  // ── Role-based button visibility (SYSTEM RULES §4) ────────────────────────
  // Pre-payment approvals (Stages 1)
  const canApprove =
    (user.role === "supervisor"          && req.status === "pending_supervisor")          ||
    (user.role === "accountant"          && req.status === "pending_accountant")          ||
    (user.role === "finance_manager"     && req.status === "pending_finance")             ||
    (user.role === "executive_director"  && req.status === "pending_executive_director");

  // Stage 2: Mark as Paid – only shown when status is APPROVED and payment not yet recorded
  const canPay = ["payment_accountant", "admin"].includes(user.role) && canProcessPayment(req);

  // Stage 3: Requester submits or revises accountability
  const canSubmitAccountability =
    isOwner &&
    !req.isVendorPayment &&
    ["paid", "pending_accountability"].includes(req.status);

  // Stages 5-7: Reviewer approves / rejects accountability
  const canApproveAccountability =
    (user.role === "supervisor"          && req.status === "accountability_submitted"   && req.supervisorId === user.id) ||
    (user.role === "finance_manager"     && req.status === "supervisor_approved")                                         ||
    (["payment_accountant","admin"].includes(user.role) && req.status === "senior_accountant_approved");

  // Admin can review accountability at any active accountability stage
  const adminCanApproveAccountability =
    user.role === "admin" &&
    ["accountability_submitted","supervisor_approved","senior_accountant_approved"].includes(req.status);

  const effectiveCanApproveAcc = canApproveAccountability || adminCanApproveAccountability;

  // PDF download available once payment has been recorded
  const canDownloadPDF = isPaidTransaction(req) || ["approved","pending_payment_accountant"].includes(req.status);

  // ── Chain step renderer ──────────────────────────────────────────────────
  const renderChainStep = (stepStatus, label, role) => {
    const approver = role === "supervisor"
      ? (supervisor || _users.find(u => u.role === role))
      : _users.find(u => u.role === role);
    let approval = req.approvals?.find(a => a.role === role);
    const isPaymentApproval = role === "payment_accountant" && !!txId;
    if (!approval && isPaymentApproval) {
      approval = { at:req.paidAt || req.paymentDate, decision:"approved", name:req.paidByName || approver?.name || "Payment Officer", note:`Transaction ID: ${txId}` };
    }
    let cls = "", iconName = "workflow", iconTone = "slate";
    if (approval?.decision === "approved")      { cls = "done";     iconName = "approve"; iconTone = "green"; }
    else if (approval?.decision === "rejected") { cls = "rejected"; iconName = "reject";  iconTone = "red";   }
    else if (req.status === stepStatus)         { cls = "active";   iconName = "workflow"; iconTone = "amber"; }
    return (
      <div className={`chain-step ${cls}`} key={role}>
        <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
          <IconBadge name={iconName} tone={iconTone} size={14} />
        </span>
        <div className="sig-box">
          <div className="sig-role">{label}</div>
          {approval ? (
            <>
              <div className="sig-name">{isPaymentApproval ? (req.paidByName || approver?.name || "Payment Officer") : approval.name}</div>
              <div className="sig-ts">{fmt(approval.at)} · {approval.decision === "approved" ? "Approved" : "Rejected"}</div>
              {approval.note && <div className="text-xs mt-2" style={{ color:"#065f46" }}>{approval.note}</div>}
              {(() => { const sig = approval.signature || getSavedUserSignature(approval.userId); return sig ? (
                <div style={{ marginTop:6, padding:"6px 10px", background:"#fff", borderRadius:6, border:"1px dashed var(--g300)", display:"inline-block" }}>
                  {sig.type === "typed"
                    ? <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:"var(--navy)" }}>{sig.value}</span>
                    : <img src={sig.value} alt="sig" style={{ height:32 }} />}
                </div>
              ) : null; })()}
            </>
          ) : (
            <div style={{ fontSize:13, color:"var(--g400)", marginTop:1 }}>{approver?.name || "-"} · Awaiting</div>
          )}
        </div>
      </div>
    );
  };

  const accountabilityReportData = normalizeAccountabilityReportData(req.accountabilityReportData, req);
  const accountabilityReceiptFiles = getAccountabilityReceiptFiles(req);
  const accountabilityPhotoFiles = getAccountabilityPhotoFiles(req);
  const accountabilityFinanceSummary = req.accountabilityFinanceSummary || createAccountabilityFinancialData(req, accountabilityReportData.financials);
  const accountabilityRefundProofFiles = normalizeStoredUploadList(req.accountabilityRefundProof || []);
  const hasAccountabilityData = hasAccountabilitySubmissionData(req);

  return (
    <Modal title={`Request: ${req.id}`} onClose={onClose} size="modal-lg">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={req.status} />
          <PriorityTag priority={req.priority} />
          {req.isVendorPayment && (
            <span className="sbadge" style={{ background:"#ede9fe", color:"#7c3aed", fontWeight:700 }}>Vendor Payment</span>
          )}
          {req.procurementId && (
            <span className="sbadge" style={{ background:"#f0fdf4", color:"#166534", fontSize:11 }}>Proc: {req.procurementId}</span>
          )}
        </div>
        <div className="flex gap-2">
          {isEditable && (
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(req)}>
              <AppButtonIcon name="edit" tone="blue" />Edit &amp; Resubmit
            </button>
          )}
          {isEditable && onDelete && (
            <button className="btn btn-ghost btn-sm" style={{ color:"var(--red)" }} onClick={() => setShowDeleteConfirm(true)}>
              <AppButtonIcon name="reject" tone="red" size={12} />Delete
            </button>
          )}
          {/* Stage 3: Submit Accountability button (only for requester after payment or on revision) */}
          {canSubmitAccountability && (
            <button className="btn btn-amber btn-sm" onClick={() => setShowAccForm(true)}>
              <AppButtonIcon name="submit" tone="amber" />
              {req.accountabilityRejectionReason ? "Revise Accountability" : "Submit Accountability"}
            </button>
          )}
          {canDownloadPDF && (
            <button className="btn btn-primary btn-sm" onClick={() => onDownload(req)}>
              <AppButtonIcon name="download" tone="navy" />PDF
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="alert alert-red" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:0 }}>
          <span>Are you sure you want to permanently delete <strong>"{req.title || "this request"}"</strong>? This cannot be undone.</span>
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="btn btn-sm" style={{ background:"var(--red)", color:"#fff" }} onClick={() => { onDelete(req.id); onClose(); }}>Delete</button>
          </div>
        </div>
      )}

      {/* Pre-payment rejection reason */}
      {isRejected && req.lastRejectionReason && (
        <div className="alert alert-red"><strong>Rejection Reason:</strong> {req.lastRejectionReason}</div>
      )}

      {/* Stage 3: Inline accountability form */}
      {showAccForm && (
        <>
          <AccountabilityForm
            req={req}
            onSave={form => { onSubmitAccountability(req, form); setShowAccForm(false); onClose(); }}
            onClose={() => setShowAccForm(false)}
          />
          <hr className="divider" />
        </>
      )}

      {/* ── Request details ── */}
      <div className="grid-2 mb-4">
        <div><div className="text-xs text-gray mb-1">Title</div><div style={{ fontWeight:600 }}>{req.title}</div></div>
        <div><div className="text-xs text-gray mb-1">Amount</div><div className="amount">{fmtAmt(req.amount)}</div></div>
        <div><div className="text-xs text-gray mb-1">Department</div><div>{req.department}</div></div>
        <div>
          <div className="text-xs text-gray mb-1">Submitted by</div>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            {req.requesterName}
            {req.requesterEmployeeId && <span className="ref" style={{ fontSize:10 }}>{req.requesterEmployeeId}</span>}
          </div>
        </div>
        <div><div className="text-xs text-gray mb-1">Project</div><div>{req.projectName || "Not linked"}</div></div>
        <div><div className="text-xs text-gray mb-1">Activity</div><div>{req.activityName ? `${req.activityName} (${req.activityCode})` : "Not linked"}</div></div>
        <div><div className="text-xs text-gray mb-1">Program Manager</div><div>{req.supervisorName || supervisor?.name || "Unassigned"}</div></div>
        <div><div className="text-xs text-gray mb-1">Created</div><div>{fmt(req.createdAt)}</div></div>
        <div><div className="text-xs text-gray mb-1">Priority</div><PriorityTag priority={req.priority} /></div>
      </div>

      {hasStructuredConceptNote(req) ? (
        <StructuredConceptNoteDetail req={req} />
      ) : (
        <>
          <div className="mb-4">
            <div className="text-xs text-gray mb-1">Concept Note</div>
            <div style={{ background:"var(--g50)", padding:"11px 13px", borderRadius:"var(--r-sm)", fontSize:13.5, lineHeight:1.7 }}>{req.conceptNote}</div>
          </div>
          <div className="mb-4">
            <div className="text-xs text-gray mb-1">Purpose / Justification</div>
            <div style={{ background:"var(--g50)", padding:"11px 13px", borderRadius:"var(--r-sm)", fontSize:13.5, lineHeight:1.7 }}>{req.purpose}</div>
          </div>
        </>
      )}

      {req.file && (
        <div className="mb-4">
          <div className="text-xs text-gray mb-2">Attached Document</div>
          <div className="file-info">
            <div className="file-icon"><IconBadge name="doc" tone="blue" size={16} /></div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:13 }}>{req.file.name}</div>
              <div className="text-xs text-gray">{(req.file.size / 1024).toFixed(1)} KB</div>
            </div>
            {req.file.dataUrl && req.file.type === "application/pdf" && (
              <a href={req.file.dataUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Open</a>
            )}
            {req.file.dataUrl && <a href={req.file.dataUrl} download={req.file.name} className="btn btn-ghost btn-sm">Download</a>}
          </div>
        </div>
      )}

      {req.signature && (
        <div className="mb-4">
          <div className="text-xs text-gray mb-2">Requester Signature</div>
          <div style={{ padding:"10px 14px", background:"var(--g50)", borderRadius:"var(--r-sm)", border:"1px dashed var(--g300)", display:"inline-block" }}>
            {req.signature.type === "typed"
              ? <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:20, color:"var(--navy)" }}>{req.signature.value}</span>
              : <img src={req.signature.value} alt="Requester signature" style={{ height:44 }} />}
          </div>
        </div>
      )}

      {/* Approval chain */}
      <hr className="divider" />
      <div className="font-bold text-sm mb-3 text-navy">Approval Chain</div>
      <div className="chain mb-4">
        {renderChainStep("pending_supervisor",         "Program Manager Review",  "supervisor")}
        {renderChainStep("pending_accountant",         "Accountant (Budget Check)","accountant")}
        {renderChainStep("pending_finance",            "Senior Accountant",        "finance_manager")}
        {renderChainStep("pending_executive_director", "Executive Director",       "executive_director")}
        {renderChainStep("approved",                   "Payment Officer",          "payment_accountant")}
      </div>

      {/* Payment info box (shown once payment is recorded) */}
      {txId && (
        <div className="alert alert-green mb-4">
          <AppButtonIcon name="payments" tone="green" />
          <strong>PAID</strong>&nbsp;–&nbsp;
          Transaction ID: <strong>{txId}</strong>&nbsp;·&nbsp;
          Date: <strong>{req.paymentDate}</strong>&nbsp;·&nbsp;
          By: <strong>{req.paidByName || "Payment Officer"}</strong>
        </div>
      )}

      {/* Accountability report package (once submitted) */}
      {hasAccountabilityData && (
        <>
          <hr className="divider" />
          <div className="font-bold text-sm mb-3 text-navy">Accountability Submission</div>
          {req.accountabilityRejectionReason && (
            <div className="alert alert-red mb-3">
              <strong>Accountability Rejected:</strong> {req.accountabilityRejectionReason}
              {req.accountabilityRejectedBy && (
                <div className="mt-1 text-sm">
                  By {req.accountabilityRejectedBy}
                  {req.accountabilityRejectedAt ? ` on ${fmt(req.accountabilityRejectedAt)}` : ""}
                </div>
              )}
            </div>
          )}
          <div className="grid-2 mb-3">
            <div style={{ background: "#f8fbff", border: "1px solid #dbe4f0", borderRadius: 14, padding: 16 }}>
              <div className="form-section-title" style={{ marginBottom: 12 }}>Financial Summary</div>
              <div className="grid-2">
                <div><div className="text-xs text-gray mb-1">Request ID</div><div style={{ fontWeight: 600 }}>{accountabilityReportData.requestId || req.id}</div></div>
                <div><div className="text-xs text-gray mb-1">Project</div><div style={{ fontWeight: 600 }}>{accountabilityReportData.projectName || "-"}</div></div>
                <div><div className="text-xs text-gray mb-1">Reporting Officer</div><div style={{ fontWeight: 600 }}>{accountabilityReportData.reportingOfficers || "-"}</div></div>
                <div><div className="text-xs text-gray mb-1">Activity Dates</div><div style={{ fontWeight: 600 }}>{accountabilityReportData.activityStartDate || "-"} to {accountabilityReportData.activityEndDate || "-"}</div></div>
                <div><div className="text-xs text-gray mb-1">Total Budget Approved</div><div style={{ fontWeight: 600 }}>{fmtAmt(accountabilityFinanceSummary.totals.totalApproved)}</div></div>
                <div><div className="text-xs text-gray mb-1">Total Amount Spent</div><div style={{ fontWeight: 600 }}>{fmtAmt(accountabilityFinanceSummary.totals.totalActual)}</div></div>
                <div><div className="text-xs text-gray mb-1">Total Balance</div><div style={{ fontWeight: 600 }}>{fmtAmt(accountabilityFinanceSummary.totals.totalVariance)}</div></div>
                <div><div className="text-xs text-gray mb-1">Refund Status</div><div style={{ fontWeight: 600 }}>{req.accountabilityRefundStatus || "NOT_REQUIRED"}</div></div>
              </div>
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, border: `1px solid ${getAccountabilityOverallStatusMeta(accountabilityFinanceSummary.totals.status).border}`, background: getAccountabilityOverallStatusMeta(accountabilityFinanceSummary.totals.status).background, color: getAccountabilityOverallStatusMeta(accountabilityFinanceSummary.totals.status).color, fontWeight: 700 }}>
                STATUS: {accountabilityFinanceSummary.totals.status}
              </div>
              {accountabilityFinanceSummary.totals.status === "OVERALL OVERSPENT" && (
                <div style={{ marginTop: 12 }}>
                  <div className="text-xs text-gray mb-1">Explanation for Overspending</div>
                  <div style={{ background: "#fff", borderRadius: 10, padding: 12, lineHeight: 1.7 }}>{accountabilityFinanceSummary.overspendingExplanation || "-"}</div>
                </div>
              )}
              {accountabilityFinanceSummary.totals.status === "OVERALL UNDERSPENT" && (
                <div style={{ marginTop: 12 }}>
                  <div className="text-xs text-gray mb-1">Amount to be Refunded</div>
                  <div style={{ background: "#fff", borderRadius: 10, padding: 12, lineHeight: 1.7, fontWeight: 700 }}>{fmtAmt(accountabilityFinanceSummary.totals.refundAmount)}</div>
                </div>
              )}
            </div>

            <div style={{ background: "#fffdf6", border: "1px solid #f3e8c8", borderRadius: 14, padding: 16 }}>
              <div className="form-section-title" style={{ marginBottom: 12 }}>Receipts, Photos & Refund Proof</div>
              <div className="file-info" style={{ marginBottom: 12 }}>
                <div className="file-icon"><IconBadge name="payments" tone="amber" size={16} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{accountabilityReceiptFiles.length} receipt file{accountabilityReceiptFiles.length === 1 ? "" : "s"}</div>
                  <div className="text-xs text-gray">Accepted: PDF, JPG, PNG</div>
                </div>
              </div>
              <div className="file-info" style={{ marginBottom: 12 }}>
                <div className="file-icon"><IconBadge name="doc" tone="teal" size={16} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{accountabilityPhotoFiles.length} activity photo{accountabilityPhotoFiles.length === 1 ? "" : "s"}</div>
                  <div className="text-xs text-gray">Minimum required: 2</div>
                </div>
              </div>
              <div className="file-info" style={{ marginBottom: 12 }}>
                <div className="file-icon"><IconBadge name="payments" tone="blue" size={16} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{accountabilityRefundProofFiles.length} refund proof file{accountabilityRefundProofFiles.length === 1 ? "" : "s"}</div>
                  <div className="text-xs text-gray">Required only when underspent</div>
                </div>
              </div>
              {req.accountabilityReport?.dataUrl && (
                <div className="file-info" style={{ marginBottom: 12 }}>
                  <div className="file-icon"><IconBadge name="doc" tone="blue" size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{req.accountabilityReport.name}</div>
                    <div className="text-xs text-gray">Legacy activity report attachment</div>
                  </div>
                  <a href={req.accountabilityReport.dataUrl} download={req.accountabilityReport.name} className="btn btn-ghost btn-sm">Download</a>
                </div>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {accountabilityReceiptFiles.map(file => (
                  <div key={file.id} className="file-info">
                    <div className="file-icon"><IconBadge name="payments" tone="amber" size={16} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{file.name}</div>
                      <div className="text-xs text-gray">{formatFileSize(file.size)}</div>
                    </div>
                    {file.dataUrl && <a href={file.dataUrl} download={file.name} className="btn btn-ghost btn-sm">Download</a>}
                  </div>
                ))}
                {accountabilityPhotoFiles.map(file => (
                  <div key={file.id} className="file-info" style={{ alignItems: "flex-start" }}>
                    <div className="file-icon"><IconBadge name="doc" tone="teal" size={16} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{file.name}</div>
                      <div className="text-xs text-gray">{formatFileSize(file.size)}</div>
                    </div>
                    {file.dataUrl && <a href={file.dataUrl} download={file.name} className="btn btn-ghost btn-sm">Download</a>}
                  </div>
                ))}
                {accountabilityRefundProofFiles.map(file => (
                  <div key={file.id} className="file-info">
                    <div className="file-icon"><IconBadge name="payments" tone="blue" size={16} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{file.name}</div>
                      <div className="text-xs text-gray">{formatFileSize(file.size)}</div>
                    </div>
                    {file.dataUrl && <a href={file.dataUrl} download={file.name} className="btn btn-ghost btn-sm">Download</a>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="text-xs text-gray mb-2">Budget vs Actual Breakdown</div>
            <AccountabilityBudgetTable financials={accountabilityFinanceSummary} approvedBudgetCodes={accountabilityFinanceSummary.budgetLines.map(line => line.budgetCode)} errors={{}} onActualChange={() => {}} readOnly />
          </div>
          {req.accountabilitySubmittedAt && (
            <div className="text-xs text-gray mb-3">
              Submitted by {req.accountabilitySubmittedByName} on {fmt(req.accountabilitySubmittedAt)}
            </div>
          )}
        </>
      )}

      {/* Activity timeline */}
      <hr className="divider" />
      <div className="font-bold text-sm mb-3 text-navy">Activity Timeline</div>
      <div className="timeline">
        {reqLogs.map(l => {
          const u = _users.find(x => x.id === l.userId);
          const isRej = l.action.toLowerCase().includes("reject");
          return (
            <div className="tl-item" key={l.id}>
              <div className="tl-dot-wrap">
                <div className="tl-dot" style={{ background:isRej ? "var(--red-lt)" : "var(--green-lt)", color:isRej ? "var(--red)" : "var(--green)" }}>
                  {isRej ? <AppIcon name="reject" size={14} /> : <AppIcon name="approve" size={14} />}
                </div>
                <div className="tl-line" />
              </div>
              <div className="tl-content">
                <div className="tl-action">{l.action}</div>
                <div className="tl-meta">{u?.name} ({ROLE_LABELS[u?.role]}) · {fmt(l.at)}</div>
                {l.note && <div className="tl-note"><AppIcon name="doc" size={14} /> {l.note}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Action buttons (role + status gated) ── */}

      {/* Stage 1: Pre-payment approval / rejection */}
      {canApprove && !showReject && (
        <>
          <hr className="divider" />
          <div className="flex gap-3 mt-2">
            <button className="btn btn-green" onClick={() => { onApprove(req); onClose(); }}>
              <AppButtonIcon name="approve" tone="green" />Approve
            </button>
            <button className="btn btn-red" onClick={() => setShowReject(true)}>
              <AppButtonIcon name="reject" tone="red" />Reject
            </button>
          </div>
        </>
      )}
      {canApprove && showReject && (
        <>
          <hr className="divider" />
          <div className="mt-2">
            <FormField label="Rejection Reason (required)" style={{ marginBottom:12 }}>
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Provide a clear reason for rejection..." />
            </FormField>
            <div className="flex gap-3">
              <button className="btn btn-red" onClick={() => { if (!rejectReason.trim()) return; onReject(req, rejectReason); onClose(); }}>Confirm Rejection</button>
              <button className="btn btn-ghost" onClick={() => setShowReject(false)}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* Stage 2: Mark as Paid – visible ONLY when status is APPROVED, hidden forever after */}
      {canPay && (
        <>
          <hr className="divider" />
          <div className="alert alert-green" style={{ marginBottom:12 }}>
            This request is <strong>APPROVED</strong>. Record the payment details below to complete disbursement.
          </div>
          <button className="btn btn-amber btn-lg" onClick={() => onOpenPaymentForm(req)}>
            <AppButtonIcon name="payments" tone="amber" />Mark as Paid
          </button>
        </>
      )}

      {/* Stages 5-7: Accountability review by supervisor / senior accountant / payment officer */}
      {effectiveCanApproveAcc && !showAccReject && (
        <>
          <hr className="divider" />
          <div className="font-bold text-sm mb-3 text-navy">Accountability Review</div>
          <div className="flex gap-3 mt-2">
            <button className="btn btn-green" onClick={() => { onApproveAccountability(req); onClose(); }}>
              <AppButtonIcon name="approve" tone="green" />
              {req.status === "senior_accountant_approved" ? "Approve & Close Request" : "Approve"}
            </button>
            <button className="btn btn-red" onClick={() => setShowAccReject(true)}>
              <AppButtonIcon name="reject" tone="red" />Reject &amp; Return to Requester
            </button>
          </div>
        </>
      )}
      {effectiveCanApproveAcc && showAccReject && (
        <>
          <hr className="divider" />
          <div className="mt-2">
            <FormField label="Accountability Rejection Reason (required)" style={{ marginBottom:12 }}>
              <textarea rows={3} value={accRejectReason} onChange={e => setAccRejectReason(e.target.value)} placeholder="Provide a clear reason for rejection..." />
            </FormField>
            <div className="flex gap-3">
              <button className="btn btn-red" onClick={() => { if (!accRejectReason.trim()) return; onRejectAccountability(req, accRejectReason); onClose(); }}>Confirm Rejection</button>
              <button className="btn btn-ghost" onClick={() => setShowAccReject(false)}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * Stage 2 – Payment Officer records payment.
 * Form fields: Transaction ID (required) + Payment Date (required).
 * Submit button is labelled "Mark as Paid" to match the payment officer workflow.
 * Once submitted the modal closes; the parent state is updated by the caller.
 */
function PaymentProcessModal({ req, onSubmit, onClose }) {
  const [transactionId, setTransactionId] = useState("");
  const [paymentDate,   setPaymentDate]   = useState(new Date().toISOString().split("T")[0]);
  const [error,         setError]         = useState("");
  const [submitting,    setSubmitting]    = useState(false);

  // Guard: if payment was already processed render a locked read-only view
  const alreadyPaid = isPaymentLocked(req);

  const handleCompletePayment = () => {
    if (submitting || alreadyPaid) return;
    const txId    = String(transactionId || "").trim();
    const payDate = String(paymentDate   || "").trim();
    if (!txId)    { setError("Transaction ID is required.");  return; }
    if (!payDate) { setError("Payment date is required.");    return; }

    setSubmitting(true);
    setError("");

    let result;
    try {
      result = onSubmit(req, txId, payDate);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setSubmitting(false);
      return;
    }

    if (!result || result.ok === false) {
      setError((result && result.message) || "Payment could not be processed.");
      setSubmitting(false);
      return;
    }

    // Success – parent refreshes state; close modal
    onClose();
  };

  return (
    <Modal title={`Mark as Paid – ${req.id}`} onClose={onClose}>
      {/* Request summary */}
      <div className="grid-2" style={{ marginBottom:16 }}>
        <div>
          <div className="text-xs text-gray mb-1">Request</div>
          <div style={{ fontWeight:700, color:"var(--navy)" }}>{req.title}</div>
          <div className="text-sm text-gray">{req.requesterName} · {req.department}</div>
        </div>
        <div>
          <div className="text-xs text-gray mb-1">Amount</div>
          <div className="amount">{fmtAmt(req.amount)}</div>
        </div>
      </div>

      {alreadyPaid ? (
        /* ── Payment already done: show read-only confirmation ── */
        <>
          <div className="alert alert-green" style={{ marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
            <AppButtonIcon name="approve" tone="green" />
            <span>
              <strong>PAID</strong> – Transaction ID: <strong>{getPaymentNumber(req)}</strong>
              &nbsp;·&nbsp; Date: <strong>{req.paymentDate}</strong>
            </span>
          </div>
          <div style={{ marginTop:16, textAlign:"right" }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </>
      ) : (
        /* ── Payment form ── */
        <>
          <div className="alert alert-blue" style={{ marginBottom:14 }}>
            Enter the payment details below, then click <strong>Mark as Paid</strong> to record payment. The request will then remain PAID until the requester submits accountability.
          </div>

          {error && <div className="alert alert-red" style={{ marginBottom:12 }}>{error}</div>}

          <div className="form-grid">
            <FormField label="Transaction ID *" hint="Unique identifier for this payment transaction">
              <input
                value={transactionId}
                onChange={e => setTransactionId(e.target.value)}
                placeholder="e.g. TXN-2024-0001"
                autoFocus
              />
            </FormField>
            <FormField label="Payment Date *">
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
              />
            </FormField>
          </div>

          <div className="flex gap-3" style={{ marginTop:18, justifyContent:"flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-amber btn-lg" onClick={handleCompletePayment} disabled={submitting}>
              <AppButtonIcon name="approve" tone="amber" />
              {submitting ? "Processing…" : "Mark as Paid"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// â"€â"€ PDF Preview Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function PDFModal({ req, onClose }) {
  const amountWords = amountToWords(req.amount);
  const activityTitleForVoucher = req.activityTitle || req.activityName || req.title || "Not provided";
  const activityVenueForVoucher = req.venue || "Not provided";
  const activityDateForVoucher = req.startDate || req.endDate ? formatActivityPlanDateRange(req) : "Not provided";
  const paymentNumber = getPaymentNumber(req);
  const steps = [
    { role:"supervisor",      label:"Program Manager" },
    { role:"accountant",      label:"Accountant" },
    { role:"finance_manager", label:"Senior Accountant" },
    { role:"executive_director", label:"Executive Director" },
    { role:"payment_accountant", label:"Payment Officer" },
  ];
  const approvalEntries = steps.map(step => ({
    step,
    approval: req.approvals?.find(ap=>ap.role===step.role) || (step.role==="payment_accountant" && paymentNumber
      ? { name:req.paidByName || "Payment Officer", decision:"approved", at:req.paymentDate }
      : null),
  }));
  return (
    <Modal title={paymentNumber ? "Payment Voucher Preview" : "Document Preview"} onClose={onClose} size="modal-lg"
      footer={
        <div className="flex gap-3 items-center">
          <span className="text-xs text-gray">Use Ctrl+P / Cmd+P to save as PDF</span>
          <button className="btn btn-primary" onClick={()=>window.print()}><AppButtonIcon name="download" tone="navy" />Print / Export PDF</button>
        </div>
      }>
      <div className="pdf-doc" style={{ fontFamily:"Roboto, system-ui, sans-serif" }}>
        {paymentNumber ? (
          <div>
            <div className="report-header">
              <div className="report-brand">
                <img src={inspireLogo} alt="IYFD logo" />
                <div>
                  <div className="pdf-logo">{ORG_NAME}</div>
                  <div className="text-xs text-gray">NGO Payment Voucher</div>
                  <div className="text-xs text-gray mt-1">{APP_NAME}</div>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div className="pdf-fl">Voucher No.</div>
                <div className="ref" style={{ fontSize:14 }}>{req.id}</div>
                <div className="text-xs text-gray mt-1">Prepared {fmt(req.createdAt)}</div>
                <div className="paid-stamp" style={{ marginTop:6 }}>PAID</div>
              </div>
            </div>

            <div className="pdf-sec" style={{ border:"1px solid var(--g200)", borderRadius:"var(--r-sm)", overflow:"hidden" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", background:"var(--g50)" }}>
                {[
                  ["Voucher No.", req.id],
                  ["Payment Date", req.paymentDate || "-"],
                  ["Payment Number", paymentNumber || "-"],
                  ["Status", STATUS_CFG[req.status]?.label || req.status],
                  ["Payee", req.requesterName || "-"],
                  ["Department", req.department || "-"],
                  ["Project", req.projectName || "Not linked"],
                  ["Activity Code", req.activityCode || "-"],
                ].map(([label, value], index) => (
                  <div key={label} style={{ padding:"12px 14px", borderRight:index % 4 === 3 ? "none" : "1px solid var(--g200)", borderBottom:"1px solid var(--g200)" }}>
                    <div className="pdf-fl">{label}</div>
                    <div className="pdf-fv">{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding:"14px 16px" }}>
                <div className="pdf-row">
                  <div className="pdf-field">
                    <div className="pdf-fl">Amount Paid</div>
                    <div className="pdf-fv" style={{ fontFamily:"var(--serif)", fontSize:18 }}>{fmtAmt(req.amount)}</div>
                  </div>
                  <div className="pdf-field">
                    <div className="pdf-fl">Amount in Words</div>
                    <div className="pdf-fv" style={{ textTransform:"capitalize" }}>{amountWords}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="pdf-fl">Particulars / Purpose of Payment</div>
                  <div className="pdf-fv" style={{ background:"var(--g50)", border:"1px solid var(--g200)", borderRadius:"var(--r-xs)", padding:"12px 14px", lineHeight:1.8 }}>
                    <div><strong>Activity Title:</strong> {activityTitleForVoucher}</div>
                    <div><strong>Venue:</strong> {activityVenueForVoucher}</div>
                    <div><strong>Date Carried Out:</strong> {activityDateForVoucher}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pdf-sec">
              <div className="pdf-sec-title">Approvals Summary</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:10 }}>
                {req.signature && (
                  <div className="pdf-sig-box">
                    <div className="pdf-fl">Requester</div>
                    {req.signature.type==="typed"
                      ? <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:17, color:"var(--navy)" }}>{req.signature.value}</div>
                      : <img src={req.signature.value} alt="Requester signature" style={{ height:36 }} />}
                    <div className="pdf-fv">{req.requesterName}</div>
                    <div className="text-xs text-gray">Submitted · {fmt(req.createdAt)}</div>
                  </div>
                )}
                {approvalEntries.map(({ step, approval }) => {
                  const sig = approval ? (approval.signature || getSavedUserSignature(approval.userId)) : null;
                  return (
                    <div className="pdf-sig-box" key={step.role}>
                      <div className="pdf-fl">{step.label}</div>
                      {approval ? (
                        <>
                          {sig && (sig.type==="typed"
                            ? <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:17, color:"var(--navy)", marginBottom:4 }}>{sig.value}</div>
                            : <img src={sig.value} alt="sig" style={{ height:36, marginBottom:4, display:"block" }} />
                          )}
                          <div className="pdf-fv">{approval.name}</div>
                          <div className="text-xs text-gray">{approval.decision==="approved"?"Approved":"Rejected"} · {fmt(approval.at)}</div>
                        </>
                      ) : <div className="text-xs text-gray">Not yet reviewed</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pdf-sec">
              <div className="pdf-sec-title">Voucher Certification</div>
              <div style={{ border:"1px solid var(--g200)", borderRadius:"var(--r-sm)", padding:"14px 16px", background:"#fcfcfd" }}>
                <div style={{ fontSize:13.2, lineHeight:1.75 }}>
                  Certified that the above payment has been processed for the stated purpose, against the approved concept and budget lines, and is recorded under payment number <strong>{paymentNumber}</strong>.
                </div>
                <div className="pdf-row mt-3">
                  <div className="pdf-field">
                    <div className="pdf-fl">Processed By</div>
                    <div className="pdf-fv">{req.paidByName || "Payment Officer"}</div>
                  </div>
                  <div className="pdf-field">
                    <div className="pdf-fl">Requester</div>
                    <div className="pdf-fv">{req.requesterName}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="report-header">
              <div className="report-brand">
                <img src={inspireLogo} alt="IYFD logo" />
                <div>
                  <div className="pdf-logo">{ORG_NAME}</div>
                  <div className="text-xs text-gray">Financial Approval Document</div>
                  <div className="text-xs text-gray mt-1">{APP_NAME}</div>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div className="pdf-fl">Voucher No.</div>
                <div className="ref" style={{ fontSize:14 }}>{req.id}</div>
                <div className="text-xs text-gray mt-1">Prepared {fmt(req.createdAt)}</div>
              </div>
            </div>
          <div className="pdf-sec">
            <div className="pdf-sec-title">Request Details</div>
            <div className="pdf-row"><div className="pdf-field"><div className="pdf-fl">Title</div><div className="pdf-fv">{req.title}</div></div><div className="pdf-field"><div className="pdf-fl">Department</div><div className="pdf-fv">{req.department}</div></div></div>
            <div className="pdf-row mt-2"><div className="pdf-field"><div className="pdf-fl">Amount (UGX)</div><div className="pdf-fv" style={{ fontFamily:"var(--serif)", fontSize:16 }}>{Number(req.amount).toLocaleString()}</div></div><div className="pdf-field"><div className="pdf-fl">Priority</div><div className="pdf-fv" style={{ textTransform:"capitalize" }}>{req.priority}</div></div></div>
            <div className="pdf-row mt-2"><div className="pdf-field"><div className="pdf-fl">Project</div><div className="pdf-fv">{req.projectName || "Not linked"}</div></div><div className="pdf-field"><div className="pdf-fl">Activity</div><div className="pdf-fv">{req.activityName ? `${req.activityName} (${req.activityCode})` : "Not linked"}</div></div></div>
            <div className="mt-2">
              <div className="pdf-fl">Requested by</div>
              <div className="pdf-fv">
                {req.requesterName}
                {req.requesterEmployeeId && <span style={{ marginLeft:8, fontSize:11, color:"#6b7280", fontWeight:600 }}>({req.requesterEmployeeId})</span>}
              </div>
            </div>
          </div>
          {req.signature && (
            <div className="pdf-sec">
              <div className="pdf-sec-title">Requester Signature</div>
              <div className="pdf-sig-box" style={{ display:"inline-block" }}>
                {req.signature.type==="typed"
                  ? <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:20, color:"var(--navy)" }}>{req.signature.value}</div>
                  : <img src={req.signature.value} alt="sig" style={{ height:48 }} />}
                <div className="text-xs text-gray mt-1">
                  {req.requesterName}
                  {req.requesterEmployeeId && <span style={{ marginLeft:6, fontWeight:600 }}>({req.requesterEmployeeId})</span>}
                </div>
              </div>
            </div>
          )}

          <div className="pdf-sec">
            <div className="pdf-sec-title">Approval Signatures</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {approvalEntries.map(({ step, approval }) => {
                const sig = approval ? (approval.signature || getSavedUserSignature(approval.userId)) : null;
                return (
                  <div className="pdf-sig-box" key={step.role}>
                    <div className="pdf-fl">{step.label}</div>
                    {approval ? (
                      <>
                        {sig && (sig.type==="typed"
                          ? <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:17, color:"var(--navy)", marginBottom:4 }}>{sig.value}</div>
                          : <img src={sig.value} alt="sig" style={{ height:36, marginBottom:4, display:"block" }} />
                        )}
                        <div className="pdf-fv">{approval.name}</div>
                        <div className="text-xs text-gray">{approval.decision==="approved"?"Approved":"Rejected"} · {fmt(approval.at)}</div>
                      </>
                    ) : <div className="text-xs text-gray">Not yet reviewed</div>}
                  </div>
                );
              })}
            </div>
          </div>
          </>
        )}

        <div className="pdf-sec" style={paymentNumber ? { pageBreakBefore:"always", breakBefore:"page", paddingTop:4 } : undefined}>
          <div className="pdf-sec-title">{paymentNumber ? "Attached Approved Concept Note" : "Concept Attachment"}</div>
          <div style={{ fontSize:12, color:"var(--g500)", marginBottom:12 }}>
            {paymentNumber ? "This concept note is attached below the payment voucher as part of the same document." : "Concept note and supporting justification."}
          </div>
          {hasStructuredConceptNote(req) ? (
            <StructuredConceptNotePDFSections req={req} />
          ) : (
            <>
              <div className="pdf-sec"><div className="pdf-sec-title">Concept Note</div><div style={{ fontSize:13, lineHeight:1.7 }}>{req.conceptNote}</div></div>
              <div className="pdf-sec"><div className="pdf-sec-title">Purpose & Justification</div><div style={{ fontSize:13, lineHeight:1.7 }}>{req.purpose}</div></div>
            </>
          )}
          {req.file && (
            <div style={{ marginTop:14, paddingTop:12, borderTop:"1px dashed var(--g200)" }}>
              <div className="pdf-fl">Supporting Attachment</div>
              <div className="pdf-fv">{req.file.name}</div>
            </div>
          )}
        </div>

        {/* ── Accountability section (only when completed) ── */}
        {req.status === "completed" && hasAccountabilitySubmissionData(req) && (
          <div className="pdf-sec" style={{ pageBreakBefore:"always", breakBefore:"page", paddingTop:4 }}>
            <div className="pdf-sec-title">Accountability Record</div>
            <div style={{ border:"1px solid var(--g200)", borderRadius:"var(--r-sm)", overflow:"hidden", marginBottom:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", background:"var(--g50)" }}>
                {[
                  ["Submitted By", req.accountabilitySubmittedByName || req.requesterName || "-"],
                  ["Submission Date", req.accountabilitySubmittedAt ? fmt(req.accountabilitySubmittedAt) : "-"],
                  ["Closed By", req.completedByName || "-"],
                ].map(([l,v]) => (
                  <div key={l} style={{ padding:"10px 14px", borderRight:"1px solid var(--g200)", borderBottom:"1px solid var(--g200)" }}>
                    <div className="pdf-fl">{l}</div>
                    <div className="pdf-fv">{v}</div>
                  </div>
                ))}
              </div>
              {req.accountabilityFinanceSummary?.totals && (
                <div style={{ padding:"12px 16px" }}>
                  <div className="pdf-fl" style={{ marginBottom:8 }}>Budget vs Actual Summary</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                    {[
                      ["Total Approved", fmtAmt(req.accountabilityFinanceSummary.totals.totalApproved || req.amount)],
                      ["Total Actual Spent", fmtAmt(req.accountabilityFinanceSummary.totals.totalActual || 0)],
                      ["Variance", fmtAmt(Math.abs(req.accountabilityFinanceSummary.totals.totalVariance || 0))],
                    ].map(([l,v]) => (
                      <div key={l}>
                        <div className="pdf-fl">{l}</div>
                        <div className="pdf-fv" style={{ fontFamily:"var(--serif)" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {req.accountabilityFinanceSummary.totals.status && (
                    <div style={{ marginTop:8, fontSize:12, fontWeight:700, color: req.accountabilityFinanceSummary.totals.status.includes("OVER") ? "#991b1b" : "#065f46" }}>
                      Status: {req.accountabilityFinanceSummary.totals.status}
                    </div>
                  )}
                </div>
              )}
            </div>
            {req.accountabilityReportData?.financials?.budgetLines?.length > 0 && (
              <div style={{ marginBottom:10 }}>
                <div className="pdf-fl" style={{ marginBottom:6 }}>Budget Line Detail</div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ background:"var(--g50)" }}>
                      {["Budget Code","Item","Approved (UGX)","Actual (UGX)","Variance"].map(h => (
                        <th key={h} style={{ padding:"7px 10px", textAlign:"left", fontWeight:700, color:"var(--g600)", fontSize:11, borderBottom:"1px solid var(--g200)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {req.accountabilityReportData.financials.budgetLines.map((line, i) => (
                      <tr key={line.id || i} style={{ borderBottom:"1px solid var(--g100)" }}>
                        <td style={{ padding:"6px 10px" }}>{line.budgetCode || "-"}</td>
                        <td style={{ padding:"6px 10px" }}>{line.budgetItem || "-"}</td>
                        <td style={{ padding:"6px 10px", fontFamily:"var(--serif)" }}>{fmtAmt(line.approvedAmount || 0)}</td>
                        <td style={{ padding:"6px 10px", fontFamily:"var(--serif)" }}>{line.actualAmount !== "" && line.actualAmount !== undefined ? fmtAmt(Number(line.actualAmount)) : "—"}</td>
                        <td style={{ padding:"6px 10px", fontFamily:"var(--serif)", color: Number(line.actualAmount||0) > Number(line.approvedAmount||0) ? "#991b1b" : "#065f46" }}>
                          {line.actualAmount !== "" && line.actualAmount !== undefined ? fmtAmt(Math.abs(Number(line.approvedAmount||0) - Number(line.actualAmount||0))) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pdf-row">
              <div className="pdf-field">
                <div className="pdf-fl">Receipts Submitted</div>
                {getAccountabilityReceiptFiles(req).length > 0 ? (
                  <ul style={{ margin:"4px 0 0", paddingLeft:16, fontSize:12 }}>
                    {getAccountabilityReceiptFiles(req).map((f,i) => <li key={i}>{f.name || f.fileName || `Receipt ${i+1}`}</li>)}
                  </ul>
                ) : <div className="pdf-fv">None attached</div>}
              </div>
              <div className="pdf-field">
                <div className="pdf-fl">Activity Photos</div>
                {getAccountabilityPhotoFiles(req).length > 0 ? (
                  <ul style={{ margin:"4px 0 0", paddingLeft:16, fontSize:12 }}>
                    {getAccountabilityPhotoFiles(req).map((f,i) => <li key={i}>{f.name || f.fileName || `Photo ${i+1}`}</li>)}
                  </ul>
                ) : <div className="pdf-fv">None attached</div>}
              </div>
            </div>
            {req.accountabilityReportData?.financials?.overspendingExplanation && (
              <div style={{ marginTop:10 }}>
                <div className="pdf-fl">Overspending Explanation</div>
                <div className="pdf-fv" style={{ background:"#fff8f0", border:"1px solid #fed7aa", borderRadius:"var(--r-xs)", padding:"10px 12px", fontSize:12.5 }}>
                  {req.accountabilityReportData.financials.overspendingExplanation}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop:28, paddingTop:10, borderTop:"1px solid var(--g200)", fontSize:11, color:"var(--g400)", textAlign:"center" }}>
          Generated by {APP_NAME} · {ORG_NAME} · {new Date().toLocaleDateString()}
        </div>
      </div>
    </Modal>
  );
}

// â"€â"€ Requests List â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function RequestsList({ user, requests, title, filterFn, onApprove, onReject, onPay, onSaveEdit, onDelete, onSubmitAccountability, onApproveAccountability, onRejectAccountability, onOpenSignatureSettings }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [showPDF, setShowPDF] = useState(null);
  const [editReq, setEditReq] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = requests
    .filter(filterFn || (() => true))
    .filter(r => !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.requesterName?.toLowerCase().includes(search.toLowerCase()) ||
      r.projectName?.toLowerCase().includes(search.toLowerCase()) ||
      r.activityName?.toLowerCase().includes(search.toLowerCase()) ||
      r.activityCode?.toLowerCase().includes(search.toLowerCase())
    )
    .filter(r => statusFilter === "all" || r.status === statusFilter)
    .filter(r => deptFilter === "all" || r.department === deptFilter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-sub">{filtered.length} request{filtered.length !== 1 ? "s" : ""} found</div>
        </div>
      </div>

      <div className="filters">
        <input className="f-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="f-input" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="all">All Departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {[
            "all",
            ...( !["payment_accountant","executive_director"].includes(user.role) ? ["draft"] : [] ),
            "pending_supervisor","pending_accountant","pending_finance","pending_executive_director",
            "approved",
            "paid",
            "pending_accountability","accountability_submitted",
            "supervisor_approved","senior_accountant_approved",
            "completed",
          ].map(s => (
            <span key={s} className={`chip ${statusFilter === s ? "active" : ""}`} onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : STATUS_CFG[s]?.label || s}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><IconBadge name="requests" tone="blue" size={22} /></div><div className="empty-text">No requests found</div><div className="empty-sub">Try adjusting your filters</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>Title</th><th>Requester</th><th>Dept</th><th>Amount</th><th>Priority</th><th>Status</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                    <td><span className="ref">{r.id}</span></td>
                    <td style={{ fontWeight:500, maxWidth:180 }} className="truncate">{r.title}</td>
                    <td className="text-gray">
                      <div>{r.requesterName}</div>
                      {r.requesterEmployeeId && <div className="text-xs" style={{ color:"var(--g400)" }}>{r.requesterEmployeeId}</div>}
                    </td>
                    <td className="text-gray">{r.department}</td>
                    <td><span className="amount">{fmtAmt(r.amount)}</span></td>
                    <td><PriorityTag priority={r.priority} /></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-sm text-gray">{fmt(r.createdAt)}</td>
                    <td>
                      <div style={{ display:"flex", gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setSelected(r); }}><AppButtonIcon name="view" tone="blue" />View</button>
                        {onDelete && r.requesterId === user.id && (r.status === "draft" || r.status.startsWith("rejected")) && (
                          <button className="btn btn-ghost btn-sm" style={{ color:"var(--red)" }} onClick={e => { e.stopPropagation(); setConfirmDelete(r); }}>
                            <AppButtonIcon name="reject" tone="red" size={12} />Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <RequestDetail req={selected} user={user} onClose={() => setSelected(null)}
          onApprove={r => { onApprove(r); setSelected(null); }}
          onReject={(r, reason) => { onReject(r, reason); setSelected(null); }}
          onOpenPaymentForm={r => { if (!canProcessPayment(r)) return; setSelected(null); setPaymentTarget(r); }}
          onEdit={r => { setSelected(null); setEditReq(r); }}
          onDownload={r => setShowPDF(r)}
          onDelete={onDelete || null}
          onSubmitAccountability={(r, form) => { onSubmitAccountability(r, form); setSelected(null); }}
          onApproveAccountability={r => { onApproveAccountability(r); setSelected(null); }}
          onRejectAccountability={(r, reason) => { onRejectAccountability(r, reason); setSelected(null); }}
          onOpenSignatureSettings={onOpenSignatureSettings}
        />
      )}
      {paymentTarget && <PaymentProcessModal req={paymentTarget} onClose={() => setPaymentTarget(null)} onSubmit={onPay} />}
      {showPDF && <PDFModal req={showPDF} onClose={() => setShowPDF(null)} />}
      {editReq && (
        <Modal title="Edit & Resubmit Request" onClose={() => setEditReq(null)} size="modal-lg">
          <NewRequestForm user={user} projects={_projects} requests={_requests} editRequest={editReq}
            onSave={(form, submit) => { onSaveEdit(form, submit, editReq); setEditReq(null); }}
            onClose={() => setEditReq(null)}
            onOpenSignatureSettings={onOpenSignatureSettings}
          />
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="Delete Request" onClose={() => setConfirmDelete(null)} size="modal-sm">
          <div style={{ padding:"8px 0 16px" }}>
            <p>Are you sure you want to permanently delete <strong>"{confirmDelete.title || "this request"}"</strong>?</p>
            <p style={{ color:"var(--g400)", fontSize:13, marginTop:6 }}>This cannot be undone.</p>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn" style={{ background:"var(--red)", color:"#fff" }} onClick={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── My Drafts ──────────────────────────────────────────────────────────────
function MyDrafts({ user, requests, onSaveEdit, onDelete, setPage, onOpenSignatureSettings }) {
  const [editReq, setEditReq] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const drafts = requests
    .filter(r => r.requesterId === user.id && r.status === "draft")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">My Drafts</div>
          <div className="page-sub">{drafts.length} saved draft{drafts.length !== 1 ? "s" : ""}</div>
        </div>
        <button className="btn btn-amber" onClick={() => setPage("new_request")}>
          <AppButtonIcon name="add" tone="amber" size={13} /> New Request
        </button>
      </div>

      <div className="card">
        {drafts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><IconBadge name="requests" tone="blue" size={22} /></div>
            <div className="empty-text">No saved drafts</div>
            <div className="empty-sub">Start a new request and save it as a draft to continue later</div>
            <button className="btn btn-amber" style={{ marginTop:12 }} onClick={() => setPage("new_request")}>
              <AppButtonIcon name="add" tone="amber" size={13} /> Start New Request
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Amount</th>
                  <th>Last Saved</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map(r => (
                  <tr key={r.id}>
                    <td><span className="ref">{r.id}</span></td>
                    <td style={{ fontWeight:500, maxWidth:200 }} className="truncate">{r.title || <span className="text-gray">Untitled</span>}</td>
                    <td className="text-gray">{r.department || "—"}</td>
                    <td><span className="amount">{fmtAmt(r.amount)}</span></td>
                    <td className="text-sm text-gray">{fmt(r.createdAt)}</td>
                    <td>
                      <div style={{ display:"flex", gap:6 }}>
                        <button className="btn btn-blue btn-sm" onClick={() => setEditReq(r)}>
                          <AppButtonIcon name="edit" tone="blue" size={12} /> Edit &amp; Submit
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color:"var(--red)" }} onClick={() => setConfirmDelete(r)}>
                          <AppButtonIcon name="reject" tone="red" size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editReq && (
        <Modal title="Edit Draft" onClose={() => setEditReq(null)} size="modal-lg">
          <NewRequestForm
            user={user} projects={_projects} requests={_requests} editRequest={editReq}
            onSave={(form, submit) => { onSaveEdit(form, submit, editReq); setEditReq(null); }}
            onClose={() => setEditReq(null)}
            onOpenSignatureSettings={onOpenSignatureSettings}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete Draft" onClose={() => setConfirmDelete(null)} size="modal-sm">
          <div style={{ padding:"8px 0 16px" }}>
            <p>Are you sure you want to delete the draft <strong>"{confirmDelete.title || "Untitled"}"</strong>? This cannot be undone.</p>
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-red" onClick={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}>Delete Draft</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PendingApprovals({ user, requests, onApprove, onReject, onPay, onSubmitAccountability, onApproveAccountability, onRejectAccountability }) {
  // Pre-payment approval queue (Stages 1 approval chain)
  const pending = getPendingForRole(user.role, requests, user.id);
  // Post-payment accountability review queue (Stages 4-7)
  const pendingAccountabilities = getPendingAccountabilityForRole(user.role, requests, user.id);

  const [selected,      setSelected]      = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [showPDF,       setShowPDF]       = useState(null);
  const [rejecting,     setRejecting]     = useState(null);
  const [reason,        setReason]        = useState("");

  const totalCount = pending.length + pendingAccountabilities.length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Pending Approvals</div>
        <div className="page-sub">{totalCount} item{totalCount !== 1 ? "s" : ""} awaiting your review</div>
      </div>

      {totalCount === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><IconBadge name="approve" tone="green" size={22} /></div>
            <div className="empty-text">All clear!</div>
            <div className="empty-sub">No pending requests at this time.</div>
          </div>
        </div>
      )}

      {/* ── Section A: requests awaiting approval (or payment for Payment Officer) ── */}
      {pending.map(r => (
        <div key={r.id} className="pending-card">
          <div className="pending-card-body">
            <div className="flex items-center justify-between">
              <div style={{ flex:1, minWidth:0 }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="ref">{r.id}</span>
                  <PriorityTag priority={r.priority} />
                  <StatusBadge status={r.status} />
                  {r.isVendorPayment && (
                    <span className="sbadge" style={{ background:"#ede9fe", color:"#7c3aed", fontSize:10, fontWeight:700 }}>Vendor</span>
                  )}
                </div>
                <div style={{ fontWeight:600, fontSize:15.5, color:"var(--navy)", marginBottom:3 }}>{r.title}</div>
                <div className="text-sm text-gray">{r.department} · {r.requesterName} · {fmt(r.createdAt)}</div>
                {r.file && (
                  <div className="text-xs" style={{ marginTop:4, color:"var(--blue)" }}>
                    <AppIcon name="doc" size={13} /> {r.file.name}
                  </div>
                )}
                {r.file?.dataUrl && (
                  <div className="flex gap-2 mt-2" style={{ flexWrap:"wrap" }}>
                    {r.file.type === "application/pdf" && (
                      <a href={r.file.dataUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Open Attachment</a>
                    )}
                    <a href={r.file.dataUrl} download={r.file.name} className="btn btn-ghost btn-sm">Download Attachment</a>
                  </div>
                )}
              </div>
              <div style={{ textAlign:"right", flexShrink:0, marginLeft:16 }}>
                <div className="amount" style={{ fontSize:18 }}>{fmtAmt(r.amount)}</div>
              </div>
            </div>

            {r.signature && (
              <div style={{ marginTop:10, padding:"6px 12px", background:"var(--g50)", borderRadius:"var(--r-sm)", display:"inline-flex", alignItems:"center", gap:8 }}>
                <span className="text-xs text-gray">Requester sig:</span>
                {r.signature.type === "typed"
                  ? <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:"var(--navy)" }}>{r.signature.value}</span>
                  : <img src={r.signature.value} alt="sig" style={{ height:24 }} />}
              </div>
            )}

            {rejecting === r.id ? (
              <div className="mt-3">
                <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Rejection reason (required)..." style={{ width:"100%", marginBottom:8 }} />
                <div className="flex gap-2">
                  <button className="btn btn-red btn-sm" onClick={() => {
                    if (!reason.trim()) return;
                    onReject(r, reason);
                    setRejecting(null); setReason("");
                  }}>Confirm Rejection</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                {/* Stage 2: Payment Officer sees "Mark as Paid" for APPROVED requests */}
                {user.role === "payment_accountant" ? (
                  canProcessPayment(r) ? (
                    <button className="btn btn-amber btn-sm" onClick={() => setPaymentTarget(r)}>
                      <AppButtonIcon name="payments" tone="amber" />Mark as Paid
                    </button>
                  ) : (
                    <span className="sbadge" style={{ background:"#d1fae5", color:"#065f46", fontWeight:700 }}>
                      PAID – {getPaymentNumber(r)}
                    </span>
                  )
                ) : (
                  <>
                    <button className="btn btn-green btn-sm" onClick={() => onApprove(r)}>
                      <AppButtonIcon name="approve" tone="green" />Approve
                    </button>
                    <button className="btn btn-red btn-sm" onClick={() => setRejecting(r.id)}>
                      <AppButtonIcon name="reject" tone="red" />Reject
                    </button>
                  </>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(r)}>
                  <AppButtonIcon name="view" tone="blue" />View
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* ── Section B: accountability submissions awaiting review (Stages 4-7) ── */}
      {pendingAccountabilities.map(r => (
        <div key={`${r.id}-acc`} className="pending-card">
          <div className="pending-card-body">
            <div className="flex items-center justify-between">
              <div style={{ flex:1, minWidth:0 }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="ref">{r.id}</span>
                  <StatusBadge status={r.status} />
                  <span className="sbadge" style={{ background:"var(--blue-lt)", color:"var(--blue)" }}>Accountability</span>
                </div>
                <div style={{ fontWeight:600, fontSize:15.5, color:"var(--navy)", marginBottom:3 }}>{r.title}</div>
                <div className="text-sm text-gray">
                  {r.department} · {r.requesterName}
                  {r.accountabilitySubmittedAt ? ` · Submitted ${fmt(r.accountabilitySubmittedAt)}` : ""}
                </div>
                {r.accountabilityReportData?.activityTitle && (
                  <div className="text-xs mt-1" style={{ color:"var(--blue)" }}>
                    Activity: {r.accountabilityReportData.activityTitle}
                  </div>
                )}
                <div className="text-xs" style={{ color:"var(--blue)" }}>
                  Receipts: {getAccountabilityReceiptFiles(r).length} file{getAccountabilityReceiptFiles(r).length === 1 ? "" : "s"} · Photos: {getAccountabilityPhotoFiles(r).length} file{getAccountabilityPhotoFiles(r).length === 1 ? "" : "s"}
                </div>
                {(r.accountabilityReport?.dataUrl || getAccountabilityReceiptFiles(r).length > 0 || getAccountabilityPhotoFiles(r).length > 0) && (
                  <div className="flex gap-2 mt-2" style={{ flexWrap:"wrap" }}>
                    {r.accountabilityReport?.dataUrl && (
                      <a href={r.accountabilityReport.dataUrl} download={r.accountabilityReport.name} className="btn btn-ghost btn-sm">Download Legacy Report</a>
                    )}
                    {getAccountabilityReceiptFiles(r).map(file => (
                      <a key={file.id} href={file.dataUrl} download={file.name} className="btn btn-ghost btn-sm">Receipt</a>
                    ))}
                    {getAccountabilityPhotoFiles(r).map(file => (
                      <a key={file.id} href={file.dataUrl} download={file.name} className="btn btn-ghost btn-sm">Photo</a>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ textAlign:"right", flexShrink:0, marginLeft:16 }}>
                <div className="amount" style={{ fontSize:18 }}>{fmtAmt(r.amount)}</div>
              </div>
            </div>

            {/* Requester: sees "Submit Accountability" prompt */}
            {user.role === "requester" ? (
              <div className="flex gap-2 mt-3 items-center">
                <span className="sbadge" style={{ background:"#fef3c7", color:"#92400e" }}>
                  {r.accountabilityRejectionReason ? "Revision required" : "Pending your submission"}
                </span>
                <button className="btn btn-primary btn-sm" onClick={() => setSelected(r)}>
                  <AppButtonIcon name="view" tone="navy" />View &amp; Submit Accountability
                </button>
              </div>
            ) : rejecting === `${r.id}-acc` ? (
              <div className="mt-3">
                <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Rejection reason (required)..." style={{ width:"100%", marginBottom:8 }} />
                <div className="flex gap-2">
                  <button className="btn btn-red btn-sm" onClick={() => {
                    if (!reason.trim()) return;
                    onRejectAccountability(r, reason);
                    setRejecting(null); setReason("");
                  }}>Confirm Rejection</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                <button className="btn btn-green btn-sm" onClick={() => onApproveAccountability(r)}>
                  <AppButtonIcon name="approve" tone="green" />
                  {r.status === "senior_accountant_approved" ? "Approve & Close Request" : "Approve"}
                </button>
                <button className="btn btn-red btn-sm" onClick={() => setRejecting(`${r.id}-acc`)}>
                  <AppButtonIcon name="reject" tone="red" />Reject
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(r)}>
                  <AppButtonIcon name="view" tone="blue" />View
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {selected && (
        <RequestDetail req={selected} user={user} onClose={() => setSelected(null)}
          onApprove={r => { onApprove(r); setSelected(null); }}
          onReject={(r, rsn) => { onReject(r, rsn); setSelected(null); }}
          onOpenPaymentForm={r => { setSelected(null); setPaymentTarget(r); }}
          onEdit={() => {}}
          onDownload={r => setShowPDF(r)}
          onSubmitAccountability={(r, form) => { onSubmitAccountability(r, form); setSelected(null); }}
          onApproveAccountability={r => { onApproveAccountability(r); setSelected(null); }}
          onRejectAccountability={(r, rsn) => { onRejectAccountability(r, rsn); setSelected(null); }}
        />
      )}
      {paymentTarget && (
        <PaymentProcessModal req={paymentTarget} onClose={() => setPaymentTarget(null)} onSubmit={onPay} />
      )}
      {showPDF && <PDFModal req={showPDF} onClose={() => setShowPDF(null)} />}
    </div>
  );
}

// ── Pending Accountability Page ──────────────────────────────────────────────
function PendingAccountabilityPage({ user, requests, onSubmitAccountability, onApproveAccountability, onRejectAccountability }) {
  const isPaymentOfficer = ["payment_accountant","admin"].includes(user.role);

  // Payment Officer: all unaccounted paid vouchers
  // Everyone else: only their own
  const queue = isPaymentOfficer
    ? requests.filter(r => !r.isVendorPayment && ["paid","pending_accountability"].includes(r.status))
    : requests.filter(r => !r.isVendorPayment && r.requesterId === user.id && ["paid","pending_accountability"].includes(r.status));

  const [selected, setSelected] = useState(null);
  const [showPDF, setShowPDF] = useState(null);
  const [accountabilityTarget, setAccountabilityTarget] = useState(null);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Pending Accountability</div>
          <div className="page-sub">
            {isPaymentOfficer
              ? "All paid vouchers awaiting accountability submission from staff."
              : "Your paid vouchers that require accountability submission."}
          </div>
        </div>
        <span className="sbadge" style={{ background:"#fef3c7", color:"#92400e", fontSize:13, padding:"6px 14px" }}>
          {queue.length} pending
        </span>
      </div>

      {queue.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><IconBadge name="workflow" tone="amber" size={28} /></div>
            <div className="empty-text">No pending accountability</div>
            <div className="empty-sub">
              {isPaymentOfficer
                ? "All paid vouchers have been accounted for."
                : "You have no paid vouchers requiring accountability submission."}
            </div>
          </div>
        </div>
      ) : (
        queue.map(r => {
          const isRejected = r.status === "pending_accountability" && r.accountabilityRejectionReason;
          return (
            <div key={r.id} className="pending-card" style={{ marginBottom:12, borderLeft:`4px solid ${isRejected ? "#ef4444" : "#f59e0b"}` }}>
              <div className="pending-card-body">
                <div className="flex items-center justify-between">
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="flex items-center gap-2 mb-1" style={{ flexWrap:"wrap" }}>
                      <span className="ref">{r.id}</span>
                      <StatusBadge status={r.status} />
                      {isRejected && (
                        <span className="sbadge" style={{ background:"#fee2e2", color:"#991b1b" }}>Revision Required</span>
                      )}
                    </div>
                    <div style={{ fontWeight:600, fontSize:15, color:"var(--navy)" }}>{r.title}</div>
                    <div className="text-sm text-gray mt-1">{r.department} · {r.requesterName}</div>
                    <div className="text-xs text-gray mt-1">
                      Paid {r.paymentDate ? fmt(r.paymentDate) : "-"}
                      {getPaymentNumber(r) ? ` · Txn: ${getPaymentNumber(r)}` : ""}
                      {r.paidByName ? ` · by ${r.paidByName}` : ""}
                    </div>
                    {isRejected && (
                      <div className="text-xs mt-1" style={{ color:"#991b1b", fontWeight:600 }}>
                        Returned by {r.accountabilityRejectedBy}: {r.accountabilityRejectionReason}
                      </div>
                    )}
                  </div>
                  <div className="amount" style={{ fontSize:18 }}>{fmtAmt(r.amount)}</div>
                </div>
                <div className="flex gap-2 mt-3" style={{ flexWrap:"wrap" }}>
                  {!isPaymentOfficer && r.requesterId === user.id && (
                    <button className="btn btn-amber btn-sm" onClick={() => setAccountabilityTarget(r)}>
                      <AppButtonIcon name="edit" tone="amber" />
                      {isRejected ? "Revise Accountability" : "Submit Accountability"}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(r)}>
                    <AppButtonIcon name="view" tone="blue" />View Details
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowPDF(r)}>
                    <AppButtonIcon name="download" tone="navy" />Preview
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      {selected && (
        <RequestDetail req={selected} user={user} onClose={() => setSelected(null)}
          onApprove={() => {}} onReject={() => {}} onEdit={() => {}}
          onOpenPaymentForm={() => {}}
          onDownload={r => setShowPDF(r)}
          onApproveAccountability={r => { onApproveAccountability(r); setSelected(null); }}
          onRejectAccountability={(r, rsn) => { onRejectAccountability(r, rsn); setSelected(null); }}
        />
      )}
      {showPDF && <PDFModal req={showPDF} onClose={() => setShowPDF(null)} />}
      {accountabilityTarget && (
        <Modal title={`Submit Accountability – ${accountabilityTarget.id}`} onClose={() => setAccountabilityTarget(null)} size="modal-lg" preventOverlayClose>
          <AccountabilityForm
            req={accountabilityTarget}
            onClose={() => setAccountabilityTarget(null)}
            onSave={(form) => {
              onSubmitAccountability(accountabilityTarget, form);
              setAccountabilityTarget(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Paid Vouchers Page (final state – completed requests) ─────────────────────
function PaidVouchersPage({ user, requests }) {
  const isPaymentOfficer = ["payment_accountant","admin"].includes(user.role);

  const completed = isPaymentOfficer
    ? requests.filter(r => r.status === "completed" && !r.isVendorPayment)
    : requests.filter(r => r.status === "completed" && !r.isVendorPayment && r.requesterId === user.id);

  const [showPDF, setShowPDF] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? completed.filter(r =>
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.id.toLowerCase().includes(search.toLowerCase()) ||
        (r.requesterName || "").toLowerCase().includes(search.toLowerCase())
      )
    : completed;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Paid Vouchers</div>
          <div className="page-sub">Fully accounted and closed payment vouchers.</div>
        </div>
        <span className="sbadge" style={{ background:"#d1fae5", color:"#065f46", fontSize:13, padding:"6px 14px" }}>
          {completed.length} completed
        </span>
      </div>

      {/* Search */}
      <div style={{ marginBottom:16 }}>
        <input
          type="text"
          placeholder="Search by title, ID or staff…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input"
          style={{ maxWidth:340 }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><IconBadge name="doc" tone="green" size={28} /></div>
            <div className="empty-text">No paid vouchers yet</div>
            <div className="empty-sub">Vouchers that have been fully accounted for will appear here.</div>
          </div>
        </div>
      ) : (
        filtered.map(r => {
          const receipts = getAccountabilityReceiptFiles(r);
          const photos = getAccountabilityPhotoFiles(r);
          return (
            <div key={r.id} className="pending-card" style={{ marginBottom:12, borderLeft:"4px solid #10b981" }}>
              <div className="pending-card-body">
                <div className="flex items-center justify-between">
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="flex items-center gap-2 mb-1" style={{ flexWrap:"wrap" }}>
                      <span className="ref">{r.id}</span>
                      <span className="sbadge" style={{ background:"#d1fae5", color:"#065f46", fontWeight:800 }}>✓ COMPLETED</span>
                      <span className="paid-stamp" style={{ fontSize:11, padding:"2px 8px" }}>PAID</span>
                    </div>
                    <div style={{ fontWeight:600, fontSize:15, color:"var(--navy)" }}>{r.title}</div>
                    <div className="text-sm text-gray mt-1">{r.department} · {r.requesterName}</div>
                    <div className="text-xs text-gray mt-1">
                      Paid {r.paymentDate ? fmt(r.paymentDate) : "-"} · Txn: {getPaymentNumber(r) || "-"}
                      {r.completedAt ? ` · Closed ${fmt(r.completedAt)}` : ""}
                    </div>
                    {(receipts.length > 0 || photos.length > 0) && (
                      <div className="text-xs mt-1" style={{ color:"var(--blue)" }}>
                        {receipts.length} receipt{receipts.length !== 1 ? "s" : ""} · {photos.length} photo{photos.length !== 1 ? "s" : ""} submitted
                      </div>
                    )}
                  </div>
                  <div className="amount" style={{ fontSize:18 }}>{fmtAmt(r.amount)}</div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(r)}>
                    <AppButtonIcon name="view" tone="blue" />View Full Record
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowPDF(r)}>
                    <AppButtonIcon name="download" tone="navy" />Download PDF
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      {selected && (
        <RequestDetail req={selected} user={user} onClose={() => setSelected(null)}
          onApprove={() => {}} onReject={() => {}} onEdit={() => {}}
          onOpenPaymentForm={() => {}}
          onDownload={r => setShowPDF(r)}
          onApproveAccountability={() => {}}
          onRejectAccountability={() => {}}
        />
      )}
      {showPDF && <PDFModal req={showPDF} onClose={() => setShowPDF(null)} />}
    </div>
  );
}

/**
 * Payment Queue – Payment Officer view.
 *
 * Three sections:
 *  1. Ready for Payment   – status "approved" (Stage 2)
 *  2. Pending Accountability – status "paid" / "pending_accountability"
 *  3. Final Review Queue  – status "senior_accountant_approved" (Stage 7)
 *
 * The "Mark as Paid" button is shown ONLY for requests that are APPROVED
 * and have not yet been paid.  It is permanently hidden once payment is done.
 */
function PaymentQueue({ user, requests, onPay, onApproveAccountability, onRejectAccountability }) {
  // Stage 2: approved requests ready for payment
  const approvedQueue = requests.filter(r =>
    (r.status === "approved" || r.status === "pending_payment_accountant") && !r.isVendorPayment
  );
  const vendorQueue = requests.filter(r =>
    (r.status === "approved" || r.status === "pending_payment_accountant") && r.isVendorPayment
  );
  // Stage 3: paid and waiting for requester accountability submission / revision
  const pendingAccountabilityQueue = requests.filter(r =>
    !r.isVendorPayment && ["paid", "pending_accountability"].includes(r.status)
  );
  // Stage 7: accountability in final review
  const finalReviewQueue = requests.filter(r => r.status === "senior_accountant_approved");

  const [selected,      setSelected]      = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [showPDF,       setShowPDF]       = useState(null);
  const [rejecting,     setRejecting]     = useState(null);
  const [reason,        setReason]        = useState("");

  const totalCount = approvedQueue.length + vendorQueue.length + pendingAccountabilityQueue.length + finalReviewQueue.length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Payment Queue</div>
        <div className="page-sub">{totalCount} item{totalCount !== 1 ? "s" : ""} awaiting action</div>
      </div>

      {/* ── Section 1: Approved requests (Stage 2) ── */}
      <div className="font-bold text-sm mb-2 text-navy" style={{ marginTop:4 }}>
        Ready for Payment
        <span className="sbadge" style={{ marginLeft:8, background:"#d1fae5", color:"#065f46" }}>{approvedQueue.length + vendorQueue.length}</span>
      </div>

      {approvedQueue.length === 0 && vendorQueue.length === 0 ? (
        <div className="card mb-4">
          <div className="empty-state">
            <div className="empty-icon"><IconBadge name="payments" tone="amber" size={22} /></div>
            <div className="empty-text">No approved requests</div>
            <div className="empty-sub">Fully approved requests will appear here for payment processing.</div>
          </div>
        </div>
      ) : (
        [...approvedQueue, ...vendorQueue].map(r => (
          <div key={r.id} className="pending-card pay-card" style={{ marginBottom:12 }}>
            <div className="pending-card-body">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="ref">{r.id}</span>
                    <StatusBadge status={r.status} />
                    {r.isVendorPayment && (
                      <span className="sbadge" style={{ background:"#ede9fe", color:"#7c3aed", fontSize:10, fontWeight:700 }}>Vendor</span>
                    )}
                  </div>
                  <div style={{ fontWeight:600, fontSize:15.5, color:"var(--navy)" }}>{r.title}</div>
                  <div className="text-sm text-gray mt-1">{r.department} · {r.requesterName}</div>
                </div>
                <div className="amount" style={{ fontSize:20 }}>{fmtAmt(r.amount)}</div>
              </div>
              <div className="flex gap-2 mt-3">
                {/* Stage 2: "Mark as Paid" – shown ONLY before payment is locked */}
                {canProcessPayment(r) && (
                  <button className="btn btn-amber btn-sm" onClick={() => setPaymentTarget(r)}>
                    <AppButtonIcon name="payments" tone="amber" />Mark as Paid
                  </button>
                )}
                {/* After payment: show locked PAID badge instead */}
                {isPaymentLocked(r) && (
                  <span className="sbadge" style={{ background:"#d1fae5", color:"#065f46", fontWeight:700, padding:"6px 12px" }}>
                    PAID – {getPaymentNumber(r)}
                  </span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(r)}>
                  <AppButtonIcon name="view" tone="blue" />View
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowPDF(r)}>
                  <AppButtonIcon name="download" tone="navy" />Preview
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* ── Section 2: Paid requests waiting for accountability ── */}
      <div className="font-bold text-sm mb-2 text-navy" style={{ marginTop:16 }}>
        Pending Accountability
        <span className="sbadge" style={{ marginLeft:8, background:"#fef3c7", color:"#92400e" }}>{pendingAccountabilityQueue.length}</span>
      </div>

      {pendingAccountabilityQueue.length === 0 ? (
        <div className="card mb-4">
          <div className="empty-state">
            <div className="empty-icon"><IconBadge name="workflow" tone="amber" size={22} /></div>
            <div className="empty-text">No paid requests are waiting for accountability</div>
            <div className="empty-sub">Requests marked paid will appear here until the requester submits accountability.</div>
          </div>
        </div>
      ) : (
        pendingAccountabilityQueue.map(r => (
          <div key={`${r.id}-pending-acc`} className="pending-card" style={{ marginBottom:12, borderColor:"#f59e0b" }}>
            <div className="pending-card-body">
              <div className="flex items-center justify-between">
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="ref">{r.id}</span>
                    <StatusBadge status={r.status} />
                    <span className="sbadge" style={{ background:"#fef3c7", color:"#92400e" }}>Pending Accountability</span>
                  </div>
                  <div style={{ fontWeight:600, fontSize:15.5, color:"var(--navy)" }}>{r.title}</div>
                  <div className="text-sm text-gray mt-1">{r.department} · {r.requesterName}</div>
                  <div className="text-xs text-gray mt-1">
                    Paid on {r.paymentDate ? fmt(r.paymentDate) : "-"}
                    {getPaymentNumber(r) ? ` · Transaction ID: ${getPaymentNumber(r)}` : ""}
                  </div>
                  {r.accountabilityRejectionReason && (
                    <div className="text-xs mt-1" style={{ color:"#991b1b" }}>
                      Revision requested: {r.accountabilityRejectionReason}
                    </div>
                  )}
                </div>
                <div className="amount" style={{ fontSize:18 }}>{fmtAmt(r.amount)}</div>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn btn-amber btn-sm" onClick={() => setSelected(r)}>
                  <AppButtonIcon name="workflow" tone="amber" />Pending Accountability
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowPDF(r)}>
                  <AppButtonIcon name="download" tone="navy" />Preview
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* ── Section 3: Final Accountability Review (Stage 7) ── */}
      <div className="font-bold text-sm mb-2 text-navy" style={{ marginTop:16 }}>
        Final Accountability Review
        <span className="sbadge" style={{ marginLeft:8, background:"#ede9fe", color:"#7c3aed" }}>{finalReviewQueue.length}</span>
      </div>

      {finalReviewQueue.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"><IconBadge name="doc" tone="blue" size={22} /></div>
            <div className="empty-text">No accountability submissions pending final review</div>
          </div>
        </div>
      ) : (
        finalReviewQueue.map(r => (
          <div key={`${r.id}-final`} className="pending-card" style={{ marginBottom:12, borderColor:"#7c3aed" }}>
            <div className="pending-card-body">
              <div className="flex items-center justify-between">
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="ref">{r.id}</span>
                    <span className="sbadge" style={{ background:"#ede9fe", color:"#7c3aed" }}>Final Review</span>
                  </div>
                  <div style={{ fontWeight:600, fontSize:15.5, color:"var(--navy)" }}>{r.title}</div>
                  <div className="text-sm text-gray mt-1">{r.department} · {r.requesterName}</div>
                  {r.accountabilityReportData?.activityTitle && (
                    <div className="text-xs mt-1" style={{ color:"var(--blue)" }}>
                      Activity: {r.accountabilityReportData.activityTitle}
                    </div>
                  )}
                  <div className="text-xs" style={{ color:"var(--blue)" }}>
                    Receipts: {getAccountabilityReceiptFiles(r).length} · Photos: {getAccountabilityPhotoFiles(r).length}
                  </div>
                </div>
                <div className="amount" style={{ fontSize:18 }}>{fmtAmt(r.amount)}</div>
              </div>

              {rejecting === r.id ? (
                <div className="mt-3">
                  <textarea
                    rows={2} value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Rejection reason (required)..."
                    style={{ width:"100%", marginBottom:8 }}
                  />
                  <div className="flex gap-2">
                    <button className="btn btn-red btn-sm" onClick={() => {
                      if (!reason.trim()) return;
                      onRejectAccountability(r, reason);
                      setRejecting(null);
                      setReason("");
                    }}>Confirm Rejection</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-green btn-sm" onClick={() => onApproveAccountability(r)}>
                    <AppButtonIcon name="approve" tone="green" />Approve &amp; Close Request
                  </button>
                  <button className="btn btn-red btn-sm" onClick={() => setRejecting(r.id)}>
                    <AppButtonIcon name="reject" tone="red" />Reject
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(r)}>
                    <AppButtonIcon name="view" tone="blue" />View
                  </button>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {selected && (
        <RequestDetail req={selected} user={user} onClose={() => setSelected(null)}
          onApprove={() => {}} onReject={() => {}} onEdit={() => {}}
          onOpenPaymentForm={r => { setSelected(null); setPaymentTarget(r); }}
          onDownload={r => setShowPDF(r)}
          onApproveAccountability={r => { onApproveAccountability(r); setSelected(null); }}
          onRejectAccountability={(r, rsn) => { onRejectAccountability(r, rsn); setSelected(null); }}
        />
      )}
      {paymentTarget && (
        <PaymentProcessModal req={paymentTarget} onClose={() => setPaymentTarget(null)} onSubmit={onPay} />
      )}
      {showPDF && <PDFModal req={showPDF} onClose={() => setShowPDF(null)} />}
    </div>
  );
}

// â"€â"€ Notifications â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function Notifications({ user, setPage, onRead }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setNotifs([..._notifications.filter(n => n.userId === user.id)].sort((a,b) => new Date(b.at) - new Date(a.at)));
  }, [user.id]);

  useEffect(() => {
    setLoading(true);
    fetchNotificationsFromDB().then(() => {
      saveState();
      reload();
      setLoading(false);
    });
  }, [reload]);

  // Mark all as read on open — also sync to Supabase
  useEffect(() => {
    if (loading || !notifs.length) return;
    const unreadItems = notifs.filter(n => !n.read);
    if (!unreadItems.length) return;
    unreadItems.forEach(n => { n.read = true; });
    saveState();
    const ids = unreadItems.map(n => n.id);
    supabase.from("notifications").update({ is_read: true }).in("id", ids).then(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    onRead?.();
  }, [notifs, loading, onRead]);

  const unread = notifs.filter(n => !n.read).length;

  const openNotification = (notification) => {
    notification.read = true;
    supabase.from("notifications").update({ is_read: true }).eq("id", notification.id).then(() => {});
    saveState();
    setNotifs(prev => prev.map(item => item.id === notification.id ? { ...item, read: true } : item));
    const targetPage = getNotificationTargetPage(user, notification);
    if (targetPage && targetPage !== "notifications") setPage(targetPage);
  };

  const markAllRead = () => {
    const unreadIds = notifs.filter(n => !n.read).map(n => n.id);
    notifs.forEach(n => { n.read = true; });
    if (unreadIds.length) supabase.from("notifications").update({ is_read: true }).in("id", unreadIds).then(() => {});
    saveState();
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Notifications</div>
          <div className="page-sub">{notifs.length} total{unread > 0 ? ` · ${unread} unread` : ""}</div>
        </div>
        {notifs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>}
      </div>
      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="empty-text">Loading notifications…</div></div>
        ) : notifs.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><IconBadge name="com" tone="teal" size={22} /></div><div className="empty-text">No notifications yet</div></div>
        ) : notifs.map(n => (
          <button
            key={n.id}
            type="button"
            className={`notif-item ${!n.read ? "unread" : ""}`}
            onClick={() => openNotification(n)}
            style={{ width:"100%", textAlign:"left", cursor:"pointer", background:"transparent" }}
            title="Open related page"
          >
            <div className="notif-circle"><AppIcon name="com" size={16} /></div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13.5 }}>{n.message}</div>
              <div className="text-xs text-gray mt-1">{fmt(n.at)} · Click to open</div>
            </div>
            {n.requestId && <span className="ref" style={{ flexShrink:0 }}>{n.requestId}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// â"€â"€ User Management â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function UserManagement({ currentUserId=null, onSystemChange=()=>{} }) {
  const [users, setUsers] = useState([..._users]);
  const [positions, setPositions] = useState(getPositionOptions(_users, _positions));
  const [positionRoles, setPositionRoles] = useState({ ..._positionRoles });
  const [positionDashboards, setPositionDashboards] = useState({ ..._positionDashboards });
  const [dashboardDelegations, setDashboardDelegations] = useState([..._dashboardDelegations]);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name:"", email:"", jobTitle:ROLE_LABELS.requester, dept:"Programs", password:"Staff@2024!", supervisorId:"", moduleRole:"staff" });
  const [newPosition, setNewPosition] = useState("");
  const [newPositionRole, setNewPositionRole] = useState("requester");
  const [newPositionDashboard, setNewPositionDashboard] = useState("");
  const [delegationForm, setDelegationForm] = useState({ dashboard:"", ownerUserId:"", delegateUserId:"", startsOn:"", endsOn:"", reason:"" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeWorkspace, setActiveWorkspace] = useState("positions");
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const managers = users.filter(u => u.id !== editUser?.id);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const syncUsers = () => {
    normalizeState();
    setUsers([..._users]);
    setPositions(getPositionOptions(_users, _positions));
    setPositionRoles({ ..._positionRoles });
    setPositionDashboards({ ..._positionDashboards });
    setDashboardDelegations([..._dashboardDelegations]);
    saveState();
    onSystemChange();
  };

  const openAdd = () => {
    setEditUser(null);
    setFormError("");
    setForm({ name:"", email:"", jobTitle:ROLE_LABELS.requester, dept:"Programs", password:"Staff@2024!", supervisorId:users[0]?.id || "", moduleRole:"staff" });
    setShowForm(true);
  };
  const openEdit = (u) => {
    // Find the live object from _users (u may be a stale reference after loadState replaced _users)
    const freshU = _users.find(x => x.email === u.email) || u;
    setUsers([..._users]);
    setEditUser(freshU);
    setFormError("");
    const position = getUserPosition(freshU);
    const normalizedPosition = normalizePositionName(position);
    const moduleRole = POSITION_MODULE_ROLES[normalizedPosition] || getModuleRole(freshU);
    setForm({ name:freshU.name, email:freshU.email, jobTitle:position, dept:freshU.dept, password:freshU.password, supervisorId:freshU.supervisorId || "", moduleRole });
    setShowForm(true);
  };

  const saveUser = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    const fallbackSupervisorId = form.supervisorId || managers[0]?.id || null;
    const normalizedJobTitle = normalizePositionName(form.jobTitle) || "Team Member";
    const derivedRole = getPositionAccessRole(normalizedJobTitle);
    const nextForm = {
      ...form,
      role: derivedRole,
      moduleRole: POSITION_MODULE_ROLES[normalizedJobTitle] || (MODULE_ROLES.includes(form.moduleRole) ? form.moduleRole : inferModuleRole(derivedRole)),
      jobTitle: normalizedJobTitle,
      supervisorId: derivedRole === "executive_director" ? null : fallbackSupervisorId,
    };
    if (!_positions.some(position => position.toLowerCase() === normalizedJobTitle.toLowerCase())) {
      _positions.push(normalizedJobTitle);
      _positionRoles[normalizedJobTitle] = derivedRole;
    }
    if (editUser) {
      const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      // Update the live _users object so future normalizeState calls see the new data.
      const freshUser = _users.find(u => u.email === editUser.email) || editUser;
      Object.assign(freshUser, nextForm);
      // Directly patch React state without going through normalizeState (which may null supervisorId
      // when local IDs differ from DB IDs). This guarantees the UI reflects the save immediately.
      setUsers(prev => prev.map(u =>
        u.email === editUser.email ? { ...u, ...nextForm } : u
      ));
      saveState();
      onSystemChange();
      showToast(`User updated: ${form.name}`);
      setShowForm(false);
      setEditUser(null);
      // Persist to Supabase, then re-fetch from DB so IDs stay consistent.
      supabase.from("users").update({
        name:        nextForm.name,
        role:        nextForm.role === "hr_manager" ? "requester" : nextForm.role,
        module_role: nextForm.moduleRole,
        job_title:   nextForm.jobTitle,
        department:  nextForm.dept,
        supervisor_id: isUUID(nextForm.supervisorId) ? nextForm.supervisorId : null,
      }).eq("email", editUser.email).then(({ error }) => {
        if (error) console.warn("Failed to sync user edit to DB:", error.message);
        return fetchUsersFromDB();
      }).then(() => {
        saveState();
        setUsers([..._users]);
      }).catch(err => console.warn("Post-edit DB re-sync failed:", err));
      return;
    }
    if (!form.password?.trim()) { setFormError("Password is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      const avatar = form.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
      const u = {
        id: crypto.randomUUID(), avatar, isActive: true,
        failedLoginAttempts: 0, lockedAt: null, lastPasswordResetAt: null,
        ...nextForm,
      };
      const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const { data, error } = await supabase.functions.invoke("create-auth-user", {
        body: { email: u.email, password: form.password.trim(), name: u.name, role: u.role, moduleRole: u.moduleRole, jobTitle: u.jobTitle, dept: u.dept, supervisorId: isUUID(u.supervisorId) ? u.supervisorId : null },
      });
      if (error || data?.error) {
        let msg = data?.error || error?.message || "Unknown error";
        if (error?.context && typeof error.context.json === "function") {
          try { const body = await error.context.json(); msg = body?.error || body?.message || msg; } catch {}
        }
        setFormError(msg);
        return;
      }
      if (data?.profileId) u.id = data.profileId;
      _users.push(u);
      setShowForm(false);
      setEditUser(null);
      setFormError("");
      syncUsers();
      setCreatedCredentials({ name: form.name, email: u.email, password: form.password.trim() });
    } finally {
      setSaving(false);
    }
  };

  const savePosition = () => {
    const normalized = normalizePositionName(newPosition);
    if (!normalized) return;
    if (_positions.some(position => position.toLowerCase() === normalized.toLowerCase())) {
      showToast(`Position already exists: ${normalized}`);
      return;
    }
    _deletedPositions = _deletedPositions.filter(p => p.toLowerCase() !== normalized.toLowerCase());
    _positions.push(normalized);
    _positionRoles[normalized] = newPositionRole;
    _positionDashboards[normalized] = newPositionDashboard;
    syncUsers();
    setNewPosition("");
    setNewPositionRole("requester");
    setNewPositionDashboard("");
    showToast(`Position added: ${normalized}`);
  };

  const deletePosition = (position) => {
    if (!_deletedPositions.some(p => p.toLowerCase() === position.toLowerCase())) {
      _deletedPositions.push(position);
    }
    _positions = _positions.filter(p => p.toLowerCase() !== position.toLowerCase());
    delete _positionDashboards[position];
    syncUsers();
    showToast(`Position removed: ${position}`);
  };

  const updatePositionRole = (position, role) => {
    _positionRoles[position] = role;
    syncUsers();
    showToast(`Access for "${position}" updated.`);
  };

  const updatePositionDashboard = (position, dashboard) => {
    _positionDashboards[position] = dashboard;
    syncUsers();
    showToast(`Dashboard for "${position}" updated.`);
  };

  const saveDelegation = () => {
    if (!delegationForm.dashboard || !delegationForm.ownerUserId || !delegationForm.delegateUserId) return;
    if (delegationForm.ownerUserId === delegationForm.delegateUserId) {
      showToast("Choose a different delegate.");
      return;
    }
    if (delegationForm.startsOn && delegationForm.endsOn && delegationForm.startsOn > delegationForm.endsOn) {
      showToast("Delegation end date must be on or after the start date.");
      return;
    }
    const dashboardKey = delegationForm.dashboard;
    const owner = users.find(u => u.id === delegationForm.ownerUserId);
    if (!owner || getPositionDashboard(getUserPosition(owner)) !== dashboardKey) {
      showToast("Selected owner does not own that dashboard.");
      return;
    }
    _dashboardDelegations.push({
      id: `dlg-${Date.now()}`,
      dashboard: dashboardKey,
      ownerUserId: delegationForm.ownerUserId,
      delegateUserId: delegationForm.delegateUserId,
      startsOn: delegationForm.startsOn,
      endsOn: delegationForm.endsOn,
      reason: delegationForm.reason.trim(),
      isRevoked: false,
      createdAt: ts(),
    });
    syncUsers();
    setDelegationForm({ dashboard:"", ownerUserId:"", delegateUserId:"", startsOn:"", endsOn:"", reason:"" });
    showToast("Dashboard delegation saved.");
  };

  const revokeDelegation = (delegationId) => {
    revokeDashboardDelegationRecord(delegationId);
    syncUsers();
    showToast("Delegation revoked.");
  };

  const resetPW = async (u) => {
    const tempPassword = "Staff@2024!";
    showToast(`Looking up account for ${u.name}…`);
    try {
      let authId = u.authUserId;
      if (!authId) {
        const { data: row } = await supabase
          .from("users").select("auth_user_id").eq("email", u.email).maybeSingle();
        authId = row?.auth_user_id;
      }
      if (!authId) {
        showToast(`No auth account linked for ${u.name}. Refresh the page and try again.`);
        return;
      }
      showToast(`Resetting password for ${u.name}…`);
      const { error } = await supabase.functions.invoke("reset-user-password", {
        body: { targetAuthUserId: authId, newPassword: tempPassword },
      });
      if (error) { showToast(`Reset failed: ${error.message}`); return; }
      u.failedLoginAttempts = 0;
      u.lockedAt = null;
      u.lastPasswordResetAt = ts();
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, failedLoginAttempts:0, lockedAt:null, lastPasswordResetAt:u.lastPasswordResetAt } : x));
      showToast(`Done — ${u.name}'s password reset to: ${tempPassword}`);
    } catch (e) {
      showToast(`Reset error: ${e.message || String(e)}`);
    }
  };

  const unlockUser = (u) => {
    u.failedLoginAttempts = 0;
    u.lockedAt = null;
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, failedLoginAttempts:0, lockedAt:null } : x));
    showToast(`${u.name} has been unlocked.`);
  };

  const toggleActive = (u) => {
    if (u.id === currentUserId && u.isActive !== false) {
      showToast("You cannot deactivate your own account while signed in.");
      return;
    }
    const newActive = u.isActive === false; // toggle: false→true, true/undefined→false
    u.isActive = newActive;
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: newActive } : x));
    supabase.from("users").update({ is_active: newActive }).eq("email", u.email)
      .then(({ error }) => { if (error) console.warn("Could not sync active status:", error.message); });
    showToast(`${u.name} ${newActive ? "reactivated" : "deactivated"}.`);
  };

  const deleteUser = (u) => {
    if (u.id === currentUserId) {
      showToast("You cannot delete your own account.");
      return;
    }
    if (!window.confirm(`Delete "${u.name}" (${u.email})?\n\nThis removes their system profile. Their login credentials will remain in auth until cleared separately.`)) return;
    _users = _users.filter(x => x.id !== u.id);
    supabase.from("users").delete().eq("id", u.id)
      .then(({ error }) => { if (error) console.warn("Could not delete user from DB:", error.message); });
    syncUsers();
    showToast(`${u.name} removed from the system.`);
  };

  const filtered = users
    .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()) || (u.jobTitle || "").toLowerCase().includes(search.toLowerCase()))
    .filter(u => roleFilter === "all" || (roleFilter.startsWith("mr:") ? getModuleRole(u) === roleFilter.slice(3) : u.role === roleFilter));
  const activeDelegations = dashboardDelegations.filter(item => !item.isRevoked);
  const selectedDashboardOwners = delegationForm.dashboard
    ? users.filter(u => getPositionDashboard(getUserPosition(u)) === delegationForm.dashboard)
    : [];
  const selectedOwner = users.find(u => u.id === delegationForm.ownerUserId);
  const delegateOptions = users.filter(u => u.id !== delegationForm.ownerUserId);
  const specializedPositions = positions.filter(position => !!positionDashboards[position]);
  const activeUsersCount = users.filter(u => u.isActive !== false).length;
  const lockedUsersCount = users.filter(u => !!u.lockedAt).length;
  const securityAttentionCount = users.filter(u => u.isActive === false || !!u.lockedAt).length;
  const workspaceCards = [
    {
      id: "positions",
      icon: "users",
      tone: "blue",
      label: "Position Library",
      sub: "Maintain job titles as the source of access and specialized dashboard ownership.",
      meta: `${positions.length} positions · ${specializedPositions.length} specialized`,
    },
    {
      id: "delegations",
      icon: "approvals",
      tone: "amber",
      label: "Delegation Desk",
      sub: "Assign temporary dashboard coverage when role owners are away.",
      meta: `${activeDelegations.length} active delegation${activeDelegations.length === 1 ? "" : "s"}`,
    },
    {
      id: "users",
      icon: "requests",
      tone: "navy",
      label: "User Directory",
      sub: "Review people, positions, access, dashboard ownership, and reporting lines in one place.",
      meta: `${filtered.length} shown · ${users.length} total users`,
    },
    {
      id: "security",
      icon: "logs",
      tone: "teal",
      label: "Account Security",
      sub: "See which accounts are active, locked, or need administrator action.",
      meta: `${securityAttentionCount} account${securityAttentionCount === 1 ? "" : "s"} need attention`,
    },
  ];

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">User Management</div>
          <div className="page-sub">Positions now define access automatically, and specialized dashboards can be delegated when someone is away.</div>
        </div>
        <button className="btn btn-amber" onClick={openAdd}>Add User</button>
      </div>

      <div className="admin-header">
        <div style={{ position:"relative", zIndex:1 }}>
          <div className="admin-header-title">Access & Role Workspace</div>
          <div className="admin-header-sub">Cleanly separated control areas for positions, delegated dashboards, user access, and account security.</div>
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stat">
          <div className="admin-stat-icon" style={{ background:"#eff6ff", color:"#2563eb" }}><IconBadge name="users" tone="blue" size={20} /></div>
          <div>
            <div className="admin-stat-val">{positions.length}</div>
            <div className="admin-stat-label">Positions in Library</div>
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-icon" style={{ background:"#fff7ed", color:"#d97706" }}><IconBadge name="approvals" tone="amber" size={20} /></div>
          <div>
            <div className="admin-stat-val">{activeDelegations.length}</div>
            <div className="admin-stat-label">Active Delegations</div>
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-icon" style={{ background:"#ecfeff", color:"#0f766e" }}><IconBadge name="requests" tone="teal" size={20} /></div>
          <div>
            <div className="admin-stat-val">{activeUsersCount}</div>
            <div className="admin-stat-label">Active Users</div>
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-icon" style={{ background:"#fef2f2", color:"#dc2626" }}><IconBadge name="logs" tone="red" size={20} /></div>
          <div>
            <div className="admin-stat-val">{lockedUsersCount}</div>
            <div className="admin-stat-label">Locked Accounts</div>
          </div>
        </div>
      </div>

      <div className="control-cards">
        {workspaceCards.map(card => (
          <div key={card.id} style={{ position:"relative" }}>
            <ModuleNavCard
              icon={card.icon}
              label={card.label}
              sub={card.sub}
              meta={card.meta}
              tone={card.tone}
              onClick={() => setActiveWorkspace(card.id)}
            />
            {activeWorkspace === card.id && (
              <div style={{ position:"absolute", inset:"auto 18px 12px 18px", height:4, borderRadius:999, background:"linear-gradient(90deg,#f59e0b 0%, #0f2744 100%)" }} />
            )}
          </div>
        ))}
      </div>

      {toast && <div className="alert alert-green">{toast}</div>}

      {activeWorkspace === "positions" && (
      <div>
        <div id="positions-panel" className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Position Library</div>
              <div className="page-sub" style={{ marginTop:4 }}>Each position carries its access role. Specialized dashboards can also belong to a position.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="budget-stats" style={{ marginBottom:18 }}>
              <div className="budget-stat">
                <span className="budget-stat-label">Total Positions</span>
                <strong>{positions.length}</strong>
              </div>
              <div className="budget-stat">
                <span className="budget-stat-label">Standard Positions</span>
                <strong>{positions.length - specializedPositions.length}</strong>
              </div>
              <div className="budget-stat">
                <span className="budget-stat-label">Specialized Dashboards</span>
                <strong>{specializedPositions.length}</strong>
              </div>
            </div>

            <div className="flex gap-3" style={{ flexWrap:"wrap", alignItems:"end", marginBottom:18 }}>
              <FormField label="Position Title" style={{ minWidth:260, marginBottom:0 }}>
                <input
                  value={newPosition}
                  onChange={e=>setNewPosition(e.target.value)}
                  placeholder="e.g. Monitoring and Evaluation Officer"
                  onKeyDown={e => e.key === "Enter" && savePosition()}
                />
              </FormField>
              <FormField label="Access Role" style={{ minWidth:200, marginBottom:0 }}>
                <select value={newPositionRole} onChange={e=>setNewPositionRole(e.target.value)}>
                  {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </FormField>
              <FormField label="Specialized Dashboard" style={{ minWidth:230, marginBottom:0 }}>
                <select value={newPositionDashboard} onChange={e=>setNewPositionDashboard(e.target.value)}>
                  <option value="">No specialized dashboard</option>
                  {Object.entries(SPECIAL_DASHBOARDS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                </select>
              </FormField>
              <button className="btn btn-amber" onClick={savePosition} style={{ flexShrink:0 }}>Add Position</button>
            </div>

            <div className="table-wrap" style={{ borderRadius:"var(--r-sm)", border:"1px solid var(--g200)" }}>
              <table style={{ fontSize:13 }}>
                <thead>
                  <tr>
                    <th style={{ width:"36%" }}>Position Title</th>
                    <th style={{ width:"28%" }}>Access Role</th>
                    <th style={{ width:"28%" }}>Specialized Dashboard</th>
                    <th style={{ width:"8%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(position => (
                    <tr key={position}>
                      <td style={{ fontWeight:600, color:"var(--navy)" }}>{position}</td>
                      <td>
                        <select
                          value={positionRoles[position] || "requester"}
                          onChange={e => updatePositionRole(position, e.target.value)}
                          style={{ fontSize:12, padding:"5px 8px", borderRadius:6, border:"1px solid var(--g200)", background:"#fff", color:"var(--g700)", cursor:"pointer" }}
                        >
                          {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          value={positionDashboards[position] || ""}
                          onChange={e => updatePositionDashboard(position, e.target.value)}
                          style={{ fontSize:12, padding:"5px 8px", borderRadius:6, border:"1px solid var(--g200)", background:"#fff", color:"var(--g700)", cursor:"pointer" }}
                        >
                          <option value="">No specialized dashboard</option>
                          {Object.entries(SPECIAL_DASHBOARDS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign:"right" }}>
                        <button
                          type="button"
                          title={`Delete "${position}"`}
                          className="btn btn-ghost btn-sm"
                          style={{ color:"var(--red)", fontSize:12 }}
                          onClick={() => deletePosition(position)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeWorkspace === "delegations" && (
      <div id="delegations-panel" className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Delegation Desk</div>
            <div className="page-sub" style={{ marginTop:4 }}>Temporary access assignments for specialized dashboards, especially during leave cover.</div>
          </div>
        </div>
        <div className="card-body">
          <div className="budget-stats" style={{ marginBottom:18 }}>
            <div className="budget-stat">
              <span className="budget-stat-label">Active Delegations</span>
              <strong>{activeDelegations.length}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Special Dashboards</span>
              <strong>{Object.keys(SPECIAL_DASHBOARDS).length}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Current Owners</span>
              <strong>{users.filter(u => getPositionDashboard(getUserPosition(u))).length}</strong>
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom:18 }}>
            <FormField label="Dashboard">
              <select value={delegationForm.dashboard} onChange={e=>setDelegationForm(current => ({ ...current, dashboard:e.target.value, ownerUserId:"", delegateUserId:"" }))}>
                <option value="">Select dashboard</option>
                {Object.entries(SPECIAL_DASHBOARDS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
              </select>
            </FormField>
            <FormField label="Dashboard Owner">
              <select value={delegationForm.ownerUserId} onChange={e=>setDelegationForm(current => ({ ...current, ownerUserId:e.target.value }))}>
                <option value="">Select owner</option>
                {selectedDashboardOwners.map(u => <option key={u.id} value={u.id}>{u.name} - {getUserPosition(u)}</option>)}
              </select>
            </FormField>
            <FormField label="Delegate To">
              <select value={delegationForm.delegateUserId} onChange={e=>setDelegationForm(current => ({ ...current, delegateUserId:e.target.value }))}>
                <option value="">Select delegate</option>
                {delegateOptions.map(u => <option key={u.id} value={u.id}>{u.name} - {getUserPosition(u)}</option>)}
              </select>
            </FormField>
            <FormField label="Start Date">
              <input type="date" value={delegationForm.startsOn} onChange={e=>setDelegationForm(current => ({ ...current, startsOn:e.target.value }))} />
            </FormField>
            <FormField label="End Date">
              <input type="date" value={delegationForm.endsOn} onChange={e=>setDelegationForm(current => ({ ...current, endsOn:e.target.value }))} />
            </FormField>
            <FormField label="Reason">
              <input value={delegationForm.reason} onChange={e=>setDelegationForm(current => ({ ...current, reason:e.target.value }))} placeholder="e.g. Annual leave cover" />
            </FormField>
          </div>

          <div className="flex items-center justify-between" style={{ marginBottom:12, gap:12, flexWrap:"wrap" }}>
            <div className="field-hint" style={{ margin:0, maxWidth:520 }}>
              {selectedOwner ? `${selectedOwner.name} owns the selected dashboard through the ${getUserPosition(selectedOwner)} position.` : "Choose a dashboard first to see its current owners and set the right delegate."}
            </div>
            <button className="btn btn-amber" onClick={saveDelegation}>Save Delegation</button>
          </div>

          <div className="table-wrap" style={{ borderRadius:"var(--r-sm)", border:"1px solid var(--g200)" }}>
            <table style={{ fontSize:13 }}>
              <thead>
                <tr>
                  <th>Dashboard</th>
                  <th>Owner</th>
                  <th>Delegate</th>
                  <th>Dates</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeDelegations.length === 0 ? (
                  <tr><td colSpan="7" className="text-gray">No dashboard delegations yet.</td></tr>
                ) : activeDelegations.map(item => {
                  const owner = users.find(u => u.id === item.ownerUserId);
                  const delegate = users.find(u => u.id === item.delegateUserId);
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight:600 }}>{SPECIAL_DASHBOARDS[item.dashboard]?.label || item.dashboard}</td>
                      <td>{owner?.name || "Unknown"}<div className="text-xs text-gray">{owner ? getUserPosition(owner) : ""}</div></td>
                      <td>{delegate?.name || "Unknown"}<div className="text-xs text-gray">{delegate ? getUserPosition(delegate) : ""}</div></td>
                      <td className="text-gray">{item.startsOn || "Immediate"} to {item.endsOn || "Open-ended"}</td>
                      <td className="text-gray">{item.reason || "-"}</td>
                      <td><span className="sbadge" style={isDelegationActive(item) ? { background:"#d1fae5", color:"#065f46" } : { background:"#fef3c7", color:"#92400e" }}>{isDelegationActive(item) ? "Active" : "Scheduled/Expired"}</span></td>
                      <td style={{ textAlign:"right" }}><button className="btn btn-ghost btn-sm" onClick={()=>revokeDelegation(item.id)}>Revoke</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {activeWorkspace === "users" && (
      <div id="users-panel" className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <div>
            <div className="card-title">User Directory</div>
            <div className="page-sub" style={{ marginTop:4 }}>Browse users by position and access role, then open account actions from one table.</div>
          </div>
          <div className="filters" style={{ marginBottom:0 }}>
            <input className="f-input" placeholder="Search users..." value={search} onChange={e=>setSearch(e.target.value)} />
            <select className="f-input" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
              <option value="all">All Module Roles</option>
              {MODULE_ROLES.map(r => <option key={r} value={`mr:${r}`}>{MODULE_ROLE_LABELS[r]}</option>)}
              <option disabled>──</option>
              {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v} (workflow)</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Position</th><th>Module Role</th><th>Workflow Access</th><th>Dashboard</th><th>Delegated Access</th><th>Department</th><th>Account Status</th><th>Security</th><th>Reports To</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(u => {
                const isLocked = !!u.lockedAt;
                const isInactive = u.isActive === false;
                const statusTone = isInactive ? { bg:"#fee2e2", color:"#991b1b" } : isLocked ? { bg:"#fef3c7", color:"#92400e" } : { bg:"#d1fae5", color:"#065f46" };
                const ownedDashboard = getPositionDashboard(getUserPosition(u));
                const delegatedDashboards = getActiveDashboardDelegationsForUser(u.id, dashboardDelegations);
                const uMR = getModuleRole(u);
                const linkedEmp = _employees.find(e => e.email?.toLowerCase() === u.email?.toLowerCase());
                return (
                  <tr key={u.id}>
                    <td><div className="flex items-center gap-3"><Avatar str={u.avatar} /><div><div style={{ fontWeight:600 }}>{u.name}{linkedEmp && <span style={{ marginLeft:6, fontSize:10, fontWeight:700, background:"var(--navy-pale)", color:"var(--navy)", borderRadius:4, padding:"1px 5px" }}>{linkedEmp.employeeId}</span>}</div><div className="text-xs text-gray">{u.id}</div></div></div></td>
                    <td className="text-gray">{u.email}</td>
                    <td className="text-gray">{getUserPosition(u)}</td>
                    <td><span className="sbadge" style={{ background:MODULE_ROLE_COLORS[uMR]+"22", color:MODULE_ROLE_COLORS[uMR], border:`1px solid ${MODULE_ROLE_COLORS[uMR]}44` }}>{MODULE_ROLE_LABELS[uMR]}</span></td>
                    <td><span className="sbadge" style={{ background:"var(--navy-pale)", color:"var(--navy)" }}>{ROLE_LABELS[u.role]}</span></td>
                    <td className="text-gray">{ownedDashboard ? SPECIAL_DASHBOARDS[ownedDashboard]?.label : "Standard only"}</td>
                    <td className="text-gray">
                      {delegatedDashboards.length === 0 ? "None" : delegatedDashboards.map(item => SPECIAL_DASHBOARDS[item.dashboard]?.label).join(", ")}
                    </td>
                    <td className="text-gray">{u.dept}</td>
                    <td>
                      <span className="sbadge" style={statusTone}>
                        {isInactive ? "Deactivated" : isLocked ? "Locked" : "Active"}
                      </span>
                    </td>
                    <td className="text-xs text-gray">
                      {isLocked ? `Locked after ${u.failedLoginAttempts || 0} failed attempts` : `Failed logins: ${u.failedLoginAttempts || 0}`}
                      <br />
                      {u.lastPasswordResetAt ? `Reset: ${fmt(u.lastPasswordResetAt)}` : "Password never reset by admin"}
                    </td>
                    <td className="text-gray">{users.find(x=>x.id===u.supervisorId)?.name || "Unassigned"}</td>
                    <td>
                      <div className="flex gap-2" style={{ flexWrap:"wrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(u)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>resetPW(u)}>Reset PW</button>
                        {isLocked && <button className="btn btn-ghost btn-sm" style={{ color:"var(--amber,#d97706)" }} onClick={()=>unlockUser(u)}>Unlock</button>}
                        <button className="btn btn-ghost btn-sm" style={{ color: isInactive ? "#059669" : "#d97706" }} onClick={()=>toggleActive(u)}>
                          {isInactive ? "Reactivate" : "Deactivate"}
                        </button>
                        {u.id !== currentUserId && (
                          <button className="btn btn-ghost btn-sm" style={{ color:"#dc2626" }} onClick={()=>deleteUser(u)}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {activeWorkspace === "security" && (
      <div id="security-panel" className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Account Security Snapshot</div>
            <div className="page-sub" style={{ marginTop:4 }}>A quick placeholder area for access health, password resets, and locked-account follow-up.</div>
          </div>
        </div>
        <div className="card-body">
          <div className="budget-stats">
            <div className="budget-stat">
              <span className="budget-stat-label">Active Accounts</span>
              <strong>{activeUsersCount}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Locked Accounts</span>
              <strong>{lockedUsersCount}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Deactivated Accounts</span>
              <strong>{users.filter(u => u.isActive === false).length}</strong>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Attention Needed</span>
              <strong>{securityAttentionCount}</strong>
            </div>
          </div>
          <div className="field-hint" style={{ marginTop:14 }}>
            Use the action buttons in the user directory above to reset passwords, unlock accounts, or deactivate and reactivate users without leaving this dashboard.
          </div>
        </div>
      </div>
      )}

      {showForm && (
        <Modal title={editUser ? "Edit User" : "Add New User"} preventOverlayClose
          onClose={()=>{ if (!saving) { setShowForm(false); setEditUser(null); setShowPass(false); setFormError(""); } }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={saving} onClick={()=>{setShowForm(false);setEditUser(null);setShowPass(false);setFormError("");}}>Cancel</button>
              <button className="btn btn-amber" disabled={saving} onClick={saveUser}>
                {saving ? "Creating account…" : "Save User"}
              </button>
            </>
          }>
          {formError && (
            <div className="alert alert-red" style={{ marginBottom:14 }}>
              <strong>Error:</strong> {formError}
            </div>
          )}
          <div className="form-grid">
            <FormField label="Full Name">
              <input value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="Jane Doe" />
            </FormField>
            <FormField label="Email Address">
              <input type="email" value={form.email} onChange={e=>setF("email",e.target.value)} placeholder="jane@inspireyouthdev.org" />
            </FormField>
            <FormField label="Module Role" hint="Controls which modules this user can access in the system.">
              <select value={form.moduleRole} onChange={e=>setF("moduleRole",e.target.value)}>
                {MODULE_ROLES.map(r => <option key={r} value={r}>{MODULE_ROLE_LABELS[r]}</option>)}
              </select>
            </FormField>
            <FormField label="Position / Job Title">
              <select value={form.jobTitle} onChange={e => {
                const title = e.target.value;
                const normalizedTitle = normalizePositionName(title);
                const derivedRole = getPositionAccessRole(normalizedTitle);
                const derivedModuleRole = POSITION_MODULE_ROLES[normalizedTitle] || inferModuleRole(derivedRole);
                setForm(f => ({ ...f, jobTitle: title, moduleRole: derivedModuleRole }));
              }}>
                <option value="">— Select position —</option>
                {positions.map(p => <option key={p} value={p}>{p}</option>)}
                {form.jobTitle && !positions.includes(form.jobTitle) && (
                  <option value={form.jobTitle}>{form.jobTitle}</option>
                )}
              </select>
            </FormField>
            <FormField label="Workflow Access Role" hint="Determines approval chain role — auto-derived from position.">
              <input value={ROLE_LABELS[getPositionAccessRole(normalizePositionName(form.jobTitle))] || ROLE_LABELS.requester} readOnly style={{ background:"var(--g50)", color:"var(--g500)" }} />
            </FormField>
            <FormField label="Department">
              <select value={form.dept} onChange={e=>setF("dept",e.target.value)}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </FormField>
            {getPositionAccessRole(form.jobTitle) !== "executive_director" && (
              <FormField label="Reports To">
                <select value={form.supervisorId} onChange={e=>setF("supervisorId",e.target.value)}>
                  <option value="">Select Manager</option>
                  {managers.map(u => <option key={u.id} value={u.id}>{u.name} · {u.jobTitle || ROLE_LABELS[u.role]}</option>)}
                </select>
              </FormField>
            )}
            {!editUser && (
              <FormField label="Password" full>
                <div style={{ display:"flex", gap:8 }}>
                  <input type={showPass ? "text" : "password"} value={form.password} onChange={e=>setF("password",e.target.value)} style={{ flex:1 }} />
                  <button type="button" className="btn btn-ghost" style={{ whiteSpace:"nowrap", padding:"0 12px" }} onClick={()=>setShowPass(v=>!v)}>
                    {showPass ? "Hide" : "Show"}
                  </button>
                </div>
              </FormField>
            )}
          </div>
          <div className="field-hint" style={{ marginTop:10 }}>
            <strong>Module Role</strong> = which system areas this user can access. <strong>Workflow Access</strong> = their role in the finance approval chain (auto-derived from their position).
          </div>
        </Modal>
      )}

      {createdCredentials && (
        <Modal title="Account Created" preventOverlayClose onClose={()=>setCreatedCredentials(null)}
          footer={<button className="btn btn-amber" onClick={()=>setCreatedCredentials(null)}>Done</button>}>
          <p style={{ color:"#475569", marginBottom:16 }}>
            The account for <strong>{createdCredentials.name}</strong> has been created. Share these login credentials with the user:
          </p>
          <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"16px 20px", marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <span style={{ color:"#64748b", fontSize:13 }}>Email</span>
              <span style={{ fontWeight:600, color:"#1e293b" }}>{createdCredentials.email}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#64748b", fontSize:13 }}>Password</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontWeight:600, color:"#1e293b", fontFamily:"monospace" }}>{createdCredentials.password}</span>
                <button className="btn btn-ghost" style={{ padding:"2px 10px", fontSize:12 }}
                  onClick={()=>{ navigator.clipboard.writeText(createdCredentials.password); showToast("Password copied!"); }}>
                  Copy
                </button>
              </div>
            </div>
          </div>
          <div style={{ background:"#fefce8", border:"1px solid #fde68a", borderRadius:6, padding:"10px 14px", fontSize:13, color:"#92400e" }}>
            The user must log in at <strong>{window.location.origin}</strong> — not localhost.
          </div>
        </Modal>
      )}
    </div>
  );
}

// â"€â"€ Activity Logs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function BudgetManagement({ projects, requests, onSaveProject, onDeleteProject, onSaveActivity, onDeleteActivity }) {
  const [search, setSearch] = useState("");
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [projectForm, setProjectForm] = useState({ name:"", donorName:"", totalBudget:"" });
  const [activityForm, setActivityForm] = useState({ projectId:"", name:"", code:"", budgetAmount:"" });
  const [toast, setToast] = useState(null);
  const [errors, setErrors] = useState({});

  const showToast = (message, tone="green") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3000);
  };

  const reportData = buildBudgetReportData(projects, requests, "", "");
  const projectSummaries = new Map(reportData.projectRows.map(project => [project.id, project]));

  const openProjectModal = (project=null) => {
    setEditingProject(project);
    setErrors({});
    setProjectForm(project
      ? { name: project.name, donorName: project.donorName, totalBudget: project.totalBudget }
      : { name:"", donorName:"", totalBudget:"" }
    );
    setShowProjectModal(true);
  };

  const openActivityModal = (projectId, activity=null) => {
    setEditingActivity(activity ? { ...activity, projectId } : null);
    setErrors({});
    setActivityForm(activity
      ? { projectId, name: activity.name, code: activity.code, budgetAmount: activity.budgetAmount }
      : { projectId, name:"", code:"", budgetAmount:"" }
    );
    setShowActivityModal(true);
  };

  const saveProject = () => {
    const nextErrors = {};
    if (!projectForm.name.trim()) nextErrors.projectName = "Project name is required";
    if (!projectForm.donorName.trim()) nextErrors.donorName = "Donor name is required";
    if (toNumber(projectForm.totalBudget) <= 0) nextErrors.totalBudget = "Enter a valid project budget";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const result = onSaveProject(projectForm, editingProject);
    if (!result?.ok) {
      setErrors({ form: result?.message || "Unable to save project" });
      return;
    }
    setShowProjectModal(false);
    setEditingProject(null);
    showToast(result.message);
  };

  const saveActivity = () => {
    const nextErrors = {};
    if (!activityForm.projectId) nextErrors.projectId = "Select a project";
    if (!activityForm.name.trim()) nextErrors.activityName = "Activity name is required";
    if (!activityForm.code.trim()) nextErrors.code = "Activity code is required";
    if (toNumber(activityForm.budgetAmount) <= 0) nextErrors.budgetAmount = "Enter a valid activity budget";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const result = onSaveActivity(activityForm.projectId, activityForm, editingActivity);
    if (!result?.ok) {
      setErrors({ form: result?.message || "Unable to save activity" });
      return;
    }
    setShowActivityModal(false);
    setEditingActivity(null);
    showToast(result.message);
  };

  const filteredProjects = projects.filter(project => {
    if (!search) return true;
    const term = search.toLowerCase();
    return project.name.toLowerCase().includes(term) ||
      project.donorName.toLowerCase().includes(term) ||
      project.activities.some(activity => activity.name.toLowerCase().includes(term) || activity.code.toLowerCase().includes(term));
  });

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Project Budgets</div>
          <div className="page-sub">{projects.length} project{projects.length !== 1 ? "s" : ""} configured for budget control</div>
        </div>
        <button className="btn btn-amber" onClick={() => openProjectModal()}>Add Project Budget</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-val">{projects.length}</div>
          <div className="stat-label">Projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{projects.reduce((sum, project) => sum + project.activities.length, 0)}</div>
          <div className="stat-label">Activities</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{fmtAmt(projects.reduce((sum, project) => sum + toNumber(project.totalBudget), 0))}</div>
          <div className="stat-label">Total Project Budgets</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{fmtAmt(reportData.approvedConcepts.reduce((sum, request) => sum + toNumber(request.amount), 0))}</div>
          <div className="stat-label">Committed Against Budgets</div>
        </div>
      </div>

      <div className="filters" style={{ marginBottom:16 }}>
        <input className="f-input" placeholder="Search projects or activities..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {toast && <div className={`alert alert-${toast.tone}`}>{toast.message}</div>}

      {filteredProjects.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-text">{projects.length === 0 ? "No budgets configured yet" : "No matching projects found"}</div>
            <div className="empty-sub">Projects and activities added here will drive concept note budget validation.</div>
          </div>
        </div>
      ) : (
        <div className="budget-project-grid">
          {filteredProjects.map(project => {
            const summary = projectSummaries.get(project.id) || { allocated:0, remaining:toNumber(project.totalBudget) };
            return (
              <div key={project.id} className="card budget-project-card">
                <div className="card-header">
                  <div>
                    <div className="card-title">{project.name}</div>
                    <div className="page-sub" style={{ marginTop:4 }}>{project.donorName}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => openProjectModal(project)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openActivityModal(project.id)}>Add Activity</button>
                    <button className="btn btn-red btn-sm" onClick={() => {
                      const result = onDeleteProject(project);
                      showToast(result?.message || "Project removed", result?.ok === false ? "red" : "green");
                    }}>Delete</button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="budget-stats" style={{ marginBottom:18 }}>
                    <div className="budget-stat">
                      <span className="budget-stat-label">Total Budget</span>
                      <strong>{fmtAmt(project.totalBudget)}</strong>
                    </div>
                    <div className="budget-stat">
                      <span className="budget-stat-label">Allocated</span>
                      <strong>{fmtAmt(summary.allocated)}</strong>
                    </div>
                    <div className="budget-stat">
                      <span className="budget-stat-label">Remaining</span>
                      <strong>{fmtAmt(summary.remaining)}</strong>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Activity</th><th>Code</th><th>Budget</th><th>Used</th><th>Remaining</th><th></th></tr></thead>
                      <tbody>
                        {project.activities.length === 0 ? (
                          <tr><td colSpan="6" className="text-gray">No activities added yet.</td></tr>
                        ) : project.activities.map(activity => {
                          const used = getActivityUsedAmount(requests, activity.code);
                          const remaining = toNumber(activity.budgetAmount) - used;
                          return (
                            <tr key={activity.id}>
                              <td style={{ fontWeight:600 }}>{activity.name}</td>
                              <td><span className="ref">{activity.code}</span></td>
                              <td>{fmtAmt(activity.budgetAmount)}</td>
                              <td>{fmtAmt(used)}</td>
                              <td>{fmtAmt(remaining)}</td>
                              <td>
                                <div className="flex gap-2">
                                  <button className="btn btn-ghost btn-sm" onClick={() => openActivityModal(project.id, activity)}>Edit</button>
                                  <button className="btn btn-red btn-sm" onClick={() => {
                                    const result = onDeleteActivity(project.id, activity);
                                    showToast(result?.message || "Activity removed", result?.ok === false ? "red" : "green");
                                  }}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showProjectModal && (
        <Modal title={editingProject ? "Edit Project Budget" : "Add Project Budget"} onClose={() => { setShowProjectModal(false); setEditingProject(null); setErrors({}); }}>
          {errors.form && <div className="alert alert-red">{errors.form}</div>}
          <div className="form-grid">
            <FormField label="Project Name" error={errors.projectName}>
              <input value={projectForm.name} onChange={e=>setProjectForm(current => ({ ...current, name:e.target.value }))} placeholder="Project name" />
            </FormField>
            <FormField label="Donor *" error={errors.donorName}>
              <input value={projectForm.donorName} onChange={e=>setProjectForm(current => ({ ...current, donorName:e.target.value }))} placeholder="Donor or funding partner" />
            </FormField>
            <FormField label="Total Project Budget (UGX)" error={errors.totalBudget} full>
              <input type="number" value={projectForm.totalBudget} onChange={e=>setProjectForm(current => ({ ...current, totalBudget:e.target.value }))} placeholder="0" />
            </FormField>
          </div>
          <div className="modal-footer" style={{ padding:"15px 0 0", borderTop:"none" }}>
            <button className="btn btn-ghost" onClick={() => { setShowProjectModal(false); setEditingProject(null); }}>Cancel</button>
            <button className="btn btn-amber" onClick={saveProject}>Save Project</button>
          </div>
        </Modal>
      )}

      {showActivityModal && (
        <Modal title={editingActivity ? "Edit Activity Budget" : "Add Activity Budget"} onClose={() => { setShowActivityModal(false); setEditingActivity(null); setErrors({}); }}>
          {errors.form && <div className="alert alert-red">{errors.form}</div>}
          <div className="form-grid">
            <FormField label="Project" error={errors.projectId} full>
              <select value={activityForm.projectId} onChange={e=>setActivityForm(current => ({ ...current, projectId:e.target.value }))} disabled={!!editingActivity}>
                <option value="">Select project</option>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </FormField>
            <FormField label="Activity Name" error={errors.activityName}>
              <input value={activityForm.name} onChange={e=>setActivityForm(current => ({ ...current, name:e.target.value }))} placeholder="Activity name" />
            </FormField>
            <FormField label="Activity Code" error={errors.code}>
              <input value={activityForm.code} onChange={e=>setActivityForm(current => ({ ...current, code:e.target.value.toUpperCase() }))} placeholder="Unique code" />
            </FormField>
            <FormField label="Activity Budget Amount (UGX)" error={errors.budgetAmount} full>
              <input type="number" value={activityForm.budgetAmount} onChange={e=>setActivityForm(current => ({ ...current, budgetAmount:e.target.value }))} placeholder="0" />
            </FormField>
          </div>
          <div className="modal-footer" style={{ padding:"15px 0 0", borderTop:"none" }}>
            <button className="btn btn-ghost" onClick={() => { setShowActivityModal(false); setEditingActivity(null); }}>Cancel</button>
            <button className="btn btn-amber" onClick={saveActivity}>Save Activity</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BudgetReportModal({ projects, requests, selectedProjectId, fromDate, toDate, reportType, onClose }) {
  const reportData = buildPaidFinancialReportData(projects, requests, selectedProjectId, fromDate, toDate);
  const selectedProject = projects.find(project => project.id === selectedProjectId) || null;
  const reportTitle = reportType === "paid_items" ? "Paid Items Report" : "Accounted Summary Report";
  return (
    <Modal title={reportTitle} onClose={onClose} size="modal-lg"
      footer={
        <div className="flex gap-3 items-center">
          <span className="text-xs text-gray">Use Ctrl+P / Cmd+P to save as PDF</span>
          <button className="btn btn-primary" onClick={() => window.print()}><AppButtonIcon name="download" tone="navy" />Download PDF</button>
        </div>
      }>
      <div className="pdf-doc">
        <div className="report-header">
          <div className="report-brand">
            <img src={inspireLogo} alt="Inspire Youth For Development logo" />
            <div>
              <div className="pdf-logo">{ORG_NAME}</div>
              <div className="text-xs text-gray">{reportTitle}</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="text-xs text-gray">Generated {fmt(ts())}</div>
            <div className="text-xs text-gray" style={{ marginTop:4 }}>
              Project: {selectedProject?.name || "All Projects"}
            </div>
            <div className="text-xs text-gray" style={{ marginTop:4 }}>
              Period: {fromDate || "Start"} to {toDate || "Now"}
            </div>
          </div>
        </div>

        {reportType === "paid_items" ? (
          <div className="pdf-sec">
            <div className="pdf-sec-title">Paid Items</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date of Payment</th><th>Vendor / Payee</th><th>Reference ID</th><th>Amount Paid</th><th>Project Name</th></tr></thead>
                <tbody>
                  {reportData.paidItems.length === 0 ? (
                    <tr><td colSpan="5" className="text-gray">No paid transactions found for the selected filters.</td></tr>
                  ) : reportData.paidItems.map(item => (
                    <tr key={`${item.id}-${item.paymentReference}`}>
                      <td>{fmt(item.paymentDate)}</td>
                      <td>{item.payee}</td>
                      <td><span className="ref">{item.paymentReference}</span></td>
                      <td>{fmtAmt(item.amountPaid)}</td>
                      <td>{item.projectName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="pdf-sec">
            <div className="pdf-sec-title">Accounted Summary</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Project Name</th><th>Total Project Budget</th><th>Total Amount Spent</th><th>Remaining Balance</th></tr></thead>
                <tbody>
                  {reportData.summaryRows.length === 0 ? (
                    <tr><td colSpan="4" className="text-gray">No project records found for the selected filters.</td></tr>
                  ) : reportData.summaryRows.map(row => (
                    <tr key={row.projectId}>
                      <td>{row.projectName}</td>
                      <td>{fmtAmt(row.totalProjectBudget)}</td>
                      <td>{fmtAmt(row.totalSpent)}</td>
                      <td>{fmtAmt(row.remainingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function FinancialReports({ projects, requests }) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(toDateInputValue(ts()));
  const [reportType, setReportType] = useState("paid_items");
  const [showReport, setShowReport] = useState(false);
  const reportData = buildPaidFinancialReportData(projects, requests, selectedProjectId, fromDate, toDate);
  const selectedProject = projects.find(project => project.id === selectedProjectId) || null;

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Financial Reports</div>
          <div className="page-sub">Paid-only project reporting with transaction detail and accountable budget summaries by project.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowReport(true)}><AppButtonIcon name="download" tone="navy" />Download PDF</button>
      </div>

      <div className="card" style={{ marginBottom:18 }}>
        <div className="card-body">
          <div className="form-grid">
            <FormField label="Report Type">
              <select value={reportType} onChange={e=>setReportType(e.target.value)}>
                <option value="paid_items">Paid Items</option>
                <option value="accounted_summary">Accounted Summary</option>
              </select>
            </FormField>
            <FormField label="Select Project">
              <select value={selectedProjectId} onChange={e=>setSelectedProjectId(e.target.value)}>
                <option value="">All Projects</option>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </FormField>
            <FormField label="From Date">
              <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} />
            </FormField>
            <FormField label="To Date">
              <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} />
            </FormField>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-val">{reportData.totals.projectsCount}</div>
          <div className="stat-label">Projects in Scope</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{reportData.totals.paidItemsCount}</div>
          <div className="stat-label">Paid Transactions</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{selectedProject ? 1 : projects.length}</div>
          <div className="stat-label">{selectedProject ? "Selected Project" : "Projects Available"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{fmtAmt(reportData.totals.totalSpent)}</div>
          <div className="stat-label">Total Spent</div>
        </div>
      </div>

      {reportType === "paid_items" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Paid Items Report</div>
              <div className="page-sub" style={{ marginTop:4 }}>Transaction-level view using only paid requests within the selected date range.</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowReport(true)}><AppButtonIcon name="download" tone="navy" />Download PDF</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date of Payment</th><th>Vendor / Payee</th><th>Reference ID</th><th>Amount Paid</th><th>Project Name</th></tr></thead>
              <tbody>
                {reportData.paidItems.length === 0 ? (
                  <tr><td colSpan="5" className="text-gray">No paid transactions found for the selected filters.</td></tr>
                ) : reportData.paidItems.map(item => (
                  <tr key={`${item.id}-${item.paymentReference}`}>
                    <td>{fmt(item.paymentDate)}</td>
                    <td>{item.payee}</td>
                    <td><span className="ref">{item.paymentReference}</span></td>
                    <td>{fmtAmt(item.amountPaid)}</td>
                    <td>{item.projectName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Accounted Summary Report</div>
              <div className="page-sub" style={{ marginTop:4 }}>Project-level summary showing budget, paid spending in period, and remaining balance.</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowReport(true)}><AppButtonIcon name="download" tone="navy" />Download PDF</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Project Name</th><th>Total Project Budget</th><th>Total Amount Spent</th><th>Remaining Balance</th></tr></thead>
              <tbody>
                {reportData.summaryRows.length === 0 ? (
                  <tr><td colSpan="4" className="text-gray">No project records found for the selected filters.</td></tr>
                ) : reportData.summaryRows.map(row => (
                  <tr key={row.projectId}>
                    <td>{row.projectName}</td>
                    <td>{fmtAmt(row.totalProjectBudget)}</td>
                    <td>{fmtAmt(row.totalSpent)}</td>
                    <td>{fmtAmt(row.remainingBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showReport && (
        <BudgetReportModal
          projects={projects}
          requests={requests}
          selectedProjectId={selectedProjectId}
          fromDate={fromDate}
          toDate={toDate}
          reportType={reportType}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

function ActivityLogs() {
  const [search, setSearch] = useState("");
  const logs = [..._logs].sort((a,b)=>new Date(b.at)-new Date(a.at));
  const filtered = logs.filter(l => !search || l.action.toLowerCase().includes(search.toLowerCase()) || l.requestId.toLowerCase().includes(search.toLowerCase()) || (_users.find(u=>u.id===l.userId)?.name||"").toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Activity Logs</div>
          <div className="page-sub">{logs.length} total events</div>
        </div>
      </div>
      <div className="filters" style={{ marginBottom:16 }}>
        <input className="f-input" placeholder="Filter events..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="card">
        {filtered.length===0 ? (
          <div className="empty-state"><div className="empty-icon"><IconBadge name="logs" tone="violet" size={22} /></div><div className="empty-text">No activity yet</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Request</th><th>Action</th><th>User</th><th>Role</th><th>Note</th></tr></thead>
              <tbody>
                {filtered.map(l=>{
                  const u = _users.find(x=>x.id===l.userId);
                  const isRej = l.action.toLowerCase().includes("reject");
                  const isApp = l.action.toLowerCase().includes("approv");
                  return (
                    <tr key={l.id}>
                      <td className="text-sm text-gray">{fmt(l.at)}</td>
                      <td><span className="ref">{l.requestId}</span></td>
                      <td>
                        <span style={{ color:isRej?"var(--red)":isApp?"var(--green)":"var(--g700)", fontWeight:500, fontSize:13 }}>
                          {isRej ? "Rejected: " : isApp ? "Approved: " : ""}{l.action}
                        </span>
                      </td>
                      <td style={{ fontWeight:500 }}>{u?.name||"-"}</td>
                      <td className="text-gray text-sm">{ROLE_LABELS[u?.role]||"-"}</td>
                      <td className="text-sm text-gray">{l.note||"-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// â"€â"€ Main App â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export default function App() {
  const [user,        setUser]        = useState(null);
  const [authChecked,        setAuthChecked]        = useState(false);
  const [passwordRecovery,   setPasswordRecovery]   = useState(false);
  const [page,               setPageState]          = useState("home");
  const [projects,    setProjects]    = useState([]);
  const [requests,    setRequests]    = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; } catch { return false; }
  });
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v;
      try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
      return next;
    });
  }, []);
  const [, setNotifTick] = useState(0);
  const bumpNotifTick = useCallback(() => setNotifTick(t => t + 1), []);
  const pageHistoryRef = useRef([]);

  const setPage = useCallback((nextPage, options={}) => {
    const { replaceHistory=false } = options;
    setPageState(currentPage => {
      if (currentPage === nextPage) return currentPage;
      if (!replaceHistory) {
        const history = pageHistoryRef.current;
        if (history[history.length - 1] !== currentPage) history.push(currentPage);
      }
      return nextPage;
    });
  }, []);

  const goBack = useCallback(() => {
    const history = pageHistoryRef.current;
    while (history.length) {
      const previousPage = history.pop();
      if (previousPage && previousPage !== page) {
        setPageState(previousPage);
        return;
      }
    }
  }, [page]);

  const refresh = useCallback(() => {
    loadState();
    setProjects([..._projects]);
    setRequests([..._requests]);
  }, []);
  const syncState = useCallback(() => {
    saveState();
    refresh();
  }, [refresh]);

  // Centralised handlers â€" all state mutations flow through here
  const handleApprove = useCallback((r) => {
    const prevStatus = r.status;
    approveRequest(r, user);
    syncState();
    const requester = _users.find(u => u.id === r.requesterId);
    // Email requester with stage-specific context
    if (requester?.email) {
      notifyFinanceStageUpdate(
        { id: r.id, title: r.title, amount: r.amount, requesterName: r.requesterName },
        { name: requester.name, email: requester.email },
        user.name,
        r.status
      ).catch(e => console.warn("[email] finance stage:", e.message));
    }
    // Email the next approver in the chain
    const nextRoleMap = {
      pending_accountant:         "accountant",
      pending_finance:            "finance_manager",
      pending_executive_director: "executive_director",
      approved:                   "payment_accountant",
    };
    const nextRole = nextRoleMap[r.status];
    if (nextRole) {
      const nextApprover = _users.find(u => u.role === nextRole && u.isActive !== false);
      if (nextApprover?.email) {
        notifyNextApproverFinance(
          { id: r.id, title: r.title, amount: r.amount, requesterName: r.requesterName, requesterEmail: requester?.email },
          { name: nextApprover.name, email: nextApprover.email },
          user.name
        ).catch(e => console.warn("[email] next approver:", e.message));
      }
    }
    const newApproval = r.approvals[r.approvals.length - 1];
    supabase.from("requests").update({ status: r.status }).eq("request_number", r.id).select("id").single()
      .then(({ data, error }) => {
        if (error) { console.warn("Could not update request status:", error.message); return; }
        supabase.from("request_approvals").insert({
          request_id:     data.id,
          approver_id:    newApproval.userId,
          stage:          newApproval.stage,
          action:         newApproval.decision,
          comment:        newApproval.note || null,
          acted_at:       newApproval.at,
          signature_data: newApproval.signature || null,
        }).then(({ error: e2 }) => { if (e2) console.warn("Could not save approval:", e2.message); });
      });
  }, [user, syncState]);
  const handleReject  = useCallback((r, reason) => {
    rejectRequest(r, user, reason);
    syncState();
    const requester = _users.find(u => u.id === r.requesterId);
    if (requester?.email) {
      notifyFinanceStageUpdate(
        { id: r.id, title: r.title, amount: r.amount, requesterName: r.requesterName },
        { name: requester.name, email: requester.email },
        user.name,
        r.status,
        reason
      ).catch(e => console.warn("[email] finance reject:", e.message));
    }
    const newApproval = r.approvals[r.approvals.length - 1];
    supabase.from("requests").update({ status: r.status, supporting_docs: { ...r.supporting_docs, lastRejectionReason: reason } }).eq("request_number", r.id).select("id").single()
      .then(({ data, error }) => {
        if (error) { console.warn("Could not update request status:", error.message); return; }
        supabase.from("request_approvals").insert({
          request_id:     data.id,
          approver_id:    newApproval.userId,
          stage:          newApproval.stage,
          action:         newApproval.decision,
          comment:        newApproval.note || null,
          acted_at:       newApproval.at,
          signature_data: newApproval.signature || null,
        }).then(({ error: e2 }) => { if (e2) console.warn("Could not save rejection:", e2.message); });
      });
  }, [user, syncState]);
  const handlePay     = useCallback((r, ref, date) => {
    const result = payRequest(r, user, ref, date);
    if (result.ok) {
      syncState();
      supabase.from("requests").update({ status: r.status }).eq("request_number", r.id)
        .then(({ error }) => { if (error) console.warn("Could not update payment status:", error.message); });
      const requester = _users.find(u => u.id === r.requesterId);
      if (requester?.email) {
        notifyPaymentReceived(
          { id: r.id, title: r.title, amount: r.amount },
          { name: requester.name, email: requester.email },
          ref,
          date
        ).catch(e => console.warn("[email] payment notify:", e.message));
      }
    }
    return result;
  }, [user, syncState]);
  const handleSaveUserSignature = useCallback((signature) => {
    const target = _users.find(item => item.id === user.id);
    if (!target) return;
    target.eSignature = normalizeSignatureValue(signature);
    saveState();
    setUser({ ...target });
    refresh();
  }, [user, refresh]);

  const handleSendToFinance = useCallback((procRecord) => {
    try {
      const procUser = _users.find(u => u.id === procRecord.requestedById) || _users.find(u => u.role === "procurement_officer") || user;
      const supervisor = getAssignedSupervisor(procUser) || getFallbackSupervisor(procUser.id);
      const vendor = procRecord.selectedServiceProvider || procRecord.supplierList?.[0]?.name || "Vendor";
      const amount = toNumber(procRecord.totalCost || procRecord.agreedPrice || procRecord.estimatedBudget || 0);
      const id = `REQ-${String(_nextId++).padStart(4,"0")}`;
      const project = _projects.find(p => p.activities?.some(a => a.code === procRecord.activityCode));
      const activity = project?.activities?.find(a => a.code === procRecord.activityCode);
      const req = {
        id,
        isVendorPayment: true,
        procurementId: procRecord.id,
        title: `Vendor Payment – ${vendor} (${procRecord.id})`,
        description: `Vendor payment for ${procRecord.itemDescription || procRecord.title || procRecord.id}. LPO/PO: ${procRecord.purchaseDocument?.lpoNumber || procRecord.lpoNumber || "N/A"}. Vendor: ${vendor}.`,
        department: procUser.dept || "Procurement",
        amount,
        activityCode: procRecord.activityCode || "",
        activityId: activity?.id || "",
        activityName: activity?.name || "",
        activityBudget: activity?.budgetAmount || 0,
        projectId: project?.id || "",
        projectName: project?.name || "",
        donorName: project?.donorName || "",
        requesterId: procUser.id,
        requesterName: procUser.name,
        requesterRole: procUser.role,
        requesterEmployeeId: null,
        supervisorId: supervisor?.id || null,
        supervisorName: supervisor?.name || "Unassigned",
        status: "pending_supervisor",
        createdAt: ts(),
        approvals: [],
        lastRejectionReason: null,
      };
      _requests.push(req);
      supabase.from("requests").insert({
        id:               crypto.randomUUID(),
        request_number:   id,
        requester_id:     req.requesterId || null,
        project_id:       req.projectId || null,
        activity_id:      req.activityId || null,
        department:       req.department,
        title:            req.title,
        description:      req.description,
        amount_requested: req.amount,
        request_type:     "vendor_payment",
        status:           req.status,
        submission_date:  new Date().toISOString().slice(0,10),
        supporting_docs:  buildRequestSupportingDocs(req),
      }).then(({ error }) => {
        if (error) console.warn("Could not save request to Supabase:", error.message);
      });
      addLog(id, procUser.id, `Vendor payment request created from procurement ${procRecord.id}`);
      if (supervisor) addNotif(supervisor.id, `Vendor payment approval needed: "${req.title}" from ${procUser.name} is awaiting your review.`, id);
      addNotif(procUser.id, `Vendor payment request ${id} created for ${vendor}. It is now in the finance approval queue.`, id);
      syncState();
      return { ok: true, financeRequestId: id };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }, [user, syncState]);

  const handleSubmitAccountability = useCallback((r, form) => {
    submitAccountability(r, user, form);
    syncState();
    supabase.from("requests").update({ status: r.status, supporting_docs: buildRequestSupportingDocs(r) }).eq("request_number", r.id)
      .then(({ error }) => { if (error) console.warn("Could not sync accountability submission:", error.message); });
  }, [user, syncState]);
  const handleApproveAccountability = useCallback((r) => {
    approveAccountability(r, user);
    syncState();
    supabase.from("requests").update({ status: r.status }).eq("request_number", r.id)
      .then(({ error }) => { if (error) console.warn("Could not update accountability status:", error.message); });
  }, [user, syncState]);
  const handleRejectAccountability = useCallback((r, reason) => {
    rejectAccountability(r, user, reason);
    syncState();
    supabase.from("requests").update({ status: r.status }).eq("request_number", r.id)
      .then(({ error }) => { if (error) console.warn("Could not update accountability status:", error.message); });
  }, [user, syncState]);
  const handleSaveProject = useCallback((form, editProject=null) => {
    const normalized = {
      name: form.name.trim(),
      donorName: form.donorName.trim(),
      totalBudget: toNumber(form.totalBudget),
    };
    const activityTotal = (editProject?.activities || []).reduce((sum, activity) => sum + toNumber(activity.budgetAmount), 0);
    if (normalized.totalBudget < activityTotal) {
      return { ok:false, message:"Project total budget cannot be lower than the sum of its activity budgets." };
    }
    if (editProject) {
      Object.assign(editProject, normalized);
      _requests.forEach(request => {
        if (request.projectId === editProject.id) {
          request.projectName = normalized.name;
          request.donorName = normalized.donorName;
        }
      });
      syncState();
      return { ok:true, message:`${normalized.name} updated` };
    }
    const newProjectId = crypto.randomUUID();
    _projects.push({
      id: newProjectId,
      createdAt: ts(),
      activities: [],
      ...normalized,
    });
    supabase.from("projects").insert({
      id:           newProjectId,
      name:         normalized.name,
      donor:        normalized.donorName,
      total_budget: normalized.totalBudget || 0,
      is_active:    true,
    }).then(({ error }) => {
      if (error) console.warn("Could not save project to Supabase:", error.message);
      else console.log("Project saved to Supabase:", normalized.name);
    });
    syncState();
    return { ok:true, message:`${normalized.name} added` };
  }, [syncState]);
  const handleDeleteProject = useCallback((project) => {
    const hasLinkedRequests = _requests.some(request => request.projectId === project.id);
    if (hasLinkedRequests) return { ok:false, message:"This project already has linked requests and cannot be deleted." };
    _projects = _projects.filter(item => item.id !== project.id);
    syncState();
    return { ok:true, message:`${project.name} deleted` };
  }, [syncState]);
  const handleSaveActivity = useCallback((projectId, form, editActivity=null) => {
    const project = _projects.find(item => item.id === projectId);
    if (!project) return { ok:false, message:"Selected project was not found." };
    const nextCode = form.code.trim().toUpperCase();
    const duplicate = _projects.some(item =>
      item.activities.some(activity =>
        activity.code === nextCode && (!editActivity || activity.id !== editActivity.id)
      )
    );
    if (duplicate) return { ok:false, message:"Activity code must be unique across the system." };
    const normalized = {
      name: form.name.trim(),
      code: nextCode,
      budgetAmount: toNumber(form.budgetAmount),
    };
    const committedActivityTotal = project.activities
      .filter(activity => !editActivity || activity.id !== editActivity.id)
      .reduce((sum, activity) => sum + toNumber(activity.budgetAmount), 0);
    if (committedActivityTotal + normalized.budgetAmount > toNumber(project.totalBudget)) {
      return { ok:false, message:"Total activity budgets cannot exceed the parent project budget." };
    }
    if (editActivity) {
      const target = project.activities.find(activity => activity.id === editActivity.id);
      if (!target) return { ok:false, message:"Activity could not be found." };
      const oldCode = target.code;
      const hasLinkedRequests = _requests.some(request => request.activityCode === editActivity.code);
      if (hasLinkedRequests && editActivity.code !== nextCode) {
        return { ok:false, message:"This activity code is already linked to requests and cannot be changed." };
      }
      Object.assign(target, normalized);
      _requests.forEach(request => {
        if (request.projectId === project.id && request.activityCode === oldCode) {
          request.activityName = normalized.name;
          request.activityCode = normalized.code;
          request.activityBudget = normalized.budgetAmount;
          request.projectName = project.name;
          request.donorName = project.donorName;
        }
      });
      syncState();
      return { ok:true, message:`${normalized.name} updated` };
    }
    const newActivityId = crypto.randomUUID();
    project.activities.push({
      id: newActivityId,
      ...normalized,
    });
    supabase.from("project_activities").insert({
      id:               newActivityId,
      project_id:       projectId,
      name:             normalized.name,
      budget_line:      normalized.code,
      allocated_amount: normalized.budgetAmount || 0,
    }).then(({ error }) => {
      if (error) console.warn("Could not save activity to Supabase:", error.message);
      else console.log("Activity saved to Supabase:", normalized.name);
    });
    syncState();
    return { ok:true, message:`${normalized.name} added` };
  }, [syncState]);
  const handleDeleteActivity = useCallback((projectId, activity) => {
    const project = _projects.find(item => item.id === projectId);
    if (!project) return { ok:false, message:"Project was not found." };
    const hasLinkedRequests = _requests.some(request => request.activityCode === activity.code);
    if (hasLinkedRequests) return { ok:false, message:"This activity is already linked to requests and cannot be deleted." };
    project.activities = project.activities.filter(item => item.id !== activity.id);
    syncState();
    return { ok:true, message:`${activity.name} deleted` };
  }, [syncState]);

  const handleSaveRequest = useCallback((form, submit, editReq=null) => {
    const supervisor = getAssignedSupervisor(user) || getFallbackSupervisor(user.id);
    const project = getProjectById(_projects, form.projectId);
    const activity = getActivityByCode(_projects, form.projectId, form.activityCode);
    const requesterSignature = getSavedUserSignature(user) || normalizeSignatureValue(form.signature);
    const requestPayload = {
      ...form,
      signature: requesterSignature,
      projectId: project?.id || form.projectId || "",
      projectName: project?.name || form.projectName || "",
      donorName: project?.donorName || form.donorName || "",
      activityId: activity?.id || form.activityId || "",
      activityName: activity?.name || form.activityName || "",
      activityCode: activity?.code || form.activityCode || "",
      activityBudget: activity?.budgetAmount || toNumber(form.activityBudget),
    };
    if (editReq) {
      Object.assign(editReq, requestPayload);
      editReq.supervisorId = supervisor?.id || null;
      editReq.supervisorName = supervisor?.name || "Unassigned";
      if (submit) {
        editReq.status = "pending_supervisor";
        editReq.lastRejectionReason = null;
        editReq.approvals = [];
        addLog(editReq.id, user.id, "Edited and Resubmitted");
        supabase.from("requests").update({
          status:           "pending_supervisor",
          title:            editReq.title,
          description:      editReq.description || null,
          amount_requested: editReq.amount || 0,
          supporting_docs:  buildRequestSupportingDocs(editReq),
        }).eq("request_number", editReq.id).then(({ error }) => {
          if (error) console.warn("Could not update resubmitted request in Supabase:", error.message);
        });
        if (supervisor) addNotif(supervisor.id, `Approval needed: Finance request "${editReq.title}" from ${user.name} has been resubmitted and is awaiting your review.`, editReq.id);
        if (supervisor?.email) notifyRequestSubmitted({ id: editReq.id, title: editReq.title, amount: editReq.amount, createdAt: ts(), requesterName: user.name, requesterEmail: user.email, isResubmission: true }, supervisor).catch(e => console.warn("[email]", e.message));
      }
    } else {
      const id  = `REQ-${String(_nextId++).padStart(4,"0")}`;
      const empRecord = _employees.find(e => e.email?.toLowerCase() === user.email?.toLowerCase());
      const req = {
        id, ...requestPayload,
        requesterId:          user.id,
        requesterName:        user.name,
        requesterRole:        user.role,
        requesterEmployeeId:  empRecord?.employeeId || null,
        supervisorId:         supervisor?.id || null,
        supervisorName:       supervisor?.name || "Unassigned",
        status:        submit ? "pending_supervisor" : "draft",
        createdAt:     ts(),
        approvals:     [],
        lastRejectionReason: null,
      };
      _requests.push(req);
      supabase.from("requests").insert({
        id:               crypto.randomUUID(),
        request_number:   id,
        requester_id:     req.requesterId || null,
        project_id:       req.projectId || null,
        activity_id:      req.activityId || null,
        department:       req.department || null,
        title:            req.title,
        description:      req.description || null,
        amount_requested: req.amount || 0,
        request_type:     "advance",
        status:           req.status,
        submission_date:  new Date().toISOString().slice(0, 10),
        supporting_docs:  buildRequestSupportingDocs(req),
      }).then(({ error }) => {
        if (error) console.warn("Could not save request to Supabase:", error.message);
      });
      addLog(id, user.id, submit ? "Submitted for approval" : "Saved as draft");
      if (submit) {
        if (supervisor) addNotif(supervisor.id, `Approval needed: Finance request "${form.title}" from ${user.name} has been submitted and is awaiting your review.`, id);
        if (supervisor?.email) notifyRequestSubmitted({ id, title: form.title, amount: form.amount, createdAt: ts(), requesterName: user.name, requesterEmail: user.email }, supervisor).catch(e => console.warn("[email]", e.message));
      }
    }
    syncState();
    if (submit) setPage("my_requests");
    else if (!editReq) setPage("my_drafts");
  }, [setPage, user, syncState]);

  const handleDeleteDraft = useCallback((draftId) => {
    const idx = _requests.findIndex(r => r.id === draftId);
    if (idx === -1) return;
    const req = _requests[idx];
    const isDeletable = req.status === "draft" || req.status.startsWith("rejected");
    if (!isDeletable) return;
    if (req.requesterId !== user.id && user.role !== "admin") return;
    _requests.splice(idx, 1);
    supabase.from("requests").delete().eq("request_number", draftId)
      .then(({ error }) => { if (error) console.warn("Could not delete request from Supabase:", error.message); });
    addLog(draftId, user.id, req.status === "draft" ? "Draft deleted" : "Rejected request deleted");
    syncState();
  }, [user, syncState]);

/*
  const handleSaveActivityPlan = useCallback((form, submit, editPlan=null) => {
    const normalizedBudgetRows = (form.budgetRows || []).map(row => createActivityBudgetRow({
      ...row,
      activityCode: String(row.activityCode || "").trim().toUpperCase(),
    }));
    const totalBudget = getActivityPlanBudgetTotal(normalizedBudgetRows);
    const now = ts();
    const nextStatus = submit || editPlan?.status === "submitted" ? "submitted" : "draft";
    const planPayload = normalizeActivityPlan({
      ...form,
      initiativeName: form.initiativeName.trim(),
      projectName: form.initiativeName.trim(),
      activityTitle: form.activityTitle.trim(),
      venue: form.venue.trim(),
      backgroundJustification: form.backgroundJustification.trim(),
      targetedParticipants: form.targetedParticipants.trim(),
      methodology: form.methodology.trim(),
      plannedOutputs: form.plannedOutputs.trim(),
      immediateOutcomes: form.immediateOutcomes.trim(),
      intermediateOutcomes: form.intermediateOutcomes.trim(),
      programQualityMarkers: form.programQualityMarkers.trim(),
      genderConsiderations: form.programQualityMarkers.trim(),
      inclusiveLeadership: "",
      communityResilience: "",
      budgetRows: normalizedBudgetRows,
      activityCode: getActivityPlanCodes({ budgetRows: normalizedBudgetRows })[0] || "",
      totalBudget,
      status: nextStatus,
      submittedAt: nextStatus === "submitted" ? (editPlan?.submittedAt || now) : null,
      lastUpdatedAt: now,
    });

    if (editPlan) {
      Object.assign(editPlan, planPayload);
      addLog(editPlan.id, user.id, nextStatus === "submitted" ? "Activity plan updated" : "Activity plan draft updated");
      if (nextStatus === "submitted") {
        _users
          .filter(u => ["admin","supervisor"].includes(u.role) && u.id !== user.id)
          .forEach(u => addNotif(u.id, `Activity plan submitted: ${planPayload.activityTitle}`, editPlan.id));
      }
      syncState();
      return { ok:true, message: nextStatus === "submitted" ? "Activity plan updated and available for review." : "Activity plan draft updated.", plan: editPlan };
    }

    const plan = {
      id: `ACT-${String(_nextActivityPlanId++).padStart(4,"0")}`,
      createdAt: now,
      createdById: user.id,
      createdByName: user.name,
      ...planPayload,
    };
    _activityPlans.push(plan);
    addLog(plan.id, user.id, nextStatus === "submitted" ? "Activity plan submitted" : "Activity plan saved as draft");
    if (nextStatus === "submitted") {
      _users
        .filter(u => ["admin","supervisor"].includes(u.role) && u.id !== user.id)
        .forEach(u => addNotif(u.id, `Activity plan submitted: ${plan.activityTitle}`, plan.id));
    }
    syncState();
    return { ok:true, message: nextStatus === "submitted" ? "Activity plan submitted successfully." : "Activity plan draft saved.", plan };
  }, [user, syncState]);
*/

  const handleLogin  = (u) => {
    loadState();
    setUser(_users.find(x => x.id === u.id) || u);
    pageHistoryRef.current = [];
    setPageState("home");
    refresh();
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
    pageHistoryRef.current = [];
    setUser(null);
    setPageState("home");
  };

  useEffect(() => {
    // Detect password recovery redirect (user clicked reset link in email)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setAuthChecked(true);
      }
    });
    loadState();
    fetchUsersFromDB().then(() => fetchProjectsFromDB()).then(() => fetchRequestsFromDB()).then(() => fetchEmployeesFromDB()).then(() => fetchLeaveApplicationsFromDB()).then(() => fetchNotificationsFromDB()).then(() => fetchMessagesFromDB()).then(() => fetchAnnouncementsFromDB()).then(() => {
      saveState();
      refresh();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) { setAuthChecked(true); return; }
        supabase.from("users").select("*").eq("auth_user_id", session.user.id).single()
          .then(({ data: profile }) => {
            if (profile?.is_active) {
              setUser({
                id:          profile.id,
                name:        profile.name,
                email:       profile.email,
                role:        profile.role,
                moduleRole:  profile.module_role,
                jobTitle:    profile.job_title,
                dept:        profile.department,
                avatar:      profile.avatar_initials,
                supervisorId: profile.supervisor_id,
                eSignature:  profile.e_signature,
                isActive:    profile.is_active,
              });
            }
            setAuthChecked(true);
          });
      });
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);
  useEffect(() => {
    if (!user) return undefined;
    const timer = window.setInterval(() => {
      refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);
  // Re-fetch leave applications + requests + notifications from DB every 15 s
  // so all users see changes made on other devices without a manual refresh.
  useEffect(() => {
    if (!user) return undefined;
    const timer = window.setInterval(async () => {
      await Promise.all([
        fetchLeaveApplicationsFromDB(),
        fetchRequestsFromDB(),
        fetchNotificationsFromDB(),
        fetchMessagesFromDB(),
        fetchAnnouncementsFromDB(),
      ]);
      saveState();
      refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);
  useEffect(() => {
    if (!user) return;
    const freshUser = _users.find(item => item.id === user.id);
    if (freshUser && (
      freshUser.role !== user.role ||
      getUserPosition(freshUser) !== getUserPosition(user) ||
      JSON.stringify(normalizeSignatureValue(freshUser.eSignature || null)) !== JSON.stringify(normalizeSignatureValue(user.eSignature || null))
    )) {
      setUser(freshUser);
    }
  }, [user, requests, projects]);

  const pendingCount =
    getPendingForRole(user?.role, requests, user?.id).length +
    getPendingAccountabilityForRole(user?.role, requests, user?.id).length;
  const paymentQueueCount = requests.filter(r =>
    ["approved","pending_payment_accountant","paid","pending_accountability","senior_accountant_approved"].includes(r.status)
  ).length;
  const pendingAccountabilityCount = user
    ? (["payment_accountant","admin"].includes(user.role)
        ? requests.filter(r => !r.isVendorPayment && ["paid","pending_accountability"].includes(r.status)).length
        : requests.filter(r => !r.isVendorPayment && r.requesterId === user.id && ["paid","pending_accountability"].includes(r.status)).length)
    : 0;
  const notifCount   = _notifications.filter(n=>n.userId===user?.id&&!n.read).length;
  const draftCount   = requests.filter(r=>r.requesterId===user?.id&&r.status==="draft").length;
  const messageUnreadCount = getUnreadMessagesCountForUser(user);
  const canGoBack = pageHistoryRef.current.length > 0;
  const chromeUserName = getWorkspaceChromeName(user, page);

  if (!authChecked) return (
    <>
      <style>{CSS}{`
        @keyframes ims-pulse {
          0%,100% { opacity:.35; transform:scale(1); }
          50%      { opacity:1;   transform:scale(1.06); }
        }
        @keyframes ims-dots {
          0%,80%,100% { opacity:.2; transform:translateY(0); }
          40%         { opacity:1;  transform:translateY(-4px); }
        }
        .ims-splash-logo {
          width:110px; height:110px;
          background:#fff; border-radius:26px;
          display:flex; align-items:center; justify-content:center;
          padding:14px;
          box-shadow:0 20px 60px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.08);
          animation:ims-pulse 2.4s ease-in-out infinite;
          margin-bottom:28px;
        }
        .ims-splash-logo img { width:100%; height:100%; object-fit:contain; }
        .ims-splash-name {
          font-family:'Roboto',system-ui,sans-serif;
          font-size:13px; font-weight:700; letter-spacing:.12em;
          text-transform:uppercase; color:rgba(255,255,255,.55);
          margin-bottom:32px;
        }
        .ims-splash-dots { display:flex; gap:7px; align-items:center; }
        .ims-splash-dot {
          width:7px; height:7px; border-radius:50%;
          background:#f59e0b;
          animation:ims-dots 1.3s ease-in-out infinite;
        }
        .ims-splash-dot:nth-child(2) { animation-delay:.18s; }
        .ims-splash-dot:nth-child(3) { animation-delay:.36s; }
        .ims-splash-loading {
          font-family:'Roboto',system-ui,sans-serif;
          font-size:12px; font-weight:500; letter-spacing:.08em;
          text-transform:uppercase; color:rgba(255,255,255,.35);
          margin-top:14px;
        }
      `}</style>
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"linear-gradient(160deg,#0a1e3d 0%,#0f2744 60%,#162e52 100%)" }}>
        <div className="ims-splash-logo">
          <img src={inspireLogo} alt="Inspire Youth For Development" />
        </div>
        <div className="ims-splash-name">Inspire Management System</div>
        <div className="ims-splash-dots">
          <div className="ims-splash-dot" />
          <div className="ims-splash-dot" />
          <div className="ims-splash-dot" />
        </div>
        <div className="ims-splash-loading">Loading</div>
      </div>
    </>
  );

  if (passwordRecovery) return (
    <>
      <style>{CSS}</style>
      <PasswordResetScreen onDone={() => { setPasswordRecovery(false); }} />
    </>
  );

  if (!user) return (
    <>
      <style>{CSS}</style>
      <LoginScreen onLogin={handleLogin} />
    </>
  );

  const PAGE_TITLES = {
    home:"Home",
    dashboard:"Finance Dashboard", admin_center:"Admin Center", new_request:"New Request", my_requests:"My Requests", my_drafts:"My Drafts",
    pending_approvals:"Pending Approvals", approval_history:"Approval History",
    payment_queue:"Payment Queue", pending_accountability:"Pending Accountability", paid_vouchers:"Paid Vouchers", notifications:"Notifications", financial_reports:"Financial Reports",
    my_signature:"My E-Signature",
    messages_center:"Messages Center",
    admin_users:"User Management", admin_budgets:"Project Budgets", admin_all_requests:"All Requests", admin_logs:"Activity Logs",
    procurement:"Procurement", executive_procurement:"Executive Approval",
    human_resource:"Human Resources", hr_staff_files:"Staff Files", hr_employees:"Employee Registry",
    hr_org_structure:"Organisational Structure", hr_departments:"Departments", hr_positions:"Positions",
    project_management:"Project Management", asset_management:"Asset Management",
    document_management:"Document Management", communication:"Communication",
  };
  const effectivePageRole = getEffectiveRoleForPage(user, page);
  const effectivePageUser = effectivePageRole && effectivePageRole !== user.role ? { ...user, role: effectivePageRole } : user;

  const renderPage = () => {
    if (page === "procurement" || page === "executive_procurement") {
      return <ProcurementRequisitionPage user={effectivePageUser} users={_users} projects={projects} onCreateNotification={addNotif} onSendToFinance={handleSendToFinance} />;
    }

    switch (page) {
      case "home":
        return <SystemHome setPage={setPage} user={user} />;

      case "dashboard":
        return <Dashboard user={user} requests={requests} setPage={setPage} draftCount={draftCount} />;

      case "admin_center":
        return <AdminDashboard requests={requests} users={_users} logs={_logs} projects={projects} setPage={setPage} />;

      case "new_request":
        return <NewRequestPage user={user} projects={projects} requests={requests} onSaveRequest={handleSaveRequest} onOpenSignatureSettings={()=>setPage("my_signature")} />;

      case "my_requests":
        return (
          <RequestsList user={user} requests={requests} title="My Requests"
            filterFn={r=>r.requesterId===user.id&&r.status!=="draft"}
            onApprove={handleApprove} onReject={handleReject} onPay={handlePay}
            onSaveEdit={(form,submit,editReq)=>handleSaveRequest(form,submit,editReq)}
            onDelete={handleDeleteDraft}
            onSubmitAccountability={handleSubmitAccountability}
            onApproveAccountability={handleApproveAccountability}
            onRejectAccountability={handleRejectAccountability}
            onOpenSignatureSettings={()=>setPage("my_signature")}
          />
        );

      case "my_drafts":
        return (
          <MyDrafts
            user={user} requests={requests}
            onSaveEdit={(form, submit, editReq) => handleSaveRequest(form, submit, editReq)}
            onDelete={handleDeleteDraft}
            setPage={setPage}
            onOpenSignatureSettings={() => setPage("my_signature")}
          />
        );

      case "pending_approvals":
        return <PendingApprovals user={user} requests={requests} onApprove={handleApprove} onReject={handleReject} onPay={handlePay} onSubmitAccountability={handleSubmitAccountability} onApproveAccountability={handleApproveAccountability} onRejectAccountability={handleRejectAccountability} />;

      case "approval_history":
        return (
          <RequestsList user={user} requests={requests} title="Approval History"
            filterFn={r=>r.approvals?.some(a=>a.userId===user.id) || r.paidById===user.id || r.accountability?.approvals?.some(a=>a.userId===user.id) || r.accountability?.retiredById===user.id}
            onApprove={handleApprove} onReject={handleReject} onPay={handlePay}
            onSaveEdit={(form,submit,editReq)=>handleSaveRequest(form,submit,editReq)}
            onSubmitAccountability={handleSubmitAccountability}
            onApproveAccountability={handleApproveAccountability}
            onRejectAccountability={handleRejectAccountability}
            onOpenSignatureSettings={()=>setPage("my_signature")}
          />
        );

      case "payment_queue":
        if (!hasDashboardAccess(user, "payment_queue")) return <Dashboard user={user} requests={requests} setPage={setPage} draftCount={draftCount} />;
        return <PaymentQueue user={effectivePageUser} requests={requests} onPay={handlePay} onApproveAccountability={handleApproveAccountability} onRejectAccountability={handleRejectAccountability} />;

      case "pending_accountability":
        return (
          <PendingAccountabilityPage
            user={user}
            requests={requests}
            onSubmitAccountability={handleSubmitAccountability}
            onApproveAccountability={handleApproveAccountability}
            onRejectAccountability={handleRejectAccountability}
          />
        );

      case "paid_vouchers":
        return <PaidVouchersPage user={user} requests={requests} />;

      case "notifications":
        return <Notifications user={user} setPage={setPage} onRead={bumpNotifTick} />;

      case "my_signature":
        return <MyESignaturePage user={user} onSaveSignature={handleSaveUserSignature} />;

      case "messages_center":
        return (
          <MessagesModule
            currentUser={user}
            users={_users}
            employees={_employees}
            departments={(_hrDepartments || []).map(item => item.name).filter(Boolean)}
            messages={_messages}
            announcements={getRelevantAnnouncementsForUser(user).map(item => ({ ...item, message:getAnnouncementDisplayMessage(item, user), visibleToCurrentUser:true }))}
            unreadCount={messageUnreadCount}
            allowedRecipientIds={getAllowedMessageRecipients(user).map(item => item.id)}
            canPublishAnnouncements={canPublishMessagesAnnouncement(user)}
            onSendMessage={(receiverId, text) => {
              const result = sendDirectMessage(user.id, receiverId, text);
              if (result.ok) syncState();
              return result;
            }}
            onSendAnnouncement={(scope, department, text) => {
              const result = sendAnnouncement(user.id, scope, department, text);
              if (result.ok) syncState();
              return result;
            }}
            onMarkConversationRead={(partnerId) => {
              if (markConversationRead(user.id, partnerId)) syncState();
            }}
            onMarkAnnouncementsRead={() => {
              if (markAnnouncementsRead(user.id)) syncState();
            }}
            onAcknowledgeAnnouncement={(announcementId) => {
              // Mark a specific announcement as acknowledged (uses same readBy mechanism)
              let changed = false;
              _announcements = _announcements.map(item => {
                if (item.id !== announcementId) return item;
                if (item.readBy?.includes(user.id)) return item;
                changed = true;
                const newReadBy = [...(item.readBy || []), user.id];
                supabase.from("announcements").update({ read_by: newReadBy }).eq("id", item.id)
                  .then(({ error }) => { if (error) console.warn("[ann-ack]", error.message); });
                return { ...item, readBy: newReadBy };
              });
              if (changed) syncState();
            }}
            onRefresh={async () => {
              await Promise.all([fetchMessagesFromDB(), fetchAnnouncementsFromDB(), fetchNotificationsFromDB()]);
              saveState();
              refresh();
            }}
          />
        );

      case "human_resource":
        return <HRHome setPage={setPage} user={user} />;

      case "hr_staff_files":
        if (!canAccessModule(user, "hr")) return <AccessDeniedPage title="HR Access Restricted" description="Staff files are available only to HR and Admin users." setPage={setPage} />;
        return <EmployeeRegistry onSystemChange={refresh} setPage={setPage} user={user} mode="files" />;

      case "hr_employees":
        if (!canAccessModule(user, "hr")) return <AccessDeniedPage title="HR Access Restricted" description="Employee records and staff files are available only to HR and Admin users." setPage={setPage} />;
        return <EmployeeRegistry onSystemChange={refresh} setPage={setPage} user={user} />;

      case "hr_org_structure":
        if (!canAccessModule(user, "hr")) return <AccessDeniedPage title="HR Access Restricted" description="Organisation structure is available only to HR and Admin users." setPage={setPage} />;
        return <OrgStructurePage setPage={setPage} />;

      case "hr_departments":
        if (!canAccessModule(user, "hr")) return <AccessDeniedPage title="HR Access Restricted" description="Department setup is available only to HR and Admin users." setPage={setPage} />;
        return <HRDepartmentManager onSystemChange={refresh} />;

      case "hr_positions":
        if (!canAccessModule(user, "hr")) return <AccessDeniedPage title="HR Access Restricted" description="HR positions are available only to HR and Admin users." setPage={setPage} />;
        return <HRPositionManager onSystemChange={refresh} />;

      case "hr_leave":
        return <HRLeaveHome setPage={setPage} user={user} />;

      case "leave_apply":
        return <LeaveApplicationPage user={user} setPage={setPage} />;

      case "my_leave":
        return <MyLeavePage user={user} setPage={setPage} />;

      case "hr_leave_manage":
        if (!canAccessLeaveManagement(user)) return <AccessDeniedPage title="HR Access Restricted" description="This leave approval area is available only to HR, Admin, Supervisors, and the Executive Director." setPage={setPage} />;
        return <HRLeaveManagement user={user} setPage={setPage} />;

      case "hr_users":
        if (!canAccessModule(user, "hr")) return <AccessDeniedPage title="HR Access Restricted" description="HR user account management is available only to HR and Admin users." setPage={setPage} />;
        return <UserManagement currentUserId={user.id} onSystemChange={refresh} />;

      case "users":
      case "admin_users":
        return <UserManagement currentUserId={user.id} onSystemChange={refresh} />;

      case "budgets":
      case "admin_budgets":
        return <BudgetManagement projects={projects} requests={requests} onSaveProject={handleSaveProject} onDeleteProject={handleDeleteProject} onSaveActivity={handleSaveActivity} onDeleteActivity={handleDeleteActivity} />;

      case "financial_reports":
        if (!hasDashboardAccess(user, "financial_reports")) return <Dashboard user={user} requests={requests} setPage={setPage} draftCount={draftCount} />;
        return <FinancialReports projects={projects} requests={requests} />;

      case "all_requests":
      case "admin_all_requests": {
        const restrictedRoles = ["payment_accountant","executive_director"];
        const allReqFilter = restrictedRoles.includes(user.role)
          ? r => r.status !== "draft"
          : undefined;
        return (
          <RequestsList user={user} requests={requests} title="All Requests"
            filterFn={allReqFilter}
            onApprove={handleApprove} onReject={handleReject} onPay={handlePay}
            onSaveEdit={(form,submit,editReq)=>handleSaveRequest(form,submit,editReq)}
            onDelete={handleDeleteDraft}
            onSubmitAccountability={handleSubmitAccountability}
            onApproveAccountability={handleApproveAccountability}
            onRejectAccountability={handleRejectAccountability}
            onOpenSignatureSettings={()=>setPage("my_signature")}
          />
        );
      }

      case "logs":
      case "admin_logs":
        return <ActivityLogs />;

      case "project_management":
        return <ModulePlaceholderPage icon="pm" tone="blue" title="Project Management" description="This module entry point is ready for future project planning and delivery workflows while the current ERP continues to run unchanged under Finance." />;

      case "asset_management":
        return <ModulePlaceholderPage icon="ast" tone="navy" title="Asset Management" description="This module entry point is ready for future asset registration and tracking workflows while the current ERP continues to run unchanged under Finance." />;

      case "document_management":
        return <ModulePlaceholderPage icon="doc" tone="blue" title="Document Management" description="This module entry point is ready for future document storage and approval workflows while the current ERP continues to run unchanged under Finance." />;

      case "communication":
        return <ModulePlaceholderPage icon="com" tone="teal" title="Communication" description="This module entry point is ready for future communication workflows while the current ERP continues to run unchanged under Finance." />;

      default:
        return <SystemHome setPage={setPage} user={user} />;
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="layout">
        <Sidebar user={user} page={page} setPage={setPage} pendingCount={pendingCount} notifCount={notifCount} paymentQueueCount={paymentQueueCount} pendingAccountabilityCount={pendingAccountabilityCount} draftCount={draftCount} onLogout={handleLogout} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapsed} />
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className={`main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
          <div className="topbar">
            <div className="topbar-title-wrap">
              <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              {page !== "home" && (
                <button className="topbar-back-btn" onClick={goBack} disabled={!canGoBack} title={canGoBack ? "Go back to previous page" : "No previous page"}>
                  <AppButtonIcon name="back" tone="blue" size={13} />
                  <span>Back</span>
                </button>
              )}
              <div className="topbar-title">{PAGE_TITLES[page]||"Dashboard"}</div>
            </div>
            <div className="topbar-actions">
              <div className="notif-btn" onClick={()=>setPage("notifications")} title="Notifications" style={{ position:"relative" }}>
                <AppButtonIcon name="notification" tone="teal" size={14} />
                {notifCount>0&&(
                  <span style={{
                    position:"absolute",
                    top:-4,
                    right:-4,
                    minWidth:18,
                    height:18,
                    padding:"0 5px",
                    borderRadius:999,
                    background:"linear-gradient(145deg,#fb7185 0%,#dc2626 100%)",
                    color:"#fff",
                    display:"inline-flex",
                    alignItems:"center",
                    justifyContent:"center",
                    fontSize:10,
                    fontWeight:800,
                    boxShadow:"0 10px 18px rgba(220,38,38,.24)",
                    border:"2px solid #fff",
                  }}>
                    {notifCount > 99 ? "99+" : notifCount}
                  </span>
                )}
              </div>
              <div className="notif-btn" onClick={()=>setPage("messages_center")} title="Messages" style={{ position:"relative" }}>
                <AppButtonIcon name="com" tone="blue" size={14} />
                {messageUnreadCount>0&&(
                  <span style={{
                    position:"absolute",
                    top:-4,
                    right:-4,
                    minWidth:18,
                    height:18,
                    padding:"0 5px",
                    borderRadius:999,
                    background:"linear-gradient(145deg,#fb7185 0%,#dc2626 100%)",
                    color:"#fff",
                    display:"inline-flex",
                    alignItems:"center",
                    justifyContent:"center",
                    fontSize:10,
                    fontWeight:800,
                    boxShadow:"0 10px 18px rgba(220,38,38,.24)",
                    border:"2px solid #fff",
                  }}>
                    {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
                  </span>
                )}
              </div>
              <Avatar str={user.avatar} />
              <div style={{ marginLeft:4 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--g800)" }}>{chromeUserName}</div>
                <div style={{ fontSize:11, color:"var(--g500)" }}>{getUserPosition(user)}</div>
              </div>
            </div>
          </div>
          {renderPage()}
        </div>
      </div>
    </>
  );
}

