# 微信对话生成器（纯本地版）

在线地址：<https://vvdevpro.github.io/wechat-vv/>

一个纯本地运行的微信对话截图生成工具。对话解析、头像处理和图片生成全部在浏览器中完成，不向任何服务器发送请求，也没有账号、额度或导出次数限制。

## 功能

- **聊天生成器**：支持文字、图片、语音、红包、转账、时间节点等消息类型，可导出标准截图、完整长截图，或直接复制到剪贴板。
- **批量聊天图**：一次导入多组对话，批量生成并打包下载 ZIP。
- **朋友圈生成器**：制作朋友圈图文，可设置发布者、配图、点赞与评论。
- **支付与转账**：生成转账详情页模拟图。
- **红包详情**：生成红包领取详情页模拟图。
- **个人资料 / 群信息**：生成微信个人主页与群聊资料页模拟图。

所有草稿自动保存在当前浏览器（IndexedDB），不会上传。

## 本地运行

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
npm test         # 运行单元测试
```

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS 4，截图使用 html-to-image。

## Docker 部署

仓库已内置 `Dockerfile`（多阶段：Node 构建 → Nginx 托管）、`nginx.conf` 与 `docker-compose.yml`，可直接部署到自己的服务器（Debian / Ubuntu 等）。

### 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. 拉取代码并启动

```bash
git clone https://github.com/vvdevpro/wechat-vv.git
cd wechat-vv
docker compose up -d --build
```

构建完成后访问 `http://服务器IP:9523`。

### 3. 放行 9523 端口

```bash
ufw allow 9523/tcp
```

云服务器还需在控制台的安全组 / 防火墙规则中放行 **9523** 端口。

### 4. 常用运维命令

```bash
docker compose ps                  # 查看容器状态
docker compose logs -f             # 查看日志
docker compose down                # 停止并移除容器
git pull && docker compose up -d --build   # 更新到最新代码
```

### 5. 常见问题

**端口映射说明**：`docker-compose.yml` 中为 `"9523:80"`，即宿主机 9523 端口映射到容器内 Nginx 的 80 端口。只需对外放行 9523，容器内保持不变即可。

**9523 端口被占用**：修改 `docker-compose.yml` 中的端口映射为其他值，如 `"9524:80"`，改用 `http://服务器IP:9524` 访问。可用 `ss -tlnp | grep ':9523'` 排查占用。

**复制到剪贴板不可用**：Clipboard API 仅在安全上下文（HTTPS 或 localhost）下存在。以 `http://服务器IP:9523` 访问时，导出 PNG、长截图与 ZIP 打包均正常，仅"复制"按钮不可用。需要该功能请绑定域名并配置 HTTPS。

**修改端口或路径**：`vite.config.ts` 使用 `base: './'`，资源为相对路径，部署在任意端口或子路径下均可正常运行，无需改配置。

## 使用须知

本工具生成的均为模拟内容，适用于内容创作、产品原型、教学演示与剧情分镜。请勿用于伪造凭证、冒充他人或任何欺骗行为。本工具与微信官方无关联。

## 授权

原项目：[gaopengbin/wechat-dialog-generator](https://github.com/gaopengbin/wechat-dialog-generator)

本项目基于原项目在 MIT 协议下修改，去除了截图次数限制。版权声明见 [LICENSE](./LICENSE)。
