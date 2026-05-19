# SourceFlow Plugins

这个目录用于统一维护本地插件源码。每个插件独立放在一个子目录中：

```text
plugins/
  sourceflow-hello/
    plugin.json
    index.js
    index.css
    README.md
```

发布单个插件到插件商城：

```powershell
python .\插件商城.py .\plugins\sourceflow-hello --owner lonelyor --repo sourceflow-hello
```

脚本会把插件源码、Bazaar 提交物、包文件和静态索引同步到 `SourceFlow-plugins` 独立仓库。

