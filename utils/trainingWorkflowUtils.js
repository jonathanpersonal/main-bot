const { PermissionFlagsBits } = require('discord.js');
const { applyConfiguredRoleChanges } = require('./roleUtils');
const { safeSubmitDepartmentEvent } = require('./googleDepartmentEvents');
const store = require('./workflowStore');
const { cleanRoleIds } = require('./permissionUtils');

function cfg(config) { return config.training || config.trainingManagement || {}; }
function probCfg(config) { return config.probation || {}; }
function addDays(date, days) { const d = new Date(date); d.setUTCDate(d.getUTCDate() + Number(days || 0)); return d; }
function fmt(template, values) { return String(template || '').replace(/\{([a-zA-Z]+)\}/g, (m, k) => values[k] ?? m); }
async function safeDm(user, content, components) { try { await user.send({ content, components: components || [] }); return true; } catch (e) { console.warn('Workflow DM failed:', e.message); return false; } }
async function logWorkflow(guild, config, message, channelId) { const ids = [channelId, config.channels?.trainingLogChannelId, config.channels?.probationLogChannelId, config.logging?.staffLogChannelId].filter(Boolean); const id = ids[0]; if (!id) return false; try { const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id); if (ch?.send) { await ch.send(message); return true; } } catch (e) { console.warn('Workflow log failed:', e.message); } return false; }

async function approveCadet({ interaction, member, reason = '' }) {
  const config = require('./configUtils').getServerConfig(); const t = cfg(config); const deadline = addDays(new Date(), t.cadetDeadlineDays ?? 14).toISOString();
  const roleResult = await applyConfiguredRoleChanges(member, { addRoleIds: cleanRoleIds(t.cadetRoleIds || t.applicationReview?.decisions?.approved?.addRoleIds || []), removeRoleIds: cleanRoleIds(t.applicantRoleIds || []), reason: `Cadet approved by ${interaction.user.tag}` });
  const record = store.upsertCadet(interaction.guildId, member.id, { discordUsername: member.user.tag, dbName: member.displayName, status: 'ACTIVE', deadlineAt: deadline, reminderLastSentAt: null, notes: reason }, { action: 'CADET_APPROVED', actorDiscordId: interaction.user.id, reason });
  const msg = fmt(t.messages?.cadetApproved || 'You have been approved as a cadet. Deadline: {deadline}. Roster: {publicRosterUrl}', { dbName: member.displayName, deadline: new Date(deadline).toLocaleDateString(), publicRosterUrl: t.publicRosterUrl || 'PUBLIC_ROSTER_URL_PLACEHOLDER', departmentName: config.departmentName || config.department?.name || 'Department' });
  const dmSent = await safeDm(member.user, msg);
  await logWorkflow(interaction.guild, config, `Cadet approved: ${member} by ${interaction.user}. Deadline: ${deadline}. DM: ${dmSent ? 'sent' : 'failed'}`);
  const googleResult = await safeSubmitDepartmentEvent({ actionType: 'CADET_APPROVED', interaction, actor: interaction.user, target: member, reason, payload: { cadet: record, roleResult, dmSent } });
  return { record, roleResult, dmSent, googleResult };
}

async function denyCadet({ interaction, member, reason = '' }) {
  const config = require('./configUtils').getServerConfig(); const t = cfg(config);
  const roleResult = await applyConfiguredRoleChanges(member, { addRoleIds: [], removeRoleIds: cleanRoleIds([...(t.applicantRoleIds || []), ...(t.cadetRoleIds || [])]), reason: `Applicant denied by ${interaction.user.tag}` });
  const record = store.upsertCadet(interaction.guildId, member.id, { discordUsername: member.user.tag, dbName: member.displayName, status: 'DENIED', notes: reason }, { action: 'CADET_DENIED', actorDiscordId: interaction.user.id, reason });
  const dmSent = await safeDm(member.user, fmt(t.messages?.cadetDenied || 'Your application/training review was denied. Reason: {reason}', { reason }));
  await logWorkflow(interaction.guild, config, `Cadet/applicant denied: ${member} by ${interaction.user}. Reason: ${reason}. DM: ${dmSent ? 'sent' : 'failed'}`);
  const googleResult = await safeSubmitDepartmentEvent({ actionType: 'CADET_DENIED', interaction, actor: interaction.user, target: member, reason, payload: { cadet: record, roleResult, dmSent } });
  return { record, roleResult, dmSent, googleResult };
}

async function startProbation({ interaction, member, callsign, trainingOfficerId, notes = '' }) {
  const config = require('./configUtils').getServerConfig(); const p = probCfg(config); const start = new Date(); const end = addDays(start, p.cycleDays ?? 4);
  const record = store.upsertProbation(interaction.guildId, member.id, { discordUsername: member.user.tag, dbName: member.displayName, callsign: callsign || '', trainingOfficerId: trainingOfficerId || interaction.user.id, probationStartAt: start.toISOString(), cycleStartAt: start.toISOString(), cycleEndAt: end.toISOString(), cycleNumber: 1, maxCycles: p.maxCycles ?? 2, status: 'ACTIVE', rideAlongCount: 0, feedbackCount: 0, notes, updatedBy: interaction.user.id }, { action: 'PROBATION_STARTED', actorDiscordId: interaction.user.id, notes });
  await safeSubmitDepartmentEvent({ actionType: 'PROBATION_STARTED', interaction, actor: interaction.user, target: member, reason: notes, payload: { probation: record } });
  return record;
}

async function completeTrainingPass({ interaction, member, notes = '' }) {
  const config = require('./configUtils').getServerConfig(); const t = cfg(config); const p = probCfg(config);
  const roleResult = await applyConfiguredRoleChanges(member, { addRoleIds: cleanRoleIds(p.probationaryRoleIds || []), removeRoleIds: cleanRoleIds(t.cadetRoleIds || []), reason: `Training completed/pass by ${interaction.user.tag}` });
  const cadet = store.upsertCadet(interaction.guildId, member.id, { status: 'COMPLETED', completedAt: new Date().toISOString(), notes }, { action: 'TRAINING_COMPLETED_PASS', actorDiscordId: interaction.user.id, notes });
  const googleResult = await safeSubmitDepartmentEvent({ actionType: 'TRAINING_COMPLETED_PASS', interaction, actor: interaction.user, target: member, reason: notes, payload: { cadet, roleResult, needsCallsign: true } });
  const callsign = googleResult?.callsign || googleResult?.result?.callsign || googleResult?.payload?.callsign || '';
  const probation = await startProbation({ interaction, member, callsign, trainingOfficerId: interaction.user.id, notes });
  const dm = fmt(t.messages?.trainingPassed || `Hello {dbName},\n\nCongrats on passing your {departmentName} Basic Training. Your callsign is {callsign}.\nSteam group: {steamGroupUrl}`, { dbName: member.displayName, callsign: callsign || 'Pending assignment', steamGroupUrl: t.steamGroupUrl || 'STEAM_GROUP_URL_PLACEHOLDER', departmentName: config.departmentName || 'Department' });
  const dmSent = await safeDm(member.user, dm);
  await logWorkflow(interaction.guild, config, `Training passed: ${member}. Callsign: ${callsign || 'pending'}. Probation started. DM: ${dmSent ? 'sent' : 'failed'}`);
  return { cadet, probation, roleResult, googleResult, dmSent, callsign };
}

async function finishProbationPass({ interaction, member, notes = '' }) {
  const config = require('./configUtils').getServerConfig(); const p = probCfg(config); const ranks = config.ranks || []; const rank = ranks.find((r) => (r.key && r.key === p.graduationRankKey) || r.name === p.graduationRankKey) || ranks.find((r) => !r.isProbationary && Number(r.level) > 1);
  const roleResult = await applyConfiguredRoleChanges(member, { addRoleIds: cleanRoleIds([rank?.rankRoleId, rank?.permissionRoleId, p.firstOfficerRankRoleId, p.firstOfficerPermissionRoleId]), removeRoleIds: cleanRoleIds(p.probationaryRoleIds || []), reason: `Probation passed by ${interaction.user.tag}` });
  const record = store.upsertProbation(interaction.guildId, member.id, { status: 'PASSED', finalDecision: 'PASS', graduationAt: new Date().toISOString(), updatedBy: interaction.user.id, notes }, { action: 'PROBATION_PASSED', actorDiscordId: interaction.user.id, notes });
  const googleResult = await safeSubmitDepartmentEvent({ actionType: 'PROBATION_PASSED', interaction, actor: interaction.user, target: member, reason: notes, payload: { probation: record, roleResult, graduationRank: rank } });
  await safeSubmitDepartmentEvent({ actionType: 'PROBATION_GRADUATED', interaction, actor: interaction.user, target: member, reason: notes, payload: { probation: record, roleResult, graduationRank: rank } });
  const dmSent = await safeDm(member.user, fmt(p.messages?.passed || 'Congratulations {dbName}, you passed probation.', { dbName: member.displayName }));
  await logWorkflow(interaction.guild, config, `Probation passed/graduated: ${member}. DM: ${dmSent ? 'sent' : 'failed'}`);
  return { record, roleResult, googleResult, dmSent };
}

module.exports = { addDays, fmt, safeDm, logWorkflow, approveCadet, denyCadet, completeTrainingPass, startProbation, finishProbationPass };
