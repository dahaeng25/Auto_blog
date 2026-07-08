import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  expandSeedKeywords,
  listCategories,
  loadKeywordCatalog,
  pickRandomDetailedKeywords,
  pickRandomTaskKeywords,
  saveGeneratedKeywords,
} from "../src/content/keywords/keyword-catalog.js";

type Mode = "random-task" | "expand" | "random-detail" | "interactive";

function parseMode(argv: string[]): Mode {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode" || arg === "-m") {
      const next = argv[i + 1]?.trim();
      if (next === "random-task" || next === "expand" || next === "random-detail") {
        return next;
      }
    }
    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length).trim();
      if (value === "random-task" || value === "expand" || value === "random-detail") {
        return value;
      }
    }
  }
  if (argv.includes("--interactive") || argv.includes("-i")) return "interactive";
  return "interactive";
}

function parseSeed(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed" || arg === "-s") {
      return argv[i + 1]?.trim();
    }
    if (arg.startsWith("--seed=")) {
      return arg.slice("--seed=".length).trim();
    }
  }
  return undefined;
}

function parseCategory(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--category" || arg === "-c") {
      return argv[i + 1]?.trim();
    }
    if (arg.startsWith("--category=")) {
      return arg.slice("--category=".length).trim();
    }
  }
  return undefined;
}

async function promptLine(message: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(message)).trim();
  } finally {
    rl.close();
  }
}

async function runInteractive(catalog: ReturnType<typeof loadKeywordCatalog>): Promise<void> {
  console.log("\n─── 키워드 자동 생성 ───");
  console.log("  [1] 업무 목록에서 랜덤");
  console.log("  [2] 한 단어 → 연관 키워드 확장");
  console.log("  [3] 업무별 상세 랜덤");
  console.log("  [4] 업무 분류 선택 후 랜덤");
  console.log("  [0] 취소");

  const choice = await promptLine("\n선택 > ");
  if (choice === "0" || !choice) {
    console.log("취소했습니다.");
    process.exit(0);
  }

  if (choice === "1") {
    await applyResult(pickRandomTaskKeywords(catalog));
    return;
  }

  if (choice === "2") {
    const seed = await promptLine("시드 키워드 (한 단어) > ");
    await applyResult(expandSeedKeywords(catalog, seed));
    return;
  }

  if (choice === "3") {
    await applyResult(pickRandomDetailedKeywords(catalog));
    return;
  }

  if (choice === "4") {
    const categories = listCategories(catalog);
    console.log("\n업무 분류:");
    categories.forEach((c, i) => {
      console.log(`  [${i + 1}] ${c.name} (${c.id})`);
    });
    const idxRaw = await promptLine("번호 > ");
    const idx = Number(idxRaw) - 1;
    const category = categories[idx];
    if (!category) {
      throw new Error("잘못된 분류 번호입니다.");
    }
    await applyResult(pickRandomTaskKeywords(catalog, category.id));
    return;
  }

  throw new Error("잘못된 선택입니다.");
}

async function applyResult(
  result: ReturnType<typeof pickRandomTaskKeywords>,
): Promise<void> {
  await saveGeneratedKeywords(result.keywords);
  console.log("\n✅ 키워드 저장 완료");
  if (result.categoryName) {
    console.log(`   분류: ${result.categoryName}`);
  }
  if (result.taskLabel) {
    console.log(`   업무: ${result.taskLabel}`);
  }
  console.log(`   키워드: ${result.keywords}`);
  console.log(`   파일: ${path.resolve("blog-keywords.txt")}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const catalog = loadKeywordCatalog();
  const mode = parseMode(argv);
  const categoryId = parseCategory(argv);
  const seed = parseSeed(argv);

  if (mode === "interactive") {
    await runInteractive(catalog);
    return;
  }

  if (mode === "random-task") {
    await applyResult(pickRandomTaskKeywords(catalog, categoryId));
    return;
  }

  if (mode === "random-detail") {
    await applyResult(pickRandomDetailedKeywords(catalog, categoryId));
    return;
  }

  if (mode === "expand") {
    const value = seed ?? (await promptLine("시드 키워드 > "));
    await applyResult(expandSeedKeywords(catalog, value));
  }
}

main().catch((error: unknown) => {
  console.error("\n❌ 키워드 생성 실패:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
