# Portal

Modern web portal that groups multiple tools in a single UI: a blood pressure notebook (Notatnik cisnienia) and a Gmail preview panel with OAuth-based access. The portal runs as a Node.js server with a static frontend and optional KV-backed storage for Gmail tokens and allowlists.

## Features

- Notatnik cisnienia: add, browse, and analyze entries in an embedded panel.
- Gmail panel: unread count, preview list, and detail view with actions (mark read, delete).
- Mobile-friendly layouts for both the portal and the embedded Notatnik panel.
- Optional Vercel KV / Upstash storage for OAuth tokens and allowlists.
- Portal allowlist with KV override for stricter access control.

## Tech Stack

- Node.js + Express (server)
- Vanilla HTML/CSS/JS (frontend)
- Google OAuth + Gmail API
- Vercel KV / Upstash (optional)

## Quick Start

1) Install dependencies
```
npm install
```

2) Create `.env` from template and fill required values
```
Copy-Item .env.example .env
```

3) Start the server
```
npm start
```

4) Open the portal and complete Google OAuth
```
http://localhost:3000
```

Do not open `public/index.html` via `file://` because OAuth callbacks require the running server.

## Gmail Panel

- Unread count + preview list inside the portal.
- Click a message to open full content inside the portal.
- Actions: mark as read, delete.
- Auto-refresh every 30 seconds.
- Each portal user authorizes their own Gmail account; tokens are stored per email (KV if configured).

OAuth scope required:

```
https://www.googleapis.com/auth/gmail.modify
```

## Environment Variables

Required for Gmail OAuth:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URL` (if not using defaults)

Optional:

- `HOST=127.0.0.1`
- `ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`
- `PORTAL_TOKEN=` (leave empty to auto-generate)
- `MAX_PREVIEW_MESSAGES=0` (0 = no limit)
- `KV_REST_API_URL=` (Vercel KV / Upstash REST URL)
- `KV_REST_API_TOKEN=` (Vercel KV / Upstash REST token)
- `KV_TOKEN_KEY=portal:gmail:tokens`
- `PORTAL_REDIRECT_URL=` (defaults to `/oauth2callback/portal`)
- `PORTAL_AUTH_SECRET=` (defaults to `PORTAL_TOKEN`)
- `PORTAL_SESSION_TTL_HOURS=24`
- `ALLOWED_EMAILS=alice@example.com,bob@example.com`
- `ALLOWED_EMAILS_KV_KEY=portal:allowed_emails`

## Portal Allowlist (KV)

If the KV key exists, it overrides `ALLOWED_EMAILS`. Bootstrap your account with `ALLOWED_EMAILS`, then manage the allowlist via API once logged in.

Example (run in browser console after login):

```js
const { token } = await fetch("/api/config").then((r) => r.json());
await fetch("/api/allowlist", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Portal-Token": token
  },
  body: JSON.stringify({ emails: ["you@example.com", "other@example.com"] })
});
```

Check session + Gmail connection (console):

```js
const { token } = await fetch("/api/config").then((r) => r.json());
await fetch("/api/session", {
  headers: { "X-Portal-Token": token }
}).then((r) => r.json());
```

Disconnect Gmail for current user (console):

```js
const { token } = await fetch("/api/config").then((r) => r.json());
await fetch("/api/gmail/disconnect", {
  method: "POST",
  headers: { "X-Portal-Token": token }
}).then((r) => r.json());
```

## Local Data and Secrets

- `.env` and `data/tokens.json` are required locally but must never be committed.
- `.gitignore` already ignores these files.
- If you publish the repo, rotate OAuth secrets and tokens.
