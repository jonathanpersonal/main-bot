const { PermissionFlagsBits } = require('discord.js');
const { getServerConfig } = require('./configUtils');

function cleanRoleIds(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .filter((v) => typeof v === 'string' && v && !v.startsWith('PUT_') && !v.startsWith('PASTE_'))
  )];
}

function cleanUserIds(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .filter((v) => typeof v === 'string' && v && !v.startsWith('PUT_') && !v.startsWith('PASTE_'))
  )];
}

function splitEnvList(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasAnyRole(member, roleIds = []) {
  return cleanRoleIds(roleIds).some((id) => member?.roles?.cache?.has(id));
}

function hasAllRoles(member, roleIds = []) {
  const ids = cleanRoleIds(roleIds);
  return ids.length > 0 && ids.every((id) => member?.roles?.cache?.has(id));
}

function roleGroups(config = {}) {
  const p = config.permissions || {};
  const t = config.training || config.trainingManagement || {};
  const pr = config.probation || {};

  return {
    botAdmin: cleanRoleIds([
      ...(p.botAdminRoleIds || []),
      ...(p.setupAdminRoleIds || [])
    ]),

    commandStaff: cleanRoleIds(p.commandStaffRoleIds || []),
    highCommand: cleanRoleIds(p.highCommandRoleIds || []),
    supervisor: cleanRoleIds(p.supervisorRoleIds || []),

    trainingOfficer: cleanRoleIds([
      ...(p.trainingOfficerRoleIds || []),
      ...(p.trainingStaffRoleIds || []),
      ...(t.trainingOfficerRoleIds || []),
      ...(t.allowedRoleIds || []),
      ...(t.ftoRoleIds || []),
      ...(pr.trainingOfficerRoleIds || [])
    ]),

    trainingCommand: cleanRoleIds([
      ...(p.trainingCommandRoleIds || []),
      ...(t.trainingCommandRoleIds || []),
      ...(t.ftoCommandRoleIds || []),
      ...(p.ftoCommandRoleIds || []),
      ...(pr.ftoCommandRoleIds || [])
    ]),

    ftoCommand: cleanRoleIds([
      ...(p.ftoCommandRoleIds || []),
      ...(pr.ftoCommandRoleIds || []),
      ...(t.ftoCommandRoleIds || [])
    ]),

    departmentCommand: cleanRoleIds([
      ...(p.departmentCommandRoleIds || []),
      ...(pr.departmentCommandRoleIds || []),
      ...(p.commandStaffRoleIds || [])
    ]),

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

  return fallbackPermission
    ? Boolean(member?.permissions?.has(fallbackPermission))
    : false;
}

const permissionMap = {
  botAdmin: {
    groups: ['botAdmin'],
    fallback: PermissionFlagsBits.Administrator
  },

  commandStaff: {
    groups: ['commandStaff', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.ManageRoles
  },

  highCommand: {
    groups: ['highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.Administrator
  },

  supervisor: {
    groups: ['supervisor', 'commandStaff', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.ManageRoles
  },

  trainingOfficer: {
    groups: ['trainingOfficer', 'trainingCommand', 'commandStaff', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.ManageRoles
  },

  ftoCommand: {
    groups: ['ftoCommand', 'departmentCommand', 'commandStaff', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.ManageRoles
  },

  departmentCommand: {
    groups: ['departmentCommand', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.ManageRoles
  },

  lookup: {
    groups: ['lookup', 'supervisor', 'trainingOfficer', 'trainingCommand', 'commandStaff', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.ManageRoles
  },

  sync: {
    groups: ['sync', 'commandStaff', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.ManageRoles
  },

  manualOfficerUpdate: {
    groups: ['manualOfficerUpdate', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.Administrator
  },

  importUsers: {
    groups: ['importUsers', 'highCommand', 'botAdmin'],
    fallback: PermissionFlagsBits.Administrator
  },

  ticketStaff: {
    groups: ['ticketStaff', 'botAdmin'],
    fallback: PermissionFlagsBits.ManageChannels
  }
};

function canUseCommand(member, config, permissionKey) {
  const rule = permissionMap[permissionKey] || {
    groups: [permissionKey],
    fallback: null
  };

  return memberHasPermissionGroup(member, config, rule.groups, rule.fallback);
}

async function logDenied(interaction, permissionKey) {
  const config = getServerConfig(interaction.guildId);

  const channelId =
    config?.channels?.botAdminLogChannelId ||
    config?.channels?.staffLogChannelId ||
    config?.logging?.staffLogChannelId;

  const channel = channelId
    ? await interaction.guild?.channels.fetch(channelId).catch(() => null)
    : null;

  if (channel?.isTextBased()) {
    channel.send({
      content: `Permission denied: ${interaction.user.tag} (${interaction.user.id}) tried /${interaction.commandName || 'interaction'} requiring ${permissionKey}.`
    }).catch(() => {});
  }
}

async function safePermissionReply(interaction, message) {
  const payload = {
    content: message,
    ephemeral: true
  };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    console.error('Could not send permission denial reply:', error);
  }
}

async function requirePermission(interaction, permissionKey, options = {}) {
  const config = options.config || getServerConfig(interaction.guildId);

  if (canUseCommand(interaction.member, config, permissionKey)) return true;

  if (options.log !== false) await logDenied(interaction, permissionKey);

  await safePermissionReply(
    interaction,
    options.message || 'You do not have permission to use this command.'
  );

  return false;
}

/**
 * Dev-only mode is a global safety gate.
 *
 * Supported config shapes:
 *
 * devOnly: {
 *   enabled: false,
 *   allowedUserIds: [],
 *   allowedRoleIds: [],
 *   allowBotAdmins: true,
 *   allowAdministrators: true,
 *   message: 'This bot is currently in development/testing mode.'
 * }
 *
 * Also supports older/simple fields:
 * devOnlyEnabled: true
 * developerOnly.enabled: true
 */
function isDevOnlyEnabled(config = {}) {
  return Boolean(
    config?.devOnly?.enabled ||
    config?.developerOnly?.enabled ||
    config?.devOnlyEnabled
  );
}

function getDevOnlySettings(config = {}) {
  const devOnly = config.devOnly || config.developerOnly || {};

  return {
    enabled: isDevOnlyEnabled(config),

    allowedUserIds: cleanUserIds([
      ...(devOnly.allowedUserIds || []),
      ...(devOnly.userIds || []),
      ...(devOnly.developerUserIds || []),
      ...(config.devOnlyUserIds || []),
      ...splitEnvList(process.env.DEV_ONLY_USER_IDS),
      ...splitEnvList(process.env.DEVELOPER_USER_IDS)
    ]),

    allowedRoleIds: cleanRoleIds([
      ...(devOnly.allowedRoleIds || []),
      ...(devOnly.roleIds || []),
      ...(devOnly.developerRoleIds || []),
      ...(config.devOnlyRoleIds || []),
      ...splitEnvList(process.env.DEV_ONLY_ROLE_IDS),
      ...splitEnvList(process.env.DEVELOPER_ROLE_IDS)
    ]),

    allowBotAdmins: devOnly.allowBotAdmins !== false,
    allowAdministrators: devOnly.allowAdministrators !== false,

    message:
      devOnly.message ||
      'This bot is currently in development/testing mode. You do not have access yet.'
  };
}

async function requireDevOnlyAccess(interaction, options = {}) {
  const config = options.config || getServerConfig(interaction.guildId);
  const settings = getDevOnlySettings(config);

  if (!settings.enabled) return true;

  const member = interaction.member;
  const userId = interaction.user?.id;

  if (userId && settings.allowedUserIds.includes(userId)) return true;

  if (hasAnyRole(member, settings.allowedRoleIds)) return true;

  if (settings.allowBotAdmins && canUseCommand(member, config, 'botAdmin')) return true;

  if (
    settings.allowAdministrators &&
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }

  if (options.log !== false) await logDenied(interaction, 'devOnly');

  await safePermissionReply(interaction, options.message || settings.message);

  return false;
}

const isBotAdmin = (member, config) => canUseCommand(member, config, 'botAdmin');
const isCommandStaff = (member, config) => canUseCommand(member, config, 'commandStaff');
const isHighCommand = (member, config) => canUseCommand(member, config, 'highCommand');
const isSupervisor = (member, config) => canUseCommand(member, config, 'supervisor');
const isTrainingOfficer = (member, config) => canUseCommand(member, config, 'trainingOfficer');
const isFtoCommand = (member, config) => canUseCommand(member, config, 'ftoCommand');
const isDepartmentCommand = (member, config) => canUseCommand(member, config, 'departmentCommand');

const canManageTraining = (member, config, level = 'officer') =>
  canUseCommand(member, config, level === 'command' ? 'ftoCommand' : 'trainingOfficer');

const canManageProbation = (member, config, level = 'officer') =>
  canUseCommand(member, config, level === 'command' ? 'ftoCommand' : 'trainingOfficer');

module.exports = {
  cleanRoleIds,
  cleanUserIds,
  hasAnyRole,
  hasAllRoles,
  roleGroups,

  memberHasAnyRole: hasAnyRole,
  memberHasPermissionGroup,

  isBotAdmin,
  isCommandStaff,
  isHighCommand,
  isSupervisor,
  isTrainingOfficer,
  isFtoCommand,
  isDepartmentCommand,

  canUseCommand,
  requirePermission,

  isDevOnlyEnabled,
  requireDevOnlyAccess,
  getDevOnlySettings,

  canManageTraining,
  canManageProbation
};