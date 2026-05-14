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

---
Task ID: 2
Agent: main
Task: 修复选股页面报错（hydration mismatch + TDZ + 属性警告）

Work Log:
- 检查 dev server 日志，发现3个错误：
  1. `ReferenceError: Cannot access 'sortedStocks' before initialization` (TDZ错误)
  2. Hydration mismatch for menu stock buttons (className server vs client不同)
  3. `Received true for a non-boolean attribute ml-1` (JSX属性错误)
- 修复 TDZ 错误：将 stock-screener.tsx 中 useAutoSaveScreener 调用从 sortedStocks 定义前移到定义后
- 修复 TDZ 错误：将 low-open-screener.tsx 中 useAutoSaveScreener 调用从 sortedStocks 定义前移到定义后
- 修复 hydration mismatch：在 page.tsx 添加 mounted 状态，菜单股票按钮在 mounted 前统一使用 ghost variant
- 修复 JSX 属性错误：kline-chart-panel.tsx 中 `ml-1` 被错误地作为 JSX 属性而非 className 内的类名
- Lint 通过，dev server 正常运行

Stage Summary:
- 修复了2个 TDZ (Temporal Dead Zone) 错误：stock-screener.tsx 和 low-open-screener.tsx
- 修复了 hydration mismatch：使用 mounted 状态延迟渲染依赖 localStorage 的 UI
- 修复了 kline-chart-panel.tsx 中的 ml-1 非布尔属性警告
