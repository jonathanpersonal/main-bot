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
);


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
);


CREATE TABLE IF NOT EXISTS duty_ridealong_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feedback_id VARCHAR(64) NOT NULL UNIQUE,
  guild_id VARCHAR(32) NOT NULL,
  probationary_user_id VARCHAR(32) NOT NULL,
  reviewer_user_id VARCHAR(32) NOT NULL,
  reviewer_rank_key VARCHAR(128) NULL,
  reviewer_rank_name VARCHAR(128) NULL,
  ridealong_date DATE NULL,
  rating TINYINT NOT NULL,
  general_comments TEXT NOT NULL,
  did_well TEXT NOT NULL,
  improve_on TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ridealong_probationary_created (guild_id, probationary_user_id, created_at),
  INDEX idx_ridealong_reviewer_created (guild_id, reviewer_user_id, created_at),
  INDEX idx_ridealong_feedback_id (feedback_id)
);

-- TODO: Future Duty phases may add these tables only when those features are implemented:
-- duty_activity_cycles
-- duty_activity_findings
