// BUYMA 画像取り込み — 収集スクリプト（GitHub Pages 配信版）
// ローダーが window.__BM = { exec, key } を設定してから読み込む。
// 学習ルールは起動時に GAS から JSONP (?action=rules) で取得 → サイト別に有力候補を判定。
// 更新はこのファイルを Pages リポジトリへ push するだけ（GAS再デプロイ不要・ブックマーク変更不要）。
(function () {
  var BM = window.__BM || {};
  var EXEC_URL = BM.exec || '';
  if (!EXEC_URL) { alert('設定が読み込めませんでした（exec未設定）'); return; }
  var KEY = '';   // 鍵はローダーに直書きしない。localStorage or 入力で取得（SHIRO.gate）。

  // ── SHIRO 共通: 鍵(localStorage)＋保存先＋鍵ゲート（停止/期限で再入力）。collector.js / info_scraper.js / image_ingest.gs と同期 ──
  var SHIRO = (function () {
    var KKEY = 'shiro_buyma_key';
    function getKey() { try { return localStorage.getItem(KKEY) || ''; } catch (e) { return ''; } }
    function setKey(v) { try { v ? localStorage.setItem(KKEY, v) : localStorage.removeItem(KKEY); } catch (e) {} }
    function getDest(kind) { try { return localStorage.getItem('shiro_buyma_dest_' + kind) || ''; } catch (e) { return ''; } }
    function setDest(kind, v) { try { localStorage.setItem('shiro_buyma_dest_' + kind, v || ''); } catch (e) {} }
    function checkKey(exec, key, tool, done) {
      if (!key) { done({ ok: false, status: 'no_key' }); return; }
      var cb = '__shiroCk_' + Date.now(), s;
      var to = setTimeout(function () { cleanup(); done({ ok: false, status: 'unreachable' }); }, 8000);
      function cleanup() { try { delete window[cb]; } catch (e) {} if (s && s.parentNode) s.parentNode.removeChild(s); clearTimeout(to); }
      window[cb] = function (r) { cleanup(); done(r || { ok: false, status: 'unreachable' }); };
      s = document.createElement('script');
      s.src = exec + '?action=checkkey&tool=' + encodeURIComponent(tool) + '&key=' + encodeURIComponent(key) + '&cb=' + cb + '&t=' + Date.now();
      s.onerror = function () { cleanup(); done({ ok: false, status: 'unreachable' }); };
      document.body.appendChild(s);
    }
    function msgFor(st) {
      return ({ stopped: 'この鍵は停止中です。', expired: '鍵の有効期限が切れています。', unknown: '鍵が見つかりません。',
        wrong_tool: 'この鍵はこのツール用ではありません。', unreachable: 'サーバーに接続できません。時間をおいて再実行してください。' })[st] || '鍵を確認してください。';
    }
    function gate(exec, tool, onOK) {   // 有効な鍵を保証してから onOK(key)。無効/未入力なら入力UIを出す。
      var key = getKey();
      checkKey(exec, key, tool, function (r) {
        if (r.ok) { onOK(key); return; }
        if (key && r.status !== 'no_key' && r.status !== 'unreachable') setKey(''); // 切れた鍵は捨てて再入力
        promptKey(exec, tool, r.status, onOK);
      });
    }
    function promptKey(exec, tool, st, onOK) {
      var ID = '__shiro_key_gate'; var old = document.getElementById(ID); if (old) old.remove();
      var d = document.createElement('div'); d.id = ID;
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.6);font:14px/1.6 system-ui,sans-serif';
      d.innerHTML = '<div style="max-width:420px;margin:14vh auto;background:#fff;border-radius:12px;padding:22px;color:#222">'
        + '<div style="font-weight:bold;font-size:16px;margin-bottom:6px">SHIRO ライセンスキー</div>'
        + '<div style="color:#666;font-size:13px;margin-bottom:10px">' + (st && st !== 'no_key' ? msgFor(st) + '<br>' : '') + '配布された鍵を入力してください（次回から自動で省略されます）。</div>'
        + '<input id="__shiro_key_in" placeholder="SHIRO-XXXX-XXXX-XXXX-XXXX" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccc;border-radius:8px;font-size:14px">'
        + '<div id="__shiro_key_msg" style="color:#c00;font-size:12px;min-height:16px;margin:6px 2px"></div>'
        + '<div style="text-align:right"><button id="__shiro_key_x" style="background:#eee;border:0;border-radius:8px;padding:8px 14px;margin-right:6px;cursor:pointer">閉じる</button>'
        + '<button id="__shiro_key_ok" style="background:#1a73e8;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer">確認</button></div></div>';
      document.body.appendChild(d);
      var inp = d.querySelector('#__shiro_key_in'); inp.focus();
      var m = d.querySelector('#__shiro_key_msg');
      d.querySelector('#__shiro_key_x').onclick = function () { d.remove(); };
      var ok = d.querySelector('#__shiro_key_ok');
      ok.onclick = function () {
        var v = (inp.value || '').trim();
        if (!v) { m.textContent = '鍵を入力してください'; return; }
        ok.disabled = true; m.style.color = '#666'; m.textContent = '確認中…';
        checkKey(exec, v, tool, function (r) {
          ok.disabled = false;
          if (r.ok) { setKey(v); d.remove(); onOK(v); }
          else { m.style.color = '#c00'; m.textContent = msgFor(r.status); }
        });
      };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
    }
    return { getKey: getKey, setKey: setKey, getDest: getDest, setDest: setDest, gate: gate };
  })();

  // 有効な鍵を確保してから本体起動（鍵が切れていれば再入力UI）
  SHIRO.gate(EXEC_URL, 'buyma-image', function (k) { KEY = k; bootRules(); });

  // --- 学習ルールを JSONP で取得 → 取れたら（or タイムアウトで）picker起動 ---
  function bootRules() {
    var started = false;
    function start(RULES) {
      if (started) return; started = true;
      try { delete window[cb]; } catch (e) {}
      picker(RULES || {});
    }
    var cb = '__bmRules_' + Date.now();
    window[cb] = function (r) { start(r); };
    var rs = document.createElement('script');
    rs.src = EXEC_URL + '?action=rules&cb=' + cb + '&t=' + Date.now();
    rs.onerror = function () { start({}); };
    document.body.appendChild(rs);
    setTimeout(function () { start({}); }, 4000); // 取得できなくても起動（汎用判定）
  }

  // ====================================================================
  function picker(RULES) {
    if (window.__buymaImgPicker) { window.__buymaImgPicker.focus && window.__buymaImgPicker.focus(); return; }
    var MIN_W = 200;
    var abs = function (u) { try { return new URL(u, location.href).href; } catch (e) { return ''; } };
    var ok = function (u) { return /^https?:\/\//i.test(u) && !/^data:/i.test(u); };

    function largestFromSrcset(ss) {
      if (!ss) return '';
      var best = '', bestW = -1;
      ss.split(',').forEach(function (part) {
        var m = part.trim().split(/\s+/);
        var u = m[0]; var w = m[1] ? parseInt(m[1], 10) : 0;
        if (u && w >= bestW) { bestW = w; best = u; }
      });
      return best;
    }
    function collect() {
      var found = {};
      var add = function (u, w, h) {
        u = abs(u); if (!ok(u)) return;
        if (!(u in found) || (w || 0) > found[u].w) found[u] = { w: w || 0, h: h || 0 };
      };
      Array.prototype.forEach.call(document.querySelectorAll('img'), function (img) {
        var w = img.naturalWidth || img.width || 0;
        var h = img.naturalHeight || img.height || 0;
        add(img.currentSrc || img.src, w, h);
        add(largestFromSrcset(img.getAttribute('srcset')), w, h);
        ['src', 'original', 'lazy', 'lazySrc', 'zoom', 'large'].forEach(function (k) {
          if (img.dataset && img.dataset[k]) add(img.dataset[k], w, h);
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('source[srcset]'), function (s) {
        add(largestFromSrcset(s.getAttribute('srcset')), 0, 0);
      });
      Array.prototype.forEach.call(document.querySelectorAll('*'), function (el) {
        var bg = getComputedStyle(el).backgroundImage;
        if (bg && bg.indexOf('url(') >= 0) {
          var m = bg.match(/url\(["']?(.*?)["']?\)/);
          if (m) add(m[1], el.clientWidth || 0, 0);
        }
      });
      return Object.keys(found).map(function (u) { return { url: u, w: found[u].w, h: found[u].h }; })
        .filter(function (o) { return o.w === 0 || o.w >= MIN_W; })
        .sort(function (a, b) { return b.w - a.w; });
    }
    function autoScrollThen(done) {
      var y = 0, step = Math.max(400, window.innerHeight);
      var t = setInterval(function () {
        window.scrollTo(0, y); y += step;
        if (y > document.body.scrollHeight) { clearInterval(t); window.scrollTo(0, 0); setTimeout(done, 400); }
      }, 120);
    }
    function panel(html) {
      var d = document.createElement('div');
      d.id = '__buymaImgPicker';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.6);font:14px/1.5 system-ui,sans-serif;';
      d.innerHTML = '<div style="max-width:760px;margin:24px auto;background:#fff;border-radius:10px;max-height:90vh;overflow:auto;padding:16px 18px;color:#222">' + html + '</div>';
      document.body.appendChild(d);
      window.__buymaImgPicker = d;
      return d;
    }
    var loading = panel('<b>BUYMA 画像取り込み</b><br>ページを読み込み中…');
    autoScrollThen(function () {
      var imgs = collect();
      loading.remove();
      if (!imgs.length) { panel('<b>画像が見つかりませんでした。</b><br>ギャラリーを開いてからもう一度実行してください。<br><br><button onclick="document.getElementById(\'__buymaImgPicker\').remove();window.__buymaImgPicker=null">閉じる</button>'); return; }
      var tileHtml = function (o, sel) {
        return '<div class="__bm_tile" data-url="' + encodeURIComponent(o.url) + '" data-sel="' + (sel ? '1' : '0') + '"'
          + ' style="position:relative;display:inline-block;width:120px;height:140px;margin:4px;text-align:center;vertical-align:top;cursor:pointer;box-sizing:border-box;border:3px solid ' + (sel ? '#1a73e8' : '#ddd') + ';border-radius:8px;background:#fff">'
          + '<img src="' + o.url + '" style="display:block;width:108px;height:108px;object-fit:contain;background:#fafafa;pointer-events:none;margin:0 auto">'
          + '<span class="__bm_chk" style="position:absolute;top:4px;left:4px;width:22px;height:22px;border-radius:50%;color:#fff;font-size:14px;line-height:22px;text-align:center;background:' + (sel ? '#1a73e8' : 'rgba(0,0,0,.35)') + '">' + (sel ? '✓' : '') + '</span>'
          + '<span style="display:block;font-size:11px;color:#888">' + (o.w ? o.w + 'px' : '?') + '</span></div>';
      };
      var JUNK = /(visa|mastercard|maestro|amex|american[-_]?express|alipay|wechat|unionpay|union[-_]?pay|jcb|klarna|paypal|apple[-_ ]?pay|google[-_ ]?pay|g[-_]?pay|discover|diners|sofort|ideal|payment|sprite|favicon|placeholder|\blogo\b|\bicon\b|\bflag\b|\bbadge\b|avatar|profile|qrcode|qr[-_]?code|emoji|sticker|spinner|loading)/i;
      var RULE = (RULES && RULES[location.host]) || null;
      var isProduct = function (o) {
        if (JUNK.test(o.url)) return false;
        if (RULE) {
          if (RULE.minW && o.w && o.w < RULE.minW) return false;
          if (RULE.token) return o.url.toLowerCase().indexOf(RULE.token) >= 0;
          var rr = o.h > 0 ? o.h / o.w : 0;
          if (rr > 0 && RULE.rMin && (rr < RULE.rMin || rr > RULE.rMax)) return false;
          return (o.w || 0) >= (RULE.minW || 300);
        }
        if (o.w < 300) return false;
        var r = o.h > 0 ? o.h / o.w : 0;
        if (r > 0 && (r < 0.8 || r > 2.2)) return false;
        return true;
      };
      var strong = imgs.filter(isProduct);
      var rest = imgs.filter(function (o) { return !isProduct(o); });
      var anyStrong = strong.length > 0;
      var section = function (label, list, preselect) {
        if (!list.length) return '';
        return '<div style="margin:12px 0 2px;font-weight:bold;color:#333">' + label + '（' + list.length + '件）</div>'
          + '<div>' + list.map(function (o) { return tileHtml(o, preselect); }).join('') + '</div>';
      };
      var cards = section((RULE ? '⭐ 有力候補（学習済み）' : '⭐ 有力候補（商品画像と思われる画像）'), strong, true)
        + section(anyStrong ? 'その他の画像' : '検出画像', rest, !anyStrong);
      var root = panel(
        '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<b>BUYMA 画像取り込み</b>'
        + '<button id="__bm_close" style="border:0;background:#eee;border-radius:6px;padding:4px 10px;cursor:pointer">×</button></div>'
        + '<div style="position:sticky;top:0;background:#fff;z-index:1;padding:8px 0;border-bottom:1px solid #eee">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span>参照番号</span>'
        + '<input id="__bm_ref" placeholder="例: 118850" style="width:150px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:15px">'
        + '<button id="__bm_send" style="background:#1a73e8;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-size:15px;cursor:pointer;white-space:nowrap">選択を送信</button>'
        + '<span id="__bm_msg" style="color:#666"></span></div>'
        + '<div style="margin-top:6px;color:#666;font-size:13px">保存先: '
        + '<span class="__bm_dest" data-v="drive" style="display:inline-block;padding:3px 10px;border-radius:14px;cursor:pointer;margin-right:4px;background:#1a73e8;color:#fff">Google Drive</span>'
        + '<span class="__bm_dest" data-v="local" style="display:inline-block;padding:3px 10px;border-radius:14px;cursor:pointer;background:#eee;color:#333">このPCにDL</span>'
        + '<span style="margin-left:10px">クリックで選択（計' + imgs.length + '件）'
        + ' <a href="#" id="__bm_all">全選択</a>/<a href="#" id="__bm_none">全解除</a></span>'
        + ' <button id="__bm_ai" style="margin-left:8px;background:#6a1b9a;color:#fff;border:0;border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer">🤖 AIで商品だけ選ぶ</button></div>'
        + '<div id="__bm_destrow" style="margin-top:6px;color:#666;font-size:13px">保存先フォルダ(Drive)のURL: '
        + '<input id="__bm_destfolder" placeholder="https://drive.google.com/drive/folders/..." style="width:340px;max-width:68%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px"></div></div>'
        + '<div style="padding-top:8px">' + cards + '</div>');
      var destFolderInp = root.querySelector('#__bm_destfolder');
      destFolderInp.value = SHIRO.getDest('drive'); // 前回値
      var destRow = root.querySelector('#__bm_destrow');
      var dest = 'drive';
      var destBtns = Array.prototype.slice.call(root.querySelectorAll('.__bm_dest'));
      destBtns.forEach(function (d) {
        d.onclick = function () {
          dest = d.getAttribute('data-v');
          destBtns.forEach(function (x) {
            var on = x.getAttribute('data-v') === dest;
            x.style.background = on ? '#1a73e8' : '#eee';
            x.style.color = on ? '#fff' : '#333';
          });
          destRow.style.display = (dest === 'drive') ? '' : 'none'; // ローカルDLのときはフォルダURL欄を隠す
        };
      });
      var tiles = function () { return Array.prototype.slice.call(root.querySelectorAll('.__bm_tile')); };
      var setSel = function (t, on) {
        t.setAttribute('data-sel', on ? '1' : '0');
        t.style.borderColor = on ? '#1a73e8' : '#ddd';
        var c = t.querySelector('.__bm_chk');
        c.style.background = on ? '#1a73e8' : 'rgba(0,0,0,.35)';
        c.textContent = on ? '✓' : '';
      };
      tiles().forEach(function (t) { t.onclick = function () { setSel(t, t.getAttribute('data-sel') !== '1'); }; });
      // 読み込めない画像（壊れ・hotlink拒否・空タイル）は候補から自動除外（選択解除＋非表示）
      tiles().forEach(function (t) {
        var im = t.querySelector('img');
        if (!im) return;
        var bad = function () { setSel(t, false); t.style.display = 'none'; };
        if (im.complete && im.naturalWidth === 0) bad();
        im.addEventListener('error', bad);
        im.addEventListener('load', function () { if (im.naturalWidth === 0) bad(); });
      });
      root.querySelector('#__bm_close').onclick = function () { root.remove(); window.__buymaImgPicker = null; };
      root.querySelector('#__bm_all').onclick = function (ev) { ev.preventDefault(); tiles().forEach(function (t) { setSel(t, true); }); };
      root.querySelector('#__bm_none').onclick = function (ev) { ev.preventDefault(); tiles().forEach(function (t) { setSel(t, false); }); };
      // C: AIで商品だけ選ぶ（候補URL＋検索キーワードをGASへ→Geminiが商品判定→該当だけ✓。未判定は現状維持）
      var KW = '';
      try { KW = new URLSearchParams(location.search).get('keyword') || new URLSearchParams(location.search).get('q') || ''; } catch (e) {}
      var aiBtn = root.querySelector('#__bm_ai');
      if (aiBtn) aiBtn.onclick = function (ev) {
        ev.preventDefault();
        var msgEl = root.querySelector('#__bm_msg');
        var vis = tiles().filter(function (t) { return t.style.display !== 'none'; });
        if (!vis.length) { msgEl.textContent = '判定する画像がありません'; return; }
        var items = vis.map(function (t, i) { return { i: i, url: decodeURIComponent(t.getAttribute('data-url')) }; });
        var job = 'j' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        var old = aiBtn.textContent; aiBtn.disabled = true; aiBtn.textContent = '🤖 AI判定中…';
        msgEl.textContent = 'AIが商品画像を判定中…（枚数が多いと最大1分・お待ちください）';
        var ifr = document.createElement('iframe'); ifr.name = '__bm_cls_' + job; ifr.style.display = 'none'; document.body.appendChild(ifr);
        var f = document.createElement('form'); f.method = 'POST'; f.action = EXEC_URL; f.target = ifr.name;
        var inp = document.createElement('input'); inp.type = 'hidden'; inp.name = 'payload';
        inp.value = JSON.stringify({ classify: 1, job: job, key: KEY, keyword: KW, page: location.href, host: location.host, items: items });
        f.appendChild(inp); document.body.appendChild(f); f.submit(); f.remove();
        var tries = 0;
        var finish = function (msg) { aiBtn.disabled = false; aiBtn.textContent = old; if (msg) msgEl.textContent = msg; try { ifr.remove(); } catch (e) {} };
        var poll = function () {
          if (++tries > 48) { finish('AI判定がタイムアウトしました。手動で選んでください'); return; }
          var cb = '__bmCls_' + job.replace(/[^\w]/g, '') + '_' + tries;
          var s = document.createElement('script');
          window[cb] = function (r) {
            try { delete window[cb]; } catch (e) {} if (s.parentNode) s.remove();
            if (!r || !r.ready) { setTimeout(poll, 1500); return; }
            if (r.error === 'auth') { finish('鍵エラーで判定できませんでした'); return; }
            var prod = {}; (r.products || []).forEach(function (i) { prod[i] = 1; });
            var judged = {}; (r.judged || []).forEach(function (i) { judged[i] = 1; });
            vis.forEach(function (t, i) { if (judged[i]) setSel(t, !!prod[i]); }); // 判定済のみ反映・未判定は現状維持
            finish((r.products || []).length + '枚をAIが商品と判定して選択しました' + (r.note ? '（' + r.note + '）' : '') + (r.error ? '（' + r.error + '）' : ''));
          };
          s.src = EXEC_URL + '?action=classify_result&job=' + encodeURIComponent(job) + '&cb=' + cb + '&t=' + Date.now();
          s.onerror = function () { if (s.parentNode) s.remove(); setTimeout(poll, 1500); };
          document.body.appendChild(s);
        };
        setTimeout(poll, 2500);
      };
      var extOf = function (mime, u) {
        mime = mime || '';
        if (mime.indexOf('png') >= 0) return 'png';
        if (mime.indexOf('webp') >= 0) return 'webp';
        if (mime.indexOf('gif') >= 0) return 'gif';
        if (mime.indexOf('jpeg') >= 0 || mime.indexOf('jpg') >= 0) return 'jpg';
        var m = String(u).match(/\.(png|jpe?g|gif|webp)(\?|$)/i);
        return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
      };
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
      // ローカルDLは個別だと Downloads に散らばり名前も重複(〇〇(1))しがち → 1つのZIP(参照番号.zip)にまとめる。
      var crc32 = function (u8) {
        var t = crc32._t;
        if (!t) { t = crc32._t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } }
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ t[(crc ^ u8[i]) & 0xFF];
        return (crc ^ 0xFFFFFFFF) >>> 0;
      };
      var makeZip = function (files) {  // files:[{name,bytes(Uint8Array)}] → store方式(無圧縮)のZip Blob。jpgは既に圧縮済なので無圧縮で十分。
        var enc = new TextEncoder(), parts = [], central = [], offset = 0;
        var u16 = function (n) { return [n & 0xFF, (n >>> 8) & 0xFF]; };
        var u32 = function (n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; };
        files.forEach(function (f) {
          var name = enc.encode(f.name), data = f.bytes, crc = crc32(data);
          var lh = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
          parts.push(new Uint8Array(lh), name, data);
          var ch = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
          central.push(new Uint8Array(ch), name);
          offset += lh.length + name.length + data.length;
        });
        var cdSize = 0; central.forEach(function (c) { cdSize += c.length; });
        var eocd = [].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0));
        return new Blob(parts.concat(central, [new Uint8Array(eocd)]), { type: 'application/zip' });
      };
      // BUYMAは JPEG/PNG/GIF のみ対応（WebP/AVIF不可）。非対応形式は保存前にJPEGへ変換する。
      // fetch成功でbytesが手元にある＝blob:URL経由なのでcanvasは汚染されず再エンコード可。失敗時は元blobへフォールバック。
      var BUYMA_OK = /^image\/(jpeg|png|gif)$/i;
      var toBuymaBlob = function (b) {
        if (!b || BUYMA_OK.test(b.type || '')) return Promise.resolve(b);
        return new Promise(function (resolve) {
          var url, img = new Image();
          var fin = function (out) { try { URL.revokeObjectURL(url); } catch (e) {} resolve(out && out.size ? out : b); };
          img.onload = function () {
            try {
              var c = document.createElement('canvas');
              c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
              if (!c.width || !c.height) return fin(b);
              var ctx = c.getContext('2d');
              ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // 透過は白背景で平坦化（BUYMAも白余白）
              ctx.drawImage(img, 0, 0);
              c.toBlob(function (out) { fin(out); }, 'image/jpeg', 0.92);
            } catch (e) { fin(b); }
          };
          img.onerror = function () { fin(b); };
          try { url = URL.createObjectURL(b); img.src = url; } catch (e) { resolve(b); }
        });
      };
      root.querySelector('#__bm_send').onclick = function () {
        var ref = (root.querySelector('#__bm_ref').value || '').trim();
        var msgEl = root.querySelector('#__bm_msg');
        if (!ref) { msgEl.textContent = '参照番号を入れてください'; return; }
        var urls = tiles().filter(function (t) { return t.getAttribute('data-sel') === '1'; })
          .map(function (t) { return decodeURIComponent(t.getAttribute('data-url')); });
        if (!urls.length) { msgEl.textContent = '画像を1枚以上選んでください'; return; }
        var destUrl = (destFolderInp.value || '').trim();
        if (dest === 'drive' && !destUrl) { msgEl.textContent = '保存先フォルダ(Drive)のURLを入力してください'; return; }
        if (dest === 'drive') SHIRO.setDest('drive', destUrl); // 前回値を記憶
        var selSet = {};
        tiles().forEach(function (t) { if (t.getAttribute('data-sel') === '1') selSet[decodeURIComponent(t.getAttribute('data-url'))] = 1; });
        var logData = imgs.map(function (o) { return { url: o.url, w: o.w, h: o.h, strong: isProduct(o) ? 1 : 0, sel: selSet[o.url] ? 1 : 0 }; });
        var sendBtn = root.querySelector('#__bm_send'); sendBtn.disabled = true; sendBtn.style.opacity = '.6';
        var done = 0;
        msgEl.textContent = '画像を取得中… 0/' + urls.length;
        var grab = function (u) {
          return fetch(u).then(function (r) { if (!r.ok) throw new Error('http'); return r.blob(); })
            .then(toBuymaBlob)
            .then(function (b) {
              return new Promise(function (res) {
                var fr = new FileReader();
                fr.onload = function () { res({ url: u, blob: b, data: String(fr.result).split(',')[1], mime: b.type }); };
                fr.onerror = function () { res({ url: u }); };
                fr.readAsDataURL(b);
              });
            })
            .catch(function () { return { url: u }; })
            .then(function (it) { done++; msgEl.textContent = '画像を取得中… ' + done + '/' + urls.length; return it; });
        };
        Promise.all(urls.map(grab)).then(function (items) {
          if (dest === 'local') {
            var got = items.filter(function (it) { return it.blob; });
            var ng = items.length - got.length;
            Promise.all(got.map(function (it, i) {
              return it.blob.arrayBuffer().then(function (ab) {
                return { name: ref + '_' + pad2(i + 1) + '.' + extOf(it.mime, it.url), bytes: new Uint8Array(ab) };
              });
            })).then(function (files) {
              if (files.length) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(makeZip(files));
                a.download = ref + '.zip';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function (h) { return function () { URL.revokeObjectURL(h); }; }(a.href), 10000);
              }
              try { navigator.sendBeacon(EXEC_URL, JSON.stringify({ logOnly: 1, host: location.host, ref: ref, key: KEY, log: logData })); } catch (e) {}
              msgEl.textContent = files.length ? (files.length + '枚を ' + ref + '.zip にまとめてダウンロードしました' + (ng ? '（' + ng + '件は取得不可）' : '')) : '取得できた画像がありませんでした';
              sendBtn.disabled = false; sendBtn.style.opacity = '1';
            });
            return;
          }
          var payload = JSON.stringify({ ref: ref, images: items.map(function (it) { return { url: it.url, data: it.data, mime: it.mime }; }), key: KEY, dest: destUrl, page: location.href, host: location.host, log: logData });
          var f = document.createElement('form');
          f.method = 'POST'; f.action = EXEC_URL; f.target = '_blank';
          var inp = document.createElement('input');
          inp.type = 'hidden'; inp.name = 'payload'; inp.value = payload;
          f.appendChild(inp); document.body.appendChild(f); f.submit(); f.remove();
          root.remove(); window.__buymaImgPicker = null;
        });
      };
    });
  }
})();
