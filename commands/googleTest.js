const { SlashCommandBuilder } = require('discord.js');
const {
  getGoogleConfig,
  postToGoogle,
  submitBotRequest,
  getPendingBotActions,
  markBotActionComplete
} = require('../utils/googleWebhook');

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
          { name: 'Poll pending bot actions', value: 'poll' }
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
        const result = await getPendingBotActions({
          guildId: interaction.guildId,
          limit: 5
        });

        const actions = result.actions || [];

        for (const action of actions) {
          await markBotActionComplete(action.actionId, {
            handledBy: interaction.user.id,
            handledByCommand: '/google-test poll',
            note: 'Test command marked this action complete.'
          });
        }

        return interaction.editReply({
          content: [
            '✅ Google poll succeeded.',
            `Pending action(s) returned: ${actions.length}`,
            actions.length
              ? actions.map((action) => `- ${action.actionType} / ${action.actionId}`).join('\n')
              : 'No pending actions found.'
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
          'Now check the Google Sheet tabs:',
          '- `BotRequests` should have the request.',
          '- `BotActions` should have a pending `LOG_MESSAGE` action.',
          '',
          'Then run `/google-test mode: Poll pending bot actions` to prove the bot can read and complete pending actions.'
        ].join('\n')
      });
    } catch (error) {
      console.error('Google test failed:', error);

      return interaction.editReply({
        content: `❌ Google test failed: ${error.message}`
      });
    }
  }
};
