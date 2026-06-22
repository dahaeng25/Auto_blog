import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** 지원 플랫폼 식별자 */
export type Platform = "naver" | "tistory" | "google";

/** 플랫폼별 URL 및 세션 파일 경로 */
export const PLATFORMS = {
  naver: {
    name: "네이버 블로그",
    loginUrl: "https://nid.naver.com/nidlogin.login",
    /** 로그인 완료 여부 확인용 (네이버 메인) */
    verifyUrl: "https://www.naver.com",
    /** 글쓰기 URL — NAVER_BLOG_ID 환경변수 필요 */
    postWriteUrl: (blogId: string) =>
      `https://blog.naver.com/${blogId.replace(/^https?:\/\/blog\.naver\.com\//i, "").replace(/\/.*$/, "")}?Redirect=Write`,
    stateFile: path.join(projectRoot, "auth", "naver_state.json"),
  },
  tistory: {
    name: "티스토리",
    loginUrl: "https://www.tistory.com/auth/login",
    verifyUrl: "https://www.tistory.com",
    postWriteUrl: (blogName: string) =>
      `https://${blogName}.tistory.com/manage/newpost`,
    stateFile: path.join(projectRoot, "auth", "tistory_state.json"),
  },
  google: {
    name: "Google Blogger",
    loginUrl: "https://accounts.google.com/signin",
    verifyUrl: "https://www.blogger.com/",
    /** 글쓰기 URL — BLOGGER_BLOG_ID(숫자) 환경변수 필요 */
    postWriteUrl: (blogId: string) =>
      `https://www.blogger.com/blog/post/edit/${blogId}`,
    stateFile: path.join(projectRoot, "auth", "google_state.json"),
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
