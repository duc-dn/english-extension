import { describe, expect, it } from 'vitest';
import { getYouTubeEmbedUrl, getYouTubeVideoId } from './youtube';

describe('YouTube video links', () => {
  it.each([
    'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=10',
    'https://youtu.be/M7lc1UVf-VE',
    'https://m.youtube.com/shorts/M7lc1UVf-VE',
    'https://youtube.com/live/M7lc1UVf-VE',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
  ])('extracts the video ID from %s', link => {
    expect(getYouTubeVideoId(link)).toBe('M7lc1UVf-VE');
  });

  it.each([
    'M7lc1UVf-VE',
    'https://evil.example/watch?v=M7lc1UVf-VE',
    'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE',
    'javascript:alert(1)',
    'https://youtube.com/watch?v=invalid',
  ])('rejects unsupported input %s', link => {
    expect(getYouTubeVideoId(link)).toBeNull();
  });

  it('requests English captions in the embedded player', () => {
    const url = new URL(getYouTubeEmbedUrl('M7lc1UVf-VE'));
    expect(url.hostname).toBe('www.youtube-nocookie.com');
    expect(url.searchParams.get('cc_load_policy')).toBe('1');
    expect(url.searchParams.get('cc_lang_pref')).toBe('en');
  });
});
