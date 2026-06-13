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
    .ytp-ad-image-overlay,
    .ytp-ad-message-container,
    .ytp-ad-player-overlay,
    .ytp-ad-text-overlay {
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
    html.yt-ad-active .ytp-ad-player-overlay,
    html.yt-ad-active .ytp-ad-player-overlay-layout,
    html.yt-ad-active .ytp-ad-action-interstitial,
    html.yt-ad-active .ytp-ad-image-overlay,
    html.yt-ad-active .ytp-ad-message-container,
    html.yt-ad-active .ytp-ad-overlay-container,
    .ad-showing .ytp-ad-player-overlay-layout,
    .ad-interrupting .ytp-ad-player-overlay-layout,
    .ad-showing .ytp-ad-action-interstitial,
    .ad-interrupting .ytp-ad-action-interstitial {
      display: none !important;
    }
  `;

  // ─── State Variables ────────────────────────────────────────────────
  let extensionEnabled = true;
  let adObserver = null;
  let userPlaybackRate = 1.0;
  let userMuteState = false;
  let adSessionActive = false; // true while .ad-showing/.ad-interrupting is present

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

  // ─── Skip Buttons ──────────────────────────────────────────────────
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-slot',
    'button.ytp-ad-skip-button-modern',
    'button[aria-label^="Skip ad"]'
  ];

  function clickSkipButton() {
    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        try { btn.click(); } catch (e) {}
        try {
          ['mousedown', 'mouseup', 'click'].forEach(type => {
            btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          });
        } catch (e) {}
        return true;
      }
    }
    return false;
  }

  // ─── Core Ad Handler ───────────────────────────────────────────────
  function handleAd() {
    const video = document.querySelector('video');
    if (!video) return;

    // Add CSS class to hide ad elements instantly
    document.documentElement.classList.add('yt-ad-active');

    // Bind event listeners to track user's volume/rate and skip when ready
    if (!video.__adEventsBound) {
      video.__adEventsBound = true;
      
      // Save current states as defaults
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

    // Mute instantly
    video.muted = true;
    // Speed up instantly
    video.playbackRate = 16;

    // Perform immediate skip
    skipVideo(video);

    // Count the ad once per session (session = one appearance of .ad-showing/.ad-interrupting)
    if (!adSessionActive) {
      adSessionActive = true;
      chrome.storage.local.get({ adsSkipped: 0 }, (data) => {
        chrome.storage.local.set({ adsSkipped: data.adsSkipped + 1 });
      });
    }
  }

  function skipVideo(video) {
    if (video.duration && !isNaN(video.duration)) {
      if (video.currentTime < video.duration - 0.1) {
        video.currentTime = video.duration;
      }
    } else {
      video.currentTime = 9999;
    }
    clickSkipButton();
  }

  function restoreAfterAd() {
    document.documentElement.classList.remove('yt-ad-active');
    adSessionActive = false; // reset so next ad gets counted
    const video = document.querySelector('video');
    if (video) {
      video.playbackRate = userPlaybackRate;
      video.muted = userMuteState;
    }
  }

  // ─── Check if ad is active ─────────────────────────────────────────
  function isAdActive() {
    return document.documentElement.classList.contains('yt-ad-active') ||
           document.querySelector('.ad-showing') !== null ||
           document.querySelector('.ad-interrupting') !== null ||
           document.querySelector('.ytp-ad-player-overlay') !== null ||
           document.querySelector('.ytp-ad-message-container') !== null ||
           document.querySelector('.ytp-ad-skip-button') !== null ||
           document.querySelector('.ytp-ad-skip-button-modern') !== null;
  }

  // ─── MutationObserver: fires the INSTANT the DOM changes ───────────
  function startObserver() {
    if (adObserver) return;

    // This observer watches the entire page for any DOM changes
    adObserver = new MutationObserver(() => {
      if (!extensionEnabled) return;

      if (isAdActive()) {
        // Ad detected! Handle it immediately — this fires within 1ms of the ad appearing
        handleAd();
      } else {
        // No ad — restore normal state if we were in ad mode
        if (document.documentElement.classList.contains('yt-ad-active')) {
          restoreAfterAd();
        }
      }
    });

    // Watch for class changes on the player and any new elements being added
    adObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    // Also run a slow backup check every 500ms in case MutationObserver misses something
    setInterval(() => {
      if (!extensionEnabled) return;
      if (isAdActive()) handleAd();
    }, 500);
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

  // Inject styles as early as possible
  injectStyles();

  console.log('[YT-AdShield] Content script v3.1 initialized (MutationObserver).');
})();
