// wwwroot/js/chatwidget.js
(() => {
  const el = (id) => document.getElementById(id);
  const widget   = el("chat-widget");
  if (!widget) return;

  const toggle   = el("chat-toggle");
  const panel    = el("chat-panel");
  const closeB   = el("chat-close");
  const list     = el("chat-messages");
  const form     = el("chat-form");
  const input    = el("chat-input");
  const badge    = el("chat-unread");
  const statusEl = el("chat-status");

  let unread = 0, connected = false;
  const seen = new Set();
  let pageScrollY = 0;

  // ----- Visual viewport (keyboard) → CSS vars (--vvh, --kb)
  const vv = window.visualViewport;
  const syncViewportVars = () => {
    if (!vv) return;
    const vvh = Math.round(vv.height);
    const kb  = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const root = document.documentElement.style;
    root.setProperty("--vvh", vvh + "px");
    root.setProperty("--kb",  kb  + "px"); // pushes widget up, page stays put
  };
  vv?.addEventListener("resize", syncViewportVars);
  vv?.addEventListener("scroll", syncViewportVars);
  window.addEventListener("orientationchange", () => setTimeout(syncViewportVars, 150));

  // ----- True page scroll lock (desktop-like)
  function lockPageScroll() {
    pageScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${pageScrollY}px`;
    document.body.classList.add("chat-open");
  }
  function unlockPageScroll() {
    document.body.classList.remove("chat-open");
    document.body.style.top = "";
    window.scrollTo(0, pageScrollY);
  }

  // Block page touchmove while allowing scroll inside the chat panel only
  function allowScroll(el) {
    return !!el && (el === list || el.closest?.("#chat-panel"));
  }
  function onTouchMove(e) {
    if (!document.body.classList.contains("chat-open")) return;
    if (!allowScroll(e.target)) e.preventDefault();
  }
  document.addEventListener("touchmove", onTouchMove, { passive: false });

  // ----- Helpers
  const nearBottom = () => {
    if (!list) return true;
    const delta = list.scrollHeight - list.scrollTop - list.clientHeight;
    return delta < 48; // "near bottom" threshold
  };
  const scrollToBottom = () => {
    if (!list) return;
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  };
  const updateBadge = () => {
    if (!badge || !panel) return;
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = !(panel.hidden && unread > 0);
  };

  function openChat() {
    if (!panel) return;
    panel.hidden = false;
    toggle?.setAttribute("aria-expanded", "true");
    unread = 0; updateBadge();
    lockPageScroll();
    syncViewportVars(); // measure immediately
    // focus without auto-scrolling the page
    requestAnimationFrame(() => { try { input?.focus({ preventScroll: true }); } catch {} });
    // stick to bottom only if already there
    if (nearBottom()) scrollToBottom();
  }

  function closeChat() {
    if (!panel) return;
    panel.hidden = true;
    toggle?.setAttribute("aria-expanded", "false");
    updateBadge();
    unlockPageScroll();
    // reset keyboard offset so widget snaps back to its anchor
    document.documentElement.style.setProperty("--kb", "0px");
  }

  // Ensure initially closed
  if (panel && !panel.hidden) closeChat();

  // Toggle
  toggle?.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    (panel?.hidden ? openChat() : closeChat());
  });

  // Close
  closeB?.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    closeChat();
  });

  // ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel && !panel.hidden) closeChat();
  });

  // Keep list pinned only if already at bottom when focusing
  input?.addEventListener("focus", () => { if (nearBottom()) scrollToBottom(); });

  // ----- Render bubbles (smart autoscroll)
  const add = (from, text, msgId, ts) => {
    if (!list) return;
    if (msgId && seen.has(msgId)) return;
    if (msgId) seen.add(msgId);

    const shouldStick = nearBottom() || from === "You";

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

    if (shouldStick) scrollToBottom();
    if (from !== "You" && panel?.hidden) { unread++; updateBadge(); }
  };

  // ----- SignalR -----
  const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .withAutomaticReconnect()
    .build();

  connection.onreconnecting(() => console.warn("[chat] reconnecting…"));
  connection.onreconnected(() => console.info("[chat] reconnected"));

  connection.off("ReceiveToGuest");
  connection.off("MessageDeleted");
  connection.off("ChatCleared");
  connection.off("AdminOnline");

  connection.on("ReceiveToGuest", (from, msg, id, ts) => add(from, msg, id, ts));

  connection.on("MessageDeleted", (_chatId, messageId) => {
    document.querySelector(`[data-id='${messageId}']`)?.remove();
  });

  connection.on("ChatCleared", (_chatId) => {
    if (list) list.innerHTML = "";
    seen.clear();
    unread = 0; updateBadge();
  });

  connection.on("AdminOnline", (count) => {
    if (!statusEl) return;
    const online = (count || 0) > 0;
    statusEl.textContent = online ? "Support: online" : "Support: offline";
    statusEl.classList.toggle("online", online);
  });

  connection.start()
    .then(() => { connected = true; })
    .catch(err => console.error("[chat] start error", err));

  // Send
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = (input?.value || "").trim();
    if (!msg) return;
    if (!connected) { console.warn("[chat] not connected yet"); return; }
    try {
      await connection.invoke("SendFromGuest", msg);
      if (input) {
        input.value = "";
        // On iOS, focus immediately after submit sometimes fails;
        // a short microtask/timeout makes it reliable.
        setTimeout(() => { try { input.focus({ preventScroll: true }); } catch {} }, 0);
      }
    } catch (err) { console.error("[chat] send error", err); }
  });

  // Enter to send
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form?.requestSubmit(); }
  });

  // Initial measurement (important on iOS)
  syncViewportVars();
})();
