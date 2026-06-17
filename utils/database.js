const mysql = require('mysql2/promise');

const REQUIRED_DB_ENV_VARS = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

function getDatabaseConfig() {
  const missingVars = REQUIRED_DB_ENV_VARS.filter((envName) => !process.env[envName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required database environment variable(s): ${missingVars.join(', ')}. `
      + 'Add the Duty database settings in your host environment before using /duty.'
    );
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true
  };
}

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(getDatabaseConfig());
  }

  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function ensureDutyTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS duty_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      duty_type VARCHAR(64) NOT NULL,
      rank_key VARCHAR(128) NULL,
      rank_name VARCHAR(128) NULL,
      clock_in_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      UNIQUE KEY unique_active_session (guild_id, user_id),
      INDEX idx_duty_sessions_guild (guild_id),
      INDEX idx_duty_sessions_user (user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS duty_timecards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timecard_id VARCHAR(64) NOT NULL UNIQUE,

      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,

      duty_type VARCHAR(64) NOT NULL,
      rank_key VARCHAR(128) NULL,
      rank_name VARCHAR(128) NULL,

      clock_in_at DATETIME NOT NULL,
      clock_out_at DATETIME NOT NULL,
      duration_seconds INT NOT NULL,

      status VARCHAR(32) NOT NULL DEFAULT 'completed',

      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      INDEX idx_guild_user_created (guild_id, user_id, created_at),
      INDEX idx_timecard_id (timecard_id)
    )
  `);


  await query(`
    CREATE TABLE IF NOT EXISTS duty_loa_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      loa_id VARCHAR(64) NOT NULL UNIQUE,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      duration_days INT NOT NULL,
      reason TEXT NOT NULL,
      comments TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME NULL,
      reviewed_by VARCHAR(32) NULL,
      review_notes TEXT NULL,
      approval_message_id VARCHAR(32) NULL,
      approval_channel_id VARCHAR(32) NULL,
      loa_role_added_at DATETIME NULL,
      loa_role_removed_at DATETIME NULL,
      last_sync_at DATETIME NULL,
      last_sync_status VARCHAR(64) NULL,
      last_sync_error TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_loa_guild_user_created (guild_id, user_id, created_at),
      INDEX idx_loa_status (guild_id, status),
      INDEX idx_loa_dates (guild_id, start_date, end_date)
    )
  `);

  await ensureDutyLoaColumns();

  // TODO: Future Duty phases may add duty_timecard_corrections,
  // duty_activity_cycles, and duty_activity_findings tables.

}

async function ensureDutyLoaColumns() {
  const columnDefinitions = {
    comments: 'TEXT NULL',
    reviewed_at: 'DATETIME NULL',
    reviewed_by: 'VARCHAR(32) NULL',
    review_notes: 'TEXT NULL',
    approval_message_id: 'VARCHAR(32) NULL',
    approval_channel_id: 'VARCHAR(32) NULL',
    loa_role_added_at: 'DATETIME NULL',
    loa_role_removed_at: 'DATETIME NULL',
    last_sync_at: 'DATETIME NULL',
    last_sync_status: 'VARCHAR(64) NULL',
    last_sync_error: 'TEXT NULL',
    created_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
  };

  const existingColumns = await query('SHOW COLUMNS FROM duty_loa_requests');
  const existingColumnNames = new Set(existingColumns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    if (!existingColumnNames.has(columnName)) {
      await query(`ALTER TABLE duty_loa_requests ADD COLUMN ${columnName} ${definition}`);
    }
  }
}

module.exports = {
  get pool() {
    return getPool();
  },
  query,
  ensureDutyTables
};
