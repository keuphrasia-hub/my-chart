-- ============================================
-- 졸업일(graduation_date) 컬럼 추가
-- ============================================

-- graduation_date 컬럼 추가
ALTER TABLE patients ADD COLUMN IF NOT EXISTS graduation_date DATE;

-- 확인
SELECT id, name, status, graduation_date FROM patients WHERE status = 'completed' LIMIT 10;

-- ============================================
-- 마이그레이션 완료!
-- ============================================
