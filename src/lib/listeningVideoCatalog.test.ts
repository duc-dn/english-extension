import { describe, expect, it } from 'vitest';
import { LISTENING_VIDEO_COLLECTIONS } from './listeningVideoCatalog';
import { getYouTubeVideoId } from './youtube';

describe('curated listening video catalog', () => {
  it('has playable-looking, unique YouTube IDs and complete labels', () => {
    const videos = LISTENING_VIDEO_COLLECTIONS.flatMap(collection => collection.videos);
    expect(LISTENING_VIDEO_COLLECTIONS.length).toBeGreaterThan(1);
    expect(videos.length).toBeGreaterThan(5);
    expect(new Set(videos.map(video => video.id)).size).toBe(videos.length);
    for (const video of videos) {
      expect(getYouTubeVideoId(`https://www.youtube.com/watch?v=${video.id}`)).toBe(video.id);
      expect(video.title.trim()).not.toBe('');
      expect(video.titleVi.trim()).not.toBe('');
      expect(video.channel.trim()).not.toBe('');
    }
  });
});
