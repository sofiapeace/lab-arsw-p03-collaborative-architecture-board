# BoardEvent Contract — Lab #6

The collaboration envelope exchanged over STOMP/WebSocket between the browser
clients and the server. REST keeps its own contract, documented separately in
[`architecture/api-contract.md`](architecture/api-contract.md).

Both sides of this contract are implemented from this document:

| Side | File |
|---|---|
| Server | `application/event/BoardEvent.java`, `BoardEventType.java`, `BoardEventPayload.java` |
| Browser | `static/js/events/board-event.js` |
| Guard | `BoardEventContractTest` — parses the exact JSON the browser emits |

## Destinations

```text
Client  SEND       /app/boards/{boardId}/events
Server  BROADCAST  /topic/boards/{boardId}
```

WebSocket endpoint: `/ws`. Application prefix: `/app`. Broker: Spring simple
in-memory broker on `/topic`.

Clients publish to **`/app`**, never to `/topic`. The prefix is what routes a
message to `BoardWebSocketController` instead of relaying it straight to the
other subscribers; see [ADR-003](ADR-003-rest-vs-realtime.md).

One destination per board is what keeps sessions independent: a client
subscribed to `/topic/boards/A` is never reached by a send to
`/topic/boards/B`.

## Envelope

```json
{
  "eventId": "58badb16-7e30-4284-9b94-c1b80ef15385",
  "boardId": "1329b220-2a92-4d0a-8626-243590a1c196",
  "type": "ELEMENT_MOVED",
  "actorId": "client-945937b6",
  "occurredAt": "2026-09-23T03:28:04.565Z",
  "payload": {
    "element": null,
    "elementId": "rect-1ee0b6d7-c3a3-4ceb-b594-8d289bf34df9",
    "x": 520.0,
    "y": 330.0
  }
}
```

| Field | Responsibility | Required |
|---|---|---|
| `eventId` | Unique identifier of the message. | yes |
| `boardId` | Session/board the change belongs to. | yes |
| `type` | Semantics of the event. | yes |
| `actorId` | Client that originated the interaction. | yes |
| `occurredAt` | Instant reported by the emitter, ISO-8601 with an explicit zone. | yes |
| `payload` | Minimum data required by the event type. | yes |

A message missing any of these is refused by the compact constructor of
`BoardEvent`, so it never reaches the application service.

`occurredAt` is a **string**, not a numeric timestamp. This is not cosmetic:
the messaging layer originally built its own `ObjectMapper` and serialized it
as `1790134084.565000000`, which meant one contract had two wire formats
depending on the transport that carried it. `WebSocketConfig` now reuses the
`ObjectMapper` Spring Boot configures for REST, and
`shouldWriteOccurredAtAsAnIsoInstantAndNotANumber` keeps it that way.

`actorId` is informational: no rule depends on it. Clients receive their own
accepted events back and apply them like any other, which is what confirms the
optimistic local change against the authoritative state.

## Payload per event type

Only the fields relevant to the type are populated; the rest travel as `null`
so the payload keeps one shape for every event.

| Type | Payload | Meaning | Rules enforced by the server |
|---|---|---|---|
| `ELEMENT_CREATED` | `element` | Add a RECTANGLE or TEXT. | Rejects a duplicate element id, and an element whose type is CONNECTOR. |
| `CONNECTOR_CREATED` | `element` | Add a CONNECTOR. | Requires type CONNECTOR; both endpoints must exist and must not be connectors themselves. |
| `ELEMENT_MOVED` | `elementId`, `x`, `y` | Reposition a non-connector element. | Requires both coordinates; refuses to move a CONNECTOR, whose position is derived from its endpoints. |
| `ELEMENT_UPDATED` | `element` | Replace the editable properties of an existing element. | The element must exist and may not change its type. |
| `ELEMENT_DELETED` | `elementId` | Delete an element. | The element must exist; connectors that referenced it are deleted with it. |

`x` and `y` are nullable numbers (`Double` on the server) so that "no position
reported" stays distinguishable from "position 0.0".

## Architectural rules

**1. The server applies and validates before broadcasting.** A message is
handled by `BoardWebSocketController`, applied by
`BoardEventApplicationService` to the authoritative Board, saved, and only then
published. An event that is refused reaches no subscriber at all: broadcasting
it would leave every client displaying a change the server rejected.

**2. The destination is the authority on the board.** The `boardId` travels
both in the destination and in the envelope. When they disagree the message is
discarded rather than reconciled — honouring the envelope would let a client
subscribed to one board write into another.

**3. The broadcast carries the normalized event.** `apply()` returns the same
envelope with a payload rebuilt from what was actually stored, so subscribers
receive server-accepted data instead of raw client input.

**4. Applying an event is a state transition, never a DOM mutation.** On
arrival the client calls `BoardState.applyEvent(event)` and then re-renders.
The STOMP callback must not touch the SVG: `BoardView` rebuilds the canvas from
the state snapshot, so anything drawn from the callback would be a second copy
of the state and would disappear on the next render.

**5. Every event is idempotent.** A client is subscribed to the same topic it
publishes to and therefore receives its own events back, and a reconnection can
replay one. `CREATED`/`UPDATED` upsert by id instead of appending, `MOVED`
carries an **absolute** position rather than a delta, and `DELETED` treats
"already gone" as success. Applying an event twice leaves the board exactly as
applying it once.

**6. The contract is not the domain.** `BoardEvent` lives in
`application/event`, never in `domain/model`. `Board` and `BoardElement`
represent the problem state; `BoardEvent` represents what participants announce
to each other. Verified: `grep -rn "BoardEvent" src/main/java/.../domain`
returns nothing.

## Deliberately deferred

This contract carries **no sequence number and no version**, and the server
applies events in arrival order with a read-modify-write that is neither locked
nor atomic. Two simultaneous changes can lose one another.

That is intentional. Lab #7 — Concurrent Collaboration uses this exact path to
expose lost updates, shared state and non-atomic operations. Adding a
consistency strategy now would remove the material instead of solving it.

Out of scope for this lab and absent from the contract: authentication,
presence, remote cursors, chat, event history and replay. A client that
disconnects misses the events published meanwhile and catches up by reloading
the snapshot over REST.
