// wwwroot/js/chatwidget.js
(() => {
  const $ = (id) => document.getElementById(id);
  const widget  = $("chat-widget");
  if (!widget) return;

  const toggle   = $("chat-toggle");
  const panel    = $("chat-panel");
  const closeB   = $("chat-close");
  const list     = $("chat-messages");
  const form     = $("chat-form");
  const input    = $("chat-input");
  const badge    = $("chat-unread");
  const statusEl = $("chat-status");

  let unread = 0, connected = false;
  const seen = new Set();

  /* ---------- Keyboard offset: lift ONLY the input ---------- */
  const vv = window.visualViewport;
  function setKb() {
    if (!vv) return;
    // how much of the window is eaten by the keyboard
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kb", kb + "px");
  }
  vv?.addEventListener("resize", setKb);
  vv?.addEventListener("scroll", setKb);
  window.addEventListener("orientationchange", () => setTimeout(setKb, 60));
  setKb();

  /* ---------- Lock page (no background movement) ---------- */
  let lockY = 0;
  function lockPage() {
    lockY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.classList.add("chat-open");
  }
  function unlockPage() {
    document.body.classList.remove("chat-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, lockY);
  }
  // Block background touch scroll when chat is open
  document.addEventListener("touchmove", (e) => {
    if (!document.body.classList.contains("chat-open")) return;
    if (e.target.closest("#chat-panel")) return; // allow inside panel
    e.preventDefault();
  }, { passive: false });

  /* ---------- Helpers ---------- */
  const nearBottom = () => {
    if (!list) return true;
    return (list.scrollHeight - list.scrollTop - list.clientHeight) < 64;
  };
  const scrollToBottom = () => {
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  };
  const updateBadge = () => {
    if (!badge || !panel) return;
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = !(panel.hidden && unread > 0);
  };

  function openChat() {
    if (!panel) return;
    panel.hidden = false;
    lockPage();                   // page behind is frozen
    toggle?.setAttribute("aria-expanded", "true");
    unread = 0; updateBadge();
    setKb();                      // compute kb before focusing
    setTimeout(() => {
      input?.focus();
      if (nearBottom()) scrollToBottom();
    }, 0);
  }
  function closeChat() {
    if (!panel) return;
    panel.hidden = true;
    unlockPage();
    toggle?.setAttribute("aria-expanded", "false");
    updateBadge();
    document.documentElement.style.setProperty("--kb", "0px");
  }

  // Ensure initial closed state
  if (panel && !panel.hidden) closeChat();

  // Toggle
  toggle?.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    (panel?.hidden ? openChat() : closeChat());
  });
  closeB?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closeChat(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel && !panel.hidden) closeChat(); });

  // Input focus: keep chat stable; only ensure kb offset and stick-to-bottom
  input?.addEventListener("focus", () => { setKb(); if (nearBottom()) scrollToBottom(); });
  input?.addEventListener("blur",  () => { /* keep kb var; no jump on send */ });

  /* ---------- Render bubbles ---------- */
  const add = (from, text, msgId, ts) => {
    if (!list) return;
    if (msgId && seen.has(msgId)) return;
    if (msgId) seen.add(msgId);

    const stick = nearBottom();

    const wrap = document.createElement("div");
    wrap.className = "bubble " + (from === "You" ? "mine" : "theirs");
    if (msgId) wrap.dataset.id = msgId;

    const t = document.createElement("div");
    t.className = "bubble-text";
    t.textContent = text;

    const m = document.createElement("div");
    m.className = "bubble-time";
    const time = ts ? new Date(ts) : new Date();
    m.textContent = `${from} • ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    wrap.append(t, m);
    list.appendChild(wrap);

    if ((stick || panel?.hidden) && from !== "system") scrollToBottom();
    if (from !== "You" && panel?.hidden) { unread++; updateBadge(); }
  };

  /* ---------- SignalR ---------- */
  const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .withAutomaticReconnect()
    .build();

  connection.on("ReceiveToGuest", (from, msg, id, ts) => add(from, msg, id, ts));
  connection.on("MessageDeleted", (_chatId, messageId) => {
    document.querySelector(`[data-id='${messageId}']`)?.remove();
    if (nearBottom()) scrollToBottom();
  });
  connection.on("ChatCleared", () => {
    if (list) list.innerHTML = "";
    seen.clear(); unread = 0; updateBadge();
    if (nearBottom()) scrollToBottom();
  });
  connection.on("AdminOnline", (count) => {
    if (!statusEl) return;
    const online = (count || 0) > 0;
    statusEl.textContent = online ? "Support: online" : "Support: offline";
    statusEl.classList.toggle("online", online);
  });

  connection.start().then(() => { connected = true; }).catch(err => console.error("[chat] start error", err));

  // Send
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = (input?.value || "").trim();
    if (!msg) return;
    if (!connected) { console.warn("[chat] not connected yet"); return; }
    try {
      await connection.invoke("SendFromGuest", msg);
      if (input) { input.value = ""; /* keep focus, no blur */ }
      if (nearBottom()) scrollToBottom();
    } catch (err) { console.error("[chat] send error", err); }
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form?.requestSubmit(); }
  });
})();
