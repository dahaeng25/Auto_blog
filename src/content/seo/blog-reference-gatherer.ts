import { extractInputKeywordPhrases } from "../../publishing/images/keyword-slug.js";
import {
  searchNaverBlogReferences,
  type NaverBlogPost,
} from "./naver-blog-search.js";
import {
  PublishedPostRepository,
  type PublishedPostRecord,
} from "./published-post-repository.js";

export interface BlogReferenceItem {
  title: string;
  snippet: string;
  query: string;
  source: "naver" | "internal";
  url?: string;
  keywords?: string;
}

export interface BlogReferenceBundle {
  naverPosts: NaverBlogPost[];
  internalPosts: PublishedPostRecord[];
  items: BlogReferenceItem[];
}

/**
 * 네이버 유사 글 + DB 발행 글을 수집해 Gems 생성 전 참고 컨텍스트로 사용합니다.
 */
export async function gatherBlogReferences(
  topic: string,
): Promise<BlogReferenceBundle> {
  const phrases = extractInputKeywordPhrases(topic);

  const [naverPosts, internalPosts] = await Promise.all([
    searchNaverBlogReferences(topic, {
      perQueryLimit: 5,
      totalLimit: 12,
      maxQueries: Math.min(phrases.length || 1, 4),
    }),
    fetchInternalReferences(topic),
  ]);

  const items: BlogReferenceItem[] = [
    ...naverPosts.map((post) => ({
      title: post.title,
      snippet: post.snippet,
      query: post.query,
      source: "naver" as const,
    })),
    ...internalPosts.map((post) => ({
      title: post.title,
      snippet: post.keywords,
      query: post.keywords,
      source: "internal" as const,
      url: post.postUrl,
      keywords: post.keywords,
    })),
  ];

  if (items.length > 0) {
    console.log(
      `[SEO] 유사 글 참고 ${items.length}건 (네이버 ${naverPosts.length} · 내부 ${internalPosts.length})`,
    );
  }

  return { naverPosts, internalPosts, items };
}

async function fetchInternalReferences(
  topic: string,
): Promise<PublishedPostRecord[]> {
  const repo = new PublishedPostRepository();
  try {
    return await repo.findRelated(topic, 5);
  } finally {
    repo.close();
  }
}

/**
 * 수집된 유사 글을 LLM 프롬프트용 [참고 유사 글] 블록으로 포맷합니다.
 */
export function buildBlogReferenceContext(bundle: BlogReferenceBundle): string {
  if (bundle.items.length === 0) return "";

  const naverLines = bundle.naverPosts
    .map((post, i) => {
      const snippetPart = post.snippet
        ? `\n   요약: ${post.snippet}`
        : "";
      return `${i + 1}. [검색어: ${post.query}] "${post.title}"${snippetPart}`;
    })
    .join("\n");

  const internalLines = bundle.internalPosts
    .map((post, i) => {
      return `${i + 1}. "${post.title}" (키워드: ${post.keywords})`;
    })
    .join("\n");

  const naverBlock = naverLines
    ? `[네이버 상위 노출 유사 글]\n${naverLines}`
    : "";
  const internalBlock = internalLines
    ? `[기존 발행 글 — 내부 참고 (앵글·키워드 패턴 학습용)]\n${internalLines}`
    : "";

  const referenceBody = [naverBlock, internalBlock].filter(Boolean).join("\n\n");

  return `
---
[참고 유사 글 — 작성 전 필수 학습]
아래는 타겟 키워드와 유사한 **실제 블로그 글**입니다. JSON 출력 전에 반드시 읽고 학습하십시오.

**학습 대상 (복사 금지)**
- 상위 글이 다루는 **독자 검색 의도·핵심 고민·자주 막히는 지점**
- 제목에 드러난 **앵글·문제 상황·해결 방향** 패턴
- 본문에서 반복되는 **서류 반려 사유·공증 오류·심사 트렌드·필수 서류**
- h2 흐름·Q&A에서 다루는 **실무 질문** (구조만 참고)

**작성 원칙**
- 유사 글이 실제로 다루는 니즈에 맞춰 글 주제·제목·본문 앵글을 선정하십시오.
- 소설·가상 르포처럼 꾸민 스토리 금지. **실무에서 흔한 수임 상황**을 1인칭으로 서술하십시오.
- 참고 글 문장·제목을 그대로 복사하지 마십시오. 패턴과 니즈만 반영하십시오.
- 참고 글에 공통으로 나오는 반려·서류 포인트를 본문에 구체적으로 반영하십시오.

${referenceBody}`;
}
