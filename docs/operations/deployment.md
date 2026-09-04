# Deployment

## Target topology

V1:

```text
Browser
  |
HTTPS
  |
Web application / API
  |--------------------|
  |                    |
PostgreSQL         Object storage
```

Authentication may use an external OIDC/OAuth provider.

No queue or cache service is required for initial deployment.

## Environments

Maintain:

- local
- staging
- production

Production must not share database credentials or storage buckets with local/staging.

## Required environment categories

```text
DATABASE_URL
APP_BASE_URL

AUTH_*
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
```

Actual variable names must be centralized in a validated environment schema.

## Deployment order with migrations

For additive compatible changes:

1. backup/verify database health
2. apply backward-compatible migration
3. deploy application
4. verify health checks and smoke tests
5. remove obsolete compatibility paths only in a later deployment

For destructive changes:

- create a specific migration plan first
- never combine irreversible data deletion with an unverified application rollout

## Health endpoints

Provide:

- liveness
- readiness

Readiness should verify critical application dependencies without causing expensive load.

## Backup

Production PostgreSQL requires automated backups.

Minimum operational requirement:

- regular snapshot/PITR capability as supported by provider
- documented retention
- restore procedure tested before production reliance

Object storage should use provider durability/versioning options where justified.

## Rollback

Application rollback:

- deploy previous known-good artifact

Database rollback:

- prefer forward-fix migrations
- use restore only when necessary
- never assume an arbitrary migration is safely reversible

## Release smoke test

After deployment verify:

- sign in
- list families
- open family
- load tree
- create and delete a test post in staging
- authorization negative check
- media access
