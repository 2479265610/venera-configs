## 此为此仓库新增
基本上都是用来看国漫的。都是 AI 写的，有些功能会缺失，有 bug。只能说能用就用吧，或者自己下载再拿去给 AI 改一改。

## 通过 JSON 自动添加漫画源

可通过 `index.json` 自动添加漫画源，无需手动配置。直接使用以下原始链接导入：

```
https://gh-proxy.org/raw.githubusercontent.com/2479265610/venera-configs/refs/heads/main/index.json
```

**注意事项：**

> 部分漫画源添加了缓存功能以提高加载速度，如果您不需要此功能，可以在应用设置中关闭。请注意，缓存数据不会自动清理，如需清理请手动操作。



## 创建新配置

1. 下载 `_template_.js` 和 `_venera_.js` 文件，放入同一目录
2. 将 `_template_.js` 重命名为 `your_config_name.js`
3. 根据需求编辑 `your_config_name.js` 文件
   - `_template_.js` 文件中包含详细注释以帮助配置
   - `_venera_.js` 用于 IDE 中的代码补全


