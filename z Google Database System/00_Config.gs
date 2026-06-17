/**
 * Google System v2 Foundation
 * Discord Department Management Bot backend
 *
 * Keep secrets in Apps Script Project Settings > Script Properties.
 * Required Script Property:
 *   BOT_API_SECRET = a long random shared secret also stored in your bot .env
 */

const GSV2 = {
  version: '2026.06.17-v2-foundation',
  timezone: 'America/New_York',

  scriptProperties: {
    botApiSecret: 'BOT_API_SECRET'
  },

  sheets: {
    systemConfig: 'SystemConfig',
    botRequests: 'BotRequests',
    botActions: 'BotActions',
    officerRecords: 'OfficerRecords',
    rankHistory: 'RankHistory',
    trainingRecords: 'TrainingRecords',
    disciplineRecords: 'DisciplineRecords',
    callsignRegistry: 'CallsignRegistry',
    callsignHistory: 'CallsignHistory',
    auditLog: 'AuditLog',
    scriptLogs: 'ScriptLogs'
  },

  requestStatuses: {
    received: 'RECEIVED',
    processing: 'PROCESSING',
    completed: 'COMPLETED',
    failed: 'FAILED',
    cancelled: 'CANCELLED'
  },

  actionStatuses: {
    pending: 'PENDING',
    inProgress: 'IN_PROGRESS',
    completed: 'COMPLETED',
    failed: 'FAILED',
    cancelled: 'CANCELLED'
  },

  headers: {
    SystemConfig: [
      'Key', 'Value', 'Description', 'UpdatedAt', 'UpdatedBy'
    ],

    BotRequests: [
      'RequestId', 'CreatedAt', 'UpdatedAt', 'Status',
      'GuildId', 'DepartmentKey', 'ActionType',
      'SubmittedByDiscordId', 'SubmittedByDiscordTag',
      'TargetDiscordId', 'TargetDiscordTag',
      'PayloadJson', 'ResultJson', 'ErrorMessage', 'CompletedAt'
    ],

    BotActions: [
      'ActionId', 'RequestId', 'CreatedAt', 'UpdatedAt', 'Status',
      'GuildId', 'DepartmentKey', 'ActionType', 'TargetDiscordId',
      'PayloadJson', 'Attempts', 'LastAttemptAt', 'CompletedAt', 'ErrorMessage'
    ],

    OfficerRecords: [
      'OfficerId', 'CreatedAt', 'UpdatedAt',
      'GuildId', 'DepartmentKey', 'DiscordUserId', 'DiscordUsername', 'DisplayName',
      'Callsign', 'CurrentRankKey', 'CurrentRankName', 'Status',
      'HireDate', 'LeaveDate', 'ProbationStartDate', 'ProbationEndDate',
      'AssignedTrainingOfficerDiscordId', 'Steam64', 'Email', 'Notes'
    ],

    RankHistory: [
      'HistoryId', 'CreatedAt', 'OfficerId', 'GuildId', 'DepartmentKey',
      'DiscordUserId', 'OldRankKey', 'OldRankName', 'NewRankKey', 'NewRankName',
      'ActionType', 'Reason', 'SubmittedByDiscordId', 'ApprovedByDiscordId',
      'RequestId', 'DetailsJson'
    ],

    TrainingRecords: [
      'TrainingId', 'CreatedAt', 'UpdatedAt', 'OfficerId', 'GuildId', 'DepartmentKey',
      'DiscordUserId', 'TrainingType', 'TrainingOfficerDiscordId', 'Status',
      'CompletedAt', 'Notes', 'RequestId', 'DetailsJson'
    ],

    DisciplineRecords: [
      'DisciplineId', 'CreatedAt', 'UpdatedAt', 'OfficerId', 'GuildId', 'DepartmentKey',
      'DiscordUserId', 'ActionType', 'StrikeLevel', 'Reason', 'Evidence', 'Notes',
      'SubmittedByDiscordId', 'RequestId', 'DetailsJson'
    ],

    CallsignRegistry: [
      'Callsign', 'Status', 'GuildId', 'DepartmentKey', 'OfficerId', 'DiscordUserId',
      'ReservedAt', 'AssignedAt', 'ReleasedAt', 'RequestId', 'Notes'
    ],

    CallsignHistory: [
      'HistoryId', 'CreatedAt', 'Callsign', 'ActionType', 'GuildId', 'DepartmentKey',
      'OfficerId', 'DiscordUserId', 'RequestId', 'DetailsJson'
    ],

    AuditLog: [
      'AuditId', 'CreatedAt', 'Actor', 'Source', 'EventType', 'EntityType',
      'EntityId', 'RequestId', 'GuildId', 'DepartmentKey', 'DetailsJson'
    ],

    ScriptLogs: [
      'LogId', 'CreatedAt', 'Level', 'Route', 'Message', 'DetailsJson'
    ]
  }
};
