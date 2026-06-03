---
Task ID: 1
Agent: main
Task: Restructure trading-rules-card with sidebar submenu navigation + add all missing content

Work Log:
- Analyzed existing trading-rules-card.tsx (1374 lines, 7 horizontal tabs, 12 numbered sections)
- Identified 6 missing content areas: 差价底线, 市场环境识别, 买点信号, 卖点信号, 标的筛选, 技术指标参数
- Redesigned UI from horizontal tabs to sidebar+content panel layout (like strategy admin panel)
- Organized 18 topics into 7 navigation groups with color-coded categories
- Added all 6 missing content sections with detailed trading rules
- Preserved all existing content and pvMarker real-time highlighting
- Mobile responsive: horizontal scrollable tag bar on small screens
- Lint check passed, dev server running without errors

Stage Summary:
- Rewrote trading-rules-card.tsx with 18 topics in 7 groups
- New sections: 标的筛选, 差价底线, 买点信号, 卖点信号, 行情识别, 技术指标
- Layout: Left sidebar (desktop) / horizontal tags (mobile) + right content panel
- All pvMarker-triggered highlights preserved
- Component exports same props: autoExpanded, pvMarkers

---
Task ID: 2
Agent: main
Task: 实现最佳卖点检测算法并在分时图上显示 (v6.0)

Work Log:
- 分析现有信号系统：买点有4个核心因子(factor_41, 41_5, 42, 43)，卖点只有1个(factor_44)，严重不对称
- 设计3个对称核心卖点因子：
  1. factor_45: 放量上涨卖点 — 对称于factor_41(放量下跌买点)，评分制7条件
  2. factor_45_5: 缩量滞涨 — 对称于factor_41_5(缩量止跌)，3条件+2补充条件
  3. factor_44: 次高点放量卖出 — 已存在，对称于factor_43(次低点缩量买入)
- 在t-strategy.ts中实现factor_45（评分制7条件：MACD红柱缩短+放量+近顶+冲高回落+倒V顶+上涨减速+迷你倒V顶）
- 在t-strategy.ts中实现factor_45_5（缩量+涨幅收窄+近顶条件）
- 更新chart-shared.ts：添加6个新条件定义(macd_pos_near_peak, vol_expand_sell, price_near_highest, second_high_point, vol_expand_at_second_high, rising_deceleration, vol_shrink_rise) + 2个BUILT_IN_CUSTOM_FACTORS(factor_45, factor_45_5)
- 更新time-sharing-panel.tsx：isKeySellSignal扩展包含"放量上涨卖点"和"缩量滞涨"
- 更新page.tsx版本号v5.9→v6.0
- Lint检查通过，Agent Browser验证卖点信号正确渲染

Stage Summary:
- 新增factor_45(放量上涨卖点,medium)和factor_45_5(缩量滞涨,medium)两个核心卖点因子
- 卖点信号体系从1个核心因子扩展到3个，与买点对称
- 卖点在分时图上显示为绿色倒三角+"卖"标签，核心卖点获得更大标记和发光效果
- 版本更新至v6.0
