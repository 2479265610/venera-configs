/**
 * DogeManga (dogemanga.com) —— Venera 漫画源 v1.1.0
 * ===============================================================
 * SSR 站点，所有数据在 HTML 中（data-* 属性 + og meta），无需 API 无需 JS。
 * 纯正则解析：不依赖 HtmlDocument querySelector（规避 Venera 兼容性差异）。
 *
 * 已从 HAR + 真实抓取确认:
 *   首页    /                         → .site-card[data-manga-id] 卡片
 *   详情    /m/<slug>                 → og meta + data-page-url 章节
 *           封面 /images/manga-thumbnails/<slug>.jpg
 *   阅读    /p/<pageId>               → data-page-image-url 图片直出
 *   搜索    /?q=<keyword>             → 同首页卡片
 */
class dogemanga extends ComicSource {
  name = "DogeManga";
  key = "dogemanga";
  version = "1.1.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/dogemanga.js";
  baseUrl = "https://dogemanga.com";
  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36";

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

  // ====== 列表解析（纯正则，逐卡片分块） ======
  _list(html) {
    var comics = [], seen = {};
    // 按 data-manga-id 切分卡片，逐块解析（避免跨卡片贪婪匹配）
    var parts = html.split("data-manga-id=\"");
    for (var k = 1; k < parts.length; k++) {
      var chunk = parts[k];
      // 提取 manga-id（引号前部分）
      var sid = chunk.match(/^([^\"]+)/);
      if (!sid || seen[sid[1]]) continue;
      seen[sid[1]] = true;
      // 提取漫画链接
      var hm = chunk.match(/href="(https?:\/\/dogemanga\.com\/m\/[^"]+)"/i);
      if (!hm) continue;
      // 提取封面图 src
      var cm = chunk.match(/<img[^>]+src="(https?:\/\/dogemanga\.com\/images\/manga-thumbnails\/[^"]+\.jpg)"/i);
      var cover = cm ? cm[1] : (this.baseUrl + "/images/manga-thumbnails/" + sid[1] + ".jpg");
      // 提取标题（img alt 或 card-title 链接文本）
      var title = "";
      var am = chunk.match(/<img[^>]+alt="([^"]+)"/i);
      if (am && am[1] && !/logo/i.test(am[1])) title = am[1];
      if (!title) {
        var tm = chunk.match(/card-title[^>]*>\s*<a[^>]*>([^<]+)</i);
        if (tm) title = tm[1].trim();
      }
      if (!title) title = sid[1];
      // 排除无图卡片（空 card 容器，如首个 site-card--uninitialized）
      if (!cm && chunk.indexOf("<div class=\"card\"></div>") >= 0) continue;
      comics.push(new Comic({ id: this._abs(hm[1]), title: title, cover: this._fix(cover) }));
    }
    return comics;
  }

  explore = [
    { title: "热门排行", type: "multiPartPage", load: async () => {
        var res = await Network.get(this.baseUrl + "/", this._headers());
        if (res.status !== 200) throw "HTTP " + res.status;
        return [{ title: "热门排行", comics: this._list(res.body), viewMore: null }];
    }},
    { title: "最近更新", type: "multiPartPage", load: async () => {
        var res = await Network.get(this.baseUrl + "/?sort=updated", this._headers());
        if (res.status !== 200) throw "HTTP " + res.status;
        return [{ title: "最近更新", comics: this._list(res.body), viewMore: null }];
    }}
  ];

  // ====== 搜索 ======
  search = {
    load: async (keyword, opts, page) => {
      var url = this.baseUrl + "/?q=" + encodeURIComponent(keyword);
      try {
        var res = await Network.get(url, this._headers());
        if (res.status !== 200) return { comics: [], maxPage: 0 };
        return { comics: this._list(res.body), maxPage: 1 };
      } catch (e) { return { comics: [], maxPage: 0 }; }
    }
  };

  // ====== 分类（站点无传统分类体系） ======
  category = { title: "DogeManga", parts: [], enableRankingPage: false };
  categoryComics = { load: async () => ({ comics: [], maxPage: 0 }) };

  // ====== 漫画详情（纯正则） ======
  comic = {
    loadInfo: async (id) => {
      var url = this._abs(id);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;

      // 标题: og:title 或 <title>
      var title = "";
      var tm = html.match(/<title>([^<]+)/);
      if (tm) title = tm[1].replace(/\s*[-–—|]\s*(DogeManga|dogemanga).*$/i, "").trim();
      if (!title) {
        var ogt = html.match(/property="og:title"[^>]*content="([^"]+)"/i);
        if (ogt) title = ogt[1].trim();
      }

      // 封面: og:image（排除 logo）
      var cover = "";
      var ogi = html.match(/property="og:image"[^>]*content="(https?:\/\/dogemanga\.com\/images\/[^"]+\.jpg)"/i);
      if (ogi && !/logo/i.test(ogi[1])) cover = ogi[1];
      if (!cover) {
        var slug = String(id).match(/\/m\/([A-Za-z0-9_-]+)/);
        if (slug) cover = this.baseUrl + "/images/manga-thumbnails/" + slug[1] + ".jpg";
      }

      // 作者
      var author = "";
      var am = html.match(/作者[：:]\s*([^<\n]{1,40})/);
      if (am) author = am[1].trim().replace(/<[^>]+>/g, "");

      // 状态
      var status = "unknown";
      if (/連載中|连载中/.test(html)) status = "ongoing";
      else if (/已完結|已完结|完結/.test(html)) status = "completed";

      // 简介: og:description
      var desc = "";
      var ogd = html.match(/property="og:description"[^>]*content="([^"]+)"/i);
      if (ogd) desc = ogd[1].trim();

      // 标签
      var tags = {};
      var tagList = [];
      var tagM = [...html.matchAll(/<a[^>]+href="[^"]*\?tags=\d+"[^>]*>([^<]+)<\/a>/gi)];
      for (var t = 0; t < tagM.length; t++) {
        var tn = tagM[t][1].trim();
        if (tn && tn.length <= 10) tagList.push(tn);
      }
      if (tagList.length) tags["标签"] = tagList;

      // 章节: data-page-url="/p/<pageId>" + 对应链接文本
      var chapters = new Map();
      // 先匹配所有 /p/ 链接文本
      var linkMap = {};
      var linkM = html.match(/<a[^>]+href="(\/p\/([A-Za-z0-9_-]+))"[^>]*>([^<]+)<\/a>/gi);
      var lm;
      while ((lm = /<a[^>]+href="(\/p\/([A-Za-z0-9_-]+))"[^>]*>([^<]+)<\/a>/gi.exec(html)) !== null) {
        var pid = lm[2], chName = lm[3].trim();
        if (pid && !linkMap[pid]) linkMap[pid] = chName;
      }
      // 再提取 data-page-url 的章节 ID（页面最新在前，但整体顺序已正确）
      var dpM = html.match(/data-page-url="(\/p\/([A-Za-z0-9_-]+))"/gi);
      var dm;
      var chArr = [];
      while ((dm = /data-page-url="(\/p\/([A-Za-z0-9_-]+))"/gi.exec(html)) !== null) {
        var path2 = dm[1], pid2 = dm[2];
        if (!pid2) continue;
        var name = linkMap[pid2] || ("第" + (chArr.length + 1) + "页");
        chArr.push([this._abs(path2), name]);
      }
      // 反转: data-page-url 通常最新在前，反转成最早在前
      for (var i = chArr.length - 1; i >= 0; i--) {
        chapters.set(chArr[i][0], chArr[i][1]);
      }

      return new ComicDetails({
        id: url, title: title, cover: this._abs(cover), author: author,
        description: desc, tags: tags, status: status, chapters: chapters
      });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var images = [];
      var seenImg = {};
      // data-page-image-url 属性
      var re = /data-page-image-url="(https?:\/\/dogemanga\.com\/images\/pages\/[^"]+\.jpg)"/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var u = m[1];
        if (!seenImg[u]) { seenImg[u] = 1; images.push(u); }
      }
      if (!images.length) {
        // 兜底: og:image
        var ogi = html.match(/property="og:image"[^>]*content="(https?:\/\/dogemanga\.com\/images\/pages\/[^"]+\.jpg)"/i);
        if (ogi) images.push(ogi[1]);
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
