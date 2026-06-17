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
  const isPromotion = actionType === 'promote';
  const actionLabel = isPromotion ? 'Promotion' : 'Demotion';

  return sendStaffLogEmbed({
    guild,
    serverConfig,
    embed: new EmbedBuilder()
      .setTitle(`Officer ${actionLabel}`)
      .setColor(isPromotion ? 0x2ecc71 : 0xe67e22)
      .addFields([
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
        ...getDepartmentAndTimeFields(serverConfig, changedAt)
      ])
      .setTimestamp(changedAt),
    warningLabel: 'officer rank change staff log'
  });
}

async function sendOfficerActionLog({
  guild,
  serverConfig,
  actionType,
  officerUser,
  staffUser,
  details,
  dmSent,
  appealButtonIncluded,
  changedAt = new Date()
}) {
  const embed = new EmbedBuilder()
    .setTitle(getOfficerActionTitle(actionType))
    .setColor(getOfficerActionColor(actionType))
    .addFields(buildOfficerActionFields({
      serverConfig,
      actionType,
      officerUser,
      staffUser,
      details,
      dmSent,
      appealButtonIncluded,
      changedAt
    }))
    .setTimestamp(changedAt);

  return sendStaffLogEmbed({
    guild,
    serverConfig,
    embed,
    warningLabel: 'officer management staff log'
  });
}


async function sendAppealLog({
  guild,
  serverConfig,
  action,
  appealType,
  appealId,
  officerUser,
  staffUser,
  dmSent,
  details,
  changedAt = new Date()
}) {
  const fields = [
    {
      name: 'Appeal ID',
      value: safeFieldValue(appealId),
      inline: true
    },
    {
      name: 'Appeal type',
      value: safeFieldValue(appealType),
      inline: true
    },
    {
      name: 'Officer',
      value: formatUserForLog(officerUser),
      inline: true
    }
  ];

  if (staffUser) {
    fields.push({
      name: 'Staff member',
      value: formatUserForLog(staffUser),
      inline: true
    });
  }

  if (typeof dmSent === 'boolean') {
    fields.push({
      name: 'DM sent',
      value: dmSent ? 'Yes' : 'No',
      inline: true
    });
  }

  if (details) {
    fields.push({
      name: 'Details',
      value: safeFieldValue(details),
      inline: false
    });
  }

  fields.push(...getDepartmentAndTimeFields(serverConfig, changedAt));

  return sendStaffLogEmbed({
    guild,
    serverConfig,
    embed: new EmbedBuilder()
      .setTitle(action || 'Appeal Update')
      .setColor(0x5865f2)
      .addFields(fields)
      .setTimestamp(changedAt),
    warningLabel: 'appeal staff log'
  });
}

async function sendStaffLogEmbed({ guild, serverConfig, embed, warningLabel }) {
  const staffLogChannelId = serverConfig?.logging?.staffLogChannelId;

  if (!staffLogChannelId || staffLogChannelId === 'PUT_STAFF_LOG_CHANNEL_ID_HERE') {
    console.warn(`Staff log channel is not configured. Skipping ${warningLabel}.`);
    return false;
  }

  if (!guild || !guild.channels) {
    console.warn(`Could not send ${warningLabel} because no guild was available.`);
    return false;
  }

  try {
    const channel = guild.channels.cache.get(staffLogChannelId)
      || await guild.channels.fetch(staffLogChannelId);

    if (!channel || typeof channel.send !== 'function') {
      console.warn(`Configured staff log channel is missing or cannot receive messages: ${staffLogChannelId}`);
      return false;
    }

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.warn(`Could not send ${warningLabel}:`, error);
    return false;
  }
}

function buildOfficerActionFields({
  serverConfig,
  actionType,
  officerUser,
  staffUser,
  details,
  dmSent,
  appealButtonIncluded,
  changedAt
}) {
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
    }
  ];

  if (actionType === 'strike') {
    fields.push({
      name: 'Strike level',
      value: String(details.strikeLevel || 'Unknown'),
      inline: true
    });
  }

  fields.push({
    name: 'Reason',
    value: safeFieldValue(details.reason),
    inline: false
  });

  if (['termination', 'resignation', 'strike'].includes(actionType)) {
    fields.push({
      name: actionType === 'resignation' ? 'Evidence/documentation' : 'Evidence',
      value: safeFieldValue(details.evidence),
      inline: false
    });
  }

  if (actionType === 'termination' || actionType === 'resignation') {
    fields.push(
      {
        name: 'Additional comments',
        value: safeFieldValue(details.comments),
        inline: false
      },
      {
        name: 'Blacklisted',
        value: details.blacklisted ? 'Yes' : 'No',
        inline: true
      },
      {
        name: 'Can reapply',
        value: details.canReapply ? 'Yes' : 'No',
        inline: true
      }
    );
  }

  if (actionType === 'coaching') {
    fields.push(
      {
        name: 'What was discussed',
        value: safeFieldValue(details.discussion),
        inline: false
      },
      {
        name: 'Next steps/notes',
        value: safeFieldValue(details.nextSteps),
        inline: false
      }
    );
  }

  if (actionType === 'strike') {
    fields.push({
      name: 'Steps to prevent issue in the future',
      value: safeFieldValue(details.nextSteps),
      inline: false
    });
  }

  fields.push(...getDepartmentAndTimeFields(serverConfig, changedAt));

  if (typeof dmSent === 'boolean') {
    fields.push({
      name: 'DM sent',
      value: dmSent ? 'Yes' : 'No',
      inline: true
    });
  }

  if (['termination', 'strike'].includes(actionType)) {
    fields.push({
      name: 'Appeal button included',
      value: appealButtonIncluded ? 'Yes' : 'No',
      inline: true
    });
  }

  return fields;
}

function getDepartmentAndTimeFields(serverConfig, changedAt) {
  const unixTimestamp = Math.floor(changedAt.getTime() / 1000);
  const fields = [];

  const departmentName = serverConfig?.officerManagement?.departmentName
    || serverConfig?.departmentName;

  if (departmentName) {
    fields.push({
      name: 'Department',
      value: departmentName,
      inline: true
    });
  }

  fields.push({
    name: 'Date/time',
    value: `<t:${unixTimestamp}:F>`,
    inline: true
  });

  return fields;
}

function getOfficerActionTitle(actionType) {
  const titles = {
    termination: 'Officer Terminated',
    resignation: 'Officer Resigned',
    coaching: 'Officer Coaching Logged',
    strike: 'Officer Strike Issued'
  };

  return titles[actionType] || 'Officer Management Action';
}

function getOfficerActionColor(actionType) {
  const colors = {
    termination: 0xe74c3c,
    resignation: 0x95a5a6,
    coaching: 0x3498db,
    strike: 0xf1c40f
  };

  return colors[actionType] || 0x5865f2;
}

function safeFieldValue(value) {
  if (!value) return 'None provided.';

  const stringValue = String(value);
  return stringValue.length > 1024 ? `${stringValue.slice(0, 1021)}...` : stringValue;
}

function formatUserForLog(user) {
  if (!user) {
    return 'Unknown';
  }

  const userTag = user.tag || user.username || user.id;

  return `${user} (${userTag})`;
}

async function sendApplicationReviewLog({
  guild,
  serverConfig,
  officerUser,
  staffUser,
  outcomeLabel,
  details,
  roleResult,
  dmStatus,
  ftoCommandMentions,
  changedAt = new Date()
}) {
  const fields = [
    { name: 'Officer', value: formatUserForLog(officerUser), inline: true },
    { name: 'Staff member', value: formatUserForLog(staffUser), inline: true },
    { name: 'Decision', value: safeFieldValue(outcomeLabel), inline: true },
    { name: 'Reason/notes/comments', value: safeFieldValue(formatDetails(details)), inline: false },
    ...buildRoleResultFields(roleResult),
    { name: 'DM sent', value: safeFieldValue(dmStatus), inline: true },
    ...getDepartmentAndTimeFields(serverConfig, changedAt)
  ];

  const embed = new EmbedBuilder()
    .setTitle('Application Review')
    .setColor(0x3498db)
    .addFields(fields)
    .setTimestamp(changedAt);

  if (ftoCommandMentions) {
    embed.setDescription(ftoCommandMentions);
  }

  return sendStaffLogEmbed({
    guild,
    serverConfig,
    embed,
    warningLabel: 'application review staff log'
  });
}

async function sendCadetTrainingLog({
  guild,
  serverConfig,
  officerUser,
  staffUser,
  outcomeLabel,
  details,
  roleResult,
  dmStatus,
  ftoCommandMentions,
  changedAt = new Date()
}) {
  const fields = [
    { name: 'Officer', value: formatUserForLog(officerUser), inline: true },
    { name: 'Staff member', value: formatUserForLog(staffUser), inline: true },
    { name: 'Outcome', value: safeFieldValue(outcomeLabel), inline: true },
    { name: 'Rating', value: safeFieldValue(details?.rating), inline: true },
    { name: 'Performance comments', value: safeFieldValue(details?.performanceComments), inline: false },
    { name: 'What went well', value: safeFieldValue(details?.whatWentWell), inline: false },
    { name: 'What needs improvement', value: safeFieldValue(details?.improvementNotes), inline: false },
    { name: 'Additional notes', value: safeFieldValue(details?.additionalNotes || details?.comments), inline: false },
    ...buildRoleResultFields(roleResult),
    { name: 'DM sent', value: safeFieldValue(dmStatus), inline: true },
    ...getDepartmentAndTimeFields(serverConfig, changedAt)
  ];

  const embed = new EmbedBuilder()
    .setTitle('Cadet Training Review')
    .setColor(0x2ecc71)
    .addFields(fields)
    .setTimestamp(changedAt);

  if (ftoCommandMentions) {
    embed.setDescription(ftoCommandMentions);
  }

  return sendStaffLogEmbed({
    guild,
    serverConfig,
    embed,
    warningLabel: 'cadet training staff log'
  });
}

async function sendDutyLog({ guild, serverConfig, title, color = 0x5865f2, fields = [], details, changedAt = new Date() }) {
  const dutyLogChannelId = serverConfig?.duty?.logChannelId || serverConfig?.logging?.staffLogChannelId;

  if (!dutyLogChannelId || dutyLogChannelId === 'PUT_STAFF_LOG_CHANNEL_ID_HERE') {
    console.warn(`Duty log channel is not configured. Skipping ${title || 'duty log'}.`);
    return false;
  }

  if (!guild || !guild.channels) {
    console.warn(`Could not send ${title || 'duty log'} because no guild was available.`);
    return false;
  }

  try {
    const channel = guild.channels.cache.get(dutyLogChannelId) || await guild.channels.fetch(dutyLogChannelId);
    if (!channel || typeof channel.send !== 'function') return false;
    const embed = new EmbedBuilder()
      .setTitle(title || 'Duty Log')
      .setColor(color)
      .addFields(fields.length > 0 ? fields : [{ name: 'Details', value: safeFieldValue(details || 'No details provided.'), inline: false }])
      .setTimestamp(changedAt);
    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.warn(`Could not send ${title || 'duty log'}:`, error);
    return false;
  }
}

function buildRoleResultFields(roleResult) {
  return [
    { name: 'Roles added', value: safeFieldValue(roleResult?.added?.join(', ') || 'None'), inline: false },
    { name: 'Roles removed', value: safeFieldValue(roleResult?.removed?.join(', ') || 'None'), inline: false },
    { name: 'Role failures/skips', value: safeFieldValue([...(roleResult?.failed || []), ...(roleResult?.skipped || [])].join('\n') || 'None'), inline: false }
  ];
}

function formatDetails(details = {}) {
  return Object.entries(details)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n') || 'None provided.';
}

module.exports = {
  sendApplicationReviewLog,
  sendAppealLog,
  sendCadetTrainingLog,
  sendDutyLog,
  sendOfficerActionLog,
  sendOfficerRankChangeLog
};
