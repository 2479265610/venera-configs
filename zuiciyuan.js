/**
 * 最次元 (www.source-ex.com) —— Venera 漫画源 v1.0.0
 * 由 legado 书源「🎨最次元💞」移植（远程规则 qyyuapi.com/sy/js/zcy/*.js 反混淆后还原）。
 * source-ex.com 已确认在该书源的官方镜像列表内（loginUrl.urls[3]），站内品牌名显示为「开心漫画」。
 *
 * 实测路径结构：
 *   每日更新： /manga-update/{1..7}.html          （周一 ~ 周日，单页）
 *   分类筛选： /manga-lists/{地区}/{题材}/{进度}/{页}.html
 *             地区 9=全部 1=日漫 2=港台 3=美漫 4=国漫 5=韩漫 6=未分类
 *             进度 3=全部 4=连载中 1=已完结
 *   搜索：     /search?searchkey=关键词
 *   详情：     /manga/{id}/
 *   章节：     /episode/{aid}/{id}.html
 *   阅读：     POST /api/comic/read/pics   body: id={章节id}&aid={漫画id}&offset=N&limit=10
 *             返回 {data:{pic:[{pic:URL}], offset, limit, total}}，需按 total 翻页累加
 *
 * DOM：
 *   列表 .item.comic-item -> .title / .chapter / .img[src] / a[href]
 *   详情 .name(去掉.author) / .author / .type / .update_time / .last-chapter / #js_desc_content / .thumbnail img
 *   目录 .comic-chapter-item -> 文本为标题，.comic-chapter-link[href] 为链接（升序，最后一条为最新）
 */
class zuiciyuan extends ComicSource {
  name = "最次元";
  key = "zuiciyuan";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/zuiciyuan.js";

  settings = {
    domain: {
      title: "站点域名",
      type: "select",
      options: [
        { value: "https://www.source-ex.com" },
        { value: "https://www.zcymh.com" },
        { value: "https://yemancomic.com" },
        { value: "https://www.yydskxs.com" },
        { value: "https://www.yydsmh.com" },
        { value: "https://m.mhkami.com" }
      ],
      default: "https://www.source-ex.com"
    }
  };
  get baseUrl() {
    try {
      var d = this.loadSetting("domain");
      if (d && /^https?:\/\//i.test(d)) return String(d).replace(/\/+$/, "");
    } catch (e) { }
    return "https://www.source-ex.com";
  }

  UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0";

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
    if (href.indexOf("//") === 0) return "https:" + href;
    return this.baseUrl + (href.charAt(0) === "/" ? href : "/" + href);
  }

  // ====== 列表解析（.item.comic-item）======
  _list(doc) {
    var items = doc.querySelectorAll(".item.comic-item");
    if (!items || !items.length) items = doc.querySelectorAll(".comic-item");
    var comics = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var a = it.querySelector("a");
      if (!a) continue;
      var href = String(a.attributes.href || "");
      var tEl = it.querySelector(".title");
      var title = tEl ? (tEl.text || "").trim() : String(a.attributes.title || a.text || "").trim();
      var cEl = it.querySelector(".chapter");
      var sub = cEl ? (cEl.text || "").trim() : "";
      var img = it.querySelector(".img") || it.querySelector("img");
      var cover = img ? (img.attributes.src || img.attributes["data-src"] || img.attributes["data-original"] || "") : "";
      if (!href || !title) continue;
      var id = this._abs(href);
      if (seen[id]) continue;
      seen[id] = 1;
      comics.push(new Comic({ id: id, title: title, cover: this._abs(cover), subTitle: sub }));
    }
    return comics;
  }

  // 站点偶发 CAPTCHA 拦截，重试一次
  async _fetch(url, headers) {
    var res = await Network.get(url, headers || this._headers());
    if (res && res.status === 200 && String(res.body).indexOf("CAPTCHA") >= 0) {
      try { res = await Network.get(url, headers || this._headers()); } catch (e) { }
    }
    return res;
  }

  async _getList(u, p, single) {
    try {
      var res = await this._fetch(u);
      if (!res || res.status !== 200) return { comics: [], maxPage: p };
      var doc = new HtmlDocument(res.body);
      var comics = this._list(doc);
      if (single) return { comics: comics, maxPage: 1 };
      return { comics: comics, maxPage: comics.length ? 0 : p };
    } catch (e) { return { comics: [], maxPage: p }; }
  }

  // ====== 发现 ======
  _update(day, page) { return this._getList(this.baseUrl + "/manga-update/" + day + ".html", page || 1, true); }
  _lists(region, kind, state, page) {
    var p = page || 1;
    return this._getList(this.baseUrl + "/manga-lists/" + region + "/" + encodeURIComponent(kind) + "/" + state + "/" + p + ".html", p);
  }

  explore = [
    { title: "全部漫画", type: "multiPageComicList", load: async (page) => this._lists("9", "全部", "3", page) },
    { title: "周一更新", type: "multiPageComicList", load: async (page) => this._update(1, page) },
    { title: "周二更新", type: "multiPageComicList", load: async (page) => this._update(2, page) },
    { title: "周三更新", type: "multiPageComicList", load: async (page) => this._update(3, page) },
    { title: "周四更新", type: "multiPageComicList", load: async (page) => this._update(4, page) },
    { title: "周五更新", type: "multiPageComicList", load: async (page) => this._update(5, page) },
    { title: "周六更新", type: "multiPageComicList", load: async (page) => this._update(6, page) },
    { title: "周日更新", type: "multiPageComicList", load: async (page) => this._update(7, page) },
    { title: "连载中", type: "multiPageComicList", load: async (page) => this._lists("9", "全部", "4", page) },
    { title: "已完结", type: "multiPageComicList", load: async (page) => this._lists("9", "全部", "1", page) },
    { title: "韩漫", type: "multiPageComicList", load: async (page) => this._lists("5", "全部", "3", page) },
    { title: "国漫", type: "multiPageComicList", load: async (page) => this._lists("4", "全部", "3", page) }
  ];

  // ====== 搜索 ======
  search = {
    load: async (keyword, options, page) => {
      var url = this.baseUrl + "/search?searchkey=" + encodeURIComponent(keyword);
      try {
        var res = await this._fetch(url);
        if (!res || res.status !== 200) return { comics: [], maxPage: 1 };
        var doc = new HtmlDocument(res.body);
        return { comics: this._list(doc), maxPage: 1 };
      } catch (e) { return { comics: [], maxPage: 1 }; }
    }
  };

  // ====== 分类 ======
  static KINDS = [
    "全部", "长条", "大女主", "百合", "耽美", "纯爱", "後宫", "韩漫",
    "奇幻", "轻小说", "生活", "悬疑", "格斗", "搞笑", "伪娘", "竞技",
    "职场", "萌系", "冒险", "治愈", "都市", "霸总", "神鬼", "侦探",
    "爱情", "古风", "欢乐向", "科幻", "穿越", "性转换", "校园", "美食",
    "剧情", "热血", "节操", "励志", "异世界", "历史", "战争", "恐怖"
  ];

  category = {
    title: "最次元",
    parts: [
      {
        name: "题材",
        type: "fixed",
        itemType: "category",
        categories: zuiciyuan.KINDS,
        categoryParams: zuiciyuan.KINDS
      },
      {
        name: "地区",
        type: "fixed",
        itemType: "category",
        categories: ["全部", "日漫", "港台", "美漫", "国漫", "韩漫", "未分类"],
        categoryParams: ["r9", "r1", "r2", "r3", "r4", "r5", "r6"]
      },
      {
        name: "进度",
        type: "fixed",
        itemType: "category",
        categories: ["全部", "连载中", "已完结"],
        categoryParams: ["s3", "s4", "s1"]
      }
    ],
    enableRankingPage: false
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      var p = page || 1;
      var region = "9", kind = "全部", state = "3";
      var keys = [];
      if (options && options.length) keys = keys.concat(options);
      if (param) keys.push(param);
      for (var i = 0; i < keys.length; i++) {
        var v = String(keys[i] || "");
        if (!v) continue;
        if (/^r\d+$/.test(v)) region = v.slice(1);
        else if (/^s\d+$/.test(v)) state = v.slice(1);
        else kind = v;
      }
      return this._lists(region, kind, state, p);
    },
    optionList: [
      {
        options: ["r9-全部地区", "r1-日漫", "r2-港台", "r3-美漫", "r4-国漫", "r5-韩漫", "r6-未分类"],
        notShowWhen: []
      },
      {
        options: ["s3-全部进度", "s4-连载中", "s1-已完结"],
        notShowWhen: []
      }
    ]
  };

  // ====== 详情 ======
  comic = {
    loadInfo: async (id) => {
      var url = this._abs(id);
      var res = await this._fetch(url);
      if (!res || res.status !== 200) throw "HTTP " + (res ? res.status : "?");
      var html = res.body;
      var doc = new HtmlDocument(html);

      var txt = function (sel) { var e = doc.querySelector(sel); return e ? String(e.text || "").trim() : ""; };

      var author = txt(".author").replace(/[|\\,]/g, "/").replace(/\/+/g, "/").replace(/\sx\s/g, "/").trim();
      var name = txt(".name");
      if (author && name.indexOf(author) >= 0) name = name.replace(author, "").trim();
      if (!name) name = txt(".comics-detail__title") || txt("h1");

      var cover = "";
      var cov = doc.querySelector(".thumbnail img");
      if (cov) cover = cov.attributes.src || cov.attributes["data-src"] || cov.attributes["data-original"] || "";

      var updateTime = txt(".update_time");
      var typeTxt = txt(".type");
      var origin = txt(".origin");
      var count = txt(".count");
      var collect = txt(".js_collect_num");

      var desc = "";
      var d1 = doc.querySelector("#js_desc_content");
      if (d1) desc = String(d1.text || "").trim();
      var head = [];
      if (updateTime) head.push("更新时间：" + updateTime);
      if (count) head.push("人气：" + count);
      if (collect) head.push("收藏：" + collect);
      if (head.length) desc = head.join("　") + "\n\n" + desc;

      var tags = {};
      var tArr = typeTxt.split(/\s+/).filter(function (x) { return x && x.length <= 10; });
      if (tArr.length) tags["题材"] = tArr;
      if (origin) tags["地区"] = [origin];

      var status = "unknown";
      var sm = html.match(/状态[：:]\s*<?[^>]*>?\s*([连载中已完结]{2,3})/);
      if (sm) status = /完/.test(sm[1]) ? "completed" : "ongoing";

      // 目录：.comic-chapter-item（升序）
      var chapters = new Map();
      var items = doc.querySelectorAll(".comic-chapter-item");
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var link = it.querySelector(".comic-chapter-link") || it.querySelector("a");
        var href = link ? String(link.attributes.href || "") : "";
        if (!href) continue;
        var t = String(it.text || (link ? link.text : "") || "").trim();
        t = t.replace(/(_|\s-\s)/g, " ").replace(/(.*?[话話章回期])\s\d+/, "$1").replace(/\s\s+/g, " ").trim();
        if (!t) t = "第" + (i + 1) + "话";
        chapters.set(this._abs(href), t);
      }
      if (!chapters.size) {
        var as = doc.querySelectorAll("a[href*='/episode/']");
        for (var j = 0; j < as.length; j++) {
          var h2 = String(as[j].attributes.href || "");
          var t2 = String(as[j].text || "").trim();
          if (h2 && t2) chapters.set(this._abs(h2), t2);
        }
      }

      return new ComicDetails({
        id: url,
        title: name,
        cover: this._abs(cover),
        author: author,
        description: desc,
        tags: tags,
        status: status,
        updateTime: updateTime,
        chapters: chapters
      });
    },

    // 阅读：/episode/{aid}/{id}.html -> POST /api/comic/read/pics
    loadEp: async (comicId, epId) => {
      var path = String(epId);
      var m = path.match(/\/(\d+)\/(\d+)\.html/);
      if (!m) {
        var ma = path.match(/(\d+)\.html/);
        var mb = String(comicId).match(/\/(\d+)\/?$/);
        if (!ma || !mb) throw "无法解析章节 ID";
        m = [null, mb[1], ma[1]];
      }
      var aid = m[1], cid = m[2];

      var api = this.baseUrl + "/api/comic/read/pics";
      var headers = this._headers({
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": this.baseUrl,
        "Referer": this._abs(epId)
      });

      var images = [], offset = 0, total = 1, guard = 0;
      while (offset < total && guard < 60) {
        guard++;
        var body = "id=" + cid + "&aid=" + aid + "&offset=" + offset + "&limit=10";
        var res = await Network.post(api, headers, body);
        if (!res || res.status !== 200) break;
        var j = JSON.parse(res.body);
        var d = j && j.data;
        if (!d) break;
        var pics = d.pic || [];
        for (var i = 0; i < pics.length; i++) {
          var u = pics[i] && (pics[i].pic || pics[i].url || pics[i]);
          if (u) images.push(this._abs(u));
        }
        total = parseInt(d.total, 10) || images.length;
        var step = (parseInt(d.limit, 10) || 10);
        var newOffset = (parseInt(d.offset, 10) || 0) + step;
        if (newOffset <= offset) break;
        offset = newOffset;
        if (!pics.length) break;
      }
      if (!images.length) throw "解析图片失败（接口可能已变更或需要验证）";
      return { images: images };
    },

    onImageLoad: (url) => ({
      url: url,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36", "Referer": (this.baseUrl || "https://www.source-ex.com") + "/", "Accept": "image/avif,image/webp,image/*,*/*;q=0.8" }
    }),

    idMatch: "^https?:\\/\\/[^\\/]+\\/(?:manga|book)\\/\\d+\\/?$"
  };
}
