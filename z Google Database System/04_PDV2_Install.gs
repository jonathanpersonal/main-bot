/*************************************************************
 * Department Database v2
 * File: 04_PDV2_Install.gs
 *************************************************************/

function pdv2InstallOrRepairSystem() {
  return pdv2WithLock_(function() {
    var checked = [];
    Object.keys(PDV2.SHEETS).forEach(function(key) {
      var sheetName = PDV2.SHEETS[key];
      pdv2EnsureSheet_(sheetName);
      checked.push(sheetName);
    });

    pdv2SeedSystemConfig_();
    pdv2SeedStarterConfig_();
    pdv2SeedInitialStaffAccess_();

    pdv2Log_('INFO', 'INSTALL', 'SYSTEM_REPAIRED', 'Install/repair completed.', { sheetsChecked: checked.length });
    pdv2Audit_('SHEET_MENU', 'SYSTEM_REPAIRED', Session.getActiveUser().getEmail(), 'System', 'PDV2', '', { sheetsChecked: checked });

    return { ok: true, version: PDV2.VERSION, sheetsChecked: checked };
  });
}

function pdv2SeedSystemConfig_() {
  var rows = [
    ['SYSTEM_VERSION', PDV2.VERSION, 'Installed version marker.'],
    ['INSTANCE_MODE', PDV2.INSTANCE_MODE, 'This database copy is intended for one Discord server/community.'],
    ['SERVER_NAME', PDV2.DEFAULTS.SERVER_NAME, 'Display name for this copied server database.'],
    ['DISCORD_GUILD_ID', PDV2.DEFAULTS.DISCORD_GUILD_ID, 'Discord server/guild ID for this database copy.'],
    ['DEFAULT_DEPARTMENT_KEY', PDV2.DEFAULTS.DEFAULT_DEPARTMENT_KEY, 'Default department key used when no department is supplied.'],
    ['TIMEZONE', PDV2.DEFAULTS.TIMEZONE, 'Timezone used by this server database.'],
    ['BOT_API_ENABLED', PDV2.DEFAULTS.BOT_API_ENABLED, 'TRUE/FALSE toggle for bot API routes.'],
    ['UI_BACKEND_ENABLED', PDV2.DEFAULTS.UI_BACKEND_ENABLED, 'TRUE/FALSE toggle for future Apps Script UI backend routes.']
  ];

  rows.forEach(function(row) {
    var existing = pdv2FindRowByValue_(PDV2.SHEETS.SYSTEM_CONFIG, 'Key', row[0]);
    if (!existing) pdv2SetConfigValue_(row[0], row[1], row[2]);
  });
}

function pdv2SeedStarterConfig_() {
  var departmentsAdded = 0;
  var ranksAdded = 0;

  var deptKey = pdv2GetConfigValue_('DEFAULT_DEPARTMENT_KEY', 'main') || 'main';
  if (!pdv2FindRowByValue_(PDV2.SHEETS.DEPARTMENTS, 'Department Key', deptKey)) {
    pdv2AppendObject_(PDV2.SHEETS.DEPARTMENTS, {
      'Department Key': deptKey,
      'Department Name': 'Main Department',
      'Active': 'TRUE',
      'Default': 'TRUE',
      'Notes': 'Starter department. Rename this for the copied server.',
      'Updated At': pdv2Now_()
    });
    departmentsAdded++;
  }

  var starterRanks = [
    ['cadet', 'Cadet', 10, 'FALSE'],
    ['probationary_officer', 'Probationary Officer', 20, 'TRUE'],
    ['officer_i', 'Officer I', 30, 'TRUE'],
    ['officer_ii', 'Officer II', 40, 'TRUE'],
    ['corporal', 'Corporal', 50, 'TRUE'],
    ['sergeant', 'Sergeant', 60, 'TRUE'],
    ['lieutenant', 'Lieutenant', 70, 'TRUE'],
    ['captain', 'Captain', 80, 'TRUE'],
    ['chief', 'Chief', 90, 'FALSE']
  ];

  starterRanks.forEach(function(rank) {
    if (!pdv2FindRowByValue_(PDV2.SHEETS.RANKS, 'Rank Key', rank[0])) {
      pdv2AppendObject_(PDV2.SHEETS.RANKS, {
        'Rank Key': rank[0],
        'Rank Name': rank[1],
        'Rank Order': rank[2],
        'Department': deptKey,
        'Assign Callsign': rank[3],
        'Active': 'TRUE',
        'Discord Role ID': '',
        'Permission Role ID': '',
        'Notes': 'Starter rank. Edit role IDs/config for each copied server.',
        'Updated At': pdv2Now_()
      });
      ranksAdded++;
    }
  });

  return { departmentsAdded: departmentsAdded, ranksAdded: ranksAdded };
}

function pdv2SeedInitialStaffAccess_() {
  var sh = pdv2EnsureSheet_(PDV2.SHEETS.STAFF_ACCESS);
  if (sh.getLastRow() > 1) return { added: false };

  var email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '';
  if (!email) return { added: false, reason: 'No active email detected.' };

  pdv2UpsertStaffAccess_({
    email: email,
    displayName: email,
    accessLevel: 'SUPER_ADMIN',
    active: true,
    notes: 'Auto-added during install because StaffAccess was empty.'
  });
  return { added: true, email: email };
}

function pdv2SeedDemoCallsignSlots_() {
  var added = 0;
  var dept = pdv2GetConfigValue_('DEFAULT_DEPARTMENT_KEY', 'main') || 'main';
  var samples = [
    ['P-201', 'Probationary Officer'], ['P-202', 'Probationary Officer'], ['P-203', 'Probationary Officer'],
    ['O-101', 'Officer I'], ['O-102', 'Officer I'], ['O-103', 'Officer I'],
    ['O-201', 'Officer II'], ['O-202', 'Officer II'],
    ['C-301', 'Corporal'], ['S-401', 'Sergeant'], ['L-501', 'Lieutenant']
  ];

  samples.forEach(function(item) {
    if (!pdv2FindRowByValue_(PDV2.SHEETS.CALLSIGN_REGISTRY, 'Callsign', item[0])) {
      pdv2AppendObject_(PDV2.SHEETS.CALLSIGN_REGISTRY, {
        'Slot ID': pdv2GenerateId_('SLOT'),
        'Callsign': item[0],
        'Rank': item[1],
        'Department': dept,
        'Slot Status': 'OPEN',
        'Assigned Discord ID': '',
        'Assigned Name': '',
        'Assigned Date': '',
        'Released Date': '',
        'Last Updated': pdv2Now_(),
        'Notes': 'Demo slot. Edit/remove for the real server.'
      });
      added++;
    }
  });

  pdv2Audit_('SHEET_MENU', 'DEMO_CALLSIGN_SLOTS_SEEDED', Session.getActiveUser().getEmail(), 'CallsignRegistry', '', '', { added: added });
  return { added: added };
}

function pdv2ClearTestRows_() {
  var requestsRemoved = pdv2DeleteRowsMatching_(PDV2.SHEETS.BOT_REQUESTS, function(row) {
    var action = pdv2Upper_(row['Action Type']);
    return action.indexOf('GOOGLE_TEST') >= 0 || pdv2String_(row['Submitted By Discord ID']) === 'LOCAL_MENU_TEST';
  });

  var actionsRemoved = pdv2DeleteRowsMatching_(PDV2.SHEETS.BOT_ACTIONS, function(row) {
    var action = pdv2Upper_(row['Action Type']);
    return action.indexOf('GOOGLE_TEST') >= 0 || pdv2String_(row['Target Discord ID']) === 'LOCAL_MENU_TEST';
  });

  pdv2Audit_('SHEET_MENU', 'TEST_ROWS_CLEARED', Session.getActiveUser().getEmail(), 'BotTestRows', '', '', {
    requestsRemoved: requestsRemoved,
    actionsRemoved: actionsRemoved
  });

  return { requestsRemoved: requestsRemoved, actionsRemoved: actionsRemoved };
}

function pdv2DeleteRowsMatching_(sheetName, predicate) {
  var sh = pdv2EnsureSheet_(sheetName);
  var rows = pdv2ListRows_(sheetName);
  var removed = 0;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (predicate(rows[i])) {
      sh.deleteRow(rows[i].__rowNumber);
      removed++;
    }
  }
  return removed;
}
