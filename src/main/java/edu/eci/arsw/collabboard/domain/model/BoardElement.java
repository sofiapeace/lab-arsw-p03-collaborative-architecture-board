package edu.eci.arsw.collabboard.domain.model;

public record BoardElement(
        String id,
        ElementType type,
        double x,
        double y,
        double width,
        double height,
        String text,
        String sourceId,
        String targetId
) {
    public BoardElement {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Element id is required");
        }
        if (type == null) {
            throw new IllegalArgumentException("Element type is required");
        }
        if (width < 0 || height < 0) {
            throw new IllegalArgumentException("Element dimensions cannot be negative");
        }
        text = text == null ? "" : text;

        if (type == ElementType.CONNECTOR) {
            if (sourceId == null || sourceId.isBlank()) {
                throw new IllegalArgumentException("Connector sourceId is required");
            }
            if (targetId == null || targetId.isBlank()) {
                throw new IllegalArgumentException("Connector targetId is required");
            }
            if (sourceId.equals(targetId)) {
                throw new IllegalArgumentException("Connector sourceId and targetId must be different");
            }
        } else if (sourceId != null || targetId != null) {
            throw new IllegalArgumentException("Only CONNECTOR elements may define sourceId/targetId");
        }
    }
}
