# Department Database v2 — Single Server Google Template

This is a full replacement starter for the Google side.

## Deployment model

This system is intentionally designed as:

```text
One copied Google Sheet + Apps Script project = one Discord server/community database
```

Do not use this as one giant central database for every server. When you are ready to use it for another server, copy the spreadsheet/script and configure that copy for the other bot/server.

## Import into Google Apps Script

1. Create a brand-new Google Sheet.
2. Open `Extensions → Apps Script`.
3. Delete the default `Code.gs` file.
4. Add every file inside:

```text
google-apps-script-single-server-template/
```

5. In Apps Script, open `Project Settings → Script Properties`.
6. Add this script property:

```text
BOT_API_SECRET = a-long-random-secret
```

Do not commit this secret to GitHub.

7. Run this function once:

```javascript
pdv2InstallOrRepairSystem()
```

8. Approve permissions.
9. Reload the Google Sheet. You should see these menus:

```text
Department DB v2
Bot / API Actions
```

10. In the sheet menu, run:

```text
Department DB v2 → Set Server Name / Guild ID
```

11. Deploy Apps Script as a Web App:

```text
Deploy → New deployment → Web app
Execute as: Me
Who has access: Anyone
```

12. Copy the Web App URL for the bot.

## Sheets created

```text
SystemConfig
Database
BotRequests
BotActions
RankHistory
TrainingRecords
DisciplineRecords
CallsignRegistry
CallsignHistory
Departments
Ranks
StaffAccess
AuditLog
ScriptLogs
```

## Main bot test routes

Use POST requests with JSON.

### Ping

```json
{
  "route": "ping",
  "secret": "same value as BOT_API_SECRET"
}
```

### Submit test request

```json
{
  "route": "submitBotRequest",
  "secret": "same value as BOT_API_SECRET",
  "actionType": "GOOGLE_TEST",
  "submittedByDiscordId": "123456789",
  "targetDiscordId": "123456789",
  "targetName": "Test User",
  "payload": {
    "message": "Testing bot to Google."
  }
}
```

This should add a row to `BotRequests` and create a pending row in `BotActions`.

### Poll pending bot actions

```json
{
  "route": "getPendingBotActions",
  "secret": "same value as BOT_API_SECRET",
  "max": 10
}
```

### Mark action complete

```json
{
  "route": "markBotActionComplete",
  "secret": "same value as BOT_API_SECRET",
  "actionId": "ACT-...",
  "result": {
    "message": "Bot processed this action."
  }
}
```

## Bot environment variables later

```env
GOOGLE_SCRIPT_WEBAPP_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GOOGLE_SCRIPT_SECRET=same-value-as-BOT_API_SECRET
GOOGLE_DEPARTMENT_KEY=main
```

## Future Apps Script UI support

No HTML UI is included yet. The backend already includes UI-ready routes/functions so a future Apps Script HTML dashboard can use the same sheets and service functions.

Future UI backend routes include:

```text
getUiBootstrapData
getUiDashboardData
searchOfficerRecords
getOfficerProfile
listBotRequests
listBotActions
listAuditLog
```

## Important security reminder

The Web App access is usually set to `Anyone` so the Discord bot can reach it. That is why the JSON secret is required. Keep `BOT_API_SECRET` private and rotate it if it is ever exposed.
