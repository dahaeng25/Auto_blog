import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * 이미지 파일/버퍼에 눈에 보이지 않는 노이즈·타임스탬프를 합성해
 * 매 실행마다 고유한 해시를 생성합니다 (중복 이미지 판독 우회).
 */
export async function mutateImageHashBuffer(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  const noiseR = Math.floor(Math.random() * 256);
  const noiseG = Math.floor(Math.random() * 256);
  const noiseB = Math.floor(Math.random() * 256);

  const noisePixel = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: noiseR, g: noiseG, b: noiseB, alpha: 0.01 },
    },
  })
    .png()
    .toBuffer();

  const timestamp = Date.now().toString(36);
  const labelSvg = Buffer.from(
    `<svg width="80" height="12" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="10" font-size="8" fill="rgba(0,0,0,0.01)">${timestamp}</text>
    </svg>`,
  );

  return sharp(input)
    .composite([
      { input: noisePixel, top: height - 1, left: width - 1, blend: "over" },
      { input: labelSvg, top: 0, left: 0, blend: "over" },
    ])
    .toBuffer();
}

/** 파일을 읽어 해시 변조 후 대상 경로에 저장 */
export async function mutateImageHashFile(
  sourcePath: string,
  destPath: string,
): Promise<string> {
  const input = await fs.readFile(sourcePath);
  const output = await mutateImageHashBuffer(input);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, output);
  return destPath;
}
