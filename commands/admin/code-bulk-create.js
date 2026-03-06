'use strict';

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { pool } = require('../../lib/db');
const { generateCode } = require('../../lib/codegen');
const { successEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-bulk-create')
    .setDescription('Bulk-create multiple invite codes at once.')
    .addStringOption((opt) =>
      opt.setName('batch_label').setDescription('Batch label prefix applied to all codes.').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('count')
        .setDescription('Number of codes to generate (1–500).')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(500)
    )
    .addStringOption((opt) =>
      opt.setName('roles').setDescription('Comma-separated role IDs to grant on redemption.').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('channels').setDescription('Comma-separated channel IDs to unlock on redemption.').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('max_uses').setDescription('Maximum redemptions per code.').setRequired(false).setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt.setName('expires_in_days').setDescription('Days until each code expires.').setRequired(false).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt.setName('notes').setDescription('Internal notes applied to every generated code.').setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('unique_labels').setDescription('Append a sequential number to each label (default: true).').setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('output')
        .setDescription('How to display the generated codes (default: embed).')
        .setRequired(false)
        .addChoices(
          { name: 'Embed (up to 25 codes)', value: 'embed' },
          { name: 'Text file (CSV)', value: 'txt' }
        )
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
    const count = interaction.options.getInteger('count', true);
    const rolesRaw = interaction.options.getString('roles') || '';
    const channelsRaw = interaction.options.getString('channels') || '';
    const maxUses = interaction.options.getInteger('max_uses') ?? null;
    const expiresInDays = interaction.options.getInteger('expires_in_days') ?? null;
    const notes = interaction.options.getString('notes') ?? null;
    const uniqueLabels = interaction.options.getBoolean('unique_labels') ?? true;
    const outputMode = interaction.options.getString('output') ?? 'embed';

    if (count < 1 || count > 500) {
      return interaction.reply({
        embeds: [errorEmbed('Count must be between 1 and 500.')],
        ephemeral: true,
      });
    }

    const roleIds = rolesRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const channelIds = channelsRaw.split(',').map((s) => s.trim()).filter(Boolean);

    let expiresAt = null;
    if (expiresInDays !== null) {
      expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
    }

    await interaction.deferReply({ ephemeral: true });

    const client = await pool.connect();
    const generatedCodes = [];

    try {
      await client.query('BEGIN');

      for (let i = 0; i < count; i++) {
        const code = await generateCode(client.query.bind(client));
        const label = uniqueLabels ? `${batchLabel}-${i + 1}` : batchLabel;

        await client.query(
          `INSERT INTO invite_codes (code, label, max_uses, expires_at, role_ids, channel_ids, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [code, label, maxUses, expiresAt, roleIds, channelIds, notes, interaction.user.tag]
        );

        generatedCodes.push({ code, label, max_uses: maxUses, expires_at: expiresAt });
      }

      await client.query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('BULK_CODES_CREATED', $1, NULL, $2)`,
        [
          interaction.user.tag,
          JSON.stringify({
            batchLabel,
            count,
            roleIds,
            channelIds,
            maxUses,
            expiresAt,
            notes,
            uniqueLabels,
            codes: generatedCodes.map((c) => c.code),
          }),
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[code-bulk-create] Transaction error:', err);
      return interaction.editReply({
        embeds: [errorEmbed('A database error occurred. No codes were created. Please try again.')],
      });
    } finally {
      client.release();
    }

    // Build summary embed
    const summaryEmbed = successEmbed(
      `✅ Bulk Code Creation Complete`,
      [
        `**Batch Label:** ${batchLabel}`,
        `**Codes Generated:** ${generatedCodes.length}`,
        `**Max Uses:** ${maxUses ?? '∞'} per code`,
        `**Expires:** ${expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : 'Never'}`,
        `**Roles:** ${roleIds.length > 0 ? roleIds.map((id) => `<@&${id}>`).join(', ') : 'None'}`,
        `**Channels:** ${channelIds.length > 0 ? channelIds.map((id) => `<#${id}>`).join(', ') : 'None'}`,
      ].join('\n')
    );

    // Decide output format
    if (count <= 25 && outputMode === 'embed') {
      summaryEmbed.addFields({
        name: 'Generated Codes',
        value: generatedCodes.map((c) => `\`${c.code}\` — ${c.label}`).join('\n'),
        inline: false,
      });

      return interaction.editReply({ embeds: [summaryEmbed] });
    }

    // CSV file output
    const csvLines = ['code,label,max_uses,expires_at'];
    for (const c of generatedCodes) {
      csvLines.push(
        `${c.code},${c.label},${c.max_uses ?? ''},${c.expires_at ? c.expires_at.toISOString() : ''}`
      );
    }
    const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf-8');
    const attachment = new AttachmentBuilder(csvBuffer, { name: `${batchLabel}.csv` });

    return interaction.editReply({
      embeds: [summaryEmbed],
      files: [attachment],
    });
  },
};
