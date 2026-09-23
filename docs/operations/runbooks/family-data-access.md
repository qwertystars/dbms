# Runbook — Suspected Cross-Family Data Exposure

## Severity

Treat any credible cross-family data exposure as a high-severity security incident.

## Immediate actions

1. preserve logs and request IDs
2. disable the affected endpoint or feature if exposure is ongoing
3. identify authorization path and query involved
4. determine affected family/account scope
5. do not delete evidence during mitigation

## Investigation

Check:

- membership policy evaluation
- resource query family scoping
- cache keys
- object-storage access URLs
- recent authorization changes
- deployment version

## Fix requirements

A fix is incomplete without:

- negative regression test
- cross-family integration test
- current-state/security documentation update if architecture changed
- audit of sibling endpoints using the same access pattern

## Post-incident

Document scope and remediation according to organizational incident-response requirements.
