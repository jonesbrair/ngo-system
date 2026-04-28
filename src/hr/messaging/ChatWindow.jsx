import React, { useEffect, useRef, useState } from "react";

// ── Utilities ────────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatMsgTime(value) {
  if (!value) return "";
  const dt  = new Date(value);
  const now = new Date();
  const time = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dt.toDateString() === now.toDateString()) return time;
  const diff = Math.floor((now - dt) / 86400000);
  if (diff === 1) return `Yesterday ${time}`;
  return `${dt.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function formatSidebarTime(value) {
  if (!value) return "";
  const dt  = new Date(value);
  const now = new Date();
  if (dt.toDateString() === now.toDateString())
    return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diff = Math.floor((now - dt) / 86400000);
  if (diff === 1) return "Yesterday";
  if (diff < 7)   return dt.toLocaleDateString([], { weekday: "short" });
  return dt.toLocaleDateString([], { month: "short", day: "numeric" });
}

function dateLabel(value) {
  const d = new Date(value);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === now.toDateString())       return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

// Detects [↩ Name: "preview"]\nBody pattern
function parseReplyPrefix(text) {
  if (!text) return null;
  const m = text.match(/^\[↩ ([^\]]+): "([^"]*)"\]\n([\s\S]*)$/);
  return m ? { author: m[1], preview: m[2], body: m[3] } : null;
}

// Detects [📎 name](url)
function parseAttachments(text) {
  if (!text) return { parts: [{ type: "text", content: "" }] };
  const parts = [];
  const rx    = /\[📎 ([^\]]+)\]\(([^)]+)\)/g;
  let last    = 0;
  let m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "attachment", name: m[1], url: m[2] });
    last = rx.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });
  return { parts: parts.length ? parts : [{ type: "text", content: text }] };
}

const AVATAR_COLORS = [
  ["#dbeafe","#1e40af"], ["#dcfce7","#166534"], ["#fce7f3","#9d174d"],
  ["#ede9fe","#5b21b6"], ["#ffedd5","#9a3412"], ["#e0f2fe","#0c4a6e"],
  ["#fef9c3","#854d0e"], ["#f0fdf4","#14532d"],
];
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// ── ThreadRow ─────────────────────────────────────────────────────────────────

function ThreadAvatar({ thread, size = 44 }) {
  if (thread.type === "channel") {
    return (
      <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: "linear-gradient(135deg,#fffbeb,#fef3c7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round">
          <path d="M3 11l19-9-9 19-2-8-8-2z"/>
        </svg>
      </div>
    );
  }
  if (thread.type === "group") {
    return (
      <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: "linear-gradient(135deg,#eff6ff,#dbeafe)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2" strokeLinecap="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
    );
  }
  // DM
  const [bg, fg] = avatarColor(thread.name);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.34, fontWeight: 800, flexShrink: 0 }}>
      {getInitials(thread.name)}
    </div>
  );
}

function ThreadRow({ thread, isActive, isPinned, onSelect, onPin }) {
  const [hover, setHover]   = useState(false);
  const [menu,  setMenu]    = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menu]);

  const accentColor = thread.type === "channel" ? "#b45309"
    : thread.type === "group" ? "#1e40af"
    : "#1e40af";

  const badgeBg = thread.type === "channel" ? "#fef3c7" : "#ef4444";
  const badgeFg = thread.type === "channel" ? "#b45309" : "#fff";

  return (
    <div
      onClick={() => onSelect(thread.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); }}
      style={{
        display: "flex", alignItems: "center", gap: 11, padding: "10px 14px",
        cursor: "pointer",
        background: isActive ? "#eff6ff" : hover ? "#f8fafc" : "transparent",
        borderLeft: isActive ? `3px solid ${accentColor}` : "3px solid transparent",
        transition: "all .12s",
        position: "relative",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <ThreadAvatar thread={thread} size={44} />
        {thread.unreadCount > 0 && (
          <div style={{ position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 999, background: badgeBg, border: "2px solid #fff", color: badgeFg, fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
            {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
          <div style={{ fontWeight: thread.unreadCount > 0 ? 700 : 500, fontSize: 13.5, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
            {isPinned && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill={accentColor} style={{ flexShrink: 0 }}>
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            )}
            {thread.name}
          </div>
          <div style={{ fontSize: 10.5, color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0 }}>
            {formatSidebarTime(thread.lastMessageTs)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: thread.unreadCount > 0 ? "#475569" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: thread.unreadCount > 0 ? 500 : 400 }}>
          {thread.lastMessageText || thread.subtitle}
        </div>
      </div>

      {/* Context menu trigger */}
      {(hover || menu) && (
        <div
          onClick={e => { e.stopPropagation(); setMenu(v => !v); }}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: 8, background: isActive ? "#dbeafe" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#64748b">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </div>
      )}
      {menu && (
        <div ref={menuRef} style={{ position: "absolute", right: 12, top: "100%", zIndex: 999, background: "#fff", borderRadius: 12, boxShadow: "0 8px 28px rgba(15,23,42,.14)", border: "1px solid #e2e8f0", padding: "4px 0", minWidth: 150 }}>
          <div onClick={e => { e.stopPropagation(); onPin(thread.id); setMenu(false); }}
            style={{ padding: "9px 14px", fontSize: 13, color: "#1e293b", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
            </svg>
            {isPinned ? "Unpin" : "Pin to top"}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ComposePanel ──────────────────────────────────────────────────────────────

function ComposePanel({ allowedRecipients, onStartDM, onCreateGroup, onClose }) {
  const [tab,          setTab]          = useState("dm");
  const [search,       setSearch]       = useState("");
  const [composeId,    setComposeId]    = useState("");
  const [groupName,    setGroupName]    = useState("");
  const [groupMembers, setGroupMembers] = useState([]);

  const filtered = allowedRecipients.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleMember = (id) =>
    setGroupMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const canCreate = groupName.trim() && groupMembers.length > 0;

  return (
    <div style={{ margin: "0 12px 12px", borderRadius: 16, background: "#f8faff", border: "1.5px solid #dbeafe", overflow: "hidden" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
        {[["dm", "Direct Message"], ["group", "New Group"]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: "11px 0", border: "none", background: "transparent", fontSize: 12.5, fontWeight: 700, color: tab === t ? "#1e40af" : "#64748b", cursor: "pointer", borderBottom: tab === t ? "2px solid #1e40af" : "2px solid transparent", transition: "all .12s" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        {tab === "dm" && (
          <>
            <input
              type="text"
              placeholder="Search colleagues…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #bfdbfe", fontSize: 13, color: "#1e293b", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "var(--sans)" }}
            />
            <div style={{ maxHeight: 160, overflowY: "auto", display: "grid", gap: 3, paddingRight: 2 }}>
              {filtered.map(r => {
                const [bg, fg] = avatarColor(r.name);
                return (
                  <div key={r.id} onClick={() => { onStartDM(r.id); onClose(); }}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 10, background: composeId === r.id ? "#eff6ff" : "#fff", border: `1.5px solid ${composeId === r.id ? "#bfdbfe" : "#f1f5f9"}`, cursor: "pointer", transition: "all .12s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = composeId === r.id ? "#eff6ff" : "#fff"}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                      {getInitials(r.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{r.name}</div>
                      {r.position && <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.position}</div>}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ fontSize: 12.5, color: "#94a3b8", padding: "12px 4px", textAlign: "center" }}>No colleagues found</div>
              )}
            </div>
          </>
        )}

        {tab === "group" && (
          <>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: groupMembers.length > 0 && !groupName.trim() ? "#b45309" : "#475569", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                Group name
                {groupMembers.length > 0 && !groupName.trim() && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#b45309" }}>← required to continue</span>
                )}
              </div>
              <input
                type="text"
                placeholder="e.g. Finance Team, Project Alpha…"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                autoFocus
                style={{ padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${groupMembers.length > 0 && !groupName.trim() ? "#fbbf24" : "#bfdbfe"}`, fontSize: 13, color: "#1e293b", background: groupMembers.length > 0 && !groupName.trim() ? "#fffbeb" : "#fff", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "var(--sans)", transition: "border-color .15s, background .15s" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "#475569", marginBottom: 8 }}>
                Add members
                {groupMembers.length > 0 && (
                  <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", fontSize: 10.5, fontWeight: 700 }}>
                    {groupMembers.length} selected
                  </span>
                )}
              </div>
              <div style={{ maxHeight: 150, overflowY: "auto", display: "grid", gap: 4, paddingRight: 2 }}>
                {allowedRecipients.map(r => {
                  const checked = groupMembers.includes(r.id);
                  const [bg, fg] = avatarColor(r.name);
                  return (
                    <label key={r.id} onClick={() => toggleMember(r.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, background: checked ? "#eff6ff" : "#fff", border: `1.5px solid ${checked ? "#bfdbfe" : "#f1f5f9"}`, cursor: "pointer", transition: "all .12s" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: checked ? "#1e40af" : bg, color: checked ? "#fff" : fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                        {getInitials(r.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                        {r.position && <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.position}</div>}
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${checked ? "#1e40af" : "#cbd5e1"}`, background: checked ? "#1e40af" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .12s" }}>
                        {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose}
                style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={() => { if (canCreate) { onCreateGroup(groupName, groupMembers); onClose(); } }}
                disabled={!canCreate}
                style={{ flex: 2, padding: "9px 0", borderRadius: 10, border: "none", background: canCreate ? "#1e40af" : "#e2e8f0", color: canCreate ? "#fff" : "#94a3b8", fontSize: 12.5, fontWeight: 700, cursor: canCreate ? "pointer" : "not-allowed", transition: "all .15s" }}>
                {canCreate
                  ? `Create "${groupName}"`
                  : groupMembers.length > 0 && !groupName.trim()
                    ? "Enter a group name ↑"
                    : groupName.trim() && groupMembers.length === 0
                      ? "Select at least one member"
                      : "Create Group"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all",          label: "All" },
  { key: "unread",       label: "Unread" },
  { key: "dm",           label: "Direct" },
  { key: "group",        label: "Groups" },
  { key: "channel",      label: "Channels" },
];

function Sidebar({ allThreads, pinnedIds, selectedThreadId, onSelectThread, onPinThread, onCreateGroup, allowedRecipients }) {
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("all");
  const [compose, setCompose] = useState(false);

  const filtered = allThreads.filter(t => {
    if (filter === "unread" && t.unreadCount === 0) return false;
    if (filter === "dm"     && t.type !== "dm")     return false;
    if (filter === "group"  && t.type !== "group")  return false;
    if (filter === "channel"&& t.type !== "channel") return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pinned   = filtered.filter(t => pinnedIds.includes(t.id));
  const unpinned = filtered.filter(t => !pinnedIds.includes(t.id));

  const handleStartDM = (id) => {
    onSelectThread(id);
  };

  return (
    <div style={{ width: 280, borderRight: "1px solid #f1f5f9", display: "flex", flexDirection: "column", height: "100%", background: "#fff", flexShrink: 0 }}>

      {/* Sidebar header */}
      <div style={{ padding: "14px 14px 10px", flexShrink: 0, borderBottom: "1px solid #f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", letterSpacing: "-.01em" }}>Conversations</div>
          <button
            onClick={() => setCompose(v => !v)}
            title="New conversation"
            style={{ width: 30, height: 30, borderRadius: 10, border: "1.5px solid #e2e8f0", background: compose ? "#1e40af" : "#f8fafc", color: compose ? "#fff" : "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
            {compose
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            }
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 10px 8px 32px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#1e293b", background: "#f8fafc", outline: "none", boxSizing: "border-box", fontFamily: "var(--sans)" }}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 4, marginTop: 10, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: "4px 11px", borderRadius: 999, border: "none", background: filter === f.key ? "#1e40af" : "#f1f5f9", color: filter === f.key ? "#fff" : "#64748b", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all .12s" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compose panel */}
      {compose && (
        <div style={{ flexShrink: 0, borderBottom: "1px solid #f1f5f9", paddingTop: 12 }}>
          <ComposePanel
            allowedRecipients={allowedRecipients}
            onStartDM={handleStartDM}
            onCreateGroup={onCreateGroup}
            onClose={() => setCompose(false)}
          />
        </div>
      )}

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 4 }}>
        {pinned.length > 0 && (
          <>
            <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".09em", display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#94a3b8"><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/><line x1="12" y1="17" x2="12" y2="22"/></svg>
              Pinned
            </div>
            {pinned.map(t => (
              <ThreadRow key={t.id} thread={t} isActive={t.id === selectedThreadId} isPinned onSelect={onSelectThread} onPin={onPinThread} />
            ))}
            <div style={{ margin: "6px 14px", height: 1, background: "#f1f5f9" }} />
          </>
        )}

        {unpinned.length === 0 && pinned.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              {search ? "No conversations match your search" : filter !== "all" ? `No ${filter} conversations` : "No conversations yet"}
            </div>
          </div>
        )}

        {unpinned.map(t => (
          <ThreadRow key={t.id} thread={t} isActive={t.id === selectedThreadId} isPinned={false} onSelect={onSelectThread} onPin={onPinThread} />
        ))}
      </div>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine, isGroup, showSender, showAvatar, onReply }) {
  const [hover, setHover] = useState(false);
  const reply  = parseReplyPrefix(msg.message);
  const body   = reply ? reply.body : msg.message;
  const { parts } = parseAttachments(body);
  const textParts = parts.filter(p => p.type === "text" && p.content.trim());
  const attachParts = parts.filter(p => p.type === "attachment");

  const [bg, fg] = avatarColor(msg.senderName || "");

  // Read receipt for DMs
  const tick = isMine && msg.status !== undefined ? (
    msg.status === "read"      ? <span style={{ color: "#2563eb" }}>✓✓</span> :
    msg.status === "delivered" ? <span style={{ color: "#94a3b8" }}>✓✓</span> :
                                  <span style={{ color: "#94a3b8" }}>✓</span>
  ) : null;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: isMine ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, marginBottom: 2, position: "relative" }}
    >
      {/* Avatar (received only) */}
      {!isMine && (
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0, visibility: showAvatar ? "visible" : "hidden" }}>
          {getInitials(msg.senderName || "")}
        </div>
      )}

      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 3 }}>
        {showSender && !isMine && isGroup && (
          <div style={{ fontSize: 11, fontWeight: 700, color: fg || "#94a3b8", paddingLeft: 4, marginBottom: 1 }}>
            {msg.senderName}
          </div>
        )}

        {/* Reply quote */}
        {reply && (
          <div style={{ padding: "7px 10px", borderRadius: 10, background: isMine ? "rgba(255,255,255,.12)" : "#f1f5f9", border: isMine ? "1px solid rgba(255,255,255,.2)" : "1px solid #e2e8f0", borderLeft: `3px solid ${isMine ? "rgba(255,255,255,.5)" : "#93c5fd"}`, marginBottom: 1, maxWidth: "100%" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: isMine ? "#bfdbfe" : "#1e40af", marginBottom: 2 }}>↩ {reply.author}</div>
            <div style={{ fontSize: 12, color: isMine ? "rgba(255,255,255,.7)" : "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{reply.preview}</div>
          </div>
        )}

        {/* Text bubble */}
        {textParts.length > 0 && (
          <div style={{
            padding: "9px 14px",
            borderRadius: isMine ? "20px 20px 5px 20px" : "5px 20px 20px 20px",
            background: isMine ? "linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)" : "#f1f5f9",
            color: isMine ? "#fff" : "#1e293b",
            border: isMine ? "none" : "1px solid #e2e8f0",
            boxShadow: isMine ? "0 4px 14px rgba(30,64,175,.22)" : "0 2px 8px rgba(15,23,42,.05)",
            fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {textParts.map((p, i) => <span key={i}>{p.content}</span>)}
          </div>
        )}

        {/* Attachment cards */}
        {attachParts.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px",
            borderRadius: 14,
            background: isMine ? "rgba(255,255,255,.12)" : "#f0f9ff",
            border: isMine ? "1px solid rgba(255,255,255,.2)" : "1px solid #bae6fd",
            color: isMine ? "#bfdbfe" : "#0369a1",
            fontSize: 12.5, fontWeight: 600, textDecoration: "none", maxWidth: "100%", overflow: "hidden",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{a.name}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: .7 }}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        ))}

        {/* Timestamp + read receipt */}
        <div style={{ fontSize: 10, color: "#94a3b8", paddingLeft: isMine ? 0 : 4, paddingRight: isMine ? 4 : 0, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
          {formatMsgTime(msg.timestamp)}
          {tick}
        </div>
      </div>

      {/* Hover reply button */}
      {hover && onReply && (
        <button
          onClick={() => onReply(msg)}
          style={{ position: "absolute", [isMine ? "left" : "right"]: isMine ? 40 : 40, bottom: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, boxShadow: "0 2px 8px rgba(0,0,0,.08)", whiteSpace: "nowrap" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          Reply
        </button>
      )}
    </div>
  );
}

// ── AnnouncementBubble ────────────────────────────────────────────────────────

function AnnouncementBubble({ msg, currentUserId, canPost, onAcknowledge }) {
  const hasAcked    = msg.readBy?.includes(currentUserId);
  const ackCount    = msg.readBy?.length || 0;
  const audienceTag = msg.audienceType === "department" && msg.department
    ? `${msg.department} Dept.`
    : "All Staff";
  const { parts } = parseAttachments(msg.message);
  const textParts  = parts.filter(p => p.type === "text" && p.content.trim());
  const attachParts = parts.filter(p => p.type === "attachment");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
      {/* Sender line */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: "linear-gradient(135deg,#fffbeb,#fef3c7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round">
            <path d="M3 11l19-9-9 19-2-8-8-2z"/>
          </svg>
        </div>
        <div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#92400e" }}>{msg.senderName}</span>
          <span style={{ fontSize: 11, color: "#b45309", marginLeft: 6, padding: "1px 7px", borderRadius: 999, background: "#fef3c7", fontWeight: 600 }}>{audienceTag}</span>
        </div>
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: "78%", paddingLeft: 36 }}>
        <div style={{ padding: "10px 14px", borderRadius: "5px 18px 18px 18px", background: "#fffbeb", border: "1px solid #fde68a", boxShadow: "0 2px 8px rgba(245,158,11,.1)", fontSize: 13.5, lineHeight: 1.6, color: "#1e293b", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {textParts.map((p, i) => <span key={i}>{p.content}</span>)}
        </div>

        {attachParts.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 12.5, fontWeight: 600, textDecoration: "none", marginTop: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            {a.name}
          </a>
        ))}

        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>{formatMsgTime(msg.timestamp)}</span>
          {canPost
            ? <span style={{ fontSize: 10.5, color: "#b45309", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {ackCount} acknowledged
              </span>
            : hasAcked
              ? <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Acknowledged
                </span>
              : <button onClick={() => onAcknowledge(msg.id)}
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#92400e", background: "#fef3c7", border: "1.5px solid #fde68a", borderRadius: 8, padding: "4px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all .12s" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Acknowledge
                </button>
          }
        </div>
      </div>
    </div>
  );
}

// ── DateSeparator ─────────────────────────────────────────────────────────────

function DateSeparator({ date }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0" }}>
      <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "#94a3b8", whiteSpace: "nowrap", padding: "3px 10px", borderRadius: 999, background: "#f8fafc", border: "1px solid #f1f5f9" }}>
        {dateLabel(date)}
      </div>
      <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
    </div>
  );
}

// ── ReplyBar ──────────────────────────────────────────────────────────────────

function ReplyBar({ placeholder, draft, onChangeDraft, onSend, isUploading, disabled, replyTo, onClearReplyTo }) {
  const fileRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);

  const canSend = !disabled && !isUploading && (draft.trim() || pendingFile);

  const handleFileChange = (e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; };

  const handleSend = () => {
    if (!canSend) return;
    onSend(draft, pendingFile || null);
    setPendingFile(null);
  };

  return (
    <div style={{ borderTop: "1px solid #f1f5f9", padding: "10px 16px 14px", flexShrink: 0, background: "#fff" }}>
      {/* Reply preview */}
      {replyTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "7px 12px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "3px solid #2563eb" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", marginBottom: 2 }}>↩ Replying to {replyTo.senderName}</div>
            <div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.message?.slice(0, 100)}</div>
          </div>
          <button onClick={onClearReplyTo} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* File chip */}
      {pendingFile && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "5px 10px", borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 12 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <span style={{ color: "#1d4ed8", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</span>
          <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <button onClick={() => fileRef.current?.click()} disabled={disabled || isUploading} title="Attach file"
          style={{ width: 38, height: 38, borderRadius: 12, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#94a3b8", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: disabled ? .4 : 1, transition: "all .15s" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleFileChange} />
        <textarea
          rows={1}
          placeholder={isUploading ? "Uploading…" : placeholder}
          value={draft}
          onChange={e => onChangeDraft(e.target.value)}
          disabled={disabled || isUploading}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(); } }}
          style={{ flex: 1, padding: "9px 14px", borderRadius: 14, border: "1.5px solid #e2e8f0", fontSize: 13.5, color: "#1e293b", fontFamily: "var(--sans)", outline: "none", resize: "none", minHeight: 40, maxHeight: 120, background: disabled ? "#f8fafc" : "#fff", lineHeight: 1.5, transition: "border-color .15s" }}
        />
        <button onClick={handleSend} disabled={!canSend} title="Send (Ctrl+Enter)"
          style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: canSend ? "linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)" : "#f1f5f9", color: canSend ? "#fff" : "#94a3b8", cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s", boxShadow: canSend ? "0 4px 12px rgba(30,64,175,.28)" : "none" }}>
          {isUploading
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          }
        </button>
      </div>
      <div style={{ fontSize: 10, color: "#cbd5e1", marginTop: 4, textAlign: "right" }}>Ctrl+Enter to send</div>
    </div>
  );
}

// ── AnnouncementComposer ──────────────────────────────────────────────────────

function AnnouncementComposer({ draft, onChangeDraft, annScope, onChangeAnnScope, annDept, onChangeAnnDept, departments, onSend, isUploading }) {
  const fileRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const canSend = draft.trim() && (annScope !== "department" || annDept);

  const handleFileChange = (e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; };
  const handleSend = () => {
    if (!canSend && !pendingFile) return;
    onSend(draft, pendingFile || null);
    setPendingFile(null);
  };

  return (
    <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 16px 14px", flexShrink: 0, background: "#fffbeb" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
        Publish Announcement
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select value={annScope} onChange={e => onChangeAnnScope(e.target.value)}
          style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(217,119,6,.3)", fontSize: 12.5, color: "#1e293b", background: "#fff", outline: "none", fontFamily: "var(--sans)" }}>
          <option value="all">All staff</option>
          <option value="department">Specific department</option>
        </select>
        {annScope === "department" && (
          <select value={annDept} onChange={e => onChangeAnnDept(e.target.value)}
            style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(217,119,6,.3)", fontSize: 12.5, color: "#1e293b", background: "#fff", outline: "none", fontFamily: "var(--sans)" }}>
            <option value="">Select dept…</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {pendingFile && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "5px 10px", borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12 }}>
          <span style={{ color: "#92400e", fontWeight: 600, flex: 1 }}>{pendingFile.name}</span>
          <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <button onClick={() => fileRef.current?.click()} disabled={isUploading} title="Attach file"
          style={{ width: 38, height: 38, borderRadius: 12, border: "1.5px solid #fde68a", background: "#fffbeb", color: "#b45309", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleFileChange} />
        <textarea
          rows={2}
          placeholder="Write announcement…"
          value={draft}
          onChange={e => onChangeDraft(e.target.value)}
          style={{ flex: 1, padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(217,119,6,.3)", fontSize: 13, color: "#1e293b", fontFamily: "var(--sans)", outline: "none", resize: "none", minHeight: 44, background: "#fff", lineHeight: 1.5 }}
        />
        <button onClick={handleSend} disabled={!canSend && !pendingFile}
          style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: canSend || pendingFile ? "linear-gradient(135deg,#d97706 0%,#f59e0b 100%)" : "#f1f5f9", color: canSend || pendingFile ? "#fff" : "#94a3b8", cursor: canSend || pendingFile ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s", boxShadow: canSend ? "0 4px 12px rgba(217,119,6,.28)" : "none" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── ChatPanel ─────────────────────────────────────────────────────────────────

function ChatPanel({ selectedThread, activeMessages, currentUser, canPublishAnnouncements, draft, onChangeDraft, onSend, isUploading, replyTo, onSetReplyTo, onClearReplyTo, annScope, onChangeAnnScope, annDept, onChangeAnnDept, departments, onAcknowledge }) {
  const bottomRef = useRef(null);
  const isChannel = selectedThread?.type === "channel";
  const isGroup   = selectedThread?.type === "group";
  const isDM      = selectedThread?.type === "dm";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length]);

  // Build items with date separators
  const items = activeMessages.reduce((acc, msg, idx) => {
    const msgDate = new Date(msg.timestamp).toDateString();
    const prev    = activeMessages[idx - 1];
    if (!prev || new Date(prev.timestamp).toDateString() !== msgDate) {
      acc.push({ kind: "date", date: msg.timestamp, key: `d-${msg.timestamp}-${idx}` });
    }
    acc.push({ kind: "msg", msg, idx, key: msg.id || `m-${idx}` });
    return acc;
  }, []);

  // Chat header
  const renderHeader = () => {
    if (!selectedThread) return null;
    return (
      <div style={{ padding: "13px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "#fff" }}>
        <ThreadAvatar thread={selectedThread} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedThread.name}
          </div>
          <div style={{ fontSize: 12, color: isChannel ? "#b45309" : "#64748b", marginTop: 1 }}>
            {isChannel ? "HR, Admin & Executive Director · Broadcast channel"
              : selectedThread.subtitle}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", flexShrink: 0 }}>
          {activeMessages.length} {activeMessages.length === 1 ? "message" : "messages"}
        </div>
      </div>
    );
  };

  // Empty state
  const renderEmpty = () => {
    if (activeMessages.length > 0) return null;
    const icon = isChannel
      ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="1.6" strokeLinecap="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
      : isGroup
        ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
    const bg = isChannel ? "linear-gradient(135deg,#fffbeb,#fef3c7)" : "linear-gradient(135deg,#eff6ff,#dbeafe)";
    const text = isChannel ? "No announcements yet — HR will post here."
      : isGroup ? `Be the first to say something in ${selectedThread.name}!`
      : `Say hello to ${selectedThread.name.split(" ")[0]}!`;
    return (
      <div style={{ margin: "auto", textAlign: "center", maxWidth: 280 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          {icon}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
          {isChannel ? "Broadcast Channel" : isGroup ? "New Group" : "Start a conversation"}
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{text}</div>
      </div>
    );
  };

  // Input area
  const renderInput = () => {
    if (!selectedThread) return null;
    if (isChannel) {
      if (canPublishAnnouncements) {
        return (
          <AnnouncementComposer
            draft={draft} onChangeDraft={onChangeDraft}
            annScope={annScope} onChangeAnnScope={onChangeAnnScope}
            annDept={annDept} onChangeAnnDept={onChangeAnnDept}
            departments={departments} onSend={onSend} isUploading={isUploading}
          />
        );
      }
      return (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 20px", background: "#f8fafc", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            This channel is managed by HR. You can acknowledge announcements above.
          </div>
        </div>
      );
    }
    return (
      <ReplyBar
        placeholder={`Message ${selectedThread.name.split(" ")[0]}…`}
        draft={draft}
        onChangeDraft={onChangeDraft}
        onSend={onSend}
        isUploading={isUploading}
        disabled={false}
        replyTo={replyTo}
        onClearReplyTo={onClearReplyTo}
      />
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {selectedThread ? renderHeader() : (
        <div style={{ padding: "13px 20px", borderBottom: "1px solid #f1f5f9", background: "#fff", flexShrink: 0 }}>
          <div style={{ color: "#94a3b8", fontSize: 13.5 }}>Select a conversation from the sidebar to get started</div>
        </div>
      )}

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 8px", display: "flex", flexDirection: "column", gap: isChannel ? 16 : 4, background: "#fafbfc" }}>
        {!selectedThread && (
          <div style={{ margin: "auto", textAlign: "center", maxWidth: 300 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(135deg,#eff6ff,#dbeafe)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.6" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Welcome to Messages</div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
              All your conversations — colleagues, groups, and HR announcements — live here.
            </div>
          </div>
        )}

        {selectedThread && renderEmpty()}

        {items.map(item => {
          if (item.kind === "date") return <DateSeparator key={item.key} date={item.date} />;
          const { msg, idx } = item;

          if (isChannel) {
            return (
              <AnnouncementBubble
                key={item.key}
                msg={msg}
                currentUserId={currentUser.id}
                canPost={canPublishAnnouncements}
                onAcknowledge={onAcknowledge}
              />
            );
          }

          const isMine   = msg.senderId === currentUser.id;
          const prevMsg  = activeMessages[idx - 1];
          const nextMsg  = activeMessages[idx + 1];
          const sameSenderPrev = prevMsg && prevMsg.senderId === msg.senderId && (new Date(msg.timestamp) - new Date(prevMsg.timestamp)) < 300000;
          const sameSenderNext = nextMsg && nextMsg.senderId === msg.senderId && (new Date(nextMsg.timestamp) - new Date(msg.timestamp)) < 300000;
          const showSender = isGroup && !sameSenderPrev;
          const showAvatar = !sameSenderNext;

          return (
            <MessageBubble
              key={item.key}
              msg={msg}
              isMine={isMine}
              isGroup={isGroup}
              showSender={showSender}
              showAvatar={showAvatar}
              onReply={!isChannel ? onSetReplyTo : null}
            />
          );
        })}

        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {renderInput()}
    </div>
  );
}

// ── Main ChatWindow export ────────────────────────────────────────────────────

export default function ChatWindow({
  currentUser,
  allThreads,
  pinnedIds,
  selectedThreadId,
  selectedThread,
  activeMessages,
  onSelectThread,
  onPinThread,
  onCreateGroup,
  allowedRecipients,
  draft,
  onChangeDraft,
  onSend,
  isUploading,
  replyTo,
  onSetReplyTo,
  onClearReplyTo,
  canPublishAnnouncements,
  annScope,
  onChangeAnnScope,
  annDept,
  onChangeAnnDept,
  departments,
  onAcknowledge,
}) {
  return (
    <div style={{ display: "flex", height: "100%", borderRadius: 20, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 4px 28px rgba(15,23,42,.08)", background: "#fff" }}>
      <Sidebar
        allThreads={allThreads}
        pinnedIds={pinnedIds}
        selectedThreadId={selectedThreadId}
        onSelectThread={onSelectThread}
        onPinThread={onPinThread}
        onCreateGroup={onCreateGroup}
        allowedRecipients={allowedRecipients}
      />
      <ChatPanel
        selectedThread={selectedThread}
        activeMessages={activeMessages}
        currentUser={currentUser}
        canPublishAnnouncements={canPublishAnnouncements}
        draft={draft}
        onChangeDraft={onChangeDraft}
        onSend={onSend}
        isUploading={isUploading}
        replyTo={replyTo}
        onSetReplyTo={onSetReplyTo}
        onClearReplyTo={onClearReplyTo}
        annScope={annScope}
        onChangeAnnScope={onChangeAnnScope}
        annDept={annDept}
        onChangeAnnDept={onChangeAnnDept}
        departments={departments}
        onAcknowledge={onAcknowledge}
      />
    </div>
  );
}
