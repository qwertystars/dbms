# Event Contracts

## Current target

V1 has no required external event bus.

Internal domain events may be used inside the process for decoupling, but correctness must not depend on unreliable in-memory delivery.

## Reserved domain-event semantics

If persistent asynchronous processing is later introduced, use explicit versioned event names.

Potential examples:

### EVT-FAMILY-MEMBER-INVITED.v1

Produced after an invitation is committed.

Purpose:

- send invitation notification

### EVT-MEDIA-DELETE-REQUESTED.v1

Produced when a media asset should be removed from object storage.

### EVT-FAMILY-DELETE-REQUESTED.v1

Produced if family deletion becomes asynchronous at larger scale.

## Event rules

Any persistent event system introduced later must define:

- event ID
- event version
- occurred-at timestamp
- correlation/request ID
- producer
- idempotency behavior
- retry policy
- dead-letter handling

No consumer may assume exactly-once delivery.
