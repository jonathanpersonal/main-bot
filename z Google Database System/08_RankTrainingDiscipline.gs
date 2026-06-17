function gsv2ProcessRankMovementRequest_(request, payload) {
  const now = gsv2NowIso_();
  const guildId = request.GuildId;
  const departmentKey = request.DepartmentKey;
  const discordUserId = request.TargetDiscordId;

  let officerEntry = discordUserId ? gsv2FindOfficerInternal_(guildId, departmentKey, discordUserId) : null;
  let officerId = officerEntry ? officerEntry.object.OfficerId : '';

  if (!officerEntry && discordUserId) {
    const created = gsv2UpsertOfficer_({
      secret: gsv2GetBotApiSecret_(),
      guildId: guildId,
      departmentKey: departmentKey,
      discordUserId: discordUserId,
      submittedByDiscordId: request.SubmittedByDiscordId,
      requestId: request.RequestId,
      payload: {
        discordUserId: discordUserId,
        discordUsername: request.TargetDiscordTag,
        displayName: request.TargetDiscordTag,
        currentRankKey: payload.newRankKey || '',
        currentRankName: payload.newRankName || '',
        status: 'ACTIVE'
      }
    });

    officerId = created.officer.OfficerId;
    officerEntry = { object: created.officer };
  }

  const oldRankKey = payload.oldRankKey || (officerEntry ? officerEntry.object.CurrentRankKey : '');
  const oldRankName = payload.oldRankName || (officerEntry ? officerEntry.object.CurrentRankName : '');
  const newRankKey = payload.newRankKey || '';
  const newRankName = payload.newRankName || '';

  gsv2AppendObject_(GSV2.sheets.rankHistory, {
    HistoryId: gsv2MakeId_('RH'),
    CreatedAt: now,
    OfficerId: officerId,
    GuildId: guildId,
    DepartmentKey: departmentKey,
    DiscordUserId: discordUserId,
    OldRankKey: oldRankKey,
    OldRankName: oldRankName,
    NewRankKey: newRankKey,
    NewRankName: newRankName,
    ActionType: request.ActionType,
    Reason: payload.reason || '',
    SubmittedByDiscordId: request.SubmittedByDiscordId,
    ApprovedByDiscordId: payload.approvedByDiscordId || request.SubmittedByDiscordId,
    RequestId: request.RequestId,
    DetailsJson: gsv2SafeJson_(payload)
  });

  if (officerEntry) {
    gsv2UpdateRowObject_(GSV2.sheets.officerRecords, officerEntry.rowNumber, {
      UpdatedAt: now,
      CurrentRankKey: newRankKey,
      CurrentRankName: newRankName,
      Status: 'ACTIVE'
    });
  }

  gsv2CreateBotAction_({
    requestId: request.RequestId,
    guildId: guildId,
    departmentKey: departmentKey,
    actionType: 'LOG_MESSAGE',
    targetDiscordId: request.SubmittedByDiscordId,
    payload: {
      message: request.ActionType + ' recorded in Google for ' + discordUserId,
      oldRankName: oldRankName,
      newRankName: newRankName,
      requestId: request.RequestId
    }
  });
}

function gsv2CreateTrainingRecordFromRequest_(request, payload) {
  const now = gsv2NowIso_();
  const officerEntry = request.TargetDiscordId
    ? gsv2FindOfficerInternal_(request.GuildId, request.DepartmentKey, request.TargetDiscordId)
    : null;

  gsv2AppendObject_(GSV2.sheets.trainingRecords, {
    TrainingId: gsv2MakeId_('TRN'),
    CreatedAt: now,
    UpdatedAt: now,
    OfficerId: officerEntry ? officerEntry.object.OfficerId : '',
    GuildId: request.GuildId,
    DepartmentKey: request.DepartmentKey,
    DiscordUserId: request.TargetDiscordId,
    TrainingType: payload.trainingType || '',
    TrainingOfficerDiscordId: payload.trainingOfficerDiscordId || request.SubmittedByDiscordId,
    Status: payload.status || 'COMPLETED',
    CompletedAt: payload.completedAt || now,
    Notes: payload.notes || '',
    RequestId: request.RequestId,
    DetailsJson: gsv2SafeJson_(payload)
  });

  gsv2CreateBotAction_({
    requestId: request.RequestId,
    guildId: request.GuildId,
    departmentKey: request.DepartmentKey,
    actionType: 'LOG_MESSAGE',
    targetDiscordId: request.SubmittedByDiscordId,
    payload: {
      message: 'Training completion recorded in Google.',
      requestId: request.RequestId
    }
  });
}

function gsv2CreateDisciplineRecordFromRequest_(request, payload) {
  const now = gsv2NowIso_();
  const officerEntry = request.TargetDiscordId
    ? gsv2FindOfficerInternal_(request.GuildId, request.DepartmentKey, request.TargetDiscordId)
    : null;

  gsv2AppendObject_(GSV2.sheets.disciplineRecords, {
    DisciplineId: gsv2MakeId_('DISC'),
    CreatedAt: now,
    UpdatedAt: now,
    OfficerId: officerEntry ? officerEntry.object.OfficerId : '',
    GuildId: request.GuildId,
    DepartmentKey: request.DepartmentKey,
    DiscordUserId: request.TargetDiscordId,
    ActionType: request.ActionType,
    StrikeLevel: payload.strikeLevel || '',
    Reason: payload.reason || '',
    Evidence: payload.evidence || '',
    Notes: payload.notes || payload.comments || '',
    SubmittedByDiscordId: request.SubmittedByDiscordId,
    RequestId: request.RequestId,
    DetailsJson: gsv2SafeJson_(payload)
  });

  gsv2CreateBotAction_({
    requestId: request.RequestId,
    guildId: request.GuildId,
    departmentKey: request.DepartmentKey,
    actionType: 'LOG_MESSAGE',
    targetDiscordId: request.SubmittedByDiscordId,
    payload: {
      message: request.ActionType + ' recorded in Google.',
      requestId: request.RequestId
    }
  });
}
