/**
 * 色友漫画 (www.seyoumanhua.top) —— Venera 漫画源 v1.0.0
 * 原 18色漫画(18seman.com) 新站，同一套 PHP CMS。
 * 发现/分类走 JSON API：/index.php/api/data/comic?type[order]=&type[list]=&type[pay]=&type[finish]=&type[tags]=&page=
 * 搜索走 HTML：/index.php/search?key=xxx  （div.mh-item 卡片）
 * 详情走 HTML：/index.php/comic/<slug>  （.detail-info-* 区块 + #chapterlistload 章节）
 * 阅读走 HTML：/index.php/chapter/<id>  （.main-container .main-item img）
 */
class seyoumanhua extends ComicSource {
  name = "色友漫画";
  key = "seyoumanhua";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/seyoumanhua.js";
  baseUrl = "https://www.seyoumanhua.top";
  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

  // ====== 通用工具 ======
  _headers() {
    return {
      "User-Agent": this.UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": this.baseUrl + "/"
    };
  }
  _apiHeaders() {
    return {
      "User-Agent": this.UA,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": this.baseUrl + "/",
      "X-Requested-With": "XMLHttpRequest"
    };
  }
  _abs(href) {
    if (!href) return "";
    href = String(href).trim();
    if (/^https?:\/\//i.test(href)) {
      // 站内链接（/index.php/...）统一到 baseUrl 域名——列表/章节 href 常为 seyoumanhua.com 绝对地址
      var p = href.match(/^https?:\/\/[^\/]+(\/index\.php\/[\s\S]*)$/);
      if (p) return this.baseUrl + p[1];
      return href;
    }
    return this.baseUrl + (href.charAt(0) === "/" ? href : "/" + href);
  }
  _fix(u) { return u.replace(/^http:\/\//i, "https://"); }

  // JSON API 发现页构造
  _apiUrl(order, list, finish, tags, page) {
    var q = "type%5Border%5D=" + (order || "hits") +
      "&type%5Blist%5D=" + (list || "0") +
      "&type%5Bpay%5D=0" +
      "&type%5Bfinish%5D=" + (finish || "0");
    if (tags) q += "&type%5Btags%5D=" + encodeURIComponent(tags);
    q += "&page=" + (page || 1);
    return this.baseUrl + "/index.php/api/data/comic?" + q;
  }

  // ====== JSON API 列表解析 ======
  _apiList(body) {
    var comics = [], seen = {};
    var arr = null;
    try {
      var j = JSON.parse(body);
      if (j && Array.isArray(j.data)) arr = j.data;
      else if (j && Array.isArray(j)) arr = j;
    } catch (e) { arr = null; }
    if (!arr) return null; // 非预期返回（如 非法请求）
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i] || {};
      var href = it.url || "";
      if (!href) continue;
      href = this._abs(this._fix(href));
      if (seen[href]) continue;
      seen[href] = true;
      var title = (it.name || "").trim();
      if (!title) continue;
      comics.push(new Comic({ id: href, title: title, cover: this._fix(it.pic || "") }));
    }
    return comics;
  }

  // ====== HTML 列表解析（搜索/分类兜底）======
  // 实测（手机 UA）：分类/搜索均为 .comic_cover_container 卡片，
  // 封面是 div.comic_cover[data-original]（非 img），标题 .comic_cover_title
  _listHtml(doc) {
    var comics = [], seen = {};
    var cards = doc.querySelectorAll(".comic_cover_container");
    if (!cards.length) cards = doc.querySelectorAll(".mh-item");
    if (!cards.length) cards = doc.querySelectorAll(".main-item");
    if (!cards.length) cards = doc.querySelectorAll(".col-md-6.col-sm-4.col-xs-3");
    for (var k = 0; k < cards.length; k++) {
      var card = cards[k];
      var href = "", title = "", cover = "";
      var a = card.querySelector("a[href*='/comic/']") || card.querySelector("a");
      if (a) href = a.attributes.href || "";
      if (!href || !/comic|manga|book|detail|list/i.test(href)) continue;
      if (seen[href]) continue;
      seen[href] = true;
      // 封面：div.comic_cover[data-original] 或 img 懒加载
      var cov = card.querySelector(".comic_cover") || card.querySelector("img");
      if (cov) cover = cov.attributes["data-original"] || cov.attributes["data-src"] || cov.attributes.src || "";
      // 标题：.comic_cover_title 优先，a 的 title/text 兜底
      var tEl = card.querySelector(".comic_cover_title");
      if (tEl) title = String(tEl.text || "").trim();
      if (!title && a) title = String(a.attributes.title || a.text || "").trim();
      if (!title) continue;
      comics.push(new Comic({ id: this._abs(this._fix(href)), title: title, cover: this._fix(cover) }));
    }
    return comics;
  }

  // HTML 分页最大页数
  _maxPage(doc, cur) {
    var max = cur || 1;
    var as = doc.querySelectorAll("a[href*='page='], a[href*='/page/']");
    for (var i = 0; i < as.length; i++) {
      var h = as[i].attributes.href || "";
      var m = h.match(/page=(\d+)/) || h.match(/\/page\/(\d+)/);
      if (m) { var n = parseInt(m[1]); if (n > max) max = n; }
    }
    return max;
  }

  // 通用列表页（API 优先，HTML 兜底）
  _loadApi(order, list, finish, tags, page) {
    return (async () => {
      var p = page || 1;
      var res = await Network.get(this._apiUrl(order, list, finish, tags, p), this._apiHeaders());
      if (res.status === 200 && res.body) {
        var comics = this._apiList(res.body);
        if (comics !== null) return { comics: comics, maxPage: 0 };
      }
      // 兜底：HTML 分类页
      var fallback = this.baseUrl + "/index.php/category/list/" + (list || "0");
      var res2 = await Network.get(fallback, this._headers());
      if (res2.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res2.body);
      return { comics: this._listHtml(doc), maxPage: this._maxPage(doc, p) };
    })();
  }

  _loadCategoryPage(list, page) {
    return (async () => {
      var p = page || 1;
      var url = this.baseUrl + "/index.php/category/list/" + list + "/page/" + p;
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res.body);
      return { comics: this._listHtml(doc), maxPage: this._maxPage(doc, p) };
    })();
  }

  // ====== 发现页 ======
  explore = [
    { title: "最近更新", type: "multiPageComicList", load: async (page) => this._loadApi("addtime", "0", "0", "", page || 1) },
    { title: "人气排行", type: "multiPageComicList", load: async (page) => this._loadApi("hits", "0", "0", "", page || 1) }
  ];

  // ====== 搜索 ======
  search = {
    load: async (keyword, opts, page) => {
      var p = page || 1;
      var url = this.baseUrl + "/index.php/search?key=" + encodeURIComponent(keyword) + "&page=" + p;
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res.body);
      return { comics: this._listHtml(doc), maxPage: this._maxPage(doc, p) };
    }
  };

  // ====== 分类 ======
  category = {
    title: "色友漫画",
    parts: [
      {
        name: "题材", type: "fixed", itemType: "category",
        categories: ["全部", "都市", "恋爱", "出版漫画", "校园", "萝莉", "正太", "淫荡", "正妹", "肉慾", "狗血劇", "浪漫", "大尺度", "有夫之婦", "女大生", "同居", "巨乳", "調教", "动作", "不倫", "耽美", "好友", "校園", "3D", "後宮", "日漫"],
        categoryParams: ["0", "5", "6", "35", "8", "9", "12", "13", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34"]
      },
      {
        name: "排序", type: "fixed", itemType: "category",
        categories: ["人气", "最新", "评分"],
        categoryParams: ["hits", "addtime", "score"]
      },
      {
        name: "状态", type: "fixed", itemType: "category",
        categories: ["全部", "完结"],
        categoryParams: ["0", "1"]
      }
    ],
    enableRankingPage: false
  };
  categoryComics = {
    load: async (category, param, options, page) => {
      var p = page || 1;
      var list = "0", order = "hits", finish = "0";
      if (options && options.length) {
        list = options[0] || "0";
        order = options[1] || "hits";
        finish = options[2] || "0";
      } else {
        if (category === "题材") list = param || "0";
        else if (category === "排序") order = param || "hits";
        else if (category === "状态") finish = param || "0";
      }
      var url = this._apiUrl(order, list, finish, "", p);
      var res = await Network.get(url, this._apiHeaders());
      if (res.status === 200 && res.body) {
        var comics = this._apiList(res.body);
        if (comics !== null) return { comics: comics, maxPage: 0 };
      }
      // 兜底：题材 -> 分类 HTML 页
      if (category === "题材") {
        var f2 = this.baseUrl + "/index.php/category/list/" + (list || "0") + "/page/" + p;
        var r2 = await Network.get(f2, this._headers());
        if (r2.status !== 200) return { comics: [], maxPage: 0 };
        var d2 = new HtmlDocument(r2.body);
        return { comics: this._listHtml(d2), maxPage: this._maxPage(d2, p) };
      }
      return { comics: [], maxPage: 0 };
    }
  };

  // ====== 详情 ======
  comic = {
    loadInfo: async (id) => {
      var res = await Network.get(this._abs(id), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var html = res.body;

      var title = "";
      var t1 = doc.querySelector(".detail-info-title");
      if (t1) title = t1.text.trim();
      if (!title) { var h1 = doc.querySelector("h1"); if (h1) title = h1.text.trim(); }

      var cover = "";
      var cov = doc.querySelector(".detail-info-cover img, .detail-info-cover, .comic-cover img, img.lazy[data-original]");
      if (cov) cover = cov.attributes["data-original"] || cov.attributes["data-src"] || cov.attributes.src || "";

      var author = "";
      var au = doc.querySelector(".detail-info-tip span a");
      if (au) author = au.text.trim();
      if (!author) { var am = html.match(/作者[：:]\s*([^<\n]{2,24})/); if (am) author = am[1].trim(); }

      var desc = "";
      var d1 = doc.querySelector(".detail-info-content");
      if (d1) desc = d1.text.trim();
      if (!desc) { var dm = html.match(/class="desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i); if (dm) desc = dm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }

      var tags = {};
      var tl = [];
      var tEls = doc.querySelectorAll("a[href*='/category/']");
      for (var i = 0; i < tEls.length; i++) {
        var t = tEls[i].text.trim();
        if (t && t.length < 10 && tl.indexOf(t) < 0) tl.push(t);
      }
      if (tl.length) tags["分类"] = tl;

      var status = "unknown";
      if (/完结/.test(html)) status = "completed"; else if (/连载/.test(html)) status = "ongoing";

      var chapters = new Map();
      var chs = doc.querySelectorAll("#chapterlistload a, .chapter-list a, ul.chapter-list li a");
      if (!chs.length) chs = doc.querySelectorAll("a[href*='/index.php/chapter/'], a[href*='/chapter/']");
      for (var c = 0; c < chs.length; c++) {
        var a = chs[c];
        var h = a.attributes.href || "";
        if (!/chapter/i.test(h)) continue;
        var t = a.text.trim();
        if (t) chapters.set(this._abs(this._fix(h)), t);
      }
      return new ComicDetails({ id: id, title: title, cover: this._fix(cover), author: author, description: desc, tags: tags, status: status, chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var imgs = doc.querySelectorAll(".main-container .main-item img, .main-item img, .chapter-img img, .content img");
      if (!imgs.length) imgs = doc.querySelectorAll("img");
      var images = [];
      var seenImg = {};
      for (var i = 0; i < imgs.length; i++) {
        var u = imgs[i].attributes["data-original"] || imgs[i].attributes["data-src"] || imgs[i].attributes.src || "";
        u = String(u).trim();
        if (!u) continue;
        if (!/\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(u)) continue;
        if (/seyoumanhua\.(top|com)\/(img|static)\//i.test(u)) continue; // 站内 logo
        u = this._abs(this._fix(u)); // 关键：相对路径补全，否则 App 下载报 Invalid argument
        if (seenImg[u]) continue;
        seenImg[u] = 1;
        images.push(u);
      }
      return { images: images };
    },

    onImageLoad: (url) => ({ url: url, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0", "Referer": "https://www.seyoumanhua.top/", "Accept": "image/webp,image/*" } }),
    idMatch: "(\\/index\\.php\\/comic\\/[a-zA-Z0-9]+)"
  };
}
