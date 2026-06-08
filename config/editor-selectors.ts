/**
 * 에디터 DOM 셀렉터 — 플랫폼 UI 변경 시 이 파일만 수정합니다.
 * Playwright는 쉼표 구분 셀렉터(OR)를 지원합니다.
 */
export const EDITOR_SELECTORS = {
  naver: {
    /** 글쓰기 페이지 메인 iframe */
    mainFrame: "iframe#mainFrame",
    /** 이전 글 임시저장 복원 팝업 — '새로 작성' */
    dismissDraft: 'button:has-text("새로 작성")',
    /** 제목 입력 영역 */
    title:
      '.se-title-text, .se-documentTitle, [contenteditable="true"].se-title-text, span.se-placeholder',
    /** 본문 contenteditable */
    editorBody:
      '.se-main-container [contenteditable="true"], .se-component.se-text [contenteditable="true"], .se-text-paragraph',
    /** 이미지 첨부 버튼 */
    imageButton:
      'button[data-name="image"], .se-image-toolbar-button, button:has-text("사진")',
    /** 파일 input */
    fileInput: 'input[type="file"][accept*="image"]',
    /** 발행 버튼 */
    publishButton:
      'button:has-text("발행"), [data-click-area="tpb.publish"], .publish_btn__m9KHH',
    /** 발행 확인 */
    publishConfirm: 'button:has-text("발행"), button.confirm_btn__',
  },
  tistory: {
    title: '#post-title-inp, input[name="title"], textarea#post-title-inp',
    /** 에디터 iframe (티스토리 버전별) */
    editorFrame: "iframe#editor-tistory, iframe.editor_iframe, iframe[id*='editor']",
    editorBody:
      '[contenteditable="true"], .mce-content-body, div#tinymce',
    imageButton: 'button:has-text("이미지"), .btn_attach, [aria-label="이미지"]',
    fileInput: 'input[type="file"][accept*="image"], input[type="file"]',
    publishButton: 'button:has-text("완료"), button:has-text("공개 발행"), .btn_publish',
    publishConfirm: 'button:has-text("발행"), button:has-text("확인")',
  },
} as const;
