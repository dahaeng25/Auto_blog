/**
 * 엔트리포인트: npm run blog:workflow -- --step full
 * 배치파일(blog-run.bat)에서 호출합니다.
 */
import { parseTopicFromArgv } from "../src/cli/resolve-blog-topic.js";
import {
  runWorkflow,
  type WorkflowStep,
} from "../src/cli/blog-workflow-runner.js";
import { notifyError } from "../src/monitoring/discord-notifier.js";
import { gracefulExit } from "../src/monitoring/graceful-shutdown.js";

function parseStep(argv: string[]): WorkflowStep {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--step" || arg === "-s") {
      const next = argv[i + 1]?.trim();
      if (next) return next as WorkflowStep;
    }
    if (arg.startsWith("--step=")) {
      return arg.slice("--step=".length).trim() as WorkflowStep;
    }
  }
  return "full";
}

function parseKeywordsFile(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--keywords-file" || arg === "-k") {
      const next = argv[i + 1]?.trim();
      if (next) return next;
    }
    if (arg.startsWith("--keywords-file=")) {
      return arg.slice("--keywords-file=".length).trim();
    }
  }
  return undefined;
}

function parseRegion(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--region" || arg === "-r") {
      const next = argv[i + 1]?.trim();
      if (next) return next;
    }
    if (arg.startsWith("--region=")) {
      return arg.slice("--region=".length).trim();
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const step = parseStep(argv);
  const blogTopic = parseTopicFromArgv(argv);
  const blogRegion = parseRegion(argv);
  const keywordsFile = parseKeywordsFile(argv);
  const skipEdit = argv.includes("--skip-edit");
  const batchMode = argv.includes("--batch");

  await runWorkflow({
    step,
    blogTopic,
    blogRegion,
    keywordsFile,
    skipEditPrompt: skipEdit,
    batchMode,
  });

  if (batchMode) {
    process.exit(0);
  }
}

main().catch(async (error: unknown) => {
  console.error("\n❌ 실행 실패:");
  console.error(error instanceof Error ? error.message : error);

  try {
    await notifyError(error, { stage: "workflow-cli" });
  } catch {
    /* Discord 미설정 등 */
  }

  gracefulExit(1);
});
