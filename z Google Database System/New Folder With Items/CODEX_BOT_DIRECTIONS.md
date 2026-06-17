# Codex directions — Add Google v2 test command to the Discord bot

Goal: make the existing Discord bot prove it can post to the new Google Apps Script v2 backend.

Do **not** rebuild officer management yet. Keep this patch small.

## Current bot structure notes

The bot already auto-loads every `.js` file in `commands/` from `handlers/commandHandler.js`.

So this patch only needs:

```text
utils/googleWebhook.js
commands/googleTest.js
```

No handler changes should be needed.

## Required environment variables

Add these to Sparked Host / Pterodactyl environment variables, not GitHub:

```env
GOOGLE_SCRIPT_WEBAPP_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GOOGLE_SCRIPT_SECRET=the same long BOT_API_SECRET from Apps Script Script Properties
GOOGLE_DEPARTMENT_KEY=main
```

`GOOGLE_DEPARTMENT_KEY` is optional, but useful. It can be `police`, `sheriff`, `fire`, `ems`, `corrections`, or `main` for testing.

## File 1 — create `utils/googleWebhook.js`

```js
function getGoogleConfig() {
  const webAppUrl = process.env.GOOGLE_SCRIPT_WEBAPP_URL;
  const secret = process.env.GOOGLE_SCRIPT_SECRET;
  const departmentKey = process.env.GOOGLE_DEPARTMENT_KEY || 'main';

  return {
    webAppUrl,
    secret,
    departmentKey,
    enabled: Boolean(webAppUrl && secret)
  };
}

async function postToGoogle(route, data = {}) {
  const config = getGoogleConfig();

  if (!config.enabled) {
    throw new Error('Google integration is not configured. Missing GOOGLE_SCRIPT_WEBAPP_URL or GOOGLE_SCRIPT_SECRET.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(config.webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        route,
        secret: config.secret,
        ...data
      }),
      signal: controller.signal
    });

    const text = await response.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`Google returned non-JSON response: ${text.slice(0, 500)}`);
    }

    if (!response.ok) {
      throw new Error(`Google HTTP ${response.status}: ${JSON.stringify(json)}`);
    }

    if (!json.ok) {
      throw new Error(json.error || 'Google returned ok=false.');
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function submitBotRequest(data = {}) {
  return postToGoogle('submitBotRequest', data);
}

async function getPendingBotActions(data = {}) {
  return postToGoogle('getPendingBotActions', data);
}

async function markBotActionComplete(actionId, result = {}) {
  return postToGoogle('markBotActionComplete', {
    actionId,
    result
  });
}

async function markBotActionFailed(actionId, errorMessage, result = {}) {
  return postToGoogle('markBotActionFailed', {
    actionId,
    errorMessage,
    result
  });
}

module.exports = {
  getGoogleConfig,
  postToGoogle,
  submitBotRequest,
  getPendingBotActions,
  markBotActionComplete,
  markBotActionFailed
};
```

## File 2 — create `commands/googleTest.js`

```js
const { SlashCommandBuilder } = require('discord.js');
const {
  getGoogleConfig,
  postToGoogle,
  submitBotRequest,
  getPendingBotActions,
  markBotActionComplete
} = require('../utils/googleWebhook');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('google-test')
    .setDescription('Tests the Google Apps Script v2 connection.')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('What to test')
        .setRequired(false)
        .addChoices(
          { name: 'Ping Google only', value: 'ping' },
          { name: 'Submit test request', value: 'submit' },
          { name: 'Poll pending bot actions', value: 'poll' }
        )
    ),

  async execute(interaction) {
    const mode = interaction.options.getString('mode') || 'submit';
    const config = getGoogleConfig();

    if (!config.enabled) {
      return interaction.reply({
        content: 'Google integration is not configured. Add `GOOGLE_SCRIPT_WEBAPP_URL` and `GOOGLE_SCRIPT_SECRET` to the bot environment variables, then restart the bot.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      if (mode === 'ping') {
        const result = await postToGoogle('ping', {
          echo: `Ping from Discord user ${interaction.user.id}`
        });

        return interaction.editReply({
          content: [
            '✅ Google ping succeeded.',
            `Message: ${result.message || 'No message returned.'}`,
            `Version: ${result.version || 'unknown'}`
          ].join('\n')
        });
      }

      if (mode === 'poll') {
        const result = await getPendingBotActions({
          guildId: interaction.guildId,
          limit: 5
        });

        const actions = result.actions || [];

        for (const action of actions) {
          await markBotActionComplete(action.actionId, {
            handledBy: interaction.user.id,
            handledByCommand: '/google-test poll',
            note: 'Test command marked this action complete.'
          });
        }

        return interaction.editReply({
          content: [
            '✅ Google poll succeeded.',
            `Pending action(s) returned: ${actions.length}`,
            actions.length
              ? actions.map((action) => `- ${action.actionType} / ${action.actionId}`).join('\n')
              : 'No pending actions found.'
          ].join('\n')
        });
      }

      const result = await submitBotRequest({
        guildId: interaction.guildId,
        departmentKey: config.departmentKey,
        actionType: 'GOOGLE_TEST',
        submittedByDiscordId: interaction.user.id,
        submittedByDiscordTag: interaction.user.tag,
        targetDiscordId: interaction.user.id,
        targetDiscordTag: interaction.user.tag,
        payload: {
          command: '/google-test',
          mode: 'submit',
          channelId: interaction.channelId,
          createdAt: new Date().toISOString()
        }
      });

      return interaction.editReply({
        content: [
          '✅ Google test request submitted.',
          `Request ID: ${result.requestId}`,
          `Status: ${result.status}`,
          '',
          'Now check the Google Sheet tabs:',
          '- `BotRequests` should have the request.',
          '- `BotActions` should have a pending `LOG_MESSAGE` action.',
          '',
          'Then run `/google-test mode: Poll pending bot actions` to prove the bot can read and complete pending actions.'
        ].join('\n')
      });
    } catch (error) {
      console.error('Google test failed:', error);

      return interaction.editReply({
        content: `❌ Google test failed: ${error.message}`
      });
    }
  }
};
```

## Test steps

1. Add the Google Apps Script v2 files to a new Google Apps Script project.
2. Run `gsv2InstallOrRepairSystem()` in Apps Script.
3. Deploy Apps Script as a Web App.
4. Add these bot environment variables:

```env
GOOGLE_SCRIPT_WEBAPP_URL=your Apps Script web app URL
GOOGLE_SCRIPT_SECRET=your BOT_API_SECRET value
GOOGLE_DEPARTMENT_KEY=main
```

5. Restart the bot.
6. Run:

```text
/google-test mode: Ping Google only
```

7. Then run:

```text
/google-test mode: Submit test request
```

8. Check Google Sheet:

```text
BotRequests
BotActions
AuditLog
ScriptLogs
```

9. Then run:

```text
/google-test mode: Poll pending bot actions
```

10. Confirm the action in `BotActions` changes from `PENDING` or `IN_PROGRESS` to `COMPLETED`.

## Important notes

- Do not put secrets in GitHub.
- Do not modify officer-management yet.
- Do not add a Cloudflare Worker yet.
- This test command proves the request/response loop first.
- Later, the bot can point `GOOGLE_SCRIPT_WEBAPP_URL` to a Cloudflare Worker URL instead of directly to Apps Script. The payload shape can stay the same.
