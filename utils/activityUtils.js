const { EmbedBuilder } = require('discord.js');
const { query } = require('./database');
const { getMemberRank } = require('./rankUtils');

const STATUS_LABELS = {
  ACTIVE: 'Active',
  SEMI_ACTIVE: 'Semi-Active',
  INACTIVE: 'Inactive',
  LOA: 'LOA',
  EXEMPT: 'Exempt',
  RECRUIT_TRAINING_PENDING: 'Recruit Training Pending',
  ERROR: 'Error/Skipped'
};

function formatDateOnly(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return date.toISOString().slice(0, 10);
}

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function createActivityCycleId(cycleStart, cycleEnd) {
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ACT-${formatDateOnly(cycleStart).replace(/-/g, '')}-${formatDateOnly(cycleEnd).replace(/-/g, '')}-${randomPart}`;
}

function createActivityFindingId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AF-${datePart}-${randomPart}`;
}

function parseCycleDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function getMostRecentCompletedCycle(cycleLengthDays = 14) {
  const length = Math.max(1, Number(cycleLengthDays) || 14);
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - length + 1);
  return { cycleStart: start, cycleEnd: end };
}

async function getDepartmentMembersForActivity(guild, config, deadline = Date.now() + 10000) {
  const activityConfig = config?.duty?.activity || {};
  const includeRoleIds = activityConfig.includeRoleIds || [];
  const excludeRoleIds = activityConfig.excludeRoleIds || [];
  const membersById = new Map();

  if (!includeRoleIds.length) {
    throw new Error('Activity includeRoleIds is not configured. Add a department/test role before running the report.');
  }

  for (const roleId of includeRoleIds) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      console.warn('[activity-report] member loading timed out before all include roles were checked');
      break;
    }

    const role = await withActivityTimeout(
      guild.roles.fetch(roleId),
      remainingMs,
      `Include role ${roleId} fetch timed out.`
    ).catch((error) => {
      console.warn(`[activity-report] include role ${roleId} could not be fetched:`, error.message || error);
      return null;
    });
    if (!role) continue;

    for (const member of role.members.values()) {
      membersById.set(member.id, member);
    }
  }

  return Array.from(membersById.values()).filter((member) => {
    if (member.user.bot) return false;
    const roleIds = member.roles.cache.map((role) => role.id);
    if (excludeRoleIds.some((roleId) => roleIds.includes(roleId))) return false;
    return includeRoleIds.some((roleId) => roleIds.includes(roleId));
  });
}

function withActivityTimeout(promise, timeoutMs, message) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const error = new Error(message);
      error.code = 'ACTIVITY_TIMEOUT';
      reject(error);
    }, Math.max(1, timeoutMs));
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
}

function getRankRequirementForMember(member, config) {
  if (!member) return { rank: null, requirement: null };
  const rank = getMemberRank(member, config);
  if (!rank) return { rank: null, requirement: null };
  const requirements = config?.duty?.activity?.rankRequirements || [];
  const requirement = requirements.find((item) => {
    if (Array.isArray(item.ranks)) return item.ranks.some((name) => name.toLowerCase() === rank.name.toLowerCase());
    return item.rank && item.rank.toLowerCase() === rank.name.toLowerCase();
  });
  return { rank, requirement: requirement || null };
}

async function getTimecardsForUserInCycle(guildId, userId, cycleStart, cycleEnd) {
  const start = `${formatDateOnly(cycleStart)} 00:00:00`;
  const end = `${formatDateOnly(cycleEnd)} 23:59:59`;
  return query(
    `SELECT * FROM duty_timecards
     WHERE guild_id = ? AND user_id = ? AND status = 'completed'
       AND clock_out_at >= ? AND clock_out_at <= ?
     ORDER BY clock_out_at ASC`,
    [guildId, userId, start, end]
  );
}

async function getApprovedLoaOverlappingCycle(guildId, userId, cycleStart, cycleEnd) {
  const rows = await query(
    `SELECT * FROM duty_loa_requests
     WHERE guild_id = ? AND user_id = ? AND status = 'approved'
       AND start_date <= ? AND end_date >= ?
     ORDER BY end_date DESC LIMIT 1`,
    [guildId, userId, formatDateOnly(cycleEnd), formatDateOnly(cycleStart)]
  );
  return rows[0] || null;
}

async function calculateInactiveStreak(guildId, userId) {
  const rows = await query(
    `SELECT finding.activity_status
     FROM duty_activity_findings finding
     INNER JOIN duty_activity_cycles cycle ON cycle.cycle_id = finding.cycle_id
     WHERE finding.guild_id = ? AND finding.user_id = ? AND cycle.dry_run = FALSE
     ORDER BY cycle.cycle_end DESC, finding.id DESC LIMIT 25`,
    [guildId, userId]
  );
  let streak = 0;
  for (const row of rows) {
    if (row.activity_status === 'INACTIVE') streak += 1;
    else if (['ACTIVE', 'SEMI_ACTIVE', 'LOA', 'EXEMPT', 'RECRUIT_TRAINING_PENDING'].includes(row.activity_status)) break;
  }
  return streak;
}

function getDutyTypeConfig(dutyTypeKey, config) {
  return (config?.duty?.dutyTypes || []).find((type) => type.key === dutyTypeKey) || null;
}

async function calculateOfficerActivity({ guild, guildId, userId, cycleStart, cycleEnd, config }) {
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  const { rank, requirement } = getRankRequirementForMember(member, config);
  if (!member || !rank || !requirement) {
    return buildFindingBase({ guildId, userId, rank, requirement, status: 'ERROR', promotionEligible: false, exemptReason: 'No matching rank requirement configured.', notes: 'Skipped because no rank requirement was found.' });
  }

  const loa = await getApprovedLoaOverlappingCycle(guildId, userId, cycleStart, cycleEnd);
  const loaExempt = Boolean(loa && config?.duty?.activity?.loaExemptsFromActivity !== false);
  if (loaExempt) {
    // TODO: Add partial-cycle LOA proration if the department wants partial overlap to reduce instead of exempt the full cycle.
    return buildFindingBase({ guildId, userId, rank, requirement, status: 'LOA', promotionEligible: false, loaExempt: true, exemptReason: `Approved LOA ${loa.loa_id} overlaps this cycle.` });
  }

  if (requirement.exempt) {
    return buildFindingBase({ guildId, userId, rank, requirement, status: 'EXEMPT', promotionEligible: requirement.promotionEligibleWhenExempt !== false, exemptReason: requirement.group || 'Rank is exempt by policy.' });
  }

  if (requirement.trainingRequiredWithinDays) {
    // TODO: Integrate with a future training records system before calculating recruit/cadet deadlines.
    return buildFindingBase({ guildId, userId, rank, requirement, status: 'RECRUIT_TRAINING_PENDING', promotionEligible: false, exemptReason: 'Training requirement is tracked separately.' });
  }

  const timecards = await getTimecardsForUserInCycle(guildId, userId, cycleStart, cycleEnd);
  let totalSeconds = 0;
  let adminSeconds = 0;
  let patrolSeconds = 0;

  for (const timecard of timecards) {
    const dutyType = getDutyTypeConfig(timecard.duty_type, config);
    if (dutyType && dutyType.countsTowardActivity === false) continue;
    const seconds = Number(timecard.duration_seconds) || 0;
    totalSeconds += seconds;
    if (dutyType?.countsAsAdmin) adminSeconds += seconds;
    else patrolSeconds += seconds;
  }

  const totalHours = totalSeconds / 3600;
  const activeHours = Number(requirement.activeHours) || 0;
  const semiActiveHours = Number(requirement.semiActiveHours) || 0;
  let status = 'INACTIVE';
  let promotionEligible = false;
  if (totalHours >= activeHours) {
    status = 'ACTIVE';
    promotionEligible = true;
  } else if (totalHours >= semiActiveHours) {
    status = 'SEMI_ACTIVE';
    promotionEligible = false;
  }

  const notes = requirement.requiresAdminHoursPercentage
    ? `Admin hours target: ${requirement.requiresAdminHoursPercentage}%. Actual: ${totalSeconds > 0 ? Math.round((adminSeconds / totalSeconds) * 100) : 0}%. TODO: Add future command review rule for admin percentage failures.`
    : null;

  return buildFindingBase({ guildId, userId, rank, requirement, status, promotionEligible, totalSeconds, adminSeconds, patrolSeconds, notes });
}

function buildFindingBase({ guildId, userId, rank, requirement, status, promotionEligible, totalSeconds = 0, adminSeconds = 0, patrolSeconds = 0, loaExempt = false, exemptReason = null, notes = null }) {
  return {
    guildId,
    userId,
    rankKey: rank?.name || null,
    rankName: rank?.name || null,
    activeRequiredHours: requirement?.activeHours ?? null,
    semiActiveRequiredHours: requirement?.semiActiveHours ?? null,
    totalSeconds,
    adminSeconds,
    patrolSeconds,
    totalHours: Number((totalSeconds / 3600).toFixed(2)),
    adminHours: Number((adminSeconds / 3600).toFixed(2)),
    patrolHours: Number((patrolSeconds / 3600).toFixed(2)),
    activityStatus: status,
    promotionEligible,
    loaExempt,
    exemptReason,
    inactiveStreak: 0,
    disciplineAction: null,
    commandReviewRequired: false,
    commandReviewReason: null,
    autoStrikeCreated: false,
    autoStrikeLevel: null,
    autoStrikeReference: null,
    notes
  };
}

async function saveActivityCycle(cycleData) {
  await query(
    `INSERT INTO duty_activity_cycles
      (cycle_id, guild_id, cycle_start, cycle_end, status, generated_by, dry_run, total_officers, active_count, semi_active_count, inactive_count, loa_count, exempt_count, recruit_pending_count, error_count, report_message_id, report_channel_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), total_officers = VALUES(total_officers), active_count = VALUES(active_count), semi_active_count = VALUES(semi_active_count), inactive_count = VALUES(inactive_count), loa_count = VALUES(loa_count), exempt_count = VALUES(exempt_count), recruit_pending_count = VALUES(recruit_pending_count), error_count = VALUES(error_count), report_message_id = VALUES(report_message_id), report_channel_id = VALUES(report_channel_id)`,
    [cycleData.cycleId, cycleData.guildId, formatDateOnly(cycleData.cycleStart), formatDateOnly(cycleData.cycleEnd), cycleData.status || 'generated', cycleData.generatedBy || null, Boolean(cycleData.dryRun), cycleData.totalOfficers || 0, cycleData.activeCount || 0, cycleData.semiActiveCount || 0, cycleData.inactiveCount || 0, cycleData.loaCount || 0, cycleData.exemptCount || 0, cycleData.recruitPendingCount || 0, cycleData.errorCount || 0, cycleData.reportMessageId || null, cycleData.reportChannelId || null]
  );
}

async function saveActivityFinding(findingData) {
  const findingId = findingData.findingId || createActivityFindingId();
  await query(
    `INSERT INTO duty_activity_findings
      (finding_id, cycle_id, guild_id, user_id, rank_key, rank_name, active_required_hours, semi_active_required_hours, total_seconds, admin_seconds, patrol_seconds, total_hours, admin_hours, patrol_hours, activity_status, promotion_eligible, loa_exempt, exempt_reason, inactive_streak, discipline_action, command_review_required, command_review_reason, auto_strike_created, auto_strike_level, auto_strike_reference, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE rank_key = VALUES(rank_key), rank_name = VALUES(rank_name), total_seconds = VALUES(total_seconds), admin_seconds = VALUES(admin_seconds), patrol_seconds = VALUES(patrol_seconds), total_hours = VALUES(total_hours), admin_hours = VALUES(admin_hours), patrol_hours = VALUES(patrol_hours), activity_status = VALUES(activity_status), promotion_eligible = VALUES(promotion_eligible), loa_exempt = VALUES(loa_exempt), exempt_reason = VALUES(exempt_reason), inactive_streak = VALUES(inactive_streak), discipline_action = VALUES(discipline_action), command_review_required = VALUES(command_review_required), command_review_reason = VALUES(command_review_reason), auto_strike_created = VALUES(auto_strike_created), auto_strike_level = VALUES(auto_strike_level), auto_strike_reference = VALUES(auto_strike_reference), notes = VALUES(notes)`,
    [findingId, findingData.cycleId, findingData.guildId, findingData.userId, findingData.rankKey, findingData.rankName, findingData.activeRequiredHours, findingData.semiActiveRequiredHours, findingData.totalSeconds, findingData.adminSeconds, findingData.patrolSeconds, findingData.totalHours, findingData.adminHours, findingData.patrolHours, findingData.activityStatus, Boolean(findingData.promotionEligible), Boolean(findingData.loaExempt), findingData.exemptReason, findingData.inactiveStreak || 0, findingData.disciplineAction, Boolean(findingData.commandReviewRequired), findingData.commandReviewReason, Boolean(findingData.autoStrikeCreated), findingData.autoStrikeLevel, findingData.autoStrikeReference, findingData.notes]
  );
  return findingId;
}

async function getActivityFindingById(findingId) {
  const rows = await query(
    `SELECT finding.*, cycle.cycle_start, cycle.cycle_end
     FROM duty_activity_findings finding
     LEFT JOIN duty_activity_cycles cycle ON cycle.cycle_id = finding.cycle_id
     WHERE finding.finding_id = ? LIMIT 1`,
    [findingId]
  );
  return rows[0] || null;
}

async function resolveActivityFindingReview({ findingId, outcome, reviewedBy }) {
  const finding = await getActivityFindingById(findingId);
  if (!finding) return null;

  const action = outcome === 'ignore'
    ? 'COMMAND_REVIEW_IGNORED'
    : 'MANUAL_COMMAND_ACTION_RECORDED';
  const reason = outcome === 'ignore'
    ? `Command review closed with no action by ${reviewedBy}.`
    : `Command review marked as manually handled by ${reviewedBy}. No automatic escalation was issued by the bot.`;

  await query(
    `UPDATE duty_activity_findings
     SET command_review_required = FALSE,
         discipline_action = ?,
         command_review_reason = ?,
         notes = CONCAT(COALESCE(notes, ''), CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE '\n' END, ?)
     WHERE finding_id = ?`,
    [action, reason, reason, findingId]
  );

  return {
    ...finding,
    discipline_action: action,
    command_review_required: false,
    command_review_reason: reason
  };
}

function applyDisciplinePolicy(finding, { config, dryRun }) {
  if (finding.activityStatus !== 'INACTIVE') return finding;
  const discipline = config?.duty?.activity?.discipline || {};
  const streak = Number(finding.inactiveStreak) || 1;
  if (streak === 1 && discipline.autoStrike1Enabled && !dryRun) {
    // TODO: Integrate with officer-management strike roles/DM/logging if a clear reusable strike helper is added.
    finding.disciplineAction = 'AUTO_ACTIVITY_STRIKE_1';
    finding.autoStrikeCreated = true;
    finding.autoStrikeLevel = 1;
  } else {
    finding.commandReviewRequired = true;
    finding.commandReviewReason = streak >= (discipline.terminationReviewAfterInactiveCycles || 3)
      ? 'Third inactive cycle. Command Staff termination/removal review required; no automatic removal was taken.'
      : streak >= (discipline.commandReviewAfterInactiveCycles || 2)
        ? 'Second inactive cycle. Command Staff review required; no automatic escalation was taken.'
        : 'First inactive cycle. Activity Strike 1 automation is disabled or this is a dry run.';
  }
  return finding;
}

function createErrorFinding({ guildId, userId, cycleId, message }) {
  return {
    ...buildFindingBase({
      guildId,
      userId,
      rank: null,
      requirement: null,
      status: 'ERROR',
      promotionEligible: false,
      exemptReason: 'Officer calculation failed.',
      notes: message ? `Skipped because calculation failed: ${message}` : 'Skipped because calculation failed.'
    }),
    cycleId,
    findingId: createActivityFindingId()
  };
}

async function generateActivityReport({ guild, cycleStart, cycleEnd, dryRun = true, triggeredBy, config, timeoutMs = 25000 }) {
  const startedAt = Date.now();
  const deadline = startedAt + Math.max(1000, Number(timeoutMs) || 25000);
  const cycleId = createActivityCycleId(cycleStart, cycleEnd);
  const members = await getDepartmentMembersForActivity(guild, config, deadline);
  console.log('[activity-report] department members loaded', { count: members.length });
  const findings = [];
  let timedOut = false;

  console.log('[activity-report] officer calculations started');
  for (const member of members) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      timedOut = true;
      console.warn('[activity-report] safety timeout reached before all officers were processed');
      break;
    }

    try {
      let finding = await withActivityTimeout(
        calculateOfficerActivity({ guild, guildId: guild.id, userId: member.id, cycleStart, cycleEnd, config }),
        remainingMs,
        `Officer calculation timed out for ${member.id}.`
      );
      if (finding.activityStatus === 'INACTIVE') {
        const streakRemainingMs = deadline - Date.now();
        if (streakRemainingMs <= 0) {
          const timeoutError = new Error(`Inactive streak lookup timed out for ${member.id}.`);
          timeoutError.code = 'ACTIVITY_TIMEOUT';
          throw timeoutError;
        }
        finding.inactiveStreak = (await withActivityTimeout(
          calculateInactiveStreak(guild.id, member.id),
          streakRemainingMs,
          `Inactive streak lookup timed out for ${member.id}.`
        )) + 1;
      }
      finding = applyDisciplinePolicy(finding, { config, dryRun });
      finding.cycleId = cycleId;
      finding.findingId = createActivityFindingId();
      if (finding.autoStrikeCreated) finding.autoStrikeReference = finding.findingId;
      findings.push(finding);
    } catch (error) {
      console.error(`[activity-report] officer calculation failed for ${member.id}:`, error.message || error);
      findings.push(createErrorFinding({
        guildId: guild.id,
        userId: member.id,
        cycleId,
        message: error.message || 'Unknown error'
      }));
      if (error.code === 'ACTIVITY_TIMEOUT') {
        timedOut = true;
        break;
      }
    }
  }
  console.log('[activity-report] officer calculations completed', {
    processed: findings.length,
    loaded: members.length,
    timedOut
  });

  const summary = {
    cycleId,
    guildId: guild.id,
    cycleStart,
    cycleEnd,
    dryRun,
    generatedBy: triggeredBy?.id,
    totalOfficers: findings.length,
    loadedOfficerCount: members.length,
    timedOut,
    activeCount: findings.filter((f) => f.activityStatus === 'ACTIVE').length,
    semiActiveCount: findings.filter((f) => f.activityStatus === 'SEMI_ACTIVE').length,
    inactiveCount: findings.filter((f) => f.activityStatus === 'INACTIVE').length,
    loaCount: findings.filter((f) => f.activityStatus === 'LOA').length,
    exemptCount: findings.filter((f) => f.activityStatus === 'EXEMPT').length,
    recruitPendingCount: findings.filter((f) => f.activityStatus === 'RECRUIT_TRAINING_PENDING').length,
    errorCount: findings.filter((f) => f.activityStatus === 'ERROR').length
  };

  console.log('[activity-report] database save started', { dryRun });
  if (!dryRun) {
    for (const finding of findings) {
      const saveRemainingMs = deadline - Date.now();
      if (saveRemainingMs <= 0) {
        timedOut = true;
        console.warn('[activity-report] safety timeout reached before all findings were saved');
        break;
      }
      try {
        await withActivityTimeout(
          saveActivityFinding(finding),
          saveRemainingMs,
          `Activity finding save timed out for ${finding.userId}.`
        );
      } catch (error) {
        console.error(`[activity-report] finding save failed for ${finding.userId}:`, error.message || error);
        if (error.code === 'ACTIVITY_TIMEOUT') {
          timedOut = true;
          break;
        }
      }
    }
    const cycleSaveRemainingMs = deadline - Date.now();
    if (cycleSaveRemainingMs > 0) {
      try {
        await withActivityTimeout(
          saveActivityCycle(summary),
          cycleSaveRemainingMs,
          'Activity cycle save timed out.'
        );
      } catch (error) {
        console.error('[activity-report] cycle save failed:', error.message || error);
        if (error.code === 'ACTIVITY_TIMEOUT') timedOut = true;
      }
    } else {
      timedOut = true;
      console.warn('[activity-report] safety timeout reached before the cycle summary was saved');
    }
  }
  summary.timedOut = timedOut;
  console.log('[activity-report] database save completed', { dryRun, saved: !dryRun });

  return { cycle: summary, findings, embed: buildActivityReportEmbed({ summary, findings }) };
}

function buildActivityReportEmbed({ summary, findings }) {
  const detailFindings = findings.filter((f) => ['INACTIVE', 'SEMI_ACTIVE', 'ERROR'].includes(f.activityStatus)).slice(0, 20);
  const lines = detailFindings.map((f) => `• <@${f.userId}> — ${f.rankName || 'Unknown Rank'} — ${formatHours(f.totalSeconds)} / ${f.activeRequiredHours ?? 'N/A'}h — ${formatActivityStatus(f.activityStatus)} — Streak ${f.inactiveStreak || 0}${f.disciplineAction ? ` — ${f.disciplineAction}` : f.commandReviewRequired ? ' — Command review' : ''}`);
  if (findings.length > detailFindings.length) lines.push(`More details are ${summary.dryRun ? 'included in this dry-run calculation' : 'stored in the database'}. Showing first ${detailFindings.length} relevant findings.`);
  if (summary.timedOut) lines.unshift('Safety timeout reached. This is a partial report.');

  return new EmbedBuilder()
    .setTitle('Duty Activity Cycle Report')
    .setColor(summary.dryRun ? 0xf1c40f : 0x2ecc71)
    .addFields(
      { name: 'Cycle', value: `${formatDateOnly(summary.cycleStart)} through ${formatDateOnly(summary.cycleEnd)}`, inline: false },
      { name: 'Mode', value: summary.dryRun ? 'Dry run' : 'Live', inline: true },
      { name: 'Checked', value: summary.loadedOfficerCount && summary.loadedOfficerCount !== summary.totalOfficers ? `${summary.totalOfficers} of ${summary.loadedOfficerCount}` : String(summary.totalOfficers), inline: true },
      { name: 'Counts', value: `Active: ${summary.activeCount}\nSemi-Active: ${summary.semiActiveCount}\nInactive: ${summary.inactiveCount}\nLOA: ${summary.loaCount}\nExempt: ${summary.exemptCount}\nRecruit/Training Pending: ${summary.recruitPendingCount}\nErrors/Skipped: ${summary.errorCount}`, inline: false },
      { name: 'Inactive / Semi-Active / Errors', value: lines.join('\n').slice(0, 3900) || 'None', inline: false }
    )
    .setTimestamp();
}

function formatHours(seconds) {
  return `${((Number(seconds) || 0) / 3600).toFixed(2)}h`;
}

function formatActivityStatus(status) {
  return STATUS_LABELS[status] || status || 'Unknown';
}

module.exports = {
  createActivityCycleId,
  createActivityFindingId,
  getMostRecentCompletedCycle,
  parseCycleDate,
  getDepartmentMembersForActivity,
  calculateOfficerActivity,
  getTimecardsForUserInCycle,
  getApprovedLoaOverlappingCycle,
  getRankRequirementForMember,
  calculateInactiveStreak,
  saveActivityCycle,
  saveActivityFinding,
  getActivityFindingById,
  resolveActivityFindingReview,
  generateActivityReport,
  formatHours,
  formatActivityStatus,
  formatDateOnly,
  buildActivityReportEmbed
};
