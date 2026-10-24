# ASTRUM 第四轮 · 网页显示异常修复（资源丢失根因与自包含交付）

版本 1.0 · 2026-10-23
适用项目：`astrum/`（纯静态、零依赖、可双击运行）

---

## 一、问题复现与根因定位

用户反馈「网页是这样的，没法看」，附截图。截图中页面的特征：

| 观察点 | 截图表现 | 推断 |
| --- | --- | --- |
| 整体样式 | 完全消失，裸 HTML | 外部 `assets/app.css` 未加载 |
| SVG 图标 | 正常显示（箭头、汉堡） | SVG **内联在 HTML 里**，不受影响 |
| 侧栏「智能体」列表 | **空** | 该列表由 `core/app.js` 动态渲染 → JS 未执行 |
| 「试试这样问」5 个按钮 | 存在 | 这 5 个按钮是 `index.html` 里的**静态 HTML** |
| 知识条目计数 | 「知识 133 条」 | 静态文案 |

**结论：`index.html` 被打开时，所有外部子资源（`assets/app.css`、`data/*.js`、`core/*.js`）全部 404。**

### 1.1 精确复现

把 `index.html` 单独复制到空目录再打开 —— 截图与用户反馈**逐像素一致**：

```bash
cp astrum/index.html /tmp/astrum_iso/
chrome --headless=new --screenshot=repro.png --window-size=1080,700 \
       "file:///.../astrum_iso/index.html"
```

### 1.2 排除项（避免误判）

| 假设 | 验证方式 | 结果 |
| --- | --- | --- |
| CSS 语法错误 | 花括号平衡检查 → depth=0 | 排除 |
| 浏览器不兼容 | Chrome 143 / Edge 143 双浏览器 `file://` 实测 | 均正常，排除 |
| 紧凑模式导致裁切 | 6 视口 × `hasHScroll` 检测 | 全部 `false`，排除 |
| CSP 拦截自身资源 | CSP 违规日志 | 原多文件版 0 违规，排除 |

### 1.3 真正的触发条件

多文件架构的固有脆弱点：**`index.html` 与 `assets/ core/ data/` 必须同目录**。以下任一情况都会导致退化成无样式裸页面：

1. 单独拷贝 `index.html` 发给别人
2. 在只上传单个文件的预览沙箱中打开（如某些在线预览、聊天工具的文件预览）
3. 目录被拆散 / 压缩包只解出部分文件
4. 在 IDE 或编辑器的单文件预览中打开

这是**架构缺陷**，不是偶发 bug —— 必须从交付形态上根治。

---

## 二、修复方案

### 2.1 交付双形态（主）

| 形态 | 文件 | 适用 | 体积 |
| --- | --- | --- | --- |
| **单文件自包含** | `astrum-standalone.html` | 任意位置、任意方式打开 | 752 KB |
| 多文件 | `index.html` + `assets/ core/ data/` | 本地开发、二次修改 | 原始结构 |

单文件版把 CSS 与全部 11 个 JS 模块**内联**进同一个 HTML，天然免疫「目录拆散」类问题。

### 2.2 启动守卫（多文件版兜底）

在 `index.html` 末尾注入一段自诊断脚本：若核心模块（`Astro` / `CATALOG` / `KNOWLEDGE` / `AgentCore` / `Sources` / `SolarView` / `OBSPLAN` / `SOLAR`）任一缺失，则立即显示全屏提示页，指明：

- 缺失了哪些模块
- 原因是什么（目录分离 → 子资源 404）
- 两个修复方案（改用单文件版 / 保持目录完整）

这样同类问题下次会**自我诊断**，而不是静默退化成裸页面。

### 2.3 CSP 处理（不放开安全策略）

内联脚本必须被 CSP 授权。方案：

- **不放宽** `'unsafe-inline'`，改用 `sha256` hash 精确授权每个内联脚本
- 关键陷阱：HTML 解析器会把脚本内容的 **CRLF/CR 归一化为 LF**，hash 必须按归一化后的字节计算，否则浏览器判定失配并**静默拦截**（页面无报错但功能全失）
- `tools/sync-csp-hash.js` 负责同步 `index.html` 的内联脚本 hash
- `tools/build-standalone.js` 负责计算单文件版全部脚本 hash

---

## 三、工具链

| 工具 | 作用 | 用法 |
| --- | --- | --- |
| `tools/build-standalone.js` | 打包单文件自包含版 | `node tools/build-standalone.js` |
| `tools/sync-csp-hash.js` | 同步 `index.html` 内联脚本 CSP hash | `node tools/sync-csp-hash.js` |
| `tools/sync-csp-hash.js --check` | 仅校验不写入（CI） | 同上 |
| `tools/selftest.js` | 零依赖功能回归（20 项断言） | `node tools/selftest.js [file-url]` |

`selftest.js` 的实现要点：把断言脚本注入到目标 HTML 的 `</body>` 前，结果写入 `<pre id="__selftest_result">`，再用 `chrome --dump-dom` 读回。**多文件版必须原地测试**（复制到临时目录会让相对路径失效，那是测试方法问题，不是产品缺陷）。

---

## 四、验证结果

### 4.1 功能回归（20 项断言）

| 版本 | 结果 | CSP 违规 |
| --- | --- | --- |
| 多文件版 `index.html` | **20 / 20** | 0 |
| 单文件版 `astrum-standalone.html` | **20 / 20** | 0 |

覆盖：8 个核心模块就位、知识库 133 条 / 深空 54 条数据量、12 个智能体 / 6 个来源 / 40 项目录动态渲染、Agent 问答链路（6 个结构化章节、179 字正文）、地球日心黄道坐标、月相（age 11.71 / illum 0.898 盈凸月）、太阳系天体信息、观测参数计算、零未捕获异常。

### 4.2 场景回归

| 场景 | 预期 | 实测 |
| --- | --- | --- |
| 单文件版复制到空目录后打开 | 正常渲染 | ✅ 智能体列表、来源列表、星图全部就位 |
| 单文件版 3D 太阳系 | 正常渲染 | ✅ 行星、轨道、土星环、详情卡全部正确 |
| 多文件版 `index.html` 单独拷贝 | 显示守卫提示页 | ✅ 列出 8 个缺失模块 + 两套修复方案 |
| 5 档视口横向滚动 | 无横向滚动 | ✅ `hasHScroll: false`（512/798/1002/1418/1898px 全部相等） |

---

## 五、遗留与边界

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 服务端代理 / 请求签名 / 鉴权 | 范围外 | 需要后端工程，纯静态架构无法承载 |
| CDN 引入 | 明确不做 | 会破坏「零依赖、可离线、可双击」的定位 |
| 自动构建钩子 | 未接入 | 目前需手动运行 `node tools/build-standalone.js` |

---

## 六、使用建议

- **日常使用 / 发给别人** → 用 `astrum-standalone.html`，单文件随便放
- **改代码** → 改 `index.html` / `assets/` / `core/` / `data/`，然后跑：
  ```bash
  node tools/sync-csp-hash.js      # 若改动了 index.html 内的联脚本
  node tools/build-standalone.js   # 重新生成单文件版
  node tools/selftest.js           # 回归验证
  ```
