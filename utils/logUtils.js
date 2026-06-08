const { EmbedBuilder } = require('discord.js');

async function sendOfficerRankChangeLog({
  guild,
  serverConfig,
  actionType,
  officerUser,
  staffUser,
  oldRank,
  newRank,
  changedAt = new Date()
}) {
  const staffLogChannelId = serverConfig?.logging?.staffLogChannelId;

  if (!staffLogChannelId || staffLogChannelId === 'PUT_STAFF_LOG_CHANNEL_ID_HERE') {
    console.warn('Staff log channel is not configured. Skipping officer rank change log.');
    return;
  }

  if (!guild || !guild.channels) {
    console.warn('Could not send officer rank change log because no guild was available.');
    return;
  }

  try {
    const channel = guild.channels.cache.get(staffLogChannelId)
      || await guild.channels.fetch(staffLogChannelId);

    if (!channel || typeof channel.send !== 'function') {
      console.warn(`Configured staff log channel is missing or cannot receive messages: ${staffLogChannelId}`);
      return;
    }

    const isPromotion = actionType === 'promote';
    const actionLabel = isPromotion ? 'Promotion' : 'Demotion';
    const unixTimestamp = Math.floor(changedAt.getTime() / 1000);
    const fields = [
      {
        name: 'Officer',
        value: formatUserForLog(officerUser),
        inline: true
      },
      {
        name: 'Staff member',
        value: formatUserForLog(staffUser),
        inline: true
      },
      {
        name: 'Old rank',
        value: oldRank?.name || 'Unknown',
        inline: true
      },
      {
        name: 'New rank',
        value: newRank?.name || 'Unknown',
        inline: true
      },
      {
        name: 'Date/time',
        value: `<t:${unixTimestamp}:F>`,
        inline: true
      }
    ];

    if (serverConfig?.departmentName) {
      fields.push({
        name: 'Department',
        value: serverConfig.departmentName,
        inline: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Officer ${actionLabel}`)
      .setColor(isPromotion ? 0x2ecc71 : 0xe67e22)
      .addFields(fields)
      .setTimestamp(changedAt);

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.warn('Could not send officer rank change staff log:', error);
  }
}

function formatUserForLog(user) {
  if (!user) {
    return 'Unknown';
  }

  const userTag = user.tag || user.username || user.id;

  return `${user} (${userTag})`;
}

module.exports = {
  sendOfficerRankChangeLog
};
