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
