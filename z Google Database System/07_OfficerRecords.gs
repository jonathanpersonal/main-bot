function gsv2GetOfficerByDiscordId_(body) {
  gsv2RequireBotSecret_(body);

  const discordUserId = gsv2StringOrBlank_(body.discordUserId || body.targetDiscordId);
  const guildId = gsv2StringOrBlank_(body.guildId);
  const departmentKey = gsv2StringOrBlank_(body.departmentKey || gsv2GetConfigValue_('DEFAULT_DEPARTMENT_KEY', 'main'));

  gsv2Require_(discordUserId, 'Missing discordUserId.');

  const rows = gsv2ReadAllObjects_(GSV2.sheets.officerRecords);

  for (let i = 0; i < rows.length; i++) {
    const obj = rows[i].object;
    if (String(obj.DiscordUserId) !== discordUserId) continue;
    if (guildId && String(obj.GuildId) !== guildId) continue;
    if (departmentKey && String(obj.DepartmentKey) !== departmentKey) continue;

    return { found: true, officer: obj };
  }

  return { found: false, discordUserId: discordUserId };
}

function gsv2UpsertOfficer_(body) {
  gsv2RequireBotSecret_(body);

  return gsv2WithLock_(function () {
    const payload = body.payload || body.officer || {};
    const now = gsv2NowIso_();
    const guildId = gsv2StringOrBlank_(body.guildId || payload.guildId);
    const departmentKey = gsv2StringOrBlank_(body.departmentKey || payload.departmentKey || gsv2GetConfigValue_('DEFAULT_DEPARTMENT_KEY', 'main'));
    const discordUserId = gsv2StringOrBlank_(body.discordUserId || payload.discordUserId || payload.DiscordUserId);

    gsv2Require_(guildId, 'Missing guildId.');
    gsv2Require_(discordUserId, 'Missing discordUserId.');

    const rows = gsv2ReadAllObjects_(GSV2.sheets.officerRecords);
    let found = null;

    for (let i = 0; i < rows.length; i++) {
      const obj = rows[i].object;
      if (String(obj.GuildId) === guildId &&
          String(obj.DepartmentKey) === departmentKey &&
          String(obj.DiscordUserId) === discordUserId) {
        found = rows[i];
        break;
      }
    }

    const base = {
      UpdatedAt: now,
      GuildId: guildId,
      DepartmentKey: departmentKey,
      DiscordUserId: discordUserId,
      DiscordUsername: gsv2StringOrBlank_(payload.discordUsername || payload.DiscordUsername),
      DisplayName: gsv2StringOrBlank_(payload.displayName || payload.DisplayName),
      Callsign: gsv2StringOrBlank_(payload.callsign || payload.Callsign),
      CurrentRankKey: gsv2StringOrBlank_(payload.currentRankKey || payload.CurrentRankKey),
      CurrentRankName: gsv2StringOrBlank_(payload.currentRankName || payload.CurrentRankName),
      Status: gsv2StringOrBlank_(payload.status || payload.Status || 'ACTIVE'),
      HireDate: gsv2StringOrBlank_(payload.hireDate || payload.HireDate),
      LeaveDate: gsv2StringOrBlank_(payload.leaveDate || payload.LeaveDate),
      ProbationStartDate: gsv2StringOrBlank_(payload.probationStartDate || payload.ProbationStartDate),
      ProbationEndDate: gsv2StringOrBlank_(payload.probationEndDate || payload.ProbationEndDate),
      AssignedTrainingOfficerDiscordId: gsv2StringOrBlank_(payload.assignedTrainingOfficerDiscordId || payload.AssignedTrainingOfficerDiscordId),
      Steam64: gsv2StringOrBlank_(payload.steam64 || payload.Steam64),
      Email: gsv2StringOrBlank_(payload.email || payload.Email),
      Notes: gsv2StringOrBlank_(payload.notes || payload.Notes)
    };

    let officer;

    if (found) {
      officer = gsv2UpdateRowObject_(GSV2.sheets.officerRecords, found.rowNumber, base);
    } else {
      officer = Object.assign({
        OfficerId: gsv2MakeId_('OFF'),
        CreatedAt: now
      }, base);

      gsv2AppendObject_(GSV2.sheets.officerRecords, officer);
    }

    gsv2Audit_({
      actor: gsv2StringOrBlank_(body.submittedByDiscordId || payload.submittedByDiscordId),
      source: 'DISCORD_BOT',
      eventType: found ? 'OFFICER_UPDATED' : 'OFFICER_CREATED',
      entityType: 'OfficerRecord',
      entityId: officer.OfficerId,
      requestId: gsv2StringOrBlank_(body.requestId || payload.requestId),
      guildId: guildId,
      departmentKey: departmentKey,
      details: officer
    });

    return { officer: officer, created: !found };
  });
}

function gsv2FindOfficerInternal_(guildId, departmentKey, discordUserId) {
  const rows = gsv2ReadAllObjects_(GSV2.sheets.officerRecords);

  for (let i = 0; i < rows.length; i++) {
    const obj = rows[i].object;
    if (String(obj.GuildId) === String(guildId) &&
        String(obj.DepartmentKey) === String(departmentKey) &&
        String(obj.DiscordUserId) === String(discordUserId)) {
      return rows[i];
    }
  }

  return null;
}
