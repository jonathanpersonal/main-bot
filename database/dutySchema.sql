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
);

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
);

-- TODO: Future Duty phases may add these tables only when those features are implemented:
-- duty_loa_requests
-- duty_timecard_corrections
-- duty_activity_cycles
-- duty_activity_findings
