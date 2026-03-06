'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { generateCode } = require('../../lib/codegen');
const { codeEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-create')
    .setDescription('Create a new invite code.')
    .addStringOption((opt) =>
      opt.setName('label').setDescription('Label / batch name for this code.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('roles').setDescription('Comma-separated role IDs to grant on redemption.').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('channels').setDescription('Comma-separated channel IDs to unlock on redemption.').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('max_uses').setDescription('Maximum number of redemptions allowed.').setRequired(false).setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt.setName('expires_in_days').setDescription('Days until this code expires.').setRequired(false).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt.setName('notes').setDescription('Internal notes for this code.').setRequired(false)
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

    const label = interaction.options.getString('label', true).trim();
    const rolesRaw = interaction.options.getString('roles') || '';
    const channelsRaw = interaction.options.getString('channels') || '';
    const maxUses = interaction.options.getInteger('max_uses') ?? null;
    const expiresInDays = interaction.options.getInteger('expires_in_days') ?? null;
    const notes = interaction.options.getString('notes') ?? null;

    const roleIds = rolesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const channelIds = channelsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let expiresAt = null;
    if (expiresInDays !== null) {
      expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
    }

    try {
      const code = await generateCode(query);

      const result = await query(
        `INSERT INTO invite_codes (code, label, max_uses, expires_at, role_ids, channel_ids, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [code, label, maxUses, expiresAt, roleIds, channelIds, notes, interaction.user.tag]
      );

      const record = result.rows[0];

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('CODE_CREATED', $1, $2, $3)`,
        [interaction.user.tag, code, JSON.stringify({ label, maxUses, expiresAt, roleIds, channelIds, notes })]
      );

      return interaction.reply({
        embeds: [codeEmbed(record)],
        ephemeral: true,
      });
    } catch (err) {
      console.error('[code-create]', err);
      return interaction.reply({
        embeds: [errorEmbed('An error occurred while creating the code. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
