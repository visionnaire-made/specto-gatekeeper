'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { infoEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template-view')
    .setDescription('View full details of a specific code template.')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Name of the template to view.').setRequired(true)
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

    const name = interaction.options.getString('name', true).trim();

    try {
      const result = await query(
        'SELECT * FROM code_templates WHERE lower(name) = lower($1)',
        [name]
      );

      if (result.rowCount === 0) {
        return interaction.reply({
          embeds: [errorEmbed(`No template found with name **${name}**.`)],
          ephemeral: true,
        });
      }

      const t = result.rows[0];

      const roles =
        t.role_ids && t.role_ids.length > 0
          ? t.role_ids.map((id) => `<@&${id}>`).join(', ')
          : 'None';

      const channels =
        t.channel_ids && t.channel_ids.length > 0
          ? t.channel_ids.map((id) => `<#${id}>`).join(', ')
          : 'None';

      const createdAt = `<t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:f>`;

      const embed = infoEmbed(null)
        .setTitle(`Template: ${t.name}`)
        .addFields(
          { name: 'Description', value: t.description || '—', inline: false },
          { name: 'Status', value: t.is_active ? '✅ Active' : '❌ Inactive', inline: true },
          { name: 'Default Max Uses', value: t.default_max_uses != null ? String(t.default_max_uses) : '∞', inline: true },
          { name: 'Default Expires In', value: t.default_expires_in_days != null ? `${t.default_expires_in_days} days` : 'Never', inline: true },
          { name: 'Roles', value: roles, inline: false },
          { name: 'Channels', value: channels, inline: false },
          { name: 'Default Notes', value: t.default_notes || '—', inline: false },
          { name: 'Created By', value: t.created_by, inline: true },
          { name: 'Created At', value: createdAt, inline: true }
        );

      if (t.edited_by) {
        embed.addFields({
          name: 'Last Edited',
          value: `${t.edited_by} — <t:${Math.floor(new Date(t.edited_at).getTime() / 1000)}:R>`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('[template-view]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to retrieve template details. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
