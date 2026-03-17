# Chrome Web Store Publishing Guide

Complete guide to publish InstaUnfollowers v2.0 to the Chrome Web Store.

## Prerequisites

- [ ] Chrome Web Store Developer account ($5 one-time fee)
- [ ] Verified publisher status (optional, but recommended)
- [ ] High-quality screenshots and promotional images
- [ ] Privacy policy URL (if collecting user data)

## Step 1: Prepare Store Listing Assets

### Required Items

1. **Extension Icon** (already created)
   - ✅ `src/assets/icons/icon128.png` (128x128)

2. **Screenshots** (1280x800 or 640x400)
   - Take 3-5 screenshots showing:
     - Popup with scan results
     - Follow/Unfollow actions
     - Dark mode
     - Expanded view
     - Settings page

3. **Promotional Images**
   - Small tile: 440x280 (required)
   - Marquee: 1400x560 (optional, for featured placement)

4. **Privacy Policy**
   - Since this extension doesn't collect data, you can use a simple privacy policy
   - Host it on GitHub Pages or your website
   - Example URL: `https://jahirbasha-n.github.io/instagram-unfollowers/privacy`

### Creating Screenshots

1. Load the extension in Chrome
2. Visit Instagram and log in
3. Open the extension popup
4. Use Chrome DevTools to set viewport to 1280x800
5. Take screenshots:
   - Ready state
   - Scanning in progress
   - Results with all tabs visible
   - Dark mode version
   - Settings page
   - Expanded view

**Tip:** Use macOS Screenshot tool (Cmd+Shift+5) or Windows Snipping Tool

## Step 2: Create Privacy Policy

Create a simple privacy policy file:

```markdown
# Privacy Policy for InstaUnfollowers

Last updated: [Date]

## Data Collection
InstaUnfollowers does not collect, store, or transmit any personal data to external servers.

## Local Storage
All data is stored locally on your device using Chrome's storage APIs:
- Instagram session data (user ID, CSRF token)
- Scan results (following/followers lists)
- User preferences and settings

## Third-Party Services
This extension communicates directly with Instagram's API to fetch your following and followers data. No other third-party services are used.

## Data Sharing
We do not share, sell, or transfer your data to any third parties.

## Contact
For questions, contact: [your-email@example.com]
```

Host this on GitHub Pages:
1. Create a `docs` folder in your repo
2. Add `privacy.html` file
3. Enable GitHub Pages in repo settings
4. Privacy policy URL: `https://jahirbasha-n.github.io/instagram-unfollowers/privacy.html`

## Step 3: Prepare Extension Package

✅ **Already done!** The production zip is ready at:
```
/Users/jahirbasha/Desktop/Development/experiments/chrome-extensions/instaunfollowers-v2.0.0.zip
```

**Contents:**
- 31 files, ~52KB compressed
- All source code, icons, and manifest

## Step 4: Create Chrome Web Store Developer Account

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account
3. Pay the $5 one-time registration fee
4. Agree to the Developer Agreement

## Step 5: Upload Extension

1. Click **"New Item"** in the dashboard
2. Upload `instaunfollowers-v2.0.0.zip`
3. Wait for the upload to complete
4. Click **"Next"**

## Step 6: Fill in Store Listing

### Store Listing Tab

**Product Details:**
- **Name:** InstaUnfollowers
- **Summary (132 characters max):**
  ```
  Analyze Instagram followers to find who doesn't follow back. Follow/unfollow actions, scan history, dark mode, and export features.
  ```

- **Description:**
  ```
  InstaUnfollowers is a powerful Chrome extension that helps you analyze your Instagram network and discover who doesn't follow you back.

  ✨ KEY FEATURES
  • Smart Scanning — Fetch all following/followers with resume-capable scanning
  • Three Categories — Don't Follow Back, Fans, and Mutuals
  • Follow/Unfollow Actions — Manage your network directly from the extension
  • Scan History — Track up to 20 scan snapshots with change detection
  • Dark Mode — Light, Dark, and System theme support
  • Export Data — Download results as CSV or JSON
  • Whitelist System — Hide users from results permanently
  • Advanced Filters — Search by username/name, filter by verified/private
  • Keyboard Shortcuts — Fast navigation with keyboard shortcuts

  🔒 PRIVACY & SECURITY
  • No data collection — All data stays on your device
  • No external servers — Direct communication with Instagram's API only
  • No tracking — Zero analytics or telemetry
  • Secure storage — Uses Chrome's encrypted storage APIs

  ⚙️ HOW IT WORKS
  1. Visit Instagram and log in
  2. Click the extension icon
  3. Click "Find Unfollowers"
  4. View results in three categories
  5. Take actions (follow/unfollow) directly from the extension

  📊 TECHNICAL HIGHLIGHTS
  • Zero dependencies, vanilla JavaScript
  • Chrome Extension Manifest V3 (modern & future-proof)
  • Token bucket rate limiter (respects Instagram's rate limits)
  • Retry logic with exponential backoff
  • Full ARIA accessibility support
  • Infinite scroll with batching for performance

  ⚠️ DISCLAIMER
  This extension is not affiliated with Instagram or Meta. Use at your own risk. The extension complies with Instagram's rate limits and terms of service.
  ```

- **Category:** Social & Communication
- **Language:** English (United States)

**Privacy Practices:**
- Does it use remote code? **No**
- Does it collect user data? **No** (select "This item does not collect user data")

**Screenshots:**
- Upload 3-5 screenshots (1280x800)
- Add captions:
  - "Scan results showing who doesn't follow back"
  - "Follow/Unfollow actions directly from the extension"
  - "Dark mode with clean, modern UI"
  - "Expanded view for detailed analysis"
  - "Settings page with theme and history options"

**Promotional Images:**
- Small tile: 440x280 (required)
  - Create a branded tile with app name and icon
  - Show key feature: "Find who unfollowed you"

**Links:**
- **Official website:** `https://github.com/JahirBasha-N/instagram-unfollowers`
- **Support URL:** `https://github.com/JahirBasha-N/instagram-unfollowers/issues`
- **Privacy policy:** `https://jahirbasha-n.github.io/instagram-unfollowers/privacy.html`

**Single purpose description (max 180 characters):**
```
This extension helps Instagram users analyze their follower network to identify who doesn't follow them back and manage connections.
```

**Permission Justification:**
When asked why you need permissions, explain:
- **storage:** To cache scan results and user settings locally
- **alarms:** To keep service worker alive during long scans
- **notifications:** To notify users when background scans complete

**Host Permission Justification (instagram.com):**
```
This extension needs access to instagram.com to:
1. Detect when the user is logged into Instagram
2. Capture the user's Instagram session (user ID and CSRF token)
3. Make API calls to Instagram's endpoints to fetch following/followers lists
4. Execute follow/unfollow actions on behalf of the user

All data processing happens locally on the user's device. No data is sent to external servers.
```

## Step 7: Distribution

### Distribution Tab

- **Visibility:** Public
- **Countries:** All countries (or select specific regions)
- **Pricing:** Free

## Step 8: Submit for Review

1. Click **"Submit for Review"**
2. Wait for Google's review (typically 1-5 business days)
3. You'll receive an email when the review is complete

### Review Process

Google will check:
- Manifest V3 compliance
- Privacy policy compliance
- No malicious code
- Permissions are justified
- Store listing is accurate

**Common rejection reasons:**
- Missing or unclear privacy policy
- Excessive permissions
- Misleading store listing
- Keyword stuffing in description

## Step 9: Post-Publish

Once approved:
1. Extension will be live at: `https://chrome.google.com/webstore/detail/[generated-id]`
2. Update your README with the store link
3. Share on social media
4. Monitor reviews and feedback

### Ongoing Maintenance

For updates:
1. Update `manifest.json` version (e.g., 2.0.0 → 2.0.1)
2. Create new zip file
3. Upload to Chrome Web Store
4. Submit for review
5. Users will auto-update within 24-48 hours

## Marketing Tips

1. **Update README.md** with store badge:
   ```markdown
   [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/[extension-id].svg)](https://chrome.google.com/webstore/detail/[extension-id])
   ```

2. **Share on:**
   - Product Hunt
   - Reddit (r/chrome_extensions, r/Instagram)
   - Twitter/X
   - Dev.to
   - Hacker News

3. **Create a demo video** (1-2 minutes)
   - Show installation
   - Run a scan
   - Demonstrate key features
   - Upload to YouTube

4. **Encourage reviews**
   - Ask users to rate on Chrome Web Store
   - Respond to all reviews (positive and negative)

## Troubleshooting

### Extension Rejected?

1. **Read the rejection email carefully**
2. Fix the issues mentioned
3. Re-submit with a detailed response

### Common Fixes:
- Add/clarify privacy policy
- Reduce requested permissions
- Update store listing description
- Add better screenshots
- Improve permission justifications

## Support

If you need help:
- Chrome Web Store Support: https://support.google.com/chrome_webstore/
- Chrome Extensions documentation: https://developer.chrome.com/docs/extensions/
- Extension reviews forum: https://groups.google.com/a/chromium.org/g/chromium-extensions

---

**Good luck with your submission! 🚀**
