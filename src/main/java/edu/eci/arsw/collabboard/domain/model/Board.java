package edu.eci.arsw.collabboard.domain.model;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

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
        Set<String> ids = new HashSet<>();
        for (BoardElement element : elements) {
            if (!ids.add(element.id())) {
                throw new IllegalArgumentException("Duplicate element id: " + element.id());
            }
        }
        for (BoardElement element : elements) {
            if (element.type() == ElementType.CONNECTOR) {
                if (!ids.contains(element.sourceId())) {
                    throw new IllegalArgumentException(
                            "Connector " + element.id() + " references missing sourceId: " + element.sourceId());
                }
                if (!ids.contains(element.targetId())) {
                    throw new IllegalArgumentException(
                            "Connector " + element.id() + " references missing targetId: " + element.targetId());
                }
            }
        }
    }
}
