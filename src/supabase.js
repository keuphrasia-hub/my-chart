import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

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

// 클라우드에서 데이터 불러오기
export const loadFromCloud = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('patients')
      .select('data')
      .eq('user_id', userId)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      console.error('클라우드 로드 에러:', error)
      return null
    }
    
    return data?.data || null
  } catch (err) {
    console.error('클라우드 연결 실패:', err)
    return null
  }
}

// 클라우드에 데이터 저장하기
export const saveToCloud = async (userId, patients) => {
  try {
    const { error } = await supabase
      .from('patients')
      .upsert({
        id: hashCode(userId),
        user_id: userId,
        data: patients,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
    
    if (error) {
      console.error('클라우드 저장 에러:', error)
      return false
    }
    
    return true
  } catch (err) {
    console.error('클라우드 저장 실패:', err)
    return false
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
