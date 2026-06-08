module.exports = {
  departmentName: 'Hosted Testing Department',

  guildId: process.env.GUILD_ID,

  logChannels: {
    generalLogs: null,
    officerManagementLogs: null,
    trainingLogs: null,
    ticketLogs: null
  },

  roles: {
    departmentMemberRoleId: null,
    previousOfficerRoleId: null
  },

  ranks: [
    // We will fill this in during the rank detection step.
    // Example:
    // {
    //   name: 'Officer',
    //   rankRoleId: 'ROLE_ID_HERE',
    //   permissionRoleId: 'ROLE_ID_HERE',
    //   level: 1
    // }
  ],

  google: {
    webhookUrl: process.env.GOOGLE_WEBHOOK_URL || null
  }
};