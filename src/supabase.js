import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Supabase 클라이언트 생성 (Realtime 활성화)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// 사용자 ID 생성/가져오기 (기기별 고유 ID)
export const getUserId = () => {
  let userId = localStorage.getItem('hanuiwon_user_id')
  if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('hanuiwon_user_id', userId)
  }
  return userId
}

// 사용자 ID 설정 (다른 기기에서 동기화할 때)
export const setUserId = (newUserId) => {
  localStorage.setItem('hanuiwon_user_id', newUserId)
  return newUserId
}

// 클라우드에서 데이터 불러오기
export const loadFromCloud = async (userId) => {
  try {
    console.log('[Supabase] 데이터 로드 시도:', userId)

    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('[Supabase] 데이터 없음 (새 사용자)')
        return null
      }
      console.error('[Supabase] 로드 에러:', error)
      return null
    }

    console.log('[Supabase] 데이터 로드 성공:', data?.data?.length || 0, '명')
    return data?.data || null
  } catch (err) {
    console.error('[Supabase] 연결 실패:', err)
    return null
  }
}

// 클라우드에 데이터 저장하기
export const saveToCloud = async (userId, patients) => {
  try {
    console.log('[Supabase] 데이터 저장 시도:', patients.length, '명')

    const payload = {
      id: hashCode(userId),
      user_id: userId,
      data: patients,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('patients')
      .upsert(payload, {
        onConflict: 'id'
      })

    if (error) {
      console.error('[Supabase] 저장 에러:', error)
      return false
    }

    console.log('[Supabase] 저장 성공')
    return true
  } catch (err) {
    console.error('[Supabase] 저장 실패:', err)
    return false
  }
}

// Realtime 구독 설정
export const subscribeToChanges = (userId, onDataChange) => {
  console.log('[Supabase] Realtime 구독 시작:', userId)

  const channel = supabase
    .channel('patients-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'patients',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('[Supabase] Realtime 이벤트:', payload.eventType)
        if (payload.new && payload.new.data) {
          onDataChange(payload.new.data)
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

// 문자열을 숫자 해시로 변환 (user_id를 bigint id로)
function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}
