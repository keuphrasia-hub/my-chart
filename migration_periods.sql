-- ============================================
-- 기간 관리 컬럼 추가 (처방기간, 내원기간)
-- ============================================

-- prescription_period 컬럼 추가 (처방기간: 0~6개월)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS prescription_period INTEGER DEFAULT 3;

-- visit_period 컬럼 추가 (내원기간: 0~6개월)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS visit_period INTEGER DEFAULT 3;

-- 기존 환자 데이터 마이그레이션 (hasHerbal, medicineOnly 기반)
-- hasHerbal = false → prescription_period = 0
UPDATE patients SET prescription_period = 0 WHERE has_herbal = false;

-- medicineOnly = true → visit_period = 0
UPDATE patients SET visit_period = 0 WHERE medicine_only = true;

-- 확인
SELECT id, name, treatment_period, prescription_period, visit_period FROM patients LIMIT 10;

-- ============================================
-- 마이그레이션 완료!
-- ============================================
