const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { getServerConfig } = require('../utils/configUtils');
const {
  sendOfficerActionLog,
  sendOfficerRankChangeLog
} = require('../utils/logUtils');

const {
  getMemberRank,
  getNextHigherRanks,
  getNextLowerRanks,
  getRankByName
} = require('../utils/rankUtils');

const {
  addConfiguredRole,
  changeMemberRank,
  removeConfiguredDepartmentRoles,
  validateBotCanManageRankChange,
  validateConfiguredRoleCanBeAdded
} = require('../utils/roleUtils');

const pendingOfficerActions = new Map();

const OFFICER_ACTIONS_WITH_MODALS = ['termination', 'resignation', 'coaching', 'strike'];

const ACTION_LABELS = {
  termination: 'Termination',
  resignation: 'Resignation',
  coaching: 'Coaching',
  strike: 'Strike'
};

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
          },
          {
            name: 'Termination',
            value: 'termination'
          },
          {
            name: 'Resignation',
            value: 'resignation'
          },
          {
            name: 'Coaching',
            value: 'coaching'
          },
          {
            name: 'Strike',
            value: 'strike'
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
    .addIntegerOption((option) =>
      option
        .setName('strike_level')
        .setDescription('Required for Strike actions.')
        .setRequired(false)
        .addChoices(
          {
            name: '1',
            value: 1
          },
          {
            name: '2',
            value: 2
          },
          {
            name: '3',
            value: 3
          }
        )
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
    const strikeLevel = interaction.options.getInteger('strike_level');

    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command can only be used inside a Discord server.',
        ephemeral: true
      });
    }

    const officerMember = await interaction.guild.members.fetch(officerUser.id);
    const currentRank = getMemberRank(officerMember, serverConfig);

    if (action === 'check_rank') {
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

    if (action === 'promote' || action === 'demote') {
      if (!currentRank) {
        return interaction.reply({
          content: [
            `No configured rank was found for ${officerUser}.`,
            '',
            'Promote and Demote require the officer to already have a configured rank role.'
          ].join('\n'),
          ephemeral: true
        });
      }

      return handlePromotionOrDemotion({
        interaction,
        serverConfig,
        officerUser,
        officerMember,
        currentRank,
        newRankName,
        reason,
        actionType: action
      });
    }

    if (action === 'strike' && !strikeLevel) {
      return interaction.reply({
        content: 'Strike requires `strike_level`. Please choose strike level 1, 2, or 3 and run the command again.',
        ephemeral: true
      });
    }

    if (OFFICER_ACTIONS_WITH_MODALS.includes(action)) {
      return showOfficerActionModal({
        interaction,
        action,
        officerUser,
        strikeLevel
      });
    }

    return interaction.reply({
      content: 'That officer management action is not available yet.',
      ephemeral: true
    });
  },

  async handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith('officerMgmt:modal:')) return false;

    const stateKey = interaction.customId.replace('officerMgmt:modal:', '');
    const state = pendingOfficerActions.get(stateKey);

    if (!state || state.staffUserId !== interaction.user.id) {
      await interaction.reply({
        content: 'This officer management form expired or does not belong to you. Please run the command again.',
        ephemeral: true
      });
      return true;
    }

    state.details = getDetailsFromModal(interaction, state.action);

    if (state.action === 'termination' || state.action === 'resignation') {
      await interaction.reply({
        content: [
          `${ACTION_LABELS[state.action]} details saved for <@${state.officerUserId}>.`,
          '',
          'Please choose blacklist and reapply options before confirming.'
        ].join('\n'),
        components: buildBlacklistReapplyRows(stateKey, state),
        ephemeral: true
      });
      return true;
    }

    await interaction.reply({
      content: buildConfirmationMessage(state),
      components: [buildConfirmationRow(stateKey, state.action)],
      ephemeral: true
    });
    return true;
  },

  async handleSelectMenu(interaction) {
    if (!interaction.customId.startsWith('officerMgmt:select:')) return false;

    const [, , stateKey, selectType] = interaction.customId.split(':');
    const state = pendingOfficerActions.get(stateKey);

    if (!state || state.staffUserId !== interaction.user.id) {
      await interaction.reply({
        content: 'This officer management selection expired or does not belong to you. Please run the command again.',
        ephemeral: true
      });
      return true;
    }

    const selectedValue = interaction.values[0];

    if (selectType === 'blacklisted') {
      state.details.blacklisted = selectedValue === 'yes';
    }

    if (selectType === 'canReapply') {
      state.details.canReapply = selectedValue === 'yes';
    }

    await interaction.update({
      content: buildConfirmationMessage(state),
      components: [
        ...buildBlacklistReapplyRows(stateKey, state),
        buildConfirmationRow(stateKey, state.action)
      ]
    });
    return true;
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith('officerMgmt:button:')) return false;

    const [, , buttonAction, stateKey] = interaction.customId.split(':');
    const state = pendingOfficerActions.get(stateKey);

    if (!state || state.staffUserId !== interaction.user.id) {
      await interaction.reply({
        content: 'This officer management confirmation expired or does not belong to you. Please run the command again.',
        ephemeral: true
      });
      return true;
    }

    if (buttonAction === 'cancel') {
      pendingOfficerActions.delete(stateKey);
      await interaction.update({
        content: `${ACTION_LABELS[state.action]} cancelled. No roles were changed, no DMs were sent, and no staff log was created.`,
        components: []
      });
      return true;
    }

    if (buttonAction === 'confirm') {
      await interaction.deferUpdate();
      await confirmOfficerAction({ interaction, state, stateKey });
      return true;
    }

    return false;
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

    await sendOfficerRankChangeLog({
      guild: interaction.guild,
      serverConfig,
      actionType,
      officerUser,
      staffUser: interaction.user,
      oldRank: currentRank,
      newRank: targetRank,
      changedAt: new Date()
    });

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

async function showOfficerActionModal({ interaction, action, officerUser, strikeLevel }) {
  const stateKey = `om${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  pendingOfficerActions.set(stateKey, {
    action,
    staffUserId: interaction.user.id,
    officerUserId: officerUser.id,
    strikeLevel,
    createdAt: Date.now(),
    details: {}
  });

  const modal = new ModalBuilder()
    .setCustomId(`officerMgmt:modal:${stateKey}`)
    .setTitle(`${ACTION_LABELS[action]} Details`);

  getModalTextInputs(action).forEach((input) => {
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return interaction.showModal(modal);
}

function getModalTextInputs(action) {
  if (action === 'termination') {
    return [
      createParagraphInput('reason', 'Reason for termination', true),
      createParagraphInput('evidence', 'Evidence', false),
      createParagraphInput('comments', 'Additional comments', false)
    ];
  }

  if (action === 'resignation') {
    return [
      createParagraphInput('reason', 'Reason for resignation', true),
      createParagraphInput('evidence', 'Evidence or documentation', false),
      createParagraphInput('comments', 'Additional comments', false)
    ];
  }

  if (action === 'coaching') {
    return [
      createParagraphInput('reason', 'Reason for coaching', true),
      createParagraphInput('discussion', 'What was discussed', true),
      createParagraphInput('nextSteps', 'Next steps/notes', false)
    ];
  }

  return [
    createParagraphInput('reason', 'Reason for strike', true),
    createParagraphInput('evidence', 'Evidence', false),
    createParagraphInput('nextSteps', 'Steps to prevent issue in the future', false)
  ];
}

function createParagraphInput(customId, label, required) {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(required)
    .setMaxLength(1000);
}

function getDetailsFromModal(interaction, action) {
  const details = {
    reason: interaction.fields.getTextInputValue('reason') || 'No reason provided.'
  };

  if (action === 'termination' || action === 'resignation') {
    details.evidence = interaction.fields.getTextInputValue('evidence') || 'None provided.';
    details.comments = interaction.fields.getTextInputValue('comments') || 'None provided.';
    details.blacklisted = false;
    details.canReapply = false;
  }

  if (action === 'coaching') {
    details.discussion = interaction.fields.getTextInputValue('discussion') || 'None provided.';
    details.nextSteps = interaction.fields.getTextInputValue('nextSteps') || 'None provided.';
  }

  if (action === 'strike') {
    details.evidence = interaction.fields.getTextInputValue('evidence') || 'None provided.';
    details.nextSteps = interaction.fields.getTextInputValue('nextSteps') || 'None provided.';
  }

  return details;
}

function buildBlacklistReapplyRows(stateKey, state) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`officerMgmt:select:${stateKey}:blacklisted`)
        .setPlaceholder(`Blacklisted: ${state.details.blacklisted ? 'Yes' : 'No'}`)
        .addOptions(
          {
            label: 'Blacklisted: No',
            value: 'no',
            default: !state.details.blacklisted
          },
          {
            label: 'Blacklisted: Yes',
            value: 'yes',
            default: state.details.blacklisted
          }
        )
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`officerMgmt:select:${stateKey}:canReapply`)
        .setPlaceholder(`Can reapply: ${state.details.canReapply ? 'Yes' : 'No'}`)
        .addOptions(
          {
            label: 'Can reapply: No',
            value: 'no',
            default: !state.details.canReapply
          },
          {
            label: 'Can reapply: Yes',
            value: 'yes',
            default: state.details.canReapply
          }
        )
    )
  ];
}

function buildConfirmationRow(stateKey, action) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`officerMgmt:button:confirm:${stateKey}`)
      .setLabel(`Confirm ${ACTION_LABELS[action]}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`officerMgmt:button:cancel:${stateKey}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildConfirmationMessage(state) {
  const lines = [
    `Please confirm this ${ACTION_LABELS[state.action].toLowerCase()}:`,
    '',
    `Officer: <@${state.officerUserId}>`
  ];

  if (state.action === 'strike') {
    lines.push(`Strike Level: **${state.strikeLevel}**`);
  }

  lines.push(`Reason: ${state.details.reason}`);

  if (state.details.evidence) {
    lines.push(`Evidence: ${state.details.evidence}`);
  }

  if (state.details.comments) {
    lines.push(`Additional comments: ${state.details.comments}`);
  }

  if (state.action === 'termination' || state.action === 'resignation') {
    lines.push(`Blacklisted: **${state.details.blacklisted ? 'Yes' : 'No'}**`);
    lines.push(`Can reapply: **${state.details.canReapply ? 'Yes' : 'No'}**`);
  }

  if (state.details.discussion) {
    lines.push(`What was discussed: ${state.details.discussion}`);
  }

  if (state.details.nextSteps) {
    lines.push(`Next steps/notes: ${state.details.nextSteps}`);
  }

  lines.push('', 'No changes have been made yet.');

  return lines.join('\n');
}

async function confirmOfficerAction({ interaction, state, stateKey }) {
  const serverConfig = getServerConfig();
  const officerUser = await interaction.client.users.fetch(state.officerUserId);
  const officerMember = await interaction.guild.members.fetch(state.officerUserId);
  const changedAt = new Date();
  let roleResult = null;
  let previousRoleResult = null;
  let dmSent = false;
  let appealButtonIncluded = false;

  if (state.action === 'termination' || state.action === 'resignation') {
    const auditReason = `${ACTION_LABELS[state.action]} processed by ${interaction.user.tag}. Reason: ${state.details.reason}`;

    const previousOfficerRoleId = serverConfig?.officerManagement?.previousOfficerRoleId
      || serverConfig?.roles?.previousOfficerRoleId;
    const previousRoleValidation = await validateConfiguredRoleCanBeAdded(officerMember, previousOfficerRoleId);

    if (!previousRoleValidation.canAdd) {
      return interaction.editReply({
        content: [
          `${ACTION_LABELS[state.action]} could not be completed because the previous officer role cannot be added.`,
          '',
          `- ${previousRoleValidation.problem}`,
          '',
          'Most likely fix: configure `officerManagement.previousOfficerRoleId` and move the bot role above that role.'
        ].join('\n'),
        components: []
      });
    }

    roleResult = await removeConfiguredDepartmentRoles(officerMember, serverConfig, auditReason);

    if (roleResult.errors.length > 0) {
      return interaction.editReply({
        content: [
          `${ACTION_LABELS[state.action]} could not be completed because the bot cannot manage one or more configured department roles.`,
          '',
          'Fix these first:',
          ...roleResult.errors.map((error) => `- ${error}`),
          '',
          'Most likely fix: move the bot role above all configured department roles in Discord Server Settings.'
        ].join('\n'),
        components: []
      });
    }

    previousRoleResult = await addConfiguredRole(officerMember, previousOfficerRoleId, auditReason);

    if (previousRoleResult.error) {
      return interaction.editReply({
        content: [
          `${ACTION_LABELS[state.action]} could not be completed because the previous officer role could not be added.`,
          '',
          `- ${previousRoleResult.error}`,
          '',
          'Most likely fix: configure `officerManagement.previousOfficerRoleId` and move the bot role above that role.'
        ].join('\n'),
        components: []
      });
    }

    const dmResult = await trySendOfficerDm({
      officerUser,
      serverConfig,
      action: state.action,
      details: state.details,
      strikeLevel: state.strikeLevel
    });
    dmSent = dmResult.sent;
    appealButtonIncluded = dmResult.appealButtonIncluded;
  }

  if (state.action === 'strike') {
    const dmResult = await trySendOfficerDm({
      officerUser,
      serverConfig,
      action: state.action,
      details: state.details,
      strikeLevel: state.strikeLevel
    });
    dmSent = dmResult.sent;
    appealButtonIncluded = dmResult.appealButtonIncluded;
  }

  await sendOfficerActionLog({
    guild: interaction.guild,
    serverConfig,
    actionType: state.action,
    officerUser,
    staffUser: interaction.user,
    details: {
      ...state.details,
      strikeLevel: state.strikeLevel
    },
    dmSent: state.action === 'coaching' ? undefined : dmSent,
    appealButtonIncluded,
    changedAt
  });

  // TODO: Later send this officer management action to Google webhook.

  pendingOfficerActions.delete(stateKey);

  return interaction.editReply({
    content: buildSuccessMessage({
      state,
      officerUser,
      roleResult,
      previousRoleResult,
      dmSent,
      appealButtonIncluded
    }),
    components: []
  });
}

async function trySendOfficerDm({ officerUser, serverConfig, action, details, strikeLevel }) {
  const template = serverConfig?.officerManagement?.dmMessages?.[action];

  if (!template) {
    return {
      sent: false,
      appealButtonIncluded: false
    };
  }

  const appealButtonRow = buildAppealButtonRow(serverConfig, action);
  const messageOptions = {
    content: formatDmMessage(template, buildDmPlaceholderValues({
      officerUser,
      serverConfig,
      details,
      strikeLevel
    }))
  };

  if (appealButtonRow) {
    messageOptions.components = [appealButtonRow];
  }

  try {
    await officerUser.send(messageOptions);
    return {
      sent: true,
      appealButtonIncluded: Boolean(appealButtonRow)
    };
  } catch (error) {
    console.warn(`Could not DM officer for ${action}:`, error);
    return {
      sent: false,
      appealButtonIncluded: false
    };
  }
}

function formatDmMessage(template, values) {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key) => values[key] ?? match);
}

function buildDmPlaceholderValues({ officerUser, serverConfig, details, strikeLevel }) {
  const officerManagementConfig = serverConfig?.officerManagement || {};
  const departmentName = officerManagementConfig.departmentName
    || serverConfig?.departmentName
    || 'the department';
  const reapplyWaitPeriod = officerManagementConfig.reapplyWaitPeriod || 'the configured wait period';
  const canReapply = details.canReapply ? 'Yes' : 'No';
  const blacklisted = details.blacklisted ? 'Yes' : 'No';

  return {
    officerName: officerUser.globalName || officerUser.username || officerUser.tag || String(officerUser.id),
    departmentName,
    commandTeamName: officerManagementConfig.commandTeamName || `${departmentName} Command Team`,
    reason: details.reason || 'No reason provided.',
    canReapply,
    blacklisted,
    reapplyWaitPeriod,
    appealWindow: officerManagementConfig.appealWindow || 'the configured appeal window',
    strikeLevel: strikeLevel || '',
    preventionSteps: details.nextSteps || 'None provided.',
    reapplyInstructions: buildReapplyInstructions({
      canReapply: details.canReapply,
      blacklisted: details.blacklisted,
      reapplyWaitPeriod
    })
  };
}

function buildReapplyInstructions({ canReapply, blacklisted, reapplyWaitPeriod }) {
  if (canReapply && !blacklisted) {
    return `Please note that you must wait ${reapplyWaitPeriod} before you are permitted to reapply.`;
  }

  if (canReapply && blacklisted) {
    return `Please note that you must wait ${reapplyWaitPeriod} before you are permitted to reapply. Because you are currently blacklisted, you must successfully appeal your blacklist before applying again.`;
  }

  if (!canReapply && !blacklisted) {
    return 'At this time, you are not permitted to reapply unless this decision is changed through the appeal process.';
  }

  return 'At this time, you are not permitted to reapply. Because you are currently blacklisted, you must successfully appeal your blacklist before any future application would be considered.';
}

function buildAppealButtonRow(serverConfig, action) {
  if (!['termination', 'strike'].includes(action)) return null;

  const appealButtonConfig = serverConfig?.officerManagement?.appealButton;

  if (!appealButtonConfig?.enabled || !isConfiguredLinkUrl(appealButtonConfig.url)) {
    return null;
  }

  try {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(appealButtonConfig.label || 'Appeal Decision')
        .setStyle(ButtonStyle.Link)
        .setURL(appealButtonConfig.url)
    );
  } catch (error) {
    console.warn('Could not build officer management appeal button:', error);
    return null;
  }
}

function isConfiguredLinkUrl(url) {
  return (
    typeof url === 'string' &&
    /^https?:\/\//i.test(url) &&
    !url.startsWith('PUT_') &&
    !url.startsWith('PASTE_')
  );
}

function buildSuccessMessage({ state, officerUser, roleResult, previousRoleResult, dmSent, appealButtonIncluded }) {
  const lines = [
    `${ACTION_LABELS[state.action]} completed for ${officerUser}.`,
    '',
    `Reason: ${state.details.reason}`
  ];

  if (state.action === 'termination' || state.action === 'resignation') {
    lines.push(
      `Removed Department Roles: ${roleResult.removedRoleNames.length > 0 ? roleResult.removedRoleNames.join(', ') : 'None'}`,
      `Previous Officer Role Added: ${previousRoleResult.added ? previousRoleResult.roleName : 'No'}`,
      `DM sent: ${dmSent ? 'Yes' : 'No'}`
    );

    if (state.action === 'termination') {
      lines.push(`Appeal button included: ${appealButtonIncluded ? 'Yes' : 'No'}`);
    }
  }

  if (state.action === 'strike') {
    lines.push(
      `Strike Level: ${state.strikeLevel}`,
      `DM sent: ${dmSent ? 'Yes' : 'No'}`,
      `Appeal button included: ${appealButtonIncluded ? 'Yes' : 'No'}`
    );
  }

  if (state.action === 'coaching') {
    lines.push('No roles were changed and no DM was sent.');
  }

  lines.push('Staff log was attempted.');

  return lines.join('\n');
}
