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
const { safeSubmitDepartmentEvent } = require('../utils/googleDepartmentEvents');
const { sendApplicationReviewLog, sendCadetTrainingLog } = require('../utils/logUtils');
const { applyConfiguredRoleChanges, formatRoleChangeResult } = require('../utils/roleUtils');

const pendingTrainingActions = new Map();
const FLOW_LABELS = { app: 'Application Review', cadet: 'Cadet Training' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('training-management')
    .setDescription('Manage application review and cadet training workflows.')
    .addStringOption((option) => option
      .setName('action')
      .setDescription('The training management workflow to start.')
      .setRequired(true)
      .addChoices(
        { name: 'Application Review', value: 'application_review' },
        { name: 'Cadet Training', value: 'cadet_training' }
      ))
    .addUserOption((option) => option
      .setName('officer')
      .setDescription('The officer/cadet to review.')
      .setRequired(true)),

  async execute(interaction) {
    const serverConfig = getServerConfig();
    const trainingConfig = serverConfig.trainingManagement || {};
    const action = interaction.options.getString('action');
    const officerUser = interaction.options.getUser('officer');

    if (!interaction.guild) {
      return interaction.reply({ content: 'This command can only be used inside a Discord server.', ephemeral: true });
    }

    if (trainingConfig.enabled === false) {
      return interaction.reply({ content: 'Training management is currently disabled for this server.', ephemeral: true });
    }

    if (!memberCanUseTraining(interaction.member, serverConfig)) {
      return interaction.reply({ content: 'You are not authorized to use training management.', ephemeral: true });
    }

    const sessionId = createSessionId();
    pendingTrainingActions.set(sessionId, {
      staffUserId: interaction.user.id,
      officerUserId: officerUser.id,
      createdAt: Date.now(),
      flow: action === 'application_review' ? 'app' : 'cadet',
      details: {}
    });

    if (action === 'application_review') {
      return interaction.reply({
        content: `Select application decision for ${officerUser}.`,
        components: [buildApplicationDecisionRow({ serverConfig, sessionId, staffId: interaction.user.id, officerId: officerUser.id })],
        ephemeral: true
      });
    }

    return interaction.reply({
      content: buildCadetGuideMessage(serverConfig, officerUser),
      components: buildCadetStartRows({ serverConfig, sessionId, staffId: interaction.user.id, officerId: officerUser.id }),
      ephemeral: true
    });
  },

  async handleSelectMenu(interaction) {
    if (interaction.customId.startsWith('training_app_decision:')) return handleApplicationDecisionSelect(interaction);
    if (interaction.customId.startsWith('training_cadet_outcome:')) return handleCadetOutcomeSelect(interaction);
    return false;
  },

  async handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('training_app_modal:')) return handleApplicationModal(interaction);
    if (interaction.customId.startsWith('training_cadet_review_modal:')) return handleCadetReviewModal(interaction);
    if (interaction.customId.startsWith('training_cadet_extra_modal:')) return handleCadetExtraModal(interaction);
    return false;
  },

  async handleButton(interaction) {
    if (interaction.customId.startsWith('training_cadet_start:')) return handleCadetStartButton(interaction);
    if (interaction.customId.startsWith('training_cancel:')) return handleTrainingCancel(interaction);
    if (interaction.customId.startsWith('training_confirm:')) return handleTrainingConfirm(interaction);
    return false;
  }
};

function memberCanUseTraining(member, serverConfig) {
  const cfg = serverConfig.trainingManagement || {};
  const configured = unique([...(cfg.allowedRoleIds || []), ...(cfg.ftoRoleIds || []), ...(cfg.ftoCommandRoleIds || [])]);
  const fallback = unique([...(serverConfig.appeals?.reviewerRoleIds || []), ...(serverConfig.appeals?.supervisorRoleIds || []), serverConfig.appeals?.commandRoleId]);
  const allowed = configured.length > 0 ? configured : fallback;
  if (allowed.length === 0) return member.permissions.has(PermissionFlagsBits.ManageRoles);
  return allowed.some((roleId) => member.roles.cache.has(roleId));
}

async function handleApplicationDecisionSelect(interaction) {
  const [, staffId, officerId, sessionId] = interaction.customId.split(':');
  const state = getStateOrReply(interaction, sessionId, staffId, officerId);
  if (!state) return true;
  const decisionId = interaction.values[0];
  state.outcomeId = decisionId;
  return interaction.showModal(buildApplicationModal(decisionId, staffId, officerId, sessionId));
}

async function handleApplicationModal(interaction) {
  const [, decisionId, staffId, officerId, sessionId] = interaction.customId.split(':');
  const state = getStateOrReply(interaction, sessionId, staffId, officerId);
  if (!state) return true;
  state.outcomeId = decisionId;
  state.details = getApplicationModalDetails(interaction, decisionId);
  await interaction.reply({ content: buildConfirmationMessage({ state, serverConfig: getServerConfig() }), components: [buildConfirmRow('app', decisionId, staffId, officerId, sessionId)], ephemeral: true });
  return true;
}

async function handleCadetStartButton(interaction) {
  const [, staffId, officerId, sessionId] = interaction.customId.split(':');
  const state = getStateOrReply(interaction, sessionId, staffId, officerId);
  if (!state) return true;
  return interaction.showModal(buildCadetReviewModal(staffId, officerId, sessionId));
}

async function handleCadetReviewModal(interaction) {
  const [, staffId, officerId, sessionId] = interaction.customId.split(':');
  const state = getStateOrReply(interaction, sessionId, staffId, officerId);
  if (!state) return true;
  state.details = {
    rating: getField(interaction, 'rating'),
    performanceComments: getField(interaction, 'performanceComments'),
    whatWentWell: getField(interaction, 'whatWentWell'),
    improvementNotes: getField(interaction, 'improvementNotes'),
    additionalNotes: getField(interaction, 'additionalNotes')
  };
  await interaction.reply({ content: `Choose training outcome for <@${officerId}>.`, components: [buildCadetOutcomeRow({ serverConfig: getServerConfig(), sessionId, staffId, officerId })], ephemeral: true });
  return true;
}

async function handleCadetOutcomeSelect(interaction) {
  const [, staffId, officerId, sessionId] = interaction.customId.split(':');
  const state = getStateOrReply(interaction, sessionId, staffId, officerId);
  if (!state) return true;
  const outcomeId = interaction.values[0];
  state.outcomeId = outcomeId;
  if (outcomeId === 'pass') {
    return interaction.update({ content: buildConfirmationMessage({ state, serverConfig: getServerConfig() }), components: [buildConfirmRow('cadet', outcomeId, staffId, officerId, sessionId)] });
  }
  return interaction.showModal(buildCadetExtraModal(outcomeId, staffId, officerId, sessionId));
}

async function handleCadetExtraModal(interaction) {
  const [, outcomeId, staffId, officerId, sessionId] = interaction.customId.split(':');
  const state = getStateOrReply(interaction, sessionId, staffId, officerId);
  if (!state) return true;
  Object.assign(state.details, getCadetExtraModalDetails(interaction, outcomeId));
  await interaction.reply({ content: buildConfirmationMessage({ state, serverConfig: getServerConfig() }), components: [buildConfirmRow('cadet', outcomeId, staffId, officerId, sessionId)], ephemeral: true });
  return true;
}

async function handleTrainingCancel(interaction) {
  const [, flow, outcomeId, staffId, officerId, sessionId] = interaction.customId.split(':');
  const state = getStateOrReply(interaction, sessionId, staffId, officerId);
  if (!state) return true;
  pendingTrainingActions.delete(sessionId);
  await interaction.update({ content: `${FLOW_LABELS[flow]} cancelled. No roles were changed, no DMs were sent, and no staff log was created.`, components: [] });
  return true;
}

async function handleTrainingConfirm(interaction) {
  const [, flow, outcomeId, staffId, officerId, sessionId] = interaction.customId.split(':');
  const state = getStateOrReply(interaction, sessionId, staffId, officerId);
  if (!state) return true;
  await interaction.deferUpdate();
  const serverConfig = getServerConfig();
  const officerUser = await interaction.client.users.fetch(officerId);
  const officerMember = await interaction.guild.members.fetch(officerId);
  const cfg = getOutcomeConfig(serverConfig, flow, outcomeId);
  const roleResult = await applyConfiguredRoleChanges(officerMember, {
    addRoleIds: cfg.addRoleIds || [],
    removeRoleIds: cfg.removeRoleIds || [],
    reason: `${FLOW_LABELS[flow]} ${cfg.label || outcomeId} by ${interaction.user.tag}`
  });
  const dmStatus = await sendTrainingDm({ officerUser, serverConfig, flow, outcomeId, outcomeConfig: cfg, details: state.details, roleResult });
  const logFn = flow === 'app' ? sendApplicationReviewLog : sendCadetTrainingLog;
  await logFn({ guild: interaction.guild, serverConfig, officerUser, staffUser: interaction.user, outcomeId, outcomeLabel: cfg.label || outcomeId, details: state.details, roleResult, dmStatus, ftoCommandMentions: buildFtoMentions(serverConfig, cfg), changedAt: new Date() });
  const googleResult = await submitAcceptedForTrainingEvent({
    interaction,
    officerUser,
    officerMember,
    flow,
    outcomeId,
    outcomeConfig: cfg,
    details: state.details,
    roleResult,
    dmStatus
  });
  // TODO: Later send cadet training pass/fail/incomplete result to Google.
  // TODO: Later send cadet training pass to Google webhook for callsign assignment.
  // TODO: Later handle Google response and DM officer with assigned callsign.
  // TODO: Later trigger probationary officer sequence.
  // TODO: Later handle Google callsign assignment response.
  // TODO: Later handle Steam group permission request if needed.
  pendingTrainingActions.delete(sessionId);
  await interaction.editReply({ content: buildSuccessMessage({ flow, officerUser, cfg, roleResult, dmStatus, googleResult }), components: [] });
  return true;
}

async function submitAcceptedForTrainingEvent({ interaction, officerUser, officerMember, flow, outcomeId, outcomeConfig, details, roleResult, dmStatus }) {
  if (!isAcceptedForTrainingDecision(flow, outcomeId, outcomeConfig)) {
    return null;
  }

  const acceptedAt = new Date().toISOString();
  const cleanDisplayName = cleanName(officerMember?.displayName || officerUser.globalName || officerUser.username);

  return safeSubmitDepartmentEvent({
    actionType: 'APPLICATION_ACCEPTED_FOR_TRAINING',
    interaction,
    actor: interaction.user,
    target: officerMember || officerUser,
    targetDiscordId: officerUser.id,
    targetDiscordTag: getUserTag(officerUser),
    targetName: cleanDisplayName || officerMember?.displayName || officerUser.username,
    reason: firstUseful(details.reason, details.notes, details.comments),
    payload: {
      flow: 'accepted_for_training',
      decisionId: outcomeId,
      decisionLabel: outcomeConfig.label || outcomeId,
      officerDiscordId: officerUser.id,
      officerTag: getUserTag(officerUser),
      officerDisplayName: officerMember?.displayName || officerUser.globalName || officerUser.username,
      cleanDisplayName,
      staffDiscordId: interaction.user.id,
      staffTag: getUserTag(interaction.user),
      reason: firstUseful(details.reason, details.notes),
      comments: firstUseful(details.comments, details.instructions),
      roleResult,
      dmSent: dmStatus === 'Yes',
      acceptedAt,
      trainingType: 'Application Accepted For Training',
      status: 'Pending Training',
      cadetTracker: {
        discordId: officerUser.id,
        name: cleanDisplayName || officerMember?.displayName || officerUser.username,
        dateJoined: acceptedAt,
        trained: false,
        status: 'Pending Training'
      }
    }
  });
}

function buildApplicationDecisionRow({ serverConfig, sessionId, staffId, officerId }) {
  const decisions = serverConfig.trainingManagement?.applicationReview?.decisions || {};
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`training_app_decision:${staffId}:${officerId}:${sessionId}`)
    .setPlaceholder('Select application decision')
    .addOptions(...Object.entries(decisions).slice(0, 25).map(([id, cfg]) => ({ label: cfg.label || id, value: id }))));
}

function buildCadetOutcomeRow({ serverConfig, sessionId, staffId, officerId }) {
  const outcomes = serverConfig.trainingManagement?.cadetTraining?.outcomes || {};
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`training_cadet_outcome:${staffId}:${officerId}:${sessionId}`)
    .setPlaceholder('Choose training outcome')
    .addOptions(...Object.entries(outcomes).slice(0, 25).map(([id, cfg]) => ({ label: cfg.label || id, value: id }))));
}

function buildCadetStartRows({ serverConfig, sessionId, staffId, officerId }) {
  const row = new ActionRowBuilder();
  const guideUrl = serverConfig.trainingManagement?.trainingGuideUrl;
  if (guideUrl && !guideUrl.startsWith('PUT_')) row.addComponents(new ButtonBuilder().setLabel('Open Training Guide').setStyle(ButtonStyle.Link).setURL(guideUrl));
  row.addComponents(new ButtonBuilder().setCustomId(`training_cadet_start:${staffId}:${officerId}:${sessionId}`).setLabel('Review Cadet').setStyle(ButtonStyle.Primary));
  row.addComponents(new ButtonBuilder().setCustomId(`training_cancel:cadet:start:${staffId}:${officerId}:${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary));
  return [row];
}

function buildApplicationModal(decisionId, staffId, officerId, sessionId) {
  const modal = new ModalBuilder().setCustomId(`training_app_modal:${decisionId}:${staffId}:${officerId}:${sessionId}`).setTitle('Application Review');
  const fields = decisionId === 'approved'
    ? [['notes', 'Application notes'], ['comments', 'Reviewer comments'], ['instructions', 'Special instructions']]
    : decisionId === 'denied'
      ? [['reason', 'Reason for denial'], ['canReapply', 'Can they reapply?'], ['comments', 'Additional comments']]
      : [['reason', 'Reason for hold'], ['reviewNeeded', 'What needs to be reviewed'], ['comments', 'Notes for command/FTO']];
  fields.forEach(([id, label], index) => modal.addComponents(new ActionRowBuilder().addComponents(input(id, label, index === 0))));
  return modal;
}

function buildCadetReviewModal(staffId, officerId, sessionId) {
  const modal = new ModalBuilder().setCustomId(`training_cadet_review_modal:${staffId}:${officerId}:${sessionId}`).setTitle('Cadet Review');
  [['rating', 'Performance rating 1-10', TextInputStyle.Short], ['performanceComments', 'Comments on cadet performance', TextInputStyle.Paragraph], ['whatWentWell', 'What went well', TextInputStyle.Paragraph], ['improvementNotes', 'What needs improvement', TextInputStyle.Paragraph], ['additionalNotes', 'Additional notes', TextInputStyle.Paragraph]].forEach(([id, label, style]) => modal.addComponents(new ActionRowBuilder().addComponents(input(id, label, id === 'rating', style))));
  return modal;
}

function buildCadetExtraModal(outcomeId, staffId, officerId, sessionId) {
  const modal = new ModalBuilder().setCustomId(`training_cadet_extra_modal:${outcomeId}:${staffId}:${officerId}:${sessionId}`).setTitle('Training Outcome Details');
  const fields = outcomeId === 'pendingReview'
    ? [['reason', 'Why is review needed?'], ['performanceSummary', 'Summary of performance'], ['recommendation', 'Recommendation'], ['comments', 'Notes for FTO Command']]
    : outcomeId === 'fail'
      ? [['reason', 'Reason for failure'], ['improvementNotes', 'What needs improvement'], ['canRetry', 'Can they retry?'], ['additionalNotes', 'Additional notes']]
      : [['reason', 'Why was training incomplete?'], ['stoppedAt', 'Where did they stop?'], ['restart', 'Restart from beginning?'], ['additionalNotes', 'Notes']];
  fields.forEach(([id, label], index) => modal.addComponents(new ActionRowBuilder().addComponents(input(id, label, index === 0))));
  return modal;
}

function input(id, label, required, style = TextInputStyle.Paragraph) { return new TextInputBuilder().setCustomId(id).setLabel(label).setRequired(required).setStyle(style).setMaxLength(1000); }
function getField(interaction, id) { try { return interaction.fields.getTextInputValue(id) || 'None provided.'; } catch { return 'None provided.'; } }
function getApplicationModalDetails(interaction, decisionId) { return { notes: getField(interaction, 'notes'), reason: getField(interaction, 'reason'), canReapply: getField(interaction, 'canReapply'), reviewNeeded: getField(interaction, 'reviewNeeded'), comments: getField(interaction, 'comments'), instructions: getField(interaction, 'instructions') }; }
function getCadetExtraModalDetails(interaction) { return { reason: getField(interaction, 'reason'), improvementNotes: getField(interaction, 'improvementNotes'), canRetry: getField(interaction, 'canRetry'), stoppedAt: getField(interaction, 'stoppedAt'), restart: getField(interaction, 'restart'), performanceSummary: getField(interaction, 'performanceSummary'), recommendation: getField(interaction, 'recommendation'), comments: getField(interaction, 'comments'), additionalNotes: getField(interaction, 'additionalNotes') }; }

function buildConfirmRow(flow, outcomeId, staffId, officerId, sessionId) { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`training_confirm:${flow}:${outcomeId}:${staffId}:${officerId}:${sessionId}`).setLabel('Confirm').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`training_cancel:${flow}:${outcomeId}:${staffId}:${officerId}:${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)); }
function getOutcomeConfig(serverConfig, flow, outcomeId) { return flow === 'app' ? serverConfig.trainingManagement?.applicationReview?.decisions?.[outcomeId] || {} : serverConfig.trainingManagement?.cadetTraining?.outcomes?.[outcomeId] || {}; }
function buildCadetGuideMessage(serverConfig, officerUser) { const cfg = serverConfig.trainingManagement?.cadetTraining || {}; return [`**${cfg.guideTitle || 'Cadet Training Directions/Information'}**`, `Officer: ${officerUser}`, '', cfg.guideMessage || 'No guide message is configured.'].join('\n'); }
function buildConfirmationMessage({ state, serverConfig }) { const cfg = getOutcomeConfig(serverConfig, state.flow, state.outcomeId); const lines = [`Please confirm this ${FLOW_LABELS[state.flow]} action:`, '', `Officer: <@${state.officerUserId}>`, `Staff member: <@${state.staffUserId}>`, state.flow === 'cadet' ? 'Training type: Cadet Training' : null, `Decision/Outcome: ${cfg.label || state.outcomeId}`, '', ...Object.entries(state.details || {}).filter(([,v]) => v && v !== 'None provided.').map(([k,v]) => `${labelize(k)}: ${v}`), '', `Roles to add: ${formatRoleIds(cfg.addRoleIds)}`, `Roles to remove: ${formatRoleIds(cfg.removeRoleIds)}`, '', 'No changes have been made yet.']; return lines.filter(Boolean).join('\n'); }
function buildSuccessMessage({ flow, officerUser, cfg, roleResult, dmStatus, googleResult }) { const roleSummary = formatRoleChangeResult(roleResult); return [`${FLOW_LABELS[flow]} completed for ${officerUser}.`, `Outcome: ${cfg.label || 'Unknown'}`, `DM sent: ${dmStatus}`, googleResult ? `Google CadetTracker event: ${formatGoogleResult(googleResult)}` : null, '', roleSummary, '', roleResult.failed.length ? 'Warning: Some role changes failed. The decision was logged, but review the failures above.' : 'Staff log was attempted.'].filter(Boolean).join('\n'); }
async function sendTrainingDm({ officerUser, serverConfig, flow, outcomeId, outcomeConfig, details, roleResult }) { const globalDm = serverConfig.trainingManagement?.dmEnabled !== false; if (!globalDm || outcomeConfig.dmEnabled === false || !outcomeConfig.dmMessage) return 'Disabled'; const values = buildDmValues({ officerUser, serverConfig, details, roleResult }); try { await officerUser.send({ content: formatTemplate(outcomeConfig.dmMessage, values) }); return 'Yes'; } catch (error) { console.warn(`Could not DM officer for training ${flow}/${outcomeId}:`, error); return 'No'; } }
function buildDmValues({ officerUser, serverConfig, details, roleResult }) { const departmentName = serverConfig.trainingManagement?.departmentName || serverConfig.officerManagement?.departmentName || serverConfig.departmentName || 'the department'; return { officerName: officerUser.globalName || officerUser.username || officerUser.tag || String(officerUser.id), departmentName, commandTeamName: serverConfig.trainingManagement?.commandTeamName || serverConfig.officerManagement?.commandTeamName || `${departmentName} Command Team`, trainingName: 'Cadet Training', trainerName: '', rating: details.rating || '', performanceComments: details.performanceComments || '', whatWentWell: details.whatWentWell || '', improvementNotes: details.improvementNotes || '', additionalNotes: details.additionalNotes || '', reason: details.reason || 'None provided.', comments: details.comments || details.performanceSummary || 'None provided.', callsignLine: 'Your callsign will be assigned later by command.', roleChangeSummary: formatRoleChangeResult(roleResult) }; }
function formatTemplate(template, values) { return template.replace(/\{([a-zA-Z]+)\}/g, (match, key) => values[key] ?? match); }
function getStateOrReply(interaction, sessionId, staffId, officerId) { const state = pendingTrainingActions.get(sessionId); if (!state || state.staffUserId !== interaction.user.id || state.staffUserId !== staffId || state.officerUserId !== officerId) { interaction.reply({ content: 'This training management workflow expired or does not belong to you. Please run the command again.', ephemeral: true }).catch(() => {}); return null; } return state; }
function createSessionId() { return `tm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function unique(values) { return [...new Set(values.filter((value) => value && typeof value === 'string' && !value.startsWith('PUT_') && !value.startsWith('PASTE_')))]; }
function formatRoleIds(roleIds = []) { return unique(roleIds).map((id) => `<@&${id}>`).join(', ') || 'None'; }
function labelize(value) { return value.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()); }
function buildFtoMentions(serverConfig, cfg) { if (!cfg.pingFtoCommand) return ''; const ids = unique(serverConfig.trainingManagement?.ftoCommandRoleIds || []); return ids.map((id) => `<@&${id}>`).join(' '); }
function getUserTag(user) { return user?.tag || [user?.username, user?.discriminator && user.discriminator !== '0' ? user.discriminator : null].filter(Boolean).join('#') || null; }
function isAcceptedForTrainingDecision(flow, outcomeId, cfg = {}) { return flow === 'app' && (cfg.acceptedForTraining === true || cfg.googleActionType === 'APPLICATION_ACCEPTED_FOR_TRAINING' || (outcomeId === 'approved' && cfg.acceptedForTraining !== false)); }
function firstUseful(...values) { return values.find((value) => value && value !== 'None provided.') || null; }
function cleanName(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function formatGoogleResult(result) { if (!result) return 'Not submitted'; if (result.ok) return result.requestId ? `Submitted (${result.requestId})` : 'Submitted'; if (result.pending) return 'Pending; Google request timed out'; if (result.busy) return 'Pending; Google was busy'; return `Failed (${result.error?.message || 'see logs'})`; }
