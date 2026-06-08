const { PermissionFlagsBits } = require('discord.js');

function getUniqueRoleIds(roleIds) {
  return [...new Set(roleIds.filter((roleId) => roleId && typeof roleId === 'string'))];
}

function getRankRoleIds(rank) {
  if (!rank) return [];

  return getUniqueRoleIds([
    rank.rankRoleId,
    rank.permissionRoleId
  ]);
}

function validateBotCanManageRankChange(guild, botMember, oldRank, newRank) {
  const problems = [];

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    problems.push('The bot does not have the Manage Roles permission.');
  }

  const roleIdsToCheck = getUniqueRoleIds([
    ...getRankRoleIds(oldRank),
    ...getRankRoleIds(newRank)
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

async function changeMemberRank(member, oldRank, newRank, reason) {
  const newRoleIds = getRankRoleIds(newRank);

  const roleIdsToRemove = getRankRoleIds(oldRank)
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

module.exports = {
  changeMemberRank,
  validateBotCanManageRankChange
};