const { AttachmentBuilder } = require('discord.js');

async function generateTextTranscript(channel, options = {}) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const metadata = options.metadata || readTicketMetadataFromTopic(channel.topic);

  const lines = [
    `Ticket channel name: ${channel.name}`,
    `Channel ID: ${channel.id}`,
    `Ticket type: ${metadata?.typeId || 'Unknown'}`,
    `Opener ID: ${metadata?.openerId || 'Unknown'}`,
    `Claimed by ID: ${metadata?.claimedById || 'None'}`,
    `Closed by ID: ${metadata?.closedById || 'Unknown'}`,
    `Close reason: ${options.closeReason || 'Not provided'}`,
    `Created timestamp: ${channel.createdAt?.toISOString?.() || 'Unknown'}`,
    `Closed timestamp: ${metadata?.closedAt || 'Unknown'}`,
    `Total fetched messages: ${sorted.length}`,
    ''
  ];

  for (const message of sorted) {
    lines.push(`[${message.createdAt.toISOString()}] ${message.author?.tag || 'Unknown'} (${message.author?.id || 'unknown'}):`);
    lines.push(message.content || '[No text content]');
    if (message.attachments?.size) {
      lines.push('Attachments:');
      for (const attachment of message.attachments.values()) lines.push(`- ${attachment.url}`);
    }
    lines.push('');
  }

  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), {
    name: `${channel.name}-${channel.id}-transcript.txt`
  });
}

function readTicketMetadataFromTopic(topic = '') {
  const prefix = 'ticket:';
  const start = topic.indexOf(prefix);
  if (start === -1) return null;

  try {
    return JSON.parse(topic.slice(start + prefix.length));
  } catch {
    return null;
  }
}

module.exports = { generateTextTranscript };
