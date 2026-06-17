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

  await query(`
    CREATE TABLE IF NOT EXISTS duty_timecard_corrections (
      id INT AUTO_INCREMENT PRIMARY KEY,
      correction_id VARCHAR(64) NOT NULL UNIQUE,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      timecard_id VARCHAR(64) NOT NULL,
      original_clock_in_at DATETIME NOT NULL,
      original_clock_out_at DATETIME NOT NULL,
      original_duration_seconds INT NOT NULL,
      requested_clock_in_at DATETIME NOT NULL,
      requested_clock_out_at DATETIME NOT NULL,
      requested_duration_seconds INT NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME NULL,
      reviewed_by VARCHAR(32) NULL,
      review_notes TEXT NULL,
      approval_message_id VARCHAR(32) NULL,
      approval_channel_id VARCHAR(32) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_correction_guild_user_created (guild_id, user_id, created_at),
      INDEX idx_correction_status (guild_id, status),
      INDEX idx_correction_timecard (guild_id, timecard_id)
    )
  `);

  await ensureDutyTimecardCorrectionColumns();

  await query(`
    CREATE TABLE IF NOT EXISTS duty_activity_cycles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cycle_id VARCHAR(64) NOT NULL UNIQUE,

      guild_id VARCHAR(32) NOT NULL,
      cycle_start DATE NOT NULL,
      cycle_end DATE NOT NULL,

      status VARCHAR(32) NOT NULL DEFAULT 'generated',

      generated_by VARCHAR(32) NULL,
      generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      dry_run BOOLEAN NOT NULL DEFAULT FALSE,

      total_officers INT NOT NULL DEFAULT 0,
      active_count INT NOT NULL DEFAULT 0,
      semi_active_count INT NOT NULL DEFAULT 0,
      inactive_count INT NOT NULL DEFAULT 0,
      loa_count INT NOT NULL DEFAULT 0,
      exempt_count INT NOT NULL DEFAULT 0,
      recruit_pending_count INT NOT NULL DEFAULT 0,
      error_count INT NOT NULL DEFAULT 0,

      report_message_id VARCHAR(32) NULL,
      report_channel_id VARCHAR(32) NULL,

      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      INDEX idx_activity_cycles_guild_dates (guild_id, cycle_start, cycle_end)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS duty_activity_findings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      finding_id VARCHAR(64) NOT NULL UNIQUE,

      cycle_id VARCHAR(64) NOT NULL,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,

      rank_key VARCHAR(128) NULL,
      rank_name VARCHAR(128) NULL,

      active_required_hours DECIMAL(6,2) NULL,
      semi_active_required_hours DECIMAL(6,2) NULL,

      total_seconds INT NOT NULL DEFAULT 0,
      admin_seconds INT NOT NULL DEFAULT 0,
      patrol_seconds INT NOT NULL DEFAULT 0,

      total_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
      admin_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
      patrol_hours DECIMAL(8,2) NOT NULL DEFAULT 0,

      activity_status VARCHAR(64) NOT NULL,
      promotion_eligible BOOLEAN NOT NULL DEFAULT TRUE,

      loa_exempt BOOLEAN NOT NULL DEFAULT FALSE,
      exempt_reason VARCHAR(255) NULL,

      inactive_streak INT NOT NULL DEFAULT 0,

      discipline_action VARCHAR(64) NULL,
      command_review_required BOOLEAN NOT NULL DEFAULT FALSE,
      command_review_reason TEXT NULL,

      auto_strike_created BOOLEAN NOT NULL DEFAULT FALSE,
      auto_strike_level INT NULL,
      auto_strike_reference VARCHAR(128) NULL,

      notes TEXT NULL,

      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      UNIQUE KEY unique_cycle_user (cycle_id, user_id),
      INDEX idx_findings_guild_user (guild_id, user_id),
      INDEX idx_findings_status (guild_id, activity_status),
      INDEX idx_findings_review (guild_id, command_review_required)
    )
  `);

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
    created_at: 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
  };

  const existingColumns = await query('SHOW COLUMNS FROM duty_loa_requests');
  const existingColumnNames = new Set(existingColumns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    if (!existingColumnNames.has(columnName)) {
      await query(`ALTER TABLE duty_loa_requests ADD COLUMN ${columnName} ${definition}`);
    }
  }
}


async function ensureDutyTimecardCorrectionColumns() {
  const columnDefinitions = {
    correction_id: 'VARCHAR(64) NULL UNIQUE',
    guild_id: 'VARCHAR(32) NULL',
    user_id: 'VARCHAR(32) NULL',
    timecard_id: 'VARCHAR(64) NULL',
    original_clock_in_at: 'DATETIME NULL',
    original_clock_out_at: 'DATETIME NULL',
    original_duration_seconds: 'INT NULL',
    requested_clock_in_at: 'DATETIME NULL',
    requested_clock_out_at: 'DATETIME NULL',
    requested_duration_seconds: 'INT NULL',
    reason: 'TEXT NULL',
    notes: 'TEXT NULL',
    status: "VARCHAR(32) NOT NULL DEFAULT 'pending'",
    requested_at: 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    reviewed_at: 'DATETIME NULL',
    reviewed_by: 'VARCHAR(32) NULL',
    review_notes: 'TEXT NULL',
    approval_message_id: 'VARCHAR(32) NULL',
    approval_channel_id: 'VARCHAR(32) NULL',
    created_at: 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
  };

  const existingColumns = await query('SHOW COLUMNS FROM duty_timecard_corrections');
  const existingColumnNames = new Set(existingColumns.map((column) => column.Field));

  for (const [columnName, definition] of Object.entries(columnDefinitions)) {
    if (!existingColumnNames.has(columnName)) {
      await query(`ALTER TABLE duty_timecard_corrections ADD COLUMN ${columnName} ${definition}`);
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
