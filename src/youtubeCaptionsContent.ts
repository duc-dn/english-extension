// Runs only in YouTube embed frames. Mirrors the caption line that the player
// itself renders, so the extension can show it below the video.
const videoId = location.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})(?:\/|$)/)?.[1];

if (videoId) {
  let lastText = '';
  window.setInterval(() => {
    const video = document.querySelector('video');
    const time = video?.currentTime;
    if (typeof time !== 'number' || !Number.isFinite(time)) return;
    const text = Array.from(document.querySelectorAll<HTMLElement>('.ytp-caption-segment'))
      .map(element => element.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');
    if (text === lastText) return;
    lastText = text;
    void chrome.runtime.sendMessage({ type: 'listening.youtubeCaption', videoId, text, time }).catch(() => {});
  }, 250);
}
