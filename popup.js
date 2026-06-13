/**
 * YouTube Ad Shield — Popup Script (v3)
 * Simple ON/OFF toggle + stats counter.
 */

const toggleInput = document.getElementById('toggle-enabled');
const statusText  = document.getElementById('status-text');
const statsCount  = document.getElementById('stats-count');
const versionEl   = document.getElementById('version-number');

function updateUI(enabled) {
  toggleInput.checked = enabled;
  statusText.textContent = enabled ? '● Active' : '○ Off';
  statusText.className = 'status__text ' + (enabled ? 'status__text--active' : 'status__text--inactive');
}

function updateStats(count) {
  if (statsCount) statsCount.textContent = count.toLocaleString();
}

// Init
(function () {
  const manifest = chrome.runtime.getManifest();
  if (versionEl) versionEl.textContent = manifest.version;

  chrome.storage.local.get({ enabled: true, adsSkipped: 0 }, (data) => {
    updateUI(data.enabled);
    updateStats(data.adsSkipped);
  });
})();

// Toggle
toggleInput.addEventListener('change', () => {
  const enabled = toggleInput.checked;
  chrome.storage.local.set({ enabled }, () => updateUI(enabled));
});

// Live sync
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.enabled !== undefined) updateUI(changes.enabled.newValue);
    if (changes.adsSkipped !== undefined) updateStats(changes.adsSkipped.newValue);
  }
});
