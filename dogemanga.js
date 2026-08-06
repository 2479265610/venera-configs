/**
 * DogeManga (dogemanga.com) —— Venera 漫画源 v1.0.0
 * ===============================================================
 * SSR（服务端渲染）站点，数据内联在 HTML 中（data-* 属性 + og meta），无需 API。
 *
 * 已从 HAR 实测确认:
 *   首页    /                         → .site-card[data-manga-id] + img.card-img-top + h5 a
 *   详情    /m/<slug>                 → og meta + data-page-url 章节列表
 *           封面 /images/manga-thumbnails/<slug>.jpg
 *   阅读    /p/<pageId>               → data-page-image-url 直接出图
 *           图片 /images/pages/<pageId>.jpg
 *   搜索    /?q=<keyword>
 */
class dogemanga extends ComicSource {
  name = "DogeManga";
  key = "dogemanga";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/dogemanga.js";
  baseUrl = "https://dogemanga.com";
  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

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

  // ====== 列表卡片（首页 SSR / .site-card）======
  _list(doc) {
    var comics = [], seen = {};
    var cards = doc.querySelectorAll(".site-card");
    for (var k = 0; k < cards.length; k++) {
      var card = cards[k];
      var a = card.querySelector("a[href*='/m/']");
      if (!a) continue;
      var href = a.attributes.href || "";
      var m = href.match(/\/m\/([A-Za-z0-9_-]+)/);
      if (!m || seen[m[1]]) continue;
      seen[m[1]] = true;
      var title = "";
      var tEl = card.querySelector("h5 a, .card-title a");
      if (tEl) title = String(tEl.text || "").trim();
      if (!title) title = String(a.attributes.title || a.text || "").trim();
      if (!title) { var img = card.querySelector("img"); if (img) title = String(img.attributes.alt || "").trim(); }
      if (!title) continue;
      var cover = "";
      var img = card.querySelector("img.card-img-top");
      if (img) cover = img.attributes.src || "";
      if (!cover) {
        var slug = m[1];
        cover = this.baseUrl + "/images/manga-thumbnails/" + slug + ".jpg";
      }
      comics.push(new Comic({ id: this._abs(href), title: title, cover: this._fix(cover) }));
    }
    return comics;
  }

  explore = [
    { title: "热门排行", type: "multiPartPage", load: async () => {
        var res = await Network.get(this.baseUrl + "/", this._headers());
        if (res.status !== 200) throw "HTTP " + res.status;
        var doc = new HtmlDocument(res.body);
        return [{ title: "热门排行", comics: this._list(doc), viewMore: null }];
    }},
    { title: "最近更新", type: "multiPartPage", load: async () => {
        var res = await Network.get(this.baseUrl + "/?sort=updated", this._headers());
        if (res.status !== 200) throw "HTTP " + res.status;
        var doc = new HtmlDocument(res.body);
        return [{ title: "最近更新", comics: this._list(doc), viewMore: null }];
    }}
  ];

  // ====== 搜索 ======
  search = {
    load: async (keyword, opts, page) => {
      var url = this.baseUrl + "/?q=" + encodeURIComponent(keyword);
      try {
        var res = await Network.get(url, this._headers());
        if (res.status !== 200) return { comics: [], maxPage: 0 };
        var doc = new HtmlDocument(res.body);
        return { comics: this._list(doc), maxPage: 1 };
      } catch (e) { return { comics: [], maxPage: 0 }; }
    }
  };

  // ====== 分类（暂无）======
  category = { title: "DogeManga", parts: [], enableRankingPage: false };
  categoryComics = { load: async () => ({ comics: [], maxPage: 0 }) };

  // ====== 漫画详情 ======
  comic = {
    loadInfo: async (id) => {
      var url = this._abs(id);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;

      // 标题: og:title / <title>
      var title = "";
      var om = html.match(/<title>([^<]+)/);
      if (om) title = om[1].replace(/\s*[-–—|].*$/, "").trim();
      if (!title) {
        var ogt = html.match(/property="og:title"[^>]*content="([^"]+)"/i);
        if (ogt) title = ogt[1].replace(/\s*[-–—|].*$/, "").trim();
      }

      // 封面: /images/manga-thumbnails/<slug>.jpg
      var slug = String(id).match(/\/m\/([A-Za-z0-9_-]+)/);
      var cover = "";
      var ogi = html.match(/property="og:image"[^>]*content="([^"]+)"/i);
      if (ogi && !/logo/.test(ogi[1])) cover = ogi[1];
      if (!cover && slug) cover = this.baseUrl + "/images/manga-thumbnails/" + slug[1] + ".jpg";

      // 作者: 正则
      var author = "";
      var am = html.match(/作者[：:]\s*([^<\n]{1,40})/);
      if (am) author = am[1].trim().replace(/<[^>]+>/g, "");

      // 状态: 正则
      var status = "unknown";
      if (/連載中|连载中/.test(html)) status = "ongoing";
      else if (/已完結|已完结|完結/.test(html)) status = "completed";

      // 简介: og:description
      var desc = "";
      var ogd = html.match(/property="og:description"[^>]*content="([^"]+)"/i);
      if (ogd) desc = ogd[1].trim();

      // 章节: data-page-url="/p/<pageId>"（页面最新在前，需反转）
      var chArr = [];
      var seenCh = {};
      var re = /data-page-url="(\/p\/([A-Za-z0-9_-]+))"/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var pid = m[2];
        if (!pid || seenCh[pid]) continue;
        seenCh[pid] = true;
        // 尝试从后续文本获取章节名（data-page-url 附近的链接文本）
        var ct = "第" + (chArr.length + 1) + "页";
        chArr.push([this._abs(m[1]), ct]);
      }
      // 标题从 body 文本中匹配（data-page-url 附近通常有链接）
      var linkRe = /<a[^>]+href="\/p\/([A-Za-z0-9_-]+)"[^>]*>([^<]+)<\/a>/gi;
      var nameMap = {};
      var lm;
      while ((lm = linkRe.exec(html)) !== null) {
        nameMap[lm[1]] = lm[2].trim();
      }
      for (var i = 0; i < chArr.length; i++) {
        var pid2 = chArr[i][0].match(/\/p\/([A-Za-z0-9_-]+)/);
        if (pid2 && nameMap[pid2[1]]) chArr[i][1] = nameMap[pid2[1]];
      }
      // 反转：最新在前 → 最早在前
      var chapters = new Map();
      for (var i = chArr.length - 1; i >= 0; i--) {
        chapters.set(chArr[i][0], chArr[i][1]);
      }

      return new ComicDetails({
        id: url, title: title, cover: this._abs(cover), author: author,
        description: desc, tags: {}, status: status, chapters: chapters
      });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      // 阅读页图片：data-page-image-url / images/pages/<pageId>.jpg
      var images = [];
      var re = /data-page-image-url="(https?:\/\/dogemanga\.com\/images\/pages\/[^"]+\.jpg)"/gi;
      var m;
      var seenImg = {};
      while ((m = re.exec(html)) !== null) {
        var u = m[1];
        if (!seenImg[u]) { seenImg[u] = 1; images.push(u); }
      }
      // 兜底：og:image
      if (!images.length) {
        var ogi2 = html.match(/property="og:image"[^>]+content="(https?:\/\/dogemanga\.com\/images\/pages\/[^"]+\.jpg)"/i);
        if (ogi2) images.push(ogi2[1]);
      }
      // 兜底：data-page-image-url 属性
      if (!images.length) {
        var re2 = /data-page-image-url="([^"]+)"/gi;
        var m2;
        while ((m2 = re2.exec(html)) !== null) {
          var u2 = this._abs(m2[1]);
          if (!seenImg[u2]) { seenImg[u2] = 1; images.push(u2); }
        }
      }
      return { images: images };
    },

    onImageLoad: (url) => ({
      url: url,
      headers: { "User-Agent": this.UA, "Referer": "https://dogemanga.com/", "Accept": "image/webp,image/*" }
    }),
    idMatch: "(/m/[A-Za-z0-9_-]+)"
  };
}
