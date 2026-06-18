# Google Apps Script Forwarder

This Cloudflare Worker forwards the bot's existing Google JSON API calls to the
Department Google Apps Script web app.

It is useful for:

- Returning JSON diagnostics when Google returns an HTML error page.
- Testing whether the configured Google deployment has `doGet`/`doPost`.
- Keeping the bot pointed at one stable Worker URL while the upstream Apps
  Script deployment URL changes.
- Falling back to `GET` for read-only routes if the Apps Script deployment says
  `Script function not found: doPost`.

It does not make a Google deployment without `doPost` process write actions.
If Google returns `Script function not found: doPost`, redeploy the Apps Script
web app version that includes `13_PDV2_WebApp`.

## Cloudflare Variables

Set these in Cloudflare:

```text
GOOGLE_SCRIPT_WEBAPP_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SCRIPT_SECRET=your-existing-apps-script-secret
```

Use a normal Cloudflare variable for `GOOGLE_SCRIPT_WEBAPP_URL`. Use a
Cloudflare secret for `GOOGLE_SCRIPT_SECRET` if you want the Worker to inject it
when the bot request does not already include one.

The fallback only applies to:

```text
ping
getPendingBotActions
getRequestStatus
```

Write routes such as `submitBotRequest`, `markBotActionComplete`, and
`markBotActionFailed` still require Apps Script `doPost`.

## Bot Env Vars

Point the bot at the Worker URL:

```text
GOOGLE_SCRIPT_WEBAPP_URL=https://your-worker.your-subdomain.workers.dev
GOOGLE_SCRIPT_SECRET=your-existing-apps-script-secret
```

Keep `GOOGLE_SCRIPT_SECRET` the same value expected by Apps Script. The Worker
forwards it to Google.

## Quick Tests

Open this in a browser:

```text
https://your-worker.your-subdomain.workers.dev/?route=ping
```

Expected success:

```json
{
  "ok": true,
  "status": "ready",
  "source": "cloudflare_worker"
}
```

If you see:

```json
{
  "ok": false,
  "upstreamBody": "Error Script function not found: doPost"
}
```

then the Google deployment URL still points to a version that does not include
`doPost`.
