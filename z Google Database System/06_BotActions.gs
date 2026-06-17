function gsv2CreateBotAction_(input) {
  const now = gsv2NowIso_();
  const actionId = gsv2MakeId_('ACT');

  const action = {
    ActionId: actionId,
    RequestId: gsv2StringOrBlank_(input.requestId),
    CreatedAt: now,
    UpdatedAt: now,
    Status: GSV2.actionStatuses.pending,
    GuildId: gsv2StringOrBlank_(input.guildId),
    DepartmentKey: gsv2StringOrBlank_(input.departmentKey),
    ActionType: gsv2StringOrBlank_(input.actionType).toUpperCase(),
    TargetDiscordId: gsv2StringOrBlank_(input.targetDiscordId),
    PayloadJson: gsv2SafeJson_(input.payload || {}),
    Attempts: 0,
    LastAttemptAt: '',
    CompletedAt: '',
    ErrorMessage: ''
  };

  gsv2AppendObject_(GSV2.sheets.botActions, action);

  gsv2Audit_({
    actor: 'GOOGLE_SYSTEM_V2',
    source: 'GOOGLE_SYSTEM_V2',
    eventType: 'BOT_ACTION_CREATED',
    entityType: 'BotAction',
    entityId: actionId,
    requestId: action.RequestId,
    guildId: action.GuildId,
    departmentKey: action.DepartmentKey,
    details: {
      actionType: action.ActionType,
      targetDiscordId: action.TargetDiscordId,
      payload: input.payload || {}
    }
  });

  return action;
}

function gsv2GetPendingBotActions_(body) {
  gsv2RequireBotSecret_(body);

  return gsv2WithLock_(function () {
    const guildId = gsv2StringOrBlank_(body.guildId);
    const limit = Math.max(1, Math.min(Number(body.limit || 10), 25));
    const now = gsv2NowIso_();
    const rows = gsv2ReadAllObjects_(GSV2.sheets.botActions);
    const actions = [];

    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      const obj = entry.object;

      if (String(obj.Status) !== GSV2.actionStatuses.pending) continue;
      if (guildId && String(obj.GuildId) !== guildId) continue;

      const attempts = Number(obj.Attempts || 0) + 1;

      const updated = gsv2UpdateRowObject_(GSV2.sheets.botActions, entry.rowNumber, {
        UpdatedAt: now,
        Status: GSV2.actionStatuses.inProgress,
        Attempts: attempts,
        LastAttemptAt: now
      });

      actions.push({
        actionId: updated.ActionId,
        requestId: updated.RequestId,
        actionType: updated.ActionType,
        targetDiscordId: updated.TargetDiscordId,
        guildId: updated.GuildId,
        departmentKey: updated.DepartmentKey,
        attempts: attempts,
        payload: gsv2ParseJsonCell_(updated.PayloadJson, {})
      });

      if (actions.length >= limit) break;
    }

    return { actions: actions };
  });
}

function gsv2MarkBotActionComplete_(body) {
  gsv2RequireBotSecret_(body);

  return gsv2WithLock_(function () {
    const actionId = gsv2StringOrBlank_(body.actionId);
    gsv2Require_(actionId, 'Missing actionId.');

    const found = gsv2FindFirstByField_(GSV2.sheets.botActions, 'ActionId', actionId);
    if (!found) return { found: false, actionId: actionId };

    const now = gsv2NowIso_();
    const updated = gsv2UpdateRowObject_(GSV2.sheets.botActions, found.rowNumber, {
      UpdatedAt: now,
      Status: GSV2.actionStatuses.completed,
      CompletedAt: now,
      ErrorMessage: ''
    });

    gsv2Audit_({
      actor: 'DISCORD_BOT',
      source: 'DISCORD_BOT',
      eventType: 'BOT_ACTION_COMPLETED',
      entityType: 'BotAction',
      entityId: actionId,
      requestId: updated.RequestId,
      guildId: updated.GuildId,
      departmentKey: updated.DepartmentKey,
      details: body.result || {}
    });

    gsv2MaybeCompleteRequestFromActions_(updated.RequestId);

    return { found: true, actionId: actionId, status: GSV2.actionStatuses.completed };
  });
}

function gsv2MarkBotActionFailed_(body) {
  gsv2RequireBotSecret_(body);

  return gsv2WithLock_(function () {
    const actionId = gsv2StringOrBlank_(body.actionId);
    gsv2Require_(actionId, 'Missing actionId.');

    const found = gsv2FindFirstByField_(GSV2.sheets.botActions, 'ActionId', actionId);
    if (!found) return { found: false, actionId: actionId };

    const updated = gsv2UpdateRowObject_(GSV2.sheets.botActions, found.rowNumber, {
      UpdatedAt: gsv2NowIso_(),
      Status: GSV2.actionStatuses.failed,
      ErrorMessage: gsv2StringOrBlank_(body.errorMessage || 'Bot action failed.')
    });

    gsv2Audit_({
      actor: 'DISCORD_BOT',
      source: 'DISCORD_BOT',
      eventType: 'BOT_ACTION_FAILED',
      entityType: 'BotAction',
      entityId: actionId,
      requestId: updated.RequestId,
      guildId: updated.GuildId,
      departmentKey: updated.DepartmentKey,
      details: {
        errorMessage: body.errorMessage || 'Bot action failed.',
        result: body.result || {}
      }
    });

    return { found: true, actionId: actionId, status: GSV2.actionStatuses.failed };
  });
}

function gsv2MaybeCompleteRequestFromActions_(requestId) {
  if (!requestId) return;

  const relatedActions = gsv2FindAllByField_(GSV2.sheets.botActions, 'RequestId', requestId);
  if (!relatedActions.length) return;

  const hasOpenAction = relatedActions.some(function (entry) {
    const status = String(entry.object.Status || '');
    return status === GSV2.actionStatuses.pending || status === GSV2.actionStatuses.inProgress;
  });

  if (!hasOpenAction) {
    gsv2MarkRequestCompleted_(requestId, { completedBy: 'all_bot_actions_completed' });
  }
}
