import React, { useState } from "react";
import { IconBadge } from "../../uiIcons";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatRelativeTime(value) {
  if (!value) return "";
  const dt = new Date(value);
  const now = new Date();
  const diffMs = now - dt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d`;
  return dt.toLocaleDateString([], { month: "short", day: "numeric" });
}

const AVATAR_COLORS = [
  ["#dbeafe", "#1e40af"], ["#dcfce7", "#166534"], ["#fce7f3", "#9d174d"],
  ["#ede9fe", "#5b21b6"], ["#ffedd5", "#9a3412"], ["#e0f2fe", "#0c4a6e"],
];
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

const GROUP_COLORS = [
  ["#fef9c3", "#854d0e"], ["#e0f2fe", "#0c4a6e"], ["#f0fdf4", "#166534"],
  ["#fdf4ff", "#7e22ce"], ["#fff1f2", "#9f1239"],
];
function groupColor(name) {
  if (!name) return GROUP_COLORS[0];
  return GROUP_COLORS[name.charCodeAt(0) % GROUP_COLORS.length];
}

export default function ConversationList({
  conversations,
  groups,
  viewMode,
  selectedRecipientId,
  selectedGroupId,
  onSelectConversation,
  onSelectGroup,
  onCreateGroup,
  allowedRecipients,
  composeRecipientId,
  onChangeComposeRecipient,
  draft,
  onChangeDraft,
  onSend,
  currentUserId,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState([]);
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ims-pinned-convs") || "[]"); } catch { return []; }
  });

  const togglePin = (id, e) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      try { localStorage.setItem("ims-pinned-convs", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || newGroupMembers.length === 0) return;
    onCreateGroup(newGroupName, newGroupMembers);
    setNewGroupName("");
    setNewGroupMembers([]);
    setIsNewGroupOpen(false);
  };

  const toggleGroupMember = (id) => {
    setNewGroupMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const q = searchTerm.trim().toLowerCase();

  const filteredConvs = q
    ? conversations.filter(
        (item) =>
          item.partner.name.toLowerCase().includes(q) ||
          (item.lastMessage?.message || "").toLowerCase().includes(q)
      )
    : conversations;

  const sortedConvs = [...filteredConvs].sort((a, b) => {
    const ap = pinnedIds.includes(a.partner.id);
    const bp = pinnedIds.includes(b.partner.id);
    if (ap && !bp) return -1;
    if (!ap && bp) return 1;
    return 0;
  });

  const filteredGroups = q
    ? groups.filter((g) => g.name.toLowerCase().includes(q))
    : groups;

  return (
    <div style={{ background: "#fff", borderRadius: 18, border: "1px solid var(--g200)", boxShadow: "var(--sh-sm)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--g100)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--navy)", fontWeight: 800 }}>Messages</div>
          <button
            onClick={() => { setIsComposeOpen((v) => !v); setIsNewGroupOpen(false); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, border: "1.5px solid var(--navy)", background: isComposeOpen ? "var(--navy)" : "transparent", color: isComposeOpen ? "#fff" : "var(--navy)", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}
          >
            {isComposeOpen
              ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            }
            {isComposeOpen ? "Cancel" : "Compose"}
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--g400)" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search conversations…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: 999, border: "1px solid var(--g200)", background: "var(--g50)", fontSize: 12.5, color: "var(--g800)", outline: "none", fontFamily: "var(--sans)", boxSizing: "border-box" }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--g400)", fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
          )}
        </div>
      </div>

      {/* ── Compose (collapsible) ── */}
      {isComposeOpen && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--g100)", background: "var(--g50)", flexShrink: 0, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--g500)", textTransform: "uppercase", letterSpacing: ".09em" }}>New Message</div>
          <select
            value={composeRecipientId}
            onChange={(e) => onChangeComposeRecipient(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--g200)", fontSize: 13, color: "var(--g800)", background: "#fff", fontFamily: "var(--sans)", outline: "none", width: "100%" }}
          >
            <option value="">Select recipient…</option>
            {allowedRecipients.map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.position ? ` · ${r.position}` : ""}</option>
            ))}
          </select>
          <textarea
            rows={3}
            placeholder="Write a message…"
            value={draft}
            onChange={(e) => onChangeDraft(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--g200)", fontSize: 13, color: "var(--g800)", fontFamily: "var(--sans)", outline: "none", resize: "vertical", minHeight: 68, width: "100%", boxSizing: "border-box" }}
          />
          <button
            onClick={onSend}
            disabled={!composeRecipientId || !draft.trim()}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderRadius: 999, border: "none", background: "var(--navy)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (!composeRecipientId || !draft.trim()) ? 0.4 : 1, transition: "opacity .15s" }}
          >
            <IconBadge name="com" tone="teal" size={13} /> Send Message
          </button>
        </div>
      )}

      {/* ── New Group (collapsible) ── */}
      {isNewGroupOpen && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--g100)", background: "#f0f9ff", flexShrink: 0, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: ".09em" }}>New Group</div>
          <input
            type="text"
            placeholder="Group name…"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #bae6fd", fontSize: 13, color: "var(--g800)", fontFamily: "var(--sans)", outline: "none", width: "100%", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--g600)", marginBottom: 2 }}>Add members:</div>
          <div style={{ maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {allowedRecipients.map((r) => {
              const checked = newGroupMembers.includes(r.id);
              return (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 6px", borderRadius: 8, background: checked ? "#e0f2fe" : "transparent" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleGroupMember(r.id)} style={{ accentColor: "#0369a1" }} />
                  <span style={{ fontSize: 12.5, color: "var(--g800)" }}>{r.name}</span>
                  {r.position && <span style={{ fontSize: 11, color: "var(--g400)" }}>· {r.position}</span>}
                </label>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "var(--g400)" }}>
            {newGroupMembers.length > 0 ? `${newGroupMembers.length} member${newGroupMembers.length > 1 ? "s" : ""} selected` : "Select at least one member"}
          </div>
          <button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim() || newGroupMembers.length === 0}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderRadius: 999, border: "none", background: "#0369a1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (!newGroupName.trim() || newGroupMembers.length === 0) ? 0.4 : 1, transition: "opacity .15s" }}
          >
            Create Group
          </button>
        </div>
      )}

      {/* ── Scrollable list ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── Direct Messages section ── */}
        <div style={{ padding: "10px 16px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--g400)", textTransform: "uppercase", letterSpacing: ".1em" }}>Direct Messages</div>
          <div style={{ fontSize: 11, color: "var(--g400)" }}>{sortedConvs.length}</div>
        </div>

        {sortedConvs.length === 0 && (
          <div style={{ padding: "18px 20px", textAlign: "center" }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--g100)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--g400)" strokeWidth="1.8" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--g600)" }}>
              {q ? "No matches" : "No conversations yet"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--g400)", marginTop: 2 }}>
              {q ? "Try a different search" : "Tap Compose to start a thread"}
            </div>
          </div>
        )}

        {sortedConvs.map((item) => {
          const active = item.partner.id === selectedRecipientId && viewMode === "dm";
          const pinned = pinnedIds.includes(item.partner.id);
          const initials = getInitials(item.partner.name);
          const [bgColor, textColor] = active ? ["var(--navy)", "#fff"] : avatarColor(item.partner.name);
          return (
            <button
              key={item.partner.id}
              type="button"
              onClick={() => onSelectConversation(item.partner.id)}
              style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 11, padding: "10px 14px 10px 16px", background: active ? "linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%)" : "transparent", border: "none", boxShadow: active ? "inset 3px 0 0 var(--navy)" : "inset 3px 0 0 transparent", cursor: "pointer", transition: "background .14s, box-shadow .14s", position: "relative" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: bgColor, color: textColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0, letterSpacing: ".03em", position: "relative" }}>
                {initials}
                {pinned && (
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 13, height: 13, borderRadius: "50%", background: "#f59e0b", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="6" height="6" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--navy)" : "var(--g800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.partner.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--g400)", flexShrink: 0 }}>{formatRelativeTime(item.lastMessage?.timestamp)}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--g400)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.partner.position || item.partner.dept || "Staff"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <div style={{ fontSize: 12, color: "var(--g500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {item.lastMessage?.message || "No messages yet"}
                  </div>
                  {item.unreadCount > 0 && (
                    <span style={{ flexShrink: 0, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "var(--navy)", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {item.unreadCount}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => togglePin(item.partner.id, e)}
                title={pinned ? "Unpin" : "Pin to top"}
                style={{ flexShrink: 0, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "none", background: pinned ? "#fef3c7" : "transparent", color: pinned ? "#b45309" : "var(--g300)", cursor: "pointer", opacity: 0.85, transition: "all .14s" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            </button>
          );
        })}

        {/* ── Groups section ── */}
        <div style={{ padding: "12px 16px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--g100)", marginTop: 4, flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--g400)", textTransform: "uppercase", letterSpacing: ".1em" }}>Group Chats</div>
          <button
            onClick={() => { setIsNewGroupOpen((v) => !v); setIsComposeOpen(false); }}
            title="New group"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, border: "1.5px solid #0369a1", background: isNewGroupOpen ? "#0369a1" : "transparent", color: isNewGroupOpen ? "#fff" : "#0369a1", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}
          >
            {isNewGroupOpen ? "Cancel" : "+ New"}
          </button>
        </div>

        {filteredGroups.length === 0 && (
          <div style={{ padding: "14px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--g500)" }}>
              {q ? "No groups match" : "No groups yet"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--g400)", marginTop: 2 }}>
              {q ? "" : "Create one to get started"}
            </div>
          </div>
        )}

        {filteredGroups.map((group) => {
          const active = group.id === selectedGroupId && viewMode === "group";
          const [bgColor, textColor] = active ? ["var(--navy)", "#fff"] : groupColor(group.name);
          const memberCount = group.members?.length || 0;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelectGroup(group.id)}
              style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 11, padding: "10px 14px 10px 16px", background: active ? "linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%)" : "transparent", border: "none", boxShadow: active ? "inset 3px 0 0 var(--navy)" : "inset 3px 0 0 transparent", cursor: "pointer", transition: "background .14s, box-shadow .14s" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: bgColor, color: textColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? "var(--navy)" : "var(--g800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {group.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--g400)", flexShrink: 0 }}>{formatRelativeTime(group.lastMessage?.timestamp)}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--g400)", marginTop: 1 }}>{memberCount} member{memberCount !== 1 ? "s" : ""}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <div style={{ fontSize: 12, color: "var(--g500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {group.lastMessage
                      ? `${group.lastMessage.senderName?.split(" ")[0] || "Someone"}: ${group.lastMessage.message}`
                      : "No messages yet"}
                  </div>
                  {group.unreadCount > 0 && (
                    <span style={{ flexShrink: 0, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#0369a1", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {group.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
