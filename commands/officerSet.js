const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getServerConfig } = require('../utils/configUtils');
const { requirePermission } = require('../utils/permissionUtils');
const { manualOfficerUpdate } = require('../utils/googleWebhook');
const { compareOfficerState, applyOfficerSync, formatSyncPlanEmbed } = require('../utils/syncUtils');

const pending = new Map();
function key() { return `os${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`; }
function getField(interaction) { return interaction.options.getSubcommand(); }
function requestedValue(interaction) { const f=getField(interaction); return interaction.options.getString(f === 'teamspeak' ? 'teamspeak_id' : f); }
function buildRow(id) { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`officerSet:confirm:${id}`).setLabel('Confirm Officer Update').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`officerSet:cancel:${id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)); }

module.exports = {
  data: new SlashCommandBuilder().setName('officer-set').setDescription('Manually update officer data in Google, then Discord when applicable.').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s)=>s.setName('rank').setDescription('Set rank by configured rank key/name.').addUserOption(o=>o.setName('officer').setDescription('Officer').setRequired(true)).addStringOption(o=>o.setName('rank').setDescription('Configured rank key/name').setRequired(true).setAutocomplete(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand((s)=>s.setName('status').setDescription('Set status.').addUserOption(o=>o.setName('officer').setDescription('Officer').setRequired(true)).addStringOption(o=>o.setName('status').setDescription('Status').setRequired(true).addChoices(...['ACTIVE','INACTIVE','TERMINATED','RESIGNED','CADET','PROBATIONARY','PREVIOUS_OFFICER'].map(v=>({name:v,value:v})))).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand((s)=>s.setName('callsign').setDescription('Set callsign.').addUserOption(o=>o.setName('officer').setDescription('Officer').setRequired(true)).addStringOption(o=>o.setName('callsign').setDescription('Callsign').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand((s)=>s.setName('steam64').setDescription('Set Steam64.').addUserOption(o=>o.setName('officer').setDescription('Officer').setRequired(true)).addStringOption(o=>o.setName('steam64').setDescription('Steam64').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand((s)=>s.setName('teamspeak').setDescription('Set TeamSpeak ID.').addUserOption(o=>o.setName('officer').setDescription('Officer').setRequired(true)).addStringOption(o=>o.setName('teamspeak_id').setDescription('TeamSpeak ID').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand((s)=>s.setName('note').setDescription('Set a public/internal note.').addUserOption(o=>o.setName('officer').setDescription('Officer').setRequired(true)).addStringOption(o=>o.setName('visibility').setDescription('Visibility').setRequired(true).addChoices({name:'Public',value:'publicNotes'},{name:'Internal',value:'internalNotes'})).addStringOption(o=>o.setName('note').setDescription('Note').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true))),
  async autocomplete(interaction) { const config=getServerConfig(interaction.guildId); const focused=interaction.options.getFocused().toLowerCase(); await interaction.respond((config.ranks||[]).filter(r=>(r.key||r.rankKey||r.name||'').toLowerCase().includes(focused)).slice(0,25).map(r=>({name:r.name,value:r.key||r.rankKey||r.name}))); },
  async execute(interaction) {
    const config=getServerConfig(interaction.guildId); if (config.manualOfficerUpdate?.enabled === false) return interaction.reply({content:'Manual officer updates are disabled.',ephemeral:true});
    if (!await requirePermission(interaction,'manualOfficerUpdate',{config})) return;
    const officer=interaction.options.getUser('officer'); const field=getField(interaction); const value=field==='note'?interaction.options.getString('note'):requestedValue(interaction); const reason=interaction.options.getString('reason');
    const state={staffUserId:interaction.user.id, officerId:officer.id, field: field==='teamspeak'?'teamspeakId':field, value, reason, visibility: interaction.options.getString('visibility')}; const id=key(); pending.set(id,state);
    const embed=new EmbedBuilder().setTitle('Officer Update Preview').setColor(0xffaa00).addFields({name:'Officer',value:`${officer} (${officer.id})`},{name:'Field',value:state.visibility||state.field,inline:true},{name:'New value',value:String(value).slice(0,1024),inline:true},{name:'Reason',value:reason.slice(0,1024)});
    return interaction.reply({embeds:[embed],components:[buildRow(id)],ephemeral:true});
  },
  async handleButton(interaction) {
    if (!interaction.customId.startsWith('officerSet:')) return false;
    const [,action,id]=interaction.customId.split(':'); const state=pending.get(id); const config=getServerConfig(interaction.guildId);
    if (!state) { await interaction.reply({content:'This officer update expired.',ephemeral:true}); return true; }
    if (!await requirePermission(interaction,'manualOfficerUpdate',{config})) return true;
    if (state.staffUserId !== interaction.user.id) { await interaction.reply({content:'Only the staff member who started this update can confirm it.',ephemeral:true}); return true; }
    if (action==='cancel') { pending.delete(id); await interaction.update({content:'Officer update cancelled.',embeds:[],components:[]}); return true; }
    await interaction.deferUpdate(); const member=await interaction.guild.members.fetch(state.officerId).catch(()=>null);
    let res; try { res=await manualOfficerUpdate({guildId:interaction.guildId,discordId:state.officerId,field:state.visibility||state.field,value:state.value,reason:state.reason,requestedByDiscordId:interaction.user.id,requestedByUsername:interaction.user.tag}); } catch(e) { pending.delete(id); return interaction.editReply({content:`Google update failed. No Discord changes were made: ${e.message}`,embeds:[],components:[]}); }
    const officer=res.officer||res.record||res.data?.officer||res.data?.record; let embeds=[]; let content='Google officer update completed.';
    if (member && (state.field==='rank' || state.field==='status' || state.field==='callsign') && officer) { const plan=compareOfficerState(member,officer,config); if (plan.canApply) await applyOfficerSync(member,plan,config,`Manual officer update by ${interaction.user.tag}`); embeds=[formatSyncPlanEmbed(plan,config,'Manual Officer Discord Update')]; }
    pending.delete(id); return interaction.editReply({content,embeds,components:[]});
  }
};
