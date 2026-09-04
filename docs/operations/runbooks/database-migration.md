# Runbook — Database Migration Failure

## Trigger

A production migration fails or the new application cannot operate against the migrated schema.

## Immediate actions

1. stop additional production deploys
2. record failing migration version and error
3. determine whether the migration committed partially
4. keep the previous application artifact available
5. avoid ad-hoc manual schema edits unless documented as emergency repair

## Recovery decision

### Migration did not commit

Restore previous application version if needed, fix migration, retest in staging, redeploy.

### Migration committed but application failed

Prefer:

1. roll application forward with a fix if schema is backward-compatible
2. otherwise deploy previous compatible application
3. restore database only when data/schema state cannot be safely forward-fixed

## Verification

After recovery:

- run schema version check
- run readiness
- execute family/tree read smoke test
- execute one safe write in staging or controlled production path
- verify error rate returns to normal

## Follow-up

Record:

- cause
- affected migration
- user impact
- permanent fix
- test added to prevent recurrence
