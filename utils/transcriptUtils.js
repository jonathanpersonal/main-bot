const { AttachmentBuilder } = require('discord.js');

async function generateTextTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = [
    `Ticket channel name: ${channel.name}`,
    `Channel ID: ${channel.id}`,
    `Created timestamp: ${channel.createdAt?.toISOString?.() || 'Unknown'}`,
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

module.exports = { generateTextTranscript };
