import React from "react";
import { IconBadge } from "../../uiIcons";

function formatMessageTime(value) {
  if (!value) return "";
  const dt = new Date(value);
  return dt.toLocaleString([], {
    year:"numeric",
    month:"short",
    day:"numeric",
    hour:"2-digit",
    minute:"2-digit",
  });
}

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
  return (
    <div className="card" style={{ height:"100%" }}>
      <div className="card-body" style={{ display:"flex", flexDirection:"column", gap:18, height:"100%" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div>
            <div style={{ fontFamily:"var(--serif)", fontSize:22, color:"var(--navy)", fontWeight:800 }}>
              {activeConversation ? activeConversation.name : "Select a conversation"}
            </div>
            <div style={{ color:"var(--g500)", fontSize:13, marginTop:4 }}>
              {activeConversation
                ? `${activeConversation.position || activeConversation.dept || "Staff"}${activeConversation.email ? ` · ${activeConversation.email}` : ""}`
                : "Choose a conversation from the left to view the chat thread."}
            </div>
          </div>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:999, background:"#f8fafc", border:"1px solid var(--line)", color:"var(--g600)", fontSize:12, fontWeight:700 }}>
              <IconBadge name="notification" tone="teal" size={13} />
              {announcementUnreadCount} unread announcement{announcementUnreadCount !== 1 ? "s" : ""}
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1.35fr .95fr", gap:18, flex:1, minHeight:0 }}>
          <div style={{ border:"1px solid var(--line)", borderRadius:22, background:"#fbfcfe", display:"flex", flexDirection:"column", minHeight:0 }}>
            <div style={{ padding:"16px 18px", borderBottom:"1px solid var(--line)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight:700, color:"var(--navy)" }}>Conversation thread</div>
              <div style={{ fontSize:12, color:"var(--g500)" }}>{directMessages.length} message{directMessages.length !== 1 ? "s" : ""}</div>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:18, display:"flex", flexDirection:"column", gap:12 }}>
              {!activeConversation && (
                <div style={{ margin:"auto", maxWidth:420, textAlign:"center", color:"var(--g500)" }}>
                  Direct messages will appear here once you select a colleague.
                </div>
              )}

              {activeConversation && directMessages.length === 0 && (
                <div style={{ margin:"auto", maxWidth:420, textAlign:"center", color:"var(--g500)" }}>
                  No messages in this thread yet. Start the conversation below.
                </div>
              )}

              {directMessages.map((message) => {
                const isMine = message.senderId === currentUser.id;
                return (
                  <div
                    key={message.id}
                    style={{
                      alignSelf: isMine ? "flex-end" : "flex-start",
                      maxWidth:"78%",
                      padding:"14px 16px",
                      borderRadius:22,
                      background: isMine ? "linear-gradient(145deg,#173a68 0%,#0f2744 100%)" : "#fff",
                      color: isMine ? "#fff" : "var(--g800)",
                      border: isMine ? "none" : "1px solid var(--line)",
                      boxShadow: isMine ? "0 18px 36px rgba(15,39,68,.16)" : "0 12px 24px rgba(15,23,42,.05)",
                    }}
                  >
                    <div style={{ fontSize:12, fontWeight:700, opacity:isMine ? 0.86 : 0.72, marginBottom:8 }}>
                      {message.senderName}
                    </div>
                    <div style={{ whiteSpace:"pre-wrap", lineHeight:1.6, fontSize:14 }}>{message.message}</div>
                    <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", gap:12, fontSize:11, opacity:isMine ? 0.82 : 0.62 }}>
                      <span>{formatMessageTime(message.timestamp)}</span>
                      <span style={{ textTransform:"capitalize" }}>{message.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop:"1px solid var(--line)", padding:16, display:"grid", gap:10 }}>
              <textarea
                className="input"
                rows={4}
                placeholder={activeConversation ? `Message ${activeConversation.name}` : "Select a conversation first"}
                value={replyDraft}
                onChange={(e) => onChangeReplyDraft(e.target.value)}
                disabled={!activeConversation}
                style={{ resize:"vertical", minHeight:110 }}
              />
              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                <button className="btn btn-primary" onClick={onSendReply} disabled={!activeConversation || !replyDraft.trim()}>
                  <IconBadge name="com" tone="teal" size={14} /> Send Reply
                </button>
              </div>
            </div>
          </div>

          <div style={{ border:"1px solid var(--line)", borderRadius:22, background:"#fffaf0", display:"flex", flexDirection:"column", minHeight:0 }}>
            <div style={{ padding:"16px 18px", borderBottom:"1px solid rgba(217,119,6,.12)" }}>
              <div style={{ fontWeight:700, color:"var(--navy)" }}>HR announcements</div>
              <div style={{ fontSize:12, color:"var(--g500)", marginTop:4 }}>
                {showAnnouncementComposer ? "Send to all staff or target one department." : "Announcements sent to you appear here."}
              </div>
            </div>

            {showAnnouncementComposer && (
              <div style={{ padding:16, display:"grid", gap:10, borderBottom:"1px solid rgba(217,119,6,.12)" }}>
                <select className="input" value={announcementScope} onChange={(e) => onChangeAnnouncementScope(e.target.value)}>
                  <option value="all">All staff</option>
                  <option value="department">Specific department</option>
                </select>
                {announcementScope === "department" && (
                  <select className="input" value={announcementDepartment} onChange={(e) => onChangeAnnouncementDepartment(e.target.value)}>
                    <option value="">Select department</option>
                    {departments.map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                )}
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Write announcement"
                  value={announcementDraft}
                  onChange={(e) => onChangeAnnouncementDraft(e.target.value)}
                  style={{ resize:"vertical", minHeight:108 }}
                />
                <button
                  className="btn btn-amber"
                  onClick={onSendAnnouncement}
                  disabled={!announcementDraft.trim() || (announcementScope === "department" && !announcementDepartment)}
                >
                  <IconBadge name="notification" tone="amber" size={14} /> Publish Announcement
                </button>
              </div>
            )}

            <div style={{ padding:"14px 16px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight:700, color:"var(--navy)" }}>Latest announcements</div>
              <div style={{ fontSize:12, color:"var(--g500)" }}>{activeAnnouncements.length} item{activeAnnouncements.length !== 1 ? "s" : ""}</div>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:16, display:"grid", gap:10 }}>
              {activeAnnouncements.length === 0 && (
                <div style={{ padding:16, border:"1px dashed rgba(217,119,6,.22)", borderRadius:18, color:"var(--g500)", fontSize:13, background:"rgba(255,255,255,.7)" }}>
                  No announcements yet.
                </div>
              )}
              {activeAnnouncements.map((item) => (
                <div key={item.id} style={{ padding:14, borderRadius:18, background:"#fff", border:"1px solid rgba(217,119,6,.14)", boxShadow:"0 12px 24px rgba(217,119,6,.06)" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                    <div style={{ fontWeight:700, color:"var(--navy)" }}>{item.senderName}</div>
                    <div style={{ fontSize:11, color:"var(--g500)" }}>{formatMessageTime(item.timestamp)}</div>
                  </div>
                  <div style={{ fontSize:12, color:"#b45309", marginTop:6, fontWeight:700 }}>
                    {item.audienceType === "department" ? `${item.department} department` : "All staff"}
                  </div>
                  <div style={{ marginTop:8, color:"var(--g700)", lineHeight:1.6, fontSize:14, whiteSpace:"pre-wrap" }}>{item.message}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
