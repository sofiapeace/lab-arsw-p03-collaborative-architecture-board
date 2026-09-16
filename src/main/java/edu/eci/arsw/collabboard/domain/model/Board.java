package edu.eci.arsw.collabboard.domain.model;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public record Board(String id, String name, List<BoardElement> elements) {
    public Board {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Board id is required");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Board name is required");
        }
        elements = elements == null ? List.of() : List.copyOf(elements);
        validateConnectors(elements);
    }

    private static void validateConnectors(List<BoardElement> elements) {
        Map<String, BoardElement> byId = new HashMap<>();
        for (BoardElement element : elements) {
            if (byId.put(element.id(), element) != null) {
                throw new IllegalArgumentException("Duplicate element id: " + element.id());
            }
        }
        for (BoardElement element : elements) {
            if (element.type() != ElementType.CONNECTOR) {
                continue;
            }
            BoardElement source = byId.get(element.sourceId());
            BoardElement target = byId.get(element.targetId());
            if (source == null) {
                throw new IllegalArgumentException(
                        "Connector " + element.id() + " references missing sourceId: " + element.sourceId());
            }
            if (target == null) {
                throw new IllegalArgumentException(
                        "Connector " + element.id() + " references missing targetId: " + element.targetId());
            }
            if (source.type() == ElementType.CONNECTOR || target.type() == ElementType.CONNECTOR) {
                throw new IllegalArgumentException(
                        "Connector " + element.id() + " cannot reference another connector");
            }
        }
    }
}
