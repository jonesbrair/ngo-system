import React from "react";

const ICON_ALIASES = {
  finance: "payments",
  dashboard: "reports",
  requests: "requests",
  all_requests: "requests",
  new_request: "requests",
  approvals: "approvals",
  pending_approvals: "approvals",
  approval_history: "approvals",
  payments: "payments",
  payment_queue: "payments",
  reports: "reports",
  financial_reports: "reports",
  procurement: "prc",
  prc: "prc",
  human_resource: "hr",
  hr: "hr",
  project_management: "pm",
  pm: "pm",
  asset_management: "ast",
  ast: "ast",
  document_management: "doc",
  doc: "doc",
  communication: "com",
  com: "com",
  admin: "admin",
  admin_center: "admin",
  admin_users: "users",
  users: "users",
  admin_budgets: "reports",
  budgets: "reports",
  admin_logs: "logs",
  logs: "logs",
  notifications: "com",
  notification: "notification",
  home: "home",
  process: "workflow",
  submit: "submit",
  approve: "approve",
  reject: "reject",
  download: "download",
  pdf: "download",
  print: "download",
  view: "view",
  details: "view",
  back: "back",
  add: "add",
  create: "add",
  save: "save",
  edit: "edit",
  procurement_complete: "ast",
  send_to_finance: "payments",
};

const TONES = {
  navy: {
    start: "#173a68",
    end: "#0f2744",
    shadow: "rgba(15,39,68,.20)",
    glow: "rgba(59,130,246,.18)",
  },
  blue: {
    start: "#3d79ff",
    end: "#1d4ed8",
    shadow: "rgba(37,99,235,.22)",
    glow: "rgba(96,165,250,.20)",
  },
  amber: {
    start: "#f8ba2d",
    end: "#d97706",
    shadow: "rgba(217,119,6,.22)",
    glow: "rgba(251,191,36,.22)",
  },
  teal: {
    start: "#22c7b8",
    end: "#0f766e",
    shadow: "rgba(15,118,110,.22)",
    glow: "rgba(45,212,191,.22)",
  },
  green: {
    start: "#28cb83",
    end: "#059669",
    shadow: "rgba(5,150,105,.22)",
    glow: "rgba(74,222,128,.20)",
  },
  red: {
    start: "#fb7185",
    end: "#dc2626",
    shadow: "rgba(220,38,38,.24)",
    glow: "rgba(251,113,133,.22)",
  },
  violet: {
    start: "#9a6bff",
    end: "#6d28d9",
    shadow: "rgba(109,40,217,.24)",
    glow: "rgba(167,139,250,.22)",
  },
  slate: {
    start: "#8aa0b8",
    end: "#4b5563",
    shadow: "rgba(71,85,105,.24)",
    glow: "rgba(148,163,184,.20)",
  },
};

function getPath(name) {
  switch (ICON_ALIASES[name] || name) {
    case "home":
      return (
        <>
          <path d="M5 11.5 12 6l7 5.5" />
          <path d="M7 10.5V18h10v-7.5" />
          <path d="M10 18v-4h4v4" />
        </>
      );
    case "requests":
      return (
        <>
          <rect x="5.5" y="4.5" width="10" height="14" rx="2.5" />
          <path d="M8.5 8.5h4" />
          <path d="M8.5 11.5h4" />
          <path d="M16.5 10.5h5" />
          <path d="M19 8v5" />
        </>
      );
    case "approvals":
      return (
        <>
          <rect x="4.5" y="5" width="7" height="6.5" rx="2" />
          <rect x="12.5" y="12.5" width="7" height="6.5" rx="2" />
          <path d="M11.5 8.25h4l-1.2-1.2" />
          <path d="M12.5 15.75h-4l1.2 1.2" />
          <path d="m14.7 15.7 1.7 1.7 3-3" />
        </>
      );
    case "payments":
      return (
        <>
          <path d="M4.5 8.5c0-2.2 2.2-4 5-4h7c2.8 0 5 1.8 5 4v7c0 2.2-2.2 4-5 4h-7c-2.8 0-5-1.8-5-4z" />
          <path d="M4.5 10.5h17" />
          <path d="M8 15h4" />
          <circle cx="17.5" cy="15.2" r="1.2" />
        </>
      );
    case "reports":
      return (
        <>
          <path d="M6 18.5h12" />
          <path d="M8 16V11" />
          <path d="M12 16V8" />
          <path d="M16 16v-4" />
          <path d="M7 8.5c1.5-1.3 3.1-1.2 4.3-.1 1.2 1 2.5 1.2 5.2-1.4" />
        </>
      );
    case "prc":
      return (
        <>
          <path d="M4.5 6.5h2.8l1.6 7.2h8.8l1.6-5.2H8.6" />
          <circle cx="10.5" cy="18" r="1.2" />
          <circle cx="17" cy="18" r="1.2" />
          <path d="M15.5 5h4v5" />
          <path d="M17.5 5v5" />
        </>
      );
    case "hr":
      return (
        <>
          <circle cx="9" cy="9" r="2.5" />
          <path d="M4.8 17c.7-2.4 2.7-3.8 4.2-3.8 1.6 0 3.5 1.4 4.2 3.8" />
          <circle cx="17.3" cy="9.4" r="1.7" />
          <path d="M17.3 6.8v-1.1" />
          <path d="M17.3 12v-1.1" />
          <path d="m15.4 8.9 1-.5" />
          <path d="m18.2 10.4 1 .5" />
          <path d="m15.4 10.4 1 .5" />
          <path d="m18.2 8.9 1-.5" />
        </>
      );
    case "pm":
      return (
        <>
          <rect x="4.5" y="6" width="6" height="4" rx="1.6" />
          <rect x="13.5" y="6" width="6" height="4" rx="1.6" />
          <rect x="9" y="13.5" width="6" height="4" rx="1.6" />
          <path d="M10.5 8h3" />
          <path d="M16.5 10v3.5" />
          <path d="M12 10v3.5" />
        </>
      );
    case "ast":
      return (
        <>
          <path d="m12 4.8 6.8 3.5v7.4L12 19.2 5.2 15.7V8.3z" />
          <path d="M12 4.8v7.1" />
          <path d="m5.2 8.3 6.8 3.6 6.8-3.6" />
        </>
      );
    case "doc":
      return (
        <>
          <path d="M8 4.5h6l4 4V18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
          <path d="M14 4.5v4h4" />
          <path d="M9 13h6" />
          <path d="M9 16h4.5" />
        </>
      );
    case "com":
      return (
        <>
          <path d="M6.5 6h11a2.5 2.5 0 0 1 2.5 2.5v4A2.5 2.5 0 0 1 17.5 15H12l-3.8 3V15H6.5A2.5 2.5 0 0 1 4 12.5v-4A2.5 2.5 0 0 1 6.5 6Z" />
          <path d="M8.5 10.5h.01" />
          <path d="M12 10.5h.01" />
          <path d="M15.5 10.5h.01" />
        </>
      );
    case "notification":
      return (
        <>
          <path d="M9 18h6" />
          <path d="M10 18a2 2 0 0 0 4 0" />
          <path d="M6.5 15.5h11l-1.4-2.1V10a4.1 4.1 0 1 0-8.2 0v3.4z" />
        </>
      );
    case "admin":
      return (
        <>
          <path d="M12 4.8 18.5 7v4.6c0 4-2.6 6.6-6.5 7.8-3.9-1.2-6.5-3.8-6.5-7.8V7z" />
          <path d="m9.4 12 1.6 1.6 3.7-3.7" />
        </>
      );
    case "users":
      return (
        <>
          <circle cx="9" cy="9" r="2.4" />
          <circle cx="16.5" cy="9.5" r="2" />
          <path d="M4.8 17c.7-2.4 2.7-3.8 4.2-3.8 1.6 0 3.5 1.4 4.2 3.8" />
          <path d="M13.8 16.6c.6-1.8 2-2.9 3.2-2.9 1.2 0 2.5 1.1 3 2.9" />
        </>
      );
    case "logs":
      return (
        <>
          <path d="M12 6v6l4 2.2" />
          <circle cx="12" cy="12" r="7.2" />
          <path d="M8.2 4.9 6.7 3.5" />
          <path d="M15.8 4.9 17.3 3.5" />
        </>
      );
    case "submit":
      return (
        <>
          <path d="m12 19 .1-11.2" />
          <path d="m7.5 11 4.5-4.5 4.5 4.5" />
          <path d="M5 19h14" />
        </>
      );
    case "approve":
      return (
        <>
          <circle cx="12" cy="12" r="7.5" />
          <path d="m8.8 12.2 2.2 2.2 4.6-4.8" />
        </>
      );
    case "reject":
      return (
        <>
          <circle cx="12" cy="12" r="7.5" />
          <path d="m9.2 9.2 5.6 5.6" />
          <path d="m14.8 9.2-5.6 5.6" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 5.5v9" />
          <path d="m8.5 11.8 3.5 3.7 3.5-3.7" />
          <path d="M6 18.5h12" />
        </>
      );
    case "workflow":
      return (
        <>
          <rect x="4.5" y="6" width="5" height="4.5" rx="1.6" />
          <rect x="14.5" y="6" width="5" height="4.5" rx="1.6" />
          <rect x="9.5" y="13.5" width="5" height="4.5" rx="1.6" />
          <path d="M9.5 8.2h5" />
          <path d="M17 10.5v3" />
          <path d="M12 10.5v3" />
        </>
      );
    case "view":
      return (
        <>
          <path d="M3.8 12s3-5 8.2-5 8.2 5 8.2 5-3 5-8.2 5-8.2-5-8.2-5Z" />
          <circle cx="12" cy="12" r="2.3" />
        </>
      );
    case "back":
      return (
        <>
          <path d="m10 6-6 6 6 6" />
          <path d="M4.5 12h15" />
        </>
      );
    case "add":
      return (
        <>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8.5v7" />
          <path d="M8.5 12h7" />
        </>
      );
    case "save":
      return (
        <>
          <path d="M6 4.5h10l2 2V19.5H6z" />
          <path d="M8.5 4.5v5h6v-5" />
          <path d="M9 15.5h6" />
        </>
      );
    case "edit":
      return (
        <>
          <path d="m7 17 1-4 7.8-7.8 3 3L11 16z" />
          <path d="M14.6 6.4 17.4 9.2" />
        </>
      );
    default:
      return (
        <>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8.5v7" />
          <path d="M8.5 12h7" />
        </>
      );
  }
}

function resolveIconName(name) {
  return ICON_ALIASES[name] || name;
}

export function AppIcon({ name, size = 18, className = "", style, strokeWidth = 1.9 }) {
  const resolved = resolveIconName(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`app-ui-icon ${className}`.trim()}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {getPath(resolved)}
    </svg>
  );
}

export function IconBadge({ name, size = 18, tone = "navy", className = "", title, style }) {
  const palette = TONES[tone] || TONES.navy;
  const badgeSize = size + 16;
  return (
    <span
      className={`app-ui-icon-badge ${className}`.trim()}
      title={title}
      style={{
        width: badgeSize,
        height: badgeSize,
        "--icon-start": palette.start,
        "--icon-end": palette.end,
        "--icon-shadow": palette.shadow,
        "--icon-glow": palette.glow,
        ...style,
      }}
    >
      <span className="app-ui-icon-gloss" />
      <AppIcon name={name} size={size} />
    </span>
  );
}
