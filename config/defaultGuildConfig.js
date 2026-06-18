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
    ticketStaffRoleIds: [],
    highCommandRoleIds: []
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
    ticketPanelChannelId: ''
  },
  google: {
    enabled: false,
    webhookUrl: '',
    pollingUrl: ''
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
