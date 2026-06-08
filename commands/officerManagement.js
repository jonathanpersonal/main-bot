const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const { getServerConfig } = require('../utils/configUtils');
const { getMemberRank } = require('../utils/rankUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('officer-management')
    .setDescription('Manage department officer actions.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('The officer management action to perform.')
        .setRequired(true)
        .addChoices(
          {
            name: 'Check Rank',
            value: 'check_rank'
          }
        )
    )
    .addUserOption((option) =>
      option
        .setName('officer')
        .setDescription('The officer to manage.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const serverConfig = getServerConfig();

    const action = interaction.options.getString('action');
    const officerUser = interaction.options.getUser('officer');

    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command can only be used inside a Discord server.',
        ephemeral: true
      });
    }

    const officerMember = await interaction.guild.members.fetch(officerUser.id);

    const currentRank = getMemberRank(officerMember, serverConfig);

    if (action === 'check_rank') {
      if (!currentRank) {
        return interaction.reply({
          content: [
            `No configured rank was found for ${officerUser}.`,
            '',
            'This usually means one of these is true:',
            '- The officer does not have a configured rank role.',
            '- The role ID in `config/serverConfig.js` is wrong.',
            '- The rank exists in Discord but has not been added to the config yet.'
          ].join('\n'),
          ephemeral: true
        });
      }

      return interaction.reply({
        content: [
          `Officer: ${officerUser}`,
          `Current Rank: **${currentRank.name}**`,
          `Rank Level: **${currentRank.level}**`,
          `Rank Role ID: \`${currentRank.rankRoleId}\``,
          `Permission Role ID: \`${currentRank.permissionRoleId}\``
        ].join('\n'),
        ephemeral: true
      });
    }

    return interaction.reply({
      content: 'That officer management action is not available yet.',
      ephemeral: true
    });
  }
};