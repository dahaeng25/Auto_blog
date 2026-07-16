/** 대시보드에서 고를 수 있는 샘플 썸네일 배경 (그라데이션) */
export interface ThumbnailSampleBackground {
  id: string;
  name: string;
  description: string;
  /** CSS linear-gradient — 렌더러·미리보기 공통 */
  gradient: string;
}

export const THUMBNAIL_SAMPLE_BACKGROUNDS: readonly ThumbnailSampleBackground[] =
  [
    {
      id: "navy-depth",
      name: "네이비 딥",
      description: "전문·행정 문서에 어울리는 진한 남색",
      gradient:
        "linear-gradient(145deg, #1a3a5c 0%, #2d6a9f 48%, #1e4d73 100%)",
    },
    {
      id: "slate-ocean",
      name: "슬레이트 오션",
      description: "차분한 청록·남색 톤",
      gradient:
        "linear-gradient(145deg, #152d47 0%, #3a7ca5 55%, #1a3a5c 100%)",
    },
    {
      id: "midnight-blue",
      name: "미드나이트 블루",
      description: "어두운 블루로 제목이 잘 돋보임",
      gradient:
        "linear-gradient(145deg, #0f2a42 0%, #2b5f8a 52%, #1a3a5c 100%)",
    },
    {
      id: "forest-teal",
      name: "포레스트 틸",
      description: "신뢰감 있는 청록 그라데이션",
      gradient:
        "linear-gradient(160deg, #0d3b3a 0%, #1a6b66 45%, #0f4a48 100%)",
    },
    {
      id: "charcoal-gold",
      name: "차콜 골드",
      description: "고급스러운 어두운 톤",
      gradient:
        "linear-gradient(145deg, #1c1c1e 0%, #3a3a40 50%, #2a2a2e 100%)",
    },
    {
      id: "steel-sky",
      name: "스틸 스카이",
      description: "밝은 스틸 블루",
      gradient:
        "linear-gradient(145deg, #1e4466 0%, #4a8fb8 50%, #163a56 100%)",
    },
  ] as const;

export function findSampleBackground(
  sampleId: string,
): ThumbnailSampleBackground | undefined {
  return THUMBNAIL_SAMPLE_BACKGROUNDS.find((s) => s.id === sampleId);
}
