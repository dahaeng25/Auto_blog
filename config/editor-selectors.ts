/**
 * 에디터 DOM 셀렉터 — 플랫폼 UI 변경 시 이 파일만 수정합니다.
 * Playwright는 쉼표 구분 셀렉터(OR)를 지원합니다.
 */
export const EDITOR_SELECTORS = {
  naver: {
    /** 글쓰기 페이지 메인 iframe */
    mainFrame: "iframe#mainFrame",
    /** 이전 글 임시저장 복원 팝업 — '취소' (이어쓰기 거부) */
    dismissDraft: 'button:has-text("취소")',
    /** 제목 입력 영역 (본문과 분리) */
    title:
      '.se-component.se-documentTitle [contenteditable="true"], .se-documentTitle .se-title-text',
    /** 본문 contenteditable (제목 영역 제외) */
    editorBody:
      '.se-main-container .se-component.se-text .se-text-paragraph, .se-main-container .se-component.se-text [contenteditable="true"]',
    /** 이미지 첨부 버튼 */
    imageButton:
      'button[data-name="image"], .se-image-toolbar-button, .se-toolbar-item-image button, button[aria-label*="사진"], button[aria-label*="이미지"], li[data-name="image"] button',
    /** 파일 input */
    fileInput:
      'input[type="file"][accept*="image"], input[type="file"]',
    /** 업로드된 이미지에 링크 연결 */
    imageLinkButton:
      'button[data-name="link"], button[data-name="oglink"], button[aria-label*="링크"], .se-link-toolbar-button',
    imageLinkInput:
      'input[placeholder*="URL"], input[placeholder*="링크"], input[type="url"], .se-custom-layer input[type="text"]',
    imageLinkConfirm:
      'button.se-popup-button-confirm, button:has-text("확인"), button:has-text("적용")',
    /** 이미지 링크 연결 모달 ("링크" 제목) */
    linkDialog:
      '.se-popup:has(.se-popup-title:has-text("링크")), .se-popup:has-text("링크"), .se-layer:has-text("링크"), [class*="se-popup"]:has([class*="title"]:has-text("링크")), [class*="popup"]:has-text("링크"), .se-custom-layer:has-text("링크"), [role="dialog"]:has-text("링크")',
    linkDialogInput:
      '.se-popup:has-text("링크") input[type="text"], .se-popup:has-text("링크") input[type="url"], .se-popup:has(.se-popup-title:has-text("링크")) input, .se-popup:has-text("링크") input[placeholder*="URL"], .se-popup input, [class*="popup"]:has-text("링크") input, [role="dialog"]:has-text("링크") input',
    /** 링크 모달 URL 입력란 옆 돋보기(검색) 버튼 */
    linkDialogSearch:
      '.se-popup:has-text("링크") button[class*="search"], .se-popup:has(.se-popup-title:has-text("링크")) button[class*="search"], .se-popup:has-text("링크") button[aria-label*="검색"], .se-popup:has-text("링크") button[title*="검색"], .se-popup:has-text("링크") .se-url-input button, .se-popup:has-text("링크") .se-input-form button:not(:has-text("확인")):not([class*="close"]), .se-popup:has-text("링크") input[type="text"] ~ button, .se-popup:has-text("링크") input[type="url"] ~ button, .se-popup:has-text("링크") .se-input-group button, [role="dialog"]:has-text("링크") button[class*="search"], [role="dialog"]:has-text("링크") button[aria-label*="검색"]',
    linkDialogConfirm:
      '.se-popup:has-text("링크") button:has-text("확인"), .se-popup:has(.se-popup-title:has-text("링크")) button.se-popup-button-confirm, .se-popup:has-text("링크") button.se-popup-button-confirm, .se-popup button.se-popup-button-confirm, [role="dialog"]:has-text("링크") button:has-text("확인")',
    linkDialogClose:
      '.se-popup:has-text("링크") button[class*="close"], .se-popup:has(.se-popup-title:has-text("링크")) .se-popup-close-button, .se-popup:has-text("링크") button[aria-label="닫기"], .se-popup-close-button, [role="dialog"]:has-text("링크") button[class*="close"]',
    /** ① 발행 패널 열기 (상단 바) */
    publishButton:
      '[data-click-area="tpb.publish"], button[class*="publish_btn"]:not([class*="confirm"]), .publish_btn__m9KHH',
    /** ② 발행 패널 내 최종 '발행' 확인 */
    publishConfirm:
      '[class*="publish_layer"] button[class*="confirm_btn"], [class*="publish_layer"] button:has-text("발행"), button.confirm_btn__, [data-testid="seOnePublishBtn"], .se-popup-button-confirm, .publish_btn__m9KHH[class*="confirm"]',
    /** 스마트에디터 ONE 도움말 패널 (글쓰기 진입 시 우측 자동 노출) */
    helpPanel:
      '.se-help-panel, [class*="se-help-panel"], [class*="help-panel"], button.se-help-panel-close-button',
    /** 도움말 패널 닫기(X) — iframe#mainFrame 내부 */
    helpPanelClose:
      'button.se-help-panel-close-button, .se-help-panel-close-button',
    /** 우측 사이드 패널 (글쓰기 도우미·AI 등 — 발행 패널을 가릴 수 있음) */
    rightPanel:
      '[class*="right_panel"], [class*="RightPanel"], [class*="side_panel"], [class*="sidebar"], .se-floating-panel, .se-side-panel, [class*="ai_write"], [class*="AiWrite"]',
    /** 우측 패널 닫기(X) 버튼 */
    rightPanelClose:
      'button[class*="close"], button[aria-label="닫기"], button[title="닫기"], a[class*="close"], .btn_close, button:has-text("닫기"), .se-panel-close-button, .se-popup-close-button',
  },
  tistory: {
    title: '#post-title-inp, input[name="title"], textarea#post-title-inp',
    /** 에디터 iframe (티스토리 버전별) */
    editorFrame: "iframe#editor-tistory, iframe.editor_iframe, iframe[id*='editor']",
    editorBody:
      '[contenteditable="true"], .mce-content-body, div#tinymce',
    imageButton:
      'button:has-text("이미지"), .btn_attach, [aria-label="이미지"], .mce-i-image, a[role="button"]:has-text("이미지"), .attach-btn .btn-image',
    fileInput:
      'input[type="file"][accept*="image"], input[type="file"]',
    /** 발행 패널 내 대표 이미지 영역 (티스토리) */
    thumbnailArea:
      '.box_thumbnail, .thumb_editor, [class*="thumbnail"], .represent-image',
    /** ① 발행 설정 패널 열기 */
    publishButton:
      '#publish-layer-btn, button.btn_save, button:has-text("완료"), button:has-text("발행"), .btn_publish',
    /** 발행 패널 — 공개 옵션 선택 */
    publicVisibility:
      'span.checkbox-text:has-text("공개"), label:has-text("공개"), #open20, input[value="20"][name="open"], input[value="20"]',
    /** ② 발행 패널 내 최종 '공개 발행' */
    publishConfirm:
      '#publish-btn, .layer_publish button:has-text("공개 발행"), .box_popup button:has-text("공개 발행"), button.btn_ok:has-text("공개 발행"), button.btn_confirm:has-text("공개 발행")',
  },
  google: {
    title:
      'input[aria-label="Title"], textarea[aria-label="Title"], input[aria-label="제목"], textarea[aria-label="제목"]',
    editorBody:
      '[role="textbox"][aria-label*="Compose"], [role="textbox"][aria-label*="본문"], [contenteditable="true"][aria-label*="Compose"], div[contenteditable="true"]',
    imageButton:
      'button[aria-label*="Insert image"], button[aria-label*="이미지"], button:has-text("Image")',
    fileInput: 'input[type="file"][accept*="image"], input[type="file"]',
    publishButton:
      'button:has-text("Publish"), button:has-text("게시"), div[role="button"]:has-text("Publish"), div[role="button"]:has-text("게시")',
    publishConfirm:
      'button:has-text("Publish"), button:has-text("게시"), button:has-text("Confirm")',
  },
} as const;
