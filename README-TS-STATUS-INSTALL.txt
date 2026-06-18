TeamSpeak Status Command Install Notes
=====================================

Files included:
- package.json
- config/teamspeakConfig.js
- utils/teamspeakClient.js
- commands/ts.js

Command added:
- /ts status

Required Apollo Panel / Sparked Host environment variables:
- TEAMSPEAK_ENABLED=true
- TEAMSPEAK_HOST=your TeamSpeak IP or domain
- TEAMSPEAK_QUERY_PORT=10011
- TEAMSPEAK_SERVER_PORT=9987
- TEAMSPEAK_QUERY_USERNAME=serveradmin or another ServerQuery user
- TEAMSPEAK_QUERY_PASSWORD=your ServerQuery password
- TEAMSPEAK_NICKNAME=Department Bot

Do not put the query password in GitHub.

Install steps:
1. Copy these files into your bot project, keeping the same folders.
2. Push/upload the updated files.
3. Restart the bot so npm install --production runs.
4. Re-register slash commands if your bot does not auto-register commands on startup.
5. Test in Discord with /ts status.

Common errors:
- "TeamSpeak integration is disabled" means TEAMSPEAK_ENABLED is not true.
- "Missing TeamSpeak environment variable" means one of the required values is blank.
- Login failed means the query username/password is wrong or does not have permission.
- Connection timeout means host/query port/server port/firewall is wrong.
