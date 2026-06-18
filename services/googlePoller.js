<<<<<<< ours
<<<<<<< ours
const {
  getPendingBotActions,
  markBotActionComplete,
  markBotActionFailed
} = require('../utils/googleWebhook');

const RESULT_ACTION_TYPES = new Set([
  'GOOGLE_TEST_RESULT',
  'REGISTER_OFFICER_RESULT',
  'OFFICER_MANAGEMENT_RESULT',
  'OFFICER_STATUS_RESULT',
  'DISCIPLINE_RECORD_RESULT',
  'TRAINING_RECORD_RESULT'
]);

let pollerInterval = null;
let isPolling = false;

function getPollingConfig() {
  const intervalMs = Number(process.env.GOOGLE_POLLING_INTERVAL_MS || 60000);
  const limit = Number(process.env.GOOGLE_POLLING_LIMIT || 5);

  return {
    enabled: String(process.env.GOOGLE_POLLING_ENABLED || '').toLowerCase() === 'true',
    intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60000,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 5
  };
}

function getActionId(action) {
  return action?.actionId || action?.id || action?.botActionId || action?.ActionId || action?.ActionID;
}

function getActionPayload(action) {
  const payload = action?.payload || action?.Payload || {};
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return { rawPayload: payload }; }
  }
  return payload || {};
}

function startGooglePoller(client) {
  const config = getPollingConfig();

  if (!config.enabled) {
    console.log('Google poller disabled. Set GOOGLE_POLLING_ENABLED=true to enable it.');
    return false;
  }

  if (pollerInterval) {
    console.log('Google poller is already running.');
    return false;
  }

  const run = () => pollPendingBotActions(client, config.limit);
  pollerInterval = setInterval(run, config.intervalMs);
  pollerInterval.unref?.();
  console.log(`Google poller started. intervalMs=${config.intervalMs} limit=${config.limit}`);
  run();
  return true;
}

async function pollPendingBotActions(client, limit = 5) {
  if (isPolling) return;
  isPolling = true;

  try {
    const result = await getPendingBotActions({ limit });
    const actions = result.actions || [];

    for (const action of actions) {
      await processActionSafely(client, action);
    }
  } catch (error) {
    console.error('Google poller run failed:', error);
  } finally {
    isPolling = false;
  }
}

async function processActionSafely(client, action) {
  const actionId = getActionId(action);
  const actionType = action?.actionType || action?.type || action?.ActionType;

  if (!actionId) {
    console.warn('Skipping Google BotAction without an actionId:', action);
    return;
  }

  try {
    const result = await processBotAction(client, action, actionType);
    await markBotActionComplete(actionId, result || { handledAt: new Date().toISOString() });
  } catch (error) {
    console.error(`Google BotAction ${actionId} failed:`, error);
    await markBotActionFailed(actionId, error.message, { handledAt: new Date().toISOString() }).catch((markError) => {
      console.error(`Could not mark Google BotAction ${actionId} failed:`, markError);
    });
  }
}

async function processBotAction(client, action, actionType) {
  const payload = getActionPayload(action);

  if (RESULT_ACTION_TYPES.has(actionType)) {
    console.log(`Google result action received: ${actionType}`, payload);
    return { handledAt: new Date().toISOString(), handledBy: 'googlePoller' };
  }

  if (actionType === 'GENERIC_REQUEST_RECEIVED') {
    console.warn('Google generic request received:', payload);
    return { handledAt: new Date().toISOString(), warning: 'Generic request acknowledged.' };
  }

  if (actionType === 'DM_USER') {
    const targetDiscordId = payload.targetDiscordId || action.targetDiscordId;
    const message = payload.message;
    if (!targetDiscordId) throw new Error('DM_USER is missing targetDiscordId.');
    if (!message) throw new Error('DM_USER is missing payload.message.');
    const user = await client.users.fetch(targetDiscordId);
    await user.send(message);
    return { handledAt: new Date().toISOString(), dmSentTo: targetDiscordId };
  }

  if (actionType === 'LOG_MESSAGE') {
    const channelId = payload.channelId || payload.logChannelId || action.channelId;
    const message = payload.message;
    if (!channelId) throw new Error('LOG_MESSAGE is missing channelId/logChannelId.');
    if (!message) throw new Error('LOG_MESSAGE is missing payload.message.');
    const channel = await client.channels.fetch(channelId);
    if (!channel?.send) throw new Error(`LOG_MESSAGE target channel ${channelId} is not sendable.`);
    await channel.send(message);
    return { handledAt: new Date().toISOString(), loggedToChannelId: channelId };
  }

  throw new Error(`Unsupported BotAction type: ${actionType}`);
}

module.exports = {
  startGooglePoller,
  pollPendingBotActions,
  processBotAction,
  getPollingConfig
};
=======
=======
>>>>>>> theirs
const {
  getPendingBotActions,
  markBotActionComplete,
  markBotActionFailed
} = require('../utils/googleWebhook');

const RESULT_ACTION_TYPES = new Set([
  'GOOGLE_TEST_RESULT',
  'REGISTER_OFFICER_RESULT',
  'OFFICER_MANAGEMENT_RESULT',
  'OFFICER_STATUS_RESULT',
  'DISCIPLINE_RECORD_RESULT',
  'TRAINING_RECORD_RESULT'
]);

let pollerInterval = null;
let isPolling = false;

function getPollingConfig() {
  const intervalMs = Number(process.env.GOOGLE_POLLING_INTERVAL_MS || 60000);
  const limit = Number(process.env.GOOGLE_POLLING_LIMIT || 5);

  return {
    enabled: String(process.env.GOOGLE_POLLING_ENABLED || '').toLowerCase() === 'true',
    intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60000,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 5
  };
}

function getActionId(action) {
  return action?.actionId || action?.id || action?.botActionId || action?.ActionId || action?.ActionID;
}

function getActionPayload(action) {
  const payload = action?.payload || action?.Payload || {};
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return { rawPayload: payload }; }
  }
  return payload || {};
}

function startGooglePoller(client) {
  const config = getPollingConfig();

  if (!config.enabled) {
    console.log('Google poller disabled. Set GOOGLE_POLLING_ENABLED=true to enable it.');
    return false;
  }

  if (pollerInterval) {
    console.log('Google poller is already running.');
    return false;
  }

  const run = () => pollPendingBotActions(client, config.limit);
  pollerInterval = setInterval(run, config.intervalMs);
  pollerInterval.unref?.();
  console.log(`Google poller started. intervalMs=${config.intervalMs} limit=${config.limit}`);
  run();
  return true;
}

async function pollPendingBotActions(client, limit = 5) {
  if (isPolling) return;
  isPolling = true;

  try {
    const result = await getPendingBotActions({ limit });
    const actions = result.actions || [];

    for (const action of actions) {
      await processActionSafely(client, action);
    }
  } catch (error) {
    console.error('Google poller run failed:', error);
  } finally {
    isPolling = false;
  }
}

async function processActionSafely(client, action) {
  const actionId = getActionId(action);
  const actionType = action?.actionType || action?.type || action?.ActionType;

  if (!actionId) {
    console.warn('Skipping Google BotAction without an actionId:', action);
    return;
  }

  try {
    const result = await processBotAction(client, action, actionType);
    await markBotActionComplete(actionId, result || { handledAt: new Date().toISOString() });
  } catch (error) {
    console.error(`Google BotAction ${actionId} failed:`, error);
    await markBotActionFailed(actionId, error.message, { handledAt: new Date().toISOString() }).catch((markError) => {
      console.error(`Could not mark Google BotAction ${actionId} failed:`, markError);
    });
  }
}

async function processBotAction(client, action, actionType) {
  const payload = getActionPayload(action);

  if (RESULT_ACTION_TYPES.has(actionType)) {
    console.log(`Google result action received: ${actionType}`, payload);
    return { handledAt: new Date().toISOString(), handledBy: 'googlePoller' };
  }

  if (actionType === 'GENERIC_REQUEST_RECEIVED') {
    console.warn('Google generic request received:', payload);
    return { handledAt: new Date().toISOString(), warning: 'Generic request acknowledged.' };
  }

  if (actionType === 'DM_USER') {
    const targetDiscordId = payload.targetDiscordId || action.targetDiscordId;
    const message = payload.message;
    if (!targetDiscordId) throw new Error('DM_USER is missing targetDiscordId.');
    if (!message) throw new Error('DM_USER is missing payload.message.');
    const user = await client.users.fetch(targetDiscordId);
    await user.send(message);
    return { handledAt: new Date().toISOString(), dmSentTo: targetDiscordId };
  }

  if (actionType === 'LOG_MESSAGE') {
    const channelId = payload.channelId || payload.logChannelId || action.channelId;
    const message = payload.message;
    if (!channelId) throw new Error('LOG_MESSAGE is missing channelId/logChannelId.');
    if (!message) throw new Error('LOG_MESSAGE is missing payload.message.');
    const channel = await client.channels.fetch(channelId);
    if (!channel?.send) throw new Error(`LOG_MESSAGE target channel ${channelId} is not sendable.`);
    await channel.send(message);
    return { handledAt: new Date().toISOString(), loggedToChannelId: channelId };
  }

  throw new Error(`Unsupported BotAction type: ${actionType}`);
}

module.exports = {
  startGooglePoller,
  pollPendingBotActions,
  processBotAction,
  getPollingConfig
};
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
