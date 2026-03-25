# InstaUnfollowers v2.0 🔍

A production-ready Chrome extension (MV3) to analyze your Instagram account and discover who doesn't follow you back — with powerful features for managing your Instagram network.

## ✨ Features

### Core Analysis
- **Smart Scanning** — Fetch all following/followers with resume-capable scanning
- **Three Categories** — Don't Follow Back, Fans (follow you only), and Mutuals
- **Real-time Progress** — Live progress tracking with elapsed time and counts
- **Cache System** — 30-minute cache to avoid redundant scans

### Advanced Features
- **Follow/Unfollow Actions** — Manage your network directly from the extension
  - Unfollow from "Don't Follow Back" tab → removes from your following
  - Unfollow from "Mutuals" tab → moves to Fans
  - Follow from "Fans" tab → moves to Mutuals
  - Loading spinners and instant UI updates (no rescan needed)
- **Whitelist System** — Hide users from results permanently
- **Scan History** — Track up to 20 scan snapshots
- **Change Detection** — See new unfollowers and regained followers since last scan
- **Search & Filters** — Search by username/name, filter by verified/private accounts
- **Export Data** — Download results as CSV or JSON
- **Dark Mode** — Light, Dark, and System theme support
- **Expanded View** — Open results in a full browser tab for better visibility
- **Keyboard Shortcuts** — `/` to search, `1-4` for tabs, arrow keys for navigation

### Enterprise Quality
- **Rate Limiting** — Token bucket algorithm with 180 req/15min window + adaptive cooldowns
- **Error Handling** — Retry logic with exponential backoff for transient errors
- **Security** — XSS prevention, formula injection protection in exports, CORS-safe image loading
- **Performance** — Infinite scroll with batching (100 users/batch), concurrent image loading (6 max)
- **Accessibility** — Full ARIA support, keyboard navigation, screen reader friendly
- **State Persistence** — Reconnect to in-progress scans when popup is closed/reopened

## 🚀 Installation

### From Chrome Web Store
https://chromewebstore.google.com/detail/fagibalogdicmlbcpdflpoafgeffommj?utm_source=item-share-cb

### Local Development
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the `instagram-unfollowers` folder
6. Visit [instagram.com](https://instagram.com) and log in
7. Click the extension icon in your toolbar

## 📖 How to Use

1. **First Time Setup**
   - Visit Instagram and log in to your account
   - The extension automatically captures your session

2. **Running a Scan**
   - Click the extension icon
   - Click "Find Unfollowers"
   - Wait for the scan to complete (usually 1-3 minutes for 1000 users)

3. **View Results**
   - **Don't Follow Back** — People you follow who don't follow you
   - **Fans** — People who follow you but you don't follow them
   - **Mutuals** — People who you both follow each other
   - **Changes** — New unfollowers and regained followers (appears after 2nd scan)

4. **Take Actions**
   - **Unfollow** — Click the "Unfollow" button on any user card
   - **Follow** — Click the "Follow" button on fans
   - **Hide** — Click the eye-off icon to add to whitelist
   - **View Profile** — Click the external-link icon to open on Instagram

5. **Advanced Features**
   - **Search** — Use the search bar or press `/` to search
   - **Filters** — Click "Verified" or "Private" chips to filter
   - **Sort** — Sort by username or name (A-Z or Z-A)
   - **Export** — Click the download icon → choose CSV or JSON
   - **Expand** — Click the expand icon to open in a full tab
   - **Settings** — Right-click the extension icon → Options

## ⚙️ Settings

Access settings by right-clicking the extension icon and selecting "Options":

- **Appearance** — Choose Light, Dark, or System theme
- **Notifications** — Toggle browser notifications when scans complete
- **History** — Configure max snapshots (default: 20)
- **Whitelist** — Manage hidden users
- **Data Management** — View storage usage, clear all data

## 🏗️ Architecture

### Tech Stack
- **Vanilla JavaScript** (ES Modules) — Zero dependencies
- **Chrome Extension Manifest V3** — Modern, future-proof architecture
- **Service Worker** — Background processing with keepalive
- **Chrome Storage API** — Local persistence + session storage

### Key Components
- **Content Script** — Captures Instagram session data (user ID, CSRF token)
- **Service Worker** — Handles API calls, rate limiting, caching, and state management
- **Popup UI** — 400x580px popup with dark mode and responsive design
- **Expanded View** — Full-tab interface with multi-column grid
- **Options Page** — Settings and data management

### Data Flow
```
Instagram Tab → Content Script → Service Worker
                                      ↓
                              Instagram API
                                      ↓
                              Rate Limiter
                                      ↓
                              Comparison Engine
                                      ↓
                              Cache Manager
                                      ↓
                           Popup/Expanded UI
```

## 🔒 Privacy & Security

- **No data collection** — All data stays local on your device
- **No external servers** — Direct communication with Instagram's API only
- **No tracking** — Zero analytics or telemetry
- **Secure storage** — Uses Chrome's encrypted storage APIs
- **Session-only auth** — CSRF tokens stored in session storage (cleared on browser close)

## 📊 Storage Usage

Typical storage footprint:
- **Scan results** (5000 users): ~2-3 MB
- **History** (20 snapshots, ID-only): ~2 MB
- **Settings + Whitelist**: < 10 KB

Total: **~5 MB** for a heavily-used account (well under Chrome's 10 MB limit)

## 🐛 Known Limitations

- **Rate Limits** — Instagram enforces rate limits (180 requests/15 min). Large accounts (5k+ following) may take 10-15 minutes.
- **Private Accounts** — Cannot see follower lists of private accounts you don't follow
- **Business Accounts** — Some business accounts have API restrictions
- **Session Expiry** — You must be logged into Instagram; the extension will prompt you to re-login if your session expires

## 🛠️ Development

### Project Structure
```
instagram-unfollowers/
├── manifest.json              # Extension manifest (MV3)
├── src/
│   ├── background/            # Service worker modules
│   │   ├── service-worker.js
│   │   ├── instagram-api.js
│   │   ├── rate-limiter.js
│   │   ├── cache-manager.js
│   │   ├── comparison-engine.js
│   │   ├── storage-manager.js
│   │   └── history-manager.js
│   ├── content/
│   │   └── content-script.js  # Instagram session capture
│   ├── popup/                 # Popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   ├── popup.js
│   │   └── toast.js
│   ├── expanded/              # Full-tab view
│   │   ├── expanded.html
│   │   ├── expanded.css
│   │   └── expanded.js
│   ├── options/               # Settings page
│   │   ├── options.html
│   │   ├── options.css
│   │   └── options.js
│   ├── shared/                # Shared utilities
│   │   ├── constants.js
│   │   ├── message-types.js
│   │   ├── errors.js
│   │   └── render-utils.js
│   └── assets/
│       ├── icons/             # Extension icons (16, 32, 48, 128)
│       └── styles/
│           └── design-tokens.css
```

### Building for Production
```bash
# Create a zip for Chrome Web Store
zip -r instaunfollowers-v2.0.0.zip . -x ".*" -x "__MACOSX/*" -x "*.DS_Store"
```

### Testing
1. Load the unpacked extension in `chrome://extensions`
2. Open DevTools for the popup: Right-click extension icon → Inspect popup
3. View service worker logs: `chrome://extensions` → InstaUnfollowers → Service worker → Inspect
4. Test on a real Instagram account (use a test account for safety)

## 📝 Changelog

### v2.0.0 (Current)
- ✨ **NEW:** Follow/Unfollow actions directly from the extension
- ✨ **NEW:** Whitelist system to hide users permanently
- ✨ **NEW:** Scan history with change detection (20 snapshots)
- ✨ **NEW:** Dark mode with system theme support
- ✨ **NEW:** Expanded view in full browser tab
- ✨ **NEW:** Export to CSV/JSON
- ✨ **NEW:** Settings page with data management
- ✨ **NEW:** Toast notifications with undo actions
- ✨ **NEW:** Keyboard shortcuts and accessibility
- ✨ **NEW:** Search and advanced filters
- 🔧 Fixed: Scan state persistence when popup closes/reopens
- 🔧 Improved: Rate limiting with adaptive cooldowns
- 🔧 Improved: Error handling and retry logic

### v1.0.0
- Initial release
- Basic scan functionality
- Three categories (Don't Follow Back, Fans, Mutuals)
- 30-minute cache

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## ⚠️ Disclaimer

This extension is not affiliated with, endorsed by, or connected to Instagram or Meta Platforms, Inc. Use at your own risk. The extension complies with Instagram's rate limits and terms of service, but Instagram may change their policies at any time.

## 🙏 Credits

Built with ❤️ by [JahirBasha-N](https://github.com/JahirBasha-N)

Icons: [Lucide Icons](https://lucide.dev) (Feather-style stroke icons)

---

**Star ⭐ this repo if you find it useful!**
