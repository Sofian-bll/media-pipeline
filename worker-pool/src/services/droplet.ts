import { logger } from "../lib/logger";

const DO_TOKEN = process.env.DO_TOKEN || "";
const DO_API = "https://api.digitalocean.com/v2";
const DO_SNAPSHOT_ID = process.env.DO_SNAPSHOT_ID || "";
const DO_SIZE = process.env.DO_SIZE || "c-4";
const DO_REGION = process.env.DO_REGION || "fra1";

async function doApi(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${DO_TOKEN}`,
    "Content-Type": "application/json",
  };
  return fetch(`${DO_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

interface DropletStatus {
  step: string;
  pct: number;
  eta_sec: number;
}

export async function createDroplet(): Promise<number | null> {
  const name = `worker-${Date.now()}`;
  const cloudInit = `#!/bin/bash
mkdir -p /app
cat > /app/status.sh << 'SHSH'
#!/bin/bash
echo '{"step":"ready","pct":0,"eta_sec":0}'
SHSH
chmod +x /app/status.sh
(cd /app && python3 -m http.server 8080) &
`;

  const body = {
    name,
    region: DO_REGION,
    size: DO_SIZE,
    image: DO_SNAPSHOT_ID || "docker-20-04",
    user_data: Buffer.from(cloudInit).toString("base64"),
    tags: ["worker"],
  };

  try {
    const res = await doApi("POST", "/droplets", body);
    if (!res.ok) {
      logger.error("Failed to create droplet", { status: res.status });
      return null;
    }
    const data = await res.json() as { droplet: { id: number } };
    logger.info("Droplet created", { dropletId: data.droplet.id });
    return data.droplet.id;
  } catch (err) {
    logger.error("Droplet API error", { error: String(err) });
    return null;
  }
}

export async function getDropletIp(id: number): Promise<string | null> {
  try {
    const res = await doApi("GET", `/droplets/${id}`);
    if (!res.ok) return null;
    const data = await res.json() as { droplet: { networks: { v4: Array<{ ip_address: string; type: string }> } } };
    const pub = data.droplet.networks.v4.find(n => n.type === "public");
    return pub?.ip_address || null;
  } catch {
    return null;
  }
}

export async function getDropletStatus(ip: string): Promise<DropletStatus | null> {
  try {
    const res = await fetch(`http://${ip}:8080/status`);
    if (!res.ok) return null;
    return await res.json() as DropletStatus;
  } catch {
    return null;
  }
}

export async function pollDroplet(ip: string, timeoutMs: number = 4 * 60 * 60 * 1000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let lastPct = -1;
  let stallCount = 0;

  while (Date.now() < deadline) {
    const status = await getDropletStatus(ip);
    if (!status) {
      await sleep(30000);
      continue;
    }

    if (status.pct === lastPct) {
      stallCount++;
      if (stallCount > 10) {
        logger.error("Droplet stalled", { ip, pct: status.pct, stallCount });
        return false;
      }
    } else {
      stallCount = 0;
      lastPct = status.pct;
    }

    if (status.step === "done" || status.pct >= 100) {
      logger.info("Droplet transcode complete", { ip });
      return true;
    }

    await sleep(30000);
  }
  logger.error("Droplet timeout", { ip });
  return false;
}

export async function destroyDroplet(id: number): Promise<boolean> {
  try {
    const res = await doApi("DELETE", `/droplets/${id}`);
    if (res.ok) logger.info("Droplet destroyed", { dropletId: id });
    return res.ok;
  } catch (err) {
    logger.error("Failed to destroy droplet", { dropletId: id, error: String(err) });
    return false;
  }
}

export async function listWorkerDroplets(): Promise<number[]> {
  try {
    const res = await doApi("GET", "/droplets?tag_name=worker");
    if (!res.ok) return [];
    const data = await res.json() as { droplets: Array<{ id: number }> };
    return data.droplets.map(d => d.id);
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
