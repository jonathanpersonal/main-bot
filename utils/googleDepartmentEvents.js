const { getGoogleConfig, submitBotRequest } = require('./googleWebhook');

function getUserTag(user) {
  if (!user) return null;
  return user.tag || [user.username, user.discriminator && user.discriminator !== '0' ? user.discriminator : null].filter(Boolean).join('#') || null;
}

function buildDepartmentEventPayload({
  actionType,
  interaction,
  guildId,
  channelId,
  commandName,
  submittedByDiscordId,
  submittedByDiscordTag,
  actor,
  target,
  targetDiscordId,
  targetDiscordTag,
  targetName,
  oldRank,
  newRank,
  reason,
  payload = {},
  departmentKey,
  requestFields = {}
} = {}) {
  if (!actionType) throw new Error('Department event actionType is required.');

  const config = getGoogleConfig();
  const actorUser = actor || interaction?.user || null;
  const targetUser = target?.user || target || null;

  return {
    ...requestFields,
    departmentKey: departmentKey || config.departmentKey,
    source: 'DISCORD_BOT',
    actionType,
    submittedByDiscordId: submittedByDiscordId || actorUser?.id || null,
    submittedByDiscordTag: submittedByDiscordTag || getUserTag(actorUser),
    targetDiscordId: targetDiscordId || targetUser?.id || null,
    targetDiscordTag: targetDiscordTag || getUserTag(targetUser),
    targetName: targetName || target?.displayName || targetUser?.displayName || targetUser?.username || null,
    oldRank: oldRank || null,
    newRank: newRank || null,
    reason: reason || null,
    payload: {
      guildId: guildId || interaction?.guildId || interaction?.guild?.id || null,
      channelId: channelId || interaction?.channelId || interaction?.channel?.id || null,
      commandName: commandName || (interaction?.commandName ? `/${interaction.commandName}` : null),
      createdAt: new Date().toISOString(),
      ...payload
    }
  };
}

async function submitDepartmentEvent(options = {}) {
  return submitBotRequest(buildDepartmentEventPayload(options));
}

async function safeSubmitDepartmentEvent(options = {}) {
  try {
    return await submitDepartmentEvent(options);
  } catch (error) {
    console.warn(`Google department event failed for ${options.actionType || 'unknown action'}:`, error);
    return { ok: false, error };
  }
}

function submitRegistrationEvent(options = {}) {
  return submitDepartmentEvent({ ...options, actionType: options.actionType || 'REGISTER_OFFICER' });
}

function submitOfficerManagementEvent(options = {}) {
  return submitDepartmentEvent(options);
}

function submitTrainingEvent(options = {}) {
  return submitDepartmentEvent(options);
}

function submitDutyEvent(options = {}) {
  return submitDepartmentEvent(options);
}

function submitTicketEvent(options = {}) {
  return submitDepartmentEvent(options);
}

function submitAppealEvent(options = {}) {
  return submitDepartmentEvent(options);
}

module.exports = {
  safeSubmitDepartmentEvent,
  submitDepartmentEvent,
  submitRegistrationEvent,
  submitOfficerManagementEvent,
  submitTrainingEvent,
  submitDutyEvent,
  submitTicketEvent,
  submitAppealEvent,
  buildDepartmentEventPayload
};
