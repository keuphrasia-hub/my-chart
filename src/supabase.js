import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Supabase 클라이언트 생성
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 사용자 ID 생성/가져오기 (기기별 고유 ID)
export const getUserId = () => {
  let userId = localStorage.getItem('hanuiwon_user_id')
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('hanuiwon_user_id', userId)
  }
  return userId
}

// 사용자 ID 설정 (다른 기기 동기화용)
export const setUserId = (newUserId) => {
  localStorage.setItem('hanuiwon_user_id', newUserId)
  return newUserId
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

    // DB 컬럼명을 JS 카멜케이스로 변환
    const patients = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      doctor: row.doctor,
      contact: row.contact,
      symptoms: row.symptoms,
      firstVisitDate: row.first_visit_date,
      treatmentStartDate: row.treatment_start_date,
      treatmentPeriod: row.treatment_period,
      status: row.status || 'active',
      herbal: row.herbal || [
        { month: 1, date: '', seoljin: false, omnifit: false },
        { month: 2, date: '', seoljin: false, omnifit: false },
        { month: 3, date: '', seoljin: false, omnifit: false },
        { month: 4, date: '', seoljin: false, omnifit: false },
        { month: 5, date: '', seoljin: false, omnifit: false },
        { month: 6, date: '', seoljin: false, omnifit: false },
      ],
      weeklyVisits: row.weekly_visits || Array(24).fill(false),
      review: row.review || '',
      missedReasons: row.missed_reasons || {},
      createdAt: row.created_at,
    }))

    console.log('[Supabase] 로드 성공:', patients.length, '명')
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
        doctor: patient.doctor,
        contact: patient.contact,
        symptoms: patient.symptoms,
        first_visit_date: patient.firstVisitDate,
        treatment_start_date: patient.treatmentStartDate,
        treatment_period: patient.treatmentPeriod,
        status: patient.status || 'active',
        herbal: patient.herbal,
        weekly_visits: patient.weeklyVisits,
        review: patient.review || '',
        missed_reasons: patient.missedReasons || {},
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
    if (updates.doctor !== undefined) dbUpdates.doctor = updates.doctor
    if (updates.contact !== undefined) dbUpdates.contact = updates.contact
    if (updates.symptoms !== undefined) dbUpdates.symptoms = updates.symptoms
    if (updates.firstVisitDate !== undefined) dbUpdates.first_visit_date = updates.firstVisitDate
    if (updates.treatmentStartDate !== undefined) dbUpdates.treatment_start_date = updates.treatmentStartDate
    if (updates.treatmentPeriod !== undefined) dbUpdates.treatment_period = updates.treatmentPeriod
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.herbal !== undefined) dbUpdates.herbal = updates.herbal
    if (updates.weeklyVisits !== undefined) dbUpdates.weekly_visits = updates.weeklyVisits
    if (updates.review !== undefined) dbUpdates.review = updates.review
    if (updates.missedReasons !== undefined) dbUpdates.missed_reasons = updates.missedReasons

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
  doctor: row.doctor,
  contact: row.contact,
  symptoms: row.symptoms,
  firstVisitDate: row.first_visit_date,
  treatmentStartDate: row.treatment_start_date,
  treatmentPeriod: row.treatment_period,
  status: row.status || 'active',
  herbal: row.herbal || [],
  weeklyVisits: row.weekly_visits || [],
  review: row.review || '',
  missedReasons: row.missed_reasons || {},
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
