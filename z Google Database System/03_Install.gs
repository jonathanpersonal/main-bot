/**
 * Run this manually from Apps Script after creating/binding the project.
 * It creates all v2 sheets and headers.
 */
function gsv2InstallOrRepairSystem() {
  return gsv2WithLock_(function () {
    Object.keys(GSV2.sheets).forEach(function (key) {
      const sheetName = GSV2.sheets[key];
      gsv2EnsureSheet_(sheetName, gsv2HeadersForSheet_(sheetName));
    });

    gsv2SeedSystemConfig_();
    gsv2LogScript_('INFO', 'install', 'Google System v2 install/repair completed.', {});

    return {
      ok: true,
      version: GSV2.version,
      message: 'Google System v2 install/repair completed.'
    };
  });
}

function gsv2SeedSystemConfig_() {
  const sheetName = GSV2.sheets.systemConfig;
  const existingKeys = gsv2ReadAllObjects_(sheetName).map(function (entry) {
    return String(entry.object.Key || '');
  });

  const rows = [
    {
      Key: 'SYSTEM_VERSION',
      Value: GSV2.version,
      Description: 'Current Google System v2 foundation version.'
    },
    {
      Key: 'DEFAULT_DEPARTMENT_KEY',
      Value: 'main',
      Description: 'Fallback department key if the bot does not provide one.'
    },
    {
      Key: 'CALLSIGN_START',
      Value: '100',
      Description: 'First callsign number used by the simple callsign assignment helper.'
    },
    {
      Key: 'CALLSIGN_END',
      Value: '999',
      Description: 'Last callsign number used by the simple callsign assignment helper.'
    }
  ];

  rows.forEach(function (row) {
    if (existingKeys.indexOf(row.Key) !== -1) return;

    gsv2AppendObject_(sheetName, {
      Key: row.Key,
      Value: row.Value,
      Description: row.Description,
      UpdatedAt: gsv2NowIso_(),
      UpdatedBy: 'gsv2InstallOrRepairSystem'
    });
  });
}

function gsv2GetConfigValue_(key, fallback) {
  const found = gsv2FindFirstByField_(GSV2.sheets.systemConfig, 'Key', key);
  if (!found) return fallback;
  const value = found.object.Value;
  return value === '' || value === undefined || value === null ? fallback : value;
}

/**
 * Optional helper for first-time setup.
 * Do not save real secrets in GitHub.
 * You can run this manually in Apps Script and then delete/comment it if desired.
 */
function gsv2SetBotApiSecretForTestingOnly(secret) {
  if (!secret || String(secret).length < 20) {
    throw new Error('Use a long random secret. Recommended: 32+ characters.');
  }

  PropertiesService
    .getScriptProperties()
    .setProperty(GSV2.scriptProperties.botApiSecret, String(secret));

  return 'BOT_API_SECRET was saved to Script Properties.';
}
