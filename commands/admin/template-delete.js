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
    .setName('template-delete')
    .setDescription('Permanently delete a code template.')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Name of the template to delete.').setRequired(true)
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

    // Check template exists
    const check = await query(
      'SELECT 1 FROM code_templates WHERE lower(name) = lower($1)',
      [name]
    );
    if (check.rowCount === 0) {
      return interaction.reply({
        embeds: [errorEmbed(`No template found with name **${name}**.`)],
        ephemeral: true,
      });
    }

    const confirmId = `tpl-del-confirm-${interaction.id}`;
    const cancelId = `tpl-del-cancel-${interaction.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('Delete Template')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [
        infoEmbed(`Are you sure you want to **permanently delete** template **${name}**?\nThis cannot be undone.`),
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
      return interaction.editReply({
        embeds: [infoEmbed('Template deletion cancelled — confirmation timed out.')],
        components: [],
      });
    }

    if (componentInteraction.customId === cancelId) {
      await componentInteraction.update({
        embeds: [infoEmbed('Template deletion cancelled.')],
        components: [],
      });
      return;
    }

    try {
      await query('DELETE FROM code_templates WHERE lower(name) = lower($1)', [name]);

      await query(
        `INSERT INTO audit_log (action, performed_by, target_code, details)
         VALUES ('TEMPLATE_DELETED', $1, NULL, $2)`,
        [interaction.user.tag, JSON.stringify({ name })]
      );

      await componentInteraction.update({
        embeds: [successEmbed('Template Deleted.', `Template **${name}** has been permanently deleted.`)],
        components: [],
      });
    } catch (err) {
      console.error('[template-delete]', err);
      await componentInteraction.update({
        embeds: [errorEmbed('Failed to delete the template. Please try again.')],
        components: [],
      });
    }
  },
};
