import React, { useEffect, useMemo, useState } from "react";
import { IconBadge } from "../../uiIcons";
import ConversationList from "./ConversationList";
import ChatWindow from "./ChatWindow";

function getThreadStorageKey(userId) {
  return `ims-messages-last-thread-${userId}`;
}

function makePersonMap(people) {
  return people.reduce((acc, person) => {
    acc[person.id] = person;
    return acc;
  }, {});
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
  const savedRecipientId = typeof window === "undefined"
    ? ""
    : (window.localStorage.getItem(threadStorageKey) || "");
  const [selectedRecipientId, setSelectedRecipientId] = useState(savedRecipientId);
  const [composeRecipientId, setComposeRecipientId] = useState(savedRecipientId);
  const [composeDraft, setComposeDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [announcementScope, setAnnouncementScope] = useState("all");
  const [announcementDepartment, setAnnouncementDepartment] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [toast, setToast] = useState("");

  const employeeByEmail = useMemo(() => (
    employees.reduce((acc, employee) => {
      const key = String(employee.email || "").toLowerCase();
      if (key) acc[key] = employee;
      return acc;
    }, {})
  ), [employees]);

  const directory = useMemo(() => (
    users
      .filter((user) => user.id !== currentUser.id)
      .map((user) => {
        const employee = employeeByEmail[String(user.email || "").toLowerCase()];
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          dept: employee?.department || user.dept || "",
          position: employee?.position || user.jobTitle || "",
          supervisorId: user.supervisorId || employee?.supervisorId || "",
        };
      })
      .filter((person) => allowedRecipientIds.includes(person.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [allowedRecipientIds, currentUser.id, employeeByEmail, users]);

  const personMap = useMemo(() => makePersonMap(directory), [directory]);

  const relevantAnnouncements = useMemo(() => (
    announcements
      .filter((item) => item.visibleToCurrentUser)
      .map((item) => ({
        ...item,
        senderName: item.senderName || users.find((user) => user.id === item.senderId)?.name || "HR",
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  ), [announcements, users]);

  const announcementUnreadCount = useMemo(() => (
    relevantAnnouncements.filter((item) => !item.readBy?.includes(currentUser.id)).length
  ), [currentUser.id, relevantAnnouncements]);

  const conversations = useMemo(() => {
    const grouped = new Map();
    messages.forEach((message) => {
      if (message.senderId !== currentUser.id && message.receiverId !== currentUser.id) return;
      const partnerId = message.senderId === currentUser.id ? message.receiverId : message.senderId;
      if (!allowedRecipientIds.includes(partnerId)) return;
      const existing = grouped.get(partnerId) || {
        partner: personMap[partnerId] || directory.find((item) => item.id === partnerId) || { id:partnerId, name:"Unknown staff", dept:"", position:"" },
        unreadCount: 0,
        lastMessage: null,
      };
      if (!existing.lastMessage || new Date(message.timestamp) > new Date(existing.lastMessage.timestamp)) {
        existing.lastMessage = message;
      }
      if (message.receiverId === currentUser.id && message.senderId === partnerId && message.status !== "read") {
        existing.unreadCount += 1;
      }
      grouped.set(partnerId, existing);
    });
    return Array.from(grouped.values()).sort((a, b) => new Date(b.lastMessage?.timestamp || 0) - new Date(a.lastMessage?.timestamp || 0));
  }, [allowedRecipientIds, currentUser.id, directory, messages, personMap]);

  const hasSelectedConversation = !!(selectedRecipientId && (personMap[selectedRecipientId] || conversations.some((item) => item.partner.id === selectedRecipientId)));
  const resolvedSelectedRecipientId = hasSelectedConversation
    ? selectedRecipientId
    : (conversations[0]?.partner?.id || directory[0]?.id || "");
  const resolvedComposeRecipientId = composeRecipientId && allowedRecipientIds.includes(composeRecipientId)
    ? composeRecipientId
    : resolvedSelectedRecipientId;

  const directMessages = useMemo(() => (
    messages
      .filter((message) => (
        (message.senderId === currentUser.id && message.receiverId === resolvedSelectedRecipientId) ||
        (message.receiverId === currentUser.id && message.senderId === resolvedSelectedRecipientId)
      ))
      .map((message) => ({
        ...message,
        senderName: message.senderId === currentUser.id ? currentUser.name : (personMap[message.senderId]?.name || "Staff"),
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  ), [currentUser.id, currentUser.name, messages, personMap, resolvedSelectedRecipientId]);

  const activeConversation = resolvedSelectedRecipientId
    ? (personMap[resolvedSelectedRecipientId] || directory.find((person) => person.id === resolvedSelectedRecipientId) || null)
    : null;

  useEffect(() => {
    if (typeof window === "undefined" || !resolvedSelectedRecipientId) return;
    window.localStorage.setItem(threadStorageKey, resolvedSelectedRecipientId);
  }, [resolvedSelectedRecipientId, threadStorageKey]);

  useEffect(() => {
    if (resolvedSelectedRecipientId) onMarkConversationRead(resolvedSelectedRecipientId);
  }, [onMarkConversationRead, resolvedSelectedRecipientId]);

  useEffect(() => {
    if (relevantAnnouncements.length) onMarkAnnouncementsRead();
  }, [onMarkAnnouncementsRead, relevantAnnouncements.length]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      onRefresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [onRefresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sendMessage = (receiverId, text) => {
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
    sendMessage(resolvedComposeRecipientId, composeDraft);
    setComposeDraft("");
  };

  const handleSendReply = () => {
    if (!resolvedSelectedRecipientId || !replyDraft.trim()) return;
    sendMessage(resolvedSelectedRecipientId, replyDraft);
    setReplyDraft("");
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

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Messages Center</div>
        <div className="page-sub">Internal messaging for staff conversations and HR announcements.</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(210px, 1fr))", gap:14, marginBottom:18 }}>
        <div className="card">
          <div className="card-body" style={{ padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:800, color:"var(--g500)", textTransform:"uppercase", letterSpacing:".08em" }}>Unread</div>
            <div style={{ marginTop:8, fontFamily:"var(--serif)", fontSize:28, color:"var(--navy)", fontWeight:800 }}>{unreadCount}</div>
            <div style={{ marginTop:6, fontSize:13, color:"var(--g500)" }}>Messages and announcements awaiting attention.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:800, color:"var(--g500)", textTransform:"uppercase", letterSpacing:".08em" }}>Colleagues</div>
            <div style={{ marginTop:8, fontFamily:"var(--serif)", fontSize:28, color:"var(--navy)", fontWeight:800 }}>{directory.length}</div>
            <div style={{ marginTop:6, fontSize:13, color:"var(--g500)" }}>Available internal recipients in the staff directory.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:800, color:"var(--g500)", textTransform:"uppercase", letterSpacing:".08em" }}>Announcements</div>
            <div style={{ marginTop:8, fontFamily:"var(--serif)", fontSize:28, color:"var(--navy)", fontWeight:800 }}>{relevantAnnouncements.length}</div>
            <div style={{ marginTop:6, fontSize:13, color:"var(--g500)" }}>HR broadcast messages visible in your workspace.</div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="alert alert-teal" style={{ marginBottom:16 }}>
          <IconBadge name="notification" tone="teal" size={14} /> {toast}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"360px minmax(0, 1fr)", gap:18, alignItems:"stretch" }}>
        <ConversationList
          conversations={conversations}
          selectedRecipientId={resolvedSelectedRecipientId}
          onSelectConversation={(recipientId) => {
            setSelectedRecipientId(recipientId);
            setComposeRecipientId(recipientId);
          }}
          allowedRecipients={directory}
          composeRecipientId={resolvedComposeRecipientId}
          onChangeComposeRecipient={setComposeRecipientId}
          draft={composeDraft}
          onChangeDraft={setComposeDraft}
          onSend={handleSendFromComposer}
        />

        <ChatWindow
          currentUser={currentUser}
          activeConversation={activeConversation}
          directMessages={directMessages}
          activeAnnouncements={relevantAnnouncements}
          announcementUnreadCount={announcementUnreadCount}
          onSendReply={handleSendReply}
          replyDraft={replyDraft}
          onChangeReplyDraft={setReplyDraft}
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
