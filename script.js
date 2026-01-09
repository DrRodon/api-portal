const tiles = document.querySelectorAll(".tile");
const gmailTile = document.querySelector(".tile--gmail");
const gmailCount = document.getElementById("gmail-count");
const gmailStatus = document.getElementById("gmail-status");
const gmailCta = document.getElementById("gmail-cta");
const themeSelect = document.getElementById("theme-select");
const BACKEND_GRACE_MS = 30000;
const BACKEND_RETRY_MS = 5000;
const THEME_KEY = "portal-theme";
let backendGraceTimer = null;
let backendRetryTimer = null;
let gmailIsConnected = false;

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
});

if (themeSelect) {
  themeSelect.addEventListener("change", (event) => {
    const value = event.target.value;
    localStorage.setItem(THEME_KEY, value);
    applyTheme(value);
  });
}

initializeTheme();
