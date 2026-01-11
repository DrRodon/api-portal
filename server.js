const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");
const { google } = require("googleapis");

require("dotenv").config();

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ||
    `http://localhost:${PORT},http://127.0.0.1:${PORT}`)
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
const REDIRECT_URI =
  process.env.REDIRECT_URI || "http://localhost:3000/oauth2callback";
const TOKEN_PATH = path.join(__dirname, "data", "tokens.json");

const app = express();
const publicDir = path.join(__dirname, "public");
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
app.use(express.static(publicDir));

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const ensureDataDir = async () => {
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
};

const loadTokens = async () => {
  try {
    const raw = await fs.readFile(TOKEN_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const saveTokens = async (tokens) => {
  await ensureDataDir();
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
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

app.get("/api/config", (_req, res) => {
  res.json({ token: PORTAL_TOKEN });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/config") {
    return next();
  }
  const token = req.get("X-Portal-Token");
  if (token !== PORTAL_TOKEN) {
    res.status(401).json({ ok: false });
    return;
  }
  next();
});

app.get("/auth", (_req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).send("Missing CLIENT_ID or CLIENT_SECRET in .env.");
    return;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.modify"],
  });

  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.status(400).send("Missing authorization code.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    await saveTokens(tokens);
    res.send("Authorization complete. Return to the portal and refresh Gmail.");
  } catch (error) {
    res.status(500).send("Gmail authorization error.");
  }
});

app.get("/api/gmail/unread", async (_req, res) => {
  const tokens = await loadTokens();
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

app.get("/api/gmail/preview", async (_req, res) => {
  const tokens = await loadTokens();
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
  const tokens = await loadTokens();
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
  const tokens = await loadTokens();
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
  const tokens = await loadTokens();
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
  const tokens = await loadTokens();
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

