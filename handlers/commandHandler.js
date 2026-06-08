const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

async function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'));

  const slashCommands = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (!command.data || !command.execute) {
      console.warn(`Skipping ${file}: missing data or execute.`);
      continue;
    }

    client.commands.set(command.data.name, command);
    slashCommands.push(command.data.toJSON());

    console.log(`Loaded command: /${command.data.name}`);
  }

  await registerSlashCommands(slashCommands);
}

async function registerSlashCommands(slashCommands) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    console.warn('Skipping slash command registration. Missing DISCORD_TOKEN or CLIENT_ID.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: slashCommands }
      );

      console.log(`Registered ${slashCommands.length} guild command(s).`);
    } else {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: slashCommands }
      );

      console.log(`Registered ${slashCommands.length} global command(s).`);
    }
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
}

module.exports = {
  loadCommands
};