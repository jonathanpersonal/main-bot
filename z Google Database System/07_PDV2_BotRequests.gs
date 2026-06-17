/*************************************************************
 * Department Database v2
 * File: 07_PDV2_BotRequests.gs
 *************************************************************/

function pdv2SubmitBotRequest_(data) {
  return pdv2WithLock_(function() {
    data = data || {};
    var actionType = pdv2Upper_(pdv2Pick_(data, ['actionType', 'action', 'type'], 'GOOGLE_TEST'));
    var requestId = pdv2GenerateId_('REQ');
    var actor = pdv2String_(pdv2Pick_(data, ['submittedByDiscordId', 'actorDiscordId', 'actor', 'userId']));
    var targetDiscordId = pdv2String_(pdv2Pick_(data, ['targetDiscordId', 'discordId', 'targetId']));
    var targetName = pdv2String_(pdv2Pick_(data, ['targetName', 'name', 'displayName']));
    var payload = data.payload && typeof data.payload === 'object' ? data.payload : data;

    var row = {
      'Request ID': requestId,
      'Created At': pdv2Now_(),
      'Updated At': pdv2Now_(),
      'Status': PDV2.STATUSES.REQUEST_RECEIVED,
      'Source': pdv2Pick_(data, ['source'], 'DISCORD_BOT'),
      'Action Type': actionType,
      'Submitted By Discord ID': actor,
      'Target Discord ID': targetDiscordId,
      'Target Name': targetName,
      'Old Rank': pdv2Pick_(data, ['oldRank'], ''),
      'New Rank': pdv2Pick_(data, ['newRank', 'rank'], ''),
      'Reason': pdv2Pick_(data, ['reason'], ''),
      'Payload JSON': pdv2SafeJson_(pdv2SanitizeForStorage_(payload)),
      'Result JSON': '',
      'Error Message': '',
      'Completed At': ''
    };

    pdv2AppendObject_(PDV2.SHEETS.BOT_REQUESTS, row);
    pdv2Audit_(row.Source, 'BOT_REQUEST_RECEIVED', actor, 'BotRequests', requestId, requestId, {
      actionType: actionType,
      targetDiscordId: targetDiscordId
    });

    var processResult = pdv2ProcessBotRequest_(requestId, actionType, data);

    var status = processResult.ok ? PDV2.STATUSES.REQUEST_PROCESSED : PDV2.STATUSES.REQUEST_FAILED;
    var reqRow = pdv2FindRowByValue_(PDV2.SHEETS.BOT_REQUESTS, 'Request ID', requestId);
    pdv2UpdateRowObject_(PDV2.SHEETS.BOT_REQUESTS, reqRow, {
      'Updated At': pdv2Now_(),
      'Status': status,
      'Result JSON': pdv2SafeJson_(processResult),
      'Error Message': processResult.ok ? '' : processResult.error,
      'Completed At': pdv2Now_()
    });

    return pdv2Success_({
      requestId: requestId,
      status: status,
      actionType: actionType,
      result: processResult
    });
  });
}

function pdv2ProcessBotRequest_(requestId, actionType, data) {
  try {
    if (actionType === 'GOOGLE_TEST' || actionType === 'TEST' || actionType === 'TEST_GOOGLE_POST') {
      var action = pdv2CreateBotAction_({
        requestId: requestId,
        actionType: 'GOOGLE_TEST_RESULT',
        targetDiscordId: pdv2Pick_(data, ['submittedByDiscordId', 'targetDiscordId'], ''),
        payload: {
          message: 'Google received the test request successfully.',
          requestId: requestId,
          serverName: pdv2GetConfigValue_('SERVER_NAME', PDV2.DEFAULTS.SERVER_NAME),
          instanceMode: PDV2.INSTANCE_MODE
        }
      });
      return pdv2Success_({ message: 'Test request received and pending bot action created.', createdAction: action });
    }

    if (actionType === 'PROMOTE' || actionType === 'DEMOTE' || actionType === 'SET_RANK') {
      var rankResult = pdv2SetDatabaseRank_(data, {
        source: pdv2Pick_(data, ['source'], 'DISCORD_BOT'),
        actor: pdv2Pick_(data, ['submittedByDiscordId', 'actorDiscordId'], ''),
        requestId: requestId
      });

      pdv2CreateBotAction_({
        requestId: requestId,
        actionType: 'OFFICER_MANAGEMENT_RESULT',
        targetDiscordId: pdv2Pick_(data, ['targetDiscordId', 'discordId'], ''),
        payload: {
          actionType: actionType,
          requestId: requestId,
          result: rankResult
        }
      });
      return rankResult;
    }

    if (actionType === 'TERMINATION' || actionType === 'RESIGNATION') {
      var statusValue = actionType === 'TERMINATION' ? 'Terminated' : 'Resigned';
      var statusResult = pdv2SetDatabaseStatus_(Object.assign({}, data, {
        status: statusValue,
        clearRank: true
      }), {
        source: pdv2Pick_(data, ['source'], 'DISCORD_BOT'),
        actor: pdv2Pick_(data, ['submittedByDiscordId', 'actorDiscordId'], ''),
        requestId: requestId
      });

      pdv2AppendDisciplineRecord_(Object.assign({}, data, { actionType: actionType }), requestId);
      pdv2CreateBotAction_({
        requestId: requestId,
        actionType: 'OFFICER_STATUS_RESULT',
        targetDiscordId: pdv2Pick_(data, ['targetDiscordId', 'discordId'], ''),
        payload: { actionType: actionType, requestId: requestId, result: statusResult }
      });
      return statusResult;
    }

    if (actionType === 'COACHING' || actionType === 'STRIKE') {
      var disc = pdv2AppendDisciplineRecord_(data, requestId);
      pdv2CreateBotAction_({
        requestId: requestId,
        actionType: 'DISCIPLINE_RECORD_RESULT',
        targetDiscordId: pdv2Pick_(data, ['targetDiscordId', 'discordId'], ''),
        payload: { actionType: actionType, requestId: requestId, result: disc }
      });
      return disc;
    }

    if (actionType === 'TRAINING_COMPLETE') {
      var training = pdv2AppendTrainingRecord_(data, requestId);
      pdv2CreateBotAction_({
        requestId: requestId,
        actionType: 'TRAINING_RECORD_RESULT',
        targetDiscordId: pdv2Pick_(data, ['targetDiscordId', 'discordId'], ''),
        payload: { actionType: actionType, requestId: requestId, result: training }
      });
      return training;
    }

    pdv2CreateBotAction_({
      requestId: requestId,
      actionType: 'GENERIC_REQUEST_RECEIVED',
      targetDiscordId: pdv2Pick_(data, ['submittedByDiscordId', 'targetDiscordId'], ''),
      payload: {
        message: 'Google received an unhandled request type. It was stored but no workflow has been attached yet.',
        actionType: actionType,
        requestId: requestId
      }
    });

    return pdv2Success_({ message: 'Request stored. No specific processor exists yet for ' + actionType + '.' });
  } catch (err) {
    pdv2Log_('ERROR', requestId, 'BOT_REQUEST_PROCESS_FAILED', String(err), { stack: err && err.stack ? String(err.stack) : '' });
    return pdv2Fail_(String(err));
  }
}

function pdv2GetRequestStatus_(requestId) {
  var row = pdv2FindRowByValue_(PDV2.SHEETS.BOT_REQUESTS, 'Request ID', requestId);
  if (!row) return pdv2Fail_('Request not found.', { requestId: requestId });
  var record = pdv2RowToObject_(pdv2EnsureSheet_(PDV2.SHEETS.BOT_REQUESTS), row);
  var actions = pdv2ListRows_(PDV2.SHEETS.BOT_ACTIONS).filter(function(action) {
    return pdv2String_(action['Request ID']) === pdv2String_(requestId);
  });
  return pdv2Success_({ request: record, actions: actions });
}
