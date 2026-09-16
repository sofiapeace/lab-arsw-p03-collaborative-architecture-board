package edu.eci.arsw.collabboard.domain.model;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BoardConnectorTest {

    @Test
    void shouldAcceptConnectorReferencingExistingElements() {
        BoardElement source = new BoardElement(
                "el-1", ElementType.RECTANGLE, 0, 0, 100, 50, "A", null, null);
        BoardElement target = new BoardElement(
                "el-2", ElementType.RECTANGLE, 200, 0, 100, 50, "B", null, null);
        BoardElement connector = new BoardElement(
                "conn-1", ElementType.CONNECTOR, 0, 0, 0, 0, "", "el-1", "el-2");

        assertDoesNotThrow(() ->
                new Board("board-1", "Architecture Session", List.of(source, target, connector)));
    }

    @Test
    void shouldRejectConnectorReferencingMissingElement() {
        BoardElement source = new BoardElement(
                "el-1", ElementType.RECTANGLE, 0, 0, 100, 50, "A", null, null);
        BoardElement connector = new BoardElement(
                "conn-1", ElementType.CONNECTOR, 0, 0, 0, 0, "", "el-1", "missing-el");

        assertThrows(IllegalArgumentException.class, () ->
                new Board("board-1", "Architecture Session", List.of(source, connector)));
    }

    @Test
    void shouldRejectConnectorReferencingAnotherConnector() {
        BoardElement source = new BoardElement(
                "el-1", ElementType.RECTANGLE, 0, 0, 100, 50, "A", null, null);
        BoardElement target = new BoardElement(
                "el-2", ElementType.RECTANGLE, 200, 0, 100, 50, "B", null, null);
        BoardElement firstConnector = new BoardElement(
                "conn-1", ElementType.CONNECTOR, 0, 0, 0, 0, "", "el-1", "el-2");
        BoardElement connectorToConnector = new BoardElement(
                "conn-2", ElementType.CONNECTOR, 0, 0, 0, 0, "", "el-1", "conn-1");

        assertThrows(IllegalArgumentException.class, () ->
                new Board("board-1", "Architecture Session", List.of(source, target, firstConnector, connectorToConnector)));
    }
}
