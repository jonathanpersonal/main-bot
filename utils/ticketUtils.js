const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { getServerConfig } = require('./configUtils');
const { sendTicketLog: sendTicketLogEmbed } = require('./logUtils');
const { generateTextTranscript } = require('./transcriptUtils');
const { safeSubmitDepartmentEvent } = require('./googleDepartmentEvents');

const METADATA_PREFIX = 'ticket:';

function getTicketConfig(guildId) {
  return getServerConfig(guildId)?.tickets || {};
}

function getTicketType(guildId, typeId) {
  return getTicketConfig(guildId).types?.find((type) => type.id === typeId) || null;
}

function getListedTicketTypes(guildId) {
  return (getTicketConfig(guildId).types || [])
    .filter((type) => type.enabled && type.listed && !type.systemOnly);
}

function canManageTickets(member, cfg = getTicketConfig()) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;

  const allowedRoleIds = [
    ...(cfg.staffRoleIds || []),
    ...(cfg.adminRoleIds || [])
  ].filter(Boolean);

  return allowedRoleIds.some((roleId) => member.roles?.cache?.has(roleId));
}

function isTicketChannel(channel) {
  return Boolean(readTicketMetadata(channel));
}

function safeName(value) {
  return String(value || 'ticket')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'ticket';
}

function shortType(type) {
  return safeName(type.id
    .replace('general_support', 'general')
    .replace('training_recruitment', 'training')
    .replace('contact_command_staff', 'command'));
}

function buildInitialMetadata({ openerId, typeId }) {
  return {
    openerId,
    typeId,
    locked: false,
    lockdownPresetId: null,
    claimedById: null,
    closed: false,
    closedById: null,
    closedAt: null
  };
}

function normalizeMetadata(metadata = {}) {
  if (!metadata.openerId || !metadata.typeId) return null;

  return {
    openerId: metadata.openerId,
    typeId: metadata.typeId,
    locked: Boolean(metadata.locked),
    lockdownPresetId: metadata.lockdownPresetId || null,
    claimedById: metadata.claimedById || null,
    closed: Boolean(metadata.closed),
    closedById: metadata.closedById || null,
    closedAt: metadata.closedAt || null
  };
}

function topicFor(metadata) {
  return `${METADATA_PREFIX}${JSON.stringify(normalizeMetadata(metadata))}`.slice(0, 1024);
}

function readTicketMetadata(channel) {
  const topic = channel?.topic || '';
  const start = topic.indexOf(METADATA_PREFIX);
  if (start === -1) return null;

  try {
    return normalizeMetadata(JSON.parse(topic.slice(start + METADATA_PREFIX.length)));
  } catch {
    return null;
  }
}

async function updateTicketMetadata(channel, nextMetadata) {
  const metadata = normalizeMetadata(nextMetadata);
  await channel.setTopic(topicFor(metadata));
  return metadata;
}

function roleIdsFor(type, cfg) {
  return [...new Set([
    ...(type.routedRoleIds || []),
    ...(cfg.staffRoleIds || []),
    ...(cfg.adminRoleIds || [])
  ].filter(Boolean))];
}

function baseOverwrites({ guild, userId, type, cfg, clientId, openerCanSend = true }) {
  const openerAllow = openerCanSend
    ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];

  const openerOverwrite = {
    id: userId,
    allow: openerAllow
  };

  if (!openerCanSend) {
    openerOverwrite.deny = [PermissionFlagsBits.SendMessages];
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    openerOverwrite,
    { id: clientId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
  ];

  for (const roleId of roleIdsFor(type, cfg)) {
    overwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  return overwrites;
}

function lockdownOverwrites({ guild, preset, metadata, cfg, clientId }) {
  const roleIds = [
    ...(preset.allowedRoleIds || []),
    ...(preset.id === 'staff_and_opener' ? cfg.staffRoleIds || [] : []),
    ...(cfg.adminRoleIds || [])
  ].filter(Boolean);

  const userIds = [
    ...(preset.allowedUserIds || []),
    ...(preset.includeTicketOpener && metadata.openerId ? [metadata.openerId] : [])
  ].filter(Boolean);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: clientId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
  ];

  for (const roleId of [...new Set(roleIds)]) {
    overwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  for (const userId of [...new Set(userIds)]) {
    overwrites.push({
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  return overwrites;
}

function controls(type, locked = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:claim')
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!type.allowClaim),
      new ButtonBuilder()
        .setCustomId('ticket:rename')
        .setLabel('Rename')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!type.allowRename),
      new ButtonBuilder()
        .setCustomId('ticket:transfer')
        .setLabel('Transfer')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!type.allowTransfer),
      new ButtonBuilder()
        .setCustomId(locked ? 'ticket:unlock' : 'ticket:lockdown')
        .setLabel(locked ? 'Unlock' : 'Lockdown')
        .setStyle(locked ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(!type.allowLockdown),
      new ButtonBuilder()
        .setCustomId('ticket:close')
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!type.allowClose)
    )
  ];
}

function ticketEmbed({ type, opener, createdBy, system, reason, metadata, status = 'Open' }) {
  const fields = [
    { name: 'Type', value: type.label, inline: true },
    { name: 'Status', value: status, inline: true },
    { name: system ? 'Target user' : 'Opened by', value: `${opener}`, inline: true }
  ];

  if (createdBy) fields.push({ name: 'Created by', value: `${createdBy}`, inline: true });
  if (reason) fields.push({ name: 'Reason', value: String(reason).slice(0, 1024), inline: false });

  for (const key of ['terminationCaseId', 'appealCaseId', 'approvedBy', 'approvalReason', 'originalRank', 'previousCallsign']) {
    if (metadata?.[key]) {
      fields.push({ name: formatMetadataKey(key), value: String(metadata[key]).slice(0, 1024), inline: true });
    }
  }

  return new EmbedBuilder()
    .setTitle(system ? 'System-Created Reinstatement Ticket' : `${type.emoji || '🎫'} ${type.label}`)
    .setDescription(system ? 'This ticket was created by an internal workflow.' : type.description)
    .setColor(0x5865f2)
    .addFields(fields)
    .setTimestamp();
}

function formatMetadataKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

async function sendTicketLog(guild, title, details) {
  return sendTicketLogEmbed({
    guild,
    serverConfig: getServerConfig(interaction?.guildId || guild?.id),
    title,
    details
  });
}

async function createTicket({ guild, typeId, targetUser, createdBy, reason, metadata, system = false, interaction }) {
  const cfg = getTicketConfig(guild.id);
  if (!cfg.enabled) throw new Error('Tickets are not enabled.');

  const type = getTicketType(guild.id, typeId);
  if (!type) throw new Error('Unknown ticket type.');
  if (!type.enabled) throw new Error('This ticket type is disabled.');
  if (!system && (!type.listed || type.systemOnly)) throw new Error('This ticket type is not publicly available.');

  if (!system) {
    const existingChannel = await findOpenTicketChannel(guild, targetUser.id, type.id);
    if (existingChannel) {
      await interaction.reply({ content: `You already have an open ticket: ${existingChannel}`, ephemeral: true });
      return existingChannel;
    }
  }

  const ticketMetadata = buildInitialMetadata({ openerId: targetUser.id, typeId: type.id });
  const parent = type.categoryId || cfg.categoryId || null;
  const channel = await guild.channels.create({
    name: `ticket-${shortType(type)}-${safeName(targetUser.username || targetUser.tag || targetUser.id)}`.slice(0, 95),
    type: ChannelType.GuildText,
    parent: parent || undefined,
    topic: topicFor(ticketMetadata),
    permissionOverwrites: baseOverwrites({
      guild,
      userId: targetUser.id,
      type,
      cfg,
      clientId: guild.client.user.id
    })
  });

  await channel.send({
    content: `${targetUser}`,
    embeds: [ticketEmbed({ type, opener: targetUser, createdBy, system, reason, metadata })],
    components: controls(type)
  });

  await sendTicketLog(
    guild,
    system ? 'System reinstatement ticket created' : 'Ticket created',
    `${type.label} ticket: ${channel}\nUser: ${targetUser}\nCreated by: ${createdBy || targetUser}`
  );
  await submitTicketGoogleEvent({ interaction, guild, actionType: 'TICKET_CREATED', actor: createdBy || targetUser, targetUser, channel, metadata: ticketMetadata, extra: { typeId: type.id, typeLabel: type.label, system, reason } });

  if (interaction) {
    await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
  }

  return channel;
}

async function findOpenTicketChannel(guild, openerId, typeId) {
  await guild.channels.fetch().catch(() => null);

  return guild.channels.cache.find((channel) => {
    if (channel.type !== ChannelType.GuildText) return false;
    const metadata = readTicketMetadata(channel);
    return metadata?.openerId === openerId && metadata.typeId === typeId && !metadata.closed;
  }) || null;
}

async function createTicketFromPanel(interaction, typeId) {
  return createTicket({
    guild: interaction.guild,
    typeId,
    targetUser: interaction.user,
    createdBy: interaction.user,
    interaction
  });
}

async function createSystemTicket(options) {
  return createTicket({ ...options, system: true });
}

async function assertStaff(interaction) {
  if (!canManageTickets(interaction.member)) {
    await replyEphemeral(interaction, 'Only ticket staff/admins can use ticket controls.');
    return false;
  }

  return true;
}

async function assertTicketControl(interaction) {
  if (!(await assertStaff(interaction))) return null;

  const metadata = readTicketMetadata(interaction.channel);
  if (!metadata) {
    await replyEphemeral(interaction, 'This action can only be used inside a ticket channel.');
    return null;
  }

  return metadata;
}

async function replyEphemeral(interaction, content) {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}

async function claimTicket(interaction) {
  const metadata = await assertTicketControl(interaction);
  if (!metadata) return;

  const nextMetadata = await updateTicketMetadata(interaction.channel, {
    ...metadata,
    claimedById: interaction.user.id
  });

  await interaction.reply({ content: `Ticket claimed by ${interaction.user}.` });
  await sendTicketLog(interaction.guild, 'Ticket claimed', `${interaction.channel} claimed by ${interaction.user}\nClaimed by ID: ${nextMetadata.claimedById}`);
  await submitTicketGoogleEvent({ interaction, actionType: 'TICKET_CLAIMED', metadata: nextMetadata });
}

async function renameTicket(interaction) {
  if (!(await assertTicketControl(interaction))) return;

  await interaction.showModal(
    new ModalBuilder()
      .setCustomId('ticket:rename_modal')
      .setTitle('Rename Ticket')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New ticket name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ))
  );
}

async function handleRenameModal(interaction) {
  if (!(await assertTicketControl(interaction))) return;

  const oldName = interaction.channel.name;
  await interaction.channel.setName(safeName(interaction.fields.getTextInputValue('name')));
  await interaction.reply({ content: 'Ticket renamed.', ephemeral: true });
  await sendTicketLog(interaction.guild, 'Ticket renamed', `${interaction.channel} renamed by ${interaction.user}\nOld: ${oldName}\nNew: ${interaction.channel.name}`);
  await submitTicketGoogleEvent({ interaction, actionType: 'TICKET_RENAMED', metadata: readTicketMetadata(interaction.channel), extra: { oldName, newName: interaction.channel.name } });
}

async function transferTicket(interaction) {
  if (!(await assertTicketControl(interaction))) return;

  const options = (getTicketConfig().types || [])
    .filter((type) => type.enabled && !type.systemOnly)
    .slice(0, 25)
    .map((type) => new StringSelectMenuOptionBuilder()
      .setLabel(type.label)
      .setValue(type.id)
      .setDescription(type.description?.slice(0, 100) || type.id));

  await interaction.reply({
    content: 'Select the new ticket type.',
    ephemeral: true,
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket:transfer_select')
        .setPlaceholder('Ticket type')
        .addOptions(options)
    )]
  });
}

async function handleTransferSelect(interaction) {
  const metadata = await assertTicketControl(interaction);
  if (!metadata) return;

  const type = getTicketType(interaction.guildId, interaction.values[0]);
  if (!type) {
    await interaction.update({ content: 'That ticket type is no longer configured.', components: [] });
    return;
  }

  const nextMetadata = await updateTicketMetadata(interaction.channel, {
    ...metadata,
    typeId: type.id,
    locked: false,
    lockdownPresetId: null
  });

  await interaction.channel.permissionOverwrites.set(baseOverwrites({
    guild: interaction.guild,
    userId: nextMetadata.openerId,
    type,
    cfg: getTicketConfig(),
    clientId: interaction.client.user.id
  }));

  await interaction.channel.setName(`ticket-${shortType(type)}-${safeName(interaction.channel.name.replace(/^closed-/, '').replace(/^ticket-[^-]+-/, ''))}`.slice(0, 95));
  await interaction.update({ content: `Ticket transferred to ${type.label}.`, components: [] });
  await sendTicketLog(interaction.guild, 'Ticket transferred', `${interaction.channel} transferred to ${type.label} by ${interaction.user}`);
  await submitTicketGoogleEvent({ interaction, actionType: 'TICKET_TRANSFERRED', metadata: nextMetadata, extra: { typeId: type.id, typeLabel: type.label } });
}

async function lockTicket(interaction) {
  if (!(await assertTicketControl(interaction))) return;

  const options = (getTicketConfig().lockdownPresets || [])
    .slice(0, 25)
    .map((preset) => new StringSelectMenuOptionBuilder()
      .setLabel(preset.label)
      .setValue(preset.id)
      .setDescription(preset.description?.slice(0, 100) || preset.id));

  if (options.length === 0) {
    await interaction.reply({ content: 'No lockdown presets are configured.', ephemeral: true });
    return;
  }

  await interaction.reply({
    content: 'Choose who should retain access during lockdown.',
    ephemeral: true,
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket:lockdown_select')
        .setPlaceholder('Lockdown preset')
        .addOptions(options)
    )]
  });
}

async function handleLockdownSelect(interaction) {
  const metadata = await assertTicketControl(interaction);
  if (!metadata) return;

  const cfg = getTicketConfig();
  const preset = (cfg.lockdownPresets || []).find((item) => item.id === interaction.values[0]);
  if (!preset) {
    await interaction.update({ content: 'That lockdown preset is no longer configured.', components: [] });
    return;
  }

  const nextMetadata = await updateTicketMetadata(interaction.channel, {
    ...metadata,
    locked: true,
    lockdownPresetId: preset.id
  });

  await interaction.channel.permissionOverwrites.set(lockdownOverwrites({
    guild: interaction.guild,
    preset,
    metadata: nextMetadata,
    cfg,
    clientId: interaction.client.user.id
  }));

  const type = getTicketType(interaction.guildId, nextMetadata.typeId);
  await interaction.update({ content: `Ticket locked down with preset: ${preset.label}.`, components: [] });
  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('Ticket Locked Down')
        .setColor(0xe74c3c)
        .addFields(
          { name: 'Status', value: 'Locked Down', inline: true },
          { name: 'Lockdown Preset', value: preset.label, inline: true },
          { name: 'Locked By', value: `${interaction.user}`, inline: true }
        )
        .setTimestamp()
    ],
    components: type ? controls(type, true) : []
  });
  await sendTicketLog(interaction.guild, 'Ticket locked down', `${interaction.channel} locked by ${interaction.user}\nPreset: ${preset.label}`);
  await submitTicketGoogleEvent({ interaction, actionType: 'TICKET_LOCKED_DOWN', metadata: nextMetadata, extra: { lockdownPresetId: preset.id, lockdownPresetLabel: preset.label } });
}

async function unlockTicket(interaction) {
  const metadata = await assertTicketControl(interaction);
  if (!metadata) return;

  const type = getTicketType(interaction.guildId, metadata.typeId);
  if (!type) {
    await interaction.reply({ content: 'This ticket type is no longer configured.', ephemeral: true });
    return;
  }

  const nextMetadata = await updateTicketMetadata(interaction.channel, {
    ...metadata,
    locked: false,
    lockdownPresetId: null
  });

  await interaction.channel.permissionOverwrites.set(baseOverwrites({
    guild: interaction.guild,
    userId: nextMetadata.openerId,
    type,
    cfg: getTicketConfig(),
    clientId: interaction.client.user.id
  }));

  await interaction.reply({ content: 'Ticket unlocked and normal permissions restored.', ephemeral: true });
  await interaction.channel.send({ content: 'Ticket unlocked and normal permissions restored.', components: controls(type, false) });
  await sendTicketLog(interaction.guild, 'Ticket unlocked', `${interaction.channel} unlocked by ${interaction.user}`);
  await submitTicketGoogleEvent({ interaction, actionType: 'TICKET_UNLOCKED', metadata: nextMetadata });
}

async function closeTicket(interaction) {
  if (!(await assertTicketControl(interaction))) return;

  await interaction.showModal(
    new ModalBuilder()
      .setCustomId('ticket:close_modal')
      .setTitle('Close Ticket')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Close reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ))
  );
}

async function handleCloseModal(interaction) {
  const metadata = await assertTicketControl(interaction);
  if (!metadata) return;

  await interaction.deferReply({ ephemeral: true });

  const cfg = getTicketConfig();
  const reason = interaction.fields.getTextInputValue('reason');
  const closedAt = new Date().toISOString();
  const closedMetadata = await updateTicketMetadata(interaction.channel, {
    ...metadata,
    closed: true,
    closedById: interaction.user.id,
    closedAt
  });

  if (cfg.transcriptOnClose) {
    const file = await generateTextTranscript(interaction.channel, {
      metadata: closedMetadata,
      closeReason: reason
    });

    if (cfg.transcriptChannelId) {
      const transcriptChannel = interaction.guild.channels.cache.get(cfg.transcriptChannelId)
        || await interaction.guild.channels.fetch(cfg.transcriptChannelId).catch(() => null);
      if (transcriptChannel?.send) {
        await transcriptChannel.send({
          content: `Transcript for ${interaction.channel.name}. Closed by ${interaction.user}. Reason: ${reason}`,
          files: [file]
        });
        await sendTicketLog(interaction.guild, 'Ticket transcript sent', `Transcript sent for ${interaction.channel} to ${transcriptChannel}.`);
        await submitTicketGoogleEvent({ interaction, actionType: 'TICKET_TRANSCRIPT_SENT', metadata: closedMetadata, extra: { transcriptChannelId: transcriptChannel.id } });
      }
    }
  }

  await sendTicketLog(interaction.guild, 'Ticket closed', `${interaction.channel} closed by ${interaction.user}\nReason: ${reason}`);
  await submitTicketGoogleEvent({ interaction, actionType: 'TICKET_CLOSED', metadata: closedMetadata, extra: { reason } });

  if (cfg.closeBehavior === 'delete') {
    await interaction.editReply('Ticket closed. Deleting channel shortly.');
    setTimeout(() => interaction.channel.delete(`Ticket closed: ${reason}`).catch(() => null), 5000);
    return;
  }

  const type = getTicketType(interaction.guildId, closedMetadata.typeId) || { routedRoleIds: [] };
  await interaction.channel.setName(`closed-${safeName(interaction.channel.name)}`.slice(0, 95)).catch(() => null);
  if (cfg.archiveCategoryId) await interaction.channel.setParent(cfg.archiveCategoryId).catch(() => null);
  await interaction.channel.permissionOverwrites.set(baseOverwrites({
    guild: interaction.guild,
    userId: closedMetadata.openerId,
    type,
    cfg,
    clientId: interaction.client.user.id,
    openerCanSend: false
  }));
  await interaction.editReply('Ticket closed and archived.');
}

async function submitTicketGoogleEvent({ interaction, guild, actionType, actor, targetUser, channel, metadata = {}, extra = {} }) {
  return safeSubmitDepartmentEvent({
    actionType,
    interaction,
    guildId: guild?.id || interaction?.guildId,
    channelId: channel?.id || interaction?.channelId,
    actor: actor || interaction?.user,
    targetDiscordId: targetUser?.id || metadata.openerId,
    targetName: targetUser?.username || null,
    payload: { ticketChannelId: channel?.id || interaction?.channelId, ticketChannelName: channel?.name || interaction?.channel?.name, metadata, ...extra }
  });
}

module.exports = {
  getTicketConfig,
  getTicketType,
  getListedTicketTypes,
  createTicketFromPanel,
  createSystemTicket,
  claimTicket,
  lockTicket,
  renameTicket,
  transferTicket,
  closeTicket,
  canManageTickets,
  isTicketChannel,
  readTicketMetadata,
  handleRenameModal,
  handleTransferSelect,
  handleLockdownSelect,
  unlockTicket,
  handleCloseModal
};
