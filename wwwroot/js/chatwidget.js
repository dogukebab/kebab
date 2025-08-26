// wwwroot/js/chatwidget.js
(() => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const widget   = el('chat-widget');
  if (!widget) return; // no widget on this page

  const toggle   = el('chat-toggle');
  const panel    = el('chat-panel');
  const closeB   = el('chat-close');
  const list     = el('chat-messages');
  const form     = el('chat-form');
  const input    = el('chat-input');
  const badge    = el('chat-unread');
  const statusEl = el('chat-status');

  let unread = 0;
  let connected = false;
  const seen = new Set();
  let lastFocused = null;

  // --- Small helpers
  const raf = (fn) => requestAnimationFrame(fn);

  const scrollToBottom = () => {
    if (!list) return;
    raf(() => { list.scrollTop = list.scrollHeight; });
  };

  const updateBadge = () => {
    if (!badge || !panel) return;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    // show only when panel is closed and there are unread messages
    badge.hidden = !(panel.hidden && unread > 0);
  };

  // Ensure aria wiring is present
  if (toggle && panel && !toggle.hasAttribute('aria-controls')) {
    toggle.setAttribute('aria-controls', 'chat-panel');
  }
  if (panel) {
    panel.setAttribute('role', 'dialog');
    if (!panel.getAttribute('aria-label')) panel.setAttribute('aria-label', 'Chat');
  }

  // Focus trap while chat is open (keyboard nav)
  function trapFocus(e) {
    if (panel?.hidden) return;
    if (e.key !== 'Tab') return;

    const selectors = [
      'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
      'input:not([disabled])', 'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ];
    const focusables = panel.querySelectorAll(selectors.join(','));
    if (!focusables.length) return;

    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // --- Open / Close (no layout mutations; CSS handles positioning/sizing)
  function openChat() {
    if (!panel) return;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.hidden = false;                          // display via CSS, not inline styles
    document.body.classList.add('chat-open');      // lock background scroll (CSS provided)
    toggle?.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-modal', 'true');
    unread = 0;
    updateBadge();
    // focus & scroll once it paints
    raf(() => { input?.focus(); scrollToBottom(); });
  }

  function closeChat() {
    if (!panel) return;
    panel.hidden = true;
    document.body.classList.remove('chat-open');
    toggle?.setAttribute('aria-expanded', 'false');
    panel.removeAttribute('aria-modal');
    updateBadge();
    // return focus to the toggle for accessibility
    (lastFocused || toggle)?.focus?.();
  }

  // Start closed (prevent any initial flash in open state)
  if (panel && !panel.hidden) panel.hidden = true;

  // --- Events
  toggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    (panel?.hidden ? openChat() : closeChat());
  });

  closeB?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeChat();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hidden) closeChat();
  });

  // focus trap inside the dialog
  panel?.addEventListener('keydown', trapFocus);

  // help maintain scroll on orientation changes / soft-keyboard resize
  ['resize', 'orientationchange'].forEach(evt =>
    window.addEventListener(evt, () => { if (panel && !panel.hidden) scrollToBottom(); }, { passive: true })
  );

  // --- Message bubbles
  const add = (from, text, msgId, ts) => {
    if (!list) return;

    if (msgId) {
      if (seen.has(msgId)) return; // avoid duplicates
      seen.add(msgId);
    }

    const wrap = document.createElement('div');
    wrap.className = 'bubble ' + (from === 'You' ? 'mine' : 'theirs');
    if (msgId) wrap.dataset.id = msgId;

    const t = document.createElement('div');
    t.className = 'bubble-text';
    t.textContent = text;

    const m = document.createElement('div');
    m.className = 'bubble-time';
    const time = ts ? new Date(ts) : new Date();
    m.textContent = `${from} • ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    wrap.append(t, m);
    list.appendChild(wrap);
    scrollToBottom();

    if (from !== 'You' && panel?.hidden) {
      unread++;
      updateBadge();
    }
  };

  // --- SignalR
  const connection = new signalR.HubConnectionBuilder()
    .withUrl('/chatHub')
    .withAutomaticReconnect()
    .build();

  connection.onreconnecting(() => console.warn('[chat] reconnecting…'));
  connection.onreconnected(() => console.info('[chat] reconnected'));

  // avoid double-binding (defensive)
  connection.off('ReceiveToGuest');
  connection.off('MessageDeleted');
  connection.off('ChatCleared');
  connection.off('AdminOnline');

  connection.on('ReceiveToGuest', (from, msg, id, ts) => add(from, msg, id, ts));

  connection.on('MessageDeleted', (_chatId, messageId) => {
    document.querySelector(`[data-id='${messageId}']`)?.remove();
    scrollToBottom();
  });

  connection.on('ChatCleared', (_chatId) => {
    if (list) list.innerHTML = '';
    seen.clear();
    unread = 0;
    updateBadge();
    scrollToBottom();
  });

  connection.on('AdminOnline', (count) => {
    if (!statusEl) return;
    const online = (count || 0) > 0;
    statusEl.textContent = online ? 'Support: online' : 'Support: offline';
    statusEl.classList.toggle('online', online);
  });

  connection.start()
    .then(() => { connected = true; })
    .catch(err => console.error('[chat] start error', err));

  // --- Send
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = (input?.value || '').trim();
    if (!msg) return;
    if (!connected) {
      console.warn('[chat] not connected yet');
      return;
    }
    try {
      await connection.invoke('SendFromGuest', msg); // server echoes back
      if (input) { input.value = ''; input.focus(); }
      scrollToBottom();
    } catch (err) {
      console.error('[chat] send error', err);
    }
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form?.requestSubmit();
    }
  });

  // Optional: close on page hide (keeps state consistent on mobile back/forward)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && panel && !panel.hidden) closeChat();
  });
})();
