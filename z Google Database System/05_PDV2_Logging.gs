/*************************************************************
 * Department Database v2
 * File: 05_PDV2_Logging.gs
 *************************************************************/

function pdv2Log_(level, runId, event, message, meta) {
  try {
    pdv2AppendObject_(PDV2.SHEETS.SCRIPT_LOGS, {
      'Timestamp': pdv2Now_(),
      'Level': level || 'INFO',
      'Run ID': runId || '',
      'Event': event || '',
      'Message': message || '',
      'Meta JSON': pdv2SafeJson_(meta || {})
    });
  } catch (err) {
    // Avoid recursive logging failures.
    console.log('pdv2Log_ failed: ' + err);
  }
}

function pdv2Audit_(source, eventType, actor, entityType, entityId, requestId, details) {
  try {
    var auditId = pdv2GenerateId_('AUD');
    pdv2AppendObject_(PDV2.SHEETS.AUDIT_LOG, {
      'Audit ID': auditId,
      'Created At': pdv2Now_(),
      'Source': source || 'SYSTEM',
      'Event Type': eventType || '',
      'Actor': actor || '',
      'Entity Type': entityType || '',
      'Entity ID': entityId || '',
      'Request ID': requestId || '',
      'Details JSON': pdv2SafeJson_(details || {})
    });
    return auditId;
  } catch (err) {
    pdv2Log_('ERROR', 'AUDIT', 'AUDIT_WRITE_FAILED', String(err), { eventType: eventType, entityType: entityType, entityId: entityId });
    return '';
  }
}
