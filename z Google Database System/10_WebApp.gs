function doGet(e) {
  return gsv2Ok_({
    message: 'Google System v2 web app is online.',
    hint: 'Use POST JSON with route=ping and your bot API secret to test bot connectivity.'
  });
}

function doPost(e) {
  let body = {};
  let route = '';

  try {
    body = gsv2ParseBody_(e);
    route = gsv2NormalizeRoute_(body);

    if (!route) throw new Error('Missing route.');

    gsv2LogScript_('INFO', route, 'Incoming request.', gsv2PublicBody_(body));

    switch (route) {
      case 'ping':
        gsv2RequireBotSecret_(body);
        return gsv2Ok_({
          route: route,
          message: 'Pong from Google System v2.',
          receivedAt: gsv2NowIso_(),
          echo: body.echo || null
        });

      case 'submitBotRequest':
        return gsv2Ok_(gsv2SubmitBotRequest_(body));

      case 'getPendingBotActions':
        return gsv2Ok_(gsv2GetPendingBotActions_(body));

      case 'markBotActionComplete':
        return gsv2Ok_(gsv2MarkBotActionComplete_(body));

      case 'markBotActionFailed':
        return gsv2Ok_(gsv2MarkBotActionFailed_(body));

      case 'getRequestStatus':
        return gsv2Ok_(gsv2GetRequestStatus_(body));

      case 'getOfficerByDiscordId':
        return gsv2Ok_(gsv2GetOfficerByDiscordId_(body));

      case 'upsertOfficer':
        return gsv2Ok_(gsv2UpsertOfficer_(body));

      default:
        throw new Error('Unknown route: ' + route);
    }
  } catch (error) {
    gsv2LogScript_('ERROR', route || 'unknown', error.message, {
      body: gsv2PublicBody_(body),
      stack: error.stack || ''
    });

    return gsv2Fail_(error.message, {
      route: route || null
    });
  }
}
