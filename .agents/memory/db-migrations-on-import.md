---
name: Database migrations on import
description: Why database migrations must be applied manually after a fresh import of this project.
---

After importing this project from GitHub or another export, the PostgreSQL database tables do not exist yet even though `DATABASE_URL` is configured. This causes the API server to start successfully but return HTTP 500 for endpoints like `/api/games` with `relation "games" does not exist`.

**Why:** The project policy in `docs/MIGRATIONS.md` deliberately avoids running migrations automatically against the shared/live database, so `post-merge.sh` only installs dependencies and builds shared libs. Migrations must be a deliberate step.

**How to apply:**

```bash
pnpm --filter @workspace/db run db:migrate
```

For fresh imports, the consolidated setup script is:

```bash
./scripts/setup.sh
```
