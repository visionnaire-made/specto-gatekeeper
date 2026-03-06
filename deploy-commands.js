'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

// ---------------------------------------------------------------------------
// Collect all command data
// ---------------------------------------------------------------------------

const commandDirs = [
  path.join(__dirname, 'commands', 'user'),
  path.join(__dirname, 'commands', 'admin'),
];

const commands = [];

for (const dir of commandDirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    try {
      const command = require(path.join(dir, file));
      if (!command.data) {
        console.warn(`[deploy] Skipping ${file}: missing data property.`);
        continue;
      }
      commands.push(command.data.toJSON());
      console.log(`[deploy] Queued: ${command.data.name}`);
    } catch (err) {
      console.error(`[deploy] Failed to load ${file}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Deploy commands to Discord
// ---------------------------------------------------------------------------

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`[deploy] Registering ${commands.length} command(s) to guild ${process.env.GUILD_ID}…`);

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log(`[deploy] ✅ Successfully registered ${data.length} command(s).`);
  } catch (err) {
    console.error('[deploy] Failed to register commands:', err);
    process.exit(1);
  }
})();
