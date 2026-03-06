'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { query } = require('../../lib/db');
const { validateCode } = require('../../lib/validators');
const { successEmbed, errorEmbed } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem an invite code to unlock roles and channels.')
    .addStringOption((opt) =>
      opt
        .setName('code')
        .setDescription('Your invite code (e.g. SPECTO-XXXX-XXXX)')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const rawCode = interaction.options.getString('code', true);
    const code = rawCode.toUpperCase().trim();
    const userId = interaction.user.id;

    // Validate the code
    const validation = await validateCode(query, code, userId);
    if (!validation.valid) {
      return interaction.editReply({
        embeds: [errorEmbed(validation.reason)],
      });
    }

    const record = validation.record;
    const member = await interaction.guild.members.fetch(userId);

    // Grant roles
    const rolesGranted = [];
    for (const roleId of (record.role_ids || [])) {
      try {
        await member.roles.add(roleId);
        rolesGranted.push(roleId);
      } catch (err) {
        console.warn(`[redeem] Failed to add role ${roleId} to ${userId}:`, err.message);
      }
    }

    // Unlock channels
    const channelsGranted = [];
    for (const channelId of (record.channel_ids || [])) {
      try {
        const channel = await interaction.guild.channels.fetch(channelId);
        if (channel) {
          await channel.permissionOverwrites.edit(member, { ViewChannel: true });
          channelsGranted.push(channelId);
        }
      } catch (err) {
        console.warn(`[redeem] Failed to grant channel ${channelId} to ${userId}:`, err.message);
      }
    }

    // Increment uses
    await query(
      'UPDATE invite_codes SET uses = uses + 1 WHERE id = $1',
      [record.id]
    );

    // Record the redemption
    await query(
      `INSERT INTO redemptions (code_id, code, user_id, username, roles_granted, channels_granted)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        record.id,
        code,
        userId,
        interaction.user.tag,
        rolesGranted,
        channelsGranted,
      ]
    );

    const rolesMention =
      rolesGranted.length > 0
        ? rolesGranted.map((id) => `<@&${id}>`).join(', ')
        : 'None';
    const channelsMention =
      channelsGranted.length > 0
        ? channelsGranted.map((id) => `<#${id}>`).join(', ')
        : 'None';

    return interaction.editReply({
      embeds: [
        successEmbed(
          '🎉 Code Redeemed!',
          `Your code \`${code}\` has been successfully redeemed.\n\n**Roles Granted:** ${rolesMention}\n**Channels Unlocked:** ${channelsMention}`
        ),
      ],
    });
  },
};
