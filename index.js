'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const { errorEmbed } = require('./lib/embeds');

// ---------------------------------------------------------------------------
// Bootstrap client
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.commands = new Collection();

// ---------------------------------------------------------------------------
// Load commands
// ---------------------------------------------------------------------------

const commandDirs = [
  path.join(__dirname, 'commands', 'user'),
  path.join(__dirname, 'commands', 'admin'),
];

for (const dir of commandDirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    try {
      const command = require(path.join(dir, file));
      if (!command.data || !command.execute) {
        console.warn(`[commands] Skipping ${file}: missing data or execute property.`);
        continue;
      }
      client.commands.set(command.data.name, command);
      console.log(`[commands] Loaded: ${command.data.name}`);
    } catch (err) {
      console.error(`[commands] Failed to load ${file}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Event: Ready
// ---------------------------------------------------------------------------

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] Ready! Logged in as ${c.user.tag}`);
  console.log(`[bot] Serving ${c.guilds.cache.size} guild(s)`);
});

// ---------------------------------------------------------------------------
// Event: InteractionCreate
// ---------------------------------------------------------------------------

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`[bot] Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[bot] Error executing /${interaction.commandName}:`, err);

    const embed = errorEmbed('An unexpected error occurred while executing this command. Please try again.');

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (replyErr) {
      console.error('[bot] Failed to send error response:', replyErr);
    }
  }
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error('[bot] Failed to login:', err);
  process.exit(1);
});
