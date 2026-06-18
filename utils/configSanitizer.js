function maskSecret(value) {
  if (!value) return 'NOT SET';
  const text = String(value);
  if (text.length <= 8) return 'SET';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function sanitizeConfigForDisplay(config) {
  const sanitized = JSON.parse(JSON.stringify(config || {}));

  if (sanitized.google) {
    sanitized.google.webhookUrl = sanitized.google.webhookUrl ? 'SET' : 'NOT SET';
    sanitized.google.pollingUrl = sanitized.google.pollingUrl ? maskSecret(sanitized.google.pollingUrl) : 'NOT SET';
  }

  return sanitized;
}

module.exports = {
  maskSecret,
  sanitizeConfigForDisplay
};
