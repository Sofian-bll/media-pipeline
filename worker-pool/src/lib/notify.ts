import { logger } from "./logger";

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || "";

export async function notify(jobId: string, event: string, extra: Record<string, unknown> = {}) {
  if (!DISCORD_WEBHOOK) return;

  const emoji: Record<string, string> = {
    "job.started": "🎬",
    "job.completed": "✅",
    "job.failed": "❌",
  };
  const prefix = emoji[event] || "📋";

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `${prefix} **${event}** — ${jobId.slice(0,8)}`,
        embeds: [{
          fields: Object.entries(extra).map(([k, v]) => ({ name: k, value: String(v), inline: true })),
          color: event === "job.failed" ? 0xff0000 : event === "job.completed" ? 0x00ff00 : 0x0099ff,
        }]
      }),
    });
  } catch (err) {
    logger.warn("Discord notification failed", { error: String(err) });
  }
}
