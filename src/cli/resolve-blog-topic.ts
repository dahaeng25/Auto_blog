import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "../../config/index.js";

export interface ResolveBlogTopicOptions {
  /** CLI --topic 값 */
  cliTopic?: string;
  /** false면 .env BLOG_TOPIC만 사용 (스케줄러용) */
  interactive?: boolean;
}

/** CLI 인자에서 --topic "..." 추출 */
export function parseTopicFromArgv(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--topic" || arg === "-t") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) return next.trim();
    }
    if (arg.startsWith("--topic=")) {
      return arg.slice("--topic=".length).trim();
    }
  }
  return undefined;
}

/** 키워드 입력을 정규화 (쉼표·줄바꿈 구분) */
export function normalizeTopicInput(raw: string): string {
  const parts = raw
    .split(/[,，\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) return raw.trim();
  return parts.join(", ");
}

async function promptInteractively(): Promise<string> {
  const rl = readline.createInterface({ input, output });

  try {
    const hint = config.blogTopic
      ? `\n  (.env 기본값: ${config.blogTopic})`
      : "";
    console.log("\n📝 블로그 주제를 입력하세요.");
    console.log("   키워드만 넣어도 됩니다. (예: E-7-4R, 비자변경, 행정사)");
    if (hint) console.log(hint);

    const answer = await rl.question("\n주제 또는 키워드 > ");
    const trimmed = answer.trim();

    if (trimmed) return normalizeTopicInput(trimmed);
    if (config.blogTopic) {
      console.log(`[입력 생략] .env BLOG_TOPIC 사용: ${config.blogTopic}`);
      return config.blogTopic;
    }

    throw new Error("블로그 주제 또는 키워드를 입력해 주세요.");
  } finally {
    rl.close();
  }
}

/**
 * 블로그 주제 결정 — CLI 인자 > 대화형 입력 > .env BLOG_TOPIC
 */
export async function resolveBlogTopic(
  options: ResolveBlogTopicOptions = {},
): Promise<string> {
  const cliTopic = options.cliTopic?.trim();
  if (cliTopic) {
    const normalized = normalizeTopicInput(cliTopic);
    console.log(`[주제] CLI 입력: ${normalized}`);
    return normalized;
  }

  const useInteractive = options.interactive ?? process.stdin.isTTY;

  if (useInteractive) {
    const topic = await promptInteractively();
    console.log(`[주제] 선택됨: ${topic}`);
    return topic;
  }

  if (config.blogTopic) {
    console.log(`[주제] .env BLOG_TOPIC: ${config.blogTopic}`);
    return config.blogTopic;
  }

  throw new Error(
    "블로그 주제가 없습니다.\n" +
      "  • npm run run:once — 실행 시 직접 입력\n" +
      "  • npm run run:once -- --topic \"키워드1, 키워드2\"\n" +
      "  • .env 에 BLOG_TOPIC 설정 (스케줄러/cron용)",
  );
}
