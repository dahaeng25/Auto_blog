import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** 지원 플랫폼 식별자 */
export type Platform = "naver" | "tistory";

/** 플랫폼별 URL 및 세션 파일 경로 */
export const PLATFORMS = {
  naver: {
    name: "네이버 블로그",
    loginUrl: "https://nid.naver.com/nidlogin.login",
    /** 로그인 완료 여부 확인용 (네이버 메인) */
    verifyUrl: "https://www.naver.com",
    /** 글쓰기 URL — NAVER_BLOG_ID 환경변수 필요 */
    postWriteUrl: (blogId: string) =>
      `https://blog.naver.com/${blogId}/postwrite`,
    stateFile: path.join(projectRoot, "auth", "naver_state.json"),
  },
  tistory: {
    name: "티스토리",
    loginUrl: "https://www.tistory.com/auth/login",
    /** 로그인 완료 여부 확인용 */
    verifyUrl: "https://www.tistory.com",
    /** 글쓰기 URL — TISTORY_BLOG_NAME 환경변수 필요 */
    postWriteUrl: (blogName: string) =>
      `https://${blogName}.tistory.com/manage/newpost`,
    stateFile: path.join(projectRoot, "auth", "tistory_state.json"),
  },
} as const satisfies Record<
  Platform,
  {
    name: string;
    loginUrl: string;
    verifyUrl: string;
    postWriteUrl: (id: string) => string;
    stateFile: string;
  }
>;
