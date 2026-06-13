# Kiến Trúc Lưu Trữ (Storage Stack) - English Extension

Tài liệu này giải thích chi tiết về quyết định chọn công nghệ lưu trữ cho Extension, tuân thủ đúng triết lý: **Local-First, Không Backend, Không chi phí Server**.

---

## 1. Dữ liệu cốt lõi (Core Data)

Bao gồm: *Từ vựng (Vocabulary), Ghi chú ngữ pháp (Grammar Notes), Lịch sử ôn tập (Review History).*
Đây là các dữ liệu có số lượng lớn (có thể lên tới hàng ngàn, chục ngàn record), yêu cầu truy vấn phức tạp (lọc theo Tag, lọc theo ngày ôn tập).

### Giải pháp lựa chọn: **IndexedDB + Dexie.js**

#### Tại sao lại là IndexedDB?
- **Dung lượng lớn**: Được thiết kế để lưu trữ lượng lớn dữ liệu có cấu trúc ở phía Client (có thể lên tới hàng trăm MB hoặc GB tùy trình duyệt).
- **Hỗ trợ Indexing (Chỉ mục)**: Cho phép tìm kiếm và truy vấn dữ liệu cực kỳ nhanh chóng mà không cần load toàn bộ dữ liệu lên bộ nhớ. Rất cần thiết cho các truy vấn như: "Tìm các từ vựng đến hạn ôn tập vào ngày hôm nay".
- **Không chặn luồng UI (Asynchronous)**: Mọi thao tác đọc/ghi đều là bất đồng bộ (async), không làm gián đoạn trải nghiệm người dùng trên trình duyệt.

#### Tại sao cần thêm Dexie.js?
- IndexedDB thuần (Native API) sử dụng các Event và Callback rất phức tạp, rườm rà.
- **Dexie.js** là một wrapper mạnh mẽ, biến mọi thao tác thành Promise (async/await), cung cấp cú pháp Fluent API dễ đọc.
- Dexie hỗ trợ **TypeScript** xuất sắc, giúp Engineer dễ dàng định nghĩa Schema và bắt lỗi ngay trong lúc code.

#### Ví dụ Truy vấn với Dexie:
```typescript
// Lấy danh sách từ vựng cần ôn tập trong ngày hôm nay
const wordsToReview = await db.words
  .where('next_review')
  .belowOrEqual(new Date())
  .toArray();

// Tìm kiếm từ vựng theo Tag
const itWords = await db.words
  .where('tags')
  .equals('it')
  .toArray();
```

---

## 2. Dữ liệu cấu hình (Preferences & Settings)

Bao gồm: *Giao diện (Light/Dark mode), API Keys (Gemini, OpenAI), Tùy chọn học tập.*
Đây là lượng dữ liệu rất nhỏ, cấu trúc đơn giản (Key-Value), nhưng lại cần tính linh hoạt cao giữa các thiết bị.

### Giải pháp lựa chọn: **chrome.storage.sync**

#### Tại sao chọn `chrome.storage.sync`?
- API chuẩn của Chrome Extensions.
- **Auto-Sync**: Điểm mạnh nhất là khả năng tự động đồng bộ hóa cấu hình qua tài khoản Google của người dùng. Nếu người dùng đăng nhập Chrome trên máy tính ở công ty và máy cá nhân, API Key và Settings của họ sẽ được tự động đồng bộ qua lại mà không cần ta phải tự viết chức năng Sync qua mạng.
- **Dung lượng giới hạn**: Chỉ lưu trữ tối đa 100KB, tối đa 8KB cho mỗi Item. Do đó **Tuyệt đối không lưu từ vựng vào đây**.

---

## 3. Đồng bộ và Sao lưu đám mây (Cloud Backup & Sync)

Vì Extension không có Backend Database (như PostgreSQL, MongoDB), dữ liệu nằm hoàn toàn ở Local của người dùng. Để tránh việc hỏng ổ cứng hoặc đổi máy dẫn đến mất dữ liệu từ vựng, ta cần cơ chế Backup/Sync không tốn phí server.

### Giải pháp lựa chọn:

#### 3.1. Manual JSON Export/Import (Tính năng cơ bản)
- Cung cấp nút để người dùng gom toàn bộ dữ liệu trong IndexedDB thành 1 chuỗi JSON và tải xuống máy (Download `backup.json`).
- Khi qua máy mới, người dùng upload file này lên để Restore.

#### 3.2. Google Drive API (Tính năng nâng cao)
- Dùng cơ chế OAuth2 (tích hợp sẵn trong `chrome.identity`).
- Xin quyền truy cập vào thư mục ẩn `appDataFolder` trên Google Drive của chính người dùng.
- Extension định kỳ ngầm đóng gói cơ sở dữ liệu IndexedDB thành file JSON và đẩy lên Google Drive.
- Khi cài Extension ở máy mới, chỉ cần ấn "Sync từ Drive" để tải file JSON về và nạp lại vào IndexedDB.
- **Lợi ích**: Backup Cloud xịn sò mà chi phí lưu trữ/băng thông do Google Drive của user chịu, Dev tốn 0 đồng.

#### 3.3. GitHub Gist (Alternative cho Developer)
- Cung cấp ô nhập **Personal Access Token (PAT)** của GitHub.
- Extension dùng Token này gọi GitHub API tạo một Secret Gist lưu trữ file JSON.
- Phù hợp với đối tượng Dev/Engineer thích kiểm soát phiên bản (Version control cho từ vựng).

---

## 4. Sơ đồ Kiến trúc Lưu trữ (Storage Architecture)

```text
┌────────────────────────────────────────────────────────┐
│                   CHROME EXTENSION                     │
├──────────────────────────┬─────────────────────────────┤
│      CORE DATA           │      SETTINGS & KEYS        │
│  (Words, Notes, SRS)     │  (Theme, Gemini API Key)    │
│                          │                             │
│   ┌──────────────────┐   │    ┌───────────────────┐    │
│   │ IndexedDB        │   │    │ chrome.storage    │    │
│   │ (via Dexie.js)   │   │    │       .sync       │    │
│   └────────┬─────────┘   │    └─────────┬─────────┘    │
└────────────┼─────────────┴──────────────┼──────────────┘
             │                            │
             │ (Manual Export/Import)     │ (Auto Sync by Chrome)
             │ (Google Drive API Sync)    │
             ▼                            ▼
  ┌──────────────────────┐      ┌──────────────────────┐
  │ Local JSON / Cloud   │      │ Google Account       │
  │ (User's Drive/Gist)  │      │ (Chrome Sync)        │
  └──────────────────────┘      └──────────────────────┘
```
