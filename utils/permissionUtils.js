const { PermissionFlagsBits } = require('discord.js');
const { getServerConfig } = require('./configUtils');

function cleanRoleIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).filter((v) => typeof v === 'string' && v && !v.startsWith('PUT_') && !v.startsWith('PASTE_')))];
}

function hasAnyRole(member, roleIds = []) { return cleanRoleIds(roleIds).some((id) => member?.roles?.cache?.has(id)); }
function hasAllRoles(member, roleIds = []) { const ids = cleanRoleIds(roleIds); return ids.length > 0 && ids.every((id) => member?.roles?.cache?.has(id)); }

function roleGroups(config = {}) {
  const p = config.permissions || {};
  const t = config.training || config.trainingManagement || {};
  const pr = config.probation || {};
  return {
    botAdmin: cleanRoleIds([...(p.botAdminRoleIds || []), ...(p.setupAdminRoleIds || [])]),
    commandStaff: cleanRoleIds(p.commandStaffRoleIds || []),
    highCommand: cleanRoleIds(p.highCommandRoleIds || []),
    supervisor: cleanRoleIds(p.supervisorRoleIds || []),
    trainingOfficer: cleanRoleIds([...(p.trainingOfficerRoleIds || []), ...(p.trainingStaffRoleIds || []), ...(t.trainingOfficerRoleIds || []), ...(t.allowedRoleIds || []), ...(t.ftoRoleIds || []), ...(pr.trainingOfficerRoleIds || [])]),
    trainingCommand: cleanRoleIds([...(p.trainingCommandRoleIds || []), ...(t.trainingCommandRoleIds || []), ...(t.ftoCommandRoleIds || []), ...(p.ftoCommandRoleIds || []), ...(pr.ftoCommandRoleIds || [])]),
    ftoCommand: cleanRoleIds([...(p.ftoCommandRoleIds || []), ...(pr.ftoCommandRoleIds || []), ...(t.ftoCommandRoleIds || [])]),
    departmentCommand: cleanRoleIds([...(p.departmentCommandRoleIds || []), ...(pr.departmentCommandRoleIds || []), ...(p.commandStaffRoleIds || [])]),
    ticketStaff: cleanRoleIds([...(p.ticketStaffRoleIds || [])]),
    iaStaff: cleanRoleIds([...(p.iaStaffRoleIds || [])]),
    lookup: cleanRoleIds([...(p.lookupRoleIds || [])]),
    sync: cleanRoleIds([...(p.syncRoleIds || [])]),
    manualOfficerUpdate: cleanRoleIds([...(p.manualOfficerUpdateRoleIds || [])]),
    importUsers: cleanRoleIds([...(p.importUsersRoleIds || [])])
  };
}

function memberHasPermissionGroup(member, config, groups = [], fallbackPermission = null) {
  const all = roleGroups(config);
  const roleIds = groups.flatMap((g) => all[g] || []);
  if (roleIds.length > 0) return hasAnyRole(member, roleIds);
  return fallbackPermission ? Boolean(member?.permissions?.has(fallbackPermission)) : false;
}

const permissionMap = {
  botAdmin: { groups: ['botAdmin'], fallback: PermissionFlagsBits.Administrator },
  commandStaff: { groups: ['commandStaff', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.ManageRoles },
  highCommand: { groups: ['highCommand', 'botAdmin'], fallback: PermissionFlagsBits.Administrator },
  supervisor: { groups: ['supervisor', 'commandStaff', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.ManageRoles },
  trainingOfficer: { groups: ['trainingOfficer', 'trainingCommand', 'commandStaff', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.ManageRoles },
  ftoCommand: { groups: ['ftoCommand', 'departmentCommand', 'commandStaff', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.ManageRoles },
  departmentCommand: { groups: ['departmentCommand', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.ManageRoles },
  lookup: { groups: ['lookup', 'supervisor', 'trainingOfficer', 'trainingCommand', 'commandStaff', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.ManageRoles },
  sync: { groups: ['sync', 'commandStaff', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.ManageRoles },
  manualOfficerUpdate: { groups: ['manualOfficerUpdate', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.Administrator },
  importUsers: { groups: ['importUsers', 'highCommand', 'botAdmin'], fallback: PermissionFlagsBits.Administrator },
  ticketStaff: { groups: ['ticketStaff', 'botAdmin'], fallback: PermissionFlagsBits.ManageChannels }
};

function canUseCommand(member, config, permissionKey) {
  const rule = permissionMap[permissionKey] || { groups: [permissionKey], fallback: null };
  return memberHasPermissionGroup(member, config, rule.groups, rule.fallback);
}

async function logDenied(interaction, permissionKey) {
  const config = getServerConfig(interaction.guildId);
  const channelId = config?.channels?.botAdminLogChannelId || config?.channels?.staffLogChannelId || config?.logging?.staffLogChannelId;
  const channel = channelId ? await interaction.guild?.channels.fetch(channelId).catch(() => null) : null;
  if (channel?.isTextBased()) channel.send({ content: `Permission denied: ${interaction.user.tag} (${interaction.user.id}) tried /${interaction.commandName || 'interaction'} requiring ${permissionKey}.` }).catch(() => {});
}

async function requirePermission(interaction, permissionKey, options = {}) {
  const config = options.config || getServerConfig(interaction.guildId);
  if (canUseCommand(interaction.member, config, permissionKey)) return true;
  if (options.log !== false) await logDenied(interaction, permissionKey);
  const payload = { content: options.message || 'You do not have permission to use this command.', ephemeral: true };
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload); else await interaction.reply(payload);
  return false;
}

const isBotAdmin = (m,c) => canUseCommand(m,c,'botAdmin');
const isCommandStaff = (m,c) => canUseCommand(m,c,'commandStaff');
const isHighCommand = (m,c) => canUseCommand(m,c,'highCommand');
const isSupervisor = (m,c) => canUseCommand(m,c,'supervisor');
const isTrainingOfficer = (m,c) => canUseCommand(m,c,'trainingOfficer');
const isFtoCommand = (m,c) => canUseCommand(m,c,'ftoCommand');
const isDepartmentCommand = (m,c) => canUseCommand(m,c,'departmentCommand');
const canManageTraining = (m,c,l='officer') => canUseCommand(m,c,l==='command'?'ftoCommand':'trainingOfficer');
const canManageProbation = (m,c,l='officer') => canUseCommand(m,c,l==='command'?'ftoCommand':'trainingOfficer');

module.exports = { cleanRoleIds, hasAnyRole, hasAllRoles, roleGroups, memberHasAnyRole: hasAnyRole, memberHasPermissionGroup, isBotAdmin, isCommandStaff, isHighCommand, isSupervisor, isTrainingOfficer, isFtoCommand, isDepartmentCommand, canUseCommand, requirePermission, canManageTraining, canManageProbation };
