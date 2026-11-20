# ASTRUM · 天文多智能体工作台

一个纯静态的天文问答网页。星历在本机复算，事实条目带来源与核验日期，联网检索多源取证并标注证据强弱。

**无需安装、无需后端、无需 API Key 即可使用**（云端模型与联网检索均为可选项）。

## 能做什么

| 能力 | 说明 |
|---|---|
| 星历复算 | 坐标、升落、中天、可见窗口全部本地计算，数值可复现 |
| 知识问答 | 天文条目带来源、共识等级与核验日期 |
| 联网检索 | OpenAlex / NASA / 维基百科 / Semantic Scholar 多源聚合 |
| 证据分级 | 标注「可溯源 / 待核验」，跨源分歧并列呈现 |
| 附件解析 | 图片、文本、FITS 头信息；解出坐标可直接定位星图 |
| 实时星图 | 9,096 颗实测星表、LOD 分级、通量亮度与 B−V 颜色 |
| 可选模型 | 本地内核 / Chrome 内置 AI / Ollama / 多家云端 API |

## 快速开始

```bash
# 直接双击 index.html，或起一个静态服务
python -m http.server 8080
# 打开 http://localhost:8080
```

## 数据与模型（可选）

- **本地内核**（默认）：离线，不调用任何模型。
- **本地模型**：Ollama / LM Studio / vLLM，端点填入设置即可，密钥留空。
- **云端模型**：OpenAI / Anthropic / Gemini / DeepSeek 等，需自备 Key；Key 只存浏览器 `localStorage`。

> 模型只负责表述层，不会改变星历数值与知识库事实。

## 隐私

- 没有后端，不收集、不上传任何数据。
- 附件只在本机解析；仅选择云端模型时，摘要或图片才会随请求发出。
- 页面声明 `referrer: no-referrer`。

## 目录结构

```
index.html        入口
core/             计算、智能体、检索、渲染与界面
data/             知识库、星表、城市库、实测数据
tools/            构建脚本与测试
docs/             设计、审计与交付文档
```

生成单文件版：

```bash
node tools/build-standalone.js
```

## 开发与测试

```bash
node tools/selftest.js            # 全功能回归
node tools/research-test.js       # 检索与证据链路（离线）
node tools/visual-stars-test.js   # 星图视觉
node tools/build-star-data.js --help
```

修改 `index.html` 内联脚本后需运行 `node tools/sync-csp-hash.js`，否则 CSP 会拦截。

## 已知限制

- Semantic Scholar 匿名调用有共享限流，429 属常见，链路会自动降级。
- FITS 仅解析头信息，不做像素拉伸、伪彩或测光。
- PDF 解析文本层，扫描件无 OCR；DOCX 暂不支持。
- 实时云量、空间天气等外部数据未接入。

## 许可

本项目采用 [MIT License](LICENSE)。你可以自由使用、修改与分发，保留版权与许可声明即可。
