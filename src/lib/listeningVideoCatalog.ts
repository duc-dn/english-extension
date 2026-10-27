export interface ListeningVideo {
  id: string;
  title: string;
  titleVi: string;
  channel: string;
}

export interface ListeningCollection {
  id: string;
  title: string;
  titleVi: string;
  level: string;
  description: string;
  descriptionVi: string;
  videos: ListeningVideo[];
}

// Videos from the publishers' official YouTube channels. Captions and embedding
// remain controlled by each publisher and by YouTube.
export const LISTENING_VIDEO_COLLECTIONS: ListeningCollection[] = [
  {
    id: 'beginner',
    title: 'Everyday English',
    titleVi: 'Giao tiếp hằng ngày',
    level: 'A2–B1',
    description: 'Easy conversations about familiar everyday topics.',
    descriptionVi: 'Hội thoại dễ nghe về những chủ đề quen thuộc.',
    videos: [
      { id: '4C4wlOAscvY', title: 'Talking about food', titleVi: 'Nói về đồ ăn', channel: 'BBC Learning English' },
      { id: 'bVRIpmjTSxM', title: 'Talking about restaurants', titleVi: 'Nói về nhà hàng', channel: 'BBC Learning English' },
      { id: 'd0GKyzG9OWA', title: 'Talking about socialising', titleVi: 'Nói về gặp gỡ bạn bè', channel: 'BBC Learning English' },
      { id: 'M03vuos_nLI', title: 'Talking about the news', titleVi: 'Nói về tin tức', channel: 'BBC Learning English' },
    ],
  },
  {
    id: 'topics',
    title: 'Six-minute topics',
    titleVi: 'Chủ đề 6 phút',
    level: 'B1–B2',
    description: 'Short British English discussions with vocabulary recaps.',
    descriptionVi: 'Thảo luận tiếng Anh Anh ngắn, có phần ôn từ vựng.',
    videos: [
      { id: 'l66TJNGKQFQ', title: 'Healthy meals on a budget', titleVi: 'Ăn lành mạnh với chi phí hợp lý', channel: 'BBC Learning English' },
      { id: '9ifQ3xRz4hM', title: 'Learning multiple languages', titleVi: 'Học nhiều ngôn ngữ', channel: 'BBC Learning English' },
      { id: '3hwEplr-g5w', title: 'Should we eat less rice?', titleVi: 'Có nên ăn ít cơm hơn?', channel: 'BBC Learning English' },
      { id: '5IqtP2fzNlA', title: 'Why smells make us feel at home', titleVi: 'Vì sao mùi hương gợi nhớ nhà?', channel: 'BBC Learning English' },
    ],
  },
  {
    id: 'real-life',
    title: 'Real conversations',
    titleVi: 'Hội thoại đời thực',
    level: 'B2+',
    description: 'Natural street conversations with English subtitles in the video.',
    descriptionVi: 'Nghe người thật trò chuyện, có chữ tiếng Anh ngay trong video.',
    videos: [
      { id: 'WwVywwXCVgw', title: 'Learn English with Real Conversations', titleVi: 'Học qua hội thoại thực tế', channel: 'Easy English' },
      { id: 'tjBBL2ZtHt0', title: 'How to REALLY Understand British People', titleVi: 'Hiểu cách người Anh nói chuyện', channel: 'Easy English' },
    ],
  },
];
