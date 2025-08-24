// wwwroot/js/chatwidget.js
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

    // --- Always scroll the messages container to bottom (safe with RAF)
    const scrollToBottom = () => {
        if (!list) return;
        requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    };

    const updateBadge = () => {
        if (!badge || !panel) return;
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.hidden = !(panel.hidden && unread > 0);
    };

    // Open/close helpers (force display to avoid global CSS overrides)
    const open = () => {
        if (!panel) return;
        panel.hidden = false;
        panel.style.display = "block";
        toggle?.setAttribute("aria-expanded", "true");
        unread = 0;
        updateBadge();
        setTimeout(() => {
            input?.focus();
            scrollToBottom();           // <<< en alta in
        }, 0);
    };

    const close = () => {
        if (!panel) return;
        panel.hidden = true;
        panel.style.display = "none";
        toggle?.setAttribute("aria-expanded", "false");
        updateBadge();
    };

    // Ensure initial closed state matches markup
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

    // Close with X
    closeB?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
    });

    // Close with ESC
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && panel && !panel.hidden) close();
    });

    // Append a message bubble
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

        // <<< mesaj geldikten sonra her zaman en alta kaydır
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
            // yazdıktan sonra da en alta
            scrollToBottom();
        } catch (err) { console.error("[chat] send error", err); }
    });

    input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form?.requestSubmit(); }
    });
})();
