# main-bot

## Ticket System Test Checklist

1. Restart bot.
2. Redeploy/register slash commands if this project requires it.
3. Run `/ticket-panel post`.
4. Confirm public panel only shows:
   - General Support
   - Training Recruitment
   - Contact Command Staff
5. Confirm the panel does not show:
   - Rank Transfer
   - IA
   - Dept Admin
   - Reinstatement
6. Click General Support.
7. Confirm private ticket channel is created.
8. Confirm duplicate clicking does not create a second same-type open ticket.
9. Confirm ticket controls appear:
   - Claim
   - Rename
   - Transfer
   - Lockdown
   - Close
10. Test Claim.
11. Test Rename.
12. Test Transfer.
13. Test Lockdown with Staff + Ticket Opener.
14. Test Lockdown with Command Staff Only.
15. Test Unlock.
16. Test Close.
17. Confirm transcript posts to transcript channel.
18. Confirm close log posts.
19. Confirm archive/delete behavior works based on config.
20. Test or confirm approved termination appeals create a Reinstatement ticket.



## Department setup from Discord

Use `/department-setup` to create a local per-server setup file at `data/guildConfigs/{guildId}.json` instead of editing command code for every new department.

Recommended first-time setup order:

1. Run `/department-setup status` first to see what is missing.
2. Run `/department-setup profile` to set the department name and acronym.
3. Run `/department-setup role type:setup-admin` to add the setup admin role.
4. Run `/department-setup channel` to save officer, training, duty, ticket, IA, bot admin, Google, and ticket panel channels.
5. Run `/department-setup rank-add` for each rank. Higher `order` means a higher rank.
6. Run `/department-setup google` if this server uses the Google database integration. Webhook URLs are stored locally and are masked in Discord exports.
7. Test `/officer-management`, `/training-management`, `/duty`, `/ticket-panel`, and `/google-test` after setup.

Use `/department-setup export` when you need a sanitized support copy of the setup. The export does not include full Google webhook secrets.

## Training and probation workflow data

Patch 3 treats Google Sheets as the official source of truth for cadet, training, and probation workflow records. The bot writes workflow events to the Google Apps Script web app, and the startup/daily automation reads active cadets and probationary officers back from Google before taking action.

Durable Google tabs used by this workflow:

- `CadetTracker`
- `TrainingRecords`
- `ProbationaryRoster`
- `ProbationRideAlongs`
- `ProbationFeedback`
- `ProbationDecisions`
- `TrainingAudit`

The local `data/training-workflow.json` file is only a cache/fallback for temporary Google outages. Do not treat it as the official roster, and do not manually edit it as the durable record.

SQL support is included as a planned mirror/schema path in `database/dutySchema.sql` for hosts that want database-backed workflow storage later:

- `training_cadets`
- `training_records`
- `probationary_officers`
- `probation_feedback`
- `probation_decisions`
- `training_audit`

Those SQL workflow tables do not replace Google in this patch. Existing ride-along records remain in `duty_ridealong_feedback`; probation checks count those records when the SQL duty database is configured and never replace or rewrite the existing ride-along system.

Manual setup after importing the Google Apps Script files:

1. Deploy the updated web app.
2. Run `pdv2EnsureTrainingProbationSheets_()` once, or run the normal Apps Script install/setup flow.
3. Confirm `GOOGLE_SCRIPT_WEBAPP_URL` and `GOOGLE_SCRIPT_SECRET` are set for the bot.
4. Configure real cadet, applicant, probationary, training officer, FTO command, department command, and graduation role IDs in the active guild config.
5. Replace `PUBLIC_ROSTER_URL_PLACEHOLDER` and `STEAM_GROUP_URL_PLACEHOLDER` with the real per-server links.

## Parent/Child Repo Deployment Notes

This project is intended to be used as a shared **main-bot** base repo. Production department bots should live in separate child repos, such as `RWPD-Bot`, and receive shared code through sync pull requests from this base repo.

Recommended model:

- `main-bot` stores shared command, handler, service, utility, Google Apps Script, and support code.
- Child repos receive synced code by pull request and are reviewed before deployment.
- Each hosted child bot keeps its own live `.env` and local per-guild config in `data/guildConfigs/<guildId>.json`.
- Do not commit real bot tokens, webhook URLs, secrets, `.env`, or live `data/guildConfigs/*.json` files.
- Sparked Host/Pterodactyl production servers should point to the child repo, not the base `main-bot` repo, when hosting a production child bot.

First-run commands for a child bot host:

```bash
npm install
npm run setup
npm run deploy-commands # if your deployment uses this script/command registration step
npm start
```

After `npm run setup`, edit `.env`, then copy/rename the generated starter guild config example to `data/guildConfigs/<your guild id>.json` and fill in server-specific role/channel IDs.
