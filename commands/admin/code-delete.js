'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const { query } = require('../../lib/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('code-delete')
    .setDescription('Permanently delete an invite code.')
    .addStringOption((opt) =>
      opt.setName('code').setDescription('The invite code to delete.').setRequired(true)
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

    // Check the code exists first
    const check = await query('SELECT 1 FROM invite_codes WHERE code = $1', [code]);
    if (check.rowCount === 0) {
      return interaction.reply({
        embeds: [errorEmbed(`No invite code found matching \`${code}\`.`)],
        ephemeral: true,
      });
    }

    const confirmId = `del-confirm-${interaction.id}`;
    const cancelId = `del-cancel-${interaction.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [
        infoEmbed(`Are you sure you want to **permanently delete** code \`${code}\`?\nThis action cannot be undone.`),
      ],
      components: [row],
      ephemeral: true,
    });

    let componentInteraction;
    try {
      componentInteraction = await interaction.channel.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => (i.customId === confirmId || i.customId === cancelId) && i.user.id === interaction.user.id,
        time: 30_000,
      });
    } catch {
      // Timeout
      return interaction.editReply({
        embeds: [infoEmbed('Code deletion cancelled — confirmation timed out.')],
        components: [],
      });
    }

    if (componentInteraction.customId === cancelId) {
      await componentInteraction.update({
        embeds: [infoEmbed('Code deletion cancelled.')],
        components: [],
      });
      return;
    }

    // Confirmed — delete
    try {
      await query('DELETE FROM invite_codes WHERE code = $1', [code]);

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('CODE_DELETED', $1, $2, $3)`,
        [interaction.user.tag, code, JSON.stringify({ code })]
      );

      await componentInteraction.update({
        embeds: [successEmbed('Code Deleted.', `Invite code \`${code}\` has been permanently deleted.`)],
        components: [],
      });
    } catch (err) {
      console.error('[code-delete]', err);
      await componentInteraction.update({
        embeds: [errorEmbed('Failed to delete the code. Please try again.')],
        components: [],
      });
    }
  },
};
