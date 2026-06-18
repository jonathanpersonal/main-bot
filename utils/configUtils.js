const fs = require('fs');
const path = require('path');
const serverConfig = require('../config/serverConfig');
const defaultGuildConfig = require('../config/defaultGuildConfig');
const { mergeWithDefaultConfig, getGuildConfigPath } = require('./guildConfigStore');

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const output = clone(base);
  if (!isPlainObject(override)) return output;
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) output[key] = clone(value);
    else if (isPlainObject(value) && isPlainObject(output[key])) output[key] = deepMerge(output[key], value);
    else if (value !== undefined && value !== null && value !== '') output[key] = value;
  }
  return output;
}

function readLocalGuildConfig(guildId) {
  if (!guildId) return null;
  const configPath = getGuildConfigPath(guildId);
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn(`Could not read local guild config ${path.relative(path.join(__dirname, '..'), configPath)}: ${error.message}`);
    return null;
  }
}

function normalizeLegacyConfig(config = {}) {
  return {
    ...clone(config),
    guildId: config.guildId || process.env.GUILD_ID || '',
    department: {
      name: config.department?.name || config.officerManagement?.departmentName || config.departmentName || '',
      acronym: config.department?.acronym || '',
      previousOfficerRoleId: config.department?.previousOfficerRoleId || config.officerManagement?.previousOfficerRoleId || config.roles?.previousOfficerRoleId || '',
      memberRoleId: config.department?.memberRoleId || config.roles?.departmentMemberRoleId || ''
    },
    channels: {
      officerManagementLogChannelId: config.channels?.officerManagementLogChannelId || config.logChannels?.officerManagementLogs || config.logging?.staffLogChannelId || '',
      trainingLogChannelId: config.channels?.trainingLogChannelId || config.logChannels?.trainingLogs || '',
      dutyLogChannelId: config.channels?.dutyLogChannelId || config.duty?.logChannelId || config.logging?.staffLogChannelId || '',
      ticketLogChannelId: config.channels?.ticketLogChannelId || config.tickets?.logChannelId || config.logChannels?.ticketLogs || '',
      iaLogChannelId: config.channels?.iaLogChannelId || '',
      botAdminLogChannelId: config.channels?.botAdminLogChannelId || config.logging?.staffLogChannelId || '',
      googleLogChannelId: config.channels?.googleLogChannelId || '',
      ticketPanelChannelId: config.channels?.ticketPanelChannelId || config.tickets?.panelChannelId || ''
    },
    google: {
      enabled: Boolean(process.env.GOOGLE_SCRIPT_WEBAPP_URL && process.env.GOOGLE_SCRIPT_SECRET),
      webhookUrl: process.env.GOOGLE_SCRIPT_WEBAPP_URL || config.google?.webhookUrl || config.google?.pollingUrl || '',
      pollingUrl: process.env.GOOGLE_SCRIPT_WEBAPP_URL || config.google?.pollingUrl || ''
    }
  };
}

function applyCompatibilityAliases(config) {
  const merged = clone(config);
  merged.departmentName = merged.departmentName || merged.department?.name || '';
  merged.guildId = merged.guildId || process.env.GUILD_ID || '';
  merged.logChannels = {
    ...(merged.logChannels || {}),
    officerManagementLogs: merged.logChannels?.officerManagementLogs || merged.channels?.officerManagementLogChannelId || null,
    trainingLogs: merged.logChannels?.trainingLogs || merged.channels?.trainingLogChannelId || null,
    ticketLogs: merged.logChannels?.ticketLogs || merged.channels?.ticketLogChannelId || null
  };
  merged.logging = {
    ...(merged.logging || {}),
    staffLogChannelId: merged.logging?.staffLogChannelId || merged.channels?.botAdminLogChannelId || merged.channels?.officerManagementLogChannelId || ''
  };
  merged.roles = {
    ...(merged.roles || {}),
    departmentMemberRoleId: merged.roles?.departmentMemberRoleId || merged.department?.memberRoleId || '',
    previousOfficerRoleId: merged.roles?.previousOfficerRoleId || merged.department?.previousOfficerRoleId || ''
  };
  return merged;
}

function getActiveGuildConfig(guildId) {
  const resolvedGuildId = guildId || process.env.GUILD_ID || serverConfig.guildId || '';
  const base = defaultGuildConfig.createDefaultGuildConfig(resolvedGuildId);
  const legacy = normalizeLegacyConfig(serverConfig);
  const local = readLocalGuildConfig(resolvedGuildId);
  const merged = deepMerge(deepMerge(base, legacy), local || {});
  return applyCompatibilityAliases(mergeWithDefaultConfig(merged));
}

function getServerConfig(guildId) {
  return guildId ? getActiveGuildConfig(guildId) : applyCompatibilityAliases(normalizeLegacyConfig(serverConfig));
}

function validateServerConfig(guildId) {
  const activeConfig = getActiveGuildConfig(guildId);
  const missingFields = [];
  if (!activeConfig.departmentName && !activeConfig.department?.name) missingFields.push('department.name');
  if (!activeConfig.guildId) missingFields.push('guildId');
  if (!Array.isArray(activeConfig.ranks) || activeConfig.ranks.length === 0) missingFields.push('ranks');
  if (!activeConfig.logging?.staffLogChannelId && !activeConfig.channels?.officerManagementLogChannelId) missingFields.push('log channel');

  if (missingFields.length > 0) {
    console.warn(`Server config warning: missing required/recommended field(s): ${missingFields.join(', ')}`);
  }

  return { isValid: missingFields.length === 0, missingFields };
}

module.exports = {
  getServerConfig,
  getActiveGuildConfig,
  validateServerConfig
};
