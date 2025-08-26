// wwwroot/js/chatwidget.js
(() => {
    const el = (id) => document.getElementById(id);
    const widget = el("chat-widget");
    if (!widget) return;

    const toggle = el("chat-toggle");
    const panel  = el("chat-panel");
    const closeB = el("chat-close");
    const list   = el("chat-messages");
    const form   = el("chat-form");
    const input  = el("chat-input");
    const badge  = el("chat-unread");
    const statusEl = el("chat-status");

    let unread = 0, connected = false;
    const seen = new Set();

    // --- iOS visual viewport fix (keeps panel above keyboard & widget fixed)
    const applyViewportFix = () => {
        const vv = window.visualViewport;
        const vvh = vv ? vv.height : window.innerHeight;
        // update CSS var that controls panel max-height
        document.documentElement.style.setProperty("--vvh", `${vvh}px`);

        // if keyboard reduces the visual viewport, push widget up by the overlap
        let extraBottom = 0;
        if (vv) {
            const overlap = window.innerHeight - (vv.height + vv.offsetTop);
            if (overlap > 0) extraBottom = overlap; // keyboard height portion
        }
        widget.style.bottom = `calc(max(18px, env(safe-area-inset-bottom)) + ${extraBottom}px)`;
    };

    const addViewportListeners = () => {
        if (!window.visualViewport) return;
        window.visualViewport.addEventListener("resize", applyViewportFix);
        window.visualViewport.addEventListener("scroll", applyViewportFix);
        applyViewportFix();
    };
    const removeViewportListeners = () => {
        if (!window.visualViewport) return;
        window.visualViewport.removeEventListener("resize", applyViewportFix);
        window.visualViewport.removeEventListener("scroll", applyViewportFix);
        document.documentElement.style.removeProperty("--vvh");
        widget.style.bottom = ""; // back to CSS default
    };

    // --- Always scroll the messages container to bottom
    const scrollToBottom = () => {
        if (!list) return;
        requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    };

    const updateBadge = () => {
        if (!badge || !panel) return;
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.hidden = !(panel.hidden && unread > 0);
    };

    // Open/close without touching page layout
    function openChat() {
        if (!panel) return;
        panel.hidden = false;                       // CSS handles display
        document.body.classList.add("chat-open");   // lock background scroll
        toggle?.setAttribute("aria-expanded", "true");
        unread = 0; updateBadge();
        addViewportListeners();
        requestAnimationFrame(() => { input?.focus(); scrollToBottom(); });
    }
    function closeChat() {
        if (!panel) return;
        panel.hidden = true;                        // CSS handles display
        document.body.classList.remove("chat-open");
        toggle?.setAttribute("aria-expanded", "false");
        updateBadge();
        removeViewportListeners();
    }

    // Ensure initial state is closed
    if (panel && !panel.hidden) closeChat();
    else if (panel) panel.hidden = true;

    // Toggle button
    toggle?.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        (panel?.hidden ? openChat() : closeChat());
    });

    // Close with X
    closeB?.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation(); closeChat();
    });

    // Close with ESC
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && panel && !panel.hidden) closeChat();
    });

    // --- Bubbles
    const add = (from, text, msgId, ts) => {
        if (!list) return;
        if (msgId && seen.has(msgId)) return;
        if (msgId) seen.add(msgId);

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
        scrollToBottom();

        if (from !== "You" && panel?.hidden) { unread++; updateBadge(); }
    };

    // ----- SignalR -----
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/chatHub")
        .withAutomaticReconnect()
        .build();

    connection.onreconnecting(() => console.warn("[chat] reconnecting…"));
    connection.onreconnected(() => console.info("[chat] reconnected"));

    // avoid double binding during hot reloads
    connection.off("ReceiveToGuest");
    connection.off("MessageDeleted");
    connection.off("ChatCleared");
    connection.off("AdminOnline");

    connection.on("ReceiveToGuest", (from, msg, id, ts) => add(from, msg, id, ts));

    connection.on("MessageDeleted", (_chatId, messageId) => {
        document.querySelector(`[data-id='${messageId}']`)?.remove();
        scrollToBottom();
    });

    connection.on("ChatCleared", (_chatId) => {
        if (list) list.innerHTML = "";
        seen.clear();
        unread = 0;
        updateBadge();
        scrollToBottom();
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

    // send message
    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = (input?.value || "").trim();
        if (!msg) return;
        if (!connected) { console.warn("[chat] not connected yet"); return; }
        try {
            await connection.invoke("SendFromGuest", msg); // server echo
            if (input) { input.value = ""; input.focus(); }
            scrollToBottom();
        } catch (err) { console.error("[chat] send error", err); }
    });

    input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form?.requestSubmit(); }
    });
})();
