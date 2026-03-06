'use strict';

const { EmbedBuilder } = require('discord.js');

const FOOTER = { text: 'SPECTO · A VISIONNAIRE PROJECT' };

/**
 * Green success embed.
 * If description is undefined, the title value is used as the description.
 * @param {string} title
 * @param {string} [description]
 * @returns {EmbedBuilder}
 */
function successEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setFooter(FOOTER);

  if (description === undefined) {
    embed.setDescription(title);
  } else {
    embed.setTitle(title).setDescription(description);
  }
  return embed;
}

/**
 * Red error embed.
 * @param {string} description
 * @param {string} [title='Error.']
 * @returns {EmbedBuilder}
 */
function errorEmbed(description, title = 'Error.') {
  return new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(title)
    .setDescription(description)
    .setFooter(FOOTER);
}

/**
 * Purple info embed.
 * @param {string|null} description
 * @returns {EmbedBuilder}
 */
function infoEmbed(description) {
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setFooter(FOOTER);
  if (description !== null && description !== undefined) {
    embed.setDescription(description);
  }
  return embed;
}

/**
 * Purple code-details embed shown after code creation.
 * @param {object} record  A row from invite_codes.
 * @returns {EmbedBuilder}
 */
function codeEmbed(record) {
  const roles =
    record.role_ids && record.role_ids.length > 0
      ? record.role_ids.map((id) => `<@&${id}>`).join(', ')
      : 'None';

  const channels =
    record.channel_ids && record.channel_ids.length > 0
      ? record.channel_ids.map((id) => `<#${id}>`).join(', ')
      : 'None';

  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('Invite Code Created.')
    .setFooter(FOOTER)
    .addFields(
      { name: 'CODE', value: `\`${record.code}\``, inline: true },
      { name: 'LABEL', value: record.label, inline: true },
      { name: 'MAX USES', value: record.max_uses != null ? String(record.max_uses) : '∞', inline: true },
      { name: 'EXPIRES', value: record.expires_at ? `<t:${Math.floor(new Date(record.expires_at).getTime() / 1000)}:R>` : 'Never', inline: true },
      { name: 'STATUS', value: record.is_active ? '✅ Active' : '❌ Inactive', inline: true },
      { name: 'ROLES ATTACHED', value: roles, inline: false },
      { name: 'CHANNELS ATTACHED', value: channels, inline: false },
      { name: 'NOTES', value: record.notes || '—', inline: false }
    );
}

module.exports = { successEmbed, errorEmbed, infoEmbed, codeEmbed, FOOTER };
