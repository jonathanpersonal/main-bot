const { PermissionFlagsBits } = require('discord.js');

function getUniqueRoleIds(roleIds) {
  return [...new Set(roleIds.filter(isUsableRoleId))];
}

function isUsableRoleId(roleId) {
  return (
    roleId &&
    typeof roleId === 'string' &&
    !roleId.startsWith('PUT_') &&
    !roleId.startsWith('PASTE_')
  );
}

function getDepartmentMemberRoleId(config) {
  return config?.department?.memberRoleId || config?.roles?.departmentMemberRoleId || '';
}

function getRankRoleIds(rank, config = null) {
  if (!rank) return getUniqueRoleIds([getDepartmentMemberRoleId(config)]);

  return getUniqueRoleIds([
    rank.rankRoleId,
    rank.permissionRoleId,
    getDepartmentMemberRoleId(config)
  ]);
}

function getConfiguredDepartmentRoleIds(config) {
  const rankRoleIds = Array.isArray(config?.ranks)
    ? config.ranks.flatMap((rank) => [rank.rankRoleId, rank.permissionRoleId])
    : [];

  return getUniqueRoleIds([
    ...rankRoleIds,
    config?.department?.memberRoleId,
    config?.roles?.departmentMemberRoleId,
    ...(Array.isArray(config?.officerManagement?.extraDepartmentRoleIds)
      ? config.officerManagement.extraDepartmentRoleIds
      : [])
  ]);
}

function validateBotCanManageRankChange(guild, botMember, oldRank, newRank, config = null) {
  const problems = [];

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    problems.push('The bot does not have the Manage Roles permission.');
  }

  const roleIdsToCheck = getUniqueRoleIds([
    ...getRankRoleIds(oldRank, config),
    ...getRankRoleIds(newRank, config)
  ]);

  for (const roleId of roleIdsToCheck) {
    const role = guild.roles.cache.get(roleId);

    if (!role) {
      problems.push(`Configured role was not found in Discord: ${roleId}`);
      continue;
    }

    if (role.managed) {
      problems.push(`The role "${role.name}" is managed by an integration and cannot be changed by the bot.`);
      continue;
    }

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
      problems.push(`The bot role is not high enough to manage the role "${role.name}".`);
    }
  }

  return {
    canManage: problems.length === 0,
    problems
  };
}

async function changeMemberRank(member, oldRank, newRank, reason, config = null) {
  const newRoleIds = getRankRoleIds(newRank, config);

  const roleIdsToRemove = getRankRoleIds(oldRank, config)
    .filter((roleId) => !newRoleIds.includes(roleId));

  const roleIdsToAdd = newRoleIds;

  const removedRoles = [];
  const addedRoles = [];

  for (const roleId of roleIdsToRemove) {
    const role = member.guild.roles.cache.get(roleId);

    if (!role) {
      throw new Error(`Could not remove role because it was not found: ${roleId}`);
    }

    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, reason);
      removedRoles.push(role.name);
    }
  }

  for (const roleId of roleIdsToAdd) {
    const role = member.guild.roles.cache.get(roleId);

    if (!role) {
      throw new Error(`Could not add role because it was not found: ${roleId}`);
    }

    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId, reason);
      addedRoles.push(role.name);
    }
  }

  return {
    removedRoles,
    addedRoles
  };
}

async function removeConfiguredDepartmentRoles(member, config, reason) {
  const botMember = member.guild.members.me || await member.guild.members.fetchMe();
  const removedRoleIds = [];
  const removedRoleNames = [];
  const skippedRoleIds = [];
  const errors = [];

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      removedRoleIds,
      removedRoleNames,
      skippedRoleIds,
      errors: ['The bot does not have the Manage Roles permission.']
    };
  }

  const rolesToRemove = [];

  for (const roleId of getConfiguredDepartmentRoleIds(config)) {
    const role = member.guild.roles.cache.get(roleId);

    if (!role || !member.roles.cache.has(roleId)) {
      skippedRoleIds.push(roleId);
      continue;
    }

    if (role.id === member.guild.id) {
      skippedRoleIds.push(roleId);
      continue;
    }

    if (role.managed) {
      errors.push(`The role "${role.name}" is managed by an integration and cannot be removed by the bot.`);
      continue;
    }

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
      errors.push(`The bot role is not high enough to remove the role "${role.name}".`);
      continue;
    }

    rolesToRemove.push(role);
  }

  if (errors.length > 0) {
    return {
      removedRoleIds,
      removedRoleNames,
      skippedRoleIds,
      errors
    };
  }

  for (const role of rolesToRemove) {
    try {
      await member.roles.remove(role.id, reason);
      removedRoleIds.push(role.id);
      removedRoleNames.push(role.name);
    } catch (error) {
      errors.push(`Could not remove "${role.name}": ${error.message}`);
    }
  }

  return {
    removedRoleIds,
    removedRoleNames,
    skippedRoleIds,
    errors
  };
}


async function validateConfiguredRoleCanBeAdded(member, roleId) {
  if (!isUsableRoleId(roleId) || member.roles.cache.has(roleId)) {
    return {
      canAdd: true,
      roleName: null,
      problem: null
    };
  }

  const role = member.guild.roles.cache.get(roleId);

  if (!role) {
    return {
      canAdd: false,
      roleName: null,
      problem: `Configured role was not found in Discord: ${roleId}`
    };
  }

  const botMember = member.guild.members.me || await member.guild.members.fetchMe();

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      canAdd: false,
      roleName: role.name,
      problem: 'The bot does not have the Manage Roles permission.'
    };
  }

  if (role.managed) {
    return {
      canAdd: false,
      roleName: role.name,
      problem: `The role "${role.name}" is managed by an integration and cannot be added by the bot.`
    };
  }

  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return {
      canAdd: false,
      roleName: role.name,
      problem: `The bot role is not high enough to add the role "${role.name}".`
    };
  }

  return {
    canAdd: true,
    roleName: role.name,
    problem: null
  };
}

async function addConfiguredRole(member, roleId, reason) {
  if (!isUsableRoleId(roleId)) {
    return {
      added: false,
      roleName: null,
      error: null,
      skipped: true
    };
  }

  const role = member.guild.roles.cache.get(roleId);

  if (!role) {
    return {
      added: false,
      roleName: null,
      error: `Configured role was not found in Discord: ${roleId}`,
      skipped: false
    };
  }

  const botMember = member.guild.members.me || await member.guild.members.fetchMe();

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      added: false,
      roleName: role.name,
      error: 'The bot does not have the Manage Roles permission.',
      skipped: false
    };
  }

  if (role.managed) {
    return {
      added: false,
      roleName: role.name,
      error: `The role "${role.name}" is managed by an integration and cannot be added by the bot.`,
      skipped: false
    };
  }

  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return {
      added: false,
      roleName: role.name,
      error: `The bot role is not high enough to add the role "${role.name}".`,
      skipped: false
    };
  }

  if (member.roles.cache.has(roleId)) {
    return {
      added: false,
      roleName: role.name,
      error: null,
      skipped: true
    };
  }

  try {
    await member.roles.add(roleId, reason);
    return {
      added: true,
      roleName: role.name,
      error: null,
      skipped: false
    };
  } catch (error) {
    return {
      added: false,
      roleName: role.name,
      error: `Could not add "${role.name}": ${error.message}`,
      skipped: false
    };
  }
}

async function applyConfiguredRoleChanges(member, { addRoleIds = [], removeRoleIds = [], reason }) {
  const result = {
    added: [],
    removed: [],
    skipped: [],
    failed: []
  };

  const botMember = member.guild.members.me || await member.guild.members.fetchMe();
  const canManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);

  for (const roleId of getUniqueRoleIds(removeRoleIds)) {
    const role = member.guild.roles.cache.get(roleId);

    if (!role) {
      result.skipped.push(`Missing remove role: ${roleId}`);
      continue;
    }

    if (!member.roles.cache.has(roleId)) {
      result.skipped.push(`Already missing: ${role.name}`);
      continue;
    }

    const problem = getRoleManagementProblem({ botMember, role, canManageRoles, verb: 'remove' });
    if (problem) {
      result.failed.push(problem);
      continue;
    }

    try {
      await member.roles.remove(roleId, reason);
      result.removed.push(role.name);
    } catch (error) {
      result.failed.push(`Could not remove "${role.name}": ${error.message}`);
    }
  }

  for (const roleId of getUniqueRoleIds(addRoleIds)) {
    const role = member.guild.roles.cache.get(roleId);

    if (!role) {
      result.skipped.push(`Missing add role: ${roleId}`);
      continue;
    }

    if (member.roles.cache.has(roleId)) {
      result.skipped.push(`Already has: ${role.name}`);
      continue;
    }

    const problem = getRoleManagementProblem({ botMember, role, canManageRoles, verb: 'add' });
    if (problem) {
      result.failed.push(problem);
      continue;
    }

    try {
      await member.roles.add(roleId, reason);
      result.added.push(role.name);
    } catch (error) {
      result.failed.push(`Could not add "${role.name}": ${error.message}`);
    }
  }

  return result;
}

function getRoleManagementProblem({ botMember, role, canManageRoles, verb }) {
  if (!canManageRoles) return 'The bot does not have the Manage Roles permission.';
  if (role.managed) return `The role "${role.name}" is managed by an integration and cannot be changed by the bot.`;
  if (botMember.roles.highest.comparePositionTo(role) <= 0) return `The bot role is not high enough to ${verb} the role "${role.name}".`;
  return null;
}

function formatRoleChangeResult(result) {
  if (!result) return 'Role changes: None';
  return [
    `Roles added: ${result.added.length ? result.added.join(', ') : 'None'}`,
    `Roles removed: ${result.removed.length ? result.removed.join(', ') : 'None'}`,
    `Roles skipped: ${result.skipped.length ? result.skipped.join('; ') : 'None'}`,
    `Role failures: ${result.failed.length ? result.failed.join('; ') : 'None'}`
  ].join('\n');
}


module.exports = {
  addConfiguredRole,
  applyConfiguredRoleChanges,
  changeMemberRank,
  formatRoleChangeResult,
  getConfiguredDepartmentRoleIds,
  getDepartmentMemberRoleId,
  removeConfiguredDepartmentRoles,
  validateBotCanManageRankChange,
  validateConfiguredRoleCanBeAdded
};
