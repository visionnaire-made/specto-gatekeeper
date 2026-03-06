'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { successEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('Revoke all redemptions for a user, removing their granted roles.')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to revoke.').setRequired(true)
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

    const targetUser = interaction.options.getUser('user', true);

    try {
      // Fetch all non-revoked redemptions for the user
      const redemptionsResult = await query(
        `SELECT id, roles_granted FROM redemptions
         WHERE user_id = $1 AND is_revoked = FALSE`,
        [targetUser.id]
      );

      if (redemptionsResult.rowCount === 0) {
        return interaction.reply({
          embeds: [errorEmbed(`<@${targetUser.id}> has no active redemptions to revoke.`)],
          ephemeral: true,
        });
      }

      // Collect all unique roles across all redemptions
      const allRoles = new Set();
      for (const row of redemptionsResult.rows) {
        for (const roleId of (row.roles_granted || [])) {
          allRoles.add(roleId);
        }
      }

      // Fetch guild member and remove roles
      let member;
      try {
        member = await interaction.guild.members.fetch(targetUser.id);
      } catch {
        member = null;
      }

      const removedRoles = [];
      if (member) {
        for (const roleId of allRoles) {
          try {
            await member.roles.remove(roleId);
            removedRoles.push(roleId);
          } catch (err) {
            console.warn(`[revoke] Failed to remove role ${roleId} from ${targetUser.id}:`, err.message);
          }
        }
      }

      // Mark all redemptions as revoked
      const redemptionIds = redemptionsResult.rows.map((r) => r.id);
      await query(
        `UPDATE redemptions SET is_revoked = TRUE WHERE id = ANY($1::uuid[])`,
        [redemptionIds]
      );

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('USER_REVOKED', $1, NULL, $2)`,
        [
          interaction.user.tag,
          JSON.stringify({
            targetUserId: targetUser.id,
            targetUsername: targetUser.tag,
            redemptionsRevoked: redemptionIds.length,
            rolesRemoved: removedRoles,
          }),
        ]
      );

      const rolesMention =
        removedRoles.length > 0
          ? removedRoles.map((id) => `<@&${id}>`).join(', ')
          : 'None (member may have left the server)';

      return interaction.reply({
        embeds: [
          successEmbed(
            'User Revoked.',
            `All redemptions for <@${targetUser.id}> (${targetUser.tag}) have been revoked.\n\n**Roles Removed:** ${rolesMention}\n**Redemptions Revoked:** ${redemptionIds.length}`
          ),
        ],
        ephemeral: true,
      });
    } catch (err) {
      console.error('[revoke]', err);
      return interaction.reply({
        embeds: [errorEmbed('Failed to revoke the user. Please try again.')],
        ephemeral: true,
      });
    }
  },
};
