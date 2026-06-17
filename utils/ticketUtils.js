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

function getTicketConfig() { return getServerConfig()?.tickets || {}; }
function getTicketType(guildId, typeId) { return getTicketConfig(guildId).types?.find((t) => t.id === typeId) || null; }
function getListedTicketTypes(guildId) { return (getTicketConfig(guildId).types || []).filter((t) => t.enabled && t.listed && !t.systemOnly); }
function canManageTickets(member, cfg = getTicketConfig()) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const ids = [...(cfg.staffRoleIds || []), ...(cfg.adminRoleIds || [])].filter(Boolean);
  return ids.some((id) => member.roles?.cache?.has(id));
}

function safeName(value) { return String(value || 'ticket').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'ticket'; }
function shortType(type) { return safeName(type.id.replace('general_support', 'general').replace('training_recruitment', 'training').replace('contact_command_staff', 'command')); }
function topicFor(meta) { return `ticket:${JSON.stringify(meta)}`.slice(0, 1024); }
function readMeta(channel) { try { return channel.topic?.startsWith('ticket:') ? JSON.parse(channel.topic.slice(7)) : {}; } catch { return {}; } }
function roleIdsFor(type, cfg) { return [...new Set([...(type.routedRoleIds || []), ...(cfg.staffRoleIds || []), ...(cfg.adminRoleIds || [])].filter(Boolean))]; }
function baseOverwrites({ guild, userId, type, cfg, clientId }) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: clientId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
  ];
  for (const id of roleIdsFor(type, cfg)) overwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  return overwrites;
}
function lockdownOverwrites({ guild, preset, cfg, clientId }) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: clientId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
  ];
  for (const id of [...new Set([...(preset.allowedRoleIds || []), ...(cfg.adminRoleIds || [])].filter(Boolean))]) overwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  for (const id of [...new Set([...(preset.allowedUserIds || [])].filter(Boolean))]) overwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  return overwrites;
}

function controls(type, locked = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setStyle(ButtonStyle.Primary).setDisabled(!type.allowClaim),
    new ButtonBuilder().setCustomId('ticket:rename').setLabel('Rename').setStyle(ButtonStyle.Secondary).setDisabled(!type.allowRename),
    new ButtonBuilder().setCustomId('ticket:transfer').setLabel('Transfer').setStyle(ButtonStyle.Secondary).setDisabled(!type.allowTransfer),
    new ButtonBuilder().setCustomId(locked ? 'ticket:unlock' : 'ticket:lockdown').setLabel(locked ? 'Unlock' : 'Lockdown').setStyle(locked ? ButtonStyle.Success : ButtonStyle.Danger).setDisabled(!type.allowLockdown),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setStyle(ButtonStyle.Danger).setDisabled(!type.allowClose)
  )];
}
function ticketEmbed({ type, opener, createdBy, system, reason, metadata, status = 'Open' }) {
  const fields = [
    { name: 'Type', value: type.label, inline: true },
    { name: 'Status', value: status, inline: true },
    { name: system ? 'Target user' : 'Opened by', value: `${opener}`, inline: true }
  ];
  if (createdBy) fields.push({ name: 'Created by', value: `${createdBy}`, inline: true });
  if (reason) fields.push({ name: 'Reason', value: String(reason).slice(0, 1024), inline: false });
  for (const key of ['terminationCaseId','appealCaseId','approvedBy','approvalReason','originalRank','previousCallsign']) if (metadata?.[key]) fields.push({ name: key, value: String(metadata[key]).slice(0, 1024), inline: true });
  return new EmbedBuilder().setTitle(system ? 'System-Created Ticket' : `${type.emoji || '🎫'} ${type.label}`).setDescription(system ? 'This ticket was created by an internal workflow.' : type.description).setColor(0x5865f2).addFields(fields).setTimestamp();
}
async function sendTicketLog(guild, title, details) {
  return sendTicketLogEmbed({ guild, serverConfig: getServerConfig(), title, details });
}
async function createTicket({ guild, typeId, targetUser, createdBy, reason, metadata, system = false, interaction }) {
  const cfg = getTicketConfig(guild.id); if (!cfg.enabled) throw new Error('Tickets are not enabled.');
  const type = getTicketType(guild.id, typeId); if (!type) throw new Error('Unknown ticket type.');
  if (!type.enabled) throw new Error('This ticket type is disabled.');
  if (!system && (!type.listed || type.systemOnly)) throw new Error('This ticket type is not publicly available.');
  const parent = type.categoryId || cfg.categoryId || null;
  const channel = await guild.channels.create({
    name: `ticket-${shortType(type)}-${safeName(targetUser.username || targetUser.tag || targetUser.id)}`.slice(0, 95),
    type: ChannelType.GuildText,
    parent: parent || undefined,
    topic: topicFor({ openerId: targetUser.id, typeId: type.id, locked: false }),
    permissionOverwrites: baseOverwrites({ guild, userId: targetUser.id, type, cfg, clientId: guild.client.user.id })
  });
  await channel.send({ content: `${targetUser}`, embeds: [ticketEmbed({ type, opener: targetUser, createdBy, system, reason, metadata })], components: controls(type) });
  await sendTicketLog(guild, system ? 'System reinstatement ticket created' : 'Ticket created', `${type.label} ticket: ${channel}\nUser: ${targetUser}\nCreated by: ${createdBy || targetUser}`);
  if (interaction) await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
  return channel;
}
async function createTicketFromPanel(interaction, typeId) { return createTicket({ guild: interaction.guild, typeId, targetUser: interaction.user, createdBy: interaction.user, interaction }); }
async function createSystemTicket(options) { return createTicket({ ...options, system: true }); }
async function assertStaff(interaction) { if (!canManageTickets(interaction.member)) { await interaction.reply({ content: 'Only ticket staff/admins can use ticket controls.', ephemeral: true }); return false; } return true; }
async function claimTicket(interaction) { if (!(await assertStaff(interaction))) return; await interaction.reply({ content: `Ticket claimed by ${interaction.user}.`, ephemeral: false }); await sendTicketLog(interaction.guild, 'Ticket claimed', `${interaction.channel} claimed by ${interaction.user}`); }
async function renameTicket(interaction) { if (!(await assertStaff(interaction))) return; await interaction.showModal(new ModalBuilder().setCustomId('ticket:rename_modal').setTitle('Rename Ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('New ticket name').setStyle(TextInputStyle.Short).setRequired(true)))); }
async function handleRenameModal(interaction) { if (!(await assertStaff(interaction))) return; const old = interaction.channel.name; await interaction.channel.setName(safeName(interaction.fields.getTextInputValue('name'))); await interaction.reply({ content: 'Ticket renamed.', ephemeral: true }); await sendTicketLog(interaction.guild, 'Ticket renamed', `${interaction.channel} renamed by ${interaction.user}\nOld: ${old}\nNew: ${interaction.channel.name}`); }
async function transferTicket(interaction) { if (!(await assertStaff(interaction))) return; const opts = (getTicketConfig().types || []).filter(t => t.enabled && !t.systemOnly).slice(0, 25).map(t => new StringSelectMenuOptionBuilder().setLabel(t.label).setValue(t.id).setDescription(t.description?.slice(0,100) || t.id)); await interaction.reply({ content: 'Select the new ticket type.', ephemeral: true, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket:transfer_select').setPlaceholder('Ticket type').addOptions(opts))] }); }
async function handleTransferSelect(interaction) { if (!(await assertStaff(interaction))) return; const type = getTicketType(interaction.guildId, interaction.values[0]); const meta = { ...readMeta(interaction.channel), typeId: type.id, locked: false }; await interaction.channel.permissionOverwrites.set(baseOverwrites({ guild: interaction.guild, userId: meta.openerId || interaction.user.id, type, cfg: getTicketConfig(), clientId: interaction.client.user.id })); await interaction.channel.setTopic(topicFor(meta)); await interaction.channel.setName(`ticket-${shortType(type)}-${safeName(interaction.channel.name.replace(/^ticket-[^-]+-/, ''))}`.slice(0,95)); await interaction.update({ content: `Ticket transferred to ${type.label}.`, components: [] }); await sendTicketLog(interaction.guild, 'Ticket transferred', `${interaction.channel} transferred to ${type.label} by ${interaction.user}`); }
async function lockTicket(interaction) { if (!(await assertStaff(interaction))) return; const opts = (getTicketConfig().lockdownPresets || []).slice(0, 25).map(p => new StringSelectMenuOptionBuilder().setLabel(p.label).setValue(p.id).setDescription(p.description?.slice(0,100) || p.id)); await interaction.reply({ content: 'Choose who should retain access during lockdown.', ephemeral: true, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket:lockdown_select').setPlaceholder('Lockdown preset').addOptions(opts))] }); }
async function handleLockdownSelect(interaction) { if (!(await assertStaff(interaction))) return; const cfg = getTicketConfig(); const preset = (cfg.lockdownPresets || []).find(p => p.id === interaction.values[0]); const meta = { ...readMeta(interaction.channel), locked: true, lockdownPresetId: preset.id }; await interaction.channel.permissionOverwrites.set(lockdownOverwrites({ guild: interaction.guild, preset, cfg, clientId: interaction.client.user.id })); await interaction.channel.setTopic(topicFor(meta)); await interaction.update({ content: `Ticket locked down with preset: ${preset.label}.`, components: [] }); await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle('Ticket Locked Down').addFields({ name: 'Status', value: 'Locked Down', inline: true }, { name: 'Lockdown Preset', value: preset.label, inline: true }, { name: 'Locked By', value: `${interaction.user}`, inline: true }).setColor(0xe74c3c).setTimestamp()], components: controls(getTicketType(interaction.guildId, meta.typeId), true) }); await sendTicketLog(interaction.guild, 'Ticket locked down', `${interaction.channel} locked by ${interaction.user}\nPreset: ${preset.label}`); }
async function unlockTicket(interaction) { if (!(await assertStaff(interaction))) return; const meta = { ...readMeta(interaction.channel), locked: false }; const type = getTicketType(interaction.guildId, meta.typeId); await interaction.channel.permissionOverwrites.set(baseOverwrites({ guild: interaction.guild, userId: meta.openerId || interaction.user.id, type, cfg: getTicketConfig(), clientId: interaction.client.user.id })); await interaction.channel.setTopic(topicFor(meta)); await interaction.reply({ content: 'Ticket unlocked and normal permissions restored.', ephemeral: true }); await sendTicketLog(interaction.guild, 'Ticket unlocked', `${interaction.channel} unlocked by ${interaction.user}`); }
async function closeTicket(interaction) { if (!(await assertStaff(interaction))) return; await interaction.showModal(new ModalBuilder().setCustomId('ticket:close_modal').setTitle('Close Ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Close reason').setStyle(TextInputStyle.Paragraph).setRequired(true)))); }
async function handleCloseModal(interaction) { if (!(await assertStaff(interaction))) return; await interaction.deferReply({ ephemeral: true }); const cfg = getTicketConfig(); const reason = interaction.fields.getTextInputValue('reason'); if (cfg.transcriptOnClose) { const file = await generateTextTranscript(interaction.channel); const tid = cfg.transcriptChannelId; if (tid) { const ch = interaction.guild.channels.cache.get(tid) || await interaction.guild.channels.fetch(tid).catch(() => null); if (ch?.send) await ch.send({ content: `Transcript for ${interaction.channel.name}. Closed by ${interaction.user}. Reason: ${reason}`, files: [file] }); } } await sendTicketLog(interaction.guild, 'Ticket closed', `${interaction.channel} closed by ${interaction.user}\nReason: ${reason}`); if (cfg.closeBehavior === 'delete') { await interaction.editReply('Ticket closed. Deleting channel shortly.'); setTimeout(() => interaction.channel.delete(`Ticket closed: ${reason}`).catch(() => null), 5000); } else { const meta = readMeta(interaction.channel); const type = getTicketType(interaction.guildId, meta.typeId) || { routedRoleIds: [] }; await interaction.channel.setName(`closed-${safeName(interaction.channel.name)}`.slice(0,95)).catch(() => null); if (cfg.archiveCategoryId) await interaction.channel.setParent(cfg.archiveCategoryId).catch(() => null); await interaction.channel.permissionOverwrites.set(baseOverwrites({ guild: interaction.guild, userId: meta.openerId || interaction.user.id, type, cfg, clientId: interaction.client.user.id }).map(o => o.id === (meta.openerId || interaction.user.id) ? { ...o, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] } : o)); await interaction.editReply('Ticket closed and archived.'); } }

module.exports = { getTicketConfig, getTicketType, getListedTicketTypes, createTicketFromPanel, createSystemTicket, claimTicket, lockTicket, renameTicket, transferTicket, closeTicket, canManageTickets, handleRenameModal, handleTransferSelect, handleLockdownSelect, unlockTicket, handleCloseModal };
