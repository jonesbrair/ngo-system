import React from "react";
import { IconBadge } from "../../uiIcons";

function formatPreviewTime(value) {
  if (!value) return "";
  const dt = new Date(value);
  return dt.toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}

export default function ConversationList({
  conversations,
  selectedRecipientId,
  onSelectConversation,
  allowedRecipients,
  composeRecipientId,
  onChangeComposeRecipient,
  draft,
  onChangeDraft,
  onSend,
}) {
  return (
    <div className="card" style={{ height:"100%" }}>
      <div className="card-body" style={{ display:"flex", flexDirection:"column", gap:18, height:"100%" }}>
        <div>
          <div style={{ fontFamily:"var(--serif)", fontSize:20, color:"var(--navy)", fontWeight:800 }}>Messages</div>
          <div style={{ color:"var(--g500)", fontSize:13, marginTop:4 }}>
            Start a conversation or pick an existing thread.
          </div>
        </div>

        <div style={{ display:"grid", gap:10, padding:14, border:"1px solid var(--line)", borderRadius:20, background:"#fbfcfe" }}>
          <select
            className="input"
            value={composeRecipientId}
            onChange={(e) => onChangeComposeRecipient(e.target.value)}
          >
            <option value="">Select recipient</option>
            {allowedRecipients.map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.name} {recipient.position ? `· ${recipient.position}` : ""}
              </option>
            ))}
          </select>
          <textarea
            className="input"
            rows={4}
            placeholder="Write a message"
            value={draft}
            onChange={(e) => onChangeDraft(e.target.value)}
            style={{ resize:"vertical", minHeight:108 }}
          />
          <button className="btn btn-primary" onClick={onSend} disabled={!composeRecipientId || !draft.trim()}>
            <IconBadge name="com" tone="teal" size={14} /> Send Message
          </button>
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontWeight:700, color:"var(--navy)" }}>Recent conversations</div>
          <div style={{ fontSize:12, color:"var(--g500)" }}>{conversations.length} thread{conversations.length !== 1 ? "s" : ""}</div>
        </div>

        <div style={{ display:"grid", gap:10, overflowY:"auto", paddingRight:2 }}>
          {conversations.length === 0 && (
            <div style={{ padding:18, border:"1px dashed var(--line)", borderRadius:18, color:"var(--g500)", fontSize:13 }}>
              No conversations yet. Send the first message from the composer above.
            </div>
          )}

          {conversations.map((item) => {
            const active = item.partner.id === selectedRecipientId;
            return (
              <button
                key={item.partner.id}
                type="button"
                onClick={() => onSelectConversation(item.partner.id)}
                style={{
                  textAlign:"left",
                  border: active ? "1px solid rgba(34,199,184,.4)" : "1px solid var(--line)",
                  background: active ? "linear-gradient(145deg,#f0fdfa 0%,#f8fafc 100%)" : "#fff",
                  borderRadius:18,
                  padding:"14px 15px",
                  boxShadow: active ? "0 14px 28px rgba(15,118,110,.10)" : "0 10px 22px rgba(15,23,42,.04)",
                  cursor:"pointer",
                }}
              >
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ fontWeight:700, color:"var(--navy)" }}>{item.partner.name}</div>
                      {item.unreadCount > 0 && (
                        <span style={{ minWidth:20, height:20, padding:"0 6px", borderRadius:999, background:"#dcfce7", color:"#166534", fontSize:11, fontWeight:800, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                          {item.unreadCount}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:"var(--g500)", marginTop:2 }}>
                      {item.partner.position || item.partner.dept || "Staff"}
                    </div>
                    <div style={{ fontSize:13, color:"var(--g700)", marginTop:8, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                      {item.lastMessage?.message || "No messages yet"}
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:11, color:"var(--g500)" }}>{formatPreviewTime(item.lastMessage?.timestamp)}</div>
                    <div style={{ fontSize:11, color:"var(--g500)", marginTop:10 }}>{item.lastMessage?.status || ""}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
