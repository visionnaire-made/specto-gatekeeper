'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { infoEmbed, errorEmbed } = require('../../lib/embeds');
const { FOOTER } = require('../../lib/embeds');

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template-list')
    .setDescription('List code templates with optional filtering.')
    .addStringOption((opt) =>
      opt
        .setName('filter')
        .setDescription('Filter templates by status.')
        .setRequired(true)
        .addChoices(
          { name: 'Active', value: 'active' },
          { name: 'Inactive', value: 'inactive' },
          { name: 'All', value: 'all' }
        )
    )
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Page number (default: 1).').setRequired(false).setMinValue(1)
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

    const filter = interaction.options.getString('filter', true);
    const page = interaction.options.getInteger('page') ?? 1;
    const offset = (page - 1) * PAGE_SIZE;

    let whereClause = '';
    if (filter === 'active') whereClause = 'WHERE is_active = TRUE';
    else if (filter === 'inactive') whereClause = 'WHERE is_active = FALSE';

    try {
      const countResult = await query(`SELECT COUNT(*) FROM code_templates ${whereClause}`);
      const total = parseInt(countResult.rows[0].count, 10);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (page > totalPages) {
        return interaction.reply({
          embeds: [errorEmbed(`Page ${page} does not exist. There are only ${totalPages} page(s).`)],
          ephemeral: true,
        });
      }

      const result = await query(
        `SELECT name, description, is_active, default_max_uses, default_expires_in_days
         FROM code_templates ${whereClause}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, offset]
      );

      if (result.rowCount === 0) {
        return interaction.reply({
          embeds: [infoEmbed(`No templates found for filter **${filter}**.`)],
          ephemeral: true,
        });
      }

      const embed = infoEmbed(null)
        .setTitle(`Code Templates — ${filter.charAt(0).toUpperCase() + filter.slice(1)}`)
        .setFooter({ text: `Page ${page} of ${totalPages} · ${FOOTER.text}` });

      for (const row of result.rows) {
        const status = row.is_active ? '✅' : '❌';
        const maxUses = row.default_max_uses != null ? String(row.default_max_uses) : '∞';
        const expires = row.default_expires_in_days != null ? `${row.default_expires_in_days} days` : 'Never';

        embed.addFields({
          name: row.name,
          value: `${row.description || '—'}\n${status} · Max Uses: ${maxUses} · Expires: ${expires}`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('[template-list]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to list templates. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
