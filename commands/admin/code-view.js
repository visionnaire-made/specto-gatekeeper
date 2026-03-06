'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { infoEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-view')
    .setDescription('View full details for a specific invite code.')
    .addStringOption((opt) =>
      opt.setName('code').setDescription('The invite code to view.').setRequired(true)
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
         ORDER BY redeemed_at DESC
         LIMIT 10`,
        [record.id]
      );

      const roles =
        record.role_ids && record.role_ids.length > 0
          ? record.role_ids.map((id) => `<@&${id}>`).join(', ')
          : 'None';

      const channels =
        record.channel_ids && record.channel_ids.length > 0
          ? record.channel_ids.map((id) => `<#${id}>`).join(', ')
          : 'None';

      const expires = record.expires_at
        ? `<t:${Math.floor(new Date(record.expires_at).getTime() / 1000)}:R>`
        : 'Never';

      const createdAt = `<t:${Math.floor(new Date(record.created_at).getTime() / 1000)}:f>`;

      const embed = infoEmbed(null)
        .setTitle(`Code: \`${code}\``)
        .addFields(
          { name: 'Label', value: record.label, inline: true },
          { name: 'Status', value: record.is_active ? '✅ Active' : '❌ Inactive', inline: true },
          { name: 'Uses', value: `${record.uses}/${record.max_uses ?? '∞'}`, inline: true },
          { name: 'Expires', value: expires, inline: true },
          { name: 'Created By', value: record.created_by || '—', inline: true },
          { name: 'Created At', value: createdAt, inline: true },
          { name: 'Roles', value: roles, inline: false },
          { name: 'Channels', value: channels, inline: false },
          { name: 'Notes', value: record.notes || '—', inline: false }
        );

      if (record.edited_by) {
        embed.addFields({
          name: 'Last Edited',
          value: `${record.edited_by} — <t:${Math.floor(new Date(record.edited_at).getTime() / 1000)}:R>`,
          inline: false,
        });
      }

      if (redemptionsResult.rowCount > 0) {
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

        embed.addFields({ name: 'Last 10 Redeemers', value: redeemers, inline: false });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('[code-view]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to retrieve code details. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
