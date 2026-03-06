'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { successEmbed, errorEmbed } = require('../../lib/embeds');

// Whitelist of editable fields and their DB column names
const SAFE_FIELDS = {
  label: 'label',
  max_uses: 'max_uses',
  expires_at: 'expires_at',
  is_active: 'is_active',
  notes: 'notes',
  role_ids: 'role_ids',
  channel_ids: 'channel_ids',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-edit')
    .setDescription('Edit a field on an existing invite code.')
    .addStringOption((opt) =>
      opt.setName('code').setDescription('The invite code to edit.').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('field')
        .setDescription('The field to update.')
        .setRequired(true)
        .addChoices(
          { name: 'Label', value: 'label' },
          { name: 'Max Uses', value: 'max_uses' },
          { name: 'Expires At (ISO date or days from now)', value: 'expires_at' },
          { name: 'Active Status (true/false)', value: 'is_active' },
          { name: 'Notes', value: 'notes' },
          { name: 'Role IDs (comma-separated)', value: 'role_ids' },
          { name: 'Channel IDs (comma-separated)', value: 'channel_ids' }
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

    const code = interaction.options.getString('code', true).toUpperCase().trim();
    const field = interaction.options.getString('field', true);
    const rawValue = interaction.options.getString('value', true).trim();

    if (!SAFE_FIELDS[field]) {
      return interaction.reply({
        embeds: [errorEmbed(`Invalid field: \`${field}\`.`)],
        ephemeral: true,
      });
    }

    // Fetch current record
    const current = await query('SELECT * FROM invite_codes WHERE code = $1', [code]);
    if (current.rowCount === 0) {
      return interaction.reply({
        embeds: [errorEmbed(`No invite code found matching \`${code}\`.`)],
        ephemeral: true,
      });
    }

    const record = current.rows[0];
    const oldValue = record[field];

    // Parse value based on field type
    let parsedValue;
    try {
      switch (field) {
        case 'max_uses': {
          const n = parseInt(rawValue, 10);
          if (isNaN(n) || n < 1) throw new Error('max_uses must be a positive integer.');
          parsedValue = n;
          break;
        }
        case 'is_active': {
          if (rawValue.toLowerCase() === 'true') parsedValue = true;
          else if (rawValue.toLowerCase() === 'false') parsedValue = false;
          else throw new Error('is_active must be "true" or "false".');
          break;
        }
        case 'expires_at': {
          // Accept ISO date string OR number of days from now
          const days = parseFloat(rawValue);
          if (!isNaN(days) && /^\d+(\.\d+)?$/.test(rawValue)) {
            parsedValue = new Date(Date.now() + days * 86_400_000);
          } else {
            const d = new Date(rawValue);
            if (isNaN(d.getTime())) throw new Error('expires_at must be an ISO date string or number of days.');
            parsedValue = d;
          }
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
        `UPDATE invite_codes SET ${dbColumn} = $1, edited_by = $2, edited_at = NOW() WHERE code = $3`,
        [parsedValue, interaction.user.tag, code]
      );

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('CODE_EDITED', $1, $2, $3)`,
        [
          interaction.user.tag,
          code,
          JSON.stringify({ field, oldValue, newValue: parsedValue }),
        ]
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            'Code Updated.',
            `Field **${field}** on code \`${code}\` has been updated.\n**Old:** \`${JSON.stringify(oldValue)}\`\n**New:** \`${JSON.stringify(parsedValue)}\``
          ),
        ],
        ephemeral: true,
      });
    } catch (err) {
      console.error('[code-edit]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to update the code. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
