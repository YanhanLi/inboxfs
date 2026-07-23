# InboxFS

[English](README.md) | [简体中文](README.zh-CN.md)

InboxFS 是一个本地优先的文件收件箱。它扫描指定文件夹中的散落文件，预览清晰的分类去向，只移动你选中的文件，并且可以安全撤销内容未发生变化的移动操作。

服务只运行在 `127.0.0.1`。文件名和文件内容不会上传到云端。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/inboxfs-workspace-dark.png">
  <img alt="InboxFS 文件工作区" src="docs/inboxfs-workspace.png">
</picture>

## 快速体验

InboxFS 需要 Node.js 22.5 或更高版本。

建议先打开隔离的示例收件箱。这个模式不会读取或修改你的文件，InboxFS 停止运行后还会删除临时工作区：

```bash
npx github:YanhanLi/inboxfs --demo
```

确认工作方式后，再打开真实文件夹：

```bash
npx github:YanhanLi/inboxfs ~/Downloads
```

浏览器会打开本地 InboxFS 工作区。检查分类建议，取消选择暂时不想处理的文件，然后点击 **Organize**。

也可以指定其他收件箱：

```bash
npx github:YanhanLi/inboxfs ~/Desktop
```

## 主要功能

- 分类文档、图片、音频、视频、压缩包、安装包、代码与数据、字体及其他文件；
- 只扫描目标根目录中的普通文件，不处理子文件夹和隐藏文件；
- 在执行任何移动之前预览每个目标位置；
- 解释每项分类建议对应的扩展名或兜底规则；
- 按名称、修改时间、大小或目标位置排序，并提供支持键盘操作的完整详情面板；
- 移动前汇总当前整理计划；
- 目标位置存在同名文件时自动增加数字后缀，不覆盖原文件；
- 检测收件箱及已有分类目录中的逐字节重复文件，并让后出现的副本保持未选中；
- 根目录文件新增、重命名或删除后自动刷新；
- 批量移动前进行完整预检，后续移动失败时回滚之前已完成的移动；
- 为每次移动记录 SHA-256，并提供逐文件撤销；
- 整理后的文件发生变化，或者原位置已被占用时拒绝撤销；
- 拒绝通过符号链接离开选定收件箱的路径；
- 无需云端账户，可在桌面和移动宽度的浏览器中使用；
- 支持筛选、搜索、批量选择和响应式文件视图；
- 跟随系统明暗主题，并在本地记住手动主题设置；
- 在响应式工作区中创建、排序、预览、启用、停用、验证和删除确定性的多条件规则；
- 可选用安装在 `127.0.0.1` 上的 Ollama 模型复核未匹配文件或当前明确选中的文件，并允许接受、修正建议或将建议转为确定性规则。

## 自定义规则

在工作区中选择 **Rules** 即可创建和编辑自定义分类。保存前，编辑器会预览匹配数量、示例文件、目标变化和优先级冲突。预览是只读的，不会移动文件，也不会改写 `.inboxfs.json`。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/inboxfs-rules-dark.png">
  <img alt="InboxFS 确定性规则编辑器及只读影响预览" src="docs/inboxfs-rules.png">
</picture>

InboxFS 会先验证完整规则集，再以原子方式把 `.inboxfs.json` 保存到正在扫描的文件夹。你也可以直接编辑这个带版本号的文件：

```json
{
  "version": 2,
  "rules": [
    {
      "name": "Large reports",
      "destination": "Reports",
      "enabled": true,
      "match": {
        "extensions": ["pdf"],
        "nameGlobs": ["report-*.pdf"],
        "size": { "minBytes": 1000000 }
      }
    },
    {
      "name": "Reading",
      "destination": "Books",
      "enabled": true,
      "match": { "extensions": ["epub", "mobi"] }
    }
  ]
}
```

规则从上到下执行，第一个启用且匹配的规则生效。同一规则中的不同条件使用 AND 组合；`extensions` 或 `nameGlobs` 内部的多个值使用 OR 组合。扩展名以及有边界的 `*`、`?` 文件名 glob 不区分大小写。Glob 不会匹配路径分隔符；任意正则表达式、递归 `**` 和脚本会被拒绝。目标位置必须是一个可见的文件夹名称，不能包含路径分隔符。

版本 1 的纯扩展名规则仍然受支持。编辑器读取旧文件时不会丢失规则，只有明确保存后才会写入规范化的版本 2。完整兼容行为见 [v1 到 v2 迁移说明](docs/rules-v2.md)。

工作区会监控 `.inboxfs.json`。保存目标后，预览会立即刷新，旧建议 ID 同时失效，因此过期的整理计划无法在规则变化后静默移动文件。

## 本地 AI 预览

本地 AI 复核是可选功能，默认关闭。安装并运行 [Ollama](https://ollama.com/)，拉取本地模型，然后在 InboxFS 中选择 **Local AI**。选择模型，填写至少两个允许的目标名称，再启用功能。InboxFS 始终先执行确定性规则。你可以复核剩余的未匹配文件，也可以切换到 **Selected**，明确复核工作区中当前选中的文件。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/inboxfs-ai-dark.png">
  <img alt="InboxFS 可选择、可修正的本地 AI 文件建议" src="docs/inboxfs-ai.png">
</picture>

默认情况下，模型只接收文件名、扩展名、大小和修改时间。读取受支持的纯文本、PDF 和 DOCX 需要单独选择开启。源文件最大 16 MiB，提取文本最大 32 KiB；PDF 最多读取前 8 页，DOCX 只读取有边界限制的主文档 XML。结果不会直接移动文件。你可以检查并修正每个目标，再把选中的结果加入普通整理计划。**Create rule** 可以把有用结果转成按精确文件名匹配的确定性规则。

InboxFS 只访问固定的 Ollama 地址 `http://127.0.0.1:11434`，拒绝重定向和带有云端标记的模型，并把私有设置及只含结果的缓存保存在 `~/.inboxfs/`。界面和设置文件都不能配置其他端点。本地安装的模型仍可能给出错误结果，用户创建的 Ollama 别名也无法从密码学上证明没有远程行为。启用文本访问前，请阅读[本地 AI 隐私、评测与威胁模型](docs/local-ai.md)。

## 暂不支持

InboxFS 不执行 OCR，不提取图片或扫描版 PDF 中的文字，不解析旧版 `.doc`，不上传内容，不执行脚本，不监控子文件夹，也不会自动学习规则。本地 AI 只支持元数据，以及可选且有严格边界的纯文本、PDF 和 DOCX 提取；只有你明确把结果加入计划后，它才会影响整理操作。

撤销历史以私有 JSON 文件保存在 `~/.inboxfs/`。从 0.2 版本开始，匹配的 v0.1 历史会自动迁移到按目录隔离且不易冲突的记录文件。InboxFS 是整理工具，不是备份系统。

## 开发

```bash
git clone https://github.com/YanhanLi/inboxfs.git
cd inboxfs
npm install
npx playwright install chromium
npm run check
npm run dev -- /path/to/a/test-folder --no-open
```

`npm run check` 会构建 Node 服务和 React 界面，运行文件系统及 HTTP 安全测试，测试 100 条规则、针对 10,000 条文件记录的本地 AI 元数据准备和有边界的 PDF/DOCX 提取性能，执行主 JavaScript 包 67.12 kB gzip 上限，并在 Chromium 中覆盖关键桌面及移动端流程。浏览器测试还检查 WCAG 2 AA 可访问性规则和异步代码块恢复能力。

## 安全模型

InboxFS 绑定到回环地址，不提供云端服务。服务器拒绝非回环 Host 请求头和跨源写操作。所有写操作串行执行，只接受最新扫描产生的 ID，并在移动前重新扫描，防止并发写入或过期预览静默生效。收件箱根目录和目标目录在使用前都会规范化，因此历史、扫描和写操作共享同一个目录身份；符号链接逃逸、已变化的撤销目标和已占用的恢复路径都会被拒绝。

重复文件检测会先按大小分组，只对大小相同的候选文件计算哈希，避免读取明显唯一的文件。重复项只会暂缓选择，不会被删除，最终控制权仍在用户手中。

请按照 [SECURITY.md](SECURITY.md) 中的方式私下报告安全问题。

## 许可证

[MIT](LICENSE)
