const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/** Accept common YouTube video links without trusting arbitrary iframe URLs. */
export function getYouTubeVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = url.pathname.split('/')[1] || null;
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    if (['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1] || null;
  }

  return id && VIDEO_ID.test(id) ? id : null;
}

export function getYouTubeEmbedUrl(id: string): string {
  if (!VIDEO_ID.test(id)) throw new Error('Invalid YouTube video ID');
  const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  url.searchParams.set('cc_load_policy', '1');
  url.searchParams.set('cc_lang_pref', 'en');
  url.searchParams.set('hl', 'en');
  return url.toString();
}
