/**
 * YouTube Ad Shield & Skipper — Background Service Worker (v3.0)
 * =============================================================
 * Handles extension installation, storage initialization,
 * and keeps the service worker alive using a periodic alarm.
 */

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      enabled: true,
      rewriteEnabled: true,
      adsSkipped: 0
    });
    console.log('[YT-AdShield] Extension installed. Settings initialized.');
  }
  if (details.reason === 'update') {
    console.log(`[YT-AdShield] Extension updated to v${chrome.runtime.getManifest().version}`);
  }

  // Create a keepalive alarm that fires every 25 seconds
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
});

// On browser startup, also ensure the alarm exists
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
  console.log('[YT-AdShield] Service worker started on browser launch.');
});

// Listen for the alarm to keep the service worker active
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // This handler firing is enough to keep the service worker alive
    // Optionally do a lightweight check
    chrome.storage.local.get('enabled', () => {});
  }
});
