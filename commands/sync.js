const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getServerConfig } = require('../utils/configUtils');
const { requirePermission } = require('../utils/permissionUtils');
const { syncOfficerFromGoogle, notifyOfficerSyncCompleted, notifyOfficerSyncFailed } = require('../utils/googleWebhook');
const { compareOfficerState, applyOfficerSync, formatSyncPlanEmbed } = require('../utils/syncUtils');

module.exports = {
  data: new SlashCommandBuilder().setName('sync').setDescription('Sync an officer from Google Sheets to Discord.').addSubcommand((s) => s.setName('officer').setDescription('Sync a selected officer.').addUserOption((o) => o.setName('officer').setDescription('Officer to sync.').setRequired(true)).addBooleanOption((o) => o.setName('dry-run').setDescription('Preview only; defaults to true.'))),
  async execute(interaction) {
    const config = getServerConfig(interaction.guildId);
    if (config.sync?.enabled === false) return interaction.reply({ content: 'Sync is disabled for this server.', flags: MessageFlags.Ephemeral });
    if (!await requirePermission(interaction, 'sync', { config })) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser('officer');
    const dryRun = interaction.options.getBoolean('dry-run') ?? config.sync?.dryRunDefault !== false;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.editReply('That user is not in this server.');
    let res;
    try { res = await syncOfficerFromGoogle({ guildId: interaction.guildId, discordId: user.id, requestedByDiscordId: interaction.user.id }); }
    catch (e) { return interaction.editReply(`Google sync lookup failed safely: ${e.message}`); }
    if (res.found === false) return interaction.editReply(`No Google officer record was found for ${user}.`);
    const officer = res.officer || res.record || res.data?.officer || res.data?.record;
    if (!officer) return interaction.editReply('Google did not return officer state. No Discord changes were made.');
    const plan = compareOfficerState(member, officer, config); plan.dryRun = dryRun;
    if (dryRun || !plan.canApply) return interaction.editReply({ embeds: [formatSyncPlanEmbed(plan, config, 'Officer Sync Preview')] });
    const result = await applyOfficerSync(member, plan, config, `Officer sync requested by ${interaction.user.tag}`);
    if (result.errors.length) await notifyOfficerSyncFailed({ guildId: interaction.guildId, discordId: user.id, errors: result.errors, requestedByDiscordId: interaction.user.id }).catch(() => {});
    else await notifyOfficerSyncCompleted({ guildId: interaction.guildId, discordId: user.id, requestedByDiscordId: interaction.user.id, result }).catch(() => {});
    const embed = formatSyncPlanEmbed(plan, config, result.errors.length ? 'Officer Sync Completed With Warnings' : 'Officer Sync Completed');
    embed.addFields({ name: 'Apply result', value: [`Added: ${result.roleResult?.added?.join(', ') || 'None'}`, `Removed: ${result.roleResult?.removed?.join(', ') || 'None'}`, `Nickname changed: ${result.nicknameChanged ? 'Yes' : 'No'}`, `Errors: ${result.errors.join('; ') || 'None'}`].join('\n'), inline: false });
    return interaction.editReply({ embeds: [embed] });
  }
};
