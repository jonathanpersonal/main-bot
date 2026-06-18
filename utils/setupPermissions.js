const { PermissionFlagsBits } = require('discord.js');

function isSetupAdmin(interaction, config) {
  if (!interaction || !interaction.guild || !interaction.member) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) return true;

  const setupAdminRoleIds = config?.permissions?.setupAdminRoleIds || [];
  return setupAdminRoleIds.some((roleId) => interaction.member.roles.cache.has(roleId));
}

async function requireSetupAdmin(interaction, config) {
  if (isSetupAdmin(interaction, config)) return true;

  const message = 'You do not have permission to run department setup. Ask the server owner, an Administrator, or a configured setup admin to run this.';

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: message, ephemeral: true });
  } else {
    await interaction.reply({ content: message, ephemeral: true });
  }

  return false;
}

module.exports = {
  isSetupAdmin,
  requireSetupAdmin
};
