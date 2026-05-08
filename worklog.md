---
Task ID: 1
Agent: main
Task: Fix dev server crash preventing preview from loading

Work Log:
- Diagnosed that the dev server (both Turbopack and webpack modes) crashes due to memory exhaustion during route compilation
- Tested various approaches: NODE_OPTIONS memory limits, webpack vs turbopack, production build vs dev mode
- Discovered that production build (`next start`) is stable at ~86-95MB RSS while dev server uses 1.2-1.5GB+
- Found that warming up routes gradually (1-second pauses between each) prevents the production server from being killed
- Updated next.config.ts to remove `output: "standalone"` which was causing compatibility issues
- Created start-dev.sh script that builds (if needed), starts production server, and warms up all routes
- Updated package.json dev script to use ./start-dev.sh
- All API routes now return HTTP 200 and server remains stable

Stage Summary:
- Root cause: Next.js Turbopack/webpack dev server compilation uses too much memory (~1.2-1.5GB), causing process to be killed
- Fix: Use production build with route warmup instead of dev server
- Server stable at ~86MB RSS in production mode
- All 15 API routes + page route working correctly
- 429 errors from external finance API are rate limiting, not server crashes

---
Task ID: 2
Agent: main
Task: Fix weak signal display on timeline chart - ensure signal strength rules are properly enforced

Work Log:
- Analyzed user complaint: MACD金叉 downgraded to "weak" still showed labels on timeline chart
- Found root cause: signal merge logic (Step 2) upgraded weak signals to higher strength when merged with nearby medium/strong signals of same direction
- Fixed merge logic: weak signals now independently enter the merged list, never participate in group merging, always render as gray dots
- Updated latestTimelineSignal in page.tsx to skip weak signals for the info bar badge
- Updated lastSignal in time-sharing-panel.tsx to skip weak signals for the bottom info badge
- Final display rules: Strong=triangle+label, Medium=colored dot+badge, Weak=gray small dot only
- Rebuilt production server and verified HTTP 200 response

Stage Summary:
- Key fix: weak signals no longer get "upgraded" via merge logic
- Weak signals always render independently as small gray dots on the chart
- Info bar badges only show medium/strong signals
- Server rebuilt and running successfully
