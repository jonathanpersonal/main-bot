/*************************************************************
 * Department Database v2
 * File: 09_PDV2_Callsigns.gs
 *************************************************************/

function pdv2NormalizeRank_(rank) {
  return pdv2String_(rank).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pdv2FindAssignedCallsignByDiscordId_(discordId) {
  var rows = pdv2ListRows_(PDV2.SHEETS.CALLSIGN_REGISTRY);
  for (var i = 0; i < rows.length; i++) {
    if (pdv2String_(rows[i]['Assigned Discord ID']) === pdv2String_(discordId) && pdv2Upper_(rows[i]['Slot Status']) === 'ASSIGNED') {
      return rows[i];
    }
  }
  return null;
}

function pdv2FindOpenCallsignSlotForRank_(rank) {
  var normalized = pdv2NormalizeRank_(rank);
  var rows = pdv2ListRows_(PDV2.SHEETS.CALLSIGN_REGISTRY);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var status = pdv2Upper_(row['Slot Status']);
    if ((status === 'OPEN' || status === 'RELEASED' || status === '') && pdv2NormalizeRank_(row['Rank']) === normalized) {
      return row;
    }
  }
  return null;
}

function pdv2AssignCallsignForRank_(discordId, name, oldRank, newRank, requestId, actor) {
  discordId = pdv2String_(discordId);
  name = pdv2String_(name);
  newRank = pdv2String_(newRank);
  if (!discordId || !newRank) return pdv2Fail_('Missing Discord ID or rank for callsign assignment.');

  var current = pdv2FindAssignedCallsignByDiscordId_(discordId);
  if (current && pdv2NormalizeRank_(current['Rank']) === pdv2NormalizeRank_(newRank)) {
    pdv2WriteDatabaseCallsign_(discordId, current['Callsign']);
    return pdv2Success_({
      changed: false,
      callsign: current['Callsign'],
      message: 'Officer already has a callsign for this rank.'
    });
  }

  var next = pdv2FindOpenCallsignSlotForRank_(newRank);
  if (!next) {
    pdv2Audit_('GOOGLE_SYSTEM', 'CALLSIGN_ASSIGNMENT_SKIPPED_NO_SLOT', actor || '', 'Database', discordId, requestId || '', { newRank: newRank });
    return pdv2Fail_('No open callsign slot found for rank: ' + newRank, { newRank: newRank });
  }

  if (current) {
    pdv2UpdateRowObject_(PDV2.SHEETS.CALLSIGN_REGISTRY, current.__rowNumber, {
      'Slot Status': 'RELEASED',
      'Assigned Discord ID': '',
      'Assigned Name': '',
      'Released Date': pdv2Now_(),
      'Last Updated': pdv2Now_(),
      'Notes': 'Released during reassignment to ' + newRank
    });
  }

  pdv2UpdateRowObject_(PDV2.SHEETS.CALLSIGN_REGISTRY, next.__rowNumber, {
    'Slot Status': 'ASSIGNED',
    'Assigned Discord ID': discordId,
    'Assigned Name': name,
    'Assigned Date': pdv2Now_(),
    'Released Date': '',
    'Last Updated': pdv2Now_(),
    'Notes': 'Assigned by Google v2 callsign engine.'
  });

  pdv2WriteDatabaseCallsign_(discordId, next['Callsign']);

  pdv2AppendObject_(PDV2.SHEETS.CALLSIGN_HISTORY, {
    'Timestamp': pdv2Now_(),
    'Action': 'ASSIGN',
    'Discord ID': discordId,
    'Name': name,
    'Old Rank': oldRank || (current ? current['Rank'] : ''),
    'New Rank': newRank,
    'Old Callsign': current ? current['Callsign'] : '',
    'New Callsign': next['Callsign'],
    'Request ID': requestId || '',
    'Notes': 'Assigned from CallsignRegistry.'
  });

  pdv2Audit_('GOOGLE_SYSTEM', 'CALLSIGN_ASSIGNED', actor || '', 'Database', discordId, requestId || '', {
    oldCallsign: current ? current['Callsign'] : '',
    newCallsign: next['Callsign'],
    newRank: newRank
  });

  return pdv2Success_({
    changed: true,
    oldCallsign: current ? current['Callsign'] : '',
    newCallsign: next['Callsign'],
    callsign: next['Callsign'],
    message: 'Assigned callsign ' + next['Callsign'] + '.'
  });
}

function pdv2WriteDatabaseCallsign_(discordId, callsign) {
  var row = pdv2FindRowByValue_(PDV2.SHEETS.DATABASE, 'Discord ID', discordId);
  if (!row) return;
  pdv2UpdateRowObject_(PDV2.SHEETS.DATABASE, row, {
    'Current Callsign': callsign,
    'Callsign Updated': pdv2Now_(),
    'Latest Change': pdv2Now_()
  });
}
