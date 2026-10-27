import type { GrammarExerciseSet } from './db';

export type GrammarCategory = 
  | 'all'
  | 'tenses_verbs'
  | 'conditionals'
  | 'inversion_emphasis'
  | 'clauses'
  | 'passive_causative'
  | 'modals'
  | 'comparisons';

export interface GrammarTopicItem {
  id: string;
  category: GrammarCategory;
  title: string;
  level: 'B1' | 'B2' | 'C1';
  formula: string;
  explanation: string;
  example: string;
  examplesList: { english: string; vietnamese: string }[];
  notes: string;
  tags: string[];
  exercises: GrammarExerciseSet;
}

export interface GrammarCategoryMeta {
  id: GrammarCategory;
  nameVi: string;
  nameEn: string;
  icon: string;
}

export const GRAMMAR_CATEGORIES: GrammarCategoryMeta[] = [
  { id: 'all', nameVi: 'Tất cả chủ đề', nameEn: 'All Topics', icon: '🌟' },
  { id: 'conditionals', nameVi: 'Câu điều kiện & Giả định', nameEn: 'Conditionals & Subjunctive', icon: '🔀' },
  { id: 'inversion_emphasis', nameVi: 'Đảo ngữ & Nhấn mạnh', nameEn: 'Inversion & Emphasis', icon: '⚡' },
  { id: 'clauses', nameVi: 'Mệnh đề quan hệ & Rút gọn', nameEn: 'Relative Clauses', icon: '🔗' },
  { id: 'passive_causative', nameVi: 'Bị động & Thể sai khiến', nameEn: 'Passive & Causative', icon: '🔄' },
  { id: 'modals', nameVi: 'Động từ khuyết thiếu & Suy đoán', nameEn: 'Modals & Deduction', icon: '🎯' },
  { id: 'comparisons', nameVi: 'So sánh & Cụm định lượng', nameEn: 'Comparisons & Quantifiers', icon: '⚖️' },
  { id: 'tenses_verbs', nameVi: 'Thì & Dạng động từ', nameEn: 'Tenses & Verb Patterns', icon: '⏳' },
];

export const GRAMMAR_TOPIC_CATALOG: GrammarTopicItem[] = [
  // 1. Câu điều kiện loại 3
  {
    id: 'topic-cond-3',
    category: 'conditionals',
    title: 'Câu điều kiện loại 3 (Third Conditional)',
    level: 'B2',
    formula: 'If + S + had + V3/ed, S + would/could + have + V3/ed',
    explanation: 'Diễn tả một điều kiện và kết quả hoàn toàn trái ngược với thực tế đã xảy ra trong quá khứ. Thường dùng để diễn tả sự tiếc nuối, trách móc hoặc giả định lịch sử.',
    example: 'If I had known about the traffic jam, I would have taken the subway.\n(Nếu tôi biết trước về vụ tắc đường, tôi đã đi tàu điện ngầm rồi.)\n\nIf she had practiced more, she could have passed the test.\n(Nếu cô ấy luyện tập nhiều hơn, cô ấy đã có thể đỗ bài thi rồi.)',
    examplesList: [
      {
        english: 'If I had known about the traffic jam, I would have taken the subway.',
        vietnamese: 'Nếu tôi biết trước về vụ tắc đường, tôi đã đi tàu điện ngầm rồi.'
      },
      {
        english: 'If she had practiced more, she could have passed the test.',
        vietnamese: 'Nếu cô ấy luyện tập nhiều hơn, cô ấy đã có thể đỗ bài thi rồi.'
      }
    ],
    notes: 'Đảo ngữ: Had + S + (not) + V3/ed, S + would have + V3/ed (bỏ If). Ví dụ: Had I known earlier, I would have warned you.',
    tags: ['conditionals', 'past-unreal', 'b2-grammar'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-cond3-1',
          question: 'If we _____ the early train yesterday, we wouldn\'t have missed the opening ceremony.',
          options: ['had caught', 'caught', 'have caught', 'would catch'],
          correctAnswer: 0,
          explanation: 'Mệnh đề If của câu điều kiện loại 3 dùng thì Quá khứ hoàn thành: had + V3/ed (had caught).'
        },
        {
          id: 'mc-cond3-2',
          question: 'Had you told me earlier, I _____ you with the financial report.',
          options: ['will assist', 'would have assisted', 'assisted', 'am assisting'],
          correctAnswer: 1,
          explanation: 'Đảo ngữ câu điều kiện loại 3 (Had you told me...), mệnh đề chính dùng S + would have + V3/ed.'
        }
      ],
      translation: [
        {
          id: 'tr-cond3-1',
          vietnamese: 'Nếu hôm qua tôi không quên chìa khóa, tôi đã không phải đợi ngoài cửa suốt 2 tiếng.',
          hint: 'Third conditional, forget key, wait outside',
          suggestedEnglish: 'If I hadn\'t forgotten my key yesterday, I wouldn\'t have had to wait outside for two hours.',
          targetGrammarPoint: 'Third Conditional'
        }
      ]
    }
  },

  // 2. Câu điều kiện hỗn hợp (Mixed Conditionals)
  {
    id: 'topic-cond-mixed',
    category: 'conditionals',
    title: 'Câu điều kiện hỗn hợp (Mixed Conditionals)',
    level: 'C1',
    formula: 'Type 1: If + S + had + V3/ed, S + would + V-inf (now) | Type 2: If + S + V2/ed, S + would have + V3/ed',
    explanation: 'Kết hợp giữa thời gian quá khứ và hiện tại. Loại phổ biến nhất là giả định một hành động không có thật trong quá khứ dẫn đến kết quả ở hiện tại (If had V3, S would V-inf now).',
    example: 'If I had taken your advice back then, I wouldn\'t be in this trouble now.\n(Nếu hồi đó tôi nghe lời khuyên của bạn, thì bây giờ tôi đã không gặp rắc rối thế này.)\n\nIf he were smarter, he wouldn\'t have made that costly mistake.\n(Nếu anh ấy thông minh hơn, anh ấy đã không mắc phải sai lầm đắt giá đó.)',
    examplesList: [
      {
        english: 'If I had taken your advice back then, I wouldn\'t be in this trouble now.',
        vietnamese: 'Nếu hồi đó tôi nghe lời khuyên của bạn, thì bây giờ tôi đã không gặp rắc rối thế này.'
      },
      {
        english: 'If he were smarter, he wouldn\'t have made that costly mistake.',
        vietnamese: 'Nếu anh ấy thông minh hơn, anh ấy đã không mắc phải sai lầm đắt giá đó.'
      }
    ],
    notes: 'Dấu hiệu nhận biết: Mệnh đề If thường có "yesterday / in the past / back then", còn mệnh đề chính có "now / today / at present".',
    tags: ['conditionals', 'mixed', 'c1-grammar', 'advanced'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-condmix-1',
          question: 'If he had accepted the scholarship last year, he _____ in Cambridge right now.',
          options: ['would study', 'would be studying', 'had studied', 'will study'],
          correctAnswer: 1,
          explanation: 'Điều kiện trong quá khứ (last year -> had accepted) dẫn đến kết quả đang tiếp diễn ở hiện tại (right now -> would be studying).'
        }
      ],
      translation: [
        {
          id: 'tr-condmix-1',
          vietnamese: 'Nếu hôm qua bạn đi ngủ sớm thì sáng nay bạn đã không mệt mỏi như bây giờ.',
          hint: 'If you had gone to bed early, you wouldn\'t feel so exhausted now',
          suggestedEnglish: 'If you had gone to bed early yesterday, you wouldn\'t feel so exhausted right now.',
          targetGrammarPoint: 'Mixed Conditionals'
        }
      ]
    }
  },

  // 3. Đảo ngữ No sooner / Hardly
  {
    id: 'topic-inv-nosooner',
    category: 'inversion_emphasis',
    title: 'Đảo ngữ No sooner / Hardly (Inversion)',
    level: 'B2',
    formula: 'No sooner had + S + V3/ed + than + S + V2/ed | Hardly had + S + V3/ed + when + S + V2/ed',
    explanation: 'Dùng để diễn tả một hành động vừa mới xảy ra thì hành động khác lập tức ập tới ("Vừa mới... thì..."). Cần đảo trợ động từ had lên trước chủ ngữ.',
    example: 'No sooner had we arrived at the station than the train left.\n(Chúng tôi vừa mới đến ga thì đoàn tàu lăn bánh.)\n\nHardly had she closed her eyes when the phone rang loudly.\n(Cô ấy vừa mới chợp mắt thì tiếng chuông điện thoại reo vang.)',
    examplesList: [
      {
        english: 'No sooner had we arrived at the station than the train left.',
        vietnamese: 'Chúng tôi vừa mới đến ga thì đoàn tàu lăn bánh.'
      },
      {
        english: 'Hardly had she closed her eyes when the phone rang loudly.',
        vietnamese: 'Cô ấy vừa mới chợp mắt thì tiếng chuông điện thoại reo vang.'
      }
    ],
    notes: 'Quy tắc vàng: No sooner luôn đi với THAN. Hardly / Scarcely / Barely luôn đi với WHEN. Rất hay xuất hiện trong các câu hỏi phân loại của đề thi TOEIC và THPTQG.',
    tags: ['inversion', 'emphasis', 'exam-traps'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-inv-1',
          question: 'No sooner had the keynote speaker begun _____ the microphone stopped working.',
          options: ['when', 'than', 'that', 'then'],
          correctAnswer: 1,
          explanation: 'Cặp từ nối bắt buộc: "No sooner had... THAN...".'
        },
        {
          id: 'mc-inv-2',
          question: 'Hardly _____ the email when she received an instant reply.',
          options: ['she had sent', 'had she sent', 'did she send', 'has she sent'],
          correctAnswer: 1,
          explanation: 'Khi Hardly đứng đầu câu đảo ngữ, trợ động từ "had" phải đứng trước chủ ngữ (had she sent).'
        }
      ],
      translation: [
        {
          id: 'tr-inv-1',
          vietnamese: 'Tôi vừa mới bước chân vào phòng họp thì bài thuyết trình bắt đầu.',
          hint: 'No sooner had I entered the meeting room than...',
          suggestedEnglish: 'No sooner had I entered the meeting room than the presentation began.',
          targetGrammarPoint: 'No sooner had... than'
        }
      ]
    }
  },

  // 4. Đảo ngữ với Not only ... but also
  {
    id: 'topic-inv-notonly',
    category: 'inversion_emphasis',
    title: 'Đảo ngữ Not only... but also (Inversion)',
    level: 'B2',
    formula: 'Not only + Trợ động từ + S + V, but S + also + V...',
    explanation: 'Nhấn mạnh hai tính chất hoặc hai hành động cùng xảy ra ("Không những... mà còn..."). Khi đưa Not only lên đầu câu, mệnh đề đầu tiên bắt buộc phải đảo ngữ.',
    example: 'Not only does she speak French fluently, but she also writes it beautifully.\n(Cô ấy không những nói tiếng Pháp trôi chảy mà còn viết rất đẹp.)\n\nNot only did they finish the project early, but they also saved 20% of the budget.\n(Họ không những hoàn thành dự án sớm mà còn tiết kiệm được 20% ngân sách.)',
    examplesList: [
      {
        english: 'Not only does she speak French fluently, but she also writes it beautifully.',
        vietnamese: 'Cô ấy không những nói tiếng Pháp trôi chảy mà còn viết rất đẹp.'
      },
      {
        english: 'Not only did they finish the project early, but they also saved 20% of the budget.',
        vietnamese: 'Họ không những hoàn thành dự án sớm mà còn tiết kiệm được 20% ngân sách.'
      }
    ],
    notes: 'Lưu ý: Chỉ đảo ngữ ở mệnh đề "Not only". Mệnh đề "but also" giữ nguyên trật tự thông thường (S + also + V).',
    tags: ['inversion', 'emphasis', 'writing-skills'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-notonly-1',
          question: 'Not only _____ excellent design skills, but he also possesses strong leadership qualities.',
          options: ['he has', 'does he have', 'has he had', 'did he had'],
          correctAnswer: 1,
          explanation: 'Hiện tại đơn dùng trợ động từ "does" đưa lên trước chủ ngữ "he" (does he have).'
        }
      ],
      translation: [
        {
          id: 'tr-notonly-1',
          vietnamese: 'Ứng dụng này không những tiện lợi mà còn hoàn toàn miễn phí cho người dùng.',
          hint: 'Not only is this application convenient, but it is also completely free...',
          suggestedEnglish: 'Not only is this app convenient, but it is also completely free for users.',
          targetGrammarPoint: 'Inversion with Not only'
        }
      ]
    }
  },

  // 5. Câu chẻ Cleft Sentences (Nhấn mạnh)
  {
    id: 'topic-cleft-sentences',
    category: 'inversion_emphasis',
    title: 'Câu chẻ Cleft Sentences (It is / was... that)',
    level: 'B2',
    formula: 'It is / was + [Thành phần nhấn mạnh] + that / who + [Mệnh đề còn lại]',
    explanation: 'Dùng để chuyển trọng tâm của câu vào một đối tượng, thời gian, nơi chốn hoặc nguyên nhân cụ thể ("Chính là... người/cái mà...").',
    example: 'It was John who solved the critical server issue yesterday.\n(Chính là John - người đã giải quyết sự cố máy chủ nghiêm trọng hôm qua.)\n\nIt is through continuous practice that you become fluent.\n(Chính nhờ việc luyện tập liên tục mà bạn trở nên lưu loát.)',
    examplesList: [
      {
        english: 'It was John who solved the critical server issue yesterday.',
        vietnamese: 'Chính là John - người đã giải quyết sự cố máy chủ nghiêm trọng hôm qua.'
      },
      {
        english: 'It is through continuous practice that you become fluent.',
        vietnamese: 'Chính nhờ việc luyện tập liên tục mà bạn trở nên lưu loát.'
      }
    ],
    notes: 'Quy tắc: Dùng "who/that" khi nhấn mạnh người; với vật, thời gian hoặc nơi chốn, chuẩn ngữ pháp tiếng Anh luôn là "that" (không dùng where/when trong câu chẻ).',
    tags: ['emphasis', 'cleft-sentence', 'academic-writing'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-cleft-1',
          question: 'It was in this laboratory _____ the breakthrough technology was discovered.',
          options: ['where', 'that', 'which', 'when'],
          correctAnswer: 1,
          explanation: 'Trong cấu trúc câu chẻ, thành phần nối chuẩn luôn là "that", không dùng "where" ngay cả khi nhấn mạnh nơi chốn.'
        }
      ],
      translation: [
        {
          id: 'tr-cleft-1',
          vietnamese: 'Chính sự kiên trì của cả đội ngũ đã giúp chúng tôi hoàn thành dự án đúng hạn.',
          hint: 'It was the team\'s perseverance that helped us finish the project on time.',
          suggestedEnglish: 'It was the team\'s perseverance that helped us finish the project on time.',
          targetGrammarPoint: 'Cleft Sentences'
        }
      ]
    }
  },

  // 6. Mệnh đề quan hệ rút gọn (Reduced Relative Clauses)
  {
    id: 'topic-reduced-relative',
    category: 'clauses',
    title: 'Mệnh đề quan hệ rút gọn (Reduced Relative Clauses)',
    level: 'B2',
    formula: 'Chủ động: V-ing | Bị động: V3/ed | Số thứ tự/Duy nhất (the first, only...): To-V',
    explanation: 'Lược bỏ đại từ quan hệ (who, which, that) và trợ động từ to-be để câu văn súc tích, chuyên nghiệp hơn trong văn viết và báo chí.',
    example: 'The engineer managing this project has 10 years of experience.\n(Kỹ sư phụ trách dự án này có 10 năm kinh nghiệm - rút gọn từ who manages)\n\nThe system developed by our team won the innovation award.\n(Hệ thống được phát triển bởi đội ngũ của chúng tôi đã đạt giải - rút gọn từ which was developed)',
    examplesList: [
      {
        english: 'The engineer managing this project has 10 years of experience.',
        vietnamese: 'Kỹ sư phụ trách dự án này có 10 năm kinh nghiệm.'
      },
      {
        english: 'The system developed by our team won the innovation award.',
        vietnamese: 'Hệ thống được phát triển bởi đội ngũ của chúng tôi đã đạt giải.'
      }
    ],
    notes: '3 nguyên tắc cốt lõi: 1. Hành động chủ động -> V-ing. 2. Hành động bị động -> V3/ed. 3. Có the first, the second, the last, the only -> To-V.',
    tags: ['clauses', 'reduced-relative', 'writing-skills', 'b2-grammar'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-rel-1',
          question: 'The documents _____ by the audit team must be submitted before Friday.',
          options: ['requesting', 'requested', 'to request', 'were requested'],
          correctAnswer: 1,
          explanation: 'Tài liệu "được yêu cầu" (bị động) -> rút gọn thành dạng quá khứ phân từ "requested".'
        },
        {
          id: 'mc-rel-2',
          question: 'She was the first female engineer _____ the department in our company.',
          options: ['heading', 'headed', 'to head', 'heads'],
          correctAnswer: 2,
          explanation: 'Có cụm chỉ thứ tự "the first female engineer" -> rút gọn bằng "to-infinitive" (to head).'
        }
      ],
      translation: [
        {
          id: 'tr-rel-1',
          vietnamese: 'Những ứng viên tham gia buổi phỏng vấn hôm nay sẽ nhận được kết quả vào tuần tới.',
          hint: 'Candidates participating in today\'s interview will receive...',
          suggestedEnglish: 'Candidates participating in today\'s interview will receive the results next week.',
          targetGrammarPoint: 'Reduced Relative Clause (V-ing)'
        }
      ]
    }
  },

  // 7. Bị động với động từ tường thuật (Passive with Reporting Verbs)
  {
    id: 'topic-passive-reporting',
    category: 'passive_causative',
    title: 'Bị động với động từ tường thuật (Passive with Reporting Verbs)',
    level: 'B2',
    formula: 'Cách 1: It is said/believed/thought that + S + V | Cách 2: S + is/are said to + V-inf / to have V3/ed',
    explanation: 'Dùng để truyền tải thông tin khách quan, dư luận hoặc ý kiến của số đông ("Người ta nói rằng...", "Được cho là..."). Thường dùng trong tin tức và văn bản học thuật.',
    example: 'It is reported that the company made record profits this quarter.\n(Có tin báo rằng công ty đạt lợi nhuận kỷ lục trong quý này.)\n\nHe is believed to have left the country two days ago.\n(Anh ta được cho là đã rời khỏi đất nước từ hai ngày trước - hành động xảy ra trước thời điểm nói).',
    examplesList: [
      {
        english: 'It is reported that the company made record profits this quarter.',
        vietnamese: 'Có tin báo rằng công ty đạt lợi nhuận kỷ lục trong quý này.'
      },
      {
        english: 'He is believed to have left the country two days ago.',
        vietnamese: 'Anh ta được cho là đã rời khỏi đất nước từ hai ngày trước.'
      }
    ],
    notes: 'Quy tắc lùi thì: Nếu hành động trong mệnh đề that xảy ra TRƯỚC thời điểm tường thuật, phải dùng "to have + V3/ed" (ví dụ: He is said to have won the lottery).',
    tags: ['passive', 'reporting-verbs', 'academic', 'news-english'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-pass-rep-1',
          question: 'The famous scientist is believed _____ the discovery while working late in his lab.',
          options: ['to make', 'to have made', 'making', 'having made'],
          correctAnswer: 1,
          explanation: 'Khám phá đã diễn ra trong quá khứ trước thời điểm "is believed" ở hiện tại -> dùng "to have + V3/ed" (to have made).'
        }
      ],
      translation: [
        {
          id: 'tr-pass-rep-1',
          vietnamese: 'Tòa nhà cổ này được cho là đã được xây dựng từ thế kỷ 18.',
          hint: 'This ancient building is believed to have been built in the 18th century.',
          suggestedEnglish: 'This ancient building is believed to have been built in the 18th century.',
          targetGrammarPoint: 'Passive with Reporting Verbs'
        }
      ]
    }
  },

  // 8. Thể truyền khiến / sai khiến (Causative Form)
  {
    id: 'topic-causative-form',
    category: 'passive_causative',
    title: 'Thể truyền khiến: Have / Get something done (Causative)',
    level: 'B1',
    formula: 'Chủ động: S + have + someone + V-inf / S + get + someone + to V-inf | Bị động: S + have/get + something + V3/ed',
    explanation: 'Dùng khi bạn không tự làm một việc gì đó mà nhờ, thuê hoặc yêu cầu một người khác làm cho mình (ví dụ: đi cắt tóc, sửa xe, sơn nhà).',
    example: 'I had my car repaired at the local garage yesterday.\n(Tôi đã đem xe đi sửa ở gara địa phương hôm qua - thợ sửa chứ không phải tôi tự sửa.)\n\nShe got the technician to install the new software.\n(Cô ấy nhờ kỹ thuật viên cài đặt phần mềm mới.)',
    examplesList: [
      {
        english: 'I had my car repaired at the local garage yesterday.',
        vietnamese: 'Tôi đã đem xe đi sửa ở gara địa phương hôm qua.'
      },
      {
        english: 'She got the technician to install the new software.',
        vietnamese: 'Cô ấy nhờ kỹ thuật viên cài đặt phần mềm mới.'
      }
    ],
    notes: 'Bẫy thi: Have someone DO something (V nguyên thể không to), nhưng Get someone TO DO something (có to). Dạng bị động thì cả hai đều là Have/Get something DONE (V3/ed).',
    tags: ['causative', 'passive', 'everyday-english', 'b1-grammar'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-caus-1',
          question: 'We need to get the air conditioner _____ before the hot summer begins.',
          options: ['service', 'servicing', 'serviced', 'to service'],
          correctAnswer: 2,
          explanation: 'Get something + V3/ed (get the air conditioner serviced) là thể truyền khiến bị động.'
        }
      ],
      translation: [
        {
          id: 'tr-caus-1',
          vietnamese: 'Cuối tuần trước tôi đã đi bảo dưỡng xe máy tại cửa hàng chính hãng.',
          hint: 'Last weekend I had my motorbike serviced at the official store.',
          suggestedEnglish: 'Last weekend I had my motorbike serviced at an authorized store.',
          targetGrammarPoint: 'Causative Have something done'
        }
      ]
    }
  },

  // 9. Câu giả định thức (Subjunctive Mood)
  {
    id: 'topic-subjunctive-mood',
    category: 'conditionals',
    title: 'Câu giả định thức (Subjunctive Mood)',
    level: 'C1',
    formula: 'S + recommend / suggest / demand / insist / require + that + S + (should) + V-inf',
    explanation: 'Dùng sau các động từ hoặc tính từ biểu thị sự yêu cầu, đề xuất, khuyên bảo cấp thiết. Động từ trong mệnh đề that luôn ở dạng nguyên thể không to (V-inf) cho mọi ngôi (kể cả he/she/it).',
    example: 'The doctor recommended that he take a complete week off work.\n(Bác sĩ khuyên rằng anh ấy nên nghỉ ngơi hẳn một tuần - dùng take, không chia takes).\n\nIt is essential that every employee adhere to safety protocols.\n(Điều cốt yếu là mọi nhân viên phải tuân thủ nghiêm ngặt quy trình an toàn).',
    examplesList: [
      {
        english: 'The doctor recommended that he take a complete week off work.',
        vietnamese: 'Bác sĩ khuyên rằng anh ấy nên nghỉ ngơi hẳn một tuần.'
      },
      {
        english: 'It is essential that every employee adhere to safety protocols.',
        vietnamese: 'Điều cốt yếu là mọi nhân viên phải tuân thủ nghiêm ngặt quy trình an toàn.'
      }
    ],
    notes: 'Cực kỳ dễ sai: Ngôi thứ 3 số ít (he/she/it) hoặc thì quá khứ vẫn giữ nguyên động từ V-inf (ví dụ: insist that she BE present, không dùng is hay was).',
    tags: ['subjunctive', 'formal-english', 'academic', 'c1-grammar'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-subj-1',
          question: 'The committee demanded that the director _____ a detailed explanation immediately.',
          options: ['provides', 'provide', 'provided', 'is providing'],
          correctAnswer: 1,
          explanation: 'Theo cấu trúc giả định thức "demanded that + S + (should) + V-inf", động từ phải ở dạng nguyên thể "provide" (không chia s/es hay ed).'
        }
      ],
      translation: [
        {
          id: 'tr-subj-1',
          vietnamese: 'Giám đốc yêu cầu mọi thành viên phải có mặt đúng 8 giờ sáng mai.',
          hint: 'The manager demanded that all members be present at 8 AM tomorrow.',
          suggestedEnglish: 'The director demanded that all members be present at 8 AM tomorrow.',
          targetGrammarPoint: 'Subjunctive Mood (be present)'
        }
      ]
    }
  },

  // 10. Phỏng đoán quá khứ với Modal Verbs
  {
    id: 'topic-modals-past-deduction',
    category: 'modals',
    title: 'Phỏng đoán quá khứ (Must / Can\'t / Should have V3)',
    level: 'B2',
    formula: 'Chắc chắn đúng: Must have + V3/ed | Chắc chắn không thể: Can\'t/Couldn\'t have + V3/ed | Đáng lẽ nên: Should have + V3/ed',
    explanation: 'Dùng các trợ động từ khuyết thiếu kết hợp với "have + V3/ed" để suy đoán logic hoặc tiếc nuối về một sự việc trong quá khứ dựa trên bằng chứng hiện tại.',
    example: 'The ground is wet; it must have rained heavily last night.\n(Mặt đất ướt sũng; đêm qua chắc chắn trời đã mưa rất to.)\n\nYou should have phoned me to let me know you would be late.\n(Lẽ ra bạn nên gọi điện báo cho tôi biết là bạn sẽ đến muộn - nhưng thực tế bạn đã không gọi.)',
    examplesList: [
      {
        english: 'The ground is wet; it must have rained heavily last night.',
        vietnamese: 'Mặt đất ướt sũng; đêm qua chắc chắn trời đã mưa rất to.'
      },
      {
        english: 'You should have phoned me to let me know you would be late.',
        vietnamese: 'Lẽ ra bạn nên gọi điện báo cho tôi biết là bạn sẽ đến muộn.'
      }
    ],
    notes: 'Không bao giờ dùng "mustn\'t have V3" để suy đoán điều không xảy ra trong quá khứ. Suy đoán phủ định bắt buộc phải dùng "can\'t have + V3" hoặc "couldn\'t have + V3".',
    tags: ['modals', 'past-deduction', 'b2-grammar', 'speaking-ielts'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-modded-1',
          question: 'Mark is usually punctual. He _____ in an unexpected traffic jam on the freeway.',
          options: ['must get caught', 'must have been caught', 'should have caught', 'can\'t have been caught'],
          correctAnswer: 1,
          explanation: 'Suy đoán quá khứ có căn cứ hợp lý: "chắc chắn anh ấy đã bị kẹt xe" -> must have been caught (dạng bị động).'
        }
      ],
      translation: [
        {
          id: 'tr-modded-1',
          vietnamese: 'Anh ấy không thể nào đã nhìn thấy tôi hôm qua vì tôi đang ở nước ngoài.',
          hint: 'He couldn\'t have seen me yesterday because I was abroad.',
          suggestedEnglish: 'He can\'t have seen me yesterday because I was abroad.',
          targetGrammarPoint: 'Can\'t have V3 (Past Deduction)'
        }
      ]
    }
  },

  // 11. Phân biệt Used to, Be used to & Get used to
  {
    id: 'topic-used-to-trio',
    category: 'tenses_verbs',
    title: 'Phân biệt Used to, Be used to & Get used to',
    level: 'B1',
    formula: 'Used to + V-inf (Thói quen quá khứ đã chấm dứt) | Be used to + V-ing/Noun (Đã quen với việc gì) | Get used to + V-ing/Noun (Dần làm quen)',
    explanation: 'Ba cấu trúc có cách viết tương tự nhau nhưng mang ý nghĩa và dạng thức ngữ pháp khác biệt hoàn toàn: một bên là hành động quá khứ (V-inf), hai bên còn lại là trạng thái thích nghi (V-ing).',
    example: 'I used to live in Da Nang when I was a student.\n(Tôi từng sống ở Đà Nẵng khi còn là sinh viên - nay không còn nữa.)\n\nI am used to waking up at 6 AM every morning.\n(Tôi đã quen với việc thức dậy lúc 6 giờ sáng mỗi ngày rồi.)\n\nYou will soon get used to working in an international team.\n(Bạn sẽ sớm thích nghi và quen dần với việc làm việc trong một đội ngũ quốc tế thôi.)',
    examplesList: [
      {
        english: 'I used to live in Da Nang when I was a student.',
        vietnamese: 'Tôi từng sống ở Đà Nẵng khi còn là sinh viên.'
      },
      {
        english: 'I am used to waking up at 6 AM every morning.',
        vietnamese: 'Tôi đã quen với việc thức dậy lúc 6 giờ sáng mỗi ngày rồi.'
      },
      {
        english: 'You will soon get used to working in an international team.',
        vietnamese: 'Bạn sẽ sớm thích nghi và quen dần với việc làm việc trong một đội ngũ quốc tế thôi.'
      }
    ],
    notes: 'Quy tắc: Sau "be used to" và "get used to" BẮT BUỘC là V-ing hoặc danh từ. Chỉ có "used to" thuần túy đi với V-inf.',
    tags: ['verbs', 'used-to', 'b1-grammar', 'common-mistakes'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-usedto-1',
          question: 'Even after living in London for three years, he still hasn\'t got used to _____ on the left.',
          options: ['drive', 'driving', 'drove', 'driven'],
          correctAnswer: 1,
          explanation: 'Sau "get used to" đi với dạng V-ing chỉ sự thích nghi (got used to driving).'
        }
      ],
      translation: [
        {
          id: 'tr-usedto-1',
          vietnamese: 'Hồi trước tôi từng uống rất nhiều cà phê, nhưng bây giờ tôi chỉ uống trà thảo mộc.',
          hint: 'I used to drink a lot of coffee, but now I only drink herbal tea.',
          suggestedEnglish: 'I used to drink a lot of coffee, but now I only drink herbal tea.',
          targetGrammarPoint: 'Used to + V-inf'
        }
      ]
    }
  },

  // 12. So sánh kép (The more... the more...)
  {
    id: 'topic-double-comparative',
    category: 'comparisons',
    title: 'So sánh kép (Double Comparatives: The more... the more...)',
    level: 'B2',
    formula: 'The + [Comparative adj/adv] + S + V, the + [Comparative adj/adv] + S + V',
    explanation: 'Diễn tả mối quan hệ tỉ lệ thuận hoặc tỉ lệ nghịch giữa hai vế ("Càng... thì càng..."). Giúp câu nói tự nhiên, uyển chuyển và mang tính lập luận cao.',
    example: 'The more you practice listening, the more confident you become.\n(Bạn càng luyện nghe nhiều thì bạn càng trở nên tự tin hơn.)\n\nThe earlier we finish the report, the sooner we can launch the product.\n(Chúng ta hoàn thành báo cáo càng sớm thì càng có thể tung sản phẩm ra sớm.)',
    examplesList: [
      {
        english: 'The more you practice listening, the more confident you become.',
        vietnamese: 'Bạn càng luyện nghe nhiều thì bạn càng trở nên tự tin hơn.'
      },
      {
        english: 'The earlier we finish the report, the sooner we can launch the product.',
        vietnamese: 'Chúng ta hoàn thành báo cáo càng sớm thì càng có thể tung sản phẩm ra sớm.'
      }
    ],
    notes: 'Quy tắc vàng: Cả hai vế câu đều bắt buộc phải có mạo từ "THE" đứng trước tính từ/phó từ so sánh hơn (The faster..., the better...).',
    tags: ['comparisons', 'double-comparative', 'b2-grammar', 'fluent-english'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-comp-1',
          question: '_____ knowledge you acquire, _____ options you have in your future career.',
          options: ['More / more', 'The more / the more', 'The most / the most', 'The more / more'],
          correctAnswer: 1,
          explanation: 'Công thức so sánh kép bắt buộc mạo từ "The" ở cả hai vế: The more... the more...'
        }
      ],
      translation: [
        {
          id: 'tr-comp-1',
          vietnamese: 'Bạn càng kiên trì mỗi ngày, thành công của bạn sẽ càng lớn.',
          hint: 'The more persistent you are every day, the greater your success will be.',
          suggestedEnglish: 'The more persistent you are each day, the greater your success will be.',
          targetGrammarPoint: 'Double Comparatives'
        }
      ]
    }
  },

  // 13. Phân biệt Few, A few, Little & A little
  {
    id: 'topic-quantifiers-few-little',
    category: 'comparisons',
    title: 'Phân biệt Few, A few, Little & A little',
    level: 'B1',
    formula: 'Danh từ đếm được số nhiều: Few (Rất ít, hầu như không có - tiêu cực) vs A few (Một vài, đủ dùng - tích cực)\nDanh từ không đếm được: Little (Rất ít, gần như cạn kiệt) vs A little (Một chút, đủ dùng)',
    explanation: 'Giúp người học phân biệt sắc thái biểu cảm giữa "có ít nhưng vẫn đủ dùng" (có chữ "A") và "quá ít đến mức gần như không có gì" (không có chữ "A").',
    example: 'I have a few close friends who always support me.\n(Tôi có một vài người bạn thân luôn ủng hộ tôi - ý tích cực.)\n\nSadly, he has few friends in this new city.\n(Đáng buồn thay, anh ấy hầu như chẳng có người bạn nào ở thành phố mới này - ý tiêu cực.)\n\nThere is a little milk left in the fridge, enough for your coffee.\n(Còn một chút sữa trong tủ lạnh, đủ cho tách cà phê của bạn đấy.)',
    examplesList: [
      {
        english: 'I have a few close friends who always support me.',
        vietnamese: 'Tôi có một vài người bạn thân luôn ủng hộ tôi.'
      },
      {
        english: 'Sadly, he has few friends in this new city.',
        vietnamese: 'Đáng buồn thay, anh ấy hầu như chẳng có người bạn nào ở thành phố mới này.'
      },
      {
        english: 'There is a little milk left in the fridge, enough for your coffee.',
        vietnamese: 'Còn một chút sữa trong tủ lạnh, đủ cho tách cà phê của bạn đấy.'
      }
    ],
    notes: 'Bí kíp nhớ nhanh: "A few / A little" có chữ "A" nên mang nghĩa "CÓ một chút/vài". Còn "Few / Little" cộc lốc mang nghĩa "HẦU NHƯ KHÔNG CÒN".',
    tags: ['quantifiers', 'b1-grammar', 'vocabulary-nuance'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-few-1',
          question: 'We need to hurry up; there is _____ time left before the gate closes.',
          options: ['a few', 'few', 'little', 'a little'],
          correctAnswer: 2,
          explanation: '"Time" (thời gian) là danh từ không đếm được. Câu mang nghĩa giục giã "hầu như không còn thời gian nữa" (tiêu cực) -> chọn "little".'
        }
      ],
      translation: [
        {
          id: 'tr-few-1',
          vietnamese: 'Đừng lo, chúng ta vẫn còn một chút thời gian để xem lại tài liệu.',
          hint: 'Don\'t worry, we still have a little time to review the documents.',
          suggestedEnglish: 'Don\'t worry, we still have a little time to review the documents.',
          targetGrammarPoint: 'A little (Positive quantity)'
        }
      ]
    }
  },

  // 14. Cấu trúc Wish & If only
  {
    id: 'topic-wish-if-only',
    category: 'conditionals',
    title: 'Cấu trúc Wish & If only (Câu ước)',
    level: 'B1',
    formula: 'Ước hiện tại: S + wish + S + V2/ed (to be -> were)\nƯớc quá khứ: S + wish + S + had + V3/ed\nƯớc tương lai/phàn nàn: S + wish + S + would/could + V-inf',
    explanation: 'Diễn tả mong ước về một điều gì đó trái với thực tế ở hiện tại, một tiếc nuối trong quá khứ, hoặc phàn nàn và mong muốn ai đó thay đổi hành vi trong tương lai.',
    example: 'I wish I were more confident when speaking English in public.\n(Tôi ước gì mình tự tin hơn khi nói tiếng Anh trước đám đông - hiện tại chưa tự tin).\n\nIf only I had listened to your warning yesterday.\n(Giá như hôm qua tôi nghe theo lời cảnh báo của bạn - quá khứ đã không nghe).',
    examplesList: [
      {
        english: 'I wish I were more confident when speaking English in public.',
        vietnamese: 'Tôi ước gì mình tự tin hơn khi nói tiếng Anh trước đám đông.'
      },
      {
        english: 'If only I had listened to your warning yesterday.',
        vietnamese: 'Giá như hôm qua tôi nghe theo lời cảnh báo của bạn.'
      }
    ],
    notes: 'Quy tắc lùi thì: Luôn lùi một thì so với thực tế. Ước hiện tại lùi về Quá khứ đơn; ước quá khứ lùi về Quá khứ hoàn thành.',
    tags: ['wish', 'if-only', 'b1-grammar', 'unreal-past'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-wish-1',
          question: 'I wish I _____ harder for the certification exam last month.',
          options: ['studied', 'had studied', 'would study', 'have studied'],
          correctAnswer: 1,
          explanation: 'Ước một điều trái với quá khứ (last month) -> dùng thì Quá khứ hoàn thành "had studied".'
        }
      ],
      translation: [
        {
          id: 'tr-wish-1',
          vietnamese: 'Tôi ước gì bây giờ tôi có nhiều thời gian rảnh hơn để đọc sách.',
          hint: 'I wish I had more free time to read books right now.',
          suggestedEnglish: 'I wish I had more free time right now to read books.',
          targetGrammarPoint: 'Wish in the present'
        }
      ]
    }
  },

  // 15. Hiện tại hoàn thành vs Quá khứ đơn (Present Perfect vs Past Simple)
  {
    id: 'topic-present-perfect-vs-past',
    category: 'tenses_verbs',
    title: 'Hiện tại hoàn thành vs Quá khứ đơn (Tenses Mastery)',
    level: 'B1',
    formula: 'Past Simple: S + V2/ed (Xác định rõ mốc thời gian đã chấm dứt trong quá khứ)\nPresent Perfect: S + have/has + V3/ed (Không nêu rõ mốc thời gian, hoặc sự việc kéo dài tới hiện tại)',
    explanation: 'Cặp thì dễ nhầm lẫn nhất trong tiếng Anh. Quá khứ đơn gắn liền với mốc thời gian đã đóng cửa (yesterday, in 2020, ago). Hiện tại hoàn thành gắn liền với trải nghiệm, kết quả liên đới đến hiện tại (already, yet, since, for, so far).',
    example: 'I have lived in this city for five years.\n(Tôi đã sống ở thành phố này được 5 năm - và hiện tại vẫn đang sống ở đây.)\n\nI lived in Da Nang for two years before moving here.\n(Tôi từng sống ở Đà Nẵng 2 năm trước khi chuyển tới đây - việc ở ĐN đã hoàn toàn kết thúc).',
    examplesList: [
      {
        english: 'I have lived in this city for five years.',
        vietnamese: 'Tôi đã sống ở thành phố này được 5 năm (hiện vẫn đang sống).'
      },
      {
        english: 'I lived in Da Nang for two years before moving here.',
        vietnamese: 'Tôi từng sống ở Đà Nẵng 2 năm trước khi chuyển tới đây (đã chấm dứt).'
      }
    ],
    notes: 'Quy tắc kiểm tra: Nếu câu có "yesterday, last week, in 2022, 5 days ago, when I was young" -> BẮT BUỘC dùng Quá khứ đơn, không bao giờ dùng Hiện tại hoàn thành.',
    tags: ['tenses', 'present-perfect', 'past-simple', 'b1-grammar'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-tense-1',
          question: 'Our company _____ three new branches across Southeast Asia since last January.',
          options: ['opened', 'has opened', 'was opening', 'opens'],
          correctAnswer: 1,
          explanation: 'Dấu hiệu "since last January" (kể từ tháng 1 năm ngoái đến nay) -> dùng Hiện tại hoàn thành "has opened".'
        }
      ],
      translation: [
        {
          id: 'tr-tense-1',
          vietnamese: 'Họ đã hoàn thành việc nâng cấp hệ thống vào tuần trước.',
          hint: 'They completed the system upgrade last week.',
          suggestedEnglish: 'They completed the system upgrade last week.',
          targetGrammarPoint: 'Past Simple with definite time (last week)'
        }
      ]
    }
  },

  // 16. Đảo ngữ với Only when / Only after
  {
    id: 'topic-inv-only',
    category: 'inversion_emphasis',
    title: 'Đảo ngữ với Only when / Only after / Only by',
    level: 'C1',
    formula: 'Only when / after / by + [Mệnh đề / V-ing] + [Trợ động từ + S + V-inf]',
    explanation: 'Dùng để nhấn mạnh rằng chỉ khi một điều kiện cụ thể được thỏa mãn thì hành động phía sau mới xảy ra. Lưu ý chỉ đảo ngữ ở mệnh đề chính (mệnh đề sau).',
    example: 'Only when you experience challenges do you truly discover your strengths.\n(Chỉ khi trải qua thử thách bạn mới thực sự khám phá ra sức mạnh của mình.)\n\nOnly after reviewing the logs did the engineers identify the root cause.\n(Chỉ sau khi xem xét kỹ nhật ký hệ thống thì các kỹ sư mới xác định được nguyên nhân gốc rễ).',
    examplesList: [
      {
        english: 'Only when you experience challenges do you truly discover your strengths.',
        vietnamese: 'Chỉ khi trải qua thử thách bạn mới thực sự khám phá ra sức mạnh của mình.'
      },
      {
        english: 'Only after reviewing the logs did the engineers identify the root cause.',
        vietnamese: 'Chỉ sau khi xem xét kỹ nhật ký hệ thống thì các kỹ sư mới xác định được nguyên nhân gốc rễ.'
      }
    ],
    notes: 'Bẫy đề thi kinh điển: Không đảo ngữ ở mệnh đề "Only when/after/if..." mà phải đảo ngữ ở MỆNH ĐỀ CHÍNH phía sau.',
    tags: ['inversion', 'c1-grammar', 'advanced-writing', 'ielts-band8'],
    exercises: {
      multipleChoice: [
        {
          id: 'mc-only-1',
          question: 'Only when the team arrived at the venue _____ that the schedule had changed.',
          options: ['they realized', 'did they realize', 'have they realized', 'they had realized'],
          correctAnswer: 1,
          explanation: 'Đảo ngữ mệnh đề chính ở thì Quá khứ đơn: "did they realize".'
        }
      ],
      translation: [
        {
          id: 'tr-only-1',
          vietnamese: 'Chỉ khi bạn luyện tập nói hàng ngày, phản xạ giao tiếp của bạn mới được cải thiện.',
          hint: 'Only when you practice speaking daily will your communication reflexes improve.',
          suggestedEnglish: 'Only when you practice speaking every day will your conversational reflexes improve.',
          targetGrammarPoint: 'Inversion with Only when'
        }
      ]
    }
  }
];

/**
 * Helper to convert catalog item to GrammarNote for saving in Dexie
 */
export function catalogItemToGrammarNote(item: GrammarTopicItem) {
  const content = `[Công thức]: ${item.formula}\n\n[Cách dùng]: ${item.explanation}${item.notes ? `\n\n[Lưu ý]: ${item.notes}` : ''}`;
  return {
    title: item.title,
    formula: item.formula,
    explanation: item.explanation,
    notes: item.notes,
    example: item.example,
    examplesList: item.examplesList,
    content,
    tags: item.tags,
    exercises: item.exercises
  };
}
