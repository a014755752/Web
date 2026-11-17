# 校园社团活动复盘助手

全国高校 AI Web 开发挑战赛 · AI 数据分析与可视化方向。面向社团负责人，支持渠道到场分析、规则检索、签到截图补录、计算依据查看和条件试算。内置数据及规则均为模拟资料。

## 运行

需要 Node.js 22+。

先复制 `.env.example` 为 `.env.local`，设置 `ACCESS_PASSWORD`（至少 8 位）和 `ACCESS_SESSION_SECRET`（至少 32 位随机字符）。未配置时工作台和 API 均拒绝访问。登录后签名会话 Cookie 有效 8 小时，支持退出访问；更改密码或签名密钥会使已有会话失效。所有业务 API 都检查会话，密码仅在登录时发送至服务端，不保存在浏览器存储中。公网部署使用 HTTPS。

```sh
npm ci
npm run dev
```

访问 http://localhost:3000。将 `.env.example` 复制为 `.env.local`，填写 `DEEPSEEK_API_KEY`。对话模型默认使用 `deepseek-flash`，网页搜索、抓取和文件识别分别接入 DeepSeek Search、Fetch、OCR 接口。密钥只在服务端使用，不要提交 `.env.local`。用户选择的文件发送至 OCR 接口，识别文字在用户发送消息后提供给对话模型。模型未配置时，可用本地统计和浏览器 OCR。

可选兼容配置为 `MODEL_API_KEY`、`MODEL_BASE_URL`、`MODEL_TEXT`、`MODEL_VISION`、`MODEL_EMBEDDING` 和 `DASHSCOPE_API_KEY`。变量用途见 `.env.example`。

```sh
docker build -t campus-review .
docker run --rm -p 127.0.0.1:3000:3000 --env-file .env.local campus-review
```

仅使用本地统计时可以不配置 AI 密钥，但仍须通过环境变量设置访问密码和会话签名密钥。

## 使用

「活动台账」支持新建活动、查找并补录渠道签到、比较两场活动和追加 CSV。活动详情可打开单场复盘。台账和截图保存在当前浏览器，可导出 CSV 或保存 PDF 简报。

「AI 对话」内部会话栏支持新建、搜索、切换和删除对话。可以用文字新增活动、修改名称/日期/类型、增加渠道或调整报名和实到人数；信息不足时 AI 会一次提出最多 10 个问题，回答后在同一对话继续处理。AI 先读取现有记录并生成变更卡，确认后才写入当前浏览器台账。未提及的字段保留，台账版本冲突时需要重新生成变更。

输入框支持选择、拖入或粘贴附件。支持 PDF、DOC/DOCX、PPT/PPTX 及常见图片，每个文件最多 20 MB，每次最多 3 个文件、48,000 字符识别文字；单文件最多保留 24,000 字符，截断或识别不完整时会标注。可展开核对识别文字，再要求 AI 提取、导入或补录。开启「联网」后，AI 按需搜索或阅读网页，并展示真实来源链接。工具调用可展开查看参数、结果和耗时。

「可视化大屏」使用当前数据与筛选条件，可打开流向、散点和热力图对应的记录。[ECharts 桑基图](https://github.com/apache/echarts-examples/blob/gh-pages/public/examples/ts/sankey-simple.ts)、[散点图](https://github.com/apache/echarts-examples/blob/gh-pages/public/examples/ts/scatter-simple.ts)、[热力图](https://github.com/apache/echarts-examples/blob/gh-pages/public/examples/ts/heatmap-cartesian.ts)

## 架构

Next.js、TypeScript、Recharts、Apache ECharts、Papa Parse 和 IndexedDB。`/api/analyze` 流式返回对话、规则检索、台账查询、网页检索和变更准备的执行进度。规则先按类型和版本筛选，DeepSeek Flash 再从候选资料里做语义匹配，失败时用关键词。`/api/documents/ocr` 用 multipart 表单提交文件，处理 HTTP 200 内的错误对象及识别不完整标记；`/api/attendance/scan` 在 OCR 文字基础上提取签到字段。新增、修改都经过共享字段校验和写入前版本检查，网页及文件中的文字不作为工具执行指令。

参考 [DeepSeek 图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision/)、[AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)、[CSV AI Analyzer](https://github.com/maxgfr/csv-ai-analyzer)、[Receipt Scanner](https://github.com/sarmakska/receipt-scanner) 和 [Tesseract.js](https://github.com/naptha/tesseract.js)。

## 技术栈

Next.js 16、React 19、TypeScript、AI SDK、DeepSeek API、Recharts、Apache ECharts、Papa Parse、IndexedDB、Docker。

## 检查

```sh
npm run typecheck
npm run build
node scripts/check-access.mjs
```

## 技术文档

- [技术文档 PDF](docs/校园社团活动复盘助手技术文档.pdf)
- [可编辑 Word 文档](docs/校园社团活动复盘助手技术文档.docx)

## 团队

| 项目 | 信息 |
| --- | --- |
| 学校 | 岭南师范学院 |
| 参赛队员 | 范世博 陈俊良 曾思源 |
| 指导教师 | 邓海波 |

