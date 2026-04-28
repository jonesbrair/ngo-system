import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ChatWindow from "./ChatWindow";

const GROUPS_KEY      = "ims-groups";
const pinnedKey       = (uid) => `ims-pinned-threads-${uid}`;
const groupMsgKey     = (id)  => `ims-group-messages-${id}`;
const groupReadKey    = (uid, gid) => `ims-group-read-${uid}-${gid}`;
const lastThreadKey   = (uid) => `ims-last-thread-${uid}`;

function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
function lsSet(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function lsStr(k)      { try { return localStorage.getItem(k) || ""; } catch { return ""; } }
function lsStrSet(k,v) { try { localStorage.setItem(k, v); } catch {} }

function loadGroups()              { return lsGet(GROUPS_KEY, []); }
function saveGroups(g)             { lsSet(GROUPS_KEY, g); }
function loadGroupMessages(id)     { return lsGet(groupMsgKey(id), []); }
function saveGroupMessages(id, ms) { lsSet(groupMsgKey(id), ms); }
function getGroupReadTs(uid, gid)  { return lsStr(groupReadKey(uid, gid)); }
function setGroupReadTs(uid, gid)  { lsStrSet(groupReadKey(uid, gid), new Date().toISOString()); }
function loadPinned(uid)           { return lsGet(pinnedKey(uid), []); }
function savePinned(uid, ids)      { lsSet(pinnedKey(uid), ids); }

function makePersonMap(people) {
  return people.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
}

export default function MessagesModule({
  currentUser,
  users,
  employees,
  departments,
  messages,
  announcements,
  unreadCount,
  allowedRecipientIds,
  canPublishAnnouncements,
  onSendMessage,
  onSendAnnouncement,
  onMarkConversationRead,
  onMarkAnnouncementsRead,
  onAcknowledgeAnnouncement,
  onRefresh,
}) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [selectedThreadId, setSelectedThreadId] = useState(
    () => lsStr(lastThreadKey(currentUser.id))
  );
  const [groups, setGroups] = useState(
    () => loadGroups().filter(g => g.members.includes(currentUser.id))
  );
  const [groupMessages, setGroupMessages] = useState(() => {
    const all = {};
    loadGroups().filter(g => g.members.includes(currentUser.id))
      .forEach(g => { all[g.id] = loadGroupMessages(g.id); });
    return all;
  });
  const [pinnedIds, setPinnedIds] = useState(() => loadPinned(currentUser.id));

  // Per-thread-type drafts
  const [dmDraft,    setDmDraft]    = useState("");
  const [groupDraft, setGroupDraft] = useState("");
  const [annDraft,   setAnnDraft]   = useState("");
  const [annScope,   setAnnScope]   = useState("all");
  const [annDept,    setAnnDept]    = useState("");

  // Reply-to
  const [replyTo, setReplyTo] = useState(null);

  const [toast,       setToast]       = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ── Directory ────────────────────────────────────────────────────────────────
  const employeeByEmail = useMemo(() =>
    employees.reduce((acc, e) => {
      const k = String(e.email || "").toLowerCase();
      if (k) acc[k] = e;
      return acc;
    }, {}),
  [employees]);

  const directory = useMemo(() =>
    users
      .filter(u => u.id !== currentUser.id)
      .map(u => {
        const emp = employeeByEmail[String(u.email || "").toLowerCase()];
        return {
          id:         u.id,
          name:       u.name,
          email:      u.email,
          dept:       emp?.department || u.dept || "",
          position:   emp?.position   || u.jobTitle || "",
          supervisorId: u.supervisorId || emp?.supervisorId || "",
        };
      })
      .filter(p => allowedRecipientIds.includes(p.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  [allowedRecipientIds, currentUser.id, employeeByEmail, users]);

  const personMap = useMemo(() => makePersonMap(directory), [directory]);

  // ── Build unified thread list ─────────────────────────────────────────────
  const dmThreads = useMemo(() => {
    const grouped = new Map();
    messages.forEach(msg => {
      if (msg.senderId !== currentUser.id && msg.receiverId !== currentUser.id) return;
      const partnerId = msg.senderId === currentUser.id ? msg.receiverId : msg.senderId;
      if (!allowedRecipientIds.includes(partnerId)) return;
      const partner = personMap[partnerId] || directory.find(p => p.id === partnerId)
        || { id: partnerId, name: "Unknown", dept: "", position: "" };
      const existing = grouped.get(partnerId) || { partner, unreadCount: 0, lastMsg: null };
      if (!existing.lastMsg || new Date(msg.timestamp) > new Date(existing.lastMsg.timestamp))
        existing.lastMsg = msg;
      if (msg.receiverId === currentUser.id && msg.senderId === partnerId && msg.status !== "read")
        existing.unreadCount++;
      grouped.set(partnerId, existing);
    });
    return Array.from(grouped.values()).map(({ partner, unreadCount: uc, lastMsg }) => ({
      id:              partner.id,
      type:            "dm",
      name:            partner.name,
      subtitle:        [partner.position, partner.dept].filter(Boolean).join(" · ") || "Staff",
      lastMessage:     lastMsg,
      lastMessageText: lastMsg
        ? (lastMsg.senderId === currentUser.id ? `You: ${lastMsg.message}` : lastMsg.message)
        : "",
      lastMessageTs:   lastMsg?.timestamp || "",
      unreadCount:     uc,
      partner,
    }));
  }, [allowedRecipientIds, currentUser.id, directory, messages, personMap]);

  const groupThreads = useMemo(() =>
    groups.map(g => {
      const msgs    = groupMessages[g.id] || [];
      const lastMsg = msgs[msgs.length - 1] || null;
      const readTs  = getGroupReadTs(currentUser.id, g.id);
      const uc = readTs
        ? msgs.filter(m => m.senderId !== currentUser.id && new Date(m.timestamp) > new Date(readTs)).length
        : msgs.filter(m => m.senderId !== currentUser.id).length;
      const members = directory.filter(p => g.members.includes(p.id));
      return {
        id:              g.id,
        type:            "group",
        name:            g.name,
        subtitle:        `${g.members.length} member${g.members.length !== 1 ? "s" : ""}`,
        lastMessage:     lastMsg,
        lastMessageText: lastMsg
          ? (lastMsg.senderId === currentUser.id
              ? `You: ${lastMsg.message}`
              : `${lastMsg.senderName?.split(" ")[0] || "Someone"}: ${lastMsg.message}`)
          : "No messages yet",
        lastMessageTs: lastMsg?.timestamp || g.createdAt || "",
        unreadCount:   uc,
        group:         g,
        members,
      };
    }),
  [currentUser.id, directory, groupMessages, groups]);

  const announcementThread = useMemo(() => {
    const sorted  = [...announcements].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latest  = sorted[0] || null;
    const uc      = sorted.filter(a => !a.readBy?.includes(currentUser.id)).length;
    return {
      id:              "announcements",
      type:            "channel",
      name:            "HR Announcements",
      subtitle:        "Broadcast channel",
      lastMessage:     latest,
      lastMessageText: latest ? latest.message : "",
      lastMessageTs:   latest?.timestamp || "",
      unreadCount:     uc,
    };
  }, [announcements, currentUser.id]);

  const allThreads = useMemo(() => {
    const list = [announcementThread, ...dmThreads, ...groupThreads];
    return list.sort((a, b) => {
      if (!a.lastMessageTs && !b.lastMessageTs) return 0;
      if (!a.lastMessageTs) return 1;
      if (!b.lastMessageTs) return -1;
      return new Date(b.lastMessageTs) - new Date(a.lastMessageTs);
    });
  }, [announcementThread, dmThreads, groupThreads]);

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    // Check existing threads first
    const found = allThreads.find(t => t.id === selectedThreadId);
    if (found) return found;
    // New DM with someone who has no messages yet — build a virtual thread
    const person = directory.find(p => p.id === selectedThreadId);
    if (person) {
      return {
        id:              person.id,
        type:            "dm",
        name:            person.name,
        subtitle:        [person.position, person.dept].filter(Boolean).join(" · ") || "Staff",
        lastMessage:     null,
        lastMessageText: "",
        lastMessageTs:   "",
        unreadCount:     0,
        partner:         person,
      };
    }
    return null;
  }, [allThreads, selectedThreadId, directory]);

  // ── Active messages for selected thread ──────────────────────────────────
  const activeMessages = useMemo(() => {
    if (!selectedThread) return [];

    if (selectedThread.type === "dm") {
      return messages
        .filter(msg =>
          (msg.senderId === currentUser.id && msg.receiverId === selectedThread.id) ||
          (msg.receiverId === currentUser.id && msg.senderId === selectedThread.id)
        )
        .map(msg => ({
          ...msg,
          senderName: msg.senderId === currentUser.id
            ? currentUser.name
            : (personMap[msg.senderId]?.name || "Staff"),
        }))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    if (selectedThread.type === "group") {
      return [...(groupMessages[selectedThread.id] || [])]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    if (selectedThread.type === "channel") {
      return [...announcements]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map(a => ({
          id:          a.id,
          senderId:    a.senderId,
          senderName:  users.find(u => u.id === a.senderId)?.name || "HR",
          message:     a.message,
          timestamp:   a.timestamp,
          audienceType: a.audienceType,
          department:  a.department,
          readBy:      a.readBy || [],
          type:        "announcement",
        }));
    }
    return [];
  }, [selectedThread, messages, currentUser.id, currentUser.name, personMap, groupMessages, announcements, users]);

  // ── Side effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedThreadId) lsStrSet(lastThreadKey(currentUser.id), selectedThreadId);
  }, [selectedThreadId, currentUser.id]);

  useEffect(() => {
    if (selectedThread?.type === "dm") onMarkConversationRead(selectedThread.id);
  }, [selectedThread?.id, selectedThread?.type, onMarkConversationRead]);

  useEffect(() => {
    if (selectedThread?.type === "group" && selectedThread.id) {
      setGroupReadTs(currentUser.id, selectedThread.id);
      setGroups(prev => [...prev]);
    }
  }, [currentUser.id, selectedThread?.id, selectedThread?.type]);

  useEffect(() => {
    const t = window.setInterval(() => onRefresh(), 5000);
    return () => window.clearInterval(t);
  }, [onRefresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ── Attachment upload ─────────────────────────────────────────────────────
  const uploadAttachment = async (file) => {
    setIsUploading(true);
    try {
      const ext  = file.name.split(".").pop();
      const path = `${currentUser.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      setToast("Upload failed: " + (err.message || "Unknown error"));
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectThread = useCallback((threadId) => {
    setSelectedThreadId(threadId);
    setReplyTo(null);
  }, []);

  const handlePinThread = useCallback((threadId) => {
    setPinnedIds(prev => {
      const next = prev.includes(threadId)
        ? prev.filter(id => id !== threadId)
        : [...prev, threadId];
      savePinned(currentUser.id, next);
      return next;
    });
  }, [currentUser.id]);

  const getDraft    = () => {
    if (!selectedThread) return "";
    if (selectedThread.type === "dm")      return dmDraft;
    if (selectedThread.type === "group")   return groupDraft;
    if (selectedThread.type === "channel") return annDraft;
    return "";
  };
  const setDraft = (text) => {
    if (!selectedThread) return;
    if (selectedThread.type === "dm")      setDmDraft(text);
    else if (selectedThread.type === "group")   setGroupDraft(text);
    else if (selectedThread.type === "channel") setAnnDraft(text);
  };

  const handleSend = async (text, file) => {
    if (!selectedThread) return;
    let msgText = (text !== undefined ? text : getDraft());
    if (!msgText.trim() && !file) return;

    if (file) {
      const url = await uploadAttachment(file);
      if (!url) return;
      const attachment = `[📎 ${file.name}](${url})`;
      msgText = msgText.trim() ? `${msgText.trim()}\n${attachment}` : attachment;
    }

    // Prepend reply-to quote
    if (replyTo) {
      const preview = (replyTo.message || "").slice(0, 100);
      msgText = `[↩ ${replyTo.senderName || "Unknown"}: "${preview}"]\n${msgText.trim()}`;
    }

    const finalText = msgText.trim();
    setReplyTo(null);

    if (selectedThread.type === "dm") {
      const result = onSendMessage(selectedThread.id, finalText);
      if (result?.ok)      setToast("Message sent.");
      else if (result?.message) setToast(result.message);
      setDmDraft("");
    } else if (selectedThread.type === "group") {
      const newMsg = {
        id:        `gm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        groupId:   selectedThread.id,
        senderId:  currentUser.id,
        senderName: currentUser.name,
        message:   finalText,
        timestamp: new Date().toISOString(),
      };
      const updated = [...loadGroupMessages(selectedThread.id), newMsg];
      saveGroupMessages(selectedThread.id, updated);
      setGroupMessages(prev => ({ ...prev, [selectedThread.id]: updated }));
      setGroupReadTs(currentUser.id, selectedThread.id);
      setGroups(prev => [...prev]);
      setGroupDraft("");
    } else if (selectedThread.type === "channel") {
      const result = onSendAnnouncement(annScope, annDept, finalText);
      if (result?.ok) {
        setAnnDraft(""); setAnnScope("all"); setAnnDept("");
        setToast("Announcement published.");
      } else if (result?.message) setToast(result.message);
    }
  };

  const handleCreateGroup = (name, memberIds) => {
    const newGroup = {
      id:        `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name:      name.trim(),
      members:   [currentUser.id, ...memberIds.filter(id => id !== currentUser.id)],
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    const all = loadGroups();
    all.push(newGroup);
    saveGroups(all);
    setGroups(prev => [...prev, newGroup]);
    setGroupMessages(prev => ({ ...prev, [newGroup.id]: [] }));
    setSelectedThreadId(newGroup.id);
    setToast(`Group "${name}" created.`);
  };

  const handleAcknowledge = useCallback((announcementId) => {
    if (onAcknowledgeAnnouncement) onAcknowledgeAnnouncement(announcementId);
    else onMarkAnnouncementsRead();
    setToast("Acknowledged.");
  }, [onAcknowledgeAnnouncement, onMarkAnnouncementsRead]);

  const totalUnread =
    (unreadCount || 0) +
    groupThreads.reduce((s, g) => s + (g.unreadCount || 0), 0) +
    announcementThread.unreadCount;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div className="page-title">Messages</div>
          <div className="page-sub">Internal conversations, groups, and HR broadcasts.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", background: "#fff", border: "1px solid var(--g200)", borderRadius: 14, boxShadow: "var(--sh-sm)", flexShrink: 0, overflow: "hidden" }}>
          {[
            { label: "Unread",     value: totalUnread,     color: totalUnread > 0 ? "var(--navy)" : "var(--g400)" },
            { label: "Colleagues", value: directory.length, color: "var(--navy)" },
            { label: "Groups",     value: groups.length,   color: "var(--navy)" },
          ].map((s, i) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ width: 1, height: 36, background: "var(--g100)" }} />}
              <div style={{ padding: "10px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: "var(--serif)", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "var(--g500)", fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: ".07em" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 12, background: "#f0fdf9", border: "1px solid rgba(16,185,129,.2)", color: "#065f46", fontSize: 13, fontWeight: 600, marginBottom: 14, boxShadow: "0 2px 8px rgba(16,185,129,.1)" }}>
          ✓ {toast}
        </div>
      )}

      <div style={{ flex: 1, height: "calc(100vh - 240px)", minHeight: 520 }}>
        <ChatWindow
          currentUser={currentUser}
          allThreads={allThreads}
          pinnedIds={pinnedIds}
          selectedThreadId={selectedThreadId}
          selectedThread={selectedThread}
          activeMessages={activeMessages}
          onSelectThread={handleSelectThread}
          onPinThread={handlePinThread}
          onCreateGroup={handleCreateGroup}
          allowedRecipients={directory}
          draft={getDraft()}
          onChangeDraft={setDraft}
          onSend={handleSend}
          isUploading={isUploading}
          replyTo={replyTo}
          onSetReplyTo={setReplyTo}
          onClearReplyTo={() => setReplyTo(null)}
          canPublishAnnouncements={canPublishAnnouncements}
          annScope={annScope}
          onChangeAnnScope={setAnnScope}
          annDept={annDept}
          onChangeAnnDept={setAnnDept}
          departments={departments}
          onAcknowledge={handleAcknowledge}
        />
      </div>
    </div>
  );
}
