/**
 * 爱看漫画 (m.kanman.com) —— Venera 漫画源 v1.0.0
 * WAP 站，列表/分类/搜索/章节列表均为明文 JSON API；详情页为 HTML(og meta)。
 * 章节图片接口返回带 auth_key 防盗链签名的完整 URL（时效性），需 Referer。
 *
 * 已实测接口：
 *   探索/分类  /api/getsortlist/?comic_sort=<sort>&orderby=<click|date|score|shoucang>&page=<p>&size=48 -> data.data[]
 *   搜索      /api/serachcomic/?product_id=1&productname=kmh&platformname=wap&serachKey=<kw>&topNumber=10 -> data.data[]
 *   详情      /<comic_id>/  (HTML, og:novel:*)
 *   目录      /api/getchapterlist?product_id=1&productname=kmh&platformname=wap&comic_id=<id> -> data[] (chapter_name/chapter_newid)
 *   图片      /api/getchapterinfov2?product_id=1&productname=kmh&platformname=wap&comic_id=<id>&chapter_newid=<nid>&isWebp=1&quality=low -> data.current_chapter.chapter_img_list[]
 */
class aikanmanhua extends ComicSource {
  name = "爱看漫画";
  key = "aikanmanhua";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/aikanmanhua.js";
  baseUrl = "https://m.kanman.com";
  UA = "Mozilla/5.0 Chrome/126.0.0.0";

  // 题材 [中文名, comic_sort 值]（与快看系一致）
  static THEMES = [
    ["全部",""],["热血","rexue"],["玄幻","xuanhuan"],["修真","xiuzhen"],["霸总","bazong"],["恋爱","lianai"],
    ["校园","xiaoyuan"],["冒险","maoxian"],["搞笑","gaoxiao"],["后宫","hougong"],["悬疑","xuanyi"],["恐怖","kongbu"],
    ["动作","dongzuo"],["科幻","kehuan"],["战争","zhanzhen"],["古风","gufeng"],["穿越","chuanyue"],["竞技","jingji"],
    ["真人","zhenren"],["都市","dushi"],["武侠","wuxia"],["生活","shenghuo"],["神魔","shenmo"],["机战","jizhan"]
  ];

  _mkHeaders() {
    return { "User-Agent": this.UA, "Accept": "application/json, text/html", "Accept-Language": "zh-CN", "Referer": this.baseUrl + "/" };
  }

  _parseList(arr) {
    var comics = [];
    if (!arr) return comics;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var id = String(it.comic_id || "");
      if (!id) continue;
      var cover = it.cover_img ? it.cover_img.replace(/^http:/, "https:") : ("https://image.yqmh.com/mh/" + id + ".jpg-300x400.webp");
      comics.push(new Comic({ id: id, title: it.comic_name || "", cover: cover, author: it.comic_author || it.cartoon_author_list_name || "" }));
    }
    return comics;
  }

  async _sortList(comicSort, orderby, page) {
    var url = this.baseUrl + "/api/getsortlist/?comic_sort=" + comicSort + "&orderby=" + orderby + "&search_type=&search_key=&page=" + (page || 1) + "&size=48";
    var res = await Network.get(url, this._mkHeaders());
    if (res.status !== 200) throw "HTTP " + res.status;
    var j = JSON.parse(res.body);
    var data = j.data || {};
    var list = data.data || [];
    var total = data.total_page || 1;
    return { comics: this._parseList(list), maxPage: total };
  }

  explore = [
    { title: "人气榜", type: "multiPageComicList", load: async (page) => this._sortList("", "click", page || 1) },
    { title: "更新榜", type: "multiPageComicList", load: async (page) => this._sortList("", "date", page || 1) },
    { title: "评分榜", type: "multiPageComicList", load: async (page) => this._sortList("", "score", page || 1) },
    { title: "收藏榜", type: "multiPageComicList", load: async (page) => this._sortList("", "shoucang", page || 1) },
  ];

  search = {
    load: async (keyword, opts, page) => {
      var url = this.baseUrl + "/api/serachcomic/?product_id=1&productname=kmh&platformname=wap&serachKey=" + encodeURIComponent(keyword) + "&topNumber=10";
      var res = await Network.get(url, this._mkHeaders());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var j = JSON.parse(res.body);
      var list = (j.data && j.data.data) || j.data || [];
      return { comics: this._parseList(list), maxPage: 1 };
    }
  };

  category = {
    title: "分类",
    parts: [
      {
        name: "题材", type: "fixed", itemType: "category",
        categories: aikanmanhua.THEMES.map(function(x){ return x[0]; }),
        categoryParams: aikanmanhua.THEMES.map(function(x){ return x[1]; })
      }
    ],
    enableRankingPage: false
  };
  categoryComics = {
    load: async (category, param, options, page) => {
      return await this._sortList(param || "", "date", page || 1);
    }
  };

  comic = {
    loadInfo: async (id) => {
      // 详情页 HTML（og meta）
      var res = await Network.get(this.baseUrl + "/" + id + "/", this._mkHeaders());
      if (res.status !== 200) throw "HTTP " + res.status;
      var html = res.body;
      var og = function(m){ var mm = html.match(new RegExp('property="' + m + '"[^>]*content="([^"]*)"', "i")); return mm ? mm[1] : ""; };
      var title = og("og:novel:book_name");
      var author = og("og:novel:author");
      var cat = og("og:novel:category");
      var ogimg = og("og:image");
      var cover = ogimg ? ("https:" + ogimg) : "";
      var dm = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
      var desc = dm ? dm[1] : "";

      var tags = {};
      if (cat) tags["题材"] = cat.split(/\s+/);

      // 章节列表（API）
      var chapters = new Map();
      try {
        var tc = await Network.get(this.baseUrl + "/api/getchapterlist?product_id=1&productname=kmh&platformname=wap&comic_id=" + id, this._mkHeaders());
        if (tc.status === 200) {
          var tj = JSON.parse(tc.body);
          var arr = tj.data || [];
          for (var i = 0; i < arr.length; i++) {
            var c = arr[i];
            if (c.chapter_newid) chapters.set(c.chapter_newid, c.chapter_name || ("第" + (i + 1) + "话"));
          }
        }
      } catch (e) {}

      return new ComicDetails({ id: id, title: title, cover: cover, author: author, description: desc, tags: tags, status: "unknown", chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var url = this.baseUrl + "/api/getchapterinfov2?product_id=1&productname=kmh&platformname=wap&comic_id=" + comicId + "&chapter_newid=" + epId + "&isWebp=1&quality=low";
      var res = await Network.get(url, this._mkHeaders());
      if (res.status !== 200) throw "HTTP " + res.status;
      var j = JSON.parse(res.body);
      var cur = (j.data && j.data.current_chapter) || {};
      var imgs = cur.chapter_img_list || [];
      var images = [];
      for (var i = 0; i < imgs.length; i++) { if (imgs[i]) images.push(String(imgs[i]).replace(/^http:/, "https:")); }
      return { images: images };
    },

    onImageLoad: (url) => ({ url: url, headers: { "User-Agent": "Mozilla/5.0 Chrome/126", "Referer": "https://m.kanman.com/", "Accept": "image/webp,image/*" } }),
    idMatch: "(\\d+)"
  };
}
