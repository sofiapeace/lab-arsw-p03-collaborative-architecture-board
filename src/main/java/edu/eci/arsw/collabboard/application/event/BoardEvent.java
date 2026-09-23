package edu.eci.arsw.collabboard.application.event;

import java.time.Instant;

/**
 * Envelope exchanged between collaboration participants over STOMP.
 *
 * This is a communication contract, deliberately kept out of the domain model:
 * Board and BoardElement keep representing the problem state, while BoardEvent
 * only describes a change one participant announces to the others. Turning
 * every message into a domain entity would leak the protocol into the domain.
 *
 * The compact constructor enforces the contract at the boundary, so a malformed
 * message is rejected before it can ever reach the application service.
 */
public record BoardEvent(
        String eventId,
        String boardId,
        BoardEventType type,
        String actorId,
        Instant occurredAt,
        BoardEventPayload payload) {

    public BoardEvent {
        if (eventId == null || eventId.isBlank()) throw new IllegalArgumentException("eventId is required");
        if (boardId == null || boardId.isBlank()) throw new IllegalArgumentException("boardId is required");
        if (type == null) throw new IllegalArgumentException("type is required");
        if (actorId == null || actorId.isBlank()) throw new IllegalArgumentException("actorId is required");
        if (occurredAt == null) throw new IllegalArgumentException("occurredAt is required");
        if (payload == null) throw new IllegalArgumentException("payload is required");
    }
}
