---
Task ID: 1
Agent: main
Task: 在选股页面增加子菜单实现历史选股验证功能

Work Log:
- 添加 ScreenerHistoryRecord 模型到 Prisma Schema，包含1日/3日/5日验证字段
- 运行 db:push 同步数据库
- 重写 screener-history API，支持多日验证（1日/3日/5日后续涨幅）
- 更新 ScreenerHistoryPanel 组件，展示多日验证结果和5日走强率
- 在 page.tsx 中添加选股页面子菜单（选股结果/历史验证）
- 在 screener-shared.ts 中添加 saveScreenerResults 和 useAutoSaveScreener
- 为5个选股组件集成 useAutoSaveScreener 自动保存钩子
- Lint 通过，dev server 正常运行

Stage Summary:
- 新增 Prisma 模型 ScreenerHistoryRecord（含 screenerType, day3/5 验证字段）
- 验证 API 增强：计算1日/3日/5日后续涨幅，使用次日开盘价作为入场价
- 选股页面增加子菜单切换：选股结果 ↔ 历史验证
- 5个选股组件（智能选股/分时选股/早盘选股/低开选股/涨停分析）自动保存结果
- 历史验证面板展示：次日胜率、3日均幅、5日均幅、5日走强率
