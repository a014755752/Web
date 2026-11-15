# 校园社团活动复盘助手

全国高校 AI Web 开发挑战赛 · AI 数据分析与可视化方向。面向社团负责人，支持渠道到场分析、规则检索、签到截图补录、计算依据查看和条件试算。内置数据及规则均为模拟资料。

## 运行

需要 Node.js 22+。

```sh
npm ci
npm run dev
```

访问 http://localhost:3000。将 `.env.example` 复制为 `.env.local`，填写服务端 `MODEL_API_KEY`。模型地址须与密钥地域匹配。也可配置其他兼容 Chat Completions 和 Embeddings 协议的模型服务，文本模型须支持 Function Calling。模型未配置时，工作台提供本地统计、规则查看与手动补录。

```sh
docker build -t campus-review .
docker run --rm -p 127.0.0.1:3000:3000 --env-file .env.local campus-review
```

体验本地统计时，可以省略 `--env-file .env.local`。

## 演示

打开答辩样例，点击「比较渠道表现」，定位 A02 的签到缺口。载入示例截图核对 6 人并确认。当前口径下公众号为 52%，试算门槛改为 5 人后海报为 37.5%。当前会话的更改可在「数据管理」下载为 CSV，「导出简报」可通过浏览器保存 PDF。

验证规则差异时，载入秋季活动样例并筛选 2026-09-06 的招新活动。关闭规则检索时优先复盘海报，开启后按 30 人门槛优先复盘社群邀请。

## 架构

Next.js、TypeScript、Recharts 和 Papa Parse。`/api/analyze` 用 AI SDK 调用规则检索、统计和明细工具，流式返回步骤及结果。规则按适用类型及版本筛选，向量不可用时采用关键词检索。`/api/attendance/scan` 读取截图字段，用户确认后回填。Zod 校验导入和模型结果，图表与工具共用统计函数。

参考 [AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)、[CSV AI Analyzer](https://github.com/maxgfr/csv-ai-analyzer) 和 [Receipt Scanner](https://github.com/sarmakska/receipt-scanner)。

## 团队

参赛队员与指导教师按报名信息填写。
