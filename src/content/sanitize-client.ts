/**
 * 본문에서 실명·가명·개인 호칭을 '의뢰인'으로 정리합니다.
 * (강운준 행정사 등 사무소 명칭은 유지)
 */
export function sanitizeClientReferences(html: string): string {
  let text = html;

  // 가명·실명 패턴 (김씨, 이○○님, 박모씨 등)
  text = text.replace(
    /[김이박최정강조윤장임한오서신권황안송류전홍고문양손배조백허유남심노정하곽성차주우구신임나전민][○〇O]{1,2}(?:씨|님)/g,
    "의뢰인",
  );
  text = text.replace(
    /[김이박최정강조윤장임한오서신권황안송류전홍고문양손배조백허유남심노정하곽성차주우구신임나전민][가-힣]{1,2}(?:씨|님)/g,
    (match) => (match.startsWith("강운") ? match : "의뢰인"),
  );

  // 영문 이니셜 가명 (A씨, B님)
  text = text.replace(/\b[A-Z](?:씨|님)\b/g, "의뢰인");

  // 개인 지칭 호칭 → 의뢰인
  text = text.replace(/대표님/g, "의뢰인");
  text = text.replace(/사장님/g, "의뢰인");
  text = text.replace(/고객님/g, "의뢰인");

  // 연속 공백 정리
  text = text.replace(/의뢰인(?:은|이|을|의|과|와|께서|에게|한테)\s+의뢰인/g, "의뢰인");

  return text;
}
