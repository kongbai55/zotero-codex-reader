# Codex Reader · Zotero 论文侧栏

在 Zotero 的 PDF 阅读器右侧与本机 Codex 对话。直接使用你平时 Codex App/CLI 的登录、模型、配置和服务；无需输入 API Key，无额外 HTTP 服务，无 npm 运行依赖。

## 安装

1. 先确认终端中的 Codex 可以正常使用，并已完成登录。
2. 在 Zotero 打开「工具 → 插件/附加组件」，点击齿轮，选择「从文件安装插件」。
3. 选择 `dist/zotero-codex-reader-0.1.0.xpi`。
4. 打开一篇 PDF，展开右侧信息栏，点击绿色代码图标，找到「Codex 论文助手」。
5. 点击「连接 Codex」。默认自动寻找你通过 npm 安装的 Codex。

已在本机 Zotero **10.0.6 / Windows x64** 和 Codex CLI **0.163.0** 进行集成检查。使用的是 Zotero 7 起提供的侧栏接口；其他版本、系统尚未实测。

没有自动更新服务器。需要更新时，重新构建并手动安装 XPI。此版 Zotero 强制要求 HTTPS `update_url`，所以填入的是回环占位地址 `https://127.0.0.1:9/codex-reader-no-updates.json`，启动时仅关闭本插件的后台更新。手动检查更新会失败，不连接开发者站点，也无需运行更新服务。

## 阅读和提问

- 在 PDF 中选中文字，点击弹出菜单里的「加入 Codex 上下文」。这一步只在本地填入上下文，不发起请求。
- 展开「发送的论文上下文」，可检查、删改内容。
- 也可以点击「提取前 20 页文本」，使用 Zotero 本地 PDF 提取器。上限为 60,000 字符，截断时会提示；扫描件需要先做 OCR。当前版本不分析图片和图表。
- 输入问题，点击「发送」或按 **Ctrl+Enter**，可实时查看逐步返回的回答。
- 「总结」「解释」「翻译」只填入问题草稿，不会自动发送。
- 每篇 PDF 分开维护会话；「停止」中断当前生成。「新会话」创建新的上下文，不删除 Codex 已保存的历史。
- 点击「复制对话」复制纯文本；「存为笔记」才会写入 Zotero 文献库。如果 Zotero 开启了同步，该笔记会按你的同步配置上传。

发送的数据包括：问题、当前论文标题、上下文框里的文字，以及 Codex 会话此前的上下文。未点击提取/加入选文时，不会自动读取正文。插件没有自动扫描整库的功能。

## 与 Codex App 的互通范围

**可以复用：**

- 同一 `CODEX_HOME`（未设置时为 Codex 的默认目录）中的登录与配置。
- CLI app-server 能加载的模型、MCP、技能及插件服务。插件不会复制或重写你的 Codex 配置。
- 从 `thread/list` 读取的历史会话。在「连接设置与已有会话 → 加载 Codex 历史」选择会话，再点击「分支继续聊」，保留原对话并在新分支中继续。
- 账户用量接口返回的限额信息。

**不能等同于完全同步 App：**

- 本插件启动一个独立的 `codex app-server` 进程，不连接 App 正在运行的会话进程。
- 分支是上下文的复制，后续消息不会双向同步回原对话。
- App 特有的界面工具、临时注入的连接器、浏览器宿主、审批窗口等不一定对独立 app-server 开放。可用范围由本机 Codex 决定。
- 共用会话存储不保证新对话立即出现在 App 当前的侧栏筛选中，也不保证 App 的进行中状态可读。
- 复用的是 Codex 的全局配置；不会自动进入 App 当前项目的工作目录，也不会自动继承那个项目里的配置和 AGENTS.md。
- 历史列表最多显示最近 40 条。当前版本不提供删除 Codex 历史的功能。

若 Zotero 和 App 使用不同的账户、系统用户或 `CODEX_HOME`，它们不会自动共享。配置模型列表为空或历史读取失败时，会保留错误信息供排查，而不会转向其他服务。

## 凭证与聊天隐私

这份代码采用小型独立实现，没有复制参考插件的运行时代码。它没有广告、遥测、开发者服务器、远程脚本、自动更新下载或第三方 JavaScript 依赖。

- 插件通过 Mozilla 的 **Subprocess** 直接启动已安装的 Codex 原生可执行文件，使用 **stdin/stdout JSON 消息**通信，不开监听端口、不经过命令行 shell。
- 插件不读取、不复制、不展示 `auth.json`、API Key 或 OAuth token。认证由 Codex 自己处理。需要登录时，只有点击「官方登录」才会打开官方登录页面。
- 插件只记住可执行文件路径；插件聊天显示和草稿留在 Zotero 进程内存中，关闭 Zotero 后不恢复。
- **Codex 本身的历史保存、模型提供商、网络请求、日志、遥测、MCP、插件及 hooks 按你现有配置运行。** 因此不能声称聊天只在本机，也不能声称现有配置中的其他服务不会接触内容。该行为是复用你现有配置的结果。
- 论文文字和模型输出始终作为不可信文本处理；回答使用 `textContent` 显示，不执行 HTML，不加载回答里的远程图片。
- 新建/分支会话使用只读沙箱及按需审批，不修改你的全局设置。已有 Codex 服务仍可用；需要客户端审批的命令、文件操作和服务交互会显示确认。
- 论文内容与问题会发送给当前 Codex 配置中的模型。不要把「本机 CLI」误解为「本地运行模型」。
- 与所有 Zotero 桌面插件一样，本插件本身具有较高本地权限；你可以审阅 `addon/` 中的全部源码。安装包仅包含这些文件。

本项目没有对 `llm-for-zotero` 做完整安全审计，用户的隐私顾虑不等于原插件存在泄露行为。它是功能参考：https://github.com/yilewang/llm-for-zotero 。

## 找不到 Codex 时

在侧栏「连接设置与已有会话」中填写 Codex 的完整路径并保存。Windows npm 安装可填写：

```text
C:\Users\你的用户名\AppData\Roaming\npm\codex.cmd
```

插件会定位其包内的 `codex.exe`，不会执行 `.cmd` 或 `.ps1`。对于其他安装方式，直接填写真正的原生可执行文件路径。

若提示未登录，先确认普通终端中的 `codex login` 已成功，或点击侧栏「官方登录」。不要求再次登录已经被 Codex 正确识别的账户。

点击「重新连接」会断开所有此插件会话的运行时连接，内存中的聊天显示会清空；已由 Codex 保存的历史仍可通过历史列表找到。生成期间会禁止重连。

## 构建与检查

需要 Node.js（运行测试）和 Python 3（打包），构建过程不下载依赖。

```powershell
node --test tests/core.test.cjs
python scripts/build.py
```

输出位于 `dist/`，并附 SHA-256 校验文件。

`scripts/probe.cjs` 只验证本机 Codex 的初始化、账户是否可用、模型目录和历史读取。它不读取凭证文件，不打印邮件、token 或对话，不发起模型生成。

`scripts/prepare-smoke.py` 和 `tests/zotero-smoke.js` 用于独立测试配置，测试脚本不会打包进发布版。它们使用生成的示例 PDF，验证实际 Zotero 加载、正文提取、选文、纯文本输出和本机 Codex 通信。

## 源码

| 文件 | 职责 |
| --- | --- |
| `addon/bootstrap.js` | Zotero 插件生命周期与侧栏注册 |
| `addon/content/core.js` | JSON 协议、流式回复、上下文边界、会话隔离 |
| `addon/content/host.js` | 本地原生进程、登录、模型、历史、审批 |
| `addon/content/sidebar.js` | 阅读侧栏、选文与正文预览、对话和笔记 |
| `addon/content/sidebar.css` | 随 Zotero 明暗主题适配的样式 |

接口依据：

- https://learn.chatgpt.com/docs/app-server
- https://www.zotero.org/support/dev/zotero_7_for_developers
- 兼容性检查还参考了本机 Zotero 所附的接口实现及本机 Codex 生成的协议 schema。

MIT License，见 `LICENSE`。
