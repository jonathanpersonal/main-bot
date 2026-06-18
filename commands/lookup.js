const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getServerConfig } = require('../utils/configUtils');
const { requirePermission, isHighCommand, isBotAdmin } = require('../utils/permissionUtils');
const { lookupOfficer } = require('../utils/googleWebhook');

function val(v) { return v === undefined || v === null || v === '' ? 'Not set' : String(v); }
function officerFromResponse(res) { return res.officer || res.record || res.data?.officer || res.data?.record || null; }

module.exports = {
  data: new SlashCommandBuilder().setName('lookup').setDescription('Look up an officer from Google Sheets.').addSubcommand((s) => s.setName('officer').setDescription('Look up by Discord user.').addUserOption((o) => o.setName('officer').setDescription('Officer to look up.').setRequired(true))),
  async execute(interaction) {
    const config = getServerConfig(interaction.guildId);
    if (config.lookup?.enabled === false) return interaction.reply({ content: 'Lookup is disabled for this server.', ephemeral: true });
    if (!await requirePermission(interaction, 'lookup', { config })) return;
    await interaction.deferReply({ ephemeral: true });
    const user = interaction.options.getUser('officer');
    let res;
    try { res = await lookupOfficer({ guildId: interaction.guildId, discordId: user.id, requestedByDiscordId: interaction.user.id }); }
    catch (e) { return interaction.editReply(`Google lookup failed safely: ${e.message}`); }
    if (res.found === false) return interaction.editReply(`No Google officer record was found for ${user}.`);
    const officer = officerFromResponse(res);
    if (!officer) return interaction.editReply(`No Google officer record was found for ${user}.`);
    const canSeeInternal = isHighCommand(interaction.member, config) || isBotAdmin(interaction.member, config);
    const embed = new EmbedBuilder().setTitle('Officer Lookup').setColor(0x2f80ed).addFields(
      { name: 'Department', value: val(officer.departmentName || officer.department), inline: true },
      { name: 'Name', value: val(officer.dbName || officer.name || officer['Name']), inline: true },
      { name: 'Discord', value: `${user} (${val(officer.discordId || user.id)})`, inline: false },
      { name: 'Callsign', value: val(officer.callsign || officer.currentCallsign), inline: true },
      { name: 'Rank', value: val(officer.rank || officer.rankKey), inline: true },
      { name: 'Status', value: val(officer.status || officer.departmentStatus || officer.activeStatus), inline: true },
      { name: 'Steam64', value: val(officer.steam64), inline: true },
      { name: 'TeamSpeak ID', value: val(officer.teamspeakId), inline: true },
      { name: 'Join Date', value: val(officer.joinDate), inline: true },
      { name: 'Probation', value: val(officer.probationStatus || `${officer.probationStart || ''} ${officer.probationEnd || ''}`.trim()), inline: true },
      { name: 'Training', value: val(officer.trainingStatus), inline: true },
      { name: 'Training Officer', value: val(officer.trainingOfficer), inline: true },
      { name: 'Activity', value: `Current: ${val(officer.currentCycleHours)}\nPrevious: ${val(officer.previousCycleHours)}`, inline: true },
      { name: 'Public Notes', value: val(officer.publicNotes).slice(0, 1024), inline: false },
      { name: 'Record ID', value: val(officer.recordId || officer.rowNumber), inline: true }
    );
    if (canSeeInternal) embed.addFields({ name: 'Internal Notes', value: val(officer.internalNotes).slice(0, 1024), inline: false });
    return interaction.editReply({ embeds: [embed] });
  }
};
