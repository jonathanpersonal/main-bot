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


  appeals: {
    enabled: true,

    forumChannelId: 'PUT_APPEALS_FORUM_CHANNEL_ID_HERE',

    reviewerRoleIds: [
      'PUT_IA_OR_COMMAND_REVIEWER_ROLE_ID_HERE'
    ],

    supervisorRoleIds: [
      'PUT_IA_SUPERVISOR_ROLE_ID_HERE'
    ],

    commandRoleId: 'PUT_DEPARTMENT_COMMAND_ROLE_ID_HERE',

    tags: {
      pending: 'PUT_PENDING_FORUM_TAG_ID_HERE',
      underReview: 'PUT_UNDER_REVIEW_FORUM_TAG_ID_HERE',
      infoNeeded: 'PUT_INFO_NEEDED_FORUM_TAG_ID_HERE',
      approved: 'PUT_APPROVED_FORUM_TAG_ID_HERE',
      denied: 'PUT_DENIED_FORUM_TAG_ID_HERE',
      closed: 'PUT_CLOSED_FORUM_TAG_ID_HERE'
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

Thank you for appealing your strike. We have reviewed your appeal and have approved your appeal.

Your strike has been overturned.

Reason:
{approvalReason}

Next steps:
{nextSteps}

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

  google: {
    webhookUrl: process.env.GOOGLE_WEBHOOK_URL || null
  }
};
