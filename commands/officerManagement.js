const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const { getServerConfig } = require('../utils/configUtils');

const {
  getMemberRank,
  getNextHigherRanks,
  getNextLowerRanks,
  getRankByName
} = require('../utils/rankUtils');

const {
  changeMemberRank,
  validateBotCanManageRankChange
} = require('../utils/roleUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('officer-management')
    .setDescription('Manage department officer actions.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('The officer management action to perform.')
        .setRequired(true)
        .addChoices(
          {
            name: 'Check Rank',
            value: 'check_rank'
          },
          {
            name: 'Promote',
            value: 'promote'
          },
          {
            name: 'Demote',
            value: 'demote'
          }
        )
    )
    .addUserOption((option) =>
      option
        .setName('officer')
        .setDescription('The officer to manage.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('new_rank')
        .setDescription('The new configured rank name. Example: Officer')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for this officer management action.')
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const serverConfig = getServerConfig();
    const action = interaction.options.getString('action');
    const officerUser = interaction.options.getUser('officer');
    const focusedValue = interaction.options.getFocused().toLowerCase();

    let availableRanks = Array.isArray(serverConfig.ranks)
      ? [...serverConfig.ranks]
      : [];

    if (interaction.guild && officerUser && ['promote', 'demote'].includes(action)) {
      try {
        const officerMember = await interaction.guild.members.fetch(officerUser.id);
        const currentRank = getMemberRank(officerMember, serverConfig);

        if (currentRank) {
          availableRanks = action === 'promote'
            ? getNextHigherRanks(currentRank, serverConfig)
            : getNextLowerRanks(currentRank, serverConfig);
        }
      } catch (error) {
        console.error('Could not fetch officer for rank autocomplete:', error);
      }
    }

    const choices = availableRanks
      .filter((rank) => rank.name.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map((rank) => ({
        name: `${rank.name} (Level ${rank.level})`,
        value: rank.name
      }));

    return interaction.respond(choices);
  },

  async execute(interaction) {
    const serverConfig = getServerConfig();

    const action = interaction.options.getString('action');
    const officerUser = interaction.options.getUser('officer');
    const newRankName = interaction.options.getString('new_rank');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command can only be used inside a Discord server.',
        ephemeral: true
      });
    }

    const officerMember = await interaction.guild.members.fetch(officerUser.id);
    const currentRank = getMemberRank(officerMember, serverConfig);

    if (!currentRank) {
      return interaction.reply({
        content: [
          `No configured rank was found for ${officerUser}.`,
          '',
          'This usually means one of these is true:',
          '- The officer does not have a configured rank role.',
          '- The role ID in `config/serverConfig.js` is wrong.',
          '- The rank exists in Discord but has not been added to the config yet.'
        ].join('\n'),
        ephemeral: true
      });
    }

    if (action === 'check_rank') {
      return interaction.reply({
        content: [
          `Officer: ${officerUser}`,
          `Current Rank: **${currentRank.name}**`,
          `Rank Level: **${currentRank.level}**`,
          `Rank Role ID: \`${currentRank.rankRoleId}\``,
          `Permission Role ID: \`${currentRank.permissionRoleId}\``
        ].join('\n'),
        ephemeral: true
      });
    }

    if (action === 'promote') {
      return handlePromotionOrDemotion({
        interaction,
        serverConfig,
        officerUser,
        officerMember,
        currentRank,
        newRankName,
        reason,
        actionType: 'promote'
      });
    }

    if (action === 'demote') {
      return handlePromotionOrDemotion({
        interaction,
        serverConfig,
        officerUser,
        officerMember,
        currentRank,
        newRankName,
        reason,
        actionType: 'demote'
      });
    }

    return interaction.reply({
      content: 'That officer management action is not available yet.',
      ephemeral: true
    });
  }
};

async function handlePromotionOrDemotion({
  interaction,
  serverConfig,
  officerUser,
  officerMember,
  currentRank,
  newRankName,
  reason,
  actionType
}) {
  const isPromotion = actionType === 'promote';
  const actionLabel = isPromotion ? 'Promotion' : 'Demotion';
  const actionPastTense = isPromotion ? 'promoted' : 'demoted';

  const availableRanks = isPromotion
    ? getNextHigherRanks(currentRank, serverConfig)
    : getNextLowerRanks(currentRank, serverConfig);

  if (availableRanks.length === 0) {
    return interaction.reply({
      content: [
        `Officer: ${officerUser}`,
        `Current Rank: **${currentRank.name}**`,
        '',
        isPromotion
          ? 'This officer is already at the highest configured rank.'
          : 'This officer is already at the lowest configured rank.'
      ].join('\n'),
      ephemeral: true
    });
  }

  if (!newRankName) {
    const rankList = availableRanks
      .map((rank) => `- **${rank.name}** — Level ${rank.level}`)
      .join('\n');

    return interaction.reply({
      content: [
        `${actionLabel} Preview for ${officerUser}`,
        '',
        `Current Rank: **${currentRank.name}**`,
        `Current Level: **${currentRank.level}**`,
        '',
        isPromotion ? 'Available Promotion Ranks:' : 'Available Demotion Ranks:',
        rankList,
        '',
        'No roles were changed.',
        '',
        `To actually ${actionType} this officer, run the command again and fill in the \`new_rank\` option.`
      ].join('\n'),
      ephemeral: true
    });
  }

  const targetRank = getRankByName(newRankName, serverConfig);

  if (!targetRank) {
    const configuredRanks = serverConfig.ranks
      .map((rank) => `- ${rank.name}`)
      .join('\n');

    return interaction.reply({
      content: [
        `I could not find a configured rank named **${newRankName}**.`,
        '',
        'Configured ranks are:',
        configuredRanks
      ].join('\n'),
      ephemeral: true
    });
  }

  if (isPromotion && targetRank.level <= currentRank.level) {
    return interaction.reply({
      content: [
        `Invalid promotion target.`,
        '',
        `Current Rank: **${currentRank.name}** — Level ${currentRank.level}`,
        `Requested Rank: **${targetRank.name}** — Level ${targetRank.level}`,
        '',
        'For a promotion, the new rank must be higher than the current rank.'
      ].join('\n'),
      ephemeral: true
    });
  }

  if (!isPromotion && targetRank.level >= currentRank.level) {
    return interaction.reply({
      content: [
        `Invalid demotion target.`,
        '',
        `Current Rank: **${currentRank.name}** — Level ${currentRank.level}`,
        `Requested Rank: **${targetRank.name}** — Level ${targetRank.level}`,
        '',
        'For a demotion, the new rank must be lower than the current rank.'
      ].join('\n'),
      ephemeral: true
    });
  }

  const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();

  const roleValidation = validateBotCanManageRankChange(
    interaction.guild,
    botMember,
    currentRank,
    targetRank
  );

  if (!roleValidation.canManage) {
    return interaction.reply({
      content: [
        'The bot cannot safely complete this rank change yet.',
        '',
        'Fix these first:',
        ...roleValidation.problems.map((problem) => `- ${problem}`),
        '',
        'Most likely fix: move the bot role above all rank and permission roles in Discord Server Settings.'
      ].join('\n'),
      ephemeral: true
    });
  }

  const confirmButtonId = `confirm_rank_change_${interaction.id}`;
  const cancelButtonId = `cancel_rank_change_${interaction.id}`;

  const confirmationRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmButtonId)
      .setLabel(`Confirm ${actionLabel}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(cancelButtonId)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  const response = await interaction.reply({
    content: [
      `Please confirm this ${actionLabel.toLowerCase()}:`,
      '',
      `Officer: ${officerUser}`,
      `Current Rank: **${currentRank.name}** — Level ${currentRank.level}`,
      `New Rank: **${targetRank.name}** — Level ${targetRank.level}`,
      `Reason: ${reason}`,
      '',
      'No roles have been changed yet.'
    ].join('\n'),
    components: [confirmationRow],
    ephemeral: true,
    fetchReply: true
  });

  try {
    const confirmation = await response.awaitMessageComponent({
      filter: (buttonInteraction) => {
        return (
          buttonInteraction.user.id === interaction.user.id &&
          [confirmButtonId, cancelButtonId].includes(buttonInteraction.customId)
        );
      },
      time: 60000
    });

    if (confirmation.customId === cancelButtonId) {
      await confirmation.deferUpdate();

      return interaction.editReply({
        content: `${actionLabel} cancelled. No roles were changed.`,
        components: []
      });
    }

    await confirmation.deferUpdate();

    const auditReason = `${actionLabel}: ${officerUser.tag} from ${currentRank.name} to ${targetRank.name}. Reason: ${reason}`;

    const result = await changeMemberRank(
      officerMember,
      currentRank,
      targetRank,
      auditReason
    );

    return interaction.editReply({
      content: [
        `${officerUser} was successfully ${actionPastTense}.`,
        '',
        `Old Rank: **${currentRank.name}**`,
        `New Rank: **${targetRank.name}**`,
        `Reason: ${reason}`,
        '',
        `Removed Roles: ${result.removedRoles.length > 0 ? result.removedRoles.join(', ') : 'None'}`,
        `Added Roles: ${result.addedRoles.length > 0 ? result.addedRoles.join(', ') : 'None'}`
      ].join('\n'),
      components: []
    });
  } catch (error) {
    console.error(`${actionLabel} confirmation failed:`, error);

    return interaction.editReply({
      content: `${actionLabel} timed out or failed. No roles were changed unless the console shows a role update error.`,
      components: []
    });
  }
}
