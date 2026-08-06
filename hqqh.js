/**
 * 七七漫画 (hqqh.cc) —— Venera 漫画源 v1.0.0
 * ===============================================================
 * 与 seyoumanhua 同 PHP CMS 模板，手机 UA 可过 CF。
 * 列表/详情/章节均为 HTML 直出，阅读页 img src 无需解密。
 *
 * 已实测（手机 UA）:
 *   首页    /                      → li.comic-item 卡片
 *   分类    /index.php/category/tags/<id>?page=N
 *   搜索    /index.php/custom/search?key=<kw>
 *   详情    /index.php/qqmhcomic/<slug>.html
 *           标题 h1.comic-name | 作者 .au-name | 封面 .box-back[style]+img[data-src]
 *           状态/标签 .comic-tags a | 简介 .comic-des-word | 章节 /qqmhchapter/<id>.html
 *   阅读    /index.php/qqmhchapter/<id>.html
 *           <img src="https://p.wx4.top/..."> 直接出图
 */
class hqqh extends ComicSource {
  name = "七七漫画";
  key = "hqqh";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/hqqh.js";
  baseUrl = "https://hqqh.cc";
  UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

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

  // ====== 列表卡片解析 ======
  _list(doc) {
    var comics = [], seen = {};
    var cards = doc.querySelectorAll(".comic-item");
    for (var k = 0; k < cards.length; k++) {
      var card = cards[k];
      var a = card.querySelector("a[href*='/qqmhcomic/']") || card.querySelector("a");
      if (!a) continue;
      var href = a.attributes.href || "";
      if (!href || seen[href]) continue;
      seen[href] = true;
      var title = "";
      var nameEl = card.querySelector(".comic-name");
      if (nameEl) title = String(nameEl.text || "").trim();
      if (!title) title = String(a.attributes.title || a.text || "").trim();
      if (!title) { var img = card.querySelector("img"); if (img) title = String(img.attributes.alt || "").trim(); }
      if (!title) continue;
      var cover = "";
      var img = card.querySelector("img");
      if (img) cover = img.attributes["data-src"] || img.attributes.src || "";
      var subTitle = "";
      var tipEl = card.querySelector(".comic-tip");
      if (tipEl) subTitle = String(tipEl.text || "").trim();
      comics.push(new Comic({ id: this._abs(href), title: title, cover: this._fix(cover), subTitle: subTitle }));
    }
    return comics;
  }

  _maxPage(doc, cur) {
    var max = cur || 1;
    var as = doc.querySelectorAll("a[href*='page=']");
    for (var i = 0; i < as.length; i++) {
      var h = as[i].attributes.href || "";
      var m = h.match(/page=(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1]));
    }
    return max;
  }

  async _listUrl(path, page) {
    var p = page || 1;
    var url = this.baseUrl + path + (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + p;
    var res = await Network.get(url, this._headers());
    if (res.status !== 200) throw "HTTP " + res.status;
    var doc = new HtmlDocument(res.body);
    return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
  }

  explore = [
    { title: "精品推荐", type: "multiPageComicList", load: async (page) => this._listUrl("/index.php/category/quality/39", page) },
    { title: "最近更新", type: "multiPageComicList", load: async (page) => this._listUrl("/index.php/custom/update", page) }
  ];

  // ====== 搜索 ======
  search = {
    load: async (keyword, opts, page) => {
      var p = page || 1;
      var url = this.baseUrl + "/index.php/custom/search?key=" + encodeURIComponent(keyword) + "&page=" + p;
      try {
        var res = await Network.get(url, this._headers());
        if (res.status !== 200) return { comics: [], maxPage: 0 };
        var doc = new HtmlDocument(res.body);
        return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
      } catch (e) { return { comics: [], maxPage: 0 }; }
    }
  };

  // ====== 分类 ======
  category = {
    title: "七七漫画",
    parts: [{
      name: "类型", type: "fixed", itemType: "category",
      categories: [
        "热血","冒险","科幻","霸总","玄幻","校园","修真","搞笑",
        "穿越","后宫","恋爱","悬疑","恐怖","战争","动作","古风",
        "都市","百合","推理","竞技","纯爱","奇幻","治愈","侦探",
        "暗黑","魔幻","武侠"
      ],
      categoryParams: [
        "39","40","41","42","43","44","45","46",
        "47","48","49","50","51","52","53","54",
        "55","56","57","58","59","60","61","62","63",
        "64","65","66"
      ],
    }],
    enableRankingPage: false
  };
  categoryComics = {
    load: async (category, param, options, page) => {
      return await this._listUrl("/index.php/category/tags/" + param, page);
    }
  };

  // ====== 漫画详情 ======
  comic = {
    loadInfo: async (id) => {
      var url = this._abs(id);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var doc = new HtmlDocument(html);

      // 标题: h1.comic-name
      var title = "";
      var h1 = doc.querySelector("h1.comic-name") || doc.querySelector("h1");
      if (h1) title = String(h1.text || "").trim();
      if (!title) {
        var om = html.match(/property="og:comic:comic_name"[^>]*content="([^"]+)"/i);
        if (om) title = om[1].trim();
      }

      // 封面: .box-back style 背景图 或 img[data-src]
      var cover = "";
      var bb = doc.querySelector(".box-back");
      if (bb) {
        var st = String(bb.attributes.style || "");
        var sm = st.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
        if (sm) cover = sm[1];
      }
      if (!cover) {
        var img = doc.querySelector("img[data-src]") || doc.querySelector("img");
        if (img) cover = img.attributes["data-src"] || img.attributes["data-original"] || img.attributes.src || "";
      }
      if (!cover) {
        var ogi = html.match(/property="og:image"[^>]*content="([^"]+)"/i);
        if (ogi) cover = ogi[1];
      }

      // 作者: .au-name 或 og:author（去掉"作者："前缀）
      var author = "";
      var auEl = doc.querySelector(".au-name") || doc.querySelector(".author");
      if (auEl) author = String(auEl.text || "").replace(/^作者[：:]\s*/, "").trim();
      if (!author) {
        var aum = html.match(/property="og:author"[^>]*content="([^"]+)"/i);
        if (aum) author = aum[1].trim();
      }

      // 简介: .comic-des-word 后的文本（或 meta description）
      var desc = "";
      var descEl = doc.querySelector(".comic-des-word");
      if (descEl) {
        var next = descEl.text || "";
        var p = descEl._el ? descEl._el.nextSibling : null;
        if (p) desc = (p.textContent || p.nodeValue || "").trim();
      }
      if (!desc) {
        var dm = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
        if (dm) desc = dm[1].trim();
      }

      // 标签 / 状态: .comic-tags 内的 a
      var tags = {};
      var tagList = [];
      var status = "unknown";
      var tagEls = doc.querySelectorAll(".comic-tags a[href*='/category/tags/']");
      for (var i = 0; i < tagEls.length; i++) {
        var t = String(tagEls[i].text || "").trim();
        if (!t) continue;
        if (/连载|完结|更新中/.test(t)) {
          status = /完结|完/.test(t) ? "completed" : "ongoing";
        } else {
          tagList.push(t);
        }
      }
      if (tagList.length) tags["标签"] = tagList;

      // 人气: .comic-hot
      var hotEl = doc.querySelector(".comic-hot");
      var updateTime = "";
      if (hotEl) {
        var hot = String(hotEl.text || "").trim();
        desc = "人气：" + hot + (desc ? "\n\n" + desc : "");
      }

      // 章节: a[href*='/qqmhchapter/']  页面最新在前，需反转
      var chArr = [];
      var seenCh = {};
      var chs = doc.querySelectorAll("a[href*='/qqmhchapter/']");
      for (var c = 0; c < chs.length; c++) {
        var ca = chs[c];
        var h = ca.attributes.href || "";
        var m = h.match(/\/qqmhchapter\/(\d+)\.html/);
        if (!m || seenCh[m[1]]) continue;
        seenCh[m[1]] = true;
        var ct = String(ca.text || "").trim();
        if (!ct) ct = "第" + (c + 1) + "话";
        chArr.push([this._abs(h), ct]);
      }
      var chapters = new Map();
      for (var i = chArr.length - 1; i >= 0; i--) {
        chapters.set(chArr[i][0], chArr[i][1]);
      }

      return new ComicDetails({
        id: url, title: title, cover: this._abs(cover), author: author,
        description: desc, tags: tags, status: status,
        updateTime: updateTime, chapters: chapters
      });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this._abs(epId), this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var imgs = doc.querySelectorAll("img[src*='p.wx4.top'], img[src*='wx4.top'], img[src*='/cdn/']");
      if (!imgs.length) imgs = doc.querySelectorAll("img");
      var images = [];
      var seenImg = {};
      for (var i = 0; i < imgs.length; i++) {
        var u = imgs[i].attributes["data-src"] || imgs[i].attributes.src || "";
        u = String(u).trim();
        if (!u || !/\.(webp|jpg|jpeg|png|gif|avif)/i.test(u)) continue;
        if (u.indexOf("base64") >= 0 || u.indexOf("bg_loading") >= 0) continue;
        u = this._abs(this._fix(u));
        if (seenImg[u]) continue;
        seenImg[u] = 1;
        images.push(u);
      }
      return { images: images };
    },

    onImageLoad: (url) => ({
      url: url,
      headers: { "User-Agent": "Mozilla/5.0 Chrome/126", "Referer": "https://hqqh.cc/", "Accept": "image/webp,image/*" }
    }),
    idMatch: "(/index\\.php/qqmhcomic/[a-zA-Z0-9]+\\.html)"
  };
}
