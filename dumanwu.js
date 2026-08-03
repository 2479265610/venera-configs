/**
 * 读漫屋 (www.dumanwu1.com) —— Venera 漫画源 v1.0.0
 * 由 legado 书源「🎨读漫屋💓」移植（远程规则 qyyuapi.com/sy/js/dmw/*.js 反混淆后还原）。
 *
 * 站点模板（dmw 系）：
 *   列表：  .likedata 卡片 -> .le-t 标题 / p[1] 作者 / p[2] 最新 / .le-j 简介 / img[data-src] 封面 / a[href]
 *   搜索：  POST /s   body: k=关键词   -> .itemnar -> .title / .msg / img[data-src]
 *   详情：  .name_mh 标题 / .detinfo span:contains(者：|态：|签：|更新时间：) / .himg img[data-src] / .content 简介
 *   目录：  页面 ul a  +  POST /morechapter  body: id=<漫画hash>  -> {data:[{chaptername,chapterid}]}
 *           两段合并后整体 reverse（页面段为倒序）
 *   阅读：  head 中无 src 的 <script> 里 __c0rst96(base64)
 *           key = base64Decode(KEYS[data-id])，与数据逐字节异或，结果再 base64Decode 得图片 URL JSON 数组
 *
 * 换源：settings.domain 可在 App 内切换镜像域名（读漫屋2 为不同模板，另见「dumanwu2.js」）。
 */
class dumanwu extends ComicSource {
  name = "读漫屋";
  key = "dumanwu";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/dumanwu.js";

  // ====== 可切换镜像 ======
  static DOMAINS = ["http://www.dumanwu1.com", "http://www.dumanwu.com", "https://www.dumanwu1.com"];
  settings = {
    domain: {
      title: "站点域名",
      type: "select",
      options: [
        { value: "http://www.dumanwu1.com" },
        { value: "http://www.dumanwu.com" },
        { value: "https://www.dumanwu1.com" }
      ],
      default: "http://www.dumanwu1.com"
    }
  };
  get baseUrl() {
    try {
      var d = this.loadSetting("domain");
      if (d && /^https?:\/\//i.test(d)) return String(d).replace(/\/+$/, "");
    } catch (e) { }
    return "http://www.dumanwu1.com";
  }

  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0";

  // ====== base64 ======
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
  // 二进制串 -> UTF-8 文本
  _utf8(bin) {
    try {
      var pct = "";
      for (var i = 0; i < bin.length; i++) pct += "%" + ("00" + bin.charCodeAt(i).toString(16)).slice(-2);
      return decodeURIComponent(pct);
    } catch (e) { return bin; }
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

  // ====== 列表解析（.likedata）======
  _list(doc) {
    var items = doc.querySelectorAll(".likedata");
    var comics = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var a = it.querySelector("a");
      if (!a) continue;
      var href = a.attributes.href || "";
      var tEl = it.querySelector(".le-t");
      var title = tEl ? (tEl.text || "").trim() : "";
      if (!title) title = String(a.attributes.title || a.text || "").trim();
      var img = it.querySelector("img");
      var cover = img ? (img.attributes["data-src"] || img.attributes["data-original"] || img.attributes.src || "") : "";
      var sub = "";
      var ps = it.querySelectorAll("p");
      if (ps && ps.length > 2) sub = String(ps[2].text || "").replace(/^最新：\s*/, "").trim();
      var desc = "";
      var dEl = it.querySelector(".le-j");
      if (dEl) desc = (dEl.text || "").trim();
      if (!href || !title) continue;
      var id = this._abs(href);
      if (seen[id]) continue;
      seen[id] = 1;
      comics.push(new Comic({ id: id, title: title, cover: this._abs(cover), subTitle: sub, description: desc }));
    }
    return comics;
  }

  async _getList(u, p) {
    try {
      var res = await Network.get(u, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: p };
      var doc = new HtmlDocument(res.body);
      var comics = this._list(doc);
      return { comics: comics, maxPage: comics.length ? null : p };
    } catch (e) { return { comics: [], maxPage: p }; }
  }
  _listPage(path, page) {
    var p = page || 1;
    var u = this.baseUrl + path;
    u += (u.indexOf("?") >= 0 ? "&" : "?") + "page=" + p;
    return this._getList(u, p);
  }

  // ====== 发现 ======
  static RANKS = [["精品榜", 1], ["人气榜", 2], ["推荐榜", 3], ["黑马榜", 4], ["更新榜", 5], ["新漫画", 6]];
  static SORTS = ["冒险", "热血", "都市", "玄幻", "悬疑", "耽美", "恋爱", "生活", "搞笑", "穿越", "修真", "后宫", "女主", "古风", "连载", "完结"];

  explore = [
    { title: "精品榜", type: "multiPageComicList", load: async (page) => this._listPage("/rank/1", page) },
    { title: "人气榜", type: "multiPageComicList", load: async (page) => this._listPage("/rank/2", page) },
    { title: "推荐榜", type: "multiPageComicList", load: async (page) => this._listPage("/rank/3", page) },
    { title: "黑马榜", type: "multiPageComicList", load: async (page) => this._listPage("/rank/4", page) },
    { title: "更新榜", type: "multiPageComicList", load: async (page) => this._listPage("/rank/5", page) },
    { title: "新漫画", type: "multiPageComicList", load: async (page) => this._listPage("/rank/6", page) }
  ];

  // ====== 搜索（POST /s，body: k=）======
  search = {
    load: async (keyword, options, page) => {
      var p = page || 1;
      var body = "k=" + encodeURIComponent(keyword);
      var url = this.baseUrl + "/s";
      var headers = this._headers({ "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Origin": this.baseUrl });
      var res = null;
      try {
        if (typeof Network.post === "function") res = await Network.post(url, headers, body);
      } catch (e) { res = null; }
      if (!res || res.status !== 200) {
        try { res = await Network.get(url + "?" + body, this._headers()); } catch (e2) { return { comics: [], maxPage: 1 }; }
      }
      if (!res || res.status !== 200) return { comics: [], maxPage: 1 };
      var doc = new HtmlDocument(res.body);
      return { comics: this._searchList(doc), maxPage: 1 };
    }
  };

  _searchList(doc) {
    var items = doc.querySelectorAll(".itemnar");
    if (!items || !items.length) items = doc.querySelectorAll(".col-auto");
    var comics = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var a = it.querySelector("a");
      if (!a) continue;
      var href = a.attributes.href || "";
      var tEl = it.querySelector(".title") || it.querySelector(".e-title");
      var title = tEl ? (tEl.text || "").trim() : String(a.attributes.title || a.text || "").trim();
      var mEl = it.querySelector(".msg") || it.querySelector(".tip");
      var sub = mEl ? (mEl.text || "").trim() : "";
      var img = it.querySelector("img");
      var cover = img ? (img.attributes["data-src"] || img.attributes.src || "") : "";
      if (!href || !title) continue;
      var id = this._abs(href);
      if (seen[id]) continue;
      seen[id] = 1;
      comics.push(new Comic({ id: id, title: title, cover: this._abs(cover), subTitle: sub }));
    }
    if (!comics.length) return this._list(doc);
    return comics;
  }

  // ====== 分类 ======
  category = {
    title: "读漫屋",
    parts: [
      {
        name: "标签",
        type: "fixed",
        itemType: "category",
        categories: ["冒险", "热血", "都市", "玄幻", "悬疑", "耽美", "恋爱", "生活", "搞笑", "穿越", "修真", "后宫", "女主", "古风", "连载", "完结"],
        categoryParams: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"]
      },
      {
        name: "榜单",
        type: "fixed",
        itemType: "category",
        categories: ["精品榜", "人气榜", "推荐榜", "黑马榜", "更新榜", "新漫画"],
        categoryParams: ["r1", "r2", "r3", "r4", "r5", "r6"]
      }
    ],
    enableRankingPage: false
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      var p = page || 1;
      var key = param || "1";
      var path = /^r\d+$/.test(key) ? "/rank/" + key.slice(1) : "/sort/" + key;
      return this._listPage(path, p);
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
      var t1 = doc.querySelector(".name_mh");
      if (t1) title = (t1.text || "").trim();
      if (!title) { var h1 = doc.querySelector("h1"); if (h1) title = (h1.text || "").trim(); }

      var cover = "";
      var cov = doc.querySelector(".himg img");
      if (cov) cover = cov.attributes["data-src"] || cov.attributes.src || "";

      var author = "", statusTxt = "", kind = "", updateTime = "";
      var spans = doc.querySelectorAll(".detinfo span");
      for (var s = 0; s < spans.length; s++) {
        var tx = String(spans[s].text || "");
        if (tx.indexOf("者：") >= 0) {
          author = tx.replace(/.*者：\s*/, "").replace(/[、，,·+&]|\sx\s/g, "/").replace(/\s*\/\s*/g, "/").replace(/\/+/g, "/").replace(/（/g, "(").replace(/）/g, ")").trim();
        } else if (tx.indexOf("态：") >= 0) {
          statusTxt = tx.replace(/.*态：\s*/, "").replace(/[中已]/g, "").trim();
        } else if (tx.indexOf("签：") >= 0) {
          kind = tx.replace(/.*签：\s*/, "").replace(/\s+/g, ",").trim();
        } else if (tx.indexOf("更新时间：") >= 0) {
          updateTime = tx.replace(/.*更新时间：\s*/, "").replace(/[年月]/g, "-").replace(/日/g, "").trim();
        }
      }
      if (!author) { var am = html.match(/作者[：:]\s*([^<\n]{1,40})/); if (am) author = am[1].trim(); }

      var desc = "";
      var d1 = doc.querySelector(".content");
      if (d1) desc = (d1.text || "").trim();
      if (updateTime) desc = "更新时间：" + updateTime + "\n\n" + desc;

      var tags = {};
      if (kind) {
        var arr = kind.split(",").filter(function (x) { return x && x.length <= 10; });
        if (arr.length) tags["标签"] = arr;
      }

      var status = /完/.test(statusTxt) ? "completed" : (/连/.test(statusTxt) ? "ongoing" : "unknown");

      var chapters = await this._loadChapters(doc, url);

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
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36", "Referer": (this.baseUrl || "http://www.dumanwu1.com") + "/", "Accept": "image/avif,image/webp,image/*,*/*;q=0.8" }
    }),

    idMatch: "^https?:\\/\\/[^\\/]+\\/[^\\/]+\\/?$"
  };

  // 目录：页面 ul a（倒序） + /morechapter 接口，合并后整体 reverse
  async _loadChapters(doc, comicUrl) {
    var list = [];
    var seen = {};

    // 1) 页面内章节：链接形如 /<hash>/<id>.html
    var as = doc.querySelectorAll("ul a");
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      var h = String(a.attributes.href || "");
      if (!h || !/\.html(\?|$)/i.test(h)) continue;
      if (/(\/rank\/|\/sort\/|\/search|\/s\?|^#|javascript:)/i.test(h)) continue;
      var t = String(a.text || "").trim();
      if (!t) continue;
      var full = this._abs(h);
      if (seen[full]) continue;
      seen[full] = 1;
      list.push([full, t]);
    }

    // 2) /morechapter 接口补齐剩余章节
    try {
      var hash = String(comicUrl).replace(/[?#].*$/, "").replace(/\/+$/, "");
      hash = hash.slice(hash.lastIndexOf("/") + 1);
      if (hash && typeof Network.post === "function") {
        var mres = await Network.post(
          this.baseUrl + "/morechapter",
          this._headers({ "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", "Referer": comicUrl }),
          "id=" + encodeURIComponent(hash)
        );
        if (mres && mres.status === 200) {
          var j = JSON.parse(mres.body);
          var arr = (j && j.data) || [];
          for (var k = 0; k < arr.length; k++) {
            var cid = arr[k].chapterid, cname = arr[k].chaptername;
            if (cid === undefined || cid === null) continue;
            var link = this.baseUrl + "/" + hash + "/" + cid + ".html";
            if (seen[link]) continue;
            seen[link] = 1;
            list.push([link, String(cname || cid).trim()]);
          }
        }
      }
    } catch (e) { /* 接口不可用时仅用页面章节 */ }

    list.reverse();
    var chapters = new Map();
    for (var m = 0; m < list.length; m++) chapters.set(list[m][0], list[m][1]);
    return chapters;
  }

  // ====== 阅读页解密（异或 + base64）======
  static KEYS = [
    "c21raHkyNTg=", "c21rZDk1ZnY=", "bWQ0OTY5NTI=", "Y2Rjc2R3cQ==", "dmJmc2EyNTY=",
    "Y2F3ZjE1MWM=", "Y2Q1NmN2ZGE=", "OGtpaG50OQ==", "ZHNvMTV0bG8=", "NWtvNnBsaHk="
  ];

  _decryptImages(html) {
    try {
      var m = html.match(/__c0rst96\s*=\s*['"]([^'"]+)['"]/);
      if (!m) return [];
      var idm = html.match(/readerContainer[\s\S]{0,200}?data-id\s*=\s*["'](\d+)["']/i);
      if (!idm) idm = html.match(/data-id\s*=\s*["'](\d+)["'][\s\S]{0,200}?readerContainer/i);
      var id = idm ? parseInt(idm[1], 10) : 0;
      var KEYS = dumanwu.KEYS;
      if (!(id >= 0 && id < KEYS.length)) id = 0;

      var key = this._atob(KEYS[id]);
      var data = this._atob(m[1]);
      var res = "";
      for (var i = 0; i < data.length; i++) {
        res += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      var json = this._utf8(this._atob(res));
      var arr = JSON.parse(json);
      var out = [];
      for (var k = 0; k < arr.length; k++) if (arr[k]) out.push(this._abs(arr[k]));
      return out;
    } catch (e) { return []; }
  }
}
