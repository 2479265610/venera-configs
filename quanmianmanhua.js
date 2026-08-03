/**
 * 全免漫画 (api-cdn.kaimanhua.com / 原快看) —— Venera 漫画源 v1.0.0
 * Android API，返回 "arsadata" + Base64 前缀的 AES-128-CBC 密文，需解密。
 *   key = 4548ded8c9e02690, iv = 1992360ee9bc4f8f, padding = PKCS5/7
 * 签名：m-request-id = MD5("/path?query" 去掉域名与问号 + "erciyuan2020")，已实测可用。
 * 详情/章节接口需 m-request-id；章节图片接口还需 access-token。
 *
 * 已实测接口：
 *   搜索/列表/分类/探索  /comic-api/v1/comic/getsortlist?...                 -> data.data[] (明文)
 *   详情              /comic-api/v2/comic/getcomicdata?comic_id=<id>&...     -> data = arsadata..(AES) -> 含 chapters[]
 *   章节图片          /comic-api/v2/comic/getchapterdata?comic_id=<id>&chapter_id=<cid>&... -> data = arsadata..(AES) -> 图片URL数组
 */
class quanmianmanhua extends ComicSource {
  name = "全免漫画";
  key = "quanmianmanhua";
  version = "1.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/quanmianmanhua.js";
  baseUrl = "https://api-cdn.kaimanhua.com";
  UA = "okhttp/4.9.1";

  static KEY = "4548ded8c9e02690";
  static IV = "1992360ee9bc4f8f";
  static SALT = "erciyuan2020";
  // 书源自带 access-token（章节图片接口需要，已验证有效）
  static TOKEN = "v1_090fNTIt4Omg86B7LUPcqWRTkvW8JjjLYXTxnm01BiXN8SgniETjucYezOrjZoOopFGr02Fj12RREysE4eHukTCc/LuyeIHzFGMayAgLGaSF8+jMMwrnDdTuYdFk34z7DZf+Zy+VHtjFS0Uy6n6Vyr/5GuJy6FDcbCoVBCjdbFneHjV38UwHjL6AwauUMFfa0f3uSEqGWZG6xn9+OpAn6GGRWHaypicXswr450DO29FcuqP7pHCSldVJtIzOv/Uc";
  static COMMON = "client-type=android&productname=qmmh&client-channel=xiaomi&platformname=android&client-version=1.4.8";

  // 分类题材 [中文名, comic_sort 值]
  static THEMES = [
    ["全部",""],["热血","rexue"],["玄幻","xuanhuan"],["修真","xiuzhen"],["霸总","bazong"],["恋爱","lianai"],
    ["冒险","maoxian"],["搞笑","gaoxiao"],["后宫","hougong"],["悬疑","xuanyi"],["恐怖","kongbu"],["动作","dongzuo"],
    ["科幻","kehuan"],["战争","zhanzhen"],["古风","gufeng"],["穿越","chuanyue"],["竞技","jingji"],["真人","zhenren"],
    ["都市","dushi"],["武侠","wuxia"],["生活","shenghuo"],["神魔","shenmo"],["机战","jizhan"],["历史","lishi"],
    ["游戏","youxi"],["漫改","mangai"]
  ];

  // m-request-id 签名：path(含/comic-api，无域名) + query(无?) + SALT，再 MD5
  _sign(pathAndQuery) {
    var buf = Convert.md5(Convert.encodeUtf8(pathAndQuery + quanmianmanhua.SALT));
    return Convert.hexEncode(buf).toLowerCase();
  }

  // 解密 "arsadata" + Base64 的 AES-128-CBC 密文 -> 明文字符串
  _decrypt(arsa) {
    var b64 = String(arsa).replace(/^arsadata/, "");
    var cipher = Convert.decodeBase64(b64);
    var plain = Convert.decryptAesCbc(cipher, Convert.encodeUtf8(quanmianmanhua.KEY), Convert.encodeUtf8(quanmianmanhua.IV));
    return Convert.decodeUtf8(plain);
  }

  _parseList(arr) {
    var comics = [];
    if (!arr) return comics;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var id = String(it.comic_id || "");
      if (!id) continue;
      var cover = (it.cover_img || "").replace(/^http:/, "https:");
      comics.push(new Comic({ id: id, title: it.comic_name || "", cover: cover, author: it.comic_author || "" }));
    }
    return comics;
  }

  // getsortlist：搜索 / 分类 / 探索共用
  async _sortList(comicSort, orderby, page) {
    var url = this.baseUrl + "/comic-api/v1/comic/getsortlist?status_id=0&comic_sort=" + comicSort + "&human_type=0&orderby=" + orderby + "&pagesize=30&page=" + (page || 1) + "&young_mode=0&" + quanmianmanhua.COMMON;
    var res = await Network.get(url, { "User-Agent": this.UA, "Accept": "application/json" });
    if (res.status !== 200) throw "HTTP " + res.status;
    var j = JSON.parse(res.body);
    var data = j.data || {};
    var list = data.data || [];
    var total = (data.page && data.page.total_page) || 0;
    return { comics: this._parseList(list), maxPage: total || 1 };
  }

  explore = [
    { title: "人气榜", type: "multiPageComicList", load: async (page) => this._sortList("", "click", page || 1) },
    { title: "更新榜", type: "multiPageComicList", load: async (page) => this._sortList("", "date", page || 1) },
    { title: "评分榜", type: "multiPageComicList", load: async (page) => this._sortList("", "score", page || 1) },
    { title: "收藏榜", type: "multiPageComicList", load: async (page) => this._sortList("", "shoucang", page || 1) },
  ];

  search = {
    load: async (keyword, opts, page) => {
      var p = page || 1;
      var url = this.baseUrl + "/comic-api/v1/comic/getsortlist?search_key=" + encodeURIComponent(keyword) + "&orderby=shoucang&page=" + p + "&pagesize=20&young_mode=0&" + quanmianmanhua.COMMON;
      var res = await Network.get(url, { "User-Agent": this.UA, "Accept": "application/json" });
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      var j = JSON.parse(res.body);
      var list = (j.data && j.data.data) || [];
      var total = (j.data && j.data.page) ? j.data.page.total_page : 0;
      return { comics: this._parseList(list), maxPage: total || 1 };
    }
  };

  category = {
    title: "分类",
    parts: [
      {
        name: "题材", type: "fixed", itemType: "category",
        categories: quanmianmanhua.THEMES.map(function(x){ return x[0]; }),
        categoryParams: quanmianmanhua.THEMES.map(function(x){ return x[1]; })
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
      var path = "/comic-api/v2/comic/getcomicdata";
      var query = "comic_id=" + id + "&" + quanmianmanhua.COMMON;
      var sign = this._sign(path + query);
      var url = this.baseUrl + path + "?" + query;
      var res = await Network.get(url, { "User-Agent": this.UA, "m-request-id": sign });
      if (res.status !== 200) throw "HTTP " + res.status;
      var obj = JSON.parse(this._decrypt(JSON.parse(res.body).data));
      var cover = (obj.cover_img_34 || obj.cover_img || "").replace(/^http:/, "https:");
      var tags = {};
      var tl = obj.sort_typelist || [];
      var tlist = [];
      for (var i = 0; i < tl.length; i++) { var o = tl[i]; for (var k in o) { if (tlist.indexOf(o[k]) < 0) tlist.push(o[k]); } }
      if (tlist.length) tags["题材"] = tlist;
      if (obj.avgscore) tags["评分"] = [(obj.avgscore / 10).toFixed(1)];
      var status = obj.serialize_type === 2 ? "completed" : "ongoing";
      var chapters = new Map();
      var chs = obj.chapters || [];
      for (var c = 0; c < chs.length; c++) {
        var ch = chs[c];
        if (ch.chapter_id) chapters.set(String(ch.chapter_id), ch.chapter_name || ("第" + ch.number + "话"));
      }
      return new ComicDetails({ id: id, title: obj.comic_name || "", cover: cover, author: obj.author_name || "", description: obj.comic_desc || "", tags: tags, status: status, chapters: chapters });
    },

    loadEp: async (comicId, epId) => {
      var path = "/comic-api/v2/comic/getchapterdata";
      var query = "comic_id=" + comicId + "&chapter_id=" + epId + "&quality=middle&" + quanmianmanhua.COMMON;
      var sign = this._sign(path + query);
      var url = this.baseUrl + path + "?" + query;
      var res = await Network.get(url, { "User-Agent": this.UA, "access-token": quanmianmanhua.TOKEN, "m-request-id": sign });
      if (res.status !== 200) throw "HTTP " + res.status;
      var arr = JSON.parse(this._decrypt(JSON.parse(res.body).data));
      var images = [];
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) { if (arr[i]) images.push(String(arr[i]).replace(/^http:/, "https:")); }
      }
      return { images: images };
    },

    onImageLoad: (url) => ({ url: url, headers: { "User-Agent": this.UA, "Referer": "https://www.kaimanhua.com/", "Accept": "image/webp,image/*" } }),
    idMatch: "(\\d+)"
  };
}
