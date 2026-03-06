---
# Fill in the fields below to create a basic custom agent for your repository.
# The Copilot CLI can be used for local testing: https://gh.io/customagents/cli
# To make this agent available, merge this file into the default repository branch.
# For format details, see: https://gh.io/customagents/config
name: SpectoGate
description: Discord invite-code gatekeeper bot for Specto (specto.systems). Manages alpha tester access via slash commands, interactive admin dashboard, bulk code generation, templates, and audit logging.
---
# SpectoGate Agent

You are working on SpectoGate, a Discord.js v14 bot for Specto (specto.systems) — a Visionnaire Studios project.

## Stack
- Node.js 20, CommonJS (require/module.exports only, no ES modules)
- discord.js ^14.15.3
- pg ^8.11.3 (PostgreSQL via connection pool)
- dotenv ^16.4.5
- Deployed via PM2 on Ubuntu 24.04 DigitalOcean droplet (NYC3)

## Key rules
- All slash command replies must be ephemeral
- Every admin command checks ADMIN_ROLE_ID from process.env before executing
- Dashboard customIds must be prefixed with sessionId to avoid collisions
- Never exceed 5 ActionRows or 25 SelectMenu options per message
- code-bulk-create must use a database transaction via pool.connect()
- generateCode accepts a queryFn parameter so it works inside transactions
- Never use import/export — CommonJS only throughout

## Environment variables
BOT_TOKEN, CLIENT_ID, GUILD_ID, DATABASE_URL, ADMIN_ROLE_ID

## Database tables
invite_codes, redemptions, audit_log, code_templates

## Lib files
- lib/db.js — pg Pool, exports query() and pool
- lib/codegen.js — generates SPECTO-XXXX-XXXX codes using crypto.randomInt
- lib/embeds.js — successEmbed, errorEmbed, infoEmbed, codeEmbed
- lib/validators.js — validateCode() checks active, expiry, max_uses, duplicate redemption

## Commands
- commands/user/redeem.js — /redeem
- commands/admin/ — dashboard, code-create, code-bulk-create, code-batch-view,
  code-create-from-template, code-deactivate, code-delete, code-edit,
  code-list, code-stats, code-view, revoke, template-create, template-delete,
  template-edit, template-list, template-view

## Deployment
After any change: git pull → npm install → node deploy-commands.js → pm2 restart spectogate
