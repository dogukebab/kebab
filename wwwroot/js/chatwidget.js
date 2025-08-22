(() => {
    const el = (id) => document.getElementById(id);
    const widget = el("chat-widget");
    if (!widget) return;

    const toggle = el("chat-toggle");
    const panel = el("chat-panel");
    const closeB = el("chat-close");
    const list = el("chat-messages");
    const form = el("chat-form");
    const input = el("chat-input");
    const badge = el("chat-unread");
    const statusEl = el("chat-status");

    let unread = 0, connected = false;
    const seen = new Set();

    const updateBadge = () => {
        if (!badge || !panel) return;
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.hidden = !(panel.hidden && unread > 0);
    };

    // 🔧 Force show/hide regardless of global CSS
    const open = () => {
        if (!panel) return;
        panel.hidden = false;                 // removes [hidden]
        panel.style.display = "block";        // override any stylesheet that sets display:none
        toggle?.setAttribute("aria-expanded", "true");
        unread = 0;
        updateBadge();
        setTimeout(() => input?.focus(), 0);
    };

    const close = () => {
        if (!panel) return;
        panel.hidden = true;                  // adds [hidden]
        panel.style.display = "none";         // ensure it disappears
        toggle?.setAttribute("aria-expanded", "false");
        updateBadge();
    };

    // Ensure initial state matches markup
    if (panel) {
        if (panel.hidden) panel.style.display = "none";
        else close();
    }

    // Toggle
    toggle?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        (panel?.hidden ? open() : close());
    });

    // Close (X)
    closeB?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
    });

    // Esc closes
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && panel && !panel.hidden) close();
    });

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
        list.scrollTop = list.scrollHeight;

        if (from !== "You" && panel?.hidden) { unread++; updateBadge(); }
    };

    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/chatHub")
        .withAutomaticReconnect()
        .build();

    connection.onreconnecting(() => console.warn("[chat] reconnecting…"));
    connection.onreconnected(() => console.info("[chat] reconnected"));

    // avoid double-binding
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
        unread = 0;
        updateBadge();
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

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = (input?.value || "").trim();
        if (!msg) return;
        if (!connected) { console.warn("[chat] not connected yet"); return; }
        try {
            await connection.invoke("SendFromGuest", msg);
            if (input) { input.value = ""; input.focus(); }
        } catch (err) { console.error("[chat] send error", err); }
    });

    input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form?.requestSubmit(); }
    });
})();
