'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { infoEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template-create')
    .setDescription('Create a new code template.')
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Template name (3–50 characters).')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(50)
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Description of the template.').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('roles').setDescription('Comma-separated role IDs.').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('channels').setDescription('Comma-separated channel IDs.').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('default_max_uses').setDescription('Default max uses per code.').setRequired(false).setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('default_expires_in_days')
        .setDescription('Default expiry in days.')
        .setRequired(false)
        .setMinValue(1)
    )
    .addStringOption((opt) =>
      opt.setName('default_notes').setDescription('Default notes for codes created from this template.').setRequired(false)
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
    const description = interaction.options.getString('description') ?? null;
    const rolesRaw = interaction.options.getString('roles') || '';
    const channelsRaw = interaction.options.getString('channels') || '';
    const defaultMaxUses = interaction.options.getInteger('default_max_uses') ?? null;
    const defaultExpiresInDays = interaction.options.getInteger('default_expires_in_days') ?? null;
    const defaultNotes = interaction.options.getString('default_notes') ?? null;

    if (name.length < 3 || name.length > 50) {
      return interaction.reply({
        embeds: [errorEmbed('Template name must be between 3 and 50 characters.')],
        ephemeral: true,
      });
    }

    const roleIds = rolesRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const channelIds = channelsRaw.split(',').map((s) => s.trim()).filter(Boolean);

    try {
      await query(
        `INSERT INTO code_templates
           (name, description, role_ids, channel_ids, default_max_uses, default_expires_in_days, default_notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [name, description, roleIds, channelIds, defaultMaxUses, defaultExpiresInDays, defaultNotes, interaction.user.tag]
      );

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('TEMPLATE_CREATED', $1, NULL, $2)`,
        [
          interaction.user.tag,
          JSON.stringify({ name, description, roleIds, channelIds, defaultMaxUses, defaultExpiresInDays, defaultNotes }),
        ]
      );

      const roles = roleIds.length > 0 ? roleIds.map((id) => `<@&${id}>`).join(', ') : 'None';
      const channels = channelIds.length > 0 ? channelIds.map((id) => `<#${id}>`).join(', ') : 'None';

      const embed = infoEmbed(null)
        .setTitle('Template Created.')
        .addFields(
          { name: 'Name', value: name, inline: true },
          { name: 'Description', value: description || '—', inline: true },
          { name: 'Default Max Uses', value: defaultMaxUses != null ? String(defaultMaxUses) : '∞', inline: true },
          { name: 'Default Expires In', value: defaultExpiresInDays != null ? `${defaultExpiresInDays} days` : 'Never', inline: true },
          { name: 'Roles', value: roles, inline: false },
          { name: 'Channels', value: channels, inline: false },
          { name: 'Notes', value: defaultNotes || '—', inline: false }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      if (err.code === '23505') {
        return interaction.reply({
          embeds: [errorEmbed(`A template named **${name}** already exists.`)],
          ephemeral: true,
        });
      }
      console.error('[template-create]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to create template. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
