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
      label: 'Appeal Decision',
      url: 'PUT_APPEAL_FORM_OR_TICKET_URL_HERE'
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
