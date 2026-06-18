const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const GUILD_CONFIG_DIR = path.join(DATA_DIR, 'guildConfigs');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const ENV_FILE = path.join(ROOT, '.env');
const DEFAULT_CONFIG = path.join(ROOT, 'config', 'defaultGuildConfig.js');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created ${path.relative(ROOT, dir)}/`);
    return;
  }
  console.log(`Kept existing ${path.relative(ROOT, dir)}/`);
}

function copyEnvExample() {
  if (fs.existsSync(ENV_FILE)) {
    console.log('Kept existing .env (not overwritten).');
    return;
  }

  if (!fs.existsSync(ENV_EXAMPLE)) {
    console.log('No .env.example found, so .env was not created.');
    return;
  }

  fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
  console.log('Created .env from .env.example. Fill in your real values before starting the bot.');
}

function createStarterGuildConfig() {
  const existingConfigs = fs.existsSync(GUILD_CONFIG_DIR)
    ? fs.readdirSync(GUILD_CONFIG_DIR).filter((file) => file.endsWith('.json'))
    : [];

  if (existingConfigs.length > 0) {
    console.log('Kept existing local guild config file(s); no starter config was created.');
    return;
  }

  if (!fs.existsSync(DEFAULT_CONFIG)) {
    console.log('No default guild config module found, so no starter guild config was created.');
    return;
  }

  const guildId = process.env.GUILD_ID || 'YOUR_GUILD_ID';
  const starterPath = path.join(GUILD_CONFIG_DIR, `${guildId}.example.json`);

  if (fs.existsSync(starterPath)) {
    console.log(`Kept existing starter guild config at ${path.relative(ROOT, starterPath)}.`);
    return;
  }

  const defaultGuildConfig = require(DEFAULT_CONFIG);
  const starter = defaultGuildConfig.createDefaultGuildConfig
    ? defaultGuildConfig.createDefaultGuildConfig(guildId === 'YOUR_GUILD_ID' ? '' : guildId)
    : { guildId: guildId === 'YOUR_GUILD_ID' ? '' : guildId };

  fs.writeFileSync(starterPath, `${JSON.stringify(starter, null, 2)}\n`, 'utf8');
  console.log(`Created starter config ${path.relative(ROOT, starterPath)} (rename/copy to <your guild id>.json when ready).`);
}

ensureDir(DATA_DIR);
ensureDir(GUILD_CONFIG_DIR);
copyEnvExample();
createStarterGuildConfig();

console.log('\nNext steps:');
console.log('1. Edit .env and add DISCORD_TOKEN, CLIENT_ID, GUILD_ID, and any Google/DB settings you use.');
console.log('2. Copy data/guildConfigs/YOUR_GUILD_ID.example.json to data/guildConfigs/<your guild id>.json, then fill in role/channel IDs.');
console.log('3. Run npm install.');
console.log('4. Run npm run deploy-commands if this project includes command deployment for your host.');
console.log('5. Run npm start.');
