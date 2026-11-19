/* 书架版阅读器 —— 多书支持 */
(function(){
  var LS = 'lexicon-night-v1';
  var $ = function(id){ return document.getElementById(id); };

  /* ---------- state ---------- */
  var st = {
    book: 'lexicon', font: 100, theme: 'day', zhOn: false, marks: true, ind: 1.5, sec: true,
    vocab: {}, pos: {}, ch: 0, y: 0
  };
  try{
    var s = JSON.parse(localStorage.getItem(LS) || '{}');
    Object.keys(st).forEach(function(k){ if(s[k] !== undefined) st[k] = s[k]; });
    if(!st.pos || typeof st.pos !== 'object') st.pos = {};
    // migrate single-book progress
    if(s.ch !== undefined && !st.pos.lexicon) st.pos.lexicon = { ch: s.ch || 0, y: s.y || 0 };
    // migrate vocab flags -> records
    Object.keys(st.vocab).forEach(function(k){
      if(typeof st.vocab[k] === 'number') st.vocab[k] = { tr: '', ph: '' };
    });
  }catch(e){}
  function save(){ try{ localStorage.setItem(LS, JSON.stringify(st)); }catch(e){} }
  function pos(){ return st.pos[st.book] || (st.pos[st.book] = { ch: 0, y: 0 }); }

  /* ---------- book runtime ---------- */
  var BOOK = null, W = [], CH = [], IDX = {}, FORMS = {};
  var CET4 = new Set((window.CET4_WORDS || []).map(function(x){ return String(x).toLowerCase(); }));
  var pendingY = 0;
  var META = window.BOOKS_META || [];
  function metaOf(id){ for(var i=0;i<META.length;i++) if(META[i].id===id) return META[i]; return null; }

  function bindBook(id){
    BOOK = (window.BOOK_DATA || {})[id];
    W = BOOK.words || []; CH = BOOK.chapters || [];
    IDX = {}; W.forEach(function(w, i){ IDX[w.w.toLowerCase()] = i; });
    FORMS = BOOK.forms || {};
    PHR = Object.keys(IDX).filter(function(k){ return k.indexOf(' ') > 0; })
      .sort(function(a, b){ return b.length - a.length; });
    BRE = null;
    document.title = BOOK.title + ' · ' + BOOK.en;
    document.documentElement.style.setProperty('--hr', BOOK.imgRatio || '3/2');
    $('rowMark').style.display = BOOK.hasKey ? '' : 'none';
  }

  var bootEl = $('boot');
  function bootText(t, isErr){
    if(!bootEl) return;
    bootEl.innerHTML = isErr ? '<div class="err">' + t + '</div>' : t;
  }
  function ensureBook(id, cb, attempt){
    attempt = attempt || 0;
    if((window.BOOK_DATA || {})[id]){ bindBook(id); cb(); return; }
    var m = metaOf(id) || { src: 'books/' + id + '.js' };
    var sc = document.createElement('script');
    sc.src = m.src + (attempt ? '?r=' + attempt : '');
    sc.onload = function(){
      if(!(window.BOOK_DATA || {})[id] && attempt < 2){ ensureBook(id, cb, attempt + 1); return; }
      bindBook(id); cb();
    };
    sc.onerror = function(){
      if(attempt < 2){ setTimeout(function(){ ensureBook(id, cb, attempt + 1); }, 600); return; }
      bootText('这本书没能载入。请检查网络后刷新页面。', true);
    };
    document.head.appendChild(sc);
  }

  /* ---------- theme & font ---------- */
  function applyTheme(){
    document.documentElement.setAttribute('data-theme', st.theme);
    document.querySelectorAll('#themeSeg button').forEach(function(b){
      b.classList.toggle('on', b.dataset.theme === st.theme);
    });
    var m = document.querySelector('meta[name=theme-color]');
    if(m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
  }
  function applyFont(){
    document.documentElement.style.setProperty('--fs', (19 * st.font / 100).toFixed(1) + 'px');
    $('fs').value = st.font; $('fsVal').textContent = st.font + '%';
  }
  function applyInd(){
    document.documentElement.style.setProperty('--ind', (+st.ind || 0) + 'em');
    document.querySelectorAll('#indSeg button').forEach(function(b){
      b.classList.toggle('on', String(b.dataset.ind) === String(st.ind));
    });
  }
  function applySec(){
    document.body.classList.toggle('nosec', !st.sec);
    var sw = $('swSec'); if(sw) sw.classList.toggle('on', !!st.sec);
    var row = $('rowSec'); if(row) row.style.display = CET4.size ? '' : 'none';
  }
  function applyMarks(){ document.body.classList.toggle('nomark', !st.marks); }

  /* ---------- text -------- */
  function esc(t){ return String(t).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }

  function resolve(s){
    var k = s.toLowerCase().replace(/’/g, "'").replace(/^[-']+|[-']+$/g, '');
    if(k.length < 2) return null;
    if(IDX[k] !== undefined) return k;
    if(k.length > 2 && k.slice(-2) === "'s"){ var b = k.slice(0, -2); if(IDX[b] !== undefined) return b; }
    if(k.length > 1 && k.slice(-1) === "'"){ var b2 = k.slice(0, -1); if(IDX[b2] !== undefined) return b2; }
    if(FORMS[k] && IDX[FORMS[k]] !== undefined) return FORMS[k];
    return null;
  }

  var PHR = [], BRE = null;
  function tokenize(raw){
    if(!BRE){
      var alts = PHR.map(function(p){ return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
      BRE = new RegExp('(?:' + (alts ? alts + '|' : '') + "[A-Za-z][A-Za-z'’\\-]*)", 'gi');
    }
    var out = '', last = 0, m;
    BRE.lastIndex = 0;
    while((m = BRE.exec(raw))){
      out += esc(raw.slice(last, m.index));
      var word = m[0], key = resolve(word), cls = 'w';
      if(key){ var idx = IDX[key.toLowerCase()]; if(idx !== undefined && W[idx] && W[idx].t === 1) cls = 'w key'; }
      out += key ? '<span class="' + cls + '" data-w="' + esc(key) + '">' + esc(word) + '</span>' : esc(word);
      last = m.index + word.length;
    }
    return out + esc(raw.slice(last));
  }

  /* ---------- render ---------- */
  function chapterHtml(c){
    return c.paras.map(function(p, i){
      var en = BOOK.rawText ? tokenize(p.h || '') : (p.h || '');
      return '<div class="para' + (st.zhOn ? ' open' : '') + '">' +
        '<p class="en' + (i === 0 ? ' p1' : '') + '">' + en + '</p>' +
        '<div class="zh">' + esc(p.z || '') + '</div>' +
        '<button class="zhbtn" aria-label="显示本段中文">中</button></div>';
    }).join('');
  }

  function paintSec(){
    var body = $('chBody'); if(!body || !CET4.size) return;
    var nodes = body.querySelectorAll('span.w');
    for(var i=0;i<nodes.length;i++){
      var el = nodes[i];
      if(el.classList.contains('key')) continue;
      var k = el.dataset.w || (W[+el.dataset.i] ? W[+el.dataset.i].w : '');
      if(!k){ continue; }
      k = String(k).toLowerCase();
      var hit = CET4.has(k) || (FORMS[k] && CET4.has(String(FORMS[k]).toLowerCase()));
      if(hit) el.classList.add('sec'); else el.classList.remove('sec');
    }
  }

  function restoreY(y){
    if(!y){ return; }
    pendingY = y;
    var tries = 0;
    (function go(){
      window.scrollTo(0, pendingY);
      if(Math.abs(window.scrollY - pendingY) > 6 && tries++ < 20) setTimeout(go, 110);
      else if(Math.abs(window.scrollY - pendingY) <= 6) pendingY = 0;
    })();
  }

  function renderChapter(n, keepScroll){
    if(!CH.length) return;
    n = Math.max(0, Math.min(n, CH.length - 1));
    st.ch = n; pos().ch = n;
    var c = CH[n];
    $('hero').src = BOOK.imgBase + 'ch' + String(c.no).padStart(2, '0') + '.webp';
    $('chMeta').textContent = 'CHAPTER ' + String(c.no).padStart(2, '0') + ' · ' + c.n + ' WORDS' +
      (c.vol ? ' · ' + c.vol : '');
    $('chTitle').textContent = c.t;
    $('chCn').textContent = c.tz || '';
    $('chCn').style.display = c.tz ? '' : 'none';
    $('crumbNo').textContent = String(c.no).padStart(2, '0');
    $('crumbTitle').textContent = c.tz || c.t;
    $('prevCh').disabled = n === 0;
    $('nextCh').disabled = n === CH.length - 1;
    $('chBody').innerHTML = chapterHtml(c);
    if(!keepScroll){ window.scrollTo(0, 0); pos().y = 0; st.y = 0; }
    syncToc(); paintSaved(); paintSec(); save();
    document.body.classList.add('ready');
  }

  function tocHtml(){
    var out = '', vol = null;
    CH.forEach(function(c, i){
      if(c.vol && c.vol !== vol){ vol = c.vol; out += '<div class="volh">' + esc(vol) + '</div>'; }
      out += '<div class="ci' + (i === st.ch ? ' cur' : '') + '" data-ch="' + i + '">' +
        '<div class="num">' + String(c.no).padStart(2, '0') + '</div>' +
        '<div class="tx"><b>' + esc(c.tz || c.t) + '</b><span>' + (c.tz ? esc(c.t) + ' · ' : '') + c.n + ' 词</span></div></div>';
    });
    return out;
  }
  function syncToc(){
    ['tocList','sideList'].forEach(function(id){
      var el = $(id); if(!el) return;
      el.innerHTML = tocHtml();
    });
  }

  /* ---------- shelf ---------- */
  function renderShelf(){
    var sn = $('shelfNum'); if(sn) sn.textContent = META.length + ' 本';
    $('shelfList').innerHTML = META.map(function(m){
      var p = st.pos[m.id] || { ch: 0 }, cur = m.id === st.book;
      var total = m.chapters || 0, at = Math.min(100, Math.round(((p.ch + 1) / Math.max(1, total)) * 100));
      return '<div class="bk' + (cur ? ' cur' : '') + '" data-book="' + m.id + '">' +
        '<img src="' + m.cover + '" alt="" loading="lazy" draggable="false">' +
        '<div class="tx"><b>' + esc(m.title) + '</b>' +
        '<span class="en">' + esc(m.en) + '</span>' +
        '<span class="dsc">' + esc(m.desc) + '</span>' +
        '<span class="p">' + (m.hasKey ? total + ' 章 · 340 词' : total + ' 章') +
        ' · 读到第 ' + (p.ch + 1) + ' 章（' + at + '%）</span></div>' +
        (cur ? '<em class="curtag">在读</em>' : '') + '</div>';
    }).join('');
  }

  function switchBook(id){
    if(id === st.book){ closeDrawer('shelfDrawer'); return; }
    st.pos[st.book] = { ch: st.ch, y: window.scrollY };
    st.book = id; save();
    ensureBook(id, function(){
      var p = st.pos[id] || { ch: 0, y: 0 }, ch0 = p.ch || 0, y0 = p.y || 0;
      $('shelfDrawer').classList.remove('on');
      renderChapter(ch0, true);
      paintSaved();
      window.scrollTo(0, 0);
      if(y0 > 0) restoreY(y0);
    });
  }

  /* ---------- word card ---------- */
  var curWord = -1;
  function wordOf(el){ return el.dataset.w ? IDX[String(el.dataset.w).toLowerCase()] : +el.dataset.i; }

  function openCard(i){
    var w = W[i]; if(!w) return;
    curWord = i;
    var rec = st.vocab[w.w], saved = !!rec;
    var sent = w.sent ? esc(w.sent).replace(new RegExp('\\b(' + w.w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '[a-z]{0,3})\\b','i'), '<em>$1</em>') : '';
    var label = !BOOK.hasKey ? BOOK.title + ' · 词典'
      : (w.ch ? '第 ' + w.ch + ' 章 · 词核' : BOOK.title + ' · 词典');
    $('cardBody').innerHTML =
      '<div class="card-word"><h2>' + esc(w.w) + '</h2><span class="ph">' + esc(w.ph) + '</span></div>' +
      '<div class="card-ch">' + label + '</div>' +
      '<p class="card-tr">' + (esc(w.tr) || '<span style="color:var(--muted)">这部词典里暂时没有收录这个词。</span>') + '</p>' +
      (w.hook ? '<div class="card-block"><div class="card-lab">记忆钩子</div><p class="card-sent" style="font-family:var(--sans);font-size:.88em;color:var(--muted)">' + esc(w.hook) + '</p></div>' : '') +
      (sent ? '<div class="card-block"><div class="card-lab">书中原句</div><p class="card-sent">' + sent + '</p>' +
        (w.zh ? '<p class="card-zh">' + esc(w.zh) + '</p>' : '') + '</div>' : '') +
      '<div class="card-actions">' +
        '<button class="btn ' + (saved ? '' : 'primary') + '" id="btnSave">' + (saved ? '已收藏 · 点此取消' : '加入生词本') + '</button>' +
      '</div>';
    $('sheet').classList.add('on'); $('scrim').classList.add('on');
    $('btnSave').onclick = function(){ toggleWord(w); openCard(i); };
  }
  function closeSheet(){ $('sheet').classList.remove('on'); if(!$('setSheet').classList.contains('on')) $('scrim').classList.remove('on'); }
  function closeDrawer(id){ $(id).classList.remove('on'); }

  function toggleWord(w){
    if(st.vocab[w.w]) delete st.vocab[w.w];
    else st.vocab[w.w] = { tr: w.tr, ph: w.ph, book: st.book };
    save(); paintSaved(); renderVocab();
  }
  function paintSaved(){
    var nodes = document.querySelectorAll('.w');
    for(var i=0;i<nodes.length;i++){
      var el = nodes[i], w = W[wordOf(el)];
      if(w) el.classList.toggle('saved', !!st.vocab[w.w]);
    }
    var n = Object.keys(st.vocab).length;
    var vn = $('vNum'); if(vn) vn.textContent = n + ' 词';
    $('sideVocab').textContent = n ? ('已收藏 ' + n + ' 个词') : '还没有收藏的单词';
  }

  /* ---------- vocab ---------- */
  function renderVocab(){
    var keys = Object.keys(st.vocab);
    var el = $('vocabList'); if(!el) return;
    var vn0 = $('vNum'); if(vn0) vn0.textContent = keys.length + ' 词';
    if(!keys.length){
      el.innerHTML = '<div class="empty">还没有收藏。<br>读的时候点任何一个单词，就能把它收进来。</div>';
      return;
    }
    keys.sort(function(a, b){ return a < b ? -1 : 1; });
    el.innerHTML = keys.map(function(k){
      var v = st.vocab[k] || {}, i = IDX[k.toLowerCase()];
      var tr = v.tr || (i !== undefined ? W[i].tr : '');
      return '<div class="vrow" data-w="' + esc(k) + '"><b>' + esc(k) + '</b><span>' + esc(tr) + '</span>' +
        '<button data-del="' + esc(k) + '" aria-label="移除">✕</button></div>';
    }).join('');
  }

  function openVocabWord(word){
    var i = IDX[word.toLowerCase()];
    if(i !== undefined) return openCard(i);
    var v = st.vocab[word] || {};
    $('cardBody').innerHTML =
      '<div class="card-word"><h2>' + esc(word) + '</h2><span class="ph">' + esc(v.ph || '') + '</span></div>' +
      '<div class="card-ch">生词本</div><p class="card-tr">' + esc(v.tr || '') + '</p>' +
      '<div class="card-actions"><button class="btn" id="btnUnsave">从生词本移除</button></div>';
    $('sheet').classList.add('on'); $('scrim').classList.add('on');
    $('btnUnsave').onclick = function(){
      delete st.vocab[word]; save(); renderVocab(); paintSaved(); closeSheet();
    };
  }

  /* ---------- review ---------- */
  var rev = { list: [], i: 0, back: false };
  function openReview(){
    rev.list = Object.keys(st.vocab);
    if(!rev.list.length){ alert('生词本还是空的，先收藏几个词吧。'); return; }
    rev.i = 0; rev.back = false;
    $('review').classList.add('on'); renderReview();
  }
  function renderReview(){
    var k = rev.list[rev.i]; if(!k){ closeReview(); return; }
    var v = st.vocab[k] || {}, i = IDX[k.toLowerCase()], w = i !== undefined ? W[i] : null;
    $('revCount').textContent = (rev.i + 1) + ' / ' + rev.list.length;
    $('flip').innerHTML = rev.back
      ? '<div class="tr">' + esc(v.tr || (w ? w.tr : '')) + '</div>' +
        (v.ph ? '<div class="ph">' + esc(v.ph) + '</div>' : '') +
        '<div class="hint">再点一下回到单词</div>'
      : '<div class="w">' + esc(k) + '</div><div class="ph">' + esc(v.ph || (w ? w.ph : '')) + '</div><div class="hint">点卡片看释义</div>';
    $('revPrev').disabled = rev.i === 0;
    $('revNext').textContent = rev.i === rev.list.length - 1 ? '完成' : '下一个';
  }
  function closeReview(){ $('review').classList.remove('on'); }

  /* ---------- events ---------- */
  $('chBody').addEventListener('click', function(e){
    var t = e.target;
    if(t.classList && t.classList.contains('w')){ openCard(wordOf(t)); return; }
    if(t.classList && t.classList.contains('zhbtn')){
      t.closest('.para').classList.toggle('open'); return;
    }
  });

  $('scrim').onclick = function(){
    closeSheet(); $('setSheet').classList.remove('on'); $('scrim').classList.remove('on');
  };
  $('btnToc').onclick = function(){ syncToc(); $('tocDrawer').classList.add('on'); };
  $('tabShelf').onclick = function(){ renderShelf(); $('shelfDrawer').classList.add('on'); };
  $('shelfList').addEventListener('click', function(e){
    var b = e.target.closest('.bk'); if(!b) return;
    switchBook(b.dataset.book);
  });
  $('tabVocab').onclick = function(){ renderVocab(); $('vocabDrawer').classList.add('on'); };
  $('tabReview').onclick = openReview;
  $('revClose').onclick = closeReview;
  $('revPrev').onclick = function(){ if(rev.i > 0){ rev.i--; rev.back = false; renderReview(); } };
  $('revNext').onclick = function(){
    if(rev.i < rev.list.length - 1){ rev.i++; rev.back = false; renderReview(); }
    else closeReview();
  };
  $('flip').onclick = function(){ rev.back = !rev.back; renderReview(); };

  document.querySelectorAll('[data-close]').forEach(function(b){
    b.onclick = function(){ $(b.dataset.close).classList.remove('on'); };
  });

  ['tocList','sideList'].forEach(function(id){
    $(id).addEventListener('click', function(e){
      var c = e.target.closest('.ci'); if(!c) return;
      $('tocDrawer').classList.remove('on');
      renderChapter(+c.dataset.ch, false);
    });
  });

  $('vocabList').addEventListener('click', function(e){
    var d = e.target.closest('[data-del]');
    if(d){ delete st.vocab[d.dataset.del]; save(); renderVocab(); paintSaved(); return; }
    var r = e.target.closest('.vrow');
    if(r){ $('vocabDrawer').classList.remove('on'); openVocabWord(r.dataset.w); }
  });

  $('prevCh').onclick = function(){ if(st.ch > 0) renderChapter(st.ch - 1, false); };
  $('nextCh').onclick = function(){ if(st.ch < CH.length - 1) renderChapter(st.ch + 1, false); };

  /* settings */
  $('btnSet').onclick = function(){ $('setSheet').classList.add('on'); $('scrim').classList.add('on'); };
  $('fs').oninput = function(){ st.font = +this.value; applyFont(); save(); };
  $('indSeg').onclick = function(e){
    var b = e.target.closest('button'); if(!b) return;
    st.ind = +b.dataset.ind; applyInd(); save();
  };
  $('themeSeg').onclick = function(e){
    var b = e.target.closest('button'); if(!b) return;
    st.theme = b.dataset.theme; applyTheme(); save();
  };
  $('swZh').onclick = function(){
    st.zhOn = !st.zhOn; this.classList.toggle('on', st.zhOn);
    document.querySelectorAll('.para').forEach(function(p){ p.classList.toggle('open', st.zhOn); });
    save();
  };
  $('swMark').onclick = function(){
    st.marks = !st.marks; this.classList.toggle('on', st.marks); applyMarks(); save();
  };
  $('swSec').onclick = function(){
    st.sec = !st.sec; this.classList.toggle('on', st.sec); applySec(); save();
  };
  $('btnReset').onclick = function(){
    st.pos[st.book] = { ch: 0, y: 0 }; st.ch = 0; save();
    window.scrollTo(0, 0);
    $('setSheet').classList.remove('on'); $('scrim').classList.remove('on');
  };

  /* keyboard */
  document.addEventListener('keydown', function(e){
    if(e.key === 'ArrowRight' && st.ch < CH.length - 1) renderChapter(st.ch + 1, false);
    if(e.key === 'ArrowLeft' && st.ch > 0) renderChapter(st.ch - 1, false);
    if(e.key === 'Escape'){ closeSheet(); $('setSheet').classList.remove('on'); $('scrim').classList.remove('on'); }
  });

  /* swipe */
  var tx = 0, ty = 0, tt = 0, tracking = false;
  var reader = $('reader');
  reader.addEventListener('touchstart', function(e){
    if(e.touches.length !== 1) return;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = Date.now(); tracking = true;
  }, {passive:true});
  reader.addEventListener('touchend', function(e){
    if(!tracking) return; tracking = false;
    var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty, dt = Date.now() - tt;
    if(dt < 700 && Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6){
      if(dx < 0 && st.ch < CH.length - 1) renderChapter(st.ch + 1, false);
      else if(dx > 0 && st.ch > 0) renderChapter(st.ch - 1, false);
    }
  }, {passive:true});

  /* progress */
  var tick = false;
  window.addEventListener('scroll', function(){
    if(tick) return; tick = true;
    requestAnimationFrame(function(){
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? Math.min(1, window.scrollY / h) : 0;
      $('bar').style.width = (p * 100).toFixed(1) + '%';
      pos().y = window.scrollY;
      tick = false;
    });
  }, {passive:true});
  setInterval(save, 4000);
  window.addEventListener('pagehide', function(){ pos().y = window.scrollY; save(); });
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){ pos().y = window.scrollY; save(); }
  });
  $('hero').addEventListener('load', function(){ if(pendingY) restoreY(pendingY); });
  window.addEventListener('pageshow', function(e){
    if(!e.persisted) return;
    try{
      var s2 = JSON.parse(localStorage.getItem(LS) || '{}');
      if(s2.book && s2.book !== st.book){ switchBook(s2.book); return; }
      var p2 = (s2.pos || {})[st.book];
      if(p2){ renderChapter(p2.ch || 0, true); restoreY(p2.y || 0); }
    }catch(err){}
  });

  /* ---------- boot ---------- */
  applyTheme(); applyFont(); applyInd(); applyMarks(); applySec();
  $('swZh').classList.toggle('on', st.zhOn);
  $('swMark').classList.toggle('on', st.marks);
  ensureBook(st.book, function(){
    var p = pos(), ch0 = p.ch || 0, y0 = p.y || 0;
    renderChapter(ch0, true);
    paintSaved();
    window.scrollTo(0, 0);
    if(y0 > 0) restoreY(y0);
  });
})();
