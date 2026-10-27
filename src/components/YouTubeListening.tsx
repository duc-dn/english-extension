import { useEffect, useState } from 'react';
import { Button, Input, message } from 'antd';
import { ExternalLink, Play, Plus, Trash2, Video } from 'lucide-react';
import { LISTENING_VIDEO_COLLECTIONS } from '../lib/listeningVideoCatalog';
import { getYouTubeEmbedUrl, getYouTubeVideoId } from '../lib/youtube';

interface SavedVideo {
  id: string;
  title: string;
}

const STORAGE_KEY = 'listening-youtube-videos';
const firstVideoId = LISTENING_VIDEO_COLLECTIONS[0].videos[0].id;

function loadVideos(): SavedVideo[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((item): item is SavedVideo =>
      typeof item?.id === 'string' && getYouTubeVideoId(`https://youtu.be/${item.id}`) === item.id &&
      typeof item?.title === 'string'
    ).slice(0, 20);
  } catch {
    return [];
  }
}

export function YouTubeListening({ language }: { language: string }) {
  const vi = language === 'vi';
  const [videos, setVideos] = useState<SavedVideo[]>(loadVideos);
  const [collectionId, setCollectionId] = useState(LISTENING_VIDEO_COLLECTIONS[0].id);
  const [selectedId, setSelectedId] = useState(firstVideoId);
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [mirroredCaption, setMirroredCaption] = useState<{ id: string; text: string; time: number } | null>(null);

  const collection = LISTENING_VIDEO_COLLECTIONS.find(item => item.id === collectionId)!;
  const curated = LISTENING_VIDEO_COLLECTIONS.flatMap(item => item.videos).find(video => video.id === selectedId);
  const saved = videos.find(video => video.id === selectedId);
  const selectedTitle = curated ? (vi ? curated.titleVi : curated.title) : saved?.title;
  const liveCaption = mirroredCaption?.id === selectedId ? mirroredCaption.text : '';

  const selectVideo = (id: string) => {
    setSelectedId(id);
    setMirroredCaption(null);
  };

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    const onCaption = (message: unknown, sender: chrome.runtime.MessageSender) => {
      const data = message as { type?: unknown; videoId?: unknown; text?: unknown; time?: unknown };
      if (data?.type !== 'listening.youtubeCaption' || typeof data.videoId !== 'string' ||
          typeof data.text !== 'string' || typeof data.time !== 'number' ||
          !/^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\//.test(sender.url || '')) return;
      setMirroredCaption({ id: data.videoId, text: data.text, time: data.time });
    };
    chrome.runtime.onMessage.addListener(onCaption);
    return () => chrome.runtime.onMessage.removeListener(onCaption);
  }, []);

  const saveVideos = (next: SavedVideo[]) => {
    setVideos(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      message.warning(vi ? 'Không thể lưu danh sách video trên thiết bị này.' : 'Could not save videos on this device.');
    }
  };

  const addVideo = () => {
    const id = getYouTubeVideoId(link);
    if (!id) {
      message.error(vi ? 'Hãy dán liên kết video YouTube hợp lệ.' : 'Paste a valid YouTube video link.');
      return;
    }
    if (LISTENING_VIDEO_COLLECTIONS.some(item => item.videos.some(video => video.id === id))) {
      selectVideo(id);
      message.info(vi ? 'Video này đã có trong thư viện.' : 'This video is already in the library.');
      return;
    }
    if (videos.some(video => video.id === id)) {
      selectVideo(id);
      message.info(vi ? 'Video này đã có trong danh sách của bạn.' : 'This video is already in your list.');
      return;
    }
    saveVideos([{ id, title: title.trim() || (vi ? 'Video của tôi' : 'My video') }, ...videos].slice(0, 20));
    selectVideo(id);
    setLink('');
    setTitle('');
  };

  const removeVideo = (id: string) => {
    saveVideos(videos.filter(video => video.id !== id));
    if (selectedId === id) selectVideo(collection.videos[0].id);
  };

  return (
    <div className="youtube-listening">
      <div className="bento-card youtube-listening-add">
        <div className="youtube-listening-heading">
          <Video size={22} color="#dc2626" />
          <div>
            <h3>{vi ? 'Thư viện video luyện nghe' : 'Listening video library'}</h3>
            <p>{vi ? 'Chọn một bài có sẵn và bắt đầu nghe. Không cần tìm liên kết.' : 'Pick a ready-made lesson and start listening.'}</p>
          </div>
        </div>
        <div className="youtube-listening-collections" role="group" aria-label={vi ? 'Chủ đề video' : 'Video collections'}>
          {LISTENING_VIDEO_COLLECTIONS.map(item => (
            <button
              type="button"
              key={item.id}
              className={collectionId === item.id ? 'active' : ''}
              aria-pressed={collectionId === item.id}
              onClick={() => { setCollectionId(item.id); selectVideo(item.videos[0].id); }}
            >
              <strong>{vi ? item.titleVi : item.title}</strong>
              <small>{item.level} · {item.videos.length} {vi ? 'video' : 'videos'}</small>
            </button>
          ))}
        </div>
        <p className="youtube-listening-collection-desc">{vi ? collection.descriptionVi : collection.description}</p>
      </div>

      {selectedTitle && (
        <div className="bento-card youtube-listening-player-card">
          <div className="youtube-listening-player-heading">
            <strong>{selectedTitle}</strong>
            <a href={`https://www.youtube.com/watch?v=${selectedId}`} target="_blank" rel="noopener noreferrer">
              {vi ? 'Mở trên YouTube' : 'Open on YouTube'} <ExternalLink size={14} />
            </a>
          </div>
          <div className="youtube-listening-player">
            <iframe
              key={selectedId}
              src={getYouTubeEmbedUrl(selectedId)}
              title={selectedTitle}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <div className="youtube-listening-transcript" aria-live="polite">
            <div className="youtube-listening-transcript-label">{vi ? 'Lời thoại tiếng Anh' : 'English transcript'}</div>
            <div className="youtube-listening-transcript-line">
              {liveCaption || (vi ? 'Phát video và bật CC để xem lời thoại tiếng Anh.' : 'Play the video and turn on CC to follow the English transcript.')}
            </div>
          </div>
          <p className="youtube-listening-hint">
            {vi
              ? 'Lời tiếng Anh bên dưới chạy theo video khi có track phụ đề. Nếu không tải được hoặc trình phát báo lỗi, video đó có thể giới hạn quyền nhúng/phụ đề.'
              : 'The English line below follows the video when a caption track is available. Some videos may restrict embedding or captions.'}
          </p>
        </div>
      )}

      <div className="bento-card youtube-listening-catalog-card">
        <div className="youtube-listening-catalog">
          {collection.videos.map((video, index) => (
            <button
              type="button"
              key={video.id}
              className={`youtube-listening-video${selectedId === video.id ? ' selected' : ''}`}
              aria-pressed={selectedId === video.id}
              onClick={() => selectVideo(video.id)}
            >
              <img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" loading="lazy" />
              <span className="youtube-listening-video-info">
                <small>{vi ? `Bài ${index + 1}` : `Lesson ${index + 1}`} · {video.channel}</small>
                <strong>{vi ? video.titleVi : video.title}</strong>
                <span>{video.title}</span>
              </span>
              <Play size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="bento-card youtube-listening-library">
        <h3>{vi ? 'Video bạn tự lưu' : 'Your saved videos'}</h3>
        {videos.map(video => (
          <div className={`youtube-listening-item${selectedId === video.id ? ' selected' : ''}`} key={video.id}>
            <button type="button" onClick={() => selectVideo(video.id)} aria-label={`${vi ? 'Phát' : 'Play'} ${video.title}`}>
              <Play size={15} /> <span>{video.title}</span>
            </button>
            <button type="button" onClick={() => removeVideo(video.id)} aria-label={`${vi ? 'Xóa' : 'Remove'} ${video.title}`} title={vi ? 'Xóa video' : 'Remove video'}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="youtube-listening-form">
          <Input
            aria-label={vi ? 'Liên kết video YouTube' : 'YouTube video link'}
            placeholder="https://www.youtube.com/watch?v=..."
            value={link}
            onChange={event => setLink(event.target.value)}
            onPressEnter={addVideo}
          />
          <Input
            aria-label={vi ? 'Tên video' : 'Video title'}
            placeholder={vi ? 'Tên gợi nhớ (không bắt buộc)' : 'Optional video title'}
            value={title}
            maxLength={80}
            onChange={event => setTitle(event.target.value)}
            onPressEnter={addVideo}
          />
          <Button icon={<Plus size={14} />} onClick={addVideo}>{vi ? 'Thêm video' : 'Add video'}</Button>
        </div>
      </div>
    </div>
  );
}
