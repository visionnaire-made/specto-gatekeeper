'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ComponentType,
} = require('discord.js');
const { query } = require('../../lib/db');
const { errorEmbed } = require('../../lib/embeds');

const FOOTER_TEXT = 'SPECTO · A VISIONNAIRE PROJECT';
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes
const PAGE_SIZE = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the footer object for the dashboard.
 * @param {object} session
 * @param {string} [status='Session active']
 */
function makeFooter(session, status = 'Session active') {
  return { text: `Requested by ${session.requesterTag} • ${status}` };
}

/**
 * Flatten all component customIds in a set of ActionRows, check for dupes.
 * Throws if any duplicate is found.
 * @param {ActionRowBuilder[]} rows
 */
function assertUniqueCustomIds(rows) {
  const seen = new Set();
  const duplicates = [];
  for (const row of rows) {
    for (const component of row.components) {
      const id = component.data && component.data.custom_id;
      if (!id) continue;
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
  }
  if (duplicates.length > 0) {
    console.error('[dashboard] Duplicate customIds detected:', duplicates);
    throw new Error(`Duplicate customIds: ${duplicates.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Component builders
// ---------------------------------------------------------------------------

function buildNavRow(sessionId, currentView) {
  const views = [
    { label: 'Overview', value: 'overview' },
    { label: 'Codes', value: 'codes_list' },
    { label: 'Templates', value: 'templates_list' },
    { label: 'Audit Log', value: 'audit_log' },
  ];

  return new ActionRowBuilder().addComponents(
    ...views.map((v) =>
      new ButtonBuilder()
        .setCustomId(`${sessionId}:view:${v.value}`)
        .setLabel(v.label)
        .setStyle(currentView === v.value ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ButtonBuilder()
      .setCustomId(`${sessionId}:refresh`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Success)
  );
}

function buildQuickRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${sessionId}:quick:codes_active`)
      .setLabel('Active Codes')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${sessionId}:quick:codes_expiring`)
      .setLabel('Expiring Codes')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${sessionId}:quick:templates`)
      .setLabel('Templates')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${sessionId}:quick:audit`)
      .setLabel('Audit Log')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${sessionId}:close`)
      .setLabel('✕ Close')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildCodesFilterRow(sessionId, currentFilter) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${sessionId}:codes_filter`)
      .setPlaceholder(`Filter: ${currentFilter}`)
      .addOptions(
        { label: 'Active', value: 'active', default: currentFilter === 'active' },
        { label: 'Expiring (72h)', value: 'expiring', default: currentFilter === 'expiring' },
        { label: 'Inactive', value: 'inactive', default: currentFilter === 'inactive' },
        { label: 'All', value: 'all', default: currentFilter === 'all' }
      )
  );
}

function buildTemplatesFilterRow(sessionId, currentFilter) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${sessionId}:templates_filter`)
      .setPlaceholder(`Filter: ${currentFilter}`)
      .addOptions(
        { label: 'Active', value: 'active', default: currentFilter === 'active' },
        { label: 'Inactive', value: 'inactive', default: currentFilter === 'inactive' },
        { label: 'All', value: 'all', default: currentFilter === 'all' }
      )
  );
}

function buildPaginationRow(sessionId, viewKey, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${sessionId}:page:${viewKey}:prev`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${sessionId}:noop:${viewKey}`)
      .setLabel(`Page ${page}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${sessionId}:page:${viewKey}:next`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages)
  );
}

function buildCodeSelectRow(sessionId, codes) {
  const options = codes.slice(0, 25).map((c) => ({
    label: c.code,
    description: c.label.slice(0, 50),
    value: c.code,
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${sessionId}:code_select`)
      .setPlaceholder('Select a code to view details…')
      .addOptions(options)
  );
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchOverviewData() {
  const [codesStats, templateStats, redemptionStats, lastAudit] = await Promise.all([
    query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())) AS active,
        COUNT(*) FILTER (WHERE is_active = FALSE OR (expires_at IS NOT NULL AND expires_at <= NOW())) AS inactive,
        COUNT(*) FILTER (WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '72 hours') AS expiring_soon,
        COUNT(*) FILTER (WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '24 hours') AS expiring_24h,
        COUNT(*) FILTER (WHERE max_uses IS NOT NULL AND uses >= max_uses) AS at_capacity,
        COUNT(*) FILTER (WHERE max_uses IS NOT NULL AND max_uses > 0 AND (uses::float / max_uses::float) >= 0.8 AND uses < max_uses) AS near_capacity,
        COALESCE(SUM(uses), 0) AS total_uses
      FROM invite_codes
    `),
    query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE) AS active,
        COUNT(*) FILTER (WHERE is_active = FALSE) AS inactive
      FROM code_templates
    `),
    query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE redeemed_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE is_revoked = TRUE) AS revoked
      FROM redemptions
    `),
    query(`SELECT action, performed_by, target_code, created_at FROM audit_log ORDER BY created_at DESC LIMIT 1`),
  ]);

  return {
    codes: codesStats.rows[0],
    templates: templateStats.rows[0],
    redemptions: redemptionStats.rows[0],
    lastAudit: lastAudit.rows[0] || null,
  };
}

async function fetchCodesPage(filter, page) {
  let whereClause = '';
  if (filter === 'active') whereClause = "WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())";
  else if (filter === 'inactive') whereClause = "WHERE is_active = FALSE OR (expires_at IS NOT NULL AND expires_at <= NOW())";
  else if (filter === 'expiring') whereClause = "WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '72 hours'";

  const countResult = await query(`SELECT COUNT(*) FROM invite_codes ${whereClause}`);
  const total = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const result = await query(
    `SELECT code, label, is_active, uses, max_uses, expires_at
     FROM invite_codes ${whereClause}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE, offset]
  );

  return { rows: result.rows, total, totalPages, page: safePage };
}

async function fetchTemplatesPage(filter, page) {
  let whereClause = '';
  if (filter === 'active') whereClause = 'WHERE is_active = TRUE';
  else if (filter === 'inactive') whereClause = 'WHERE is_active = FALSE';

  const countResult = await query(`SELECT COUNT(*) FROM code_templates ${whereClause}`);
  const total = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const result = await query(
    `SELECT name, description, is_active, default_max_uses, default_expires_in_days
     FROM code_templates ${whereClause}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE, offset]
  );

  return { rows: result.rows, total, totalPages, page: safePage };
}

async function fetchAuditPage(page) {
  const countResult = await query('SELECT COUNT(*) FROM audit_log');
  const total = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const result = await query(
    `SELECT action, performed_by, target_code, created_at
     FROM audit_log
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE, offset]
  );

  return { rows: result.rows, total, totalPages, page: safePage };
}

async function fetchCodeDetail(code) {
  const codeResult = await query('SELECT * FROM invite_codes WHERE code = $1', [code]);
  if (codeResult.rowCount === 0) return null;

  const record = codeResult.rows[0];
  const redemptionsResult = await query(
    `SELECT user_id, username, redeemed_at, is_revoked
     FROM redemptions WHERE code_id = $1
     ORDER BY redeemed_at DESC LIMIT 5`,
    [record.id]
  );

  return { record, redemptions: redemptionsResult.rows };
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

async function buildOverviewResponse(session, state) {
  const data = await fetchOverviewData();
  const c = data.codes;
  const t = data.templates;
  const r = data.redemptions;

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('⚡ SpectoGate Dashboard')
    .setDescription('Real-time overview of your invite code system.')
    .addFields(
      {
        name: '🎟️ Invite Codes',
        value: [
          `**Total:** ${c.total} | **Active:** ${c.active} | **Inactive:** ${c.inactive}`,
          `**Expiring <72h:** ${c.expiring_soon} | **Expiring <24h:** ${c.expiring_24h}`,
          `**At Capacity:** ${c.at_capacity} | **Near Capacity:** ${c.near_capacity}`,
          `**Total Uses:** ${c.total_uses}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📋 Templates',
        value: `**Total:** ${t.total} | **Active:** ${t.active} | **Inactive:** ${t.inactive}`,
        inline: false,
      },
      {
        name: '🔑 Redemptions',
        value: `**Total:** ${r.total} | **Last 24h:** ${r.last_24h} | **Revoked:** ${r.revoked}`,
        inline: false,
      }
    )
    .setFooter(makeFooter(session))
    .setTimestamp();

  if (data.lastAudit) {
    const ts = `<t:${Math.floor(new Date(data.lastAudit.created_at).getTime() / 1000)}:R>`;
    embed.addFields({
      name: '📜 Last Audit Entry',
      value: `**${data.lastAudit.action}** by ${data.lastAudit.performed_by || 'system'} ${ts}${data.lastAudit.target_code ? ` on \`${data.lastAudit.target_code}\`` : ''}`,
      inline: false,
    });
  }

  const components = [
    buildNavRow(session.id, state.view),
    buildQuickRow(session.id),
    buildCodesFilterRow(session.id, state.filters.codes),
  ];
  assertUniqueCustomIds(components);

  return { embeds: [embed], components };
}

async function buildCodesListResponse(session, state) {
  const data = await fetchCodesPage(state.filters.codes, state.pages.codes_list);
  state.pages.codes_list = data.page; // clamp to valid page

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`🎟️ Invite Codes — ${state.filters.codes.charAt(0).toUpperCase() + state.filters.codes.slice(1)}`)
    .setDescription(`**Total:** ${data.total} codes`)
    .setFooter(makeFooter(session))
    .setTimestamp();

  if (data.rows.length === 0) {
    embed.setDescription('No codes found for this filter.');
  } else {
    for (const row of data.rows) {
      const status = row.is_active ? '✅' : '❌';
      const uses = `${row.uses}/${row.max_uses ?? '∞'}`;
      const expires = row.expires_at
        ? `<t:${Math.floor(new Date(row.expires_at).getTime() / 1000)}:R>`
        : 'Never';
      embed.addFields({
        name: `\`${row.code}\``,
        value: `**${row.label}** · ${status} · Uses: ${uses} · Expires: ${expires}`,
        inline: false,
      });
    }
  }

  const components = [
    buildNavRow(session.id, state.view),
    buildQuickRow(session.id),
    buildCodesFilterRow(session.id, state.filters.codes),
  ];

  // Add code select row if we have codes
  if (data.rows.length > 0) {
    components.push(buildCodeSelectRow(session.id, data.rows));
  }

  components.push(buildPaginationRow(session.id, 'codes_list', data.page, data.totalPages));

  assertUniqueCustomIds(components);
  return { embeds: [embed], components };
}

async function buildTemplatesListResponse(session, state) {
  const data = await fetchTemplatesPage(state.filters.templates, state.pages.templates_list);
  state.pages.templates_list = data.page;

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`📋 Templates — ${state.filters.templates.charAt(0).toUpperCase() + state.filters.templates.slice(1)}`)
    .setDescription(`**Total:** ${data.total} templates`)
    .setFooter(makeFooter(session))
    .setTimestamp();

  if (data.rows.length === 0) {
    embed.setDescription('No templates found for this filter.');
  } else {
    for (const row of data.rows) {
      const status = row.is_active ? '✅' : '❌';
      const maxUses = row.default_max_uses != null ? String(row.default_max_uses) : '∞';
      const expires = row.default_expires_in_days != null ? `${row.default_expires_in_days}d` : 'Never';
      embed.addFields({
        name: row.name,
        value: `${row.description || '—'}\n${status} · Max Uses: ${maxUses} · Expires: ${expires}`,
        inline: false,
      });
    }
  }

  const components = [
    buildNavRow(session.id, state.view),
    buildQuickRow(session.id),
    buildTemplatesFilterRow(session.id, state.filters.templates),
    buildPaginationRow(session.id, 'templates_list', data.page, data.totalPages),
  ];

  assertUniqueCustomIds(components);
  return { embeds: [embed], components };
}

async function buildAuditLogResponse(session, state) {
  const data = await fetchAuditPage(state.pages.audit_log);
  state.pages.audit_log = data.page;

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('📜 Audit Log')
    .setDescription(`**Total entries:** ${data.total}`)
    .setFooter(makeFooter(session))
    .setTimestamp();

  if (data.rows.length === 0) {
    embed.setDescription('No audit log entries found.');
  } else {
    for (const row of data.rows) {
      const ts = `<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R>`;
      embed.addFields({
        name: row.action,
        value: `By: ${row.performed_by || 'system'}${row.target_code ? ` · Code: \`${row.target_code}\`` : ''} · ${ts}`,
        inline: false,
      });
    }
  }

  const components = [
    buildNavRow(session.id, state.view),
    buildQuickRow(session.id),
    buildPaginationRow(session.id, 'audit_log', data.page, data.totalPages),
  ];

  assertUniqueCustomIds(components);
  return { embeds: [embed], components };
}

async function buildCodeDetailResponse(session, state) {
  const detail = await fetchCodeDetail(state.selectedCode);

  if (!detail) {
    state.view = 'codes_list';
    return buildCodesListResponse(session, state);
  }

  const { record, redemptions } = detail;

  const roles =
    record.role_ids && record.role_ids.length > 0
      ? record.role_ids.map((id) => `<@&${id}>`).join(', ')
      : 'None';

  const channels =
    record.channel_ids && record.channel_ids.length > 0
      ? record.channel_ids.map((id) => `<#${id}>`).join(', ')
      : 'None';

  const expires = record.expires_at
    ? `<t:${Math.floor(new Date(record.expires_at).getTime() / 1000)}:R>`
    : 'Never';

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`🔍 Code: \`${record.code}\``)
    .addFields(
      { name: 'Label', value: record.label, inline: true },
      { name: 'Status', value: record.is_active ? '✅ Active' : '❌ Inactive', inline: true },
      { name: 'Uses', value: `${record.uses}/${record.max_uses ?? '∞'}`, inline: true },
      { name: 'Expires', value: expires, inline: true },
      { name: 'Created By', value: record.created_by || '—', inline: true },
      { name: 'Notes', value: record.notes || '—', inline: false },
      { name: 'Roles', value: roles, inline: false },
      { name: 'Channels', value: channels, inline: false }
    )
    .setFooter(makeFooter(session))
    .setTimestamp();

  if (redemptions.length > 0) {
    const redeemers = redemptions
      .map((r) => {
        const ts = `<t:${Math.floor(new Date(r.redeemed_at).getTime() / 1000)}:f>`;
        const revoked = r.is_revoked ? ' *(revoked)*' : '';
        return `<@${r.user_id}>${revoked} — ${ts}`;
      })
      .join('\n');
    embed.addFields({ name: 'Recent Redeemers', value: redeemers, inline: false });
  }

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${session.id}:back:codes`)
      .setLabel('◀ Back to Codes')
      .setStyle(ButtonStyle.Secondary)
  );

  const components = [
    buildNavRow(session.id, state.view),
    buildQuickRow(session.id),
    backRow,
  ];

  assertUniqueCustomIds(components);
  return { embeds: [embed], components };
}

async function buildResponse(session, state) {
  switch (state.view) {
    case 'overview':      return buildOverviewResponse(session, state);
    case 'codes_list':    return buildCodesListResponse(session, state);
    case 'templates_list': return buildTemplatesListResponse(session, state);
    case 'audit_log':     return buildAuditLogResponse(session, state);
    case 'code_detail':   return buildCodeDetailResponse(session, state);
    default:              return buildOverviewResponse(session, state);
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Open the interactive SpectoGate admin dashboard.'),

  async execute(interaction) {
    // Admin check
    const adminRoleId = process.env.ADMIN_ROLE_ID;
    if (!interaction.member.roles.cache.has(adminRoleId)) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to use this command.')],
        ephemeral: true,
      });
    }

    // Send placeholder first so we have a message to collect from
    const placeholder = await interaction.reply({
      content: 'Preparing dashboard…',
      ephemeral: true,
      fetchReply: true,
    });

    const session = {
      id: `${placeholder.id}-${interaction.user.id}`,
      userId: interaction.user.id,
      requesterTag: interaction.user.tag,
    };

    const state = {
      view: 'overview',
      pages: { codes_list: 1, templates_list: 1, audit_log: 1 },
      filters: { codes: 'active', templates: 'active' },
      selectedCode: null,
    };

    // Build and send the initial dashboard
    try {
      const initialResponse = await buildResponse(session, state);
      await interaction.editReply(initialResponse);
    } catch (err) {
      console.error('[dashboard] Failed to build initial response:', err);
      return interaction.editReply({
        content: '',
        embeds: [errorEmbed('Failed to load the dashboard. Please try again.')],
        components: [],
      });
    }

    // Create the component collector on the channel, filtered strictly by session
    if (!interaction.channel) {
      console.error('[dashboard] No channel available for collector.');
      return;
    }

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (i) =>
        i.customId.startsWith(session.id + ':') && i.user.id === session.userId,
      time: SESSION_TTL,
    });

    collector.on('collect', async (componentInteraction) => {
      const parts = componentInteraction.customId.split(':');
      // parts[0] = sessionId segment (may contain hyphens — so we split from position 1 onwards)
      // customId format: ${sessionId}:action:...rest
      // since sessionId itself contains colons (placeholder.id-userId), we need to strip the sessionId prefix
      const withoutPrefix = componentInteraction.customId.slice(session.id.length + 1); // remove "sessionId:"
      const [action, ...rest] = withoutPrefix.split(':');

      try {
        switch (action) {
          case 'view':
            state.view = rest[0];
            break;

          case 'refresh':
            // rebuild current view — fall through to update below
            break;

          case 'codes_filter':
            state.filters.codes = componentInteraction.values[0];
            state.pages.codes_list = 1;
            state.view = 'codes_list';
            break;

          case 'templates_filter':
            state.filters.templates = componentInteraction.values[0];
            state.pages.templates_list = 1;
            state.view = 'templates_list';
            break;

          case 'page': {
            const viewKey = rest[0];
            const direction = rest[1];
            const delta = direction === 'next' ? 1 : -1;
            const current = state.pages[viewKey] || 1;
            state.pages[viewKey] = Math.max(1, current + delta);
            break;
          }

          case 'code_select':
            state.selectedCode = componentInteraction.values[0];
            state.view = 'code_detail';
            break;

          case 'quick':
            switch (rest[0]) {
              case 'codes_active':
                state.filters.codes = 'active';
                state.view = 'codes_list';
                break;
              case 'codes_expiring':
                state.filters.codes = 'expiring';
                state.view = 'codes_list';
                break;
              case 'templates':
                state.view = 'templates_list';
                break;
              case 'audit':
                state.view = 'audit_log';
                break;
            }
            break;

          case 'back':
            if (rest[0] === 'codes') state.view = 'codes_list';
            break;

          case 'close':
            await componentInteraction.deferUpdate();
            collector.stop('closed');
            return;

          case 'noop':
            await componentInteraction.deferUpdate();
            return;

          default:
            // Unknown action — just rebuild current view
            break;
        }

        const response = await buildResponse(session, state);
        await componentInteraction.update(response);
      } catch (err) {
        console.error('[dashboard] Collector error:', err);
        try {
          await componentInteraction.update({
            embeds: [errorEmbed('An error occurred while updating the dashboard.')],
            components: [],
          });
        } catch {
          // Best-effort
        }
      }
    });

    collector.on('end', async (_collected, reason) => {
      try {
        const finalMessage = await interaction.fetchReply();
        if (!finalMessage) return;

        const status = reason === 'closed' ? 'Session closed.' : 'Session expired.';

        // Disable all components — handle Button (type 2) and StringSelect (type 3)
        const disabledRows = finalMessage.components.map((row) => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components = newRow.components.map((comp) => {
            const json = comp.toJSON();
            if (json.type === ComponentType.Button) {
              return ButtonBuilder.from(json).setDisabled(true);
            }
            if (json.type === ComponentType.StringSelect) {
              return StringSelectMenuBuilder.from(json).setDisabled(true);
            }
            // Unknown component type — log and return as-is
            console.warn('[dashboard] Unknown component type in end handler:', json.type);
            return comp;
          });
          return newRow;
        });

        const finalEmbed = new EmbedBuilder()
          .setColor(0x6b7280)
          .setTitle('Dashboard Closed')
          .setDescription(reason === 'closed' ? 'The dashboard was closed by the admin.' : 'The dashboard session has expired after 5 minutes of inactivity.')
          .setFooter({ text: `${makeFooter(session, status).text} · ${FOOTER_TEXT}` })
          .setTimestamp();

        await interaction.editReply({
          content: null,
          embeds: [finalEmbed],
          components: disabledRows,
        });
      } catch (err) {
        console.error('[dashboard] Failed to update on collector end:', err);
      }
    });
  },
};
