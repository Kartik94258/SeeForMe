import { useEffect, useRef, useCallback, useState } from "react";
import { API } from "../constants/api";

export function useWebSocket({ onMessage, active }) {
  const wsRef          = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef   = useRef(onMessage); // always holds latest callback
  const [connected, setConnected] = useState(false);

  // Keep ref current on every render so the socket always calls the latest handler
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(API.ocrStream);

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data); // always calls latest handleMessage
      } catch {
        // malformed frame — ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (active) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => ws.close();

    wsRef.current = ws;
  }, [active]);

  const sendFrame = useCallback((base64Frame) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(base64Frame);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (active) {
      connect();
    } else {
      disconnect();
    }
    return disconnect;
  }, [active, connect, disconnect]);

  return { connected, sendFrame };
}
