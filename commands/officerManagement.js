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
const { buildAppealStartButtonRow } = require('../utils/appealUtils');
const { safeSubmitDepartmentEvent } = require('../utils/googleDepartmentEvents');
const { getRankKey, getRankName } = require('../utils/registrationUtils');
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
  promote: 'Promotion',
  demote: 'Demotion',
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
    ),

  async execute(interaction) {
    const serverConfig = getServerConfig();

    const action = interaction.options.getString('action');
    const officerUser = interaction.options.getUser('officer');

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
        actionType: action
      });
    }

    if (action === 'strike') {
      return showStrikeLevelSelect({
        interaction,
        officerUser
      });
    }

    if (OFFICER_ACTIONS_WITH_MODALS.includes(action)) {
      return showOfficerActionModal({
        interaction,
        action,
        officerUser
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

    if (selectType === 'rank') {
      const targetRank = getRankByName(selectedValue, getServerConfig());

      if (!targetRank) {
        await interaction.update({
          content: 'That rank is no longer configured. Please run the command again.',
          components: []
        });
        pendingOfficerActions.delete(stateKey);
        return true;
      }

      state.targetRankName = targetRank.name;
      state.targetRankLevel = targetRank.level;

      await interaction.update({
        content: buildRankChangeConfirmationMessage(state),
        components: [buildConfirmationRow(stateKey, state.action)]
      });
      return true;
    }

    if (selectType === 'strikeLevel') {
      state.strikeLevel = Number(selectedValue);
      return showOfficerActionModal({
        interaction,
        action: state.action,
        officerUser: { id: state.officerUserId },
        stateKey
      });
    }

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
  },

  issueOfficerStrike
};

async function handlePromotionOrDemotion({
  interaction,
  serverConfig,
  officerUser,
  currentRank,
  actionType
}) {
  const isPromotion = actionType === 'promote';
  const actionLabel = isPromotion ? 'Promotion' : 'Demotion';

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

  const stateKey = createStateKey();
  pendingOfficerActions.set(stateKey, {
    action: actionType,
    staffUserId: interaction.user.id,
    officerUserId: officerUser.id,
    currentRankName: currentRank.name,
    currentRankLevel: currentRank.level,
    createdAt: Date.now()
  });

  return interaction.reply({
    content: [
      `${actionLabel} rank selection for ${officerUser}`,
      `Officer: ${officerUser}`,
      `Current Rank: **${currentRank.name}** — Level ${currentRank.level}`,
      '',
      isPromotion ? 'Choose a higher rank.' : 'Choose a lower rank.',
      '',
      'No roles have been changed.'
    ].join('\n'),
    components: [buildRankSelectRow(stateKey, availableRanks)],
    ephemeral: true
  });
}

async function showStrikeLevelSelect({ interaction, officerUser }) {
  const stateKey = createStateKey();

  pendingOfficerActions.set(stateKey, {
    action: 'strike',
    staffUserId: interaction.user.id,
    officerUserId: officerUser.id,
    createdAt: Date.now(),
    details: {}
  });

  return interaction.reply({
    content: [
      `Strike level selection for ${officerUser}`,
      '',
      'Choose the strike level.',
      '',
      'No DM has been sent and no staff log has been created.'
    ].join('\n'),
    components: [buildStrikeLevelSelectRow(stateKey)],
    ephemeral: true
  });
}

async function showOfficerActionModal({ interaction, action, officerUser, stateKey }) {
  const effectiveStateKey = stateKey || createStateKey();

  if (!pendingOfficerActions.has(effectiveStateKey)) {
    pendingOfficerActions.set(effectiveStateKey, {
      action,
      staffUserId: interaction.user.id,
      officerUserId: officerUser.id,
      createdAt: Date.now(),
      details: {}
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`officerMgmt:modal:${effectiveStateKey}`)
    .setTitle(`${ACTION_LABELS[action]} Details`);

  getModalTextInputs(action).forEach((input) => {
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return interaction.showModal(modal);
}

function createStateKey() {
  return `om${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function buildRankSelectRow(stateKey, availableRanks) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`officerMgmt:select:${stateKey}:rank`)
      .setPlaceholder('Choose new rank')
      .addOptions(
        ...availableRanks.slice(0, 25).map((rank) => ({
          label: rank.name,
          description: `Level ${rank.level}`,
          value: rank.name
        }))
      )
  );
}

function buildStrikeLevelSelectRow(stateKey) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`officerMgmt:select:${stateKey}:strikeLevel`)
      .setPlaceholder('Choose strike level')
      .addOptions(
        {
          label: 'Strike 1',
          value: '1'
        },
        {
          label: 'Strike 2',
          value: '2'
        },
        {
          label: 'Strike 3',
          value: '3'
        }
      )
  );
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

function buildRankChangeConfirmationMessage(state) {
  return [
    `Please confirm this ${ACTION_LABELS[state.action].toLowerCase()}:`,
    '',
    `Officer: <@${state.officerUserId}>`,
    `Current Rank: **${state.currentRankName}** — Level ${state.currentRankLevel}`,
    `New Rank: **${state.targetRankName}** — Level ${state.targetRankLevel}`,
    '',
    'No roles have been changed yet.'
  ].join('\n');
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
  let previousOfficerRoleId = null;
  let dmSent = false;
  let appealButtonIncluded = false;

  if (state.action === 'promote' || state.action === 'demote') {
    return confirmRankChange({
      interaction,
      serverConfig,
      state,
      stateKey,
      officerUser,
      officerMember,
      changedAt
    });
  }

  if (state.action === 'termination' || state.action === 'resignation') {
    const auditReason = `${ACTION_LABELS[state.action]} processed by ${interaction.user.tag}. Reason: ${state.details.reason}`;

    previousOfficerRoleId = serverConfig?.officerManagement?.previousOfficerRoleId
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
    const strikeResult = await issueOfficerStrike({
      guild: interaction.guild,
      client: interaction.client,
      serverConfig,
      officerUserId: state.officerUserId,
      staffUser: interaction.user,
      strikeLevel: state.strikeLevel,
      details: state.details,
      category: 'general',
      sendDm: true,
      changedAt
    });
    roleResult = strikeResult.roleResult;
    dmSent = strikeResult.dmSent;
    appealButtonIncluded = strikeResult.appealButtonIncluded;
  }

  if (state.action !== 'strike') {
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
  }

  const googleResult = await submitOfficerActionToGoogle({
    interaction,
    state,
    officerUser,
    officerMember,
    roleResult,
    previousRoleResult,
    previousOfficerRoleId,
    dmSent,
    changedAt
  });

  pendingOfficerActions.delete(stateKey);

  return interaction.editReply({
    content: buildSuccessMessage({
      state,
      officerUser,
      roleResult,
      previousRoleResult,
      dmSent,
      appealButtonIncluded,
      googleResult
    }),
    components: []
  });
}

async function confirmRankChange({
  interaction,
  serverConfig,
  state,
  stateKey,
  officerUser,
  officerMember,
  changedAt
}) {
  const currentRank = getMemberRank(officerMember, serverConfig);
  const targetRank = getRankByName(state.targetRankName, serverConfig);
  const actionLabel = ACTION_LABELS[state.action];
  const actionPastTense = state.action === 'promote' ? 'promoted' : 'demoted';

  if (!currentRank || !targetRank) {
    pendingOfficerActions.delete(stateKey);
    return interaction.editReply({
      content: `${actionLabel} could not be completed because the officer rank or selected rank is no longer configured.`,
      components: []
    });
  }

  if (state.action === 'promote' && targetRank.level <= currentRank.level) {
    pendingOfficerActions.delete(stateKey);
    return interaction.editReply({
      content: 'Promotion cancelled because the selected rank is no longer higher than the officer current rank.',
      components: []
    });
  }

  if (state.action === 'demote' && targetRank.level >= currentRank.level) {
    pendingOfficerActions.delete(stateKey);
    return interaction.editReply({
      content: 'Demotion cancelled because the selected rank is no longer lower than the officer current rank.',
      components: []
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
    return interaction.editReply({
      content: [
        'The bot cannot safely complete this rank change yet.',
        '',
        'Fix these first:',
        ...roleValidation.problems.map((problem) => `- ${problem}`),
        '',
        'Most likely fix: move the bot role above all rank and permission roles in Discord Server Settings.'
      ].join('\n'),
      components: []
    });
  }

  const auditReason = `${actionLabel}: ${officerUser.tag} from ${currentRank.name} to ${targetRank.name}.`;
  const result = await changeMemberRank(
    officerMember,
    currentRank,
    targetRank,
    auditReason
  );

  await sendOfficerRankChangeLog({
    guild: interaction.guild,
    serverConfig,
    actionType: state.action,
    officerUser,
    staffUser: interaction.user,
    oldRank: currentRank,
    newRank: targetRank,
    changedAt
  });

  await interaction.editReply({
    content: [
      `${officerUser} was successfully ${actionPastTense}.`,
      '',
      `Old Rank: **${currentRank.name}**`,
      `New Rank: **${targetRank.name}**`,
      '',
      `Removed Roles: ${result.removedRoles.length > 0 ? result.removedRoles.join(', ') : 'None'}`,
      `Added Roles: ${result.addedRoles.length > 0 ? result.addedRoles.join(', ') : 'None'}`,
      '',
      'Submitting Google rank-change event now...'
    ].join('\n'),
    components: []
  });

  const oldRankRoleIds = getRankRoleIdsForPayload(currentRank);
  const newRankRoleIds = getRankRoleIdsForPayload(targetRank);
  const removedRoleIds = oldRankRoleIds.filter((roleId) => !newRankRoleIds.includes(roleId));
  const addedRoleIds = newRankRoleIds.filter((roleId) => !oldRankRoleIds.includes(roleId));
  const googleResult = await safeSubmitDepartmentEvent({
    interaction,
    actionType: state.action === 'promote' ? 'PROMOTE' : 'DEMOTE',
    target: officerUser,
    targetDiscordId: officerUser.id,
    targetDiscordTag: officerUser.tag,
    targetName: officerMember.displayName,
    oldRank: getRankName(currentRank),
    newRank: getRankName(targetRank),
    payload: {
      action: state.action,
      officerDiscordId: officerUser.id,
      officerTag: officerUser.tag,
      officerDisplayName: officerMember.displayName,
      oldRankKey: getRankKey(currentRank),
      oldRankName: getRankName(currentRank),
      oldRankLevel: currentRank.level,
      newRankKey: getRankKey(targetRank),
      newRankName: getRankName(targetRank),
      newRankLevel: targetRank.level,
      removedRoleIds,
      addedRoleIds,
      roleResult: result,
      discordActionCompleted: true,
      handledByDiscordId: interaction.user.id,
      handledByDiscordTag: interaction.user.tag,
      handledAt: changedAt.toISOString()
    },
    requestFields: {
      officerDiscordId: officerUser.id,
      discordId: officerUser.id,
      upsertByDiscordId: true
    }
  });

  pendingOfficerActions.delete(stateKey);

  return interaction.editReply({
    content: [
      `${officerUser} was successfully ${actionPastTense}.`,
      '',
      `Old Rank: **${currentRank.name}**`,
      `New Rank: **${targetRank.name}**`,
      '',
      `Removed Roles: ${result.removedRoles.length > 0 ? result.removedRoles.join(', ') : 'None'}`,
      `Added Roles: ${result.addedRoles.length > 0 ? result.addedRoles.join(', ') : 'None'}`,
      '',
      buildGoogleSubmissionStatus(googleResult)
    ].join('\n'),
    components: []
  });
}


function buildGoogleSubmissionStatus(googleResult) {
  if (googleResult?.ok === false) {
    return `⚠️ Discord roles were changed, but Google logging failed: ${googleResult.error.message}`;
  }

  const requestId = googleResult?.requestId
    || googleResult?.botRequestId
    || googleResult?.data?.requestId
    || googleResult?.data?.botRequestId;
  const message = googleResult?.message || googleResult?.data?.message;

  return [
    '✅ Google rank-change event submitted.',
    requestId ? `Google Request ID: \`${requestId}\`` : null,
    message ? `Google Response: ${message}` : null
  ].filter(Boolean).join('\n');
}

async function submitOfficerActionToGoogle({
  interaction,
  state,
  officerUser,
  officerMember,
  roleResult,
  previousRoleResult,
  previousOfficerRoleId,
  dmSent,
  changedAt
}) {
  const actionType = state.action.toUpperCase();
  const commonPayload = {
    action: state.action,
    officerDiscordId: officerUser.id,
    officerTag: officerUser.tag,
    officerDisplayName: officerMember?.displayName || officerUser.globalName || officerUser.username,
    handledByDiscordId: interaction.user.id,
    handledByDiscordTag: interaction.user.tag,
    handledAt: changedAt.toISOString()
  };
  const requestFields = {
    officerDiscordId: officerUser.id,
    discordId: officerUser.id
  };

  if (state.action === 'termination' || state.action === 'resignation') {
    const removedRoleIds = roleResult?.removedRoleIds || [];
    const addedRoleIds = previousRoleResult?.added && previousOfficerRoleId
      ? [previousOfficerRoleId]
      : [];

    return safeSubmitDepartmentEvent({
      interaction,
      actionType,
      target: officerUser,
      targetDiscordId: officerUser.id,
      targetDiscordTag: officerUser.tag,
      targetName: officerMember?.displayName,
      reason: state.details.reason,
      payload: {
        ...commonPayload,
        reason: state.details.reason,
        evidence: state.details.evidence,
        comments: state.details.comments,
        blacklisted: state.details.blacklisted,
        canReapply: state.details.canReapply,
        removedRoleIds,
        addedRoleIds,
        dmSent,
        discordActionCompleted: true
      },
      requestFields: {
        ...requestFields,
        evidence: state.details.evidence,
        comments: state.details.comments
      }
    });
  }

  if (state.action === 'coaching') {
    return safeSubmitDepartmentEvent({
      interaction,
      actionType,
      target: officerUser,
      targetDiscordId: officerUser.id,
      targetDiscordTag: officerUser.tag,
      targetName: officerMember?.displayName,
      reason: state.details.reason,
      payload: {
        ...commonPayload,
        reason: state.details.reason,
        discussed: state.details.discussion,
        nextSteps: state.details.nextSteps,
        notes: state.details.nextSteps
      },
      requestFields: {
        ...requestFields,
        notes: state.details.nextSteps
      }
    });
  }

  if (state.action === 'strike') {
    return safeSubmitDepartmentEvent({
      interaction,
      actionType,
      target: officerUser,
      targetDiscordId: officerUser.id,
      targetDiscordTag: officerUser.tag,
      targetName: officerMember?.displayName,
      reason: state.details.reason,
      payload: {
        ...commonPayload,
        strikeLevel: state.strikeLevel,
        reason: state.details.reason,
        evidence: state.details.evidence,
        preventionSteps: state.details.nextSteps,
        dmSent
      },
      requestFields: {
        ...requestFields,
        strikeLevel: state.strikeLevel,
        evidence: state.details.evidence,
        notes: state.details.nextSteps
      }
    });
  }

  return null;
}

function getRankRoleIdsForPayload(rank) {
  return [rank?.rankRoleId, rank?.permissionRoleId].filter((roleId) => {
    return roleId && typeof roleId === 'string' && !roleId.startsWith('PUT_') && !roleId.startsWith('PASTE_');
  });
}

async function trySendOfficerDm({ officerUser, serverConfig, action, details, strikeLevel, caseId = null }) {
  const template = serverConfig?.officerManagement?.dmMessages?.[action];

  if (!template) {
    return {
      sent: false,
      appealButtonIncluded: false
    };
  }

  const appealButtonRow = buildAppealButtonRow({
    serverConfig,
    action,
    officerId: officerUser.id,
    caseId: caseId || createCaseId(action, strikeLevel)
  });
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

async function issueOfficerStrike({
  guild,
  client,
  serverConfig,
  officerUserId,
  staffUser,
  strikeLevel,
  details,
  category = 'general',
  sendDm = true,
  caseId = null,
  changedAt = new Date()
}) {
  const officerUser = await client.users.fetch(officerUserId);
  const officerMember = await guild.members.fetch(officerUserId).catch(() => null);
  const roleResult = officerMember
    ? await issueStrikeRole({
      member: officerMember,
      serverConfig,
      strikeLevel,
      category,
      reason: `Strike ${strikeLevel} (${category}) issued by ${staffUser?.tag || staffUser?.id || 'system'}. Reason: ${details?.reason || 'No reason provided.'}`
    })
    : {
      mode: getStrikeRoleMode(serverConfig, category),
      roleId: null,
      roleName: null,
      added: false,
      skipped: false,
      error: 'Officer member could not be fetched.'
    };

  let dmSent = false;
  let appealButtonIncluded = false;
  if (sendDm) {
    const dmResult = await trySendOfficerDm({
      officerUser,
      serverConfig,
      action: 'strike',
      details,
      strikeLevel,
      caseId
    });
    dmSent = dmResult.sent;
    appealButtonIncluded = dmResult.appealButtonIncluded;
  }

  await sendOfficerActionLog({
    guild,
    serverConfig,
    actionType: 'strike',
    officerUser,
    staffUser,
    details: {
      ...details,
      strikeLevel,
      strikeCategory: category,
      strikeRoleMode: roleResult.mode || 'none',
      strikeRole: roleResult.roleName || roleResult.roleId || 'None',
      strikeRoleAdded: roleResult.added ? 'Yes' : roleResult.skipped ? 'Skipped' : 'No',
      strikeRoleError: roleResult.error || 'None'
    },
    dmSent: sendDm ? dmSent : undefined,
    appealButtonIncluded,
    changedAt
  });

  return {
    officerUser,
    roleResult,
    dmSent,
    appealButtonIncluded
  };
}

async function issueStrikeRole({ member, serverConfig, strikeLevel, category, reason }) {
  const mode = getStrikeRoleMode(serverConfig, category);
  const roleId = getStrikeRoleId(serverConfig, strikeLevel, category);

  if (mode === 'none') {
    return { mode, roleId: null, roleName: null, added: false, skipped: true, error: null };
  }

  const result = await addConfiguredRole(member, roleId, reason);
  return {
    mode,
    roleId,
    roleName: result.roleName,
    added: result.added,
    skipped: result.skipped,
    error: result.error
  };
}

function getStrikeRoleMode(serverConfig, category) {
  if (category !== 'activity') return 'regular';
  const mode = serverConfig?.duty?.activity?.discipline?.strikeRoleMode || 'none';
  return ['regular', 'separate', 'none'].includes(mode) ? mode : 'none';
}

function getStrikeRoleId(serverConfig, strikeLevel, category) {
  const mode = getStrikeRoleMode(serverConfig, category);
  if (mode === 'none') return null;
  if (mode === 'separate') return serverConfig?.duty?.activity?.discipline?.activityStrikeRoleIds?.[strikeLevel] || null;
  return serverConfig?.appeals?.strikeRoleIds?.[strikeLevel] || null;
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

function buildAppealButtonRow({ serverConfig, action, officerId, caseId }) {
  if (!['termination', 'strike'].includes(action)) return null;

  try {
    return buildAppealStartButtonRow({
      serverConfig,
      appealType: action,
      officerId,
      caseId
    });
  } catch (error) {
    console.warn('Could not build officer management appeal button:', error);
    return null;
  }
}

function createCaseId(action, strikeLevel) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  if (action === 'strike' && strikeLevel) {
    return `st${strikeLevel}-${suffix}`;
  }

  return `${action.slice(0, 2)}${suffix}`;
}

function buildSuccessMessage({ state, officerUser, roleResult, previousRoleResult, dmSent, appealButtonIncluded, googleResult }) {
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
      `Strike Role: ${roleResult?.roleName || roleResult?.roleId || 'None'}`,
      `Strike Role Added: ${roleResult?.added ? 'Yes' : roleResult?.skipped ? 'Skipped' : 'No'}`,
      ...(roleResult?.error ? [`Strike Role Error: ${roleResult.error}`] : []),
      `DM sent: ${dmSent ? 'Yes' : 'No'}`,
      `Appeal button included: ${appealButtonIncluded ? 'Yes' : 'No'}`
    );
  }

  if (state.action === 'coaching') {
    lines.push('No roles were changed and no DM was sent.');
  }

  lines.push('Staff log was attempted.');

  if (googleResult) {
    lines.push('', buildOfficerActionGoogleStatus(googleResult));
  }

  return lines.join('\n');
}

function buildOfficerActionGoogleStatus(googleResult) {
  if (googleResult?.ok === false) {
    return `⚠️ Discord action completed, but Google logging failed: ${googleResult.error.message}`;
  }

  const requestId = googleResult?.requestId
    || googleResult?.botRequestId
    || googleResult?.data?.requestId
    || googleResult?.data?.botRequestId;
  const message = googleResult?.message || googleResult?.data?.message;

  return [
    '✅ Google officer-management event submitted.',
    requestId ? `Google Request ID: \`${requestId}\`` : null,
    message ? `Google Response: ${message}` : null
  ].filter(Boolean).join('\n');
}
