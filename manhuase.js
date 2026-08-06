/**
 * 311s 漫画社 (www.311s.com) —— Venera 漫画源 v2.0
 * ===============================================================
 * 章节图片直接 <img src> 无需解密，详情页一次加载全部话数。
 */
class ManHuaShe extends ComicSource {
  name = "漫画社";
  key = "mamhuase";
  version = "2.0.0";
  minAppVersion = "1.0.0";
  url = "";

  baseUrl = "https://www.311s.com";
  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  _headers() { return {
    "User-Agent": this.UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    CacheControl: "no-cache",
    Pragma: "no-cache",
    Referer: this.baseUrl + "/",
  }; }

  // ====== 通用: 从 HTML 提取漫画卡片列表 ======
  parseCards(doc) {
    var comics = [];
    var items = doc.querySelectorAll(".comic-item");
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var href = item.attributes["href"] || "";
      if (!href) {
        var a = item.querySelector("a[href*='/comic_']");
        if (a) href = a.attributes["href"] || "";
      }
      if (!href) continue;
      var id = href.match(/(\/comic_\d+\.html)/);
      if (!id) continue;

      var img = item.querySelector("img");
      var cover = "";
      if (img) cover = img.attributes["data-src"] || img.attributes["src"] || "";

      var title = "";
      var h3 = item.querySelector("h3");
      if (h3) {
        var ha = h3.querySelector("a");
        title = ha ? ha.text.trim() : h3.text.trim();
      }
      if (!title && img) title = img.attributes["alt"] || "";

      var descEl = item.querySelector(".comic-author") || item.querySelector(".comic-desc");
      var subTitle = descEl ? descEl.text.trim() : "";

      comics.push(new Comic({ id: id[1], title: title, cover: cover, subTitle: subTitle }));
    }
    return comics;
  }

  // ====== 分页提取 ======
  parseMaxPage(doc) {
    var max = 1;
    var pageLinks = doc.querySelectorAll("a[href*='page=']");
    for (var i = 0; i < pageLinks.length; i++) {
      var h = pageLinks[i].attributes["href"] || "";
      var pm = h.match(/page=(\d+)/);
      if (pm) max = Math.max(max, parseInt(pm[1]));
    }
    return max;
  }

  // ===========================================
  // 浏览
  // ===========================================
  explore = [
    {
      title: "漫画社推荐",
      type: "multiPartPage",
      load: async () => {
        var res = await Network.get(this.baseUrl + "/", this._headers());
        if (res.status !== 200) throw "HTTP Error " + res.status;
        var doc = new HtmlDocument(res.body);
        var comics = this.parseCards(doc);
        return [{ title: "推荐", comics: comics, viewMore: null }];
      },
    },
    {
      title: "漫画社排行",
      type: "multiPageComicList",
      load: async (page) => {
        var p = page || 1;
        var res = await Network.get(this.baseUrl + "/custom/top?page=" + p, this._headers());
        if (res.status !== 200) throw "HTTP Error " + res.status;
        var doc = new HtmlDocument(res.body);
        var comics = this.parseCards(doc);
        var maxPage = Math.max(p, this.parseMaxPage(doc));
        return { comics: comics, maxPage: maxPage };
      },
    },
  ];

  // ===========================================
  // 搜索 (GET /search?key=关键词)
  // ===========================================
  search = {
    enableTagsSuggestions: false,
    onTagSuggestionSelected: null,
    load: async (keyword) => {
      var res = await Network.get(this.baseUrl + "/search?key=" + encodeURIComponent(keyword), this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res.body);
      var comics = this.parseCards(doc);
      return { comics: comics, maxPage: 1 };
    },
  };

  // ===========================================
  // 分类 (全部标签, 来自站点 /category/ 页面)
  // ===========================================
  category = {
    title: "漫画社",
    parts: [{
      name: "类型",
      type: "fixed",
      categories: [
        "热血","冒险","科幻","霸总","玄幻","校园","修真","搞笑",
        "穿越","后宫","耽美","恋爱","悬疑","恐怖","战争","动作",
        "同人","竞技","励志","架空","灵异","百合","古风","生活",
        "真人","都市","日常","神鬼","幽默爆笑","推理","青春",
        "爆笑","纯爱","剧情","逆袭","少年","奇幻冒险","美食",
        "奇幻","唯美","治愈","爱情","TL","搞笑喜剧","合集","短篇",
        "后宫·宮廷","格斗","魔幻","恐怖·惊悚","西幻","推理悬疑",
        "韩漫","脑洞","暗黑","欢乐向","长条","武侠","大女主","异形","职场"
      ],
      itemType: "category",
      categoryParams: [
        "6","7","8","9","10","11","12","13",
        "14","15","16","17","18","19","20","21",
        "22","23","24","25","26","27","28","29",
        "30","31","48","49","50","51","52",
        "53","54","55","56","57","58","59",
        "60","61","62","63","64","65","66","67",
        "68","69","70","71","72","73",
        "74","75","76","77","78","79","80","81","82"
      ],
    }],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      var p = page || 1;
      var res = await Network.get(this.baseUrl + "/category/tags/" + param + "?page=" + p, this._headers());
      if (res.status !== 200) throw "HTTP Error " + res.status;
      var doc = new HtmlDocument(res.body);
      var comics = this.parseCards(doc);
      var maxPage = Math.max(p, this.parseMaxPage(doc));
      return { comics: comics, maxPage: maxPage };
    },
  };

  // ===========================================
  // 漫画详情
  // ===========================================
  comic = {
    loadInfo: async (id) => {
      var res = await Network.get(this.baseUrl + id, this._headers());
      if (res.status !== 200) throw "HTTP Error " + res.status;
      var doc = new HtmlDocument(res.body);

      // 标题
      var titleEl = doc.querySelector("h1, .comic-title, .detail-title");
      var title = titleEl ? titleEl.text.trim() : "";

      // 封面
      var coverEl = doc.querySelector(".comic-cover img, .detail-cover img");
      var cover = coverEl ? (coverEl.attributes["src"] || coverEl.attributes["data-src"] || "") : "";

      // 作者 & 状态
      var author = "";
      var status = "unknown";
      var metaEls = doc.querySelectorAll(".comic-meta span, .detail-meta span, .info-item");
      for (var i = 0; i < metaEls.length; i++) {
        var t = metaEls[i].text;
        if (t.indexOf("作者") >= 0) author = t.replace(/.*作者[：:]/, "").trim();
        if (t.indexOf("状态") >= 0) {
          var s = t.replace(/.*状态[：:]/, "").trim();
          if (/连载|更新/.test(s)) status = "ongoing";
          else if (/完/.test(s)) status = "completed";
        }
      }

      // 简介
      var description = "";
      var descEl = doc.querySelector('meta[name="description"]');
      if (descEl && descEl.attributes["content"]) {
        description = descEl.attributes["content"].trim();
      } else {
        var introEl = doc.querySelector(".comic-desc, .detail-desc, .intro");
        if (introEl) description = introEl.text.trim();
      }

      // 标签
      var tags = [];
      var tagEls = doc.querySelectorAll("a[href*='/category/tags/']");
      for (var i = 0; i < tagEls.length; i++) {
        var txt = tagEls[i].text.trim();
        if (txt && txt.length < 10) tags.push(txt);
      }

      // 章节 (详情页直接列出全部，页面默认最新在前)
      // 用数组收集再反转，避免依赖 Map 的迭代器 API（Venera 可能不支持 entries/clear）
      var chArr = [];
      for (var i = 0; i < chapterEls.length; i++) {
        var a = chapterEls[i];
        var chref = a.attributes["href"];
        if (!chref) continue;
        var m = chref.match(/\/chapter_\d+_\d+\.html/);
        if (!m) continue;
        var ct = a.text.trim();
        if (ct) chArr.push([m[0], ct]);
      }
      var chapters = new Map();
      // 反转: 最新在前 → 最早在前（升序）
      for (var i = chArr.length - 1; i >= 0; i--) {
        chapters.set(chArr[i][0], chArr[i][1]);
      }

      return new ComicDetails({
        id: id, title: title, cover: cover, author: author, description: description,
        tags: tags.length > 0 ? { "标签": tags } : {},
        status: status, chapters: chapters,
      });
    },

    // 章节图片 (直接 img src，无需解密!)
    loadEp: async (comicId, epId) => {
      var res = await Network.get(this.baseUrl + epId, this._headers());
      if (res.status !== 200) throw "HTTP Error " + res.status;
      var doc = new HtmlDocument(res.body);
      var imgEls = doc.querySelectorAll(".comic-content img, .detail-content-img img, .reader-content img");
      var images = [];
      for (var i = 0; i < imgEls.length; i++) {
        var el = imgEls[i];
        var src = el.attributes["src"] || el.attributes["data-src"] || "";
        if (src && /^https?:\/\//.test(src) && /\.(webp|jpg|jpeg|png|gif)/i.test(src)) {
          images.push(src);
        }
      }
      return { images: images };
    },

    onImageLoad: (url) => ({
      url: url,
      headers: {
        "User-Agent": this.UA,
        Referer: this.baseUrl,
        Origin: this.baseUrl,
        "Sec-Ch-Ua": '"Chromium";v="126"',
        "Accept": "image/webp,image/avif,image/apng,*/*;q=0.8",
      },
    }),

    idMatch: "(/comic_\\d+\\.html)",
    enableTagsTranslate: false,
  };
}
