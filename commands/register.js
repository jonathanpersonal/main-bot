const {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const { getServerConfig } = require('../utils/configUtils');
const { getMemberRank } = require('../utils/rankUtils');
const { getGoogleConfig } = require('../utils/googleWebhook');
const { submitRegistrationEvent } = require('../utils/googleDepartmentEvents');
const {
  buildRegistrationPayload,
  canRegisterOther,
  cleanDisplayName,
  getRankKey,
  getRankName,
  rankRequiresEmail,
  validateRegistrationFields
} = require('../utils/registrationUtils');

const CUSTOM_ID_PREFIX = 'register:modal';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register an officer in the Google Department DB.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('self')
        .setDescription('Register yourself in the department database.')
    )
    .addSubcommandGroup((group) =>
      group
        .setName('other')
        .setDescription('Register another officer in the department database.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('officer')
            .setDescription('Register another officer.')
            .addUserOption((option) =>
              option
                .setName('officer')
                .setDescription('The officer to register.')
                .setRequired(true)
            )
        )
    ),

  async execute(interaction) {
    const serverConfig = getServerConfig(interaction.guildId);
    const registrationConfig = serverConfig.registration || {};

    if (registrationConfig.enabled === false) {
      return interaction.reply({
        content: 'Officer registration is currently disabled for this server.',
        flags: MessageFlags.Ephemeral
      });
    }

    const googleConfig = getGoogleConfig();

    if (!googleConfig.enabled) {
      return interaction.reply({
        content: 'Google integration is not configured. Add `GOOGLE_SCRIPT_WEBAPP_URL` and `GOOGLE_SCRIPT_SECRET`, then restart the bot.',
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();
    const mode = subcommandGroup === 'other' && subcommand === 'officer' ? 'OTHER' : 'SELF';

    if (mode === 'OTHER' && !canRegisterOther(interaction.member, serverConfig)) {
      return interaction.reply({
        content: 'You do not have permission to register other officers.',
        flags: MessageFlags.Ephemeral
      });
    }

    const targetUser = mode === 'OTHER'
      ? interaction.options.getUser('officer', true)
      : interaction.user;
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({
        content: 'That officer could not be found in this server.',
        flags: MessageFlags.Ephemeral
      });
    }

    const detectedRank = getMemberRank(targetMember, serverConfig);

    if (!detectedRank) {
      return interaction.reply({
        content: `${targetUser} does not have a configured rank role, so registration cannot continue.`,
        flags: MessageFlags.Ephemeral
      });
    }

    const emailRequired = rankRequiresEmail(detectedRank, serverConfig);

    return interaction.showModal(buildRegistrationModal({
      mode,
      targetMember,
      emailRequired
    }));
  },

  async handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith(`${CUSTOM_ID_PREFIX}:`)) return false;

    const [, , mode, targetDiscordId] = interaction.customId.split(':');
    const serverConfig = getServerConfig(interaction.guildId);
    const registrationConfig = serverConfig.registration || {};
    const googleConfig = getGoogleConfig();

    if (!googleConfig.enabled) {
      await interaction.reply({
        content: 'Google integration is not configured. Add `GOOGLE_SCRIPT_WEBAPP_URL` and `GOOGLE_SCRIPT_SECRET`, then restart the bot.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (mode === 'OTHER' && !canRegisterOther(interaction.member, serverConfig)) {
      await interaction.reply({
        content: 'You do not have permission to register other officers.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    const targetMember = await interaction.guild.members.fetch(targetDiscordId).catch(() => null);

    if (!targetMember) {
      await interaction.reply({
        content: 'That officer could not be found in this server.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    const detectedRank = getMemberRank(targetMember, serverConfig);

    if (!detectedRank) {
      await interaction.reply({
        content: `${targetMember} does not have a configured rank role, so registration cannot continue.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    const emailRequired = rankRequiresEmail(detectedRank, serverConfig);
    const joinDate = interaction.fields.getTextInputValue('joinDate').trim();
    const steam64 = interaction.fields.getTextInputValue('steam64').trim();
    const email = interaction.fields.getTextInputValue('email').trim();
    const errors = validateRegistrationFields({ joinDate, steam64, email, emailRequired });

    if (errors.length > 0) {
      await interaction.reply({
        content: ['Registration could not be submitted:', ...errors.map((error) => `- ${error}`)].join('\n'),
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const cleanName = cleanDisplayName(
        targetMember.displayName,
        registrationConfig.callsignNamePatterns || []
      );
      const payload = buildRegistrationPayload({
        interaction,
        targetMember,
        mode,
        cleanName,
        detectedRank,
        joinDate,
        steam64,
        email,
        emailRequired,
        departmentKey: googleConfig.departmentKey
      });
      const result = await submitRegistrationEvent({
        interaction,
        target: targetMember,
        targetDiscordId: targetMember.id,
        targetDiscordTag: targetMember.user.tag,
        targetName: cleanName,
        newRank: getRankName(detectedRank),
        payload: payload.payload,
        departmentKey: googleConfig.departmentKey,
        requestFields: {
          discordUserId: targetMember.id,
          discordId: targetMember.id,
          upsertByDiscordId: true
        }
      });

      await interaction.editReply({
        content: [
          'Officer registration submitted to Google.',
          `Officer: ${cleanName}`,
          `Discord ID: ${targetMember.id}`,
          `Rank: ${getRankName(detectedRank)}`,
          `Rank key: ${getRankKey(detectedRank)}`,
          result.requestId ? `Request ID: ${result.requestId}` : null,
          result.resultId ? `Result ID: ${result.resultId}` : null,
          result.status ? `Status: ${result.status}` : null,
          '',
          'Google should upsert this officer by Discord ID, so rerunning registration updates the same row.'
        ].filter(Boolean).join('\n')
      });
    } catch (error) {
      console.error('Officer registration failed:', error);

      await interaction.editReply({
        content: `Officer registration failed: ${error.message}`
      });
    }

    return true;
  }
};

function buildRegistrationModal({ mode, targetMember, emailRequired }) {
  const modal = new ModalBuilder()
    .setCustomId(`${CUSTOM_ID_PREFIX}:${mode}:${targetMember.id}`)
    .setTitle(mode === 'OTHER' ? 'Register Officer' : 'Register Yourself');

  const joinDateInput = new TextInputBuilder()
    .setCustomId('joinDate')
    .setLabel('Join Date')
    .setPlaceholder('Example: 2026-06-17')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const steam64Input = new TextInputBuilder()
    .setCustomId('steam64')
    .setLabel('Steam 64')
    .setPlaceholder('Numeric Steam 64 ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const emailInput = new TextInputBuilder()
    .setCustomId('email')
    .setLabel(emailRequired ? 'Email' : 'Email (optional)')
    .setPlaceholder(emailRequired ? 'Required for this rank' : 'Optional')
    .setStyle(TextInputStyle.Short)
    .setRequired(emailRequired);

  modal.addComponents(
    new ActionRowBuilder().addComponents(joinDateInput),
    new ActionRowBuilder().addComponents(steam64Input),
    new ActionRowBuilder().addComponents(emailInput)
  );

  return modal;
}
