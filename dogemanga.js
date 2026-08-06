/**
 * DogeManga (dogemanga.com) —— Venera 漫画源 v3.1.0
 * 严格参照 dumanwu.js + seyoumanhua.js 的 HtmlDocument 使用模式
 */
class dogemanga extends ComicSource {
  name = "DogeManga";
  key = "dogemanga";
  version = "3.1.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/dogemanga.js";
  baseUrl = "https://dogemanga.com";
  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36";

  // 参照 dumanwu _headers 完整版
  _headers(extra) {
    var h = {
      "User-Agent": this.UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Accept-Encoding": "gzip, deflate, br"
    };
    if (extra) { for (var k in extra) h[k] = extra[k]; }
    return h;
  }

  _abs(href) {
    if (!href) return "";
    href = String(href).trim();
    if (/^https?:\/\//i.test(href)) return href;
    return this.baseUrl + (href.charAt(0) === "/" ? href : "/" + href);
  }

  // ====== 列表：参照 dumanwu _list 模式 ======
  _list(doc) {
    var items = doc.querySelectorAll(".col-12");
    if (!items || !items.length) items = doc.querySelectorAll(".site-card");
    var comics = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var h5 = it.querySelector("h5");
      if (!h5) continue;
      var a = it.querySelector("a[href*='/m/']") || it.querySelector("a");
      if (!a) continue;
      var href = a.attributes.href || "";
      var m = href.match(/\/m\/([A-Za-z0-9_-]+)/);
      if (!m || seen[m[1]]) continue;
      seen[m[1]] = true;
      var title = (h5.text || "").trim();
      if (!title) continue;
      var cover = "";
      var img = it.querySelector("img");
      if (img) cover = img.attributes.src || "";
      var sub = "";
      var h6 = it.querySelector("h6");
      if (h6) sub = (h6.text || "").trim();
      comics.push(new Comic({ id: this._abs(href), title: title, cover: cover, subTitle: sub }));
    }
    return comics;
  }

  explore = [
    { title: "热门排行", type: "multiPageComicList", load: async (page) => {
        var res = await Network.get(this.baseUrl + "/?s=0", this._headers());
        if (res.status !== 200) throw "HTTP " + res.status;
        var doc = new HtmlDocument(res.body);
        return { comics: this._list(doc), maxPage: 1 };
    }},
    { title: "最新连载", type: "multiPageComicList", load: async (page) => {
        var res = await Network.get(this.baseUrl + "/?s=1", this._headers());
        if (res.status !== 200) throw "HTTP " + res.status;
        var doc = new HtmlDocument(res.body);
        return { comics: this._list(doc), maxPage: 1 };
    }}
  ];

  search = {
    load: async (keyword, opts, page) => {
      var offset = (Math.max(0, (page || 1) - 1)) * 12;
      var res = await Network.get(this.baseUrl + "/?q=" + encodeURIComponent(keyword) + "&o=" + offset, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: 0 };
    }
  };

  category = { title: "DogeManga", parts: [], enableRankingPage: false };
  categoryComics = { load: async () => ({ comics: [], maxPage: 0 }) };

  // ====== 详情：参照 seyoumanhua/dumanwu 模式 ======
  comic = {
    loadInfo: async (id) => {
      var res = await Network.get(this._abs(id), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var html = res.body;

      // 标题
      var title = "";
      var t1 = doc.querySelector("h1");
      if (t1) title = (t1.text || "").trim();
      if (!title) { var tt = doc.querySelector(".site-navbar__title"); if (tt) title = (tt.text || "").trim(); }

      // 作者
      var author = "";
      var h4 = doc.querySelector("h4");
      if (h4) author = (h4.text || "").trim();

      // 简介
      var desc = "";
      var brief = doc.querySelector(".site-card__brief");
      if (brief) desc = (brief.text || "").trim();

      // 状态
      var status = "unknown";
      if (html.indexOf("連載中") >= 0 || html.indexOf("连载中") >= 0) status = "ongoing";
      else if (html.indexOf("已完結") >= 0 || html.indexOf("完結") >= 0) status = "completed";

      // 封面（空值保护）
      var cover = "";
      var ogi = doc.querySelector("meta[property='og:image']");
      if (ogi) { var c = ogi.attributes.content; if (c && c.indexOf("http") === 0) cover = c; }

      // 章节：正则优先（从 raw HTML 提取 option value + text）→ HtmlDocument 兜底
      var chapters = new Map();
      var optM = html.match(/<option[^>]+value="(https?:\/\/dogemanga\.com\/p\/[^"]+)"[^>]*>([^<]+)<\/option>/gi);
      if (optM) {
        var first = true;
        for (var oi = 0; oi < optM.length; oi++) {
          var vMatch = optM[oi].match(/value="([^"]+)"/);
          var tMatch = optM[oi].match(/>([^<]+)</);
          if (!vMatch || !tMatch) continue;
          if (first) { first = false; continue; }
          chapters.set(vMatch[1], tMatch[1].trim());
        }
      }
      if (!chapters.size) {
        var chs = doc.querySelectorAll("option");
        var first2 = true;
        for (var c = 0; c < chs.length; c++) {
          var val = chs[c].attributes.value || "";
          var txt = (chs[c].text || "").trim();
          if (!val || !txt) continue;
          if (first2) { first2 = false; continue; }
          if (val.indexOf("/p/") < 0) continue;
          chapters.set(val, txt);
        }
      }

      return new ComicDetails({ id: id, title: title, cover: cover, author: author, description: desc, status: status, chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers({ "Referer": this.baseUrl + "/" }));
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var items = doc.querySelectorAll(".site-reader__image");
      var images = [], seen = {};
      for (var i = 0; i < items.length; i++) {
        var u = items[i].attributes["data-page-image-url"] || "";
        u = (u || "").trim ? u.trim() : String(u).trim();
        if (!u || seen[u]) continue;
        seen[u] = 1;
        images.push(u);
      }
      return { images: images };
    },

    onImageLoad: (url) => ({ url: url, headers: { "Referer": "https://dogemanga.com/" } }),
    idMatch: "/m/[A-Za-z0-9_-]+"
  };
}
