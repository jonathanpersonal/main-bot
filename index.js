require('dotenv').config();

const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { loadCommands } = require('./handlers/commandHandler');
const { validateServerConfig } = require('./utils/configUtils');
const { handleAppealInteraction } = require('./utils/appealUtils');
const { startLoaDailySyncScheduler } = require('./utils/loaSync');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    startLoaDailySyncScheduler(readyClient);
  } catch (error) {
    console.error('Could not start LOA daily sync scheduler:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() || interaction.isModalSubmit()) {
    try {
      const wasAppealInteraction = await handleAppealInteraction(interaction, client);
      if (wasAppealInteraction) return;
    } catch (error) {
      console.error('Error handling appeal interaction:', error);
      await sendInteractionError(interaction);
      return;
    }
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) return;

    try {
      await command.autocomplete(interaction, client);
    } catch (error) {
      console.error(`Error running autocomplete for /${interaction.commandName}:`, error);
    }

    return;
  }

  if (interaction.isModalSubmit()) {
    return handleCommandInteraction(interaction, 'handleModalSubmit', 'modal submit');
  }

  if (interaction.isStringSelectMenu()) {
    return handleCommandInteraction(interaction, 'handleSelectMenu', 'select menu');
  }

  if (interaction.isButton()) {
    return handleCommandInteraction(interaction, 'handleButton', 'button');
  }

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

    await sendInteractionError(interaction);
  }
});

async function handleCommandInteraction(interaction, handlerName, interactionTypeLabel) {
  for (const command of client.commands.values()) {
    if (!command[handlerName]) continue;

    try {
      const wasHandled = await command[handlerName](interaction, client);
      if (wasHandled) return;
    } catch (error) {
      console.error(`Error handling ${interactionTypeLabel} interaction:`, error);
      await sendInteractionError(interaction);
      return;
    }
  }
}

async function sendInteractionError(interaction) {
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
