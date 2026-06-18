function getGoogleConfig() {
  const webAppUrl = process.env.GOOGLE_SCRIPT_WEBAPP_URL;
  const secret = process.env.GOOGLE_SCRIPT_SECRET;
  const departmentKey = process.env.GOOGLE_DEPARTMENT_KEY || 'main';

  const parsedTimeoutMs = Number(process.env.GOOGLE_SCRIPT_TIMEOUT_MS || 120000);
  const timeoutMs =
    Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
      ? parsedTimeoutMs
      : 120000;

  return {
    webAppUrl,
    secret,
    departmentKey,
    timeoutMs,
    enabled: Boolean(webAppUrl && secret)
  };
}

class GoogleTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleTimeoutError';
    this.isGoogleTimeout = true;
  }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlTitle(value) {
  const match = String(value || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : '';
}

function buildNonJsonGoogleError(response, text) {
  const title = extractHtmlTitle(text);
  const body = stripHtml(text).slice(0, 500);
  const details = [
    `Google returned a non-JSON response`,
    `HTTP ${response.status}`,
    title ? `title="${title}"` : null,
    body ? `body="${body}"` : null
  ].filter(Boolean).join(': ');

  const error = new Error(details);
  error.googleStatus = response.status;
  error.googleContentType = response.headers.get('content-type') || '';
  error.googleResponseTitle = title;
  return error;
}

async function postToGoogle(route, data = {}) {
  const config = getGoogleConfig();

  if (!config.enabled) {
    throw new Error(
      'Google integration is not configured. Missing GOOGLE_SCRIPT_WEBAPP_URL or GOOGLE_SCRIPT_SECRET.'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

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
      throw buildNonJsonGoogleError(response, text);
    }

    if (!response.ok) {
      throw new Error(`Google HTTP ${response.status}: ${JSON.stringify(json)}`);
    }

    if (!json.ok) {
      throw new Error(json.error || 'Google returned ok=false.');
    }

    return json;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new GoogleTimeoutError(
        `Google Apps Script did not respond within ${Math.round(config.timeoutMs / 1000)} seconds. ` +
          'The request may still have completed in Google, so check BotRequests/BotActions before trying again.'
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function pingGoogle(data = {}) {
  return postToGoogle('ping', data);
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
  GoogleTimeoutError,
  getGoogleConfig,
  postToGoogle,
  pingGoogle,
  submitBotRequest,
  getPendingBotActions,
  markBotActionComplete,
  markBotActionFailed
};
