import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import { executeTranscode, checkMacOnline } from "../services/mac-worker";

interface ErrorResponse {
  error: string;
  code: string;
  retryable: boolean;
  retry_after_ms: number;
}

interface TranscodeRequest {
  file_path: string;
  priority?: "normal" | "urgent";
}

function err(code: string, msg: string, retryable: boolean, retryAfterMs: number): ErrorResponse {
  return { error: msg, code, retryable, retry_after_ms: retryAfterMs };
}

function health() {
  const db = getDb();
  const jobs = db.query("SELECT COUNT(*) as count FROM jobs").get() as { count: number };
  return {
    status: "ok",
    jobs_total: jobs.count,
  };
}

async function createJob(body: TranscodeRequest) {
  const db = getDb();
  const jobId = crypto.randomUUID();

  if (!body.file_path) {
    return { status: 400, body: err("INVALID_REQUEST", "file_path is required", false, 0) };
  }

  db.run(
    "INSERT INTO jobs (job_id, file_path, status) VALUES (?, ?, 'queued')",
    [jobId, body.file_path]
  );

  logger.info("Job created", { jobId, file_path: body.file_path });

  // Trigger Mac worker asynchronously
  executeTranscode(jobId, body.file_path).then(async (result) => {
    if (result.success) {
      db.run("UPDATE jobs SET status = 'completed', output_path = ?, duration_ms = ? WHERE job_id = ?",
        [body.file_path.replace(/\.(mkv|avi|mp4)$/i, ".mp4"), result.duration_ms, jobId]);
      logger.info("Job completed", { jobId, duration_ms: result.duration_ms });
    } else {
      const retryCount = (db.query("SELECT retry_count FROM jobs WHERE job_id = ?").get(jobId) as { retry_count: number })?.retry_count || 0;
      if (result.code === "MAC_UNREACHABLE" || retryCount < 1) {
        db.run("UPDATE jobs SET status = ?, error_code = ?, retry_count = ?, updated_at = datetime('now') WHERE job_id = ?",
          ["queued", result.code, retryCount + 1, jobId]);
        logger.warn("Job queued for retry", { jobId, code: result.code, retry: retryCount + 1 });
      } else {
        db.run("UPDATE jobs SET status = 'failed', error_code = ?, updated_at = datetime('now') WHERE job_id = ?",
          [result.code, jobId]);
        logger.error("Job permanently failed", { jobId, code: result.code });
      }
    }
  });

  return {
    status: 202,
    body: { job_id: jobId, status: "queued", message: "Worker execution will be added in Story 1.3" },
  };
}

async function getJob(jobId: string) {
  const db = getDb();
  const job = db.query("SELECT * FROM jobs WHERE job_id = ?").get(jobId) as Record<string, unknown> | null;

  if (!job) {
    return { status: 404, body: err("NOT_FOUND", `Job ${jobId} not found`, false, 0) };
  }

  return { status: 200, body: job };
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;

  // GET /health
  if (method === "GET" && url.pathname === "/health") {
    return Response.json(health());
  }

  // GET /workers/status
  if (method === "GET" && url.pathname === "/workers/status") {
    const macOnline = await checkMacOnline();
    return Response.json({ mac: macOnline ? "online" : "offline", cloud_instances: 0 });
  }

  // GET /jobs/:id
  const jobMatch = url.pathname.match(/^\/jobs\/(.+)$/);
  if (method === "GET" && jobMatch) {
    const result = await getJob(jobMatch[1]);
    return Response.json(result.body, { status: result.status });
  }

  // POST /jobs/transcode
  if (method === "POST" && url.pathname === "/jobs/transcode") {
    const body = await req.json() as TranscodeRequest;
    const result = await createJob(body);
    return Response.json(result.body, { status: result.status });
  }

  return Response.json(
    err("NOT_FOUND", `Route ${method} ${url.pathname} not found`, false, 0),
    { status: 404 }
  );
}
