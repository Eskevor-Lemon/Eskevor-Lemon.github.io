# 术语簿 · Term Library

Sites 托管的术语库：公开浏览、四字段全文搜索、Excel 导出；管理密码保护新增、修改、删除。

站点：https://lemon-term-library.spectacularloach1.chatgpt.site

## 服务端配置（启用编辑前必须完成）

在 Sites 的本项目服务端环境变量设置中添加以下三个 **Secret**，不要写入 Git、网页、聊天或普通配置文件：

| 名称 | 值 |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | 在可信电脑运行 `node scripts/create-secrets.mjs`，交互输入至少 16 位管理密码，复制生成的哈希值 |
| `SESSION_SECRET` | 上述命令生成的独立随机密钥 |
| `GITHUB_TOKEN` | GitHub fine-grained personal access token，仅选择 `Eskevor-Lemon/Eskevor-Lemon.github.io`，授予 Contents: Read and write |

配置后重新部署当前 Sites 版本使变量生效。令牌必须获仓库批准，且 main 分支规则允许令牌主体直接提交。令牌过期后需更新并重新部署。应用不会向浏览器返回秘密值；没有完整配置时编辑入口会提示未启用。密码采用 PBKDF2-SHA256、100000 次迭代和随机盐；会话使用签名 HttpOnly / Secure / SameSite=Strict Cookie，8 小时有效。修改密码哈希或会话密钥会使旧会话失效。退出登录会清除浏览器 Cookie。

应用做了同源校验、请求尺寸和字段校验，并对每个 Worker 实例中的 IP 做每 15 分钟 5 次登录尝试限制。该限流是实例内最佳努力限制，不能替代平台的分布式 WAF 限流；请使用高强度密码。全站通过 HTTPS 访问。

## 数据与提交历史

唯一数据源为 GitHub `main` 分支的 `data/terms.json`。每次新增、修改、删除通过服务端 GitHub Contents API 原子提交一次；只有 GitHub 确认成功才返回保存成功。页面提交所读的文件 SHA，过期 SHA 返回冲突并保留用户输入，不会静默覆盖。网络超时时会提示刷新核对，不自动重试写入。读取失败不会伪装成空数据库。

数据格式：`{"version":1,"terms":[{"id":"UUID","name":"专有名词","definition":"解释","english":"英文","abbreviation":"缩写","updatedAt":"ISO 时间"}]}`。

首次部署可从空库开始，文件不存在时核实分支存在后返回空库，首次保存创建文件。最多 5000 条，JSON 最大 700KB。搜索覆盖全部四字段，支持中文、大小写不敏感、全半角归一化和空格分隔的多关键词。

访客可以导出全部或搜索结果（包含匹配的全部页面），生成真正 `.xlsx`，四列为专有名词、解释、英文、缩写，保留中文；公式样式文本以字符串写入，不执行公式。

## 开发与部署

Node.js 22+：`npm ci`、`npm test`、`npm run build`。

源码 `src/worker.mjs` 输出 Cloudflare Worker ESM 至 `dist/server/index.js`，静态 HTML/CSS/JS 内嵌，凭证仅从 Worker env 读取。`.openai/hosting.json` 保存 Sites 项目标识；不要配置 static 字段。Sites 工具负责发布归档和运行环境。当前环境未提供 Sites starter / workflow helper，因此使用平台文档允许的 Worker fetch 入口并手动构建、Git 同步及归档。

原仓库根目录 `index.html` 将 GitHub Pages 访问者引导到 Sites。旧个人主页资源已删除，旧内容仍保留在 Git 历史中。

测试：未登录/伪造/过期会话、同源请求、配置缺失、CRUD、SHA 冲突、GitHub 编码与失败、输入校验、中文搜索、XLSX 往返读取和公式文本安全。真实 GitHub 写入需配置服务端令牌后验证；不得用测试假令牌部署生产。
