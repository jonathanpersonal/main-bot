const fs = require('fs');
const path = require('path');
const STORE_PATH = path.join(__dirname, '..', 'data', 'training-workflow.json');

function emptyStore() { return { cadets: {}, probationary: {}, audit: [], removalRequests: {} }; }
function ensureDir() { fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true }); }
function readStore() { try { return { ...emptyStore(), ...JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) }; } catch { return emptyStore(); } }
function writeStore(store) { ensureDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }
function key(guildId, userId) { return `${guildId}:${userId}`; }
function now() { return new Date().toISOString(); }
function addAudit(store, entry) { store.audit.push({ auditId: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, at: now(), ...entry }); }
function upsertCadet(guildId, userId, record, audit = {}) { const s = readStore(); const k = key(guildId, userId); s.cadets[k] = { ...(s.cadets[k] || {}), guildId, discordId: userId, updatedAt: now(), ...record }; addAudit(s, { type: 'CADET', guildId, targetDiscordId: userId, ...audit }); writeStore(s); return s.cadets[k]; }
function getCadet(guildId, userId) { return readStore().cadets[key(guildId, userId)] || null; }
function listCadets(guildId) { return Object.values(readStore().cadets).filter((r) => r.guildId === guildId && !['TERMINATED','COMPLETED','FAILED'].includes(r.status)); }
function upsertProbation(guildId, userId, record, audit = {}) { const s = readStore(); const k = key(guildId, userId); s.probationary[k] = { ...(s.probationary[k] || {}), guildId, discordId: userId, updatedAt: now(), ...record }; addAudit(s, { type: 'PROBATION', guildId, targetDiscordId: userId, ...audit }); writeStore(s); return s.probationary[k]; }
function getProbation(guildId, userId) { return readStore().probationary[key(guildId, userId)] || null; }
function listProbation(guildId) { return Object.values(readStore().probationary).filter((r) => r.guildId === guildId && !['PASSED','REMOVED'].includes(r.status)); }
module.exports = { readStore, writeStore, key, now, addAudit, upsertCadet, getCadet, listCadets, upsertProbation, getProbation, listProbation };
