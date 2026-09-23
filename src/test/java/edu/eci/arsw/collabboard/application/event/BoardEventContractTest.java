package edu.eci.arsw.collabboard.application.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.eci.arsw.collabboard.domain.model.ElementType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the wire format agreed in docs/event-contract.md.
 *
 * The JSON literals below are exactly what js/events/board-event.js puts on the
 * socket, so this test fails the moment the two sides of the contract drift
 * apart — which is otherwise only visible at runtime, in a browser.
 *
 * The mapper is the application one, injected from the context, so the round
 * trip here is exactly the one WebSocketConfig hands to the STOMP converter.
 */
@SpringBootTest
class BoardEventContractTest {

    @Autowired
    private ObjectMapper mapper;

    @Test
    void shouldReadTheEnvelopeProducedByTheBrowserClient() throws Exception {
        String json = """
                {
                  "eventId": "58badb16-7e30-4284-9b94-c1b80ef15385",
                  "boardId": "board-1",
                  "type": "ELEMENT_MOVED",
                  "actorId": "client-a",
                  "occurredAt": "2026-09-23T03:28:04.565Z",
                  "payload": { "element": null, "elementId": "rect-1", "x": 300, "y": 150 }
                }
                """;

        BoardEvent event = mapper.readValue(json, BoardEvent.class);

        assertEquals("58badb16-7e30-4284-9b94-c1b80ef15385", event.eventId());
        assertEquals("board-1", event.boardId());
        assertEquals(BoardEventType.ELEMENT_MOVED, event.type());
        assertEquals("client-a", event.actorId());
        assertEquals(Instant.parse("2026-09-23T03:28:04.565Z"), event.occurredAt());
        assertEquals("rect-1", event.payload().elementId());
        assertEquals(300.0, event.payload().x());
        assertEquals(150.0, event.payload().y());
        assertNull(event.payload().element());
    }

    @Test
    void shouldReadAnElementCarryingEnvelope() throws Exception {
        String json = """
                {
                  "eventId": "e-1",
                  "boardId": "board-1",
                  "type": "ELEMENT_CREATED",
                  "actorId": "client-a",
                  "occurredAt": "2026-09-23T03:28:04.565Z",
                  "payload": {
                    "element": {
                      "id": "rect-1", "type": "RECTANGLE",
                      "x": 100, "y": 90, "width": 170, "height": 70,
                      "text": "Component", "sourceId": null, "targetId": null
                    },
                    "elementId": "rect-1", "x": null, "y": null
                  }
                }
                """;

        BoardEvent event = mapper.readValue(json, BoardEvent.class);

        assertEquals(ElementType.RECTANGLE, event.payload().element().type());
        assertEquals("Component", event.payload().element().text());
        assertNull(event.payload().x());
    }

    @Test
    void shouldWriteOccurredAtAsAnIsoInstantAndNotANumber() throws Exception {
        BoardEvent event = new BoardEvent("e-1", "board-1", BoardEventType.ELEMENT_DELETED,
                "client-a", Instant.parse("2026-09-23T03:28:04.565Z"),
                new BoardEventPayload(null, "rect-1", null, null));

        String json = mapper.writeValueAsString(event);

        // A numeric timestamp would still round-trip in Java but would break
        // any other consumer of the documented contract.
        assertTrue(json.contains("\"occurredAt\":\"2026-09-23T03:28:04.565Z\""), json);
        assertTrue(json.contains("\"type\":\"ELEMENT_DELETED\""), json);
    }

    @Test
    void shouldRejectAnEnvelopeMissingARequiredField() {
        String json = """
                {
                  "boardId": "board-1",
                  "type": "ELEMENT_DELETED",
                  "actorId": "client-a",
                  "occurredAt": "2026-09-23T03:28:04.565Z",
                  "payload": { "element": null, "elementId": "rect-1", "x": null, "y": null }
                }
                """;

        // eventId is absent: the compact constructor must refuse to build the
        // envelope, so a malformed message never reaches the application service.
        assertThrows(Exception.class, () -> mapper.readValue(json, BoardEvent.class));
    }
}
