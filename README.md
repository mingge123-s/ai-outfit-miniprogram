# AI 穿搭生成小程序

上传上衣、裤子、鞋子、帽子等单品图片（可选上传模特全身照），调用生图模型 API 生成一张模特完整穿搭效果图。

UI 由 [Google Stitch](https://stitch.withgoogle.com) 生成设计稿后转写为原生微信小程序页面；生图逻辑参考 [gemini-ai-tryon](https://github.com/oyeolamilekan/gemini-ai-tryon)。

## 设计稿

| 首页 | 结果页 |
| --- | --- |
| ![首页设计](docs/design-index.png) | ![结果页设计](docs/design-result.png) |

## 目录结构

```
miniprogram/           # 微信小程序（原生）
  pages/index/         # 首页：上传单品 + 模特照片 + 背景风格 + 生成
  pages/result/        # 结果页：效果图 + 单品列表 + 保存到相册 + 重新生成
  config.js            # 后端 API 地址配置
server/                # Node.js (Express) 后端，调用生图模型 API
docs/                  # Stitch 生成的设计稿
```

## 运行后端

```bash
cd server
npm install
cp .env.example .env   # 填入 OPENAI_API_KEY（OpenAI 兼容网关）或 GEMINI_API_KEY
npm start              # 默认 http://localhost:3000
```

后端接口 `POST /api/tryon`，JSON body：

```json
{
  "items": {
    "top":   { "data": "<base64>", "mimeType": "image/jpeg" },
    "pants": { "data": "<base64>", "mimeType": "image/jpeg" },
    "shoes": { "data": "<base64>", "mimeType": "image/jpeg" },
    "hat":   { "data": "<base64>", "mimeType": "image/jpeg" }
  },
  "personImage": { "data": "<base64>", "mimeType": "image/jpeg" },
  "backgroundStyle": "street | studio | outdoor"
}
```

所有单品均为可选，但至少需要一件；`personImage` 可选（不传则生成 AI 模特）。返回 `{ "image": "data:image/png;base64,...", "description": "..." }`。

支持两种生图提供方（由 `.env` 自动选择）：

- **OpenAI 兼容网关**（如 `https://ai.gs88.shop`）：配置 `OPENAI_API_KEY` + `OPENAI_BASE_URL`，走 `/v1/images/edits` 多图编辑接口，默认模型 `gpt-image-2`。Cloudflare 网关下高质量档易 524 超时，默认 `IMAGE_QUALITY=low`。
- **Google Gemini**：配置 `GEMINI_API_KEY`，默认模型 `gemini-2.5-flash-image-preview`。

## 运行小程序

1. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)导入本项目根目录（已含 `project.config.json`）。
2. 本地调试：详情 → 本地设置 → 勾选「不校验合法域名」（因为默认后端是 `http://localhost:3000`）。
3. 上线前：把后端部署到 HTTPS 域名，修改 `miniprogram/config.js` 中的 `API_BASE_URL`，并在小程序后台把该域名加入 request 合法域名。

## 使用流程

1. 首页可选上传模特全身照（不传则由 AI 生成模特）。
2. 上传至少一件单品（上衣/裤子/鞋子/帽子）。
3. 选择背景风格（街拍/影棚/户外），点击「生成穿搭」。
4. 结果页查看效果图，可保存到相册或重新生成。
