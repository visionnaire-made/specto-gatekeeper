'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { infoEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-batch-view')
    .setDescription('View all codes belonging to a batch label.')
    .addStringOption((opt) =>
      opt
        .setName('batch_label')
        .setDescription('The batch label prefix to search for.')
        .setRequired(true)
    ),

  async execute(interaction) {
    // Admin check
    const adminRoleId = process.env.ADMIN_ROLE_ID;
    if (!interaction.member.roles.cache.has(adminRoleId)) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to use this command.')],
        ephemeral: true,
      });
    }

    const batchLabel = interaction.options.getString('batch_label', true).trim();

    try {
      const result = await query(
        `SELECT code, label, is_active, uses, max_uses, expires_at
         FROM invite_codes
         WHERE label LIKE $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [`${batchLabel}%`]
      );

      if (result.rowCount === 0) {
        return interaction.reply({
          embeds: [infoEmbed(`No codes found with batch label starting with **${batchLabel}**.`)],
          ephemeral: true,
        });
      }

      const embed = infoEmbed(null)
        .setTitle(`Batch: ${batchLabel}`)
        .setDescription(`Found **${result.rowCount}** code(s) (showing up to 25).`);

      for (const row of result.rows) {
        const status = row.is_active ? '✅' : '❌';
        const uses = `${row.uses}/${row.max_uses ?? '∞'}`;
        const expires = row.expires_at
          ? `<t:${Math.floor(new Date(row.expires_at).getTime() / 1000)}:R>`
          : 'Never';

        embed.addFields({
          name: `\`${row.code}\``,
          value: `**Label:** ${row.label}\n**Status:** ${status} | **Uses:** ${uses} | **Expires:** ${expires}`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('[code-batch-view]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to retrieve batch codes. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
