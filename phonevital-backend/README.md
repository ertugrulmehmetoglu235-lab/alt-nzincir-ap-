# PhoneVital Backend

Node.js + TypeScript + Fastify + Supabase (ücretsiz başlangıç)

## Kurulum Adımları

### 1. Supabase Projesi Aç (Ücretsiz)

1. [supabase.com](https://supabase.com) → New Project
2. `supabase-schema.sql` dosyasını **SQL Editor**'a yapıştırıp çalıştır
3. **Storage** → New Bucket → ad: `phonevital-reports`, Public: ✓
4. **Authentication** → Providers → Phone → SMS provider seç (Twilio veya Vonage)

### 2. .env Dosyasını Oluştur

```bash
cp .env.example .env
```

Supabase Dashboard → Settings → API'dan değerleri kopyala:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
JWT_SECRET=rastgele-guclu-bir-sifre
PORT=3000
```

### 3. Bağımlılıkları Kur ve Çalıştır

```bash
cd phonevital-backend
npm install
npm run dev
```

Sunucu: `http://localhost:3000`  
Sağlık kontrolü: `GET /health`

---

## API Endpoint'leri

### Auth
```
POST /auth/send-otp       body: { "phone": "+905xxxxxxxxx" }
POST /auth/verify-otp     body: { "phone": "+905...", "token": "123456" }
```

### Test Oturumu
```
POST /api/sessions/start          body: { "device_model": "Samsung S21", "android_version": "13" }
POST /api/sessions/:id/test       body: { "test_type": "battery", "status": "passed", "result_data": {...} }
POST /api/sessions/:id/finish     → Sağlık puanı + rapor üretilir
GET  /api/sessions/:id            → Oturum durumu
```

#### Örnek Test Verisi (battery)
```json
{
  "test_type": "battery",
  "status": "passed",
  "result_data": {
    "level": 85,
    "temperature": 32,
    "voltage": 4150,
    "health": "GOOD",
    "charge_type": "AC"
  }
}
```

#### Desteklenen Test Tipleri
`battery` · `touchscreen` · `speaker` · `microphone` · `gps` · `sensors` · `wifi` · `camera` · `storage` · `nfc` · `bluetooth` · `fingerprint`

### Raporlar
```
GET /api/reports/mine       → Kullanıcının tüm raporları
GET /api/reports/:id        → Rapor detayı
GET /api/reports/:id/pdf    → PDF indirme URL'i
```

### Eşleşmeli Tarama
```
POST /api/pairing/create          → { room_code, channel } döner
POST /api/pairing/join/:code      → Odaya katıl
GET  /api/pairing/:code           → Oda durumu
```

Flutter tarafında Supabase Realtime `pairing:{CODE}` kanalını broadcast modunda dinle.

---

## Deploy (Railway - Ücretsiz)

1. [railway.app](https://railway.app) → New Project → GitHub repoyu seç
2. Variables bölümüne `.env` değerlerini ekle
3. Otomatik deploy tamamlanır

---

## Ücretsiz Limitler

| Servis | Ücretsiz Limit |
|--------|----------------|
| Supabase DB | 500 MB |
| Supabase Auth | 50.000 kullanıcı/ay |
| Supabase Storage | 1 GB (PDF'ler) |
| Supabase Realtime | 200 eş zamanlı bağlantı |
| Railway | $5 kredi/ay |

Kullanıcı arttıkça: Supabase Pro $25/ay + Railway $5/ay = $30/ay
