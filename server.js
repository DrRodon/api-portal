const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");
const { google } = require("googleapis");

require("dotenv").config();

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3000;
const DEFAULT_ORIGINS = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
];

if (process.env.VERCEL_URL) {
  DEFAULT_ORIGINS.push(`https://${process.env.VERCEL_URL}`);
}

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const PORTAL_TOKEN =
  process.env.PORTAL_TOKEN || crypto.randomBytes(24).toString("hex");
const MAX_PREVIEW_MESSAGES = Number.parseInt(
  process.env.MAX_PREVIEW_MESSAGES || "0",
  10
);
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URL =
  process.env.REDIRECT_URL ||
  process.env.REDIRECT_URI ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/oauth2callback`
    : "http://localhost:3000/oauth2callback");
const PORTAL_REDIRECT_URL =
  process.env.PORTAL_REDIRECT_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/oauth2callback/portal`
    : `http://localhost:${PORT}/oauth2callback/portal`);
const PORTAL_AUTH_SECRET = process.env.PORTAL_AUTH_SECRET || PORTAL_TOKEN;
const PORTAL_SESSION_TTL_HOURS = Number.parseInt(
  process.env.PORTAL_SESSION_TTL_HOURS || "24",
  10
);
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS || "";
const ALLOWED_EMAILS_KV_KEY =
  process.env.ALLOWED_EMAILS_KV_KEY || "portal:allowed_emails";
const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_TOKEN_KEY = process.env.KV_TOKEN_KEY || "portal:gmail:tokens";
const TOKEN_PATH =
  process.env.TOKEN_PATH ||
  (process.env.VERCEL
    ? path.join("/tmp", "tokens.json")
    : path.join(__dirname, "data", "tokens.json"));

const app = express();
const publicDir = path.join(process.cwd(), "public");
app.disable("x-powered-by");
app.use(
  "/api",
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, false);
      }
      return callback(null, ALLOWED_ORIGINS.has(origin));
    },
    allowedHeaders: ["Content-Type", "X-Portal-Token"],
  })
);
app.use(express.json({ limit: "100kb" }));

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);
const portalOauthClient = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  PORTAL_REDIRECT_URL
);

const ensureDataDir = async (targetPath) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
};

const getKvClient = () => {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    return null;
  }
  if (getKvClient.cached !== undefined) {
    return getKvClient.cached;
  }
  try {
    // Lazy-load so local dev doesn't require KV unless configured.
    const { kv } = require("@vercel/kv");
    getKvClient.cached = kv;
  } catch (error) {
    console.warn("[tokens] KV disabled: @vercel/kv not available.");
    getKvClient.cached = null;
  }
  return getKvClient.cached;
};

const logTokenEvent = (event, data) => {
  console.info(`[tokens] ${event}`, data);
};

const normalizeEmailList = (value) => {
  if (!value) {
    return [];
  }
  const raw = Array.isArray(value) ? value : String(value).split(",");
  return raw
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
};

const getAllowedEmails = async () => {
  const kvClient = getKvClient();
  if (kvClient) {
    try {
      const stored = await kvClient.get(ALLOWED_EMAILS_KV_KEY);
      const list = normalizeEmailList(stored);
      if (list.length) {
        return list;
      }
    } catch (error) {
      console.warn(
        "[auth] KV allowlist load failed:",
        error?.message || error
      );
    }
  }
  return normalizeEmailList(ALLOWED_EMAILS);
};

const setAllowedEmails = async (emails) => {
  const kvClient = getKvClient();
  if (!kvClient) {
    throw new Error("KV is not configured");
  }
  await kvClient.set(ALLOWED_EMAILS_KV_KEY, emails);
};

const base64UrlEncode = (input) => {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlDecode = (input) => {
  if (!input) {
    return "";
  }
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

const createSignature = (value) => {
  return crypto
    .createHmac("sha256", PORTAL_AUTH_SECRET)
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const signSession = (payload) => {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(encoded);
  return `${encoded}.${signature}`;
};

const verifySession = (value) => {
  if (!value) {
    return null;
  }
  const [encoded, signature] = value.split(".", 2);
  if (!encoded || !signature) {
    return null;
  }
  const expected = createSignature(encoded);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload?.email || !payload?.exp) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
};

const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (!cookieHeader) {
    return cookies;
  }
  cookieHeader.split(";").forEach((part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) {
      return;
    }
    cookies[name] = rest.join("=");
  });
  return cookies;
};

const getPortalSession = (req) => {
  const cookies = parseCookies(req.headers.cookie || "");
  return verifySession(cookies.portal_session);
};

const tokenKeyForEmail = (email) => {
  if (!email) {
    return KV_TOKEN_KEY;
  }
  return `${KV_TOKEN_KEY}:${email}`;
};

const tokenPathForEmail = (email) => {
  if (!email) {
    return TOKEN_PATH;
  }
  const safe = crypto
    .createHash("sha256")
    .update(String(email))
    .digest("hex")
    .slice(0, 12);
  const name = `tokens-${safe}.json`;
  if (process.env.VERCEL) {
    return path.join("/tmp", name);
  }
  return path.join(path.dirname(TOKEN_PATH), name);
};

const loadTokens = async (email) => {
  const kvClient = getKvClient();
  const tokenKey = tokenKeyForEmail(email);
  if (kvClient) {
    try {
      const stored = await kvClient.get(tokenKey);
      if (stored) {
        const parsed =
          typeof stored === "string" ? JSON.parse(stored) : stored;
        logTokenEvent("load", { source: "kv", found: true, key: tokenKey });
        return parsed;
      }
      logTokenEvent("load", { source: "kv", found: false, key: tokenKey });
    } catch (error) {
      console.warn("[tokens] KV load failed:", error?.message || error);
    }
  }
  try {
    const tokenPath = tokenPathForEmail(email);
    const raw = await fs.readFile(tokenPath, "utf8");
    logTokenEvent("load", { source: "file", found: true, path: tokenPath });
    return JSON.parse(raw);
  } catch (error) {
    const tokenPath = tokenPathForEmail(email);
    logTokenEvent("load", { source: "file", found: false, path: tokenPath });
    return null;
  }
};

const createOAuthState = (email) => {
  const ttlMs = 10 * 60 * 1000;
  const payload = {
    email,
    exp: Date.now() + ttlMs,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(encoded);
  return `${encoded}.${signature}`;
};

const verifyOAuthState = (value) => {
  if (!value) {
    return null;
  }
  const [encoded, signature] = value.split(".", 2);
  if (!encoded || !signature) {
    return null;
  }
  const expected = createSignature(encoded);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload?.email || !payload?.exp) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
};

const saveTokens = async (tokens, email) => {
  const kvClient = getKvClient();
  let kvSaved = false;
  const tokenKey = tokenKeyForEmail(email);
  if (kvClient) {
    try {
      await kvClient.set(tokenKey, tokens);
      kvSaved = true;
      logTokenEvent("save", { source: "kv", key: tokenKey });
    } catch (error) {
      console.warn("[tokens] KV save failed:", error?.message || error);
    }
  }
  if (process.env.VERCEL && kvSaved) {
    return;
  }
  const tokenPath = tokenPathForEmail(email);
  await ensureDataDir(tokenPath);
  await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
  logTokenEvent("save", { source: "file", path: tokenPath });
};

const deleteTokens = async (email) => {
  const kvClient = getKvClient();
  const tokenKey = tokenKeyForEmail(email);
  if (kvClient) {
    try {
      await kvClient.del(tokenKey);
      logTokenEvent("delete", { source: "kv", key: tokenKey });
    } catch (error) {
      console.warn("[tokens] KV delete failed:", error?.message || error);
    }
  }
  const tokenPath = tokenPathForEmail(email);
  try {
    await fs.unlink(tokenPath);
    logTokenEvent("delete", { source: "file", path: tokenPath });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("[tokens] File delete failed:", error?.message || error);
    }
  }
};

const decodeBase64Url = (input) => {
  if (!input) {
    return "";
  }
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

const stripHtml = (html) => {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const findPartByMime = (payload, mimeType) => {
  if (!payload) {
    return null;
  }
  if (payload.mimeType === mimeType && payload.body?.data) {
    return payload;
  }
  if (!payload.parts) {
    return null;
  }
  for (const part of payload.parts) {
    const found = findPartByMime(part, mimeType);
    if (found) {
      return found;
    }
  }
  return null;
};

const extractMessageText = (payload) => {
  if (!payload) {
    return "";
  }
  if (payload.body?.data) {
    const raw = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      return stripHtml(raw);
    }
    return raw;
  }
  const plainPart = findPartByMime(payload, "text/plain");
  if (plainPart?.body?.data) {
    return decodeBase64Url(plainPart.body.data);
  }
  const htmlPart = findPartByMime(payload, "text/html");
  if (htmlPart?.body?.data) {
    const html = decodeBase64Url(htmlPart.body.data);
    return stripHtml(html);
  }
  return "";
};

const extractMessageHtml = (payload) => {
  if (!payload) {
    return "";
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  const htmlPart = findPartByMime(payload, "text/html");
  if (htmlPart?.body?.data) {
    return decodeBase64Url(htmlPart.body.data);
  }
  return "";
};

const decodeBase64UrlToBuffer = (input) => {
  if (!input) {
    return Buffer.alloc(0);
  }
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
};

const sanitizeFilename = (name) => {
  const base = path.basename(String(name || "attachment"));
  return base.replace(/[\r\n"\/\\]+/g, "_") || "attachment";
};

const asciiFilename = (name) => {
  return String(name || "attachment")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/[\r\n"\/\\]+/g, "_")
    .trim() || "attachment";
};

const headerValue = (headers, name) => {
  if (!Array.isArray(headers)) {
    return "";
  }
  const hit = headers.find(
    (header) => header?.name?.toLowerCase() === name.toLowerCase()
  );
  return hit?.value || "";
};

const extractFilename = (header) => {
  if (!header) {
    return "";
  }
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    const lowered = part.toLowerCase();
    if (lowered.startsWith("filename*=")) {
      const value = part.split("=", 2)[1]?.trim() || "";
      const cleaned = value.replace(/^utf-8''/i, "").replace(/^"|"$/g, "");
      try {
        return decodeURIComponent(cleaned);
      } catch (error) {
        return cleaned;
      }
    }
    if (lowered.startsWith("filename=") || lowered.startsWith("name=")) {
      return part.split("=", 2)[1]?.trim().replace(/^"|"$/g, "") || "";
    }
  }
  return "";
};

const collectAttachments = (payload, acc = []) => {
  if (!payload) {
    return acc;
  }
  const attachmentId = payload.body?.attachmentId;
  if (attachmentId) {
    const headers = payload.headers || [];
    const filename =
      payload.filename ||
      extractFilename(headerValue(headers, "Content-Disposition")) ||
      extractFilename(headerValue(headers, "Content-Type")) ||
      "attachment";
    acc.push({
      id: attachmentId,
      filename: sanitizeFilename(filename),
      mimeType: payload.mimeType || "application/octet-stream",
      size: payload.body?.size || 0,
    });
  }
  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((part) => collectAttachments(part, acc));
  }
  return acc;
};

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/logout", (_req, res) => {
  const cookieParts = [
    "portal_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.VERCEL) {
    cookieParts.push("Secure");
  }
  res.setHeader("Set-Cookie", cookieParts.join("; "));
  res.redirect("/auth/portal");
});

const isPublicPath = (path) => {
  return (
    path === "/auth/portal" ||
    path === "/oauth2callback/portal" ||
    path === "/oauth2callback" ||
    path === "/logout" ||
    path === "/health" ||
    path === "/favicon.ico"
  );
};

app.use((req, res, next) => {
  if (isPublicPath(req.path)) {
    return next();
  }
  const session = getPortalSession(req);
  if (!session) {
    if (req.path.startsWith("/api")) {
      res.status(401).json({ ok: false, auth: false });
      return;
    }
    res.redirect("/auth/portal");
    return;
  }
  req.portalUser = session;
  next();
});

app.use(express.static(publicDir));
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/api/config", (_req, res) => {
  res.json({ token: PORTAL_TOKEN });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/config" || req.path.startsWith("/bp/") || req.path.startsWith("/cookbook/")) {
    return next();
  }
  const token = req.get("X-Portal-Token");
  if (token !== PORTAL_TOKEN) {
    res.status(401).json({ ok: false });
    return;
  }
  next();
});

app.get("/api/allowlist", async (req, res) => {
  try {
    const emails = await getAllowedEmails();
    res.json({ emails });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/session", async (req, res) => {
  const email = req.portalUser?.email || "";
  if (!email) {
    res.status(401).json({ ok: false });
    return;
  }
  try {
    const tokens = await loadTokens(email);
    res.json({ ok: true, email, gmailConnected: Boolean(tokens) });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/gmail/disconnect", async (req, res) => {
  const email = req.portalUser?.email || "";
  if (!email) {
    res.status(401).json({ ok: false });
    return;
  }
  try {
    await deleteTokens(email);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/allowlist", async (req, res) => {
  const sessionEmail = req.portalUser?.email;
  if (!sessionEmail) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    const current = await getAllowedEmails();
    if (!current.includes(sessionEmail)) {
      res.status(403).json({ ok: false });
      return;
    }

    const input =
      req.body?.emails ?? req.body?.allowlist ?? req.body?.list ?? req.body;
    const emails = normalizeEmailList(input);
    if (!emails.length) {
      res.status(400).json({ ok: false, error: "empty_allowlist" });
      return;
    }
    if (!emails.includes(sessionEmail)) {
      res.status(400).json({ ok: false, error: "self_missing" });
      return;
    }

    await setAllowedEmails(emails);
    res.json({ ok: true, emails });
  } catch (error) {
    console.error("Allowlist update failed:", error);
    res.status(500).json({ ok: false });
  }
});

/* BP Chatlog Sync & Share API */
const BP_KV_PREFIX = "bp:v1";

const bpDataKey = (email) => `${BP_KV_PREFIX}:data:${email}`;
const bpMedsKey = (email) => `${BP_KV_PREFIX}:meds:${email}`;
const bpAclKey = (email) => `${BP_KV_PREFIX}:acl:${email}`; // Set of emails allowed to view 'email's data
const bpSharedWithKey = (email) => `${BP_KV_PREFIX}:shared_with:${email}`; // Set of emails that 'email' can view
const bpGlobalLiquidsKey = `${BP_KV_PREFIX}:liquids:global`;

/* Cookbook (Kucharz AI) API */
const COOKBOOK_KV_PREFIX = "cookbook:v1";
const pantryKey = (email) => `${COOKBOOK_KV_PREFIX}:pantry:${email}`;
const appliancesKey = (email) => `${COOKBOOK_KV_PREFIX}:appliances:${email}`;

app.get("/api/cookbook/pantry", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });
  const kv = getKvClient();
  if (!kv) return res.json({ ok: true, pantry: [] });
  try {
    const pantry = await kv.get(pantryKey(email));
    res.json({ ok: true, pantry: pantry || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/cookbook/pantry", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });
  // Handle both { pantry: [...] } and direct [...] array
  const pantry = Array.isArray(req.body) ? req.body : req.body.pantry;
  const kv = getKvClient();
  if (!kv) return res.status(503).json({ ok: false });
  try {
    await kv.set(pantryKey(email), pantry || []);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/cookbook/appliances", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });
  const kv = getKvClient();
  if (!kv) return res.json({ ok: true, appliances: [] });
  try {
    const appliances = await kv.get(appliancesKey(email));
    res.json({ ok: true, appliances: appliances || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/cookbook/appliances", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });
  // Handle both { appliances: [...] } and direct [...] array
  const appliances = Array.isArray(req.body) ? req.body : req.body.appliances;
  const kv = getKvClient();
  if (!kv) return res.status(503).json({ ok: false });
  try {
    await kv.set(appliancesKey(email), appliances || []);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/cookbook/generate", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });

  const { mealType, peopleCount, suggestShopping } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "MISSING_API_KEY" });
  }

  const kv = getKvClient();
  try {
    const [pantry, appliances] = await Promise.all([
      kv ? kv.get(pantryKey(email)) : [],
      kv ? kv.get(appliancesKey(email)) : [],
    ]);

    const pantryList = (pantry || [])
      .map((i) => `${i.name} (${i.qty} ${i.unit || ""})`)
      .join(", ");
    const applianceList = (appliances || []).join(", ");

    let prompt = `Jesteś kreatywnym kucharzem. Przygotuj przepis na ${mealType} dla ${peopleCount} osób.
Dostępne składniki w spiżarni: ${pantryList || "brak danych"}.
Dostępne urządzenia: ${applianceList || "podstawowe wyposażenie kuchni"}.

ZASADY:
1. ${suggestShopping ? "Możesz użyć brakujących składników, ale tylko jeśli są niezbędne." : "Używaj WYŁĄCZNIE składników wymienionych w spiżarni. Nie dodawaj niczego spoza listy (nawet soli/pieprzu, jeśli ich nie ma)."}
2. Przepis musi być możliwy do wykonania za pomocą dostępnych urządzeń.
3. Odpowiedź sformatuj w czytelnym Markdownie (Tytuł, Składniki, Instrukcja).
4. Pisz po polsku.`;

    if (suggestShopping) {
      prompt += `\n5. Na końcu przepisu dodaj sekcję "Lista zakupów" z produktami, których brakuje w spiżarni a są potrzebne do tego przepisu.`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("Gemini API Error:", JSON.stringify(data.error, null, 2));
      return res.status(500).json({ ok: false, error: data.error.message });
    }

    const recipe = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!recipe) {
      console.error("Gemini API Empty Response:", JSON.stringify(data, null, 2));
      return res.status(500).json({ ok: false, error: "Empty response from Gemini" });
    }

    res.json({ ok: true, recipe });
  } catch (e) {
    console.error("Recipe Generation Exception:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/bp/sync", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });
  const kv = getKvClient();
  if (!kv) return res.json({ ok: true, items: [], meds: [] }); // Fallback or empty if no KV

  try {
    const [items, meds] = await Promise.all([
      kv.get(bpDataKey(email)),
      kv.get(bpMedsKey(email)),
    ]);
    res.json({ ok: true, items: items || [], meds: meds || [], email });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

app.post("/api/bp/sync", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });
  const { items, meds } = req.body;
  const kv = getKvClient();
  if (!kv) return res.status(503).json({ ok: false, error: "KV_DISABLED" });

  try {
    await Promise.all([
      kv.set(bpDataKey(email), items || []),
      kv.set(bpMedsKey(email), meds || []),
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

app.get("/api/bp/liquids/global", async (req, res) => {
  const kv = getKvClient();
  if (!kv) return res.json({ ok: true, liquids: [] });
  try {
    const liquids = await kv.get(bpGlobalLiquidsKey);
    res.json({ ok: true, liquids: liquids || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/bp/liquids/global", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });

  const { liquids } = req.body;
  const kv = getKvClient();
  if (!kv) return res.status(503).json({ ok: false });

  try {
    await kv.set(bpGlobalLiquidsKey, liquids || []);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/bp/share", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });
  const kv = getKvClient();
  if (!kv) return res.json({ ok: true, sharedTo: [] });

  try {
    const allowed = await kv.smembers(bpAclKey(email));
    res.json({ ok: true, sharedTo: allowed || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/bp/share", async (req, res) => {
  const email = req.portalUser?.email;
  const targetRaw = req.body.targetEmail;
  if (!email) return res.status(401).json({ ok: false });
  if (!targetRaw) return res.status(400).json({ ok: false });

  const target = targetRaw.trim().toLowerCase();
  if (target === email)
    return res.status(400).json({ ok: false, error: "SELF_SHARE" });

  const kv = getKvClient();
  if (!kv) return res.status(503).json({ ok: false });

  try {
    await kv.sadd(bpAclKey(email), target);
    await kv.sadd(bpSharedWithKey(target), email);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.delete("/api/bp/share", async (req, res) => {
  const email = req.portalUser?.email;
  const targetRaw = req.body.targetEmail;
  if (!email) return res.status(401).json({ ok: false });
  if (!targetRaw) return res.status(400).json({ ok: false });

  const target = targetRaw.trim().toLowerCase();
  const kv = getKvClient();
  if (!kv) return res.status(503).json({ ok: false });

  try {
    await kv.srem(bpAclKey(email), target);
    await kv.srem(bpSharedWithKey(target), email);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/bp/shared-with-me", async (req, res) => {
  const email = req.portalUser?.email;
  if (!email) return res.status(401).json({ ok: false });
  const kv = getKvClient();
  if (!kv) return res.json({ ok: true, owners: [] });

  try {
    const owners = await kv.smembers(bpSharedWithKey(email));
    res.json({ ok: true, owners: owners || [] });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/api/bp/view/:ownerEmail", async (req, res) => {
  const viewer = req.portalUser?.email;
  const owner = req.params.ownerEmail?.toLowerCase();
  if (!viewer) return res.status(401).json({ ok: false });
  if (!owner) return res.status(400).json({ ok: false });

  const kv = getKvClient();
  if (!kv) return res.status(503).json({ ok: false });

  try {
    const isAllowed = await kv.sismember(bpAclKey(owner), viewer);
    if (!isAllowed) {
      return res.status(403).json({ ok: false, error: "ACCESS_DENIED" });
    }

    const [items, meds] = await Promise.all([
      kv.get(bpDataKey(owner)),
      kv.get(bpMedsKey(owner)),
    ]);
    res.json({
      ok: true,
      items: items || [],
      meds: meds || [],
      readOnly: true,
      owner,
    });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.get("/auth/portal", (_req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).send("Missing CLIENT_ID or CLIENT_SECRET in .env.");
    return;
  }
  const authUrl = portalOauthClient.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    prompt: "login",
  });
  res.redirect(authUrl);
});

app.get("/oauth2callback/portal", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.status(400).send("Missing authorization code.");
    return;
  }

  try {
    const { tokens } = await portalOauthClient.getToken(code);
    const idToken = tokens?.id_token;
    if (!idToken) {
      res.status(400).send("Missing id_token from Google.");
      return;
    }
    const ticket = await portalOauthClient.verifyIdToken({
      idToken,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload?.email ? String(payload.email).toLowerCase() : "";
    if (!email || payload?.email_verified === false) {
      res.status(403).send("Email verification required.");
      return;
    }

    const allowed = await getAllowedEmails();
    if (!allowed.length) {
      res.status(403).send("Allowlist is empty. Set ALLOWED_EMAILS or KV.");
      return;
    }
    if (!allowed.includes(email)) {
      res.status(403).send("Access denied.");
      return;
    }

    const ttlMs =
      Number.isFinite(PORTAL_SESSION_TTL_HOURS) && PORTAL_SESSION_TTL_HOURS > 0
        ? PORTAL_SESSION_TTL_HOURS * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
    const session = signSession({ email, exp: Date.now() + ttlMs });
    const cookieParts = [
      `portal_session=${session}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.floor(ttlMs / 1000)}`,
    ];
    if (process.env.VERCEL) {
      cookieParts.push("Secure");
    }
    res.setHeader("Set-Cookie", cookieParts.join("; "));

    const tokensExisting = await loadTokens(email);
    if (!tokensExisting) {
      res.redirect("/auth");
      return;
    }
    res.redirect("/");
  } catch (error) {
    console.error("Portal OAuth callback failed:", error);
    res.status(500).send("Portal authorization error.");
  }
});

app.get("/auth", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).send("Missing CLIENT_ID or CLIENT_SECRET in .env.");
    return;
  }
  const email = req.portalUser?.email;
  if (!email) {
    res.status(401).send("Portal login required.");
    return;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: ["https://www.googleapis.com/auth/gmail.modify"],
    state: createOAuthState(email),
  });

  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.status(400).send("Missing authorization code.");
    return;
  }
  const state = verifyOAuthState(req.query.state);
  const email = state?.email ? String(state.email).toLowerCase() : "";
  if (!email) {
    res.status(400).send("Missing or invalid OAuth state.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const gmailAddress = String(profile.data.emailAddress || "")
      .toLowerCase()
      .trim();
    if (!gmailAddress || gmailAddress !== email) {
      res
        .status(403)
        .send(
          "Gmail account mismatch. Sign in with the same email as your portal login."
        );
      return;
    }
    await saveTokens(tokens, email);
    res.redirect("/");
  } catch (error) {
    console.error("OAuth callback failed:", error);
    res.status(500).send("Gmail authorization error.");
  }
});

app.get("/api/gmail/unread", async (req, res) => {
  const email = req.portalUser?.email || "";
  const tokens = await loadTokens(email);
  if (!tokens) {
    res.status(401).json({ connected: false, unread: null });
    return;
  }

  try {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "is:unread",
    });

    res.json({
      connected: true,
      unread: response.data.resultSizeEstimate || 0,
    });
  } catch (error) {
    res.status(500).json({ connected: false, unread: null });
  }
});

app.get("/api/gmail/preview", async (req, res) => {
  const email = req.portalUser?.email || "";
  const tokens = await loadTokens(email);
  if (!tokens) {
    res.status(401).json({ connected: false, messages: [] });
    return;
  }

  try {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    let pageToken = undefined;
    const messageIds = [];
    const previewLimit =
      Number.isFinite(MAX_PREVIEW_MESSAGES) && MAX_PREVIEW_MESSAGES > 0
        ? MAX_PREVIEW_MESSAGES
        : 0;
    const pageSize = previewLimit > 0 ? Math.min(previewLimit, 100) : 100;

    do {
      const list = await gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        q: "is:unread",
        maxResults: pageSize,
        pageToken,
      });
      if (Array.isArray(list.data.messages)) {
        messageIds.push(...list.data.messages);
      }
      pageToken = list.data.nextPageToken;
    } while (pageToken && (!previewLimit || messageIds.length < previewLimit));
    const limitedIds =
      previewLimit > 0 ? messageIds.slice(0, previewLimit) : messageIds;
    if (!limitedIds.length) {
      res.json({ connected: true, messages: [] });
      return;
    }

    const details = await Promise.allSettled(
      limitedIds.map((message) =>
        gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        })
      )
    );

    const messages = details
      .filter((result) => result.status === "fulfilled")
      .map((result) => {
        const item = result.value;
        const headers = item.data.payload?.headers || [];
        const getHeader = (name) =>
          headers.find((header) => header.name === name)?.value || "";
        return {
          id: item.data.id,
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: item.data.snippet || "",
        };
      });

    res.json({ connected: true, messages });
  } catch (error) {
    res.status(500).json({ connected: false, messages: [] });
  }
});

app.get("/api/gmail/message/:id", async (req, res) => {
  const email = req.portalUser?.email || "";
  const tokens = await loadTokens(email);
  if (!tokens) {
    res.status(401).json({ connected: false, message: null });
    return;
  }

  try {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const item = await gmail.users.messages.get({
      userId: "me",
      id: req.params.id,
      format: "full",
    });
    const headers = item.data.payload?.headers || [];
    const getHeader = (name) =>
      headers.find((header) => header.name === name)?.value || "";
    const bodyText = extractMessageText(item.data.payload);
    const bodyHtml = extractMessageHtml(item.data.payload);
    const attachments = collectAttachments(item.data.payload);

    res.json({
      connected: true,
      message: {
        id: item.data.id,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        body: bodyText || item.data.snippet || "",
        html: bodyHtml || "",
        attachments,
      },
    });
  } catch (error) {
    res.status(500).json({ connected: false, message: null });
  }
});

app.get("/api/gmail/message/:id/attachment/:attachmentId", async (req, res) => {
  const email = req.portalUser?.email || "";
  const tokens = await loadTokens(email);
  if (!tokens) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const attachment = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: req.params.id,
      id: req.params.attachmentId,
    });
    const buffer = decodeBase64UrlToBuffer(attachment.data?.data);
    const filename = sanitizeFilename(req.query.name);
    const fallbackName = asciiFilename(filename);
    const mimeType = String(req.query.type || "application/octet-stream");
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(buffer);
  } catch (error) {
    console.error("Attachment download failed", {
      messageId: req.params.id,
      attachmentId: req.params.attachmentId,
      error: error?.message || error,
    });
    res.status(500).json({ ok: false });
  }
});

app.post("/api/gmail/message/:id/read", async (req, res) => {
  const email = req.portalUser?.email || "";
  const tokens = await loadTokens(email);
  if (!tokens) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    await gmail.users.messages.modify({
      userId: "me",
      id: req.params.id,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/gmail/message/:id/trash", async (req, res) => {
  const email = req.portalUser?.email || "";
  const tokens = await loadTokens(email);
  if (!tokens) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    await gmail.users.messages.trash({
      userId: "me",
      id: req.params.id,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Gmail local API listening on http://${HOST}:${PORT}`);
  });
}

module.exports = app;

