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