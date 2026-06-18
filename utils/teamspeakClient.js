// utils/teamspeakClient.js
// Small TeamSpeak ServerQuery helper used by /ts status.

const teamspeakConfig = require('../config/teamspeakConfig');

let teamspeak = null;
let connectingPromise = null;
let lastConnectionError = null;

function getTeamSpeakLibrary() {
  try {
    return require('ts3-nodejs-library');
  } catch (error) {
    throw new Error(
      'The package ts3-nodejs-library is not installed. Add it to package.json, run npm install, then restart the bot.'
    );
  }
}

function getErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (error.message) return error.message;
  return String(error);
}

function getMissingConfigValues() {
  const missing = [];

  if (!teamspeakConfig.host) missing.push('TEAMSPEAK_HOST');
  if (!teamspeakConfig.username) missing.push('TEAMSPEAK_QUERY_USERNAME');
  if (!teamspeakConfig.password) missing.push('TEAMSPEAK_QUERY_PASSWORD');

  return missing;
}

function validateTeamSpeakConfig() {
  if (!teamspeakConfig.enabled) {
    throw new Error('TeamSpeak integration is disabled. Set TEAMSPEAK_ENABLED=true in your bot environment variables.');
  }

  const missing = getMissingConfigValues();
  if (missing.length > 0) {
    throw new Error(`Missing TeamSpeak environment variable(s): ${missing.join(', ')}`);
  }
}

async function closeBrokenConnection() {
  if (!teamspeak) return;

  try {
    if (typeof teamspeak.quit === 'function') {
      await teamspeak.quit();
    }
  } catch (error) {
    // Ignore cleanup errors. We are already replacing the connection.
  }

  teamspeak = null;
}

async function connectTeamSpeak() {
  validateTeamSpeakConfig();

  if (teamspeak) {
    try {
      await teamspeak.whoami();
      return teamspeak;
    } catch (error) {
      console.warn('[TeamSpeak] Existing connection failed. Reconnecting...', getErrorMessage(error));
      await closeBrokenConnection();
    }
  }

  if (connectingPromise) return connectingPromise;

  const { TeamSpeak } = getTeamSpeakLibrary();

  connectingPromise = TeamSpeak.connect({
    host: teamspeakConfig.host,
    queryport: teamspeakConfig.queryPort,
    serverport: teamspeakConfig.serverPort,
    username: teamspeakConfig.username,
    password: teamspeakConfig.password,
    nickname: teamspeakConfig.nickname,
    readyTimeout: 15000,
    keepAlive: true
  })
    .then((connection) => {
      teamspeak = connection;
      lastConnectionError = null;
      console.log(`[TeamSpeak] Connected to ${teamspeakConfig.host}:${teamspeakConfig.serverPort}`);

      if (typeof teamspeak.on === 'function') {
        teamspeak.on('error', (error) => {
          lastConnectionError = getErrorMessage(error);
          console.error('[TeamSpeak] Error:', error);
        });

        teamspeak.on('close', () => {
          console.warn('[TeamSpeak] Connection closed. It will reconnect on the next command run.');
          teamspeak = null;
        });
      }

      return teamspeak;
    })
    .catch((error) => {
      lastConnectionError = getErrorMessage(error);
      teamspeak = null;
      throw error;
    })
    .finally(() => {
      connectingPromise = null;
    });

  return connectingPromise;
}

function readClientValue(client, keys, fallback = '') {
  for (const key of keys) {
    if (client && client[key] !== undefined && client[key] !== null && client[key] !== '') {
      return client[key];
    }
  }

  if (client && client.propcache) {
    for (const key of keys) {
      if (client.propcache[key] !== undefined && client.propcache[key] !== null && client.propcache[key] !== '') {
        return client.propcache[key];
      }
    }
  }

  return fallback;
}

function normalizeClient(client) {
  return {
    nickname: readClientValue(client, ['nickname', 'clientNickname', 'client_nickname'], 'Unknown'),
    clientId: readClientValue(client, ['clid', 'clientId', 'client_id'], ''),
    databaseId: readClientValue(client, ['databaseId', 'clientDatabaseId', 'client_database_id'], ''),
    uniqueId: readClientValue(client, ['uniqueIdentifier', 'clientUniqueIdentifier', 'client_unique_identifier'], ''),
    clientType: Number(readClientValue(client, ['type', 'clientType', 'client_type'], 0))
  };
}

async function listRegularClients(ts) {
  let clients;

  try {
    clients = await ts.clientList({ clientType: 0 });
  } catch (firstError) {
    try {
      clients = await ts.clientList({ client_type: 0 });
    } catch (secondError) {
      clients = await ts.clientList();
    }
  }

  return clients
    .map(normalizeClient)
    .filter((client) => Number(client.clientType || 0) === 0)
    .sort((a, b) => String(a.nickname).localeCompare(String(b.nickname)));
}

async function getTeamSpeakStatus() {
  const ts = await connectTeamSpeak();
  const whoami = await ts.whoami();
  const onlineUsers = await listRegularClients(ts);

  return {
    connected: true,
    host: teamspeakConfig.host,
    queryPort: teamspeakConfig.queryPort,
    serverPort: teamspeakConfig.serverPort,
    botNickname: readClientValue(whoami, ['clientNickname', 'client_nickname'], teamspeakConfig.nickname),
    onlineUserCount: onlineUsers.length,
    onlineUsers,
    lastConnectionError
  };
}

module.exports = {
  connectTeamSpeak,
  getTeamSpeakStatus
};
