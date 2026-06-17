const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const serverConfig = require('../config/serverConfig');
const { getMemberRank } = require('../utils/rankUtils');
const {
  ensureDutyTables,
  getActiveDutySession,
  clockInUser,
  clockOutUser,
  formatDuration,
  getRecentTimecards
} = require('../utils/dutyUtils');

const DUTY_EMBED_COLOR = 0x2ecc71;
const ERROR_EMBED_COLOR = 0xe74c3c;

const configuredDutyTypes = serverConfig?.duty?.dutyTypes || [];
const dutyTypeChoices = configuredDutyTypes.map((type) => ({
  name: type.label,
  value: type.key
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duty')
    .setDescription('Clock in, clock out, and view your duty timecards.')
    .addSubcommand((subcommand) => subcommand
      .setName('clock-in')
      .setDescription('Start a duty session.')
      .addStringOption((option) => option
        .setName('type')
        .setDescription('The type of duty you are performing.')
        .setRequired(true)
        .addChoices(...dutyTypeChoices)))
    .addSubcommand((subcommand) => subcommand
      .setName('clock-out')
      .setDescription('End your active duty session.'))
    .addSubcommand((subcommand) => subcommand
      .setName('status')
      .setDescription('View your current duty status.'))
    .addSubcommand((subcommand) => subcommand
      .setName('recent')
      .setDescription('View your last 10 completed duty timecards.')),

  async execute(interaction) {
    if (!serverConfig?.duty?.enabled) {
      return interaction.reply({
        content: 'Duty tracking is currently disabled for this server.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      await ensureDutyTables();

      if (subcommand === 'clock-in') return handleClockIn(interaction);
      if (subcommand === 'clock-out') return handleClockOut(interaction);
      if (subcommand === 'status') return handleStatus(interaction);
      if (subcommand === 'recent') return handleRecent(interaction);

      return interaction.reply({ content: 'Unknown duty subcommand.', ephemeral: true });
    } catch (error) {
      console.error('Duty command error:', error);
      return replyFriendlyError(interaction);
    }
  }
};

async function handleClockIn(interaction) {
  const dutyTypeKey = interaction.options.getString('type', true);
  const dutyType = getDutyType(dutyTypeKey);

  if (!dutyType) {
    return interaction.reply({
      content: 'That duty type is not configured for this server.',
      ephemeral: true
    });
  }

  const activeSession = await getActiveDutySession(interaction.guildId, interaction.user.id);

  if (activeSession) {
    const clockInUnix = toUnix(activeSession.clock_in_at);
    return interaction.reply({
      content: `You are already clocked in since <t:${clockInUnix}:f> (<t:${clockInUnix}:R>).`,
      ephemeral: true
    });
  }

  const rank = getRankSafely(interaction.member);
  const clockInAt = new Date();

  await clockInUser({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    dutyType: dutyType.key,
    rankKey: rank?.rankRoleId || rank?.name || null,
    rankName: rank?.name || null,
    clockInAt
  });

  const embed = new EmbedBuilder()
    .setTitle('Clocked In')
    .setColor(DUTY_EMBED_COLOR)
    .setDescription(`You are now clocked in for **${dutyType.label}**.`)
    .addFields([
      { name: 'Clock-in time', value: `<t:${toUnix(clockInAt)}:f>`, inline: true },
      { name: 'Rank recorded', value: rank?.name || 'Not detected', inline: true }
    ])
    .setTimestamp(clockInAt);

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleClockOut(interaction) {
  const activeSession = await getActiveDutySession(interaction.guildId, interaction.user.id);

  if (!activeSession) {
    return interaction.reply({
      content: 'You are not currently clocked in.',
      ephemeral: true
    });
  }

  const clockOutAt = new Date();
  const timecard = await clockOutUser({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    clockOutAt
  });
  const dutyType = getDutyType(timecard.dutyType);
  const clockInUnix = toUnix(timecard.clockInAt);
  const clockOutUnix = toUnix(timecard.clockOutAt);
  const duration = formatDuration(timecard.durationSeconds);
  const summaryEmbed = buildTimecardEmbed({
    title: 'Clocked Out',
    user: interaction.user,
    timecard,
    dutyTypeLabel: dutyType?.label || timecard.dutyType,
    clockInUnix,
    clockOutUnix,
    duration
  });

  let dmSent = true;
  try {
    await interaction.user.send({ embeds: [summaryEmbed] });
  } catch (error) {
    dmSent = false;
    console.warn(`Could not DM duty timecard ${timecard.timecardId} to user ${interaction.user.id}:`, error);
  }

  await sendDutyLog(interaction, summaryEmbed);

  // TODO: Send completed timecards to the future Google duty webhook when googleWebhook.enabled is true.

  return interaction.reply({
    content: dmSent
      ? 'You have been clocked out. I sent you a DM with your timecard summary.'
      : 'You have been clocked out. I could not send your DM summary, but your timecard was saved.',
    embeds: [summaryEmbed],
    ephemeral: true
  });
}

async function handleStatus(interaction) {
  const activeSession = await getActiveDutySession(interaction.guildId, interaction.user.id);

  if (!activeSession) {
    return interaction.reply({
      content: 'You are currently off duty.',
      ephemeral: true
    });
  }

  const clockInAt = new Date(activeSession.clock_in_at);
  const elapsedSeconds = Math.floor((Date.now() - clockInAt.getTime()) / 1000);
  const dutyType = getDutyType(activeSession.duty_type);

  const embed = new EmbedBuilder()
    .setTitle('Current Duty Status')
    .setColor(DUTY_EMBED_COLOR)
    .addFields([
      { name: 'Status', value: 'On duty', inline: true },
      { name: 'Duty type', value: dutyType?.label || activeSession.duty_type, inline: true },
      { name: 'Clock-in time', value: `<t:${toUnix(clockInAt)}:f> (<t:${toUnix(clockInAt)}:R>)`, inline: false },
      { name: 'Elapsed', value: formatDuration(elapsedSeconds), inline: true }
    ]);

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRecent(interaction) {
  const timecards = await getRecentTimecards(interaction.guildId, interaction.user.id, 10);

  if (timecards.length === 0) {
    return interaction.reply({
      content: 'You do not have any completed duty timecards yet.',
      ephemeral: true
    });
  }

  const lines = timecards.map((timecard) => {
    const dutyType = getDutyType(timecard.duty_type);
    return [
      `**${timecard.timecard_id}** — ${dutyType?.label || timecard.duty_type}`,
      `In: <t:${toUnix(timecard.clock_in_at)}:f> | Out: <t:${toUnix(timecard.clock_out_at)}:f>`,
      `Duration: ${formatDuration(timecard.duration_seconds)} | Status: ${timecard.status}`
    ].join('\n');
  });

  const embed = new EmbedBuilder()
    .setTitle('Recent Duty Timecards')
    .setColor(DUTY_EMBED_COLOR)
    .setDescription(lines.join('\n\n'));

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

function buildTimecardEmbed({ title, user, timecard, dutyTypeLabel, clockInUnix, clockOutUnix, duration }) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(DUTY_EMBED_COLOR)
    .addFields([
      { name: 'Officer', value: `<@${user.id}>`, inline: true },
      { name: 'Timecard ID', value: timecard.timecardId, inline: true },
      { name: 'Duty type', value: dutyTypeLabel, inline: true },
      { name: 'Clock in', value: `<t:${clockInUnix}:f>`, inline: true },
      { name: 'Clock out', value: `<t:${clockOutUnix}:f>`, inline: true },
      { name: 'Duration', value: duration, inline: true },
      { name: 'Status', value: timecard.status, inline: true }
    ])
    .setTimestamp(timecard.clockOutAt);
}

async function sendDutyLog(interaction, embed) {
  const logChannelId = serverConfig?.duty?.logChannelId;

  if (!logChannelId) return false;

  try {
    const channel = interaction.guild.channels.cache.get(logChannelId)
      || await interaction.guild.channels.fetch(logChannelId);

    if (!channel || typeof channel.send !== 'function') return false;

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.warn('Could not send duty log:', error);
    return false;
  }
}

function getDutyType(key) {
  return configuredDutyTypes.find((type) => type.key === key) || null;
}

function getRankSafely(member) {
  try {
    return getMemberRank(member, serverConfig);
  } catch (error) {
    console.warn('Could not detect member rank for duty clock-in:', error);
    return null;
  }
}

function toUnix(dateValue) {
  return Math.floor(new Date(dateValue).getTime() / 1000);
}

async function replyFriendlyError(interaction) {
  const errorPayload = {
    embeds: [
      new EmbedBuilder()
        .setTitle('Duty Error')
        .setColor(ERROR_EMBED_COLOR)
        .setDescription('Something went wrong while handling your duty request. Please try again later or contact command staff.')
    ],
    ephemeral: true
  };

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(errorPayload);
  }

  return interaction.reply(errorPayload);
}
