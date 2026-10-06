(async function () {

  /* ══════════════════════════════════════════════════════════════════════
     pandoc fenced_divs / bracketed spans 전처리
     ══════════════════════════════════════════════════════════════════════
     reveal 의 마크다운은 marked 라서 fenced div 가 없습니다. 그래서 플러그인이
     돌기 전에 :::  울타리를 div 로 바꿔 둡니다.

       ::: columns              → <div class="columns">
       ::: {.column width="35%"}→ <div class="column" style="width:35%">
       ::: {.alert .warn}       → <div class="alert warn">
       ::: notes                → <aside class="notes">   (발표자 메모)
       :::                      → 가장 안쪽 울타리를 닫음

     ⚠ 핵심은 div 태그 앞뒤에 **빈 줄**을 넣는 것입니다. CommonMark 에서
       `<div …>` 는 HTML 블록을 열고 **빈 줄에서 끝납니다**. 빈 줄이 없으면
       닫는 태그까지 전부 raw HTML 로 삼켜져 안쪽 마크다운이 안 먹습니다.
       (`<hr class="rule">` 다음 줄에 `<span>` 을 붙여 쓰면 같은 일이 납니다)  */

  function fenceAttrs(spec) {
    let cls = [], id = '', style = '', extra = '';
    if (/^\{[\s\S]*\}$/.test(spec)) spec = spec.slice(1, -1);
    const re = /([.#]?[A-Za-z_][\w:-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let m;
    while ((m = re.exec(spec))) {
      const key = m[1];
      const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
      if (key[0] === '.')      cls.push(key.slice(1));
      else if (key[0] === '#') id = key.slice(1);
      else if (val === undefined) cls.push(key);              // ::: columns
      else if (key === 'width' || key === 'height') style += key + ':' + val + ';';
      else extra += ' ' + key + '="' + val.replace(/"/g, '&quot;') + '"';
    }
    // ::: notes / ::: aside → 발표자 메모(<aside class="notes">)
    const isNote = cls.includes('notes') || cls.includes('aside');
    if (isNote) cls = ['notes'];
    const tag = isNote ? 'aside' : 'div';
    let open = '<' + tag;
    if (cls.length) open += ' class="' + cls.join(' ') + '"';
    if (id)         open += ' id="' + id + '"';
    if (style)      open += ' style="' + style + '"';
    return { open: open + extra + '>', close: '</' + tag + '>' };
  }

  function fencedDivs(src) {
    const out = [], stack = [];
    let inCode = false;
    for (const line of src.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; out.push(line); continue; }
      const m = inCode ? null : line.match(/^\s*(:{3,})\s*(.*?)\s*$/);
      if (!m) { out.push(line); continue; }
      if (!m[2]) {                                   // 닫는 울타리
        if (stack.length) out.push('', stack.pop(), '');
        else out.push(line);
      } else {                                       // 여는 울타리
        const a = fenceAttrs(m[2]);
        out.push('', a.open, '');
        stack.push(a.close);
      }
    }
    while (stack.length) out.push('', stack.pop(), '');
    return out.join('\n');
  }

  // [텍스트]{.badge .primary} → <span class="badge primary">텍스트</span>
  // 마크다운 링크 [x](y) 와 안 겹칩니다 — ] 뒤가 { 일 때만 잡습니다.
  // 코드블록과 인라인 코드(`…`) 안은 건드리지 않습니다 — 문법 자체를 예시로
  // 적어 둔 자리까지 변환해 버리면 안 되므로.
  // 내용이 비어도 허용합니다 — []{.fa-solid .fa-link} 처럼 아이콘만 넣는 경우.
  const SPAN_RE = /\[([^\]\n]*)\]\{([^}\n]+)\}/g;
  function spanify(text) {
    return text.replace(SPAN_RE, (all, inner, spec) => {
      const a = fenceAttrs('{' + spec + '}');
      const open = a.open.replace(/^<(?:div|aside)/, '<span');
      return open + inner + '</span>';
    });
  }
  function bracketedSpans(src) {
    let inCode = false;
    return src.split('\n').map(line => {
      if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; return line; }
      if (inCode) return line;
      return line.split(/(`+[^`]*`+)/).map((p, i) => i % 2 ? p : spanify(p)).join('');
    }).join('\n');
  }

  /* ══════════════════════════════════════════════════════════════════════
     마크다운 한 덩이 → <section> 자동 생성
     ══════════════════════════════════════════════════════════════════════
     `## ` 하나가 슬라이드 하나, `# ` 은 부(部) 간지.
     제목 뒤 중괄호가 섹션 속성이 됩니다 — pandoc/Quarto 와 같은 자리:

       ## 제목 {.center .dense1}        → <section class="center dense1">
       ## 제목 {#id}                    → <section id="id">
       # 1부 {background-image="x.png"} → data-background-image 로 자동 변환
       # 1부 {chap="1 배경"}            → data-chap (안 주면 제목이 들어감)

     reveal 기본 data-separator 로는 안 됩니다 — 구분자 줄을 소비해 버려서
     제목이 사라집니다. 그래서 여기서 직접 자릅니다.
     `#deck` 이 없으면 아무 일도 안 합니다 — <section> 직접 쓰는 방식도 그대로. */

  function headAttrs(raw) {
    // ⚠ (.+) 로 쓰면 greedy 라 제목 안의 `{.fit}` 같은 인라인 코드부터 먹습니다.
    //   중괄호를 포함하지 않는 [^{}]+ 로 해야 **맨 끝** 중괄호만 잡힙니다.
    const m = raw.match(/^(.*?)\s*\{([^{}]+)\}\s*$/);
    const out = { title: m ? m[1] : raw, cls: [], id: '', attr: {} };
    if (!m) return out;
    const re = /([.#]?[A-Za-z_][\w:-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let t;
    while ((t = re.exec(m[2]))) {
      const key = t[1];
      const val = t[2] !== undefined ? t[2] : t[3] !== undefined ? t[3] : t[4];
      if (key[0] === '.')          out.cls.push(key.slice(1));
      else if (key[0] === '#')     out.id = key.slice(1);
      else if (val === undefined)  out.cls.push(key);
      else if (/^data-/.test(key)) out.attr[key] = val;
      else if (/^background/.test(key)) out.attr['data-' + key] = val;   // background-image → data-…
      else if (key === 'chap')     out.attr['data-chap']  = val;
      else if (key === 'short')    out.attr['data-short'] = val;   // chapnav 라벨
      else                         out.attr[key] = val;
    }
    return out;
  }

  // data-chap 등 속성에 쓸 값은 엔티티를 풀어 둔다 (&amp; → &)
  const _dec = document.createElement('textarea');
  const decodeEnt = s => { _dec.innerHTML = s; return _dec.value; };

  // 어떤 제목 레벨이 슬라이드를 가르는가 (기본 # = 간지, ## = 슬라이드)
  const LV_SEC   = DECK.sectionLevel || 1;
  const LV_SLIDE = DECK.slideLevel   || 2;

  function buildDeck(md) {
    const slidesEl = document.querySelector('.reveal .slides');
    const chunks = [];
    let cur = null, inCode = false, dropped = 0;
    for (const line of md.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
      const h = inCode ? null : line.match(/^(#{1,6})\s+(.+?)\s*$/);
      const lv = h ? h[1].length : 0;
      // 지정한 두 레벨만 슬라이드를 가릅니다. 나머지(###…)는 슬라이드 안 소제목.
      if (lv === LV_SEC || lv === LV_SLIDE) chunks.push(cur = { level: lv, head: h[2], body: [] });
      else if (cur) cur.body.push(line);
      else if (line.trim()) dropped++;
    }
    if (dropped) console.warn('[deck] 첫 제목(# 또는 ##) 앞의 내용 ' + dropped + '줄은 버려집니다.');
    if (!chunks.length) return false;

    slidesEl.textContent = '';
    for (const c of chunks) {
      const a = headAttrs(c.head);
      const sec = document.createElement('section');
      const isCover = a.cls.includes('cover');
      if (c.level === LV_SEC) {
        a.cls.push('bare');
        if (!isCover) a.cls.push('divider');     // 표지가 아니면 짙은 간지로
      }
      // 배경색은 여기서 칠하지 않습니다. reveal 이 섹션의 class 를
      // .slide-background 로 복사하므로 deck.css 가 .divider 를 보고 칠합니다.
      // 그래야 테마가 색을 가질 수 있고, {.divider} 를 직접 쓴 ## 슬라이드도
      // 똑같이 칠해집니다(흰 글씨인데 배경이 흰 사고를 막음).
      // chapnav 등록 규칙:
      //   · 간지(LV_SEC)는 기본 등록 · {.chapter} 는 레벨 무관 강제 등록
      //   · {.cover} / {.nochap} 은 제외
      //   · 라벨은 short="짧게" 가 있으면 그걸, 없으면 제목 전체
      const inNav = (c.level === LV_SEC || a.cls.includes('chapter'))
                 && !isCover && !a.cls.includes('nochap');
      if (inNav && !a.attr['data-chap'])
        a.attr['data-chap'] = decodeEnt(a.attr['data-short'] || a.title);
      if (a.cls.length) sec.className = a.cls.join(' ');
      if (a.id) sec.id = a.id;
      for (const k in a.attr) sec.setAttribute(k, a.attr[k]);

      const holder = document.createElement('div');
      holder.setAttribute('data-markdown', '');
      const ta = document.createElement('textarea');
      ta.setAttribute('data-template', '');
      // 제목 줄은 중괄호만 떼고 그대로 둔다 → marked 가 h1/h2 로 렌더
      ta.textContent = '#'.repeat(c.level) + ' ' + a.title + '\n' + c.body.join('\n');
      holder.appendChild(ta);
      sec.appendChild(holder);
      slidesEl.appendChild(sec);
    }
    return true;
  }

  const deckSrc = document.querySelector('#deck');
  if (deckSrc) {
    let md = deckSrc.value !== undefined ? deckSrc.value : deckSrc.textContent;
    const ext = deckSrc.dataset.src;
    if (ext) {
      // file:// 에서는 CORS 로 막힙니다 — 로컬 서버가 필요합니다.
      try { md = await fetch(ext).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }); }
      catch (e) { console.error('[deck] ' + ext + ' 를 못 읽었습니다 (' + e.message + '). 인라인 내용으로 대체합니다. file:// 이면 로컬 서버로 여세요.'); }
    }
    buildDeck(md);
  }

  document.querySelectorAll('[data-markdown]').forEach(el => {
    const tpl = el.querySelector('[data-template]') || el.querySelector('script') || el;
    tpl.textContent = bracketedSpans(fencedDivs(tpl.textContent));
  });

  /* ══════════════════════════════════════════════════════════════════════
     chapnav / footer / 종이판 / 세로정렬
     ══════════════════════════════════════════════════════════════════════ */
  const slidesEl = document.querySelector('.reveal .slides');
  const sections = [...slidesEl.querySelectorAll(':scope > section')];
  const isPrint  = /print-pdf/i.test(location.search);
  const m        = DECK.meta;
  const FOOTER_H = parseFloat(getComputedStyle(document.documentElement)
                    .getPropertyValue('--footer-h')) || 40;

  const chapters = sections
    .map((s, i) => s.dataset.chap ? { title: s.dataset.chap, index: i } : null)
    .filter(Boolean);

  const isBare = s => s.classList.contains('bare')
                   || !!s.dataset.backgroundColor || !!s.dataset.backgroundImage;

  // reveal 전역 center 는 끄고 슬라이드마다 .center 를 직접 붙인다.
  // 그래야 '전역 top + 이 슬라이드만 center' 와 그 반대가 둘 다 된다.
  // (reveal 소스: A.center || t.classList.contains("center"))
  if (DECK.valign === 'center')
    sections.forEach(s => { if (!s.classList.contains('top')) s.classList.add('center'); });

  // onto 가 .slides 면 화면용(한 벌), .pdf-page 면 인쇄용(쪽마다 한 벌).
  function makeBars(onto) {
    const b = { nav: null, foot: null, paper: null, ref: null, links: [] };
    if (DECK.paper && !isPrint) {                 // 인쇄에선 종이=용지 자체
      b.paper = document.createElement('div');
      b.paper.className = 'deck-paper';
      onto.prepend(b.paper);
    }
    if (DECK.chapnav && chapters.length) {
      b.nav = document.createElement('nav');
      b.nav.className = 'chapnav';
      // 제목을 누르면 첫 장으로. chapnav 링크와 같은 방식(href="#/n")이라
      // reveal 의 a[href^="#"] 처리기가 알아서 이동시킵니다.
      b.nav.innerHTML = '<a class="deck-title" href="#/0"></a>';
      b.nav.firstChild.textContent = m.title;
      chapters.forEach(c => {
        const a = document.createElement('a');
        // ⚠ href="#" 를 쓰면 안 됩니다. reveal 이 document 레벨에서
        //   a[href^="#"] 를 가로채 getIndicesFromHash("#") → 0번으로 보냅니다.
        //   우리 쪽 preventDefault 는 전파를 막지 않아 뒤이어 덮어씁니다.
        //   실제 인덱스를 href 에 넣으면 reveal 이 알아서 맞게 이동합니다.
        a.href = '#/' + c.index;
        a.textContent = c.title;
        b.nav.appendChild(a);
        b.links.push(a);          // 제목 앵커와 섞이지 않게 따로 들고 있는다
      });
      onto.appendChild(b.nav);
    }
    // ::: ref 오버레이 — 섹션이 아니라 슬라이드 박스에 붙습니다.
    // 그래야 본문이 아무리 길어도 늘 footer 바로 위입니다.
    b.ref = document.createElement('div');
    b.ref.className = 'deckref';
    onto.appendChild(b.ref);

    if (DECK.footer) {
      b.foot = document.createElement('div');
      b.foot.className = 'deckfoot';
      b.foot.innerHTML = '<span></span><span class="pageno"></span>';
      b.foot.firstChild.textContent = [m.title, m.event, m.date, m.speaker].filter(Boolean).join(' · ');
      onto.appendChild(b.foot);
    }
    return b;
  }

  /* ── {.fit} 넘치면 글자 줄이기 ──────────────────────────────────────
     reveal 에는 이 기능이 없습니다 (.r-fit-text 는 반대로 키우는 것).
     보이는 상태에서만 잴 수 있으므로 화면은 slidechanged, 인쇄는 pdf-ready
     에서 각각 호출합니다. 멱등 — 매번 초기화하고 다시 잽니다.
     인쇄 쪽 수가 늘어나지 않도록 pdfMaxPagesPerSlide:1 과 짝입니다.      */
  const cssPx = n => parseFloat(getComputedStyle(document.documentElement)
                        .getPropertyValue(n)) || 0;

  function autoFit(sec) {
    if (!sec || !sec.classList.contains('fit')) return;
    sec.style.removeProperty('--fs-base');
    sec.style.removeProperty('--media-max-h');
    // 글자만 줄이면 그림이 버팁니다 — 그림 상한도 같은 비율로 내립니다.
    const cap = SLIDE_H - cssPx('--deck-pad-top') - cssPx('--deck-pad-bottom') - 120;
    // 테마가 --fs-base 를 바꿨을 수 있으므로(예: solarized 는 .84) 현재 값에서 시작
    const base = parseFloat(getComputedStyle(sec).getPropertyValue('--fs-base')) || .80;
    const apply = k => {
      sec.style.setProperty('--fs-base', (base * k).toFixed(3));
      sec.style.setProperty('--media-max-h', Math.round(cap * k) + 'px');
    };
    let scale = 1;
    while (scale > 0.5 && sec.scrollHeight > SLIDE_H) { scale -= 0.04; apply(scale); }
    // 4% 단위로 내려오면 필요 이상으로 줄어듭니다. 1% 씩 되감아 들어가는
    // 최대치를 찾습니다 — 안 그러면 그림이 괜히 작아지고 아래가 비어 보입니다.
    if (scale < 1) {
      while (scale < 0.999) {
        apply(Math.min(scale + 0.01, 1));
        if (sec.scrollHeight > SLIDE_H) { apply(scale); break; }
        scale = Math.min(scale + 0.01, 1);
      }
    }
    if (scale < 1) {
      const h = sec.querySelector('h1,h2');
      console.info('[deck] .fit — "' + (h ? h.textContent.trim() : '?') + '" 를 '
                   + Math.round(scale * 100) + '% 로 줄였습니다.');
    }
  }

  /* ── {::: ref} 자리 비우기 ──────────────────────────────────────────
     .ref 는 absolute 라 본문 흐름에서 빠집니다. 글자는 안 겹쳐 보여도
     박스는 겹치고, 본문이 조금만 길어지면 실제로 깔립니다.
     ref 높이를 재서 섹션 아래 패딩으로 돌려줍니다.
     ⚠ 인쇄용 padding 규칙이 !important 라 인라인도 important 로 써야 이깁니다. */
  // ref 가 차지할 자리를 섹션 **흐름 안에** 비워 둡니다.
  // 실측(이 덱 기준): 스페이서를 끄면 ref 있는 슬라이드 5장 중 4장이
  // 10~45px 씩 ref 밴드를 침범합니다. .fit 이 이 높이까지 포함해 줄여야 맞습니다.
  // ⚠ 예전엔 padding-bottom 을 줬는데, 인쇄에서 reveal 이 섹션을
  //   position:absolute!important 로 바꾸는 탓에 Chrome 인쇄 파이프라인이
  //   그 섹션 본문을 통째로 안 그리는 일이 있었습니다(화면은 멀쩡).
  //   빈 블록을 하나 넣는 쪽이 평범한 흐름이라 양쪽에서 똑같이 동작합니다.
  function reserveRef(sec, bars) {
    sec.style.removeProperty('padding-bottom');          // 옛 방식 흔적 제거
    let sp = sec.querySelector(':scope > .ref-spacer');
    const has = bars && bars.ref && bars.ref.firstChild;
    if (!has) { if (sp) sp.remove(); return; }
    if (!sp) {
      sp = document.createElement('div');
      sp.className = 'ref-spacer';
      sec.appendChild(sp);
    }
    // ⚠ 「ref 높이만큼」 비우면 과하게 잡힙니다. 두 기준선이 다르기 때문입니다 —
    //   ref 는 슬라이드 바닥에서 lift(=CSS 의 bottom) 만큼 떠 있고, 섹션 내용은
    //   --deck-pad-bottom 위에서 끝납니다. 필요한 건 그 차이만큼 보정한 값입니다:
    //       spacer ≥ ref높이 + lift − 패딩 + 숨통
    //   ⚠ 섹션 높이로 계산하면 안 됩니다. 스페이서가 섹션 높이에 들어가므로
    //     「넓혔더니 더 필요해지는」 되먹임이 생깁니다(실측 327px 까지 발산).
    //     ref 는 섹션 바깥(슬라이드 박스)에 있어 본문 길이와 무관 — 그래서 안정적입니다.
    // 마지막으로 보이는 블록의 아래 여백은 **죽은 공간**입니다. 아래는 패딩뿐이라
    // 아무것도 밀어내지 않는데, 스페이서가 그걸 모르고 또 잡습니다 — 이중 예약.
    // 실측(8쪽): 문단 margin-bottom 48px 이 그림과 스페이서 사이에 놀고 있었음.
    // ⚠ 스페이서에서 빼는 방식은 안 됩니다. 여백은 em 이라 {.fit} 배율을 타는데
    //   예약은 고정값이라, 많이 줄어든 슬라이드에서 거꾸로 모자라집니다.
    //   여백 자체를 없애는 쪽이 배율과 무관합니다.
    const kids = [].slice.call(sec.querySelectorAll(':scope > [data-markdown] > *'))
      .filter(el => el.offsetHeight);                 // .ref / aside.notes 는 display:none
    const last = kids[kids.length - 1];
    if (last) last.style.marginBottom = '0';

    const h = bars.ref.offsetHeight;
    const box = bars.ref.offsetParent;                      // .slides 또는 .pdf-page
    const lift = (box ? box.clientHeight : SLIDE_H) - (bars.ref.offsetTop + h);
    const need = h + lift - cssPx('--deck-pad-bottom') + 8;
    sp.style.height = Math.max(0, Math.round(need)) + 'px';
  }

  /* ── 그림 캡션 (pandoc 의 implicit_figures) ──────────────────────────
     문단에 **그림 하나만** 있으면 figure 로 감싸고 alt 를 캡션으로 씁니다.

       ![1994년 유입 경로](diagram.svg)   → <figure><img><figcaption>…
       ![](diagram.svg)                    → 캡션 없음 (alt 를 비우면 됨)

     marked 에는 이 규칙이 없어서(그냥 <p><img>) 파싱 뒤에 다시 감쌉니다.
     ⚠ 캡션은 alt 속성이라 **평문**입니다 — 굵게·링크 같은 건 안 들어갑니다. */
  /* 잘못 쓰기 쉬운 이름을 콘솔로 알려 줍니다.
     ::: note ↔ ::: notes 는 한 글자 차이인데 뜻이 정반대입니다
     (보이는 상자 ↔ 안 보이는 발표자 메모). 조용히 아무 일도 안 일어나는 게
     제일 나쁘므로 집어 줍니다. */
  function lintFences(root) {
    const hint = {
      note:  '보이는 상자는 ::: {.callout .info} 입니다. 발표자 메모는 ::: notes (s 가 붙습니다).',
      alert: '이름이 .callout 으로 바뀌었습니다 — ::: {.callout .warn} 처럼 쓰세요.',
    };
    for (const k in hint) {
      const n = root.querySelectorAll('.slides .' + k + ':not(.callout)').length;
      if (n) console.warn('[deck] ::: ' + k + ' ' + n + '개 — ' + hint[k]);
    }
  }

  /* 외부 링크는 새 탭으로. 발표 중에 링크를 눌렀다가 덱이 통째로 날아가면
     돌아올 방법이 없습니다. 내부 이동(#/3 · chapnav)은 그대로 둡니다.
     rel 은 opener 를 못 잡게 — 최신 브라우저는 target=_blank 에 기본 적용이지만
     구형에서도 막습니다. */
  function externalLinks(root) {
    root.querySelectorAll('.slides a[href^="http"]').forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

  function buildFigures(root) {
    root.querySelectorAll('.slides p > img:only-child').forEach(img => {
      const p = img.parentElement;
      // ![alt](x.png){.cap .noborder} — marked 는 이미지 속성을 모르므로
      // 중괄호가 그림 뒤에 **글자로** 남습니다. 그걸 여기서 걷어 씁니다.
      const txt = p.textContent.trim();
      const m = txt.match(/^\{([^}]*)\}$/);
      if (txt && !m) return;                   // 그림 말고 진짜 글도 있으면 그대로
      let showCap = false;
      if (m) {
        [...p.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); });
        m[1].trim().split(/\s+/).forEach(t => {
          if (!t.startsWith('.')) return;
          const c = t.slice(1);
          if (c === 'cap') showCap = true; else img.classList.add(c);
        });
      }
      const cap = (img.getAttribute('alt') || '').trim();
      if (!showCap || !cap) return;            // 캡션은 {.cap} 일 때만. alt 는 남는다
      const fig = document.createElement('figure');
      p.replaceWith(fig);
      fig.appendChild(img);
      const fc = document.createElement('figcaption');
      fc.textContent = cap;
      fig.appendChild(fc);
    });
  }

  /* 그림·글꼴이 아직 안 올라왔으면 높이를 잘못 잽니다.
     .fit 과 ::: ref 자리 계산이 둘 다 높이에 기대므로 기다렸다 다시 잽니다. */
  function whenMeasurable(sec, cb) {
    cb();                                   // 일단 한 번 (대개 이걸로 끝)
    const pending = [...sec.querySelectorAll('img')].filter(i => !i.complete);
    let left = pending.length;
    const done = () => { if (--left <= 0) cb(); };
    pending.forEach(i => {
      i.addEventListener('load',  done, { once: true });
      i.addEventListener('error', done, { once: true });
    });
    if (document.fonts && document.fonts.status !== 'loaded')
      document.fonts.ready.then(cb);
  }

  // paint 가 ref 오버레이를 먼저 채우고, 그 높이로 섹션 아래를 비운 뒤 fit.
  // 오버레이는 섹션 바깥이라 fit 으로 글자를 줄여도 높이가 안 변합니다 —
  // 예전처럼 「패딩 추가 → 다시 넘침 → 또 줄임」 순환이 생기지 않습니다.
  const measure = (sec, bars) => { reserveRef(sec, bars); autoFit(sec); };

  function paint(b, i) {
    const sec  = sections[i];
    const bare = isBare(sec);
    if (b.paper) b.paper.style.display = bare ? 'none' : '';
    if (b.nav)   b.nav.style.display   = bare ? 'none' : '';
    if (b.foot)  b.foot.style.display  = bare ? 'none' : '';
    if (b.ref) {
      const src = sec.querySelector('.ref');
      b.ref.innerHTML = src ? src.innerHTML : '';
      b.ref.style.display = src ? '' : 'none';
      b.ref.classList.toggle('on-divider', sec.classList.contains('divider'));
      // 간지·표지는 footer 가 없으므로 ref 를 그 자리까지 내린다
      b.ref.style.bottom = bare ? '24px' : '';
    }
    if (b.nav) {
      let active = -1;
      chapters.forEach((c, k) => { if (c.index <= i) active = k; });
      // ⚠ nav.querySelectorAll('a') 로 잡으면 안 됩니다 — 제목도 <a> 라서
      //   인덱스가 한 칸 밀리고 활성 표시가 제목에 찍힙니다.
      b.links.forEach((a, k) => a.classList.toggle('on', k === active));
    }
    // 쪽번호는 '보이는 장' 기준입니다. 짧은 모드로 .skip 을 숨기면
    // 76 중 35 가 아니라 66 중 32 로 세야 남은 분량 감각이 맞습니다.
    if (b.foot) {
      const vis = sections.filter(s => s.parentNode);   // 짧은 모드에선 뗀 장이 빠집니다
      const k = vis.indexOf(sec);
      b.foot.querySelector('.pageno').textContent =
        (k < 0 ? i + 1 : k + 1) + ' / ' + vis.length;
    }
  }

  const live = isPrint ? null : makeBars(slidesEl);
  let onSlideForTimer = null;          // makeTimer 가 채웁니다 (장별 시계 리셋)
  const sync = () => {
    const cur = Reveal.getCurrentSlide();
    if (!cur) return;
    const i = sections.indexOf(cur);
    if (live) paint(live, i);
    if (onSlideForTimer) onSlideForTimer();
    whenMeasurable(cur, () => measure(cur, live));
  };

  // 인쇄 경로: reveal 이 슬라이드를 .pdf-page(position:relative) 로 감싸므로
  // 쪽마다 바를 새로 꽂아야 한다. 화면용 한 벌로는 첫 쪽에만 찍힌다.
  function decoratePdfPages() {
    document.querySelectorAll('.pdf-page').forEach(pg => {
      const sec = pg.querySelector('section');
      const i = sections.indexOf(sec);
      if (i < 0) return;
      const bars = makeBars(pg);
      paint(bars, i);
      whenMeasurable(sec, () => measure(sec, bars));
    });
  }

  /* ── 좌하단 도구 바구니 ───────────────────────────────────────────
     짧은 모드 버튼과 타이머가 나란히 들어갑니다. .slides 가 아니라
     .reveal 에 답니다 — .slides 는 확대/축소가 걸려 있고 인쇄 때 쪽마다
     복제됩니다. .reveal 은 transform 이 없어 fixed 가 화면 기준입니다.   */
  let _tools = null;
  function tools() {
    if (!_tools) {
      _tools = document.createElement('div');
      _tools.className = 'deck-tools';
      document.querySelector('.reveal').appendChild(_tools);
    }
    return _tools;
  }

  /* ── 짧은 모드 ────────────────────────────────────────────────────
     {.skip} 장을 덱에서 빼 버립니다. 회색 제목은 '이 장은 버려도 된다'는
     상태만 말할 뿐 넘기라는 지시가 아니어서, 눈으로 보고도 입이 먼저
     나갑니다. 참는 대신 없애는 쪽이 확실합니다.

     ⚠ data-visibility="hidden" 로는 안 됩니다. reveal 은 그 속성을
       초기화 때 한 번만 읽고, Reveal.sync() 는 다시 읽지 않습니다.
       런타임에 붙여 봐야 getTotalSlides() 도 탐색 순서도 그대로입니다.
       그래서 섹션을 **DOM 에서 실제로 떼었다 다시 꽂습니다.**
       되돌릴 때 자리를 찾으려고 원본 순서(sections)를 그대로 들고 있습니다. */
  function makeShortMode() {
    if (isPrint) return;
    const skips = sections.filter(s => s.classList.contains('skip'));
    if (!skips.length) return;
    const KEY = 'deck-short:' + location.pathname;

    const btn = document.createElement('button');
    btn.className = 'deck-short';
    btn.type = 'button';
    btn.title = '짧은 모드 — 회색 제목 ' + skips.length + '장을 덱에서 뺍니다 (단축키 K)';
    tools().prepend(btn);          // 시계 왼쪽

    let on = false;
    try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}

    const inDom = s => !!s.parentNode;

    function apply() {
      // 지금 보고 있는 장을 기억해 둡니다. 떼고 붙이면 reveal 의 현재 장
      // 포인터가 떨어진 섹션을 가리켜 화면이 비므로, 끝나고 반드시 다시
      // 앉혀야 합니다. 새로고침으로 짧은 모드에 들어올 때도 같은 일이 납니다.
      const cur = Reveal.getCurrentSlide();
      const curIdx = cur ? sections.indexOf(cur) : 0;

      if (on) {
        skips.forEach(s => { if (inDom(s)) s.parentNode.removeChild(s); });
      } else {
        // 원본 순서대로, 뒤쪽에서 아직 붙어 있는 첫 섹션 앞에 꽂습니다
        sections.forEach((s, i) => {
          if (inDom(s)) return;
          const after = sections.slice(i + 1).find(inDom);
          slidesEl.insertBefore(s, after || null);
        });
      }

      btn.classList.toggle('on', on);
      btn.textContent = on ? '짧은 모드' : '전체';
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}

      Reveal.sync();

      // 보고 있던 장이 남아 있으면 그대로, 떨어졌으면 바로 다음 장으로.
      // (끝에서 떨어졌으면 앞으로 되돌아갑니다)
      const vis  = sections.filter(inDom);
      const seat = (cur && inDom(cur)) ? cur
                 : sections.slice(curIdx + 1).find(inDom)
                || sections.slice(0, curIdx).reverse().find(inDom);
      if (seat) Reveal.slide(vis.indexOf(seat));

      Reveal.layout();
      sync();
    }
    function toggle() { on = !on; apply(); }

    btn.addEventListener('click', toggle);
    document.addEventListener('keydown', e => {
      if (e.key !== 'k' && e.key !== 'K') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault(); toggle();
    });

    // 첫 그림은 reveal 이 준비된 뒤에 — sync()/Reveal.slide 가 필요합니다
    Reveal.on('ready', () => apply());
  }

  /* ── 남은 시간 타이머 ─────────────────────────────────────────────
     좌하단 버튼. 누르면 DECK.timer 분에서 거꾸로 떨어집니다.
     한 번 더 누르면 멈추고, 오른쪽 클릭(또는 길게 누르기)이면 처음으로.
     키보드 T 로도 시작·정지합니다.

     ⚠ .slides 가 아니라 .reveal 에 답니다. .slides 는 확대/축소가 걸려 있어
       같이 줄어들고, 인쇄 때 쪽마다 복제됩니다. .reveal 은 transform 이 없어서
       position:fixed 가 화면 기준으로 먹습니다.
     ⚠ 시작 시각을 localStorage 에 둡니다 — 발표 도중 새로고침해도 안 잃습니다.  */
  function makeTimer() {
    const MIN = Number(DECK.timer) || 0;
    if (!MIN || isPrint) return;
    const KEY = 'deck-timer:' + location.pathname;
    const TOTAL = MIN * 60000;

    // 전체 | 이 장 — 한 덩이가 통째로 시작·정지 버튼입니다
    const el = document.createElement('button');
    el.className = 'deck-timer';
    el.type = 'button';
    el.title = '클릭: 시작·정지 · 오른쪽 클릭: 처음으로 · 단축키 T';
    el.innerHTML = '<span class="t-total"></span><span class="t-slide"></span>';
    const elTotal = el.querySelector('.t-total');
    const elSlide = el.querySelector('.t-slide');
    tools().appendChild(el);

    // 장별 시계는 '발표가 돌고 있을 때'만 셉니다. 멈춰 있으면 0:00 —
    // 시작 전에 슬라이드를 넘겨보다가 색이 뜨는 걸 막습니다.
    const SLIDE_WARN = (Number(DECK.slideWarn) || 90) * 1000;
    const SLIDE_OVER = (Number(DECK.slideOver) || 120) * 1000;
    let slideFrom = null;              // 이 장에 들어온 시각
    let slideHeld = 0;                 // 멈춰 있던 동안을 뺀 누적
    const slideSpent = () =>
      slideHeld + (st.startedAt && slideFrom ? Date.now() - slideFrom : 0);

    // {startedAt, elapsed}  — 멈춰 있으면 startedAt 이 null 입니다
    let st = { startedAt: null, elapsed: 0 };
    try { st = JSON.parse(localStorage.getItem(KEY)) || st; } catch (e) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
    const spent = () => st.elapsed + (st.startedAt ? Date.now() - st.startedAt : 0);

    const mmss = ms => {
      const t = Math.max(0, ms);
      return Math.floor(t / 60000) + ':' + String(Math.floor(t % 60000 / 1000)).padStart(2, '0');
    };

    function draw() {
      const left = TOTAL - spent();
      const over = left < 0;
      elTotal.textContent = (over ? '+' : '') + mmss(Math.abs(left));
      elTotal.classList.toggle('warn', !over && left <= 5 * 60000);
      elTotal.classList.toggle('over', over);

      const sp = slideSpent();
      elSlide.textContent = mmss(sp);
      elSlide.classList.toggle('warn', sp >= SLIDE_WARN && sp < SLIDE_OVER);
      elSlide.classList.toggle('over', sp >= SLIDE_OVER);

      el.classList.toggle('running', !!st.startedAt);
    }
    // 슬라이드가 바뀌면 장별 시계만 0 으로. 전체 시계는 안 건드립니다.
    function newSlide() { slideHeld = 0; slideFrom = Date.now(); draw(); }
    function toggle() {
      if (st.startedAt) {                       // 정지 — 멈춘 만큼은 안 셉니다
        st.elapsed = spent(); st.startedAt = null;
        slideHeld = slideSpent(); slideFrom = null;
      } else {                                  // 시작
        st.startedAt = Date.now(); slideFrom = Date.now();
      }
      save(); draw();
    }
    function reset() {
      st = { startedAt: null, elapsed: 0 };
      slideHeld = 0; slideFrom = null;
      save(); draw();
    }
    onSlideForTimer = newSlide;

    el.addEventListener('click', toggle);
    el.addEventListener('contextmenu', e => { e.preventDefault(); reset(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 't' && e.key !== 'T') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault();
      e.shiftKey ? reset() : toggle();
    });
    setInterval(draw, 250);
    draw();
  }
  makeTimer();
  makeShortMode();

  /* ── 슬라이드 비율 ────────────────────────────────────────────────
     reveal 의 width/height 가 곧 슬라이드 좌표계입니다. 여기서 정한 값이
     PDF 쪽 크기(reveal 이 @page 를 주입)와 CSS 의 --slide-h 까지 끌고 갑니다. */
  const RATIOS = { '16:9': [1280, 720], '16:10': [1280, 800], '4:3': [1024, 768] };
  let [SLIDE_W, SLIDE_H] = RATIOS[DECK.ratio] || RATIOS['16:9'];
  if (DECK.ratio === 'full') {                 // 로드 시점 창 크기 = 슬라이드 크기
    SLIDE_W = Math.max(640, window.innerWidth);
    SLIDE_H = Math.max(480, window.innerHeight);
  }
  // 미디어 max-height 가 이 값에서 계산됩니다 (deck.css 의 --content-h)
  document.documentElement.style.setProperty('--slide-h', SLIDE_H + 'px');

  Reveal.initialize({
    hash: true,
    slideNumber: false,          // 쪽번호는 footer 가 그림
    center: false,               // 세로정렬은 위에서 .center 클래스로 제어
    pdfMaxPagesPerSlide: 1,      // 넘쳐도 PDF 를 두 쪽으로 쪼개지 않는다
                                 // (쪼개지는 대신 잘립니다 — {.fit}/{.dense*} 로 맞추세요)
    width: SLIDE_W, height: SLIDE_H,
    margin: DECK.ratio === 'full' ? 0 : 0.04,
    plugins: [RevealMarkdown, RevealNotes],
  }).then(() => {
    buildFigures(document);        // 측정보다 먼저 — 캡션이 높이를 바꿉니다
    externalLinks(document);
    lintFences(document);

    // ?print-pdf 는 initialize().then() 이후에 레이아웃이 끝나고
    // 'pdf-ready' 를 쏜다. 여기서 쪽마다 바를 꽂아야 한다.
    if (isPrint) Reveal.on('pdf-ready', decoratePdfPages);
    else { Reveal.on('slidechanged', sync); sync(); }

    // ── mermaid ───────────────────────────────────────────────────────
    document.querySelectorAll('pre code.mermaid, pre code.language-mermaid').forEach(code => {
      const d = document.createElement('div'); d.className = 'mermaid';
      d.textContent = code.textContent; code.closest('pre').replaceWith(d);
    });
    mermaid.initialize({
      startOnLoad: false, theme: 'default', securityLevel: 'loose', htmlLabels: false,
      fontFamily: '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif',
      flowchart: { htmlLabels: false, curve: 'basis', padding: 8 },
    });

    // 숨겨진 슬라이드는 폭이 0 → 측정 오류. 보일 때 + 폰트 로드 후에 렌더.
    if (isPrint) {
      document.fonts.ready.then(() =>
        mermaid.run({ nodes: document.querySelectorAll('.mermaid:not([data-processed])') })
               .then(() => Reveal.layout()));
    } else {
      const renderVisible = () => {
        const cur = Reveal.getCurrentSlide(); if (!cur) return;
        const nodes = cur.querySelectorAll('.mermaid:not([data-processed])');
        if (nodes.length) document.fonts.ready.then(() =>
          mermaid.run({ nodes }).then(() => Reveal.layout()));
      };
      Reveal.on('ready', renderVisible);
      Reveal.on('slidechanged', renderVisible);
      renderVisible();
    }
  });
})();
