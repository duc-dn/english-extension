# English Learning Assistant - Chrome Extension

## 1. Mục tiêu

Một Chrome Extension hỗ trợ học tiếng Anh trong quá trình đọc tài liệu, làm việc và lướt web.

Đối tượng sử dụng:

- IT Engineer
- Data Engineer
- Software Engineer
- Người tự học tiếng Anh

Triết lý thiết kế:

- Local First
- Không cần backend
- Không tốn chi phí vận hành
- AI là tính năng tùy chọn
- Vẫn hoạt động đầy đủ khi không có AI

---

# 2. Kiến trúc tổng thể

```text
┌─────────────────────┐
│    Chrome Browser   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Chrome Extension   │
├─────────────────────┤
│ React + TypeScript  │
│ Vite                │
│ Ant Design          │
└──────────┬──────────┘
           │
           ├─────────────► IndexedDB (Dexie)
           │
           └─────────────► AI Provider (Optional)
                             │
                             ├─ Gemini API
                             ├─ OpenAI API
                             └─ Ollama Local
```

---

# 3. Công nghệ sử dụng

## Frontend

- React
- TypeScript
- Vite
- Ant Design

## Chrome Extension

- Manifest V3
- Content Script
- Background Service Worker
- Chrome Storage API

## Database

- IndexedDB
- Dexie.js

## AI Providers

- Gemini API
- OpenAI API
- Ollama

## Data Export

- JSON
- CSV

---

# 4. Các Module chính

## Module 1: Vocabulary Management

Quản lý từ vựng.

### Tạo từ mới

Nguồn:

- Highlight trên web
- Nhập thủ công
- Sinh từ AI

Ví dụ:

```json
{
  "id": "uuid",
  "word": "implement",
  "meaning": "triển khai",
  "example": "We implemented the solution.",
  "tags": [
    "it",
    "verb",
    "b1"
  ]
}
```

---

### Chức năng

- Create
- Update
- Delete
- Search
- Filter
- Favorite

---

## Module 2: Grammar Notes

Lưu kiến thức ngữ pháp.

Ví dụ:

```json
{
  "title": "Conditional Type 3",
  "example": "Had I known...",
  "tags": [
    "grammar",
    "conditional-type-3",
    "b2"
  ]
}
```

---

### Chức năng

- Save grammar note
- Edit note
- Search note
- Review note

---

## Module 3: Tags System

Mọi dữ liệu được gắn tag.

Không lưu folder trực tiếp.

Ví dụ:

```text
implement

Tags:
#it
#verb
#b1
```

---

### Các loại tag

#### Level

```text
a1
a2
b1
b2
c1
c2
```

#### Topic

```text
it
software
data-engineering
spark
databricks
azure
aws
sql

business
finance
meeting

daily-life
travel
food
```

#### Grammar

```text
present-perfect
passive-voice
conditional-type-3
inversion
subjunctive
```

#### Type

```text
word
phrase
sentence
grammar
```

#### Word Class

```text
noun
verb
adjective
adverb
idiom
phrasal-verb
```

---

## Module 4: Dynamic Folder System

Folder chỉ là View.

Ví dụ:

### IT English

Rule:

```text
tag contains:
it
spark
azure
databricks
sql
```

---

### B2 Vocabulary

Rule:

```text
tag contains:
b2
```

---

### Grammar

Rule:

```text
tag contains:
grammar
```

---

### Difficult Words

Rule:

```text
level >= B2
```

---

### Review Today

Rule:

```text
next_review <= today
```

---

# 5. Flashcard System

## Word Flashcard

Front:

```text
implement
```

Back:

```text
triển khai
```

---

## Grammar Flashcard

Front:

```text
Conditional Type 3
```

Back:

```text
If + Past Perfect
Would have + V3
```

---

# 6. Spaced Repetition System (SRS)

Sử dụng thuật toán tương tự Anki.

Review options:

```text
Again
Hard
Good
Easy
```

---

Ví dụ:

```text
Day 1
Day 3
Day 7
Day 14
Day 30
Day 60
```

---

Dữ liệu:

```json
{
  "review_level": 4,
  "next_review": "2026-07-01"
}
```

---

# 7. Quiz System

## Multiple Choice

Ví dụ:

```text
implement nghĩa là gì?

A. triển khai
B. xóa
C. hủy
D. gửi
```

---

## Fill In Blank

```text
We _____ the solution yesterday.
```

---

## Grammar Quiz

```text
Câu này thuộc loại điều kiện nào?
```

---

# 8. AI Module (Optional)

## Mục tiêu

Nếu không có API Key:

Extension vẫn hoạt động.

Nếu có API Key:

Mở khóa tính năng AI.

---

## Hỗ trợ Provider

### Gemini

User nhập:

```text
Gemini API Key
```

---

### OpenAI

User nhập:

```text
OpenAI API Key
```

---

### Ollama

```text
http://localhost:11434
```

Không cần API Key.

---

# 9. AI Features

## Explain Word

Input:

```text
implement
```

Output:

- Meaning
- IPA
- Example
- CEFR Level

---

## Explain Sentence

Input:

```text
Had I known about the issue,
I would have fixed it earlier.
```

Output:

### Translation

```text
Nếu tôi biết vấn đề này...
```

### Grammar

```text
Conditional Type 3
```

### Why

```text
Tại sao dùng cấu trúc này
```

### Vocabulary

```text
had known
issue
fixed
```

---

## Explain Grammar

Input:

```text
I have been working here for five years.
```

Output:

### Tense

```text
Present Perfect Continuous
```

### Why

```text
Hành động bắt đầu trong quá khứ
và kéo dài đến hiện tại
```

---

## Explain Technical English

Input:

```text
Partition pruning can reduce query costs.
```

Output:

### English Meaning

### Vietnamese Translation

### Technical Explanation

```text
Partition pruning giúp Spark
đọc ít dữ liệu hơn.
```

---

## Auto Tag Generation

Input:

```text
partition pruning
```

Output:

```json
[
  "it",
  "spark",
  "data-engineering",
  "b2"
]
```

---

## Folder Suggestion

Input:

```text
stakeholder
```

Output:

```text
Business English
```

---

## AI Quiz Generation

Sinh câu hỏi chất lượng hơn.

Ví dụ:

```text
Which sentence correctly uses "implement"?
```

---

# 10. User Workflow

## Học từ mới

```text
Đọc website
    ↓
Highlight
    ↓
Save Word
    ↓
AI Generate Tags
    ↓
Save IndexedDB
    ↓
Xuất hiện trong Folder tương ứng
```

---

## Học ngữ pháp

```text
Highlight Sentence
      ↓
Explain Grammar
      ↓
Save Grammar Note
      ↓
Generate Tags
      ↓
Grammar Folder
```

---

## Ôn tập

```text
Review Today
      ↓
Flashcards
      ↓
Quiz
      ↓
Update SRS
      ↓
Calculate Next Review
```

---

# 11. Database Schema

## Words

```typescript
Word
{
    id: string
    word: string
    meaning: string
    example: string

    tags: string[]

    review_level: number
    next_review: Date

    created_at: Date
}
```

---

## Grammar Notes

```typescript
GrammarNote
{
    id: string

    title: string
    content: string
    example: string

    tags: string[]

    review_level: number
    next_review: Date

    created_at: Date
}
```

---

## Review History

```typescript
ReviewHistory
{
    id: string

    item_id: string

    result:
      | "again"
      | "hard"
      | "good"
      | "easy"

    reviewed_at: Date
}
```

---

## Settings

```typescript
Settings
{
    ai_provider: string

    gemini_api_key?: string

    openai_api_key?: string

    ollama_url?: string
}
```

---

# 12. Backup & Restore

## Export

Xuất toàn bộ dữ liệu:

```text
english-learning-backup.json
```

Bao gồm:

- Words
- Grammar Notes
- Review History
- Settings

---

## Import

Import lại từ file backup.

---

# 13. Roadmap

## Phase 1 (MVP)

- Vocabulary
- Tags
- Dynamic Folder
- Flashcard
- SRS
- Import/Export

---

## Phase 2

- AI Explain Word
- AI Explain Sentence
- AI Generate Tags
- AI Grammar Notes

---

## Phase 3

- Quiz System
- Technical English Mode
- Statistics Dashboard
- Auto Detect New Words

---

## Phase 4

- YouTube Subtitle Support
- Context-Aware Learning
- Cloud Sync (Optional)

---

# 14. Ý tưởng bổ sung & Tính năng mở rộng (Suggested Features)

Dưới đây là một số ý tưởng bổ sung để làm phong phú thêm trải nghiệm cho đối tượng Software/Data Engineer và người tự học:

## 14.1. Capture Context (Lưu ngữ cảnh tự động)
- **Tự động lưu source**: Khi highlight và lưu từ vựng trên web, extension tự động lưu lại URL, Tiêu đề trang (Page Title), và cả **đoạn văn bản chứa từ đó** (Context sentence/paragraph). Người dùng IT thường học qua tài liệu, lưu lại ngữ cảnh gốc rất quan trọng.
- **Domain Auto-tagging**: Tự động nhận diện trang web (VD: github.com -> tag `#github`, stackoverflow.com -> tag `#stackoverflow`, medium.com -> tag `#article`) để tự động phân loại.
- **Lưu kèm Code Snippet**: Hỗ trợ lưu một đoạn code liên quan đến từ vựng (ví dụ: học từ `deprecated` trong một đoạn code Java/Python, lưu kèm luôn block code đó làm ví dụ).

## 14.2. Quick In-page Tooltip (Trải nghiệm liền mạch)
- **Floating Action**: Khi người dùng bôi đen văn bản trên bất kỳ trang web nào, hiển thị một nút (tooltip) nhỏ gọn tại con trỏ chuột.
- **1-Click Save**: Bấm vào tooltip để dịch nhanh, gọi AI giải thích, hoặc "Lưu nhanh" vào Database (Inbox) mà không cần mở popup chính của extension làm gián đoạn luồng công việc.

## 14.3. Phát âm & Luyện nói (Web Speech API)
- **Text-to-Speech (TTS)**: Sử dụng Web Speech API có sẵn của Chrome (hoàn toàn miễn phí, offline) để phát âm từ vựng và đọc câu ví dụ.
- **Shadowing (Luyện đọc theo)**: Sử dụng Speech Recognition API để thu âm giọng đọc của user và kiểm tra xem có khớp với từ/câu mẫu hay không.

## 14.4. Thống kê phong cách Developer (Gamification)
- **GitHub-style Heatmap**: Hiển thị biểu đồ rải rác (contribution heatmap) màu xanh lá cây đếm số lượng từ đã học hoặc số lượt review SRS mỗi ngày, kích thích tâm lý giữ chuỗi (streak).
- **Metrics**: Thống kê tỷ lệ nhớ từ, số lượng từ thuộc các nhóm tag khác nhau (bao nhiêu từ #IT, bao nhiêu từ #daily-life).

## 14.5. Export & Sync Nâng cao
- **Sync to Notion / Obsidian**: Bên cạnh Export JSON/CSV, hỗ trợ Webhook hoặc tích hợp API để đẩy từ vựng thẳng vào Notion Database hoặc Obsidian Vault - hai công cụ mà dân IT cực kỳ ưa chuộng.
- **Markdown Export**: Hỗ trợ copy dữ liệu dạng chuẩn Markdown để dán đi bất cứ đâu.

## 14.6. Passive Learning (Học thụ động)
- **New Tab Dashboard**: Tùy chọn thay thế trang New Tab mặc định của Chrome bằng giao diện học tập:
  - Hiển thị 1 từ vựng đến hạn cần review (SRS).
  - Hoặc 1 câu tiếng Anh chuyên ngành ngẫu nhiên.
  - Tracking Heatmap.
- **Pomodoro Flashcards**: Kết hợp đồng hồ Pomodoro. Mỗi khi đến giờ nghỉ giải lao 5 phút, extension hiển thị 5 thẻ flashcard ngẫu nhiên để người dùng ôn tập.

## 14.7. PDF & Local Docs Support
- Extension mặc định không hoạt động trên file PDF local (file:///...). Cần cấu hình thêm quyền trong Manifest và hướng dẫn user bật "Allow access to file URLs" để họ có thể highlight và học từ mới ngay trên các file PDF tài liệu kỹ thuật tải về máy.

---

# 15. Các Màn Hình Giao Diện Chính (UI Screens)

Để quản lý lượng dữ liệu từ vựng ngày càng lớn, Extension cần tổ chức các màn hình sao cho khoa học và thuận tiện:

## 15.1. In-page Tooltip & Quick Action (Trải nghiệm tại chỗ)
Hiển thị đè lên trang web đang đọc.
- **Tính năng**: Hiện popup nhỏ xíu ngay chỗ văn bản được bôi đen.
- **Nút bấm**: Dịch nhanh, Hỏi AI, Lưu vào Inbox.

## 15.2. Extension Popup (Trải nghiệm nhanh)
Giao diện hiện ra khi người dùng click vào icon của Extension ở góc phải trên trình duyệt.
- **Tính năng**: 
  - Xem tóm tắt hôm nay cần ôn tập bao nhiêu từ.
  - Ô nhập liệu để thêm từ mới/câu mới thủ công một cách nhanh chóng.
  - Nút mở ra **Full Web Dashboard**.

## 15.3. Full Web Dashboard (Màn hình Quản lý chính)
Đây là màn hình ứng dụng đầy đủ (mở ra trong một Tab mới của trình duyệt). Đây chính là nơi tập trung các thao tác **Quản lý từ vựng**:

### A. Dashboard & Analytics
- Biểu đồ Heatmap (GitHub style) theo dõi thói quen học tập.
- Tổng quan dữ liệu: Tổng số từ, Tổng số tag, Số từ đến hạn ôn.
- Lối tắt truy cập các **Dynamic Folders** (như folder IT English, B2 Vocabulary,...).

### B. Vocabulary Manager (Màn Quản Lý Từ Vựng)
Là một màn hình hiển thị dữ liệu dạng Bảng (Table Data Grid) chuyên nghiệp (sử dụng Ant Design Table):
- **Cột dữ liệu**: Từ vựng, Ý nghĩa, Tags, Level (A1-C2), Lịch review tiếp theo (Next Review Date).
- **Bộ lọc (Filters)**: Cực mạnh với khả năng lọc theo Tag, Level, Trạng thái SRS, Ngày thêm.
- **Tìm kiếm (Search)**: Tìm kiếm real-time.
- **Bulk Actions**: Chọn nhiều từ vựng cùng lúc để Xóa, Đổi Tag hàng loạt, Cập nhật thông tin hàng loạt (rất cần cho thao tác dọn dẹp).
- **Import/Export**: Nút cho phép nhập/xuất dữ liệu dạng JSON/CSV.

### C. Grammar Notes Manager
- Màn hình quản lý các thẻ ngữ pháp.
- Giao diện hai cột: Cột trái là danh sách các Note, cột phải hiển thị chi tiết bài học ngữ pháp (Rich Text/Markdown).

### D. Flashcard & Review Mode
- Giao diện toàn màn hình, tối giản (Zen Mode) chỉ tập trung vào thẻ Flashcard.
- Hiển thị mặt trước, bấm để lật thẻ, hiển thị 4 nút chấm điểm (Again, Hard, Good, Easy) cùng phím tắt bàn phím (1, 2, 3, 4) để thao tác nhanh như Anki.
