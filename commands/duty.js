const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const serverConfig = require('../config/serverConfig');
const { getMemberRank } = require('../utils/rankUtils');
const {
  ensureDutyTables,
  getActiveDutySession,
  clockInUser,
  clockOutUser,
  formatDuration,
  getRecentTimecards,
  createLoaRequest,
  updateLoaApprovalMessage,
  getLoaRequestById,
  approveLoaRequest,
  denyLoaRequest,
  markLoaRoleAdded,
  updateLoaSyncStatus,
  calculateDurationDays,
  parseDateInput,
  formatDateOnly,
  getTimecardById,
  createTimecardCorrection,
  getCorrectionById,
  updateCorrectionApprovalMessage,
  approveTimecardCorrection,
  denyTimecardCorrection,
  applyApprovedTimecardCorrection,
  parseDateTimeInput,
  calculateDurationSeconds,
  createRideAlongFeedback
} = require('../utils/dutyUtils');
const { sendDutyLog } = require('../utils/logUtils');
const { runLoaDailySync } = require('../utils/loaSync');
const { buildAppealStartButtonRow } = require('../utils/appealUtils');
const { issueOfficerStrike } = require('./officerManagement');
const { safeSubmitDepartmentEvent } = require('../utils/googleDepartmentEvents');
const {
  generateActivityReport,
  calculateOfficerActivity,
  getMostRecentCompletedCycle,
  parseCycleDate,
  formatHours,
  formatActivityStatus,
  saveActivityCycle,
  resolveActivityFindingReview
} = require('../utils/activityUtils');

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
      .setDescription('View your last 10 completed duty timecards.'))
    .addSubcommand((subcommand) => subcommand
      .setName('loa')
      .setDescription('Submit a leave of absence request.'))
    .addSubcommand((subcommand) => subcommand
      .setName('ridealong')
      .setDescription('Submit ride-along feedback for a Probationary Officer.')
      .addUserOption((option) => option
        .setName('officer')
        .setDescription('Probationary Officer who completed the ride-along.')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('correction')
      .setDescription('Request a correction to one of your completed duty timecards.')
      .addStringOption((option) => option
        .setName('timecard-id')
        .setDescription('Optional timecard ID to correct, such as TC-20260617-ABCD.')
        .setRequired(false)))
    .addSubcommand((subcommand) => subcommand
      .setName('loa-sync')
      .setDescription('Manually run the LOA daily role sync.')
      .addBooleanOption((option) => option
        .setName('dry-run')
        .setDescription('Preview changes without adding or removing roles.')))
    .addSubcommand((subcommand) => subcommand
      .setName('activity-report')
      .setDescription('Generate a staff-only 14-day activity cycle report.')
      .addStringOption((option) => option
        .setName('cycle-start')
        .setDescription('Optional cycle start date in YYYY-MM-DD format.'))
      .addStringOption((option) => option
        .setName('cycle-end')
        .setDescription('Optional cycle end date in YYYY-MM-DD format.'))
      .addBooleanOption((option) => option
        .setName('dry-run')
        .setDescription('Preview only. Defaults to true.')))
    .addSubcommand((subcommand) => subcommand
      .setName('activity-status')
      .setDescription('Check one officer’s activity for a cycle.')
      .addUserOption((option) => option
        .setName('officer')
        .setDescription('Officer to check.')
        .setRequired(true))
      .addStringOption((option) => option
        .setName('cycle-start')
        .setDescription('Optional cycle start date in YYYY-MM-DD format.'))
      .addStringOption((option) => option
        .setName('cycle-end')
        .setDescription('Optional cycle end date in YYYY-MM-DD format.'))),

  async execute(interaction) {
    if (!serverConfig?.duty?.enabled) {
      return interaction.reply({
        content: 'Duty tracking is currently disabled for this server.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'activity-report') return handleActivityReport(interaction);

      await ensureDutyTables();

      if (subcommand === 'clock-in') return handleClockIn(interaction);
      if (subcommand === 'clock-out') return handleClockOut(interaction);
      if (subcommand === 'status') return handleStatus(interaction);
      if (subcommand === 'recent') return handleRecent(interaction);
      if (subcommand === 'loa') return handleLoa(interaction);
      if (subcommand === 'ridealong') return handleRideAlong(interaction);
      if (subcommand === 'correction') return handleCorrection(interaction);
      if (subcommand === 'loa-sync') return handleLoaSync(interaction);
      if (subcommand === 'activity-status') return handleActivityStatus(interaction);

      return interaction.reply({ content: 'Unknown duty subcommand.', ephemeral: true });
    } catch (error) {
      console.error('Duty command error:', error);
      return replyFriendlyError(interaction);
    }
  },
  handleModalSubmit,
  handleSelectMenu,
  handleButton
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

  await submitDutyGoogleEvent(interaction, 'DUTY_CLOCK_IN', { startedAt: clockInAt.toISOString(), rank: rank?.name || '', patrolType: dutyType.label, type: dutyType.key });

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
  const logEmbed = buildTimecardEmbed({
    title: 'Duty Clock-Out',
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

  await sendDutyTimecardLog(interaction, logEmbed);

  await submitDutyGoogleEvent(interaction, 'DUTY_CLOCK_OUT', {
    startedAt: new Date(timecard.clockInAt).toISOString(),
    endedAt: new Date(timecard.clockOutAt).toISOString(),
    durationMinutes: Math.round((timecard.durationSeconds || 0) / 60),
    durationHours: Math.round(((timecard.durationSeconds || 0) / 3600) * 100) / 100,
    rank: getRankSafely(interaction.member)?.name || '',
    patrolType: dutyType?.label || timecard.dutyType,
    type: timecard.dutyType,
    timecardId: timecard.timecardId
  });

  const rideAlongReminder = serverConfig?.duty?.rideAlongFeedback?.enabled && ['fto', 'training'].includes(timecard.dutyType)
    ? '\nIf you completed a ride-along with a Probationary Officer, submit the review with `/duty ridealong officer:@officer`.'
    : '';

  return interaction.reply({
    content: `${dmSent
      ? 'You have been clocked out. I sent you a DM with your timecard summary.'
      : 'You have been clocked out. I could not send your DM summary, but your timecard was saved.'}${rideAlongReminder}`,
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


async function handleCorrection(interaction) {
  const correctionConfig = serverConfig?.duty?.corrections || {};
  if (!correctionConfig.enabled) return interaction.reply({ content: 'Timecard corrections are not enabled for this server.', ephemeral: true });
  if (!correctionConfig.approvalChannelId) return interaction.reply({ content: 'The timecard correction approval channel has not been configured.', ephemeral: true });

  const manualTimecardId = interaction.options.getString('timecard-id')?.trim();
  if (manualTimecardId) {
    if (!correctionConfig.allowManualTimecardId) return interaction.reply({ content: 'Manual timecard ID correction requests are not enabled for this server.', ephemeral: true });
    const timecard = await getTimecardById(interaction.guildId, manualTimecardId);
    if (!timecard || timecard.user_id !== interaction.user.id) return interaction.reply({ content: 'That completed timecard could not be found under your account in this server.', ephemeral: true });
    return interaction.showModal(buildCorrectionModal(timecard.timecard_id));
  }

  const limit = correctionConfig.recentTimecardLimit || 10;
  const timecards = await getRecentTimecards(interaction.guildId, interaction.user.id, limit);
  if (timecards.length === 0) {
    const manualMessage = correctionConfig.allowManualTimecardId ? ' You can also run `/duty correction timecard-id:TC-...` if you know the timecard ID.' : '';
    return interaction.reply({ content: `You do not have any recent completed duty timecards to correct.${manualMessage}`, ephemeral: true });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('duty_correction_select')
    .setPlaceholder('Choose a completed timecard to correct')
    .addOptions(timecards.slice(0, 25).map((timecard) => {
      const dutyType = getDutyType(timecard.duty_type);
      return {
        label: `${timecard.timecard_id} • ${dutyType?.label || timecard.duty_type}`.slice(0, 100),
        description: `${formatDuration(timecard.duration_seconds)} • ${formatDateTimeForDisplay(timecard.clock_out_at)}`.slice(0, 100),
        value: timecard.timecard_id
      };
    }));

  const content = correctionConfig.allowManualTimecardId
    ? 'Select one of your recent completed timecards, or run `/duty correction timecard-id:TC-...` to enter a specific timecard ID.'
    : 'Select one of your recent completed timecards.';
  return interaction.reply({ content, components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
}

async function handleSelectMenu(interaction) {
  if (interaction.customId !== 'duty_correction_select') return false;
  if (!serverConfig?.duty?.enabled) return interaction.reply({ content: 'Duty tracking is currently disabled for this server.', ephemeral: true }).then(() => true);
  const correctionConfig = serverConfig?.duty?.corrections || {};
  if (!correctionConfig.enabled) return interaction.reply({ content: 'Timecard corrections are not enabled for this server.', ephemeral: true }).then(() => true);
  if (!correctionConfig.approvalChannelId) return interaction.reply({ content: 'The timecard correction approval channel has not been configured.', ephemeral: true }).then(() => true);

  const timecardId = interaction.values[0];
  const timecard = await getTimecardById(interaction.guildId, timecardId);
  if (!timecard || timecard.user_id !== interaction.user.id) return interaction.reply({ content: 'That completed timecard could not be found under your account in this server.', ephemeral: true }).then(() => true);

  await interaction.showModal(buildCorrectionModal(timecard.timecard_id));
  return true;
}

async function handleRideAlong(interaction) {
  const feedbackConfig = serverConfig?.duty?.rideAlongFeedback || {};
  if (!feedbackConfig.enabled) return interaction.reply({ content: 'Ride-along feedback is not enabled for this server.', ephemeral: true });

  const officer = interaction.options.getUser('officer', true);
  if (officer.id === interaction.user.id) return interaction.reply({ content: 'You cannot submit ride-along feedback about yourself.', ephemeral: true });

  const probationaryMember = await interaction.guild.members.fetch(officer.id).catch(() => null);
  if (!probationaryMember) return interaction.reply({ content: 'That officer could not be found in this server.', ephemeral: true });

  const reviewerRank = getRankSafely(interaction.member);
  const minimumLevel = Number(feedbackConfig.minReviewerRankLevel || 2);
  const rankAllowed = Number(reviewerRank?.level || 0) >= minimumLevel;
  const roleAllowed = memberHasAnyRole(interaction.member, feedbackConfig.reviewerRoleIds || []);
  if (!rankAllowed && !roleAllowed) return interaction.reply({ content: 'You do not have permission to submit ride-along feedback.', ephemeral: true });

  const probationaryRoleIds = feedbackConfig.probationaryRoleIds || [];
  if (feedbackConfig.requireTargetProbationary && probationaryRoleIds.length > 0 && !memberHasAnyRole(probationaryMember, probationaryRoleIds)) {
    return interaction.reply({ content: 'That officer is not configured as a Probationary Officer for ride-along feedback.', ephemeral: true });
  }

  return interaction.showModal(buildRideAlongFeedbackModal(officer.id));
}

async function handleLoa(interaction) {
  const loaConfig = serverConfig?.duty?.loa || {};
  if (!loaConfig.enabled) return interaction.reply({ content: 'LOA requests are not enabled for this server.', ephemeral: true });
  if (!loaConfig.approvalChannelId) return interaction.reply({ content: 'The LOA approval channel has not been configured.', ephemeral: true });

  const modal = new ModalBuilder().setCustomId('duty_loa_request').setTitle('LOA Request');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('start_date').setLabel('Start date (YYYY-MM-DD)').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('end_date').setLabel('End date (YYYY-MM-DD)').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('comments').setLabel('Additional comments').setStyle(TextInputStyle.Paragraph).setRequired(false))
  );
  return interaction.showModal(modal);
}

async function handleLoaSync(interaction) {
  const loaConfig = serverConfig?.duty?.loa || {};
  const approverRoleIds = loaConfig.approverRoleIds || [];
  if (!approverRoleIds.length) return interaction.reply({ content: 'LOA approver roles are not configured.', ephemeral: true });
  if (!memberHasAnyRole(interaction.member, approverRoleIds)) return interaction.reply({ content: 'You do not have permission to run LOA sync.', ephemeral: true });

  const dryRun = interaction.options.getBoolean('dry-run') || false;
  await interaction.deferReply({ ephemeral: true });
  const summary = await runLoaDailySync(interaction.client, { guildId: interaction.guildId, dryRun, triggeredBy: interaction.user.id });
  const details = summary.details.slice(0, 8).map((detail) => `- ${detail.loaId}: ${detail.message}`).join('\n') || '- No LOAs needed action.';
  return interaction.editReply(`LOA Sync Complete\n\nMode: ${dryRun ? 'Dry Run' : 'Live'}\nAdded: ${summary.added}\nRemoved: ${summary.removed}\nAlready correct: ${summary.alreadyCorrect}\nSkipped: ${summary.skipped}\nErrors: ${summary.errors}\n\nDetails:\n${details}`);
}

async function handleActivityReport(interaction) {
  console.log('[activity-report] activity report started');
  let deferred = false;

  try {
    const activityConfig = serverConfig?.duty?.activity || {};
    console.log('[activity-report] config loaded');

    if (!activityConfig.enabled) return interaction.reply({ content: 'Activity reporting is not enabled for this server.', ephemeral: true });
    if (!memberCanUseActivity(interaction.member)) return interaction.reply({ content: 'You do not have permission to run activity reports. Activity approver roles are not configured or you do not have one.', ephemeral: true });
    if (!Array.isArray(activityConfig.includeRoleIds) || activityConfig.includeRoleIds.length === 0) {
      return interaction.reply({ content: 'Activity includeRoleIds is not configured. Add a department/test role before running the report.', ephemeral: true });
    }

    const cycleRange = getRequestedCycleRange(interaction, activityConfig);
    if (cycleRange.error) return interaction.reply({ content: cycleRange.error, ephemeral: true });
    console.log('[activity-report] cycle dates parsed', {
      cycleStart: formatDateOnly(cycleRange.cycleStart),
      cycleEnd: formatDateOnly(cycleRange.cycleEnd)
    });

    const dryRun = interaction.options.getBoolean('dry-run') ?? true;
    await interaction.deferReply({ ephemeral: true });
    deferred = true;

    await withActivityTimeout(ensureDutyTables(), 10000, 'Activity database setup took too long. Please try again in a moment.');

    const report = await generateActivityReport({
      guild: interaction.guild,
      cycleStart: cycleRange.cycleStart,
      cycleEnd: cycleRange.cycleEnd,
      dryRun,
      triggeredBy: interaction.user,
      config: serverConfig,
      timeoutMs: 25000
    });

    if (!dryRun) {
      await issueActivityStrikeRecords({
        guild: interaction.guild,
        client: interaction.client,
        findings: report.findings.filter((finding) => finding.autoStrikeCreated && finding.autoStrikeLevel === 1),
        staffUser: interaction.user,
        activityConfig,
        cycleStart: cycleRange.cycleStart,
        cycleEnd: cycleRange.cycleEnd
      });

      await notifyActivityStatusUsers({
        client: interaction.client,
        guild: interaction.guild,
        findings: report.findings,
        cycleStart: cycleRange.cycleStart,
        cycleEnd: cycleRange.cycleEnd,
        activityConfig,
        reviewerUser: interaction.user
      });
    }

    if (!dryRun) {
      await withActivityTimeout(sendDutyLog({
        guild: interaction.guild,
        serverConfig,
        title: 'Activity report generated',
        fields: [
          { name: 'Cycle', value: `${formatDateOnly(cycleRange.cycleStart)} through ${formatDateOnly(cycleRange.cycleEnd)}`, inline: false },
          { name: 'Mode', value: 'Live', inline: true },
          { name: 'Generated by', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Findings', value: `Active: ${report.cycle.activeCount}\nSemi-Active: ${report.cycle.semiActiveCount}\nInactive: ${report.cycle.inactiveCount}\nReviews: ${report.findings.filter((finding) => finding.commandReviewRequired).length}\nAuto Strike 1: ${report.findings.filter((finding) => finding.autoStrikeCreated).length}`, inline: false }
        ]
      }), 5000, 'Duty log send took too long.').catch((error) => console.warn('[activity-report] duty log skipped:', error.message || error));
    }

    if (!dryRun && activityConfig.reportChannelId) {
      const reportChannel = await withActivityTimeout(
        interaction.guild.channels.fetch(activityConfig.reportChannelId),
        5000,
        'Activity report channel fetch took too long.'
      ).catch((error) => {
        console.warn('[activity-report] report channel unavailable:', error.message || error);
        return null;
      });
      if (reportChannel && typeof reportChannel.send === 'function') {
        const message = await withActivityTimeout(
          reportChannel.send({ embeds: [report.embed] }),
          5000,
          'Activity report channel post took too long.'
        ).catch((error) => {
          console.warn('[activity-report] report channel post skipped:', error.message || error);
          return null;
        });
        if (message) {
          report.cycle.reportMessageId = message.id;
          report.cycle.reportChannelId = message.channel.id;
          console.log('[activity-report] database save started');
          await withActivityTimeout(saveActivityCycle(report.cycle), 5000, 'Activity report message save took too long.').catch((error) => {
            console.warn('[activity-report] report message save skipped:', error.message || error);
          });
          console.log('[activity-report] database save completed');
        }
      }
    }

    const reviewFindings = report.findings.filter((finding) => finding.commandReviewRequired);
    if (!dryRun && activityConfig.commandReviewChannelId && reviewFindings.length > 0) {
      const reviewChannel = await withActivityTimeout(
        interaction.guild.channels.fetch(activityConfig.commandReviewChannelId),
        5000,
        'Command review channel fetch took too long.'
      ).catch((error) => {
        console.warn('[activity-report] command review channel unavailable:', error.message || error);
        return null;
      });
      if (reviewChannel && typeof reviewChannel.send === 'function') {
        for (const finding of reviewFindings.slice(0, 20)) {
          await withActivityTimeout(
            reviewChannel.send({
              embeds: [buildActivityReviewEmbed(finding)],
              components: [buildActivityReviewButtons(getFindingId(finding), getFindingInactiveStreak(finding), false)]
            }),
            5000,
            'Command review post took too long.'
          ).catch((error) => console.warn('[activity-report] command review post skipped:', error.message || error));
        }
      }
    }

    await submitDutyGoogleEvent(interaction, 'ACTIVITY_REPORT_RUN', buildActivityReportGooglePayload(report, cycleRange, dryRun));
    await interaction.editReply({ embeds: [report.embed] });
    console.log('[activity-report] report response sent');
    return;
  } catch (error) {
    console.error('[activity-report] Activity report failed:', error.message || error);
    const message = 'Activity report could not be completed. No activity strikes, DMs, or report-channel posts were sent. Please check the bot console for the safe error details.';
    if (deferred || interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message, embeds: [] }).catch((replyError) => console.error('[activity-report] failed to send error reply:', replyError.message || replyError));
      console.log('[activity-report] report response sent');
      return;
    }
    await interaction.reply({ content: message, ephemeral: true }).catch((replyError) => console.error('[activity-report] failed to send error reply:', replyError.message || replyError));
  }
}

function withActivityTimeout(promise, timeoutMs, message) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
}

async function notifyActivityStatusUsers({ client, guild, findings, cycleStart, cycleEnd, activityConfig, reviewerUser }) {
  const notifyFindings = findings.filter((finding) => {
    if (finding.activityStatus === 'SEMI_ACTIVE') return true;
    return finding.autoStrikeCreated && finding.autoStrikeLevel === 1;
  });

  if (notifyFindings.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const finding of notifyFindings) {
    const userId = getFindingUserId(finding);
    try {
      const user = await withActivityTimeout(
        client.users.fetch(userId),
        5000,
        `Activity notification user fetch timed out for ${userId}.`
      );

      const messageOptions = buildActivityNotificationMessage({
        user,
        guild,
        finding,
        cycleStart,
        cycleEnd,
        activityConfig,
        reviewerUser
      });

      await withActivityTimeout(
        user.send(messageOptions),
        5000,
        `Activity notification DM timed out for ${userId}.`
      );

      sent += 1;
      console.log(`[activity-report] Activity notification DM sent to ${userId}`);
    } catch (error) {
      failed += 1;
      console.warn(`[activity-report] Activity notification DM failed for ${userId}:`, error.message || error);
    }
  }

  console.log('[activity-report] Activity notification DMs completed', { sent, failed });
  return { sent, failed };
}

function buildActivityNotificationMessage({ user, guild, finding, cycleStart, cycleEnd, activityConfig, reviewerUser }) {
  const isSemiActive = finding.activityStatus === 'SEMI_ACTIVE';
  const inactiveStreak = getFindingInactiveStreak(finding);
  const title = isSemiActive
    ? 'Activity Requirement Reminder'
    : inactiveStreak >= 3
      ? 'Final Activity Warning'
      : inactiveStreak === 2
        ? 'Second Activity Warning'
        : getActivityStrike1Label(activityConfig);
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(isSemiActive ? 0xf1c40f : ERROR_EMBED_COLOR)
    .setDescription(buildActivityNotificationBody({
      user,
      finding,
      cycleStart,
      cycleEnd,
      activityConfig,
      reviewerUser
    }))
    .addFields([
      { name: 'Department', value: serverConfig?.departmentName || guild?.name || 'This department', inline: false },
      { name: 'Cycle', value: `${formatDateOnly(cycleStart)} through ${formatDateOnly(cycleEnd)}`, inline: true },
      { name: 'Recorded hours', value: `${formatHours(getFindingTotalSeconds(finding))} total`, inline: true },
      { name: 'Reference', value: getFindingId(finding) || 'Activity finding', inline: false }
    ])
    .setTimestamp(new Date());

  const messageOptions = { embeds: [embed] };
  if (!isSemiActive && inactiveStreak === 1) {
    const appealButtonRow = buildAppealStartButtonRow({
      serverConfig,
      appealType: 'strike',
      officerId: user.id,
      caseId: `activity-strike-${inactiveStreak}-${getFindingId(finding) || 'unknown'}`
    });
    if (appealButtonRow) messageOptions.components = [appealButtonRow];
  }

  return messageOptions;
}

function buildActivityNotificationBody({ user, finding, cycleStart, cycleEnd, activityConfig, reviewerUser }) {
  const hours = formatHours(getFindingTotalSeconds(finding));
  const policyReference = activityConfig?.policyReference || 'RWPD Policy Memo 3 item 4.1';
  const semiPolicyReference = activityConfig?.semiActivePolicyReference || 'RWPD Policy 3 - 2.6';
  const commandSignature = activityConfig?.commandSignature || 'RWPD Command';
  const commandStaffSignature = activityConfig?.commandStaffSignature || 'RWPD Command Staff';
  const inactiveStreak = getFindingInactiveStreak(finding);
  const reviewerMention = reviewerUser ? `<@${reviewerUser.id}>` : 'Command Staff';
  const issuedAtUnix = Math.floor(Date.now() / 1000);
  const dueUnix = Math.floor((Date.now() + 72 * 60 * 60 * 1000) / 1000);
  const greeting = `Hello ${user},`;
  const cycleText = `${formatDateOnly(cycleStart)} to ${formatDateOnly(cycleEnd)}`;

  if (finding.activityStatus === 'SEMI_ACTIVE') {
    return [
      greeting,
      '',
      `The system has detected that you did not meet the activity requirements for the last cycle from ${cycleText}. According to our records you clocked in ${hours}. According to ${semiPolicyReference}, while you did not meet your active requirement, you did meet the semi-active requirement. As such, no inactivity warning will be issued. This message is a reminder to ensure that you are meeting your activity requirements. No actions are required of you at this time.`,
      '',
      'Regards,',
      commandSignature
    ].join('\n');
  }

  if (inactiveStreak >= 3) {
    return [
      greeting,
      '',
      `The system has detected that you did not meet the activity requirements for the last cycle from ${cycleText}. According to our records you clocked in ${hours}. Please note that you are currently in violation of ${policyReference}. As you were previously issued an activity strike, this will be considered your final activity warning. According to RWPD Policy 3 - 4.1, you are eligible to be removed for inactivity after receiving 3 warnings. You have 72 hours from <t:${issuedAtUnix}:f> to contact ${reviewerMention} regarding your activity, or you may face disciplinary action.`,
      '',
      'Regards,',
      commandStaffSignature
    ].join('\n');
  }

  if (inactiveStreak === 2) {
    return [
      greeting,
      '',
      `The system has detected that you did not meet the activity requirements for the last cycle from ${cycleText}. According to our records you clocked in ${hours}. Please note that you are currently in violation of ${policyReference}. As you were previously issued an activity strike, this will be considered your second warning. Please note that according to the RWPD Activity Policy, you are **required** to contact ${reviewerMention} within 72 hours or by <t:${dueUnix}:f>, or you may face additional disciplinary action.`,
      '',
      'Regards,',
      commandStaffSignature
    ].join('\n');
  }

  return [
    greeting,
    '',
    `The system has detected that you did not meet the activity requirements for the last cycle from ${cycleText}. According to our records you clocked in ${hours}. Please note that you are currently in violation of ${policyReference}, and you have been issued an activity strike. If you believe that this is an error, you may use the appeal button provided below.`,
    '',
    'Regards,',
    commandSignature
  ].join('\n');
}

function getActivityStrike1Label(activityConfig) {
  return activityConfig?.discipline?.strike1Label || 'Activity Strike 1 - Written Warning';
}

async function handleActivityReviewButton(interaction) {
  const [, outcome, findingId] = interaction.customId.split(':');
  if (!['manual', 'ignore'].includes(outcome) || !findingId) return false;

  if (!memberCanUseActivity(interaction.member)) {
    return interaction.reply({
      embeds: [buildSimpleEmbed('Activity Review', 'You do not have permission to review activity findings.', ERROR_EMBED_COLOR)],
      ephemeral: true
    }).then(() => true);
  }

  await interaction.deferReply({ ephemeral: true });
  await ensureDutyTables();

  const finding = await resolveActivityFindingReview({
    findingId,
    outcome,
    reviewedBy: interaction.user.id
  });

  if (!finding) {
    await interaction.editReply({
      embeds: [buildSimpleEmbed('Activity Review', 'That activity finding could not be found.', ERROR_EMBED_COLOR)]
    });
    return true;
  }

  const resolvedEmbed = buildActivityReviewEmbed(finding, { outcome, reviewedBy: interaction.user.id });
  await interaction.message.edit({
    embeds: [resolvedEmbed],
    components: [buildActivityReviewButtons(findingId, getFindingInactiveStreak(finding), true)]
  }).catch((error) => console.warn('[activity-report] could not update activity review message:', error.message || error));

  let dmSent = false;
  let dmAttempted = false;
  if (outcome === 'manual' && getFindingInactiveStreak(finding) >= 2) {
    dmAttempted = true;
    await issueActivityStrikeRecords({
      guild: interaction.guild,
      client: interaction.client,
      findings: [finding],
      staffUser: interaction.user,
      activityConfig: serverConfig?.duty?.activity || {},
      cycleStart: finding.cycle_start,
      cycleEnd: finding.cycle_end
    });
    dmSent = await sendManualActivityWarningDm({
      client: interaction.client,
      guild: interaction.guild,
      finding,
      reviewerUser: interaction.user
    });
  }

  await sendDutyLog({
    guild: interaction.guild,
    serverConfig,
    title: outcome === 'ignore' ? 'Activity review ignored' : 'Activity review manually handled',
    fields: [
      { name: 'Finding ID', value: findingId, inline: true },
      { name: 'Officer', value: `<@${getFindingUserId(finding)}>`, inline: true },
      { name: 'Reviewed by', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Outcome', value: outcome === 'ignore' ? 'Ignored / no action' : 'Manual action recorded', inline: false },
      { name: 'DM sent', value: dmAttempted ? (dmSent ? 'Yes' : 'No') : 'Not needed', inline: true }
    ]
  }).catch((error) => console.warn('[activity-report] activity review log skipped:', error.message || error));

  await interaction.editReply({
    embeds: [buildSimpleEmbed(
      'Activity Review Updated',
      outcome === 'ignore'
        ? `Marked ${findingId} as ignored/no action.`
        : `Marked ${findingId} as manually handled.${dmAttempted ? ` DM sent: ${dmSent ? 'Yes' : 'No'}.` : ''} No removal or termination was issued automatically by the bot.`,
      DUTY_EMBED_COLOR
    )]
  });
  return true;
}

async function issueActivityStrikeRecords({ guild, client, findings, staffUser, activityConfig, cycleStart, cycleEnd }) {
  for (const finding of findings) {
    const strikeLevel = getFindingInactiveStreak(finding) || finding.autoStrikeLevel || 1;
    if (strikeLevel < 1 || strikeLevel > 3) continue;

    await issueOfficerStrike({
      guild,
      client,
      serverConfig,
      officerUserId: getFindingUserId(finding),
      staffUser,
      strikeLevel,
      details: {
        reason: `Activity requirement not met for ${formatDateOnly(cycleStart)} through ${formatDateOnly(cycleEnd)}. Recorded hours: ${formatHours(getFindingTotalSeconds(finding))}.`,
        evidence: `Activity finding ${getFindingId(finding) || 'unknown'}.`,
        nextSteps: getActivityStrikeNextSteps(strikeLevel, activityConfig)
      },
      category: 'activity',
      sendDm: false,
      caseId: getFindingId(finding),
      changedAt: new Date()
    }).catch((error) => console.warn(`[activity-report] activity strike helper failed for ${getFindingUserId(finding)}:`, error.message || error));
  }
}

function getActivityStrikeNextSteps(strikeLevel, activityConfig) {
  if (strikeLevel >= 3) return 'Final activity warning issued after Command review.';
  if (strikeLevel === 2) return 'Second activity warning issued after Command review.';
  return activityConfig?.discipline?.strike1Label || 'Activity Strike 1 issued automatically.';
}

async function sendManualActivityWarningDm({ client, guild, finding, reviewerUser }) {
  const userId = getFindingUserId(finding);
  try {
    const user = await withActivityTimeout(
      client.users.fetch(userId),
      5000,
      `Manual activity warning user fetch timed out for ${userId}.`
    );

    const messageOptions = buildActivityNotificationMessage({
      user,
      guild,
      finding,
      cycleStart: finding.cycle_start,
      cycleEnd: finding.cycle_end,
      activityConfig: serverConfig?.duty?.activity || {},
      reviewerUser
    });

    await withActivityTimeout(
      user.send(messageOptions),
      5000,
      `Manual activity warning DM timed out for ${userId}.`
    );

    console.log(`[activity-report] Manual activity warning DM sent to ${userId}`);
    return true;
  } catch (error) {
    console.warn(`[activity-report] Manual activity warning DM failed for ${userId}:`, error.message || error);
    return false;
  }
}

function buildActivityReviewEmbed(finding, resolution = null) {
  const userId = getFindingUserId(finding);
  const findingId = getFindingId(finding);
  const inactiveStreak = getFindingInactiveStreak(finding);
  const rankName = finding.rankName || finding.rank_name || 'Unknown Rank';
  const totalSeconds = finding.totalSeconds ?? finding.total_seconds ?? 0;
  const activeRequired = finding.activeRequiredHours ?? finding.active_required_hours ?? 'N/A';
  const semiRequired = finding.semiActiveRequiredHours ?? finding.semi_active_required_hours ?? 'N/A';
  const reason = finding.commandReviewReason || finding.command_review_reason || 'Command review required.';
  const isResolved = Boolean(resolution);

  const embed = new EmbedBuilder()
    .setTitle(isResolved ? 'Activity Review Resolved' : 'Activity Command Review Required')
    .setColor(isResolved ? DUTY_EMBED_COLOR : 0xf1c40f)
    .setDescription(isResolved
      ? 'This activity finding has been marked reviewed by Command Staff.'
      : 'Review this inactive activity finding and choose a manual handoff outcome. These buttons do not automatically issue Strike 2, final warnings, demotions, removals, or terminations.')
    .addFields([
      { name: 'Officer', value: `<@${userId}>`, inline: true },
      { name: 'Rank', value: rankName, inline: true },
      { name: 'Inactive streak', value: String(inactiveStreak || 0), inline: true },
      { name: 'Hours', value: `${formatHours(totalSeconds)} total`, inline: true },
      { name: 'Requirement', value: `Active: ${activeRequired}h\nSemi-Active: ${semiRequired}h`, inline: true },
      { name: 'Finding ID', value: findingId || 'Unknown', inline: false },
      { name: 'Reason', value: truncateField(reason), inline: false }
    ])
    .setTimestamp(new Date());

  if (resolution) {
    embed.addFields([
      { name: 'Resolution', value: resolution.outcome === 'ignore' ? 'Ignored / no action' : 'Manual action recorded', inline: true },
      { name: 'Reviewed by', value: `<@${resolution.reviewedBy}>`, inline: true }
    ]);
  }

  return embed;
}

function buildActivityReviewButtons(findingId, inactiveStreak, disabled) {
  const manualLabel = Number(inactiveStreak) >= 3
    ? 'Proceed: Send Final Warning'
    : Number(inactiveStreak) === 2
      ? 'Proceed: Send Warning 2'
      : 'Mark Manual Action';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`duty_activity_review:manual:${findingId}`)
      .setLabel(manualLabel)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`duty_activity_review:ignore:${findingId}`)
      .setLabel('Ignore / No Action')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

function getFindingId(finding) {
  return finding.findingId || finding.finding_id || finding.autoStrikeReference || finding.auto_strike_reference;
}

function getFindingUserId(finding) {
  return finding.userId || finding.user_id;
}

function getFindingInactiveStreak(finding) {
  return finding.inactiveStreak ?? finding.inactive_streak ?? 0;
}

function getFindingTotalSeconds(finding) {
  return finding.totalSeconds ?? finding.total_seconds ?? 0;
}

function buildSimpleEmbed(title, description, color = DUTY_EMBED_COLOR) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(description)
    .setTimestamp(new Date());
}

async function handleActivityStatus(interaction) {
  const activityConfig = serverConfig?.duty?.activity || {};
  if (!activityConfig.enabled) return interaction.reply({ content: 'Activity reporting is not enabled for this server.', ephemeral: true });
  if (!memberCanUseActivity(interaction.member)) return interaction.reply({ content: 'You do not have permission to check activity status. Activity approver roles are not configured or you do not have one.', ephemeral: true });

  const cycleRange = getRequestedCycleRange(interaction, activityConfig);
  if (cycleRange.error) return interaction.reply({ content: cycleRange.error, ephemeral: true });

  const officer = interaction.options.getUser('officer', true);
  await interaction.deferReply({ ephemeral: true });

  const finding = await calculateOfficerActivity({
    guild: interaction.guild,
    guildId: interaction.guildId,
    userId: officer.id,
    cycleStart: cycleRange.cycleStart,
    cycleEnd: cycleRange.cycleEnd,
    config: serverConfig
  });

  await submitDutyGoogleEvent(interaction, 'ACTIVITY_STATUS_CHECK', { targetDiscordId: officer.id, cycleStart: cycleRange.cycleStart.toISOString(), cycleEnd: cycleRange.cycleEnd.toISOString(), activityStatus: finding.activityStatus });

  const embed = new EmbedBuilder()
    .setTitle('Duty Activity Status')
    .setColor(finding.activityStatus === 'ACTIVE' ? DUTY_EMBED_COLOR : finding.activityStatus === 'INACTIVE' ? ERROR_EMBED_COLOR : 0xf1c40f)
    .addFields([
      { name: 'Officer', value: `<@${officer.id}>`, inline: true },
      { name: 'Cycle', value: `${formatDateOnly(cycleRange.cycleStart)} through ${formatDateOnly(cycleRange.cycleEnd)}`, inline: false },
      { name: 'Rank', value: finding.rankName || 'Unknown / skipped', inline: true },
      { name: 'Status', value: formatActivityStatus(finding.activityStatus), inline: true },
      { name: 'Promotion eligible', value: finding.promotionEligible ? 'Yes' : 'No', inline: true },
      { name: 'Hours', value: `${formatHours(finding.totalSeconds)} total\n${formatHours(finding.adminSeconds)} admin\n${formatHours(finding.patrolSeconds)} patrol`, inline: true },
      { name: 'Requirement', value: `Active: ${finding.activeRequiredHours ?? 'N/A'}h\nSemi-Active: ${finding.semiActiveRequiredHours ?? 'N/A'}h`, inline: true },
      { name: 'LOA / exemption', value: finding.loaExempt ? `Yes — ${finding.exemptReason || 'Approved LOA'}` : (finding.exemptReason || 'No'), inline: false },
      { name: 'Notes', value: truncateField(finding.notes || 'None'), inline: false }
    ])
    .setTimestamp(new Date());

  return interaction.editReply({ embeds: [embed] });
}

function memberCanUseActivity(member) {
  const activityRoles = serverConfig?.duty?.activity?.approverRoleIds || [];
  const loaRoles = serverConfig?.duty?.loa?.approverRoleIds || [];
  const roleIds = activityRoles.length > 0 ? activityRoles : loaRoles;
  if (!roleIds.length) return false;
  return memberHasAnyRole(member, roleIds);
}

function getRequestedCycleRange(interaction, activityConfig) {
  const startText = interaction.options.getString('cycle-start');
  const endText = interaction.options.getString('cycle-end');
  if ((startText && !endText) || (!startText && endText)) {
    return { error: 'Please provide both cycle-start and cycle-end, or leave both blank to use the most recent completed cycle.' };
  }
  if (!startText && !endText) return getMostRecentCompletedCycle(activityConfig.cycleLengthDays || 14);
  const cycleStart = parseCycleDate(startText);
  const cycleEnd = parseCycleDate(endText);
  if (!cycleStart || !cycleEnd) return { error: 'Cycle dates must be valid and use YYYY-MM-DD format.' };
  if (cycleEnd < cycleStart) return { error: 'Cycle end cannot be before cycle start.' };
  return { cycleStart, cycleEnd };
}

function buildActivityReportGooglePayload(report, cycleRange, dryRun) {
  return {
    dryRun,
    cycleId: report.cycle.cycleId,
    cycleStart: formatDateOnly(cycleRange.cycleStart),
    cycleEnd: formatDateOnly(cycleRange.cycleEnd),
    summary: {
      totalOfficers: report.cycle.totalOfficers,
      loadedOfficerCount: report.cycle.loadedOfficerCount,
      activeCount: report.cycle.activeCount,
      semiActiveCount: report.cycle.semiActiveCount,
      inactiveCount: report.cycle.inactiveCount,
      loaCount: report.cycle.loaCount,
      exemptCount: report.cycle.exemptCount,
      recruitPendingCount: report.cycle.recruitPendingCount,
      errorCount: report.cycle.errorCount,
      timedOut: report.cycle.timedOut
    },
    findings: report.findings.map((finding) => ({
      targetDiscordId: finding.userId,
      rank: finding.rankName,
      activityStatus: finding.activityStatus,
      totalSeconds: finding.totalSeconds,
      totalHours: finding.totalHours,
      patrolHours: finding.patrolHours,
      adminHours: finding.adminHours,
      loaExempt: finding.loaExempt,
      exemptReason: finding.exemptReason,
      inactiveStreak: finding.inactiveStreak,
      disciplineAction: finding.disciplineAction,
      autoStrikeCreated: finding.autoStrikeCreated,
      autoStrikeLevel: finding.autoStrikeLevel,
      autoStrikeReference: finding.autoStrikeReference,
      notes: finding.notes
    }))
  };
}

async function handleModalSubmit(interaction) {
  if (interaction.customId.startsWith('duty_ridealong_feedback:')) return handleRideAlongFeedbackModalSubmit(interaction);
  if (interaction.customId.startsWith('duty_correction_modal:')) return handleCorrectionModalSubmit(interaction);
  if (interaction.customId !== 'duty_loa_request') return false;
  if (!serverConfig?.duty?.enabled) return interaction.reply({ content: 'Duty tracking is currently disabled for this server.', ephemeral: true }).then(() => true);
  const loaConfig = serverConfig?.duty?.loa || {};
  if (!loaConfig.enabled) return interaction.reply({ content: 'LOA requests are not enabled for this server.', ephemeral: true }).then(() => true);

  const startDateValue = interaction.fields.getTextInputValue('start_date').trim();
  const endDateValue = interaction.fields.getTextInputValue('end_date').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const comments = interaction.fields.getTextInputValue('comments')?.trim() || '';
  const startDate = parseDateInput(startDateValue);
  const endDate = parseDateInput(endDateValue);
  if (!startDate) return interaction.reply({ content: 'Start date must be valid and use YYYY-MM-DD.', ephemeral: true }).then(() => true);
  if (!endDate) return interaction.reply({ content: 'End date must be valid and use YYYY-MM-DD.', ephemeral: true }).then(() => true);
  if (endDate < startDate) return interaction.reply({ content: 'End date cannot be before start date.', ephemeral: true }).then(() => true);
  if (!reason) return interaction.reply({ content: 'Reason is required.', ephemeral: true }).then(() => true);

  const durationDays = calculateDurationDays(startDateValue, endDateValue);
  if (durationDays < (loaConfig.minDays || 7)) return interaction.reply({ content: `LOA requests must be at least ${loaConfig.minDays || 7} days.`, ephemeral: true }).then(() => true);

  await ensureDutyTables();
  const loa = await createLoaRequest({ guildId: interaction.guildId, userId: interaction.user.id, startDate: startDateValue, endDate: endDateValue, durationDays, reason, comments });
  const exceptionRequired = durationDays > (loaConfig.maxDaysWithoutCommandException || 60);
  const approvalChannel = await interaction.guild.channels.fetch(loaConfig.approvalChannelId).catch(() => null);
  if (!approvalChannel || typeof approvalChannel.send !== 'function') return interaction.reply({ content: 'The configured LOA approval channel could not be found.', ephemeral: true }).then(() => true);

  const message = await approvalChannel.send({ embeds: [buildLoaEmbed(loa, 'Pending', exceptionRequired)], components: [buildLoaButtons(loa.loa_id, false)] });
  await updateLoaApprovalMessage({ loaId: loa.loa_id, channelId: message.channel.id, messageId: message.id });
  await sendDutyLog({ guild: interaction.guild, serverConfig, title: 'LOA submitted', fields: loaLogFields(loa, interaction.user.id) });
  await submitDutyGoogleEvent(interaction, 'LOA_REQUEST_SUBMITTED', buildLoaGooglePayload(loa, {
    reviewedByDiscordId: interaction.user.id,
    loaStatus: 'pending'
  }));
  await interaction.reply({ content: `Your LOA request has been submitted for staff approval. LOA ID: ${loa.loa_id}`, ephemeral: true });
  return true;
}

async function handleButton(interaction) {
  if (interaction.customId.startsWith('duty_activity_review:')) return handleActivityReviewButton(interaction);
  if (interaction.customId.startsWith('duty_correction_approve:') || interaction.customId.startsWith('duty_correction_deny:')) return handleCorrectionButton(interaction);
  if (!interaction.customId.startsWith('duty_loa_approve:') && !interaction.customId.startsWith('duty_loa_deny:')) return false;
  const [action, loaId] = interaction.customId.split(':');
  const loaConfig = serverConfig?.duty?.loa || {};
  const approverRoleIds = loaConfig.approverRoleIds || [];
  if (!approverRoleIds.length) return interaction.reply({ content: 'LOA approver roles are not configured.', ephemeral: true }).then(() => true);
  if (!memberHasAnyRole(interaction.member, approverRoleIds)) return interaction.reply({ content: 'You do not have permission to review LOA requests.', ephemeral: true }).then(() => true);
  // TODO: Replace button-only review with a notes modal for approval/denial notes.

  await interaction.deferReply({ ephemeral: true });
  const existing = await getLoaRequestById(loaId);
  if (!existing) { await interaction.editReply('That LOA request could not be found.'); return true; }
  if (existing.status !== 'pending') { await interaction.editReply(`That LOA request is already ${existing.status}.`); return true; }

  const approved = action === 'duty_loa_approve';
  const loa = approved ? await approveLoaRequest({ loaId, reviewedBy: interaction.user.id }) : await denyLoaRequest({ loaId, reviewedBy: interaction.user.id });
  let roleMessage = 'No LOA role changes were made.';
  let roleError = null;
  if (approved) {
    const today = formatDateOnly(new Date());
    if (today >= formatDateOnly(loa.start_date) && today <= formatDateOnly(loa.end_date)) {
      try {
        const member = await interaction.guild.members.fetch(loa.user_id);
        if (loaConfig.loaRoleId && !member.roles.cache.has(loaConfig.loaRoleId)) {
          await member.roles.add(loaConfig.loaRoleId, `Approved active LOA ${loa.loa_id}`);
          await markLoaRoleAdded({ loaId });
          await updateLoaSyncStatus({ loaId, status: 'role_added_on_approval', error: null });
          roleMessage = 'The LOA role was applied now.';
          await sendDutyLog({ guild: interaction.guild, serverConfig, title: 'LOA role added immediately on approval', fields: loaLogFields(loa, interaction.user.id) });
        } else roleMessage = loaConfig.loaRoleId ? 'The officer already had the LOA role.' : 'LOA role is not configured.';
      } catch (error) { roleError = error.message || String(error); roleMessage = `The LOA was approved, but adding the LOA role failed: ${roleError}`; }
    } else if (today < formatDateOnly(loa.start_date)) {
      roleMessage = 'The LOA role will be applied automatically on the start date.';
      await sendDutyLog({ guild: interaction.guild, serverConfig, title: 'LOA role scheduled for future start', fields: loaLogFields(loa, interaction.user.id) });
    } else roleMessage = 'The approved LOA date range has already ended, so no role was added.';
  }

  await notifyLoaUser(interaction.client, loa, approved, roleMessage);
  await interaction.message.edit({ embeds: [buildLoaEmbed(loa, approved ? 'Approved' : 'Denied', loa.duration_days > (loaConfig.maxDaysWithoutCommandException || 60))], components: [buildLoaButtons(loa.loa_id, true)] }).catch(() => null);
  await sendDutyLog({ guild: interaction.guild, serverConfig, title: approved ? 'LOA approved' : 'LOA denied', fields: loaLogFields(loa, interaction.user.id) });
  await submitDutyGoogleEvent(interaction, approved ? 'LOA_APPROVED' : 'LOA_DENIED', buildLoaGooglePayload(loa, {
    reviewedByDiscordId: interaction.user.id,
    loaStatus: approved ? 'approved' : 'denied'
  }));
  await interaction.editReply(`${approved ? 'Approved' : 'Denied'} ${loa.loa_id}. ${roleMessage}`);
  return true;
}



function buildRideAlongFeedbackModal(probationaryUserId) {
  return new ModalBuilder().setCustomId(`duty_ridealong_feedback:${probationaryUserId}`).setTitle('Ride-Along Feedback').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rating').setLabel('Rating, 1-10').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('general_comments').setLabel('General comments').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('did_well').setLabel('What did they do well?').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('improve_on').setLabel('What could they improve on?').setStyle(TextInputStyle.Paragraph).setRequired(true))
  );
}

async function handleRideAlongFeedbackModalSubmit(interaction) {
  if (!serverConfig?.duty?.enabled) return interaction.reply({ content: 'Duty tracking is currently disabled for this server.', ephemeral: true }).then(() => true);
  const feedbackConfig = serverConfig?.duty?.rideAlongFeedback || {};
  if (!feedbackConfig.enabled) return interaction.reply({ content: 'Ride-along feedback is not enabled for this server.', ephemeral: true }).then(() => true);

  const [, probationaryUserId] = interaction.customId.split(':');
  if (!probationaryUserId || probationaryUserId === interaction.user.id) return interaction.reply({ content: 'You cannot submit ride-along feedback about yourself.', ephemeral: true }).then(() => true);

  const reviewerRank = getRankSafely(interaction.member);
  const minimumLevel = Number(feedbackConfig.minReviewerRankLevel || 2);
  const rankAllowed = Number(reviewerRank?.level || 0) >= minimumLevel;
  const roleAllowed = memberHasAnyRole(interaction.member, feedbackConfig.reviewerRoleIds || []);
  if (!rankAllowed && !roleAllowed) return interaction.reply({ content: 'You do not have permission to submit ride-along feedback.', ephemeral: true }).then(() => true);

  const probationaryMember = await interaction.guild.members.fetch(probationaryUserId).catch(() => null);
  if (!probationaryMember) return interaction.reply({ content: 'That officer could not be found in this server.', ephemeral: true }).then(() => true);
  const probationaryRoleIds = feedbackConfig.probationaryRoleIds || [];
  if (feedbackConfig.requireTargetProbationary && probationaryRoleIds.length > 0 && !memberHasAnyRole(probationaryMember, probationaryRoleIds)) {
    return interaction.reply({ content: 'That officer is not configured as a Probationary Officer for ride-along feedback.', ephemeral: true }).then(() => true);
  }

  const ratingValue = interaction.fields.getTextInputValue('rating').trim();
  const generalComments = interaction.fields.getTextInputValue('general_comments').trim();
  const didWell = interaction.fields.getTextInputValue('did_well').trim();
  const improveOn = interaction.fields.getTextInputValue('improve_on').trim();
  const rating = Number(ratingValue);

  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return interaction.reply({ content: 'Rating must be a whole number from 1 to 10.', ephemeral: true }).then(() => true);
  if (!generalComments || !didWell || !improveOn) return interaction.reply({ content: 'General comments, what they did well, and what they could improve on are required.', ephemeral: true }).then(() => true);

  await ensureDutyTables();
  const ridealongDate = formatDateOnly(new Date());
  const feedback = await createRideAlongFeedback({
    guildId: interaction.guildId,
    probationaryUserId,
    reviewerUserId: interaction.user.id,
    reviewerRankKey: reviewerRank?.rankRoleId || reviewerRank?.name || null,
    reviewerRankName: reviewerRank?.name || null,
    ridealongDate,
    rating,
    generalComments,
    didWell,
    improveOn
  });

  const embed = buildRideAlongFeedbackEmbed(feedback);
  await sendRideAlongFeedbackLog(interaction, embed);
  await sendDutyLog({ guild: interaction.guild, serverConfig, title: 'Ride-along feedback submitted', fields: rideAlongFeedbackLogFields(feedback) });
  await submitDutyGoogleEvent(interaction, 'RIDE_ALONG_FEEDBACK', { targetDiscordId: probationaryUserId, rating, generalComments, didWell, improveOn, ridealongDate });

  if (feedbackConfig.dmOfficerOnSubmit) {
    const officerUser = await interaction.client.users.fetch(probationaryUserId).catch(() => null);
    if (officerUser) await officerUser.send('Ride-along feedback has been submitted for you and will be reviewed by the training team.').catch(() => null);
  }

  await interaction.reply({ content: `Ride-along feedback submitted. Feedback ID: ${feedback.feedback_id}`, ephemeral: true });
  return true;
}

function buildRideAlongFeedbackEmbed(feedback) {
  return new EmbedBuilder()
    .setTitle('Probationary Ride-Along Feedback')
    .setColor(DUTY_EMBED_COLOR)
    .addFields([
      { name: 'Feedback ID', value: feedback.feedback_id, inline: true },
      { name: 'Probationary Officer', value: `<@${feedback.probationary_user_id}>`, inline: true },
      { name: 'Reviewing Officer', value: `<@${feedback.reviewer_user_id}>`, inline: true },
      { name: 'Reviewer Rank', value: feedback.reviewer_rank_name || 'Not detected', inline: true },
      { name: 'Ride-along Date', value: formatDateOnly(feedback.ridealong_date), inline: true },
      { name: 'Rating', value: `${feedback.rating}/10`, inline: true },
      { name: 'General Comments', value: truncateField(feedback.general_comments), inline: false },
      { name: 'What They Did Well', value: truncateField(feedback.did_well), inline: false },
      { name: 'What They Could Improve On', value: truncateField(feedback.improve_on), inline: false }
    ])
    .setTimestamp(new Date());
}

function rideAlongFeedbackLogFields(feedback) {
  return [
    { name: 'Feedback ID', value: feedback.feedback_id, inline: true },
    { name: 'Probationary Officer', value: `<@${feedback.probationary_user_id}>`, inline: true },
    { name: 'Reviewing Officer', value: `<@${feedback.reviewer_user_id}>`, inline: true },
    { name: 'Reviewer Rank', value: feedback.reviewer_rank_name || 'Not detected', inline: true },
    { name: 'Ride-along Date', value: formatDateOnly(feedback.ridealong_date), inline: true },
    { name: 'Rating', value: `${feedback.rating}/10`, inline: true }
  ];
}

async function sendRideAlongFeedbackLog(interaction, embed) {
  const logChannelId = serverConfig?.duty?.rideAlongFeedback?.feedbackChannelId
    || serverConfig?.logChannels?.trainingLogs
    || serverConfig?.logging?.staffLogChannelId;

  if (!logChannelId || logChannelId === 'PUT_STAFF_LOG_CHANNEL_ID_HERE') {
    console.warn('Ride-along feedback channel is not configured. Skipping ride-along feedback log.');
    return false;
  }

  try {
    const channel = interaction.guild.channels.cache.get(logChannelId)
      || await interaction.guild.channels.fetch(logChannelId);
    if (!channel || typeof channel.send !== 'function') return false;
    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.warn('Could not send ride-along feedback log:', error);
    return false;
  }
}

async function handleCorrectionModalSubmit(interaction) {
  const [, timecardId] = interaction.customId.split(':');
  if (!serverConfig?.duty?.enabled) return interaction.reply({ content: 'Duty tracking is currently disabled for this server.', ephemeral: true }).then(() => true);
  const correctionConfig = serverConfig?.duty?.corrections || {};
  if (!correctionConfig.enabled) return interaction.reply({ content: 'Timecard corrections are not enabled for this server.', ephemeral: true }).then(() => true);
  if (!correctionConfig.approvalChannelId) return interaction.reply({ content: 'The timecard correction approval channel has not been configured.', ephemeral: true }).then(() => true);

  const requestedClockInAt = parseDateTimeInput(interaction.fields.getTextInputValue('correct_clock_in').trim());
  const requestedClockOutAt = parseDateTimeInput(interaction.fields.getTextInputValue('correct_clock_out').trim());
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const notes = interaction.fields.getTextInputValue('notes')?.trim() || '';

  if (!requestedClockInAt) return interaction.reply({ content: 'Correct clock-in time must be valid and use YYYY-MM-DD HH:mm.', ephemeral: true }).then(() => true);
  if (!requestedClockOutAt) return interaction.reply({ content: 'Correct clock-out time must be valid and use YYYY-MM-DD HH:mm.', ephemeral: true }).then(() => true);
  const requestedDurationSeconds = calculateDurationSeconds(requestedClockInAt, requestedClockOutAt);
  if (requestedDurationSeconds <= 0) return interaction.reply({ content: 'Correct clock-out time must be after the corrected clock-in time.', ephemeral: true }).then(() => true);
  if (!reason) return interaction.reply({ content: 'Reason is required.', ephemeral: true }).then(() => true);

  await ensureDutyTables();
  const timecard = await getTimecardById(interaction.guildId, timecardId);
  if (!timecard || timecard.user_id !== interaction.user.id) return interaction.reply({ content: 'That completed timecard could not be found under your account in this server.', ephemeral: true }).then(() => true);

  const correction = await createTimecardCorrection({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    timecardId: timecard.timecard_id,
    originalClockInAt: timecard.clock_in_at,
    originalClockOutAt: timecard.clock_out_at,
    originalDurationSeconds: timecard.duration_seconds,
    requestedClockInAt,
    requestedClockOutAt,
    requestedDurationSeconds,
    reason,
    notes
  });

  const approvalChannel = await interaction.guild.channels.fetch(correctionConfig.approvalChannelId).catch(() => null);
  if (!approvalChannel || typeof approvalChannel.send !== 'function') return interaction.reply({ content: 'The configured timecard correction approval channel could not be found.', ephemeral: true }).then(() => true);

  const message = await approvalChannel.send({ embeds: [buildCorrectionEmbed(correction, 'Pending')], components: [buildCorrectionButtons(correction.correction_id, false)] });
  await updateCorrectionApprovalMessage({ correctionId: correction.correction_id, channelId: message.channel.id, messageId: message.id });
  await sendDutyLog({ guild: interaction.guild, serverConfig, title: 'Timecard correction submitted', fields: correctionLogFields(correction, interaction.user.id) });
  await submitDutyGoogleEvent(interaction, 'DUTY_TIMECARD_CORRECTION_SUBMITTED', { timecardId: timecard.timecard_id, correctionId: correction.correction_id, reason, notes });
  await interaction.reply({ content: `Your timecard correction request has been submitted for staff approval. Correction ID: ${correction.correction_id}`, ephemeral: true });
  return true;
}

async function handleCorrectionButton(interaction) {
  const [action, correctionId] = interaction.customId.split(':');
  const correctionConfig = serverConfig?.duty?.corrections || {};
  const approverRoleIds = correctionConfig.approverRoleIds || [];
  if (!approverRoleIds.length) return interaction.reply({ content: 'Timecard correction approver roles are not configured.', ephemeral: true }).then(() => true);
  if (!memberHasAnyRole(interaction.member, approverRoleIds)) {
    await sendDutyLog({ guild: interaction.guild, serverConfig, title: 'Timecard correction permission failure', fields: [{ name: 'Correction ID', value: correctionId, inline: true }, { name: 'Staff member', value: `<@${interaction.user.id}>`, inline: true }] });
    return interaction.reply({ content: 'You do not have permission to review timecard corrections.', ephemeral: true }).then(() => true);
  }
  // TODO: Replace button-only review with a notes modal for approval/denial review notes.

  await interaction.deferReply({ ephemeral: true });
  const existing = await getCorrectionById(correctionId);
  if (!existing) { await interaction.editReply('That timecard correction request could not be found.'); return true; }
  if (existing.status !== 'pending') { await interaction.editReply(`That timecard correction request is already ${existing.status}.`); return true; }

  const approved = action === 'duty_correction_approve';
  let correction = approved
    ? await approveTimecardCorrection({ correctionId, reviewedBy: interaction.user.id })
    : await denyTimecardCorrection({ correctionId, reviewedBy: interaction.user.id });

  if (approved) correction = await applyApprovedTimecardCorrection(correctionId);

  await notifyCorrectionUser(interaction.client, correction, approved);
  await interaction.message.edit({ embeds: [buildCorrectionEmbed(correction, approved ? 'Approved' : 'Denied')], components: [buildCorrectionButtons(correction.correction_id, true)] }).catch(() => null);
  await sendDutyLog({ guild: interaction.guild, serverConfig, title: approved ? 'Timecard correction approved' : 'Timecard correction denied', fields: correctionLogFields(correction, interaction.user.id) });
  await submitDutyGoogleEvent(interaction, approved ? 'DUTY_TIMECARD_CORRECTION_APPROVED' : 'DUTY_TIMECARD_CORRECTION_DENIED', {
    correctionId,
    timecardId: correction.timecard_id,
    targetDiscordId: correction.user_id,
    originalClockInAt: toIsoString(correction.original_clock_in_at),
    originalClockOutAt: toIsoString(correction.original_clock_out_at),
    originalDurationMinutes: Math.round((Number(correction.original_duration_seconds) || 0) / 60),
    requestedClockInAt: toIsoString(correction.requested_clock_in_at),
    requestedClockOutAt: toIsoString(correction.requested_clock_out_at),
    requestedDurationMinutes: Math.round((Number(correction.requested_duration_seconds) || 0) / 60),
    requestedDurationHours: Math.round(((Number(correction.requested_duration_seconds) || 0) / 3600) * 100) / 100,
    reason: correction.reason,
    notes: correction.notes || ''
  });
  await interaction.editReply(`${approved ? 'Approved' : 'Denied'} ${correction.correction_id}.`);
  return true;
}

function buildCorrectionModal(timecardId) {
  return new ModalBuilder().setCustomId(`duty_correction_modal:${timecardId}`).setTitle('Timecard Correction').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('correct_clock_in').setLabel('Correct clock-in (YYYY-MM-DD HH:mm)').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('correct_clock_out').setLabel('Correct clock-out (YYYY-MM-DD HH:mm)').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for correction').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Additional notes').setStyle(TextInputStyle.Paragraph).setRequired(false))
  );
}

function buildCorrectionEmbed(correction, status) {
  return new EmbedBuilder().setTitle(`Timecard Correction - ${status}`).setColor(status === 'Approved' ? DUTY_EMBED_COLOR : status === 'Denied' ? ERROR_EMBED_COLOR : 0xf1c40f).addFields([
    { name: 'Officer', value: `<@${correction.user_id}>`, inline: true },
    { name: 'Correction ID', value: correction.correction_id, inline: true },
    { name: 'Timecard ID', value: correction.timecard_id, inline: true },
    { name: 'Original clock-in', value: formatDateTimeForDisplay(correction.original_clock_in_at), inline: true },
    { name: 'Original clock-out', value: formatDateTimeForDisplay(correction.original_clock_out_at), inline: true },
    { name: 'Original duration', value: formatDuration(correction.original_duration_seconds), inline: true },
    { name: 'Requested clock-in', value: formatDateTimeForDisplay(correction.requested_clock_in_at), inline: true },
    { name: 'Requested clock-out', value: formatDateTimeForDisplay(correction.requested_clock_out_at), inline: true },
    { name: 'Requested duration', value: formatDuration(correction.requested_duration_seconds), inline: true },
    { name: 'Status', value: status, inline: true },
    { name: 'Reason', value: truncateField(correction.reason), inline: false },
    { name: 'Notes', value: truncateField(correction.notes || 'None'), inline: false }
  ]).setTimestamp(new Date());
}

function buildCorrectionButtons(correctionId, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`duty_correction_approve:${correctionId}`).setLabel('Approve').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`duty_correction_deny:${correctionId}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

function correctionLogFields(correction, staffUserId) {
  return [
    { name: 'Correction ID', value: correction.correction_id, inline: true },
    { name: 'Timecard ID', value: correction.timecard_id, inline: true },
    { name: 'Officer', value: `<@${correction.user_id}>`, inline: true },
    { name: 'Staff/trigger', value: staffUserId ? `<@${staffUserId}>` : 'System', inline: true },
    { name: 'Original', value: `${formatDateTimeForDisplay(correction.original_clock_in_at)} to ${formatDateTimeForDisplay(correction.original_clock_out_at)} (${formatDuration(correction.original_duration_seconds)})`, inline: false },
    { name: 'Requested', value: `${formatDateTimeForDisplay(correction.requested_clock_in_at)} to ${formatDateTimeForDisplay(correction.requested_clock_out_at)} (${formatDuration(correction.requested_duration_seconds)})`, inline: false },
    { name: 'Status', value: correction.status || 'pending', inline: true }
  ];
}

async function notifyCorrectionUser(client, correction, approved) {
  const user = await client.users.fetch(correction.user_id).catch(() => null);
  if (!user) return false;
  const content = approved
    ? `Your timecard correction request has been approved.\n\nCorrection ID: ${correction.correction_id}\nTimecard ID: ${correction.timecard_id}\nOriginal: ${formatDateTimeForDisplay(correction.original_clock_in_at)} to ${formatDateTimeForDisplay(correction.original_clock_out_at)}\nNew: ${formatDateTimeForDisplay(correction.requested_clock_in_at)} to ${formatDateTimeForDisplay(correction.requested_clock_out_at)}\nNew duration: ${formatDuration(correction.requested_duration_seconds)}`
    : `Your timecard correction request has been denied.\n\nCorrection ID: ${correction.correction_id}\nTimecard ID: ${correction.timecard_id}\n\nPlease contact Command Staff with questions.`;
  return user.send({ content }).then(() => true).catch(() => false);
}

function formatDateTimeForDisplay(value) {
  const unix = toUnix(value);
  return Number.isFinite(unix) ? `<t:${unix}:f>` : String(value || 'Unknown');
}

function buildLoaEmbed(loa, status, exceptionRequired) {
  return new EmbedBuilder().setTitle(`LOA Request - ${status}`).setColor(status === 'Approved' ? DUTY_EMBED_COLOR : status === 'Denied' ? ERROR_EMBED_COLOR : 0xf1c40f).addFields([
    { name: 'Officer', value: `<@${loa.user_id}>`, inline: true },
    { name: 'LOA ID', value: loa.loa_id, inline: true },
    { name: 'Status', value: status, inline: true },
    { name: 'Start date', value: formatDateOnly(loa.start_date), inline: true },
    { name: 'End date', value: formatDateOnly(loa.end_date), inline: true },
    { name: 'Duration', value: `${loa.duration_days} days`, inline: true },
    { name: 'Command exception required', value: exceptionRequired ? 'Yes' : 'No', inline: true },
    { name: 'Reason', value: truncateField(loa.reason), inline: false },
    { name: 'Comments', value: truncateField(loa.comments || 'None'), inline: false }
  ]).setTimestamp(new Date());
}

function buildLoaButtons(loaId, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`duty_loa_approve:${loaId}`).setLabel('Approve').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`duty_loa_deny:${loaId}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

function memberHasAnyRole(member, roleIds) {
  return roleIds.some((roleId) => member?.roles?.cache?.has(String(roleId)));
}

function loaLogFields(loa, staffUserId) {
  return [
    { name: 'LOA ID', value: loa.loa_id, inline: true },
    { name: 'Officer', value: `<@${loa.user_id}>`, inline: true },
    { name: 'Staff/trigger', value: staffUserId ? `<@${staffUserId}>` : 'System', inline: true },
    { name: 'Start date', value: formatDateOnly(loa.start_date), inline: true },
    { name: 'End date', value: formatDateOnly(loa.end_date), inline: true },
    { name: 'Status', value: loa.status || 'pending', inline: true }
  ];
}

function buildLoaGooglePayload(loa, extra = {}) {
  return {
    targetDiscordId: loa.user_id,
    loaId: loa.loa_id,
    startDate: formatDateOnly(loa.start_date),
    endDate: formatDateOnly(loa.end_date),
    durationDays: loa.duration_days,
    reason: loa.reason,
    comments: loa.comments || '',
    ...extra
  };
}

async function notifyLoaUser(client, loa, approved, roleMessage) {
  const user = await client.users.fetch(loa.user_id).catch(() => null);
  if (!user) return false;
  const content = approved
    ? `Your LOA request has been approved.\n\nLOA ID: ${loa.loa_id}\nStart date: ${formatDateOnly(loa.start_date)}\nEnd date: ${formatDateOnly(loa.end_date)}\nDuration: ${loa.duration_days} days\n${roleMessage}\n\nWhile on active approved LOA, your activity is exempt.`
    : `Your LOA request has been denied.\n\nLOA ID: ${loa.loa_id}\nStart date: ${formatDateOnly(loa.start_date)}\nEnd date: ${formatDateOnly(loa.end_date)}\n\nPlease contact Command Staff with questions.`;
  return user.send({ content }).then(() => true).catch(() => false);
}

function truncateField(value) {
  const text = String(value || 'None');
  return text.length > 1024 ? `${text.slice(0, 1021)}...` : text;
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

async function sendDutyTimecardLog(interaction, embed) {
  const logChannelId = serverConfig?.duty?.logChannelId
    || serverConfig?.logging?.staffLogChannelId;

  if (!logChannelId || logChannelId === 'PUT_STAFF_LOG_CHANNEL_ID_HERE') {
    console.warn('Duty log channel is not configured. Skipping duty clock-out log.');
    return false;
  }

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

function toIsoString(dateValue) {
  const date = new Date(dateValue);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
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

async function submitDutyGoogleEvent(interaction, actionType, payload = {}) {
  const submission = safeSubmitDepartmentEvent({
    actionType,
    interaction,
    actor: interaction.user,
    targetDiscordId: payload.targetDiscordId || interaction.user.id,
    targetName: payload.targetName || interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
    payload: { commandName: '/duty', ...payload }
  });
  submission.catch((error) => {
    console.warn(`Background Google duty event failed for ${actionType}:`, error);
  });
  return { ok: true, background: true };
}
