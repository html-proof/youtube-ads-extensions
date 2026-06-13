/**
 * YouTube Ad Shield & Skipper — API Interceptor (v3.1)
 * ===================================================
 * Runs in the MAIN execution world (page context).
 * Intercepts player config, initial variables, Object prototypes,
 * and fetch requests to strip ad configurations completely.
 */

(function() {
  'use strict';

  const PLAYER_AD_KEYS = [
    'adPlacements',
    'playerAds',
    'adSlots',
    'adBreakParams'
  ];

  // Helper to recursively strip ad-related keys from any object
  function cleanPlayerResponse(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = cleanPlayerResponse(obj[i]);
      }
      return obj;
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (PLAYER_AD_KEYS.includes(key)) {
          delete obj[key];
        } else {
          obj[key] = cleanPlayerResponse(obj[key]);
        }
      }
    }
    return obj;
  }

  // Helper to determine if an ad is currently active
  function isAdActive() {
    return document.documentElement.classList.contains('yt-ad-active') ||
           document.querySelector('.ad-showing') !== null ||
           document.querySelector('.ad-interrupting') !== null ||
           document.querySelector('.ytp-ad-player-overlay') !== null ||
           document.querySelector('.ytp-ad-message-container') !== null ||
           document.querySelector('.ytp-ad-skip-button') !== null ||
           document.querySelector('.ytp-ad-skip-button-modern') !== null;
  }

  // ─── Prototype overrides for media playback rate and muting ───
  try {
    const descPlaybackRate = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
    const descMuted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');

    if (descPlaybackRate && descMuted) {
      Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
        get: function() {
          if (isAdActive()) return 16;
          return descPlaybackRate.get.call(this);
        },
        set: function(val) {
          if (isAdActive()) {
            descPlaybackRate.set.call(this, 16);
          } else {
            descPlaybackRate.set.call(this, val);
          }
        },
        configurable: true
      });

      Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
        get: function() {
          if (isAdActive()) return true;
          return descMuted.get.call(this);
        },
        set: function(val) {
          if (isAdActive()) {
            descMuted.set.call(this, true);
          } else {
            descMuted.set.call(this, val);
          }
        },
        configurable: true
      });
    }

    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      if (isAdActive()) {
        try {
          this.muted = true;
          this.playbackRate = 16;
        } catch (e) {}
      }
      return originalPlay.apply(this, arguments);
    };
  } catch (e) {}

  // ─── Intercept Object.prototype as a final fallback ───
  try {
    for (const key of PLAYER_AD_KEYS) {
      if (!(key in Object.prototype)) {
        Object.defineProperty(Object.prototype, key, {
          get: function() {
            return undefined;
          },
          set: function(val) {
            // Ignore assignments to prevent ad loading
          },
          configurable: true
        });
      }
    }
  } catch (e) {}

  // ─── Intercept ytInitialPlayerResponse ───
  let _ytInitialPlayerResponse;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get: function() {
        return _ytInitialPlayerResponse;
      },
      set: function(value) {
        if (typeof value === 'object' && value !== null) {
          _ytInitialPlayerResponse = cleanPlayerResponse(value);
        } else {
          _ytInitialPlayerResponse = value;
        }
      },
      configurable: true
    });
  } catch (e) {}

  // ─── Intercept ytInitialData ───
  let _ytInitialData;
  try {
    Object.defineProperty(window, 'ytInitialData', {
      get: function() {
        return _ytInitialData;
      },
      set: function(value) {
        if (typeof value === 'object' && value !== null) {
          _ytInitialData = cleanPlayerResponse(value);
        } else {
          _ytInitialData = value;
        }
      },
      configurable: true
    });
  } catch (e) {}

  // ─── Intercept ytplayer (bootstrapPlayerResponse & config) ───
  let _ytplayer;
  function cleanConfig(config) {
    if (typeof config !== 'object' || config === null) return config;
    if (config.args) {
      if (config.args.raw_player_response) {
        try {
          if (typeof config.args.raw_player_response === 'string') {
            let parsed = JSON.parse(config.args.raw_player_response);
            config.args.raw_player_response = JSON.stringify(cleanPlayerResponse(parsed));
          } else {
            config.args.raw_player_response = cleanPlayerResponse(config.args.raw_player_response);
          }
        } catch (e) {}
      }
      if (config.args.player_response) {
        try {
          if (typeof config.args.player_response === 'string') {
            let parsed = JSON.parse(config.args.player_response);
            config.args.player_response = JSON.stringify(cleanPlayerResponse(parsed));
          } else {
            config.args.player_response = cleanPlayerResponse(config.args.player_response);
          }
        } catch (e) {}
      }
    }
    return config;
  }

  function makeProxy(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    return new Proxy(obj, {
      set: function(target, prop, value) {
        if (prop === 'bootstrapPlayerResponse') {
          value = cleanPlayerResponse(value);
        } else if (prop === 'config') {
          value = cleanConfig(value);
        }
        target[prop] = value;
        return true;
      },
      get: function(target, prop) {
        return target[prop];
      }
    });
  }

  if (window.ytplayer) {
    _ytplayer = makeProxy(window.ytplayer);
  }
  Object.defineProperty(window, 'ytplayer', {
    get: function() {
      return _ytplayer;
    },
    set: function(value) {
      _ytplayer = makeProxy(value);
    },
    configurable: true
  });

  // ─── Intercept fetch — ONLY /youtubei/v1/player ───
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const request = args[0];
    const requestUrl = typeof request === 'string' ? request : (request instanceof Request ? request.url : '');

    if (requestUrl.includes('/youtubei/v1/player')) {
      return originalFetch.apply(window, args).then(function(response) {
        if (!response.ok) return response;

        return response.text().then(function(text) {
          try {
            let json = JSON.parse(text);
            json = cleanPlayerResponse(json);
            text = JSON.stringify(json);
          } catch (e) {}

          const newResponse = new Response(text, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
          Object.defineProperty(newResponse, 'url', { value: response.url });
          return newResponse;
        });
      });
    }

    return originalFetch.apply(this, args);
  };

  console.log('[YT-AdShield] API interceptor v3.1 initialized (deep clean).');
})();
