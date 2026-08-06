/**
 * A漫 (aman3.org) —— Venera 漫画源 v1.0.0
 * HTML 站（hanlin / hanliu 模板）。列表/分类/搜索/详情/章节均为 HTML 解析。
 * 已确认 URL（均经 WebFetch 实测可访问）：
 *   探索/分类  /bookcata/<cat>/ob/<sort>/st/<status>/page/<page>
 *   搜索      /findbook/<key>/ob/time/st/all/page/<page>
 *   详情      /manhuaview/<id>.html
 *   章节图片  阅读页 <img data-original>
 * 选择器取自原 好几个漫画书源.json 中「A漫」规则（.hl-vod-list/.hl-list-item/h1.hl-dc-title/ul#hl-plays-list 等）。
 * 注意：沙箱 Bash 出口被 Cloudflare 拦截（ECONNRESET），本源依据原书源选择器 + 结构确认编写，
 *       未在沙箱内做真实接口拉取，请在设备上实测；如某选择器不符可反馈调整。
 */
class aman3 extends ComicSource {
  name = "A漫";
  key = "aman3";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/aman.js";
  baseUrl = "https://aman3.org";
  UA = "Mozilla/5.0 Chrome/126.0.0.0";

  _headers() {
    return { "User-Agent": this.UA, "Accept": "text/html,application/xhtml+xml,*/*", "Accept-Language": "zh-CN", "Referer": this.baseUrl + "/" };
  }
  _abs(href) {
    if (!href) return "";
    if (/^https?:\/\//.test(href)) return href;
    if (href.indexOf("//") === 0) return "https:" + href;
    return this.baseUrl + (href.charAt(0) === "/" ? "" : "/") + href;
  }
  _fix(u) { return (u || "").replace(/^http:/, "https:"); }

  _list(doc) {
    var items = doc.querySelectorAll(".hl-list-item");
    if (!items.length) items = doc.querySelectorAll("ul.hl-vod-list.clearfix li");
    if (!items.length) items = doc.querySelectorAll(".hl-vod-list li");
    var comics = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var link = it.querySelector("a.hl-item-thumb") || it.querySelector(".hl-item-thumb") || it.querySelector("a");
      if (!link) continue;
      var href = link.attributes.href || "";
      if (!href || href.indexOf("/manhuaview/") < 0) continue;
      if (seen[href]) continue; seen[href] = true;
      var cover = link.attributes["data-original"] || link.attributes.src || "";
      var titleEl = it.querySelector(".hl-item-title a") || link;
      var title = (titleEl.text || titleEl.attributes.title || "").trim();
      if (!title) title = (link.attributes.title || "").trim();
      if (!title) continue;
      comics.push(new Comic({ id: href, title: title, cover: this._abs(cover) }));
    }
    return comics;
  }

  _maxPage(doc, cur) {
    var max = cur || 1;
    var as = doc.querySelectorAll("a[href*='page']");
    for (var i = 0; i < as.length; i++) {
      var h = as[i].attributes.href || "";
      var m = h.match(/page\/(\d+)/) || h.match(/[?&]page=(\d+)/);
      if (m) { var n = parseInt(m[1]); if (n > max) max = n; }
    }
    return max;
  }

  _page(pathTpl, page) {
    return (async () => {
      var p = page || 1;
      var url = this.baseUrl + pathTpl.replace("{p}", p);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
    })();
  }

  explore = [
    { title: "A漫更新", type: "multiPageComicList", load: async (page) => this._page("/bookcata/all/ob/time/st/all/page/{p}", page) },
    { title: "A漫人气", type: "multiPageComicList", load: async (page) => this._page("/bookcata/all/ob/hits/st/all/page/{p}", page) }
  ];

  search = {
    load: async (keyword, opts, page) => {
      var p = page || 1;
      var url = this.baseUrl + "/findbook/" + encodeURIComponent(keyword) + "/ob/time/st/all/page/" + p;
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, p) };
    }
  };

  category = {
    title: "A漫",
    parts: [
      { name: "类型", type: "fixed", itemType: "category",
        categories: ["全部", "韩漫", "日漫", "3D漫画", "美女", "单本"],
        categoryParams: ["all", "韩漫", "日漫", "3D漫画", "美女", "单本"] },
      { name: "进度", type: "fixed", itemType: "category",
        categories: ["全部", "已完结", "更新中"],
        categoryParams: ["all", "completed", "serialized"] }
    ],
    enableRankingPage: false
  };
  categoryComics = {
    load: async (category, param, options, page) => {
      var cat = (options && options[0]) || "all";
      var st = (options && options[1]) || "all";
      var catEnc = (cat === "all") ? "all" : encodeURIComponent(cat);
      var url = this.baseUrl + "/bookcata/" + catEnc + "/ob/time/st/" + st + "/page/" + (page || 1);
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) return { comics: [], maxPage: 1 };
      var doc = new HtmlDocument(res.body);
      return { comics: this._list(doc), maxPage: this._maxPage(doc, page || 1) };
    }
  };

  comic = {
    loadInfo: async (id) => {
      var url = id.indexOf("http") === 0 ? id : this.baseUrl + id;
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var html = res.body;

      var title = "";
      var h1 = doc.querySelector("h1.hl-dc-title"); if (h1) title = h1.text.trim();
      if (!title) { var h = doc.querySelector("h1"); if (h) title = h.text.trim(); }

      var cover = "";
      var cov = doc.querySelector("div.hl-dc-pic span.hl-item-thumb.hl-lazy") || doc.querySelector(".hl-dc-pic img");
      if (cov) cover = cov.attributes["data-original"] || cov.attributes.src || "";

      var author = "";
      var lis = doc.querySelectorAll("ul.clearfix li.hl-col-xs-12");
      if (lis.length >= 3) { var a = lis[2].querySelector("a"); if (a) author = a.text.trim(); }

      var desc = "";
      var d = doc.querySelector("li.hl-col-xs-12.blurb"); if (d) desc = d.text.trim();

      var tags = {};
      var tagEls = doc.querySelectorAll("a[href*='/bookcata/'], a[href*='/findbook/']");
      var tl = [];
      for (var i = 0; i < tagEls.length; i++) { var t = tagEls[i].text.trim(); if (t && tl.indexOf(t) < 0) tl.push(t); }
      if (tl.length) tags["标签"] = tl;

      var status = "unknown";
      if (/已完结/.test(html)) status = "completed"; else if (/连载|更新中/.test(html)) status = "ongoing";

      var chapters = new Map();
      var chs = doc.querySelectorAll("ul#hl-plays-list li a");
      if (!chs.length) chs = doc.querySelectorAll("a[href*='/manhuaview/']");
      for (var c = 0; c < chs.length; c++) {
        var ca = chs[c]; var h = ca.attributes.href || "";
        if (!h || h.indexOf("/manhuaview/") < 0) continue;
        var t = ca.text.trim(); if (t) chapters.set(h, t);
      }
      return new ComicDetails({ id: id, title: title, cover: this._abs(cover), author: author, description: desc, tags: tags, status: status, chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var url = epId.indexOf("http") === 0 ? epId : this.baseUrl + epId;
      var res = await Network.get(url, this._headers());
      if (res.status !== 200) throw "HTTP " + res.status;
      var doc = new HtmlDocument(res.body);
      var html = res.body;
      var images = [];
      var seen = {};

      // 1) img 懒加载属性（兼容 data-original / data-src / data-lazy-src / data-url / srcset 首项）
      var imgs = doc.querySelectorAll("img");
      for (var i = 0; i < imgs.length; i++) {
        var a = imgs[i].attributes;
        var u = String(a["data-original"] || a["data-src"] || a["data-lazy-src"] || a["data-url"] || a["data-echo"] || a["src"] || "").trim();
        if (!u) { var ss = String(a["data-srcset"] || ""); var ssm = ss.match(/^\s*([^,\s]+)/); if (ssm) u = ssm[1]; }
        if (!u || u.indexOf("data:") === 0 || u.indexOf("javascript:") === 0) continue;
        if (seen[u]) continue;
        seen[u] = 1;
        images.push(this._fix(this._abs(u)));
      }

      // 2) 兜底：脚本内嵌图片数组（var xxx = ["url", ...] 或 data_url 变量）
      if (!images.length) {
        var dm = html.match(/var\s+data_url\s*=\s*['"]([^'"]+)['"]/);
        var arrs = html.match(/\[(["']https?:\/\/[^"']+["']\s*,\s*["']https?:\/\/[^"']+["'])\]/);
        if (dm && arrs) {
          var prefix = dm[1];
          var urls = html.match(/["']((?:https?:\/\/|\/)[^"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"']*)?)["']/gi) || [];
          for (var k = 0; k < urls.length; k++) {
            var uu = urls[k].replace(/^["']|["']$/g, "");
            if (/^https?:/.test(uu)) images.push(this._fix(uu));
            else images.push(this._fix(prefix + uu));
          }
        }
      }
      return { images: images };
    },

    onImageLoad: (url) => ({ url: url, headers: { "User-Agent": "Mozilla/5.0 Chrome/126", "Referer": "https://aman3.org/", "Accept": "image/webp,image/*" } }),
    idMatch: "(\\/manhuaview\\/\\d+\\.html)"
  };
}
