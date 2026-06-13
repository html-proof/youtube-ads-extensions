# YouTube Ad Shield & Skipper

A lightweight, high-performance browser extension designed to instantly mute and skip YouTube ads and hide visual ad elements.

## Features
- **Zero-Delay Skipper**: Uses a `MutationObserver` to detect ads instantly (within 1ms) and skip them.
- **Deep Clean Interceptor**: Intercepts YouTube's initial variables (`ytInitialPlayerResponse`, `ytInitialData`), player bootstrapping structures, and `/youtubei/v1/player` Fetch API calls to strip ad data before it even reaches the video player.
- **Brave-Style Blocking fallback**: If any ad manages to load, it is instantly muted, played at 16x speed, and hidden (opacity 0, visibility hidden) until it is skipped.
- **User Settings Preserver**: Remembers and restores your volume/mute and playback rate preferences after skipping ads.
- **Clean and Simple Popup**: Features a single toggle switch to turn protection on/off and displays a counter of blocked ads.

## Installation
1. Clone or download this repository.
2. Open your browser's Extensions page (`chrome://extensions/` or `brave://extensions/`).
3. Turn on **Developer mode** (top right corner).
4. Click **Load unpacked** (top left corner) and select this directory.
