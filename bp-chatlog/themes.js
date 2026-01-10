// themes.js
(() => {
  const SETTINGS_KEY = "bp_chatlog_settings_v4";

  const THEMES = [
    {
      id: "wellbeing_mint",
      name: "Wellbeing (mint)",
      light: {
        bg: "#F6FFFB",
        panel: "#FFFFFF",
        panel2: "rgba(255,255,255,.72)",
        text: "#0B1220",
        muted: "#4B5563",
        border: "rgba(15,23,42,.10)",
        input: "rgba(15,23,42,.04)",
        inputBorder: "rgba(15,23,42,.10)",
        accent: "#14B8A6",
        accentSoft: "rgba(20,184,166,.16)",
      },
      dark: {
        bg: "#0B0F14",
        panel: "#121A23",
        panel2: "rgba(18,26,35,.72)",
        text: "#E8EEF7",
        muted: "#A3AEC2",
        border: "rgba(255,255,255,.10)",
        input: "rgba(255,255,255,.06)",
        inputBorder: "rgba(255,255,255,.12)",
        accent: "#14B8A6",
        accentSoft: "rgba(20,184,166,.18)",
      }
    },
    {
      id: "clean_clinic",
      name: "Clean clinic (blue)",
      light: {
        bg: "#F7F9FC",
        panel: "#FFFFFF",
        panel2: "rgba(255,255,255,.72)",
        text: "#0F172A",
        muted: "#475569",
        border: "rgba(15,23,42,.10)",
        input: "rgba(15,23,42,.04)",
        inputBorder: "rgba(15,23,42,.10)",
        accent: "#2563EB",
        accentSoft: "rgba(37,99,235,.14)",
      },
      dark: {
        bg: "#0B0D12",
        panel: "#121826",
        panel2: "rgba(18,24,38,.72)",
        text: "#E8EEF7",
        muted: "#A3AEC2",
        border: "rgba(255,255,255,.10)",
        input: "rgba(255,255,255,.06)",
        inputBorder: "rgba(255,255,255,.12)",
        accent: "#7AA2FF",
        accentSoft: "rgba(122,162,255,.18)",
      }
    },
    {
      id: "mental_calm",
      name: "Mental calm (indigo)",
      light: {
        bg: "#FAFAFF",
        panel: "#FFFFFF",
        panel2: "rgba(255,255,255,.72)",
        text: "#111827",
        muted: "#4B5563",
        border: "rgba(17,24,39,.10)",
        input: "rgba(17,24,39,.04)",
        inputBorder: "rgba(17,24,39,.10)",
        accent: "#6366F1",
        accentSoft: "rgba(99,102,241,.16)",
      },
      dark: {
        bg: "#0B0B12",
        panel: "#14162A",
        panel2: "rgba(20,22,42,.72)",
        text: "#E9ECFF",
        muted: "#B7BDE3",
        border: "rgba(255,255,255,.10)",
        input: "rgba(255,255,255,.06)",
        inputBorder: "rgba(255,255,255,.12)",
        accent: "#818CF8",
        accentSoft: "rgba(129,140,248,.18)",
      }
    },
    {
      id: "sage_warmth",
      name: "Sage + warmth",
      light: {
        bg: "#FBFBF7",
        panel: "#FFFFFF",
        panel2: "rgba(255,255,255,.72)",
        text: "#1F2937",
        muted: "#4B5563",
        border: "rgba(31,41,55,.10)",
        input: "rgba(31,41,55,.04)",
        inputBorder: "rgba(31,41,55,.10)",
        accent: "#6BAA75",
        accentSoft: "rgba(107,170,117,.18)",
      },
      dark: {
        bg: "#0C0F0C",
        panel: "#141A14",
        panel2: "rgba(20,26,20,.72)",
        text: "#EAF2EA",
        muted: "#B0C2B0",
        border: "rgba(255,255,255,.10)",
        input: "rgba(255,255,255,.06)",
        inputBorder: "rgba(255,255,255,.12)",
        accent: "#7CCB8A",
        accentSoft: "rgba(124,203,138,.18)",
      }
    }
  ];

  function getDefaultSettings(){
    return { themeId: "wellbeing_mint", mode: "light" };
  }

  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      const s = raw ? JSON.parse(raw) : null;
      return { ...getDefaultSettings(), ...(s || {}) };
    }catch{
      return getDefaultSettings();
    }
  }

  function saveSettings(settings){
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function applyTheme(settings){
    const root = document.getElementById("notatnik-root") || document.documentElement;
    const theme = THEMES.find(t => t.id === settings.themeId) || THEMES[0];
    const mode = settings.mode === "dark" ? "dark" : "light";
    const vars = mode === "dark" ? theme.dark : theme.light;

    root.dataset.mode = mode;

    Object.entries(vars).forEach(([k,v]) => {
      root.style.setProperty(`--${k}`, v);
    });
  }

  function initThemeUI(){
    const themeSelect = document.getElementById("themeSelect");
    const modeToggle = document.getElementById("modeToggle");

    const settings = loadSettings();

    if(themeSelect){
      themeSelect.innerHTML = "";
      THEMES.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.name;
        themeSelect.appendChild(opt);
      });
      themeSelect.value = settings.themeId;
      themeSelect.addEventListener("change", () => {
        settings.themeId = themeSelect.value;
        saveSettings(settings);
        applyTheme(settings);
        window.dispatchEvent(new CustomEvent("theme:changed", { detail: settings }));
      });
    }

    if(modeToggle){
      modeToggle.checked = settings.mode === "dark";
      modeToggle.addEventListener("change", () => {
        settings.mode = modeToggle.checked ? "dark" : "light";
        saveSettings(settings);
        applyTheme(settings);
        window.dispatchEvent(new CustomEvent("theme:changed", { detail: settings }));
      });
    }

    applyTheme(settings);
    return settings;
  }

  window.Theme = {
    THEMES,
    SETTINGS_KEY,
    getDefaultSettings,
    loadSettings,
    saveSettings,
    applyTheme,
    initThemeUI
  };
})();
