'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { successEmbed, errorEmbed } = require('../../lib/embeds');

const SAFE_FIELDS = {
  description: 'description',
  role_ids: 'role_ids',
  channel_ids: 'channel_ids',
  default_max_uses: 'default_max_uses',
  default_expires_in_days: 'default_expires_in_days',
  default_notes: 'default_notes',
  is_active: 'is_active',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template-edit')
    .setDescription('Edit a field on an existing code template.')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Name of the template to edit.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('field')
        .setDescription('The field to update.')
        .setRequired(true)
        .addChoices(
          { name: 'Description', value: 'description' },
          { name: 'Role IDs (comma-separated)', value: 'role_ids' },
          { name: 'Channel IDs (comma-separated)', value: 'channel_ids' },
          { name: 'Default Max Uses', value: 'default_max_uses' },
          { name: 'Default Expires In Days', value: 'default_expires_in_days' },
          { name: 'Default Notes', value: 'default_notes' },
          { name: 'Active Status (true/false)', value: 'is_active' }
        )
    )
    .addStringOption((opt) =>
      opt.setName('value').setDescription('The new value for the selected field.').setRequired(true)
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
    const field = interaction.options.getString('field', true);
    const rawValue = interaction.options.getString('value', true).trim();

    if (!SAFE_FIELDS[field]) {
      return interaction.reply({
        embeds: [errorEmbed(`Invalid field: \`${field}\`.`)],
        ephemeral: true,
      });
    }

    // Fetch current template
    const current = await query(
      'SELECT * FROM code_templates WHERE lower(name) = lower($1)',
      [name]
    );
    if (current.rowCount === 0) {
      return interaction.reply({
        embeds: [errorEmbed(`No template found with name **${name}**.`)],
        ephemeral: true,
      });
    }

    const template = current.rows[0];
    const oldValue = template[field];

    // Parse value based on field type
    let parsedValue;
    try {
      switch (field) {
        case 'default_max_uses':
        case 'default_expires_in_days': {
          const n = parseInt(rawValue, 10);
          if (isNaN(n) || n < 1) throw new Error(`${field} must be a positive integer.`);
          parsedValue = n;
          break;
        }
        case 'is_active': {
          if (rawValue.toLowerCase() === 'true') parsedValue = true;
          else if (rawValue.toLowerCase() === 'false') parsedValue = false;
          else throw new Error('is_active must be "true" or "false".');
          break;
        }
        case 'role_ids':
        case 'channel_ids': {
          parsedValue = rawValue.split(',').map((s) => s.trim()).filter(Boolean);
          break;
        }
        default:
          parsedValue = rawValue;
      }
    } catch (parseErr) {
      return interaction.reply({
        embeds: [errorEmbed(parseErr.message)],
        ephemeral: true,
      });
    }

    try {
      const dbColumn = SAFE_FIELDS[field];
      // Double-check that dbColumn is a known-safe identifier (guards against future SAFE_FIELDS changes)
      if (typeof dbColumn !== 'string' || !/^[a-z_]+$/.test(dbColumn)) {
        throw new Error('Invalid column identifier.');
      }
      await query(
        `UPDATE code_templates SET ${dbColumn} = $1, edited_by = $2, edited_at = NOW()
         WHERE lower(name) = lower($3)`,
        [parsedValue, interaction.user.tag, name]
      );

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('TEMPLATE_EDITED', $1, NULL, $2)`,
        [
          interaction.user.tag,
          JSON.stringify({ templateName: name, field, oldValue, newValue: parsedValue }),
        ]
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            'Template Updated.',
            `Field **${field}** on template **${name}** has been updated.\n**Old:** \`${JSON.stringify(oldValue)}\`\n**New:** \`${JSON.stringify(parsedValue)}\``
          ),
        ],
        ephemeral: true,
      });
    } catch (err) {
      console.error('[template-edit]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to update the template. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
