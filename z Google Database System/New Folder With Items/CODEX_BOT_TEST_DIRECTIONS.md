# Codex directions — add a minimal Google test command to the Discord bot

Goal: Add a safe `/google-test` slash command that proves the Discord bot can talk to the new single-server Google database.

Do not hard-code the Google Web App URL or secret. Use environment variables.

Required env vars:

```env
GOOGLE_SCRIPT_WEBAPP_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GOOGLE_SCRIPT_SECRET=same-value-as-BOT_API_SECRET
GOOGLE_DEPARTMENT_KEY=main
```

Create or update `utils/googleWebhook.js` with a reusable POST helper:

- Export `postToGoogle(route, payload = {})`.
- Read `process.env.GOOGLE_SCRIPT_WEBAPP_URL`.
- Read `process.env.GOOGLE_SCRIPT_SECRET`.
- Send JSON body containing:
  - `route`
  - `secret`
  - all payload fields
- Return parsed JSON.
- Throw a useful error if env vars are missing or Google returns `{ ok: false }`.

Create `commands/googleTest.js`:

Slash command: `/google-test mode`

Modes:

1. `ping`
   - POST route `ping`
   - Reply with Google version/serverName.

2. `submit`
   - POST route `submitBotRequest`
   - Payload:
     - `actionType: 'GOOGLE_TEST'`
     - `submittedByDiscordId: interaction.user.id`
     - `targetDiscordId: interaction.user.id`
     - `targetName: interaction.user.tag`
     - `source: 'DISCORD_BOT'`
     - `departmentKey: process.env.GOOGLE_DEPARTMENT_KEY || 'main'`
   - Reply with the returned requestId.

3. `poll`
   - POST route `getPendingBotActions`
   - Payload `{ max: 5 }`
   - Reply with a short list of pending action IDs and action types.

4. `complete-first`
   - Poll pending actions.
   - If one exists, POST `markBotActionComplete` for the first action.
   - Reply with the completed action ID.

Keep all replies ephemeral.
