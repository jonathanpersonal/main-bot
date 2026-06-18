const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { canManageTickets, getListedTicketTypes, getTicketConfig } = require('../utils/ticketUtils');
const { safeSubmitDepartmentEvent } = require('../utils/googleDepartmentEvents');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Manage the public ticket panel.')
    .addSubcommand((subcommand) => subcommand
      .setName('post')
      .setDescription('Post the public ticket panel in this channel.')),

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'post') return;
    const cfg = getTicketConfig(interaction.guildId);
    if (!canManageTickets(interaction.member, cfg)) {
      await interaction.reply({ content: 'Only ticket staff/admins can post the ticket panel.', ephemeral: true });
      return;
    }

    const types = getListedTicketTypes(interaction.guildId);
    if (!cfg.enabled || types.length === 0) {
      await interaction.reply({ content: 'Tickets are disabled or no listed ticket types are enabled.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Department Support Tickets')
      .setDescription('Need help? Select the ticket type below.')
      .setColor(0x5865f2)
      .addFields(types.map((type) => ({ name: `${type.emoji || '🎫'} ${type.label}`, value: type.description, inline: false })));

    const rows = [];
    for (let index = 0; index < types.length; index += 5) {
      rows.push(new ActionRowBuilder().addComponents(types.slice(index, index + 5).map((type) => new ButtonBuilder()
        .setCustomId(`ticket:create:${type.id}`)
        .setLabel(type.label)
        .setEmoji(type.emoji || '🎫')
        .setStyle(ButtonStyle.Primary))));
    }

    const panelMessage = await interaction.channel.send({ embeds: [embed], components: rows });
    await safeSubmitDepartmentEvent({ actionType: 'TICKET_PANEL_POSTED', interaction, actor: interaction.user, payload: { channelId: interaction.channelId, messageId: panelMessage.id, ticketTypes: types.map((type) => type.id) } });
    await interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
  }
};
