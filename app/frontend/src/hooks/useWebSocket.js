import { useEffect, useRef, useCallback, useState } from "react";
import { API } from "../constants/api";

export function useWebSocket({ onMessage, active }) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  const activeRef = useRef(active);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    const ws = wsRef.current;
    wsRef.current = null;

    if (ws) {
      // Detach close handlers before intentionally closing to avoid reconnect loops.
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    }

    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    const current = wsRef.current;
    if (
      current &&
      (current.readyState === WebSocket.OPEN ||
        current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ws = new WebSocket(API.ocrStream);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) {
        ws.close();
        return;
      }
      setConnected(true);
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      try {
        onMessageRef.current(JSON.parse(event.data));
      } catch (err) {
        console.error("Invalid WebSocket message:", err);
      }
    };

    ws.onerror = () => {
      console.error("WebSocket connection error:", API.ocrStream);
      ws.close();
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setConnected(false);

      if (activeRef.current) {
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          if (activeRef.current) connect();
        }, 2000);
      }
    };
  }, []);

  const sendFrame = useCallback((base64Frame) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(base64Frame);
    }
  }, []);

  useEffect(() => {
    if (active) connect();
    else disconnect();

    return disconnect;
  }, [active, connect, disconnect]);

  return { connected, sendFrame };
}
