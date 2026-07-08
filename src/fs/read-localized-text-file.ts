import fs from "node:fs";
import fsPromises from "node:fs/promises";

/** UTF-8 바이트를 CP949로 잘못 읽었을 때 자주 나타나는 글자 */
const MOJIBAKE_PATTERN = /[怨듭옣湲곌퀎逾뺤콈吏곸젒]/;

export function looksLikeMojibake(text: string): boolean {
  return MOJIBAKE_PATTERN.test(text);
}

export function decodeLocalizedBuffer(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf-8");
  }

  const utf8 = buf.toString("utf-8");
  const hasHangul = /[\uAC00-\uD7A3]/.test(utf8);
  const hasMojibake = looksLikeMojibake(utf8);

  if (hasHangul && !hasMojibake) return utf8;
  if (!hasHangul && /^[\x00-\x7F,\s#]+$/.test(utf8)) return utf8;

  try {
    const cp949 = new TextDecoder("euc-kr").decode(buf);
    if (/[\uAC00-\uD7A3]/.test(cp949) && !looksLikeMojibake(cp949)) {
      return cp949;
    }
  } catch {
    // ignore
  }

  return utf8;
}

export async function readLocalizedTextFile(filePath: string): Promise<string> {
  const buf = await fsPromises.readFile(filePath);
  return decodeLocalizedBuffer(buf);
}

export function readLocalizedTextFileSync(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return decodeLocalizedBuffer(buf);
}
