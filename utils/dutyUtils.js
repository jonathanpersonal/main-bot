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
     WHERE guild_id = ? AND user_id = ?
     ORDER BY clock_out_at DESC
     LIMIT ${safeLimit}`,
    [guildId, userId]
  );
}

module.exports = {
  ensureDutyTables,
  getActiveDutySession,
  clockInUser,
  clockOutUser,
  createTimecardId,
  formatDuration,
  getRecentTimecards
};
