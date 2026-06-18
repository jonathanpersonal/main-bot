const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');
const { createDefaultGuildConfig, createDefaultRank } = require('../config/defaultGuildConfig');
const { getGuildConfig, saveGuildConfig, updateGuildConfig } = require('../utils/guildConfigStore');
const { requireSetupAdmin } = require('../utils/setupPermissions');
const { sanitizeConfigForDisplay } = require('../utils/configSanitizer');

const CUSTOM_ID_PREFIX = 'department-setup';

const roleTypeMap = {
  'setup-admin': ['permissions', 'setupAdminRoleIds'],
  'command-staff': ['permissions', 'commandStaffRoleIds'],
  supervisor: ['permissions', 'supervisorRoleIds'],
  'training-staff': ['permissions', 'trainingStaffRoleIds'],
  'ia-staff': ['permissions', 'iaStaffRoleIds'],
  'ticket-staff': ['permissions', 'ticketStaffRoleIds'],
  'high-command': ['permissions', 'highCommandRoleIds'],
  'previous-officer': ['department', 'previousOfficerRoleId'],
  member: ['department', 'memberRoleId']
};

const channelTypeMap = {
  'officer-management-log': 'officerManagementLogChannelId',
  'training-log': 'trainingLogChannelId',
  'duty-log': 'dutyLogChannelId',
  'ticket-log': 'ticketLogChannelId',
  'ia-log': 'iaLogChannelId',
  'bot-admin-log': 'botAdminLogChannelId',
  'google-log': 'googleLogChannelId',
  'ticket-panel': 'ticketPanelChannelId'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('department-setup')
    .setDescription('Configure this department bot for the current Discord server.')
    .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Preview setup status and missing items.'))
    .addSubcommand((subcommand) => subcommand
      .setName('profile')
      .setDescription('Set the department name, acronym, and core roles.')
      .addStringOption((option) => option.setName('department-name').setDescription('Full department name.').setRequired(true))
      .addStringOption((option) => option.setName('department-acronym').setDescription('Department acronym.').setRequired(true))
      .addRoleOption((option) => option.setName('previous-officer-role').setDescription('Previous officer role.'))
      .addRoleOption((option) => option.setName('member-role').setDescription('Department member role.')))
    .addSubcommand((subcommand) => subcommand
      .setName('role')
      .setDescription('Add a setup, staff, permission, or department role.')
      .addStringOption((option) => option.setName('type').setDescription('Role type to save.').setRequired(true).addChoices(
        { name: 'setup-admin', value: 'setup-admin' },
        { name: 'command-staff', value: 'command-staff' },
        { name: 'supervisor', value: 'supervisor' },
        { name: 'training-staff', value: 'training-staff' },
        { name: 'ia-staff', value: 'ia-staff' },
        { name: 'ticket-staff', value: 'ticket-staff' },
        { name: 'high-command', value: 'high-command' },
        { name: 'previous-officer', value: 'previous-officer' },
        { name: 'member', value: 'member' }))
      .addRoleOption((option) => option.setName('role').setDescription('Role to save.').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('channel')
      .setDescription('Save a log or panel channel.')
      .addStringOption((option) => option.setName('type').setDescription('Channel type to save.').setRequired(true).addChoices(
        { name: 'officer-management-log', value: 'officer-management-log' },
        { name: 'training-log', value: 'training-log' },
        { name: 'duty-log', value: 'duty-log' },
        { name: 'ticket-log', value: 'ticket-log' },
        { name: 'ia-log', value: 'ia-log' },
        { name: 'bot-admin-log', value: 'bot-admin-log' },
        { name: 'google-log', value: 'google-log' },
        { name: 'ticket-panel', value: 'ticket-panel' }))
      .addChannelOption((option) => option.setName('channel').setDescription('Channel to save.').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('rank-add')
      .setDescription('Add or update a rank.')
      .addStringOption((option) => option.setName('name').setDescription('Rank name.').setRequired(true))
      .addRoleOption((option) => option.setName('rank-role').setDescription('Discord rank role.').setRequired(true))
      .addIntegerOption((option) => option.setName('order').setDescription('Rank order. Higher number = higher rank.').setRequired(true))
      .addRoleOption((option) => option.setName('permission-role').setDescription('Optional permission role for this rank.'))
      .addBooleanOption((option) => option.setName('command-staff').setDescription('Is command staff?'))
      .addBooleanOption((option) => option.setName('supervisor').setDescription('Is supervisor?'))
      .addBooleanOption((option) => option.setName('probationary').setDescription('Is probationary?'))
      .addBooleanOption((option) => option.setName('recruit').setDescription('Is recruit?'))
      .addIntegerOption((option) => option.setName('minimum-days').setDescription('Minimum days in rank before promotion.')))
    .addSubcommand((subcommand) => subcommand.setName('rank-list').setDescription('List configured ranks.'))
    .addSubcommand((subcommand) => subcommand
      .setName('rank-remove')
      .setDescription('Remove a rank after confirmation.')
      .addStringOption((option) => option.setName('name').setDescription('Rank name to remove.').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('google')
      .setDescription('Configure Google webhook and polling settings.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable Google integration?').setRequired(true))
      .addStringOption((option) => option.setName('webhook-url').setDescription('Google webhook URL.'))
      .addStringOption((option) => option.setName('polling-url').setDescription('Google polling URL.')))
    .addSubcommand((subcommand) => subcommand
      .setName('ticket-type-add')
      .setDescription('Add or update a ticket type.')
      .addStringOption((option) => option.setName('name').setDescription('Ticket type name.').setRequired(true))
      .addStringOption((option) => option.setName('description').setDescription('Ticket type description.'))
      .addRoleOption((option) => option.setName('staff-role').setDescription('Staff role for this ticket type.'))
      .addChannelOption((option) => option.setName('category-channel').setDescription('Ticket category channel.').addChannelTypes(ChannelType.GuildCategory))
      .addBooleanOption((option) => option.setName('hidden').setDescription('Hide from public panel?'))
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable this ticket type?')))
    .addSubcommand((subcommand) => subcommand.setName('ticket-type-list').setDescription('List configured ticket types.'))
    .addSubcommand((subcommand) => subcommand.setName('export').setDescription('Export sanitized setup config.'))
    .addSubcommand((subcommand) => subcommand.setName('reset').setDescription('Reset local setup config after confirmation.')),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const config = getGuildConfig(guildId);
    if (!(await requireSetupAdmin(interaction, config))) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'status') return showStatus(interaction, config);
    if (subcommand === 'profile') return saveProfile(interaction);
    if (subcommand === 'role') return saveRole(interaction);
    if (subcommand === 'channel') return saveChannel(interaction);
    if (subcommand === 'rank-add') return addRank(interaction);
    if (subcommand === 'rank-list') return listRanks(interaction, config);
    if (subcommand === 'rank-remove') return confirmRankRemove(interaction, config);
    if (subcommand === 'google') return saveGoogle(interaction);
    if (subcommand === 'ticket-type-add') return addTicketType(interaction);
    if (subcommand === 'ticket-type-list') return listTicketTypes(interaction, config);
    if (subcommand === 'export') return exportConfig(interaction, config);
    if (subcommand === 'reset') return confirmReset(interaction);
  },

  async handleButton(interaction) {
    const customId = interaction.customId || '';
    if (!customId.startsWith(`${CUSTOM_ID_PREFIX}:`)) return false;

    const config = getGuildConfig(interaction.guildId);
    if (!(await requireSetupAdmin(interaction, config))) return true;

    const [, action, guildId, ...rest] = customId.split(':');
    if (guildId !== interaction.guildId) {
      await interaction.reply({ content: 'This setup button belongs to a different server.', ephemeral: true });
      return true;
    }

    if (action === 'rank-remove-confirm') {
      const rankName = decodeURIComponent(rest.join(':'));
      const updated = updateGuildConfig(guildId, (draft) => {
        draft.ranks = draft.ranks.filter((rank) => rank.name.toLowerCase() !== rankName.toLowerCase());
        draft.setup.updatedBy = interaction.user.id;
        return draft;
      });
      await interaction.update({ content: `Removed rank **${rankName}**. ${updated.ranks.length} rank(s) remain.`, embeds: [], components: [] });
      return true;
    }

    if (action === 'rank-remove-cancel' || action === 'reset-cancel') {
      await interaction.update({ content: 'Setup action cancelled.', embeds: [], components: [] });
      return true;
    }

    if (action === 'reset-confirm') {
      saveGuildConfig(guildId, createDefaultGuildConfig(guildId));
      await interaction.update({ content: 'Department setup has been reset for this server.', embeds: [], components: [] });
      return true;
    }

    return false;
  }
};

async function showStatus(interaction, config) {
  const warnings = [];
  const hasProfile = Boolean(config.department.name && config.department.acronym);
  const hasRanks = config.ranks.length > 0;
  const hasPermissionRoles = Object.values(config.permissions).some((ids) => Array.isArray(ids) && ids.length > 0);
  const hasLogChannels = Object.values(config.channels).some(Boolean);
  const hasTicketTypes = config.tickets.types.length > 0;

  if (!hasProfile) warnings.push('Set the department profile.');
  if (!hasRanks) warnings.push('Add at least one rank.');
  if (!hasPermissionRoles) warnings.push('Add setup/admin and staff permission roles.');
  if (!hasLogChannels) warnings.push('Set log channels.');
  if (config.google.enabled && !config.google.webhookUrl) warnings.push('Google is enabled but webhook URL is not set.');

  const embed = new EmbedBuilder()
    .setTitle('Department Setup Status')
    .setColor(warnings.length ? 0xffcc00 : 0x2ecc71)
    .addFields(
      { name: 'Department profile', value: yesNo(hasProfile), inline: true },
      { name: 'Ranks configured', value: yesNo(hasRanks), inline: true },
      { name: 'Permission roles', value: yesNo(hasPermissionRoles), inline: true },
      { name: 'Log channels', value: yesNo(hasLogChannels), inline: true },
      { name: 'Google enabled', value: yesNo(config.google.enabled), inline: true },
      { name: 'Google webhook', value: config.google.webhookUrl ? 'SET' : 'NOT SET', inline: true },
      { name: 'Ticket types', value: yesNo(hasTicketTypes), inline: true },
      { name: 'Warnings', value: warnings.length ? warnings.map((warning) => `• ${warning}`).join('\n') : 'No major warnings.' }
    );

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function saveProfile(interaction) {
  const name = interaction.options.getString('department-name', true).trim();
  const acronym = interaction.options.getString('department-acronym', true).trim();
  const previousRole = interaction.options.getRole('previous-officer-role');
  const memberRole = interaction.options.getRole('member-role');

  updateGuildConfig(interaction.guildId, (draft) => {
    draft.department.name = name;
    draft.department.acronym = acronym;
    if (previousRole) draft.department.previousOfficerRoleId = previousRole.id;
    if (memberRole) draft.department.memberRoleId = memberRole.id;
    draft.setup.updatedBy = interaction.user.id;
    return draft;
  });

  return interaction.reply({ content: `Saved department profile: **${name}** (${acronym}).`, ephemeral: true });
}

async function saveRole(interaction) {
  const type = interaction.options.getString('type', true);
  const role = interaction.options.getRole('role', true);
  const [section, field] = roleTypeMap[type];

  updateGuildConfig(interaction.guildId, (draft) => {
    if (Array.isArray(draft[section][field])) {
      if (!draft[section][field].includes(role.id)) draft[section][field].push(role.id);
    } else {
      draft[section][field] = role.id;
    }
    draft.setup.updatedBy = interaction.user.id;
    return draft;
  });

  return interaction.reply({ content: `Saved ${type} role: ${role}.`, ephemeral: true });
}

async function saveChannel(interaction) {
  const type = interaction.options.getString('type', true);
  const channel = interaction.options.getChannel('channel', true);
  const field = channelTypeMap[type];

  updateGuildConfig(interaction.guildId, (draft) => {
    draft.channels[field] = channel.id;
    draft.setup.updatedBy = interaction.user.id;
    return draft;
  });

  return interaction.reply({ content: `Saved ${type} channel: ${channel}.`, ephemeral: true });
}

async function addRank(interaction) {
  const name = interaction.options.getString('name', true).trim();
  const rankRole = interaction.options.getRole('rank-role', true);
  const permissionRole = interaction.options.getRole('permission-role');
  const order = interaction.options.getInteger('order', true);
  const config = getGuildConfig(interaction.guildId);
  const existingByName = config.ranks.find((rank) => rank.name.toLowerCase() === name.toLowerCase());
  const duplicateRole = config.ranks.find((rank) => rank.rankRoleId === rankRole.id && rank.name.toLowerCase() !== name.toLowerCase());

  if (duplicateRole) {
    return interaction.reply({ content: `That rank role is already used by **${duplicateRole.name}**.`, ephemeral: true });
  }

  const saved = updateGuildConfig(interaction.guildId, (draft) => {
    const rank = createDefaultRank({
      ...(existingByName || {}),
      name,
      rankRoleId: rankRole.id,
      permissionRoleId: permissionRole?.id || existingByName?.permissionRoleId || '',
      order,
      isCommandStaff: interaction.options.getBoolean('command-staff') ?? existingByName?.isCommandStaff ?? false,
      isSupervisor: interaction.options.getBoolean('supervisor') ?? existingByName?.isSupervisor ?? false,
      isProbationary: interaction.options.getBoolean('probationary') ?? existingByName?.isProbationary ?? false,
      isRecruit: interaction.options.getBoolean('recruit') ?? existingByName?.isRecruit ?? false,
      promotion: {
        ...(existingByName?.promotion || {}),
        minimumDaysInRank: interaction.options.getInteger('minimum-days') ?? existingByName?.promotion?.minimumDaysInRank ?? 0
      }
    });

    draft.ranks = draft.ranks.filter((existing) => existing.name.toLowerCase() !== name.toLowerCase());
    draft.ranks.push(rank);
    draft.ranks.sort((a, b) => a.order - b.order);
    draft.setup.updatedBy = interaction.user.id;
    return draft;
  });

  const savedRank = saved.ranks.find((rank) => rank.name.toLowerCase() === name.toLowerCase());
  const embed = new EmbedBuilder().setTitle('Rank Saved').setColor(0x2ecc71).addFields(formatRankFields(savedRank));
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function listRanks(interaction, config) {
  if (!config.ranks.length) return interaction.reply({ content: 'No ranks are configured yet.', ephemeral: true });

  const description = config.ranks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((rank) => `**${rank.order}. ${rank.name}**\nRole: <@&${rank.rankRoleId}>${rank.permissionRoleId ? `\nPermission: <@&${rank.permissionRoleId}>` : ''}\nFlags: ${rankFlags(rank)}\nMinimum days: ${rank.promotion?.minimumDaysInRank || 0}`)
    .join('\n\n');

  return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Configured Ranks').setDescription(description).setColor(0x3498db)], ephemeral: true });
}

async function confirmRankRemove(interaction, config) {
  const name = interaction.options.getString('name', true).trim();
  const rank = config.ranks.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!rank) return interaction.reply({ content: `No rank named **${name}** was found.`, ephemeral: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:rank-remove-confirm:${interaction.guildId}:${encodeURIComponent(rank.name)}`).setLabel('Confirm Remove').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:rank-remove-cancel:${interaction.guildId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({ content: `Are you sure you want to remove rank **${rank.name}**?`, components: [row], ephemeral: true });
}

async function saveGoogle(interaction) {
  const enabled = interaction.options.getBoolean('enabled', true);
  const webhookUrl = interaction.options.getString('webhook-url');
  const pollingUrl = interaction.options.getString('polling-url');
  const saved = updateGuildConfig(interaction.guildId, (draft) => {
    draft.google.enabled = enabled;
    if (webhookUrl) draft.google.webhookUrl = webhookUrl;
    if (pollingUrl) draft.google.pollingUrl = pollingUrl;
    draft.setup.updatedBy = interaction.user.id;
    return draft;
  });

  return interaction.reply({ content: `Google enabled: ${saved.google.enabled}\nWebhook: ${saved.google.webhookUrl ? 'SET' : 'NOT SET'}\nPolling URL: ${saved.google.pollingUrl ? 'SET' : 'NOT SET'}`, ephemeral: true });
}

async function addTicketType(interaction) {
  const name = interaction.options.getString('name', true).trim();
  const staffRole = interaction.options.getRole('staff-role');
  const category = interaction.options.getChannel('category-channel');

  updateGuildConfig(interaction.guildId, (draft) => {
    const existing = draft.tickets.types.find((type) => type.name.toLowerCase() === name.toLowerCase()) || {};
    const staffRoleIds = Array.isArray(existing.staffRoleIds) ? existing.staffRoleIds : [];
    if (staffRole && !staffRoleIds.includes(staffRole.id)) staffRoleIds.push(staffRole.id);

    const ticketType = {
      name,
      description: interaction.options.getString('description') ?? existing.description ?? '',
      staffRoleIds,
      categoryChannelId: category?.id || existing.categoryChannelId || '',
      hidden: interaction.options.getBoolean('hidden') ?? existing.hidden ?? false,
      enabled: interaction.options.getBoolean('enabled') ?? existing.enabled ?? true
    };

    draft.tickets.enabled = true;
    draft.tickets.types = draft.tickets.types.filter((type) => type.name.toLowerCase() !== name.toLowerCase());
    draft.tickets.types.push(ticketType);
    draft.setup.updatedBy = interaction.user.id;
    return draft;
  });

  return interaction.reply({ content: `Saved ticket type **${name}**.`, ephemeral: true });
}

async function listTicketTypes(interaction, config) {
  if (!config.tickets.types.length) return interaction.reply({ content: 'No ticket types are configured yet.', ephemeral: true });

  const description = config.tickets.types.map((type) => [
    `**${type.name}**`,
    type.description || 'No description.',
    `Enabled: ${type.enabled !== false}`,
    `Hidden: ${Boolean(type.hidden)}`,
    `Staff: ${type.staffRoleIds?.length ? type.staffRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
    `Category: ${type.categoryChannelId ? `<#${type.categoryChannelId}>` : 'Not set'}`
  ].join('\n')).join('\n\n');

  return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Configured Ticket Types').setDescription(description).setColor(0x3498db)], ephemeral: true });
}

async function exportConfig(interaction, config) {
  const json = JSON.stringify(sanitizeConfigForDisplay(config), null, 2);
  if (json.length < 1800) return interaction.reply({ content: `\`\`\`json\n${json}\n\`\`\``, ephemeral: true });

  const attachment = new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: `guild-config-${interaction.guildId}-sanitized.json` });
  return interaction.reply({ content: 'Sanitized config export. Webhook secrets are not included.', files: [attachment], ephemeral: true });
}

async function confirmReset(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:reset-confirm:${interaction.guildId}`).setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:reset-cancel:${interaction.guildId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({ content: 'Are you sure you want to reset all local department setup for this server?', components: [row], ephemeral: true });
}

function formatRankFields(rank) {
  return [
    { name: 'Name', value: rank.name, inline: true },
    { name: 'Order', value: String(rank.order), inline: true },
    { name: 'Rank Role', value: `<@&${rank.rankRoleId}>`, inline: true },
    { name: 'Permission Role', value: rank.permissionRoleId ? `<@&${rank.permissionRoleId}>` : 'Not set', inline: true },
    { name: 'Flags', value: rankFlags(rank), inline: true },
    { name: 'Minimum Days', value: String(rank.promotion?.minimumDaysInRank || 0), inline: true }
  ];
}

function rankFlags(rank) {
  const flags = [];
  if (rank.isRecruit) flags.push('Recruit');
  if (rank.isProbationary) flags.push('Probationary');
  if (rank.isSupervisor) flags.push('Supervisor');
  if (rank.isCommandStaff) flags.push('Command Staff');
  return flags.length ? flags.join(', ') : 'None';
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}
