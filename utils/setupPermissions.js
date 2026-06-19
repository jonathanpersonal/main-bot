const { PermissionFlagsBits, MessageFlags } = require('discord.js');

function isSetupAdmin(interaction, config) {
  if (!interaction || !interaction.guild || !interaction.member) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) return true;

  const permissions = config?.permissions || {};
  const departmentAdminRankRoleIds = Array.isArray(config?.ranks)
    ? config.ranks
      .filter((rank) => rank.isDepartmentAdminStaff)
      .flatMap((rank) => [rank.rankRoleId, rank.permissionRoleId])
    : [];
  const setupAdminRoleIds = [
    ...(permissions.setupAdminRoleIds || []),
    ...(permissions.deptAdminStaffRoleIds || []),
    ...(permissions.departmentAdminStaffRoleIds || []),
    ...departmentAdminRankRoleIds
  ].filter((roleId) => typeof roleId === 'string' && roleId && !roleId.startsWith('PUT_') && !roleId.startsWith('PASTE_'));

  return setupAdminRoleIds.some((roleId) => interaction.member.roles.cache.has(roleId));
}

async function requireSetupAdmin(interaction, config) {
  if (isSetupAdmin(interaction, config)) return true;

  const message = 'You do not have permission to run department setup. Ask the server owner, an Administrator, a configured setup admin, or department admin staff to run this.';

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }

  return false;
}

module.exports = {
  isSetupAdmin,
  requireSetupAdmin
};
