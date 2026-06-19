const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  MessageFlags,
  StringSelectMenuBuilder
} = require('discord.js');
const { createDefaultGuildConfig, createDefaultRank } = require('../config/defaultGuildConfig');
const { getGuildConfig, saveGuildConfig, updateGuildConfig } = require('../utils/guildConfigStore');
const { requireSetupAdmin } = require('../utils/setupPermissions');
const { sanitizeConfigForDisplay } = require('../utils/configSanitizer');
const { postToGoogle } = require('../utils/googleWebhook');
const { isGoogleEnabled, isGoogleConfigured } = require('../utils/googleConfigUtils');

const CUSTOM_ID_PREFIX = 'department-setup';

const roleTypeMap = {
  'setup-admin': ['permissions', 'setupAdminRoleIds'],
  'command-staff': ['permissions', 'commandStaffRoleIds'],
  supervisor: ['permissions', 'supervisorRoleIds'],
  'supervisor-in-training': ['permissions', 'supervisorInTrainingRoleIds'],
  'training-staff': ['permissions', 'trainingStaffRoleIds'],
  'ia-staff': ['permissions', 'iaStaffRoleIds'],
  'ticket-staff': ['permissions', 'ticketStaffRoleIds'],
  'high-command': ['permissions', 'highCommandRoleIds'],
  'dept-admin-staff': ['permissions', 'deptAdminStaffRoleIds'],
  'department-admin-staff': ['permissions', 'deptAdminStaffRoleIds'],
  'previous-officer': ['department', 'previousOfficerRoleId'],
  member: ['department', 'memberRoleId'],
  'department-member': ['department', 'memberRoleId'],
  'officer-member': ['department', 'memberRoleId']
};

const channelTypeMap = {
  'officer-management-log': 'officerManagementLogChannelId',
  'training-log': 'trainingLogChannelId',
  'duty-log': 'dutyLogChannelId',
  'ticket-log': 'ticketLogChannelId',
  'ia-log': 'iaLogChannelId',
  'bot-admin-log': 'botAdminLogChannelId',
  'google-log': 'googleLogChannelId',
  'ticket-panel': 'ticketPanelChannelId',
  'server-errors': 'serverErrorLogChannelId',
  'staff-log': 'staffLogChannelId'
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
        { name: 'supervisor-in-training', value: 'supervisor-in-training' },
        { name: 'training-staff', value: 'training-staff' },
        { name: 'ia-staff', value: 'ia-staff' },
        { name: 'ticket-staff', value: 'ticket-staff' },
        { name: 'high-command', value: 'high-command' },
        { name: 'dept-admin-staff', value: 'dept-admin-staff' },
        { name: 'previous-officer', value: 'previous-officer' },
        { name: 'department-member', value: 'department-member' },
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
        { name: 'ticket-panel', value: 'ticket-panel' },
        { name: 'server-errors', value: 'server-errors' },
        { name: 'staff-log', value: 'staff-log' }))
      .addChannelOption((option) => option.setName('channel').setDescription('Channel to save.').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('rank-add')
      .setDescription('Add or update a rank.')
      .addStringOption((option) => option.setName('name').setDescription('Rank name.').setRequired(true))
      .addRoleOption((option) => option.setName('rank-role').setDescription('Discord rank role.').setRequired(true))
      .addIntegerOption((option) => option.setName('order').setDescription('Rank order. Higher number = higher rank.').setRequired(true))
      .addStringOption((option) => option.setName('rank-key').setDescription('Stable rank key, such as officer_i.'))
      .addRoleOption((option) => option.setName('permission-role').setDescription('Optional permission role for this rank.'))
      .addStringOption((option) => option.setName('department').setDescription('Department key; defaults to this server default.'))
      .addBooleanOption((option) => option.setName('assign-callsign').setDescription('Can this rank receive automatic callsigns?'))
      .addBooleanOption((option) => option.setName('active').setDescription('Is this rank active?'))
      .addNumberOption((option) => option.setName('activity-active-hours').setDescription('Hours required for Active status.'))
      .addNumberOption((option) => option.setName('activity-semi-active-hours').setDescription('Hours required for Semi-Active status.'))
      .addBooleanOption((option) => option.setName('activity-exempt').setDescription('Exempt this rank from activity?'))
      .addBooleanOption((option) => option.setName('activity-cadet').setDescription('Treat this rank as cadet/new officer for activity?'))
      .addStringOption((option) => option.setName('notes').setDescription('Optional notes.'))
      .addBooleanOption((option) => option.setName('command-staff').setDescription('Is command staff?'))
      .addBooleanOption((option) => option.setName('supervisor').setDescription('Is full supervisor?'))
      .addBooleanOption((option) => option.setName('supervisor-in-training').setDescription('Is Supervisor in Training / Training Staff?'))
      .addBooleanOption((option) => option.setName('dept-admin-staff').setDescription('Is department admin staff with all bot permissions?'))
      .addBooleanOption((option) => option.setName('probationary').setDescription('Is probationary?'))
      .addBooleanOption((option) => option.setName('recruit').setDescription('Is recruit?'))
      .addIntegerOption((option) => option.setName('minimum-days').setDescription('Minimum days required in the previous rank to be promoted into this rank.')))
    .addSubcommand((subcommand) => subcommand
      .setName('rank-edit')
      .setDescription('Edit an existing rank. Only provided fields are changed.')
      .addStringOption((option) => option.setName('rank').setDescription('Rank to edit.').setRequired(true).setAutocomplete(true))
      .addStringOption((option) => option.setName('name').setDescription('New rank display name.'))
      .addRoleOption((option) => option.setName('rank-role').setDescription('New Discord rank role.'))
      .addIntegerOption((option) => option.setName('order').setDescription('New rank order. Higher number = higher rank.'))
      .addStringOption((option) => option.setName('rank-key').setDescription('New stable rank key, such as officer_i.'))
      .addRoleOption((option) => option.setName('permission-role').setDescription('New permission role for this rank.'))
      .addBooleanOption((option) => option.setName('clear-permission-role').setDescription('Clear the saved permission role?'))
      .addStringOption((option) => option.setName('department').setDescription('Department key.'))
      .addBooleanOption((option) => option.setName('assign-callsign').setDescription('Can this rank receive automatic callsigns?'))
      .addBooleanOption((option) => option.setName('active').setDescription('Is this rank active?'))
      .addNumberOption((option) => option.setName('activity-active-hours').setDescription('Hours required for Active status.'))
      .addNumberOption((option) => option.setName('activity-semi-active-hours').setDescription('Hours required for Semi-Active status.'))
      .addBooleanOption((option) => option.setName('activity-exempt').setDescription('Exempt this rank from activity?'))
      .addBooleanOption((option) => option.setName('activity-cadet').setDescription('Treat this rank as cadet/new officer for activity?'))
      .addStringOption((option) => option.setName('notes').setDescription('Optional notes.'))
      .addBooleanOption((option) => option.setName('command-staff').setDescription('Is command staff?'))
      .addBooleanOption((option) => option.setName('supervisor').setDescription('Is full supervisor?'))
      .addBooleanOption((option) => option.setName('supervisor-in-training').setDescription('Is Supervisor in Training / Training Staff?'))
      .addBooleanOption((option) => option.setName('dept-admin-staff').setDescription('Is department admin staff with all bot permissions?'))
      .addBooleanOption((option) => option.setName('probationary').setDescription('Is probationary?'))
      .addBooleanOption((option) => option.setName('recruit').setDescription('Is recruit?'))
      .addIntegerOption((option) => option.setName('minimum-days').setDescription('Minimum days required in the previous rank to be promoted into this rank.')))
    .addSubcommand((subcommand) => subcommand.setName('rank-list').setDescription('List configured ranks.'))
    .addSubcommand((subcommand) => subcommand
      .setName('google-sync')
      .setDescription('Explicitly sync local setup data to Google.')
      .addStringOption((option) => option.setName('target').setDescription('What to sync.').setRequired(true).addChoices({ name: 'ranks', value: 'ranks' })))
    .addSubcommand((subcommand) => subcommand
      .setName('dev-mode')
      .setDescription('Enable or disable dev-only mode.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable dev-only mode?').setRequired(true))
      .addUserOption((option) => option.setName('user').setDescription('Optional dev user to allow.'))
      .addRoleOption((option) => option.setName('role').setDescription('Optional dev role to allow.')))
    .addSubcommand((subcommand) => subcommand.setName('dev-mode-add-user').setDescription('Allow a user through dev-only mode.').addUserOption((option) => option.setName('user').setDescription('User to allow.').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('dev-mode-add-role').setDescription('Allow a role through dev-only mode.').addRoleOption((option) => option.setName('role').setDescription('Role to allow.').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('walkthrough').setDescription('Start the guided setup walkthrough.'))
    .addSubcommand((subcommand) => subcommand
      .setName('rank-remove')
      .setDescription('Pick a configured rank from a list and remove it after confirmation.'))
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
    if (subcommand === 'rank-edit') return editRank(interaction, config);
    if (subcommand === 'rank-list') return listRanks(interaction, config);
    if (subcommand === 'google-sync') return googleSync(interaction, config);
    if (subcommand === 'dev-mode') return saveDevMode(interaction);
    if (subcommand === 'dev-mode-add-user') return addDevUser(interaction);
    if (subcommand === 'dev-mode-add-role') return addDevRole(interaction);
    if (subcommand === 'walkthrough') return showWizard(interaction, config, 0);
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
      await interaction.reply({ content: 'This setup button belongs to a different server.', flags: MessageFlags.Ephemeral });
      return true;
    }

    if (action === 'wizard' || action === 'wizard-skip') {
      const step = Number(rest[0] || 0);
      return showWizard(interaction, config, step, true);
    }

    if (action === 'wizard-cancel') {
      updateGuildConfig(guildId, (draft) => { draft.setupWizard.inProgress = false; draft.setupWizard.updatedAt = new Date().toISOString(); return draft; });
      await interaction.update({ content: 'Setup walkthrough cancelled. Your saved config was not erased.', embeds: [], components: [] });
      return true;
    }

    if (action === 'wizard-finish') {
      updateGuildConfig(guildId, (draft) => { draft.setup.completed = true; draft.setup.updatedAt = new Date().toISOString(); draft.setup.updatedBy = interaction.user.id; draft.setupWizard.inProgress = false; return draft; });
      await interaction.update({ content: 'Setup walkthrough complete. You can now test /ping and setup commands. If Google is enabled, run /department-setup google-sync target:ranks when ready.', embeds: [], components: [] });
      return true;
    }

    if (action === 'wizard') {
      const step = Number(rest[0] || 0);
      return showWizard(interaction, config, step, true);
    }

    if (action === 'wizard-cancel') {
      updateGuildConfig(guildId, (draft) => { draft.setupWizard.inProgress = false; draft.setupWizard.updatedAt = new Date().toISOString(); return draft; });
      await interaction.update({ content: 'Setup walkthrough cancelled. Your saved config was not erased.', embeds: [], components: [] });
      return true;
    }

    if (action === 'wizard-finish') {
      updateGuildConfig(guildId, (draft) => { draft.setup.completed = true; draft.setup.updatedAt = new Date().toISOString(); draft.setup.updatedBy = interaction.user.id; draft.setupWizard.inProgress = false; return draft; });
      await interaction.update({ content: 'Setup walkthrough complete. You can now test /ping and setup commands. If Google is enabled, run /department-setup google-sync target:ranks when ready.', embeds: [], components: [] });
      return true;
    }

    if (action === 'rank-remove-confirm') {
      const selector = decodeURIComponent(rest.join(':'));
      const rankToRemove = findRankBySelector(config, selector);
      if (!rankToRemove) {
        await interaction.update({ content: 'That rank no longer exists in the setup config.', embeds: [], components: [] });
        return true;
      }

      const updated = updateGuildConfig(guildId, (draft) => {
        draft.ranks = (draft.ranks || []).filter((rank) => !rankMatchesSelector(rank, selector));
        draft.setup.updatedBy = interaction.user.id;
        draft.setup.updatedAt = new Date().toISOString();
        return draft;
      });
      await interaction.update({ content: `Removed rank **${rankToRemove.name}**. ${updated.ranks.length} rank(s) remain.`, embeds: [], components: [] });
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
  },

  async handleSelectMenu(interaction) {
    const customId = interaction.customId || '';
    if (!customId.startsWith(`${CUSTOM_ID_PREFIX}:rank-remove-select:`)) return false;

    const config = getGuildConfig(interaction.guildId);
    if (!(await requireSetupAdmin(interaction, config))) return true;

    const [, action, guildId] = customId.split(':');
    if (action !== 'rank-remove-select') return false;
    if (guildId !== interaction.guildId) {
      await interaction.reply({ content: 'This setup menu belongs to a different server.', flags: MessageFlags.Ephemeral });
      return true;
    }

    const selector = interaction.values?.[0];
    const rank = findRankBySelector(config, selector);
    if (!rank) {
      await interaction.update({ content: 'That rank no longer exists in the setup config.', embeds: [], components: [] });
      return true;
    }

    return showRankRemoveConfirmation(interaction, rank, true);
  },

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name !== 'rank') return interaction.respond([]);

    const config = getGuildConfig(interaction.guildId);
    const focused = String(focusedOption.value || '').toLowerCase();
    const choices = (config.ranks || [])
      .slice()
      .sort((a, b) => (a.order ?? a.level ?? 0) - (b.order ?? b.level ?? 0))
      .filter((rank) => {
        const haystack = [rank.name, rank.key, rank.department, String(rank.order ?? rank.level ?? '')].filter(Boolean).join(' ').toLowerCase();
        return !focused || haystack.includes(focused);
      })
      .slice(0, 25)
      .map((rank) => ({
        name: `${rank.order ?? rank.level ?? 0}. ${rank.name}${rank.key ? ` (${rank.key})` : ''}`,
        value: rankSelector(rank)
      }));

    return interaction.respond(choices);
  }
};

async function showStatus(interaction, config) {
  const warnings = [];
  const hasProfile = Boolean(config.department.name && config.department.acronym);
  const hasRanks = config.ranks.length > 0;
  const hasPermissionRoles = Object.values(config.permissions).some((ids) => Array.isArray(ids) && ids.length > 0);
  const hasDepartmentMemberRole = Boolean(config.department?.memberRoleId || config.roles?.departmentMemberRoleId);
  const hasLogChannels = Object.values(config.channels).some(Boolean);
  const hasTicketTypes = config.tickets.types.length > 0;

  if (!hasProfile) warnings.push('Set the department profile.');
  if (!hasRanks) warnings.push('Add at least one rank.');
  if (!hasPermissionRoles) warnings.push('Add setup/admin and staff permission roles.');
  if (!hasDepartmentMemberRole) warnings.push('Add the department-member role so every officer receives the shared department-wide permission role.');
  if (!hasLogChannels) warnings.push('Set log channels.');
  if (config.google.enabled && !config.google.webhookUrl) warnings.push('Google is enabled but webhook URL is not set.');

  const embed = new EmbedBuilder()
    .setTitle('Department Setup Status')
    .setColor(warnings.length ? 0xffcc00 : 0x2ecc71)
    .addFields(
      { name: 'Department profile', value: yesNo(hasProfile), inline: true },
      { name: 'Ranks configured', value: yesNo(hasRanks), inline: true },
      { name: 'Permission roles', value: yesNo(hasPermissionRoles), inline: true },
      { name: 'Department member role', value: yesNo(hasDepartmentMemberRole), inline: true },
      { name: 'Log channels', value: yesNo(hasLogChannels), inline: true },
      { name: 'Google enabled', value: yesNo(config.google.enabled), inline: true },
      { name: 'Google webhook', value: config.google.webhookUrl ? 'SET' : 'NOT SET', inline: true },
      { name: 'Ticket types', value: yesNo(hasTicketTypes), inline: true },
      { name: 'Warnings', value: warnings.length ? warnings.map((warning) => `• ${warning}`).join('\n') : 'No major warnings.' }
    );

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

  return interaction.reply({ content: `Saved department profile: **${name}** (${acronym}).`, flags: MessageFlags.Ephemeral });
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

  return interaction.reply({ content: `Saved ${type} role: ${role}.`, flags: MessageFlags.Ephemeral });
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

  return interaction.reply({ content: `Saved ${type} channel: ${channel}.`, flags: MessageFlags.Ephemeral });
}

async function addRank(interaction) {
  const name = interaction.options.getString('name', true).trim();
  const rankRole = interaction.options.getRole('rank-role', true);
  const permissionRole = interaction.options.getRole('permission-role');
  const order = interaction.options.getInteger('order', true);
  const rankKey = (interaction.options.getString('rank-key') || slugifyRankKey(name)).trim();
  const config = getGuildConfig(interaction.guildId);
  const department = (interaction.options.getString('department') || config.google?.departmentKey || config.departmentKey || 'main').trim() || 'main';
  const existingByKey = config.ranks.find((rank) => (rank.key || '').toLowerCase() === rankKey.toLowerCase() && (rank.department || 'main').toLowerCase() === department.toLowerCase());
  const existingByName = config.ranks.find((rank) => rank.name.toLowerCase() === name.toLowerCase());
  const existing = existingByKey || existingByName;
  const duplicateRole = config.ranks.find((rank) => rank.rankRoleId === rankRole.id && rank.name.toLowerCase() !== name.toLowerCase());

  if (duplicateRole) {
    return interaction.reply({ content: `That rank role is already used by **${duplicateRole.name}**.`, flags: MessageFlags.Ephemeral });
  }

  const activityExempt = interaction.options.getBoolean('activity-exempt') ?? existing?.activity?.exempt ?? existing?.isActivityExempt ?? false;
  const activityCadet = interaction.options.getBoolean('activity-cadet') ?? existing?.activity?.cadet ?? existing?.isActivityCadet ?? false;

  const saved = updateGuildConfig(interaction.guildId, (draft) => {
    const rank = createDefaultRank({
      ...(existing || {}),
      key: rankKey,
      name,
      rankRoleId: rankRole.id,
      permissionRoleId: permissionRole?.id || existing?.permissionRoleId || '',
      order,
      level: order,
      department,
      assignCallsign: interaction.options.getBoolean('assign-callsign') ?? existing?.assignCallsign ?? false,
      active: interaction.options.getBoolean('active') ?? existing?.active ?? true,
      notes: interaction.options.getString('notes') ?? existing?.notes ?? '',
      isCommandStaff: interaction.options.getBoolean('command-staff') ?? existing?.isCommandStaff ?? false,
      isSupervisor: interaction.options.getBoolean('supervisor') ?? existing?.isSupervisor ?? false,
      isSupervisorInTraining: interaction.options.getBoolean('supervisor-in-training') ?? existing?.isSupervisorInTraining ?? false,
      isDepartmentAdminStaff: interaction.options.getBoolean('dept-admin-staff') ?? existing?.isDepartmentAdminStaff ?? false,
      isProbationary: interaction.options.getBoolean('probationary') ?? existing?.isProbationary ?? false,
      isRecruit: interaction.options.getBoolean('recruit') ?? existing?.isRecruit ?? false,
      isActivityExempt: activityExempt,
      isActivityCadet: activityCadet,
      activity: {
        ...(existing?.activity || {}),
        activeHours: interaction.options.getNumber('activity-active-hours') ?? existing?.activity?.activeHours ?? null,
        semiActiveHours: interaction.options.getNumber('activity-semi-active-hours') ?? existing?.activity?.semiActiveHours ?? null,
        exempt: activityExempt,
        cadet: activityCadet
      },
      promotion: {
        ...(existing?.promotion || {}),
        minimumDaysInRank: interaction.options.getInteger('minimum-days') ?? existing?.promotion?.minimumDaysInRank ?? 0
      }
    });

    draft.ranks = draft.ranks.filter((item) => item !== existing && !((item.key || '').toLowerCase() === rankKey.toLowerCase() && (item.department || 'main').toLowerCase() === department.toLowerCase()));
    draft.ranks.push(rank);
    draft.ranks.sort((a, b) => a.order - b.order);
    draft.setup.updatedBy = interaction.user.id;
    draft.setup.updatedAt = new Date().toISOString();
    return draft;
  });

  const savedRank = saved.ranks.find((rank) => (rank.key || '').toLowerCase() === rankKey.toLowerCase() && (rank.department || 'main').toLowerCase() === department.toLowerCase());
  const embed = new EmbedBuilder().setTitle('Rank Saved').setColor(0x2ecc71).addFields(formatRankFields(savedRank));
  return interaction.reply({ content: 'Rank added to local config. Run /department-setup google-sync target:ranks when you are ready to push ranks to Google Sheets.', embeds: [embed], ephemeral: true });
}

async function editRank(interaction, config) {
  const selector = interaction.options.getString('rank', true);
  const existing = findRankBySelector(config, selector);

  if (!existing) {
    return interaction.reply({ content: 'No matching rank was found. Use /department-setup rank-list to review configured ranks.', flags: MessageFlags.Ephemeral });
  }

  const editableOptions = [
    'name',
    'rank-role',
    'order',
    'rank-key',
    'permission-role',
    'clear-permission-role',
    'department',
    'assign-callsign',
    'active',
    'activity-active-hours',
    'activity-semi-active-hours',
    'activity-exempt',
    'activity-cadet',
    'notes',
    'command-staff',
    'supervisor',
    'supervisor-in-training',
    'dept-admin-staff',
    'probationary',
    'recruit',
    'minimum-days'
  ];

  if (!hasAnyProvidedOption(interaction, editableOptions)) {
    const embed = new EmbedBuilder().setTitle('Rank Details').setColor(0x3498db).addFields(formatRankFields(existing));
    return interaction.reply({ content: 'No edit fields were provided, so nothing was changed.', embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const rankRole = interaction.options.getRole('rank-role');
  const permissionRole = interaction.options.getRole('permission-role');
  const clearPermissionRole = interaction.options.getBoolean('clear-permission-role') ?? false;
  const newKey = (interaction.options.getString('rank-key') || existing.key || slugifyRankKey(existing.name)).trim();
  const newName = (interaction.options.getString('name') || existing.name).trim();
  const newDepartment = (interaction.options.getString('department') || existing.department || config.google?.departmentKey || config.departmentKey || 'main').trim() || 'main';

  if (!newName) {
    return interaction.reply({ content: 'Rank name cannot be blank.', flags: MessageFlags.Ephemeral });
  }

  const newRankRoleId = rankRole?.id || existing.rankRoleId || '';
  if (rankRole) {
    const duplicateRole = (config.ranks || []).find((rank) => rank.rankRoleId === rankRole.id && !rankMatchesSelector(rank, selector));
    if (duplicateRole) {
      return interaction.reply({ content: `That rank role is already used by **${duplicateRole.name}**.`, flags: MessageFlags.Ephemeral });
    }
  }

  let newPermissionRoleId = existing.permissionRoleId || '';
  if (clearPermissionRole) newPermissionRoleId = '';
  if (permissionRole) newPermissionRoleId = permissionRole.id;

  const activityExempt = interaction.options.getBoolean('activity-exempt') ?? existing.activity?.exempt ?? existing.isActivityExempt ?? false;
  const activityCadet = interaction.options.getBoolean('activity-cadet') ?? existing.activity?.cadet ?? existing.isActivityCadet ?? false;

  const saved = updateGuildConfig(interaction.guildId, (draft) => {
    const updatedRank = createDefaultRank({
      ...existing,
      key: newKey,
      name: newName,
      rankRoleId: newRankRoleId,
      permissionRoleId: newPermissionRoleId,
      order: interaction.options.getInteger('order') ?? existing.order ?? existing.level ?? 0,
      level: interaction.options.getInteger('order') ?? existing.order ?? existing.level ?? 0,
      department: newDepartment,
      assignCallsign: interaction.options.getBoolean('assign-callsign') ?? existing.assignCallsign ?? false,
      active: interaction.options.getBoolean('active') ?? existing.active ?? true,
      notes: interaction.options.getString('notes') ?? existing.notes ?? '',
      isCommandStaff: interaction.options.getBoolean('command-staff') ?? existing.isCommandStaff ?? false,
      isSupervisor: interaction.options.getBoolean('supervisor') ?? existing.isSupervisor ?? false,
      isSupervisorInTraining: interaction.options.getBoolean('supervisor-in-training') ?? existing.isSupervisorInTraining ?? false,
      isDepartmentAdminStaff: interaction.options.getBoolean('dept-admin-staff') ?? existing.isDepartmentAdminStaff ?? false,
      isProbationary: interaction.options.getBoolean('probationary') ?? existing.isProbationary ?? false,
      isRecruit: interaction.options.getBoolean('recruit') ?? existing.isRecruit ?? false,
      isActivityExempt: activityExempt,
      isActivityCadet: activityCadet,
      activity: {
        ...(existing.activity || {}),
        activeHours: interaction.options.getNumber('activity-active-hours') ?? existing.activity?.activeHours ?? null,
        semiActiveHours: interaction.options.getNumber('activity-semi-active-hours') ?? existing.activity?.semiActiveHours ?? null,
        exempt: activityExempt,
        cadet: activityCadet
      },
      promotion: {
        ...(existing.promotion || {}),
        minimumDaysInRank: interaction.options.getInteger('minimum-days') ?? existing.promotion?.minimumDaysInRank ?? 0
      }
    });

    draft.ranks = (draft.ranks || []).filter((rank) => !rankMatchesSelector(rank, selector));
    draft.ranks.push(updatedRank);
    draft.ranks.sort((a, b) => (a.order ?? a.level ?? 0) - (b.order ?? b.level ?? 0));
    draft.setup.updatedBy = interaction.user.id;
    draft.setup.updatedAt = new Date().toISOString();
    return draft;
  });

  const savedRank = (saved.ranks || []).find((rank) => rankMatchesSelector(rank, rankSelector({ ...existing, key: newKey, department: newDepartment })))
    || (saved.ranks || []).find((rank) => (rank.key || '').toLowerCase() === newKey.toLowerCase() && (rank.department || 'main').toLowerCase() === newDepartment.toLowerCase());
  const embed = new EmbedBuilder().setTitle('Rank Updated').setColor(0x2ecc71).addFields(formatRankFields(savedRank || existing));
  return interaction.reply({ content: 'Rank updated in local config. Run /department-setup google-sync target:ranks when you are ready to push ranks to Google Sheets.', embeds: [embed], flags: MessageFlags.Ephemeral });
}

function hasAnyProvidedOption(interaction, names) {
  return names.some((name) => Boolean(interaction.options.get(name)));
}

function rankSelector(rank) {
  const department = rank.department || 'main';
  const key = rank.key || rank.rankKey || slugifyRankKey(rank.name);
  return `${department}::${key}`;
}

function rankMatchesSelector(rank, selector) {
  const decoded = String(selector || '');
  const currentSelector = rankSelector(rank).toLowerCase();
  const key = String(rank.key || rank.rankKey || '').toLowerCase();
  const name = String(rank.name || '').toLowerCase();
  const legacyName = decodeURIComponent(decoded).toLowerCase();

  return currentSelector === decoded.toLowerCase() || Boolean(key && key === decoded.toLowerCase()) || Boolean(name && name === legacyName);
}

function findRankBySelector(config, selector) {
  return (config.ranks || []).find((rank) => rankMatchesSelector(rank, selector));
}

function buildRankSelectOptions(config) {
  return (config.ranks || [])
    .slice()
    .sort((a, b) => (a.order ?? a.level ?? 0) - (b.order ?? b.level ?? 0))
    .slice(0, 25)
    .map((rank) => ({
      label: `${rank.order ?? rank.level ?? 0}. ${rank.name}`.slice(0, 100),
      description: `Key: ${rank.key || slugifyRankKey(rank.name)} | Dept: ${rank.department || 'main'}`.slice(0, 100),
      value: rankSelector(rank)
    }));
}

function showRankRemoveConfirmation(interaction, rank, update = false) {
  const selector = rankSelector(rank);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:rank-remove-confirm:${interaction.guildId}:${encodeURIComponent(selector)}`).setLabel('Confirm Remove').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:rank-remove-cancel:${interaction.guildId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
  const content = `Are you sure you want to remove rank **${rank.name}**?`;

  if (update) return interaction.update({ content, embeds: [], components: [row] });
  return interaction.reply({ content, components: [row], flags: MessageFlags.Ephemeral });
}

function slugifyRankKey(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'rank';
}

async function listRanks(interaction, config) {
  if (!config.ranks.length) return interaction.reply({ content: 'No ranks are configured yet.', flags: MessageFlags.Ephemeral });

  const description = config.ranks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((rank) => `**${rank.order}. ${rank.name}**\nRole: <@&${rank.rankRoleId}>${rank.permissionRoleId ? `\nPermission: <@&${rank.permissionRoleId}>` : ''}\nFlags: ${rankFlags(rank)}\nMinimum days: ${rank.promotion?.minimumDaysInRank || 0}`)
    .join('\n\n');

  return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Configured Ranks').setDescription(description).setColor(0x3498db)], flags: MessageFlags.Ephemeral });
}

async function confirmRankRemove(interaction, config) {
  if (!config.ranks.length) return interaction.reply({ content: 'No ranks are configured yet.', flags: MessageFlags.Ephemeral });

  const options = buildRankSelectOptions(config);
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:rank-remove-select:${interaction.guildId}`)
      .setPlaceholder('Choose the rank to remove')
      .addOptions(options)
  );

  return interaction.reply({
    content: 'Pick the rank you want to remove. You will still get a confirmation button before anything is deleted.',
    components: [row],
    flags: MessageFlags.Ephemeral
  });
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

  return interaction.reply({ content: `Google enabled: ${saved.google.enabled}\nWebhook: ${saved.google.webhookUrl ? 'SET' : 'NOT SET'}\nPolling URL: ${saved.google.pollingUrl ? 'SET' : 'NOT SET'}`, flags: MessageFlags.Ephemeral });
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

  return interaction.reply({ content: `Saved ticket type **${name}**.`, flags: MessageFlags.Ephemeral });
}

async function listTicketTypes(interaction, config) {
  if (!config.tickets.types.length) return interaction.reply({ content: 'No ticket types are configured yet.', flags: MessageFlags.Ephemeral });

  const description = config.tickets.types.map((type) => [
    `**${type.name}**`,
    type.description || 'No description.',
    `Enabled: ${type.enabled !== false}`,
    `Hidden: ${Boolean(type.hidden)}`,
    `Staff: ${type.staffRoleIds?.length ? type.staffRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
    `Category: ${type.categoryChannelId ? `<#${type.categoryChannelId}>` : 'Not set'}`
  ].join('\n')).join('\n\n');

  return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Configured Ticket Types').setDescription(description).setColor(0x3498db)], flags: MessageFlags.Ephemeral });
}

async function exportConfig(interaction, config) {
  const json = JSON.stringify(sanitizeConfigForDisplay(config), null, 2);
  if (json.length < 1800) return interaction.reply({ content: `\`\`\`json\n${json}\n\`\`\``, flags: MessageFlags.Ephemeral });

  const attachment = new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: `guild-config-${interaction.guildId}-sanitized.json` });
  return interaction.reply({ content: 'Sanitized config export. Webhook secrets are not included.', files: [attachment], flags: MessageFlags.Ephemeral });
}

async function confirmReset(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:reset-confirm:${interaction.guildId}`).setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:reset-cancel:${interaction.guildId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({ content: 'Are you sure you want to reset all local department setup for this server?', components: [row], flags: MessageFlags.Ephemeral });
}

async function googleSync(interaction, config) {
  const target = interaction.options.getString('target', true);
  if (target !== 'ranks') return interaction.reply({ content: 'Only target:ranks is supported right now.', flags: MessageFlags.Ephemeral });
  if (!isGoogleEnabled(config)) return interaction.reply({ content: 'Google integration is disabled for this server. Rank sync was not run.', flags: MessageFlags.Ephemeral });
  if (!isGoogleConfigured(config)) return interaction.reply({ content: 'Google integration is enabled, but the Google Web App / Worker URL is not configured.', flags: MessageFlags.Ephemeral });

  const departmentKey = config.google?.departmentKey || config.departmentKey || 'main';
  const payload = {
    action: 'SYNC_RANKS_CONFIG',
    actionType: 'SYNC_RANKS_CONFIG',
    guildId: interaction.guildId,
    departmentKey,
    departmentName: config.department?.name || config.departmentName || interaction.guild?.name || '',
    ranks: (config.ranks || []).map((rank) => ({
      rankKey: rank.key || slugifyRankKey(rank.name),
      rankName: rank.name,
      rankOrder: rank.order ?? rank.level ?? 0,
      department: rank.department || departmentKey,
      assignCallsign: Boolean(rank.assignCallsign),
      active: rank.active !== false,
      discordRoleId: rank.rankRoleId || '',
      permissionRoleId: rank.permissionRoleId || '',
      notes: rank.notes || '',
      activityActiveHours: rank.activity?.activeHours ?? null,
      activitySemiActiveHours: rank.activity?.semiActiveHours ?? null,
      activityExempt: Boolean(rank.activity?.exempt ?? rank.isActivityExempt),
      activityCadet: Boolean(rank.activity?.cadet ?? rank.isActivityCadet),
      commandStaff: Boolean(rank.isCommandStaff),
      supervisor: Boolean(rank.isSupervisor),
      supervisorInTraining: Boolean(rank.isSupervisorInTraining),
      deptAdminStaff: Boolean(rank.isDepartmentAdminStaff),
      probationary: Boolean(rank.isProbationary),
      recruit: Boolean(rank.isRecruit),
      minimumDaysInRank: rank.promotion?.minimumDaysInRank ?? 0
    }))
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await postToGoogle('submitBotRequest', payload);
  await interaction.editReply(`Rank sync complete.\nAdded: ${result.added ?? result.result?.added ?? 0}\nUpdated: ${result.updated ?? result.result?.updated ?? 0}\nSkipped: ${result.skipped ?? result.result?.skipped ?? 0}`);
}

async function saveDevMode(interaction) {
  const enabled = interaction.options.getBoolean('enabled', true);
  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  const saved = updateGuildConfig(interaction.guildId, (draft) => {
    draft.devOnly.enabled = enabled;
    draft.devOnly.bypassForBotAdmins = true;
    if (user && !draft.devOnly.userIds.includes(user.id)) draft.devOnly.userIds.push(user.id);
    if (role && !draft.devOnly.roleIds.includes(role.id)) draft.devOnly.roleIds.push(role.id);
    draft.setup.updatedBy = interaction.user.id;
    return draft;
  });
  const warning = enabled && !saved.devOnly.userIds.length && !saved.devOnly.roleIds.length && saved.devOnly.bypassForBotAdmins === false ? '\nWarning: no allowed dev user/role or bot admin bypass is configured.' : '';
  return interaction.reply({ content: `Dev mode ${enabled ? 'enabled' : 'disabled'}. Only configured dev users/roles and bot admins can use setup commands.${warning}`, flags: MessageFlags.Ephemeral });
}

async function addDevUser(interaction) {
  const user = interaction.options.getUser('user', true);
  updateGuildConfig(interaction.guildId, (draft) => { if (!draft.devOnly.userIds.includes(user.id)) draft.devOnly.userIds.push(user.id); return draft; });
  return interaction.reply({ content: `Added ${user} to dev mode access.`, flags: MessageFlags.Ephemeral });
}

async function addDevRole(interaction) {
  const role = interaction.options.getRole('role', true);
  updateGuildConfig(interaction.guildId, (draft) => { if (!draft.devOnly.roleIds.includes(role.id)) draft.devOnly.roleIds.push(role.id); return draft; });
  return interaction.reply({ content: `Added ${role} to dev mode access.`, flags: MessageFlags.Ephemeral });
}

async function showWizard(interaction, config, step = 0, update = false) {
  const steps = [
    ['Welcome', 'This walkthrough helps configure dev mode, department identity, setup/admin roles, command staff roles, log channels, error log channel, Google integration, ranks, tickets, and final review.'],
    ['Enable dev mode', 'Use /department-setup dev-mode enabled:true user:@You role:@DevRole to limit access while setting up.'],
    ['Department identity', 'Use /department-setup profile to save Department Name and Acronym. Department key defaults to main.'],
    ['Core roles', 'Use /department-setup role type:setup-admin, command-staff, high-command, dept-admin-staff, supervisor, supervisor-in-training, department-member, and previous-officer.'],
    ['Log channels', 'Use /department-setup channel. The server error log channel is type:server-errors.'],
    ['Google integration', 'Use /department-setup google enabled:true only after URLs/secrets are configured in environment variables.'],
    ['Rank setup', 'Use /department-setup rank-add with required name, rank-role, order and optional activity/flag fields. Use supervisor-in-training:true for Lead Officer/Corporal and dept-admin-staff:true for Chief/Deputy Chief/Commander. Ranks save locally only.'],
    ['Ticket basics', 'Use ticket setup commands for ticket types and ticket panel settings.'],
    ['Final review', `Department: ${config.department?.name || 'Not set'}\nDev mode: ${config.devOnly?.enabled ? 'Enabled' : 'Disabled'}\nRanks: ${(config.ranks || []).length}\nGoogle: ${config.google?.enabled ? 'Enabled' : 'Disabled'}\nServer error channel: ${config.channels?.serverErrorLogChannelId ? 'Set' : 'Not set'}`]
  ];
  const index = Math.max(0, Math.min(step, steps.length - 1));
  updateGuildConfig(interaction.guildId, (draft) => { draft.setupWizard = { inProgress: true, step: steps[index][0], startedBy: draft.setupWizard?.startedBy || interaction.user.id, startedAt: draft.setupWizard?.startedAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; return draft; });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:wizard:${interaction.guildId}:${Math.max(0, index - 1)}`).setLabel('Back').setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:wizard:${interaction.guildId}:${Math.min(steps.length - 1, index + 1)}`).setLabel(index === 0 ? 'Start' : 'Next').setStyle(ButtonStyle.Primary).setDisabled(index === steps.length - 1),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:wizard-skip:${interaction.guildId}:${Math.min(steps.length - 1, index + 1)}`).setLabel('Skip').setStyle(ButtonStyle.Secondary).setDisabled(index === steps.length - 1),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:wizard-cancel:${interaction.guildId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:wizard-finish:${interaction.guildId}`).setLabel('Finish').setStyle(ButtonStyle.Success)
  );
  const embed = new EmbedBuilder().setTitle(`Setup Walkthrough: ${steps[index][0]}`).setDescription(steps[index][1]).setColor(0x5865f2).setFooter({ text: `Step ${index + 1} of ${steps.length}` });
  const payload = { embeds: [embed], components: [row] };
  if (update) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
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
  if (rank.isSupervisorInTraining) flags.push('Supervisor In Training');
  if (rank.isSupervisor) flags.push('Supervisor');
  if (rank.isCommandStaff) flags.push('Command Staff');
  if (rank.isDepartmentAdminStaff) flags.push('Dept Admin Staff');
  return flags.length ? flags.join(', ') : 'None';
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}
