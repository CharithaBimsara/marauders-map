"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onValue, push, ref, remove, update } from "firebase/database";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase";
import { containsBannedContent } from "@/lib/moderation";

export default function ProximityChat({
  isOpen,
  roomId,
  chatId,
  self,
  target,
  nearbyUsers,
  userDirectory,
  blockedUsers,
  onSelectTarget,
  onCloseChat,
  onBlockUser,
  onReportUser,
  onUnblockUser,
  compact = false,
  maximized = false
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [owlNotice, setOwlNotice] = useState(null);
  const [previousChats, setPreviousChats] = useState([]); // Track users we've chatted with
  const scrollRef = useRef(null);
  const lastNotifiedRef = useRef({});
  const messagesCacheRef = useRef({}); // Cache messages by chatId for session persistence
  const initialLoadRef = useRef(true); // Track initial load to skip owl notifications

  useEffect(() => {
    if (!chatId || !roomId) {
      // Don't clear messages if we have cached messages for this chat
      if (!isOpen) return;
      setMessages([]);
      return;
    }

    // Load cached messages immediately while waiting for Firebase
    if (messagesCacheRef.current[chatId]) {
      setMessages(messagesCacheRef.current[chatId]);
    }

    const participantsRef = ref(db, `rooms/${roomId}/messages/${chatId}/participants`);
    update(participantsRef, {
      [self.uid]: true,
      [target?.uid]: Boolean(target?.uid)
    });

    const statusRef = ref(db, `rooms/${roomId}/messages/${chatId}/status`);
    update(statusRef, {
      active: true,
      users: {
        [self.uid]: true,
        [target?.uid]: Boolean(target?.uid)
      }
    });

    const messagesRef = ref(db, `rooms/${roomId}/messages/${chatId}/messages`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const parsed = Object.entries(data)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => a.createdAt - b.createdAt);
      const blockedSet = new Set(blockedUsers || []);
      const filtered = parsed.filter((message) => !blockedSet.has(message.sender));
      setMessages(filtered);
      // Cache messages for session persistence
      messagesCacheRef.current[chatId] = filtered;
    });

    return () => {
      update(statusRef, { active: false, users: {} });
      unsubscribe();
    };
  }, [isOpen, chatId, roomId, self?.uid, target?.uid, blockedUsers]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const title = useMemo(() => {
    if (!target) return "Nearby Wizards";
    return `Whispers with ${target.name || target.house}`;
  }, [target]);

  useEffect(() => {
    if (!roomId || !self?.uid) return;

    const allChatsRef = ref(db, `rooms/${roomId}/messages`);
    const unsubscribe = onValue(allChatsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const blockedSet = new Set(blockedUsers || []);
      const chatPartners = [];

      Object.entries(data).forEach(([loopChatId, chat]) => {
        const participants = chat?.participants || {};
        if (!participants[self.uid]) return;

        const messagesEntries = Object.entries(chat?.messages || {});
        
        // Track all users we've chatted with (for previous chats list)
        const otherUid = Object.keys(participants).find(
          (uid) => uid !== self.uid && uid // Make sure uid is not empty
        );
        if (otherUid && !blockedSet.has(otherUid) && messagesEntries.length > 0) {
          const lastMsg = messagesEntries.reduce((latest, [id, current]) =>
            current.createdAt > (latest?.createdAt || 0) ? { ...current, id } : latest
          , null);
          chatPartners.push({
            uid: otherUid,
            chatId: loopChatId,
            name: userDirectory?.[otherUid]?.name || lastMsg?.senderName || "Unknown",
            house: userDirectory?.[otherUid]?.house || lastMsg?.senderHouse,
            lastMessageAt: lastMsg?.createdAt || 0,
            ...(userDirectory?.[otherUid] || {})
          });
        }

        if (!messagesEntries.length) return;

        const lastMessage = messagesEntries.reduce((latest, [id, current]) =>
          current.createdAt > (latest?.createdAt || 0) ? { ...current, id } : latest
        , null);

        if (!lastMessage || lastMessage.sender === self.uid) return;
        if (blockedSet.has(lastMessage.sender)) return;
        // Don't show owl if already chatting with this person
        // Check both: if this chat is currently open OR if we have a target matching this user
        if (loopChatId === chatId) return; // Skip if this exact chat is open
        if (target?.uid === otherUid) return; // Skip if chatting with this user

        if (!lastMessage?.deliveredTo?.[self.uid]) {
          update(
            ref(db, `rooms/${roomId}/messages/${loopChatId}/messages/${lastMessage.id}`),
            { [`deliveredTo/${self.uid}`]: true }
          );
        }

        const lastNotified = lastNotifiedRef.current[loopChatId] || 0;
        if (lastMessage.createdAt <= lastNotified) return;

        const targetUser = otherUid
          ? { uid: otherUid, ...(userDirectory?.[otherUid] || {}) }
          : null;

        lastNotifiedRef.current[loopChatId] = lastMessage.createdAt;
        
        // Skip showing owl notification on initial load - only for NEW messages after page opened
        if (initialLoadRef.current) return;
        
        setOwlNotice({
          chatId: loopChatId,
          target: targetUser || {
            uid: otherUid,
            name: lastMessage.senderName || "Unknown",
            house: lastMessage.senderHouse
          },
          message: `You have a message from ${lastMessage.senderName || "a wizard"}.`
        });
      });

      // After first load, allow owl notifications for new messages
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
      }

      // Update previous chats list sorted by most recent
      setPreviousChats(chatPartners.sort((a, b) => b.lastMessageAt - a.lastMessageAt));
    });

    return () => unsubscribe();
  }, [roomId, self?.uid, chatId, target, blockedUsers, userDirectory]);

  const handleSend = async (event) => {
    event.preventDefault();
    if (!draft.trim() || !chatId || !self?.uid || !roomId) return;

    if (containsBannedContent(draft)) {
      setError("That message is not allowed.");
      return;
    }

    const messageRef = ref(db, `rooms/${roomId}/messages/${chatId}/messages`);
    await push(messageRef, {
      text: draft.trim(),
      sender: self.uid,
      senderHouse: self.house,
      senderName: self.name,
      deliveredTo: { [self.uid]: true },
      seenBy: { [self.uid]: true },
      createdAt: Date.now()
    });

    setDraft("");
    setError("");
  };

  useEffect(() => {
    if (!chatId || !roomId || !self?.uid) return;

    messages.forEach((message) => {
      if (message.sender === self.uid) return;

      const updates = {};
      if (!message?.deliveredTo?.[self.uid]) {
        updates[`deliveredTo/${self.uid}`] = true;
      }
      if (target && !message?.seenBy?.[self.uid]) {
        updates[`seenBy/${self.uid}`] = true;
      }

      if (Object.keys(updates).length) {
        update(
          ref(db, `rooms/${roomId}/messages/${chatId}/messages/${message.id}`),
          updates
        );
      }
    });
  }, [messages, chatId, roomId, self?.uid, target]);

  const handleCloseChat = async () => {
    if (!chatId || !roomId) return;
    await remove(ref(db, `rooms/${roomId}/messages/${chatId}`));
    onCloseChat?.();
  };

  const handleOwlClick = () => {
    if (!owlNotice?.target) return;
    onSelectTarget?.(owlNotice.target);
    setOwlNotice(null);
  };

  const renderDeliveryStatus = (message) => {
    if (message.sender !== self.uid || !target?.uid) return null;
    const seen = message?.seenBy?.[target.uid];
    const delivered = message?.deliveredTo?.[target.uid];

    if (seen) {
      return <span className="ml-2 text-xs text-parchment-700">✓✓</span>;
    }
    if (delivered) {
      return <span className="ml-2 text-xs text-parchment-600">✓</span>;
    }
    return null;
  };

  // Compact mode for mobile - just messages and input, no header
  // Also supports maximized mode for full-screen chat
  if (compact && target) {
    return (
      <div className={`flex flex-col ${maximized ? 'h-full' : ''}`}>
        {/* Messages */}
        <div
          ref={scrollRef}
          className={`overflow-y-auto rounded-xl border border-parchment-200 bg-parchment-50 custom-scrollbar ${
            maximized 
              ? 'flex-1 p-4 text-base' 
              : 'p-2.5 min-h-[100px] max-h-[120px]'
          }`}
        >
          {messages.length === 0 && (
            <p className={`text-parchment-500 text-center ${maximized ? 'text-sm py-8' : 'text-xs py-2'}`}>
              No whispers yet...
            </p>
          )}
          {messages.filter(msg => msg?.id).map((message, index) => (
            <div
              key={message.id || `msg-${index}`}
              className={`flex ${maximized ? 'mb-3' : 'mb-1.5'} ${
                message.sender === self.uid
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <span className={`rounded-lg ${
                maximized 
                  ? 'max-w-[70%] px-4 py-2.5 text-sm' 
                  : 'max-w-[85%] px-2.5 py-1.5 text-xs'
              } ${
                message.sender === self.uid
                  ? "bg-parchment-300 text-parchment-900"
                  : "bg-parchment-100 text-parchment-800"
              }`}>
                {message.text}
              </span>
              {renderDeliveryStatus(message)}
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className={`flex gap-2 ${maximized ? 'mt-4' : 'mt-2'}`}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a message..."
            className={`flex-1 rounded-xl border border-parchment-200 bg-parchment-50 focus:outline-none focus:ring-2 focus:ring-parchment-400 ${
              maximized ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm'
            }`}
          />
          <button
            type="submit"
            className={`rounded-xl bg-parchment-700 text-parchment-50 hover:bg-parchment-800 transition-colors font-medium ${
              maximized ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm'
            }`}
          >
            Send
          </button>
        </form>
        {error && (
          <span className={`text-red-700 mt-1 ${maximized ? 'text-sm' : 'text-[10px]'}`}>{error}</span>
        )}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div key="chat-panel" className="parchment-panel rounded-t-2xl sm:rounded-t-2xl rounded-tl-2xl p-3 sm:p-4 border border-parchment-300 border-b-0 max-h-[60vh] sm:max-h-[50vh] flex flex-col shadow-xl">
          {/* Header - More compact on mobile */}
          <div className="mb-2 sm:mb-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-parchment-900 truncate">{title}</h3>
              <p className="text-[10px] sm:text-xs text-parchment-600 hidden sm:block">Stay within range to chat</p>
            </div>
            {target && (
              <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onBlockUser?.(target.uid)}
                  className="rounded-lg border border-parchment-200 bg-parchment-50 px-2 py-1 text-[10px] sm:text-xs hover:bg-parchment-100"
                >
                  Block
                </button>
                <button
                  type="button"
                  onClick={() => onReportUser?.(target.uid)}
                  className="rounded-lg border border-parchment-200 bg-parchment-50 px-2 py-1 text-[10px] sm:text-xs hover:bg-parchment-100"
                >
                  Report
                </button>
                <button
                  type="button"
                  onClick={() => onCloseChat?.()}
                  className="rounded-lg bg-parchment-700 px-2 py-1 text-[10px] sm:text-xs text-parchment-50 hover:bg-parchment-800"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {!target && (
            <div className="space-y-1.5 sm:space-y-2 overflow-y-auto custom-scrollbar flex-1">
              {nearbyUsers?.length ? (
                nearbyUsers.filter(wizard => wizard?.uid).map((wizard, index) => (
                  <div
                    key={wizard.uid || `wizard-${index}`}
                    className="flex items-center justify-between rounded-xl border border-parchment-200 bg-parchment-50 px-2 sm:px-3 py-1.5 sm:py-2 text-sm hover:bg-parchment-100 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTarget?.(wizard)}
                      className="flex-1 text-left min-w-0"
                    >
                      <span className="font-semibold text-parchment-900 text-xs sm:text-sm truncate block">
                        {wizard.name || wizard.house}
                      </span>
                      <span className="text-[10px] sm:text-xs text-parchment-600">
                        {Math.round(wizard.distance)}px
                      </span>
                    </button>
                    <div className="flex gap-1 sm:gap-2 flex-shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => onBlockUser?.(wizard.uid)}
                        className="text-[10px] sm:text-xs text-parchment-700 hover:text-parchment-900 px-1"
                      >
                        Block
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-parchment-500 text-xs sm:text-sm text-center py-3 sm:py-4">
                  No nearby wizards
                </p>
              )}

              {/* Previous Chats Section */}
              {previousChats.length > 0 && (
                <>
                  <div className="border-t border-parchment-200 my-2 pt-2">
                    <p className="text-[10px] sm:text-xs text-parchment-600 mb-1.5">📜 Previous conversations</p>
                  </div>
                  {previousChats
                    .filter(chat => chat?.uid && !nearbyUsers?.some(u => u.uid === chat.uid)) // Don't show if already in nearby
                    .map((chat, index) => (
                      <div
                        key={chat.uid || `chat-${index}`}
                        className="flex items-center justify-between rounded-xl border border-parchment-200/60 bg-parchment-100/50 px-2 sm:px-3 py-1.5 sm:py-2 text-sm hover:bg-parchment-100 transition-colors mb-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectTarget?.(chat)}
                          className="flex-1 text-left min-w-0"
                        >
                          <span className="font-semibold text-parchment-800 text-xs sm:text-sm truncate block">
                            {chat.name || chat.house}
                          </span>
                          <span className="text-[10px] sm:text-xs text-parchment-500">
                            tap to continue chat
                          </span>
                        </button>
                      </div>
                    ))}
                </>
              )}
            </div>
          )}

          {target && (
            <div className="flex flex-col flex-1 min-h-0">
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto rounded-xl border border-parchment-200 bg-parchment-50 p-2 sm:p-3 text-xs sm:text-sm custom-scrollbar min-h-[80px] sm:min-h-[120px] max-h-[150px] sm:max-h-[200px]"
              >
                {messages.length === 0 && (
                  <p className="text-parchment-500 text-center text-xs sm:text-sm">No whispers yet...</p>
                )}
                {messages.filter(msg => msg?.id).map((message, index) => (
                  <div
                    key={message.id || `msg-mobile-${index}`}
                    className={`mb-1.5 sm:mb-2 flex ${
                      message.sender === self.uid
                        ? "justify-end text-parchment-900"
                        : "justify-start text-parchment-700"
                    }`}
                  >
                    <span className={`max-w-[80%] sm:max-w-[75%] rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 shadow-sm text-xs sm:text-sm ${
                      message.sender === self.uid
                        ? "bg-parchment-200"
                        : "bg-parchment-100"
                    }`}>
                      {message.text}
                    </span>
                    {renderDeliveryStatus(message)}
                  </div>
                ))}
              </div>

              <form onSubmit={handleSend} className="mt-2 sm:mt-3 flex gap-1.5 sm:gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Whisper..."
                  className="flex-1 rounded-lg border border-parchment-200 bg-parchment-50 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-parchment-400"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-parchment-700 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-parchment-50 hover:bg-parchment-800 transition-colors"
                >
                  ✒️
                </button>
              </form>
              {error && (
                <span className="text-[10px] sm:text-xs text-red-700 mt-1">{error}</span>
              )}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {owlNotice && (
          <motion.div
            key="owl-notice"
            className="fixed top-20 sm:top-10 left-4 right-4 sm:left-0 sm:right-0 mx-auto w-auto sm:w-[280px] max-w-[320px] pointer-events-auto z-[60]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <motion.button
              type="button"
              onClick={handleOwlClick}
              className="w-full rounded-2xl border-2 border-amber-400/50 bg-parchment-50 px-4 py-3 text-left shadow-lg owl-flying"
              initial={{ x: -200 }}
              animate={{ x: ["-120%", "10%", "0%"] }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            >
              <div className="flex items-center gap-3">
                <motion.span 
                  className="text-3xl"
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.5, repeat: 3 }}
                >
                  🦉
                </motion.span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-parchment-900 truncate">{owlNotice.message}</p>
                  <p className="text-xs text-parchment-600">Tap to open the chat</p>
                </div>
              </div>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
