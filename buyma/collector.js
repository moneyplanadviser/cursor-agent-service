// BUYMA 画像取り込み — 収集スクリプト（GitHub Pages 配信版）
// ローダーが window.__BM = { exec, key } を設定してから読み込む。
// 学習ルールは起動時に GAS から JSONP (?action=rules) で取得 → サイト別に有力候補を判定。
// 更新はこのファイルを Pages リポジトリへ push するだけ（GAS再デプロイ不要・ブックマーク変更不要）。
(function () {
  var BM = window.__BM || {};
  var EXEC_URL = BM.exec || '';
  var KEY = BM.key || '';
  if (!EXEC_URL) { alert('設定が読み込めませんでした（exec未設定）'); return; }

  // --- 学習ルールを JSONP で取得 → 取れたら（or タイムアウトで）picker起動 ---
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
      var JUNK = /(visa|mastercard|maestro|amex|american[-_]?express|alipay|wechat|unionpay|union[-_]?pay|jcb|klarna|paypal|apple[-_ ]?pay|google[-_ ]?pay|g[-_]?pay|discover|diners|sofort|ideal|payment|sprite|favicon|placeholder|\blogo\b|\bicon\b|\bflag\b|\bbadge\b)/i;
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
        + ' <a href="#" id="__bm_all">全選択</a>/<a href="#" id="__bm_none">全解除</a></span></div></div>'
        + '<div style="padding-top:8px">' + cards + '</div>');
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
      root.querySelector('#__bm_close').onclick = function () { root.remove(); window.__buymaImgPicker = null; };
      root.querySelector('#__bm_all').onclick = function (ev) { ev.preventDefault(); tiles().forEach(function (t) { setSel(t, true); }); };
      root.querySelector('#__bm_none').onclick = function (ev) { ev.preventDefault(); tiles().forEach(function (t) { setSel(t, false); }); };
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
      root.querySelector('#__bm_send').onclick = function () {
        var ref = (root.querySelector('#__bm_ref').value || '').trim();
        var msgEl = root.querySelector('#__bm_msg');
        if (!ref) { msgEl.textContent = '参照番号を入れてください'; return; }
        var urls = tiles().filter(function (t) { return t.getAttribute('data-sel') === '1'; })
          .map(function (t) { return decodeURIComponent(t.getAttribute('data-url')); });
        if (!urls.length) { msgEl.textContent = '画像を1枚以上選んでください'; return; }
        var selSet = {};
        tiles().forEach(function (t) { if (t.getAttribute('data-sel') === '1') selSet[decodeURIComponent(t.getAttribute('data-url'))] = 1; });
        var logData = imgs.map(function (o) { return { url: o.url, w: o.w, h: o.h, strong: isProduct(o) ? 1 : 0, sel: selSet[o.url] ? 1 : 0 }; });
        var sendBtn = root.querySelector('#__bm_send'); sendBtn.disabled = true; sendBtn.style.opacity = '.6';
        var done = 0;
        msgEl.textContent = '画像を取得中… 0/' + urls.length;
        var grab = function (u) {
          return fetch(u).then(function (r) { if (!r.ok) throw new Error('http'); return r.blob(); })
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
            var n = 0;
            items.forEach(function (it) {
              if (!it.blob) return;
              n++;
              var a = document.createElement('a');
              a.href = URL.createObjectURL(it.blob);
              a.download = ref + '_' + pad2(n) + '.' + extOf(it.mime, it.url);
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(function (h) { return function () { URL.revokeObjectURL(h); }; }(a.href), 10000);
            });
            var ng = items.length - n;
            try { navigator.sendBeacon(EXEC_URL, JSON.stringify({ logOnly: 1, host: location.host, ref: ref, key: KEY, log: logData })); } catch (e) {}
            msgEl.textContent = n + '枚をダウンロード' + (ng ? '（' + ng + '件は取得不可）' : '');
            sendBtn.disabled = false; sendBtn.style.opacity = '1';
            return;
          }
          var payload = JSON.stringify({ ref: ref, images: items.map(function (it) { return { url: it.url, data: it.data, mime: it.mime }; }), key: KEY, page: location.href, host: location.host, log: logData });
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
