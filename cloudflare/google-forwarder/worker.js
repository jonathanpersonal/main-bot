function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlTitle(value) {
  const match = String(value || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : '';
}

function looksLikeJson(contentType, text) {
  return String(contentType || '').toLowerCase().includes('application/json') ||
    /^[\s\n\r]*[\[{]/.test(text || '');
}

function withSecretIfConfigured(rawBody, env) {
  if (!env.GOOGLE_SCRIPT_SECRET) return rawBody;

  try {
    const parsed = JSON.parse(rawBody || '{}');
    if (parsed.secret) return rawBody;
    return JSON.stringify({
      ...parsed,
      secret: env.GOOGLE_SCRIPT_SECRET
    });
  } catch {
    return rawBody;
  }
}

export default {
  async fetch(request, env) {
    const appsScriptUrl = env.GOOGLE_SCRIPT_WEBAPP_URL;

    if (request.method !== 'POST') {
      return jsonResponse({
        ok: true,
        status: 'ready',
        source: 'cloudflare_worker',
        message: 'Department Google forwarder ready',
        googleUrlConfigured: Boolean(appsScriptUrl)
      });
    }

    if (!appsScriptUrl) {
      return jsonResponse({
        ok: false,
        status: 500,
        source: 'cloudflare_worker',
        message: 'Missing GOOGLE_SCRIPT_WEBAPP_URL Worker secret/variable.'
      }, 500);
    }

    try {
      const incomingBody = await request.text();
      const outgoingBody = withSecretIfConfigured(incomingBody, env);

      console.log('WORKER_INCOMING', JSON.stringify({
        method: request.method,
        contentType: request.headers.get('content-type'),
        bodyLength: incomingBody.length,
        bodyPreview: incomingBody.slice(0, 500)
      }));

      const upstream = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: outgoingBody,
        redirect: 'follow'
      });

      const text = await upstream.text();
      const upstreamType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

      console.log('WORKER_APPS_SCRIPT_RESPONSE', JSON.stringify({
        upstreamStatus: upstream.status,
        contentType: upstreamType,
        bodyPreview: text.slice(0, 1000)
      }));

      if (looksLikeJson(upstreamType, text)) {
        return new Response(text, {
          status: upstream.status,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          }
        });
      }

      return jsonResponse({
        ok: false,
        status: upstream.status,
        source: 'cloudflare_worker',
        message: 'Apps Script returned a non-JSON response.',
        upstreamContentType: upstreamType,
        upstreamTitle: extractHtmlTitle(text),
        upstreamBody: stripHtml(text).slice(0, 1000)
      }, 502);
    } catch (err) {
      console.log('WORKER_FORWARD_ERROR', String(err));

      return jsonResponse({
        ok: false,
        status: 500,
        source: 'cloudflare_worker',
        message: 'Worker error: ' + (err && err.message ? err.message : String(err))
      }, 500);
    }
  }
};
