/** @type {import('./_venera_.js')} */
/**
 * 来漫画 (m.comemh8.com) Venera 漫画源
 *
 * 站点技术要点（2026-07-30 实测验证）：
 * - 页面编码为 gb2312/GBK，必须用 Network.fetchBytes + Convert.decodeGbk 解码。
 * - 章节图片【无加密】：章节页内联明文 `var mhInfo={...}` JSON（与漫画柜的
 *   packed+LZString 加密方案不同，无需解密）。
 *   图片 URL = host + urlencode(path) + 文件名；
 *   host 规则（来自官方 main2.js）：chapterId > 542724 用 *.tgmhfc.uk 随机域，
 *   否则用 https://mhpic6.tgmhfc.uk。图片与封面均需 Referer。
 * - 分类列表分页：GET /getact3.asp?act=list&page=N&catid=X&ajax=1&order=Y
 *   (order: 0=添加时间 1=更新时间 3=浏览次数; catid: 0=全部 1-16=各分类)
 * - 最新更新：GET /getact2.asp?act=list&page=N&catid=0&ajax=1&order=1
 * - 搜索：POST https://www.comemh8.com/e/search/  body: key=<GBK百分号编码>
 *   （服务器端分页参数已失效，仅返回前 30 条结果）
 */
class LaiManHua extends ComicSource {
  name = "来漫画";

  key = "laimanhua";

  version = "1.0.0";

  minAppVersion = "1.0.0";

  url = "";

  baseUrl = "https://m.comemh8.com";

  pcUrl = "https://www.comemh8.com";

  static uaMobile =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

  static uaPc =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  /**
   * GET 请求并按 GBK 解码为字符串
   * @param url {string}
   * @param mobile {boolean}
   * @returns {Promise<string>}
   */
  async getGbk(url, mobile = true) {
    let headers = {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9",
      "user-agent": mobile ? LaiManHua.uaMobile : LaiManHua.uaPc,
      referer: mobile ? `${this.baseUrl}/` : `${this.pcUrl}/`,
    };
    let res = await Network.fetchBytes("GET", url, headers);
    if (res.status !== 200) {
      throw "Invalid status code: " + res.status;
    }
    return Convert.decodeGbk(res.body);
  }

  /**
   * GET 请求返回 HtmlDocument（GBK 解码）
   */
  async getHtml(url, mobile = true) {
    return new HtmlDocument(await this.getGbk(url, mobile));
  }

  /**
   * 将字符串编码为 GBK 百分号编码（用于搜索）
   * @param str {string}
   * @returns {string}
   */
  gbkUrlEncode(str) {
    let buf = Convert.encodeGbk(str);
    let bytes = new Uint8Array(buf);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      let b = bytes[i];
      // ASCII 字母数字直接保留
      if (
        (b >= 0x30 && b <= 0x39) ||
        (b >= 0x41 && b <= 0x5a) ||
        (b >= 0x61 && b <= 0x7a)
      ) {
        out += String.fromCharCode(b);
      } else {
        let hex = b.toString(16).toUpperCase();
        if (hex.length < 2) hex = "0" + hex;
        out += "%" + hex;
      }
    }
    return out;
  }

  /**
   * 解析手机版列表 li（分类/最新/排行/AJAX 返回通用结构）
   * <li><div class="order|rank">..</div><a href="/kanmanhua/xxx/">
   *   <div class="thumb"><img data-src=".."/><i>连载中</i></div><h3>标题</h3>
   *   <dl><dt>作 者：</dt><dd>..</dd></dl>...</a></li>
   */
  parseListComic(li) {
    let a = li.querySelector("a");
    if (!a) return null;
    let href = a.attributes["href"];
    if (!href || !href.includes("/kanmanhua/")) return null;
    let id = href.split("/").filter((e) => e !== "")[1];
    if (!id) return null;

    let titleEl = li.querySelector("h3");
    let title = titleEl ? titleEl.text.trim() : id;

    let img = li.querySelector("img");
    let cover = img
      ? img.attributes["data-src"] || img.attributes["src"] || ""
      : "";
    if (cover.startsWith("//")) cover = "https:" + cover;

    let statusEl = li.querySelector(".thumb i");
    let status = statusEl ? statusEl.text.trim() : "";

    let author = "";
    let genre = "";
    let updateTo = "";
    let updateAt = "";
    let dls = li.querySelectorAll("dl");
    for (let dl of dls) {
      let dt = dl.querySelector("dt");
      let dd = dl.querySelector("dd");
      if (!dt || !dd) continue;
      let label = dt.text.replace(/\s/g, "");
      let value = dd.text.trim();
      if (label.includes("作者")) author = value;
      else if (label.includes("类别")) genre = value;
      else if (label.includes("更新至")) updateTo = value;
      else if (label.includes("更新于")) updateAt = value;
    }

    let tags = [];
    if (genre) tags.push(genre);
    if (status) tags.push(status);

    let description = updateTo ? `更新至：${updateTo}` : "";
    if (updateAt) description += description ? ` (${updateAt})` : updateAt;

    return new Comic({
      id,
      title,
      cover,
      author,
      description,
      tags,
    });
  }

  /**
   * 解析首页板块卡片 li：<li><a href="/kanmanhua/xxx/"><img data-src/><h3>..</h3><p>更至：..</p></a></li>
   */
  parseHomeComic(li) {
    let a = li.querySelector("a");
    if (!a) return null;
    let href = a.attributes["href"];
    if (!href || !href.includes("/kanmanhua/")) return null;
    let id = href.split("/").filter((e) => e !== "")[1];
    if (!id) return null;

    let titleEl = li.querySelector("h3");
    let title = titleEl ? titleEl.text.trim() : id;

    let img = li.querySelector("img");
    let cover = img
      ? img.attributes["data-src"] || img.attributes["src"] || ""
      : "";
    if (cover.startsWith("//")) cover = "https:" + cover;

    let pEl = li.querySelector("p");
    let description = pEl ? pEl.text.trim() : "";

    return new Comic({ id, title, cover, description });
  }

  /**
   * 解析 AJAX 接口返回的 li 片段列表
   * @param html {string} - 接口返回的 <li>...</li> 片段
   * @returns {Comic[]}
   */
  parseAjaxList(html) {
    // 服务端接口异常时会返回整页错误 HTML
    if (html.includes("<!DOCTYPE") || html.includes("<html")) {
      return [];
    }
    let document = new HtmlDocument(`<div><ul>${html}</ul></div>`);
    let comics = document
      .querySelectorAll("li")
      .map((e) => this.parseListComic(e))
      .filter((c) => c !== null);
    return comics;
  }

  // 探索页
  explore = [
    {
      title: "来漫画",
      type: "multiPartPage",
      load: async (page) => {
        let document = await this.getHtml(this.baseUrl);
        let parts = [];
        let sections = [
          ["main-hotupdate", "热门更新推荐"],
          ["main-lianzai", "热门连载漫画"],
          ["main-guoman", "精彩国漫"],
          ["main-caise", "少女爱情"],
          ["main-shangjia", "最新上架"],
          ["main-reman", "日漫经典"],
        ];
        for (let [secId, secTitle] of sections) {
          let sec = document.querySelector(`#${secId}`);
          if (!sec) continue;
          let comics = [];
          let seen = {};
          let lis = sec.querySelectorAll(".main-list-wrap li");
          for (let li of lis) {
            let comic = this.parseHomeComic(li);
            if (comic && !seen[comic.id]) {
              seen[comic.id] = true;
              comics.push(comic);
            }
          }
          if (comics.length > 0) {
            parts.push({ title: secTitle, comics });
          }
        }
        return parts;
      },
      loadNext(next) {},
    },
    {
      title: "最新更新",
      type: "multiPageComicList",
      load: async (page) => {
        page = page || 1;
        let url = `${this.baseUrl}/getact2.asp?act=list&page=${page}&catid=0&ajax=1&order=1`;
        let html = await this.getGbk(url);
        let comics = this.parseAjaxList(html);
        return {
          comics,
          maxPage: comics.length >= 20 ? page + 1 : page,
        };
      },
    },
  ];

  // 分类页
  category = {
    title: "来漫画",
    parts: [
      {
        name: "分类",
        type: "fixed",
        itemType: "category",
        categories: [
          "全部",
          "少年热血",
          "武侠格斗",
          "科幻魔幻",
          "竞技体育",
          "爆笑喜剧",
          "侦探推理",
          "恐怖灵异",
          "耽美人生",
          "少女爱情",
          "恋爱生活",
          "生活漫画",
          "战争漫画",
          "故事漫画",
          "百合女性",
          "伪娘漫画",
          "其他漫画",
        ],
        // param = getact3.asp 的 catid
        categoryParams: [
          "0",
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "11",
          "12",
          "13",
          "15",
          "16",
          "14",
        ],
      },
    ],
    // 启用排行榜页（风云榜）
    enableRankingPage: true,
  };

  // 分类漫画加载
  categoryComics = {
    /**
     * @param category {string} - 分类名
     * @param param {string?} - catid
     * @param options {string[]} - [排序]
     * @param page {number}
     */
    load: async (category, param, options, page) => {
      let catid = param || "0";
      let order = (options && options[0]) || "0";
      page = page || 1;
      let url = `${this.baseUrl}/getact3.asp?act=list&page=${page}&catid=${catid}&ajax=1&order=${order}`;
      let html = await this.getGbk(url);
      let comics = this.parseAjaxList(html);
      return {
        comics,
        // 接口不返回总页数，采用滚动式分页：满 20 条则认为还有下一页
        maxPage: comics.length >= 20 ? page + 1 : page,
      };
    },
    optionList: [
      {
        options: ["0-添加时间", "1-更新时间", "3-浏览次数"],
      },
    ],
    // 风云榜（排行榜）
    ranking: {
      options: ["3-人气排行(风云榜)", "1-更新排行", "0-上架排行"],
      load: async (option, page) => {
        page = page || 1;
        let order = option || "3";
        let url = `${this.baseUrl}/getact3.asp?act=list&page=${page}&catid=0&ajax=1&order=${order}`;
        let html = await this.getGbk(url);
        let comics = this.parseAjaxList(html);
        return {
          comics,
          maxPage: comics.length >= 20 ? page + 1 : page,
        };
      },
    },
  };

  // 搜索
  search = {
    /**
     * 搜索走 PC 版 POST /e/search/，关键词须 GBK 编码。
     * 注意：站点搜索分页已失效，仅第一页（30 条）可用。
     */
    load: async (keyword, options, page) => {
      page = page || 1;
      if (page > 1) {
        return { comics: [], maxPage: 1 };
      }
      let body = `key=${this.gbkUrlEncode(keyword)}`;
      let headers = {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": LaiManHua.uaPc,
        referer: `${this.pcUrl}/`,
        origin: this.pcUrl,
      };
      // 站点搜索为两步流程：POST/GET /e/search/ 会 302 跳转到
      // /e/search/result/?searchid=XXXX，结果位于该跳转目标页。
      // 此处在 fetchBytes 未自动跟随重定向时手动跟随，兼容两种情况。
      let res = await Network.fetchBytes(
        "POST",
        `${this.pcUrl}/e/search/`,
        headers,
        body
      );
      if (res.status === 301 || res.status === 302) {
        let loc =
          (res.headers &&
            (res.headers["location"] || res.headers["Location"])) ||
          "";
        if (loc) {
          if (loc.startsWith("/")) loc = `${this.pcUrl}${loc}`;
          res = await Network.fetchBytes("GET", loc, {
            "user-agent": LaiManHua.uaPc,
            referer: `${this.pcUrl}/`,
          });
        }
      }
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let html = Convert.decodeGbk(res.body);
      let document = new HtmlDocument(html);
      let list = document.querySelector(".dmList");
      if (!list) {
        return { comics: [], maxPage: 1 };
      }
      let comics = [];
      let lis = list.querySelectorAll("ul > li");
      for (let li of lis) {
        let dt = li.querySelector("dl dt a");
        if (!dt) continue;
        let href = dt.attributes["href"] || "";
        if (!href.includes("/kanmanhua/")) continue;
        let id = href.split("/").filter((e) => e !== "")[1];
        if (!id) continue;
        let title = (dt.attributes["title"] || dt.text || "").trim();

        let img = li.querySelector(".cover img");
        let cover = img ? img.attributes["src"] || "" : "";
        if (cover.startsWith("//")) cover = "https:" + cover;
        cover = cover.replace(/^http:\/\//, "https://");

        let description = "";
        let tags = [];
        let ps = li.querySelectorAll("dd p");
        for (let p of ps) {
          let text = p.text.trim();
          if (text.includes("简")) {
            description = text.replace(/^简\s*介：/, "").trim();
          } else if (text.includes("状")) {
            let status = text.replace(/^状\s*态：/, "").trim();
            if (status) tags.push(status);
          } else if (text.includes("类")) {
            let genre = text.replace(/^类\s*别：/, "").trim();
            if (genre) tags.push(genre);
          }
        }
        comics.push(new Comic({ id, title, cover, description, tags }));
      }
      return {
        comics,
        maxPage: 1,
      };
    },
    optionList: [],
    enableTagsSuggestions: false,
  };

  // 单个漫画
  comic = {
    /**
     * 加载详情：https://m.comemh8.com/kanmanhua/{id}/
     */
    loadInfo: async (id) => {
      let url = `${this.baseUrl}/kanmanhua/${id}/`;
      let document = await this.getHtml(url);

      let titleEl = document.querySelector(".main-bar h1");
      let title = titleEl ? titleEl.text.trim() : id;

      let detail = document.querySelector(".book-detail");
      let cover = "";
      let status = "";
      let author = "";
      let genre = "";
      let updateTo = "";
      let updateTime = "";
      if (detail) {
        let img = detail.querySelector(".thumb img");
        if (img) {
          cover = img.attributes["src"] || img.attributes["data-src"] || "";
          if (cover.startsWith("//")) cover = "https:" + cover;
        }
        let statusEl = detail.querySelector(".thumb i");
        status = statusEl ? statusEl.text.trim() : "";

        let dls = detail.querySelectorAll("dl");
        for (let dl of dls) {
          let dt = dl.querySelector("dt");
          let dd = dl.querySelector("dd");
          if (!dt || !dd) continue;
          let label = dt.text.replace(/\s/g, "");
          let value = dd.text.trim();
          if (label.includes("作者")) author = value;
          else if (label.includes("类别")) genre = value;
          else if (label.includes("更新至")) updateTo = value;
          else if (label.includes("更新于")) updateTime = value;
        }
      }

      let description = "";
      let intro = document.querySelector("#bookIntro");
      if (intro) {
        let ps = intro.querySelectorAll("p");
        if (ps.length > 0) {
          description = ps.map((e) => e.text.trim()).join("\n");
        } else {
          description = intro.text.trim();
        }
      }
      if (updateTo) {
        description = `更新至：${updateTo}\n${description}`;
      }

      // 章节列表（页面为倒序：最新在前，转成正序）
      let chapters = new Map();
      let items = [];
      let chapterList = document.querySelector("#chapterList");
      if (chapterList) {
        let links = chapterList.querySelectorAll("li a");
        for (let a of links) {
          let href = a.attributes["href"] || "";
          let m = href.match(/\/kanmanhua\/[^/]+\/([^/]+)\.html/);
          if (!m) continue;
          let epId = m[1];
          let epTitle = a.text.trim();
          items.push([epId, epTitle]);
        }
      }
      items.reverse();
      for (let [epId, epTitle] of items) {
        if (!chapters.has(epId)) {
          chapters.set(epId, epTitle);
        }
      }

      let tags = {};
      if (author) tags["作者"] = [author];
      if (status) tags["状态"] = [status];
      if (genre) tags["类别"] = [genre];

      return new ComicDetails({
        title,
        cover,
        description,
        tags,
        chapters,
        updateTime,
      });
    },

    /**
     * 加载章节图片。
     * 章节页内联明文 mhInfo JSON，无加密。
     * host 规则来自官方 main2.js：chapterId > 542724 → *.tgmhfc.uk 新库，
     * 否则 → mhpic6.tgmhfc.uk 旧库。
     */
    loadEp: async (comicId, epId) => {
      let url = `${this.baseUrl}/kanmanhua/${comicId}/${epId}.html`;
      let html = await this.getGbk(url);
      let m = html.match(/var\s+mhInfo\s*=\s*(\{[\s\S]*?\});/);
      if (!m) {
        throw "无法找到章节图片信息 (mhInfo)";
      }
      let info = JSON.parse(m[1]);
      let chapterId = parseInt(info.chapterId);
      let host;
      if (chapterId > 542724) {
        // 新章节：5 个镜像域等价，固定用第一个
        host = "https://xwdf.tgmhfc.uk";
      } else {
        host = "https://mhpic6.tgmhfc.uk";
      }
      let path = encodeURI(info.path);
      let images = [];
      for (let f of info.images) {
        images.push(host + path + encodeURIComponent(f));
      }
      return { images };
    },

    /**
     * 章节图片加载配置：必须携带 Referer，否则 403
     */
    onImageLoad: (url, comicId, epId) => {
      return {
        headers: {
          accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "user-agent": LaiManHua.uaMobile,
          referer: `${this.baseUrl}/`,
        },
      };
    },

    /**
     * 封面加载配置：p.miyeye.cn 同样校验 Referer
     */
    onThumbnailLoad: (url) => {
      return {
        headers: {
          accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "user-agent": LaiManHua.uaMobile,
          referer: `${this.baseUrl}/`,
        },
      };
    },
  };
}
