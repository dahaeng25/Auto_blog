import { config } from "../../config/index.js";
import { logger } from "./logger.js";
import type { PublishResult } from "../publishing/types.js";

const DISCORD_CONTENT_LIMIT = 1900;

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
}

async function sendWebhook(embed: DiscordEmbed): Promise<void> {
  const url = config.discordWebhookUrl;
  if (!url) {
    logger.warn("DISCORD_WEBHOOK_URL 미설정 — Discord 알림을 건너뜁니다.");
    return;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord Webhook 실패 (${response.status}): ${body}`);
  }
}

function truncate(text: string, max = DISCORD_CONTENT_LIMIT): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 20) + "\n...(truncated)";
}

/** 발행 성공 알림 */
export async function notifySuccess(
  title: string,
  results: PublishResult[],
): Promise<void> {
  const urlLines = results
    .filter((r) => r.postUrl)
    .map((r) => `**${r.platform}**: ${r.postUrl}`)
    .join("\n");

  const description = truncate(
    `**제목:** ${title}\n\n` +
      (urlLines || "*(dry-run — URL 없음)*") +
      `\n\n_완료 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}_`,
  );

  await sendWebhook({
    title: "✅ 블로그 발행 성공",
    description,
    color: 0x57f287,
  });

  logger.info("Discord 성공 알림 전송 완료");
}

/** 발행 실패 알림 */
export async function notifyError(
  error: unknown,
  options?: { stage?: string },
): Promise<void> {
  const stageLine = options?.stage
    ? `**실패 단계:** ${options.stage}\n\n`
    : "";

  const stack =
    error instanceof Error
      ? `${error.message}\n\n\`\`\`\n${error.stack ?? ""}\n\`\`\``
      : String(error);

  await sendWebhook({
    title: "❌ 블로그 발행 실패",
    description: truncate(stageLine + stack),
    color: 0xed4245,
  });

  logger.info("Discord 실패 알림 전송 완료");
}
