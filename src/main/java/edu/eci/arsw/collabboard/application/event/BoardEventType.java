package edu.eci.arsw.collabboard.application.event;

/**
 * Semantics of a collaboration message, as agreed in docs/event-contract.md.
 *
 * This enum belongs to the collaboration contract, not to the domain: it
 * describes what participants tell each other, while {@code ElementType}
 * describes what the board is made of.
 */
public enum BoardEventType {
    ELEMENT_CREATED,
    ELEMENT_MOVED,
    ELEMENT_UPDATED,
    ELEMENT_DELETED,
    CONNECTOR_CREATED
}
