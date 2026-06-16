import { logger } from "../lib/logger";
import { getDb } from "../lib/db";

const SSH_HOST = process.env.MAC_SSH_HOST || "100.66.240.74";
const SSH_USER = process.env.MAC_SSH_USER || "sofian";
const SSH_KEY = process.env.MAC_SSH_KEY || "/root/.ssh/id_ed25519";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";

interface MacWorkerResult {
  success: boolean;
  code?: string;
  duration_ms: number;
}

export async function executeTranscode(
  jobId: string,
  filePath: string,
): Promise<MacWorkerResult> {
  const start = Date.now();
  const outputPath = filePath.replace(/\.(mkv|avi|mp4)$/i, ".mp4");

  logger.info("Starting Mac transcode", { jobId, filePath, outputPath });

  const cmd = [
    "ssh",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "ConnectTimeout=30",
    "-i",
    SSH_KEY,
    `${SSH_USER}@${SSH_HOST}`,
    `"${FFMPEG_PATH}" -y -i "${filePath}" -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k "${outputPath}"`,
  ];

  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const duration = Date.now() - start;

    if (exitCode === 0) {
      logger.info("Mac transcode completed", { jobId, duration_ms: duration });
      return { success: true, duration_ms: duration };
    } else {
      const stderr = await new Response(proc.stderr).text();
      logger.error("Mac transcode failed", {
        jobId,
        exitCode,
        stderr: stderr.slice(0, 200),
      });
      return {
        success: false,
        code: "TRANSCODE_FAILED",
        duration_ms: duration,
      };
    }
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Mac SSH failed", { jobId, error: msg });
    return { success: false, code: "MAC_UNREACHABLE", duration_ms: duration };
  }
}

export async function checkMacOnline(): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      [
        "ssh",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "ConnectTimeout=5",
        "-i",
        SSH_KEY,
        `${SSH_USER}@${SSH_HOST}`,
        "echo ok",
      ],
      { stdout: "pipe" },
    );
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
