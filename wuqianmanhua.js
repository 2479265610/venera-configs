/**
 * 武芊漫画 (comic.mkzcdn.com / 漫客栈) —— Venera 漫画源 v1.0.0
 * 站点为明文 JSON REST API，无需加密。
 * 功能：探索(热门/最新/推荐)、搜索、分类(题材)、详情(含章节)、阅读。
 *
 * 已实测接口：
 *   搜索    /search/keyword/?keyword=<kw>&page_num=<p>&page_size=20        -> data.list[]
 *   分类    /search/filter/?audience=0&order=<1热/2新/3推>&page_num=<p>&page_size=18&theme_id=<id> -> data.list[]
 *   详情    /comic/info/?comic_id=<id>                                    -> data{}
 *   目录    /chapter/v1/?comic_id=<id>                                    -> data[] (chapter_id/title/number)
 *   图片    /chapter/content/?chapter_id=<cid>&comic_id=<id>              -> data[] (image 完整URL)
 */
class wuqianmanhua extends ComicSource {
  name = "武芊漫画";
  key = "wuqianmanhua";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/wuqianmanhua.js";
  baseUrl = "https://comic.mkzcdn.com";
  UA = "Mozilla/5.0 Chrome/126.0.0.0";

  // theme_id -> 题材名（用于详情页标签还原）
  static THEME = {"0":"全部","2":"修真","1":"霸总","3":"恋爱","4":"校园","5":"冒险","6":"搞笑","7":"生活","8":"热血","9":"架空","10":"后宫","12":"玄幻","13":"悬疑","14":"恐怖","15":"灵异","16":"动作","17":"科幻","18":"战争","19":"古风","20":"穿越","21":"竞技","23":"励志","24":"同人","26":"真人"};

  // 分类展示顺序： [中文名, theme_id]
  static THEME_ORDER = [
    ["全部","0"],["热血","8"],["玄幻","12"],["修真","2"],["霸总","1"],["恋爱","3"],["校园","4"],
    ["冒险","5"],["搞笑","6"],["后宫","10"],["架空","9"],["悬疑","13"],["恐怖","14"],["灵异","15"],
    ["动作","16"],["科幻","17"],["战争","18"],["古风","19"],["穿越","20"],["竞技","21"],["励志","23"],
    ["同人","24"],["真人","26"],["生活","7"]
  ];

  _mkHeaders() {
    return {"User-Agent": this.UA, "Accept": "application/json", "Referer": this.baseUrl + "/", "Accept-Language": "zh-CN"};
  }

  _parseList(arr) {
    var comics = [];
    if (!arr) return comics;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var id = String(it.comic_id || "");
      if (!id) continue;
      var cover = (it.cover || "").replace(/^http:/, "https:");
      comics.push(new Comic({ id: id, title: it.title || it.comic_name || "", cover: cover, author: it.author_title || "" }));
    }
    return comics;
  }

  // filter 接口：分类 / 探索共用。order: 1热门 2最新 3推荐
  async _filter(order, themeId, page) {
    var url = this.baseUrl + "/search/filter/?audience=0&order=" + order + "&page_num=" + page + "&page_size=18&theme_id=" + themeId;
    var res = await Network.get(url, this._mkHeaders());
    if (res.status !== 200) throw "HTTP " + res.status;
    var j = JSON.parse(res.body);
    var list = (j.data && j.data.list) || [];
    var count = parseInt((j.data && j.data.count) || "0");
    var maxPage = Math.ceil(count / 18) || 1;
    return { comics: this._parseList(list), maxPage: maxPage };
  }

  explore = [
    { title: "热门漫画", type: "multiPageComicList", load: async (page) => this._filter("1", "0", page || 1) },
    { title: "最新上架", type: "multiPageComicList", load: async (page) => this._filter("2", "0", page || 1) },
    { title: "编辑推荐", type: "multiPageComicList", load: async (page) => this._filter("3", "0", page || 1) },
  ];

  search = {
    load: async (keyword, opts, page) => {
      var p = page || 1;
      var url = this.baseUrl + "/search/keyword/?keyword=" + encodeURIComponent(keyword) + "&page_num=" + p + "&page_size=20";
      var res = await Network.get(url, this._mkHeaders());
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var j = JSON.parse(res.body);
      var list = (j.data && j.data.list) || [];
      var count = parseInt((j.data && j.data.count) || "0");
      var maxPage = Math.ceil(count / 20) || 1;
      return { comics: this._parseList(list), maxPage: maxPage };
    }
  };

  category = {
    title: "分类",
    parts: [
      {
        name: "题材", type: "fixed", itemType: "category",
        categories: wuqianmanhua.THEME_ORDER.map(function(x){ return x[0]; }),
        categoryParams: wuqianmanhua.THEME_ORDER.map(function(x){ return x[1]; })
      }
    ],
    enableRankingPage: false
  };
  categoryComics = {
    load: async (category, param, options, page) => {
      var themeId = param || "0";
      return await this._filter("1", themeId, page || 1);
    }
  };

  comic = {
    loadInfo: async (id) => {
      var res = await Network.get(this.baseUrl + "/comic/info/?comic_id=" + id, this._mkHeaders());
      if (res.status !== 200) throw "HTTP " + res.status;
      var d = JSON.parse(res.body).data;
      var cover = (d.cover || "").replace(/^http:/, "https:");
      var tags = {};
      var th = (d.theme_id || "").split(",");
      var tlist = [];
      for (var i = 0; i < th.length; i++) { var nm = wuqianmanhua.THEME[th[i]]; if (nm && tlist.indexOf(nm) < 0) tlist.push(nm); }
      if (tlist.length) tags["题材"] = tlist;
      var status = d.finish === "1" ? "completed" : "ongoing";
      var chapters = new Map();
      try {
        var tc = await Network.get(this.baseUrl + "/chapter/v1/?comic_id=" + id, this._mkHeaders());
        if (tc.status === 200) {
          var arr = JSON.parse(tc.body).data || [];
          for (var k = 0; k < arr.length; k++) {
            var c = arr[k];
            if (c.chapter_id) chapters.set(String(c.chapter_id), c.title || ("第" + c.number + "话"));
          }
        }
      } catch (e) {}
      return new ComicDetails({ id: id, title: d.title || "", cover: cover, author: "", description: d.content || "", tags: tags, status: status, chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var res = await Network.get(this.baseUrl + "/chapter/content/?chapter_id=" + epId + "&comic_id=" + comicId, this._mkHeaders());
      if (res.status !== 200) throw "HTTP " + res.status;
      var arr = JSON.parse(res.body).data || [];
      var images = [];
      for (var i = 0; i < arr.length; i++) { if (arr[i].image) images.push(arr[i].image.replace(/^http:/, "https:")); }
      return { images: images };
    },

    onImageLoad: (url) => ({ url: url, headers: { "User-Agent": "Mozilla/5.0 Chrome/126", "Referer": "https://comic.mkzcdn.com/", "Accept": "image/webp,image/*" } }),
    idMatch: "(\\d+)"
  };
}
