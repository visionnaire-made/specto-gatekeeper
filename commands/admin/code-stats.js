'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { infoEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-stats')
    .setDescription('View detailed stats and all redeemers for an invite code.')
    .addStringOption((opt) =>
      opt.setName('code').setDescription('The invite code to inspect.').setRequired(true)
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

    const code = interaction.options.getString('code', true).toUpperCase().trim();

    try {
      const codeResult = await query('SELECT * FROM invite_codes WHERE code = $1', [code]);
      if (codeResult.rowCount === 0) {
        return interaction.reply({
          embeds: [errorEmbed(`No invite code found matching \`${code}\`.`)],
          ephemeral: true,
        });
      }

      const record = codeResult.rows[0];

      const redemptionsResult = await query(
        `SELECT user_id, username, redeemed_at, is_revoked
         FROM redemptions
         WHERE code_id = $1
         ORDER BY redeemed_at DESC`,
        [record.id]
      );

      const remaining =
        record.max_uses != null
          ? Math.max(0, record.max_uses - record.uses)
          : '∞';

      const expires = record.expires_at
        ? `<t:${Math.floor(new Date(record.expires_at).getTime() / 1000)}:R>`
        : 'Never';

      const embed = infoEmbed(null)
        .setTitle(`Stats: \`${code}\``)
        .addFields(
          { name: 'Label', value: record.label, inline: true },
          { name: 'Status', value: record.is_active ? '✅ Active' : '❌ Inactive', inline: true },
          { name: 'Uses', value: String(record.uses), inline: true },
          { name: 'Remaining', value: String(remaining), inline: true },
          { name: 'Max Uses', value: record.max_uses != null ? String(record.max_uses) : '∞', inline: true },
          { name: 'Expires', value: expires, inline: true }
        );

      if (redemptionsResult.rowCount === 0) {
        embed.addFields({ name: 'Redeemers', value: 'No redemptions yet.', inline: false });
      } else {
      const lines = redemptionsResult.rows.map((r) => {
          const ts = `<t:${Math.floor(new Date(r.redeemed_at).getTime() / 1000)}:f>`;
          const revoked = r.is_revoked ? ' *(revoked)*' : '';
          return `<@${r.user_id}> (${r.username})${revoked} — ${ts}`;
        });

        // Truncate by complete lines to avoid breaking Discord mentions/timestamps
        let redeemers = '';
        for (const line of lines) {
          const next = redeemers ? `${redeemers}\n${line}` : line;
          if (next.length > 1024) break;
          redeemers = next;
        }
        if (!redeemers) redeemers = lines[0].slice(0, 1021) + '…';

        embed.addFields({ name: `Redeemers (${redemptionsResult.rowCount})`, value: redeemers, inline: false });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('[code-stats]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to retrieve code stats. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
