package edu.eci.arsw.collabboard.infrastructure.web.ws;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP/WebSocket transport configuration — Lab #6.
 *
 * Kept in its own class, away from the REST controllers, so the two delivery
 * mechanisms stay independent: REST carries bootstrap and snapshot, STOMP
 * carries live changes. Neither knows about the other.
 *
 * The broker is the simple in-memory one on purpose (scope decision of this
 * lab): no external broker, no Redis, no Kafka.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Outbound: the broker owns every destination under /topic, which is
        // where per-board sessions live (/topic/boards/{boardId}).
        registry.enableSimpleBroker("/topic");
        // Inbound: messages addressed to /app are routed to @MessageMapping
        // methods instead of being relayed straight to subscribers, which is
        // what lets the application service validate before broadcasting.
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*");
    }
}
