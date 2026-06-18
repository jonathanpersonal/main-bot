const { PermissionFlagsBits } = require('discord.js');

function cleanRoleIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).filter((v) => typeof v === 'string' && v && !v.startsWith('PUT_') && !v.startsWith('PASTE_')))];
}

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
    trainingCommand: cleanRoleIds([...(t.trainingCommandRoleIds || []), ...(t.ftoCommandRoleIds || []), ...(p.ftoCommandRoleIds || []), ...(pr.ftoCommandRoleIds || [])]),
    ftoCommand: cleanRoleIds([...(p.ftoCommandRoleIds || []), ...(pr.ftoCommandRoleIds || []), ...(t.ftoCommandRoleIds || [])]),
    departmentCommand: cleanRoleIds([...(p.departmentCommandRoleIds || []), ...(pr.departmentCommandRoleIds || []), ...(p.commandStaffRoleIds || [])]),
    ticketStaff: cleanRoleIds([...(p.ticketStaffRoleIds || [])]),
    iaStaff: cleanRoleIds([...(p.iaStaffRoleIds || [])])
  };
}

function memberHasAnyRole(member, ids = []) {
  const clean = cleanRoleIds(ids);
  return clean.some((id) => member?.roles?.cache?.has(id));
}

function memberHasPermissionGroup(member, config, groups = [], fallbackPermission = null) {
  const all = roleGroups(config);
  const roleIds = groups.flatMap((g) => all[g] || []);
  if (roleIds.length > 0) return memberHasAnyRole(member, roleIds);
  return fallbackPermission ? member?.permissions?.has(fallbackPermission) : false;
}

function canManageTraining(member, config, level = 'officer') {
  const groups = level === 'command'
    ? ['trainingCommand', 'departmentCommand', 'commandStaff', 'highCommand', 'botAdmin']
    : ['trainingOfficer', 'trainingCommand', 'departmentCommand', 'commandStaff', 'highCommand', 'botAdmin'];
  return memberHasPermissionGroup(member, config, groups, PermissionFlagsBits.ManageRoles);
}

function canManageProbation(member, config, level = 'officer') {
  const groups = level === 'command'
    ? ['ftoCommand', 'departmentCommand', 'commandStaff', 'highCommand', 'botAdmin']
    : ['trainingOfficer', 'ftoCommand', 'departmentCommand', 'commandStaff', 'highCommand', 'botAdmin'];
  return memberHasPermissionGroup(member, config, groups, PermissionFlagsBits.ManageRoles);
}

module.exports = { cleanRoleIds, roleGroups, memberHasAnyRole, memberHasPermissionGroup, canManageTraining, canManageProbation };
