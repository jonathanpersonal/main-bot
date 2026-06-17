function gsv2NowIso_() {
  return Utilities.formatDate(new Date(), GSV2.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function gsv2DateStamp_() {
  return Utilities.formatDate(new Date(), GSV2.timezone, 'yyyyMMdd');
}

function gsv2Json_(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj, null, 2));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function gsv2Ok_(data) {
  return gsv2Json_(Object.assign({ ok: true, version: GSV2.version }, data || {}));
}

function gsv2Fail_(message, details) {
  return gsv2Json_({
    ok: false,
    version: GSV2.version,
    error: message || 'Unknown error',
    details: details || null
  });
}

function gsv2ParseBody_(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    const raw = e.postData.contents;
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error('Request body was not valid JSON: ' + error.message);
    }
  }

  if (e.parameter) {
    return Object.assign({}, e.parameter);
  }

  return {};
}

function gsv2SafeJson_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function gsv2ParseJsonCell_(value, fallback) {
  if (!value) return fallback === undefined ? null : fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback === undefined ? null : fallback;
  }
}

function gsv2UuidPart_() {
  return Utilities.getUuid().split('-')[0].toUpperCase();
}

function gsv2MakeId_(prefix) {
  return prefix + '-' + gsv2DateStamp_() + '-' + gsv2UuidPart_();
}

function gsv2Require_(condition, message) {
  if (!condition) throw new Error(message);
}

function gsv2NormalizeRoute_(body) {
  return String(body.route || body.action || '').trim();
}

function gsv2GetBotApiSecret_() {
  return PropertiesService
    .getScriptProperties()
    .getProperty(GSV2.scriptProperties.botApiSecret);
}

function gsv2RequireBotSecret_(body) {
  const configuredSecret = gsv2GetBotApiSecret_();

  if (!configuredSecret) {
    throw new Error('Missing Script Property BOT_API_SECRET. Set it in Apps Script Project Settings before using the web app.');
  }

  const suppliedSecret = String(body.secret || body.apiSecret || '').trim();

  if (!suppliedSecret || suppliedSecret !== configuredSecret) {
    throw new Error('Invalid or missing bot API secret.');
  }
}

function gsv2WithLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function gsv2PublicBody_(body) {
  const clone = Object.assign({}, body || {});
  if (clone.secret) clone.secret = '[redacted]';
  if (clone.apiSecret) clone.apiSecret = '[redacted]';
  return clone;
}

function gsv2StringOrBlank_(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}
