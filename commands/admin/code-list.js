'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { infoEmbed, errorEmbed } = require('../../lib/embeds');
const { FOOTER } = require('../../lib/embeds');

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-list')
    .setDescription('List invite codes with optional filtering.')
    .addStringOption((opt) =>
      opt
        .setName('filter')
        .setDescription('Filter codes by status.')
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
    if (filter === 'active') {
      whereClause = 'WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())';
    } else if (filter === 'inactive') {
      whereClause = 'WHERE is_active = FALSE OR (expires_at IS NOT NULL AND expires_at <= NOW())';
    }

    try {
      const countResult = await query(
        `SELECT COUNT(*) FROM invite_codes ${whereClause}`
      );
      const total = parseInt(countResult.rows[0].count, 10);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (page > totalPages) {
        return interaction.reply({
          embeds: [errorEmbed(`Page ${page} does not exist. There are only ${totalPages} page(s).`)],
          ephemeral: true,
        });
      }

      const result = await query(
        `SELECT code, label, is_active, uses, max_uses, expires_at
         FROM invite_codes ${whereClause}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, offset]
      );

      if (result.rowCount === 0) {
        return interaction.reply({
          embeds: [infoEmbed(`No codes found for filter **${filter}**.`)],
          ephemeral: true,
        });
      }

      const embed = infoEmbed(null)
        .setTitle(`Invite Codes — ${filter.charAt(0).toUpperCase() + filter.slice(1)}`)
        .setFooter({ text: `Page ${page} of ${totalPages} · ${FOOTER.text}` });

      for (const row of result.rows) {
        const status = row.is_active ? '✅' : '❌';
        const uses = `${row.uses}/${row.max_uses ?? '∞'}`;
        const expires = row.expires_at
          ? `<t:${Math.floor(new Date(row.expires_at).getTime() / 1000)}:R>`
          : 'Never';

        embed.addFields({
          name: `\`${row.code}\``,
          value: `**${row.label}** · ${status} · Uses: ${uses} · Expires: ${expires}`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('[code-list]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to list codes. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
