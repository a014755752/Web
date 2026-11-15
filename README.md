# 校园社团活动复盘助手

全国高校 AI Web 开发挑战赛 · AI 数据分析与可视化方向。面向社团负责人，支持渠道到场分析、规则检索、签到截图补录、计算依据查看和条件试算。内置数据及规则均为模拟资料。

## 运行

需要 Node.js 22+。

```sh
npm ci
npm run dev
```

访问 http://localhost:3000。将 `.env.example` 复制为 `.env.local`，填写 `DEEPSEEK_API_KEY`。文本分析和截图识别默认使用 `deepseek-flash`。云端截图识别会把用户选择的图片发给模型服务。模型未配置时，可用本地统计和浏览器 OCR。

```sh
docker build -t campus-review .
docker run --rm -p 127.0.0.1:3000:3000 --env-file .env.local campus-review
```

体验本地统计时，可以省略 `--env-file .env.local`。

## 使用

「活动台账」支持导入 CSV、筛选待补录记录和上传签到截图。台账和已确认的截图保存在当前浏览器。可导出 CSV，复盘简报可通过浏览器保存 PDF。

「可视化大屏」使用当前数据与筛选条件，可打开流向、散点和热力图对应的记录。[ECharts 桑基图](https://github.com/apache/echarts-examples/blob/gh-pages/public/examples/ts/sankey-simple.ts)、[散点图](https://github.com/apache/echarts-examples/blob/gh-pages/public/examples/ts/scatter-simple.ts)、[热力图](https://github.com/apache/echarts-examples/blob/gh-pages/public/examples/ts/heatmap-cartesian.ts)

## 架构

Next.js、TypeScript、Recharts、Apache ECharts、Papa Parse 和 IndexedDB。`/api/analyze` 流式返回规则检索、统计、明细查询和建议选择的进度。规则先按类型和版本筛选，DeepSeek Flash 再从候选资料里做语义匹配，失败时用关键词。建议引用的分组或记录由统计结果校验。`/api/attendance/scan` 识别截图字段，用户核对后回填，可从图表打开对应记录与原图。

参考 [DeepSeek 图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision/)、[AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)、[CSV AI Analyzer](https://github.com/maxgfr/csv-ai-analyzer)、[Receipt Scanner](https://github.com/sarmakska/receipt-scanner) 和 [Tesseract.js](https://github.com/naptha/tesseract.js)。

## 团队

参赛队员与指导教师按报名信息填写。
