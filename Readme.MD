# SpectoGate

Discord invite-code gatekeeper bot for [Specto](https://specto.systems) — a Visionnaire Studios project.

SpectoGate manages invite-only access to the Specto Alpha Discord server. Admins create and distribute invite codes; users redeem them to gain access.

---

## Features

- `/redeem` — redeem an invite code, receive roles and channel access automatically
- `/dashboard` — interactive admin dashboard with live stats, code management, templates, and audit log
- `/code-create` — create a single invite code with custom roles, expiry, and max uses
- `/code-bulk-create` — generate up to 500 codes in one batch, export as CSV
- `/code-batch-view` — view all codes from a batch label
- `/code-create-from-template` — create a code from a saved template
- `/code-edit` — edit any field on an existing code
- `/code-deactivate` — deactivate a code without deleting it
- `/code-delete` — permanently delete a code (with confirmation)
- `/code-list` — paginated list of codes filtered by status
- `/code-view` — full details and redemption history for a code
- `/code-stats` — usage stats for a specific code
- `/revoke` — revoke all redemptions for a user and remove their roles
- `/template-create` — create a reusable code template
- `/template-edit` — edit a template field
- `/template-delete` — delete a template (with confirmation)
- `/template-list` — paginated list of templates
- `/template-view` — full template details

---

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL database
- Discord bot token and application

### Install

```bash
git clone https://github.com/visionnaire-made/specto-gatekeeper.git
cd specto-gatekeeper
npm install
```

### Environment variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

```
BOT_TOKEN=        # Discord bot token
CLIENT_ID=        # Discord application client ID
GUILD_ID=         # Discord server ID
DATABASE_URL=     # PostgreSQL connection string
ADMIN_ROLE_ID=    # Discord role ID that grants admin commands
```

### Database

Run both migration files against your PostgreSQL database:

```bash
psql $DATABASE_URL -f migrations/001_init.sql
psql $DATABASE_URL -f migrations/002_code_templates.sql
```

### Register slash commands

```bash
node deploy-commands.js
```

### Run

```bash
node index.js
```

### Run with PM2 (production)

```bash
pm2 start index.js --name spectogate
pm2 save
pm2 startup
```

---

## Deployment (DigitalOcean Droplet)

```bash
ssh root@[your-droplet-ip]
cd ~/specto-gatekeeper
git pull
npm install
node deploy-commands.js
pm2 restart spectogate
```

---

## Project structure

```
specto-gatekeeper/
  index.js                          # Bot entry point, command loader, event handler
  deploy-commands.js                # Registers slash commands with Discord API
  lib/
    db.js                           # PostgreSQL connection pool
    codegen.js                      # Invite code generator (SPECTO-XXXX-XXXX)
    embeds.js                       # Shared embed builders
    validators.js                   # Code validation logic
  commands/
    user/
      redeem.js                     # /redeem
    admin/
      dashboard.js                  # /dashboard (interactive)
      code-create.js
      code-bulk-create.js
      code-batch-view.js
      code-create-from-template.js
      code-deactivate.js
      code-delete.js
      code-edit.js
      code-list.js
      code-stats.js
      code-view.js
      revoke.js
      template-create.js
      template-delete.js
      template-edit.js
      template-list.js
      template-view.js
  migrations/
    001_init.sql                    # Core tables: invite_codes, redemptions, audit_log
    002_code_templates.sql          # code_templates table
```

---

## Invite code format

All codes follow the format `SPECTO-XXXX-XXXX` using an unambiguous character set (no 0/O, 1/I/L).

---

## A Visionnaire Studios Project

Built by [visionnaire-made](https://github.com/visionnaire-made) · Not open source
