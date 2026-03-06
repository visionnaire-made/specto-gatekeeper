'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { successEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-deactivate')
    .setDescription('Deactivate an invite code so it can no longer be redeemed.')
    .addStringOption((opt) =>
      opt.setName('code').setDescription('The invite code to deactivate.').setRequired(true)
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
      const result = await query(
        'UPDATE invite_codes SET is_active = FALSE WHERE code = $1 RETURNING code',
        [code]
      );

      if (result.rowCount === 0) {
        return interaction.reply({
          embeds: [errorEmbed(`No invite code found matching \`${code}\`.`)],
          ephemeral: true,
        });
      }

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('CODE_DEACTIVATED', $1, $2, $3)`,
        [interaction.user.tag, code, JSON.stringify({ code })]
      );

      return interaction.reply({
        embeds: [successEmbed('Code Deactivated.', `Invite code \`${code}\` has been deactivated and can no longer be redeemed.`)],
        ephemeral: true,
      });
    } catch (err) {
      console.error('[code-deactivate]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to deactivate the code. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
