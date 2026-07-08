import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { readLocalizedTextFile } from "../../fs/read-localized-text-file.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../../config/index.js";

export interface Locality {
  name: string;
  short: string;
  popular: boolean;
}

export interface RegionDefinition {
  id: string;
  name: string;
  aliases: string[];
  type: "province" | "metro" | "special";
  localities: Locality[];
}

export interface RegionPickResult {
  /** 입력·매칭된 상위 행정구역 (예: 전라북도, 부산광역시) */
  parentName: string;
  parentType: RegionDefinition["type"];
  /** 본문·제목·해시태그에 쓸 짧은 지명 4~5개 */
  pickedShort: string[];
  /** 전체 행정구역명 (해시태그용) */
  pickedFull: string[];
}

interface KoreaRegionsFile {
  defaultRegionId: string;
  regions: RegionDefinition[];
}

const REGIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../config/korea-regions.json",
);

let cachedRegions: KoreaRegionsFile | null = null;

function loadRegionsFile(): KoreaRegionsFile {
  if (cachedRegions) return cachedRegions;
  const raw = fs.readFileSync(REGIONS_PATH, "utf-8");
  cachedRegions = JSON.parse(raw) as KoreaRegionsFile;
  return cachedRegions;
}

function normalizeInput(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "")
    .replace(/특별자치도|특별자치시|광역시|특별시/g, "")
    .replace(/도$/g, "")
    .toLowerCase();
}

function regionMatches(region: RegionDefinition, input: string): boolean {
  const norm = normalizeInput(input);
  if (!norm) return false;

  const candidates = [
    region.name,
    region.id,
    ...region.aliases,
    region.name.replace(/특별자치도|특별자치시|광역시|특별시/g, ""),
    region.name.replace(/도$/g, ""),
  ];

  return candidates.some((c) => {
    const cn = normalizeInput(c);
    return cn === norm || cn.includes(norm) || norm.includes(cn);
  });
}

function findRegion(input: string): RegionDefinition {
  const data = loadRegionsFile();
  const trimmed = input.trim();

  if (trimmed) {
    const found = data.regions.find((r) => regionMatches(r, trimmed));
    if (found) return found;
    throw new Error(
      `지역을 찾을 수 없습니다: "${input}"\n` +
        `예: 전라북도, 전북, 부산, 경기, 서울, 인천, 대구, 광주, 대전, 울산, 세종, 제주`,
    );
  }

  const fallback =
    data.regions.find((r) => r.id === data.defaultRegionId) ?? data.regions[0];
  return fallback;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickCount(): number {
  return Math.random() < 0.5 ? 4 : 5;
}

/**
 * 도·광역시 입력에서 인기 시군구를 우선으로 4~5개 무작위 선택합니다.
 */
export function pickBlogRegions(regionInput: string): RegionPickResult {
  const region = findRegion(regionInput);
  const count = pickCount();

  const popular = region.localities.filter((l) => l.popular);
  const others = region.localities.filter((l) => !l.popular);

  const pool: Locality[] = [];
  const popularShuffled = shuffle(popular);
  pool.push(...popularShuffled);

  if (pool.length < count) {
    pool.push(...shuffle(others));
  }

  const selected = pool.slice(0, Math.min(count, pool.length));
  const pickedShort = selected.map((l) => l.short);
  const pickedFull = selected.map((l) => l.name);

  return {
    parentName: region.name,
    parentType: region.type,
    pickedShort,
    pickedFull,
  };
}

/** Gems 프롬프트에 삽입할 지역 지시문 */
export function buildRegionInstruction(pick: RegionPickResult): string {
  const list = pick.pickedShort.join("·");
  const titleSuffix = `${list}·강운준 행정사`;
  const hashTags = pick.pickedShort.map((s) => `#${s}`).join(" ");

  const unitLabel =
    pick.parentType === "metro"
      ? "구·군"
      : pick.parentType === "province"
        ? "시·군"
        : "읍·동";

  return `
[이번 글 지역 SEO — ${pick.parentName}]
- 상위 행정구역: ${pick.parentName}
- 본문·제목에 반드시 아래 ${pick.pickedShort.length}개 ${unitLabel} 지명을 자연스럽게 **5~6회 이상** 녹이세요: ${list}
- 도입부·본문·사례·Q&A 곳곳에 분산 배치 (한 곳에 몰아넣지 말 것)
- 제목 뒤 지역·이름 나열: ${titleSuffix}
- 해시태그에 위 지명 + #강운준행정사 포함 (예: ${hashTags} #강운준행정사)
- 위 목록에 없는 다른 시군구를 임의로 추가하지 마세요`;
}

/** 등록된 도·광역시 목록 (안내용) */
export function listAvailableRegions(): string[] {
  return loadRegionsFile().regions.map((r) => r.name);
}

/** blog-region.txt 또는 .env BLOG_REGION 에서 상위 지역명 읽기 */
export async function resolveBlogRegionInput(
  override?: string,
): Promise<string> {
  const direct = override?.trim() || config.blogRegion?.trim();
  if (direct) return direct;

  const filePath = path.join(config.projectRoot, "blog-region.txt");
  try {
    const content = await readLocalizedTextFile(filePath);
    const line = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (line) return line;
  } catch {
    // 파일 없으면 기본값
  }

  const data = loadRegionsFile();
  const fallback = data.regions.find((r) => r.id === data.defaultRegionId);
  return fallback?.name ?? "전라북도";
}
