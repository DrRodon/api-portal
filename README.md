# Portal

## Start

1) npm install
2) Copy .env.example to .env and fill values:
   - PowerShell: Copy-Item .env.example .env
3) npm start
4) Open http://localhost:3000 and finish Google OAuth

## Gmail panel

- Shows unread mail count and a preview panel in the portal UI.
- Click a message to open full content inside the portal.
- Actions available in detail view: mark as read and delete.
- Auto-refresh runs every 30 seconds.

OAuth scope required:
- https://www.googleapis.com/auth/gmail.modify

## Secrets and local data

- .env and data/tokens.json are required locally but must never be committed.
- .gitignore already ignores these files.
- If you ever publish the repo, rotate OAuth client secrets and tokens.
