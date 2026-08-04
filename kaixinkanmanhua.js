/**
 * 开心看漫画 (kxmanhua.com) —— Venera 漫画源 v2.1.0
 * ⚠️ kxmanhua.com 已改版：由 /category/、/comic/、/chapter/ 旧模板
 *    改为 /manga/<id> 新模板。
 * 已确认（WebFetch 实测）：
 *   列表   /manga/library?page=<N>&ranktype=1&count=24   （全部漫画）
 *          /manga/library?orderby=2&page=<N>             （最近更新）
 *          /manga/library?orderby=3&page=<N>             （最新上架）
 *          /manga/library?type=2|3&page=<N>              （韩漫/日漫）
 *   详情   /manga/<id>   -> 作者：/漫画分类：/最近更新：/标签：/简介
 *   章节   /manga/<id>/detail/<章节id>   （用户提供样本确认）
 *   阅读   <img src="https://img.imh99.top/webtoon/content/..."> 直接出图，无需 AES
 *          （保留旧模板 params AES 解密作为兜底，密钥 5V&RoR%Jf@pJPydF）
 */
class kxmanhua extends ComicSource {
  name = "开心看漫画";
  key = "kxmanhua";
  version = "2.1.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/kaixinkanmanhua.js";
  baseUrl = "https://kxmanhua.com";
  UA = "Mozilla/5.0 Chrome/126.0.0.0";

  // ====== Base64 ======
  _atob(s) {
    var c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    s = String(s).replace(/=+$/, "");
    var o = "", bs, b, idx = 0;
    for (var i = 0; (b = s.charAt(idx++)); ) {
      b = c.indexOf(b);
      if (~b) { bs = i % 4 ? bs * 64 + b : b; if (i++ % 4) o += String.fromCharCode(255 & (bs >> ((-2 * i) & 6))); }
    }
    return o;
  }

  // ====== AES-128-CBC 解密（开心漫 CMS 同密钥）======
  _aes(cipherB64) {
    function gmul(a, b) { var p = 0; for (var i = 0; i < 8; i++) { if (b & 1) p ^= a; var hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x11b; b >>= 1; } return p & 0xff; }
    function gpow(a, e) { var r = 1; while (e > 0) { if (e & 1) r = gmul(r, a); a = gmul(a, a); e = Math.floor(e / 2); } return r; }
    function buildSbox() {
      var sbox = new Array(256), inv = new Array(256);
      function rotl(b, n) { return ((b << n) | (b >> (8 - n))) & 0xff; }
      for (var i = 0; i < 256; i++) {
        if (i === 0) { sbox[0] = 0x63; inv[0] = 0; continue; }
        var inv8 = gpow(i, 254);
        var s = inv8 ^ rotl(inv8, 1) ^ rotl(inv8, 2) ^ rotl(inv8, 3) ^ rotl(inv8, 4) ^ 0x63;
        sbox[i] = s; inv[s] = i;
      }
      return { sbox: sbox, invsbox: inv };
    }
    function invShiftRows(st) { return [st[0], st[13], st[10], st[7], st[4], st[1], st[14], st[11], st[8], st[5], st[2], st[15], st[12], st[9], st[6], st[3]]; }
    function invSubBytes(st, invs) { var o = new Array(16); for (var i = 0; i < 16; i++) o[i] = invs[st[i]]; return o; }
    function addRoundKey(st, w, rd) { var o = st.slice(); for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) o[r + 4 * c] ^= w[rd * 4 + c][r]; return o; }
    function invMixColumns(st) {
      var o = new Array(16);
      for (var c = 0; c < 4; c++) {
        var s0 = st[c * 4], s1 = st[c * 4 + 1], s2 = st[c * 4 + 2], s3 = st[c * 4 + 3];
        o[c * 4] = gmul(s0, 14) ^ gmul(s1, 11) ^ gmul(s2, 13) ^ gmul(s3, 9);
        o[c * 4 + 1] = gmul(s0, 9) ^ gmul(s1, 14) ^ gmul(s2, 11) ^ gmul(s3, 13);
        o[c * 4 + 2] = gmul(s0, 13) ^ gmul(s1, 9) ^ gmul(s2, 14) ^ gmul(s3, 11);
        o[c * 4 + 3] = gmul(s0, 11) ^ gmul(s1, 13) ^ gmul(s2, 9) ^ gmul(s3, 14);
      }
      return o;
    }
    function keyExpansion(kb) {
      var Nk = 4, Nr = 10, w = [];
      for (var i = 0; i < Nk * (Nr + 1); i++) w.push([0, 0, 0, 0]);
      for (var i = 0; i < Nk; i++) for (var j = 0; j < 4; j++) w[i][j] = kb[4 * i + j];
      var rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
      for (var i = Nk; i < Nk * (Nr + 1); i++) {
        var t = [w[i - 1][0], w[i - 1][1], w[i - 1][2], w[i - 1][3]];
        if (i % Nk === 0) { var tmp = t[0]; t[0] = SB.sbox[t[1]] ^ rcon[(i / Nk) - 1]; t[1] = SB.sbox[t[2]]; t[2] = SB.sbox[t[3]]; t[3] = SB.sbox[tmp]; }
        for (var j = 0; j < 4; j++) w[i][j] = w[i - Nk][j] ^ t[j];
      }
      return w;
    }
    var raw = this._atob(cipherB64), ct = [];
    for (var i = 0; i < raw.length; i++) ct.push(raw.charCodeAt(i));
    var kb = [], keyStr = "5V&RoR%Jf@pJPydF";
    for (var i = 0; i < keyStr.length; i++) kb.push(keyStr.charCodeAt(i) & 0xff);
    var iv = [], ivHex = "a79bfa9267e56d57951f5bebf9516ee2";
    for (var i = 0; i < ivHex.length; i += 2) iv.push(parseInt(ivHex.substr(i, 2), 16));
    var SB = buildSbox();
    var w = keyExpansion(kb);
    var invs = SB.invsbox;
    var out = [], prev = iv.slice(), Nr = 10;
    for (var bi = 0; bi < ct.length; bi += 16) {
      var block = ct.slice(bi, bi + 16);
      var st = block.slice();
      st = addRoundKey(st, w, Nr);
      for (var rd = Nr - 1; rd >= 1; rd--) { st = invShiftRows(st); st = invSubBytes(st, invs); st = addRoundKey(st, w, rd); st = invMixColumns(st); }
      st = invShiftRows(st); st = invSubBytes(st, invs); st = addRoundKey(st, w, 0);
      for (var i = 0; i < 16; i++) st[i] ^= prev[i];
      for (var i = 0; i < 16; i++) out.push(st[i]);
      prev = block.slice();
    }
    var last = out[out.length - 1];
    if (last > 0 && last <= 16) out = out.slice(0, out.length - last);
    var s = "";
    for (var i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
    var js = s.indexOf('{"host"');
    if (js > 0) s = s.slice(js);
    else { js = s.indexOf('{"'); if (js > 0) s = s.slice(js); }
    return s;
  }

  _headers() {
    return { "User-Agent": this.UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8", "Accept-Language": "zh-CN", "Referer": this.baseUrl + "/" };
  }
  _abs(href) {
    if (!href) return "";
    href = String(href).trim();
    if (/^https?:\/\//i.test(href)) return href;
    if (href.indexOf("//") === 0) return "https:" + href;
    return this.baseUrl + (href.charAt(0) === "/" ? href : "/" + href);
  }

  // ====== 列表卡片解析（新模板 /manga/<id>）======
  // 卡片容器 li 内：a(/manga/<id>) + img 封面（懒加载 data-src 或 style 背景）
  _list(doc) {
    var comics = [], seen = {};
    var cards = doc.querySelectorAll("li");
    if (!cards.length) cards = doc.querySelectorAll("a[href*='/manga/']");
    for (var k = 0; k < cards.length; k++) {
      var card = cards[k];
      var href = "", title = "";
      var a = null;
      if (card.querySelector) a = card.querySelector("a[href*='/manga/']") || (card.tagName === "A" ? card : card.querySelector("a"));
      else a = card;
      if (!a) continue;
      href = a.attributes.href || "";
      var m = String(href).match(/\/manga\/(\d+)/);
      if (!m || seen[m[1]]) continue;
      seen[m[1]] = true;
      title = String(a.attributes.title || a.text || "").trim();
      if (!title) continue;
      var cover = "";
      var img = card.querySelector ? card.querySelector("img") : null;
      if (img) cover = img.attributes["data-original"] || img.attributes["data-src"] || img.attributes.src || "";
      if (!cover && card.querySelector) {
        var bEl = card.querySelector("[style*='url(']");
        if (bEl) { var sm = String(bEl.attributes.style || "").match(/url\(\s*['"]?(https?:\/\/[^'")]+)/i); if (sm) cover = sm[1]; }
      }
      comics.push(new Comic({ id: this._abs(href), title: title, cover: this._abs(cover) }));
    }
    return comics;
  }

  _maxPage(doc, cur) {
    var max = cur || 1;
    var as = doc.querySelectorAll("a[href*='page=']");
    for (var i = 0; i < as.length; i++) {
      var h = as[i].attributes.href || "";
      var m = h.match(/page=(\d+)/);
      if (m) { var n = parseInt(m[1]); if (n > max) max = n; }
    }
    return max;
  }

  _listPage(pathTpl, page) {
    return (async () => {
      var p = page || 1;
      var url = this.baseUrl + pathTpl.replace("{p}", p);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
    })();
  }

  explore = [
    { title: "最近更新", type: "multiPageComicList", load: async (page) => this._listPage("/manga/library?orderby=2&page={p}", page) },
    { title: "全部漫画", type: "multiPageComicList", load: async (page) => this._listPage("/manga/library?page={p}&ranktype=1&count=24", page) }
  ];

  search = {
    load: async (keyword, opts, page) => {
      var p = page || 1;
      var url = this.baseUrl + "/manga/library?keyword=" + encodeURIComponent(keyword) + "&page=" + p;
      try {
        var res = await Network.get(url, this._headers());
        if (res.status !== 200) return { comics: [], maxPage: 0 };
        var doc = new HtmlDocument(res.body);
        return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
      } catch (e) { return { comics: [], maxPage: 0 }; }
    }
  };

  // ====== 分类（新模板 type=1 国漫 / 2 韩漫 / 3 日漫）======
  category = {
    title: "开心看漫画",
    parts: [
      {
        name: "地区", type: "fixed", itemType: "category",
        categories: ["全部", "国漫", "韩漫", "日漫"],
        categoryParams: ["", "&type=1", "&type=2", "&type=3"]
      }
    ],
    enableRankingPage: false
  };
  categoryComics = {
    load: async (category, param, options, page) => {
      var p = page || 1;
      var t = (param || "").replace(/^&/, "");
      var url = this.baseUrl + "/manga/library?page=" + p + "&ranktype=1&count=24" + (t ? "&" + t : "");
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
    }
  };

  comic = {
    loadInfo: async (id) => {
      var url = this._abs(id);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var doc = new HtmlDocument(html);
      var mid = String(url).match(/\/manga\/(\d+)/);

      // 标题：og:title / <title> / h1
      var title = "";
      var tm = html.match(/property="og:title"[^>]*content="([^"]+)"/i);
      if (tm) title = tm[1].trim();
      if (!title) { var h1 = doc.querySelector("h1"); if (h1) title = (h1.text || "").trim(); }
      if (!title) { var tt = html.match(/<title>([^<]+)/); if (tt) title = tt[1].replace(/[-_].*(漫画|免费|阅读).*$/, "").trim(); }

      // 封面：og:image / img.imh99.top / style 背景 / 选择器，多路兜底
      var cover = "";
      var ogi = html.match(/property="og:image"[^>]*content="([^"]+)"/i);
      if (ogi) cover = ogi[1];
      if (!cover) {
        var im = html.match(/<img[^>]+src="(https?:\/\/img\.imh99\.top\/[^"]+)"/i) || html.match(/<img[^>]+data-src="(https?:\/\/img\.imh99\.top\/[^"]+)"/i);
        if (im) cover = im[1];
      }
      if (!cover) {
        var bm = html.match(/background(?:-image)?\s*:\s*url\(\s*['"]?(https?:\/\/img\.imh99\.top\/[^'")]+)/i);
        if (bm) cover = bm[1];
      }
      if (!cover) {
        var cov = doc.querySelector(".detail-cover img, .comic-cover img, .cover img, img.lazy");
        if (cov) cover = cov.attributes["data-original"] || cov.attributes["data-src"] || cov.attributes.src || "";
      }

      // 作者/最近更新/标签/分类（文本正则，新模板确认结构："作者：xx 别名：xx / 漫画分类：/ 最近更新：/ 标签："）
      var author = "", updateTime = "", kind = "";
      var am = html.match(/作者[：:]\s*([^<\n]{2,40})/);
      if (am) author = am[1].trim();
      var um = html.match(/最近更新[：:]\s*([\d\-]+)/);
      if (um) updateTime = um[1].trim();
      var km = html.match(/标签[：:]\s*([^<\n]{2,80})/);
      if (km) kind = km[1].trim();

      var desc = "";
      var dm = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
      if (dm) desc = dm[1].trim();
      if (!desc) { var ogd = html.match(/property="og:description"[^>]*content="([^"]+)"/i); if (ogd) desc = ogd[1].trim(); }

      var tags = {};
      if (kind) {
        var arr = kind.split(/\s+/).filter(function (x) { return x && x.length <= 8; });
        if (arr.length) tags["标签"] = arr;
      }

      var status = "unknown";
      if (/完结/.test(html)) status = "completed"; else if (/连载/.test(html)) status = "ongoing";

      // 章节：新模板 /manga/<id>/detail/<章节id>
      var chapters = new Map();
      var seen = {};
      var chs = doc.querySelectorAll("a[href*='/detail/']");
      if (!chs.length && mid) chs = doc.querySelectorAll("a[href*='/manga/" + mid[1] + "/']");
      if (!chs.length) chs = doc.querySelectorAll("a[href*='/read/'], a[href*='/chapter/']");
      for (var c = 0; c < chs.length; c++) {
        var a = chs[c];
        var h = String(a.attributes.href || "");
        if (!h || /\/manga\/\d+$/.test(h) || /javascript:/.test(h) || h.indexOf("/detail/") < 0 && h.indexOf("/read/") < 0 && h.indexOf("/chapter/") < 0) continue;
        var t = String(a.text || "").trim();
        if (!t || t.length > 40) continue;
        var full = this._abs(h);
        if (seen[full]) continue;
        seen[full] = 1;
        chapters.set(full, t);
      }
      if (!chapters.size) {
        // 兜底：og:novel:latest_chapter_url 等
        var om = html.match(/property="og:novel:latest_chapter_url"[^>]*content="([^"]+)"/i);
        if (om) chapters.set(this._abs(om[1]), "最新话");
      }
      return new ComicDetails({ id: url, title: title, cover: this._abs(cover), author: author, description: desc, tags: tags, status: status, updateTime: updateTime, chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var doc = new HtmlDocument(html);
      var images = [];
      var seen = {};

      // 1) 新模板：img 直接 src（img.imh99.top / webtoon/content）
      var imgs = doc.querySelectorAll("img[src*='imh99.top'], img[data-original*='imh99.top'], img[src*='/webtoon/content/']");
      if (!imgs.length) imgs = doc.querySelectorAll("img");
      for (var i = 0; i < imgs.length; i++) {
        var u = String(imgs[i].attributes["data-original"] || imgs[i].attributes["data-src"] || imgs[i].attributes.src || "").trim();
        if (!u || seen[u]) continue;
        if (!/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(u)) continue;
        // 过滤站内 logo/图标（非内容图）
        if (/kxmanhua\.com\/(img|static)\//i.test(u)) continue;
        seen[u] = 1;
        images.push(this._abs(u));
      }

      // 2) 兜底：旧模板 params AES（开心漫 CMS 同款）
      if (!images.length) {
        var pm = html.match(/var\s+params\s*=\s*['"]([^'"]{50,})['"]/);
        if (pm) {
          try {
            var dec = this._aes(pm[1]);
            var obj = JSON.parse(dec);
            var host = (obj.images_hosts && obj.images_hosts[0]) || (obj.host ? "https://" + obj.host : "");
            var arr = obj.chapter_images || obj.images || [];
            for (var i = 0; i < arr.length; i++) {
              if (!arr[i]) continue;
              images.push(/^https?:/.test(arr[i]) ? arr[i] : (host + arr[i]));
            }
          } catch (e) { }
        }
      }
      return { images: images };
    },

    onImageLoad: (url) => ({ url: url, headers: { "User-Agent": "Mozilla/5.0 Chrome/126", "Referer": "https://kxmanhua.com/", "Accept": "image/webp,image/*" } }),
    idMatch: "(\\/manga\\/\\d+)"
  };
}
