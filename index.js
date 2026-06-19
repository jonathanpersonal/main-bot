require('dotenv').config();

const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const ticketUtils = require('./utils/ticketUtils');
const { loadCommands } = require('./handlers/commandHandler');
const { getServerConfig, validateServerConfig } = require('./utils/configUtils');
const permissionUtils = require('./utils/permissionUtils');
const { handleAppealInteraction } = require('./utils/appealUtils');
const { startLoaDailySyncScheduler } = require('./utils/loaSync');
const { startGooglePoller } = require('./services/googlePoller');
const { startCadetDeadlineService } = require('./services/cadetDeadlineService');
const { startProbationCheckService } = require('./services/probationCheckService');
const { logServerError } = require('./utils/errorLogUtils');

const isDevOnlyEnabled = typeof permissionUtils.isDevOnlyEnabled === 'function'
  ? permissionUtils.isDevOnlyEnabled
  : () => false;

const requireDevOnlyAccess = typeof permissionUtils.requireDevOnlyAccess === 'function'
  ? permissionUtils.requireDevOnlyAccess
  : async () => true;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    startLoaDailySyncScheduler(readyClient);
  } catch (error) {
    console.error('Could not start LOA daily sync scheduler:', error);
  }

  try {
    startCadetDeadlineService(readyClient);
  } catch (error) {
    console.error('Could not start cadet deadline service:', error);
  }

  try {
    startProbationCheckService(readyClient);
  } catch (error) {
    console.error('Could not start probation check service:', error);
  }

  try {
    startGooglePoller(readyClient);
  } catch (error) {
    console.error('Could not start Google poller:', error);
  }
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    if (isGoogleLockBusyError(error)) {
      if (isDebugLoggingEnabled()) console.warn('Google lock busy while handling interaction:', error);
      await sendInteractionError(interaction, 'Google is busy processing another request. Wait a moment and try again.').catch((replyError) => {
        console.error('Could not send interaction error response:', replyError);
      });
      return;
    }
    console.error('Unhandled interaction error:', error);
    await logServerError(interaction, error, { commandName: interaction.commandName, customId: interaction.customId, guildId: interaction.guildId });
    await sendInteractionError(interaction).catch((replyError) => {
      console.error('Could not send interaction error response:', replyError);
    });
  }
});

async function handleInteraction(interaction) {
  if (interaction.guildId) {
    const config = getServerConfig(interaction.guildId);

    if (isDevOnlyEnabled(config)) {
      const hasDevAccess = await requireDevOnlyAccess(interaction, { config });
      if (!hasDevAccess) return;
    }
  }

  if (await handleTicketInteraction(interaction)) return;

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
      flags: MessageFlags.Ephemeral
    });
  }

  try {
    await command.execute(interaction, client);
  } catch (error) {
    if (isGoogleLockBusyError(error)) {
      if (isDebugLoggingEnabled()) console.warn(`Google lock busy while running /${interaction.commandName}:`, error);
      await sendInteractionError(interaction, 'Google is busy processing another request. Wait a moment and try again.');
      return;
    }
    console.error(`Error running /${interaction.commandName}:`, error);
    await logServerError(interaction, error, { commandName: interaction.commandName, guildId: interaction.guildId });
    await sendInteractionError(interaction);
  }
}

function isGoogleLockBusyError(error) {
  return Boolean(error?.isGoogleLockBusy || error?.googleStatus === 423 || error?.googleCode === 'LOCK_BUSY');
}

function isDebugLoggingEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.DEBUG_LOGGING || process.env.DEBUG_GOOGLE_LOCK_BUSY || ''));
}

async function handleTicketInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('ticket:')) return false;

  try {
    if (interaction.isButton()) {
      if (customId.startsWith('ticket:create:')) await ticketUtils.createTicketFromPanel(interaction, customId.split(':')[2]);
      else if (customId === 'ticket:claim') await ticketUtils.claimTicket(interaction);
      else if (customId === 'ticket:rename') await ticketUtils.renameTicket(interaction);
      else if (customId === 'ticket:transfer') await ticketUtils.transferTicket(interaction);
      else if (customId === 'ticket:lockdown') await ticketUtils.lockTicket(interaction);
      else if (customId === 'ticket:unlock') await ticketUtils.unlockTicket(interaction);
      else if (customId === 'ticket:close' || customId === 'ticket:close_confirm') await ticketUtils.closeTicket(interaction);
      else if (customId === 'ticket:close_cancel') await interaction.reply({ content: 'Ticket close cancelled.', flags: MessageFlags.Ephemeral });
      else return false;
      return true;
    }

    if (interaction.isStringSelectMenu()) {
      if (customId === 'ticket:transfer_select') await ticketUtils.handleTransferSelect(interaction);
      else if (customId === 'ticket:lockdown_select') await ticketUtils.handleLockdownSelect(interaction);
      else return false;
      return true;
    }

    if (interaction.isModalSubmit()) {
      if (customId === 'ticket:rename_modal') await ticketUtils.handleRenameModal(interaction);
      else if (customId === 'ticket:close_modal') await ticketUtils.handleCloseModal(interaction);
      else return false;
      return true;
    }
  } catch (error) {
    if (isGoogleLockBusyError(error)) {
      if (isDebugLoggingEnabled()) console.warn('Google lock busy while handling ticket interaction:', error);
      await sendInteractionError(interaction, 'Google is busy processing another request. Wait a moment and try again.');
      return true;
    }
    console.error('Error handling ticket interaction:', error);
    await logServerError(interaction, error, { customId, guildId: interaction.guildId });
    await sendInteractionError(interaction);
    return true;
  }

  return false;
}

async function handleCommandInteraction(interaction, handlerName, interactionTypeLabel) {
  for (const command of client.commands.values()) {
    if (!command[handlerName]) continue;

    try {
      const wasHandled = await command[handlerName](interaction, client);
      if (wasHandled) return;
    } catch (error) {
      if (isGoogleLockBusyError(error)) {
        if (isDebugLoggingEnabled()) console.warn(`Google lock busy while handling ${interactionTypeLabel} interaction:`, error);
        await sendInteractionError(interaction, 'Google is busy processing another request. Wait a moment and try again.');
        return;
      }
      console.error(`Error handling ${interactionTypeLabel} interaction:`, error);
      await logServerError(interaction, error, { interactionTypeLabel, customId: interaction.customId, guildId: interaction.guildId });
      await sendInteractionError(interaction);
      return;
    }
  }
}

async function sendInteractionError(interaction, message = 'There was an error while running this command.') {
  if (!interaction || !interaction.isRepliable?.()) return;

  const errorMessage = {
    content: message,
    flags: MessageFlags.Ephemeral
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

startBot().catch((error) => {
  console.error('Failed to start bot:', error);
  process.exit(1);
});
