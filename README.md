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

## Secrets and local data

- .env and data/tokens.json are required locally but must never be committed.
- .gitignore already ignores these files.
- If you ever publish the repo, rotate OAuth client secrets and tokens.
