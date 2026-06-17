module.exports = {
  departmentName: 'Hosted Testing Department',

  guildId: process.env.GUILD_ID,

  logChannels: {
    generalLogs: null,
    officerManagementLogs: null,
    trainingLogs: null,
    ticketLogs: null
  },

  logging: {
    staffLogChannelId: '1513565727045718117'
  },

  roles: {
    departmentMemberRoleId: null,
    previousOfficerRoleId: null
  },

  officerManagement: {
    departmentName: 'Hosted Testing Department',
    commandTeamName: 'Hosted Testing Department Command Team',
    previousOfficerRoleId: 'PUT_PREVIOUS_OFFICER_ROLE_ID_HERE',
    reapplyWaitPeriod: '7 days',
    appealWindow: '48 hours',

    appealButton: {
      enabled: true,
      label: 'Appeal Decision'
    },

    extraDepartmentRoleIds: [
      // Optional department roles that are not rank roles or permission roles.
      // Example: department member role, trainee role, certified role, etc.
    ],

    dmMessages: {
      termination: `Dear {officerName},

This message is to inform you that your employment within {departmentName} has been terminated. Please see the information below.

If you wish to appeal, you have up to {appealWindow} to do so.

Reason: {reason}
Able to reapply: {canReapply}
Blacklisted: {blacklisted}

{reapplyInstructions}

Regards,
{commandTeamName}`,
      resignation: `Dear {officerName},

This message is to confirm that your resignation from {departmentName} has been processed.

We thank you for your service. You are welcome to reapply after a waiting period of {reapplyWaitPeriod}.

Regards,
{commandTeamName}`,
      strike: `Dear {officerName},

You have been issued a strike. Please see the information below regarding the details of your strike.

If you wish to appeal, you have up to {appealWindow} from now to do so.

Strike Level: {strikeLevel}
Reason for Strike: {reason}
Steps to prevent this from happening again: {preventionSteps}

Regards,
{commandTeamName}`
    }
  },


  trainingManagement: {
    enabled: true,

    allowedRoleIds: ['1513618583530508298'],
    ftoRoleIds: ['1513618583530508298'],
    ftoCommandRoleIds: ['1513618608134291458'],

    trainingGuideUrl: 'https://docs.google.com/document/d/1bNE-LMcqw0qZE21swIC3sGGt6YXJoHmsYXVPSb6iJ3A/edit?tab=t.0#heading=h.jztjrvs5ofxu',

    dmEnabled: true,

    applicationReview: {
      decisions: {
        approved: {
          label: 'Approve Application',
          addRoleIds: ['1177028178749952141'],
          removeRoleIds: [],
          dmEnabled: true,
          dmMessage: `Dear {officerName},

Thank you for applying to the RWPD. After careful review we have accepted your application. Please read the following information carefully as it contains information regarding your next steps:

1. You will be/have been given cadet roles. You have 14 days to complete your training. Should you fail to complete your training you will be denied and must reapply.

2. Trainings are posted in the Training Events channel in the Discord. Please make sure you RSVP to a training if you are able to attend.

3. Once a training starts nobody else will be allowed in. If you are more than 5 minutes late the FTO may cancel the training.

If you have any questions please feel free to contact a supervisor.

Regards,
{commandTeamName}`
        },

        denied: {
          label: 'Deny Application',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          dmMessage: `Dear {officerName},

Thank you for applying to the RWPD. After careful review, your application has been denied.

Reason:
{reason}

Additional comments:
{comments}

You may reapply in 7 days.

If you have any questions please feel free to contact a supervisor.

Regards,
{commandTeamName}`
        },

        pendingReview: {
          label: 'Hold / Pending Review',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          pingFtoCommand: true,
          dmMessage: `Dear {officerName},

Your application for {departmentName} is currently pending further review.

You will be notified once a final decision is made.

Regards,
{commandTeamName}`
        }
      }
    },

    cadetTraining: {
      guideTitle: 'Cadet Training Directions/Information',

      guideMessage: `Please read the directions below when completing a training.

1. Open the training guide.
2. Tell all cadets to join the training waiting room and arrive at the PD station.
3. Move all cadets to the training room Discord voice channel.
4. Go through the document step by step.
5. Once completed, press Review Cadet to begin the scoring/review process.

Frequently Asked Questions:

1. If a cadet leaves mid-training, they must start over unless command approves otherwise.
2. If you are unsure whether they should pass, choose Pending Further Review.
3. If a cadet has an emergency and needs to leave, document where they stopped and mark the training incomplete.`,

      outcomes: {
        pass: {
          label: 'Pass',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          dmMessage: `Dear {officerName},

Congratulations on passing your {trainingName}.

Your training has been marked as complete.

{callsignLine}

Please follow any next steps provided by command or the training team.

Regards,
{commandTeamName}`
        },

        fail: {
          label: 'Fail',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          dmMessage: `Dear {officerName},

Your {trainingName} has been marked as failed.

Reason:
{reason}

What needs improvement:
{improvementNotes}

Please follow any next steps provided by the training team.

Regards,
{commandTeamName}`
        },

        incompleteEmergency: {
          label: 'Incomplete - Emergency',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          dmMessage: `Dear {officerName},

Your {trainingName} has been marked incomplete due to an emergency or approved interruption.

You may be required to restart or continue training based on command/training team direction.

Regards,
{commandTeamName}`
        },

        incompleteDidNotFinish: {
          label: 'Incomplete - Did Not Finish',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          dmMessage: `Dear {officerName},

Your {trainingName} has been marked incomplete because it was not finished.

You may be required to restart training before continuing in the department process.

Regards,
{commandTeamName}`
        },

        pendingReview: {
          label: 'Pending Further Review',
          addRoleIds: [],
          removeRoleIds: [],
          dmEnabled: true,
          pingFtoCommand: true,
          dmMessage: `Dear {officerName},

Your {trainingName} has been submitted for further review.

A member of the training command team will review the information and notify you once a final decision is made.

Regards,
{commandTeamName}`
        }
      }
    }
  },

  appeals: {
    enabled: true,

    forumChannelId: '1513618559949865100',

    reviewerRoleIds: [
      '1513618583530508298'
    ],

    supervisorRoleIds: [
      '1513618608134291458'
    ],

    commandRoleId: 'PUT_DEPARTMENT_COMMAND_ROLE_ID_HERE',

    strikeRoleIds: {
      1: 'PUT_STRIKE_1_ROLE_ID_HERE',
      2: 'PUT_STRIKE_2_ROLE_ID_HERE',
      3: 'PUT_STRIKE_3_ROLE_ID_HERE'
    },

    tags: {
      pending: '1513618818449018990',
      underReview: '1513618859465375774',
      infoNeeded: '1513618901710405784',
      approved: '1513618936585912470',
      denied: '1513618966961197086',
      closed: '1513619004315402333'
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
      approvedTermination: `Dear {officerName},

Thank you for appealing your termination. We have reviewed your appeal and have approved your appeal.

Please review the directions below to ensure you are reinstated correctly:

1. Open a Command Ticket and choose Appeal Reinstatement as the reason.
2. Follow all prompts. When asked for your appeal ID, provide the following:

{appealId}

3. A member of the Internal Affairs or Command Team will assist you further.

Thank you,
Internal Affairs Team`,
      deniedTermination: `Dear {officerName},

Thank you for appealing your termination. We have reviewed your appeal and are unable to approve your appeal for the following reason:

{denialReason}

Can you reapply as an officer: {canReapply}

Please note that appeals are final. All information regarding your appeal is stored in the system in case there are further issues that need to be addressed. If specified above, you may apply again after the configured waiting period. Please note this decision only relates to your appeal and does not relate to any other items or matters.

Regards,
Internal Affairs Team`,
      approvedStrike: `Dear {officerName},

Your strike appeal has been approved.

The strike has been removed from your record.

Regards,
Internal Affairs Team`,
      deniedStrike: `Dear {officerName},

Thank you for appealing your strike. We have reviewed your appeal and are unable to approve your appeal for the following reason:

{denialReason}

Please note that appeals are final. All information regarding your appeal is stored in the system in case there are further issues that need to be addressed.

Regards,
Internal Affairs Team`
    }
  },

  ranks: [
    {
      name: 'Cadet',
      rankRoleId: '1513552137131524288',
      permissionRoleId: '1513552154538020884',
      level: 1
    },
    {
      name: 'Officer',
      rankRoleId: '1177028193203531807',
      permissionRoleId: '1177028209112522863',
      level: 2
    },
    {
      name: 'Corporal',
      rankRoleId: 'PASTE_CORPORAL_ROLE_ID_HERE',
      permissionRoleId: 'PASTE_CORPORAL_PERMISSION_ROLE_ID_HERE',
      level: 3
    },
    {
      name: 'Sergeant',
      rankRoleId: 'PASTE_SERGEANT_ROLE_ID_HERE',
      permissionRoleId: 'PASTE_SERGEANT_PERMISSION_ROLE_ID_HERE',
      level: 4
    }
  ],

  duty: {
    enabled: true,

    // Leave blank to use logging.staffLogChannelId for completed duty timecards.
    logChannelId: '',

    dutyTypes: [
      {
        key: 'patrol',
        label: 'Patrol',
        countsTowardActivity: true,
        countsAsAdmin: false
      },
      {
        key: 'training',
        label: 'Training',
        countsTowardActivity: true,
        countsAsAdmin: true
      },
      {
        key: 'fto',
        label: 'FTO',
        countsTowardActivity: true,
        countsAsAdmin: true
      },
      {
        key: 'quality_review',
        label: 'Quality Review',
        countsTowardActivity: true,
        countsAsAdmin: true
      },
      {
        key: 'administrative',
        label: 'Administrative',
        countsTowardActivity: true,
        countsAsAdmin: true
      },
      {
        key: 'meeting',
        label: 'Meeting',
        countsTowardActivity: true,
        countsAsAdmin: false
      },
      {
        key: 'other',
        label: 'Other',
        countsTowardActivity: true,
        countsAsAdmin: false
      }
    ],


    rideAlongFeedback: {
      enabled: true,

      // Channel where ride-along feedback is posted for FTO/training review.
      // Leave blank to fall back to logChannels.trainingLogs, then logging.staffLogChannelId.
      feedbackChannelId: '',

      // Minimum rank level allowed to submit feedback.
      // Policy says Officer I or higher can conduct ride-alongs.
      // Use the configured rank level system.
      minReviewerRankLevel: 2,

      // Optional extra role IDs allowed to submit feedback even if rank is not detected.
      reviewerRoleIds: [],

      // Optional role IDs that identify Probationary Officers.
      // If this array is empty, do not block submission based on target role.
      probationaryRoleIds: [],

      requireTargetProbationary: false,

      dmOfficerOnSubmit: false
    },

    loa: {
      enabled: true,

      // Channel where LOA approval requests are posted.
      approvalChannelId: '1516830234727415888',

      // Role the bot gives while an approved LOA is currently active.
      loaRoleId: '1516830414302482562',

      // Roles allowed to approve/deny LOA requests and run LOA sync.
      // Discord IDs must always be strings.
      approverRoleIds: [
        '1513618608134291458'
      ],

      // LOA policy settings.
      minDays: 3,
      maxDaysWithoutCommandException: 60,

      // Daily sync adds/removes the LOA role based on approved LOA dates.
      dailySync: {
        enabled: true,
        time: '09:00',
        timezone: 'America/New_York',
        runOnStartup: true
      },

      // Future officer-management/activity integration settings.
      exemptFromActivity: true,
      blocksPromotion: true,
      blocksDemotion: true,
      blocksTermination: true
    },

    corrections: {
      enabled: true,

      approvalChannelId: '1516830234727415888',
      approverRoleIds: [`1513618608134291458`],

      allowManualTimecardId: true,
      recentTimecardLimit: 10
    },

    activity: {
      enabled: true,
      cycleLengthDays: 14,

      reportChannelId: '1516851652139679894',
      commandReviewChannelId: '1516851652139679894',

      approverRoleIds: [],

      includeRoleIds: [],
      excludeRoleIds: [],

      semiActiveBlocksPromotion: true,
      loaExemptsFromActivity: true,

      discipline: {
        autoStrike1Enabled: true,
        strike1Label: 'Activity Strike 1 - Written Warning',

        autoStrike2Enabled: false,
        autoStrike3Enabled: false,
        autoTerminationEnabled: false,

        commandReviewAfterInactiveCycles: 2,
        terminationReviewAfterInactiveCycles: 3
      },

      scheduler: {
        enabled: true,
        cron: '0 9 */14 * *',
        timezone: 'America/New_York'
      },

      rankRequirements: [
        {
          group: 'Department Administration',
          ranks: ['Chief', 'Deputy Chief', 'Commander'],
          exempt: true
        },
        {
          group: 'Command Staff',
          rank: 'Captain',
          activeHours: 10,
          semiActiveHours: 4
        },
        {
          group: 'Command Staff',
          rank: 'Lieutenant',
          activeHours: 10,
          semiActiveHours: 4
        },
        {
          group: 'Supervisor',
          rank: 'Staff Sergeant',
          activeHours: 8,
          semiActiveHours: 3
        },
        {
          group: 'Supervisor',
          rank: 'Sergeant',
          activeHours: 8,
          semiActiveHours: 3
        },
        {
          group: 'Training Staff',
          rank: 'Corporal',
          activeHours: 7.5,
          semiActiveHours: 3,
          requiresAdminHoursPercentage: 50
        },
        {
          group: 'Officers',
          rank: 'Lead Officer',
          activeHours: 6,
          semiActiveHours: 3,
          requiresAdminHoursPercentage: 50
        },
        {
          group: 'Officers',
          rank: 'Senior Officer',
          activeHours: 3.5,
          semiActiveHours: 2
        },
        {
          group: 'Officers',
          rank: 'Officer II',
          activeHours: 3.5,
          semiActiveHours: 2
        },
        {
          group: 'Officers',
          rank: 'Probationary Officer',
          activeHours: 2.5,
          semiActiveHours: 2
        },
        {
          group: 'Officers',
          rank: 'Officer',
          activeHours: 2.5,
          semiActiveHours: 2
        },
        {
          group: 'Recruits',
          ranks: ['Recruit', 'Cadet'],
          trainingRequiredWithinDays: 14
        }
      ]
    },

    // TODO: Future phases should implement LOA requests, timecard corrections,
    // activity cycle reports/findings, and Command Staff review workflows.
    googleWebhook: {
      enabled: false,
      urlEnvName: 'GOOGLE_DUTY_WEBHOOK_URL'
    }
  },

  google: {
    webhookUrl: process.env.GOOGLE_WEBHOOK_URL || null
  }
};
