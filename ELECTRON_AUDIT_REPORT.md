# Electron App Audit Report

**Generated:** 2025-11-07T22:44:27.761Z

**Summary:** 2/4 pages passed validation

---

## Overall Status

- Docker Containers: ✅ Running
- API Server: ✅ Healthy
- Data Bus: ✅ Connected

## Page Audit Results

### ✅ PASS - Home

**URL:** http://localhost:8080/

**Screenshot:** [audit-screenshots/home.png](audit-screenshots/home.png)

**Elements Found:**
- ✓ Market Status
- ✗ System Health

**Data Flow Status:**
- Has Errors: ✅ No
- Disconnected: ✅ No
- Still Loading: ✅ No

---

### ❌ FAIL - Trading

**URL:** http://localhost:8080/trading

**Screenshot:** [audit-screenshots/trading.png](audit-screenshots/trading.png)

**Elements Found:**
- ✗ SPY
- ✗ Chart
- ✗ Live Data

**Data Flow Status:**
- Has Errors: ✅ No
- Disconnected: ✅ No
- Still Loading: ✅ No

**Console Errors:**
```
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 674C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 675C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 673C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 676C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 672.5C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 672C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 677C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 671C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 678C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 670C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 674C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 675C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 673C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 676C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 672.5C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 672C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 677C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 671C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 678C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 670C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 674C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 675C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 673C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 676C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 672.5C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 672C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 677C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 671C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 678C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 670C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 674C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 675C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 673C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 676C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 672.5C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 672C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 677C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 671C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 678C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
Warning: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.%s 670C 
    at div
    at div
    at div
    at _c (http://localhost:8080/src/components/ui/card.tsx:23:53)
    at div
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Presence (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:193:11)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:393:13
    at _c4 (http://localhost:8080/src/components/ui/tabs.tsx:61:61)
    at div
    at http://localhost:8080/node_modules/.vite/deps/chunk-PBNCKGTQ.js?v=ae904828:43:13
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tabs.js?v=32baa8ab:270:7
    at div
    at div
    at Trading (http://localhost:8080/src/pages/Trading.tsx?t=1762555427851:38:23)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at div
    at div
    at div
    at Layout (http://localhost:8080/src/components/Layout.tsx:26:19)
    at ProtectedRoute (http://localhost:8080/src/components/ProtectedRoute.tsx:22:34)
    at RenderedRoute (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4088:5)
    at Routes (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4558:5)
    at Router (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:4501:15)
    at BrowserRouter (http://localhost:8080/node_modules/.vite/deps/react-router-dom.js?v=d77f5776:5247:5)
    at Provider (http://localhost:8080/node_modules/.vite/deps/chunk-6D2G6DFF.js?v=ae904828:35:15)
    at TooltipProvider (http://localhost:8080/node_modules/.vite/deps/@radix-ui_react-tooltip.js?v=f040b928:2268:5)
    at QueryClientProvider (http://localhost:8080/node_modules/.vite/deps/@tanstack_react-query.js?v=1780aaa8:2934:3)
    at App
```

---

### ✅ PASS - Backtesting

**URL:** http://localhost:8080/backtesting

**Screenshot:** [audit-screenshots/backtesting.png](audit-screenshots/backtesting.png)

**Elements Found:**
- ✗ Backtest
- ✓ Strategy

**Data Flow Status:**
- Has Errors: ✅ No
- Disconnected: ✅ No
- Still Loading: ✅ No

---

### ❌ FAIL - Diagnostics

**URL:** http://localhost:8080/diagnostics

**Screenshot:** [audit-screenshots/diagnostics.png](audit-screenshots/diagnostics.png)

**Elements Found:**
- ✗ Data Bus
- ✗ Docker

**Data Flow Status:**
- Has Errors: ✅ No
- Disconnected: ✅ No
- Still Loading: ✅ No

---

## Recommendations

The following pages need attention:

- **Trading**: Check screenshot for issues
- **Diagnostics**: Check screenshot for issues
