# Privacy Policy for InstaUnfollowers

**Last updated:** March 14, 2026

## Overview

InstaUnfollowers is a Chrome extension that analyzes your Instagram account to identify users who don't follow you back. This privacy policy explains how the extension handles your data.

## Data Collection

InstaUnfollowers does **not** collect, transmit, or store any personal data on external servers. The extension operates entirely on your local device.

### What data the extension accesses

- **Instagram session data** — Your Instagram user ID and CSRF token are read from your active Instagram tab to authenticate API requests. These are stored temporarily in Chrome's session storage and are cleared when you close your browser.
- **Follower and following lists** — The extension fetches your own followers and following lists directly from Instagram's API to perform its analysis.
- **Profile pictures** — User profile images are loaded directly from Instagram's CDN servers for display within the extension.

### What data is stored locally

- Scan results (usernames, display names, profile picture URLs, verified/private status)
- Scan history snapshots (up to 20)
- User settings (theme preference, notification toggle)
- Whitelist of hidden users
- Cached scan data (expires after 30 minutes)

All locally stored data uses Chrome's built-in storage APIs and never leaves your device.

## Data Sharing

InstaUnfollowers does **not**:

- Send any data to external servers or third parties
- Include any analytics, telemetry, or tracking
- Sell or transfer user data for any purpose
- Use data for advertising or profiling

The only network requests made by the extension are directly to Instagram's own servers (instagram.com, fbcdn.net, cdninstagram.com) to fetch your account data and profile images.

## Data Security

- All communication with Instagram uses HTTPS encryption
- Session tokens are stored in Chrome's session storage and cleared on browser close
- Persistent data is stored using Chrome's local storage API, which is sandboxed to the extension

## User Control

You have full control over your data:

- **Export** — Download your scan results as CSV or JSON at any time
- **Delete** — Clear all stored data from the extension's settings page
- **Uninstall** — Removing the extension deletes all associated local data

## Permissions

The extension requests the following permissions, each used solely for its core functionality:

| Permission | Purpose |
|---|---|
| `storage` | Save scan results, settings, and history locally |
| `alarms` | Keep background scans alive during long operations |
| `notifications` | Notify you when a scan completes (optional, can be disabled) |
| `host_permissions` | Access Instagram APIs and load profile images from Instagram's CDN |

## Children's Privacy

InstaUnfollowers is not directed at children under 13 and does not knowingly collect data from children.

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected on this page with an updated date.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/JahirBasha-N/instagram-unfollowers/issues).
