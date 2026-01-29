-- ============================================
-- 데이터 마이그레이션: data JSONB → 개별 컬럼
-- ============================================

-- 1. 기존 테이블 백업 (안전을 위해)
CREATE TABLE IF NOT EXISTS patients_backup AS SELECT * FROM patients;

-- 2. 새 컬럼 추가 (없는 경우)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS chart_number TEXT DEFAULT '';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS doctor TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS herbal_type TEXT DEFAULT '';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS symptoms TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS first_visit_date DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS treatment_start_date DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS treatment_period TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS herbal JSONB DEFAULT '[]';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS weekly_visits JSONB DEFAULT '[]';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS review TEXT DEFAULT '';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS missed_reasons JSONB DEFAULT '{}';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS visit_interval TEXT DEFAULT '1주에 1회';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS skip_weeks JSONB DEFAULT '[]';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medicine_only BOOLEAN DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. data 컬럼에서 새 컬럼으로 데이터 이동
UPDATE patients SET
  name = COALESCE(data->>'name', name),
  doctor = COALESCE(data->>'doctor', doctor),
  contact = COALESCE(data->>'contact', contact),
  symptoms = COALESCE(data->>'symptoms', symptoms),
  first_visit_date = CASE
    WHEN data->>'firstVisitDate' IS NOT NULL AND data->>'firstVisitDate' != ''
    THEN (data->>'firstVisitDate')::DATE
    ELSE first_visit_date
  END,
  treatment_start_date = CASE
    WHEN data->>'treatmentStartDate' IS NOT NULL AND data->>'treatmentStartDate' != ''
    THEN (data->>'treatmentStartDate')::DATE
    ELSE treatment_start_date
  END,
  treatment_period = COALESCE(data->>'treatmentPeriod', treatment_period),
  status = COALESCE(data->>'status', status, 'active'),
  herbal = COALESCE(data->'herbal', herbal, '[]'::JSONB),
  weekly_visits = COALESCE(data->'weeklyVisits', weekly_visits, '[]'::JSONB),
  review = COALESCE(data->>'review', review, ''),
  missed_reasons = COALESCE(data->'missedReasons', missed_reasons, '{}'::JSONB),
  updated_at = NOW()
WHERE data IS NOT NULL;

-- 4. 마이그레이션 확인 (결과 조회)
SELECT
  id,
  name,
  doctor,
  contact,
  status,
  treatment_period,
  first_visit_date,
  treatment_start_date
FROM patients
LIMIT 10;

-- 5. (선택사항) 마이그레이션 완료 후 data 컬럼 삭제
-- 주의: 데이터 확인 후 실행하세요!
-- ALTER TABLE patients DROP COLUMN IF EXISTS data;

-- ============================================
-- 마이그레이션 완료!
-- 백업 테이블: patients_backup
-- ============================================
