# SourceFlow Bazaar

这是 `SourceFlow` 独立集市的 GitHub 静态托管模板。

目录约定：

- `submissions/<type>/*.json`
  - 集市提交源文件，`type` 为 `plugins/themes/icons/templates/widgets`
- `packages/`
  - 发布后的静态资源目录
  - 包压缩包路径：`package/<owner>/<repo>@<hash>.zip`
  - 包静态资源路径：`package/<owner>/<repo>@<hash>/<asset>`
- `stats/index.json`
  - 下载统计输入文件
- `dist/`
  - 由 `node scripts/generate-bazaar.js` 生成的最终 GitHub Pages 内容

快速生成：

```powershell
node .\scripts\validate-bazaar.js
node .\scripts\generate-bazaar.js
```

从本地插件目录一键生成提交物：

```powershell
node .\scripts\publish-plugin-to-bazaar.js .\examples\plugins\sourceflow-hello `
  --owner lonelyor `
  --repo sourceflow-hello `
  --icon .\app\src\assets\icon.png `
  --preview .\app\src\assets\icon.png
```

这条命令会自动完成：

- 校验 `plugin.json`
- 打包 ZIP
- 计算 ZIP 的 `SHA-1` 与 `SHA-256`
- 生成 `submissions/plugins/*.json`
- 复制 ZIP 到 `packages/package/<owner>/<repo>@<hash>.zip`
- 复制 `README`、图标、预览图到对应静态目录

导入兼容的 stage 索引：

```powershell
node .\scripts\import-bazaar-stage.js --type plugins --input .\plugins.json
```

默认发布链：

- `scripts/validate-bazaar.js`
  - 校验 submissions 结构
  - 校验包名和 `owner/repo@hash` 不重复
  - 校验 `package.archiveSHA256`
  - 重新计算 ZIP 的 `SHA-256` 并比对 submission
  - 默认要求对应的 `package/<owner>/<repo>@<hash>.zip` 存在
- `scripts/publish-plugin-to-bazaar.js`
  - 从插件目录一键生成 Bazaar 提交物
  - 负责打包、算哈希、复制静态资源、写 submission JSON
- `scripts/generate-bazaar.js`
  - 生成 `version.json`
  - 生成 `bazaar@<hash>/stage/*.json`
  - 复制 `packages/` 到 `dist/package/`
- `.github/workflows/sourceflow-bazaar.yml`
  - 提交后自动校验并发布到 GitHub Pages

宿主侧插件系统生产自测：

```powershell
node .\scripts\test-plugin-system.js
```

这条命令会把宿主插件系统与 Bazaar 主链一起串起来验证，包括：

- 插件打包
- Bazaar 提交生成
- Bazaar 校验与静态生成
- Bazaar 独立仓库导出
- 运行时权限与危险全局守卫
- Go 测试
- 前端构建

导出独立 GitHub 集市仓库：

```powershell
node .\scripts\export-bazaar-repo.js .\tmp\sourceflow-bazaar-repo --force
```

导出结果会包含：

- `README.md`
- `submissions/`
- `packages/`
- `stats/`
- `scripts/validate-bazaar.js`
- `scripts/generate-bazaar.js`
- `.github/workflows/sourceflow-bazaar.yml`
- `package.json`

也就是说，导出后的目录可以直接作为 `lonelyor/sourceflow-bazaar` 仓库初始化内容。

当前策略：

- 集市默认走 GitHub Pages 静态源
- SourceFlow 宿主默认离线运行
- 只有用户主动打开集市、获取清单、检查更新、安装时才联网
- 在线安装或更新插件前，宿主会先展示来源、`SHA-256` 与权限声明，再由用户确认
- 已安装插件从关闭切到开启前，宿主会再次展示权限声明并要求确认
- 如果插件升级后权限声明发生变化，宿主会自动清除原启用状态，要求用户重新确认
- 本地导入插件会记录安装来源和 `SHA-256`
