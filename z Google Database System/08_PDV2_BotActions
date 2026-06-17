/*************************************************************
 * Department Database v2
 * File: 08_PDV2_BotActions.gs
 *************************************************************/

function pdv2CreateBotAction_(input) {
  input = input || {};
  var actionId = pdv2GenerateId_('ACT');
  var row = {
    'Action ID': actionId,
    'Request ID': pdv2String_(input.requestId),
    'Created At': pdv2Now_(),
    'Updated At': pdv2Now_(),
    'Status': PDV2.STATUSES.ACTION_PENDING,
    'Action Type': pdv2Upper_(input.actionType || 'LOG_MESSAGE'),
    'Target Discord ID': pdv2String_(input.targetDiscordId),
    'Payload JSON': pdv2SafeJson_(pdv2SanitizeForStorage_(input.payload || {})),
    'Attempts': 0,
    'Last Attempt At': '',
    'Completed At': '',
    'Error Message': ''
  };
  pdv2AppendObject_(PDV2.SHEETS.BOT_ACTIONS, row);
  pdv2Audit_('GOOGLE_SYSTEM', 'BOT_ACTION_CREATED', '', 'BotActions', actionId, row['Request ID'], {
    actionType: row['Action Type'],
    targetDiscordId: row['Target Discord ID']
  });
  return { actionId: actionId, actionType: row['Action Type'], status: row['Status'] };
}

function pdv2GetPendingBotActions_(data) {
  data = data || {};
  var max = Math.min(Number(pdv2Pick_(data, ['max', 'limit'], 25)) || 25, 100);
  var rows = pdv2ListRows_(PDV2.SHEETS.BOT_ACTIONS).filter(function(row) {
    return pdv2Upper_(row['Status']) === PDV2.STATUSES.ACTION_PENDING;
  }).slice(0, max);

  var actions = rows.map(function(row) {
    var payload = {};
    try { payload = JSON.parse(row['Payload JSON'] || '{}'); } catch (err) { payload = {}; }
    return {
      actionId: row['Action ID'],
      requestId: row['Request ID'],
      status: row['Status'],
      actionType: row['Action Type'],
      targetDiscordId: row['Target Discord ID'],
      payload: payload,
      attempts: Number(row['Attempts'] || 0),
      createdAt: row['Created At'],
      rowNumber: row.__rowNumber
    };
  });

  return pdv2Success_({ actions: actions, count: actions.length });
}

function pdv2MarkBotActionComplete_(data) {
  return pdv2WithLock_(function() {
    var actionId = pdv2String_(pdv2Pick_(data || {}, ['actionId', 'id']));
    if (!actionId) return pdv2Fail_('Missing actionId.');

    var row = pdv2FindRowByValue_(PDV2.SHEETS.BOT_ACTIONS, 'Action ID', actionId);
    if (!row) return pdv2Fail_('Bot action not found.', { actionId: actionId });

    var saved = pdv2UpdateRowObject_(PDV2.SHEETS.BOT_ACTIONS, row, {
      'Updated At': pdv2Now_(),
      'Status': PDV2.STATUSES.ACTION_COMPLETE,
      'Attempts': Number(pdv2RowToObject_(pdv2EnsureSheet_(PDV2.SHEETS.BOT_ACTIONS), row)['Attempts'] || 0) + 1,
      'Last Attempt At': pdv2Now_(),
      'Completed At': pdv2Now_(),
      'Error Message': ''
    });

    pdv2Audit_('DISCORD_BOT', 'BOT_ACTION_COMPLETED', pdv2Pick_(data, ['completedBy', 'actor'], ''), 'BotActions', actionId, saved['Request ID'], {
      result: data.result || {}
    });

    return pdv2Success_({ actionId: actionId, action: saved });
  });
}

function pdv2MarkBotActionFailed_(data) {
  return pdv2WithLock_(function() {
    var actionId = pdv2String_(pdv2Pick_(data || {}, ['actionId', 'id']));
    if (!actionId) return pdv2Fail_('Missing actionId.');

    var row = pdv2FindRowByValue_(PDV2.SHEETS.BOT_ACTIONS, 'Action ID', actionId);
    if (!row) return pdv2Fail_('Bot action not found.', { actionId: actionId });

    var current = pdv2RowToObject_(pdv2EnsureSheet_(PDV2.SHEETS.BOT_ACTIONS), row);
    var saved = pdv2UpdateRowObject_(PDV2.SHEETS.BOT_ACTIONS, row, {
      'Updated At': pdv2Now_(),
      'Status': PDV2.STATUSES.ACTION_FAILED,
      'Attempts': Number(current['Attempts'] || 0) + 1,
      'Last Attempt At': pdv2Now_(),
      'Error Message': pdv2Pick_(data, ['error', 'message'], 'Bot reported failure.')
    });

    pdv2Audit_('DISCORD_BOT', 'BOT_ACTION_FAILED', pdv2Pick_(data, ['completedBy', 'actor'], ''), 'BotActions', actionId, saved['Request ID'], {
      error: saved['Error Message']
    });

    return pdv2Success_({ actionId: actionId, action: saved });
  });
}
