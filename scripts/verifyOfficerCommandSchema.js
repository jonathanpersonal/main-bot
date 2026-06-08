const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const commandPath = path.join(rootDir, 'commands', 'officerManagement.js');
const configPath = path.join(rootDir, 'config', 'serverConfig.js');

const commandSource = fs.readFileSync(commandPath, 'utf8');
const configSource = fs.readFileSync(configPath, 'utf8');

const prohibitedSlashOptions = [
  'new_rank',
  'strike_level',
  'reason',
  'evidence',
  'blacklist',
  'reapply',
  'comments'
];

const failures = [];
const commandBuilderSection = getCommandBuilderSection(commandSource);

for (const optionName of prohibitedSlashOptions) {
  assertDoesNotMatch(
    commandBuilderSection,
    new RegExp(`\\.setName\\(['"]${optionName}['"]\\)`),
    `Slash command still defines prohibited option: ${optionName}`
  );
}

assertMatches(
  commandBuilderSection,
  /\.addStringOption[\s\S]*?\.setName\(['"]action['"]\)/,
  'Slash command must define action option.'
);

assertMatches(
  commandBuilderSection,
  /\.addUserOption[\s\S]*?\.setName\(['"]officer['"]\)/,
  'Slash command must define officer option.'
);

assertDoesNotMatch(
  commandSource,
  /getString\(['"]new_rank['"]\)|getInteger\(['"]strike_level['"]\)/,
  'Command still reads removed slash command options.'
);

assertMatches(
  commandSource,
  /officer_mgmt_appeal_start:/,
  'Appeal button must use officer_mgmt_appeal_start custom ID.'
);

assertDoesNotMatch(
  commandSource,
  /ButtonStyle\.Link|\.setURL\(/,
  'Appeal button must not be a link button.'
);

assertDoesNotMatch(
  configSource,
  /appealButton:\s*\{[\s\S]*?\burl\s*:/,
  'Appeal button config must not require a URL.'
);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Officer command schema verified: only action/officer slash options, component follow-ups, and custom-id appeal button.');

function getCommandBuilderSection(source) {
  const start = source.indexOf('data: new SlashCommandBuilder()');
  const end = source.indexOf('async execute', start);

  if (start === -1 || end === -1) {
    failures.push('Could not locate officer-management SlashCommandBuilder section.');
    return source;
  }

  return source.slice(start, end);
}

function assertMatches(source, pattern, message) {
  if (!pattern.test(source)) {
    failures.push(message);
  }
}

function assertDoesNotMatch(source, pattern, message) {
  if (pattern.test(source)) {
    failures.push(message);
  }
}
