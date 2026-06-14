/**
 * YouTube Ad Shield — Content Script (v4.0)
 * ==========================================
 * Runs in ISOLATED world (has chrome.storage access).
 * Two-layer defense:
 *   Layer 1: CSS hides feed/banner/overlay ads instantly.
 *   Layer 2: MutationObserver + interval detects video ads and
 *            fast-forwards + clicks skip as a fallback if inject.js
 *            didn't fully strip the ad from the API response.
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
    .ytp-ad-image-overlay,
    #rendering-content .ytd-in-feed-ad-layout-renderer,
    ytd-ad-slot-renderer,
    .ytd-carousel-ad-renderer-renderer,
    .ytd-statement-banner-renderer,
    .ytd-companion-card-renderer,
    [layout="in-feed-ad-layout"],
    #player-ads,
    #masthead-ad,
    ytd-banner-promo-renderer {
      display: none !important;
      height: 0 !important;
      width: 0 !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  // CSS to hide the video element itself when an ad is active
  const AD_HIDE_CSS = `
    .ad-showing video,
    .ad-interrupting video {
      opacity: 0 !important;
      visibility: hidden !important;
      height: 0 !important;
      pointer-events: none !important;
    }
    .ad-showing .ytp-ad-player-overlay-layout,
    .ad-showing .ytp-ad-action-interstitial,
    .ad-interrupting .ytp-ad-player-overlay-layout,
    .ad-interrupting .ytp-ad-action-interstitial {
      display: none !important;
    }
  `;

  // ─── State ─────────────────────────────────────────────────────────
  let extensionEnabled = true;
  let adObserver = null;
  let checkInterval = null;
  let userPlaybackRate = 1.0;
  let userMuteState = false;
  let lastAdCountTime = 0;

  // ─── Counter ───────────────────────────────────────────────────────
  function incrementAdCount() {
    const now = Date.now();
    if (now - lastAdCountTime < 2000) return;
    lastAdCountTime = now;
    chrome.storage.local.get({ adsSkipped: 0 }, (data) => {
      chrome.storage.local.set({ adsSkipped: data.adsSkipped + 1 });
    });
  }

  // ─── Style Management ─────────────────────────────────────────────
  function injectStyles() {
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = AD_CSS;
      (document.head || document.documentElement).appendChild(s);
    }
    if (!document.getElementById(AD_HIDE_ID)) {
      const s = document.createElement('style');
      s.id = AD_HIDE_ID;
      s.textContent = AD_HIDE_CSS;
      (document.head || document.documentElement).appendChild(s);
    }
  }

  function removeStyles() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(AD_HIDE_ID)?.remove();
  }

  // ─── Ad Detection (strictly inside #movie_player) ─────────────────
  function getPlayer() {
    return document.querySelector('#movie_player');
  }

  function isAdActive() {
    const player = getPlayer();
    if (!player) return false;

    // Primary: YouTube's native class
    if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
      return true;
    }

    // Fallback: check for visible ad overlay or skip button inside player
    const adIndicators = player.querySelectorAll(
      '.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout, .ytp-ad-text, .ytp-ad-preview-text'
    );
    for (const el of adIndicators) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }

    return false;
  }

  // ─── Video Selection ──────────────────────────────────────────────
  function getVideo() {
    const player = getPlayer();
    if (!player) return document.querySelector('video');
    return player.querySelector('video') || document.querySelector('video');
  }

  // ─── Skip Button Clicker ──────────────────────────────────────────
  function clickSkipButtons() {
    const player = getPlayer();
    if (!player) return;

    // All known skip button selectors strictly inside the player
    const btns = player.querySelectorAll([
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button-slot',
      'button[class*="skip-button"]',
      'button[class*="skip-ad"]',
      '[id*="skip-button"]',
      'button[data-tooltip-target-id="a]"',
    ].join(', '));

    for (const btn of btns) {
      try { btn.click(); } catch (e) {}
      try {
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
          btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
      } catch (e) {}
    }

    // Also try aria-label based skip (catches any language)
    const ariaSkips = player.querySelectorAll('button[aria-label]');
    for (const btn of ariaSkips) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('skip') && !label.includes('navigation')) {
        try { btn.click(); } catch (e) {}
      }
    }
  }

  // ─── Core Ad Handler ──────────────────────────────────────────────
  function handleAd() {
    const video = getVideo();
    if (!video) return;

    incrementAdCount();

    // Save user state before we override
    if (video.playbackRate !== 16) {
      userPlaybackRate = video.playbackRate;
    }
    if (!video.__adMuted) {
      userMuteState = video.muted;
    }
    video.__adMuted = true;

    // Mute + speed up
    video.muted = true;
    try { video.playbackRate = 16; } catch (e) {}

    // Skip to near-end
    if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
      if (video.duration > 0.5 && video.currentTime < video.duration - 0.5) {
        video.currentTime = video.duration - 0.1;
      }
    }

    // Click skip buttons
    clickSkipButtons();
  }

  function restoreAfterAd() {
    const video = getVideo();
    if (video) {
      if (video.__adMuted) {
        video.muted = userMuteState;
        delete video.__adMuted;
      }
      try { video.playbackRate = userPlaybackRate; } catch (e) {}
    }
  }

  // ─── Observer + Interval ──────────────────────────────────────────
  let wasAdActive = false;

  function tick() {
    if (!extensionEnabled) return;

    const adNow = isAdActive();

    if (adNow) {
      handleAd();
      wasAdActive = true;
    } else if (wasAdActive) {
      restoreAfterAd();
      wasAdActive = false;
    }
  }

  function startObserver() {
    if (adObserver) return;

    // Watch for class changes on the player itself (catches ad-showing toggle)
    adObserver = new MutationObserver(tick);

    // Observe the player container directly for attribute changes
    const player = getPlayer();
    if (player) {
      adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    }

    // Also observe the DOM tree for new elements (ad overlays being injected)
    adObserver.observe(document.documentElement, { childList: true, subtree: true });

    // Backup interval: 100ms is fast enough, cheap enough
    checkInterval = setInterval(tick, 100);
  }

  function stopObserver() {
    if (adObserver) {
      adObserver.disconnect();
      adObserver = null;
    }
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  }

  // ─── Wait for player to exist, then attach observer ───────────────
  function waitForPlayer() {
    const player = getPlayer();
    if (player) {
      startObserver();
    } else {
      // Player not yet in DOM; wait for it
      const bodyObserver = new MutationObserver(() => {
        if (getPlayer()) {
          bodyObserver.disconnect();
          startObserver();
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────
  function updateState() {
    if (extensionEnabled) {
      injectStyles();
      waitForPlayer();
    } else {
      removeStyles();
      stopObserver();
      restoreAfterAd();
    }
  }

  // Initial setup
  chrome.storage.local.get({ enabled: true }, (data) => {
    extensionEnabled = data.enabled;
    updateState();
  });

  // Live toggle from popup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled !== undefined) {
      extensionEnabled = changes.enabled.newValue;
      updateState();
    }
  });

  // Bridge: receive ad-blocked signals from inject.js (MAIN world)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'YT_AD_SHIELD_BLOCKED') return;
    if (!extensionEnabled) return;
    incrementAdCount();
  });

  // Inject styles as early as possible
  injectStyles();

  console.log('[YT-AdShield] Content script v4.0 initialized.');
})();
