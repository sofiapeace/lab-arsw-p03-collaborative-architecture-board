package edu.eci.arsw.collabboard.infrastructure.web.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.converter.DefaultContentTypeResolver;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.converter.MessageConverter;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.List;

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

    private final ObjectMapper objectMapper;

    public WebSocketConfig(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

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

    /**
     * Reuses the ObjectMapper Spring Boot configures for the REST side.
     *
     * Without this, the messaging layer builds its own mapper, which writes
     * Instant as a numeric timestamp (1790134084.565000000) instead of the
     * ISO-8601 string documented in docs/event-contract.md. One event contract
     * must not have two wire formats depending on which transport carried it.
     *
     * @return false so the default converters are not registered on top.
     */
    @Override
    public boolean configureMessageConverters(List<MessageConverter> messageConverters) {
        DefaultContentTypeResolver contentTypeResolver = new DefaultContentTypeResolver();
        contentTypeResolver.setDefaultMimeType(MimeTypeUtils.APPLICATION_JSON);

        MappingJackson2MessageConverter converter = new MappingJackson2MessageConverter();
        converter.setObjectMapper(objectMapper);
        converter.setContentTypeResolver(contentTypeResolver);

        messageConverters.add(converter);
        return false;
    }
}
