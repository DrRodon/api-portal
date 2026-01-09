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
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
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

app.listen(PORT, () => {
  console.log(`Gmail local API listening on http://localhost:${PORT}`);
});
