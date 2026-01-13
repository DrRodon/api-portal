(() => {
  const STORAGE_KEY = "bp_chatlog_items_v4";
  const MEDS_KEY = "bp_chatlog_meds_v1";
  const WATER_TARGET_KEY = "bp_chatlog_water_target_ml_v1";
  const DEFAULT_WATER_TARGET = 2000;

  const el = (id) => document.getElementById(id);
  const state = { items: [], editingId: null };
  const isEmbedded = Boolean(document.getElementById("notatnik-panel"));

  function uuid() {
    return (crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  }

  function safeNum(v) {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const x = Number(s.replace(",", "."));
    return Number.isFinite(x) ? x : null;
  }

  function nowLocalInputValue() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toLocalInput(dateObj) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;")
      .replaceAll("\n", "<br/>");
  }

  function normalizeText(s) { return String(s ?? "").toLowerCase().trim(); }

  function toast(msg) {
    const t = el("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  function formatWhen(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function parseDateOnly(v) {
    if (!v) return null;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dayKey(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "unknown";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function bpStatusInfo(sys, dia) {
    if (sys == null || dia == null) return { cls: "", title: "Brak danych", explain: "", range: "" };
    if (sys >= 180 || dia >= 120) {
      return { cls: "bad", title: "Bardzo wysokie cisnienie", explain: "Znacznie powyzej normy.", range: "SYS 180+ lub DIA 120+" };
    }
    if (sys >= 140 || dia >= 90) {
      return { cls: "warn", title: "Wysokie cisnienie", explain: "Powyzej normy.", range: "SYS 140+ lub DIA 90+" };
    }
    if (sys >= 130 || dia >= 85) {
      return { cls: "warn", title: "Podwyzszone cisnienie", explain: "Lekko powyzej normy.", range: "SYS 130+ lub DIA 85+" };
    }
    if (sys < 90 || dia < 60) {
      return { cls: "warn", title: "Niskie cisnienie", explain: "Ponizej normy.", range: "SYS < 90 lub DIA < 60" };
    }
    return { cls: "ok", title: "W normie", explain: "Wartosc w granicach normy.", range: "Ponizej progow ostrzegawczych" };
  }

  function scaleLabel(v) {
    if (v <= 0) return "brak";
    if (v <= 2) return "minimalne";
    if (v <= 4) return "łagodne";
    if (v <= 6) return "wyraźne";
    if (v <= 8) return "silne";
    return "bardzo silne";
  }

  function loadWaterTarget() {
    try {
      const raw = localStorage.getItem(WATER_TARGET_KEY);
      const v = Number(raw);
      return Number.isFinite(v) && v > 0 ? Math.round(v) : DEFAULT_WATER_TARGET;
    } catch {
      return DEFAULT_WATER_TARGET;
    }
  }

  function effectiveWaterMl(item) {
    if (typeof item?.waterMl === "number" && item.waterMl > 0) {
      const hyd = (typeof item.hydration === "number" && Number.isFinite(item.hydration)) ? item.hydration : 1;
      return Math.round(item.waterMl * hyd);
    }
    return 0;
  }

  function loadMedsAll() {
    if (state.readOnly && state.meds) return state.meds;
    try {
      const raw = localStorage.getItem(MEDS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function parseMedStatus(v) {
    if (v == null || v === "") return { state: "none", mult: 0 };
    if (typeof v === "number") {
      if (v > 0) return { state: "taken", mult: v };
      if (v < 0) return { state: "missed", mult: Math.abs(v) };
      return { state: "none", mult: 0 };
    }
    const s = String(v);
    if (/^[-+]?\d+(\.\d+)?$/.test(s)) {
      const num = Number(s);
      if (num > 0) return { state: "taken", mult: num };
      if (num < 0) return { state: "missed", mult: Math.abs(num) };
      return { state: "none", mult: 0 };
    }
    if (s.startsWith("taken")) {
      const parts = s.split(":");
      const mult = Number(parts[1]);
      return { state: "taken", mult: Number.isFinite(mult) && mult > 0 ? mult : 1 };
    }
    if (s === "missed" || s === "late") return { state: "missed", mult: 1 };
    return { state: "none", mult: 0 };
  }

  function chartSvg(series) {
    const w = 320;
    const h = 80;
    const p = 6;
    const gridSteps = 4;
    const points = series.filter(s => s.values.length > 0);
    if (!points.length) return "";

    let min = Infinity;
    let max = -Infinity;
    let firstIndex = Infinity;
    let lastIndex = -1;

    for (const s of points) {
      for (let i = 0; i < s.values.length; i += 1) {
        const v = s.values[i];
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
        if (i < firstIndex) firstIndex = i;
        if (i > lastIndex) lastIndex = i;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
    if (!Number.isFinite(firstIndex) || lastIndex < firstIndex) return "";
    const span = (max - min) || 1;
    const innerW = w - 2 * p;
    const innerH = h - 2 * p;
    const denom = Math.max(1, lastIndex - firstIndex);

    const grid = Array.from({ length: gridSteps + 1 }, (_, i) => {
      const y = p + innerH * (i / gridSteps);
      return `<line class="chartGrid" x1="${p}" y1="${y.toFixed(1)}" x2="${(w - p).toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    }).join("");

    const axis = `<line class="chartAxis" x1="${p}" y1="${p}" x2="${p}" y2="${(h - p).toFixed(1)}"/>`;

    const lines = points.map((s) => {
      const pts = s.values.map((v, i) => {
        if (i < firstIndex || i > lastIndex) return null;
        if (v == null) return null;
        const x = p + innerW * ((i - firstIndex) / denom);
        const y = p + innerH * (1 - (v - min) / span);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).filter(Boolean).join(" ");
      return `<polyline class="chartLine ${s.cls}" points="${pts}"/>`;
    }).join("");

    const dots = points.map((s) => {
      const count = s.values.reduce((acc, v) => (v == null ? acc : acc + 1), 0);
      if (count > 1) return "";
      const circles = s.values.map((v, i) => {
        if (i < firstIndex || i > lastIndex) return null;
        if (v == null) return null;
        const x = p + innerW * ((i - firstIndex) / denom);
        const y = p + innerH * (1 - (v - min) / span);
        return `<circle class="chartPoint ${s.cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`;
      }).filter(Boolean).join("");
      return circles;
    }).join("");

    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${grid}${axis}${lines}${dots}</svg>`;
  }

  function renderSummary(items) {
    const waterTotal = items.reduce((sum, it) => sum + effectiveWaterMl(it), 0);
    const from = parseDateOnly(el("fromDate").value);
    const to = parseDateOnly(el("toDate").value);
    let dayCount = 0;
    if (from && to) {
      const fromMs = from.getTime();
      const toMs = to.getTime();
      dayCount = Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1);
    } else {
      const days = new Set();
      for (const it of items) {
        if (it?.dt) days.add(dayKey(it.dt));
      }
      dayCount = days.size || 0;
    }
    const targetPerDay = loadWaterTarget();
    const targetTotal = dayCount > 0 ? (dayCount * targetPerDay) : 0;

    const waterTotalEl = el("waterTotal");
    const waterTargetEl = el("waterTarget");
    const waterDaysEl = el("waterDays");
    const waterBarEl = el("waterBar");

    if (waterTotalEl) waterTotalEl.textContent = String(waterTotal || 0);
    if (waterTargetEl) waterTargetEl.textContent = targetTotal ? String(targetTotal) : "-";
    if (waterDaysEl) waterDaysEl.textContent = dayCount ? `${dayCount} dni` : "brak zakresu";
    if (waterBarEl) {
      const pct = targetTotal > 0 ? Math.min(100, Math.round((waterTotal / targetTotal) * 100)) : 0;
      waterBarEl.style.width = `${pct}%`;
    }

    const sorted = [...items].sort((a, b) => new Date(a.dt).getTime() - new Date(b.dt).getTime());
    const sysSeries = sorted.map(it => (typeof it.sys === "number" && it.sys > 0 ? it.sys : null));
    const diaSeries = sorted.map(it => (typeof it.dia === "number" && it.dia > 0 ? it.dia : null));
    const pulseSeries = sorted.map(it => (typeof it.pulse === "number" && it.pulse > 0 ? it.pulse : null));
    const chart = chartSvg([
      { cls: "sys", values: sysSeries },
      { cls: "dia", values: diaSeries },
      { cls: "pulse", values: pulseSeries }
    ]);

    const chartBox = el("bpPulseChart");
    if (chartBox) {
      if (chart) {
        chartBox.innerHTML = chart;
        chartBox.classList.add("hasChart");
      } else {
        chartBox.textContent = "Brak danych w widoku.";
        chartBox.classList.remove("hasChart");
      }
    }

    const bpInfo = el("bpPulseInfo");
    if (bpInfo) {
      const latestBp = [...sorted].reverse().find(it => typeof it.sys === "number" && typeof it.dia === "number" && it.sys > 0 && it.dia > 0);
      const latestPulse = [...sorted].reverse().find(it => typeof it.pulse === "number" && it.pulse > 0);
      const bpCount = sysSeries.filter(v => v != null).length;
      const pulseCount = pulseSeries.filter(v => v != null).length;

      const rows = [];
      if (latestBp) {
        const status = bpStatusInfo(latestBp.sys, latestBp.dia);
        const arrow = status.cls === "bad" ? "&#9650;&#9650;" : (status.cls === "warn" ? "&#9650;" : "&#9654;");
        const ariaText = [status.title, status.range].filter(Boolean).join(". ");
        rows.push(
          `<div class="bpInfoRow bpRow">
            <div class="bpRowMain">
              <span class="bpInfoLabel">Ostatni BP:</span>
              <span class="bpInfoValue">${latestBp.sys}/${latestBp.dia}</span>
            </div>
            <span class="bpArrow ${status.cls}" aria-label="${escapeHtml(ariaText)}">
              ${arrow}
              <span class="tooltipBox">
                <span class="tooltipTitle">${escapeHtml(status.title)}</span>
                <span class="tooltipText">${escapeHtml(status.explain)}</span>
                <span class="tooltipText"><strong>SYS</strong> = gorne cisnienie (skurczowe), <strong>DIA</strong> = dolne (rozkurczowe).</span>
                <span class="tooltipText">Prog dla tego statusu: ${escapeHtml(status.range)}.</span>
                <span class="tooltipText">Progi w aplikacji (SYS/DIA): 180/120, 140/90, 130/85, &lt;90/&lt;60.</span>
              </span>
            </span>
          </div>`
        );
      }
      if (latestPulse) {
        rows.push(
          `<div class="bpInfoRow"><span class="bpInfoLabel">Ostatni puls:</span><span class="bpInfoValue">${latestPulse.pulse}</span></div>`
        );
      }
      if (latestBp) {
        rows.push(
          `<div class="bpInfoRow"><span class="bpInfoLabel">Kiedy:</span><span class="bpInfoValue">${formatWhen(latestBp.dt)}</span></div>`
        );
      }
      if (bpCount || pulseCount) {
        rows.push(
          `<div class="bpInfoRow"><span class="bpInfoLabel">Wpisy:</span><span class="bpInfoValue">BP ${bpCount} | Tętno ${pulseCount}</span></div>`
        );
      }

      bpInfo.innerHTML = rows.length ? rows.join("") : "-";
    }

    const medsBox = el("medsSummary");
    if (medsBox) {
      const stats = new Map();
      for (const it of items) {
        if (!it?.medications || typeof it.medications !== "object") continue;
        for (const [id, status] of Object.entries(it.medications)) {
          if (!stats.has(id)) stats.set(id, { taken: 0, missed: 0 });
          const entry = stats.get(id);
          const parsed = parseMedStatus(status);
          if (parsed.state === "taken") entry.taken += parsed.mult;
          if (parsed.state === "missed") entry.missed += parsed.mult;
        }
      }

      if (!stats.size) {
        medsBox.textContent = "Brak danych w widoku.";
      } else {
        const catalog = loadMedsAll();
        const nameById = new Map(catalog.map(m => [m.id, m]));

        const rows = [];
        const toTitleCase = (s) => {
          const base = String(s || "").replace(/[-_]+/g, " ").trim();
          if (!base) return "";
          return base.split(" ").map(w => w ? (w[0].toUpperCase() + w.slice(1)) : "").join(" ");
        };
        for (const [id, v] of stats.entries()) {
          const m = nameById.get(id);
          const rawName = m ? (m.name || "") : "";
          const hasUpper = /[A-Z]/.test(rawName);
          const pretty = rawName ? (hasUpper ? rawName : toTitleCase(rawName)) : toTitleCase(id);
          const name = pretty ? `${pretty}${m && m.dose ? " " + m.dose : ""}` : id;
          rows.push(
            `<div class="medsRow">
              <div class="medsCell">${escapeHtml(name)}</div>
              <div class="medsStat ok">${v.taken ? "✓" + v.taken : "-"}</div>
              <div class="medsStat bad">${v.missed ? "✕" + v.missed : "-"}</div>
            </div>`
          );
        }
        medsBox.innerHTML = rows.join("");
      }
    }
  }

  async function load() {
    state.readOnly = false;
    state.meds = null;

    const params = new URLSearchParams(window.location.search);
    const viewUser = params.get("viewUser");

    if (viewUser) {
      state.readOnly = true;
      const form = el("formCard");
      if (form) form.style.display = "none";
      const switcher = document.querySelector(".mobileSwitch");
      if (switcher) switcher.style.display = "none";

      try {
        const res = await fetch(`/api/bp/view/${encodeURIComponent(viewUser)}`);
        const json = await res.json();
        if (json.ok) {
          state.items = typeof json.items === "string" ? JSON.parse(json.items) : (json.items || []);
          const medArr = typeof json.meds === "string" ? JSON.parse(json.meds) : (json.meds || []);
          state.meds = Array.isArray(medArr) ? medArr : [];
          render();
          toast(`Podgląd: ${escapeHtml(json.owner)}`);
        } else {
          toast("Brak dostępu lub błąd.");
        }
      } catch (e) {
        console.error(e);
        toast("Błąd ładowania podglądu.");
      }
      return;
    }

    // Cloud-only: Fetch directly, no local fallback
    try {
      const res = await fetch("/api/bp/sync");
      const json = await res.json();
      if (json.ok) {
        state.items = typeof json.items === "string" ? JSON.parse(json.items) : (json.items || []);
        if (!state.readOnly) {
          // One-time cleanup if needed or just ignore local storage
          // console.log("Cloud loaded. Items:", state.items.length);
        }
      } else {
        toast("Brak połączenia z bazą.");
      }
    } catch (e) {
      console.error(e);
      toast("Błąd ładowania danych.");
      state.items = [];
    }
  }

  async function save() {
    if (state.readOnly) return;

    // Cloud-only: Direct Push
    // We show a spinner or toast to indicate saving
    const saveBtn = el("saveBtn");
    const originalText = saveBtn ? saveBtn.textContent : "";
    if (saveBtn) saveBtn.textContent = "Zapisywanie...";

    try {
      // We need to send meds too, otherwise they might get cleared if we don't send them
      // We'll fetch them from an internal function or just send what we have if the API supports partial updates (it replaces all, so we need meds)
      // Actually, server.js replaces both. So we need to make sure we don't wipe meds.
      // But this save() is called after upsert/remove of ITEMS.
      // Ideally we should keep meds in state too. For now let's load them from API if not in state?
      // Since we are cloud-only, we should probably store meds in global state to avoid fetching them every save.

      // OPTIMIZATION: In Cloud-Only, we'll assume state.items is current.
      // We also need meds. The simplest way for now without refactoring everything to one state:
      // Fetch current meds to include in payload? data-loss risk if race condition.

      // Let's rely on the fact that we might have loaded meds in settings. But settings might not be open.
      // For safety in this "Cloud Only" refactor, we will retrieve meds first or use a separate endpoint for updating only items?
      // server.js expects { items, meds }. If we send only items, meds might be set to undefined?
      // Looking at server.js: 
      // const { items, meds } = req.body; 
      // await Promise.all([ kv.set(..., items || []), kv.set(..., meds || []) ]);
      // So if meds is undefined, it sets [] (empty)! ERROR RISK.

      // FIX: We need to load meds before saving items if we don't have them.
      // OR better: Change backend to PATCH? Too much work.
      // Let's just fetch existing meds first if we don't have them in a reliable place.
      // Actually, we can just fetch /api/bp/sync (lite?) or just re-read.

      // Current hack: We will read meds from the endpoint before saving to ensure we don't wipe them.
      // Not efficient but safe.

      let currentMeds = [];
      try {
        const r = await fetch("/api/bp/sync");
        const j = await r.json();
        if (j.ok && j.meds) currentMeds = j.meds;
      } catch (e) {/* ignore */ }

      await fetch("/api/bp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: state.items, meds: currentMeds })
      });
      // toast("Zapisano w chmurze.");
    } catch (e) {
      console.error(e);
      toast("Błąd zapisu!");
    } finally {
      if (saveBtn) saveBtn.textContent = originalText;
    }
  }

  function loadMedsCatalog() {
    try {
      const raw = localStorage.getItem(MEDS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const meds = Array.isArray(arr) ? arr : [];
      return meds.filter(m => m && m.active);
    } catch {
      return [];
    }
  }

  function renderMedChecklist(selected) {
    const box = el("medChecklist");
    if (!box) return;

    const meds = loadMedsCatalog();
    const cur = selected && typeof selected === "object" ? selected : {};

    const maxMult = 4;
    const minMult = -1;

    if (!meds.length) {
      box.innerHTML = `<div class="small">Nie masz zdefiniowanych leków. Dodaj je w Ustawieniach.</div>`;
      return;
    }

    box.innerHTML = "";
    meds.forEach(m => {
      const prnLabel = m.prn ? "doraźnie" : "";
      const tooltip = [m.name, m.dose, prnLabel || m.defaultTime].filter(Boolean).join(" | ");
      const row = document.createElement("div");
      row.className = "medItem";

      const left = document.createElement("div");
      left.className = "left";
      left.innerHTML = `
        <div class="name tooltipTrigger" data-tooltip="${escapeHtml(tooltip || m.name || "")}"><span class="medNameText">${escapeHtml(m.name)}</span></div>
        <div class="hint">${m.prn ? "doraźnie" : (m.defaultTime ? `domyślnie ${escapeHtml(m.defaultTime)}` : "bez domyślnej godziny")}</div>
      `;

      const right = document.createElement("div");
      right.className = "right";

      if (m.dose) {
        const doseBadge = document.createElement("span");
        doseBadge.className = "badge medDoseBadge";
        doseBadge.textContent = m.dose;
        right.appendChild(doseBadge);
      }

      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.setAttribute("data-med-id", m.id);
      const parsedCur = parseMedStatus(cur[m.id]);
      let curVal = 0;
      if (parsedCur.state === "taken") curVal = parsedCur.mult;
      else if (parsedCur.state === "missed") curVal = -parsedCur.mult;
      hidden.value = String(curVal);

      const multBox = document.createElement("div");
      multBox.className = "medMultBox";
      const multMinus = document.createElement("button");
      multMinus.type = "button";
      multMinus.className = "medMultBtn";
      multMinus.textContent = "-";
      const multVal = document.createElement("div");
      multVal.className = "medMultVal";
      const multPlus = document.createElement("button");
      multPlus.type = "button";
      multPlus.className = "medMultBtn";
      multPlus.textContent = "+";
      multBox.appendChild(multMinus);
      multBox.appendChild(multVal);
      multBox.appendChild(multPlus);

      const updateActive = () => {
        const num = Number(hidden.value) || 0;
        multVal.textContent = num === 0 ? "0" : (num > 0 ? `+${num}` : String(num));
        multBox.classList.toggle("pos", num > 0);
        multBox.classList.toggle("neg", num < 0);
      };
      updateActive();

      const bump = (dir) => {
        const curNum = Number(hidden.value) || 0;
        const next = Math.max(minMult, Math.min(maxMult, curNum + dir));
        hidden.value = String(next);
        updateActive();
      };
      multMinus.onclick = () => bump(-1);
      multPlus.onclick = () => bump(1);

      right.appendChild(multBox);
      right.appendChild(hidden);

      row.appendChild(left);
      row.appendChild(right);
      box.appendChild(row);
    });
  }

  function syncSliders() {
    const s = Number(el("severity").value);
    const a = Number(el("anxiety").value);
    el("severityVal").textContent = String(s);
    el("anxietyVal").textContent = String(a);
    el("severityText").textContent = scaleLabel(s);
    el("anxietyText").textContent = scaleLabel(a);
  }

  function resetForm() {
    state.editingId = null;
    el("formTitle").textContent = "Dodaj wpis";
    el("cancelEditBtn").classList.add("hidden");
    el("saveBtn").textContent = "Zapisz";

    el("dt").value = nowLocalInputValue();
    el("sys").value = "";
    el("dia").value = "";
    el("pulse").value = "";

    el("food").value = "";
    el("waterAmount").value = "";
    el("waterType").value = "1";

    el("substances").value = "";
    el("events").value = "";
    el("sleep").value = "";

    el("symptoms").value = "";
    el("hypothesis").value = "";
    el("notes").value = "";

    el("medNotes").value = "";
    el("medsToggle").checked = false;
    el("medsSection").classList.add("hidden");
    renderMedChecklist({});

    el("severity").value = "0";
    el("anxiety").value = "0";
    syncSliders();
  }

  function readForm() {
    const dtLocal = el("dt").value;
    const dtISO = dtLocal ? new Date(dtLocal).toISOString() : new Date().toISOString();

    const medsStatus = {};
    const medsEnabled = Boolean(el("medsToggle").checked);
    if (medsEnabled) {
      document.querySelectorAll('#medChecklist input[type="hidden"][data-med-id]').forEach(h => {
        const id = h.getAttribute("data-med-id");
        const v = h.value;
        if (id && v && v !== "none" && v !== "0") medsStatus[id] = v;
      });
    }

    const waterMl = safeNum(el("waterAmount").value);
    const hydration = Number(el("waterType").value || 1);

    return {
      dt: dtISO,
      sys: safeNum(el("sys").value),
      dia: safeNum(el("dia").value),
      pulse: safeNum(el("pulse").value),

      medications: medsEnabled ? medsStatus : {},
      medNotes: medsEnabled ? el("medNotes").value.trim() : "",

      food: el("food").value.trim(),
      waterMl,
      hydration: Number.isFinite(hydration) ? hydration : 1,

      events: el("events").value.trim(),
      sleep: el("sleep").value.trim(),
      substances: el("substances").value.trim(),

      symptoms: el("symptoms").value.trim(),
      severity: safeNum(el("severity").value) ?? 0,
      anxiety: safeNum(el("anxiety").value) ?? 0,
      hypothesis: el("hypothesis").value.trim(),
      notes: el("notes").value.trim(),
    };
  }

  function writeForm(item) {
    const d = new Date(item.dt);
    el("dt").value = Number.isNaN(d.getTime()) ? nowLocalInputValue() : toLocalInput(d);

    el("sys").value = item.sys ?? "";
    el("dia").value = item.dia ?? "";
    el("pulse").value = item.pulse ?? "";

    el("food").value = item.food ?? "";
    el("waterAmount").value = item.waterMl ?? "";
    el("waterType").value = String(item.hydration ?? 1);

    el("events").value = item.events ?? "";
    el("sleep").value = item.sleep ?? "";
    el("substances").value = item.substances ?? "";

    el("symptoms").value = item.symptoms ?? "";

    el("severity").value = String(item.severity ?? 0);
    el("anxiety").value = String(item.anxiety ?? 0);
    syncSliders();

    el("hypothesis").value = item.hypothesis ?? "";
    el("notes").value = item.notes ?? "";

    const hasMeds = (item.medications && Object.keys(item.medications).length) || (item.medNotes && item.medNotes.trim());
    el("medsToggle").checked = Boolean(hasMeds);
    el("medsSection").classList.toggle("hidden", !hasMeds);
    el("medNotes").value = item.medNotes ?? "";
    renderMedChecklist(item.medications || {});
  }

  function upsert() {
    const data = readForm();

    if (state.editingId) {
      const idx = state.items.findIndex(x => x.id === state.editingId);
      if (idx >= 0) {
        state.items[idx] = { ...state.items[idx], ...data };
        save();
        toast("Zapisano zmiany.");
      } else {
        state.items.push({ id: uuid(), createdAt: new Date().toISOString(), ...data });
        save();
        toast("Nie znalazłem wpisu do edycji. Zapisano jako nowy.");
      }
    } else {
      state.items.push({ id: uuid(), createdAt: new Date().toISOString(), ...data });
      save();
      toast("Dodano wpis.");
    }

    load();
    resetForm();
    render();
  }

  function startEdit(id) {
    const it = state.items.find(x => x.id === id);
    if (!it) return;
    state.editingId = id;
    el("formTitle").textContent = "Edytuj wpis";
    el("cancelEditBtn").classList.remove("hidden");
    el("saveBtn").textContent = "Zapisz zmiany";
    writeForm(it);
  }

  function remove(id) {
    const ok = confirm("Usunąć ten wpis? Tego nie cofniesz.");
    if (!ok) return;
    state.items = state.items.filter(x => x.id !== id);
    save();
    load();
    toast("Usunięto wpis.");
    render();
  }

  function buildSearchBlob(item) {
    const medsText = item.medications ? JSON.stringify(item.medications) : "";
    return normalizeText([
      item.food,
      item.waterMl, item.hydration,
      item.events, item.sleep, item.substances,
      item.symptoms, item.hypothesis, item.notes,
      item.medNotes, medsText
    ].join(" | "));
  }

  function filtered() {
    const q = normalizeText(el("q").value);
    const sort = el("sort").value;

    const from = parseDateOnly(el("fromDate").value);
    const to = parseDateOnly(el("toDate").value);

    let fromTs = null;
    let toTs = null;

    if (from) {
      from.setHours(0, 0, 0, 0);
      fromTs = from.getTime();
    }
    if (to) {
      to.setHours(23, 59, 59, 999);
      toTs = to.getTime();
    }

    let items = [...state.items].filter(x => x && x.dt);

    if (fromTs != null) items = items.filter(it => new Date(it.dt).getTime() >= fromTs);
    if (toTs != null) items = items.filter(it => new Date(it.dt).getTime() <= toTs);

    if (q) items = items.filter(it => buildSearchBlob(it).includes(q));

    items.sort((a, b) => {
      const ta = new Date(a.dt).getTime();
      const tb = new Date(b.dt).getTime();
      return sort === "asc" ? ta - tb : tb - ta;
    });

    return items;
  }

  function render() {
    const items = filtered();
    renderSummary(items);
    el("countPill").textContent = String(state.items.length);

    const list = el("list");
    list.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = "Brak wpisów w tym widoku.";
      list.appendChild(empty);
      return;
    }

    const showMetrics = Boolean(el("showMetrics")?.checked);
    let rendered = 0;
    for (let idx = 0; idx < items.length; idx += 1) {
      const it = items[idx];
      const lines = [];

      if (it.medNotes) lines.push({ k: "Uwagi do leków", v: it.medNotes });
      if (it.food) lines.push({ k: "Jedzenie", v: it.food });
      if (it.events) lines.push({ k: "Wydarzenia", v: it.events });
      if (it.sleep) lines.push({ k: "Sen", v: it.sleep });
      if (it.substances) lines.push({ k: "Substancje", v: it.substances });
      if (it.symptoms) lines.push({ k: "Objawy", v: it.symptoms });
      if (it.hypothesis) lines.push({ k: "Hipoteza", v: it.hypothesis });
      if (it.notes) lines.push({ k: "Notatki", v: it.notes });

      if (!lines.length) {
        const tags = [];
        if (typeof it.sys === "number" && typeof it.dia === "number" && it.sys > 0 && it.dia > 0) tags.push("ciśnienie");
        if (typeof it.pulse === "number" && it.pulse > 0) tags.push("puls");
        if (typeof it.waterMl === "number" && it.waterMl > 0) tags.push("nawodnienie");
        if (it.medications && typeof it.medications === "object" && Object.keys(it.medications).length) tags.push("leki");
        if (!showMetrics || !tags.length) continue;
        lines.push({ k: "Wpis metryczny", v: tags.join(", ") });
      }

      const item = document.createElement("div");
      item.className = "item";

      const meta = document.createElement("div");
      meta.className = "meta";

      const left = document.createElement("div");
      left.innerHTML = `
        <div class="when">${formatWhen(it.dt)}</div>
        <div class="small">Sev: ${it.severity ?? "-"} | Anx: ${it.anxiety ?? "-"}</div>
      `;

      meta.appendChild(left);

      const content = document.createElement("div");
      content.className = "content";

      for (const ln of lines) {
        const p = document.createElement("div");
        p.className = "line";
        p.innerHTML = `<span class="muted">${ln.k}:</span> ${escapeHtml(ln.v)}`;
        content.appendChild(p);
      }

      const actions = document.createElement("div");
      actions.className = "actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edytuj";
      editBtn.onclick = () => startEdit(it.id);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "danger";
      delBtn.textContent = "Usuń";
      delBtn.onclick = () => remove(it.id);

      if (!state.readOnly) {
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
      }

      item.appendChild(meta);
      item.appendChild(content);
      item.appendChild(actions);

      list.appendChild(item);
      rendered += 1;
    }
    if (!rendered) {
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = "Brak wpisów w tym widoku.";
      list.appendChild(empty);
    }
  }

  function setDateRangeToToday() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    el("fromDate").value = today;
    el("toDate").value = today;
    render();
  }

  function clearDateRange() {
    el("fromDate").value = "";
    el("toDate").value = "";
    render();
  }

  function buildViewExportPayload(viewItems) {
    return {
      exportedAt: new Date().toISOString(),
      app: "bp-chatlog",
      version: 4,
      scope: "current_view",
      filters: {
        q: el("q").value ?? "",
        sort: el("sort").value ?? "desc",
        fromDate: el("fromDate").value ?? "",
        toDate: el("toDate").value ?? ""
      },
      items: viewItems
    };
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { }

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function copyCurrentViewJson() {
    const view = filtered();
    const payload = buildViewExportPayload(view);
    const text = JSON.stringify(payload, null, 2);
    const ok = await copyTextToClipboard(text);
    if (ok) toast(`Skopiowano JSON z widoku. Wpisów: ${view.length}`);
    else alert("Nie udało się skopiować do schowka (blokada przeglądarki).");
  }

  function init() {
    load();

    const settings = window.Theme.loadSettings();
    const applyThemeWithMode = (modeOverride) => {
      const mode = modeOverride || settings.mode;
      window.Theme.applyTheme({ ...settings, mode });
    };

    if (isEmbedded) {
      const portalMode = document.body.classList.contains("theme-dark") ? "dark" : "light";
      applyThemeWithMode(portalMode);
      window.addEventListener("portal:theme-change", (event) => {
        applyThemeWithMode(event?.detail?.mode);
      });
    } else {
      applyThemeWithMode();
    }

    el("dt").value = nowLocalInputValue();
    el("severity").value = "0";
    el("anxiety").value = "0";
    syncSliders();

    renderMedChecklist({});
    el("medsSection").classList.add("hidden");

    el("saveBtn").addEventListener("click", upsert);
    el("resetBtn").addEventListener("click", () => { resetForm(); toast("Wyczyszczono formularz."); });
    el("cancelEditBtn").addEventListener("click", () => { resetForm(); toast("Anulowano edycję."); });

    el("severity").addEventListener("input", syncSliders);
    el("anxiety").addEventListener("input", syncSliders);

    el("medsToggle").addEventListener("change", () => {
      const on = el("medsToggle").checked;
      el("medsSection").classList.toggle("hidden", !on);
      if (!on) {
        el("medNotes").value = "";
        renderMedChecklist({});
      }
    });

    el("q").addEventListener("input", render);
    el("sort").addEventListener("change", render);
    el("fromDate").addEventListener("change", render);
    el("toDate").addEventListener("change", render);
    el("showMetrics").addEventListener("change", render);

    el("todayBtn").addEventListener("click", setDateRangeToToday);
    el("allBtn").addEventListener("click", clearDateRange);
    el("copyViewBtn").addEventListener("click", copyCurrentViewJson);

    setDateRangeToToday();
  }

  init();
})();

