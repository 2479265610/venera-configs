/**
 * DogeManga (dogemanga.com) —— Venera 漫画源 v2.0.0
 * ===============================================================
 * 基于 legado 工作书源规则完全重写，修正了所有选择器差异。
 *
 * 关键参考: legado 书源 "漫畫狗网" (已验证可用)
 *   列表: .col-12 网格卡片 (h5 标题 / img src 封面 / h6 作者)
 *   详情: .site-navbar__title 标题 / h4 作者 / .site-card__brief 简介
 *         章节: .site-selector option (value="/p/xxx", text="第N回")
 *   阅读: .site-reader__image[data-page-image-url] 图片直出
 *   搜索: /?q=关键词&o=偏移量 (12条/页)
 *   探索: /?s=0 (热门) / ?s=1 (最新)
 */
class dogemanga extends ComicSource {
  name = "DogeManga";
  key = "dogemanga";
  version = "2.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/dogemanga.js";
  baseUrl = "https://dogemanga.com";
  UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.102 Safari/537.36 Edg/104.0.1293.70";

  _headers() {
    return {
      "User-Agent": this.UA,
      "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": this.baseUrl + "/"
    };
  }
  _fix(u) { return String(u || "").replace(/^http:/, "https:"); }
  _abs(href) {
    if (!href) return "";
    href = String(href).trim();
    if (/^https?:\/\//i.test(href)) return this._fix(href);
    if (href.indexOf("//") === 0) return "https:" + href;
    return this.baseUrl + (href.charAt(0) === "/" ? href : "/" + href);
  }

  // ====== 列表解析: .col-12 卡片（同 .site-card） ======
  _list(doc) {
    var comics = [], seen = {};
    // legado: .site-scroll__list@.col-12
    var cards = doc.querySelectorAll(".col-12");
    if (!cards.length) cards = doc.querySelectorAll(".site-card");
    for (var k = 0; k < cards.length; k++) {
      var card = cards[k];
      // 跳过空卡片（无 h5 标题）
      var h5 = card.querySelector("h5");
      if (!h5) continue;
      var title = String(h5.text || "").trim();
      if (!title) continue;
      // 链接: a[href*='/m/']
      var a = card.querySelector("a[href*='/m/']");
      if (!a) a = card.querySelector("a");
      if (!a) continue;
      var href = a.attributes.href || "";
      var m = href.match(/\/m\/([A-Za-z0-9_-]+)/);
      if (!m || seen[m[1]]) continue;
      seen[m[1]] = true;
      // 封面: img src
      var cover = "";
      var img = card.querySelector("img");
      if (img) cover = img.attributes.src || "";
      // 作者: h6
      var subTitle = "";
      var h6 = card.querySelector("h6");
      if (h6) subTitle = String(h6.text || "").trim();
      comics.push(new Comic({ id: this._abs(href), title: title, cover: cover.indexOf("http") === 0 ? cover : "", subTitle: subTitle }));
    }
    return comics;
  }

  // ====== 探索 ======
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

  // ====== 搜索: /?q=关键词&o=偏移量 ======
  search = {
    load: async (keyword, opts, page) => {
      var offset = (Math.max(0, (page || 1) - 1)) * 12;
      var url = this.baseUrl + "/?q=" + encodeURIComponent(keyword) + "&o=" + offset;
      try {
        var res = await Network.get(url, this._headers());
        if (res.status !== 200) return { comics: [], maxPage: 0 };
        var doc = new HtmlDocument(res.body);
        return { comics: this._list(doc), maxPage: 0 };
      } catch (e) { return { comics: [], maxPage: 0 }; }
    }
  };

  // ====== 分类 ======
  category = { title: "DogeManga", parts: [], enableRankingPage: false };
  categoryComics = { load: async () => ({ comics: [], maxPage: 0 }) };

  // ====== 漫画详情 ======
  comic = {
    loadInfo: async (id) => {
      var url = this._abs(id);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var html = res.body;

      // 标题: .site-navbar__title (legado: .site-navbar__title@text)
      var title = "";
      var titleEl = doc.querySelector(".site-navbar__title");
      if (titleEl) title = String(titleEl.text || "").trim();
      if (!title) {
        var tm = html.match(/<title>([^<]+)/);
        if (tm) title = tm[1].replace(/\s*[-–—|].*$/, "").trim();
      }

      // 作者: h4 (legado: tag.h4@text)
      var author = "";
      var h4 = doc.querySelector("h4");
      if (h4) {
        var t = String(h4.text || "").trim();
        // 去除 "作者：" 前缀
        author = t.replace(/^作者[：:]\s*/, "");
      }

      // 简介: .site-card__brief (legado: .site-card__brief@text)
      var desc = "";
      var brief = doc.querySelector(".site-card__brief");
      if (brief) desc = String(brief.text || "").trim();

      // 状态: .text-muted (legado: class.text-muted@text)
      var status = "unknown";
      var mutedEls = doc.querySelectorAll(".text-muted");
      for (var i = 0; i < mutedEls.length; i++) {
        var st = String(mutedEls[i].text || "").trim();
        if (/連載中|连载中/.test(st)) { status = "ongoing"; break; }
        if (/已完結|已完结|完結/.test(st)) { status = "completed"; break; }
      }

      // 封面: og:image
      var cover = "";
      var ogi = html.match(/property="og:image"[^>]*content="([^"]+\.jpg)"/i);
      if (ogi && !/logo/i.test(ogi[1])) cover = ogi[1];

      // 章节: .site-selector option (legado: -class.site-selector@option!0)
      // 先取 .site-selector，再取子 option（兼容 Venera querySelectorAll 限制）
      var chapters = new Map();
      var sel = doc.querySelector(".site-selector");
      if (sel) {
        var opts = sel.querySelectorAll ? sel.querySelectorAll("option") : [];
        // 跳过第一个 option (占位 disabled selected)
        for (var o = 1; o < opts.length; o++) {
          var val = opts[o].attributes.value || "";
          if (!val) continue;
          var chName = String(opts[o].text || "").trim();
          if (!chName) continue;
          chapters.set(val, chName);
        }
      }
      // 兜底：纯正则散扫 data-page-url（兼容旧模板）
      if (!chapters.size) {
        var dpRe = /data-page-url="(\/p\/([A-Za-z0-9_-]+))"/gi;
        var dm;
        var chArr = [];
        while ((dm = dpRe.exec(html)) !== null) {
          var pid = dm[2];
          if (!pid) continue;
          chArr.push([this._abs(dm[1]), pid]);
        }
        for (var i = chArr.length - 1; i >= 0; i--) {
          chapters.set(chArr[i][0], chArr[i][1]);
        }
      }

      return new ComicDetails({
        id: url, title: title, cover: this._abs(cover), author: author,
        description: desc, status: status, chapters: chapters
      });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      // legado: class.site-reader__image@data-page-image-url
      var readerImgs = doc.querySelectorAll(".site-reader__image");
      var images = [];
      var seenImg = {};
      for (var i = 0; i < readerImgs.length; i++) {
        var u = readerImgs[i].attributes["data-page-image-url"] || "";
        u = String(u).trim();
        if (!u || seenImg[u]) continue;
        seenImg[u] = 1;
        images.push(u);
      }
      return { images: images };
    },

    onImageLoad: (url) => ({
      url: url,
      headers: { "User-Agent": "Mozilla/5.0 Chrome/127", "Referer": "https://dogemanga.com/", "Accept": "image/*" }
    }),
    idMatch: "(/m/[A-Za-z0-9_-]+)"
  };
}
