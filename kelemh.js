/**
 * 可乐漫画 (www.kelemh.com) —— Venera 漫画源 v4.1
 * ===============================================================
 * 修复:
 *  - AES-128-CBC 解密 (干净实现, 已用 Node crypto 验证)
 *  - 搜索使用真实参数 ?q= (原 keyword= 只返回热门列表)
 *  - 封面: 直接遍历 .comic-cover 卡片读 data-original (卡片是链接的祖先, 非后代)
 *  - 详情封面按当前漫画 id 匹配 data-original, 避免误取底部"猜你喜欢"
 * 图片: 解密 chapter_images 原始URL, 经 images_domain + btoa 构造代理地址
 */
class KeLeMH extends ComicSource {
  name = "可乐漫画";
  key = "kelemh";
  version = "4.2.0";
  minAppVersion = "1.0.0";
  url = "";
  baseUrl = "https://www.kelemh.com";
  UA = "Mozilla/5.0 Chrome/126.0.0.0";

  // ====== 通用工具 (顶层函数, 不依赖 this) ======
  // atob polyfill (canonical, terminates on empty char)
  _atob(s) {
    var c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    s = String(s).replace(/=+$/, "");
    var o = "", bs, b, idx = 0;
    for (var i = 0; (b = s.charAt(idx++)); ) {
      b = c.indexOf(b);
      if (~b) {
        bs = i % 4 ? bs * 64 + b : b;
        if (i++ % 4) o += String.fromCharCode(255 & (bs >> ((-2 * i) & 6)));
      }
    }
    return o;
  }
  // btoa polyfill
  _btoa(s) {
    var c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o = "";
    for (var i = 0; i < s.length; i += 3) {
      var a = s.charCodeAt(i), b = i + 1 < s.length ? s.charCodeAt(i + 1) : 0, cc = i + 2 < s.length ? s.charCodeAt(i + 2) : 0;
      o += c[a >> 2] + c[((a & 3) << 4) | (b >> 4)] + (i + 1 < s.length ? c[((b & 15) << 2) | (cc >> 6)] : "=") + (i + 2 < s.length ? c[cc & 63] : "=");
    }
    return o;
  }

  // ====== AES-128-CBC 解密 (纯JS实现, 已验证) ======
  _aes(cipherB64) {
    function gmul(a, b) { var p = 0; for (var i = 0; i < 8; i++) { if (b & 1) p ^= a; var hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x11b; b >>= 1; } return p & 0xff; }
    function gpow(a, e) { var r = 1; while (e > 0) { if (e & 1) r = gmul(r, a); a = gmul(a, a); e = Math.floor(e / 2); } return r; }
    function buildSbox() {
      var sbox = new Array(256), inv = new Array(256);
      function rotl(b, n) { return ((b << n) | (b >> (8 - n))) & 0xff; }
      for (var i = 0; i < 256; i++) {
        if (i === 0) { sbox[0] = 0x63; inv[0] = 0; continue; }
        var inv8 = gpow(i, 254); // 乘法逆元 (a^254 = a^-1 in GF(2^8))
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
    // PKCS7 去填充
    var last = out[out.length - 1];
    if (last > 0 && last <= 16) out = out.slice(0, out.length - last);
    var s = "";
    for (var i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
    // 跳过首块 IV 前缀乱码, 从 JSON 开始截取
    var js = s.indexOf('{"host"');
    if (js > 0) s = s.slice(js);
    else { js = s.indexOf('{"'); if (js > 0) s = s.slice(js); }
    return s;
  }

  // ====== 浏览 ======
  explore = [
    {
      title: "首页推荐", type: "multiPartPage",
      load: async () => {
        var res = await Network.get("https://www.kelemh.com/", { "User-Agent": "Mozilla/5.0 Chrome/126", Referer: "https://www.kelemh.com/", Accept: "text/html", "Accept-Language": "zh-CN" });
        if (res.status !== 200) throw "HTTP " + res.status;
        var doc = new HtmlDocument(res.body);
        var comics = keleList(doc);
        return [{ title: "推荐", comics: comics, viewMore: null }];
      }
    },
    {
      title: "国漫周榜", type: "multiPageComicList",
      load: async (page) => {
        var p = page || 1;
        var res = await Network.get("https://www.kelemh.com/fenlei/area/guonei" + (p > 1 ? "?page=" + p : ""), { "User-Agent": "Mozilla/5.0 Chrome/126", Referer: "https://www.kelemh.com/", Accept: "text/html", "Accept-Language": "zh-CN" });
        if (res.status !== 200) throw "HTTP " + res.status;
        var doc = new HtmlDocument(res.body);
        var comics = keleList(doc);
        var maxPage = p, pls = doc.querySelectorAll("a[href*='page'], a[href*='/p/']");
        for (var i = 0; i < pls.length; i++) { var pm = (pls[i].attributes["href"] || "").match(/(?:page|p)[=\/](\d+)/i); if (pm) maxPage = Math.max(maxPage, parseInt(pm[1])); }
        return { comics: comics, maxPage: maxPage };
      }
    },
  ];

  // ====== 搜索 (真实参数 ?q=) ======
  search = {
    enableTagsSuggestions: false, onTagSuggestionSelected: null,
    load: async (keyword) => {
      var res = await Network.get("https://www.kelemh.com/sousuo?q=" + encodeURIComponent(keyword), { "User-Agent": "Mozilla/5.0 Chrome/126", Referer: "https://www.kelemh.com/", Accept: "text/html", "Accept-Language": "zh-CN" });
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res.body);
      var comics = keleList(doc);
      return { comics: comics, maxPage: 1 };
    },
  };

  // ====== 分类 ======
  // 站点真实分类维度: 地区(area) 与 题材(theme), 均已逐条验证返回过滤后的"漫画检索"页
  // param 统一带维度前缀 (area/xxx 或 theme/xxx), load 据此拼出 /fenlei/<param>
  category = {
    title: "分类",
    parts: [
      { name: "地区", type: "fixed", categories: ["国内", "日本", "韩国", "欧美"], itemType: "category", categoryParams: ["area/guonei", "area/riben", "area/hanguo", "area/oumei"] },
      { name: "题材", type: "fixed", categories: ["玄幻", "后宫", "热血", "武侠", "科幻", "恋爱", "耽美", "奇幻", "冒险", "校园", "搞笑"], itemType: "category", categoryParams: ["theme/xuanhuan", "theme/hougong", "theme/rexue", "theme/wuxia", "theme/kehuan", "theme/lianai", "theme/danmei", "theme/qihuan", "theme/maoxian", "theme/xiaoyuan", "theme/gaoxiao"] }
    ],
    enableRankingPage: false
  };
  categoryComics = {
    load: async (category, param, options, page) => {
      var p = page || 1;
      var res = await Network.get("https://www.kelemh.com/fenlei/" + (param || "area/guonei") + (p > 1 ? "?page=" + p : ""), { "User-Agent": "Mozilla/5.0 Chrome/126", Referer: "https://www.kelemh.com/", Accept: "text/html", "Accept-Language": "zh-CN" });
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var comics = keleList(doc);
      var maxPage = p, pls = doc.querySelectorAll("a[href*='page'], a[href*='/p/']");
      for (var i = 0; i < pls.length; i++) { var pm = (pls[i].attributes["href"] || "").match(/(?:page|p)[=\/](\d+)/i); if (pm) maxPage = Math.max(maxPage, parseInt(pm[1])); }
      return { comics: comics, maxPage: maxPage };
    }
  };

  // ====== 详情 + 章节图片 ======
  comic = {
    loadInfo: async (id) => {
      var res = await Network.get("https://www.kelemh.com" + id, { "User-Agent": "Mozilla/5.0 Chrome/126", Referer: "https://www.kelemh.com/", Accept: "text/html", "Accept-Language": "zh-CN" });
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body, doc = new HtmlDocument(html);
      var title = (doc.querySelector("h1") || doc.querySelector("title") || { text: "" }).text.trim();
      var cid = id.replace("/manhua/", "").replace(/\/$/, "");

      // 封面: 优先取 data-original 含当前漫画 id 的 .comic-cover (排除底部"猜你喜欢")
      var cover = "";
      var covCards = doc.querySelectorAll(".comic-cover, .book-cover, .cover");
      for (var cci = 0; cci < covCards.length; cci++) {
        var d0 = covCards[cci].attributes["data-original"] || covCards[cci].attributes["data-src"] || covCards[cci].attributes["src"] || "";
        if (d0 && d0.indexOf("/manhua/" + cid) >= 0) { cover = d0; break; }
      }
      // 退一步: 取第一个含 data-original 的封面卡片
      if (!cover) for (var cci = 0; cci < covCards.length; cci++) {
        var d1 = covCards[cci].attributes["data-original"] || covCards[cci].attributes["data-src"] || covCards[cci].attributes["src"] || "";
        if (d1) { cover = d1; break; }
      }
      // 再退: 详情页主图若直接是 <img>
      if (!cover) { var im = doc.querySelector("img[src*='/manhua/'], img[data-original*='/manhua/']"); cover = im ? (im.attributes["data-original"] || im.attributes["src"] || "") : ""; }
      // 保底: 按 id 拼接
      if (!cover || cover.indexOf("http") !== 0) cover = "https://img.kelemh.com/manhua/" + cid + ".webp";

      var author = (html.match(/作者[：:]\s*([^<\n]{2,20})/) || [])[1] || "";
      var status = "unknown", sm = html.match(/状态[：:]\s*([^<\n]{1,10})/);
      if (sm) status = /完/.test(sm[1]) ? "completed" : "ongoing";
      var dm = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/);
      var desc = dm ? dm[1].trim() : "";
      var tEls = doc.querySelectorAll("a[href*='/fenlei/theme/'], a[href*='/fenlei/area/']");
      var tags = [];
      for (var i = 0; i < tEls.length; i++) { var t = tEls[i].text.trim(); if (t && t.length < 10) tags.push(t); }
      var chapters = new Map();
      var chs = doc.querySelectorAll("a[href*='.html']");
      for (var i = 0; i < chs.length; i++) {
        var a = chs[i];
        var href = a.attributes["href"];
        if (!href || !/\/manhua\/[A-Za-z0-9]+\/\d+\.html$/.test(href)) continue;
        var t = a.text.trim(); if (t && t !== "立即阅读") chapters.set(href, t);
      }
      return new ComicDetails({ id: id, title: title, cover: cover, author: author, description: desc, tags: tags.length > 0 ? { "标签": tags } : {}, status: status, chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get("https://www.kelemh.com" + epId, { "User-Agent": "Mozilla/5.0 Chrome/126", Referer: "https://www.kelemh.com/", Accept: "text/html", "Accept-Language": "zh-CN" });
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var pm = html.match(/var params\s*=\s*['"]([^'"]{100,})['"]/);
      if (!pm) return { images: [] };
      try {
        var dec = this._aes(pm[1]);
        var obj = JSON.parse(dec);
        var raw = obj.chapter_images || [];
        var domain = obj.images_domain || "https://two.mhpic.net/";
        var images = [];
        for (var i = 0; i < raw.length; i++) images.push(domain + this._btoa(raw[i]));
        return { images: images };
      } catch (e) {
        return { images: [] };
      }
    },

    onImageLoad: (url) => ({ url: url, headers: { "User-Agent": "Mozilla/5.0 Chrome/126", Referer: "https://www.kelemh.com/", Accept: "image/webp,image/*" } }),
    idMatch: "(/manhua/[A-Za-z0-9]+)",
    enableTagsTranslate: false,
  };
}

// ====== 列表/封面提取 (顶层函数, 不依赖 this) ======
// 站点 DOM: <div class="comic-cover lazy" title="漫画名" data-original="封面URL">
//            <span class="name">连载</span>
//            <a class="thumb-link" href="/manhua/ID"></a>   ← 链接在封面卡片【内部/后代】
//         所以必须遍历 .comic-cover 卡片本身, 而非在 <a> 里找 .comic-cover
function keleCoverFromCard(card) {
  if (!card) return "";
  return card.attributes["data-original"] || card.attributes["data-src"] || card.attributes["src"] || "";
}
function keleList(doc) {
  var comics = [], seen = {}, k;
  // 主路径: 遍历每张封面卡片 (.comic-cover / .book-cover / .cover)
  var cards = doc.querySelectorAll(".comic-cover, .book-cover, .cover");
  for (k = 0; k < cards.length; k++) {
    var card = cards[k];
    var cover = keleCoverFromCard(card);
    var link = card.querySelector("a[href*='/manhua/']");
    var href = link ? link.attributes["href"] : "";
    if (!href || !/^\/manhua\/[A-Za-z0-9]+$/.test(href) || seen[href]) continue;
    seen[href] = true;
    var title = (card.attributes["title"] || "").trim();
    if (!title) { var t = card.querySelector("h4 a, .title a, a"); if (t) title = t.text.trim(); }
    if (!title || title.length >= 80) continue;
    comics.push(new Comic({ id: href, title: title, cover: cover }));
  }
  // 兜底: 极少数页面卡片结构不同, 回退到 /manhua/ 链接 (封面取链接内 img)
  if (comics.length === 0) {
    var links = doc.querySelectorAll("a[href*='/manhua/']");
    for (k = 0; k < links.length; k++) {
      var a = links[k];
      var h = a.attributes["href"];
      if (!h || !/^\/manhua\/[A-Za-z0-9]+$/.test(h) || seen[h]) continue;
      seen[h] = true;
      var img = a.querySelector("img");
      var cov = img ? (img.attributes["data-original"] || img.attributes["src"] || "") : "";
      var ti = a.attributes["title"] || a.text.trim();
      if (!ti || ti.length >= 80) continue;
      comics.push(new Comic({ id: h, title: ti, cover: cov }));
    }
  }
  return comics;
}
