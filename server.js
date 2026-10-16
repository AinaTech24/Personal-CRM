const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const crypto = require("crypto");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = Number(process.env.PORT ?? 3000);

// The /api/attendance/send-reminders route (9:00-9:30 AM check-in / 6:00-6:30
// PM check-out nudges) only fires when hit with this header — normally an
// external cron would supply it. Generating one here when it's not already
// set means the sweep below works out of the box on a fresh deploy, with no
// VPS crontab or external scheduler to configure: server.js and the route
// handler share this same process, so this value is exactly what the route
// reads too.
if (!process.env.CRON_SECRET) {
  process.env.CRON_SECRET = crypto.randomBytes(24).toString("hex");
}

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
  // …and can ask who's currently connected, so a push notification isn't sent
  // to someone who is sitting in the app and already got an in-app toast.
  globalThis.__online = online;

  httpServer.listen(port, () => {
    console.log(`> Aina CRM ready on http://${hostname}:${port}`);
  });

  // Sweeps for anyone who hasn't checked in by 9:30 AM or checked out by
  // 6:30 PM (IST) and nudges them — the route itself only actually sends
  // anything in the last 30 minutes before each window closes, so calling it
  // this often just means that 30-minute window is never missed.
  const REMINDER_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
  setInterval(() => {
    fetch(`http://127.0.0.1:${port}/api/attendance/send-reminders`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET },
    }).catch((err) => console.error("attendance reminder sweep failed:", err));
  }, REMINDER_SWEEP_INTERVAL_MS);

  // Daily sweeps for reminders that only ever change once a day at most
  // (an invoice going overdue, a password going stale, a birthday coming
  // up) — unlike the attendance sweep above, there's no tight window to
  // avoid missing, so once a day is enough. Each route is idempotent on its
  // own persisted "already sent" state, so firing again after a redeploy
  // restarts this timer is harmless.
  const DAILY_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const DAILY_SWEEP_ROUTES = ["/api/invoices/send-reminders", "/api/passwords/send-reminders", "/api/birthdays/send-reminders"];
  setInterval(() => {
    for (const route of DAILY_SWEEP_ROUTES) {
      fetch(`http://127.0.0.1:${port}${route}`, {
        method: "POST",
        headers: { "x-cron-secret": process.env.CRON_SECRET },
      }).catch((err) => console.error(`daily reminder sweep failed for ${route}:`, err));
    }
  }, DAILY_SWEEP_INTERVAL_MS);
});
