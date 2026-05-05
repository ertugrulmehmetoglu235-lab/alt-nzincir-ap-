-- PhoneVital Supabase Şeması
-- Supabase SQL Editor'da çalıştırın

-- Kullanıcılar (Supabase Auth ile entegre)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100),
  account_type TEXT DEFAULT 'individual' CHECK (account_type IN ('individual', 'dealer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Yeni Supabase Auth kaydında otomatik users satırı oluştur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Test Oturumları
CREATE TABLE IF NOT EXISTS test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_model VARCHAR(100) NOT NULL,
  android_version VARCHAR(20),
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_test_sessions_user ON test_sessions(user_id);

-- Test Sonuçları
CREATE TABLE IF NOT EXISTS test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  test_type VARCHAR(50) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'warning')),
  result_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_test_results_session ON test_results(session_id);

-- Raporlar
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  health_score INT CHECK (health_score BETWEEN 0 AND 100),
  health_grade CHAR(1) CHECK (health_grade IN ('A','B','C','D','F')),
  issues JSONB DEFAULT '[]',
  pdf_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id);

-- Eşleşmeli Tarama Odaları
CREATE TABLE IF NOT EXISTS pairing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(6) UNIQUE NOT NULL,
  initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'paired', 'completed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '15 minutes',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pairing_code ON pairing_sessions(room_code);

-- Row Level Security — Kullanıcılar sadece kendi verilerini görsün
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own"    ON users            FOR ALL USING (auth.uid() = id);
CREATE POLICY "sessions_own" ON test_sessions    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "results_own"  ON test_results     FOR ALL
  USING (session_id IN (SELECT id FROM test_sessions WHERE user_id = auth.uid()));
CREATE POLICY "reports_own"  ON reports          FOR ALL
  USING (session_id IN (SELECT id FROM test_sessions WHERE user_id = auth.uid()));
CREATE POLICY "pairing_own"  ON pairing_sessions FOR ALL
  USING (auth.uid() = initiator_id OR auth.uid() = partner_id);

-- Storage bucket: Supabase Dashboard > Storage > New Bucket
-- Bucket adı: phonevital-reports
-- Public: true
