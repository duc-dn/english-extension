import { db, type DailyWord } from './db';
import { generateDailyWordWithAI } from './translator';

export interface CuratedWord {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  vietnamese: string;
  definition: string;
  example: string;
  level: string;
}

export const FALLBACK_CURATED_WORDS: CuratedWord[] = [
  {
    word: 'Serendipity',
    phonetic: '/ˌser.ənˈdɪp.ə.ti/',
    partOfSpeech: 'noun',
    vietnamese: 'Sự may mắn bất ngờ, cơ duyên kỳ diệu',
    definition: 'The occurrence and development of events by chance in a happy or beneficial way.',
    example: 'Finding this English learning space was a stroke of pure serendipity.',
    level: 'C1 Advanced'
  },
  {
    word: 'Resilience',
    phonetic: '/rɪˈzɪl.jəns/',
    partOfSpeech: 'noun',
    vietnamese: 'Sự kiên cường, khả năng hồi phục mạnh mẽ',
    definition: 'The capacity to recover quickly from difficulties; toughness and perseverance.',
    example: 'True language fluency is built through daily dedication and steady resilience.',
    level: 'B2 Upper-Int'
  },
  {
    word: 'Eloquent',
    phonetic: '/ˈel.ə.kwənt/',
    partOfSpeech: 'adjective',
    vietnamese: 'Lưu loát, truyền cảm, tài hùng biện',
    definition: 'Fluent or persuasive in speaking or writing in a graceful manner.',
    example: 'An eloquent speaker communicates nuanced ideas with clarity and grace.',
    level: 'C1 Advanced'
  },
  {
    word: 'Perseverance',
    phonetic: '/ˌpɜː.sɪˈvɪə.rəns/',
    partOfSpeech: 'noun',
    vietnamese: 'Sự bền chí, lòng kiên trì vượt khó',
    definition: 'Persistence in doing something despite difficulty or delay in achieving success.',
    example: 'Mastering thousands of words requires regular practice and quiet perseverance.',
    level: 'B2 Upper-Int'
  },
  {
    word: 'Ubiquitous',
    phonetic: '/juːˈbɪk.wɪ.təs/',
    partOfSpeech: 'adjective',
    vietnamese: 'Hiện diện ở khắp mọi nơi, phổ biến rộng rãi',
    definition: 'Present, appearing, or found everywhere at the same time.',
    example: 'AI assistants and smart learning tools have become truly ubiquitous.',
    level: 'C2 Proficiency'
  },
  {
    word: 'Meticulous',
    phonetic: '/məˈtɪk.jə.ləs/',
    partOfSpeech: 'adjective',
    vietnamese: 'Tỉ mỉ, cẩn trọng từng chi tiết',
    definition: 'Showing great attention to detail; very careful and precise.',
    example: 'She takes meticulous notes on vocabulary collocations and pronunciation nuances.',
    level: 'C1 Advanced'
  },
  {
    word: 'Lucid',
    phonetic: '/ˈluː.sɪd/',
    partOfSpeech: 'adjective',
    vietnamese: 'Rõ ràng, mạch lạc, dễ hiểu',
    definition: 'Expressed clearly; easy to understand without ambiguity.',
    example: 'The AI explanation gave a lucid overview of complex conditional sentences.',
    level: 'B2 Upper-Int'
  },
  {
    word: 'Epiphany',
    phonetic: '/ɪˈpɪf.ən.i/',
    partOfSpeech: 'noun',
    vietnamese: 'Khoảnh khắc bừng sáng, giác ngộ bất ngờ',
    definition: 'A moment of sudden and profound revelation or insight.',
    example: 'Reading the context sentence gave him a sudden epiphany about how native speakers use the word.',
    level: 'C1 Advanced'
  },
  {
    word: 'Tenacity',
    phonetic: '/təˈnæs.ə.ti/',
    partOfSpeech: 'noun',
    vietnamese: 'Sự ngoan cường, kiên định không bỏ cuộc',
    definition: 'The quality or fact of being able to grip something firmly; determination.',
    example: 'Her tenacity in practicing pronunciation every evening quickly paid off.',
    level: 'B2 Upper-Int'
  },
  {
    word: 'Pragmatic',
    phonetic: '/præɡˈmæt.ɪk/',
    partOfSpeech: 'adjective',
    vietnamese: 'Thực tế, thực dụng và hiệu quả',
    definition: 'Dealing with things sensibly and realistically in a way that is based on practical considerations.',
    example: 'He adopted a pragmatic approach by prioritizing high-frequency vocabulary first.',
    level: 'B2 Upper-Int'
  },
  {
    word: 'Sonorous',
    phonetic: '/səˈnɔː.rəs/',
    partOfSpeech: 'adjective',
    vietnamese: 'Vang dội, trầm ấm, êm tai',
    definition: 'Capable of producing a deep, rich, or resonant sound.',
    example: 'The voice actor had a sonorous tone that made listening practice enjoyable.',
    level: 'C2 Proficiency'
  },
  {
    word: 'Ineffable',
    phonetic: '/ɪnˈef.ə.bəl/',
    partOfSpeech: 'adjective',
    vietnamese: 'Không lời nào tả xiết, tuyệt diệu khôn tả',
    definition: 'Too great, beautiful, or intense to be expressed in words.',
    example: 'The joy of having your first fluent English conversation is simply ineffable.',
    level: 'C2 Proficiency'
  },
  {
    word: 'Catalyst',
    phonetic: '/ˈkæt.əl.ɪst/',
    partOfSpeech: 'noun',
    vietnamese: 'Chất xúc tác, nhân tố thúc đẩy biến chuyển',
    definition: 'A person or thing that precipitates an event or change.',
    example: 'Daily reading habits served as a powerful catalyst for vocabulary growth.',
    level: 'B2 Upper-Int'
  },
  {
    word: 'Halcyon',
    phonetic: '/ˈhæl.si.ən/',
    partOfSpeech: 'adjective',
    vietnamese: 'Thanh bình, êm đềm, vàng son',
    definition: 'Denoting a period of time in the past that was idyllically happy and peaceful.',
    example: 'Those halcyon university days gave him time to immerse himself in classic literature.',
    level: 'C2 Proficiency'
  },
  {
    word: 'Ingenuity',
    phonetic: '/ˌɪn.dʒəˈnjuː.ə.ti/',
    partOfSpeech: 'noun',
    vietnamese: 'Sự khéo léo, tài khéo léo và sáng tạo',
    definition: 'The quality of being clever, original, and inventive.',
    example: 'With a bit of linguistic ingenuity, she crafted memorable mnemonics for hard words.',
    level: 'C1 Advanced'
  }
];

export function getTodayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface GetDailyWordResult {
  word: DailyWord;
  isFromAI: boolean;
  cached: boolean;
}

/**
 * Lấy hoặc sinh từ vựng của ngày (Word of the Day)
 * - Ưu tiên đọc từ IndexedDB cache nếu đã có hôm nay
 * - Nếu chưa có hoặc forceRefresh = true, gọi AI sinh từ mới và lưu vào IndexedDB
 * - Nếu AI không khả dụng hoặc thất bại, lấy từ kho Curated Words phong phú
 */
export async function getOrGenerateDailyWord(
  forceRefresh = false
): Promise<GetDailyWordResult> {
  const today = getTodayKey();

  // 1. Kiểm tra cache trong IndexedDB nếu không phải force refresh
  if (!forceRefresh) {
    try {
      const cached = await db.daily_words.get(today);
      if (cached) {
        return {
          word: cached,
          isFromAI: !FALLBACK_CURATED_WORDS.some(w => w.word.toLowerCase() === cached.word.toLowerCase()),
          cached: true
        };
      }
    } catch (e) {
      console.warn('Error reading daily word from IndexedDB cache:', e);
    }
  }

  // 2. Thu thập danh sách từ vựng đã học để tránh trùng
  let avoidWords: string[] = [];
  try {
    const existing = await db.words.limit(40).toArray();
    avoidWords = existing.map(w => w.word);
    const pastDaily = await db.daily_words.limit(20).toArray();
    avoidWords = [...new Set([...avoidWords, ...pastDaily.map(w => w.word)])];
  } catch {
    avoidWords = [];
  }

  // 3. Thử sinh bằng AI
  let generatedFromAI = false;
  let wordData: Omit<DailyWord, 'date' | 'createdAt'> | null = null;

  try {
    const aiWord = await generateDailyWordWithAI(avoidWords);
    if (aiWord) {
      wordData = aiWord;
      generatedFromAI = true;
    }
  } catch (err) {
    console.warn('AI word generation failed:', err);
  }

  // 4. Nếu AI thất bại hoặc chưa cấu hình AI, dùng kho Curated Words
  if (!wordData) {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const offset = forceRefresh ? Math.floor(Math.random() * FALLBACK_CURATED_WORDS.length) : 0;
    const selected = FALLBACK_CURATED_WORDS[(dayOfYear + offset) % FALLBACK_CURATED_WORDS.length];
    wordData = { ...selected };
    generatedFromAI = false;
  }

  const finalDailyWord: DailyWord = {
    date: today,
    word: wordData.word,
    phonetic: wordData.phonetic,
    partOfSpeech: wordData.partOfSpeech,
    vietnamese: wordData.vietnamese,
    definition: wordData.definition,
    example: wordData.example,
    level: wordData.level,
    createdAt: new Date().toISOString()
  };

  // 5. Lưu vào IndexedDB cache
  try {
    await db.daily_words.put(finalDailyWord);
  } catch (err) {
    console.warn('Failed to cache daily word in IndexedDB:', err);
  }

  return {
    word: finalDailyWord,
    isFromAI: generatedFromAI,
    cached: false
  };
}

/**
 * Lấy lịch sử các từ vựng Word of the Day các ngày gần đây
 */
export async function getRecentDailyWords(limit = 7): Promise<DailyWord[]> {
  try {
    return await db.daily_words.orderBy('date').reverse().limit(limit).toArray();
  } catch {
    return [];
  }
}
