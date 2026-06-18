const fs = require('fs');
const path = require('path');
const defaultGuildConfig = require('../config/defaultGuildConfig');

const CONFIG_DIR = path.join(__dirname, '..', 'data', 'guildConfigs');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeDefaults(defaultValue, currentValue) {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(currentValue) ? currentValue : clone(defaultValue);
  }

  if (isPlainObject(defaultValue)) {
    const merged = {};
    const source = isPlainObject(currentValue) ? currentValue : {};

    for (const key of Object.keys(defaultValue)) {
      merged[key] = deepMergeDefaults(defaultValue[key], source[key]);
    }

    for (const key of Object.keys(source)) {
      if (!(key in merged)) merged[key] = source[key];
    }

    return merged;
  }

  return currentValue === undefined || currentValue === null ? defaultValue : currentValue;
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    console.log(`Created guild config folder: ${CONFIG_DIR}`);
  }
}

function getGuildConfigPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}.json`);
}

function mergeWithDefaultConfig(config = {}) {
  const guildId = config.guildId || '';
  const base = defaultGuildConfig.createDefaultGuildConfig(guildId);
  const merged = deepMergeDefaults(base, isPlainObject(config) ? config : {});
  merged.guildId = guildId || merged.guildId || '';
  return merged;
}

function saveGuildConfig(guildId, config) {
  ensureConfigDir();
  const merged = mergeWithDefaultConfig({ ...(config || {}), guildId });
  fs.writeFileSync(getGuildConfigPath(guildId), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged;
}

function ensureGuildConfig(guildId) {
  ensureConfigDir();
  const configPath = getGuildConfigPath(guildId);

  if (!fs.existsSync(configPath)) {
    console.log(`No local setup config found for guild ${guildId}. Creating a beginner-friendly default config.`);
    return saveGuildConfig(guildId, defaultGuildConfig.createDefaultGuildConfig(guildId));
  }

  return getGuildConfig(guildId);
}

function getGuildConfig(guildId) {
  ensureConfigDir();
  const configPath = getGuildConfigPath(guildId);

  if (!fs.existsSync(configPath)) {
    return ensureGuildConfig(guildId);
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const merged = mergeWithDefaultConfig({ ...parsed, guildId });

    if (JSON.stringify(parsed) !== JSON.stringify(merged)) {
      saveGuildConfig(guildId, merged);
    }

    return merged;
  } catch (error) {
    console.warn(`Could not read guild config for ${guildId}. Using a safe default instead. Details: ${error.message}`);
    return mergeWithDefaultConfig({ guildId });
  }
}

function updateGuildConfig(guildId, updaterFunction) {
  const current = getGuildConfig(guildId);
  const draft = mergeWithDefaultConfig(current);
  const updated = updaterFunction(draft) || draft;
  updated.setup = updated.setup || {};
  updated.setup.updatedAt = new Date().toISOString();
  return saveGuildConfig(guildId, updated);
}

module.exports = {
  ensureGuildConfig,
  getGuildConfig,
  saveGuildConfig,
  updateGuildConfig,
  getGuildConfigPath,
  mergeWithDefaultConfig
};
