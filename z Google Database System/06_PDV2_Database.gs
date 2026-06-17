/*************************************************************
 * Department Database v2
 * File: 06_PDV2_Database.gs
 * -----------------------------------------------------------
 * Main Database sheet record management.
 *************************************************************/

function pdv2MapIncomingOfficerRecord_(data) {
  data = data || {};
  return {
    'Status': pdv2Pick_(data, ['status', 'Status'], ''),
    'Name': pdv2Pick_(data, ['name', 'displayName', 'officerName', 'targetName', 'Name'], ''),
    'Username': pdv2Pick_(data, ['username', 'discordUsername', 'Username'], ''),
    'Discord ID': pdv2Pick_(data, ['discordId', 'discordID', 'discord_id', 'targetDiscordId', 'userId', 'Discord ID'], ''),
    'Rank': pdv2Pick_(data, ['rank', 'newRank', 'currentRank', 'Rank'], ''),
    'Steam 64': pdv2Pick_(data, ['steam64', 'steamId', 'Steam 64'], ''),
    'Join Date': pdv2Pick_(data, ['joinDate', 'hireDate', 'Join Date'], ''),
    'Leave Date': pdv2Pick_(data, ['leaveDate', 'Leave Date'], ''),
    'Latest Change': pdv2Now_(),
    'Email': pdv2Pick_(data, ['email', 'Email'], ''),
    'Precinct': pdv2Pick_(data, ['precinct', 'Precinct'], ''),
    'Department': pdv2Pick_(data, ['department', 'departmentKey', 'Department'], pdv2GetConfigValue_('DEFAULT_DEPARTMENT_KEY', 'main')),
    'Current Callsign': pdv2Pick_(data, ['callsign', 'currentCallsign', 'Current Callsign'], ''),
    'Callsign Updated': pdv2Pick_(data, ['callsignUpdated', 'Callsign Updated'], ''),
    'Training Officer': pdv2Pick_(data, ['trainingOfficer', 'Training Officer'], ''),
    'Probation Start': pdv2Pick_(data, ['probationStart', 'Probation Start'], ''),
    'Probation End': pdv2Pick_(data, ['probationEnd', 'Probation End'], ''),
    'Notes': pdv2Pick_(data, ['notes', 'Notes'], '')
  };
}

function pdv2UpsertDatabaseRecord_(data, options) {
  options = options || {};
  var record = pdv2MapIncomingOfficerRecord_(data || {});
  var discordId = pdv2String_(record['Discord ID']);
  if (!discordId) return pdv2Fail_('Missing Discord ID for database upsert.');

  var row = pdv2FindRowByValue_(PDV2.SHEETS.DATABASE, 'Discord ID', discordId);
  var update = {};
  Object.keys(record).forEach(function(header) {
    var value = record[header];
    if (header === 'Status' && !value && !row) value = 'Active';
    if (header === 'Latest Change') value = pdv2Now_();
    if (value !== '' || options.writeBlanks === true || header === 'Latest Change') update[header] = value;
  });

  var mode;
  if (row) {
    pdv2UpdateRowObject_(PDV2.SHEETS.DATABASE, row, update);
    mode = 'update';
  } else {
    if (!update['Status']) update['Status'] = 'Active';
    pdv2AppendObject_(PDV2.SHEETS.DATABASE, update);
    row = pdv2FindRowByValue_(PDV2.SHEETS.DATABASE, 'Discord ID', discordId);
    mode = 'insert';
  }

  var saved = pdv2GetDatabaseRecordByDiscordId_(discordId).record;
  pdv2Audit_(options.source || 'API', 'DATABASE_UPSERT', options.actor || '', 'Database', discordId, options.requestId || '', {
    mode: mode,
    updateKeys: Object.keys(update)
  });

  return pdv2Success_({ mode: mode, rowNumber: row, discordId: discordId, record: saved });
}

function pdv2GetDatabaseRecordByDiscordId_(discordId) {
  var row = pdv2FindRowByValue_(PDV2.SHEETS.DATABASE, 'Discord ID', discordId);
  if (!row) return pdv2Fail_('No Database record found for Discord ID ' + discordId + '.', { discordId: discordId });
  var record = pdv2RowToObject_(pdv2EnsureSheet_(PDV2.SHEETS.DATABASE), row);
  return pdv2Success_({ rowNumber: row, discordId: discordId, record: record });
}

function pdv2SetDatabaseRank_(data, options) {
  options = options || {};
  var discordId = pdv2String_(pdv2Pick_(data, ['discordId', 'targetDiscordId', 'Discord ID']));
  var newRank = pdv2String_(pdv2Pick_(data, ['newRank', 'rank', 'Rank']));
  var name = pdv2String_(pdv2Pick_(data, ['name', 'targetName', 'displayName']));
  var actionType = pdv2Upper_(pdv2Pick_(data, ['actionType'], 'SET_RANK'));

  if (!discordId) return pdv2Fail_('Missing target Discord ID.');
  if (!newRank) return pdv2Fail_('Missing new rank.');

  var existing = pdv2GetDatabaseRecordByDiscordId_(discordId);
  var oldRank = existing.ok ? pdv2String_(existing.record['Rank']) : '';

  var upsert = pdv2UpsertDatabaseRecord_({
    targetDiscordId: discordId,
    targetName: name || (existing.ok ? existing.record['Name'] : ''),
    rank: newRank,
    status: 'Active'
  }, {
    source: options.source || 'API',
    actor: options.actor || '',
    requestId: options.requestId || ''
  });

  pdv2AppendObject_(PDV2.SHEETS.RANK_HISTORY, {
    'History ID': pdv2GenerateId_('RANK'),
    'Created At': pdv2Now_(),
    'Discord ID': discordId,
    'Name': name || (upsert.record ? upsert.record['Name'] : ''),
    'Old Rank': oldRank,
    'New Rank': newRank,
    'Action Type': actionType,
    'Submitted By Discord ID': options.actor || '',
    'Request ID': options.requestId || '',
    'Notes': pdv2Pick_(data, ['reason', 'notes'], '')
  });

  var callsignResult = null;
  var autoCallsign = pdv2Bool_(pdv2Pick_(data, ['autoCallsign', 'assignCallsign'], false), false);
  if (autoCallsign) {
    callsignResult = pdv2AssignCallsignForRank_(discordId, name || '', oldRank, newRank, options.requestId || '', options.actor || '');
  }

  pdv2Audit_(options.source || 'API', 'DATABASE_RANK_UPDATED', options.actor || '', 'Database', discordId, options.requestId || '', {
    oldRank: oldRank,
    newRank: newRank,
    callsignResult: callsignResult
  });

  return pdv2Success_({
    discordId: discordId,
    oldRank: oldRank,
    newRank: newRank,
    record: upsert.record,
    callsign: callsignResult
  });
}

function pdv2SetDatabaseStatus_(data, options) {
  options = options || {};
  var discordId = pdv2String_(pdv2Pick_(data, ['discordId', 'targetDiscordId', 'Discord ID']));
  var status = pdv2String_(pdv2Pick_(data, ['status', 'newStatus']));
  if (!discordId) return pdv2Fail_('Missing Discord ID.');
  if (!status) return pdv2Fail_('Missing status.');

  var row = pdv2FindRowByValue_(PDV2.SHEETS.DATABASE, 'Discord ID', discordId);
  if (!row) {
    return pdv2UpsertDatabaseRecord_({
      targetDiscordId: discordId,
      targetName: pdv2Pick_(data, ['name', 'targetName'], ''),
      status: status
    }, options);
  }

  var updates = {
    'Status': status,
    'Latest Change': pdv2Now_()
  };
  if (pdv2Bool_(pdv2Pick_(data, ['clearRank'], false), false)) updates['Rank'] = '';
  if (status.toLowerCase().indexOf('resign') >= 0 || status.toLowerCase().indexOf('termin') >= 0) updates['Leave Date'] = pdv2Now_();

  var saved = pdv2UpdateRowObject_(PDV2.SHEETS.DATABASE, row, updates);
  pdv2Audit_(options.source || 'API', 'DATABASE_STATUS_UPDATED', options.actor || '', 'Database', discordId, options.requestId || '', updates);
  return pdv2Success_({ discordId: discordId, record: saved });
}

function pdv2SearchDatabase_(query, limit) {
  query = pdv2String_(query).toLowerCase();
  limit = Number(limit || 25);
  var rows = pdv2ListRows_(PDV2.SHEETS.DATABASE);
  if (query) {
    rows = rows.filter(function(row) {
      return [row['Name'], row['Username'], row['Discord ID'], row['Rank'], row['Current Callsign'], row['Status']]
        .join(' ').toLowerCase().indexOf(query) >= 0;
    });
  }
  return pdv2Success_({ records: rows.slice(0, limit), count: Math.min(rows.length, limit), totalMatches: rows.length });
}
