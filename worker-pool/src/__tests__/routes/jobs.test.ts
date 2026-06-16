import { describe, expect, test } from "bun:test";
import { handleRequest } from "../../routes/jobs";

describe("GET /health", () => {
  test("returns status ok", async () => {
    const req = new Request("http://localhost/health");
    const res = await handleRequest(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

describe("POST /jobs/transcode", () => {
  test("creates a job with valid input", async () => {
    const req = new Request("http://localhost/jobs/transcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: "/mnt/nas/incoming/test.mkv" }),
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.job_id).toBeDefined();
    expect(body.status).toBe("queued");
  });

  test("returns 400 without file_path", async () => {
    const req = new Request("http://localhost/jobs/transcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_REQUEST");
    expect(body.retryable).toBe(false);
  });
});

describe("GET /jobs/:id", () => {
  test("returns job details", async () => {
    // Create first
    const createReq = new Request("http://localhost/jobs/transcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: "/mnt/nas/incoming/test2.mkv" }),
    });
    const createRes = await handleRequest(createReq);
    const { job_id } = await createRes.json();

    // Then get
    const req = new Request(`http://localhost/jobs/${job_id}`);
    const res = await handleRequest(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job_id).toBe(job_id);
    expect(body.status).toBe("queued");
  });

  test("returns 404 for unknown job", async () => {
    const req = new Request("http://localhost/jobs/nonexistent");
    const res = await handleRequest(req);
    expect(res.status).toBe(404);
  });
});

describe("GET /workers/status", () => {
  test("returns workers status", async () => {
    const req = new Request("http://localhost/workers/status");
    const res = await handleRequest(req);
    expect(res.status).toBe(200);
  });
});

describe("error format", () => {
  test("error has all required fields", async () => {
    const req = new Request("http://localhost/jobs/nonexistent");
    const res = await handleRequest(req);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.code).toBeDefined();
    expect(typeof body.retryable).toBe("boolean");
    expect(typeof body.retry_after_ms).toBe("number");
  });
});
