const fs = require('fs');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getActiveGuildConfig } = require('../utils/configUtils');
const { getGuildConfigPath } = require('../utils/guildConfigStore');

function statusLine(ok, label, detail) {
  return `${ok ? '✅' : '⚠️'} **${label}:** ${detail}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config-check')
    .setDescription('Check whether this server has the required bot config pieces.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const config = getActiveGuildConfig(interaction.guildId);
    const configPath = getGuildConfigPath(interaction.guildId);
    const rankRoles = (config.ranks || []).filter((rank) => rank.rankRoleId);
    const permissionRoles = [
      ...(config.permissions?.commandStaffRoleIds || []),
      ...(config.permissions?.supervisorRoleIds || []),
      ...(config.permissions?.trainingStaffRoleIds || []),
      ...(config.permissions?.ticketStaffRoleIds || []),
      ...((config.ranks || []).map((rank) => rank.permissionRoleId).filter(Boolean))
    ];
    const logChannels = Object.values(config.channels || {}).filter(Boolean);
    const ticketsEnabled = Boolean(config.tickets?.enabled);
    const ticketTypes = (config.tickets?.types || []).filter((type) => type.enabled);
    const googleEnabled = Boolean(config.google?.enabled || process.env.GOOGLE_SCRIPT_WEBAPP_URL);
    const googleReady = Boolean(process.env.GOOGLE_SCRIPT_WEBAPP_URL && process.env.GOOGLE_SCRIPT_SECRET);
    const devOnlyEnabled = Boolean(config.devOnly?.enabled);
    const devOnlyRoleCount = Array.isArray(config.devOnly?.roleIds) ? config.devOnly.roleIds.filter(Boolean).length : 0;

    const lines = [
      statusLine(Boolean(config.departmentName || config.department?.name), 'Department name', config.departmentName || config.department?.name || 'Missing'),
      statusLine(fs.existsSync(configPath), 'Guild config file', fs.existsSync(configPath) ? `Found \`${configPath}\`` : `Missing data/guildConfigs/${interaction.guildId}.json; using defaults/fallbacks`),
      statusLine(rankRoles.length > 0, 'Rank roles', rankRoles.length ? `${rankRoles.length} configured` : 'No rank roles configured'),
      statusLine(permissionRoles.length > 0, 'Permission roles', permissionRoles.length ? `${permissionRoles.length} configured` : 'No permission roles configured'),
      statusLine(logChannels.length > 0, 'Log channels', logChannels.length ? `${logChannels.length} configured` : 'No log channels configured'),
      statusLine(!ticketsEnabled || ticketTypes.length > 0, 'Tickets', ticketsEnabled ? `${ticketTypes.length} enabled ticket type(s)` : 'Disabled'),
      statusLine(!googleEnabled || googleReady, 'Google', googleEnabled ? (googleReady ? 'Enabled and environment variables are present' : 'Enabled but GOOGLE_SCRIPT_WEBAPP_URL/GOOGLE_SCRIPT_SECRET is missing') : 'Disabled'),
      statusLine(!devOnlyEnabled || devOnlyRoleCount > 0, 'Dev-only mode', devOnlyEnabled ? `${devOnlyRoleCount} dev role(s) configured` : 'Disabled')
    ];

    await interaction.reply({
      content: ['## Config Check', ...lines].join('\n'),
      ephemeral: true
    });
  }
};
