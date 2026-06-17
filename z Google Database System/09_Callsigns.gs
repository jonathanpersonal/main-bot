function gsv2ReserveNextCallsign_(input) {
  const guildId = gsv2StringOrBlank_(input.guildId);
  const departmentKey = gsv2StringOrBlank_(input.departmentKey || gsv2GetConfigValue_('DEFAULT_DEPARTMENT_KEY', 'main'));
  const officerId = gsv2StringOrBlank_(input.officerId);
  const discordUserId = gsv2StringOrBlank_(input.discordUserId);
  const requestId = gsv2StringOrBlank_(input.requestId);

  const start = Number(gsv2GetConfigValue_('CALLSIGN_START', 100));
  const end = Number(gsv2GetConfigValue_('CALLSIGN_END', 999));
  const existing = gsv2ReadAllObjects_(GSV2.sheets.callsignRegistry);
  const unavailable = {};

  existing.forEach(function (entry) {
    const obj = entry.object;
    if (String(obj.GuildId) !== guildId) return;
    if (String(obj.DepartmentKey) !== departmentKey) return;
    if (String(obj.Status) === 'RELEASED') return;
    unavailable[String(obj.Callsign)] = true;
  });

  let selected = '';
  for (let n = start; n <= end; n++) {
    const candidate = String(n);
    if (!unavailable[candidate]) {
      selected = candidate;
      break;
    }
  }

  if (!selected) throw new Error('No callsigns available in configured range.');

  const now = gsv2NowIso_();

  gsv2AppendObject_(GSV2.sheets.callsignRegistry, {
    Callsign: selected,
    Status: 'RESERVED',
    GuildId: guildId,
    DepartmentKey: departmentKey,
    OfficerId: officerId,
    DiscordUserId: discordUserId,
    ReservedAt: now,
    AssignedAt: '',
    ReleasedAt: '',
    RequestId: requestId,
    Notes: ''
  });

  gsv2AppendObject_(GSV2.sheets.callsignHistory, {
    HistoryId: gsv2MakeId_('CSH'),
    CreatedAt: now,
    Callsign: selected,
    ActionType: 'RESERVED',
    GuildId: guildId,
    DepartmentKey: departmentKey,
    OfficerId: officerId,
    DiscordUserId: discordUserId,
    RequestId: requestId,
    DetailsJson: gsv2SafeJson_(input)
  });

  return selected;
}

function gsv2AssignReservedCallsign_(input) {
  const callsign = gsv2StringOrBlank_(input.callsign);
  gsv2Require_(callsign, 'Missing callsign.');

  const found = gsv2FindFirstByField_(GSV2.sheets.callsignRegistry, 'Callsign', callsign);
  if (!found) throw new Error('Callsign was not found in registry: ' + callsign);

  const now = gsv2NowIso_();
  const updated = gsv2UpdateRowObject_(GSV2.sheets.callsignRegistry, found.rowNumber, {
    Status: 'ASSIGNED',
    AssignedAt: now,
    OfficerId: input.officerId || found.object.OfficerId,
    DiscordUserId: input.discordUserId || found.object.DiscordUserId,
    RequestId: input.requestId || found.object.RequestId
  });

  gsv2AppendObject_(GSV2.sheets.callsignHistory, {
    HistoryId: gsv2MakeId_('CSH'),
    CreatedAt: now,
    Callsign: callsign,
    ActionType: 'ASSIGNED',
    GuildId: updated.GuildId,
    DepartmentKey: updated.DepartmentKey,
    OfficerId: updated.OfficerId,
    DiscordUserId: updated.DiscordUserId,
    RequestId: updated.RequestId,
    DetailsJson: gsv2SafeJson_(input)
  });

  return updated;
}
