/**
 * 如漫画 (m.rumanhua2.com) —— Venera 漫画源 v4（简洁版）
 * ===============================================================
 * 参考 Breeze-plugin-RuManHua 实现：标准 atob + XOR + IMAGE_KEYS
 * 不再需要 jsjiami 反混淆、自定义 base64、RC4 等复杂逻辑。
 *
 * 流程: extractReaderId → IMAGE_KEYS[keyIdx] → UTF8 字节 XOR
 *       extractCipher → unpackEdwards 解码 → __c0rst96
 *       decryptChapterImages → atob(cipher) ^ atob(key) → atob(xor) → JSON.parse
 */
class RuManHua extends ComicSource {
  name = "如漫画";
  key = "rumanhua2";
  version = "4.0.0";
  minAppVersion = "1.0.0";
  url = "https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/rumh.js";

  baseUrl = "http://m.rumanhua2.com";
  UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

  // IMAGE_KEYS: readerContainer data-id → XOR 密钥 (UTF8)
  // 来自 Breeze-plugin-RuManHua 的 IMAGE_KEYS 数组
  _IMAGE_KEYS = [
    "smkhy258", // 0
    "smkd95fv", // 1
    "md496952", // 2
    "cdcsdwq",  // 3
    "vbfsa256", // 4
    "cawf151c", // 5
    "cd56cvda", // 6
    "8kihnt9",  // 7
    "dso15tlo", // 8
    "5ko6plhy", // 9
  ];

  // ===========================================
  // Dean Edwards Packer 解码器
  // ===========================================
  _unpackEdwards(p, a, c, kStr) {
    const k = kStr.split("|");
    function encode(num) {
      const r = num % a;
      const prefix = num < a ? "" : encode(Math.floor(num / a));
      const suffix = r > 35 ? String.fromCharCode(r + 29) : r.toString(36);
      return prefix + suffix;
    }
    let result = p;
    for (let i = c - 1; i >= 0; i--) {
      const val = k[i];
      if (!val) continue;
      const token = encode(i);
      result = result.split(new RegExp("\\b" + token + "\\b", "g")).join(val);
    }
    return result;
  }

  // ===========================================
  // 从 HTML 提取 readerContainer data-id
  // ===========================================
  _extractReaderId(html) {
    const m = html.match(/class="readerContainer"[^>]*data-id="(\d+)"/);
    if (!m) throw new Error("未找到 readerContainer data-id");
    return parseInt(m[1], 10);
  }

  // ===========================================
  // 从 HTML 提取 __c0rst96 密文
  // ===========================================
  _extractCipher(html) {
    // 1) 找 packed eval 块
    const reEval = /eval\(function\(p,a,c,k,e,d\)/;
    const idx = html.indexOf("eval(function(p,a,c,k,e,d)");
    if (idx === -1) throw new Error("未找到 packed JS eval 块");

    // 2) 提取 eval(...) 调用体
    let paren = 0, inString = false, strChar = "";
    let i = idx + 4; // 跳过 "eval"
    for (; i < html.length; i++) {
      const ch = html[i];
      if (inString) { if (ch === "\\") { i++; continue; } if (ch === strChar) inString = false; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { inString = true; strChar = ch; continue; }
      if (ch === "(") paren++;
      else if (ch === ")") { paren--; if (paren === 0) { i++; break; } }
    }
    const packedCall = html.slice(idx + 4, i).trim();

    // 3) 解析参数: (function(p,a,c,k,e,d){...body...}(args))
    let braceDepth = 0, bodyEnd = -1;
    for (let j = 0; j < packedCall.length; j++) {
      if (packedCall[j] === "{") braceDepth++;
      else if (packedCall[j] === "}") { braceDepth--; if (braceDepth === 0) { bodyEnd = j; break; } }
    }
    const argsStr = packedCall.slice(bodyEnd + 1).trim();
    const inner = argsStr.slice(1, -1); // 去掉外层括号

    // 4) 解析 4 个顶层参数：p='...', a=n, c=n, k='...'.split('|')
    // 简单方法: 从 inner 中提取最后一个单引号括起的字符串 as k (字典)
    // 因为 k 格式固定: 'var|KgU|...'.split('|')
    const kMatch = inner.match(/'([^']*?)'\.split\('\|'\)/);
    if (!kMatch) throw new Error("无法解析 packed k 参数");
    const kStr = kMatch[1];

    // 5) 解析 a, c
    const aMatch = inner.match(/'[^']*?',(\d+),(\d+)/);
    if (!aMatch) throw new Error("无法解析 packed a,c 参数");
    const pStr = inner.slice(1, inner.indexOf("'," + aMatch[1]));
    const a = parseInt(aMatch[1], 10);
    const c = parseInt(aMatch[2], 10);

    // 6) unpack → 拿 __c0rst96
    const decoded = this._unpackEdwards(pStr, a, c, kStr);
    const vm = decoded.match(/var __c0rst96="([^"]*)"/);
    if (!vm) throw new Error("未找到 __c0rst96");
    return vm[1];
  }

  // ===========================================
  // 解密图片 URL 列表
  // ===========================================
  _decryptChapterImages(cipher, readerId) {
    // atob polyfill (Venera 的 QuickJS 默认没有)
    const _atob = typeof atob === "function" ? atob : function (s) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      s = String(s).replace(/=+$/, "");
      let out = "";
      for (let i = 0, bs, b, idx = 0; (b = s.charAt(idx++)); ) {
        b = chars.indexOf(b);
        if (~b) { bs = i % 4 ? bs * 64 + b : b; if (i++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * i) & 6))); }
      }
      return out;
    };
    const key = this._IMAGE_KEYS[readerId];
    if (!key) throw new Error("不支持的 data-id: " + readerId);

    // atob 解码密文（标准 base64）
    const cipherBuf = _atob(cipher);
    // key → UTF8 字节
    const keyBuf = [];
    for (let i = 0; i < key.length; i++) {
      const code = key.charCodeAt(i);
      if (code < 0x80) keyBuf.push(code);
      else if (code < 0x800) {
        keyBuf.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else {
        keyBuf.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }

    // XOR
    let xored = "";
    for (let i = 0; i < cipherBuf.length; i++) {
      xored += String.fromCharCode(
        cipherBuf.charCodeAt(i) ^ keyBuf[i % keyBuf.length]
      );
    }

    // 二次 atob + JSON.parse
    return JSON.parse(_atob(xored));
  }

  // ===========================================
  // 浏览 / 探索页
  // ===========================================
  explore = [
    {
      title: "首页推荐",
      type: "multiPartPage",
      load: async () => {
        const res = await Network.get(this.baseUrl + "/");
        if (res.status !== 200) throw `HTTP Error ${res.status}`;
        const doc = new HtmlDocument(res.body);
        const blocks = doc.querySelectorAll(".mults");
        const data = [];
        for (const block of blocks) {
          const headEl = block.querySelector(".mult-head");
          const title = headEl ? headEl.text.trim() : "推荐";
          const comics = [];
          const items = block.querySelectorAll(".mult-body li a");
          for (const a of items) {
            const id = a.attributes["href"];
            if (!id || id === "null") continue;
            const imgEl = a.querySelector("img");
            const cover = imgEl
              ? imgEl.attributes["data-src"] || imgEl.attributes["src"] || ""
              : "";
            const titleText =
              a.attributes["title"] ||
              (a.querySelector(".card-title")
                ? a.querySelector(".card-title").text.trim()
                : "");
            const ps = a.querySelectorAll("p");
            const subTitle =
              ps.length >= 2
                ? ps[ps.length - 1].text.trim()
                : ps.length === 1
                  ? ps[0].text.trim()
                  : "";
            comics.push(new Comic({ id, title: titleText, cover, subTitle }));
          }
          if (comics.length > 0) data.push({ title, comics, viewMore: null });
        }
        return data;
      },
    },
    {
      title: "总排行榜",
      type: "multiPageComicList",
      load: async (page) => {
        const p = page || 1;
        const res = await Network.get(this.baseUrl + "/rank/1?page=" + p);
        if (res.status !== 200) throw `HTTP Error ${res.status}`;
        const doc = new HtmlDocument(res.body);
        const comics = this._parsePosterPage(doc);
        const pageLinks = doc.querySelectorAll("a[href*='page=']");
        let maxPage = p;
        for (const pl of pageLinks) {
          const h = pl.attributes["href"] || "";
          const pm = h.match(/page=(\d+)/);
          if (pm) maxPage = Math.max(maxPage, parseInt(pm[1]));
        }
        return { comics, maxPage };
      },
    },
  ];

  // 排行榜/分类页的卡片解析：封面在 .poster-box a，标题在 .simple-info a
  _parsePosterPage(doc) {
    // 收集封面 Map<id, cover>
    const coverMap = new Map();
    const coverEls = doc.querySelectorAll(".poster-box a[href]");
    for (const a of coverEls) {
      const id = a.attributes["href"];
      if (!id || !/^\/[A-Za-z0-9]{4,12}\//.test(id)) continue;
      const img = a.querySelector("img");
      const cover = img ? (img.attributes["data-src"] || img.attributes["src"] || "") : "";
      coverMap.set(id, cover);
    }
    // 收集标题 Map<id, {title, subTitle}>
    const infoMap = new Map();
    const infoEls = doc.querySelectorAll(".simple-info a[href]");
    for (const a of infoEls) {
      const id = a.attributes["href"];
      if (!id || !/^\/[A-Za-z0-9]{4,12}\//.test(id)) continue;
      const h2 = a.querySelector("h2");
      const title = h2 ? h2.text.trim() : (a.attributes["title"] || "");
      const ps = a.querySelectorAll("p");
      const subTitle = ps.length > 0 ? ps[0].text.trim() : "";
      infoMap.set(id, { title, subTitle });
    }
    // 合并去重
    const comics = [];
    const seen = new Set();
    const allIds = [...new Set([...coverMap.keys(), ...infoMap.keys()])];
    for (const id of allIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const info = infoMap.get(id) || { title: "", subTitle: "" };
      const cover = coverMap.get(id) || "";
      comics.push(new Comic({ id, title: info.title, cover, subTitle: info.subTitle }));
    }
    return comics;
  }

  // ===========================================
  // 搜索 (当前接口已退化但 Venera 要求声明)
  // ===========================================
  search = {
    enableTagsSuggestions: false,
    onTagSuggestionSelected: null,
    load: async (keyword, options, page) => {
      const body = "k=" + encodeURIComponent(keyword);
      const data = Convert.encodeUtf8(body);
      const res = await Network.post(
        this.baseUrl + "/s",
        {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": this.UA,
          Referer: this.baseUrl + "/",
          "X-Requested-With": "XMLHttpRequest",
        },
        data,
      );
      if (res.status !== 200) return { comics: [], maxPage: 0 };
      let json;
      try { json = JSON.parse(res.body); } catch (e) { return { comics: [], maxPage: 0 }; }
      if (!json || json.code !== "200" || !json.data) return { comics: [], maxPage: 0 };
      const items = Array.isArray(json.data) ? json.data : [];
      const comics = items.map(item => new Comic({
        id: "/" + item.id + "/",
        title: item.name || item.title || "",
        cover: item.imgurl || item.imgUrl || "",
        subTitle: item.remarks || item.desc || "",
      }));
      return { comics, maxPage: 1 };
    },
  };

  // ===========================================
  // 分类
  // ===========================================
  category = {
    title: "分类",
    parts: [{
      name: "类型",
      type: "fixed",
      categories: ["冒险","热血","都市","玄幻","悬疑","耽美","恋爱","生活","搞笑","穿越","修真","后宫","女主","古风","连载","完结"],
      itemType: "category",
      categoryParams: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16"],
    }],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const p = page || 1;
      const res = await Network.get(this.baseUrl + "/sort/" + param + "?page=" + p);
      if (res.status !== 200) throw `HTTP Error ${res.status}`;
      const doc = new HtmlDocument(res.body);
      const comics = this._parsePosterPage(doc);
      let maxPage = p;
      const pageLinks = doc.querySelectorAll("a[href*='page=']");
      for (const pl of pageLinks) {
        const h = pl.attributes["href"] || "";
        const pm = h.match(/page=(\d+)/);
        if (pm) maxPage = Math.max(maxPage, parseInt(pm[1]));
      }
      return { comics, maxPage };
    },
  };

  // ===========================================
  // 漫画详情
  // ===========================================
  comic = {
    loadInfo: async (id) => {
      const res = await Network.get(this.baseUrl + id);
      if (res.status !== 200) throw `HTTP Error ${res.status}`;
      const doc = new HtmlDocument(res.body);

      const titleEl = doc.querySelector(".book-name .name, h1.name");
      const title = titleEl ? titleEl.text.trim() : "";

      const coverEl = doc.querySelector(".book-cover .thumbnail img");
      const cover = coverEl
        ? coverEl.attributes["data-src"] || coverEl.attributes["src"] || ""
        : "";

      let author = "";
      let status = "unknown";
      const detailEls = doc.querySelectorAll(
        ".comic-info-detail p, .comic-info p"
      );
      for (const p of detailEls) {
        const text = p.text;
        if (text.includes("作者：")) author = text.replace("作者：", "").trim();
        else if (text.includes("状态：")) {
          const s = text.replace("状态：", "").trim();
          if (s === "连载中") status = "ongoing";
          else if (s === "已完结") status = "completed";
        }
      }

      const tags = [];
      const tagEls = doc.querySelectorAll(".comic-tags a, .comic-tags span");
      for (const t of tagEls) {
        const txt = t.text.trim();
        if (txt) tags.push(txt);
      }

      let description = "";
      const descEl = doc.querySelector('meta[name="description"]');
      if (descEl && descEl.attributes["content"])
        description = descEl.attributes["content"].trim();
      else {
        const introEl = doc.querySelector(".comic-intro");
        if (introEl) description = introEl.text.trim();
      }

      // --- 章节列表: 从页面 + /morechapter 合并 ---
      const chapters = new Map();
      const rawId = id.replace(/^\/|\/$/g, ""); // /GZOZGZS/ → GZOZGZS
      const chapterMap = new Map(); // chapterId → {path, title}

      // 1) 从详情页解析 (较新章节，用 .chapterlistload a)
      const chapterEls = doc.querySelectorAll(".chapterlistload a[href]");
      for (const a of chapterEls) {
        const href = a.attributes["href"];
        if (!href || !/\.html$/.test(href)) continue;
        const cid = href.replace(/.*\/([^/]+)\.html$/, "$1");
        const title = a.text.trim();
        if (cid && title && !chapterMap.has(cid)) {
          chapterMap.set(cid, { path: href, title });
        }
      }

      // 2) POST /morechapter 拉更早章节
      try {
        const moreBody = Convert.encodeUtf8("id=" + encodeURIComponent(rawId));
        const moreRes = await Network.post(
          this.baseUrl + "/morechapter",
          {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": this.UA,
            Referer: this.baseUrl + id,
          },
          moreBody,
        );
        if (moreRes.status === 200) {
          const json = JSON.parse(moreRes.body);
          if (json && json.code === "200" && Array.isArray(json.data)) {
            for (const ch of json.data) {
              const cid = ch.chapterid || ch.id || "";
              const cname = ch.chaptername || ch.name || "";
              const cpath = id + cid + ".html";
              if (cid && cname && !chapterMap.has(cid)) {
                chapterMap.set(cid, { path: cpath, title: cname });
              }
            }
          }
        }
      } catch (e) {
        console.warn("loadInfo: /morechapter failed, using page chapters only");
      }

      // 3) 反转顺序写入 Map（详情页 + morechapter 合并后是最新在前，需反转为第1话在上）
      const entries = [...chapterMap.entries()].reverse();
      for (const [, ch] of entries) {
        chapters.set(ch.path, ch.title);
      }

      return new ComicDetails({
        id, title, cover, author, description,
        tags: tags.length > 0 ? { "标签": tags } : {},
        status, chapters,
      });
    },

    // ===========================================
    // loadEp: 三步解码 — data-id → key → XOR → URL 列表
    // ===========================================
    loadEp: async (comicId, epId) => {
      const res = await Network.get(this.baseUrl + epId, {
        "User-Agent": this.UA,
        Referer: this.baseUrl + "/",
      });
      if (res.status !== 200) throw `HTTP Error ${res.status}`;

      const html = res.body;

      // 1) 提取 data-id → 选 XOR 密钥
      const readerId = this._extractReaderId(html);
      console.log("loadEp: readerId=" + readerId + ", key=" + this._IMAGE_KEYS[readerId]);

      // 2) 提取 __c0rst96 密文
      const cipher = this._extractCipher(html);
      console.log("loadEp: cipher len=" + cipher.length);

      // 3) 解密
      const urls = this._decryptChapterImages(cipher, readerId);
      console.log("loadEp: 解码出 " + urls.length + " 张图片");

      return { images: urls };
    },

    onImageLoad: (url) => ({
      url,
      headers: {
        "User-Agent": this.UA,
        Referer: this.baseUrl + "/",
        Accept: "image/avif,image/webp,image/apng,*/*;q=0.8",
      },
    }),

    idMatch: "/[A-Za-z0-9]{4,12}/",

    link: {
      domains: ["m.rumanhua2.com"],
      linkToId: (url) => {
        const m = url.match(/m\.rumanhua2\.com\/([A-Za-z0-9]{4,12})/);
        return m ? "/" + m[1] + "/" : null;
      },
    },

    enableTagsTranslate: false,
  };
}
