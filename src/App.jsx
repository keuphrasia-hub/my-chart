import React, { useState, useEffect, useRef } from 'react'
import { getUserId, loadAllPatients, insertPatient, updatePatient as updatePatientInDB, deletePatientFromDB, subscribeToPatients, unsubscribe } from './supabase'

// localStorage 키
const STORAGE_KEY = 'bonhyang_patients_v12'

// 앱 시작 시 기존 캐시 정리
const cleanupOldCache = () => {
  // 이전 버전 데이터 삭제
  const keysToRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (
      key.startsWith('bonhyang_patients_v') && key !== STORAGE_KEY ||
      key === 'hanuiwon_user_id' ||
      key.startsWith('bonhyang_migrated') ||
      key.startsWith('bonhyang_clean')
    )) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
}

cleanupOldCache()

// 초기 데이터 로드
const loadPatients = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? JSON.parse(saved) : []
}

// 데이터 저장
const savePatients = (patients) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patients))
}

// 오늘 날짜 (YYYY-MM-DD)
const getTodayDate = () => new Date().toISOString().split('T')[0]

// 날짜 포맷 (M/D) - 앞에 0 없이
const formatDateShort = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// 연도-주차 계산 (ISO week)
const getYearWeek = (date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  const year = d.getFullYear()
  return { year, week: weekNo, code: `${String(year).slice(2)}${String(weekNo).padStart(2, '0')}` }
}

// 오늘의 연도-주차
const getTodayYearWeek = () => getYearWeek(new Date())

// 치료 시작일 기준 N주차의 연도-주차 계산
const getWeekYearCode = (treatmentStartDate, weekIndex) => {
  if (!treatmentStartDate) return ''
  const startDate = new Date(treatmentStartDate)
  const targetDate = new Date(startDate)
  targetDate.setDate(startDate.getDate() + (weekIndex * 7))
  return getYearWeek(targetDate).code
}

// 오늘의 연도-주차 코드
const getTodayWeekCode = () => getYearWeek(new Date()).code

// 치료 시작일 기준 현재 몇 주차인지 계산 (오늘 날짜의 주차 코드와 비교)
const getCurrentWeekIndex = (treatmentStartDate) => {
  if (!treatmentStartDate) return -1
  const todayCode = getTodayWeekCode()

  // 각 주차의 코드를 계산해서 오늘 코드와 일치하는 주차 찾기
  for (let i = 0; i < 24; i++) {
    const weekCode = getWeekYearCode(treatmentStartDate, i)
    if (weekCode === todayCode) {
      return i
    }
  }
  return -1
}

// 치료기간 옵션 (개월)
const TREATMENT_MONTHS_OPTIONS = [0, 1, 2, 3, 4, 5, 6]

// 주 옵션
const TREATMENT_WEEKS_OPTIONS = [0, 1, 2, 3, 4]

// 회 옵션
const VISITS_OPTIONS = [0, 1, 2, 3]

// 치료기간 문자열 파싱
const parseTreatmentPeriod = (period) => {
  if (!period) return { months: 0, weeks: 0, visits: 0 }
  const monthMatch = period.match(/(\d+)개월/)
  const weekMatch = period.match(/(\d+)주/)
  const visitMatch = period.match(/(\d+)회/)
  return {
    months: monthMatch ? parseInt(monthMatch[1]) : 0,
    weeks: weekMatch ? parseInt(weekMatch[1]) : 0,
    visits: visitMatch ? parseInt(visitMatch[1]) : 0
  }
}

// 치료기간 문자열 생성
const formatTreatmentPeriod = (months, weeks, visits) => {
  if (months === 0 && weeks === 0 && visits === 0) return ''
  return `${months}개월 ${weeks}주에 ${visits}회`
}

// 탭 종류
const TABS = [
  { key: 'active', label: '진행중' },
  { key: 'completed', label: '치료졸업' },
  { key: 'dropout', label: '이탈' },
]

// 후기 옵션
const REVIEW_OPTIONS = [
  { value: '', label: '선택' },
  { value: 'written', label: '수기후기만' },
  { value: 'video_public', label: '공개영상+수기' },
  { value: 'video_private', label: '비공개영상+수기' },
]

// 진료실 옵션
const ROOM_OPTIONS = ['1진료실', '2진료실', '3진료실']

// 치료기간에서 개월 수 추출
const getTreatmentMonths = (treatmentPeriod) => {
  if (!treatmentPeriod) return 6 // 기본값 6개월
  const match = treatmentPeriod.match(/(\d+)개월/)
  return match ? parseInt(match[1]) : 6
}

// 비밀번호 설정
const CORRECT_PASSWORD = 'qhsgid!@!@'
const AUTH_KEY = 'bonhyang_auth'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem(AUTH_KEY) === 'true'
  })
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)

  const [patients, setPatients] = useState(loadPatients)
  const [syncStatus, setSyncStatus] = useState('idle')

  // 공유 userId (항상 동일)
  const userId = getUserId()
  const [showAddModal, setShowAddModal] = useState(false)
  const [filterDoctor, setFilterDoctor] = useState('전체')
  const [activeTab, setActiveTab] = useState('active')
  const [selectedPatient, setSelectedPatient] = useState(null) // 세부정보 모달용
  const [missedReasonModal, setMissedReasonModal] = useState(null) // { patientId, weekIdx, reason }
  const [isListCollapsed, setIsListCollapsed] = useState(false) // 목록 접기/펼치기
  const [visibleRows, setVisibleRows] = useState(10) // 표시할 행 수
  
  // 새 환자 폼 - 모든 hooks는 조건문 전에 선언
  const [newPatient, setNewPatient] = useState({
    doctor: '',
    firstVisitDate: getTodayDate(),
    treatmentStartDate: getTodayDate(),
    name: '',
    chartNumber: '',
    contact: '',
    symptoms: '',
    treatmentPeriod: '',
    hasHerbal: true, // 탕약/환약 처방 여부 (기본: 처방받음)
  })

  const channelRef = useRef(null)
  const isSavingRef = useRef(false)
  const debounceRef = useRef(null)


  // 초기 로드 - 인증 후에도 실행되도록 isAuthenticated 의존성 추가
  useEffect(() => {
    if (!isAuthenticated) return // 로그인 안됐으면 실행 안함

    const initCloud = async () => {
      setSyncStatus('syncing')

      // userId는 항상 'bonhyang_clinic_shared' (getUserId()로 가져옴)
      const cloudData = await loadAllPatients(userId)
      if (cloudData && cloudData.length > 0) {
        const currentLocal = loadPatients()
        if (currentLocal.length === 0) {
          setPatients(cloudData)
          savePatients(cloudData)
        } else if (cloudData.length !== currentLocal.length) {
          const useCloud = confirm(
            `클라우드에 ${cloudData.length}명, 로컬에 ${currentLocal.length}명의 데이터가 있습니다.\n확인: 클라우드 데이터 사용\n취소: 로컬 데이터 유지`
          )
          if (useCloud) {
            setPatients(cloudData)
            savePatients(cloudData)
          }
        }
      }
      setSyncStatus('synced')

      // Realtime 구독
      channelRef.current = subscribeToPatients(userId, {
        onInsert: (newPatient) => {
          if (!isSavingRef.current) {
            setPatients(prev => {
              if (prev.find(p => p.id === newPatient.id)) return prev
              const updated = [newPatient, ...prev]
              savePatients(updated)
              return updated
            })
          }
        },
        onUpdate: (updatedPatient) => {
          if (!isSavingRef.current) {
            setPatients(prev => {
              const updated = prev.map(p => p.id === updatedPatient.id ? updatedPatient : p)
              savePatients(updated)
              return updated
            })
          }
        },
        onDelete: (deletedId) => {
          if (!isSavingRef.current) {
            setPatients(prev => {
              const updated = prev.filter(p => p.id !== deletedId)
              savePatients(updated)
              return updated
            })
          }
        }
      })
    }
    initCloud()
    return () => {
      if (channelRef.current) unsubscribe(channelRef.current)
    }
  }, [isAuthenticated])

  // 로컬 저장
  useEffect(() => {
    savePatients(patients)
  }, [patients])

  // 환자 추가
  const handleAddPatient = async () => {
    if (!newPatient.name.trim()) {
      alert('환자명을 입력해주세요.')
      return
    }

    const patient = {
      id: Date.now(),
      ...newPatient,
      status: 'active', // 진행중
      hasHerbal: newPatient.hasHerbal, // 탕약/환약 처방 여부
      herbal: [
        { month: 1, date: '', seoljin: false, omnifit: false },
        { month: 2, date: '', seoljin: false, omnifit: false },
        { month: 3, date: '', seoljin: false, omnifit: false },
        { month: 4, date: '', seoljin: false, omnifit: false },
        { month: 5, date: '', seoljin: false, omnifit: false },
        { month: 6, date: '', seoljin: false, omnifit: false },
      ],
      weeklyVisits: Array(24).fill(false),
      review: '',
      createdAt: new Date().toISOString(),
    }

    setPatients(prev => [patient, ...prev])

    if (userId) {
      setSyncStatus('syncing')
      isSavingRef.current = true
      await insertPatient(userId, patient)
      isSavingRef.current = false
      setSyncStatus('synced')
    }

    setNewPatient({
      doctor: '',
      firstVisitDate: getTodayDate(),
      treatmentStartDate: getTodayDate(),
      name: '',
      chartNumber: '',
      contact: '',
      symptoms: '',
      treatmentPeriod: '',
      hasHerbal: true,
    })
    setShowAddModal(false)
  }

  // 환자 업데이트 (디바운스)
  const updatePatientField = (patientId, field, value) => {
    setPatients(prev => prev.map(p =>
      p.id === patientId ? { ...p, [field]: value } : p
    ))

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (userId) {
        isSavingRef.current = true
        await updatePatientInDB(patientId, { [field]: value })
        isSavingRef.current = false
      }
    }, 1000)
  }

  // 탕약 체크 토글
  const toggleHerbal = (patientId, monthIndex, field) => {
    const patient = patients.find(p => p.id === patientId)
    if (!patient) return

    const defaultHerbal = [
      { month: 1, date: '', seoljin: false, omnifit: false },
      { month: 2, date: '', seoljin: false, omnifit: false },
      { month: 3, date: '', seoljin: false, omnifit: false },
      { month: 4, date: '', seoljin: false, omnifit: false },
      { month: 5, date: '', seoljin: false, omnifit: false },
      { month: 6, date: '', seoljin: false, omnifit: false },
    ]
    const newHerbal = [...(patient.herbal?.length === 6 ? patient.herbal : defaultHerbal)]

    if (field === 'date') {
      newHerbal[monthIndex] = { ...newHerbal[monthIndex], date: getTodayDate() }
    } else {
      newHerbal[monthIndex] = { ...newHerbal[monthIndex], [field]: !newHerbal[monthIndex][field] }
    }

    updatePatientField(patientId, 'herbal', newHerbal)
  }

  // 주차 내원 토글
  const toggleWeeklyVisit = (patientId, weekIndex) => {
    const patient = patients.find(p => p.id === patientId)
    if (!patient) return

    const newWeekly = [...(patient.weeklyVisits || Array(24).fill(false))]
    newWeekly[weekIndex] = !newWeekly[weekIndex]
    updatePatientField(patientId, 'weeklyVisits', newWeekly)
  }

  // 환자 삭제
  const deletePatient = async (patientId) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    setPatients(prev => prev.filter(p => p.id !== patientId))
    if (userId) {
      isSavingRef.current = true
      await deletePatientFromDB(patientId)
      isSavingRef.current = false
    }
  }

  // 담당의 목록 (필터용)
  const doctors = ['전체', ...ROOM_OPTIONS]

  // 필터링된 환자 (탭 + 담당의)
  const filteredPatients = patients
    .filter(p => {
      const status = p.status || 'active'
      return status === activeTab
    })
    .filter(p => filterDoctor === '전체' || p.doctor === filterDoctor)
    .sort((a, b) => {
      // 최신 데이터가 위로 (치료시작일 기준)
      const dateA = new Date(a.treatmentStartDate || a.firstVisitDate || a.createdAt)
      const dateB = new Date(b.treatmentStartDate || b.firstVisitDate || b.createdAt)
      return dateB - dateA
    })

  // 탭별 환자 수
  const tabCounts = {
    active: patients.filter(p => (p.status || 'active') === 'active').length,
    completed: patients.filter(p => p.status === 'completed').length,
    dropout: patients.filter(p => p.status === 'dropout').length,
  }

  // 동기화 상태
  const getSyncStatus = () => {
    switch (syncStatus) {
      case 'syncing': return { icon: '↻', text: '동기화 중', color: 'text-stone-500' }
      case 'synced': return { icon: '✓', text: '동기화됨', color: 'text-stone-600' }
      case 'error': return { icon: '!', text: '오류', color: 'text-red-600' }
      default: return { icon: '○', text: '대기', color: 'text-stone-400' }
    }
  }
  const sync = getSyncStatus()

  // 비밀번호 확인
  const handleLogin = (e) => {
    e.preventDefault()
    if (password === CORRECT_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true')
      setIsAuthenticated(true)
      setPasswordError(false)
    } else {
      setPasswordError(true)
      setPassword('')
    }
  }

  // 로그인 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full">
          <div className="flex flex-col items-center mb-6">
            <img
              src="/본향한의원세로형JPG.jpg"
              alt="본향한의원"
              className="h-20 w-auto mb-4"
            />
            <h1 className="text-xl font-bold text-stone-800">특화환자 관리</h1>
            <p className="text-sm text-stone-500 mt-1">비밀번호를 입력하세요</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordError(false)
                }}
                placeholder="비밀번호"
                className={`w-full px-4 py-3 border rounded-lg text-center text-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent ${
                  passwordError ? 'border-red-500 bg-red-50' : 'border-stone-300'
                }`}
                autoFocus
              />
              {passwordError && (
                <p className="text-red-500 text-sm text-center mt-2">비밀번호가 틀렸습니다</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-stone-700 text-white rounded-lg hover:bg-stone-800 transition font-medium"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-100">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-stone-200 sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/본향한의원세로형JPG.jpg"
              alt="본향한의원"
              className="h-10 w-auto"
            />
            <h1 className="text-xl font-bold text-stone-800">본향한의원 특화환자 관리</h1>
            <span className={`flex items-center gap-1 text-xs ${sync.color}`}>
              <span className={syncStatus === 'syncing' ? 'animate-spin' : ''}>{sync.icon}</span>
              {sync.text}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterDoctor}
              onChange={(e) => setFilterDoctor(e.target.value)}
              className="px-3 py-1.5 border border-stone-300 rounded-lg text-sm"
            >
              {doctors.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-800 transition text-sm font-medium"
            >
              + 환자 등록
            </button>
          </div>
        </div>
        {/* 탭 */}
        <div className="px-4 pb-2 flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-stone-700 text-white'
                  : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
              }`}
            >
              {tab.label} ({tabCounts[tab.key]})
            </button>
          ))}
        </div>
      </header>

      {/* 메인 테이블 */}
      <main className="p-4">
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 sticky top-0">
                {/* 섹션 제목 행 */}
                <tr className="bg-stone-200">
                  {/* 상태 - 3행 병합, 고정열 */}
                  <th rowSpan={3} className="sticky left-0 bg-stone-300 z-10 px-2 py-2 text-center font-bold text-stone-700 align-middle min-w-[60px] w-[60px] whitespace-nowrap">상태</th>
                  {/* 환자명 - 3행 병합, 고정열 */}
                  <th rowSpan={3} className="sticky left-[60px] bg-stone-300 z-10 px-2 py-2 text-center font-bold text-stone-700 align-middle min-w-[80px] whitespace-nowrap">환자명</th>
                  {/* 차트번호 - 3행 병합, 고정열 */}
                  <th rowSpan={3} className="sticky left-[140px] bg-stone-300 z-10 px-2 py-2 text-center font-bold text-stone-700 align-middle min-w-[80px] whitespace-nowrap border-r border-stone-400">차트번호</th>
                  <th colSpan={5} className="bg-stone-300 border-r-2 border-stone-400 px-2 py-2 text-center font-bold text-stone-700">
                    기본정보
                  </th>
                  <th colSpan={18} className="px-2 py-2 text-center font-bold text-amber-800 bg-amber-100 border-r-2 border-stone-400">
                    탕약/환약관리
                  </th>
                  <th rowSpan={2} colSpan={24} className="px-2 py-2 text-center font-bold text-blue-800 bg-blue-100 border-r-2 border-stone-400 align-middle">
                    치료내원관리
                  </th>
                  <th rowSpan={3} className="px-2 py-2 text-center font-bold text-stone-700 bg-stone-300 border-r-2 border-stone-400 align-middle whitespace-nowrap">후기</th>
                  <th rowSpan={3} className="px-2 py-2 text-center font-bold text-stone-700 bg-stone-300 align-middle whitespace-nowrap">삭제</th>
                </tr>
                {/* 컬럼 헤더 행 */}
                <tr>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-stone-700 whitespace-nowrap align-middle bg-stone-100">담당원장</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-stone-700 whitespace-nowrap align-middle bg-stone-100">초진일</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-stone-700 whitespace-nowrap align-middle bg-stone-100">연락처</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-stone-700 whitespace-nowrap min-w-[100px] align-middle bg-stone-100">증상</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-stone-700 whitespace-nowrap border-r-2 border-stone-400 align-middle bg-stone-100">치료기간</th>
                  {/* 탕약 복약 현황 - 6개월 */}
                  {[1, 2, 3, 4, 5, 6].map(m => (
                    <th key={`herb-${m}`} colSpan={3} className={`px-2 py-1 text-center font-medium text-stone-700 bg-amber-50 ${m < 6 ? 'border-r border-amber-200' : 'border-r-2 border-stone-400'}`}>
                      {m}개월
                    </th>
                  ))}
                </tr>
                {/* 서브헤더 행 */}
                <tr className="bg-stone-50 text-xs">
                  {/* 탕약 서브헤더 - 각 월별로 날짜/설진/옴니핏 (개별 셀) */}
                  {[1, 2, 3, 4, 5, 6].map(m => (
                    <React.Fragment key={`h-${m}-sub`}>
                      <th className="px-1 py-1 text-center text-stone-500 bg-amber-50 min-w-[36px]">날짜</th>
                      <th className="px-1 py-1 text-center text-stone-500 bg-amber-50 min-w-[32px]">설진</th>
                      <th className={`px-1 py-1 text-center text-stone-500 bg-amber-50 min-w-[32px] ${m < 6 ? 'border-r border-amber-200' : 'border-r-2 border-stone-400'}`}>옴니</th>
                    </React.Fragment>
                  ))}
                  {/* 주차 번호 */}
                  {Array.from({ length: 24 }, (_, i) => (
                    <th
                      key={i}
                      className={`px-1 py-1 text-center text-stone-500 min-w-[38px] whitespace-nowrap bg-blue-50 ${i === 23 ? 'border-r-2 border-stone-400' : ''}`}
                    >
                      {i + 1}주
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={100} className="px-4 py-12 text-center text-stone-400">
                      {activeTab === 'active' && '진행중인 환자가 없습니다.'}
                      {activeTab === 'completed' && '치료졸업 환자가 없습니다.'}
                      {activeTab === 'dropout' && '이탈 환자가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  (isListCollapsed ? filteredPatients.slice(0, visibleRows) : filteredPatients).map(patient => {
                    const defaultHerbal = [
                      { month: 1, date: '', seoljin: false, omnifit: false },
                      { month: 2, date: '', seoljin: false, omnifit: false },
                      { month: 3, date: '', seoljin: false, omnifit: false },
                      { month: 4, date: '', seoljin: false, omnifit: false },
                      { month: 5, date: '', seoljin: false, omnifit: false },
                      { month: 6, date: '', seoljin: false, omnifit: false },
                    ]
                    const herbal = patient.herbal?.length === 6 ? patient.herbal : defaultHerbal
                    const weekly = patient.weeklyVisits || Array(24).fill(false)
                    const currentWeekIdx = getCurrentWeekIndex(patient.treatmentStartDate)
                    const treatmentMonths = getTreatmentMonths(patient.treatmentPeriod)
                    const treatmentWeeks = treatmentMonths * 4 // 1개월 = 4주
                    const patientHasHerbal = patient.hasHerbal !== false // 기본값 true (기존 환자 호환)

                    const handleRowClick = (e) => {
                      // input, select, button, label 클릭 시에는 모달 열지 않음
                      const tag = e.target.tagName.toUpperCase()
                      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'LABEL') return
                      // 부모 요소가 input/select/button인 경우도 체크
                      if (e.target.closest('input, select, button, label')) return
                      setSelectedPatient(patient)
                    }

                    return (
                      <tr
                        key={patient.id}
                        className="group cursor-pointer transition-all duration-200 hover:bg-gradient-to-r hover:from-stone-100/60 hover:via-white/80 hover:to-stone-100/60 hover:backdrop-blur-sm hover:shadow-[inset_0_0_20px_rgba(120,113,108,0.1)]"
                        onClick={handleRowClick}
                      >
                        {/* 상태 - 1열 고정 */}
                        <td className="px-2 py-2 text-center sticky left-0 bg-white z-10 group-hover:bg-stone-100/70 transition-colors duration-200 min-w-[60px] w-[60px]">
                          <select
                            value={patient.status || 'active'}
                            onChange={(e) => updatePatientField(patient.id, 'status', e.target.value)}
                            className={`px-2 py-1 rounded text-xs font-medium cursor-pointer text-center ${
                              patient.status === 'completed' ? 'bg-green-100 text-green-700' :
                              patient.status === 'dropout' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}
                          >
                            <option value="active">진행중</option>
                            <option value="completed">졸업</option>
                            <option value="dropout">이탈</option>
                          </select>
                        </td>
                        {/* 환자명 - 2열 고정 */}
                        <td className="px-2 py-2 text-center font-medium sticky left-[60px] bg-white z-10 group-hover:bg-stone-100/70 transition-colors duration-200">
                          <span className="px-1 py-1 text-sm font-medium text-amber-800 hover:text-amber-900">
                            {patient.name || '(이름없음)'}
                          </span>
                        </td>
                        {/* 차트번호 - 3열 고정 */}
                        <td className="px-2 py-2 text-center sticky left-[140px] bg-white z-10 group-hover:bg-stone-100/70 transition-colors duration-200 border-r border-stone-400">
                          <input
                            type="text"
                            value={patient.chartNumber || ''}
                            onChange={(e) => updatePatientField(patient.id, 'chartNumber', e.target.value)}
                            className="w-20 px-1 py-1 border border-transparent hover:border-stone-300 rounded text-sm text-center focus:border-stone-400 focus:outline-none"
                            placeholder="-"
                          />
                        </td>
                        {/* 담당원장 */}
                        <td className="px-2 py-2 text-center">
                          <select
                            value={patient.doctor || ''}
                            onChange={(e) => updatePatientField(patient.id, 'doctor', e.target.value)}
                            className="w-20 px-1 py-1 border border-transparent hover:border-stone-300 rounded text-sm text-center focus:border-stone-400 focus:outline-none cursor-pointer bg-transparent"
                          >
                            <option value="">-</option>
                            {ROOM_OPTIONS.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </td>
                        {/* 초진일 */}
                        <td className="px-2 py-2 text-center">
                          <input
                            type="date"
                            value={patient.firstVisitDate || ''}
                            onChange={(e) => updatePatientField(patient.id, 'firstVisitDate', e.target.value)}
                            className="w-32 px-1 py-1 border border-transparent hover:border-stone-300 rounded text-sm focus:border-stone-400 focus:outline-none cursor-pointer"
                          />
                        </td>
                        {/* 연락처 */}
                        <td className="px-2 py-2 text-center">
                          <input
                            type="text"
                            value={patient.contact || ''}
                            onChange={(e) => updatePatientField(patient.id, 'contact', e.target.value)}
                            className="w-28 px-1 py-1 border border-transparent hover:border-stone-300 rounded text-sm text-center focus:border-stone-400 focus:outline-none"
                            placeholder="010-0000-0000"
                          />
                        </td>
                        {/* 증상 */}
                        <td className="px-2 py-2 text-center">
                          <input
                            type="text"
                            value={patient.symptoms || ''}
                            onChange={(e) => updatePatientField(patient.id, 'symptoms', e.target.value)}
                            className="w-24 px-1 py-1 border border-transparent hover:border-stone-300 rounded text-sm text-center focus:border-stone-400 focus:outline-none"
                          />
                        </td>
                        {/* 치료기간 - 개월/주/회 드롭다운 */}
                        <td className="px-2 py-2 text-center border-r-2 border-stone-400">
                          <div className="flex items-center justify-center gap-0.5">
                            <select
                              value={parseTreatmentPeriod(patient.treatmentPeriod).months}
                              onChange={(e) => {
                                const current = parseTreatmentPeriod(patient.treatmentPeriod)
                                updatePatientField(patient.id, 'treatmentPeriod', formatTreatmentPeriod(parseInt(e.target.value), current.weeks, current.visits))
                              }}
                              className="w-12 px-0.5 py-1 border border-transparent hover:border-stone-300 rounded text-xs text-center focus:border-stone-400 focus:outline-none cursor-pointer bg-transparent"
                            >
                              {TREATMENT_MONTHS_OPTIONS.map(m => (
                                <option key={m} value={m}>{m}개월</option>
                              ))}
                            </select>
                            <select
                              value={parseTreatmentPeriod(patient.treatmentPeriod).weeks}
                              onChange={(e) => {
                                const current = parseTreatmentPeriod(patient.treatmentPeriod)
                                updatePatientField(patient.id, 'treatmentPeriod', formatTreatmentPeriod(current.months, parseInt(e.target.value), current.visits))
                              }}
                              className="w-12 px-0.5 py-1 border border-transparent hover:border-stone-300 rounded text-xs text-center focus:border-stone-400 focus:outline-none cursor-pointer bg-transparent"
                            >
                              {TREATMENT_WEEKS_OPTIONS.map(w => (
                                <option key={w} value={w}>{w}주</option>
                              ))}
                            </select>
                            <select
                              value={parseTreatmentPeriod(patient.treatmentPeriod).visits}
                              onChange={(e) => {
                                const current = parseTreatmentPeriod(patient.treatmentPeriod)
                                updatePatientField(patient.id, 'treatmentPeriod', formatTreatmentPeriod(current.months, current.weeks, parseInt(e.target.value)))
                              }}
                              className="w-12 px-0.5 py-1 border border-transparent hover:border-stone-300 rounded text-xs text-center focus:border-stone-400 focus:outline-none cursor-pointer bg-transparent"
                            >
                              {VISITS_OPTIONS.map(v => (
                                <option key={v} value={v}>{v}회</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        {/* 탕약 복약 현황 (6개월) - 각 월별로 날짜/설진/옴니핏 (개별 셀) */}
                        {[0, 1, 2, 3, 4, 5].map(monthIdx => {
                          const isDisabled = !patientHasHerbal || monthIdx >= treatmentMonths // 탕약처방 안받으면 전체 비활성화
                          const hasDate = herbal[monthIdx]?.date
                          return (
                            <React.Fragment key={`${patient.id}-herb-${monthIdx}`}>
                              {/* 날짜 */}
                              <td className={`px-1 py-2 text-center ${isDisabled ? 'bg-stone-200/70' : 'bg-amber-50/50'}`}>
                                {isDisabled ? (
                                  <span className="text-xs text-stone-400 opacity-30">-</span>
                                ) : hasDate ? (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const input = e.currentTarget.parentElement.querySelector('input')
                                      if (input) input.showPicker()
                                    }}
                                    className="text-[11px] font-medium text-stone-600 cursor-pointer hover:text-amber-700"
                                  >
                                    {formatDateShort(herbal[monthIdx].date)}
                                  </span>
                                ) : (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const input = e.currentTarget.parentElement.querySelector('input')
                                      if (input) input.showPicker()
                                    }}
                                    className="text-stone-300 cursor-pointer hover:text-stone-500 text-sm"
                                  >
                                    +
                                  </span>
                                )}
                                <input
                                  type="date"
                                  value={herbal[monthIdx]?.date || ''}
                                  onChange={(e) => {
                                    e.stopPropagation()
                                    const newHerbal = [...herbal]
                                    newHerbal[monthIdx] = { ...newHerbal[monthIdx], date: e.target.value }
                                    updatePatientField(patient.id, 'herbal', newHerbal)
                                  }}
                                  className="sr-only"
                                />
                              </td>
                              {/* 설진 */}
                              <td className={`px-1 py-2 text-center ${isDisabled ? 'bg-stone-200/70' : 'bg-amber-50/50'}`}>
                                <input
                                  type="checkbox"
                                  checked={herbal[monthIdx]?.seoljin || false}
                                  onChange={() => toggleHerbal(patient.id, monthIdx, 'seoljin')}
                                  disabled={isDisabled}
                                  className={`w-4 h-4 rounded border-stone-300 text-stone-600 focus:ring-stone-500 ${isDisabled ? 'opacity-30' : ''}`}
                                />
                              </td>
                              {/* 옴니핏 */}
                              <td className={`px-1 py-2 text-center ${isDisabled ? 'bg-stone-200/70' : 'bg-amber-50/50'} ${monthIdx < 5 ? 'border-r border-amber-100' : 'border-r-2 border-stone-400'}`}>
                                <input
                                  type="checkbox"
                                  checked={herbal[monthIdx]?.omnifit || false}
                                  onChange={() => toggleHerbal(patient.id, monthIdx, 'omnifit')}
                                  disabled={isDisabled}
                                  className={`w-4 h-4 rounded border-stone-300 text-stone-600 focus:ring-stone-500 ${isDisabled ? 'opacity-30' : ''}`}
                                />
                              </td>
                            </React.Fragment>
                          )
                        })}
                        {/* 주차별 내원 */}
                        {Array.from({ length: 24 }, (_, weekIdx) => {
                          const isCurrentWeek = weekIdx === currentWeekIdx
                          const yearWeekCode = getWeekYearCode(patient.treatmentStartDate, weekIdx)
                          const isDisabled = weekIdx >= treatmentWeeks
                          const isPastWeek = currentWeekIdx >= 0 && weekIdx < currentWeekIdx
                          const isVisited = weekly[weekIdx]
                          const isMissed = isPastWeek && !isVisited && !isDisabled
                          const missedReasons = patient.missedReasons || {}
                          const hasMissedReason = missedReasons[weekIdx]

                          return (
                            <td
                              key={weekIdx}
                              onClick={(e) => {
                                if (isMissed) {
                                  e.stopPropagation()
                                  setMissedReasonModal({
                                    patientId: patient.id,
                                    weekIdx,
                                    reason: missedReasons[weekIdx] || ''
                                  })
                                }
                              }}
                              className={`px-1 py-1 text-center relative transition-all duration-150 ${
                                isDisabled
                                  ? 'bg-stone-200/70'
                                  : isMissed
                                    ? 'bg-red-50 cursor-pointer hover:bg-gradient-to-b hover:from-stone-100/60 hover:via-white/80 hover:to-stone-100/60 hover:shadow-[inset_0_0_10px_rgba(120,113,108,0.15)]'
                                    : isCurrentWeek
                                      ? 'bg-green-100'
                                      : 'bg-blue-50/30'
                              } ${weekIdx === 23 ? 'border-r-2 border-stone-400' : ''}`}
                            >
                              {isDisabled ? (
                                <div className="flex flex-col items-center opacity-30">
                                  <input type="checkbox" disabled className="w-4 h-4 rounded border-stone-300" />
                                  <span className="text-[9px] text-stone-400 mt-0.5">-</span>
                                </div>
                              ) : isMissed ? (
                                <div className="flex flex-col items-center">
                                  <span
                                    className={`text-red-500 font-bold text-sm ${hasMissedReason ? 'underline' : ''}`}
                                    title={hasMissedReason || '미내원 사유 입력'}
                                  >
                                    ✕
                                  </span>
                                  {yearWeekCode && (
                                    <span className="text-[9px] text-red-400 mt-0.5">{yearWeekCode}</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center">
                                  <input
                                    type="checkbox"
                                    checked={weekly[weekIdx] || false}
                                    onChange={() => toggleWeeklyVisit(patient.id, weekIdx)}
                                    className={`w-4 h-4 rounded border-stone-300 focus:ring-stone-500 ${
                                      isCurrentWeek ? 'text-green-600' : 'text-stone-600'
                                    }`}
                                  />
                                  {yearWeekCode && (
                                    <span className="text-[9px] text-stone-400 mt-0.5">{yearWeekCode}</span>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                        {/* 후기 - 드롭다운 */}
                        <td className="px-2 py-2 text-center border-r-2 border-stone-400">
                          <select
                            value={patient.review || ''}
                            onChange={(e) => updatePatientField(patient.id, 'review', e.target.value)}
                            className={`w-28 px-1 py-1 border border-transparent hover:border-stone-300 rounded text-xs text-center focus:border-stone-400 focus:outline-none cursor-pointer bg-transparent ${
                              patient.review === 'video_public' ? 'text-green-600 font-medium' :
                              patient.review === 'video_private' ? 'text-blue-600 font-medium' :
                              patient.review === 'written' ? 'text-amber-600 font-medium' : ''
                            }`}
                          >
                            {REVIEW_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        {/* 삭제 */}
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); deletePatient(patient.id) }}
                            className="text-stone-400 hover:text-red-500 transition"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
                {/* 접기/펼치기 버튼 행 */}
                {filteredPatients.length > visibleRows && (
                  <tr>
                    <td colSpan={100} className="px-4 py-3 text-center bg-stone-50 border-t-2 border-stone-200">
                      <button
                        onClick={() => setIsListCollapsed(!isListCollapsed)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded-lg text-sm font-medium text-stone-700 transition"
                      >
                        {isListCollapsed ? (
                          <>
                            <span>펼치기</span>
                            <span className="text-stone-500">({filteredPatients.length - visibleRows}명 더보기)</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </>
                        ) : (
                          <>
                            <span>접기</span>
                            <span className="text-stone-500">({visibleRows}명만 표시)</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 통계 및 접기 컨트롤 */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-4 text-sm text-stone-600">
            <span>현재 탭: <strong className="text-stone-800">{filteredPatients.length}</strong>명</span>
            {isListCollapsed && filteredPatients.length > visibleRows && (
              <>
                <span className="text-stone-400">|</span>
                <span>표시 중: <strong className="text-stone-800">{Math.min(visibleRows, filteredPatients.length)}</strong>명</span>
              </>
            )}
            <span className="text-stone-400">|</span>
            <span>전체: <strong className="text-stone-800">{patients.length}</strong>명</span>
            <span className="text-stone-400">|</span>
            <span>오늘: {getTodayYearWeek().code} ({getTodayYearWeek().year}년 {getTodayYearWeek().week}주차)</span>
          </div>
          {/* 표시 행 수 설정 */}
          {filteredPatients.length > 5 && (
            <div className="flex items-center gap-2 text-sm text-stone-600">
              <span>표시 행 수:</span>
              <select
                value={visibleRows}
                onChange={(e) => setVisibleRows(Number(e.target.value))}
                className="px-2 py-1 border border-stone-300 rounded text-sm"
              >
                <option value={5}>5개</option>
                <option value={10}>10개</option>
                <option value={15}>15개</option>
                <option value={20}>20개</option>
                <option value={30}>30개</option>
              </select>
              <button
                onClick={() => setIsListCollapsed(!isListCollapsed)}
                className={`px-3 py-1 rounded text-sm font-medium transition ${
                  isListCollapsed
                    ? 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                    : 'bg-stone-700 text-white hover:bg-stone-800'
                }`}
              >
                {isListCollapsed ? '전체 보기' : '접기 모드'}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* 환자 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-stone-800">새 환자 등록</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">담당 원장</label>
                <select
                  value={newPatient.doctor || ''}
                  onChange={(e) => setNewPatient({ ...newPatient, doctor: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                >
                  <option value="">선택</option>
                  {ROOM_OPTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">환자명 *</label>
                <input
                  type="text"
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">차트번호</label>
                <input
                  type="text"
                  value={newPatient.chartNumber}
                  onChange={(e) => setNewPatient({ ...newPatient, chartNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent"
                  placeholder="예: 12345"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">연락처</label>
                <input
                  type="text"
                  value={newPatient.contact}
                  onChange={(e) => setNewPatient({ ...newPatient, contact: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent"
                  placeholder="010-0000-0000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">초진일</label>
                <input
                  type="date"
                  value={newPatient.firstVisitDate}
                  onChange={(e) => setNewPatient({ ...newPatient, firstVisitDate: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">치료시작일</label>
                <input
                  type="date"
                  value={newPatient.treatmentStartDate}
                  onChange={(e) => setNewPatient({ ...newPatient, treatmentStartDate: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">증상</label>
                <input
                  type="text"
                  value={newPatient.symptoms}
                  onChange={(e) => setNewPatient({ ...newPatient, symptoms: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">치료기간</label>
                <div className="flex gap-2">
                  <select
                    value={parseTreatmentPeriod(newPatient.treatmentPeriod).months}
                    onChange={(e) => {
                      const current = parseTreatmentPeriod(newPatient.treatmentPeriod)
                      setNewPatient({ ...newPatient, treatmentPeriod: formatTreatmentPeriod(parseInt(e.target.value), current.weeks, current.visits) })
                    }}
                    className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                  >
                    {TREATMENT_MONTHS_OPTIONS.map(m => (
                      <option key={m} value={m}>{m}개월</option>
                    ))}
                  </select>
                  <select
                    value={parseTreatmentPeriod(newPatient.treatmentPeriod).weeks}
                    onChange={(e) => {
                      const current = parseTreatmentPeriod(newPatient.treatmentPeriod)
                      setNewPatient({ ...newPatient, treatmentPeriod: formatTreatmentPeriod(current.months, parseInt(e.target.value), current.visits) })
                    }}
                    className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                  >
                    {TREATMENT_WEEKS_OPTIONS.map(w => (
                      <option key={w} value={w}>{w}주</option>
                    ))}
                  </select>
                  <select
                    value={parseTreatmentPeriod(newPatient.treatmentPeriod).visits}
                    onChange={(e) => {
                      const current = parseTreatmentPeriod(newPatient.treatmentPeriod)
                      setNewPatient({ ...newPatient, treatmentPeriod: formatTreatmentPeriod(current.months, current.weeks, parseInt(e.target.value)) })
                    }}
                    className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                  >
                    {VISITS_OPTIONS.map(v => (
                      <option key={v} value={v}>{v}회</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPatient.hasHerbal}
                    onChange={(e) => setNewPatient({ ...newPatient, hasHerbal: e.target.checked })}
                    className="w-4 h-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm font-medium text-stone-700">탕약/환약 처방</span>
                  <span className="text-xs text-stone-500">(체크 해제 시 내원치료만)</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={handleAddPatient}
                className="flex-1 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-800 transition"
              >
                등록
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setNewPatient({
                    doctor: '',
                    firstVisitDate: getTodayDate(),
                    treatmentStartDate: getTodayDate(),
                    name: '',
                    chartNumber: '',
                    contact: '',
                    symptoms: '',
                    treatmentPeriod: '',
                    hasHerbal: true,
                  })
                }}
                className="flex-1 py-2 bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300 transition"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 환자 세부정보 모달 */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-stone-800">환자 세부정보</h3>
              <button
                onClick={() => setSelectedPatient(null)}
                className="text-stone-400 hover:text-stone-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* 기본 정보 */}
              <div className="bg-stone-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-stone-700 border-b border-stone-200 pb-2">기본 정보</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">환자명</label>
                    <input
                      type="text"
                      value={selectedPatient.name || ''}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, name: e.target.value }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'name', e.target.value)
                      }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">차트번호</label>
                    <input
                      type="text"
                      value={selectedPatient.chartNumber || ''}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, chartNumber: e.target.value }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'chartNumber', e.target.value)
                      }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent"
                      placeholder="예: 12345"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">담당 원장</label>
                    <select
                      value={selectedPatient.doctor || ''}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, doctor: e.target.value }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'doctor', e.target.value)
                      }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                    >
                      <option value="">선택</option>
                      {ROOM_OPTIONS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">연락처</label>
                    <input
                      type="text"
                      value={selectedPatient.contact || ''}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, contact: e.target.value }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'contact', e.target.value)
                      }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent"
                      placeholder="010-0000-0000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">증상</label>
                    <input
                      type="text"
                      value={selectedPatient.symptoms || ''}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, symptoms: e.target.value }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'symptoms', e.target.value)
                      }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* 치료 정보 */}
              <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-blue-700 border-b border-blue-200 pb-2">치료 정보</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">초진일</label>
                    <input
                      type="date"
                      value={selectedPatient.firstVisitDate || ''}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, firstVisitDate: e.target.value }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'firstVisitDate', e.target.value)
                      }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">치료시작일</label>
                    <input
                      type="date"
                      value={selectedPatient.treatmentStartDate || ''}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, treatmentStartDate: e.target.value }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'treatmentStartDate', e.target.value)
                      }}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">치료기간</label>
                    <div className="flex gap-2">
                      <select
                        value={parseTreatmentPeriod(selectedPatient.treatmentPeriod).months}
                        onChange={(e) => {
                          const current = parseTreatmentPeriod(selectedPatient.treatmentPeriod)
                          const newPeriod = formatTreatmentPeriod(parseInt(e.target.value), current.weeks, current.visits)
                          const updated = { ...selectedPatient, treatmentPeriod: newPeriod }
                          setSelectedPatient(updated)
                          updatePatientField(selectedPatient.id, 'treatmentPeriod', newPeriod)
                        }}
                        className="flex-1 px-2 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                      >
                        {TREATMENT_MONTHS_OPTIONS.map(m => (
                          <option key={m} value={m}>{m}개월</option>
                        ))}
                      </select>
                      <select
                        value={parseTreatmentPeriod(selectedPatient.treatmentPeriod).weeks}
                        onChange={(e) => {
                          const current = parseTreatmentPeriod(selectedPatient.treatmentPeriod)
                          const newPeriod = formatTreatmentPeriod(current.months, parseInt(e.target.value), current.visits)
                          const updated = { ...selectedPatient, treatmentPeriod: newPeriod }
                          setSelectedPatient(updated)
                          updatePatientField(selectedPatient.id, 'treatmentPeriod', newPeriod)
                        }}
                        className="flex-1 px-2 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                      >
                        {TREATMENT_WEEKS_OPTIONS.map(w => (
                          <option key={w} value={w}>{w}주</option>
                        ))}
                      </select>
                      <select
                        value={parseTreatmentPeriod(selectedPatient.treatmentPeriod).visits}
                        onChange={(e) => {
                          const current = parseTreatmentPeriod(selectedPatient.treatmentPeriod)
                          const newPeriod = formatTreatmentPeriod(current.months, current.weeks, parseInt(e.target.value))
                          const updated = { ...selectedPatient, treatmentPeriod: newPeriod }
                          setSelectedPatient(updated)
                          updatePatientField(selectedPatient.id, 'treatmentPeriod', newPeriod)
                        }}
                        className="flex-1 px-2 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer"
                      >
                        {VISITS_OPTIONS.map(v => (
                          <option key={v} value={v}>{v}회</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">상태</label>
                    <select
                      value={selectedPatient.status || 'active'}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, status: e.target.value }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'status', e.target.value)
                      }}
                      className={`w-full px-3 py-2 rounded-lg text-sm cursor-pointer ${
                        selectedPatient.status === 'completed' ? 'bg-green-100 text-green-700 border-green-300' :
                        selectedPatient.status === 'dropout' ? 'bg-red-100 text-red-700 border-red-300' :
                        'bg-blue-100 text-blue-700 border-blue-300'
                      } border`}
                    >
                      <option value="active">진행중</option>
                      <option value="completed">졸업</option>
                      <option value="dropout">이탈</option>
                    </select>
                  </div>
                </div>
                {/* 탕약/환약 처방 여부 */}
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPatient.hasHerbal !== false}
                      onChange={(e) => {
                        const updated = { ...selectedPatient, hasHerbal: e.target.checked }
                        setSelectedPatient(updated)
                        updatePatientField(selectedPatient.id, 'hasHerbal', e.target.checked)
                      }}
                      className="w-4 h-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-sm font-medium text-stone-700">탕약/환약 처방</span>
                    <span className="text-xs text-stone-500">(체크 해제 시 내원치료만)</span>
                  </label>
                </div>
              </div>

              {/* 후기 */}
              <div className="bg-amber-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-amber-700 border-b border-amber-200 pb-2">후기</h4>
                <select
                  value={selectedPatient.review || ''}
                  onChange={(e) => {
                    const updated = { ...selectedPatient, review: e.target.value }
                    setSelectedPatient(updated)
                    updatePatientField(selectedPatient.id, 'review', e.target.value)
                  }}
                  className={`w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent cursor-pointer ${
                    selectedPatient.review === 'video_public' ? 'bg-green-50 text-green-700' :
                    selectedPatient.review === 'video_private' ? 'bg-blue-50 text-blue-700' :
                    selectedPatient.review === 'written' ? 'bg-amber-50 text-amber-700' : ''
                  }`}
                >
                  {REVIEW_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* 현재 주차 정보 */}
              {selectedPatient.treatmentStartDate && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-700 border-b border-green-200 pb-2 mb-2">진행 현황</h4>
                  <div className="text-sm text-green-800">
                    <p>오늘: <strong>{getTodayYearWeek().code}</strong> ({getTodayYearWeek().year}년 {getTodayYearWeek().week}주차)</p>
                    {getCurrentWeekIndex(selectedPatient.treatmentStartDate) >= 0 && (
                      <p>치료 <strong>{getCurrentWeekIndex(selectedPatient.treatmentStartDate) + 1}주차</strong> 진행 중</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={() => setSelectedPatient(null)}
                className="flex-1 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-800 transition"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  if (confirm('정말 삭제하시겠습니까?')) {
                    deletePatient(selectedPatient.id)
                    setSelectedPatient(null)
                  }
                }}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 미내원 사유 입력 모달 */}
      {missedReasonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-stone-800">미내원 사유</h3>
              <button
                onClick={() => setMissedReasonModal(null)}
                className="text-stone-400 hover:text-stone-600 text-xl"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-stone-500">
              {missedReasonModal.weekIdx + 1}주차 미내원 사유를 입력하세요.
            </p>
            <textarea
              value={missedReasonModal.reason}
              onChange={(e) => setMissedReasonModal({ ...missedReasonModal, reason: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent"
              placeholder="예: 개인 사정, 출장, 건강 문제 등"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const patient = patients.find(p => p.id === missedReasonModal.patientId)
                  if (patient) {
                    const newMissedReasons = { ...(patient.missedReasons || {}), [missedReasonModal.weekIdx]: missedReasonModal.reason }
                    updatePatientField(missedReasonModal.patientId, 'missedReasons', newMissedReasons)
                  }
                  setMissedReasonModal(null)
                }}
                className="flex-1 py-2 bg-stone-700 text-white rounded-lg hover:bg-stone-800 transition"
              >
                저장
              </button>
              <button
                onClick={() => {
                  // 내원으로 변경
                  toggleWeeklyVisit(missedReasonModal.patientId, missedReasonModal.weekIdx)
                  setMissedReasonModal(null)
                }}
                className="flex-1 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition"
              >
                내원으로 변경
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
