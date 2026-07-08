import fs from "node:fs";
import path from "node:path";
import { config } from "../../../config/index.js";

export interface KeywordTask {
  label: string;
  keywords: string[];
}

export interface KeywordCategory {
  id: string;
  name: string;
  tasks: KeywordTask[];
}

export interface KeywordCatalog {
  categories: KeywordCategory[];
  seedExpansions: Record<string, string[]>;
  detailAngles: string[];
}

function catalogPath(): string {
  return path.join(config.projectRoot, "config", "blog-keyword-catalog.json");
}

export function loadKeywordCatalog(): KeywordCatalog {
  const raw = fs.readFileSync(catalogPath(), "utf-8");
  return JSON.parse(raw) as KeywordCatalog;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function uniqueKeywords(words: string[], max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const t = w.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export interface GeneratedKeywords {
  mode: "random-task" | "expand-seed" | "random-detail";
  categoryName?: string;
  taskLabel?: string;
  keywords: string;
  keywordList: string[];
}

/** 행정사 업무 목록에서 무작위 업무 키워드 세트 */
export function pickRandomTaskKeywords(
  catalog: KeywordCatalog,
  categoryId?: string,
): GeneratedKeywords {
  const categories = categoryId
    ? catalog.categories.filter((c) => c.id === categoryId)
    : catalog.categories;

  if (categories.length === 0) {
    throw new Error(`업무 분류를 찾을 수 없습니다: ${categoryId}`);
  }

  const category = pickRandom(categories);
  const task = pickRandom(category.tasks);
  const keywordList = uniqueKeywords(task.keywords, 4);

  return {
    mode: "random-task",
    categoryName: category.name,
    taskLabel: task.label,
    keywordList,
    keywords: keywordList.join(", "),
  };
}

/** 시드 단어 하나 → 연관 키워드 자동 확장 */
export function expandSeedKeywords(
  catalog: KeywordCatalog,
  seed: string,
): GeneratedKeywords {
  const trimmed = seed.trim();
  if (!trimmed) {
    throw new Error("시드 키워드를 입력하세요.");
  }

  const normalized = trimmed.replace(/\s+/g, "");
  const lower = normalized.toLowerCase();

  let related: string[] = [];
  for (const [key, values] of Object.entries(catalog.seedExpansions)) {
    const keyNorm = key.replace(/\s+/g, "").toLowerCase();
    if (
      lower.includes(keyNorm) ||
      keyNorm.includes(lower) ||
      normalized.includes(key) ||
      key.includes(normalized)
    ) {
      related = [...related, key, ...values];
    }
  }

  if (related.length === 0) {
    for (const category of catalog.categories) {
      for (const task of category.tasks) {
        const hit = task.keywords.some(
          (kw) =>
            kw.includes(trimmed) ||
            trimmed.includes(kw) ||
            kw.toLowerCase().includes(lower),
        );
        if (hit) {
          related = [...related, ...task.keywords];
        }
      }
    }
  }

  if (related.length === 0) {
    related = [trimmed, `${trimmed} 신청`, `${trimmed} 절차`, "행정사"];
  } else {
    related = [trimmed, ...related];
  }

  const keywordList = uniqueKeywords(related, 4);
  return {
    mode: "expand-seed",
    taskLabel: trimmed,
    keywordList,
    keywords: keywordList.join(", "),
  };
}

/** 업무 + 상세 각도를 섞은 세밀한 랜덤 키워드 */
export function pickRandomDetailedKeywords(
  catalog: KeywordCatalog,
  categoryId?: string,
): GeneratedKeywords {
  const base = pickRandomTaskKeywords(catalog, categoryId);
  const angle = pickRandom(catalog.detailAngles);
  const keywordList = uniqueKeywords([...base.keywordList, angle], 5);

  return {
    mode: "random-detail",
    categoryName: base.categoryName,
    taskLabel: `${base.taskLabel} (${angle})`,
    keywordList,
    keywords: keywordList.join(", "),
  };
}

export async function saveGeneratedKeywords(keywords: string): Promise<void> {
  const filePath = path.join(config.projectRoot, "blog-keywords.txt");
  await fs.promises.writeFile(filePath, `${keywords}\n`, "utf-8");
}

export function listCategories(catalog: KeywordCatalog): KeywordCategory[] {
  return catalog.categories;
}
