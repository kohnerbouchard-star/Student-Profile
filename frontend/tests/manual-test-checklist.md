# Manual Test Checklist

## App Smoke Test

- [ ] Login with code `1234`.
- [ ] Overview loads.
- [ ] Store loads.
- [ ] Portfolio loads.
- [ ] Trading loads.
- [ ] Market Data loads.
- [ ] Selecting a stock updates stock profile.
- [ ] Company News shows selected stock only.
- [ ] Company News cards open popup.
- [ ] Popup closes with Close button.
- [ ] Popup closes with Escape.
- [ ] Refresh button works.
- [ ] Logout works.
- [ ] No console errors.
- [ ] Root `app.js` still points to the current Cloudflare Worker.
- [ ] No Supabase dependency exists.
- [ ] Root `index.html` script tags were not removed.
- [ ] No active root runtime files were deleted.
- [ ] `frontend/` folder exists.
- [ ] Copied runtime files exist under `frontend/src/legacy/runtime-copies/`.

## Shadow Module Browser Test

1. Open the app normally.
2. Login with code `1234`.
3. Open DevTools console.
4. Paste:

```js
const s = document.createElement("script");
s.src = "frontend/tests/load-shadow-modules.js";
document.head.appendChild(s);
```

5. Then run:

```js
window.loadEconovariaFrontendShadowModules()
```

6. Then run the compare functions:

```js
window.compareLegacyAndFrontendMarketNews()
window.compareLegacyAndFrontendMarketProfile()
window.compareLegacyAndFrontendApiRetry()
window.compareLegacyAndFrontendSnapshotMerge()
```

7. Confirm no UI behavior changes while flags are false.
8. Confirm no console errors.
