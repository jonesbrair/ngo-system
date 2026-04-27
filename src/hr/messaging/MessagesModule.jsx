import React, { useEffect, useMemo, useState } from "react";
import { IconBadge } from "../../uiIcons";
import { supabase } from "../../lib/supabaseClient";
import ConversationList from "./ConversationList";
import ChatWindow from "./ChatWindow";

// ─── Group / attachment localStorage helpers ──────────────────────────────────
const GROUPS_KEY = "ims-groups";
const groupMsgKey = (id) => `ims-group-messages-${id}`;
const groupReadKey = (uid, gid) => `ims-group-read-${uid}-${gid}`;

function loadGroups() {
  try { return JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]"); } catch { return []; }
}
function saveGroups(groups) {
  try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch {}
}
function loadGroupMessages(groupId) {
  try { return JSON.parse(localStorage.getItem(groupMsgKey(groupId)) || "[]"); } catch { return []; }
}
function saveGroupMessages(groupId, messages) {
  try { localStorage.setItem(groupMsgKey(groupId), JSON.stringify(messages)); } catch {}
}
function getGroupReadTs(uid, gid) {
  try { return localStorage.getItem(groupReadKey(uid, gid)) || ""; } catch { return ""; }
}
function setGroupReadTs(uid, gid) {
  try { localStorage.setItem(groupReadKey(uid, gid), new Date().toISOString()); } catch {}
}

function getThreadStorageKey(userId) {
  return `ims-messages-last-thread-${userId}`;
}
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
  onRefresh,
}) {
  const threadStorageKey = getThreadStorageKey(currentUser.id);

  // ── DM state ─────────────────────────────────────────────────────────────
  const [selectedRecipientId, setSelectedRecipientId] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(threadStorageKey) || "" : "")
  );
  const [composeRecipientId, setComposeRecipientId] = useState("");
  const [composeDraft, setComposeDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");

  // ── Group state ───────────────────────────────────────────────────────────
  const [groups, setGroups] = useState(
    () => loadGroups().filter((g) => g.members.includes(currentUser.id))
  );
  const [groupMessages, setGroupMessages] = useState(() => {
    const all = {};
    loadGroups()
      .filter((g) => g.members.includes(currentUser.id))
      .forEach((g) => { all[g.id] = loadGroupMessages(g.id); });
    return all;
  });
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupReplyDraft, setGroupReplyDraft] = useState("");

  // ── View mode: "dm" | "group" ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState("dm");

  // ── Announcement compose state ────────────────────────────────────────────
  const [announcementScope, setAnnouncementScope] = useState("all");
  const [announcementDepartment, setAnnouncementDepartment] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState("");

  const [toast, setToast] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ── Derived data ──────────────────────────────────────────────────────────
  const employeeByEmail = useMemo(() => (
    employees.reduce((acc, e) => {
      const key = String(e.email || "").toLowerCase();
      if (key) acc[key] = e;
      return acc;
    }, {})
  ), [employees]);

  const directory = useMemo(() => (
    users
      .filter((u) => u.id !== currentUser.id)
      .map((u) => {
        const emp = employeeByEmail[String(u.email || "").toLowerCase()];
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          dept: emp?.department || u.dept || "",
          position: emp?.position || u.jobTitle || "",
          supervisorId: u.supervisorId || emp?.supervisorId || "",
        };
      })
      .filter((p) => allowedRecipientIds.includes(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [allowedRecipientIds, currentUser.id, employeeByEmail, users]);

  const personMap = useMemo(() => makePersonMap(directory), [directory]);

  const relevantAnnouncements = useMemo(() => (
    announcements
      .filter((item) => item.visibleToCurrentUser)
      .map((item) => ({
        ...item,
        senderName: item.senderName || users.find((u) => u.id === item.senderId)?.name || "HR",
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  ), [announcements, users]);

  const announcementUnreadCount = useMemo(() => (
    relevantAnnouncements.filter((item) => !item.readBy?.includes(currentUser.id)).length
  ), [currentUser.id, relevantAnnouncements]);

  const conversations = useMemo(() => {
    const grouped = new Map();
    messages.forEach((msg) => {
      if (msg.senderId !== currentUser.id && msg.receiverId !== currentUser.id) return;
      const partnerId = msg.senderId === currentUser.id ? msg.receiverId : msg.senderId;
      if (!allowedRecipientIds.includes(partnerId)) return;
      const existing = grouped.get(partnerId) || {
        partner: personMap[partnerId] || directory.find((p) => p.id === partnerId) || { id: partnerId, name: "Unknown staff", dept: "", position: "" },
        unreadCount: 0,
        lastMessage: null,
      };
      if (!existing.lastMessage || new Date(msg.timestamp) > new Date(existing.lastMessage.timestamp)) {
        existing.lastMessage = msg;
      }
      if (msg.receiverId === currentUser.id && msg.senderId === partnerId && msg.status !== "read") {
        existing.unreadCount += 1;
      }
      grouped.set(partnerId, existing);
    });
    return Array.from(grouped.values()).sort(
      (a, b) => new Date(b.lastMessage?.timestamp || 0) - new Date(a.lastMessage?.timestamp || 0)
    );
  }, [allowedRecipientIds, currentUser.id, directory, messages, personMap]);

  const groupsWithMeta = useMemo(() => (
    groups.map((g) => {
      const msgs = groupMessages[g.id] || [];
      const lastMsg = msgs[msgs.length - 1] || null;
      const readTs = getGroupReadTs(currentUser.id, g.id);
      const unread = readTs
        ? msgs.filter((m) => m.senderId !== currentUser.id && new Date(m.timestamp) > new Date(readTs)).length
        : msgs.filter((m) => m.senderId !== currentUser.id).length;
      return { ...g, lastMessage: lastMsg, unreadCount: unread };
    })
  ), [currentUser.id, groupMessages, groups]);

  const hasSelectedConversation = !!(
    selectedRecipientId &&
    (personMap[selectedRecipientId] || conversations.some((c) => c.partner.id === selectedRecipientId))
  );
  const resolvedSelectedRecipientId = hasSelectedConversation
    ? selectedRecipientId
    : (conversations[0]?.partner?.id || directory[0]?.id || "");

  const resolvedComposeRecipientId = composeRecipientId && allowedRecipientIds.includes(composeRecipientId)
    ? composeRecipientId
    : resolvedSelectedRecipientId;

  const directMessages = useMemo(() => (
    messages
      .filter((msg) => (
        (msg.senderId === currentUser.id && msg.receiverId === resolvedSelectedRecipientId) ||
        (msg.receiverId === currentUser.id && msg.senderId === resolvedSelectedRecipientId)
      ))
      .map((msg) => ({
        ...msg,
        senderName: msg.senderId === currentUser.id ? currentUser.name : (personMap[msg.senderId]?.name || "Staff"),
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  ), [currentUser.id, currentUser.name, messages, personMap, resolvedSelectedRecipientId]);

  const activeConversation = resolvedSelectedRecipientId
    ? (personMap[resolvedSelectedRecipientId] || directory.find((p) => p.id === resolvedSelectedRecipientId) || null)
    : null;

  const activeGroup = selectedGroupId ? groups.find((g) => g.id === selectedGroupId) || null : null;

  const activeGroupMessages = useMemo(() => (
    selectedGroupId
      ? [...(groupMessages[selectedGroupId] || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      : []
  ), [groupMessages, selectedGroupId]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !resolvedSelectedRecipientId) return;
    localStorage.setItem(threadStorageKey, resolvedSelectedRecipientId);
  }, [resolvedSelectedRecipientId, threadStorageKey]);

  useEffect(() => {
    if (resolvedSelectedRecipientId && viewMode === "dm") onMarkConversationRead(resolvedSelectedRecipientId);
  }, [onMarkConversationRead, resolvedSelectedRecipientId, viewMode]);

  useEffect(() => {
    if (relevantAnnouncements.length) onMarkAnnouncementsRead();
  }, [onMarkAnnouncementsRead, relevantAnnouncements.length]);

  useEffect(() => {
    const timer = window.setInterval(() => { onRefresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [onRefresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (viewMode === "group" && selectedGroupId) {
      setGroupReadTs(currentUser.id, selectedGroupId);
      setGroups((prev) => [...prev]);
    }
  }, [currentUser.id, selectedGroupId, viewMode]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const uploadAttachment = async (file) => {
    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${currentUser.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { upsert: true });
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

  const sendDM = (receiverId, text) => {
    const result = onSendMessage(receiverId, text);
    if (result?.ok) {
      setToast("Message sent.");
      setSelectedRecipientId(receiverId);
      setComposeRecipientId(receiverId);
    } else if (result?.message) {
      setToast(result.message);
    }
  };

  const handleSendFromComposer = () => {
    if (!resolvedComposeRecipientId || !composeDraft.trim()) return;
    sendDM(resolvedComposeRecipientId, composeDraft);
    setComposeDraft("");
  };

  const handleSendReply = async (text, file) => {
    if (!resolvedSelectedRecipientId) return;
    let msgText = text !== undefined ? text : replyDraft;
    if (!msgText.trim() && !file) return;
    if (file) {
      const url = await uploadAttachment(file);
      if (!url) return;
      const attach = `[📎 ${file.name}](${url})`;
      msgText = msgText.trim() ? `${msgText.trim()}\n${attach}` : attach;
    }
    sendDM(resolvedSelectedRecipientId, msgText);
    setReplyDraft("");
  };

  const handleSendGroupMessage = async (text, file) => {
    if (!selectedGroupId) return;
    let msgText = text !== undefined ? text : groupReplyDraft;
    if (!msgText.trim() && !file) return;
    if (file) {
      const url = await uploadAttachment(file);
      if (!url) return;
      const attach = `[📎 ${file.name}](${url})`;
      msgText = msgText.trim() ? `${msgText.trim()}\n${attach}` : attach;
    }
    const newMsg = {
      id: `gm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      groupId: selectedGroupId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      message: msgText.trim(),
      timestamp: new Date().toISOString(),
    };
    const updated = [...loadGroupMessages(selectedGroupId), newMsg];
    saveGroupMessages(selectedGroupId, updated);
    setGroupMessages((prev) => ({ ...prev, [selectedGroupId]: updated }));
    setGroupReplyDraft("");
    setGroupReadTs(currentUser.id, selectedGroupId);
  };

  const handleCreateGroup = (name, memberIds) => {
    const newGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      members: [currentUser.id, ...memberIds.filter((id) => id !== currentUser.id)],
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    const all = loadGroups();
    all.push(newGroup);
    saveGroups(all);
    setGroups((prev) => [...prev, newGroup]);
    setGroupMessages((prev) => ({ ...prev, [newGroup.id]: [] }));
    setSelectedGroupId(newGroup.id);
    setViewMode("group");
    setToast(`Group "${name}" created.`);
  };

  const handleSendAnnouncement = () => {
    const result = onSendAnnouncement(announcementScope, announcementDepartment, announcementDraft);
    if (result?.ok) {
      setAnnouncementDraft("");
      setAnnouncementDepartment("");
      setAnnouncementScope("all");
      setToast("Announcement published.");
    } else if (result?.message) {
      setToast(result.message);
    }
  };

  const totalGroupUnread = groupsWithMeta.reduce((sum, g) => sum + (g.unreadCount || 0), 0);
  const totalUnread = unreadCount + totalGroupUnread;

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div className="page-title">Messages Center</div>
          <div className="page-sub">Internal staff conversations, group chats, and HR announcements.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0, background: "#fff", border: "1px solid var(--g200)", borderRadius: 14, boxShadow: "var(--sh-sm)", flexShrink: 0, overflow: "hidden" }}>
          {[
            { label: "Unread", value: totalUnread, color: totalUnread > 0 ? "var(--navy)" : "var(--g400)" },
            { label: "Colleagues", value: directory.length, color: "var(--navy)" },
            { label: "Groups", value: groups.length, color: "var(--navy)" },
            { label: "Announcements", value: relevantAnnouncements.length, color: announcementUnreadCount > 0 ? "#b45309" : "var(--navy)" },
          ].map((stat, i) => (
            <div key={stat.label} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ width: 1, height: 36, background: "var(--g100)" }} />}
              <div style={{ padding: "10px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: stat.color, fontFamily: "var(--serif)", lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: "var(--g500)", fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: ".07em" }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 12, background: "#f0fdf9", border: "1px solid rgba(16,185,129,.2)", color: "#065f46", fontSize: 13, fontWeight: 600, marginBottom: 14, boxShadow: "0 2px 8px rgba(16,185,129,.1)" }}>
          <IconBadge name="notification" tone="teal" size={13} /> {toast}
        </div>
      )}

      {/* ── Main layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0,1fr)", gap: 16, flex: 1, height: "calc(100vh - 240px)", minHeight: 520 }}>
        <ConversationList
          conversations={conversations}
          groups={groupsWithMeta}
          viewMode={viewMode}
          selectedRecipientId={viewMode === "dm" ? resolvedSelectedRecipientId : null}
          selectedGroupId={viewMode === "group" ? selectedGroupId : null}
          onSelectConversation={(recipientId) => {
            setSelectedRecipientId(recipientId);
            setComposeRecipientId(recipientId);
            setViewMode("dm");
          }}
          onSelectGroup={(groupId) => {
            setSelectedGroupId(groupId);
            setViewMode("group");
          }}
          onCreateGroup={handleCreateGroup}
          allowedRecipients={directory}
          composeRecipientId={resolvedComposeRecipientId}
          onChangeComposeRecipient={setComposeRecipientId}
          draft={composeDraft}
          onChangeDraft={setComposeDraft}
          onSend={handleSendFromComposer}
          currentUserId={currentUser.id}
        />

        <ChatWindow
          currentUser={currentUser}
          viewMode={viewMode}
          activeConversation={activeConversation}
          directMessages={directMessages}
          activeGroup={activeGroup}
          activeGroupMessages={activeGroupMessages}
          groupDirectory={directory}
          activeAnnouncements={relevantAnnouncements}
          announcementUnreadCount={announcementUnreadCount}
          onSendReply={handleSendReply}
          onSendGroupMessage={handleSendGroupMessage}
          replyDraft={replyDraft}
          onChangeReplyDraft={setReplyDraft}
          groupReplyDraft={groupReplyDraft}
          onChangeGroupReplyDraft={setGroupReplyDraft}
          isUploading={isUploading}
          showAnnouncementComposer={canPublishAnnouncements}
          announcementScope={announcementScope}
          onChangeAnnouncementScope={setAnnouncementScope}
          announcementDepartment={announcementDepartment}
          onChangeAnnouncementDepartment={setAnnouncementDepartment}
          departments={departments}
          announcementDraft={announcementDraft}
          onChangeAnnouncementDraft={setAnnouncementDraft}
          onSendAnnouncement={handleSendAnnouncement}
        />
      </div>
    </div>
  );
}
