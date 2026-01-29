import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Supabase 클라이언트 생성
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 공유 사용자 ID (모든 기기 동일)
const SHARED_USER_ID = 'bonhyang_clinic_shared'

// 사용자 ID 반환 (항상 공유 ID)
export const getUserId = () => {
  // 기존 localStorage의 개별 user_id 삭제 (충돌 방지)
  if (localStorage.getItem('hanuiwon_user_id')) {
    localStorage.removeItem('hanuiwon_user_id')
  }
  return SHARED_USER_ID
}

// ============ CRUD 함수들 ============

// 모든 환자 불러오기
export const loadAllPatients = async (userId) => {
  try {
    console.log('[Supabase] 환자 목록 로드:', userId)

    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Supabase] 로드 에러:', error)
      return []
    }

    // 원본 데이터 확인
    if (data && data.length > 0) {
      console.log('[Supabase] 원본 row 기간:', {
        name: data[0].name,
        treatment_period: data[0].treatment_period,
        prescription_period: data[0].prescription_period,
        visit_period: data[0].visit_period
      })
    }

    // DB 컬럼명을 JS 카멜케이스로 변환
    const patients = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      chartNumber: row.chart_number || '',
      doctor: row.doctor,
      contact: row.contact,
      symptoms: row.symptoms,
      firstVisitDate: row.first_visit_date,
      treatmentStartDate: row.treatment_start_date,
      treatmentPeriod: row.treatment_period ?? 3,
      prescriptionPeriod: row.prescription_period ?? 3,
      visitPeriod: row.visit_period ?? 3,
      status: row.status || 'active',
      hasHerbal: row.has_herbal !== false, // 레거시 호환
      herbalType: row.herbal_type || '',
      herbal: row.herbal || [
        { month: 1, date: '', seoljin: false, omnifit: false },
        { month: 2, date: '', seoljin: false, omnifit: false },
        { month: 3, date: '', seoljin: false, omnifit: false },
        { month: 4, date: '', seoljin: false, omnifit: false },
        { month: 5, date: '', seoljin: false, omnifit: false },
        { month: 6, date: '', seoljin: false, omnifit: false },
      ],
      weeklyVisits: row.weekly_visits || Array(36).fill(null),
      visitInterval: row.visit_interval || '1주에 1회',
      skipWeeks: row.skip_weeks || [],
      medicineOnly: row.medicine_only || false,
      review: row.review || '',
      missedReasons: row.missed_reasons || {},
      graduationDate: row.graduation_date || '',
      createdAt: row.created_at,
    }))

    console.log('[Supabase] 로드 성공:', patients.length, '명')
    // 기간 필드 디버깅
    if (patients.length > 0) {
      console.log('[Supabase] 첫번째 환자 기간:', {
        name: patients[0].name,
        treatmentPeriod: patients[0].treatmentPeriod,
        prescriptionPeriod: patients[0].prescriptionPeriod,
        visitPeriod: patients[0].visitPeriod
      })
    }
    return patients
  } catch (err) {
    console.error('[Supabase] 연결 실패:', err)
    return []
  }
}

// 환자 추가
export const insertPatient = async (userId, patient) => {
  try {
    console.log('[Supabase] 환자 추가:', patient.name)

    const { error } = await supabase
      .from('patients')
      .insert({
        id: patient.id,
        user_id: userId,
        name: patient.name,
        chart_number: patient.chartNumber || '',
        doctor: patient.doctor,
        contact: patient.contact,
        symptoms: patient.symptoms,
        first_visit_date: patient.firstVisitDate,
        treatment_start_date: patient.treatmentStartDate,
        treatment_period: patient.treatmentPeriod,
        prescription_period: patient.prescriptionPeriod,
        visit_period: patient.visitPeriod,
        status: patient.status || 'active',
        herbal_type: patient.herbalType || '',
        herbal: patient.herbal,
        weekly_visits: patient.weeklyVisits,
        visit_interval: patient.visitInterval || '1주에 1회',
        skip_weeks: patient.skipWeeks || [],
        medicine_only: patient.medicineOnly || false,
        review: patient.review || '',
        missed_reasons: patient.missedReasons || {},
        graduation_date: patient.graduationDate || null,
        created_at: patient.createdAt,
      })

    if (error) {
      console.error('[Supabase] 추가 에러:', error)
      return false
    }

    console.log('[Supabase] 추가 성공')
    return true
  } catch (err) {
    console.error('[Supabase] 추가 실패:', err)
    return false
  }
}

// 환자 수정
export const updatePatient = async (patientId, updates) => {
  try {
    console.log('[Supabase] 환자 수정:', patientId)

    // JS 카멜케이스를 DB 스네이크케이스로 변환
    const dbUpdates = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.chartNumber !== undefined) dbUpdates.chart_number = updates.chartNumber
    if (updates.doctor !== undefined) dbUpdates.doctor = updates.doctor
    if (updates.contact !== undefined) dbUpdates.contact = updates.contact
    if (updates.symptoms !== undefined) dbUpdates.symptoms = updates.symptoms
    // 날짜 필드는 빈 문자열을 null로 변환
    if (updates.firstVisitDate !== undefined) dbUpdates.first_visit_date = updates.firstVisitDate || null
    if (updates.treatmentStartDate !== undefined) dbUpdates.treatment_start_date = updates.treatmentStartDate || null
    if (updates.treatmentPeriod !== undefined) dbUpdates.treatment_period = updates.treatmentPeriod || null
    if (updates.prescriptionPeriod !== undefined) dbUpdates.prescription_period = updates.prescriptionPeriod
    if (updates.visitPeriod !== undefined) dbUpdates.visit_period = updates.visitPeriod
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.herbalType !== undefined) dbUpdates.herbal_type = updates.herbalType
    if (updates.herbal !== undefined) dbUpdates.herbal = updates.herbal
    if (updates.weeklyVisits !== undefined) dbUpdates.weekly_visits = updates.weeklyVisits
    if (updates.visitInterval !== undefined) dbUpdates.visit_interval = updates.visitInterval
    if (updates.skipWeeks !== undefined) dbUpdates.skip_weeks = updates.skipWeeks
    if (updates.medicineOnly !== undefined) dbUpdates.medicine_only = updates.medicineOnly
    if (updates.review !== undefined) dbUpdates.review = updates.review
    if (updates.missedReasons !== undefined) dbUpdates.missed_reasons = updates.missedReasons
    // 졸업일도 빈 문자열을 null로 변환
    if (updates.graduationDate !== undefined) dbUpdates.graduation_date = updates.graduationDate || null

    dbUpdates.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('patients')
      .update(dbUpdates)
      .eq('id', patientId)

    if (error) {
      console.error('[Supabase] 수정 에러:', error)
      return false
    }

    console.log('[Supabase] 수정 성공')
    return true
  } catch (err) {
    console.error('[Supabase] 수정 실패:', err)
    return false
  }
}

// 환자 삭제
export const deletePatientFromDB = async (patientId) => {
  try {
    console.log('[Supabase] 환자 삭제:', patientId)

    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', patientId)

    if (error) {
      console.error('[Supabase] 삭제 에러:', error)
      return false
    }

    console.log('[Supabase] 삭제 성공')
    return true
  } catch (err) {
    console.error('[Supabase] 삭제 실패:', err)
    return false
  }
}

// ============ Realtime 구독 ============

// DB 행을 JS 객체로 변환
const rowToPatient = (row) => ({
  id: row.id,
  name: row.name,
  chartNumber: row.chart_number || '',
  doctor: row.doctor,
  contact: row.contact,
  symptoms: row.symptoms,
  firstVisitDate: row.first_visit_date,
  treatmentStartDate: row.treatment_start_date,
  treatmentPeriod: row.treatment_period ?? 3,
  prescriptionPeriod: row.prescription_period ?? 3,
  visitPeriod: row.visit_period ?? 3,
  status: row.status || 'active',
  hasHerbal: row.has_herbal !== false, // 레거시 호환
  herbalType: row.herbal_type || '',
  herbal: row.herbal || [],
  weeklyVisits: row.weekly_visits || Array(36).fill(null),
  visitInterval: row.visit_interval || '1주에 1회',
  skipWeeks: row.skip_weeks || [],
  medicineOnly: row.medicine_only || false,
  review: row.review || '',
  missedReasons: row.missed_reasons || {},
  graduationDate: row.graduation_date || '',
  createdAt: row.created_at,
})

// Realtime 구독 설정
export const subscribeToPatients = (userId, callbacks) => {
  console.log('[Supabase] Realtime 구독 시작:', userId)

  const channel = supabase
    .channel('patients-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'patients',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('[Supabase] INSERT 이벤트:', payload.new.name)
        if (callbacks.onInsert) {
          callbacks.onInsert(rowToPatient(payload.new))
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'patients',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('[Supabase] UPDATE 이벤트:', payload.new.name)
        if (callbacks.onUpdate) {
          callbacks.onUpdate(rowToPatient(payload.new))
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'patients',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('[Supabase] DELETE 이벤트:', payload.old.id)
        if (callbacks.onDelete) {
          callbacks.onDelete(payload.old.id)
        }
      }
    )
    .subscribe((status) => {
      console.log('[Supabase] Realtime 상태:', status)
    })

  return channel
}

// Realtime 구독 해제
export const unsubscribe = (channel) => {
  if (channel) {
    console.log('[Supabase] Realtime 구독 해제')
    supabase.removeChannel(channel)
  }
}
