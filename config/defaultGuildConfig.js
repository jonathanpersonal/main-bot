const defaultRank = {
  name: '',
  rankRoleId: '',
  permissionRoleId: '',
  order: 0,
  isCommandStaff: false,
  isSupervisor: false,
  isProbationary: false,
  isRecruit: false,
  promotion: {
    minimumDaysInRank: 0,
    blocksIfLOA: true,
    requiredTrainingKeys: [],
    requiredChecklistKeys: []
  }
};

const defaultGuildConfig = {
  guildId: '',
  department: {
    name: '',
    acronym: '',
    previousOfficerRoleId: '',
    memberRoleId: ''
  },
  permissions: {
    setupAdminRoleIds: [],
    commandStaffRoleIds: [],
    supervisorRoleIds: [],
    trainingStaffRoleIds: [],
    iaStaffRoleIds: [],
    highCommandRoleIds: [],
    botAdminRoleIds: [],
    trainingOfficerRoleIds: [],
    ftoCommandRoleIds: [],
    departmentCommandRoleIds: [],
    ticketStaffRoleIds: [],
    lookupRoleIds: [],
    syncRoleIds: [],
    manualOfficerUpdateRoleIds: [],
    importUsersRoleIds: []
  },
  ranks: [],
  channels: {
    officerManagementLogChannelId: '',
    trainingLogChannelId: '',
    dutyLogChannelId: '',
    ticketLogChannelId: '',
    iaLogChannelId: '',
    botAdminLogChannelId: '',
    googleLogChannelId: '',
    ticketPanelChannelId: '',
    staffLogChannelId: '',
    commandApprovalChannelId: '',
    probationLogChannelId: ''
  },
  google: {
    enabled: false,
    webhookUrl: '',
    pollingUrl: ''
  },
  lookup: {
    enabled: true,
    showInternalNotesToHighCommandOnly: true,
    logLookups: false
  },
  sync: {
    enabled: true,
    dryRunDefault: true,
    updateNickname: true,
    nicknameFormat: '{callsign} | {name}',
    removeOldRankRoles: true,
    removeOldPermissionRoles: true,
    inactiveBehavior: 'preview_only',
    logChannelId: ''
  },
  manualOfficerUpdate: {
    enabled: true,
    requireConfirmation: true,
    updateGoogleFirst: true,
    updateDiscordRoles: true,
    updateNickname: true,
    allowLocalOnlyFallback: false,
    logChannelId: ''
  },
  importUsers: {
    enabled: true,
    dryRunDefault: true,
    requireConfirmation: true,
    batchSize: 10,
    logChannelId: ''
  },
  training: {
    enabled: true,
    sourceOfTruth: 'google',
    localJsonFallbackEnabled: true,
    publicRosterUrl: 'PUBLIC_ROSTER_URL_PLACEHOLDER',
    steamGroupUrl: 'STEAM_GROUP_URL_PLACEHOLDER',
    cadetDeadlineDays: 14,
    cadetReminderDays: 3,
    cadetRoleIds: [],
    applicantRoleIds: [],
    trainingOfficerRoleIds: [],
    trainingCommandRoleIds: [],
    commandApprovalChannelId: '',
    deadlineCheck: {
      enabled: true,
      runOnStartup: true,
      dailyTime: '0 9 * * *',
      timezone: 'UTC',
      reminderDaysBeforeDeadline: 3,
      autoTerminatePastDeadline: true,
      terminationReason: 'Failure to complete training - may reapply in 7 days.',
      reapplyAfterDays: 7
    },
    messages: {
      cadetApproved: 'You have been approved as a cadet. Deadline: {deadline}. Roster: {publicRosterUrl}',
      cadetDenied: 'Your application/training review was denied. Reason: {reason}',
      cadetDeadlineReminder: 'Reminder: your cadet training deadline is {deadline}. Roster: {publicRosterUrl}',
      cadetAutoTerminated: 'Your cadet status has been removed. Reason: {reason}',
      trainingPassed: 'Hello {dbName},\n\nCongrats on passing your {departmentName} Basic Training. Your callsign is {callsign}. Steam group: {steamGroupUrl}'
    }
  },
  probation: {
    enabled: true,
    sourceOfTruth: 'google',
    cycleDays: 4,
    maxDays: 8,
    maxCycles: 2,
    requiredRideAlongCount: 1,
    allowTrainingOfficerExtension: true,
    maxTrainingOfficerExtensions: 1,
    commandApprovalRequiredForRemoval: true,
    trainingOfficerRoleIds: [],
    ftoCommandRoleIds: [],
    departmentCommandRoleIds: [],
    probationaryRoleIds: [],
    graduationRankKey: '',
    firstOfficerRankRoleId: '',
    firstOfficerPermissionRoleId: '',
    check: {
      enabled: true,
      runOnStartup: true,
      dailyTime: '15 9 * * *',
      timezone: 'UTC'
    },
    messages: {
      started: 'Your probationary period has started.',
      passed: 'Congratulations {dbName}, you passed probation.',
      failedCycle: 'Your current probation cycle was not passed. A new cycle has started.',
      removalRequested: 'Probationary removal was requested and is pending command review.',
      removed: 'You have been removed from probationary officer status.'
    }
  },
  tickets: {
    enabled: false,
    types: []
  },
  setup: {
    completed: false,
    updatedAt: '',
    updatedBy: ''
  }
};

function createDefaultGuildConfig(guildId = '') {
  return JSON.parse(JSON.stringify({
    ...defaultGuildConfig,
    guildId
  }));
}

function createDefaultRank(rankData = {}) {
  return JSON.parse(JSON.stringify({
    ...defaultRank,
    ...rankData,
    promotion: {
      ...defaultRank.promotion,
      ...(rankData.promotion || {})
    }
  }));
}

module.exports = {
  ...defaultGuildConfig,
  defaultRank,
  createDefaultGuildConfig,
  createDefaultRank
};
