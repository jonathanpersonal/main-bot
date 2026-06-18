const cron = require('node-cron');
const { getServerConfig } = require('../utils/configUtils');
const { safeSubmitDepartmentEvent } = require('../utils/googleDepartmentEvents');
const store = require('../utils/workflowStore');
const { safeListActiveProbation } = require('../utils/googleWorkflowStore');
const { countExistingRideAlongs } = require('../utils/probationDataUtils');
const { addDays, logWorkflow } = require('../utils/trainingWorkflowUtils');

let task = null;

function isPast(date) {
  if (!date) return false;
  const parsed = new Date(date);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
}

async function rideAlongCountFor(guildId, probation) {
  const sqlCount = await countExistingRideAlongs(guildId, probation.discordId);
  if (sqlCount !== null) return Math.max(sqlCount, Number(probation.rideAlongCount || 0));
  return Number(probation.rideAlongCount || 0);
}

async function runProbationCheck(client) {
  const config = getServerConfig();
  const p = config.probation || {};
  if (p.enabled === false) return { skipped: true };

  const guildId = config.guildId || process.env.GUILD_ID;
  const guild = guildId ? await client.guilds.fetch(guildId).catch(() => null) : Array.from(client.guilds.cache.values())[0];
  if (!guild) return { skipped: true, reason: 'No guild' };

  const googleRecords = await safeListActiveProbation(guild.id);
  const records = googleRecords || store.listProbation(guild.id);
  let cycleFailed = 0;
  let removalRequested = 0;

  for (const probation of records) {
    if (!isPast(probation.cycleEndAt)) continue;

    const rideAlongCount = await rideAlongCountFor(guild.id, probation);
    const requiredRideAlongCount = Number(p.requiredRideAlongCount ?? 1);
    if (rideAlongCount >= requiredRideAlongCount) continue;

    const currentCycle = Number(probation.cycleNumber || 1);
    const maxCycles = Number(probation.maxCycles || p.maxCycles || 2);
    const actionType = currentCycle >= maxCycles ? 'PROBATION_REMOVAL_REQUESTED' : 'PROBATION_CYCLE_FAILED';
    const reason = currentCycle >= maxCycles
      ? 'Probation maximum cycles reached without required ride-alongs.'
      : 'Probation cycle ended without required ride-alongs.';

    const update = currentCycle >= maxCycles
      ? { status: 'REMOVAL_REQUESTED', finalDecision: 'request-removal', rideAlongCount, updatedBy: client.user.id, notes: [probation.notes, reason].filter(Boolean).join('\n') }
      : { status: 'ACTIVE', cycleNumber: currentCycle + 1, cycleStartAt: new Date().toISOString(), cycleEndAt: addDays(new Date(), p.cycleDays ?? 4).toISOString(), rideAlongCount, updatedBy: client.user.id, notes: [probation.notes, reason].filter(Boolean).join('\n') };

    const cached = store.upsertProbation(guild.id, probation.discordId, update, { action: actionType, actorDiscordId: client.user.id, reason });
    await safeSubmitDepartmentEvent({ actionType, guildId: guild.id, actor: client.user, targetDiscordId: probation.discordId, reason, payload: { probation: { ...probation, ...cached }, rideAlongCount, requiredRideAlongCount } });
    await logWorkflow(guild, config, `Probation automation: ${actionType} for <@${probation.discordId}>. Ride-alongs: ${rideAlongCount}/${requiredRideAlongCount}.`);

    if (actionType === 'PROBATION_REMOVAL_REQUESTED') removalRequested++;
    else cycleFailed++;
  }

  return { cycleFailed, removalRequested };
}

function startProbationCheckService(client) {
  const config = getServerConfig();
  const p = config.probation || {};
  const check = p.check || {};
  if (p.enabled === false || check.enabled === false) return false;

  if (check.runOnStartup !== false) {
    runProbationCheck(client).catch((error) => console.error('Probation startup check failed:', error));
  }

  if (!task) {
    task = cron.schedule(check.dailyTime || '15 9 * * *', () => runProbationCheck(client).catch((error) => console.error('Probation check failed:', error)), {
      timezone: check.timezone || config.training?.deadlineCheck?.timezone || 'UTC'
    });
  }

  return true;
}

module.exports = {
  startProbationCheckService,
  runProbationCheck,
  rideAlongCountFor
};
