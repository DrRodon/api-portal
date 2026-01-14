const tiles = document.querySelectorAll(".tile");
const notatnikTile = document.querySelector(".tile--notatnik");
const notatnikPanel = document.getElementById("notatnik-panel");
const notatnikPanelClose = document.getElementById("notatnik-panel-close");
const notatnikRoot = document.getElementById("notatnik-root");
const notatnikViewButtons = notatnikRoot
  ? notatnikRoot.querySelectorAll("[data-notatnik-view]")
  : [];
const gmailTile = document.querySelector(".tile--gmail");
const gmailCount = document.getElementById("gmail-count");
const gmailStatus = document.getElementById("gmail-status");
const gmailCta = document.getElementById("gmail-cta");
const gmailPreview = document.getElementById("gmail-preview");
const gmailPreviewBody = document.getElementById("gmail-preview-body");
const gmailPreviewClose = document.getElementById("gmail-preview-close");
const gmailPreviewBack = document.getElementById("gmail-preview-back");
const gmailPreviewAuth = document.getElementById("gmail-preview-auth");
const cookbookTile = document.getElementById("cookbook-tile");
const cookbookPanel = document.getElementById("cookbook-panel");
const cookbookPanelClose = document.getElementById("cookbook-panel-close");
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
let notatnikPanelOpen = false;
let currentMessageId = null;
let previewCloseHandler = null;
let notatnikCloseHandler = null;
let cookbookCloseHandler = null;
let cookbookPanelOpen = false;
let portalToken = null;
let portalTokenPromise = null;

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

const getPortalToken = async () => {
  if (portalToken) {
    return portalToken;
  }
  if (!portalTokenPromise) {
    portalTokenPromise = fetch("/api/config", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Config load failed");
        }
        return response.json();
      })
      .then((data) => {
        portalToken = data.token;
        return portalToken;
      })
      .catch((error) => {
        portalTokenPromise = null;
        throw error;
      });
  }
  return portalTokenPromise;
};

const fetchWithToken = async (url, options = {}) => {
  const token = await getPortalToken();
  const headers = new Headers(options.headers || {});
  headers.set("X-Portal-Token", token);
  return fetch(url, { ...options, headers });
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let size = bytes;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 || idx == 0 ? 0 : 1)} ${units[idx]}`;
};

const downloadAttachment = async (messageId, attachment) => {
  if (!messageId || !attachment?.id) {
    return;
  }
  const params = new URLSearchParams();
  if (attachment.filename) {
    params.set("name", attachment.filename);
  }
  if (attachment.mimeType) {
    params.set("type", attachment.mimeType);
  }
  const query = params.toString();
  const url = `/api/gmail/message/${messageId}/attachment/${attachment.id}${query ? `?${query}` : ""}`;

  try {
    const response = await fetchWithToken(url);
    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch (error) {
        detail = "";
      }
      throw new Error(`download failed (${response.status}) ${detail}`.trim());
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = attachment.filename || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    console.error("Attachment download error", error);
    alert("Nie mozna pobrac zalacznika.");
  }
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
    frame.setAttribute("title", "Podgląd wiadomości");
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
  if (Array.isArray(message.attachments) && message.attachments.length) {
    const attachments = document.createElement("div");
    attachments.className = "gmail-preview__attachments";

    const title = document.createElement("div");
    title.className = "gmail-preview__attachments-title";
    title.textContent = "Zalaczniki";

    const list = document.createElement("div");
    list.className = "gmail-preview__attachment-list";

    message.attachments.forEach((attachment) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gmail-preview__attachment";
      button.addEventListener("click", () => {
        downloadAttachment(message.id, attachment);
      });

      const name = document.createElement("span");
      name.textContent = attachment.filename || "attachment";

      const size = document.createElement("span");
      size.className = "gmail-preview__attachment-size";
      size.textContent = formatBytes(attachment.size);

      button.appendChild(name);
      button.appendChild(size);
      list.appendChild(button);
    });

    attachments.appendChild(title);
    attachments.appendChild(list);
    detail.appendChild(attachments);
  }

  gmailPreviewBody.appendChild(detail);
};

const loadGmailMessage = async (messageId) => {
  if (!gmailPreviewBody) {
    return;
  }
  setPreviewAuthVisible(false);
  setPreviewEmpty("Ładuje wiadomość...");
  setDetailMode(true);

  try {
    const response = await fetchWithToken(`/api/gmail/message/${messageId}`);
    if (!response.ok) {
      setPreviewEmpty("Nie można pobrać wiadomości.");
      return;
    }
    const data = await response.json();
    if (!data.connected || !data.message) {
      setPreviewEmpty("Brak autoryzacji konta.");
      return;
    }
    renderMessageDetail(data.message);
  } catch (error) {
    setPreviewEmpty("Nie można połączyć z backendem.");
  }
};

const loadGmailPreview = async () => {
  if (!gmailPreviewBody) {
    return;
  }

  currentMessageId = null;
  setDetailMode(false);
  setPreviewAuthVisible(false);
  setPreviewEmpty("Ładuje podgląd...");

  try {
    const response = await fetchWithToken("/api/gmail/preview");
    if (!response.ok) {
      setPreviewAuthVisible(true);
      setPreviewEmpty("Połącz konto, aby zobaczyć skrzynkę.");
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
      setPreviewEmpty("Brak wiadomości w skrzynce.");
      return;
    }

    renderPreviewList(messages);
  } catch (error) {
    setPreviewAuthVisible(true);
    setPreviewEmpty("Nie można połączyć z backendem.");
  }
};

const runMessageAction = async (endpoint) => {
  if (!currentMessageId) {
    return;
  }
  setPreviewAuthVisible(false);
  setPreviewEmpty("Wykonywanie akcji...");
  try {
    const response = await fetchWithToken(endpoint, { method: "POST" });
    if (!response.ok) {
      setPreviewEmpty("Nie można wykonać akcji.");
      return;
    }
    updateGmailStatus();
    loadGmailPreview();
  } catch (error) {
    setPreviewEmpty("Nie można połączyć z backendem.");
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

const setNotatnikOpen = (isOpen) => {
  notatnikPanelOpen = isOpen;
  if (notatnikPanel) {
    if (isOpen) {
      if (notatnikCloseHandler) {
        notatnikPanel.removeEventListener("transitionend", notatnikCloseHandler);
        notatnikCloseHandler = null;
      }
      notatnikPanel.hidden = false;
      notatnikPanel.classList.remove("is-closing");
      requestAnimationFrame(() => {
        notatnikPanel.classList.add("is-open");
      });
    } else {
      notatnikPanel.classList.remove("is-open");
      notatnikPanel.classList.add("is-closing");
      const onTransitionEnd = (event) => {
        if (event.propertyName !== "opacity") {
          return;
        }
        notatnikPanel.hidden = true;
        notatnikPanel.classList.remove("is-closing");
        notatnikPanel.removeEventListener("transitionend", onTransitionEnd);
        notatnikCloseHandler = null;
      };
      notatnikCloseHandler = onTransitionEnd;
      notatnikPanel.addEventListener("transitionend", onTransitionEnd);
    }
  }
  if (notatnikTile) {
    notatnikTile.setAttribute("aria-expanded", String(isOpen));
  }
};

const setCookbookOpen = (isOpen) => {
  cookbookPanelOpen = isOpen;
  if (cookbookPanel) {
    if (isOpen) {
      if (cookbookCloseHandler) {
        cookbookPanel.removeEventListener("transitionend", cookbookCloseHandler);
        cookbookCloseHandler = null;
      }
      cookbookPanel.hidden = false;
      cookbookPanel.classList.remove("is-closing");
      requestAnimationFrame(() => {
        cookbookPanel.classList.add("is-open");
      });
      // Initialize cookbook app if needed
      if (window.initCookbook) {
        window.initCookbook();
      }
    } else {
      cookbookPanel.classList.remove("is-open");
      cookbookPanel.classList.add("is-closing");
      const onTransitionEnd = (event) => {
        if (event.propertyName !== "opacity") {
          return;
        }
        cookbookPanel.hidden = true;
        cookbookPanel.classList.remove("is-closing");
        cookbookPanel.removeEventListener("transitionend", onTransitionEnd);
        cookbookCloseHandler = null;
      };
      cookbookCloseHandler = onTransitionEnd;
      cookbookPanel.addEventListener("transitionend", onTransitionEnd);
    }
  }
  if (cookbookTile) {
    cookbookTile.setAttribute("aria-expanded", String(isOpen));
  }
};

const setNotatnikView = (view) => {
  if (!notatnikRoot) {
    return;
  }
  notatnikRoot.dataset.view = view;
  notatnikViewButtons.forEach((button) => {
    const isActive = button.dataset.notatnikView === view;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
};


const applyTheme = (mode) => {
  const isNight = mode === "night" || (mode === "auto" && isNightTime());
  document.body.classList.toggle("theme-dark", isNight);
  document.body.dataset.theme = mode;
  window.dispatchEvent(
    new CustomEvent("portal:theme-change", {
      detail: {
        mode: isNight ? "dark" : "light",
        theme: mode
      }
    })
  );
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
  gmailCta.textContent = "Połącz konto";
  gmailTile.setAttribute("href", "/auth");
  if (gmailPreviewOpen && !gmailDetailOpen) {
    setPreviewAuthVisible(true);
    setPreviewEmpty("Połącz konto, aby zobaczyć skrzynkę.");
  }
};

const setGmailConnected = (unread) => {
  if (!gmailCount || !gmailStatus || !gmailCta || !gmailTile) {
    return;
  }

  gmailIsConnected = true;
  gmailCount.textContent = unread.toString();
  gmailStatus.textContent = "Nieprzeczytane";
  gmailCta.textContent = "Otwórz Gmail";
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

  setGmailDisconnected("Łączenie...");

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
    const response = await fetchWithToken("/api/gmail/unread");
    if (!response.ok) {
      stopBackendGrace();
      setGmailDisconnected("Połącz konto");
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
  setNotatnikOpen(false);
  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => {
      updateGmailStatus();
      if (gmailPreviewOpen && !gmailDetailOpen) {
        loadGmailPreview();
      }
      if (cookbookPanelOpen && window.loadCookbookData) {
        window.loadCookbookData();
      }
    }, REFRESH_INTERVAL_MS);
  }
});

if (notatnikTile) {
  notatnikTile.addEventListener("click", (event) => {
    if (!notatnikPanel) {
      return;
    }
    event.preventDefault();
    if (gmailPreviewOpen) {
      setPreviewOpen(false);
    }
    if (cookbookPanelOpen) {
      setCookbookOpen(false);
    }
    setNotatnikOpen(!notatnikPanelOpen);
  });
}

if (notatnikPanelClose) {
  notatnikPanelClose.addEventListener("click", () => {
    setNotatnikOpen(false);
  });
}

if (notatnikViewButtons.length) {
  setNotatnikView(notatnikRoot?.dataset.view || "form");
  notatnikViewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setNotatnikView(button.dataset.notatnikView || "form");
    });
  });
}

if (gmailTile) {
  gmailTile.addEventListener("click", (event) => {
    if (!gmailPreview) {
      return;
    }
    event.preventDefault();
    if (notatnikPanelOpen) {
      setNotatnikOpen(false);
    }
    if (cookbookPanelOpen) {
      setCookbookOpen(false);
    }
    setPreviewOpen(!gmailPreviewOpen);
  });
}

if (cookbookTile) {
  cookbookTile.addEventListener("click", (event) => {
    if (!cookbookPanel) {
      return;
    }
    event.preventDefault();
    if (notatnikPanelOpen) setNotatnikOpen(false);
    if (gmailPreviewOpen) setPreviewOpen(false);
    setCookbookOpen(!cookbookPanelOpen);
  });
}

if (cookbookPanelClose) {
  cookbookPanelClose.addEventListener("click", () => {
    setCookbookOpen(false);
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
    runMessageAction(`/api/gmail/message/${currentMessageId}/trash`);
  });
}

if (gmailActionRead) {
  gmailActionRead.addEventListener("click", () => {
    runMessageAction(`/api/gmail/message/${currentMessageId}/read`);
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
  if (event.key !== "Escape") {
    return;
  }
  if (gmailPreviewOpen) {
    setPreviewOpen(false);
  }
  if (notatnikPanelOpen) {
    setNotatnikOpen(false);
  }
  if (cookbookPanelOpen) {
    setCookbookOpen(false);
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
