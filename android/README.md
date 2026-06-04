# BiznesHisob — Android Home Screen Widget

Premium **Bugungi Sof Foyda** widget for the BiznesHisob fintech app. Built with **Jetpack Glance** (Android 12+ style, min SDK 26).

## Features

- Dark glassmorphism fintech UI matching BiznesHisob colors
- Today's net profit (`BUGUNGI SOF FOYDA`) with active currency formatting
- States: positive, high profit, record day (daily target), zero, negative
- Resizable widget (2×2, 4×2, 4×3 cells)
- Tap opens the app dashboard (`MainActivity` WebView)
- Auto-sync from web app via `BiznesHisobWidgetBridge`
- Light refresh every 30 minutes (WorkManager, no network)

## Build & install

1. Open the `android/` folder in **Android Studio** (Ladybug or newer).
2. Let Gradle sync, then **Run** on a device/emulator (API 26+).
3. Long-press home screen → **Widgets** → **Bugungi Sof Foyda**.
4. Install the APK for widget + app shell (PWA loads from production URL by default).

Change the loaded URL in `MainActivity.DEFAULT_URL` for local dev, e.g. `http://10.0.2.2:5500/`.

## Data sync

The PWA (`index.html`) calls `pushWidgetSnapshot()` when transactions or currency change. In the Android WebView shell, this reaches native code:

```javascript
BiznesHisobWidgetBridge.updateWidget(json);
```

Snapshot JSON fields:

| Field | Description |
|--------|-------------|
| `todayNetUzs` | Today's net profit in UZS |
| `formattedAmount` | Display string e.g. `+5,000 so'm` or `$12.50` |
| `currencyCode` | Active currency code |
| `dailyTargetUzs` | Daily target (default 1,000,000 UZS, override with `localStorage.bh_daily_target`) |
| `state` | `positive` \| `high` \| `record` \| `zero` \| `negative` |
| `statusEmoji` / `statusText` | Bottom status line |

## Daily target

Set in browser/app:

```javascript
localStorage.setItem('bh_daily_target', '5000000'); // UZS
```

When today's profit ≥ target, the widget shows **🏆 Rekord kun!** with gold/purple gradient and sparkles.

## Architecture

```
android/app/src/main/java/uz/bizneshisob/app/
├── MainActivity.kt          # WebView host + deep link
├── bridge/WebAppBridge.kt   # JS ↔ SharedPreferences
└── widget/
    ├── ProfitWidget.kt      # Glance UI
    ├── ProfitWidgetReceiver.kt
    ├── WidgetDataStore.kt
    ├── WidgetStateResolver.kt
    └── WidgetUpdateWorker.kt
```

## Note on animations

Android home screen widgets use **Glance/RemoteViews** — continuous particle, glow pulse, and count-up animations are approximated with gradients, state-based colors, emoji sparklines, and instant updates on data change. Full Lottie-style motion belongs inside the app, not on the widget surface.

## Play Store / TWA

This module is a **WebView wrapper + widget**. For Play Store you may later migrate to **Trusted Web Activity (TWA)** while keeping the same `WebAppBridge` and widget code.
