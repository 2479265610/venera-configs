/**
 * 读漫屋2 (m.dumanwu.org) —— Venera 漫画源 v1.0.0
 * 由 legado 书源「读漫屋」移植（远程规则 qyyuapi.com/sy/js/读漫屋/*.js 反混淆后还原）。
 *
 * 注意：读漫屋2 与「读漫屋」(dumanwu1.com) 是【不同模板】，无法合并为单源换域名：
 *   - 读漫屋 (dmw)： 列表 .likedata / 详情 .name_mh / 阅读页 异或+base64
 *   - 读漫屋2(dmw2)：列表 .rankList li / 详情 .title+.subtitle / 阅读页 AES-128-CBC
 * 故本文件单独成源，默认域名 https://m.dumanwu.org，可在 App 内切换至 www.dumanwu.org。
 *
 * 站点模板（dmw2 / m. 移动端）：
 *   列表：    .rankList li -> a(/comic/<hash>) + img[src] + .info .title / .subtitle / .bottom
 *   搜索：    /search/<关键词>/<页>   （结果同 .rankList li）
 *   分类：    /category/tags/<id>{/list/N}{/finish/N}{/order/hits|addtime}/page/<页>
 *   详情：    .title 标题 / .subtitle:contains(者：|态：|型：) / .top 更新时间 / .cover 封面 / .detailContent 简介 / .chapterList a 章节
 *   阅读：    body 内联 <script> 中 var params='<base64>'
 *            base64 解码 -> [iv(16字节) + 密文]；AES-128-CBC/PKCS7，key="9S8$vJnU2ANeSRoF"，iv=前16字节
 *            解密 JSON 的 images[] 为图片 URL；相对路径补全 https://img1.baipiaoguai.org
 */
class dmw2 extends ComicSource {
  name = "读漫屋2";
  key = "dmw2";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/dumanwu2.js";

  // ====== 可切换镜像 ======
  static DOMAINS = ["https://m.dumanwu.org", "https://www.dumanwu.org"];
  settings = {
    domain: {
      title: "站点域名",
      type: "select",
      options: [
        { value: "https://m.dumanwu.org" },
        { value: "https://www.dumanwu.org" }
      ],
      default: "https://m.dumanwu.org"
    }
  };
  get baseUrl() {
    try {
      var d = this.loadSetting("domain");
      if (d && /^https?:\/\//i.test(d)) return String(d).replace(/\/+$/, "");
    } catch (e) { }
    return "https://m.dumanwu.org";
  }

  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0";

  // ====== base64 / 字节工具 ======
  _atob(s) {
    var c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    s = String(s).replace(/[\r\n\s]/g, "").replace(/=+$/, "");
    var o = "", bs, b, idx = 0;
    for (var i = 0; (b = s.charAt(idx++));) {
      b = c.indexOf(b);
      if (~b) { bs = i % 4 ? bs * 64 + b : b; if (i++ % 4) o += String.fromCharCode(255 & (bs >> ((-2 * i) & 6))); }
    }
    return o;
  }
  // 字节数组 -> UTF-8 文本
  _bytesUtf8(bytes) {
    try {
      var pct = "";
      for (var i = 0; i < bytes.length; i++) pct += "%" + ("00" + bytes[i].toString(16)).slice(-2);
      return decodeURIComponent(pct);
    } catch (e) {
      var s = ""; for (var j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]); return s;
    }
  }

  _headers(extra) {
    var h = {
      "User-Agent": this.UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": this.baseUrl + "/"
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  _abs(href) {
    if (!href) return "";
    href = String(href).trim();
    if (/^https?:\/\//i.test(href)) return href;
    if (href.indexOf("//") === 0) return "http:" + href;
    return this.baseUrl + (href.charAt(0) === "/" ? href : "/" + href);
  }

  // ====== AES-128-CBC / PKCS7（纯 JS，无 crypto 依赖）======
  static KEY = "9S8$vJnU2ANeSRoF";
  static _SBOX = null;
  static _INVSBOX = null;
  static _buildTables() {
    if (dmw2._SBOX) return;
    function gmul(a, b) { var p = 0; for (var i = 0; i < 8; i++) { if (b & 1) p ^= a; var hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x11b; b >>= 1; } return p & 0xff; }
    function gpow(a, e) { var r = 1; while (e > 0) { if (e & 1) r = gmul(r, a); a = gmul(a, a); e = Math.floor(e / 2); } return r; }
    function rotl(b, n) { return ((b << n) | (b >> (8 - n))) & 0xff; }
    var sbox = new Array(256), inv = new Array(256);
    for (var i = 0; i < 256; i++) {
      if (i === 0) { sbox[0] = 0x63; inv[0] = 0; continue; }
      var inv8 = gpow(i, 254);
      var s = inv8 ^ rotl(inv8, 1) ^ rotl(inv8, 2) ^ rotl(inv8, 3) ^ rotl(inv8, 4) ^ 0x63;
      sbox[i] = s; inv[s] = i;
    }
    dmw2._SBOX = sbox; dmw2._INVSBOX = inv;
  }
  _keyExpansion(kb) {
    dmw2._buildTables();
    var sbox = dmw2._SBOX;
    var Nk = 4, Nr = 10, w = [];
    for (var i = 0; i < Nk * (Nr + 1); i++) w.push([0, 0, 0, 0]);
    for (var i = 0; i < Nk; i++) for (var j = 0; j < 4; j++) w[i][j] = kb[4 * i + j];
    var rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
    for (var i = Nk; i < Nk * (Nr + 1); i++) {
      var t = [w[i - 1][0], w[i - 1][1], w[i - 1][2], w[i - 1][3]];
      if (i % Nk === 0) {
        var tmp = t[0];
        t[0] = sbox[t[1]] ^ rcon[(i / Nk) - 1];
        t[1] = sbox[t[2]];
        t[2] = sbox[t[3]];
        t[3] = sbox[tmp];
      }
      for (var j = 0; j < 4; j++) w[i][j] = w[i - Nk][j] ^ t[j];
    }
    return w;
  }
  _aesDecBlock(st, w, Nr) {
    var invs = dmw2._INVSBOX;
    function gmul(a, b) { var p = 0; for (var i = 0; i < 8; i++) { if (b & 1) p ^= a; var hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x11b; b >>= 1; } return p & 0xff; }
    function invShiftRows(st) { return [st[0], st[13], st[10], st[7], st[4], st[1], st[14], st[11], st[8], st[5], st[2], st[15], st[12], st[9], st[6], st[3]]; }
    function invSubBytes(st) { var o = new Array(16); for (var i = 0; i < 16; i++) o[i] = invs[st[i]]; return o; }
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
    var state = st.slice();
    state = addRoundKey(state, w, Nr);
    for (var r = Nr - 1; r >= 1; r--) {
      state = invShiftRows(state);
      state = invSubBytes(state);
      state = addRoundKey(state, w, r);
      state = invMixColumns(state);
    }
    state = invShiftRows(state);
    state = invSubBytes(state);
    state = addRoundKey(state, w, 0);
    return state;
  }
  _aesCbcDecrypt(b64) {
    dmw2._buildTables();
    var raw = this._atob(b64);
    var bytes = [];
    for (var i = 0; i < raw.length; i++) bytes.push(raw.charCodeAt(i) & 0xff);
    if (bytes.length < 16) return "";
    var iv = bytes.slice(0, 16);
    var ct = bytes.slice(16);
    var key = [];
    for (var i = 0; i < dmw2.KEY.length; i++) key.push(dmw2.KEY.charCodeAt(i) & 0xff);
    var w = this._keyExpansion(key);
    var pt = [];
    var prev = iv.slice();
    for (var off = 0; off < ct.length; off += 16) {
      var block = ct.slice(off, off + 16);
      while (block.length < 16) block.push(0);
      var dec = this._aesDecBlock(block, w, 10);
      for (var i = 0; i < 16; i++) pt.push(dec[i] ^ prev[i]);
      prev = ct.slice(off, off + 16);
    }
    // PKCS7 去填充
    if (pt.length) {
      var pad = pt[pt.length - 1];
      if (pad >= 1 && pad <= 16) {
        var ok = true;
        for (var i = pt.length - pad; i < pt.length; i++) if (pt[i] !== pad) { ok = false; break; }
        if (ok) pt = pt.slice(0, pt.length - pad);
      }
    }
    return this._bytesUtf8(pt);
  }

  // ====== 列表解析（兼容 .rankList li 与 PC .list .ib.item）======
  _list(doc) {
    var comics = [], seen = {};
    var items = doc.querySelectorAll(".rankList li");
    var mode = "rank";
    if (!items || !items.length) { items = doc.querySelectorAll(".list .ib.item"); mode = "list"; }

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var a = it.querySelector("a[href*='/comic/']") || it.querySelector("a");
      if (!a) continue;
      var href = a.attributes.href || "";
      if (!href || href.indexOf("/comic/") < 0) continue;
      var id = this._abs(href);
      if (seen[id]) continue;
      seen[id] = 1;

      var title = "", cover = "", sub = "", author = "";
      if (mode === "rank") {
        var tEl = it.querySelector(".title");
        title = tEl ? (tEl.text || "").trim() : (a.attributes.title || a.text || "").trim();
        var img = it.querySelector("img");
        cover = img ? (img.attributes.src || img.attributes["data-src"] || "") : "";
        var subEl = it.querySelector(".subtitle");
        sub = subEl ? (subEl.text || "").trim() : "";
        var botEl = it.querySelector(".bottom");
        author = botEl ? String(botEl.text || "").replace(/\s+/g, " ").trim() : "";
      } else {
        var t2 = it.querySelector(".title a") || it.querySelector(".title");
        title = t2 ? (t2.text || "").trim() : "";
        var img2 = it.querySelector(".img img") || it.querySelector("img");
        cover = img2 ? (img2.attributes.src || img2.attributes["data-src"] || "") : "";
      }
      if (!title) continue;
      comics.push(new Comic({ id: id, title: title, cover: this._abs(cover), subTitle: sub, author: author }));
    }

    // 兜底：直接扫描所有 /comic/ 链接
    if (!comics.length) {
      var all = doc.querySelectorAll("a[href*='/comic/']");
      for (var j = 0; j < all.length; j++) {
        var ah = all[j].attributes.href || "";
        if (ah.indexOf("/comic/") < 0) continue;
        var aid = this._abs(ah);
        if (seen[aid]) continue;
        seen[aid] = 1;
        var tt = (all[j].attributes.title || all[j].text || "").trim();
        if (!tt) continue;
        var im = all[j].querySelector("img");
        var cc = im ? (im.attributes.src || im.attributes["data-src"] || "") : "";
        comics.push(new Comic({ id: aid, title: tt, cover: this._abs(cc) }));
      }
    }
    return comics;
  }

  async _getList(u, p) {
    try {
      var res = await Network.get(u, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: p };
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
    } catch (e) { return { comics: [], maxPage: p }; }
  }
  _listPage(path, page) {
    var p = page || 1;
    var u = this.baseUrl + path;
    u += (u.indexOf("?") >= 0 ? "&" : "?") + "page=" + p;
    return this._getList(u, p);
  }
  _maxPage(doc, cur) {
    var max = cur;
    var as = doc.querySelectorAll("a");
    for (var i = 0; i < as.length; i++) {
      var h = as[i].attributes.href || "";
      var m = null;
      if (/page/i.test(h)) m = h.match(/[?&]page=(\d+)/i) || h.match(/\/page\/(\d+)/i);
      else if (/\/search\//i.test(h)) m = h.match(/\/search\/[^/]+\/(\d+)/i);
      if (m) { var n = parseInt(m[1], 10); if (n > max && n < 2000) max = n; }
    }
    return max;
  }

  // ====== 发现（7 个榜单）======
  static CUSTOM = [
    ["总点击", "/custom/top"], ["月点击", "/custom/month"], ["周点击", "/custom/week"],
    ["日点击", "/custom/day"], ["最近更新", "/custom/update"], ["精品推荐", "/custom/boutique"],
    ["编辑推荐", "/custom/recom"]
  ];
  explore = [
    { title: "总点击", type: "multiPageComicList", load: async (page) => this._listPage("/custom/top", page) },
    { title: "月点击", type: "multiPageComicList", load: async (page) => this._listPage("/custom/month", page) }
  ];

  // ====== 搜索 ======
  // 注意：/search/<kw> 接口已失效（恒返回"没有内容"），改用 /custom/search?key=
  search = {
    load: async (keyword, options, page) => {
      var p = page || 1;
      var attempts = [
        this.baseUrl + "/custom/search?key=" + encodeURIComponent(keyword),
        this.baseUrl + "/search/" + encodeURIComponent(keyword) + "/" + p
      ];
      for (var a = 0; a < attempts.length; a++) {
        try {
          var res = await Network.get(attempts[a], this._headers());
          if (res.status !== 200) continue;
          var doc = new HtmlDocument(res.body);
          var comics = this._list(doc);
          if (comics.length) return { comics: comics, maxPage: this._maxPage(doc, p) };
        } catch (e) { }
      }
      return { comics: [], maxPage: 1 };
    }
  };

  // ====== 分类（标签 × 地区 × 进度 × 排序）======
  // 标签 id 取自读漫屋分类页 /category/tags/{id}
  static TAGS = [
    ["奇幻", "2569"], ["搞笑", "2570"], ["都市", "2571"], ["热血", "2572"], ["穿越", "2573"],
    ["纯爱", "2574"], ["玄幻", "2585"], ["修仙", "2586"], ["校园", "2587"], ["治愈", "2588"],
    ["科幻", "2589"], ["冒险", "2591"], ["战斗", "2592"], ["古风", "2593"], ["悬疑", "2600"],
    ["恋爱", "2617"], ["百合", "2654"], ["耽美", "2633"], ["职场", "2668"]
  ];
  category = {
    title: "读漫屋2",
    parts: [
      {
        name: "标签", type: "fixed", itemType: "category",
        categories: dmw2.TAGS.map(function (t) { return t[0]; }),
        categoryParams: dmw2.TAGS.map(function (t) { return t[1]; })
      },
      {
        name: "地区", type: "fixed", itemType: "category",
        categories: ["全部", "国产", "日本", "韩国", "欧美"],
        categoryParams: ["", "/list/1", "/list/2", "/list/3", "/list/4"]
      },
      {
        name: "进度", type: "fixed", itemType: "category",
        categories: ["全部", "连载中", "已完结"],
        categoryParams: ["", "/finish/1", "/finish/2"]
      },
      {
        name: "排序", type: "fixed", itemType: "category",
        categories: ["默认", "热门人气", "更新时间"],
        categoryParams: ["", "/order/hits", "/order/addtime"]
      }
    ],
    enableRankingPage: false
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      var opts = (options && options.length) ? options : [param];
      var tag = (opts[0] && String(opts[0]).trim()) || "";
      var region = opts[1] || "";
      var finish = opts[2] || "";
      var order = opts[3] || "";
      var p = page || 1;
      if (!tag) return { comics: [], maxPage: 1 };
      var path = "/category/tags/" + tag + region + finish + order + "/page/" + p;
      return this._getList(this.baseUrl + path, p);
    },
    optionList: []
  };

  // ====== 详情 ======
  comic = {
    loadInfo: async (id) => {
      var url = this._abs(id);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var doc = new HtmlDocument(html);

      var title = "";
      var t1 = doc.querySelector(".title");
      if (t1) title = (t1.text || "").trim();
      if (!title) { var h1 = doc.querySelector("h1"); if (h1) title = (h1.text || "").trim(); }

      var cover = "";
      var cov = doc.querySelector(".cover");
      if (cov) cover = cov.attributes.src || cov.attributes["data-src"] || cov.attributes["data-original"] || "";

      var author = "", statusTxt = "", kind = "", updateTime = "";
      var subs = doc.querySelectorAll(".subtitle");
      for (var s = 0; s < subs.length; s++) {
        var tx = String(subs[s].text || "");
        if (tx.indexOf("者：") >= 0) {
          author = tx.replace(/.*者：\s*/, "").replace(/[、，,·+&]|\sx\s/g, "/").replace(/\s*\/\s*/g, "/").replace(/\/+/g, "/").replace(/（/g, "(").replace(/）/g, ")").trim();
        } else if (tx.indexOf("态：") >= 0) {
          statusTxt = tx.replace(/.*态：\s*/, "").replace(/[中已]/g, "").trim();
        } else if (tx.indexOf("型：") >= 0) {
          kind = tx.replace(/.*型：\s*/, "").replace(/\s+/g, ",").trim();
        }
      }
      if (!author) { var am = html.match(/作者[：:]\s*([^<\n]{1,40})/); if (am) author = am[1].trim(); }

      var top = doc.querySelector(".top");
      // 页面首个 .top 是顶栏（空文本），更新时间在章节区 <div class="top"><span>更新时间：xxxx-xx-xx</span></div>，故正则优先
      var tm = html.match(/更新时间[：:]\s*([\d\-]+)/);
      if (tm) {
        updateTime = tm[1].trim();
      } else if (top) {
        updateTime = String(top.text || "").replace(/更新时间：\s*/, "").replace(/[年月]/g, "-").replace(/日/g, "").trim();
      }

      var desc = "";
      var d1 = doc.querySelector(".detailContent");
      if (d1) desc = (d1.text || "").trim();
      if (updateTime) desc = "更新时间：" + updateTime + "\n\n" + desc;

      var tags = {};
      if (kind) {
        var arr = kind.split(",").filter(function (x) { return x && x.length <= 10; });
        if (arr.length) tags["类型"] = arr;
      }

      var status = /完/.test(statusTxt) ? "completed" : (/连/.test(statusTxt) ? "ongoing" : "unknown");

      var chapters = await this._loadChapters(doc);

      return new ComicDetails({
        id: url,
        title: title,
        cover: this._abs(cover),
        author: author,
        description: desc,
        tags: tags,
        status: status,
        updateTime: updateTime,
        chapters: chapters
      });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers({ "Referer": this._abs(comicId) }));
      if (res.status !== 200) throw "HTTP " + res.status;
      var images = this._decryptImages(res.body);
      if (!images.length) throw "解析图片失败（站点结构可能已变更）";
      return { images: images };
    },

    onImageLoad: (url) => ({
      url: url,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36",
        "Referer": (this.baseUrl || "https://m.dumanwu.org") + "/",
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"
      }
    }),

    idMatch: "^https?:\\/\\/[^\\/]+\\/comic\\/[^\\/]+\\/?$"
  };

  async _loadChapters(doc) {
    var list = [], seen = {};
    var as = doc.querySelectorAll(".chapterList a");
    if (!as || !as.length) as = doc.querySelectorAll("a[href*='/comic/']");
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      var h = a.attributes.href || "";
      if (!h || h.indexOf("/comic/") < 0) continue;
      var t = String(a.text || "").trim();
      if (!t) continue;
      var full = this._abs(h);
      if (seen[full]) continue;
      seen[full] = 1;
      list.push([full, t]);
    }
    var chapters = new Map();
    for (var m = 0; m < list.length; m++) chapters.set(list[m][0], list[m][1]);
    return chapters;
  }

  // ====== 阅读页解密（AES-128-CBC / PKCS7）======
  _decryptImages(html) {
    try {
      var m = html.match(/(?:var\s+)?params\s*=\s*['"]([^'"]+)['"]/);
      if (!m) return [];
      var json = this._aesCbcDecrypt(m[1]);
      var obj = JSON.parse(json);
      var imgs = obj.images || [];
      var out = [];
      for (var i = 0; i < imgs.length; i++) {
        var u = imgs[i];
        if (!u) continue;
        if (!/^https?:\/\//i.test(u)) u = "https://img1.baipiaoguai.org" + u;
        out.push(u);
      }
      return out;
    } catch (e) { return []; }
  }
}
