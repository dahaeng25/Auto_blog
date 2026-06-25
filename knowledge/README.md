# Knowledge Base (PDF 참고 자료)

Gems 모드 콘텐츠 생성 시, 이 폴더(또는 `KNOWLEDGE_DIR`로 지정한 폴더)의 PDF에서 텍스트를 추출해 관련 구간을 LLM 프롬프트에 주입합니다.

## 사용 방법

1. 참고할 PDF 파일을 지식 폴더에 넣습니다.
2. 주제별로 파일을 나누거나, 여러 주제를 한 PDF에 묶어도 됩니다.
3. `npm run run:once` 또는 `CONTENT_MODE=gems`로 글을 생성하면, 블로그 주제/키워드와 관련된 구간이 자동 검색됩니다.

```
knowledge/
  E-7-4R-비자-가이드.pdf
  행정사-수임-사례집.pdf
  .cache/          ← 기본 폴더 사용 시 자동 생성 (직접 수정 불필요)
```

## 환경 변수 (.env)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `KNOWLEDGE_DIR` | `knowledge` | PDF 폴더 경로. **상대 경로**는 프로젝트 루트 기준, **절대 경로**는 그대로 사용 (예: Google Drive 로컬 동기화 폴더) |
| `KNOWLEDGE_ENABLED` | `true` | `false`로 설정 시 PDF RAG 비활성화 |
| `KNOWLEDGE_MAX_CHUNKS` | `5` | 프롬프트에 넣을 최대 청크 수 |

`.env` 예시:

```env
KNOWLEDGE_DIR=G:\My Drive\출입국
KNOWLEDGE_ENABLED=true
KNOWLEDGE_MAX_CHUNKS=5
```

외부 폴더(`KNOWLEDGE_DIR`가 절대 경로)를 쓰면 PDF 추출 캐시는 Google Drive가 아닌 프로젝트 `data/knowledge-cache/`에 저장됩니다.

---

## Google Drive PDF 연결 (Windows)

출입국·비자 관련 PDF를 Google Drive에만 두고, **복사 없이** Auto_blog RAG에 연결하는 방법입니다.

### 사전 준비: Google Drive for Desktop 설치

1. [Google Drive for Desktop](https://www.google.com/drive/download/) 설치 후 Google 계정으로 로그인합니다.
2. 작업 표시줄(시스템 트레이)의 Drive 아이콘 → **설정(톱니바퀴)** → **환경설정**에서 동기화 방식을 확인합니다.
   - **미러링**: PC에 `G:\My Drive\...` 같은 드라이브 문자로 표시되는 경우가 많습니다.
   - **스트리밍**: `C:\Users\본인계정\Google Drive\...` 아래에 폴더가 보일 수 있습니다.
3. 탐색기에서 출입국 PDF가 들어 있는 폴더를 열고, 주소창의 **전체 경로**를 복사해 둡니다.

경로 예시 (PC마다 다름):

| 동기화 방식 | 예시 경로 |
|------------|-----------|
| 미러링 (G: 드라이브) | `G:\My Drive\출입국` |
| 미러링 | `G:\My Drive\비자자료` |
| 스트리밍 | `C:\Users\kwj82\Google Drive\출입국` |
| 스트리밍 | `C:\Users\kwj82\My Drive\출입국` |

폴더 안에 `.pdf` 파일이 보이면 준비 완료입니다.

---

### 방법 A — `KNOWLEDGE_DIR`에 Drive 로컬 경로 지정 (권장)

파일을 프로젝트로 복사하지 않고, `.env`만 수정합니다.

1. 프로젝트 루트의 `.env` 파일을 엽니다.
2. 아래처럼 **탐색기에서 복사한 실제 경로**로 설정합니다.

```env
KNOWLEDGE_DIR=G:\My Drive\출입국
KNOWLEDGE_ENABLED=true
KNOWLEDGE_MAX_CHUNKS=5
```

3. 경로에 공백이 있어도 따옴표 없이 그대로 씁니다 (`My Drive` 등).
4. 저장 후 `npm run run:once`로 글을 생성해 봅니다.
5. 콘솔에 `[Knowledge] PDF N개 로드` 또는 관련 구간 주입 로그가 나오면 연결된 것입니다. PDF가 없으면 `PDF 없음` 안내가 나옵니다.

---

### 방법 B — 심볼릭 링크(정션)로 `knowledge/` 폴더 연결

`.env`를 바꾸지 않고 기본 `knowledge/` 이름을 쓰고 싶을 때입니다. **관리자 권한** PowerShell이 필요할 수 있습니다.

1. 기존 `knowledge/` 폴더에 로컬 PDF가 있다면 다른 이름으로 옮깁니다 (예: `knowledge-local`).
2. **관리자 권한**으로 PowerShell을 엽니다.
3. 프로젝트 루트로 이동한 뒤 정션을 만듭니다 (`G:\My Drive\출입국`은 본인 경로로 바꿉니다).

```powershell
cd C:\Users\kwj82\Documents\Auto_blog
cmd /c mklink /J knowledge "G:\My Drive\출입국"
```

4. `.env`에서는 `KNOWLEDGE_DIR`를 비우거나 기본값을 유지합니다.

```env
# KNOWLEDGE_DIR=knowledge
KNOWLEDGE_ENABLED=true
KNOWLEDGE_MAX_CHUNKS=5
```

5. `knowledge\` 아래에 Drive의 PDF가 보이면 성공입니다. 캐시는 `knowledge\.cache\`에 생성됩니다.

정션 제거(나중에):

```powershell
rmdir C:\Users\kwj82\Documents\Auto_blog\knowledge
```

(`rmdir`은 정션만 제거하고 Google Drive 원본 폴더는 삭제하지 않습니다.)

---

### 방법 A vs B

| | 방법 A (`KNOWLEDGE_DIR`) | 방법 B (정션) |
|--|--------------------------|---------------|
| 설정 | `.env` 한 줄 | PowerShell `mklink` 1회 |
| 캐시 위치 | `data/knowledge-cache/` | `knowledge/.cache/` (Drive 동기화 폴더 안) |
| 권장 | **일반적으로 권장** | `.env` 수정 없이 `knowledge/` 유지하고 싶을 때 |

---

## 동작

- PDF가 없으면 지식 검색을 건너뛰고 기존 Gems 프롬프트만 사용합니다.
- 법조항 번호, 금액, 기한 등 **구체적 사실은 PDF에서 추출한 내용만** 사용하도록 LLM에 지시합니다.
- 추출 텍스트는 캐시에 저장되어 PDF가 수정될 때만 재추출합니다.

## 문제 해결

- **경로를 찾을 수 없음**: 탐색기 주소창 경로와 `.env`의 `KNOWLEDGE_DIR`가 정확히 같은지 확인합니다. 드라이브 문자(`G:`)와 `My Drive` vs `Google Drive` 철자를 맞춥니다.
- **PDF 없음**: 해당 폴더에 `.pdf` 확장자 파일만 인식합니다. 하위 폴더는 스캔하지 않으므로 PDF는 지정한 폴더 **바로 아래**에 두세요.
- **Drive 오프라인**: 스트리밍 모드에서는 파일을 한 번 열어 로컬에 내려받거나, 해당 폴더를 «오프라인 사용 가능»으로 표시하세요.
