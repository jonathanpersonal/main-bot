const defaultRank = {
  key: '',
  name: '',
  shortName: '',
  rankRoleId: '',
  permissionRoleId: '',
  order: 0,
  level: 0,
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

const defaultDutyType = {
  key: '',
  label: '',
  countsTowardActivity: true,
  countsAsAdmin: false
};

const defaultTicketType = {
  id: '',
  label: '',
  name: '',
  description: '',
  emoji: '🎫',
  enabled: true,
  listed: true,
  hidden: false,
  systemOnly: false,
  holdForLater: false,
  categoryId: '',
  categoryChannelId: '',
  routedRoleIds: [],
  staffRoleIds: [],
  allowRename: true,
  allowTransfer: true,
  allowLockdown: true,
  allowClaim: true,
  allowClose: true
};

const defaultGuildConfig = {
  guildId: '',
  departmentKey: 'main',

  department: {
    name: '',
    acronym: '',
    previousOfficerRoleId: '',
    memberRoleId: ''
  },

  // Legacy compatibility fields. New code should prefer department/channels/permissions.
  departmentName: '',
  logChannels: {
    generalLogs: null,
    officerManagementLogs: null,
    trainingLogs: null,
    ticketLogs: null,
    probationLogs: null
  },
  logging: {
    staffLogChannelId: ''
  },
  roles: {
    departmentMemberRoleId: '',
    previousOfficerRoleId: ''
  },

  devOnly: {
    enabled: false,
    roleIds: [],
    userIds: [],
    bypassForBotAdmins: true,
    message: 'This bot is currently in dev-only mode. You do not have permission to use it yet.'
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
    trainingCommandRoleIds: [],
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
    pollingUrl: '',
    webAppUrl: '',
    secret: '',
    timeoutMs: 120000,
    departmentKey: 'main'
  },

  googlePolling: {
    enabled: false,
    intervalMs: 60000,
    limit: 5
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

  officerManagement: {
    departmentName: '',
    commandTeamName: '',
    previousOfficerRoleId: '',
    reapplyWaitPeriod: '7 days',
    appealWindow: '48 hours',
    appealButton: {
      enabled: true,
      label: 'Appeal Decision'
    },
    extraDepartmentRoleIds: [],
    dmMessages: {
      termination: `Dear {officerName},

This message is to inform you that your employment within {departmentName} has been terminated.

Reason: {reason}
Able to reapply: {canReapply}
Blacklisted: {blacklisted}

{reapplyInstructions}

Regards,
{commandTeamName}`,
      resignation: `Dear {officerName},

This message is to confirm that your resignation from {departmentName} has been processed.

We thank you for your service.

Regards,
{commandTeamName}`,
      strike: `Dear {officerName},

You have been issued a strike.

Strike Level: {strikeLevel}
Reason for Strike: {reason}
Steps to prevent this from happening again: {preventionSteps}

Regards,
{commandTeamName}`
    }
  },

  registration: {
    enabled: true,
    registerOtherPermissionRoleIds: [],
    emailRequiredRankKeys: [],
    callsignNamePatterns: [
      '^\\[[A-Z0-9-]+\\]\\s*',
      '^\\([A-Z0-9-]+\\)\\s*',
      '^[A-Z0-9-]+\\s*\\|\\s*',
      '^[A-Z0-9-]+\\s*-\\s*'
    ]
  },

  trainingManagement: {
    enabled: true,
    allowedRoleIds: [],
    ftoRoleIds: [],
    ftoCommandRoleIds: [],
    trainingGuideUrl: '',
    dmEnabled: true,
    applicationReview: {
      decisions: {
        approved: {
          label: 'Approve Application',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          googleActionType: 'APPLICATION_APPROVED',
          googleStatus: 'APPROVED',
          acceptedForTraining: true,
          dmMessage: 'Your application has been approved. Please follow the next steps from the training team.'
        },
        denied: {
          label: 'Deny Application',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          googleActionType: 'APPLICATION_DENIED',
          googleStatus: 'DENIED',
          acceptedForTraining: false,
          dmMessage: 'Your application has been denied. Reason: {reason}'
        },
        pendingReview: {
          label: 'Hold / Pending Review',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          pingFtoCommand: true,
          googleActionType: 'APPLICATION_PENDING_REVIEW',
          googleStatus: 'PENDING_REVIEW',
          acceptedForTraining: false,
          dmMessage: 'Your application is pending further review.'
        }
      }
    },
    cadetTraining: {
      guideTitle: 'Cadet Training Directions/Information',
      guideMessage: 'Please follow the configured training guide and document the result.',
      outcomes: {
        pass: {
          label: 'Pass',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          googleActionType: 'TRAINING_PASSED',
          googleStatus: 'PASSED',
          dmMessage: 'Congratulations on passing your {trainingName}. {callsignLine}'
        },
        fail: {
          label: 'Fail',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          googleActionType: 'TRAINING_FAILED',
          googleStatus: 'FAILED',
          dmMessage: 'Your {trainingName} has been marked as failed. Reason: {reason}'
        },
        incompleteEmergency: {
          label: 'Incomplete - Emergency',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          googleActionType: 'TRAINING_INCOMPLETE_EMERGENCY',
          googleStatus: 'INCOMPLETE_EMERGENCY',
          dmMessage: 'Your {trainingName} has been marked incomplete due to an emergency or approved interruption.'
        },
        incompleteDidNotFinish: {
          label: 'Incomplete - Did Not Finish',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          googleActionType: 'TRAINING_INCOMPLETE_DID_NOT_FINISH',
          googleStatus: 'INCOMPLETE_DID_NOT_FINISH',
          dmMessage: 'Your {trainingName} has been marked incomplete because it was not finished.'
        },
        pendingReview: {
          label: 'Pending Further Review',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          pingFtoCommand: true,
          googleActionType: 'TRAINING_PENDING_REVIEW',
          googleStatus: 'PENDING_REVIEW',
          dmMessage: 'Your {trainingName} has been submitted for further review.'
        }
      }
    }
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

  appeals: {
    enabled: false,
    forumChannelId: '',
    reviewerRoleIds: [],
    supervisorRoleIds: [],
    commandRoleId: '',
    strikeRoleIds: {
      1: '',
      2: '',
      3: ''
    },
    tags: {
      pending: '',
      underReview: '',
      infoNeeded: '',
      approved: '',
      denied: '',
      closed: ''
    },
    responseTargets: {
      aimToRespondWithin: '72 hours',
      aimToResolveWithin: '5-7 days'
    },
    messages: {
      instructionsTitle: 'Appeal Instructions',
      appealReceived: 'Your appeal has been submitted and is pending review.',
      underReview: 'Your appeal is now under review.',
      infoRequested: 'Additional information is needed for your appeal.',
      approvedTermination: 'Your termination appeal has been approved. Please open or watch for a reinstatement ticket.',
      deniedTermination: 'Your termination appeal has been denied. Reason: {denialReason}',
      approvedStrike: 'Your strike appeal has been approved.',
      deniedStrike: 'Your strike appeal has been denied. Reason: {denialReason}'
    }
  },

  duty: {
    enabled: true,
    logChannelId: '',
    dutyTypes: [
      { ...defaultDutyType, key: 'patrol', label: 'Patrol', countsTowardActivity: true, countsAsAdmin: false },
      { ...defaultDutyType, key: 'training', label: 'Training', countsTowardActivity: true, countsAsAdmin: true },
      { ...defaultDutyType, key: 'fto', label: 'FTO', countsTowardActivity: true, countsAsAdmin: true },
      { ...defaultDutyType, key: 'administrative', label: 'Administrative', countsTowardActivity: true, countsAsAdmin: true },
      { ...defaultDutyType, key: 'meeting', label: 'Meeting', countsTowardActivity: true, countsAsAdmin: false },
      { ...defaultDutyType, key: 'other', label: 'Other', countsTowardActivity: true, countsAsAdmin: false }
    ],
    rideAlongFeedback: {
      enabled: true,
      feedbackChannelId: '',
      minReviewerRankLevel: 2,
      reviewerRoleIds: [],
      probationaryRoleIds: [],
      requireTargetProbationary: false,
      dmOfficerOnSubmit: false
    },
    loa: {
      enabled: true,
      approvalChannelId: '',
      loaRoleId: '',
      approverRoleIds: [],
      minDays: 3,
      maxDaysWithoutCommandException: 60,
      dailySync: {
        enabled: true,
        time: '09:00',
        timezone: 'UTC',
        runOnStartup: true
      },
      exemptFromActivity: true,
      blocksPromotion: true,
      blocksDemotion: true,
      blocksTermination: true
    },
    corrections: {
      enabled: true,
      approvalChannelId: '',
      approverRoleIds: [],
      allowManualTimecardId: true,
      recentTimecardLimit: 10
    },
    activity: {
      enabled: true,
      cycleLengthDays: 14,
      reportChannelId: '',
      commandReviewChannelId: '',
      approverRoleIds: [],
      includeRoleIds: [],
      excludeRoleIds: [],
      semiActiveBlocksPromotion: true,
      loaExemptsFromActivity: true,
      discipline: {
        autoStrike1Enabled: true,
        strike1Label: 'Activity Strike 1 - Written Warning',
        strikeRoleMode: 'none',
        activityStrikeRoleIds: {
          1: '',
          2: '',
          3: ''
        },
        autoStrike2Enabled: false,
        autoStrike3Enabled: false,
        autoTerminationEnabled: false,
        commandReviewAfterInactiveCycles: 2,
        terminationReviewAfterInactiveCycles: 3
      },
      scheduler: {
        enabled: true,
        cron: '0 9 */14 * *',
        timezone: 'UTC'
      },
      rankRequirements: []
    },
    googleWebhook: {
      enabled: false,
      urlEnvName: 'GOOGLE_DUTY_WEBHOOK_URL'
    }
  },

  tickets: {
    enabled: false,
    panelChannelId: '',
    categoryId: '',
    archiveCategoryId: '',
    logChannelId: '',
    transcriptChannelId: '',
    staffRoleIds: [],
    adminRoleIds: [],
    closeBehavior: 'archive',
    transcriptOnClose: true,
    lockdownPresets: [
      {
        id: 'command_only',
        label: 'Command Staff Only',
        description: 'Only command staff and ticket admins can view this ticket.',
        allowedRoleIds: [],
        allowedUserIds: [],
        includeTicketOpener: false
      },
      {
        id: 'ia_only',
        label: 'IA Only',
        description: 'Only IA staff and ticket admins can view this ticket.',
        allowedRoleIds: [],
        allowedUserIds: [],
        includeTicketOpener: false
      },
      {
        id: 'dept_admin_only',
        label: 'Dept Admin Only',
        description: 'Only department admins and ticket admins can view this ticket.',
        allowedRoleIds: [],
        allowedUserIds: [],
        includeTicketOpener: false
      },
      {
        id: 'staff_and_opener',
        label: 'Staff + Ticket Opener',
        description: 'Keeps the ticket opener and configured staff/admin roles in the ticket.',
        allowedRoleIds: [],
        allowedUserIds: [],
        includeTicketOpener: true
      }
    ],
    types: [
      { ...defaultTicketType, id: 'general_support', label: 'General Support', name: 'General Support', description: 'Open a general department support ticket.', emoji: '🎫', enabled: true, listed: true },
      { ...defaultTicketType, id: 'training_recruitment', label: 'Training Recruitment', name: 'Training Recruitment', description: 'Open a ticket for training or recruitment help.', emoji: '📋', enabled: true, listed: true },
      { ...defaultTicketType, id: 'contact_command_staff', label: 'Contact Command Staff', name: 'Contact Command Staff', description: 'Privately contact command staff.', emoji: '⭐', enabled: true, listed: true },
      { ...defaultTicketType, id: 'rank_transfer', label: 'Rank Transfer', name: 'Rank Transfer', description: 'Request a rank transfer.', emoji: '🔁', enabled: false, listed: true, holdForLater: true },
      { ...defaultTicketType, id: 'ia', label: 'IA', name: 'IA', description: 'Internal Affairs ticket.', emoji: '🕵️', enabled: true, listed: false, hidden: true },
      { ...defaultTicketType, id: 'dept_admin', label: 'Dept Admin', name: 'Dept Admin', description: 'Department admin-only ticket.', emoji: '🛠️', enabled: true, listed: false, hidden: true },
      { ...defaultTicketType, id: 'reinstatement', label: 'Reinstatement', name: 'Reinstatement', description: 'System-created ticket for approved termination appeals.', emoji: '♻️', enabled: true, listed: false, hidden: true, systemOnly: true }
    ]
  },

  setup: {
    completed: false,
    updatedAt: '',
    updatedBy: ''
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultGuildConfig(guildId = '') {
  return clone({
    ...defaultGuildConfig,
    guildId
  });
}

function createDefaultRank(rankData = {}) {
  const merged = {
    ...defaultRank,
    ...rankData,
    promotion: {
      ...defaultRank.promotion,
      ...(rankData.promotion || {})
    }
  };

  if (Number.isFinite(merged.level) && !Number.isFinite(rankData.order)) merged.order = merged.level;
  if (Number.isFinite(merged.order) && !Number.isFinite(rankData.level)) merged.level = merged.order;

  return clone(merged);
}

function createDefaultTicketType(ticketData = {}) {
  return clone({
    ...defaultTicketType,
    ...ticketData
  });
}

function createDefaultDutyType(dutyTypeData = {}) {
  return clone({
    ...defaultDutyType,
    ...dutyTypeData
  });
}

module.exports = {
  ...defaultGuildConfig,
  defaultRank,
  defaultTicketType,
  defaultDutyType,
  createDefaultGuildConfig,
  createDefaultRank,
  createDefaultTicketType,
  createDefaultDutyType
};
