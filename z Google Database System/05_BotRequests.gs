function gsv2SubmitBotRequest_(body) {
  gsv2RequireBotSecret_(body);

  return gsv2WithLock_(function () {
    const now = gsv2NowIso_();
    const payload = body.payload || {};
    const actionType = gsv2StringOrBlank_(body.actionType || payload.actionType).trim().toUpperCase();

    gsv2Require_(actionType, 'Missing actionType.');
    gsv2Require_(body.guildId, 'Missing guildId.');

    const requestId = gsv2MakeId_('REQ');
    const departmentKey = gsv2StringOrBlank_(body.departmentKey || payload.departmentKey || gsv2GetConfigValue_('DEFAULT_DEPARTMENT_KEY', 'main'));

    const request = {
      RequestId: requestId,
      CreatedAt: now,
      UpdatedAt: now,
      Status: GSV2.requestStatuses.received,
      GuildId: gsv2StringOrBlank_(body.guildId),
      DepartmentKey: departmentKey,
      ActionType: actionType,
      SubmittedByDiscordId: gsv2StringOrBlank_(body.submittedByDiscordId || payload.submittedByDiscordId),
      SubmittedByDiscordTag: gsv2StringOrBlank_(body.submittedByDiscordTag || payload.submittedByDiscordTag),
      TargetDiscordId: gsv2StringOrBlank_(body.targetDiscordId || payload.targetDiscordId),
      TargetDiscordTag: gsv2StringOrBlank_(body.targetDiscordTag || payload.targetDiscordTag),
      PayloadJson: gsv2SafeJson_(payload),
      ResultJson: '',
      ErrorMessage: '',
      CompletedAt: ''
    };

    gsv2AppendObject_(GSV2.sheets.botRequests, request);

    gsv2Audit_({
      actor: request.SubmittedByDiscordId,
      source: 'DISCORD_BOT',
      eventType: 'BOT_REQUEST_RECEIVED',
      entityType: 'BotRequest',
      entityId: requestId,
      requestId: requestId,
      guildId: request.GuildId,
      departmentKey: request.DepartmentKey,
      details: {
        actionType: actionType,
        targetDiscordId: request.TargetDiscordId,
        payload: payload
      }
    });

    gsv2HandleRequestSideEffects_(request, payload);

    return {
      requestId: requestId,
      status: request.Status,
      actionType: actionType,
      departmentKey: departmentKey
    };
  });
}

function gsv2HandleRequestSideEffects_(request, payload) {
  const actionType = String(request.ActionType || '').toUpperCase();

  if (actionType === 'GOOGLE_TEST' || actionType === 'PING_TEST') {
    gsv2CreateBotAction_({
      requestId: request.RequestId,
      guildId: request.GuildId,
      departmentKey: request.DepartmentKey,
      actionType: 'LOG_MESSAGE',
      targetDiscordId: request.SubmittedByDiscordId,
      payload: {
        message: 'Google System v2 received your test request.',
        requestId: request.RequestId,
        receivedAt: request.CreatedAt
      }
    });

    return;
  }

  if (actionType === 'PROMOTE' || actionType === 'DEMOTE') {
    gsv2ProcessRankMovementRequest_(request, payload);
    return;
  }

  if (actionType === 'COACHING' || actionType === 'STRIKE' || actionType === 'TERMINATION' || actionType === 'RESIGNATION') {
    gsv2CreateDisciplineRecordFromRequest_(request, payload);
    return;
  }

  if (actionType === 'TRAINING_COMPLETE') {
    gsv2CreateTrainingRecordFromRequest_(request, payload);
    return;
  }
}

function gsv2GetRequestStatus_(body) {
  gsv2RequireBotSecret_(body);

  const requestId = gsv2StringOrBlank_(body.requestId);
  gsv2Require_(requestId, 'Missing requestId.');

  const found = gsv2FindFirstByField_(GSV2.sheets.botRequests, 'RequestId', requestId);
  if (!found) return { found: false, requestId: requestId };

  const obj = found.object;
  obj.Payload = gsv2ParseJsonCell_(obj.PayloadJson, {});
  obj.Result = gsv2ParseJsonCell_(obj.ResultJson, {});

  return {
    found: true,
    request: obj
  };
}

function gsv2MarkRequestCompleted_(requestId, result) {
  const found = gsv2FindFirstByField_(GSV2.sheets.botRequests, 'RequestId', requestId);
  if (!found) return null;

  return gsv2UpdateRowObject_(GSV2.sheets.botRequests, found.rowNumber, {
    UpdatedAt: gsv2NowIso_(),
    Status: GSV2.requestStatuses.completed,
    ResultJson: gsv2SafeJson_(result || {}),
    CompletedAt: gsv2NowIso_(),
    ErrorMessage: ''
  });
}

function gsv2MarkRequestFailed_(requestId, errorMessage, result) {
  const found = gsv2FindFirstByField_(GSV2.sheets.botRequests, 'RequestId', requestId);
  if (!found) return null;

  return gsv2UpdateRowObject_(GSV2.sheets.botRequests, found.rowNumber, {
    UpdatedAt: gsv2NowIso_(),
    Status: GSV2.requestStatuses.failed,
    ResultJson: gsv2SafeJson_(result || {}),
    ErrorMessage: errorMessage || 'Request failed.'
  });
}
