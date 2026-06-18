const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');

const { getServerConfig } = require('./configUtils');
const { sendAppealLog } = require('./logUtils');
const { createSystemTicket } = require('./ticketUtils');
const { safeSubmitDepartmentEvent } = require('./googleDepartmentEvents');

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

const ACTIVITY_STRIKE_APPEAL_FIELDS = [
  ['overturnReason', 'Why should your activity strike be overturned?', true],
  ['hoursAccuracy', 'Do you believe the hours are accurate?', true],
  ['evidence', 'Evidence', false],
  ['additionalInfo', 'Any other info?', false]
];

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

function getAppealTypeConfig(appealType, caseId) {
  const typeConfig = APPEAL_TYPES[appealType];
  if (!typeConfig) return null;
  if (appealType === 'strike' && isActivityStrikeCaseId(caseId)) {
    return {
      ...typeConfig,
      label: 'Activity Strike',
      modalTitle: 'Activity Strike Appeal',
      fields: ACTIVITY_STRIKE_APPEAL_FIELDS
    };
  }
  return typeConfig;
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
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({
      content: 'Appeals are not currently enabled.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (!APPEAL_TYPES[appealType]) {
    await interaction.reply({ content: 'This appeal type is not available.', flags: MessageFlags.Ephemeral });
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
    flags: MessageFlags.Ephemeral
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
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({ content: 'Appeals are not currently enabled.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const typeConfig = getAppealTypeConfig(appealType, caseId);
  if (!typeConfig) {
    await interaction.reply({ content: 'This appeal type is not available.', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({ content: 'Appeals are not currently enabled.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const typeConfig = getAppealTypeConfig(appealType, caseId);
  if (!typeConfig) {
    await interaction.reply({ content: 'This appeal type is not available.', flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
  const strikeLevel = appealType === 'strike' ? getStrikeLevelFromCaseId(caseId) : null;
  const strikeCategory = appealType === 'strike' ? getStrikeCategoryFromCaseId(caseId) : null;
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
        content: [mentionLine, buildAppealThreadBody({ appealType, appealId, officerId, submittedAt, answers, strikeLevel, strikeCategory })]
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
          content: [mentionLine, buildAppealThreadBody({ appealType, appealId, officerId, submittedAt, answers, strikeLevel, strikeCategory })]
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

  await safeSubmitAppealGoogleEvent({ interaction, actionType: 'APPEAL_SUBMITTED', appealType, appealId, officerId, extra: { caseId, threadId: thread.id, answers } });

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

  await interaction.reply({ content: `Appeal assigned to ${interaction.user}.`, flags: MessageFlags.Ephemeral });
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await updateAppealTags(interaction.channel, serverConfig, ['underReview'], ['pending']);
  await safeThreadSend(interaction.channel, `Appeal marked under review by ${interaction.user}.`);

  const officerUser = await interaction.client.users.fetch(officerId).catch(() => null);
  const dmSent = await safeSendDm(officerUser, {
    content: serverConfig.appeals.messages?.underReview || 'Your appeal is now under review.'
  });

  if (!dmSent) {
    await safeThreadSend(interaction.channel, 'DM delivery failed for the under review notification.');
  }

  await safeSubmitAppealGoogleEvent({ interaction, actionType: 'APPEAL_REVIEW_STARTED', appealType, appealId, officerId, extra: { threadId: interaction.channelId } });

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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (!serverConfig?.appeals?.enabled) {
    await interaction.reply({ content: 'Appeals are not currently enabled.', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'This appeal button is only for the user it was sent to.', flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
    const rows = [
      new ActionRowBuilder().addComponents(createTextInput('reason', 'Reason for denial', true))
    ];
    if (appealType !== 'strike') {
      rows.push(new ActionRowBuilder().addComponents(createTextInput('canReapply', 'Can they reapply? Yes/No or details', false)));
    }
    rows.push(new ActionRowBuilder().addComponents(createTextInput('comments', 'Comments', false)));
    modal.addComponents(...rows);
  }

  await interaction.showModal(modal);
  return true;
}

async function submitDecision({ interaction, serverConfig, appealType, officerId, appealId, decision }) {
  if (!(await ensureStaffCanManageAppeal(interaction, serverConfig))) return true;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const isApproval = decision === 'approve';
  const finalStatus = isApproval ? 'approved' : 'denied';
  const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided.';
  const comments = interaction.fields.getTextInputValue('comments') || 'None provided.';
  const nextSteps = isApproval
    ? interaction.fields.getTextInputValue('nextSteps') || 'None provided.'
    : '';
  const canReapply = isApproval
    ? ''
    : appealType === 'strike'
      ? ''
      : interaction.fields.getTextInputValue('canReapply') || 'No';

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

  let strikeRemovalResult = null;
  if (isApproval && appealType === 'termination' && officerUser) {
    try {
      const reinstatementChannel = await createSystemTicket({
        guild: interaction.guild,
        typeId: 'reinstatement',
        targetUser: officerUser,
        createdBy: interaction.user,
        reason: 'Termination appeal approved',
        metadata: {
          appealCaseId: appealId,
          approvedBy: interaction.user.id,
          approvalReason: reason
        }
      });

      await safeThreadSend(interaction.channel, `Reinstatement ticket created: ${reinstatementChannel}`);
    } catch (error) {
      console.warn(`Could not create reinstatement ticket for appeal ${appealId}:`, error);
      await safeThreadSend(interaction.channel, 'The termination appeal was approved, but the reinstatement ticket could not be created automatically. Please create one manually or check ticket configuration.');
    }
  }

  if (isApproval && appealType === 'strike') {
    const strikeLevel = await getStrikeLevelFromThread(interaction.channel);
    const strikeCategory = await getStrikeCategoryFromThread(interaction.channel);
    strikeRemovalResult = await removeStrikeRole({
      guild: interaction.guild,
      serverConfig,
      officerId,
      strikeLevel,
      strikeCategory,
      appealId
    });
  }

  await safeThreadSend(interaction.channel, buildFinalDecisionSummary({
    decision: finalStatus,
    staffUser: interaction.user,
    reason,
    comments,
    nextSteps,
    canReapply,
    appealType,
    strikeRemovalResult
  }));

  const logDetails = [
    `Reason: ${reason}`,
    comments && comments !== 'None provided.' ? `Comments: ${comments}` : null,
    isApproval && nextSteps && nextSteps !== 'None provided.' ? `Next steps: ${nextSteps}` : null,
    !isApproval && appealType !== 'strike' ? `Can reapply: ${canReapply}` : null,
    strikeRemovalResult ? `Strike role action: ${strikeRemovalResult.message}` : null
  ].filter(Boolean).join('\n');

  await safeSubmitAppealGoogleEvent({ interaction, actionType: isApproval ? 'APPEAL_APPROVED' : 'APPEAL_DENIED', appealType, appealId, officerId, extra: { reason, comments, nextSteps, canReapply, finalStatus } });

  await sendAppealLog({
    guild: interaction.guild,
    serverConfig,
    action: isApproval ? 'Appeal Approved' : 'Appeal Denied',
    appealType,
    appealId,
    officerUser,
    staffUser: interaction.user,
    dmSent,
    details: logDetails || reason
  });

  const closeResult = await closeAppealThread(interaction.channel, serverConfig, finalStatus);

  await interaction.editReply([
    `Appeal ${finalStatus}.`,
    formatCloseResultForReply(closeResult)
  ].filter(Boolean).join('\n'));
  return true;
}

async function safeSubmitAppealGoogleEvent({ interaction, actionType, appealType, appealId, officerId, extra = {} }) {
  return safeSubmitDepartmentEvent({
    actionType,
    interaction,
    actor: interaction.user,
    targetDiscordId: officerId,
    payload: { appealType, appealId, channelId: interaction.channelId, ...extra }
  });
}

function buildFinalDecisionSummary({ decision, staffUser, reason, comments, nextSteps, canReapply, appealType, strikeRemovalResult }) {
  const isApproval = decision === 'approved';
  return [
    `Appeal ${decision} by ${staffUser}.`,
    '',
    `**Reason:**\n${reason}`,
    '',
    `**Comments/notes:**\n${comments}`,
    ...(isApproval ? ['', `**Next steps/actions:**\n${nextSteps}`] : appealType === 'strike' ? [] : ['', `**Can reapply:**\n${canReapply}`]),
    ...(strikeRemovalResult ? ['', `**Strike role action:**\n${strikeRemovalResult.message}`] : []),
    '',
    '_This is the final appeal decision. This thread will be marked closed, locked, and archived._'
  ].join('\n');
}

async function removeStrikeRole({ guild, serverConfig, officerId, strikeLevel, strikeCategory = 'general', appealId }) {
  const configuredRoleId = strikeLevel ? getAppealStrikeRoleId(serverConfig, strikeLevel, strikeCategory) : null;

  if (!strikeLevel) {
    return {
      removed: false,
      message: 'No strike role was removed because the strike level was not available on this appeal.'
    };
  }

  if (!isConfiguredId(configuredRoleId)) {
    return {
      removed: false,
      strikeLevel,
      message: `No strike role was removed because no role is configured for ${strikeCategory} strike level ${strikeLevel}.`
    };
  }

  const member = await fetchGuildMember(guild, officerId);
  if (!member) {
    return {
      removed: false,
      strikeLevel,
      roleId: configuredRoleId,
      message: `No strike role was removed because the officer could not be found in the guild for strike level ${strikeLevel}.`
    };
  }

  if (!member.roles?.cache?.has(configuredRoleId)) {
    return {
      removed: false,
      strikeLevel,
      roleId: configuredRoleId,
      message: `No strike role was found on the officer for strike level ${strikeLevel} (<@&${configuredRoleId}>).`
    };
  }

  try {
    await member.roles.remove(configuredRoleId, `Strike appeal ${appealId} approved; removing ${strikeCategory} strike level ${strikeLevel}.`);
    return {
      removed: true,
      strikeLevel,
      roleId: configuredRoleId,
      message: `Removed ${strikeCategory} strike level ${strikeLevel} role <@&${configuredRoleId}> from the officer.`
    };
  } catch (error) {
    console.warn(`Could not remove strike level ${strikeLevel} role ${configuredRoleId} from ${officerId}:`, error);
    return {
      removed: false,
      strikeLevel,
      roleId: configuredRoleId,
      message: `No strike role was removed because removing strike level ${strikeLevel} role <@&${configuredRoleId}> failed.`
    };
  }
}

async function getStrikeLevelFromThread(thread) {
  const starterContent = await fetchThreadStarterContent(thread);
  const match = starterContent?.match(/^Strike Level:\s*(\d+)/im);
  return match ? Number(match[1]) : null;
}

async function getStrikeCategoryFromThread(thread) {
  const starterContent = await fetchThreadStarterContent(thread);
  const match = starterContent?.match(/^Strike Category:\s*(.+)$/im);
  return normalizeStrikeCategory(match?.[1]);
}

function getAppealStrikeRoleId(serverConfig, strikeLevel, strikeCategory) {
  if (strikeCategory === 'activity') {
    const mode = serverConfig?.duty?.activity?.discipline?.strikeRoleMode || 'none';
    if (mode === 'none') return null;
    if (mode === 'separate') return serverConfig?.duty?.activity?.discipline?.activityStrikeRoleIds?.[strikeLevel] || null;
  }
  return serverConfig?.appeals?.strikeRoleIds?.[strikeLevel] || null;
}

async function fetchThreadStarterContent(thread) {
  if (!thread) return '';

  try {
    if (typeof thread.fetchStarterMessage === 'function') {
      const starterMessage = await thread.fetchStarterMessage();
      return starterMessage?.content || '';
    }
  } catch (error) {
    console.warn(`Could not fetch appeal starter message for thread ${thread.id}:`, error);
  }

  return '';
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

function buildAppealThreadBody({ appealType, appealId, officerId, submittedAt, answers, strikeLevel, strikeCategory }) {
  const timestamp = Math.floor(submittedAt.getTime() / 1000);
  const lines = [
    `A ${appealType} appeal has been submitted. Please review the information below.`,
    '',
    `Officer: <@${officerId}>`,
    `Officer ID: ${officerId}`,
    `Appeal Type: ${appealType}`,
    `Appeal ID: ${appealId}`,
    ...(strikeLevel ? [`Strike Level: ${strikeLevel}`] : []),
    ...(strikeCategory ? [`Strike Category: ${strikeCategory}`] : []),
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
    await interaction.reply({ content: 'Appeals are not currently enabled.', flags: MessageFlags.Ephemeral });
    return false;
  }

  const allowedRoleIds = [
    ...(serverConfig?.appeals?.reviewerRoleIds || []),
    ...(serverConfig?.appeals?.supervisorRoleIds || [])
  ].filter(isConfiguredId);

  const memberRoles = interaction.member?.roles?.cache;
  const hasPermission = allowedRoleIds.length > 0 && allowedRoleIds.some((roleId) => memberRoles?.has(roleId));

  if (!hasPermission) {
    await interaction.reply({ content: 'You do not have permission to manage appeals.', flags: MessageFlags.Ephemeral });
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

async function closeAppealThread(thread, serverConfig, finalStatus) {
  const result = {
    appliedFinalTag: false,
    appliedClosedTag: false,
    locked: false,
    archived: false,
    warnings: []
  };

  const tagResult = await updateFinalAppealTags(thread, serverConfig, finalStatus);
  result.appliedFinalTag = tagResult.appliedFinalTag;
  result.appliedClosedTag = tagResult.appliedClosedTag;
  result.warnings.push(...tagResult.warnings);

  if (tagResult.warnings.length > 0) {
    await safeThreadSend(thread, 'Warning: this appeal was finalized, but the bot could not apply the final/closed forum tags automatically.');
  }

  if (thread && typeof thread.setLocked === 'function') {
    try {
      await thread.setLocked(true, `Appeal ${finalStatus}.`);
      result.locked = true;
    } catch (error) {
      const warning = `Could not lock appeal thread ${thread.id}:`;
      console.warn(warning, error);
      result.warnings.push('Could not lock the appeal thread.');
      await safeThreadSend(thread, 'Warning: this appeal was finalized, but the bot could not lock this thread automatically.');
    }
  } else {
    result.warnings.push('This channel does not support thread locking.');
  }

  if (thread && typeof thread.setArchived === 'function') {
    try {
      await thread.setArchived(true, `Appeal ${finalStatus}.`);
      result.archived = true;
    } catch (error) {
      const warning = `Could not archive appeal thread ${thread.id}:`;
      console.warn(warning, error);
      result.warnings.push('Could not archive the appeal thread.');
      await safeThreadSend(thread, 'Warning: this appeal was finalized, but the bot could not archive this thread automatically.');
    }
  } else {
    result.warnings.push('This channel does not support thread archiving.');
  }

  return result;
}

function formatCloseResultForReply(result) {
  if (!result) return '';

  const warnings = result.warnings?.length ? ` Warnings: ${result.warnings.join(' ')}` : '';
  return [
    'Thread close result:',
    `final tag ${result.appliedFinalTag ? 'applied' : 'not applied'},`,
    `closed tag ${result.appliedClosedTag ? 'applied' : 'not applied'},`,
    `locked ${result.locked ? 'yes' : 'no'},`,
    `archived ${result.archived ? 'yes' : 'no'}.`
  ].join(' ') + warnings;
}

async function updateFinalAppealTags(thread, serverConfig, finalStatus) {
  const result = {
    appliedFinalTag: false,
    appliedClosedTag: false,
    warnings: []
  };

  if (!thread || typeof thread.setAppliedTags !== 'function') {
    result.warnings.push('This channel does not support forum tags.');
    return result;
  }

  const tags = serverConfig?.appeals?.tags || {};
  const finalTagId = isConfiguredId(tags[finalStatus]) ? tags[finalStatus] : null;
  const closedTagId = isConfiguredId(tags.closed) ? tags.closed : null;
  const currentTags = Array.isArray(thread.appliedTags) ? [...thread.appliedTags] : [];
  const removeTagIds = ['pending', 'underReview', 'infoNeeded']
    .map((name) => tags[name])
    .filter(isConfiguredId);
  const nextTags = currentTags.filter((tagId) => !removeTagIds.includes(tagId));

  if (finalTagId && !nextTags.includes(finalTagId)) nextTags.push(finalTagId);
  if (closedTagId && !nextTags.includes(closedTagId)) nextTags.push(closedTagId);

  try {
    await thread.setAppliedTags(nextTags);
    result.appliedFinalTag = !finalTagId || nextTags.includes(finalTagId);
    result.appliedClosedTag = !closedTagId || nextTags.includes(closedTagId);
  } catch (error) {
    console.warn(`Could not update final appeal forum tags on thread ${thread.id}:`, error);
    if (finalTagId) result.warnings.push(`Could not apply the ${finalStatus} appeal tag.`);
    if (closedTagId) result.warnings.push('Could not apply the closed appeal tag.');
  }

  return result;
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

function getStrikeLevelFromCaseId(caseId) {
  const text = String(caseId || '');
  const match = text.match(/^st([123])-/i) || text.match(/^activity-strike-([123])-/i);
  return match ? Number(match[1]) : null;
}

function isActivityStrikeCaseId(caseId) {
  return /^(AF-|activity-strike)/i.test(String(caseId || ''));
}

function getStrikeCategoryFromCaseId(caseId) {
  return isActivityStrikeCaseId(caseId) ? 'activity' : 'general';
}

function normalizeStrikeCategory(value) {
  return String(value || '').trim().toLowerCase() === 'activity' ? 'activity' : 'general';
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
