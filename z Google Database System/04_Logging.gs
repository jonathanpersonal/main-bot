function gsv2LogScript_(level, route, message, details) {
  try {
    gsv2AppendObject_(GSV2.sheets.scriptLogs, {
      LogId: gsv2MakeId_('LOG'),
      CreatedAt: gsv2NowIso_(),
      Level: level || 'INFO',
      Route: route || '',
      Message: message || '',
      DetailsJson: gsv2SafeJson_(details || {})
    });
  } catch (error) {
    console.error('Failed to write ScriptLogs row:', error);
  }
}

function gsv2Audit_(event) {
  const details = event.details || event.DetailsJson || {};

  return gsv2AppendObject_(GSV2.sheets.auditLog, {
    AuditId: gsv2MakeId_('AUD'),
    CreatedAt: gsv2NowIso_(),
    Actor: event.actor || event.Actor || '',
    Source: event.source || event.Source || 'GOOGLE_SYSTEM_V2',
    EventType: event.eventType || event.EventType || '',
    EntityType: event.entityType || event.EntityType || '',
    EntityId: event.entityId || event.EntityId || '',
    RequestId: event.requestId || event.RequestId || '',
    GuildId: event.guildId || event.GuildId || '',
    DepartmentKey: event.departmentKey || event.DepartmentKey || '',
    DetailsJson: gsv2SafeJson_(details)
  });
}
