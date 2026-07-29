GEMINI PROXY — HƯỚNG DẪN SETUP NHANH
=====================================

File này (gemini-proxy-server.js) là một server nhỏ giữ API key Gemini an
toàn phía server. Landing page KHÔNG bao giờ gọi thẳng tới Google — nó chỉ
gọi tới server này, nên không ai lấy được key từ trình duyệt.

Đã có sẵn file .env trong thư mục này — chỉ cần mở ra và điền thông tin,
KHÔNG cần gõ lệnh export/set biến môi trường thủ công nữa.

1) LẤY API KEY
   - Vào https://aistudio.google.com/apikey
   - Đăng nhập bằng tài khoản Google, tạo API key (miễn phí, có giới hạn
     request/ngày).

2) ĐIỀN FILE .env
   Mở file ".env" (cùng thư mục với file này) bằng Notepad, điền:
     GEMINI_API_KEY=key_bạn_vừa_lấy
     MESSENGER_URL=link fanpage/Messenger thật của bạn
     TELEGRAM_URL=link Telegram thật của bạn
     CONTACT_EMAIL=email liên hệ thật của bạn
   Lưu lại file.

   Khi đã điền MESSENGER_URL/TELEGRAM_URL/CONTACT_EMAIL trong .env, landing
   page sẽ TỰ ĐỘNG lấy các link này qua endpoint /config mỗi khi có người
   mở trang (miễn là bạn đã điền "AI Endpoint URL" trong admin panel trỏ
   về server này) — không cần vào admin panel nhập lại link nữa. Nếu bạn
   không chạy server này, admin panel + localStorage vẫn hoạt động bình
   thường như một nơi lưu cấu hình độc lập.

3) CHẠY THỬ TRÊN MÁY (cần cài Node.js 20.12+ tại nodejs.org — để đọc được .env)
   Trên máy có file này, mở terminal rồi chạy:
     node gemini-proxy-server.js

   Nếu thấy dòng "Gemini proxy listening on port 8787" là đã chạy thành công.
   Thử mở trình duyệt vào http://localhost:8787/health — nếu thấy
   {"ok":true,"hasKey":true} là ổn. Vào http://localhost:8787/config để
   kiểm tra 3 link Messenger/Telegram/email đã đọc đúng từ .env chưa.

   (Nếu máy bạn dùng Node cũ hơn 20.12 và không đọc được .env tự động, vẫn
   có thể set biến môi trường thủ công như cách cũ:
     Windows PowerShell:  $env:GEMINI_API_KEY="key"; node gemini-proxy-server.js
     Mac/Linux:            GEMINI_API_KEY=key node gemini-proxy-server.js  )

3) TRIỂN KHAI THẬT (để khách trên internet dùng được, không chỉ máy bạn)
   Chạy trên máy cá nhân chỉ dùng để test. Muốn website thật hoạt động
   24/7, cần đưa file này lên một nơi chạy được Node.js liên tục, ví dụ:
     - Railway.app, Render.com, Fly.io (có gói miễn phí)
     - VPS riêng (DigitalOcean, Vultr...) — chạy bằng pm2 hoặc systemd
   Ở nơi triển khai, đặt biến môi trường GEMINI_API_KEY = key của bạn
   (KHÔNG viết key thẳng vào code, không đưa key vào file gửi cho ai khác).

4) NỐI VÀO LANDING PAGE
   - Mở landing page, bấm icon bánh răng ⚙ ở footer.
   - Nhập mã truy cập .
   - Điền "AI Endpoint URL" = địa chỉ server bạn vừa deploy, ví dụ:
     https://your-app.up.railway.app/api/chat
   - Lưu lại. Khung chat AI trên trang sẽ tự chuyển sang "Đang hoạt động"
     và trả lời bằng Gemini thật. Nếu chưa điền, chat vẫn hoạt động ở
     chế độ FAQ tự động (không cần server này).

LƯU Ý BẢO MẬT
   - Không commit/chia sẻ file .env hay API key lên nơi công khai (Github
     public, nhóm chat...).
   - Nên giới hạn ALLOWED_ORIGIN (biến môi trường) về đúng domain thật
     của bạn thay vì để "*", để người khác không dùng ké server của bạn.
   - Server có giới hạn 20 request/phút/IP để tránh bị lạm dụng, có thể
     chỉnh trong gemini-proxy-server.js (biến "max" trong isRateLimited).
