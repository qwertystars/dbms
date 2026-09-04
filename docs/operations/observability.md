# Observability

## Structured logs

Every request log should contain:

- timestamp
- level
- request ID
- route
- method
- status
- duration
- authenticated account ID when appropriate
- family ID when appropriate
- error code

Do not log:

- passwords/tokens
- raw invitation tokens
- auth cookies
- full addresses
- phone numbers
- private post bodies by default

## Audit events

Application audit records are separate from operational logs.

Audit important family mutations defined in `business-logic.md`.

## Metrics

Baseline:

- request rate
- response latency
- error rate
- database query latency
- database pool saturation
- media upload failures
- invitation acceptance failures
- authorization-denied count by operation
- tree cycle rejection count

## Alerting

Production alerts should focus on user-impacting failures:

- sustained 5xx increase
- database unavailable
- auth integration failure
- object storage unavailable
- migration failure
- abnormal latency

Do not alert on normal 4xx traffic such as expected permission denials.

## Tracing

Full distributed tracing is optional for the modular monolith.

Preserve a request/correlation ID through:

- logs
- audit events
- external calls
