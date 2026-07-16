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

  io.on("connection", (socket) => {
    socket.on("join", (room) => {
      if (typeof room === "string") socket.join(room);
    });

    socket.on("leave", (room) => {
      if (typeof room === "string") socket.leave(room);
    });
  });

  // Exposed so Next.js API routes (running in the same process) can emit events.
  globalThis.__io = io;

  httpServer.listen(port, () => {
    console.log(`> Aina CRM ready on http://${hostname}:${port}`);
  });
});
