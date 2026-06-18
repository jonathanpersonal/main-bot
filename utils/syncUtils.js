const { EmbedBuilder } = require('discord.js');
const { getConfiguredRanks, getMemberRank } = require('./rankUtils');
const { applyConfiguredRoleChanges, getConfiguredDepartmentRoleIds } = require('./roleUtils');

function norm(v) { return String(v || '').trim(); }
function findRank(config, officer = {}) {
  const key = norm(officer.rankKey).toLowerCase();
  const name = norm(officer.rank).toLowerCase();
  return getConfiguredRanks(config).find((r) => norm(r.key || r.rankKey || r.name).toLowerCase() === key || norm(r.name).toLowerCase() === name) || null;
}
function rankRoleIds(rank) { return [rank?.rankRoleId, rank?.permissionRoleId].filter(Boolean); }
function getConfiguredDepartmentRoles(config) { return getConfiguredDepartmentRoleIds(config); }
function formatNickname(format, officer, member) { return (format || '{callsign} | {name}').replace('{callsign}', officer.callsign || '').replace('{name}', officer.dbName || officer.discordUsername || member.user.username).replace(/^[\s|.-]+|[\s|.-]+$/g, '').slice(0, 32); }

function compareOfficerState(member, googleOfficer = {}, config = {}) {
  const currentRank = getMemberRank(member, config);
  const targetRank = findRank(config, googleOfficer);
  const warnings = [];
  if (!targetRank) warnings.push(`Missing rank mapping for Google rank: ${googleOfficer.rankKey || googleOfficer.rank || 'blank'}`);
  const allRankRoles = getConfiguredRanks(config).flatMap(rankRoleIds);
  const removeRoleIds = config.sync?.removeOldRankRoles === false ? [] : allRankRoles.filter((id) => member.roles.cache.has(id) && !rankRoleIds(targetRank).includes(id));
  const addRoleIds = targetRank ? rankRoleIds(targetRank).filter((id) => !member.roles.cache.has(id)) : [];
  const nicknameEnabled = config.sync?.updateNickname !== false;
  const targetNickname = nicknameEnabled ? formatNickname(config.sync?.nicknameFormat, googleOfficer, member) : '';
  const nicknameChange = nicknameEnabled && targetNickname && member.manageable && member.displayName !== targetNickname ? { from: member.displayName, to: targetNickname } : null;
  return { member, officer: googleOfficer, currentRank, targetRank, removeRoleIds, addRoleIds, nicknameChange, warnings, canApply: warnings.length === 0, dryRun: true };
}

async function applyOfficerSync(member, syncPlan, config = {}, reason = 'Officer sync from Google') {
  if (!syncPlan.canApply) return { roleResult: null, nicknameChanged: false, errors: syncPlan.warnings };
  const roleResult = config.sync?.updateDiscordRoles === false ? null : await applyConfiguredRoleChanges(member, { addRoleIds: syncPlan.addRoleIds, removeRoleIds: syncPlan.removeRoleIds, reason });
  let nicknameChanged = false;
  const errors = [...(roleResult?.failed || [])];
  if (syncPlan.nicknameChange && config.sync?.updateNickname !== false) {
    try { await member.setNickname(syncPlan.nicknameChange.to, reason); nicknameChanged = true; } catch (e) { errors.push(`Could not update nickname: ${e.message}`); }
  }
  return { roleResult, nicknameChanged, errors };
}

function roleNames(guild, ids) { return ids.map((id) => guild.roles.cache.get(id)?.name || id).join(', ') || 'None'; }
function formatSyncPlanEmbed(syncPlan, config = {}, title = 'Officer Sync Preview') {
  const o = syncPlan.officer || {};
  return new EmbedBuilder().setTitle(title).setColor(syncPlan.canApply ? 0x2f80ed : 0xffaa00).addFields(
    { name: 'Officer', value: `${syncPlan.member.user} (${syncPlan.member.id})`, inline: false },
    { name: 'Google rank/status', value: `${o.rank || o.rankKey || 'Unknown'} / ${o.status || o.departmentStatus || o.activeStatus || 'Unknown'}`, inline: false },
    { name: 'Current Discord rank', value: syncPlan.currentRank?.name || 'None', inline: true },
    { name: 'Target rank', value: syncPlan.targetRank?.name || 'Missing mapping', inline: true },
    { name: 'Roles to remove', value: roleNames(syncPlan.member.guild, syncPlan.removeRoleIds).slice(0, 1024), inline: false },
    { name: 'Roles to add', value: roleNames(syncPlan.member.guild, syncPlan.addRoleIds).slice(0, 1024), inline: false },
    { name: 'Nickname change', value: syncPlan.nicknameChange ? `${syncPlan.nicknameChange.from} → ${syncPlan.nicknameChange.to}` : 'None', inline: false },
    { name: 'Steam64 / TeamSpeak', value: `${o.steam64 || 'Not set'} / ${o.teamspeakId || 'Not set'}`, inline: false },
    { name: 'Warnings', value: syncPlan.warnings.length ? syncPlan.warnings.join('\n').slice(0, 1024) : 'None', inline: false },
    { name: 'Record ID', value: o.recordId || 'Not provided', inline: true }
  );
}
module.exports = { getConfiguredDepartmentRoles, compareOfficerState, applyOfficerSync, formatSyncPlanEmbed, findRank };
