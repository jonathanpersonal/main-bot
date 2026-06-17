/*************************************************************
 * Department Database v2
 * File: 10_PDV2_Records.gs
 * -----------------------------------------------------------
 * Training, discipline, and staff-access helpers.
 *************************************************************/

function pdv2AppendTrainingRecord_(data, requestId) {
  data = data || {};
  var trainingId = pdv2GenerateId_('TRN');
  pdv2AppendObject_(PDV2.SHEETS.TRAINING_RECORDS, {
    'Training ID': trainingId,
    'Created At': pdv2Now_(),
    'Discord ID': pdv2Pick_(data, ['targetDiscordId', 'discordId'], ''),
    'Name': pdv2Pick_(data, ['targetName', 'name'], ''),
    'Training Type': pdv2Pick_(data, ['trainingType', 'type'], 'Training'),
    'Training Officer Discord ID': pdv2Pick_(data, ['trainingOfficerDiscordId', 'trainerDiscordId'], ''),
    'Status': pdv2Pick_(data, ['status'], 'Completed'),
    'Completed At': pdv2Pick_(data, ['completedAt'], pdv2Now_()),
    'Notes': pdv2Pick_(data, ['notes', 'reason'], ''),
    'Request ID': requestId || ''
  });
  pdv2Audit_('DISCORD_BOT', 'TRAINING_RECORD_CREATED', pdv2Pick_(data, ['submittedByDiscordId'], ''), 'TrainingRecords', trainingId, requestId || '', {});
  return pdv2Success_({ trainingId: trainingId });
}

function pdv2AppendDisciplineRecord_(data, requestId) {
  data = data || {};
  var disciplineId = pdv2GenerateId_('DISC');
  pdv2AppendObject_(PDV2.SHEETS.DISCIPLINE_RECORDS, {
    'Discipline ID': disciplineId,
    'Created At': pdv2Now_(),
    'Discord ID': pdv2Pick_(data, ['targetDiscordId', 'discordId'], ''),
    'Name': pdv2Pick_(data, ['targetName', 'name'], ''),
    'Action Type': pdv2Upper_(pdv2Pick_(data, ['actionType'], 'DISCIPLINE')),
    'Strike Level': pdv2Pick_(data, ['strikeLevel'], ''),
    'Reason': pdv2Pick_(data, ['reason'], ''),
    'Evidence': pdv2Pick_(data, ['evidence'], ''),
    'Notes': pdv2Pick_(data, ['notes', 'comments'], ''),
    'Submitted By Discord ID': pdv2Pick_(data, ['submittedByDiscordId'], ''),
    'Request ID': requestId || ''
  });
  pdv2Audit_('DISCORD_BOT', 'DISCIPLINE_RECORD_CREATED', pdv2Pick_(data, ['submittedByDiscordId'], ''), 'DisciplineRecords', disciplineId, requestId || '', {});
  return pdv2Success_({ disciplineId: disciplineId });
}

function pdv2UpsertStaffAccess_(input) {
  input = input || {};
  var email = pdv2String_(pdv2Pick_(input, ['email', 'Email']));
  if (!email) return pdv2Fail_('Missing email for StaffAccess.');

  var row = pdv2FindRowByValue_(PDV2.SHEETS.STAFF_ACCESS, 'Email', email);
  var obj = {
    'Email': email,
    'Discord ID': pdv2Pick_(input, ['discordId', 'Discord ID'], ''),
    'Display Name': pdv2Pick_(input, ['displayName', 'Display Name'], email),
    'Access Level': pdv2Pick_(input, ['accessLevel', 'Access Level'], 'VIEWER'),
    'Active': pdv2Bool_(pdv2Pick_(input, ['active', 'Active'], true), true) ? 'TRUE' : 'FALSE',
    'Notes': pdv2Pick_(input, ['notes', 'Notes'], ''),
    'Updated At': pdv2Now_()
  };

  if (row) {
    pdv2UpdateRowObject_(PDV2.SHEETS.STAFF_ACCESS, row, obj);
  } else {
    pdv2AppendObject_(PDV2.SHEETS.STAFF_ACCESS, obj);
  }
  return pdv2Success_({ email: email, access: obj });
}
