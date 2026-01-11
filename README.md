# Portal

## Start

1) npm install
2) Copy .env.example to .env and fill values:
   - PowerShell: Copy-Item .env.example .env
3) npm start
4) Open http://localhost:3000 and finish Google OAuth (do not open index.html via file://)

## Gmail panel

- Shows unread mail count and a preview panel in the portal UI.
- Click a message to open full content inside the portal.
- Actions available in detail view: mark as read and delete.
- Auto-refresh runs every 30 seconds.
- Each portal user authorizes their own Gmail account; tokens are stored per email in KV.

OAuth scope required:
- https://www.googleapis.com/auth/gmail.modify

Optional settings (.env):
- HOST=127.0.0.1
- ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
- PORTAL_TOKEN= (leave empty to auto-generate)
- MAX_PREVIEW_MESSAGES=0 (0 = no limit)
- KV_REST_API_URL= (Vercel KV / Upstash REST URL for durable token storage)
- KV_REST_API_TOKEN= (Vercel KV / Upstash REST token)
- KV_TOKEN_KEY=portal:gmail:tokens (key used to store tokens in KV)
- PORTAL_REDIRECT_URL= (portal login OAuth redirect, defaults to /oauth2callback/portal)
- PORTAL_AUTH_SECRET= (signing secret for portal session cookie, defaults to PORTAL_TOKEN)
- PORTAL_SESSION_TTL_HOURS=24
- ALLOWED_EMAILS=alice@example.com,bob@example.com (portal allowlist)
- ALLOWED_EMAILS_KV_KEY=portal:allowed_emails (KV key for allowlist)

## Portal allowlist (KV)

- If the KV key exists, it overrides `ALLOWED_EMAILS`.
- Bootstrap: set `ALLOWED_EMAILS` for your account so you can log in once.
- Then update the KV allowlist via the API (requires portal session + X-Portal-Token).

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

## Secrets and local data

- .env and data/tokens.json are required locally but must never be committed.
- .gitignore already ignores these files.
- If you ever publish the repo, rotate OAuth client secrets and tokens.
