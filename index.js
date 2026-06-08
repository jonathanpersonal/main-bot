require('dotenv').config();

const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { loadCommands } = require('./handlers/commandHandler.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    return interaction.reply({
      content: 'This command was not found.',
      ephemeral: true
    });
  }

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`Error running /${interaction.commandName}:`, error);

    const errorMessage = {
      content: 'There was an error while running this command.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

async function startBot() {
  if (!process.env.DISCORD_TOKEN) {
    console.error('Missing DISCORD_TOKEN in environment variables.');
    process.exit(1);
  }

  validateServerConfig();

  await loadCommands(client);
  await client.login(process.env.DISCORD_TOKEN);
}

startBot();