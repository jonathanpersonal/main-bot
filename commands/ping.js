const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Checks if the bot is online.'),

  async execute(interaction, client) {
    await interaction.reply({
      content: `Pong! Bot latency: ${client.ws.ping}ms`,
      flags: MessageFlags.Ephemeral
    });
  }
};