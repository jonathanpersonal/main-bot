const { query } = require('./database');

async function countExistingRideAlongs(guildId, discordId) {
  try {
    const rows = await query(
      'SELECT COUNT(*) AS count FROM duty_ridealong_feedback WHERE guild_id = ? AND probationary_user_id = ?',
      [guildId, discordId]
    );
    return Number(rows?.[0]?.count || 0);
  } catch (error) {
    console.warn('Could not read duty ride-along feedback for probation count:', error.message);
    return null;
  }
}

module.exports = {
  countExistingRideAlongs
};
