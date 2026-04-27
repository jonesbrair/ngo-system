import React, { useState } from "react";
import { IconBadge } from "../../uiIcons";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatChatTime(value) {
  if (!value) return "";
  const dt = new Date(value);
  const now = new Date();
  const isToday = dt.toDateString() === now.toDateString();
  const time = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const diffDays = Math.floor((now - dt) / 86400000);
  if (diffDays === 1) return `Yesterday ${time}`;
  return `${dt.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function formatRelativeTime(value) {
  if (!value) return "";
  const dt = new Date(value);
  const now = new Date();
  const diffMs = now - dt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return dt.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Props identical to original — no logic change
export default function ChatWindow({
  currentUser,
  activeConversation,
  directMessages,
  activeAnnouncements,
  announcementUnreadCount,
  onSendReply,
  replyDraft,
  onChangeReplyDraft,
  showAnnouncementComposer,
  announcementScope,
  onChangeAnnouncementScope,
  announcementDepartment,
  onChangeAnnouncementDepartment,
  departments,
  announcementDraft,
  onChangeAnnouncementDraft,
  onSendAnnouncement,
}) {
  const [expandedAnnouncementId, setExpandedAnnouncementId] = useState(null);
  const [isAnnouncementsOpen, setIsAnnouncementsOpen] = useState(true);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, height: "100%" }}>

      {/* ════════════════════════════════════════════
          LEFT — Direct message thread
          ════════════════════════════════════════════ */}
      <div style={{ background: "#fff", borderRadius: 18, border: "1px solid var(--g200)", boxShadow: "var(--sh-sm)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* ── Sticky chat header ── */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--g100)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "#fff" }}>
          {activeConversation ? (
            <>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(145deg,#1a3a6b 0%,#0f2744 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {getInitials(activeConversation.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeConversation.name}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--g500)", marginTop: 1 }}>
                  {[activeConversation.position, activeConversation.dept].filter(Boolean).join(" · ") || "Staff"}
                  {activeConversation.email ? ` · ${activeConversation.email}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--g400)" }}>
                {directMessages.length} message{directMessages.length !== 1 ? "s" : ""}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: "var(--g500)", fontWeight: 600 }}>
              Select a conversation
            </div>
          )}
        </div>

        {/* ── Message bubbles ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>

          {!activeConversation && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 300 }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: "var(--g100)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--g400)" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--g600)", marginBottom: 6 }}>No conversation selected</div>
              <div style={{ fontSize: 12.5, color: "var(--g400)", lineHeight: 1.6 }}>
                Choose a colleague from the left panel or use Compose to start a new thread.
              </div>
            </div>
          )}

          {activeConversation && directMessages.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 300 }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: "var(--g100)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--g400)" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--g600)", marginBottom: 6 }}>Start the conversation</div>
              <div style={{ fontSize: 12.5, color: "var(--g400)", lineHeight: 1.6 }}>
                No messages with {activeConversation.name} yet. Say hello below.
              </div>
            </div>
          )}

          {directMessages.map((message, idx) => {
            const isMine = message.senderId === currentUser.id;
            const prevMsg = directMessages[idx - 1];
            const showSender = !prevMsg || prevMsg.senderId !== message.senderId;
            const hasAttachment = !!(message.attachmentUrl || message.attachment);

            return (
              <div
                key={message.id}
                style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "72%", display: "flex", flexDirection: "column", gap: 2, alignItems: isMine ? "flex-end" : "flex-start" }}
              >
                {showSender && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--g400)", marginBottom: 2, paddingLeft: isMine ? 0 : 4, paddingRight: isMine ? 4 : 0 }}>
                    {message.senderName}
                  </div>
                )}
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    background: isMine ? "linear-gradient(145deg,#1a3a6b 0%,#0f2744 100%)" : "#f8fafc",
                    color: isMine ? "#fff" : "var(--g800)",
                    border: isMine ? "none" : "1px solid var(--g200)",
                    boxShadow: isMine ? "0 4px 14px rgba(15,39,68,.18)" : "0 2px 8px rgba(15,23,42,.05)",
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {message.message}
                  {hasAttachment && (
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4, opacity: 0.75, fontSize: 11.5 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      Attachment
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--g400)", paddingLeft: isMine ? 0 : 4, paddingRight: isMine ? 4 : 0 }}>
                  {formatChatTime(message.timestamp)}
                  {isMine && message.status && (
                    <span style={{ marginLeft: 6, textTransform: "capitalize" }}> · {message.status}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Reply bar ── */}
        <div style={{ borderTop: "1px solid var(--g100)", padding: "12px 16px", flexShrink: 0, background: "#fff" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              rows={2}
              placeholder={activeConversation ? `Message ${activeConversation.name}…` : "Select a conversation first"}
              value={replyDraft}
              onChange={(e) => onChangeReplyDraft(e.target.value)}
              disabled={!activeConversation}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSendReply(); }
              }}
              style={{ flex: 1, padding: "9px 12px", borderRadius: 12, border: "1.5px solid var(--g200)", fontSize: 13, color: "var(--g800)", fontFamily: "var(--sans)", outline: "none", resize: "none", minHeight: 42, maxHeight: 120, background: activeConversation ? "#fff" : "var(--g50)", transition: "border-color .15s", lineHeight: 1.5 }}
            />
            <button
              onClick={onSendReply}
              disabled={!activeConversation || !replyDraft.trim()}
              title="Send (Ctrl+Enter)"
              style={{ width: 40, height: 40, borderRadius: 12, border: "none", background: activeConversation && replyDraft.trim() ? "var(--navy)" : "var(--g200)", color: activeConversation && replyDraft.trim() ? "#fff" : "var(--g400)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--g400)", marginTop: 5, textAlign: "right" }}>
            Ctrl+Enter to send
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          RIGHT — HR Announcements panel
          ════════════════════════════════════════════ */}
      <div style={{ background: "#fff", borderRadius: 18, border: "1px solid var(--g200)", boxShadow: "var(--sh-sm)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* ── Announcements header ── */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--g100)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)" }}>HR Announcements</div>
              {announcementUnreadCount > 0 && (
                <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#fef3c7", color: "#b45309", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {announcementUnreadCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setIsAnnouncementsOpen((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--g400)", padding: 4, display: "flex", alignItems: "center" }}
              title={isAnnouncementsOpen ? "Collapse" : "Expand"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                {isAnnouncementsOpen
                  ? <polyline points="18 15 12 9 6 15"/>
                  : <polyline points="6 9 12 15 18 9"/>}
              </svg>
            </button>
          </div>
          {!showAnnouncementComposer && (
            <div style={{ fontSize: 11.5, color: "var(--g500)", marginTop: 3 }}>
              Broadcasts visible to your workspace.
            </div>
          )}
        </div>

        {/* ── Announcement composer (HR/admin only) ── */}
        {showAnnouncementComposer && (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--g100)", background: "#fffbeb", flexShrink: 0, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: ".09em" }}>Publish Announcement</div>
            <select
              value={announcementScope}
              onChange={(e) => onChangeAnnouncementScope(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(217,119,6,.3)", fontSize: 12.5, color: "var(--g800)", background: "#fff", fontFamily: "var(--sans)", outline: "none", width: "100%" }}
            >
              <option value="all">All staff</option>
              <option value="department">Specific department</option>
            </select>
            {announcementScope === "department" && (
              <select
                value={announcementDepartment}
                onChange={(e) => onChangeAnnouncementDepartment(e.target.value)}
                style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(217,119,6,.3)", fontSize: 12.5, color: "var(--g800)", background: "#fff", fontFamily: "var(--sans)", outline: "none", width: "100%" }}
              >
                <option value="">Select department…</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            )}
            <textarea
              rows={3}
              placeholder="Write announcement…"
              value={announcementDraft}
              onChange={(e) => onChangeAnnouncementDraft(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(217,119,6,.3)", fontSize: 12.5, color: "var(--g800)", fontFamily: "var(--sans)", outline: "none", resize: "vertical", minHeight: 68, width: "100%", boxSizing: "border-box" }}
            />
            <button
              onClick={onSendAnnouncement}
              disabled={!announcementDraft.trim() || (announcementScope === "department" && !announcementDepartment)}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: "none", background: "#f59e0b", color: "var(--navy)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: (!announcementDraft.trim() || (announcementScope === "department" && !announcementDepartment)) ? 0.4 : 1, transition: "opacity .15s" }}
            >
              <IconBadge name="notification" tone="amber" size={13} /> Publish
            </button>
          </div>
        )}

        {/* ── Announcements list ── */}
        {isAnnouncementsOpen && (
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {activeAnnouncements.length === 0 && (
              <div style={{ padding: "28px 16px", textAlign: "center" }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--g600)" }}>No announcements yet</div>
                <div style={{ fontSize: 11.5, color: "var(--g400)", marginTop: 4 }}>HR broadcasts will appear here.</div>
              </div>
            )}

            {activeAnnouncements.map((item) => {
              const isExpanded = expandedAnnouncementId === item.id;
              const isUnread = !item.readBy?.includes(currentUser.id);
              const isFirst = activeAnnouncements[0]?.id === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => setExpandedAnnouncementId(isExpanded ? null : item.id)}
                  style={{
                    padding: "11px 13px",
                    borderRadius: 14,
                    background: isExpanded ? "#fffbeb" : isFirst ? "#fefce8" : "#fff",
                    border: `1px solid ${isExpanded ? "rgba(217,119,6,.35)" : isFirst ? "rgba(217,119,6,.22)" : "var(--g200)"}`,
                    cursor: "pointer",
                    transition: "all .15s",
                    position: "relative",
                  }}
                >
                  {/* Pinned / latest indicator */}
                  {isFirst && (
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
                      Latest
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {isUnread && (
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                        )}
                        <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.senderName}
                        </div>
                      </div>
                      <div style={{ fontSize: 10.5, color: "#b45309", marginTop: 2, fontWeight: 600 }}>
                        {item.audienceType === "department" ? `${item.department} dept.` : "All Staff"}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12.5,
                          color: "var(--g700)",
                          lineHeight: 1.55,
                          whiteSpace: isExpanded ? "pre-wrap" : "normal",
                          ...(isExpanded ? {} : {
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }),
                        }}
                      >
                        {item.message}
                      </div>
                    </div>

                    {/* Time + expand chevron */}
                    <div style={{ flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <div style={{ fontSize: 10, color: "var(--g400)" }}>{formatRelativeTime(item.timestamp)}</div>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--g400)" strokeWidth="2.2" strokeLinecap="round">
                        {isExpanded
                          ? <polyline points="18 15 12 9 6 15"/>
                          : <polyline points="6 9 12 15 18 9"/>}
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
