/*************************************************************
 * Department Database v2
 * File: 11_PDV2_UiBackend.gs
 * -----------------------------------------------------------
 * Backend-only functions for a future Apps Script HTML UI.
 * No HTML/UI pages are included yet.
 *************************************************************/

function pdv2GetUiBootstrapData_() {
  return pdv2Success_({
    version: PDV2.VERSION,
    instanceMode: PDV2.INSTANCE_MODE,
    serverName: pdv2GetConfigValue_('SERVER_NAME', PDV2.DEFAULTS.SERVER_NAME),
    guildIdConfigured: !!pdv2GetConfigValue_('DISCORD_GUILD_ID', ''),
    departments: pdv2ListRows_(PDV2.SHEETS.DEPARTMENTS),
    ranks: pdv2ListRows_(PDV2.SHEETS.RANKS),
    staffAccessCount: pdv2ListRows_(PDV2.SHEETS.STAFF_ACCESS).length
  });
}

function pdv2GetUiDashboardData_() {
  var database = pdv2ListRows_(PDV2.SHEETS.DATABASE);
  var requests = pdv2ListRows_(PDV2.SHEETS.BOT_REQUESTS);
  var actions = pdv2ListRows_(PDV2.SHEETS.BOT_ACTIONS);

  var activeOfficers = database.filter(function(row) { return pdv2Upper_(row.Status) === 'ACTIVE'; }).length;
  var pendingActions = actions.filter(function(row) { return pdv2Upper_(row.Status) === PDV2.STATUSES.ACTION_PENDING; }).length;

  return pdv2Success_({
    serverName: pdv2GetConfigValue_('SERVER_NAME', PDV2.DEFAULTS.SERVER_NAME),
    officersTotal: database.length,
    activeOfficers: activeOfficers,
    botRequestsTotal: requests.length,
    pendingBotActions: pendingActions,
    recentRequests: requests.slice(Math.max(0, requests.length - 10)).reverse(),
    recentAudit: pdv2ListRows_(PDV2.SHEETS.AUDIT_LOG).slice(-10).reverse()
  });
}

function pdv2ListSheetForUi_(sheetName, limit) {
  limit = Math.min(Number(limit || 100), 500);
  return pdv2Success_({ sheetName: sheetName, rows: pdv2ListRows_(sheetName).slice(0, limit) });
}

function pdv2GetOfficerProfileForUi_(discordId) {
  var profile = pdv2GetDatabaseRecordByDiscordId_(discordId);
  if (!profile.ok) return profile;

  var rankHistory = pdv2ListRows_(PDV2.SHEETS.RANK_HISTORY).filter(function(row) {
    return pdv2String_(row['Discord ID']) === pdv2String_(discordId);
  });
  var training = pdv2ListRows_(PDV2.SHEETS.TRAINING_RECORDS).filter(function(row) {
    return pdv2String_(row['Discord ID']) === pdv2String_(discordId);
  });
  var discipline = pdv2ListRows_(PDV2.SHEETS.DISCIPLINE_RECORDS).filter(function(row) {
    return pdv2String_(row['Discord ID']) === pdv2String_(discordId);
  });
  var callsignHistory = pdv2ListRows_(PDV2.SHEETS.CALLSIGN_HISTORY).filter(function(row) {
    return pdv2String_(row['Discord ID']) === pdv2String_(discordId);
  });

  return pdv2Success_({
    officer: profile.record,
    rankHistory: rankHistory,
    training: training,
    discipline: discipline,
    callsignHistory: callsignHistory
  });
}
