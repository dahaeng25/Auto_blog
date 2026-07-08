export interface ChatOptions {
  system: string;
  user: string;
  temperature?: number;
  /** 출력 토큰 상한 (긴 HTML 본문용). 미지정 시 config.llmMaxTokens */
  maxTokens?: number;
}
