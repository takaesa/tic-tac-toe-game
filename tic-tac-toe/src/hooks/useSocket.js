import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export default function useSocket(serverUrl) {
  const [connected, setConnected] = useState(false);
  const [socketInstance, setSocketInstance] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(serverUrl, { autoConnect: true });
    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.disconnect();
      setSocketInstance(null);
    };
  }, [serverUrl]);

  return { socket: socketRef.current, connected };
}
