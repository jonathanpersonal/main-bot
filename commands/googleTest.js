<<<<<<< ours
const { SlashCommandBuilder } = require('discord.js');
const {
  getGoogleConfig,
  postToGoogle,
  submitBotRequest,
  getPendingBotActions,
  markBotActionComplete
} = require('../utils/googleWebhook');

const SIMPLE_RESULT_ACTION_TYPES = new Set([
  'REGISTER_OFFICER_RESULT',
  'OFFICER_MANAGEMENT_RESULT',
  'OFFICER_STATUS_RESULT',
  'DISCIPLINE_RECORD_RESULT',
  'TRAINING_RECORD_RESULT',
  'GENERIC_REQUEST_RECEIVED'
]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('google-test')
    .setDescription('Tests the Google Apps Script v2 connection.')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('What to test')
        .setRequired(false)
        .addChoices(
          { name: 'Ping Google only', value: 'ping' },
          { name: 'Submit test request', value: 'submit' },
          { name: 'Poll pending bot actions', value: 'poll' },
          { name: 'Complete GOOGLE_TEST_RESULT actions', value: 'complete-test-actions' },
          { name: 'Complete simple result actions', value: 'complete-result-actions' }
        )
    ),

  async execute(interaction) {
    const mode = interaction.options.getString('mode') || 'submit';
    const config = getGoogleConfig();

    if (!config.enabled) {
      return interaction.reply({
        content: 'Google integration is not configured. Add `GOOGLE_SCRIPT_WEBAPP_URL` and `GOOGLE_SCRIPT_SECRET` to the bot environment variables, then restart the bot.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      if (mode === 'ping') {
        const result = await postToGoogle('ping', {
          echo: `Ping from Discord user ${interaction.user.id}`
        });

        return interaction.editReply({
          content: [
            '✅ Google ping succeeded.',
            `Message: ${result.message || 'No message returned.'}`,
            `Version: ${result.version || 'unknown'}`
          ].join('\n')
        });
      }

      if (mode === 'poll') {
        const result = await getPendingBotActions({ guildId: interaction.guildId, limit: 5 });
        const actions = result.actions || [];

        return interaction.editReply({
          content: [
            '✅ Google poll succeeded.',
            `Pending action(s) returned: ${actions.length}`,
            actions.length
              ? actions.map((action) => `- ${action.actionType || action.type} / ${action.actionId || action.id}`).join('\n')
              : 'No pending actions found.',
            '',
            'No actions were completed and no test requests were created.'
          ].join('\n')
        });
      }

      if (mode === 'complete-test-actions' || mode === 'complete-result-actions') {
        const allowedTypes = mode === 'complete-test-actions'
          ? new Set(['GOOGLE_TEST_RESULT'])
          : SIMPLE_RESULT_ACTION_TYPES;
        const result = await getPendingBotActions({ guildId: interaction.guildId, limit: 25 });
        const actions = (result.actions || []).filter((action) => allowedTypes.has(action.actionType || action.type));

        for (const action of actions) {
          await markBotActionComplete(action.actionId || action.id, {
            handledBy: interaction.user.id,
            handledByCommand: `/google-test ${mode}`,
            note: 'Test command completed this pending result action.',
            handledAt: new Date().toISOString()
          });
        }

        return interaction.editReply({
          content: [
            '✅ Google completion succeeded.',
            `Mode: ${mode}`,
            `Completed action(s): ${actions.length}`,
            actions.length
              ? actions.map((action) => `- ${action.actionType || action.type} / ${action.actionId || action.id}`).join('\n')
              : 'No matching pending actions found.',
            '',
            'No test requests were created.'
          ].join('\n')
        });
      }

      const result = await submitBotRequest({
        guildId: interaction.guildId,
        departmentKey: config.departmentKey,
        actionType: 'GOOGLE_TEST',
        submittedByDiscordId: interaction.user.id,
        submittedByDiscordTag: interaction.user.tag,
        targetDiscordId: interaction.user.id,
        targetDiscordTag: interaction.user.tag,
        payload: {
          command: '/google-test',
          mode: 'submit',
          channelId: interaction.channelId,
          createdAt: new Date().toISOString()
        }
      });

      return interaction.editReply({
        content: [
          '✅ Google test request submitted.',
          `Request ID: ${result.requestId}`,
          `Status: ${result.status}`,
          '',
          'Now check `BotRequests` and `BotActions`, then use poll or complete modes without creating duplicate test requests.'
        ].join('\n')
      });
    } catch (error) {
      console.error('Google test failed:', error);

      return interaction.editReply({ content: `❌ Google test failed: ${error.message}` });
    }
  }
};
=======
const { SlashCommandBuilder } = require('discord.js');
const {
  getGoogleConfig,
  postToGoogle,
  submitBotRequest,
  getPendingBotActions,
  markBotActionComplete
} = require('../utils/googleWebhook');

const SIMPLE_RESULT_ACTION_TYPES = new Set([
  'REGISTER_OFFICER_RESULT',
  'OFFICER_MANAGEMENT_RESULT',
  'OFFICER_STATUS_RESULT',
  'DISCIPLINE_RECORD_RESULT',
  'TRAINING_RECORD_RESULT',
  'GENERIC_REQUEST_RECEIVED'
]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('google-test')
    .setDescription('Tests the Google Apps Script v2 connection.')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('What to test')
        .setRequired(false)
        .addChoices(
          { name: 'Ping Google only', value: 'ping' },
          { name: 'Submit test request', value: 'submit' },
          { name: 'Poll pending bot actions', value: 'poll' },
          { name: 'Complete GOOGLE_TEST_RESULT actions', value: 'complete-test-actions' },
          { name: 'Complete simple result actions', value: 'complete-result-actions' }
        )
    ),

  async execute(interaction) {
    const mode = interaction.options.getString('mode') || 'submit';
    const config = getGoogleConfig();

    if (!config.enabled) {
      return interaction.reply({
        content: 'Google integration is not configured. Add `GOOGLE_SCRIPT_WEBAPP_URL` and `GOOGLE_SCRIPT_SECRET` to the bot environment variables, then restart the bot.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      if (mode === 'ping') {
        const result = await postToGoogle('ping', {
          echo: `Ping from Discord user ${interaction.user.id}`
        });

        return interaction.editReply({
          content: [
            '✅ Google ping succeeded.',
            `Message: ${result.message || 'No message returned.'}`,
            `Version: ${result.version || 'unknown'}`
          ].join('\n')
        });
      }

      if (mode === 'poll') {
        const result = await getPendingBotActions({ guildId: interaction.guildId, limit: 5 });
        const actions = result.actions || [];

        return interaction.editReply({
          content: [
            '✅ Google poll succeeded.',
            `Pending action(s) returned: ${actions.length}`,
            actions.length
              ? actions.map((action) => `- ${action.actionType || action.type} / ${action.actionId || action.id}`).join('\n')
              : 'No pending actions found.',
            '',
            'No actions were completed and no test requests were created.'
          ].join('\n')
        });
      }

      if (mode === 'complete-test-actions' || mode === 'complete-result-actions') {
        const allowedTypes = mode === 'complete-test-actions'
          ? new Set(['GOOGLE_TEST_RESULT'])
          : SIMPLE_RESULT_ACTION_TYPES;
        const result = await getPendingBotActions({ guildId: interaction.guildId, limit: 25 });
        const actions = (result.actions || []).filter((action) => allowedTypes.has(action.actionType || action.type));

        for (const action of actions) {
          await markBotActionComplete(action.actionId || action.id, {
            handledBy: interaction.user.id,
            handledByCommand: `/google-test ${mode}`,
            note: 'Test command completed this pending result action.',
            handledAt: new Date().toISOString()
          });
        }

        return interaction.editReply({
          content: [
            '✅ Google completion succeeded.',
            `Mode: ${mode}`,
            `Completed action(s): ${actions.length}`,
            actions.length
              ? actions.map((action) => `- ${action.actionType || action.type} / ${action.actionId || action.id}`).join('\n')
              : 'No matching pending actions found.',
            '',
            'No test requests were created.'
          ].join('\n')
        });
      }

      const result = await submitBotRequest({
        guildId: interaction.guildId,
        departmentKey: config.departmentKey,
        actionType: 'GOOGLE_TEST',
        submittedByDiscordId: interaction.user.id,
        submittedByDiscordTag: interaction.user.tag,
        targetDiscordId: interaction.user.id,
        targetDiscordTag: interaction.user.tag,
        payload: {
          command: '/google-test',
          mode: 'submit',
          channelId: interaction.channelId,
          createdAt: new Date().toISOString()
        }
      });

      return interaction.editReply({
        content: [
          '✅ Google test request submitted.',
          `Request ID: ${result.requestId}`,
          `Status: ${result.status}`,
          '',
          'Now check `BotRequests` and `BotActions`, then use poll or complete modes without creating duplicate test requests.'
        ].join('\n')
      });
    } catch (error) {
      console.error('Google test failed:', error);

      return interaction.editReply({ content: `❌ Google test failed: ${error.message}` });
    }
  }
};
>>>>>>> theirs
