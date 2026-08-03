/**
 * 开心看漫画新站 (kxmanhua.com) —— Venera 漫画源 v1.0.0
 * 开心漫 CMS，与 www.kaixinman.com 完全同模板（列表/详情/搜索 HTML 解析 + 阅读页 AES 解密）。
 * 已实测确认：
 *   列表/搜索 DOM： li.col-md-6.col-sm-4.col-xs-3 -> a(/comic/<id>) + .comic-cover.lazy[data-original] + h4 a
 *   详情页 DOM：    h1 span（标题） / .comic-cover img[data-original] / 作者：/简介：/ .chapter-list li a(/chapter/<id>)
 *   阅读页：        var params = '...'  AES-128-CBC 解密 -> {"chapter_images":[...], "images_hosts":[...]}，图片 = hosts[0] + images[i]
 *                  key = "5V&RoR%Jf@pJPydF", iv = "a79bfa9267e56d57951f5bebf9516ee2"
 */
class kxmanhua extends ComicSource {
  name = "开心看漫画";
  key = "kxmanhua";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://kxmanhua.com";
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

  // ====== AES-128-CBC 解密（与 kaixinman 同密钥，已验证）======
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

  // 列表卡片解析
  _list(doc) {
    var comics = [], seen = {};
    var cards = doc.querySelectorAll(".col-md-6.col-sm-4.col-xs-3");
    for (var k = 0; k < cards.length; k++) {
      var card = cards[k];
      var link = card.querySelector("a[href*='/comic/']") || card.querySelector("a");
      var href = link ? (link.attributes.href || "") : "";
      if (!href || !/\/comic\//.test(href) || seen[href]) continue;
      seen[href] = true;
      var cover = "";
      var cov = card.querySelector(".comic-cover.lazy, .comic-cover");
      if (cov) cover = cov.attributes["data-original"] || cov.attributes["data-src"] || cov.attributes.src || "";
      var title = "";
      var t = card.querySelector("h4"); if (t) title = t.text.trim();
      if (!title) title = (link.attributes.title || "").trim();
      if (!title) continue;
      comics.push(new Comic({ id: href, title: title, cover: cover }));
    }
    return comics;
  }

  _maxPage(doc, cur) {
    var max = cur;
    var as = doc.querySelectorAll("a[href*='page']");
    for (var i = 0; i < as.length; i++) {
      var h = as[i].attributes.href || "";
      var m = h.match(/page\/(\d+)/);
      if (m) { var n = parseInt(m[1]); if (n > max) max = n; }
    }
    return max;
  }

  _listPage(prefix, page) {
    return (async () => {
      var p = page || 1;
      var url = this.baseUrl + prefix + "/" + p;
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
    })();
  }

  _updatePage(page) {
    return (async () => {
      var p = page || 1;
      var url = p > 1 ? this.baseUrl + "/update/page/" + p : this.baseUrl + "/update";
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
    })();
  }

  explore = [
    { title: "最近更新", type: "multiPageComicList", load: async (page) => this._updatePage(page || 1) },
    { title: "全部漫画", type: "multiPageComicList", load: async (page) => this._listPage("/category/page", page || 1) },
    { title: "排行榜", type: "multiPageComicList", load: async (page) => this._listPage("/ranking", page || 1) },
    { title: "国内漫画", type: "multiPageComicList", load: async (page) => this._listPage("/category/area/guonei/page", page || 1) },
    { title: "日本漫画", type: "multiPageComicList", load: async (page) => this._listPage("/category/area/riben/page", page || 1) },
    { title: "韩国漫画", type: "multiPageComicList", load: async (page) => this._listPage("/category/area/hanguo/page", page || 1) },
    { title: "欧美漫画", type: "multiPageComicList", load: async (page) => this._listPage("/category/area/oumei/page", page || 1) },
    { title: "热血", type: "multiPageComicList", load: async (page) => this._listPage("/category/theme/rexue/page", page || 1) },
    { title: "玄幻", type: "multiPageComicList", load: async (page) => this._listPage("/category/theme/xuanhuan/page", page || 1) },
    { title: "都市", type: "multiPageComicList", load: async (page) => this._listPage("/category/theme/dushi/page", page || 1) },
    { title: "冒险", type: "multiPageComicList", load: async (page) => this._listPage("/category/theme/maoxian/page", page || 1) },
    { title: "武侠", type: "multiPageComicList", load: async (page) => this._listPage("/category/theme/wuxia/page", page || 1) },
  ];

  search = {
    load: async (keyword, opts, page) => {
      var p = page || 1;
      var url = this.baseUrl + "/search?q=" + encodeURIComponent(keyword) + "&page=" + p;
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
    }
  };

  category = {
    title: "分类",
    parts: [
      {
        name: "地区", type: "fixed", itemType: "category",
        categories: ["国内", "日本", "韩国", "欧美"],
        categoryParams: ["/category/area/guonei/page", "/category/area/riben/page", "/category/area/hanguo/page", "/category/area/oumei/page"]
      },
      {
        name: "题材", type: "fixed", itemType: "category",
        categories: ["全部", "热血", "仙侠", "玄幻", "都市", "冒险", "武侠", "格斗", "科幻", "搞笑", "后宫", "恋爱", "校园", "恐怖", "悬疑", "动作", "同人", "穿越"],
        categoryParams: ["/category/page", "/category/theme/rexue/page", "/category/theme/xianxia/page", "/category/theme/xuanhuan/page", "/category/theme/dushi/page", "/category/theme/maoxian/page", "/category/theme/wuxia/page", "/category/theme/gedou/page", "/category/theme/kehuan/page", "/category/theme/gaoxiao/page", "/category/theme/hougong/page", "/category/theme/lianai/page", "/category/theme/xiaoyuan/page", "/category/theme/kongbu/page", "/category/theme/xuanyi/page", "/category/theme/dongzuo/page", "/category/theme/tongren/page", "/category/theme/chuanyue/page"]
      }
    ],
    enableRankingPage: false
  };
  categoryComics = {
    load: async (category, param, options, page) => {
      return await this._listPage(param || "/category/page", page || 1);
    }
  };

  comic = {
    loadInfo: async (id) => {
      var res = await Network.get(this.baseUrl + id, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var html = res.body;

      var title = "";
      var sp = doc.querySelector("h1 span");
      if (sp) title = sp.text.trim();
      if (!title) { var h1 = doc.querySelector("h1"); if (h1) title = h1.text.trim(); }

      var cover = "";
      var cov = doc.querySelector(".comic-cover img, img.comic-cover, .lazy[data-original]");
      if (cov) cover = cov.attributes["data-original"] || cov.attributes.src || "";

      var author = "";
      var am = html.match(/作者[：:]\s*([^<\n]{2,20})/); if (am) author = am[1].trim();

      var desc = "";
      var dm = html.match(/class="desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      if (!dm) dm = html.match(/class="desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (dm) desc = dm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!desc) { var dd = doc.querySelector(".comic-detail p.desc"); if (dd) desc = dd.text.trim(); }

      var tags = {};
      var tEls = doc.querySelectorAll("a[href*='/category/theme/']");
      var tl = [];
      for (var i = 0; i < tEls.length; i++) { var t = tEls[i].text.trim(); if (t && tl.indexOf(t) < 0) tl.push(t); }
      if (tl.length) tags["题材"] = tl;

      var status = "unknown";
      if (/完结/.test(html)) status = "completed"; else if (/连载/.test(html)) status = "ongoing";

      var chapters = new Map();
      var chs = doc.querySelectorAll(".chapter-list li a, a[href*='/chapter/']");
      for (var c = 0; c < chs.length; c++) {
        var a = chs[c];
        var h = a.attributes.href || "";
        if (!h || !/chapter/.test(h)) continue;
        var t = a.text.trim();
        if (t) chapters.set(h, t);
      }
      return new ComicDetails({ id: id, title: title, cover: cover, author: author, description: desc, tags: tags, status: status, chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this.baseUrl + epId, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var pm = html.match(/var\s+params\s*=\s*['"]([^'"]{50,})['"]/);
      if (!pm) return { images: [] };
      try {
        var dec = this._aes(pm[1]);
        var obj = JSON.parse(dec);
        var host = (obj.images_hosts && obj.images_hosts[0]) || "https://s2.bzcdn.net";
        var imgs = obj.chapter_images || [];
        var images = [];
        for (var i = 0; i < imgs.length; i++) { if (imgs[i]) images.push(host + imgs[i]); }
        return { images: images };
      } catch (e) { return { images: [] }; }
    },

    onImageLoad: (url) => ({ url: url, headers: { "User-Agent": "Mozilla/5.0 Chrome/126", "Referer": "https://kxmanhua.com/", "Accept": "image/webp,image/*" } }),
    idMatch: "(\\/comic\\/[A-Za-z0-9]+)"
  };
}
