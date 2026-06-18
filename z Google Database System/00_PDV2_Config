/*************************************************************
 * Department Database v2 - Single Server Template
 * File: 00_PDV2_Config.gs
 * -----------------------------------------------------------
 * Purpose:
 *   Central sheet names, headers, and default values.
 *
 * Important design choice:
 *   This Google Sheet is ONE database instance for ONE Discord
 *   server/community. To reuse it, copy the spreadsheet/script
 *   and configure that copy for another server.
 *
 *   Do not treat this as one central database for every server.
 *************************************************************/

var PDV2 = {
  VERSION: 'PDV2-SINGLE-SERVER-TEMPLATE-2026-06-17',
  INSTANCE_MODE: 'SINGLE_SERVER_DATABASE',

  SCRIPT_PROPERTY_BOT_SECRET: 'BOT_API_SECRET',

  DEFAULTS: {
    SERVER_NAME: 'New Department Server',
    DISCORD_GUILD_ID: '',
    DEFAULT_DEPARTMENT_KEY: 'main',
    TIMEZONE: 'America/New_York',
    BOT_API_ENABLED: 'TRUE',
    UI_BACKEND_ENABLED: 'TRUE'
  },

  SHEETS: {
    SYSTEM_CONFIG: 'SystemConfig',
    DATABASE: 'Database',
    BOT_REQUESTS: 'BotRequests',
    BOT_ACTIONS: 'BotActions',
    RANK_HISTORY: 'RankHistory',
    TRAINING_RECORDS: 'TrainingRecords',
    DISCIPLINE_RECORDS: 'DisciplineRecords',
    CALLSIGN_REGISTRY: 'CallsignRegistry',
    CALLSIGN_HISTORY: 'CallsignHistory',
    DEPARTMENTS: 'Departments',
    RANKS: 'Ranks',
    STAFF_ACCESS: 'StaffAccess',
    AUDIT_LOG: 'AuditLog',
    SCRIPT_LOGS: 'ScriptLogs'
  },

  HEADERS: {
    SystemConfig: ['Key', 'Value', 'Description', 'Updated At'],

    // This intentionally keeps the old system's familiar main Database sheet.
    Database: [
      'Status',
      'Name',
      'Username',
      'Discord ID',
      'Rank',
      'Steam 64',
      'Join Date',
      'Leave Date',
      'Latest Change',
      'Email',
      'Precinct',
      'Department',
      'Current Callsign',
      'Callsign Updated',
      'Training Officer',
      'Probation Start',
      'Probation End',
      'Notes'
    ],

    BotRequests: [
      'Request ID',
      'Created At',
      'Updated At',
      'Status',
      'Source',
      'Action Type',
      'Submitted By Discord ID',
      'Target Discord ID',
      'Target Name',
      'Old Rank',
      'New Rank',
      'Reason',
      'Payload JSON',
      'Result JSON',
      'Error Message',
      'Completed At'
    ],

    BotActions: [
      'Action ID',
      'Request ID',
      'Created At',
      'Updated At',
      'Status',
      'Action Type',
      'Target Discord ID',
      'Payload JSON',
      'Attempts',
      'Last Attempt At',
      'Completed At',
      'Error Message'
    ],

    RankHistory: [
      'History ID',
      'Created At',
      'Discord ID',
      'Name',
      'Old Rank',
      'New Rank',
      'Action Type',
      'Submitted By Discord ID',
      'Request ID',
      'Notes'
    ],

    TrainingRecords: [
      'Training ID',
      'Created At',
      'Discord ID',
      'Name',
      'Training Type',
      'Training Officer Discord ID',
      'Status',
      'Completed At',
      'Notes',
      'Request ID'
    ],

    DisciplineRecords: [
      'Discipline ID',
      'Created At',
      'Discord ID',
      'Name',
      'Action Type',
      'Strike Level',
      'Reason',
      'Evidence',
      'Notes',
      'Submitted By Discord ID',
      'Request ID'
    ],

    CallsignRegistry: [
      'Slot ID',
      'Callsign',
      'Rank',
      'Department',
      'Slot Status',
      'Assigned Discord ID',
      'Assigned Name',
      'Assigned Date',
      'Released Date',
      'Last Updated',
      'Notes'
    ],

    CallsignHistory: [
      'Timestamp',
      'Action',
      'Discord ID',
      'Name',
      'Old Rank',
      'New Rank',
      'Old Callsign',
      'New Callsign',
      'Request ID',
      'Notes'
    ],

    Departments: [
      'Department Key',
      'Department Name',
      'Active',
      'Default',
      'Notes',
      'Updated At'
    ],

    Ranks: [
      'Rank Key',
      'Rank Name',
      'Rank Order',
      'Department',
      'Assign Callsign',
      'Active',
      'Discord Role ID',
      'Permission Role ID',
      'Notes',
      'Updated At'
    ],

    StaffAccess: [
      'Email',
      'Discord ID',
      'Display Name',
      'Access Level',
      'Active',
      'Notes',
      'Updated At'
    ],

    AuditLog: [
      'Audit ID',
      'Created At',
      'Source',
      'Event Type',
      'Actor',
      'Entity Type',
      'Entity ID',
      'Request ID',
      'Details JSON'
    ],

    ScriptLogs: [
      'Timestamp',
      'Level',
      'Run ID',
      'Event',
      'Message',
      'Meta JSON'
    ]
  },

  STATUSES: {
    REQUEST_RECEIVED: 'RECEIVED',
    REQUEST_PROCESSED: 'PROCESSED',
    REQUEST_FAILED: 'FAILED',
    ACTION_PENDING: 'PENDING',
    ACTION_COMPLETE: 'COMPLETE',
    ACTION_FAILED: 'FAILED'
  },

  MENU: {
    MAIN: 'Department DB v2',
    BOT: 'Bot / API Actions'
  }
};
