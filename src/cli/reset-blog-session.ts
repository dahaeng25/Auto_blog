import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/index.js";

const KEYWORDS_FILE = "blog-keywords.txt";
const REGION_FILE = "blog-region.txt";

/** 업로드 후 다음 글을 위해 키워드·지역 파일을 비웁니다. */
export async function resetBlogSessionFiles(): Promise<void> {
  const keywordsPath = path.join(config.projectRoot, KEYWORDS_FILE);
  const regionPath = path.join(config.projectRoot, REGION_FILE);

  await Promise.all([
    fs.writeFile(keywordsPath, "# 다음 글 키워드\n", "utf-8"),
    fs.writeFile(regionPath, "# 다음 글 지역\n", "utf-8"),
  ]);
}
