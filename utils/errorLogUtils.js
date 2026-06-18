const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('./guildConfigStore');

function sanitizeErrorForDiscord(error) {
  let text = error?.stack || error?.message || String(error || 'Unknown error');
  const secrets = [process.env.DISCORD_TOKEN, process.env.BOT_API_SECRET, process.env.GOOGLE_API_SECRET, process.env.GOOGLE_SCRIPT_SECRET].filter(Boolean);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  text = text.replace(/https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^\s)]+/gi, '[REDACTED_DISCORD_WEBHOOK]');
  text = text.replace(/(secret|token|key)=([^\s&]+)/gi, '$1=[REDACTED]');
  return text.slice(0, 1800);
}

async function getServerErrorLogChannel(client, guildId) {
  const config = getGuildConfig(guildId);
  const channelId = config?.channels?.serverErrorLogChannelId || config?.logging?.serverErrorLogChannelId;
  if (!channelId) return null;
  return client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
}

async function logServerError(clientOrInteraction, error, context = {}) {
  const client = clientOrInteraction?.client || clientOrInteraction;
  const guildId = context.guildId || clientOrInteraction?.guildId || clientOrInteraction?.guild?.id;
  if (!client || !guildId) return false;
  const channel = await getServerErrorLogChannel(client, guildId);
  if (!channel?.isTextBased?.()) return false;
  const embed = new EmbedBuilder()
    .setTitle('Server Error')
    .setColor(0xe74c3c)
    .setDescription(`\`\`\`\n${sanitizeErrorForDiscord(error)}\n\`\`\``)
    .addFields({ name: 'Context', value: sanitizeErrorForDiscord(JSON.stringify(context)).slice(0, 1000) || 'None' })
    .setTimestamp(new Date());
  await channel.send({ embeds: [embed] }).catch(() => null);
  return true;
}

module.exports = { logServerError, getServerErrorLogChannel, sanitizeErrorForDiscord };
