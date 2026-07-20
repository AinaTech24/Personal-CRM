const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
  });

  // Presence: userId -> count of connected sockets. >0 means online.
  const online = new Map();

  function setOnline(userId, delta) {
    const prev = online.get(userId) ?? 0;
    const next = prev + delta;
    if (next <= 0) online.delete(userId);
    else online.set(userId, next);
    const isOnline = next > 0;
    // Only broadcast on an actual online<->offline transition.
    if ((prev > 0) !== isOnline) io.emit("presence", { userId, online: isOnline });
  }

  io.on("connection", (socket) => {
    let joinedUserId = null;

    // Send the current online roster to whoever just connected.
    socket.emit("presence:init", [...online.keys()]);

    socket.on("join", (room) => {
      if (typeof room !== "string") return;
      socket.join(room);
      if (room.startsWith("user:") && !joinedUserId) {
        joinedUserId = room.slice("user:".length);
        setOnline(joinedUserId, 1);
      }
    });

    socket.on("leave", (room) => {
      if (typeof room === "string") socket.leave(room);
    });

    // Ephemeral typing indicator, relayed to others in the conversation room.
    socket.on("typing", (data) => {
      if (data && typeof data.conversationId === "string") {
        socket.to(`conv:${data.conversationId}`).emit("typing", data);
      }
    });
    socket.on("stop_typing", (data) => {
      if (data && typeof data.conversationId === "string") {
        socket.to(`conv:${data.conversationId}`).emit("stop_typing", data);
      }
    });

    socket.on("disconnect", () => {
      if (joinedUserId) setOnline(joinedUserId, -1);
    });
  });

  // Exposed so Next.js API routes (running in the same process) can emit events.
  globalThis.__io = io;

  httpServer.listen(port, () => {
    console.log(`> Aina CRM ready on http://${hostname}:${port}`);
  });
});
