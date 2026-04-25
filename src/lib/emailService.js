// ── Email Notification Service ────────────────────────────────────────────────
// Calls the send-email Supabase Edge Function which routes via Microsoft Graph.
// All functions are fire-and-forget — failures are logged but never thrown.

import { supabase } from "./supabaseClient.js";

const APP_URL    = import.meta.env.VITE_APP_URL || window.location.origin;
const LOGO_URL   = "https://inspireyouthdev.org/wp-content/uploads/2024/10/cropped-Asset-260.png";
const BRAND_NAVY = "#0a1e3d";
const BRAND_GOLD = "#f59e0b";

// ── HTML template shell ───────────────────────────────────────────────────────

function emailShell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

      <!-- Header -->
      <tr>
        <td style="background:${BRAND_NAVY};padding:32px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="IYD Logo" width="64"
               style="border-radius:14px;background:#fff;padding:8px;display:block;margin:0 auto 16px;">
          <div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px;">
            Inspire Management System
          </div>
          <div style="color:rgba(255,255,255,.55);font-size:11px;letter-spacing:.08em;text-transform:uppercase;">
            Inspire Youth For Development
          </div>
        </td>
      </tr>

      <!-- Title bar -->
      <tr>
        <td style="background:${BRAND_GOLD};padding:12px 40px;">
          <div style="color:#fff;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">
            ${title}
          </div>
        </td>
      </tr>

      <!-- Body -->
      <tr><td style="padding:36px 40px;">${bodyHtml}</td></tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
          <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.6;">
            This is an automated message from the Inspire Management System.<br>
            Please do not reply to this email.<br>
            &copy; ${new Date().getFullYear()} Inspire Youth For Development &mdash; All rights reserved.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Shared template pieces ────────────────────────────────────────────────────

function infoRow(label, value) {
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:40%;">${label}</td>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:13px;font-weight:600;">${value}</td>
  </tr>`;
}

function ctaButton(label, url) {
  return `<div style="text-align:center;margin:32px 0 8px;">
    <a href="${url}" style="background:${BRAND_NAVY};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:.03em;display:inline-block;">
      ${label}
    </a>
  </div>`;
}

function greeting(name) {
  return `<p style="color:#1e293b;font-size:15px;margin:0 0 24px;">Dear <strong>${name}</strong>,</p>`;
}

function formatAmount(amount) {
  return Number(amount || 0).toLocaleString("en-UG", { style:"currency", currency:"UGX", maximumFractionDigits:0 });
}

function formatDate(isoOrTs) {
  try { return new Date(isoOrTs).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }); }
  catch { return isoOrTs || "—"; }
}

// ── Core dispatcher ───────────────────────────────────────────────────────────

async function dispatch(to, subject, html, type, senderName = "", replyTo = "") {
  if (!to) { console.warn("[emailService] No recipient address — skipping", type); return; }
  const { error } = await supabase.functions.invoke("send-email", {
    body: { to, subject, html, type, senderName, replyTo },
  });
  if (error) console.warn(`[emailService] ${type} to ${to} failed:`, error.message || error);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Notify a supervisor that a new finance request needs their review.
 * @param {object} request – { id, title, amount, createdAt, requesterName, isResubmission? }
 * @param {object} supervisor – { name, email }
 */
export async function notifyRequestSubmitted(request, supervisor) {
  const action = request.isResubmission ? "Resubmitted for Approval" : "New Request Awaiting Approval";
  const appLink = `${APP_URL}#pending_approvals`;

  const body = `
    ${greeting(supervisor.name)}
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
      A finance request has been ${request.isResubmission ? "resubmitted" : "submitted"} and is waiting for your review and approval.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Request ID",     request.id)}
      ${infoRow("Title",          request.title)}
      ${infoRow("Requested By",   request.requesterName)}
      ${infoRow("Amount",         formatAmount(request.amount))}
      ${infoRow("Date Submitted", formatDate(request.createdAt))}
    </table>
    ${ctaButton("Review Request →", appLink)}
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:8px 0 0;">
      Log in to the Inspire Management System to approve or reject this request.
    </p>
  `;

  // senderName  → supervisor sees "Jones Brair via Inspire Management System"
  // replyTo     → when supervisor replies, it goes to the requester directly
  await dispatch(
    supervisor.email,
    `[IMS] Action Required: ${action} — ${request.id}`,
    emailShell(action, body),
    "request_submitted",
    request.requesterName,
    request.requesterEmail || ""
  );
}

/**
 * Notify a requester that their request was approved or rejected.
 * @param {object} request  – { id, title, amount, status }
 * @param {object} requester – { name, email }
 * @param {object} approver  – { name, role }
 * @param {"approved"|"rejected"} action
 * @param {string} comment
 */
export async function notifyApprovalAction(request, requester, approver, action, comment) {
  const isApproved = action === "approved";
  const statusLabel = isApproved ? "Approved" : "Rejected";
  const appLink = `${APP_URL}#my_requests`;

  const statusBadge = isApproved
    ? `<span style="background:#dcfce7;color:#166534;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;">✓ Approved</span>`
    : `<span style="background:#fee2e2;color:#991b1b;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;">✗ Rejected</span>`;

  const commentRow = comment
    ? infoRow(isApproved ? "Comment" : "Reason", comment)
    : "";

  const body = `
    ${greeting(requester.name)}
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
      Your finance request has been reviewed. Please see the details below.
    </p>
    <p style="margin:0 0 20px;">${statusBadge}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Request ID",   request.id)}
      ${infoRow("Title",        request.title)}
      ${infoRow("Amount",       formatAmount(request.amount))}
      ${infoRow("Reviewed By",  approver.name)}
      ${infoRow("Date",         formatDate(new Date().toISOString()))}
      ${commentRow}
    </table>
    ${isApproved
      ? `<p style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;color:#166534;font-size:13px;border-radius:4px;margin:24px 0;">
           Your request is progressing through the approval workflow.
         </p>`
      : `<p style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;color:#9a3412;font-size:13px;border-radius:4px;margin:24px 0;">
           You may edit and resubmit your request after addressing the feedback above.
         </p>`
    }
    ${ctaButton("View My Requests →", appLink)}
  `;

  // senderName  → requester sees "David Okello via Inspire Management System"
  // replyTo     → when requester replies, it goes to the approver directly
  await dispatch(
    requester.email,
    `[IMS] Request ${statusLabel}: ${request.id} — ${request.title}`,
    emailShell(`Request ${statusLabel}`, body),
    `request_${action}`,
    approver.name,
    approver.email || ""
  );
}

/**
 * Notify a supervisor that a new leave application needs their review.
 * @param {object} application – { id, leaveTypeName, startDate, endDate, numDays, reason, appliedAt, employeeName, employeeEmail }
 * @param {object} supervisor  – { name, email }
 */
export async function notifyLeaveSubmitted(application, supervisor) {
  const appLink = `${APP_URL}#hr_leave_manage`;

  const body = `
    ${greeting(supervisor.name)}
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">
      A leave application has been submitted by a member of your team and is awaiting your review.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Application ID", application.id)}
      ${infoRow("Employee",       application.employeeName)}
      ${infoRow("Leave Type",     application.leaveTypeName || application.leaveTypeId || "—")}
      ${infoRow("Period",         `${formatDate(application.startDate)} – ${formatDate(application.endDate)}`)}
      ${infoRow("Days",           `${application.numDays} working day${application.numDays !== 1 ? "s" : ""}`)}
      ${infoRow("Applied On",     formatDate(application.appliedAt))}
      ${application.reason ? infoRow("Reason", application.reason) : ""}
    </table>
    ${ctaButton("Review Leave Application →", appLink)}
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:8px 0 0;">
      Log in to the Inspire Management System to approve or reject this application.
    </p>
  `;

  await dispatch(
    supervisor.email,
    `[IMS] Leave Approval Needed: ${application.id} — ${application.employeeName}`,
    emailShell("Leave Application Awaiting Your Approval", body),
    "leave_submitted",
    application.employeeName,
    application.employeeEmail || ""
  );
}

/**
 * Notify a requester of a status change on their leave application.
 * @param {object} application – { id, leaveTypeName, startDate, endDate, numDays, employeeName, employeeEmail }
 * @param {object} requester   – { name, email }
 * @param {string} approverName
 * @param {"pending_hr"|"pending_executive_director"|"approved"|"rejected"} newStatus
 * @param {string} [comment]
 */
export async function notifyLeaveStatusUpdate(application, requester, approverName, newStatus, comment = "") {
  const STATUS_META = {
    pending_hr:                 { label:"Forwarded to HR",                   color:"#1e40af", bg:"#dbeafe", icon:"→", blurb:"Your leave application has been reviewed by your supervisor and forwarded to HR for the next stage of approval." },
    pending_executive_director: { label:"Forwarded to Executive Director",   color:"#3730a3", bg:"#e0e7ff", icon:"→", blurb:"Your leave application has been reviewed by HR and forwarded to the Executive Director for final approval." },
    approved:                   { label:"Fully Approved",                    color:"#065f46", bg:"#d1fae5", icon:"✓", blurb:"Your leave application has been fully approved through all stages and filed in your staff record." },
    rejected:                   { label:"Rejected",                          color:"#991b1b", bg:"#fee2e2", icon:"✗", blurb:"Your leave application has been reviewed and rejected." },
  };
  const meta = STATUS_META[newStatus] || { label:newStatus, color:"#475569", bg:"#f1f5f9", icon:"•", blurb:"Your leave application status has been updated." };
  const appLink = `${APP_URL}#my_leave`;

  const statusBadge = `<span style="background:${meta.bg};color:${meta.color};padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;">${meta.icon} ${meta.label}</span>`;
  const commentRow = comment ? infoRow("Comment / Reason", comment) : "";

  const actionNote = newStatus === "rejected"
    ? `<p style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;color:#9a3412;font-size:13px;border-radius:4px;margin:24px 0;">
         If you have questions about this decision, please speak with your supervisor or HR.
       </p>`
    : newStatus === "approved"
    ? `<p style="background:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;color:#166534;font-size:13px;border-radius:4px;margin:24px 0;">
         Your approved leave has been filed in your staff record and your leave balance updated.
       </p>`
    : `<p style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px 16px;color:#1e40af;font-size:13px;border-radius:4px;margin:24px 0;">
         No further action is required from you at this time. You will be notified at each stage.
       </p>`;

  const body = `
    ${greeting(requester.name)}
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">${meta.blurb}</p>
    <p style="margin:0 0 20px;">${statusBadge}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Application ID", application.id)}
      ${infoRow("Leave Type",     application.leaveTypeName || application.leaveTypeId || "—")}
      ${infoRow("Period",         `${formatDate(application.startDate)} – ${formatDate(application.endDate)}`)}
      ${infoRow("Days",           `${application.numDays} working day${application.numDays !== 1 ? "s" : ""}`)}
      ${infoRow("Reviewed By",    approverName)}
      ${infoRow("Date",           formatDate(new Date().toISOString()))}
      ${commentRow}
    </table>
    ${actionNote}
    ${ctaButton("View My Leave →", appLink)}
  `;

  await dispatch(
    requester.email,
    `[IMS] Leave Update: ${meta.label} — ${application.id}`,
    emailShell(`Leave Application ${meta.label}`, body),
    `leave_${newStatus}`,
    approverName,
    ""
  );
}
