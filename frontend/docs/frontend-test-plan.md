# Frontend Test Plan

1. Login with code `1234`.
2. Overview loads.
3. Store loads.
4. Portfolio loads.
5. Trading loads.
6. Market Data loads.
7. Selecting a stock updates stock profile.
8. Company News shows selected stock only.
9. Company News cards open popup.
10. Popup closes with Close button.
11. Popup closes with Escape.
12. Refresh button works.
13. Logout works.
14. No console errors.
15. Root `app.js` still points to the current Cloudflare Worker.
16. No Supabase dependency exists.
17. Root `index.html` script tags were not removed.
18. No active root runtime files were deleted.
19. `frontend/` folder exists.
20. Copied runtime files exist under `frontend/src/legacy/runtime-copies/`.
21. Shadow loader can load Store modules with all feature flags false.
22. `window.compareLegacyAndFrontendStore()` returns a safe comparison without UI changes.
23. Shadow loader can load Inventory and item-use modules with all feature flags false.
24. `window.compareLegacyAndFrontendInventory()` returns a safe comparison without UI changes.
25. Shadow loader can load Dashboard modules with all feature flags false.
26. `window.compareLegacyAndFrontendDashboard()` returns a safe comparison without UI changes.
27. Shadow loader can load Profile modules with all feature flags false.
28. `window.compareLegacyAndFrontendProfile()` returns a safe comparison without UI changes.
29. Shadow loader can load Auth/Login modules with all feature flags false.
30. `window.compareLegacyAndFrontendAuth()` returns a safe comparison without UI changes, login requests, or access-code logging.
31. Root `index.html` loads `frontend/src/legacy/frontend-runtime-loader.js` only after existing legacy runtime scripts.
32. With all feature flags false, `window.EconovariaFrontend.runtime.getStatus()` shows every feature disabled and no frontend bridge patches active.
33. Legacy behavior remains active by default when the frontend runtime loader is present and all flags are false.
34. With only `useFrontendMarketNewsModule` true, `window.EconovariaFrontend.runtime.marketNews` reports loaded and patched.
35. With only Market News wired, Company News remains selected-ticker-only, shows the latest five selected ticker reports, opens the popup, closes by button and Escape, and does not duplicate cards or modals.
