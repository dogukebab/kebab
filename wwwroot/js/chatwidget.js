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

    // ----- iOS visual viewport anchoring (prevents sideways jump) -----
    const margin = 18;
    const setVvh = () => {
        const vv = window.visualViewport;
        const h = vv ? vv.height : window.innerHeight;
        document.documentElement.style.setProperty("--vvh", `${h}px`);
    };

    const positionWidget = () => {
        const vv = window.visualViewport;
        if (!vv) { setVvh(); return; }

        // keep panel height tied to keyboard
        setVvh();

        // compute left so the widget hugs the *right* of the visual viewport
        const w = widget.offsetWidth || 0;
        const left = vv.offsetLeft + vv.width - w - margin;
        widget.style.left = `${Math.max(0, left)}px`;
        widget.style.right = "auto";

        // keep above keyboard area
        const overlap = window.innerHeight - (vv.height + vv.offsetTop);
        const extraBottom = overlap > 0 ? overlap : 0;
        widget.style.bottom = `calc(max(18px, env(safe-area-inset-bottom)) + ${extraBottom}px)`;
    };

    const attachViewportHandlers = () => {
        if (!window.visualViewport) return;
        window.visualViewport.addEventListener("resize", positionWidget);
        window.visualViewport.addEventListener("scroll", positionWidget);
        positionWidget();
    };
    const detachViewportHandlers = () => {
        if (!window.visualViewport) return;
        window.visualViewport.removeEventListener("resize", positionWidget);
        window.visualViewport.removeEventListener("scroll", positionWidget);
        document.documentElement.style.removeProperty("--vvh");
        widget.style.left = ""; widget.style.right = ""; widget.style.bottom = "";
    };

    // block page scrolling when the chat is open (but allow inside panel)
    const blockOutsideTouchScroll = (e) => {
        if (!panel || panel.hidden) return;
        if (!panel.contains(e.target)) e.preventDefault();
    };

    // ----- scroll helper -----
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
        document.body.classList.add("chat-open");
        toggle?.setAttribute("aria-expanded", "true");
        unread = 0; updateBadge();

        // iOS: keep anchored to visual viewport
        attachViewportHandlers();

        // extra: if focusing causes reflow, recalc
        panel.addEventListener("focusin", positionWidget);
        document.addEventListener("touchmove", blockOutsideTouchScroll, { passive: false });

        requestAnimationFrame(() => { input?.focus(); scrollToBottom(); });
    }

    function closeChat() {
        if (!panel) return;
        panel.hidden = true;
        document.body.classList.remove("chat-open");
        toggle?.setAttribute("aria-expanded", "false");
        updateBadge();

        detachViewportHandlers();
        panel.removeEventListener("focusin", positionWidget);
        document.removeEventListener("touchmove", blockOutsideTouchScroll);
    }

    // start closed
    if (panel) panel.hidden = true;

    // Toggle
    toggle?.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        (panel?.hidden ? openChat() : closeChat());
    });

    // Close with X
    closeB?.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        closeChat();
    });

    // Close with ESC
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && panel && !panel.hidden) closeChat();
    });

    // ----- Messages -----
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

    // Send
    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = (input?.value || "").trim();
        if (!msg) return;
        if (!connected) { console.warn("[chat] not connected yet"); return; }
        try {
            await connection.invoke("SendFromGuest", msg);
            if (input) { input.value = ""; input.focus(); }
            scrollToBottom();
        } catch (err) { console.error("[chat] send error", err); }
    });

    input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form?.requestSubmit(); }
    });
})();
