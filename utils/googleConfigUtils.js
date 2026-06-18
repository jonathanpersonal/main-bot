const warnedGuilds = new Set();

function isGoogleEnabled(config = {}) {
  return Boolean(config?.google?.enabled);
}

function getGoogleUrl(config = {}) {
  return config?.google?.webAppUrl || config?.google?.workerUrl || config?.google?.webhookUrl || process.env.GOOGLE_WEBAPP_URL || process.env.GOOGLE_WORKER_URL || process.env.GOOGLE_SCRIPT_WEBAPP_URL || '';
}

function getGoogleSecret(config = {}) {
  return config?.google?.secret || process.env.GOOGLE_API_SECRET || process.env.BOT_API_SECRET || process.env.GOOGLE_SCRIPT_SECRET || '';
}

function isGoogleConfigured(config = {}) {
  return Boolean(isGoogleEnabled(config) && getGoogleUrl(config) && getGoogleSecret(config));
}

function warnGoogleMisconfiguredOnce(guildId = 'global', config = {}) {
  const key = String(guildId || 'global');
  if (warnedGuilds.has(key)) return false;
  warnedGuilds.add(key);
  console.warn(`Google integration is enabled for guild ${key}, but the Google Web App / Worker URL or secret is not configured.`);
  return true;
}

module.exports = { isGoogleEnabled, isGoogleConfigured, warnGoogleMisconfiguredOnce, getGoogleUrl, getGoogleSecret };
