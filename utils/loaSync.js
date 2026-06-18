const cron = require('node-cron');
const serverConfig = require('../config/serverConfig');
const { sendDutyLog } = require('./logUtils');
const { safeSubmitDepartmentEvent } = require('./googleDepartmentEvents');
const {
  ensureDutyTables,
  getApprovedLoasForSync,
  markLoaRoleAdded,
  markLoaRoleRemoved,
  updateLoaSyncStatus,
  formatDateOnly
} = require('./dutyUtils');

let schedulerStarted = false;

async function runLoaDailySync(client, options = {}) {
  const { guildId = null, dryRun = false, triggeredBy = 'system' } = options;
  const summary = { dryRun, guildsChecked: 0, added: 0, removed: 0, alreadyCorrect: 0, skipped: 0, errors: 0, details: [] };
  const checkedGuilds = new Set();

  try {
    await ensureDutyTables();
    const loas = await getApprovedLoasForSync(guildId);
    const today = formatDateOnly(new Date());

    for (const loa of loas) {
      checkedGuilds.add(loa.guild_id);
      const loaConfig = serverConfig?.duty?.loa || {};
      const loaRoleId = loaConfig.loaRoleId;

      try {
        if (!loaRoleId) {
          summary.skipped += 1;
          addDetail(summary, loa, 'skipped', 'LOA role is not configured.');
          if (!dryRun) await updateLoaSyncStatus({ loaId: loa.loa_id, status: 'skipped_no_role', error: null });
          continue;
        }

        const guild = client.guilds.cache.get(loa.guild_id) || await client.guilds.fetch(loa.guild_id).catch(() => null);
        if (!guild) {
          summary.errors += 1;
          addDetail(summary, loa, 'error', 'Guild could not be fetched.');
          if (!dryRun) await updateLoaSyncStatus({ loaId: loa.loa_id, status: 'error', error: 'Guild could not be fetched.' });
          continue;
        }

        const member = await guild.members.fetch(loa.user_id).catch(() => null);
        if (!member) {
          summary.errors += 1;
          addDetail(summary, loa, 'error', 'Member could not be fetched.');
          if (!dryRun) await updateLoaSyncStatus({ loaId: loa.loa_id, status: 'error', error: 'Member could not be fetched.' });
          continue;
        }

        const shouldHaveRole = today >= formatDateOnly(loa.start_date) && today <= formatDateOnly(loa.end_date);
        const hasRole = member.roles.cache.has(loaRoleId);

        if (shouldHaveRole && !hasRole) {
          if (dryRun) {
            summary.added += 1;
            addDetail(summary, loa, 'would_add', `Would add LOA role to <@${loa.user_id}>.`);
          } else {
            await member.roles.add(loaRoleId, `Active approved LOA ${loa.loa_id}`);
            await markLoaRoleAdded({ loaId: loa.loa_id });
            await updateLoaSyncStatus({ loaId: loa.loa_id, status: 'role_added', error: null });
            summary.added += 1;
            addDetail(summary, loa, 'added', `Added LOA role to <@${loa.user_id}>.`);
            await sendDutyLog({ guild, serverConfig, title: 'LOA role added by daily sync', fields: basicFields(loa, triggeredBy, dryRun) });
            await submitLoaSyncGoogleEvent({ loa, guild, member, triggeredBy, syncAction: 'role_added' });
          }
        } else if (!shouldHaveRole && hasRole) {
          if (dryRun) {
            summary.removed += 1;
            addDetail(summary, loa, 'would_remove', `Would remove LOA role from <@${loa.user_id}>.`);
          } else {
            await member.roles.remove(loaRoleId, `LOA not active today ${loa.loa_id}`);
            await markLoaRoleRemoved({ loaId: loa.loa_id });
            await updateLoaSyncStatus({ loaId: loa.loa_id, status: 'role_removed', error: null });
            summary.removed += 1;
            addDetail(summary, loa, 'removed', `Removed LOA role from <@${loa.user_id}>.`);
            await sendDutyLog({ guild, serverConfig, title: 'LOA role removed by daily sync', fields: basicFields(loa, triggeredBy, dryRun) });
            await submitLoaSyncGoogleEvent({ loa, guild, member, triggeredBy, syncAction: 'role_removed' });
          }
        } else {
          summary.alreadyCorrect += 1;
          addDetail(summary, loa, 'already_correct', `LOA role state is already correct for <@${loa.user_id}>.`);
          if (!dryRun) await updateLoaSyncStatus({ loaId: loa.loa_id, status: 'already_correct', error: null });
        }
      } catch (error) {
        summary.errors += 1;
        addDetail(summary, loa, 'error', error.message || String(error));
        console.warn(`LOA sync error for ${loa.loa_id}:`, error);
        if (!dryRun) await updateLoaSyncStatus({ loaId: loa.loa_id, status: 'error', error });
      }
    }

    summary.guildsChecked = checkedGuilds.size;
    await sendSyncSummaryLog(client, guildId, summary, triggeredBy);
    return summary;
  } catch (error) {
    summary.errors += 1;
    addDetail(summary, { loa_id: 'system', user_id: null }, 'error', error.message || String(error));
    console.error('LOA daily sync failed:', error);
    return summary;
  }
}

function startLoaDailySyncScheduler(client) {
  const syncConfig = serverConfig?.duty?.loa?.dailySync || {};
  if (schedulerStarted || !serverConfig?.duty?.loa?.enabled || !syncConfig.enabled) return;
  schedulerStarted = true;

  if (syncConfig.runOnStartup) {
    runLoaDailySync(client, { dryRun: false, triggeredBy: 'startup' }).catch((error) => console.error('Startup LOA sync failed:', error));
  }

  const [hour, minute] = String(syncConfig.time || '09:00').split(':');
  cron.schedule(`${Number(minute) || 0} ${Number(hour) || 9} * * *`, () => {
    runLoaDailySync(client, { dryRun: false, triggeredBy: 'scheduled' }).catch((error) => console.error('Scheduled LOA sync failed:', error));
  }, { timezone: syncConfig.timezone || 'America/New_York' });
}

async function submitLoaSyncGoogleEvent({ loa, guild, member, triggeredBy, syncAction }) {
  return safeSubmitDepartmentEvent({
    actionType: 'LOA_SYNC_RUN',
    guildId: guild?.id || loa.guild_id,
    commandName: 'LOA_SYNC_RUN',
    submittedByDiscordId: String(triggeredBy || 'system'),
    targetDiscordId: loa.user_id,
    targetName: member?.displayName || member?.user?.username || null,
    payload: {
      loaId: loa.loa_id,
      syncAction,
      loaStatus: loa.status || 'approved',
      startDate: formatDateOnly(loa.start_date),
      endDate: formatDateOnly(loa.end_date),
      durationDays: loa.duration_days,
      triggeredBy: String(triggeredBy || 'system')
    }
  });
}

async function sendSyncSummaryLog(client, guildId, summary, triggeredBy) {
  const guildIds = guildId ? [guildId] : [...new Set(client.guilds.cache.map((guild) => guild.id))];
  for (const id of guildIds) {
    const guild = client.guilds.cache.get(id) || await client.guilds.fetch(id).catch(() => null);
    if (!guild) continue;
    await sendDutyLog({
      guild,
      serverConfig,
      title: summary.dryRun ? 'LOA daily sync dry run completed' : 'LOA daily sync completed',
      fields: [
        { name: 'Triggered by', value: String(triggeredBy), inline: true },
        { name: 'Mode', value: summary.dryRun ? 'Dry Run' : 'Live', inline: true },
        { name: 'Added', value: String(summary.added), inline: true },
        { name: 'Removed', value: String(summary.removed), inline: true },
        { name: 'Already correct', value: String(summary.alreadyCorrect), inline: true },
        { name: 'Skipped', value: String(summary.skipped), inline: true },
        { name: 'Errors', value: String(summary.errors), inline: true }
      ]
    });
  }
}

function basicFields(loa, triggeredBy, dryRun) {
  return [
    { name: 'LOA ID', value: loa.loa_id, inline: true },
    { name: 'Officer', value: `<@${loa.user_id}>`, inline: true },
    { name: 'Triggered by', value: String(triggeredBy), inline: true },
    { name: 'Mode', value: dryRun ? 'Dry Run' : 'Live', inline: true }
  ];
}

function addDetail(summary, loa, action, message) {
  summary.details.push({ loaId: loa.loa_id, userId: loa.user_id, action, message });
}

module.exports = { runLoaDailySync, startLoaDailySyncScheduler };
