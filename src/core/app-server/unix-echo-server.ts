/*!
 * unix-echo-server — first surface consumer of UnixSocketTransport
 * (WIRE: node_wire_34643f17259f — dormant capability, no prior surface import).
 *
 * Minimal echo listener: replies to every inbound message with { echo: <message> }.
 * Exposed via `agf daemon serve-unix <path>` as a debug/dev utility for probing
 * the app-server Unix-socket transport without a full JSON-RPC client.
 */

import { UnixSocketTransport } from './transport/unix-socket.js'

export interface UnixEchoServerHandle {
  transport: UnixSocketTransport
  close(): void
}

export function startUnixEchoServer(socketPath: string): UnixEchoServerHandle {
  const transport = new UnixSocketTransport(socketPath)
  transport.onMessage((msg) => {
    transport.send({ echo: msg })
  })
  return {
    transport,
    close: () => transport.close(),
  }
}
