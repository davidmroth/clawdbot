
try {
  const url = "ws://localhost:8100/ws";
  console.log(`Connecting to ${url}...`);
  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("Connected!");
    ws.send("ping");
  };

  ws.onmessage = (msg) => {
    console.log("Received:", msg.data);
    ws.close();
  };

  ws.onerror = (err) => {
    console.error("Error:", err.message || "Unknown error");
    process.exit(1);
  };
} catch (e) {
  console.error("Exception:", e);
}
