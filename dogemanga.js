/**
 * DogeManga (dogemanga.com) —— Venera 漫画源 v1.2.0
 * ===============================================================
 * SSR 站点，数据内联在 HTML（data-* 属性 + og meta），无需 API/JS。
 * Playwright 浏览器实测: 24 张 .site-card 卡片，img.card-img-top[src] + h5 a 标题。
 */
class dogemanga extends ComicSource {
  name = "DogeManga";
  key = "dogemanga";
  version = "1.2.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/dogemanga.js";
  baseUrl = "https://dogemanga.com";
  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/127.0.0.0 Safari/537.36";

  _headers() {
    return {
      "User-Agent": this.UA,
      "Accept": "text/html;q=0.9,*/*;q=0.8",
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

  // ====== 列表解析：逐卡片纯 HTML 文本提取 ======
  _list(html) {
    var comics = [], seen = {};
    var pos = 0;
    while (true) {
      // 找下一个 site-card
      var cardStart = html.indexOf("data-manga-id=\"", pos);
      if (cardStart < 0) break;
      cardStart += 15; // 跳过 "data-manga-id=\""
      // 取 manga-id
      var idEnd = html.indexOf("\"", cardStart);
      if (idEnd < 0) break;
      var dmId = html.substring(cardStart, idEnd);
      pos = idEnd + 1;
      if (!dmId || seen[dmId]) continue;
      seen[dmId] = true;
      // 检测空卡片：到下一个 data-manga-id 之前都没 img/title → 跳过
      var nextCard = html.indexOf("data-manga-id=\"", pos);
      var end = nextCard > 0 ? nextCard : pos + 500;
      var chunk2 = html.substring(pos, end);
      var hasImg2 = chunk2.indexOf("card-img-top") >= 0;
      var hasTitle2 = chunk2.indexOf("card-title") >= 0;
      if (!hasImg2 && !hasTitle2) continue;
      // 提取封面: img...src="...thumbnails/xxx.jpg"
      var cover = "";
      var imgStart = html.indexOf("card-img-top", pos);
      if (imgStart > 0) {
        var srcStart = html.indexOf("src=\"", imgStart);
        if (srcStart > 0 && srcStart < pos + 2000) {
          var srcEnd = html.indexOf("\"", srcStart + 5);
          if (srcEnd > 0) cover = html.substring(srcStart + 5, srcEnd);
        }
      }
      if (!cover || /logo/i.test(cover)) {
        cover = this.baseUrl + "/images/manga-thumbnails/" + dmId + ".jpg";
      }
      // 提取标题: card-title...>xxxx<
      var title = "";
      var titleStart = html.indexOf("card-title", pos);
      if (titleStart > 0 && titleStart < pos + 3000) {
        var tagEnd = html.indexOf(">", html.indexOf("<a", titleStart));
        if (tagEnd > 0) {
          var titleEnd = html.indexOf("<", tagEnd + 1);
          if (titleEnd > 0) title = html.substring(tagEnd + 1, titleEnd).trim();
        }
      }
      if (!title) {
        var altStart = html.indexOf("alt=\"", pos);
        if (altStart > 0 && altStart < pos + 2000) {
          var altEnd = html.indexOf("\"", altStart + 5);
          if (altEnd > 0) title = html.substring(altStart + 5, altEnd);
        }
      }
      if (!title || /logo/i.test(title)) title = dmId;
      comics.push(new Comic({
        id: this.baseUrl + "/m/" + dmId,
        title: title,
        cover: this._fix(cover)
      }));
    }
    return comics;
  }

  explore = [
    {
      title: "热门排行",
      type: "multiPageComicList",
      load: async (page) => {
        var res = await Network.get(this.baseUrl + "/", this._headers());
        if (res.status !== 200) throw "HTTP " + res.status;
        return { comics: this._list(res.body), maxPage: 1 };
      }
    }
  ];

  // ====== 搜索 ======
  search = {
    load: async (keyword, opts, page) => {
      var res = await Network.get(this.baseUrl + "/?q=" + encodeURIComponent(keyword), this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      return { comics: this._list(res.body), maxPage: 1 };
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
      var html = res.body;

      // 标题
      var title = "";
      var tm = html.match(/<title>([^<]+)/);
      if (tm) title = tm[1].replace(/\s*[-–—|].*$/, "").trim();

      // 封面
      var cover = "";
      var ogi = html.match(/property="og:image"[^>]*content="([^"]+\.jpg)"/i);
      if (ogi && !/logo/i.test(ogi[1])) cover = ogi[1];

      // 作者
      var author = "";
      var am = html.match(/作者[：:]\s*([^<\n]{1,40})/);
      if (am) author = am[1].replace(/<[^>]+>/g, "").trim();

      // 状态
      var status = "unknown";
      if (/連載中|连载中/.test(html)) status = "ongoing";
      else if (/已完結|已完结|完結/.test(html)) status = "completed";

      // 简介
      var desc = "";
      var ogd = html.match(/property="og:description"[^>]*content="([^"]+)"/i);
      if (ogd) desc = ogd[1].trim();

      // 章节: data-page-url="/p/xxx" + 对应链接文本
      var chapters = new Map();
      var chRe = /data-page-url="(\/p\/([A-Za-z0-9_-]+))"/gi;
      var cm;
      var chKeys = [];
      while ((cm = chRe.exec(html)) !== null) {
        chKeys.push([cm[1], cm[2]]);
      }
      // 从链文本提取章节名
      var linkMap = {};
      var lmRe = /<a[^>]+href="(\/p\/([A-Za-z0-9_-]+))"[^>]*>([^<]+)<\/a>/gi;
      var lm;
      while ((lm = lmRe.exec(html)) !== null) {
        linkMap[lm[2]] = lm[3].trim();
      }
      // 反转（data-page-url 页面最新在前）
      for (var i = chKeys.length - 1; i >= 0; i--) {
        var path = chKeys[i][0], pid = chKeys[i][1];
        var name = linkMap[pid] || path;
        chapters.set(this._abs(path), name);
      }

      return new ComicDetails({
        id: url, title: title, cover: this._abs(cover), author: author,
        description: desc, status: status, chapters: chapters
      });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var images = [], seen = {};
      var re = /data-page-image-url="(https?:\/\/dogemanga\.com\/images\/pages\/[^"]+\.jpg)"/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        if (!seen[m[1]]) { seen[m[1]] = 1; images.push(m[1]); }
      }
      if (!images.length) {
        var ogi2 = html.match(/property="og:image"[^>]*content="(https?:\/\/dogemanga\.com\/images\/pages\/[^"]+)"/i);
        if (ogi2) images.push(ogi2[1]);
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
