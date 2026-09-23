package edu.eci.arsw.collabboard.application.event;

import edu.eci.arsw.collabboard.domain.model.BoardElement;

/**
 * Minimum data each event type needs. Only the fields relevant to the type are
 * populated; the rest travel as null (see docs/event-contract.md):
 *
 * <ul>
 *   <li>ELEMENT_CREATED / CONNECTOR_CREATED / ELEMENT_UPDATED: {@code element}</li>
 *   <li>ELEMENT_MOVED: {@code elementId}, {@code x}, {@code y}</li>
 *   <li>ELEMENT_DELETED: {@code elementId}</li>
 * </ul>
 *
 * x and y are boxed Doubles on purpose: "no position reported" must be
 * distinguishable from "position 0.0", which a primitive double cannot express.
 */
public record BoardEventPayload(
        BoardElement element,
        String elementId,
        Double x,
        Double y) {
}
