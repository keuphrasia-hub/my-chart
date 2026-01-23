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
      gender: row.gender,
      age: row.age,
      firstVisitDate: row.first_visit_date,
      symptoms: row.symptoms,
      treatmentMonths: row.treatment_months,
      visitInterval: row.visit_interval,
      doctorMemo: row.doctor_memo,
      weeklyVisits: row.weekly_visits || [],
      herbalRecords: row.herbal_records || [],
      consultations: row.consultations || [],
      isCompleted: row.is_completed,
      completedDate: row.completed_date,
      hasWrittenReview: row.has_written_review,
      hasVideoInterview: row.has_video_interview,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
        gender: patient.gender,
        age: patient.age,
        first_visit_date: patient.firstVisitDate,
        symptoms: patient.symptoms,
        treatment_months: patient.treatmentMonths,
        visit_interval: patient.visitInterval,
        doctor_memo: patient.doctorMemo,
        weekly_visits: patient.weeklyVisits || [],
        herbal_records: patient.herbalRecords || [],
        consultations: patient.consultations || [],
        is_completed: patient.isCompleted || false,
        completed_date: patient.completedDate,
        has_written_review: patient.hasWrittenReview || false,
        has_video_interview: patient.hasVideoInterview || false,
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
    if (updates.gender !== undefined) dbUpdates.gender = updates.gender
    if (updates.age !== undefined) dbUpdates.age = updates.age
    if (updates.firstVisitDate !== undefined) dbUpdates.first_visit_date = updates.firstVisitDate
    if (updates.symptoms !== undefined) dbUpdates.symptoms = updates.symptoms
    if (updates.treatmentMonths !== undefined) dbUpdates.treatment_months = updates.treatmentMonths
    if (updates.visitInterval !== undefined) dbUpdates.visit_interval = updates.visitInterval
    if (updates.doctorMemo !== undefined) dbUpdates.doctor_memo = updates.doctorMemo
    if (updates.weeklyVisits !== undefined) dbUpdates.weekly_visits = updates.weeklyVisits
    if (updates.herbalRecords !== undefined) dbUpdates.herbal_records = updates.herbalRecords
    if (updates.consultations !== undefined) dbUpdates.consultations = updates.consultations
    if (updates.isCompleted !== undefined) dbUpdates.is_completed = updates.isCompleted
    if (updates.completedDate !== undefined) dbUpdates.completed_date = updates.completedDate
    if (updates.hasWrittenReview !== undefined) dbUpdates.has_written_review = updates.hasWrittenReview
    if (updates.hasVideoInterview !== undefined) dbUpdates.has_video_interview = updates.hasVideoInterview

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
  gender: row.gender,
  age: row.age,
  firstVisitDate: row.first_visit_date,
  symptoms: row.symptoms,
  treatmentMonths: row.treatment_months,
  visitInterval: row.visit_interval,
  doctorMemo: row.doctor_memo,
  weeklyVisits: row.weekly_visits || [],
  herbalRecords: row.herbal_records || [],
  consultations: row.consultations || [],
  isCompleted: row.is_completed,
  completedDate: row.completed_date,
  hasWrittenReview: row.has_written_review,
  hasVideoInterview: row.has_video_interview,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
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
