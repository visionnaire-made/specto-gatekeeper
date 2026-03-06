'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { generateCode } = require('../../lib/codegen');
const { codeEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-create-from-template')
    .setDescription('Create a new invite code using a saved template.')
    .addStringOption((opt) =>
      opt.setName('template_name').setDescription('Name of the template to use.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('label').setDescription('Label for the new code.').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('max_uses_override').setDescription('Override the template max uses.').setRequired(false).setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt.setName('expires_in_days_override').setDescription('Override the template expiry in days.').setRequired(false).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt.setName('notes_override').setDescription('Override the template notes.').setRequired(false)
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

    const templateName = interaction.options.getString('template_name', true).trim();
    const label = interaction.options.getString('label', true).trim();
    const maxUsesOverride = interaction.options.getInteger('max_uses_override') ?? undefined;
    const expiresInDaysOverride = interaction.options.getInteger('expires_in_days_override') ?? undefined;
    const notesOverride = interaction.options.getString('notes_override') ?? undefined;

    try {
      // Look up template (case-insensitive)
      const templateResult = await query(
        'SELECT * FROM code_templates WHERE lower(name) = lower($1)',
        [templateName]
      );

      if (templateResult.rowCount === 0) {
        return interaction.reply({
          embeds: [errorEmbed(`No template found with name **${templateName}**.`)],
          ephemeral: true,
        });
      }

      const template = templateResult.rows[0];

      if (!template.is_active) {
        return interaction.reply({
          embeds: [errorEmbed(`Template **${template.name}** is inactive and cannot be used.`)],
          ephemeral: true,
        });
      }

      // Apply overrides over template defaults
      const maxUses = maxUsesOverride !== undefined ? maxUsesOverride : (template.default_max_uses ?? null);
      const expiresInDays = expiresInDaysOverride !== undefined ? expiresInDaysOverride : (template.default_expires_in_days ?? null);
      const notes = notesOverride !== undefined ? notesOverride : (template.default_notes ?? null);

      let expiresAt = null;
      if (expiresInDays !== null) {
        expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
      }

      const code = await generateCode(query);

      const result = await query(
        `INSERT INTO invite_codes (code, label, max_uses, expires_at, role_ids, channel_ids, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          code,
          label,
          maxUses,
          expiresAt,
          template.role_ids || [],
          template.channel_ids || [],
          notes,
          interaction.user.tag,
        ]
      );

      const record = result.rows[0];

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('CODE_CREATED_FROM_TEMPLATE', $1, $2, $3)`,
        [
          interaction.user.tag,
          code,
          JSON.stringify({ templateName: template.name, label, maxUses, expiresAt, notes }),
        ]
      );

      return interaction.reply({
        embeds: [codeEmbed(record)],
        ephemeral: true,
      });
    } catch (err) {
      console.error('[code-create-from-template]', err);
      return interaction.reply({
        embeds: [errorEmbed('An error occurred while creating the code from template. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
