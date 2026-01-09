const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");
const { google } = require("googleapis");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI =
  process.env.REDIRECT_URI || "http://localhost:3000/oauth2callback";
const TOKEN_PATH = path.join(__dirname, "data", "tokens.json");

const app = express();
app.use(cors({ origin: "*" }));

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

const sendUiFile = (res, fileName) => {
  res.sendFile(path.join(__dirname, fileName));
};

app.get("/", (_req, res) => {
  sendUiFile(res, "index.html");
});

app.get("/index.html", (_req, res) => {
  sendUiFile(res, "index.html");
});

app.get("/styles.css", (_req, res) => {
  sendUiFile(res, "styles.css");
});

app.get("/script.js", (_req, res) => {
  sendUiFile(res, "script.js");
});

app.use("/bp-chatlog", express.static(path.join(__dirname, "bp-chatlog")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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

    do {
      const list = await gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        q: "is:unread",
        maxResults: 100,
        pageToken,
      });
      if (Array.isArray(list.data.messages)) {
        messageIds.push(...list.data.messages);
      }
      pageToken = list.data.nextPageToken;
    } while (pageToken);
    if (!messageIds.length) {
      res.json({ connected: true, messages: [] });
      return;
    }

    const details = await Promise.all(
      messageIds.map((message) =>
        gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        })
      )
    );

    const messages = details.map((item) => {
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

    res.json({
      connected: true,
      message: {
        id: item.data.id,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        body: bodyText || item.data.snippet || "",
        html: bodyHtml || "",
      },
    });
  } catch (error) {
    res.status(500).json({ connected: false, message: null });
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

app.listen(PORT, () => {
  console.log(`Gmail local API listening on http://localhost:${PORT}`);
});
