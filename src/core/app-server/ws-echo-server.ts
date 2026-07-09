/*!
 * ws-echo-server — first surface consumer of WebSocketTransport
 * (WIRE: node_wire_ff61b525fb6e — dormant capability, no prior surface import).
 *
 * Minimal echo listener: replies to every inbound message with { echo: <message> }.
 * Exposed via `agf daemon serve-ws <port>` as a debug/dev utility for probing
 * the app-server WebSocket transport without a full JSON-RPC client.
 */

import { WebSocketTransport } from './transport/websocket.js'

export interface WsEchoServerHandle {
  transport: WebSocketTransport
  close(): void
}

export function startWsEchoServer(port: number, host?: string): WsEchoServerHandle {
  const transport = new WebSocketTransport(port, host)
  transport.onMessage((msg) => {
    transport.send({ echo: msg })
  })
  return {
    transport,
    close: () => transport.close(),
  }
}
