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
