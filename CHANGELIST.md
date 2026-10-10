# 变更清单

## 已完成

- [x] 管理鉴权迁到 Cloudflare Functions（客户端不再存 GitHub Token）
- [x] 大文件上传走 Git Data API
- [x] 短链 `/go/{shortcode}`（外壳 + iframe / 可选 302）
- [x] 重写 README，对齐当前架构
- [x] 收紧 `/api/ping`，敏感信息仅管理员 `/api/health`
- [x] Club Sim 重复条目去重 + 短码唯一校验
- [x] CORS 收紧 + 登录失败限速
- [x] 搜索/筛选下编辑索引修复、空状态区分、列表数量、标题可点、复制短链
- [x] 详情「回归档」顶栏（go 外壳）
- [x] 管理员健康检查按钮

## 待办

- [ ] 上传失败时自动清理已写入的孤儿 HTML（半自动：健康检查可见）
- [ ] Session 持久化（KV / Durable Object），避免实例回收强制重登
- [ ] 列表分页 / 虚拟列表（条目继续增长时）
- [ ] 索引字段增加原文 URL，顶栏可链回原文
