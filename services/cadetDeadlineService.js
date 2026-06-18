const cron = require('node-cron');
const { getServerConfig } = require('../utils/configUtils');
const { applyConfiguredRoleChanges } = require('../utils/roleUtils');
const { safeSubmitDepartmentEvent } = require('../utils/googleDepartmentEvents');
const store = require('../utils/workflowStore');
const { cleanRoleIds } = require('../utils/permissionUtils');
const { safeDm, logWorkflow, fmt } = require('../utils/trainingWorkflowUtils');
let task = null;
function daysUntil(date) { return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000); }
function shouldRemind(c, days) { if (days < 0 || days > 3) return false; if (!c.reminderLastSentAt) return true; return new Date(c.reminderLastSentAt).toDateString() !== new Date().toDateString(); }
async function runCadetDeadlineCheck(client) {
  const config = getServerConfig(); const t = config.training || config.trainingManagement || {}; const dc = t.deadlineCheck || {}; if (dc.enabled === false) return { skipped: true };
  const guildId = config.guildId || process.env.GUILD_ID; const guild = guildId ? await client.guilds.fetch(guildId).catch(() => null) : Array.from(client.guilds.cache.values())[0]; if (!guild) return { skipped: true, reason: 'No guild' };
  let reminded = 0; let terminated = 0;
  for (const cadet of store.listCadets(guild.id)) {
    if (!cadet.deadlineAt) continue; const d = daysUntil(cadet.deadlineAt);
    const member = await guild.members.fetch(cadet.discordId).catch(() => null);
    if (shouldRemind(cadet, dc.reminderDaysBeforeDeadline ?? t.cadetReminderDays ?? 3)) {
      const msg = fmt(t.messages?.cadetDeadlineReminder || 'Reminder: your cadet training deadline is {deadline}. Roster: {publicRosterUrl}', { deadline: new Date(cadet.deadlineAt).toLocaleDateString(), publicRosterUrl: t.publicRosterUrl || 'PUBLIC_ROSTER_URL_PLACEHOLDER' });
      if (member) await safeDm(member.user, msg);
      store.upsertCadet(guild.id, cadet.discordId, { reminderLastSentAt: new Date().toISOString() }, { action: 'CADET_DEADLINE_REMINDER_SENT', actorDiscordId: client.user.id });
      await safeSubmitDepartmentEvent({ actionType: 'CADET_DEADLINE_REMINDER_SENT', guildId: guild.id, actor: client.user, targetDiscordId: cadet.discordId, reason: 'Cadet deadline reminder', payload: { cadet } });
      await logWorkflow(guild, config, `Cadet deadline reminder sent for <@${cadet.discordId}>. Deadline: ${cadet.deadlineAt}`);
      reminded++;
    }
    if ((dc.autoTerminatePastDeadline ?? true) && d < 0) {
      const reason = dc.terminationReason || 'Failure to complete training - may reapply in 7 days.';
      let roleResult = { added: [], removed: [], skipped: [], failed: [] };
      if (member) roleResult = await applyConfiguredRoleChanges(member, { addRoleIds: cleanRoleIds([config.department?.previousOfficerRoleId, config.roles?.previousOfficerRoleId, config.roles?.civilianRoleId]), removeRoleIds: cleanRoleIds([...(t.cadetRoleIds || []), ...(t.applicantRoleIds || []), ...(t.trainingRoleIds || [])]), reason });
      if (member) await safeDm(member.user, fmt(t.messages?.cadetAutoTerminated || 'Your cadet status has been removed. Reason: {reason}', { reason }));
      const updated = store.upsertCadet(guild.id, cadet.discordId, { status: 'TERMINATED', terminatedAt: new Date().toISOString(), terminationReason: reason }, { action: 'CADET_AUTO_TERMINATED', actorDiscordId: client.user.id, reason });
      await safeSubmitDepartmentEvent({ actionType: 'CADET_AUTO_TERMINATED', guildId: guild.id, actor: client.user, targetDiscordId: cadet.discordId, reason, payload: { cadet: updated, roleResult, reapplyAfterDays: dc.reapplyAfterDays ?? 7 } });
      await logWorkflow(guild, config, `Cadet auto-terminated: <@${cadet.discordId}>. Reason: ${reason}`);
      terminated++;
    }
  }
  return { reminded, terminated };
}
function startCadetDeadlineService(client) { const c = getServerConfig(); const dc = (c.training || c.trainingManagement || {}).deadlineCheck || {}; if (dc.enabled === false) return false; if (dc.runOnStartup !== false) runCadetDeadlineCheck(client).catch((e) => console.error('Cadet deadline startup check failed:', e)); if (!task) { task = cron.schedule(dc.dailyTime || '0 9 * * *', () => runCadetDeadlineCheck(client).catch((e) => console.error('Cadet deadline check failed:', e)), { timezone: dc.timezone || 'UTC' }); } return true; }
module.exports = { startCadetDeadlineService, runCadetDeadlineCheck, daysUntil };
