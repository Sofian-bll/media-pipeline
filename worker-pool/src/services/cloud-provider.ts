import { logger } from "../lib/logger";

export interface CloudProvider {
  upload(localPath: string, remoteKey: string): Promise<boolean>;
  check(localPath: string, remoteKey: string): Promise<boolean>;
  download(remoteKey: string, localPath: string): Promise<boolean>;
  delete(remoteKey: string): Promise<boolean>;
}

export class DOProvider implements CloudProvider {
  private rclone = "rclone";
  private bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  private async rcloneCmd(args: string[]): Promise<boolean> {
    const cmd = [this.rclone, ...args];
    try {
      const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        logger.error("rclone command failed", { cmd: args.join(" "), exitCode, stderr: stderr.slice(0, 200) });
      }
      return exitCode === 0;
    } catch (err) {
      logger.error("rclone spawn failed", { error: String(err) });
      return false;
    }
  }

  async upload(localPath: string, remoteKey: string): Promise<boolean> {
    logger.info("Uploading to Spaces", { localPath, remoteKey });
    return this.rcloneCmd(["copy", localPath, `${this.bucket}:${remoteKey}`, "--progress"]);
  }

  async check(localPath: string, remoteKey: string): Promise<boolean> {
    logger.info("Checking upload integrity", { remoteKey });
    return this.rcloneCmd(["check", localPath, `${this.bucket}:${remoteKey}`, "--one-way"]);
  }

  async download(remoteKey: string, localPath: string): Promise<boolean> {
    logger.info("Downloading from Spaces", { remoteKey, localPath });
    return this.rcloneCmd(["copy", `${this.bucket}:${remoteKey}`, localPath, "--progress"]);
  }

  async delete(remoteKey: string): Promise<boolean> {
    logger.info("Deleting from Spaces", { remoteKey });
    return this.rcloneCmd(["delete", `${this.bucket}:${remoteKey}`]);
  }
}

export function getProvider(): CloudProvider {
  const provider = process.env.CLOUD_PROVIDER || "digitalocean";
  const bucket = process.env.CLOUD_BUCKET || "sofian-media-bridge";

  if (provider === "digitalocean") {
    return new DOProvider(bucket);
  }
  throw new Error(`Unknown cloud provider: ${provider}`);
}
