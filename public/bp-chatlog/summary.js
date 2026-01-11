(() => {
  const STORAGE_KEYS = [
    "bp_chatlog_items_v4",
    "bp_chatlog_items_v3",
    "bp_chatlog_items_v2",
    "bp_chatlog_items",
  ];

  const WATER_TARGET_KEY = "bp_chatlog_water_target_ml_v1";
  const DEFAULT_WATER_TARGET = 2000;

  const el = (id) => document.getElementById(id);

  function toast(msg){
    const t = el("toast");
    if(!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  function loadItems(){
    for(const key of STORAGE_KEYS){
      try{
        const raw = localStorage.getItem(key);
        if(!raw) continue;

        const parsed = JSON.parse(raw);

        if(Array.isArray(parsed)) return parsed;
        if(parsed && Array.isArray(parsed.items)) return parsed.items;
      }catch{
        // dalej
      }
    }
    return [];
  }

  function getDt(it){
    return it?.dt || it?.dateTime || it?.datetime || it?.createdAt || null;
  }

  function fmtDateShort(iso){
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2,"0");
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function dayKey(iso){
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return "unknown";
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function daysBackLimit(days){
    const now = new Date();
    now.setHours(23,59,59,999);
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0,0,0,0);
    return start.getTime();
  }

  function avg(arr){
    const a = arr.filter(v => typeof v === "number" && Number.isFinite(v));
    if(!a.length) return null;
    return a.reduce((s,x)=>s+x,0) / a.length;
  }

  function loadWaterTarget(){
    try{
      const raw = localStorage.getItem(WATER_TARGET_KEY);
      const v = Number(raw);
      return Number.isFinite(v) && v > 0 ? Math.round(v) : DEFAULT_WATER_TARGET;
    }catch{
      return DEFAULT_WATER_TARGET;
    }
  }

  function saveWaterTarget(v){
    localStorage.setItem(WATER_TARGET_KEY, String(Math.round(v)));
  }

  function parseWaterMlLegacy(text){
    const s = String(text || "").toLowerCase();
    let total = 0;

    const mlRe = /(\d+(?:[.,]\d+)?)\s*ml\b/g;
    for(const m of s.matchAll(mlRe)){
      const v = Number(String(m[1]).replace(",", "."));
      if(Number.isFinite(v)) total += v;
    }

    const lRe = /(\d+(?:[.,]\d+)?)\s*l\b/g;
    for(const m of s.matchAll(lRe)){
      const v = Number(String(m[1]).replace(",", "."));
      if(Number.isFinite(v)) total += v * 1000;
    }

    const glassRe = /(\d+)\s*(szklank(?:a|i|ę|ach)?)\b/g;
    for(const m of s.matchAll(glassRe)){
      const v = Number(m[1]);
      if(Number.isFinite(v)) total += v * 250;
    }

    return total > 0 ? Math.round(total) : 0;
  }

  function effectiveWaterMl(item){
    // Nowy model: waterMl + hydration (ułamek 0-1)
    if(typeof item?.waterMl === "number" && Number.isFinite(item.waterMl) && item.waterMl > 0){
      const hyd = (typeof item.hydration === "number" && Number.isFinite(item.hydration)) ? item.hydration : 1;
      const eff = item.waterMl * hyd;
      return eff > 0 ? Math.round(eff) : 0;
    }

    // Legacy: tekst w foodWater
    const legacyText = (typeof item?.foodWater === "string" ? item.foodWater : "");
    const ml = parseWaterMlLegacy(legacyText);
    return ml > 0 ? ml : 0;
  }

  function applyFilters(all){
    const range = el("range").value;
    const type = el("typeFilter").value;

    let items = [...all].filter(x => x && getDt(x));

    if(range !== "all"){
      const lim = daysBackLimit(Number(range));
      items = items.filter(x => new Date(getDt(x)).getTime() >= lim);
    }

    if(type !== "all"){
      items = items.filter(x => (x.entryType || "log") === type);
    }

    items.sort((a,b) => new Date(getDt(a)).getTime() - new Date(getDt(b)).getTime());
    return items;
  }

  // Charts
  let chartBp, chartPulse, chartWater, chartEntries;

  function makeLineChart(canvas, labels, datasets){
    return new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: true }, tooltip: { enabled: true } },
        scales: {
          x: { ticks: { maxRotation: 0 }, grid: { display: false } },
          y: { beginAtZero: false }
        }
      }
    });
  }

  function makeBarMixedChart(canvas, labels, datasets){
    return new Chart(canvas, {
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: { legend: { display: true }, tooltip: { enabled: true } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  function destroyCharts(){
    for(const c of [chartBp, chartPulse, chartWater, chartEntries]){
      if(c) c.destroy();
    }
    chartBp = chartPulse = chartWater = chartEntries = null;
  }

  function render(allItems){
    const items = applyFilters(allItems);
    el("count").textContent = String(items.length);

    const target = loadWaterTarget();

    // BP series
    const bpItems = items.filter(i => typeof i.sys === "number" && typeof i.dia === "number" && i.sys > 0 && i.dia > 0);
    const bpLabels = bpItems.map(i => fmtDateShort(getDt(i)));
    const sysSeries = bpItems.map(i => i.sys);
    const diaSeries = bpItems.map(i => i.dia);

    // Pulse series
    const pItems = items.filter(i => typeof i.pulse === "number" && i.pulse > 0);
    const pLabels = pItems.map(i => fmtDateShort(getDt(i)));
    const pSeries = pItems.map(i => i.pulse);

    // Water daily aggregation (effective)
    const byDay = new Map(); // day -> effective ml
    for(const it of items){
      const k = dayKey(getDt(it));
      const eff = effectiveWaterMl(it);
      if(eff > 0){
        byDay.set(k, (byDay.get(k) || 0) + eff);
      }
    }
    const days = Array.from(byDay.keys()).sort();
    const waterSeries = days.map(d => byDay.get(d));
    const targetSeries = days.map(() => target);

    // Entries per day
    const entriesByDay = new Map();
    for(const it of items){
      const k = dayKey(getDt(it));
      entriesByDay.set(k, (entriesByDay.get(k) || 0) + 1);
    }
    const eDays = Array.from(entriesByDay.keys()).sort();
    const eSeries = eDays.map(d => entriesByDay.get(d));

    // Stat cards
    const sysAvg = avg(sysSeries);
    const diaAvg = avg(diaSeries);
    const pAvg = avg(pSeries);
    const waterAvg = avg(waterSeries);

    el("avgBp").textContent = (sysAvg && diaAvg) ? `${Math.round(sysAvg)}/${Math.round(diaAvg)}` : "-/-";
    el("avgPulse").textContent = pAvg ? String(Math.round(pAvg)) : "-";
    el("avgWater").textContent = waterAvg ? String(Math.round(waterAvg)) : "-";

    if(waterAvg && target > 0){
      el("avgWaterPct").textContent = `${Math.round((waterAvg / target) * 100)}%`;
    }else{
      el("avgWaterPct").textContent = "-";
    }

    destroyCharts();

    chartBp = makeLineChart(el("chartBp"), bpLabels, [
      { label: "SYS", data: sysSeries, tension: 0.25 },
      { label: "DIA", data: diaSeries, tension: 0.25 },
    ]);

    chartPulse = makeLineChart(el("chartPulse"), pLabels, [
      { label: "Tętno", data: pSeries, tension: 0.25 },
    ]);

    // Water chart: bar (effective) + line (target)
    chartWater = makeBarMixedChart(el("chartWater"), days, [
      { type: "bar", label: "woda efektywna (ml)", data: waterSeries, borderWidth: 1 },
      { type: "line", label: `target (ml)`, data: targetSeries, tension: 0, pointRadius: 0, borderWidth: 2 },
    ]);

    chartEntries = new Chart(el("chartEntries"), {
      type: "bar",
      data: { labels: eDays, datasets: [{ label: "wpisy", data: eSeries, borderWidth: 1 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
      }
    });
  }

  function init(){
    const settings = window.Theme.loadSettings();
    window.Theme.applyTheme(settings);

    if(!window.Chart){
      toast("Brak biblioteki Chart.js. Wykresy niedostepne offline.");
      return;
    }

    const all = loadItems();
    if(!all.length){
      toast("Brak danych. Najpierw dodaj wpisy w index.html.");
    }

    // Target input
    const t = el("waterTarget");
    const v = loadWaterTarget();
    t.value = String(v);
    t.addEventListener("change", () => {
      const n = Number(String(t.value || "").replace(",", "."));
      if(!Number.isFinite(n) || n <= 0){
        t.value = String(loadWaterTarget());
        toast("Podaj liczbę ml, np. 2000.");
        return;
      }
      saveWaterTarget(Math.round(n));
      render(all);
      toast("Zapisano target wody.");
    });

    el("range").addEventListener("change", () => render(all));
    el("typeFilter").addEventListener("change", () => render(all));

    render(all);

    window.addEventListener("theme:changed", () => {
      render(all);
    });
  }

  init();
})();
