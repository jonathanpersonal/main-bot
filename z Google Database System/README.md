# Google System v2 Foundation

This is the clean Google Apps Script backend for the reusable Discord Department Management Bot.

It is designed for a fresh Google Sheet / Apps Script project.

## What this v2 system does first

- Creates clean v2 database sheets
- Accepts POST requests from the Discord bot
- Stores every bot request in `BotRequests`
- Creates pending bot actions in `BotActions`
- Lets the bot poll for pending actions
- Lets the bot mark actions complete or failed
- Stores officer records, rank history, training records, discipline records, callsign records, audit logs, and script logs

## Required Script Property

Set this in Apps Script:

Project Settings > Script Properties

```text
BOT_API_SECRET = long random secret that also goes in your bot .env
```

Do not commit the real secret to GitHub.

## Install steps

1. Create a new Google Sheet.
2. Open Extensions > Apps Script.
3. Add these `.gs` files to the Apps Script project.
4. Add `appsscript.json` if using clasp/GitHub sync. If manually pasting, you can ignore the file at first.
5. Set Script Property `BOT_API_SECRET`.
6. Run this function manually once:

```javascript
gsv2InstallOrRepairSystem()
```

7. Approve permissions.
8. Deploy as Web App:
   - Execute as: Me
   - Who has access: Anyone
9. Copy the Web App URL into the bot `.env` as `GOOGLE_SCRIPT_WEBAPP_URL`.

## Test route

POST this JSON to the Web App URL:

```json
{
  "route": "ping",
  "secret": "your secret here",
  "echo": "hello"
}
```

Expected response:

```json
{
  "ok": true,
  "message": "Pong from Google System v2."
}
```

## Main bot request route

```json
{
  "route": "submitBotRequest",
  "secret": "your secret here",
  "guildId": "1234567890",
  "departmentKey": "police",
  "actionType": "GOOGLE_TEST",
  "submittedByDiscordId": "1111111111",
  "submittedByDiscordTag": "User#0001",
  "targetDiscordId": "1111111111",
  "targetDiscordTag": "User#0001",
  "payload": {
    "note": "Testing bot to Google posting"
  }
}
```

This creates a row in `BotRequests` and a pending `LOG_MESSAGE` action in `BotActions`.

## Poll pending bot actions

```json
{
  "route": "getPendingBotActions",
  "secret": "your secret here",
  "guildId": "1234567890",
  "limit": 10
}
```

## Mark bot action complete

```json
{
  "route": "markBotActionComplete",
  "secret": "your secret here",
  "actionId": "ACT-...",
  "result": {
    "message": "Handled by Discord bot"
  }
}
```

## Cloudflare Worker later

This API shape is intentionally simple. Later, the Discord bot can send the same JSON to a Cloudflare Worker URL. The Worker can forward the request to Apps Script without requiring changes to every bot command.
