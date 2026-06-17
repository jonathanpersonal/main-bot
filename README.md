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
