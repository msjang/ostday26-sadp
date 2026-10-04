# AI 시대, 빠르고 안전한 앱 프로토타입
### 섀도우 IT를 양지로 올리는 법

**출연연 오픈소스 테크데이 2026** · 2026. 10. 7. · 장민석 (KISTI 과학기술연구망센터)

▶ **<https://msjang.github.io/ostday26-sadp/>**

---

AI 코딩 도구로 비전공 직원이 업무 앱을 직접 만드는 건 이미 보편화됐습니다.
그런데 **동료와 공유하려는 순간** 배포·도메인·HTTPS·로그인·접근제어·감사기록이 필요해지고,
대부분 거기서 포기하거나 개인 장비로 내려갑니다. 조직이 모르는 앱이 늘어납니다.

이 발표는 그 앱들을 **금지하는 대신 관리 가능한 형태로 받아들이는** 방법을 다룹니다.

| 부 | 내용 |
|---|---|
| 1부 | 섀도우 IT — 공유폴더와 유즈넷은 왜 사라졌나 |
| 2부 | 비전공자가 하기 쉬운 실수, 그리고 안전하게 운영하는 법 (10가지) |
| 3부 | SADP — 앱을 믿지 않고도 안전하게 굴리는 4개 통제 지점 |
| 4부 | 손잡이 — AI가 쓸 수 있는 접점이 없는 시스템 |
| 5부 | 정책 제안 9가지 |

## 보기

```sh
git clone https://github.com/msjang/ostday26-sadp
cd ostday26-sadp && python3 -m http.server 8000
```

`file://` 로 열어도 됩니다. 글꼴·스타일은 전부 저장소 안에 있습니다
(reveal.js 와 mermaid 만 CDN).

| 키 | 동작 |
|---|---|
| <kbd>S</kbd> | 발표자 노트 |
| <kbd>F</kbd> | 전체 화면 |
| <kbd>O</kbd> | 전체 슬라이드 보기 |
| <kbd>?</kbd> | 단축키 도움말 |

## 구성

```
index.html      슬라이드 본문 (마크다운, <textarea id="deck"> 안)
deck.js         마크다운 → 섹션 분할 · 레이아웃 · chapnav
deck.css        기하 — 색과 글꼴은 themes/ 가 가집니다
themes/         7종 (현재 cobalt)
fonts/          D2Coding — 코드 블록 한글 열 맞춤용 (OFL 1.1)
```

슬라이드 틀은 별도 템플릿에서 왔습니다. 재사용하시려면 그쪽이 편합니다.

## 라이선스

- 발표자료 — **© 2026 장민석 · [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.ko)**
- **제3자 자료**(기관 공지 화면, 신문 기사, 미러 목록 등)는 **비평·인용** 목적으로
  사용했으며 각 권리자에게 저작권이 있습니다
- `fonts/D2Coding-*.woff2` — SIL OFL 1.1, © NAVER Corporation (`fonts/OFL.txt`)
- SADP 코드는 별도 오픈소스 라이선스로 공개합니다
