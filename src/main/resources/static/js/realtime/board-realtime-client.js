// BoardRealtimeClient: the only module in the browser that knows STOMP — Lab #6.
//
// Connection, subscription, destinations, serialization and the STOMP library
// itself are all confined here. app.js orchestrates by calling connect/publish/
// disconnect and receives plain BoardEvent objects; BoardView never learns that
// a broker exists. Swapping the transport would touch this file and no other.
//
// It is the realtime counterpart of BoardApiClient, which plays the same role
// for HTTP.
export function createBoardRealtimeClient({ onEvent = () => {}, onStatus = () => {} } = {}) {
  let client = null;
  let subscription = null;
  let currentBoardId = null;

  function webSocketUrl() {
    // Derived from the current page so the client works unchanged behind TLS.
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${location.host}/ws`;
  }

  // One board per connection. Subscribing to /topic/boards/{boardId} is what
  // makes a session independent: events from another board are delivered to a
  // different destination and never reach this subscription.
  function connect(boardId) {
    if (!boardId) return Promise.reject(new Error('Create or load a Board before connecting'));
    if (!window.Stomp) return Promise.reject(new Error('The STOMP client library was not loaded'));
    if (client?.connected && currentBoardId === boardId) return Promise.resolve();

    return new Promise((resolve, reject) => {
      onStatus('connecting');
      const socket = new WebSocket(webSocketUrl());
      client = window.Stomp.over(socket);
      client.debug = () => {};

      client.connect({}, () => {
        currentBoardId = boardId;
        subscription = client.subscribe(`/topic/boards/${boardId}`, message => {
          // A malformed frame must not kill the subscription: report it and
          // keep listening, otherwise one bad message ends the session.
          try {
            onEvent(JSON.parse(message.body));
          } catch (error) {
            console.error('Discarded an unreadable board event', error);
          }
        });
        onStatus('connected');
        resolve();
      }, error => {
        onStatus('error');
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  // Sends to /app (not /topic) on purpose: that prefix routes the message to
  // the server controller, so it is validated and applied to the authoritative
  // Board before anyone receives it. Publishing straight to /topic would turn
  // the broker into a blind relay.
  function publish(event) {
    if (!client?.connected) {
      throw new Error('Connect the Board to the live channel before publishing');
    }
    if (!event?.boardId) {
      throw new Error('A BoardEvent requires a boardId');
    }
    // Client-side mirror of the check the server makes: never let an event
    // leak into a board this client is not currently editing.
    if (event.boardId !== currentBoardId) {
      throw new Error(`Event targets board ${event.boardId} but the live channel is on ${currentBoardId}`);
    }

    client.send(
      `/app/boards/${event.boardId}/events`,
      { 'content-type': 'application/json' },
      JSON.stringify(event)
    );
  }

  function disconnect() {
    return new Promise(resolve => {
      subscription?.unsubscribe?.();
      subscription = null;

      const settle = () => {
        client = null;
        currentBoardId = null;
        onStatus('disconnected');
        resolve();
      };

      if (client?.connected) client.disconnect(settle);
      else settle();
    });
  }

  return {
    connect,
    publish,
    disconnect,
    isConnected() { return Boolean(client?.connected); },
    boardId() { return currentBoardId; }
  };
}
