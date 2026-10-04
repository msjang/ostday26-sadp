# D2Coding — 한글 고정폭 글꼴

macOS·Windows 에 **한글 고정폭 기본 글꼴이 없습니다.** 그래서 코드 블록에
한글이 섞이면 라틴만 고정폭으로 잡히고 한글은 가변폭으로 떨어져 열이 어긋납니다.
그걸 막으려고 글꼴을 덱에 같이 넣습니다 — 발표장 PC 에서도 그대로 나옵니다.

| 파일 | 크기 | 내용 |
|---|---|---|
| `D2Coding-Regular.woff2` | 337 KB | 라틴 + **현대 한글 음절 전체**(U+AC00–D7A3) + 기호·화살표·괘선 |
| `D2Coding-Bold.woff2` | 351 KB | 같은 범위의 Bold |

원본은 26,190 자(CJK 한자 포함)라 4 MB 였습니다. 쓰는 범위만 남겨 서브셋했습니다.

## 다시 만들려면

```sh
brew install --cask font-d2coding
pip3 install fonttools brotli

python3 -c "
from fontTools.ttLib import TTCollection
t=TTCollection('$HOME/Library/Fonts/D2Coding-Ver1.4.0-20261003.ttc')
t.fonts[0].save('/tmp/D2Coding-Regular.ttf'); t.fonts[1].save('/tmp/D2Coding-Bold.ttf')"

U='U+0020-007E,U+00A0-00FF,U+2010-205E,U+2070-209F,U+20A0-20BF,U+2100-214F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+2460-24FF,U+2500-257F,U+25A0-25FF,U+2600-26FF,U+2700-27BF,U+3000-303F,U+3130-318F,U+AC00-D7A3,U+FF01-FF60'
for n in Regular Bold; do
  pyftsubset /tmp/D2Coding-$n.ttf --unicodes="$U" --flavor=woff2 \
    --layout-features='*' --no-hinting --desubroutinize \
    --output-file=fonts/D2Coding-$n.woff2
done
```

## CDN 으로 바꾸고 싶다면

한 줄로 끝나긴 합니다.

```html
<link href="https://cdn.jsdelivr.net/gh/joungkyun/font-d2coding/d2coding.css" rel="stylesheet">
<!-- 또는 비슷한 한글 고정폭: Nanum Gothic Coding (Google Fonts) -->
<link href="https://fonts.googleapis.com/css2?family=Nanum+Gothic+Coding&display=swap" rel="stylesheet">
```

**그래도 로컬을 권합니다.** 「발표장 인터넷 됨」과 「발표 중에 폰트가 제때 내려옴」은
다릅니다 — 행사장 와이파이는 사람이 몰리면 느려지고, `font-display:swap` 이라
늦게 도착하면 **첫 몇 초간 틀어진 채로** 보입니다. 688 KB 면 그 위험을 살 이유가 없습니다.
`file://` 로 열어도 그대로 나오는 것도 확인했습니다.

## 라이선스

SIL Open Font License 1.1 — `OFL.txt` 참조.
Copyright (c) 2015, NAVER Corporation, with Reserved Font Name D2Coding.
<https://github.com/naver/d2codingfont>
