# SourceFlow Hello

`SourceFlow Hello` 是一个用于自测和示例演示的插件：

- 顶部栏按钮
- 状态栏信息
- 命令面板命令
- 插件私有存储
- 插件设置面板

## 本地验证

```powershell
node .\scripts\validate-plugin-manifest.js .\examples\plugins\sourceflow-hello
node .\scripts\package-plugin.js .\examples\plugins\sourceflow-hello
node .\scripts\publish-plugin-to-bazaar.js .\examples\plugins\sourceflow-hello --owner lonelyor --repo sourceflow-hello --icon .\app\src\assets\icon.png --preview .\app\src\assets\icon.png
```

然后在 `设置 -> 集市 -> 已下载 -> 插件 -> 导入` 中导入生成的 ZIP。
