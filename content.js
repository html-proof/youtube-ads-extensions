/**
 * YouTube Ad Shield & Skipper — Content Script (v3.1)
 * =================================================
 * Uses MutationObserver for INSTANT ad detection (zero delay).
 * The moment YouTube injects an ad, it is hidden and skipped before
 * a single frame renders on screen — just like Brave browser.
 */

(function () {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────────
  const STYLE_ID = 'yt-ad-shield-styles';
  const AD_HIDE_ID = 'yt-ad-hide-styles';

  // CSS to hide feed/banner/overlay ads across the page
  const AD_CSS = `
    ytd-promoted-sparkles-web-renderer,
    ytd-player-legacy-ad-renderer,
    .ytp-ad-overlay-container,
    #rendering-content .ytd-in-feed-ad-layout-renderer,
    ytd-ad-slot-renderer,
    .ytd-carousel-ad-renderer-renderer,
    .ytd-statement-banner-renderer,
    .ytd-companion-card-renderer,
    [layout="in-feed-ad-layout"],
    #player-ads,
    #masthead-ad,
    ytd-banner-promo-renderer,
    .ytp-ad-image-overlay {
      display: none !important;
      height: 0 !important;
      width: 0 !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  // CSS to make the ad video invisible while it gets skipped in the background
  const AD_HIDE_CSS = `
    html.yt-ad-active video,
    .ad-showing video,
    .ad-interrupting video {
      opacity: 0 !important;
      visibility: hidden !important;
      height: 0 !important;
      pointer-events: none !important;
    }
  `;

  // ─── State Variables ────────────────────────────────────────────────
  let extensionEnabled = true;
  let adObserver = null;
  let userPlaybackRate = 1.0;
  let userMuteState = false;
  let adSessionActive = false; // true while .ad-showing/.ad-interrupting is present
  let lastAdCountTime = 0; // Prevent double counting

  // ─── Counter Logic ──────────────────────────────────────────────────
  function incrementAdCount() {
    const now = Date.now();
    // 2-second cooldown to prevent double counting if both inject.js and content.js catch the same ad
    if (now - lastAdCountTime < 2000) return; 
    lastAdCountTime = now;

    chrome.storage.local.get({ adsSkipped: 0 }, (data) => {
      chrome.storage.local.set({ adsSkipped: data.adsSkipped + 1 });
    });
  }

  // ─── Style Management ───────────────────────────────────────────────
  function injectStyles() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = AD_CSS;
      (document.head || document.documentElement).appendChild(style);
    }
    if (!document.getElementById(AD_HIDE_ID)) {
      const style2 = document.createElement('style');
      style2.id = AD_HIDE_ID;
      style2.textContent = AD_HIDE_CSS;
      (document.head || document.documentElement).appendChild(style2);
    }
  }

  function removeStyles() {
    const s1 = document.getElementById(STYLE_ID);
    if (s1) s1.remove();
    const s2 = document.getElementById(AD_HIDE_ID);
    if (s2) s2.remove();
  }

  // ─── Visibility Helper ──────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // ─── Skip Buttons ──────────────────────────────────────────────────
  function clickSkipButton() {
    let clicked = false;
    // Wildcard selectors catch any new class names YouTube invents
    const skipElements = document.querySelectorAll(
      '[class*="skip-button"], [id^="skip-button"], [class*="skip-ad"], button[aria-label^="Skip"]'
    );
    for (const btn of skipElements) {
      if (isVisible(btn)) {
        try { btn.click(); } catch (e) {}
        try {
          ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(type => {
            btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          });
        } catch (e) {}
        clicked = true;
      }
    }
    return clicked;
  }

  // ─── Core Ad Handler ───────────────────────────────────────────────
  function handleAd() {
    const video = getActiveVideo();
    if (!video) return;

    incrementAdCount();

    // Add CSS class to hide ad elements instantly
    document.documentElement.classList.add('yt-ad-active');

    if (!video.__adEventsBound) {
      video.__adEventsBound = true;
      
      userPlaybackRate = (video.playbackRate === 16) ? 1.0 : video.playbackRate;
      userMuteState = video.muted;

      video.addEventListener('ratechange', () => {
        if (!isAdActive() && video.playbackRate !== 16) {
          userPlaybackRate = video.playbackRate;
        }
      });
      video.addEventListener('volumechange', () => {
        if (!isAdActive()) {
          userMuteState = video.muted;
        }
      });

      const skipEvents = ['loadedmetadata', 'durationchange', 'play', 'playing', 'timeupdate'];
      skipEvents.forEach(evt => {
        video.addEventListener(evt, () => {
          if (isAdActive()) {
            skipVideo(video);
          }
        });
      });
    }

    video.muted = true;
    video.playbackRate = 16;
    skipVideo(video);

    adSessionActive = true;
  }

  function skipVideo(video) {
    if (video.duration && !isNaN(video.duration)) {
      if (video.currentTime < video.duration - 0.5) {
        video.currentTime = video.duration - 0.1;
      }
    }
    // Always attempt to click skip buttons if they exist
    clickSkipButton();
  }

  function restoreAfterAd() {
    document.documentElement.classList.remove('yt-ad-active');
    adSessionActive = false;
    const video = document.querySelector('video');
    if (video) {
      video.playbackRate = userPlaybackRate;
      video.muted = userMuteState;
    }
  }

  // ─── Video Selection ────────────────────────────────────────────────
  function getActiveVideo() {
    const videos = document.querySelectorAll('video');
    if (videos.length === 1) return videos[0];
    
    for (let i = 0; i < videos.length; i++) {
      if (videos[i].readyState > 0 && !videos[i].paused && !videos[i].ended) {
        return videos[i];
      }
    }
    return videos[0];
  }

  // ─── Check if ad is active ─────────────────────────────────────────
  function isAdActive() {
    if (document.querySelector('.ad-showing') !== null || document.querySelector('.ad-interrupting') !== null) {
      return true;
    }
    
    const playerOverlay = document.querySelector('.ytp-ad-player-overlay');
    if (playerOverlay && isVisible(playerOverlay)) {
      return true;
    }

    const skipElements = document.querySelectorAll(
      '[class*="skip-button"], [id^="skip-button"], [class*="skip-ad"], button[aria-label^="Skip"]'
    );
    for (const btn of skipElements) {
      if (isVisible(btn)) {
        return true;
      }
    }

    return false;
  }

  // ─── MutationObserver & Interval ───────────────────────────────────
  function startObserver() {
    if (adObserver) return;

    // Only observe DOM insertions (much cheaper than watching all classes globally)
    adObserver = new MutationObserver(() => {
      if (!extensionEnabled) return;
      if (isAdActive()) {
        handleAd();
      } else if (document.documentElement.classList.contains('yt-ad-active')) {
        restoreAfterAd();
      }
    });

    adObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Fast backup interval (50ms) checks for class changes (cheaper than global attribute observer)
    setInterval(() => {
      if (!extensionEnabled) return;
      if (isAdActive()) {
        handleAd();
      } else if (document.documentElement.classList.contains('yt-ad-active')) {
        restoreAfterAd();
      }
    }, 50);
  }

  function stopObserver() {
    if (adObserver) {
      adObserver.disconnect();
      adObserver = null;
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────
  function updateExtensionState() {
    if (extensionEnabled) {
      injectStyles();
      startObserver();
    } else {
      removeStyles();
      stopObserver();
      restoreAfterAd();
    }
  }

  // Initial setup
  chrome.storage.local.get({ enabled: true }, (data) => {
    extensionEnabled = data.enabled;
    updateExtensionState();
  });

  // Live toggle from popup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled !== undefined) {
      extensionEnabled = changes.enabled.newValue;
      updateExtensionState();
    }
  });

  // ─── Bridge: receive ad-blocked signals from inject.js (MAIN world) ──
  // inject.js runs in the page's MAIN world and cannot access chrome.storage.
  // It fires a postMessage; we catch it here and update the counter.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'YT_AD_SHIELD_BLOCKED') return;
    if (!extensionEnabled) return;

    incrementAdCount();
  });

  // Inject styles as early as possible
  injectStyles();

  console.log('[YT-AdShield] Content script v3.1 initialized (MutationObserver).');
})();
