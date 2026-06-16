import { handleRequest } from "./routes/jobs";
import { logger } from "./lib/logger";
import { getDb } from "./lib/db";

// Initialize DB on startup
getDb();

const server = Bun.serve({
  port: 3501,
  fetch(req) {
    const start = Date.now();
    const response = handleRequest(req);
    const duration = Date.now() - start;

    response.then((res) => {
      logger.info("request", {
        method: req.method,
        path: new URL(req.url).pathname,
        status: res.status,
        duration_ms: duration,
      });
    });

    return response;
  },
});

logger.info("Worker Pool API started", { port: server.port });
