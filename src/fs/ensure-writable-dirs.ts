import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/index.js";

/** 파이프라인이 쓰는 출력 디렉터리를 미리 생성합니다. */
export async function ensureWritableDirs(): Promise<void> {
  await fs.mkdir(config.draftsDir, { recursive: true });
  await fs.mkdir(config.thumbnailsDir, { recursive: true });

  if (!config.isVercel) {
    await fs.mkdir(path.join(config.outputDir, "logs"), { recursive: true });
  }
}
