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

-- Training/probation workflow tables are included for hosts that want a SQL mirror.
-- Patch 3 uses Google Sheets as the official source of truth; these tables should
-- not replace the Google workflow tabs unless a future migration explicitly enables it.
CREATE TABLE IF NOT EXISTS training_cadets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  discord_id VARCHAR(32) NOT NULL,
  discord_username VARCHAR(128) NULL,
  database_name VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  deadline_at DATETIME NULL,
  reminder_last_sent_at DATETIME NULL,
  notes TEXT NULL,
  google_request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_training_cadet (guild_id, discord_id),
  INDEX idx_training_cadets_status_deadline (guild_id, status, deadline_at)
);

CREATE TABLE IF NOT EXISTS training_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  training_record_id VARCHAR(64) NOT NULL UNIQUE,
  guild_id VARCHAR(32) NOT NULL,
  discord_id VARCHAR(32) NOT NULL,
  database_name VARCHAR(128) NULL,
  training_type VARCHAR(128) NULL,
  training_officer_discord_id VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL,
  completed_at DATETIME NULL,
  notes TEXT NULL,
  google_request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_training_records_user_created (guild_id, discord_id, created_at),
  INDEX idx_training_records_status (guild_id, status)
);

CREATE TABLE IF NOT EXISTS probationary_officers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  discord_id VARCHAR(32) NOT NULL,
  discord_username VARCHAR(128) NULL,
  database_name VARCHAR(128) NULL,
  callsign VARCHAR(32) NULL,
  training_officer_discord_id VARCHAR(32) NULL,
  probation_start_at DATETIME NULL,
  cycle_start_at DATETIME NULL,
  cycle_end_at DATETIME NULL,
  cycle_number INT NOT NULL DEFAULT 1,
  max_cycles INT NOT NULL DEFAULT 2,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  ridealong_count INT NOT NULL DEFAULT 0,
  feedback_count INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  updated_by VARCHAR(32) NULL,
  final_decision VARCHAR(64) NULL,
  graduation_at DATETIME NULL,
  google_request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_probationary_officer (guild_id, discord_id),
  INDEX idx_probationary_status_cycle (guild_id, status, cycle_end_at)
);

CREATE TABLE IF NOT EXISTS probation_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feedback_id VARCHAR(64) NOT NULL UNIQUE,
  guild_id VARCHAR(32) NOT NULL,
  discord_id VARCHAR(32) NOT NULL,
  result VARCHAR(32) NULL,
  notes TEXT NULL,
  submitted_by_discord_id VARCHAR(32) NULL,
  google_request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_probation_feedback_user_created (guild_id, discord_id, created_at)
);

CREATE TABLE IF NOT EXISTS probation_decisions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  decision_id VARCHAR(64) NOT NULL UNIQUE,
  guild_id VARCHAR(32) NOT NULL,
  discord_id VARCHAR(32) NOT NULL,
  decision VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'RECORDED',
  notes TEXT NULL,
  submitted_by_discord_id VARCHAR(32) NULL,
  google_request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_probation_decisions_user_created (guild_id, discord_id, created_at),
  INDEX idx_probation_decisions_status (guild_id, status)
);

CREATE TABLE IF NOT EXISTS training_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  audit_id VARCHAR(64) NOT NULL UNIQUE,
  guild_id VARCHAR(32) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  target_discord_id VARCHAR(32) NULL,
  actor_discord_id VARCHAR(32) NULL,
  reason TEXT NULL,
  payload_json JSON NULL,
  google_request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_training_audit_target_created (guild_id, target_discord_id, created_at),
  INDEX idx_training_audit_action_created (guild_id, action_type, created_at)
);

-- TODO: Future Duty phases may add these tables only when those features are implemented:
-- duty_activity_cycles
-- duty_activity_findings
