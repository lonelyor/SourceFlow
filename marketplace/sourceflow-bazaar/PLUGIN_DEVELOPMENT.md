# SourceFlow 插件编写教程

这份教程面向 SourceFlow 插件作者。目标是写出可以被商城安装、可以被烟测验证、并且不会影响笔记编辑和同步主流程的插件。

## 1. 创建插件目录

插件源码统一放在 SourceFlow 主仓库根目录的 `plugins/` 下，每个插件一个独立目录：

```text
plugins/
  sourceflow-my-plugin/
    plugin.json
    index.js
    index.css
    README.md
    i18n/
      zh_CN.json
      en_US.json
```

插件名建议使用小写字母、数字、中划线，例如 `sourceflow-paper-polish`。

## 2. 编写 plugin.json

最小示例：

```json
{
  "manifestVersion": 1,
  "name": "sourceflow-my-plugin",
  "displayName": {
    "default": "My Plugin",
    "zh_CN": "我的插件",
    "en_US": "My Plugin"
  },
  "description": {
    "default": "A focused SourceFlow plugin.",
    "zh_CN": "一个专注的 SourceFlow 插件。",
    "en_US": "A focused SourceFlow plugin."
  },
  "version": "1.0.0",
  "minAppVersion": "0.1.0",
  "author": "By lonelyor",
  "url": "https://github.com/lonelyor/SourceFlow-plugins",
  "frontends": ["desktop"],
  "backends": ["all"],
  "entry": "index.js",
  "style": "index.css",
  "permissions": ["storage", "ui.topbar", "ui.command", "ui.notification"],
  "allowedRequireModules": []
}
```

关键字段：

- `name`：插件唯一名，必须匹配 `^[a-z0-9][a-z0-9-_]{1,63}$`。
- `version`：语义化版本，例如 `1.0.0`。
- `minAppVersion`：最低 SourceFlow 版本。
- `entry`：插件入口 JS 文件。
- `style`：可选样式文件。
- `frontends`：适用前端，例如 `desktop`、`mobile`、`browser`、`all`。
- `backends`：适用后端，例如 `windows`、`linux`、`darwin`、`all`。
- `permissions`：权限声明，必须最小化。
- `allowedRequireModules`：默认保持空数组，避免插件随意加载宿主模块。

## 3. 选择权限

当前支持的权限：

```text
storage
ui.topbar
ui.statusbar
ui.command
ui.dock
ui.setting
ui.tab
ui.dialog
ui.float
ui.notification
workspace.read
workspace.write
network.http
host.control
```

权限选择建议：

- 只保存插件设置时使用 `storage`。
- 只加按钮时使用 `ui.topbar`。
- 只加命令时使用 `ui.command`。
- 只展示提示时使用 `ui.notification`。
- 只有确实需要读写笔记内容时才申请 `workspace.read` 或 `workspace.write`。
- 只有确实需要访问外部服务时才申请 `network.http`。
- 默认不要申请 `host.control`。

产品级稳定性要求插件可熔断：插件异常时只影响插件自己，不影响笔记编辑、保存、同步和启动。

## 4. 编写入口 JS

基础结构：

```js
const { Plugin, showMessage } = require("sourceflow");

module.exports = class SourceFlowMyPlugin extends Plugin {
  async onload() {
    this.addTopBar({
      icon: "iconSparkles",
      title: this.i18n?.topBarTitle || "My Plugin",
      callback: () => {
        showMessage(this.i18n?.hello || "Hello from SourceFlow plugin");
      }
    });

    this.addCommand({
      langKey: "myPluginCommand",
      hotkey: "",
      callback: () => {
        showMessage(this.i18n?.hello || "Hello from SourceFlow plugin");
      }
    });
  }
};
```

常用运行时能力：

- `this.addTopBar(options)`：添加顶部栏按钮。
- `this.addStatusBar(options)`：添加状态栏区域。
- `this.addCommand(options)`：注册命令。
- `this.loadData(name)`：读取插件私有数据。
- `this.saveData(name, data)`：保存插件私有数据。
- `new Setting({ confirmCallback })`：创建插件设置面板。
- `showMessage(text)`：展示用户提示。

不要直接使用 `eval`、`Function`、`Worker`、`localStorage`、`indexedDB`、`document.cookie` 等绕过宿主权限模型的能力。烟测会拦截这些危险入口。

## 5. 编写设置项

```js
const { Plugin, Setting, showMessage } = require("sourceflow");

module.exports = class SourceFlowSettingsPlugin extends Plugin {
  async onload() {
    const saved = await this.loadData("settings.json");
    this.state = saved && typeof saved === "object" ? saved : { enabled: true };

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(this.state.enabled);

    this.setting = new Setting({
      confirmCallback: async () => {
        this.state.enabled = Boolean(checkbox.checked);
        await this.saveData("settings.json", this.state);
        showMessage("Settings saved");
      }
    });

    this.setting.addItem({
      title: "Enable",
      description: "Enable this plugin.",
      actionElement: checkbox
    });
  }
};
```

如果插件有设置项，`plugin.json` 中应声明 `ui.setting`。

## 6. 编写样式

样式放在 `index.css`，或者在运行时注入只影响插件自身的 class。

推荐：

```css
.sourceflow-my-plugin-status {
  opacity: 0.82;
}
```

避免：

- 全局重置 `body`、`*`、`button` 等基础样式。
- 覆盖宿主核心布局尺寸。
- 使用高优先级选择器破坏其他插件或主题。

## 7. 编写 README

每个插件目录都应该有 `README.md`，至少说明：

- 插件解决什么问题。
- 主要功能。
- 申请了哪些权限，为什么需要。
- 已知限制。
- 本地测试命令。

商城会把插件 README 复制到包静态资源目录，供用户安装前查看。

## 8. 本地测试

在 SourceFlow 主仓库根目录运行：

```powershell
node .\scripts\validate-plugin-manifest.js .\plugins\sourceflow-my-plugin
node .\scripts\smoke-plugin-runtime.js .\plugins\sourceflow-my-plugin
python .\插件商城.py .\plugins\sourceflow-my-plugin --owner lonelyor --repo sourceflow-my-plugin --skip-push
```

测试含义：

- `validate-plugin-manifest.js`：校验 `plugin.json`。
- `smoke-plugin-runtime.js`：加载插件入口并检查权限守卫。
- `插件商城.py --skip-push`：完整打包并生成本地商城索引，但不推送 GitHub。

## 9. 准备提交到插件商城

确认本地测试通过后，先生成本地商城包并检查输出：

```powershell
python .\插件商城.py .\plugins\sourceflow-my-plugin `
  --owner lonelyor `
  --repo sourceflow-my-plugin `
  --skip-push
```

脚本会：

- 同步插件源码到商城仓库导出内容。
- 打包 ZIP。
- 写入 `submissions/plugins/*.json`。
- 生成 `packages/package/<owner>/<repo>@<hash>.zip`。
- 生成 `dist/version.json`。

提交插件时请提供：

- 插件源码目录。
- `plugin.json`。
- 插件 README。
- 本地烟测结果。
- 插件申请的权限和申请理由。

中心插件源由维护者审核后更新。普通插件作者不需要 GitHub token，也不需要写入中心插件仓库。

## 10. 发布前检查清单

- `plugin.json` 名称、版本、权限、入口文件正确。
- 权限最小化，没有无理由申请 `network.http`、`workspace.write`、`host.control`。
- 插件失败不会阻断笔记编辑、保存、同步和启动。
- README 说明了功能、权限和限制。
- 烟测通过。
- `插件商城.py --skip-push` 通过。

## 11. 版本升级规则

- 修复 bug：递增 patch，例如 `1.0.0` -> `1.0.1`。
- 新增兼容功能：递增 minor，例如 `1.0.0` -> `1.1.0`。
- 破坏性变更：递增 major，例如 `1.0.0` -> `2.0.0`。
- 权限变更要写进 README，宿主应要求用户重新确认。
