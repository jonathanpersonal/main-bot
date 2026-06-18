const { postToGoogle } = require('./googleWebhook');
const store = require('./workflowStore');
const { getGuildConfig } = require('./guildConfigStore');
const { isGoogleEnabled, isGoogleConfigured, warnGoogleMisconfiguredOnce } = require('./googleConfigUtils');

function normalizeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function normalizeCadet(row = {}, guildId = '') {
  return {
    guildId,
    discordId: String(row.discordId || row['Discord ID'] || ''),
    discordUsername: row.discordUsername || row['Discord Username'] || '',
    dbName: row.dbName || row.name || row.Name || row['Name (DO NOT TOUCH)'] || '',
    status: String(row.status || row.Status || '').toUpperCase(),
    deadlineAt: normalizeDate(row.deadlineAt || row['Current End Date'] || row['End Date'] || row['Manual End Date']),
    reminderLastSentAt: normalizeDate(row.reminderLastSentAt || row['Last Reminder Sent At']),
    notes: row.notes || row.Notes || '',
    requestId: row.requestId || row['Request ID'] || ''
  };
}

function normalizeProbation(row = {}, guildId = '') {
  return {
    guildId,
    discordId: String(row.discordId || row['Discord ID'] || ''),
    discordUsername: row.discordUsername || row['Discord Username'] || '',
    dbName: row.dbName || row['Database Name'] || row.Name || '',
    callsign: row.callsign || row.Callsign || '',
    trainingOfficerId: row.trainingOfficerId || row['Training Officer Discord ID'] || '',
    probationStartAt: normalizeDate(row.probationStartAt || row['Probation Start']),
    cycleStartAt: normalizeDate(row.cycleStartAt || row['Current Cycle Start']),
    cycleEndAt: normalizeDate(row.cycleEndAt || row['Current Cycle End']),
    cycleNumber: Number(row.cycleNumber || row['Cycle Number'] || 1),
    maxCycles: Number(row.maxCycles || row['Max Cycles'] || 2),
    status: String(row.status || row.Status || '').toUpperCase(),
    rideAlongCount: Number(row.rideAlongCount || row['Ride-along Count'] || 0),
    feedbackCount: Number(row.feedbackCount || row['Feedback Count'] || 0),
    notes: row.notes || row.Notes || '',
    updatedBy: row.updatedBy || row['Updated By'] || '',
    finalDecision: row.finalDecision || row['Final Decision'] || '',
    graduationAt: normalizeDate(row.graduationAt || row['Graduation Date']),
    requestId: row.requestId || row['Request ID'] || ''
  };
}

function canReadGoogle(guildId) {
  const cfg = getGuildConfig(guildId);
  if (!isGoogleEnabled(cfg)) return false;
  if (!isGoogleConfigured(cfg)) { warnGoogleMisconfiguredOnce(guildId, cfg); return false; }
  return true;
}

async function safeListActiveCadets(guildId) {
  if (!canReadGoogle(guildId)) return null;
  try {
    const result = await postToGoogle('listTrainingCadets', { guildId });
    return (result.cadets || []).map((row) => normalizeCadet(row, guildId)).filter((row) => row.discordId);
  } catch (error) {
    console.warn('Google cadet roster read failed; using local workflow cache fallback:', error.message);
    return null;
  }
}

async function safeListActiveProbation(guildId) {
  if (!canReadGoogle(guildId)) return null;
  try {
    const result = await postToGoogle('listProbationaryOfficers', { guildId });
    return (result.probationary || []).map((row) => normalizeProbation(row, guildId)).filter((row) => row.discordId);
  } catch (error) {
    console.warn('Google probation roster read failed; using local workflow cache fallback:', error.message);
    return null;
  }
}

async function safeGetProbation(guildId, discordId) {
  if (!canReadGoogle(guildId)) return store.getProbation(guildId, discordId);
  try {
    const result = await postToGoogle('getProbationaryOfficer', { guildId, discordId });
    return result.probation ? normalizeProbation(result.probation, guildId) : null;
  } catch (error) {
    console.warn('Google probation record read failed; using local workflow cache fallback:', error.message);
    return store.getProbation(guildId, discordId);
  }
}

module.exports = {
  normalizeCadet,
  normalizeProbation,
  safeListActiveCadets,
  safeListActiveProbation,
  safeGetProbation
};
