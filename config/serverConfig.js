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
    previousOfficerRoleId: 'PUT_PREVIOUS_OFFICER_ROLE_ID_HERE',

    extraDepartmentRoleIds: [
      // Optional department roles that are not rank roles or permission roles.
      // Example: department member role, trainee role, certified role, etc.
    ],

    dmMessages: {
      termination: 'You have been terminated from {departmentName}. Reason: {reason}',
      resignation: 'Your resignation from {departmentName} has been processed. Reason/notes: {reason}',
      strike: 'You have received a level {strikeLevel} strike in {departmentName}. Reason: {reason}'
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
