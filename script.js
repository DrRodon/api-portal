const tiles = document.querySelectorAll(".tile");
const gmailTile = document.querySelector(".tile--gmail");
const gmailCount = document.getElementById("gmail-count");
const gmailStatus = document.getElementById("gmail-status");
const gmailCta = document.getElementById("gmail-cta");
const gmailPreview = document.getElementById("gmail-preview");
const gmailPreviewBody = document.getElementById("gmail-preview-body");
const gmailPreviewClose = document.getElementById("gmail-preview-close");
const gmailPreviewBack = document.getElementById("gmail-preview-back");
const gmailPreviewAuth = document.getElementById("gmail-preview-auth");
const gmailActionTrash = document.getElementById("gmail-action-trash");
const gmailActionRead = document.getElementById("gmail-action-read");
const themeSelect = document.getElementById("theme-select");
const BACKEND_GRACE_MS = 30000;
const BACKEND_RETRY_MS = 5000;
const REFRESH_INTERVAL_MS = 30000;
const THEME_KEY = "portal-theme";
let backendGraceTimer = null;
let backendRetryTimer = null;
let autoRefreshTimer = null;
let gmailIsConnected = false;
let gmailPreviewOpen = false;
let gmailDetailOpen = false;
let currentMessageId = null;
let previewCloseHandler = null;

const isNightTime = () => {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 6;
};

const revealTiles = () => {
  tiles.forEach((tile, index) => {
    setTimeout(() => {
      tile.classList.add("is-visible");
    }, 120 * index);
  });
};

const setPreviewAuthVisible = (visible) => {
  if (!gmailPreviewAuth) {
    return;
  }
  gmailPreviewAuth.hidden = !visible;
};

const setDetailMode = (isDetail) => {
  gmailDetailOpen = isDetail;
  if (gmailPreviewBack) {
    gmailPreviewBack.hidden = !isDetail;
  }
  if (gmailPreview) {
    gmailPreview.classList.toggle("is-detail", isDetail);
  }
};

const setPreviewEmpty = (message) => {
  if (!gmailPreviewBody) {
    return;
  }
  gmailPreviewBody.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "gmail-preview__empty";
  empty.textContent = message;
  gmailPreviewBody.appendChild(empty);
};

const renderPreviewList = (messages) => {
  if (!gmailPreviewBody) {
    return;
  }
  gmailPreviewBody.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "gmail-preview__list";

  messages.forEach((message) => {
    const item = document.createElement("li");
    item.className = "gmail-preview__item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gmail-preview__item-button";
    button.dataset.messageId = message.id;

    const meta = document.createElement("div");
    meta.className = "gmail-preview__meta";
    const from = document.createElement("span");
    from.textContent = message.from || "Nieznany nadawca";
    const date = document.createElement("span");
    date.textContent = message.date || "Brak daty";
    meta.appendChild(from);
    meta.appendChild(date);

    const subject = document.createElement("div");
    subject.className = "gmail-preview__subject";
    subject.textContent = message.subject || "(Bez tematu)";

    const snippet = document.createElement("div");
    snippet.className = "gmail-preview__snippet";
    snippet.textContent = message.snippet || "";

    button.appendChild(meta);
    button.appendChild(subject);
    if (message.snippet) {
      button.appendChild(snippet);
    }
    item.appendChild(button);
    list.appendChild(item);
  });

  gmailPreviewBody.appendChild(list);
};

const renderMessageDetail = (message) => {
  if (!gmailPreviewBody) {
    return;
  }
  gmailPreviewBody.innerHTML = "";
  currentMessageId = message.id || null;
  const detail = document.createElement("div");
  detail.className = "gmail-preview__detail";

  const meta = document.createElement("div");
  meta.className = "gmail-preview__detail-meta";
  const from = document.createElement("span");
  from.textContent = message.from || "Nieznany nadawca";
  const date = document.createElement("span");
  date.textContent = message.date || "Brak daty";
  meta.appendChild(from);
  meta.appendChild(date);

  const subject = document.createElement("div");
  subject.className = "gmail-preview__detail-subject";
  subject.textContent = message.subject || "(Bez tematu)";

  let body = null;
  if (message.html) {
    const frame = document.createElement("iframe");
    frame.className = "gmail-preview__detail-frame";
    frame.setAttribute("sandbox", "");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("title", "Podglad wiadomosci");
    frame.srcdoc = message.html;
    body = frame;
  } else {
    const text = document.createElement("div");
    text.className = "gmail-preview__detail-body";
    text.textContent = message.body || "";
    body = text;
  }

  detail.appendChild(meta);
  detail.appendChild(subject);
  detail.appendChild(body);
  gmailPreviewBody.appendChild(detail);
};

const loadGmailMessage = async (messageId) => {
  if (!gmailPreviewBody) {
    return;
  }
  setPreviewAuthVisible(false);
  setPreviewEmpty("Laduje wiadomosc...");
  setDetailMode(true);

  try {
    const response = await fetch(`http://localhost:3000/api/gmail/message/${messageId}`);
    if (!response.ok) {
      setPreviewEmpty("Nie mozna pobrac wiadomosci.");
      return;
    }
    const data = await response.json();
    if (!data.connected || !data.message) {
      setPreviewEmpty("Brak autoryzacji konta.");
      return;
    }
    renderMessageDetail(data.message);
  } catch (error) {
    setPreviewEmpty("Nie mozna polaczyc z backendem.");
  }
};

const loadGmailPreview = async () => {
  if (!gmailPreviewBody) {
    return;
  }

  currentMessageId = null;
  setDetailMode(false);
  setPreviewAuthVisible(false);
  setPreviewEmpty("Laduje podglad...");

  try {
    const response = await fetch("http://localhost:3000/api/gmail/preview");
    if (!response.ok) {
      setPreviewAuthVisible(true);
      setPreviewEmpty("Polacz konto, aby zobaczyc skrzynke.");
      return;
    }

    const data = await response.json();
    if (!data.connected) {
      setPreviewAuthVisible(true);
      setPreviewEmpty("Brak autoryzacji konta.");
      return;
    }

    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (!messages.length) {
      setPreviewEmpty("Brak wiadomosci w skrzynce.");
      return;
    }

    renderPreviewList(messages);
  } catch (error) {
    setPreviewAuthVisible(true);
    setPreviewEmpty("Nie mozna polaczyc z backendem.");
  }
};

const runMessageAction = async (endpoint) => {
  if (!currentMessageId) {
    return;
  }
  setPreviewAuthVisible(false);
  setPreviewEmpty("Wykonywanie akcji...");
  try {
    const response = await fetch(endpoint, { method: "POST" });
    if (!response.ok) {
      setPreviewEmpty("Nie mozna wykonac akcji.");
      return;
    }
    updateGmailStatus();
    loadGmailPreview();
  } catch (error) {
    setPreviewEmpty("Nie mozna polaczyc z backendem.");
  }
};

const setPreviewOpen = (isOpen) => {
  gmailPreviewOpen = isOpen;
  if (gmailPreview) {
    if (isOpen) {
      if (previewCloseHandler) {
        gmailPreview.removeEventListener("transitionend", previewCloseHandler);
        previewCloseHandler = null;
      }
      gmailPreview.hidden = false;
      gmailPreview.classList.remove("is-closing");
      requestAnimationFrame(() => {
        gmailPreview.classList.add("is-open");
      });
    } else {
      gmailPreview.classList.remove("is-open");
      gmailPreview.classList.add("is-closing");
      const onTransitionEnd = (event) => {
        if (event.propertyName !== "opacity") {
          return;
        }
        gmailPreview.hidden = true;
        gmailPreview.classList.remove("is-closing");
        gmailPreview.removeEventListener("transitionend", onTransitionEnd);
        previewCloseHandler = null;
      };
      previewCloseHandler = onTransitionEnd;
      gmailPreview.addEventListener("transitionend", onTransitionEnd);
    }
  }
  if (gmailTile) {
    gmailTile.setAttribute("aria-expanded", String(isOpen));
  }
  if (isOpen) {
    loadGmailPreview();
  } else {
    setDetailMode(false);
  }
};


const applyTheme = (mode) => {
  const isNight = mode === "night" || (mode === "auto" && isNightTime());
  document.body.classList.toggle("theme-dark", isNight);
  document.body.dataset.theme = mode;
};

const initializeTheme = () => {
  const stored = localStorage.getItem(THEME_KEY) || "auto";
  if (themeSelect) {
    themeSelect.value = stored;
  }
  applyTheme(stored);
};

const setGmailDisconnected = (message) => {
  if (!gmailCount || !gmailStatus || !gmailCta || !gmailTile) {
    return;
  }

  gmailIsConnected = false;
  gmailCount.textContent = "--";
  gmailStatus.textContent = message;
  gmailCta.textContent = "Polacz konto";
  gmailTile.setAttribute("href", "http://localhost:3000/auth");
  if (gmailPreviewOpen && !gmailDetailOpen) {
    setPreviewAuthVisible(true);
    setPreviewEmpty("Polacz konto, aby zobaczyc skrzynke.");
  }
};

const setGmailConnected = (unread) => {
  if (!gmailCount || !gmailStatus || !gmailCta || !gmailTile) {
    return;
  }

  gmailIsConnected = true;
  gmailCount.textContent = unread.toString();
  gmailStatus.textContent = "Nieprzeczytane";
  gmailCta.textContent = "Otworz Gmail";
  gmailTile.setAttribute("href", "https://mail.google.com/");
  if (gmailPreviewOpen && !gmailDetailOpen) {
    loadGmailPreview();
  }
};

const stopBackendGrace = () => {
  if (backendGraceTimer) {
    clearTimeout(backendGraceTimer);
    backendGraceTimer = null;
  }

  if (backendRetryTimer) {
    clearInterval(backendRetryTimer);
    backendRetryTimer = null;
  }
};

const startBackendGrace = () => {
  if (backendGraceTimer) {
    return;
  }

  setGmailDisconnected("Laczenie...");

  backendGraceTimer = setTimeout(() => {
    backendGraceTimer = null;
    if (!gmailIsConnected) {
      setGmailDisconnected("Uruchom backend");
    }
  }, BACKEND_GRACE_MS);

  backendRetryTimer = setInterval(() => {
    updateGmailStatus();
  }, BACKEND_RETRY_MS);
};

const updateGmailStatus = async () => {
  if (!gmailTile) {
    return;
  }

  try {
    const response = await fetch("http://localhost:3000/api/gmail/unread");
    if (!response.ok) {
      stopBackendGrace();
      setGmailDisconnected("Polacz konto");
      return;
    }

    const data = await response.json();
    if (!data.connected) {
      stopBackendGrace();
      setGmailDisconnected("Brak autoryzacji");
      return;
    }

    stopBackendGrace();
    setGmailConnected(data.unread || 0);
  } catch (error) {
    startBackendGrace();
  }
};

if (isNightTime()) {
  document.body.classList.add("theme-dark");
}

window.addEventListener("load", () => {
  revealTiles();
  updateGmailStatus();
  setPreviewOpen(false);
  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => {
      updateGmailStatus();
      if (gmailPreviewOpen && !gmailDetailOpen) {
        loadGmailPreview();
      }
    }, REFRESH_INTERVAL_MS);
  }
});

if (gmailTile) {
  gmailTile.addEventListener("click", (event) => {
    if (!gmailPreview) {
      return;
    }
    event.preventDefault();
    setPreviewOpen(!gmailPreviewOpen);
  });
}

if (gmailPreviewClose) {
  gmailPreviewClose.addEventListener("click", () => {
    setPreviewOpen(false);
  });
}

if (gmailPreviewBack) {
  gmailPreviewBack.addEventListener("click", () => {
    loadGmailPreview();
  });
}

if (gmailActionTrash) {
  gmailActionTrash.addEventListener("click", () => {
    runMessageAction(`http://localhost:3000/api/gmail/message/${currentMessageId}/trash`);
  });
}

if (gmailActionRead) {
  gmailActionRead.addEventListener("click", () => {
    runMessageAction(`http://localhost:3000/api/gmail/message/${currentMessageId}/read`);
  });
}

if (gmailPreviewBody) {
  gmailPreviewBody.addEventListener("click", (event) => {
    const button = event.target.closest(".gmail-preview__item-button");
    if (!button) {
      return;
    }
    const messageId = button.dataset.messageId;
    if (messageId) {
      loadGmailMessage(messageId);
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && gmailPreviewOpen) {
    setPreviewOpen(false);
  }
});

if (themeSelect) {
  themeSelect.addEventListener("change", (event) => {
    const value = event.target.value;
    localStorage.setItem(THEME_KEY, value);
    applyTheme(value);
  });
}

initializeTheme();
