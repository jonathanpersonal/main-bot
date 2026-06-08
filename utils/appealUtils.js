const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { getServerConfig } = require('./configUtils');
const { sendAppealLog } = require('./logUtils');

const APPEAL_TYPES = {
  termination: {
    label: 'Termination',
    short: 'term',
    modalTitle: 'Termination Appeal',
    fields: [
      ['removedReason', 'Why were you removed?', true],
      ['reinstatementReason', 'Why should you be reinstated?', true],
      ['preventionSteps', 'What steps will you take to prevent this?', true],
      ['additionalInfo', 'Additional information', false]
    ],
    approvedMessageKey: 'approvedTermination',
    deniedMessageKey: 'deniedTermination'
  },
  strike: {
    label: 'Strike',
    short: 'strike',
    modalTitle: 'Strike Appeal',
    fields: [
      ['strikeReason', 'Why were you issued the strike?', true],
      ['overturnReason', 'Why should your strike be overturned?', true],
      ['preventionSteps', 'What will you do to prevent this again?', true],
      ['evidence', 'Evidence', false],
      ['additionalInfo', 'Additional information', false]
    ],
    approvedMessageKey: 'approvedStrike',
    deniedMessageKey: 'deniedStrike'
  }
};

async function handleAppealInteraction(interaction, client) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

  const customId = interaction.customId || '';
  if (!customId.startsWith('appeal_')) return false;

  if (interaction.isButton()) {
    return handleAppealButton(interaction, client);
  }

  return handleAppealModal(interaction, client);
}

function buildAppealStartButtonRow({ serverConfig, appealType, officerId, caseId }) {
  if (!APPEAL_TYPES[appealType]) return null;

  const appealsConfig = serverConfig?.appeals;
  const officerButtonConfig = serverConfig?.officerManagement?.appealButton;

  if (!appealsConfig?.enabled && !officerButtonConfig?.enabled) return null;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_start:${appealType}:${officerId}:${caseId}`)
      .setLabel(officerButtonConfig?.label || 'Appeal Decision')
      .setStyle(ButtonStyle.Primary)
  );
}

async function handleAppealButton(interaction, client) {
  const [action, appealType, officerId, third, fourth] = interaction.customId.split(':');
  const serverConfig = getServerConfig();

  if (action === 'appeal_start') {
    return showAppealInstructions({ interaction, serverConfig, appealType, officerId, caseId: third });
  }

  if (action === 'appeal_begin') {
    return showAppealModal({ interaction, serverConfig, appealType, officerId, caseId: third });
  }

  if (action === 'appeal_cancel') {
    return cancelAppeal(interaction, officerId);
  }

  if (action === 'appeal_assign') {
    return assignAppeal({ interaction, serverConfig, appealType, officerId, appealId: third });
  }

  if (action === 'appeal_review') {
    return markAppealUnderReview({ interaction, serverConfig, appealType, officerId, appealId: third });
  }

  if (action === 'appeal_info') {
    return showInfoRequestModal({ interaction, serverConfig, appealType, officerId, appealId: third });
  }

  if (action === 'appeal_approve') {
    return showDecisionModal({ interaction, serverConfig, appealType, officerId, appealId: third, decision: 'approve' });
  }

  if (action === 'appeal_deny') {
    return showDecisionModal({ interaction, serverConfig, appealType, officerId, appealId: third, decision: 'deny' });
  }

  if (action === 'appeal_provide') {
    return showOfficerInfoModal({ interaction, serverConfig, threadId: appealType, officerId, appealId: third });
  }

  if (action === 'appeal_decline') {
    return declineOfficerInfo({ interaction, client, serverConfig, threadId: appealType, officerId, appealId: third });
  }

  return false;
}

async function handleAppealModal(interaction, client) {
  const [action, appealType, officerId, third, fourth] = interaction.customId.split(':');
  const serverConfig = getServerConfig();

  if (action === 'appeal_modal') {
    return submitAppeal({ interaction, client, serverConfig, appealType, officerId, caseId: third });
  }

  if (action === 'appeal_info_modal') {
    return submitInfoRequest({ interaction, serverConfig, appealType, officerId, appealId: third });
  }

  if (action === 'appeal_decision') {
    return submitDecision({ interaction, serverConfig, appealType, officerId, appealId: third, decision: fourth });
  }

  if (action === 'appeal_provide_modal') {
    return submitOfficerInfo({ interaction, client, serverConfig, threadId: appealType, officerId, appealId: third });
  }

  return false;
}

async function showAppealInstructions({ interaction, serverConfig, appealType, officerId, caseId }) {
  if (interaction.user.id !== officerId) {
    await interaction.reply({
      content: 'This appeal button is only for the user it was sent to.',
      ephemeral: true
    });
    return true;
  }

  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({
      content: 'Appeals are not currently enabled.',
      ephemeral: true
    });
    return true;
  }

  if (!APPEAL_TYPES[appealType]) {
    await interaction.reply({ content: 'This appeal type is not available.', ephemeral: true });
    return true;
  }

  const responseTargets = serverConfig.appeals.responseTargets || {};
  const content = [
    `**${serverConfig.appeals.messages?.instructionsTitle || 'Appeal Instructions'}**`,
    '',
    `Thank you for wanting to appeal your ${appealType}. Please review the directions below carefully to ensure your appeal will be reviewed.`,
    '',
    '1. To appeal, press the Start Appeal button and follow all prompts.',
    '',
    '2. Answer all questions truthfully and accurately. Your appeal may be reviewed by someone who was not involved with the incident and may not know what happened.',
    '',
    '3. Do not message anyone about your appeal or discuss your appeal in public.',
    '',
    '4. You will get a DM from this bot with the results of your appeal. Sometimes, we may require a conversation with you regarding your appeal before a final decision can be made.',
    '',
    `5. We aim to respond to appeals within ${responseTargets.aimToRespondWithin || 'the configured response time'} and resolve appeals within ${responseTargets.aimToResolveWithin || 'the configured resolution time'}; however, this may not always be possible. Appeals are not always the highest priority and delays may occur. All appeals will be reviewed, so please do not contact staff regarding the status of your appeal.`
  ].join('\n');

  await interaction.reply({
    content,
    components: [buildInstructionButtonRow({ appealType, officerId, caseId })],
    ephemeral: true
  });
  return true;
}

function buildInstructionButtonRow({ appealType, officerId, caseId }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_begin:${appealType}:${officerId}:${caseId}`)
      .setLabel('Start Appeal')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`appeal_cancel:${appealType}:${officerId}:${caseId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function cancelAppeal(interaction, officerId) {
  if (interaction.user.id !== officerId) {
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', ephemeral: true });
    return true;
  }

  await interaction.update({
    content: 'Appeal cancelled. No appeal was created.',
    components: []
  });
  return true;
}

async function showAppealModal({ interaction, serverConfig, appealType, officerId, caseId }) {
  if (interaction.user.id !== officerId) {
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', ephemeral: true });
    return true;
  }

  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({ content: 'Appeals are not currently enabled.', ephemeral: true });
    return true;
  }

  const typeConfig = APPEAL_TYPES[appealType];
  if (!typeConfig) {
    await interaction.reply({ content: 'This appeal type is not available.', ephemeral: true });
    return true;
  }

  const modal = new ModalBuilder()
    .setCustomId(`appeal_modal:${appealType}:${officerId}:${caseId}`)
    .setTitle(typeConfig.modalTitle);

  typeConfig.fields.forEach(([customId, label, required]) => {
    modal.addComponents(new ActionRowBuilder().addComponents(createTextInput(customId, label, required)));
  });

  await interaction.showModal(modal);
  return true;
}

async function submitAppeal({ interaction, client, serverConfig, appealType, officerId, caseId }) {
  if (interaction.user.id !== officerId) {
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', ephemeral: true });
    return true;
  }

  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({ content: 'Appeals are not currently enabled.', ephemeral: true });
    return true;
  }

  const typeConfig = APPEAL_TYPES[appealType];
  if (!typeConfig) {
    await interaction.reply({ content: 'This appeal type is not available.', ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = await fetchAppealGuild(client, serverConfig);
  if (!guild) {
    await interaction.editReply('Appeals are enabled, but the configured guild could not be found. Please contact staff.');
    return true;
  }

  const forum = await fetchAppealsForum(guild, serverConfig);
  if (!forum) {
    await interaction.editReply('Appeals are enabled, but the appeals forum channel is not configured correctly. Please contact staff.');
    return true;
  }

  const appealId = generateAppealId();
  const officerUser = interaction.user;
  const officerMember = await fetchGuildMember(guild, officerId);
  const officerDisplayName = getDisplayName(officerUser, officerMember);
  const submittedAt = new Date();
  const answers = getAppealAnswers(interaction, typeConfig);
  const pendingTagId = getConfiguredTagId(serverConfig, 'pending');
  const appliedTags = pendingTagId ? [pendingTagId] : [];
  const title = sanitizeThreadTitle(`Appeal - ${typeConfig.label} - ${officerDisplayName} - ${appealId}`);
  const mentionLine = buildReviewerMentionLine(serverConfig);

  let thread;
  try {
    thread = await forum.threads.create({
      name: title,
      appliedTags,
      message: {
        content: [mentionLine, buildAppealThreadBody({ appealType, appealId, officerId, submittedAt, answers })]
          .filter(Boolean)
          .join('\n\n'),
        components: buildStaffActionRows({ appealType, officerId, appealId })
      }
    });
  } catch (error) {
    if (appliedTags.length > 0) {
      console.warn(`Could not create appeal thread with pending tag ${pendingTagId}; retrying without tags.`, error);
      thread = await forum.threads.create({
        name: title,
        message: {
          content: [mentionLine, buildAppealThreadBody({ appealType, appealId, officerId, submittedAt, answers })]
            .filter(Boolean)
            .join('\n\n'),
          components: buildStaffActionRows({ appealType, officerId, appealId })
        }
      });
    } else {
      console.warn('Could not create appeal thread:', error);
      await interaction.editReply('Your appeal could not be submitted because the appeals forum post could not be created. Please contact staff.');
      return true;
    }
  }

  const dmSent = await safeSendDm(officerUser, {
    content: serverConfig.appeals.messages?.appealReceived || 'Your appeal has been submitted and is pending review.'
  });

  if (!dmSent && thread) {
    await safeThreadSend(thread, 'DM delivery failed for the appeal submission confirmation.');
  }

  await sendAppealLog({
    guild,
    serverConfig,
    action: 'Appeal Submitted',
    appealType,
    appealId,
    officerUser,
    staffUser: null,
    dmSent,
    details: `Forum thread: <#${thread.id}>`,
    changedAt: submittedAt
  });

  await interaction.editReply(`Your appeal has been submitted. Appeal ID: **${appealId}**`);
  return true;
}

async function assignAppeal({ interaction, serverConfig, appealType, officerId, appealId }) {
  if (!(await ensureStaffCanManageAppeal(interaction, serverConfig))) return true;

  await interaction.reply({ content: `Appeal assigned to ${interaction.user}.`, ephemeral: true });
  await safeThreadSend(interaction.channel, `Appeal assigned to ${interaction.user}.`);

  await sendAppealLog({
    guild: interaction.guild,
    serverConfig,
    action: 'Appeal Assigned',
    appealType,
    appealId,
    officerUser: await interaction.client.users.fetch(officerId).catch(() => null),
    staffUser: interaction.user,
    details: `Assigned to ${interaction.user.tag || interaction.user.id}`
  });
  return true;
}

async function markAppealUnderReview({ interaction, serverConfig, appealType, officerId, appealId }) {
  if (!(await ensureStaffCanManageAppeal(interaction, serverConfig))) return true;

  await interaction.deferReply({ ephemeral: true });
  await updateAppealTags(interaction.channel, serverConfig, ['underReview'], ['pending']);
  await safeThreadSend(interaction.channel, `Appeal marked under review by ${interaction.user}.`);

  const officerUser = await interaction.client.users.fetch(officerId).catch(() => null);
  const dmSent = await safeSendDm(officerUser, {
    content: serverConfig.appeals.messages?.underReview || 'Your appeal is now under review.'
  });

  if (!dmSent) {
    await safeThreadSend(interaction.channel, 'DM delivery failed for the under review notification.');
  }

  await sendAppealLog({
    guild: interaction.guild,
    serverConfig,
    action: 'Appeal Under Review',
    appealType,
    appealId,
    officerUser,
    staffUser: interaction.user,
    dmSent
  });

  await interaction.editReply('Appeal marked under review.');
  return true;
}

async function showInfoRequestModal({ interaction, serverConfig, appealType, officerId, appealId }) {
  if (!(await ensureStaffCanManageAppeal(interaction, serverConfig))) return true;

  const modal = new ModalBuilder()
    .setCustomId(`appeal_info_modal:${appealType}:${officerId}:${appealId}`)
    .setTitle('Request Appeal Information')
    .addComponents(new ActionRowBuilder().addComponents(
      createTextInput('request', 'What information is being requested?', true)
    ));

  await interaction.showModal(modal);
  return true;
}

async function submitInfoRequest({ interaction, serverConfig, appealType, officerId, appealId }) {
  if (!(await ensureStaffCanManageAppeal(interaction, serverConfig))) return true;

  await interaction.deferReply({ ephemeral: true });
  const request = interaction.fields.getTextInputValue('request') || 'No details provided.';
  await updateAppealTags(interaction.channel, serverConfig, ['infoNeeded'], ['underReview']);
  await safeThreadSend(interaction.channel, `Additional information requested by ${interaction.user}:\n\n${request}`);

  const officerUser = await interaction.client.users.fetch(officerId).catch(() => null);
  const dmSent = await safeSendDm(officerUser, {
    content: [
      serverConfig.appeals.messages?.infoRequested || 'Additional information is needed for your appeal.',
      '',
      '**Information requested:**',
      request
    ].join('\n'),
    components: [buildOfficerInfoRow({ threadId: interaction.channelId, officerId, appealId })]
  });

  if (!dmSent) {
    await safeThreadSend(interaction.channel, 'DM delivery failed for the information request.');
  }

  await sendAppealLog({
    guild: interaction.guild,
    serverConfig,
    action: 'Appeal Information Requested',
    appealType,
    appealId,
    officerUser,
    staffUser: interaction.user,
    dmSent,
    details: request
  });

  await interaction.editReply('Information request sent.');
  return true;
}

function buildOfficerInfoRow({ threadId, officerId, appealId }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_provide:${threadId}:${officerId}:${appealId}`)
      .setLabel('Provide Information')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`appeal_decline:${threadId}:${officerId}:${appealId}`)
      .setLabel('Decline to Provide')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function showOfficerInfoModal({ interaction, serverConfig, threadId, officerId, appealId }) {
  if (interaction.user.id !== officerId) {
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', ephemeral: true });
    return true;
  }

  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({ content: 'Appeals are not currently enabled.', ephemeral: true });
    return true;
  }

  const modal = new ModalBuilder()
    .setCustomId(`appeal_provide_modal:${threadId}:${officerId}:${appealId}`)
    .setTitle('Provide Appeal Information')
    .addComponents(
      new ActionRowBuilder().addComponents(createTextInput('additionalInfo', 'Additional information', true)),
      new ActionRowBuilder().addComponents(createTextInput('evidence', 'Evidence/links if applicable', false))
    );

  await interaction.showModal(modal);
  return true;
}

async function submitOfficerInfo({ interaction, client, serverConfig, threadId, officerId, appealId }) {
  if (interaction.user.id !== officerId) {
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (!thread || typeof thread.send !== 'function') {
    await interaction.editReply('Your information could not be recorded because the appeal thread could not be found. Please contact staff.');
    return true;
  }

  const additionalInfo = interaction.fields.getTextInputValue('additionalInfo') || 'None provided.';
  const evidence = interaction.fields.getTextInputValue('evidence') || 'None provided.';

  await safeThreadSend(thread, [
    `Officer ${interaction.user} provided additional appeal information.`,
    '',
    `**Additional information:**\n${additionalInfo}`,
    '',
    `**Evidence/links:**\n${evidence}`
  ].join('\n'));

  await safeSendDm(interaction.user, { content: 'Your additional appeal information was received.' });
  await sendAppealLog({
    guild: thread.guild,
    serverConfig,
    action: 'Appeal Information Provided',
    appealId,
    officerUser: interaction.user,
    details: `Thread: <#${thread.id}>`
  });

  await interaction.editReply('Your additional information was received.');
  return true;
}

async function declineOfficerInfo({ interaction, client, serverConfig, threadId, officerId, appealId }) {
  if (interaction.user.id !== officerId) {
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (!thread || typeof thread.send !== 'function') {
    await interaction.editReply('Your response could not be recorded because the appeal thread could not be found. Please contact staff.');
    return true;
  }

  await safeThreadSend(thread, 'The officer declined to provide additional information.');
  await safeSendDm(interaction.user, { content: 'Your response was recorded.' });
  await sendAppealLog({
    guild: thread.guild,
    serverConfig,
    action: 'Appeal Information Declined',
    appealId,
    officerUser: interaction.user,
    details: `Thread: <#${thread.id}>`
  });

  await interaction.editReply('Your response was recorded.');
  return true;
}

async function showDecisionModal({ interaction, serverConfig, appealType, officerId, appealId, decision }) {
  if (!(await ensureStaffCanManageAppeal(interaction, serverConfig))) return true;

  const isApproval = decision === 'approve';
  const modal = new ModalBuilder()
    .setCustomId(`appeal_decision:${appealType}:${officerId}:${appealId}:${decision}`)
    .setTitle(isApproval ? 'Approve Appeal' : 'Deny Appeal');

  if (isApproval) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(createTextInput('reason', 'Reason for approval', true)),
      new ActionRowBuilder().addComponents(createTextInput('comments', 'Comments/notes', false)),
      new ActionRowBuilder().addComponents(createTextInput('nextSteps', 'Next steps/actions', false))
    );
  } else {
    modal.addComponents(
      new ActionRowBuilder().addComponents(createTextInput('reason', 'Reason for denial', true)),
      new ActionRowBuilder().addComponents(createTextInput('canReapply', 'Can they reapply? Yes/No or details', false)),
      new ActionRowBuilder().addComponents(createTextInput('comments', 'Comments', false))
    );
  }

  await interaction.showModal(modal);
  return true;
}

async function submitDecision({ interaction, serverConfig, appealType, officerId, appealId, decision }) {
  if (!(await ensureStaffCanManageAppeal(interaction, serverConfig))) return true;

  await interaction.deferReply({ ephemeral: true });
  const isApproval = decision === 'approve';
  const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided.';
  const comments = interaction.fields.getTextInputValue('comments') || 'None provided.';
  const nextSteps = isApproval
    ? interaction.fields.getTextInputValue('nextSteps') || 'None provided.'
    : '';
  const canReapply = isApproval
    ? ''
    : interaction.fields.getTextInputValue('canReapply') || 'No';
  const tagName = isApproval ? 'approved' : 'denied';

  await updateAppealTags(interaction.channel, serverConfig, [tagName], ['pending', 'underReview', 'infoNeeded']);

  await safeThreadSend(interaction.channel, [
    `Appeal ${isApproval ? 'approved' : 'denied'} by ${interaction.user}.`,
    '',
    `**Reason:**\n${reason}`,
    '',
    `**Comments/notes:**\n${comments}`,
    ...(isApproval ? ['', `**Next steps/actions:**\n${nextSteps}`] : ['', `**Can reapply:**\n${canReapply}`])
  ].join('\n'));

  if (isApproval && appealType === 'termination') {
    // TODO: Later automatically open a reinstatement ticket and ping configured command role.
  }

  if (isApproval && appealType === 'strike') {
    // TODO: Later remove the configured strike role when strike tracking roles are added.
  }

  const officerUser = await interaction.client.users.fetch(officerId).catch(() => null);
  const dmSent = await sendDecisionDm({
    officerUser,
    serverConfig,
    appealType,
    appealId,
    decision,
    reason,
    comments,
    nextSteps,
    canReapply
  });

  if (!dmSent) {
    await safeThreadSend(interaction.channel, `DM delivery failed for the appeal ${decision} decision.`);
  }

  await sendAppealLog({
    guild: interaction.guild,
    serverConfig,
    action: isApproval ? 'Appeal Approved' : 'Appeal Denied',
    appealType,
    appealId,
    officerUser,
    staffUser: interaction.user,
    dmSent,
    details: reason
  });

  await interaction.editReply(`Appeal ${isApproval ? 'approved' : 'denied'}.`);
  return true;
}

async function sendDecisionDm({ officerUser, serverConfig, appealType, appealId, decision, reason, comments, nextSteps, canReapply }) {
  const typeConfig = APPEAL_TYPES[appealType];
  const messages = serverConfig?.appeals?.messages || {};
  const messageKey = decision === 'approve' ? typeConfig?.approvedMessageKey : typeConfig?.deniedMessageKey;
  const template = messages[messageKey];

  const fallback = decision === 'approve'
    ? `Your ${appealType} appeal ${appealId} was approved.\n\nReason:\n${reason}`
    : `Your ${appealType} appeal ${appealId} was denied.\n\nReason:\n${reason}`;

  const content = template
    ? formatTemplate(template, {
      officerName: getDisplayName(officerUser),
      appealId,
      approvalReason: reason,
      denialReason: reason,
      comments,
      nextSteps: nextSteps || 'None provided.',
      canReapply: canReapply || 'No'
    })
    : fallback;

  return safeSendDm(officerUser, { content });
}

function buildStaffActionRows({ appealType, officerId, appealId }) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`appeal_assign:${appealType}:${officerId}:${appealId}`)
        .setLabel('Assign Appeal')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`appeal_review:${appealType}:${officerId}:${appealId}`)
        .setLabel('Mark Under Review')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`appeal_info:${appealType}:${officerId}:${appealId}`)
        .setLabel('Request Information')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`appeal_approve:${appealType}:${officerId}:${appealId}`)
        .setLabel('Approve Appeal')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`appeal_deny:${appealType}:${officerId}:${appealId}`)
        .setLabel('Deny Appeal')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function createTextInput(customId, label, required) {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(required)
    .setMaxLength(1000);
}

function getAppealAnswers(interaction, typeConfig) {
  return typeConfig.fields.map(([customId, label]) => ({
    label,
    value: interaction.fields.getTextInputValue(customId) || 'None provided.'
  }));
}

function buildAppealThreadBody({ appealType, appealId, officerId, submittedAt, answers }) {
  const timestamp = Math.floor(submittedAt.getTime() / 1000);
  const lines = [
    `A ${appealType} appeal has been submitted. Please review the information below.`,
    '',
    `Officer: <@${officerId}>`,
    `Officer ID: ${officerId}`,
    `Appeal Type: ${appealType}`,
    `Appeal ID: ${appealId}`,
    `Submitted At: <t:${timestamp}:F>`,
    '',
    '**Appeal Answers**'
  ];

  answers.forEach((answer) => {
    lines.push('', `**${answer.label}**`, answer.value);
  });

  return lines.join('\n');
}

function buildReviewerMentionLine(serverConfig) {
  const roleIds = [
    ...(serverConfig?.appeals?.reviewerRoleIds || []),
    serverConfig?.appeals?.commandRoleId
  ].filter(isConfiguredId);

  if (roleIds.length === 0) return '';
  return roleIds.map((roleId) => `<@&${roleId}>`).join(' ');
}

async function ensureStaffCanManageAppeal(interaction, serverConfig) {
  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({ content: 'Appeals are not currently enabled.', ephemeral: true });
    return false;
  }

  const allowedRoleIds = [
    ...(serverConfig?.appeals?.reviewerRoleIds || []),
    ...(serverConfig?.appeals?.supervisorRoleIds || [])
  ].filter(isConfiguredId);

  const memberRoles = interaction.member?.roles?.cache;
  const hasPermission = allowedRoleIds.length > 0 && allowedRoleIds.some((roleId) => memberRoles?.has(roleId));

  if (!hasPermission) {
    await interaction.reply({ content: 'You do not have permission to manage appeals.', ephemeral: true });
    return false;
  }

  return true;
}

async function fetchAppealGuild(client, serverConfig) {
  const guildId = serverConfig?.guildId;
  if (!guildId) {
    console.warn('Appeals guildId is not configured. Set GUILD_ID or serverConfig.guildId.');
    return null;
  }

  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch((error) => {
    console.warn(`Could not fetch configured appeals guild ${guildId}:`, error);
    return null;
  });
}

async function fetchAppealsForum(guild, serverConfig) {
  const forumChannelId = serverConfig?.appeals?.forumChannelId;
  if (!isConfiguredId(forumChannelId)) {
    console.warn('Appeals forum channel is not configured.');
    return null;
  }

  const channel = guild.channels.cache.get(forumChannelId)
    || await guild.channels.fetch(forumChannelId).catch((error) => {
      console.warn(`Could not fetch appeals forum channel ${forumChannelId}:`, error);
      return null;
    });

  if (!channel || channel.type !== ChannelType.GuildForum) {
    console.warn(`Configured appeals channel is not a forum channel: ${forumChannelId}`);
    return null;
  }

  return channel;
}

async function fetchGuildMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

async function updateAppealTags(thread, serverConfig, addTagNames, removeTagNames = []) {
  if (!thread || typeof thread.setAppliedTags !== 'function') return false;

  const tags = serverConfig?.appeals?.tags || {};
  const currentTags = Array.isArray(thread.appliedTags) ? [...thread.appliedTags] : [];
  const removeTagIds = removeTagNames.map((name) => tags[name]).filter(isConfiguredId);
  const addTagIds = addTagNames.map((name) => tags[name]).filter(isConfiguredId);
  const nextTags = currentTags.filter((tagId) => !removeTagIds.includes(tagId));

  addTagIds.forEach((tagId) => {
    if (!nextTags.includes(tagId)) nextTags.push(tagId);
  });

  try {
    await thread.setAppliedTags(nextTags);
    return true;
  } catch (error) {
    console.warn(`Could not update appeal forum tags on thread ${thread.id}:`, error);
    return false;
  }
}

function getConfiguredTagId(serverConfig, tagName) {
  const tagId = serverConfig?.appeals?.tags?.[tagName];
  return isConfiguredId(tagId) ? tagId : null;
}

async function safeSendDm(user, messageOptions) {
  if (!user || typeof user.send !== 'function') return false;

  try {
    await user.send(messageOptions);
    return true;
  } catch (error) {
    console.warn(`Could not send appeal DM to ${user.id}:`, error);
    return false;
  }
}

async function safeThreadSend(thread, content) {
  if (!thread || typeof thread.send !== 'function') return false;

  try {
    await thread.send({ content });
    return true;
  } catch (error) {
    console.warn(`Could not send appeal thread message to ${thread.id}:`, error);
    return false;
  }
}

function generateAppealId() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `A-${datePart}-${randomPart}`;
}

function sanitizeThreadTitle(title) {
  return title.replace(/[\n\r]/g, ' ').slice(0, 100);
}

function formatTemplate(template, values) {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key) => values[key] ?? match);
}

function getDisplayName(user, member = null) {
  return member?.displayName
    || user?.globalName
    || user?.username
    || user?.tag
    || String(user?.id || 'Unknown Officer');
}

function isConfiguredId(value) {
  return Boolean(value && typeof value === 'string' && !value.startsWith('PUT_') && !value.startsWith('PASTE_'));
}

module.exports = {
  buildAppealStartButtonRow,
  handleAppealInteraction
};
