# 即梦生图 API 接口文档

OpenAI 兼容网关。客户端只需配置三项：

| 项 | 值 |
|---|---|
| Base URL | `https://jimeng.mingge.asia/v1` |
| 模型 | `jimeng-4.0` |
| API Key | 管理后台发放的 `sk-jimeng-...` |

兼容入口（同一套服务，任选其一）：

| 用途 | 地址 |
|---|---|
| 推荐（标准 443） | `https://jimeng.mingge.asia/v1` |
| 旧 HTTPS 端口 | `https://jimeng.mingge.asia:8443/v1` |
| IP + HTTPS | `https://111.228.14.193:8443/v1`（证书可能需忽略校验） |
| 备用 HTTP | `http://jimeng.mingge.asia/v1` |
| 直连网关 | `http://111.228.14.193:3003/v1` |

不要用 `https://111.228.14.193/v1`（443 打到别的服务）。

文生图完整路径：`https://jimeng.mingge.asia/v1/images/generations`  
图生图完整路径：`https://jimeng.mingge.asia/v1/images/edits`

超时建议 **180～300 秒**。上游单张大约 15～30 秒，排队时更长。nginx 上限约 300 秒。

---

## 1. 鉴权

所有 `/v1/*` 必须带：

```http
Authorization: Bearer sk-jimeng-xxxxxxxx
```

不要把 Key 写进 URL 或日志。Key 填错、禁用或过期返回 `401 invalid_api_key`。

`GET /healthz` 无需 Key。

---

## 2. 模型与画质

当前线上只开放：

| 模型 ID | 说明 |
|---|---|
| `jimeng-4.0` | 即梦图片 4.0，文生图 / 图生图（最多 4 张参考图） |

画质只有 **1K / 2K**，没有 4K：

- 宽和高都 **&lt; 1440** → 1K
- 宽或高 **≥ 1440** → 2K

`size` 只改构图宽高，不会变成 4K。`5000x5000` 这类超大尺寸通常会失败或被压回 2K。

`size` 格式：`宽x高`，宽高各 3～4 位数字（正则 `^\d{3,4}x\d{3,4}$`）。默认 `2048x2048`。

| size | 效果 |
|---|---|
| `1024x1024` | 1K 方图 |
| `2048x2048` | 2K 方图（推荐） |
| `1024x1536` | 1K 竖图 |
| `1536x1024` | 1K 横图 |
| `2000x3000` | 2K 竖图（即梦原生竖图尺寸） |

单次 `n` 为 **1～4** 张。

---

## 3. 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/healthz` | 健康检查，无需 Key |
| `GET` | `/v1/models` | 可用模型列表 |
| `POST` | `/v1/images/generations` | 文生图；JSON 里带 `image` 也可图生图 |
| `POST` | `/v1/images/edits` | 标准图生图（推荐上传文件） |
| `POST` | `/v1/chat/completions` | 聊天式出图（Cherry Studio / OpenWebUI） |

管理后台 `/admin` 不是调用方接口，本文不展开。

---

## 4. 健康检查

`GET /healthz`

无需鉴权。进程正常时返回 JSON（含 `ok` 一类字段）。用来探活，不要用它当生图探测（聊天接口里的 `hi` / `test` / `检测` 才是免扣积分探测）。

---

## 5. 模型列表

`GET /v1/models`

```bash
curl -s 'https://jimeng.mingge.asia/v1/models' \
  -H 'Authorization: Bearer sk-jimeng-xxxxxxxx'
```

返回 OpenAI 风格列表，当前 `data[].id` 只有 `jimeng-4.0`。

---

## 6. 文生图

`POST /v1/images/generations`

`Content-Type: application/json`

### 请求字段

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `prompt` | string | 是 | — | 正向提示词。也可在末尾用标签改尺寸/张数，见第 8 节 |
| `model` | string | 否 | `jimeng-4.0` | 请固定这个 |
| `n` | int | 否 | `1` | 生成张数，1～4 |
| `size` | string | 否 | `2048x2048` | `宽x高` |
| `response_format` | string | 否 | `url` | `url` 或 `b64_json` |
| `negative_prompt` | string | 否 | — | 负向提示词 |
| `seed` | number | 否 | 随机 | 随机种子 |
| `image` | string / string[] | 否 | — | 参考图 URL / base64 / data-URL；传入则走图生图 |
| `sample_strength` | number | 否 | `0.5` | 图生图参考强度，0～1 |

### 成功返回

```json
{
  "created": 1785249166,
  "data": [
    {
      "url": "https://p26-dreamina-sign.byteimg.com/..."
    }
  ]
}
```

`response_format=b64_json` 时，`data[]` 为 `{ "b64_json": "..." }`。

返回的图片 URL 来自即梦 CDN，**有时效**，请尽快下载保存。

### curl

```bash
curl -X POST 'https://jimeng.mingge.asia/v1/images/generations' \
  -H 'Authorization: Bearer sk-jimeng-xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "jimeng-4.0",
    "prompt": "一只橙色小猫坐在窗台上，柔和光线",
    "n": 1,
    "size": "2048x2048"
  }'
```

### Python（OpenAI SDK）

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://jimeng.mingge.asia/v1",
    api_key="sk-jimeng-xxxxxxxx",
)

resp = client.images.generate(
    model="jimeng-4.0",
    prompt="一只橙色小猫坐在窗台上，柔和光线",
    n=1,
    size="2048x2048",
)
print(resp.data[0].url)
```

### Node.js

```js
const res = await fetch("https://jimeng.mingge.asia/v1/images/generations", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk-jimeng-xxxxxxxx",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "jimeng-4.0",
    prompt: "一只橙色小猫坐在窗台上，柔和光线",
    n: 1,
    size: "2048x2048",
  }),
});
const json = await res.json();
console.log(json.data[0].url);
```

---

## 7. 图生图

### 方式 A：上传文件（推荐）

`POST /v1/images/edits`

`Content-Type: multipart/form-data`

| 字段 | 说明 |
|---|---|
| `image` | 参考图文件，可重复上传 **1～4** 张，单张 **≤ 10 MB** |
| `prompt` | 目标效果描述 |
| `model` | `jimeng-4.0` |
| `n` / `size` / `response_format` | 同文生图 |
| `sample_strength` | 参考强度 0～1，默认 `0.5` |
| `image_url` / `image_b64` | 不方便传文件时用 |

```bash
curl -X POST 'https://jimeng.mingge.asia/v1/images/edits' \
  -H 'Authorization: Bearer sk-jimeng-xxxxxxxx' \
  -F 'model=jimeng-4.0' \
  -F 'prompt=改成日系清新插画风格' \
  -F 'size=2048x2048' \
  -F 'image=@./input.jpg'
```

多张参考图：多次 `-F 'image=@./a.jpg' -F 'image=@./b.jpg'`。

没有参考图返回 `400 missing_image`。

### 方式 B：JSON 带图

仍走 `POST /v1/images/generations`，加上 `image`：

```bash
curl -X POST 'https://jimeng.mingge.asia/v1/images/generations' \
  -H 'Authorization: Bearer sk-jimeng-xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "jimeng-4.0",
    "prompt": "改成水彩风格",
    "size": "2048x2048",
    "image": "https://example.com/ref.jpg"
  }'
```

`image` 也可以是：

- 纯 base64
- `data:image/png;base64,...`
- 字符串数组（多张参考图，最多 4 张）

---

## 8. 提示词标签

`prompt` 末尾可用标签改尺寸和张数（解析后会从正文去掉）。文生图、图生图、聊天出图都认。

| 标签 | 含义 |
|---|---|
| `#2k` / `#2048` | 2048×2048 |
| `#1k` / `#1024` | 1024×1024 |
| `#portrait` / `#竖图` | 1024×1536 |
| `#landscape` / `#横图` | 1536×1024 |
| `#n=2` | 出 2 张（最多 4） |
| `#2000x3000` | 自定义宽高 |

显式传 `size` / `n` 时，以请求字段为准；标签适合聊天客户端不好填 `size` 的场景。

---

## 9. 聊天出图

`POST /v1/chat/completions`

给 Cherry Studio、OpenWebUI、各类「填 Base URL + 模型」的聊天软件用。

用户**最后一条**消息当作提示词；消息里带 `image_url` 则图生图。

```json
{
  "model": "jimeng-4.0",
  "messages": [
    {
      "role": "user",
      "content": "一只橙色小猫坐在窗台上 #2k"
    }
  ]
}
```

带参考图（OpenAI 视觉消息格式）：

```json
{
  "model": "jimeng-4.0",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "改成水彩风格" },
        {
          "type": "image_url",
          "image_url": { "url": "https://example.com/ref.jpg" }
        }
      ]
    }
  ]
}
```

助手回复一般是 Markdown 图片：`![](https://...)`。

下列探测词**不会真生图、不扣积分**：`hi`、`test`、`检测`（以及同类探活短句）。软件测连通请用这些词，不要发完整提示词。

---

## 10. 错误码

统一格式：

```json
{
  "error": {
    "message": "Incorrect API key provided.",
    "type": "invalid_request_error",
    "code": "invalid_api_key",
    "param": null
  }
}
```

| HTTP | code | 含义 | 建议 |
|---|---|---|---|
| 400 | `missing_prompt` | 缺少 prompt | 检查 body |
| 400 | `invalid_size` / `invalid_n` | `size` 或 `n` 不合法 | `size` 用 `2048x2048`；`n` 用 1～4 |
| 400 | `missing_image` | 图生图没传参考图 | 补 `image` 文件或 URL |
| 400 | `content_policy_violation` | 内容违规 | 改提示词 / 换图 |
| 401 | `invalid_api_key` | Key 错误、禁用或过期 | 换有效 Key |
| 401 | `needs_login` | 上游即梦登录态失效 | 等运维刷新 Cookie |
| 402 | `insufficient_quota` | 即梦账号积分不足 | 给上游账号充积分 |
| 429 | `key_queue_full` | **当前这把 Key** 排队已满 | 退避重试，或少开并发 |
| 429 | `queue_full` | 全局队列已满 | 稍后重试 |
| 502 | `upstream_error` | 即梦上游异常 | 重试 |
| 504 | `timeout` | 生图超时 | 不要立刻用同一任务连打 |

客户端应对 **429** 做指数退避。超时后不要马上重发同一批请求，容易把该 Key 队列再次打满。

---

## 11. 并发、队列、积分

- 每把 Key 的并发以管理后台 `maxConcurrent` 为准；**没设时默认 5**。
- 同一把 Key 不要一次丢几十个请求。软件里「10 个接口」如果共用一把 Key，请把该 Key 并发设成 10，并关掉每个接口的预取。
- `key_queue_full` 是**这把 Key 自己的排队上限**，不是全局并发不够。
- 生图扣的是上游即梦账号积分，**不是 Key 余额**。积分不足：`402 insufficient_quota`。
- 底层多把 Cookie / 多个即梦号共用一个池；多把 Key 同时打会抢同一池子。

---

## 12. 对接软件怎么填

表格导入 / 第三方生图软件：

| 字段 | 填写 |
|---|---|
| 完整接口地址 | `https://jimeng.mingge.asia/v1/images/generations` |
| API 密钥 | `sk-jimeng-xxxxxxxx` |
| 模型 | `jimeng-4.0` |
| 超时 | 180～300 秒 |

图生图单独填编辑接口时用：

`https://jimeng.mingge.asia/v1/images/edits`

只填 Base URL 的 OpenAI 兼容客户端用：

`https://jimeng.mingge.asia/v1`
