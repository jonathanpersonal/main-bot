const { ensureDutyTables, query } = require('./database');

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function getActiveDutySession(guildId, userId) {
  const rows = await query(
    'SELECT * FROM duty_sessions WHERE guild_id = ? AND user_id = ? LIMIT 1',
    [guildId, userId]
  );

  return rows[0] || null;
}

async function clockInUser({ guildId, userId, dutyType, rankKey, rankName, clockInAt }) {
  await query(
    `INSERT INTO duty_sessions
      (guild_id, user_id, duty_type, rank_key, rank_name, clock_in_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [guildId, userId, dutyType, rankKey || null, rankName || null, toMysqlDateTime(clockInAt)]
  );
}

async function clockOutUser({ guildId, userId, clockOutAt }) {
  const session = await getActiveDutySession(guildId, userId);

  if (!session) {
    return null;
  }

  const clockInAt = new Date(session.clock_in_at);
  const durationSeconds = Math.max(0, Math.floor((clockOutAt.getTime() - clockInAt.getTime()) / 1000));
  const timecard = await insertTimecardWithRetry({
    guildId,
    userId,
    dutyType: session.duty_type,
    rankKey: session.rank_key,
    rankName: session.rank_name,
    clockInAt,
    clockOutAt,
    durationSeconds
  });

  await query('DELETE FROM duty_sessions WHERE guild_id = ? AND user_id = ?', [guildId, userId]);

  return {
    ...timecard,
    session
  };
}

async function insertTimecardWithRetry(timecardDetails) {
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const timecardId = createTimecardId();

    try {
      await query(
        `INSERT INTO duty_timecards
          (timecard_id, guild_id, user_id, duty_type, rank_key, rank_name, clock_in_at, clock_out_at, duration_seconds, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
        [
          timecardId,
          timecardDetails.guildId,
          timecardDetails.userId,
          timecardDetails.dutyType,
          timecardDetails.rankKey || null,
          timecardDetails.rankName || null,
          toMysqlDateTime(timecardDetails.clockInAt),
          toMysqlDateTime(timecardDetails.clockOutAt),
          timecardDetails.durationSeconds
        ]
      );

      return {
        timecardId,
        ...timecardDetails,
        status: 'completed'
      };
    } catch (error) {
      lastError = error;
      if (error.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
    }
  }

  throw lastError;
}

function createTimecardId() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TC-${datePart}-${randomPart}`;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

  return parts.join(' ');
}

async function getRecentTimecards(guildId, userId, limit = 10) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 25));

  return query(
    `SELECT * FROM duty_timecards
     WHERE guild_id = ? AND user_id = ? AND status = 'completed'
     ORDER BY clock_out_at DESC
     LIMIT ${safeLimit}`,
    [guildId, userId]
  );
}


function createCorrectionId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `COR-${datePart}-${randomPart}`;
}

async function getTimecardById(guildId, timecardId) {
  const rows = await query(
    "SELECT * FROM duty_timecards WHERE guild_id = ? AND timecard_id = ? AND status = 'completed' LIMIT 1",
    [guildId, timecardId]
  );
  return rows[0] || null;
}

async function createTimecardCorrection({ guildId, userId, timecardId, originalClockInAt, originalClockOutAt, originalDurationSeconds, requestedClockInAt, requestedClockOutAt, requestedDurationSeconds, reason, notes }) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const correctionId = createCorrectionId();
    try {
      await query(
        `INSERT INTO duty_timecard_corrections
          (correction_id, guild_id, user_id, timecard_id, original_clock_in_at, original_clock_out_at, original_duration_seconds, requested_clock_in_at, requested_clock_out_at, requested_duration_seconds, reason, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [correctionId, guildId, userId, timecardId, toMysqlDateTime(new Date(originalClockInAt)), toMysqlDateTime(new Date(originalClockOutAt)), originalDurationSeconds, toMysqlDateTime(requestedClockInAt), toMysqlDateTime(requestedClockOutAt), requestedDurationSeconds, reason, notes || null]
      );
      return getCorrectionById(correctionId);
    } catch (error) {
      lastError = error;
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw lastError;
}

async function getCorrectionById(correctionId) {
  const rows = await query('SELECT * FROM duty_timecard_corrections WHERE correction_id = ? LIMIT 1', [correctionId]);
  return rows[0] || null;
}

async function updateCorrectionApprovalMessage({ correctionId, channelId, messageId }) {
  await query('UPDATE duty_timecard_corrections SET approval_channel_id = ?, approval_message_id = ? WHERE correction_id = ?', [channelId, messageId, correctionId]);
}

async function approveTimecardCorrection({ correctionId, reviewedBy, reviewNotes }) {
  await query("UPDATE duty_timecard_corrections SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE correction_id = ?", [reviewedBy, reviewNotes || null, correctionId]);
  return getCorrectionById(correctionId);
}

async function denyTimecardCorrection({ correctionId, reviewedBy, reviewNotes }) {
  await query("UPDATE duty_timecard_corrections SET status = 'denied', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE correction_id = ?", [reviewedBy, reviewNotes || null, correctionId]);
  return getCorrectionById(correctionId);
}

async function applyApprovedTimecardCorrection(correctionId) {
  const correction = await getCorrectionById(correctionId);
  if (!correction || correction.status !== 'approved') return correction;

  await query(
    `UPDATE duty_timecards
     SET clock_in_at = ?, clock_out_at = ?, duration_seconds = ?, updated_at = NOW()
     WHERE guild_id = ? AND timecard_id = ? AND user_id = ?`,
    [
      toMysqlDateTime(new Date(correction.requested_clock_in_at)),
      toMysqlDateTime(new Date(correction.requested_clock_out_at)),
      correction.requested_duration_seconds,
      correction.guild_id,
      correction.timecard_id,
      correction.user_id
    ]
  );

  return getCorrectionById(correctionId);
}

function parseDateTimeInput(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return null;
  const [datePart, timePart] = text.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date;
}

function calculateDurationSeconds(clockInAt, clockOutAt) {
  const start = clockInAt instanceof Date ? clockInAt : new Date(clockInAt);
  const end = clockOutAt instanceof Date ? clockOutAt : new Date(clockOutAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.floor((end.getTime() - start.getTime()) / 1000);
}

function createLoaId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LOA-${datePart}-${randomPart}`;
}

async function createLoaRequest({ guildId, userId, startDate, endDate, durationDays, reason, comments }) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const loaId = createLoaId();
    try {
      await query(
        `INSERT INTO duty_loa_requests
          (loa_id, guild_id, user_id, start_date, end_date, duration_days, reason, comments, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [loaId, guildId, userId, startDate, endDate, durationDays, reason, comments || null]
      );
      return getLoaRequestById(loaId);
    } catch (error) {
      lastError = error;
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw lastError;
}

async function getLoaRequestById(loaId) {
  const rows = await query('SELECT * FROM duty_loa_requests WHERE loa_id = ? LIMIT 1', [loaId]);
  return rows[0] || null;
}

async function updateLoaApprovalMessage({ loaId, channelId, messageId }) {
  await query('UPDATE duty_loa_requests SET approval_channel_id = ?, approval_message_id = ? WHERE loa_id = ?', [channelId, messageId, loaId]);
}

async function approveLoaRequest({ loaId, reviewedBy, reviewNotes }) {
  await query("UPDATE duty_loa_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE loa_id = ?", [reviewedBy, reviewNotes || null, loaId]);
  return getLoaRequestById(loaId);
}

async function denyLoaRequest({ loaId, reviewedBy, reviewNotes }) {
  await query("UPDATE duty_loa_requests SET status = 'denied', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE loa_id = ?", [reviewedBy, reviewNotes || null, loaId]);
  return getLoaRequestById(loaId);
}

async function getActiveApprovedLoa(guildId, userId) {
  const today = formatDateOnly(new Date());
  const rows = await query(
    "SELECT * FROM duty_loa_requests WHERE guild_id = ? AND user_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ? ORDER BY end_date DESC LIMIT 1",
    [guildId, userId, today, today]
  );
  return rows[0] || null;
}

async function getApprovedLoasForSync(guildId = null) {
  const today = formatDateOnly(new Date());
  const guildWhere = guildId ? 'AND guild_id = ?' : '';
  const params = guildId ? [today, today, guildId] : [today, today];
  return query(
    `SELECT * FROM duty_loa_requests
     WHERE status = 'approved'
       AND (end_date >= ? OR (end_date < ? AND loa_role_removed_at IS NULL))
       ${guildWhere}
     ORDER BY guild_id, start_date, end_date`,
    params
  );
}

async function markLoaRoleAdded({ loaId }) {
  await query('UPDATE duty_loa_requests SET loa_role_added_at = COALESCE(loa_role_added_at, NOW()), loa_role_removed_at = NULL WHERE loa_id = ?', [loaId]);
}

async function markLoaRoleRemoved({ loaId }) {
  await query('UPDATE duty_loa_requests SET loa_role_removed_at = COALESCE(loa_role_removed_at, NOW()) WHERE loa_id = ?', [loaId]);
}

async function updateLoaSyncStatus({ loaId, status, error }) {
  await query('UPDATE duty_loa_requests SET last_sync_at = NOW(), last_sync_status = ?, last_sync_error = ? WHERE loa_id = ?', [status, error ? String(error).slice(0, 1000) : null, loaId]);
}

function calculateDurationDays(startDate, endDate) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  if (!start || !end) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function parseDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatDateOnly(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return date.toISOString().slice(0, 10);
}

module.exports = {
  ensureDutyTables,
  getActiveDutySession,
  clockInUser,
  clockOutUser,
  createTimecardId,
  createLoaId,
  createCorrectionId,
  createLoaRequest,
  getLoaRequestById,
  updateLoaApprovalMessage,
  approveLoaRequest,
  denyLoaRequest,
  getActiveApprovedLoa,
  getApprovedLoasForSync,
  markLoaRoleAdded,
  markLoaRoleRemoved,
  updateLoaSyncStatus,
  calculateDurationDays,
  parseDateInput,
  formatDateOnly,
  formatDuration,
  getRecentTimecards,
  getTimecardById,
  createTimecardCorrection,
  getCorrectionById,
  updateCorrectionApprovalMessage,
  approveTimecardCorrection,
  denyTimecardCorrection,
  applyApprovedTimecardCorrection,
  parseDateTimeInput,
  calculateDurationSeconds
};
