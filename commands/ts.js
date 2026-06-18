// commands/ts.js
// Slash command: /ts status

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');

const { getTeamSpeakStatus } = require('../utils/teamspeakClient');

async function deferPrivateReply(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (error) {
    // Older discord.js versions used ephemeral instead of flags.
    await interaction.deferReply({ ephemeral: true });
  }
}

function chunkUserList(users) {
  if (!users.length) return 'No regular TeamSpeak users are online.';

  const visibleUsers = users.slice(0, 20).map((user) => {
    const idText = user.clientId ? ` \`clid:${user.clientId}\`` : '';
    return `• ${user.nickname}${idText}`;
  });

  const remaining = users.length - visibleUsers.length;
  if (remaining > 0) visibleUsers.push(`…and ${remaining} more.`);

  return visibleUsers.join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ts')
    .setDescription('TeamSpeak tools.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Check the TeamSpeak ServerQuery connection and online users.')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand !== 'status') {
      await interaction.reply({
        content: 'Unknown TeamSpeak subcommand.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await deferPrivateReply(interaction);

    try {
      const status = await getTeamSpeakStatus();

      const embed = new EmbedBuilder()
        .setTitle('TeamSpeak Status')
        .setDescription('The Discord bot successfully connected to TeamSpeak ServerQuery.')
        .setColor(0x2b8cff)
        .addFields(
          {
            name: 'Connection',
            value: status.connected ? 'Connected' : 'Not connected',
            inline: true
          },
          {
            name: 'Host',
            value: String(status.host || 'Not configured'),
            inline: true
          },
          {
            name: 'Server Port',
            value: String(status.serverPort || 'Unknown'),
            inline: true
          },
          {
            name: 'Online Users',
            value: String(status.onlineUserCount),
            inline: true
          },
          {
            name: 'Bot Nickname',
            value: String(status.botNickname || 'Unknown'),
            inline: true
          },
          {
            name: 'Users',
            value: chunkUserList(status.onlineUsers)
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[TS Status] Failed:', error);

      await interaction.editReply({
        content:
          'TeamSpeak status check failed.\n\n' +
          `Reason: \`${error.message || 'Unknown error'}\`\n\n` +
          'Check your TeamSpeak environment variables, query login, query port, and server port.'
      });
    }
  }
};
