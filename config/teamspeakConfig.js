// config/teamspeakConfig.js
// TeamSpeak configuration for the Discord Department Management Bot.
// Keep secrets in environment variables. Do not hard-code query passwords in GitHub.

require('dotenv').config();

function boolFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['true', '1', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

function numberFromEnv(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

module.exports = {
  enabled: boolFromEnv(process.env.TEAMSPEAK_ENABLED || process.env.TS3_ENABLED, false),

  host: process.env.TEAMSPEAK_HOST || process.env.TS3_HOST || '',
  queryPort: numberFromEnv(process.env.TEAMSPEAK_QUERY_PORT || process.env.TS3_QUERY_PORT, 10011),
  serverPort: numberFromEnv(process.env.TEAMSPEAK_SERVER_PORT || process.env.TS3_SERVER_PORT, 9987),

  username: process.env.TEAMSPEAK_QUERY_USERNAME || process.env.TS3_QUERY_USERNAME || '',
  password: process.env.TEAMSPEAK_QUERY_PASSWORD || process.env.TS3_QUERY_PASSWORD || '',
  nickname: process.env.TEAMSPEAK_NICKNAME || process.env.TS3_NICKNAME || 'Department Bot',

  // Future use: Discord rank key -> TeamSpeak server group ID.
  // Leave blank for now. The /ts status command does not use these yet.
  discordRankKeyToTeamSpeakGroupId: {
    cadet: '',
    probationaryOfficer: '',
    officer: '',
    corporal: '',
    sergeant: '',
    lieutenant: '',
    captain: '',
    command: ''
  }
};
