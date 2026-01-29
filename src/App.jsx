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
  for (let i = 0; i < 36; i++) {
    const weekCode = getWeekYearCode(treatmentStartDate, i)
    if (weekCode === todayCode) {
      return i
    }
  }
  return -1
}

// 마지막 내원 주차 찾기 (졸업일 계산용)
const getLastVisitWeekIndex = (weeklyVisits) => {
  if (!weeklyVisits || !Array.isArray(weeklyVisits)) return -1
  // 뒤에서부터 true인 주차 찾기
  for (let i = weeklyVisits.length - 1; i >= 0; i--) {
    if (weeklyVisits[i] === true) return i
  }
  return -1
}

// 마지막 내원일 계산 (치료시작일 + 마지막 내원 주차)
const getLastVisitDate = (treatmentStartDate, weeklyVisits) => {
  if (!treatmentStartDate) return null
  const lastWeekIdx = getLastVisitWeekIndex(weeklyVisits)
  if (lastWeekIdx < 0) return null

  const startDate = new Date(treatmentStartDate)
  const lastDate = new Date(startDate)
  lastDate.setDate(startDate.getDate() + (lastWeekIdx * 7))
  return lastDate.toISOString().split('T')[0]
}

// 기간 옵션 (개월) - 0~9개월
const PERIOD_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

// 치료간격 - 주수 옵션 (1~4주)
const INTERVAL_WEEKS_OPTIONS = [1, 2, 3, 4]

// 치료간격 - 내원횟수 옵션 (1~6회)
const INTERVAL_VISITS_OPTIONS = [1, 2, 3, 4, 5, 6]

// 치료간격 파싱 (예: "2주에 3회" -> { weeks: 2, visits: 3 })
const parseVisitIntervalFull = (interval) => {
  if (!interval) return { weeks: 1, visits: 1 }
  const weekMatch = interval.match(/(\d+)주/)
  const visitMatch = interval.match(/(\d+)회/)
  return {
    weeks: weekMatch ? parseInt(weekMatch[1]) : 1,
    visits: visitMatch ? parseInt(visitMatch[1]) : 1
  }
}

// 기간에서 개월 수 파싱 (기본값 3개월)
const parseMonths = (period, defaultVal = 3) => {
  if (period === undefined || period === null) return defaultVal
  if (typeof period === 'number') return period
  const match = String(period).match(/(\d+)/)
  return match ? parseInt(match[1]) : defaultVal
}

// 치료간격에서 주 간격 파싱 (몇 주에 1회)
const parseVisitInterval = (interval) => {
  if (!interval) return 1 // 기본값 매주
  const match = interval.match(/(\d+)주/)
  return match ? parseInt(match[1]) : 1
}

// 탭 종류
const TABS = [
  { key: 'active', label: '진행중' },
  { key: 'completed', label: '치료졸업' },
  { key: 'dropout', label: '이탈' },
  { key: 'other', label: '기타' },
]

// 후기 옵션
const REVIEW_OPTIONS = [
  { value: '', label: '선택' },
  { value: 'written', label: '수기후기만' },
  { value: 'video_public', label: '공개영상+수기' },
  { value: 'video_private', label: '비공개영상+수기' },
]

// 담당 원장 옵션
const ROOM_OPTIONS = ['권고은', '박수경', '3진료실']

// 탕약/환약 타입 옵션
const HERBAL_TYPE_OPTIONS = [
  { value: '', label: '-' },
  { value: 'tang', label: '탕약' },
  { value: 'hwan', label: '환약' },
]

// 기간에서 개월 수 추출 (레거시 호환)
const getTreatmentMonths = (period) => parseMonths(period, 3)

// 해당 주차가 내원 예정 주차인지 확인 (치료간격 기준)
// intervalWeeks: 몇 주에, intervalVisits: 몇 회
// 예: 2주에 3회 -> 0,1주 내원, 2주 스킵, 3,4주 내원, 5주 스킵...
const isScheduledWeek = (weekIndex, intervalWeeks, intervalVisits, skipWeeks = []) => {
  // skipWeeks에 포함되어 있으면 스킵
  if (skipWeeks.includes(weekIndex)) return false

  // intervalWeeks 주 동안 intervalVisits 회 내원
  // 예: 2주에 1회 -> 0주 내원, 1주 스킵, 2주 내원, 3주 스킵...
  // 예: 1주에 1회 -> 매주 내원
  // 예: 4주에 2회 -> 0,1주 내원, 2,3주 스킵, 4,5주 내원, 6,7주 스킵...

  const cycleLength = intervalWeeks // 한 사이클 = intervalWeeks 주
  const positionInCycle = weekIndex % cycleLength // 사이클 내 위치

  // intervalVisits 회를 cycleLength 주에 분배
  // 앞쪽 intervalVisits 주에 내원
  return positionInCycle < intervalVisits
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

  const [patients, setPatients] = useState([])  // 빈 배열로 시작, 서버에서 덮어씀
  const [syncStatus, setSyncStatus] = useState('idle')

  // 공유 userId (항상 동일)
  const userId = getUserId()
  const [showAddModal, setShowAddModal] = useState(false)
  const [filterDoctor, setFilterDoctor] = useState('전체')
  const [activeTab, setActiveTab] = useState('active')
  const [searchQuery, setSearchQuery] = useState('') // 검색어
  const [selectedPatient, setSelectedPatient] = useState(null) // 세부정보 모달용
  const [editedPatient, setEditedPatient] = useState(null) // 수정 중인 환자 데이터
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false) // 저장 안된 변경사항
  const [missedReasonModal, setMissedReasonModal] = useState(null) // { patientId, weekIdx, reason }
  const [isListCollapsed, setIsListCollapsed] = useState(false) // 목록 접기/펼치기
  const [visibleRows, setVisibleRows] = useState(10) // 표시할 행 수
  
  // 새 환자 폼 - 모든 hooks는 조건문 전에 선언
  const [newPatient, setNewPatient] = useState({
    doctor: '',
    treatmentStartDate: getTodayDate(),
    name: '',
    chartNumber: '',
    contact: '',
    symptoms: '',
    treatmentPeriod: 3, // 치료기간 (전체 관리 기간) 0~6개월
    prescriptionPeriod: 3, // 처방기간 (약 복용 기간) 0~6개월, 0=내원치료만
    visitPeriod: 3, // 치료내원기간 0~6개월, 0=약만복용
    visitInterval: '1주에 1회', // 기본 매주 1회
    herbalType: '', // 탕약/환약 종류
  })

  const channelRef = useRef(null)
  const isSavingRef = useRef(false)
  const debounceRef = useRef(null)
  const scrollContainerRef = useRef(null) // 가로스크롤 컨테이너

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (missedReasonModal) setMissedReasonModal(null)
        else if (selectedPatient) setSelectedPatient(null)
        else if (showAddModal) setShowAddModal(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [showAddModal, selectedPatient, missedReasonModal])

  // 초기 로드 - 인증 후에도 실행되도록 isAuthenticated 의존성 추가
  useEffect(() => {
    if (!isAuthenticated) return // 로그인 안됐으면 실행 안함

    const initCloud = async () => {
      setSyncStatus('syncing')

      // userId는 항상 'bonhyang_clinic_shared' (getUserId()로 가져옴)
      const cloudData = await loadAllPatients(userId)

      // 로컬 대조 없이 무조건 서버 데이터로 덮어쓰기
      if (cloudData) {
        setPatients([...cloudData])  // 새 배열 복사본
        savePatients(cloudData)      // localStorage 즉시 동기화
      }

      setSyncStatus('synced')

      // Realtime 구독
      channelRef.current = subscribeToPatients(userId, {
        onInsert: (newPatient) => {
          setPatients(prev => {
            if (prev.find(p => p.id === newPatient.id)) return prev
            const newList = [newPatient, ...prev]  // 새 배열
            savePatients(newList)
            return [...newList]  // 새 배열 복사본 반환
          })
        },
        onUpdate: (updatedPatient) => {
          console.log('[Realtime] onUpdate 수신:', updatedPatient.name, updatedPatient)
          // 저장 중이면 무시 (내가 방금 저장한 데이터의 콜백)
          if (isSavingRef.current) {
            console.log('[Realtime] isSavingRef=true, 무시')
            return
          }
          setPatients(prev => {
            const existing = prev.find(p => p.id === updatedPatient.id)
            if (!existing) return prev
            // 서버 데이터로 덮어쓰기 (기존 데이터와 merge하여 누락 필드 보존)
            const merged = { ...existing, ...updatedPatient }
            console.log('[Realtime] merged:', merged.herbal, merged.weeklyVisits)
            const updated = prev.map(p =>
              p.id === updatedPatient.id ? merged : p
            )
            const newList = [...updated]
            savePatients(newList)
            return newList
          })
        },
        onDelete: (deletedId) => {
          setPatients(prev => {
            const filtered = prev.filter(p => p.id !== deletedId)
            const newList = [...filtered]  // 새 배열 복사본
            savePatients(newList)
            return newList
          })
        }
      })
    }
    initCloud()
    return () => {
      if (channelRef.current) unsubscribe(channelRef.current)
    }
  }, [isAuthenticated])

  // 로컬 저장 useEffect 제거 - 서버 동기화 시점에만 savePatients 호출

  // 서버에서 강제 새로고침
  const refreshFromServer = async () => {
    if (syncStatus === 'syncing') return  // 이미 동기화 중이면 무시

    setSyncStatus('syncing')
    const cloudData = await loadAllPatients(userId)

    if (cloudData) {
      setPatients([...cloudData])
      savePatients(cloudData)
    }

    setSyncStatus('synced')
  }

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
      herbalType: newPatient.herbalType, // 탕약/환약 종류
      herbal: [
        { month: 1, date: '', seoljin: false, omnifit: false },
        { month: 2, date: '', seoljin: false, omnifit: false },
        { month: 3, date: '', seoljin: false, omnifit: false },
        { month: 4, date: '', seoljin: false, omnifit: false },
        { month: 5, date: '', seoljin: false, omnifit: false },
        { month: 6, date: '', seoljin: false, omnifit: false },
      ],
      weeklyVisits: Array(36).fill(null), // 9개월 = 36주 (null=미입력, true=내원, false=미내원)
      skipWeeks: [], // 스킵할 주차 목록
      review: '',
      createdAt: new Date().toISOString(),
    }

    setPatients(prev => {
      const updated = [patient, ...prev]
      savePatients(updated)
      return updated
    })

    if (userId) {
      setSyncStatus('syncing')
      isSavingRef.current = true
      await insertPatient(userId, patient)
      isSavingRef.current = false
      setSyncStatus('synced')
    }

    setNewPatient({
      doctor: '',
      treatmentStartDate: getTodayDate(),
      name: '',
      chartNumber: '',
      contact: '',
      symptoms: '',
      treatmentPeriod: 3,
      prescriptionPeriod: 3,
      visitPeriod: 3,
      visitInterval: '1주에 1회',
      herbalType: '',
    })
    setShowAddModal(false)
  }

  // 환자 업데이트 (즉시 저장)
  const updatePatientField = async (patientId, field, value) => {
    // 1. 로컬 상태 즉시 업데이트
    setPatients(prev => {
      const updated = prev.map(p =>
        p.id === patientId ? { ...p, [field]: value } : p
      )
      savePatients(updated)  // localStorage 즉시 저장
      return updated
    })

    // 2. 서버에 즉시 저장 (디바운스 제거)
    if (userId) {
      isSavingRef.current = true
      await updatePatientInDB(patientId, { [field]: value })
      isSavingRef.current = false
    }
  }

  // 상태 변경 핸들러 (졸업 시 졸업일 자동 설정)
  const updatePatientStatus = async (patientId, newStatus) => {
    const patient = patients.find(p => p.id === patientId)
    if (!patient) return

    const updates = { status: newStatus }

    // 졸업으로 변경 시 졸업일 자동 설정
    if (newStatus === 'completed' && !patient.graduationDate) {
      const lastVisitDate = getLastVisitDate(patient.treatmentStartDate, patient.weeklyVisits)
      if (lastVisitDate) {
        updates.graduationDate = lastVisitDate
      } else {
        // 내원 기록이 없으면 오늘 날짜로
        updates.graduationDate = getTodayDate()
      }
    }

    setPatients(prev => {
      const updated = prev.map(p =>
        p.id === patientId ? { ...p, ...updates } : p
      )
      savePatients(updated)
      return updated
    })

    if (userId) {
      isSavingRef.current = true
      await updatePatientInDB(patientId, updates)
      isSavingRef.current = false
    }
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

  // 주차 내원 토글 (레거시 - 미내원 사유 모달에서 내원으로 변경시 사용)
  const toggleWeeklyVisit = (patientId, weekIndex) => {
    const patient = patients.find(p => p.id === patientId)
    if (!patient) return

    const newWeekly = [...(patient.weeklyVisits || Array(36).fill(null))]
    newWeekly[weekIndex] = true // 내원으로 변경
    updatePatientField(patientId, 'weeklyVisits', newWeekly)
  }

  // 환자 삭제
  const deletePatient = async (patientId) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    setPatients(prev => {
      const updated = prev.filter(p => p.id !== patientId)
      savePatients(updated)
      return updated
    })
    if (userId) {
      isSavingRef.current = true
      await deletePatientFromDB(patientId)
      isSavingRef.current = false
    }
  }

  // 담당의 목록 (필터용)
  const doctors = ['전체', ...ROOM_OPTIONS]

  // 검색 필터 함수
  const matchesSearch = (patient, query) => {
    if (!query.trim()) return true
    const q = query.toLowerCase().trim()
    return (
      (patient.name || '').toLowerCase().includes(q) ||
      (patient.chartNumber || '').toLowerCase().includes(q) ||
      (patient.contact || '').toLowerCase().includes(q) ||
      (patient.symptoms || '').toLowerCase().includes(q)
    )
  }

  // 필터링된 환자 (탭 + 담당의 + 검색)
  const filteredPatients = patients
    .filter(p => {
      const status = p.status || 'active'
      return status === activeTab
    })
    .filter(p => filterDoctor === '전체' || p.doctor === filterDoctor)
    .filter(p => matchesSearch(p, searchQuery))
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
    other: patients.filter(p => p.status === 'other').length,
  }

  // 동기화 상태
  const getSyncStatus = () => {
    switch (syncStatus) {
      case 'syncing': return { icon: '↻', text: '동기화 중', color: 'text-[#8B7E74]' }
      case 'synced': return { icon: '✓', text: '동기화됨', color: 'text-[#5B8A5B]' }
      case 'error': return { icon: '!', text: '오류', color: 'text-[#A14B42]' }
      default: return { icon: '○', text: '대기', color: 'text-[#8B7E74]' }
    }
  }
  const sync = getSyncStatus()

  // 세부정보 모달 열기
  const openPatientDetail = (patient) => {
    setSelectedPatient(patient)
    setEditedPatient({ ...patient })
    setHasUnsavedChanges(false)
  }

  // 세부정보 모달에서 필드 수정
  const updateEditedField = (field, value) => {
    setEditedPatient(prev => ({ ...prev, [field]: value }))
    setHasUnsavedChanges(true)
  }

  // 세부정보 저장
  const savePatientDetail = async () => {
    if (!editedPatient) return

    // 로컬 상태 업데이트
    setPatients(prev => prev.map(p =>
      p.id === editedPatient.id ? editedPatient : p
    ))

    // DB 업데이트
    if (userId) {
      setSyncStatus('syncing')
      isSavingRef.current = true
      await updatePatientInDB(editedPatient.id, editedPatient)
      isSavingRef.current = false
      setSyncStatus('synced')
    }

    setHasUnsavedChanges(false)
    // 저장 후 자동으로 모달 닫기
    setSelectedPatient(null)
    setEditedPatient(null)
  }

  // 세부정보 모달 닫기
  const closePatientDetail = () => {
    if (hasUnsavedChanges) {
      if (!confirm('저장하지 않은 변경사항이 있습니다. 정말 닫으시겠습니까?')) {
        return
      }
    }
    setSelectedPatient(null)
    setEditedPatient(null)
    setHasUnsavedChanges(false)
  }

  // 가로스크롤 함수
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -400, behavior: 'smooth' })
    }
  }
  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 400, behavior: 'smooth' })
    }
  }
  const scrollToStart = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' })
    }
  }
  const scrollToEnd = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: scrollContainerRef.current.scrollWidth, behavior: 'smooth' })
    }
  }

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
      <div className="min-h-screen bg-[#FDFBF8] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full border border-[#D6C6B0]">
          <div className="flex flex-col items-center mb-6">
            <img
              src="/본향한의원세로형JPG.jpg"
              alt="본향한의원"
              className="h-20 w-auto mb-4"
            />
            <h1 className="text-xl font-bold text-[#6D5548]">특화환자 관리</h1>
            <p className="text-sm text-[#8B7E74] mt-1">비밀번호를 입력하세요</p>
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
                className={`w-full px-4 py-3 border rounded-lg text-center text-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent ${
                  passwordError ? 'border-[#A14B42] bg-[#F5E8E7]' : 'border-[#D6C6B0]'
                }`}
                autoFocus
              />
              {passwordError && (
                <p className="text-[#A14B42] text-sm text-center mt-2">비밀번호가 틀렸습니다</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-[#6D5548] text-white rounded-lg hover:bg-[#5a463b] transition font-medium"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDFBF8]">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-[#D6C6B0] sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/본향한의원세로형JPG.jpg"
              alt="본향한의원"
              className="h-10 w-auto"
            />
            <h1 className="text-xl font-bold text-[#6D5548]">본향한의원 특화환자 관리</h1>
            <span className={`flex items-center gap-1 text-xs ${sync.color}`}>
              <span className={syncStatus === 'syncing' ? 'animate-spin' : ''}>{sync.icon}</span>
              {sync.text}
            </span>
            <button
              onClick={refreshFromServer}
              disabled={syncStatus === 'syncing'}
              className="p-1.5 rounded hover:bg-[#E8E0D8] transition disabled:opacity-50"
              title="서버에서 새로고침"
            >
              <svg className={`w-4 h-4 text-[#6D5548] ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[#6D5548] text-white rounded-lg hover:bg-[#5a463b] transition text-sm font-medium"
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
                  ? 'bg-[#6D5548] text-white'
                  : 'bg-[#E8DFD3] text-[#6D5548] hover:bg-[#D6C6B0]'
              }`}
            >
              {tab.label} ({tabCounts[tab.key]})
            </button>
          ))}
        </div>
        {/* 진료실 필터 + 검색 */}
        <div className="px-4 pb-2 flex items-center justify-between border-t border-[#D6C6B0] pt-2">
          <div className="flex gap-2 items-center">
            <span className="text-sm text-[#8B7E74] py-1">담당:</span>
            {doctors.map(room => (
              <button
                key={room}
                onClick={() => setFilterDoctor(room)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  filterDoctor === room
                    ? 'bg-[#A14B42] text-white'
                    : 'bg-[#E8DFD3] text-[#6D5548] hover:bg-[#D6C6B0]'
                }`}
              >
                {room}
              </button>
            ))}
          </div>
          {/* 검색 */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="환자명, 차트번호, 연락처, 증상 검색..."
              className="w-64 pl-9 pr-8 py-1.5 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7E74]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8B7E74] hover:text-[#6D5548]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 테이블 */}
      <main className="p-4 pb-20">
        <div className="bg-white rounded-xl shadow-sm border border-[#D6C6B0] overflow-hidden">
          <div ref={scrollContainerRef} className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-[#E8DFD3] sticky top-0">
                {/* 섹션 제목 행 */}
                <tr className="bg-[#D6C6B0]">
                  {/* 상태 - 3행 병합, 고정열 */}
                  <th rowSpan={3} className="sticky left-0 bg-[#6D5548] z-10 px-2 py-2 text-center font-bold text-white align-middle min-w-[60px] w-[60px] whitespace-nowrap">상태</th>
                  {/* 졸업일 - 졸업 탭에서만 표시 */}
                  {activeTab === 'completed' && (
                    <th rowSpan={3} className="sticky left-[60px] bg-[#6D5548] z-10 px-2 py-2 text-center font-bold text-white align-middle min-w-[100px] whitespace-nowrap border-r border-[#8B7265]">졸업일</th>
                  )}
                  {/* 후기 - 졸업 탭에서만 여기에 표시 (졸업일과 같은 스타일) */}
                  {activeTab === 'completed' && (
                    <th rowSpan={3} className="px-2 py-2 text-center font-bold text-white bg-[#6D5548] align-middle whitespace-nowrap border-r border-[#8B7265]">후기</th>
                  )}
                  {/* 환자명 - 3행 병합, 고정열 */}
                  <th rowSpan={3} className={`sticky ${activeTab === 'completed' ? 'left-[160px]' : 'left-[60px]'} bg-[#6D5548] z-10 px-2 py-2 text-center font-bold text-white align-middle min-w-[80px] whitespace-nowrap`}>환자명</th>
                  {/* 연락처 - 3행 병합, 고정열 */}
                  <th rowSpan={3} className={`sticky ${activeTab === 'completed' ? 'left-[240px]' : 'left-[140px]'} bg-[#6D5548] z-10 px-2 py-2 text-center font-bold text-white align-middle min-w-[110px] whitespace-nowrap border-r border-[#8B7265]`}>연락처</th>
                  <th colSpan={4} className="bg-[#8B7265] border-r-2 border-[#6D5548] px-2 py-2 text-center font-bold text-white">
                    기본정보
                  </th>
                  <th rowSpan={3} className="px-2 py-2 text-center font-bold text-[#6D5548] bg-[#D6C6B0] align-middle whitespace-nowrap border-r-2 border-[#6D5548]">약종류</th>
                  <th colSpan={6} className="px-2 py-2 text-center font-bold text-[#6D5548] bg-[#D6C6B0] border-r-2 border-[#6D5548]">
                    탕약/환약 (날짜·설진·옴니)
                  </th>
                  <th rowSpan={2} colSpan={36} className="px-2 py-2 text-center font-bold text-[#6D5548] bg-[#E8DFD3] border-r-2 border-[#6D5548] align-middle">
                    <div>치료내원관리</div>
                    <div className="text-[10px] font-normal text-[#8B7E74]">흰색=내원주 · 회색=스킵주 · 배경클릭→전환 · 드롭다운으로 O/X 기록</div>
                  </th>
                  {activeTab !== 'completed' && (
                    <th rowSpan={3} className="px-2 py-2 text-center font-bold text-white bg-[#6D5548] border-r-2 border-[#8B7265] align-middle whitespace-nowrap">후기</th>
                  )}
                  <th rowSpan={3} className="px-2 py-2 text-center font-bold text-white bg-[#6D5548] align-middle whitespace-nowrap">삭제</th>
                </tr>
                {/* 컬럼 헤더 행 */}
                <tr>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-[#6D5548] whitespace-nowrap align-middle bg-[#E8DFD3] border-r border-[#D6C6B0]">담당</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-[#6D5548] whitespace-nowrap align-middle bg-[#E8DFD3] border-r border-[#D6C6B0]">치료시작</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-[#6D5548] whitespace-nowrap min-w-[80px] align-middle bg-[#E8DFD3] border-r border-[#D6C6B0]">증상</th>
                  <th rowSpan={2} className="px-2 py-2 text-center font-medium text-[#6D5548] whitespace-nowrap min-w-[100px] align-middle bg-[#E8DFD3] border-r-2 border-[#6D5548]">
                    <div className="text-[10px]">총관리/처방/내원</div>
                    <div className="text-[9px] font-normal text-[#8B7E74]">(개월)</div>
                  </th>
                  {/* 탕약 복약 현황 - 6개월 (2행 병합) */}
                  {[1, 2, 3, 4, 5, 6].map(m => (
                    <th key={`herb-${m}`} rowSpan={2} className={`px-2 py-1 text-center font-medium text-[#6D5548] bg-[#D6C6B0]/50 min-w-[70px] ${m < 6 ? 'border-r border-[#D6C6B0]' : 'border-r-2 border-[#6D5548]'}`}>
                      {m}개월
                    </th>
                  ))}
                </tr>
                {/* 서브헤더 행 */}
                <tr className="bg-[#FDFBF8] text-xs">
                  {/* 주차 번호 (36주 = 9개월) */}
                  {Array.from({ length: 36 }, (_, i) => (
                    <th
                      key={i}
                      className={`px-1 py-1 text-center text-[#8B7E74] min-w-[36px] whitespace-nowrap bg-[#E8DFD3]/50 ${i < 35 ? 'border-r border-[#D6C6B0]' : 'border-r-2 border-[#6D5548]'}`}
                    >
                      {i + 1}주
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFD3]">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={100} className="px-4 py-12 text-center text-[#8B7E74]">
                      {activeTab === 'active' && '진행중인 환자가 없습니다.'}
                      {activeTab === 'completed' && '치료졸업 환자가 없습니다.'}
                      {activeTab === 'dropout' && '이탈 환자가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  (isListCollapsed ? filteredPatients.slice(0, visibleRows) : filteredPatients).map((patient, rowIndex) => {
                    const defaultHerbal = Array.from({ length: 12 }, (_, i) => ({
                      month: i + 1, date: '', seoljin: false, omnifit: false
                    }))
                    const herbal = patient.herbal?.length >= 6 ? patient.herbal : defaultHerbal
                    const weekly = patient.weeklyVisits || Array(36).fill(null)
                    const currentWeekIdx = getCurrentWeekIndex(patient.treatmentStartDate)

                    // 기간 파싱 (레거시 호환: hasHerbal, medicineOnly 필드 지원)
                    const treatmentMonths = parseMonths(patient.treatmentPeriod, 3)
                    const prescriptionMonths = patient.prescriptionPeriod !== undefined
                      ? parseMonths(patient.prescriptionPeriod, 3)
                      : (patient.hasHerbal === false ? 0 : 3) // 레거시 호환
                    const visitMonths = patient.visitPeriod !== undefined
                      ? parseMonths(patient.visitPeriod, 3)
                      : (patient.medicineOnly === true ? 0 : 3) // 레거시 호환

                    const visitWeeks = visitMonths * 4 // 치료내원기간 → 주수
                    const intervalParsed = parseVisitIntervalFull(patient.visitInterval)
                    const intervalWeeks = intervalParsed.weeks
                    const intervalVisits = intervalParsed.visits
                    const skipWeeks = patient.skipWeeks || []
                    const isEvenRow = rowIndex % 2 === 0 // 짝수 행 (교차 색상용)

                    // 세부정보 모달은 고정열(상태, 환자명, 연락처)에서만 열림
                    const handleFixedCellClick = (e) => {
                      // input, select, button, label 클릭 시에는 모달 열지 않음
                      const tag = e.target.tagName.toUpperCase()
                      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'LABEL') return
                      if (e.target.closest('input, select, button, label')) return
                      openPatientDetail(patient)
                    }

                    // 행 배경색 (교차 색상)
                    const rowBgClass = isEvenRow ? 'bg-white' : 'bg-[#FDFBF8]'

                    return (
                      <tr
                        key={patient.id}
                        className={`group transition-all duration-200 ${rowBgClass}`}
                      >
                        {/* 상태 - 1열 고정 (클릭→세부정보) */}
                        <td
                          onClick={handleFixedCellClick}
                          className={`px-2 py-2 text-center sticky left-0 z-10 transition-colors duration-200 min-w-[60px] w-[60px] border-r border-[#D6C6B0] cursor-pointer hover:bg-[#E8DFD3] ${isEvenRow ? 'bg-white' : 'bg-[#FDFBF8]'}`}
                        >
                          <div className="flex flex-col items-center">
                            <select
                              value={patient.status || 'active'}
                              onChange={(e) => updatePatientStatus(patient.id, e.target.value)}
                              className={`px-2 py-1 rounded text-xs font-medium cursor-pointer text-center ${
                                patient.status === 'completed' ? 'bg-[#E8F0E8] text-[#5B8A5B]' :
                                patient.status === 'dropout' ? 'bg-[#F5E8E7] text-[#A14B42]' :
                                patient.status === 'other' ? 'bg-[#E8DFD3] text-[#8B7E74]' :
                                'bg-[#E8DFD3] text-[#6D5548]'
                              }`}
                            >
                              <option value="active">진행중</option>
                              <option value="completed">졸업</option>
                              <option value="dropout">이탈</option>
                              <option value="other">기타</option>
                            </select>
                            {/* 졸업일 표시 (졸업 탭 아닐 때만) */}
                            {activeTab !== 'completed' && patient.status === 'completed' && patient.graduationDate && (
                              <span className="text-[9px] text-[#5B8A5B] mt-0.5">
                                {formatDateShort(patient.graduationDate)}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* 졸업일 - 졸업 탭에서만 표시 */}
                        {activeTab === 'completed' && (
                          <td
                            className={`px-2 py-2 text-center sticky left-[60px] z-10 transition-colors duration-200 min-w-[100px] border-r border-[#D6C6B0] ${isEvenRow ? 'bg-[#E8F0E8]' : 'bg-[#d9e8d9]'}`}
                          >
                            <input
                              type="date"
                              value={patient.graduationDate || ''}
                              onChange={(e) => updatePatientField(patient.id, 'graduationDate', e.target.value)}
                              onClick={(e) => e.target.showPicker()}
                              className="w-24 px-1 py-1 text-sm font-medium text-[#5B8A5B] bg-transparent border border-transparent hover:border-[#5B8A5B] rounded cursor-pointer focus:border-[#5B8A5B] focus:outline-none"
                            />
                          </td>
                        )}
                        {/* 후기 - 졸업 탭에서만 여기에 표시 (졸업일과 같은 배경) */}
                        {activeTab === 'completed' && (
                          <td className={`px-2 py-2 text-center border-r border-[#D6C6B0] ${isEvenRow ? 'bg-[#E8F0E8]' : 'bg-[#d9e8d9]'}`}>
                            <select
                              value={patient.review || ''}
                              onChange={(e) => updatePatientField(patient.id, 'review', e.target.value)}
                              className={`w-24 px-1 py-1 border border-transparent hover:border-[#5B8A5B] rounded text-xs text-center focus:border-[#5B8A5B] focus:outline-none cursor-pointer bg-transparent ${
                                patient.review === 'video_public' ? 'text-[#5B8A5B] font-medium' :
                                patient.review === 'video_private' ? 'text-[#6D5548] font-medium' :
                                patient.review === 'written' ? 'text-[#A14B42] font-medium' : ''
                              }`}
                            >
                              {REVIEW_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        {/* 환자명 - 고정 + 차트번호 툴팁 (클릭→세부정보) */}
                        <td
                          onClick={handleFixedCellClick}
                          className={`px-2 py-2 text-center font-medium sticky ${activeTab === 'completed' ? 'left-[160px]' : 'left-[60px]'} z-10 transition-colors duration-200 border-r border-[#D6C6B0] cursor-pointer hover:bg-[#E8DFD3] ${isEvenRow ? 'bg-white' : 'bg-[#FDFBF8]'}`}
                        >
                          <div className="relative inline-block group/name">
                            <span className="px-1 py-1 text-sm font-semibold text-[#6D5548] hover:text-[#A14B42] cursor-pointer">
                              {patient.name || '(이름없음)'}
                            </span>
                            {/* 차트번호 툴팁 */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover/name:block z-50">
                              <div className="bg-[#6D5548] text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                                <div className="font-medium">{patient.name}</div>
                                <div className="text-[#D6C6B0]">차트번호: {patient.chartNumber || '-'}</div>
                              </div>
                              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#6D5548]"></div>
                            </div>
                          </div>
                        </td>
                        {/* 연락처 - 고정 (클릭→세부정보) */}
                        <td
                          onClick={handleFixedCellClick}
                          className={`px-2 py-2 text-center sticky ${activeTab === 'completed' ? 'left-[240px]' : 'left-[140px]'} z-10 transition-colors duration-200 border-r-2 border-[#6D5548] cursor-pointer hover:bg-[#E8DFD3] ${isEvenRow ? 'bg-white' : 'bg-[#FDFBF8]'}`}
                        >
                          <input
                            type="text"
                            value={patient.contact || ''}
                            onChange={(e) => updatePatientField(patient.id, 'contact', e.target.value)}
                            className="w-24 px-1 py-1 border border-transparent hover:border-[#D6C6B0] rounded text-xs text-center focus:border-[#6D5548] focus:outline-none bg-transparent"
                            placeholder="010-0000-0000"
                          />
                        </td>
                        {/* 담당원장 */}
                        <td className="px-1 py-2 text-center border-r border-[#D6C6B0]">
                          <select
                            value={patient.doctor || ''}
                            onChange={(e) => updatePatientField(patient.id, 'doctor', e.target.value)}
                            className="w-16 px-0.5 py-1 border border-transparent hover:border-[#D6C6B0] rounded text-xs text-center focus:border-[#6D5548] focus:outline-none cursor-pointer bg-transparent"
                          >
                            <option value="">-</option>
                            {ROOM_OPTIONS.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </td>
                        {/* 치료시작일 */}
                        <td className="px-1 py-2 text-center border-r border-[#D6C6B0]">
                          <input
                            type="date"
                            value={patient.treatmentStartDate || ''}
                            onChange={(e) => updatePatientField(patient.id, 'treatmentStartDate', e.target.value)}
                            className="w-28 px-1 py-1 border border-transparent hover:border-[#D6C6B0] rounded text-xs focus:border-[#6D5548] focus:outline-none cursor-pointer bg-transparent"
                          />
                        </td>
                        {/* 증상 */}
                        <td className="px-1 py-2 text-center border-r border-[#D6C6B0]">
                          <input
                            type="text"
                            value={patient.symptoms || ''}
                            onChange={(e) => updatePatientField(patient.id, 'symptoms', e.target.value)}
                            className="w-20 px-1 py-1 border border-transparent hover:border-[#D6C6B0] rounded text-xs text-center focus:border-[#6D5548] focus:outline-none bg-transparent"
                          />
                        </td>
                        {/* 관리기간 (치료/처방/내원) - 한 줄 표시 */}
                        <td className="px-1 py-2 text-center border-r-2 border-[#6D5548] whitespace-nowrap">
                          <span className="text-[10px]">
                            <span className="text-[#6D5548] font-medium">{treatmentMonths}</span>
                            <span className="text-[#8B7E74]">/</span>
                            <span className="text-[#A14B42] font-medium">{prescriptionMonths}</span>
                            <span className="text-[#8B7E74]">/</span>
                            <span className="text-[#5B8A5B] font-medium">{visitMonths}</span>
                          </span>
                        </td>
                        {/* 약 종류 (탕약/환약) */}
                        <td className="px-2 py-2 text-center bg-[#D6C6B0]/30 border-r-2 border-[#6D5548]">
                          <select
                            value={patient.herbalType || ''}
                            onChange={(e) => updatePatientField(patient.id, 'herbalType', e.target.value)}
                            className={`w-14 px-1 py-1 border border-transparent hover:border-[#6D5548] rounded text-xs text-center focus:border-[#6D5548] focus:outline-none cursor-pointer bg-transparent ${
                              patient.herbalType === 'tang' ? 'text-[#6D5548] font-medium' :
                              patient.herbalType === 'hwan' ? 'text-[#8B7265] font-medium' : ''
                            }`}
                          >
                            {HERBAL_TYPE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        {/* 탕약 복약 현황 (6개월) - 처방기간 기준 */}
                        {[0, 1, 2, 3, 4, 5].map(monthIdx => {
                          const isDisabled = prescriptionMonths === 0 || monthIdx >= prescriptionMonths // 처방기간 초과시 비활성화
                          const hasDate = herbal[monthIdx]?.date
                          return (
                            <td
                              key={`${patient.id}-herb-${monthIdx}`}
                              className={`px-1 py-1 text-center ${monthIdx < 5 ? 'border-r border-[#D6C6B0]' : 'border-r-2 border-[#6D5548]'} ${isDisabled ? 'bg-[#8B7E74]/30' : (isEvenRow ? 'bg-[#D6C6B0]/20' : 'bg-[#D6C6B0]/40')}`}
                            >
                              {isDisabled ? (
                                <span className="text-xs text-[#8B7E74]">-</span>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  {/* 날짜 - 직접 보이는 input */}
                                  <input
                                    type="date"
                                    value={herbal[monthIdx]?.date || ''}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      const currentHerbal = patient.herbal?.length >= 6 ? [...patient.herbal] : Array.from({ length: 6 }, (_, i) => ({ month: i + 1, date: '', seoljin: false, omnifit: false }))
                                      currentHerbal[monthIdx] = { ...currentHerbal[monthIdx], date: e.target.value }
                                      updatePatientField(patient.id, 'herbal', currentHerbal)
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-[70px] text-[10px] px-1 py-0.5 border border-[#D6C6B0] rounded cursor-pointer focus:ring-1 focus:ring-[#6D5548]"
                                  />
                                  {/* 설진 */}
                                  <input
                                    type="checkbox"
                                    checked={herbal[monthIdx]?.seoljin || false}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      const currentHerbal = patient.herbal?.length >= 6 ? [...patient.herbal] : Array.from({ length: 6 }, (_, i) => ({ month: i + 1, date: '', seoljin: false, omnifit: false }))
                                      currentHerbal[monthIdx] = { ...currentHerbal[monthIdx], seoljin: !currentHerbal[monthIdx]?.seoljin }
                                      updatePatientField(patient.id, 'herbal', currentHerbal)
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-3 h-3 rounded border-[#D6C6B0] text-[#A14B42] focus:ring-[#A14B42] cursor-pointer"
                                    title="설진"
                                  />
                                  {/* 옴니핏 */}
                                  <input
                                    type="checkbox"
                                    checked={herbal[monthIdx]?.omnifit || false}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      const currentHerbal = patient.herbal?.length >= 6 ? [...patient.herbal] : Array.from({ length: 6 }, (_, i) => ({ month: i + 1, date: '', seoljin: false, omnifit: false }))
                                      currentHerbal[monthIdx] = { ...currentHerbal[monthIdx], omnifit: !currentHerbal[monthIdx]?.omnifit }
                                      updatePatientField(patient.id, 'herbal', currentHerbal)
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-3 h-3 rounded border-[#D6C6B0] text-[#5B8A5B] focus:ring-[#5B8A5B] cursor-pointer"
                                    title="옴니핏"
                                  />
                                </div>
                              )}
                            </td>
                          )
                        })}
                        {/* 주차별 내원 (36주 = 9개월) - 치료내원기간 기준 */}
                        {Array.from({ length: 36 }, (_, weekIdx) => {
                          const weekCode = getWeekYearCode(patient.treatmentStartDate, weekIdx) // 주차 코드 (예: 2604)
                          const isCurrentWeek = weekIdx === currentWeekIdx
                          const isOutOfRange = visitMonths === 0 || weekIdx >= visitWeeks // 치료내원기간 초과

                          // 치료간격 기준 기본 상태
                          const isScheduledByInterval = isScheduledWeek(weekIdx, intervalWeeks, intervalVisits, [])
                          // skipWeeks에 포함 = 기본 상태에서 토글됨
                          const isToggled = skipWeeks.includes(weekIdx)
                          // 최종 스킵 여부: 기본상태 XOR 토글
                          // - 기본 내원주 + 토글 → 스킵
                          // - 기본 스킵주 + 토글 → 내원
                          const isSkipWeek = isScheduledByInterval ? isToggled : !isToggled

                          const missedReasons = patient.missedReasons || {}
                          const hasMissedReason = missedReasons[weekIdx]
                          // 내원 상태: null=미입력, true=내원, false=미내원
                          const visitStatus = weekly[weekIdx]

                          // 스킵 주차 토글 함수 (배경 클릭) - 흰색↔회색 자유 전환
                          const toggleSkipWeek = (e) => {
                            e.stopPropagation()
                            const newSkipWeeks = skipWeeks.includes(weekIdx)
                              ? skipWeeks.filter(w => w !== weekIdx)
                              : [...skipWeeks, weekIdx]
                            updatePatientField(patient.id, 'skipWeeks', newSkipWeeks)
                          }

                          // 내원 상태 변경 핸들러
                          const handleVisitChange = (e) => {
                            e.stopPropagation()
                            const value = e.target.value
                            const newWeekly = [...(patient.weeklyVisits || Array(36).fill(null))]
                            if (value === '') {
                              newWeekly[weekIdx] = null
                            } else if (value === 'visited') {
                              newWeekly[weekIdx] = true
                            } else if (value === 'missed') {
                              newWeekly[weekIdx] = false
                              // 미내원 선택 시 사유 입력 모달 열기
                              setMissedReasonModal({
                                patientId: patient.id,
                                weekIdx,
                                reason: missedReasons[weekIdx] || ''
                              })
                            }
                            updatePatientField(patient.id, 'weeklyVisits', newWeekly)
                          }

                          // 배경색 결정 (드롭다운과 독립)
                          // 1. 내원기간 초과 → 진한 회색
                          // 2. 이번 주 → 연한 초록 테두리
                          // 3. 스킵 주 → 회색 (내원 안해도 되는 주)
                          // 4. 내원 주 → 흰색 (내원해야 하는 주)
                          let bgClass = 'bg-white' // 기본: 내원 주 (흰색)
                          if (isOutOfRange) {
                            bgClass = 'bg-[#8B7E74]/50'
                          } else if (isSkipWeek) {
                            bgClass = 'bg-[#D6C6B0]' // 스킵 주 (베이지)
                          }

                          // 이번 주 테두리 강조
                          const currentWeekBorder = isCurrentWeek && !isOutOfRange ? 'ring-2 ring-[#5B8A5B] ring-inset' : ''

                          return (
                            <td
                              key={weekIdx}
                              onClick={(e) => {
                                // 배경 클릭 시 스킵 토글 (select 클릭 제외, 내원기간 내에서만)
                                if (e.target.tagName !== 'SELECT' && !isOutOfRange) {
                                  toggleSkipWeek(e)
                                }
                              }}
                              className={`px-0.5 py-0.5 text-center relative transition-all duration-100 ${bgClass} ${currentWeekBorder} ${!isOutOfRange ? 'cursor-pointer hover:bg-[#E8DFD3]' : ''} ${weekIdx < 35 ? 'border-r border-[#D6C6B0]' : 'border-r-2 border-[#6D5548]'}`}
                              title={isOutOfRange ? '' : isSkipWeek ? '클릭→내원주로 변경' : '클릭→스킵주로 변경'}
                            >
                              {isOutOfRange ? (
                                <span className="text-[#8B7E74] text-[10px]">-</span>
                              ) : (
                                <div className="flex flex-col items-center gap-0.5 py-0.5">
                                  <span className={`text-[8px] leading-none ${isCurrentWeek ? 'text-[#5B8A5B] font-bold' : 'text-[#8B7E74]'}`}>{weekCode}</span>
                                  <select
                                    value={visitStatus === true ? 'visited' : visitStatus === false ? 'missed' : ''}
                                    onChange={handleVisitChange}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-7 px-0.5 py-0.5 text-[10px] rounded-md cursor-pointer focus:ring-1 focus:ring-[#6D5548] border ${
                                      isSkipWeek
                                        ? 'bg-[#D6C6B0] border-[#8B7E74] text-[#8B7E74]'
                                        : visitStatus === true
                                          ? 'bg-[#E8F0E8] border-[#5B8A5B] text-[#5B8A5B] font-medium'
                                          : visitStatus === false
                                            ? 'bg-[#F5E8E7] border-[#A14B42] text-[#A14B42] font-medium'
                                            : 'bg-white border-[#D6C6B0] text-[#6D5548]'
                                    }`}
                                  >
                                    <option value="">-</option>
                                    <option value="visited">O</option>
                                    <option value="missed">X</option>
                                  </select>
                                </div>
                              )}
                            </td>
                          )
                        })}
                        {/* 후기 - 드롭다운 (졸업 탭 아닐 때만) */}
                        {activeTab !== 'completed' && (
                          <td className="px-2 py-2 text-center border-r-2 border-[#6D5548]">
                            <select
                              value={patient.review || ''}
                              onChange={(e) => updatePatientField(patient.id, 'review', e.target.value)}
                              className={`w-28 px-1 py-1 border border-transparent hover:border-[#D6C6B0] rounded text-xs text-center focus:border-[#6D5548] focus:outline-none cursor-pointer bg-transparent ${
                                patient.review === 'video_public' ? 'text-[#5B8A5B] font-medium' :
                                patient.review === 'video_private' ? 'text-[#6D5548] font-medium' :
                                patient.review === 'written' ? 'text-[#A14B42] font-medium' : ''
                              }`}
                            >
                              {REVIEW_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        {/* 삭제 */}
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); deletePatient(patient.id) }}
                            className="text-[#8B7E74] hover:text-[#A14B42] transition"
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
                    <td colSpan={100} className="px-4 py-3 text-center bg-[#FDFBF8] border-t-2 border-[#D6C6B0]">
                      <button
                        onClick={() => setIsListCollapsed(!isListCollapsed)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#D6C6B0] hover:bg-[#8B7265] hover:text-white rounded-lg text-sm font-medium text-[#6D5548] transition"
                      >
                        {isListCollapsed ? (
                          <>
                            <span>펼치기</span>
                            <span className="text-[#8B7E74]">({filteredPatients.length - visibleRows}명 더보기)</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </>
                        ) : (
                          <>
                            <span>접기</span>
                            <span className="text-[#8B7E74]">({visibleRows}명만 표시)</span>
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
          <div className="flex gap-4 text-sm text-[#6D5548]">
            {searchQuery && (
              <>
                <span className="text-[#A14B42]">
                  검색결과: <strong className="text-[#A14B42]">{filteredPatients.length}</strong>명
                  <button
                    onClick={() => setSearchQuery('')}
                    className="ml-2 text-xs text-[#8B7E74] hover:text-[#6D5548] underline"
                  >
                    검색 초기화
                  </button>
                </span>
                <span className="text-[#D6C6B0]">|</span>
              </>
            )}
            <span>현재 탭: <strong className="text-[#6D5548]">{filteredPatients.length}</strong>명</span>
            {isListCollapsed && filteredPatients.length > visibleRows && (
              <>
                <span className="text-[#D6C6B0]">|</span>
                <span>표시 중: <strong className="text-[#6D5548]">{Math.min(visibleRows, filteredPatients.length)}</strong>명</span>
              </>
            )}
            <span className="text-[#D6C6B0]">|</span>
            <span>전체: <strong className="text-[#6D5548]">{patients.length}</strong>명</span>
            <span className="text-[#D6C6B0]">|</span>
            <span>오늘: {getTodayYearWeek().code} ({getTodayYearWeek().year}년 {getTodayYearWeek().week}주차)</span>
          </div>
          {/* 표시 행 수 설정 */}
          {filteredPatients.length > 5 && (
            <div className="flex items-center gap-2 text-sm text-[#6D5548]">
              <span>표시 행 수:</span>
              <select
                value={visibleRows}
                onChange={(e) => setVisibleRows(Number(e.target.value))}
                className="px-2 py-1 border border-[#D6C6B0] rounded text-sm focus:ring-[#6D5548] focus:border-[#6D5548]"
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
                    ? 'bg-[#D6C6B0] text-[#6D5548] hover:bg-[#8B7265] hover:text-white'
                    : 'bg-[#6D5548] text-white hover:bg-[#5a463b]'
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
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto border border-[#D6C6B0]">
            <h3 className="text-lg font-semibold text-[#6D5548]">새 환자 등록</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[#6D5548] mb-1">담당 원장</label>
                <select
                  value={newPatient.doctor || ''}
                  onChange={(e) => setNewPatient({ ...newPatient, doctor: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                >
                  <option value="">선택</option>
                  {ROOM_OPTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6D5548] mb-1">환자명 *</label>
                <input
                  type="text"
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6D5548] mb-1">차트번호</label>
                <input
                  type="text"
                  value={newPatient.chartNumber}
                  onChange={(e) => setNewPatient({ ...newPatient, chartNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
                  placeholder="예: 12345"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6D5548] mb-1">연락처</label>
                <input
                  type="text"
                  value={newPatient.contact}
                  onChange={(e) => setNewPatient({ ...newPatient, contact: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
                  placeholder="010-0000-0000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6D5548] mb-1">치료시작일 *</label>
                <input
                  type="date"
                  value={newPatient.treatmentStartDate}
                  onChange={(e) => setNewPatient({ ...newPatient, treatmentStartDate: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6D5548] mb-1">증상</label>
                <input
                  type="text"
                  value={newPatient.symptoms}
                  onChange={(e) => setNewPatient({ ...newPatient, symptoms: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
                />
              </div>
              {/* 기간 설정 */}
              <div className="bg-[#FDFBF8] rounded-lg p-3 space-y-3 border border-[#D6C6B0]">
                <h4 className="text-sm font-medium text-[#6D5548] border-b border-[#D6C6B0] pb-1">기간 설정</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">총관리기간</label>
                    <select
                      value={newPatient.treatmentPeriod}
                      onChange={(e) => setNewPatient({ ...newPatient, treatmentPeriod: Number(e.target.value) })}
                      className="w-full px-2 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                    >
                      {PERIOD_OPTIONS.map(m => (
                        <option key={m} value={m}>{m}개월</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">처방기간</label>
                    <select
                      value={newPatient.prescriptionPeriod}
                      onChange={(e) => setNewPatient({ ...newPatient, prescriptionPeriod: Number(e.target.value) })}
                      className="w-full px-2 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                    >
                      {PERIOD_OPTIONS.map(m => (
                        <option key={m} value={m}>{m}개월{m === 0 ? ' (내원만)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">치료내원기간</label>
                    <select
                      value={newPatient.visitPeriod}
                      onChange={(e) => setNewPatient({ ...newPatient, visitPeriod: Number(e.target.value) })}
                      className="w-full px-2 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                    >
                      {PERIOD_OPTIONS.map(m => (
                        <option key={m} value={m}>{m}개월{m === 0 ? ' (약만)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-[#8B7E74]">처방기간 0 = 내원치료만 / 치료내원기간 0 = 약만 복용</p>
              </div>
              {/* 내원 주기 (내원기간 > 0일 때만) */}
              {newPatient.visitPeriod > 0 && (
                <div>
                  <label className="block text-sm font-medium text-[#6D5548] mb-1">내원 주기</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={parseVisitIntervalFull(newPatient.visitInterval).weeks}
                      onChange={(e) => {
                        const current = parseVisitIntervalFull(newPatient.visitInterval)
                        setNewPatient({ ...newPatient, visitInterval: `${e.target.value}주에 ${current.visits}회` })
                      }}
                      className="flex-1 px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                    >
                      {INTERVAL_WEEKS_OPTIONS.map(w => (
                        <option key={w} value={w}>{w}주</option>
                      ))}
                    </select>
                    <span className="text-[#8B7E74]">에</span>
                    <select
                      value={parseVisitIntervalFull(newPatient.visitInterval).visits}
                      onChange={(e) => {
                        const current = parseVisitIntervalFull(newPatient.visitInterval)
                        setNewPatient({ ...newPatient, visitInterval: `${current.weeks}주에 ${e.target.value}회` })
                      }}
                      className="flex-1 px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                    >
                      {INTERVAL_VISITS_OPTIONS.map(v => (
                        <option key={v} value={v}>{v}회</option>
                      ))}
                    </select>
                    <span className="text-[#8B7E74]">내원</span>
                  </div>
                </div>
              )}
              {/* 약 종류 (처방기간 > 0일 때만) */}
              {newPatient.prescriptionPeriod > 0 && (
                <div>
                  <label className="block text-sm font-medium text-[#6D5548] mb-1">약 종류</label>
                  <select
                    value={newPatient.herbalType || ''}
                    onChange={(e) => setNewPatient({ ...newPatient, herbalType: e.target.value })}
                    className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                  >
                    <option value="">선택</option>
                    <option value="tang">탕약</option>
                    <option value="hwan">환약</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={handleAddPatient}
                className="flex-1 py-2 bg-[#6D5548] text-white rounded-lg hover:bg-[#5a463b] transition"
              >
                등록
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setNewPatient({
                    doctor: '',
                    treatmentStartDate: getTodayDate(),
                    name: '',
                    chartNumber: '',
                    contact: '',
                    symptoms: '',
                    treatmentPeriod: '3개월',
                    visitInterval: '1주에 1회',
                    hasHerbal: true,
                    herbalType: '',
                    medicineOnly: false,
                  })
                }}
                className="flex-1 py-2 bg-[#D6C6B0] text-[#6D5548] rounded-lg hover:bg-[#8B7265] hover:text-white transition"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 환자 세부정보 모달 */}
      {selectedPatient && editedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto border border-[#D6C6B0]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-[#6D5548]">환자 세부정보</h3>
                {hasUnsavedChanges && (
                  <span className="px-2 py-0.5 bg-[#D6C6B0] text-[#6D5548] text-xs rounded-full">수정됨</span>
                )}
              </div>
              <button
                onClick={closePatientDetail}
                className="text-[#8B7E74] hover:text-[#6D5548] text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* 기본 정보 */}
              <div className="bg-[#FDFBF8] rounded-lg p-4 space-y-3 border border-[#D6C6B0]">
                <h4 className="font-medium text-[#6D5548] border-b border-[#D6C6B0] pb-2">기본 정보</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">환자명</label>
                    <input
                      type="text"
                      value={editedPatient.name || ''}
                      onChange={(e) => updateEditedField('name', e.target.value)}
                      className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">차트번호</label>
                    <input
                      type="text"
                      value={editedPatient.chartNumber || ''}
                      onChange={(e) => updateEditedField('chartNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
                      placeholder="예: 12345"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">담당 원장</label>
                    <select
                      value={editedPatient.doctor || ''}
                      onChange={(e) => updateEditedField('doctor', e.target.value)}
                      className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                    >
                      <option value="">선택</option>
                      {ROOM_OPTIONS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">연락처</label>
                    <input
                      type="text"
                      value={editedPatient.contact || ''}
                      onChange={(e) => updateEditedField('contact', e.target.value)}
                      className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
                      placeholder="010-0000-0000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">증상</label>
                    <input
                      type="text"
                      value={editedPatient.symptoms || ''}
                      onChange={(e) => updateEditedField('symptoms', e.target.value)}
                      className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* 치료 정보 */}
              <div className="bg-[#E8DFD3]/50 rounded-lg p-4 space-y-3 border border-[#D6C6B0]">
                <h4 className="font-medium text-[#6D5548] border-b border-[#D6C6B0] pb-2">치료 정보</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">치료시작일</label>
                    <input
                      type="date"
                      value={editedPatient.treatmentStartDate || ''}
                      onChange={(e) => updateEditedField('treatmentStartDate', e.target.value)}
                      onClick={(e) => e.target.showPicker()}
                      className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7E74] mb-1">상태</label>
                    <select
                      value={editedPatient.status || 'active'}
                      onChange={(e) => {
                        const newStatus = e.target.value
                        updateEditedField('status', newStatus)
                        // 졸업으로 변경 시 졸업일 자동 설정
                        if (newStatus === 'completed' && !editedPatient.graduationDate) {
                          const lastVisitDate = getLastVisitDate(editedPatient.treatmentStartDate, editedPatient.weeklyVisits)
                          if (lastVisitDate) {
                            updateEditedField('graduationDate', lastVisitDate)
                          } else {
                            updateEditedField('graduationDate', getTodayDate())
                          }
                        }
                      }}
                      className={`w-full px-3 py-2 rounded-lg text-sm cursor-pointer ${
                        editedPatient.status === 'completed' ? 'bg-[#E8F0E8] text-[#5B8A5B] border-[#5B8A5B]' :
                        editedPatient.status === 'dropout' ? 'bg-[#F5E8E7] text-[#A14B42] border-[#A14B42]' :
                        editedPatient.status === 'other' ? 'bg-[#E8DFD3] text-[#8B7E74] border-[#8B7E74]' :
                        'bg-[#E8DFD3] text-[#6D5548] border-[#D6C6B0]'
                      } border`}
                    >
                      <option value="active">진행중</option>
                      <option value="completed">졸업</option>
                      <option value="dropout">이탈</option>
                      <option value="other">기타</option>
                    </select>
                  </div>
                  {/* 졸업일 (졸업 상태일 때만 표시) */}
                  {editedPatient.status === 'completed' && (
                    <div className="col-span-2">
                      <label className="block text-xs text-[#8B7E74] mb-1">졸업일</label>
                      <input
                        type="date"
                        value={editedPatient.graduationDate || ''}
                        onChange={(e) => updateEditedField('graduationDate', e.target.value)}
                        onClick={(e) => e.target.showPicker()}
                        className="w-full px-3 py-2 border border-[#5B8A5B] rounded-lg text-sm bg-[#E8F0E8] focus:ring-2 focus:ring-[#5B8A5B] focus:border-transparent cursor-pointer"
                      />
                    </div>
                  )}
                </div>
                {/* 기간 설정 */}
                <div className="mt-3 pt-3 border-t border-[#D6C6B0]">
                  <label className="block text-xs text-[#8B7E74] mb-2">기간 설정 (0~6개월)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-[#8B7E74] mb-1">총관리기간</label>
                      <select
                        value={parseMonths(editedPatient.treatmentPeriod, 3)}
                        onChange={(e) => updateEditedField('treatmentPeriod', Number(e.target.value))}
                        className="w-full px-2 py-1.5 border border-[#D6C6B0] rounded text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                      >
                        {PERIOD_OPTIONS.map(m => (
                          <option key={m} value={m}>{m}개월</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#8B7E74] mb-1">처방기간</label>
                      <select
                        value={editedPatient.prescriptionPeriod !== undefined ? parseMonths(editedPatient.prescriptionPeriod, 3) : (editedPatient.hasHerbal === false ? 0 : 3)}
                        onChange={(e) => updateEditedField('prescriptionPeriod', Number(e.target.value))}
                        className="w-full px-2 py-1.5 border border-[#A14B42] rounded text-sm bg-[#F5E8E7] focus:ring-2 focus:ring-[#A14B42] focus:border-transparent cursor-pointer"
                      >
                        {PERIOD_OPTIONS.map(m => (
                          <option key={m} value={m}>{m}개월{m === 0 ? ' (내원만)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#8B7E74] mb-1">치료내원기간</label>
                      <select
                        value={editedPatient.visitPeriod !== undefined ? parseMonths(editedPatient.visitPeriod, 3) : (editedPatient.medicineOnly === true ? 0 : 3)}
                        onChange={(e) => updateEditedField('visitPeriod', Number(e.target.value))}
                        className="w-full px-2 py-1.5 border border-[#5B8A5B] rounded text-sm bg-[#E8F0E8] focus:ring-2 focus:ring-[#5B8A5B] focus:border-transparent cursor-pointer"
                      >
                        {PERIOD_OPTIONS.map(m => (
                          <option key={m} value={m}>{m}개월{m === 0 ? ' (약만)' : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                {/* 내원 주기 (내원기간 > 0일 때만) */}
                {(editedPatient.visitPeriod !== undefined ? parseMonths(editedPatient.visitPeriod, 3) : (editedPatient.medicineOnly === true ? 0 : 3)) > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#D6C6B0]">
                    <label className="block text-xs text-[#8B7E74] mb-1">내원 주기</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={parseVisitIntervalFull(editedPatient.visitInterval).weeks}
                        onChange={(e) => {
                          const current = parseVisitIntervalFull(editedPatient.visitInterval)
                          updateEditedField('visitInterval', `${e.target.value}주에 ${current.visits}회`)
                        }}
                        className="flex-1 px-2 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                      >
                        {INTERVAL_WEEKS_OPTIONS.map(w => (
                          <option key={w} value={w}>{w}주</option>
                        ))}
                      </select>
                      <span className="text-[#8B7E74] text-sm">에</span>
                      <select
                        value={parseVisitIntervalFull(editedPatient.visitInterval).visits}
                        onChange={(e) => {
                          const current = parseVisitIntervalFull(editedPatient.visitInterval)
                          updateEditedField('visitInterval', `${current.weeks}주에 ${e.target.value}회`)
                        }}
                        className="flex-1 px-2 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                      >
                        {INTERVAL_VISITS_OPTIONS.map(v => (
                          <option key={v} value={v}>{v}회</option>
                        ))}
                      </select>
                      <span className="text-[#8B7E74] text-sm">내원</span>
                    </div>
                  </div>
                )}
                {/* 약 종류 (처방기간 > 0일 때만) */}
                {(editedPatient.prescriptionPeriod !== undefined ? parseMonths(editedPatient.prescriptionPeriod, 3) : (editedPatient.hasHerbal === false ? 0 : 3)) > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#D6C6B0]">
                    <label className="block text-xs text-[#8B7E74] mb-1">약 종류</label>
                    <select
                      value={editedPatient.herbalType || ''}
                      onChange={(e) => updateEditedField('herbalType', e.target.value)}
                      className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer"
                    >
                      <option value="">선택</option>
                      <option value="tang">탕약</option>
                      <option value="hwan">환약</option>
                    </select>
                  </div>
                )}
              </div>

              {/* 후기 */}
              <div className="bg-[#D6C6B0]/30 rounded-lg p-4 space-y-3 border border-[#D6C6B0]">
                <h4 className="font-medium text-[#6D5548] border-b border-[#D6C6B0] pb-2">후기</h4>
                <select
                  value={editedPatient.review || ''}
                  onChange={(e) => updateEditedField('review', e.target.value)}
                  className={`w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent cursor-pointer ${
                    editedPatient.review === 'video_public' ? 'bg-[#E8F0E8] text-[#5B8A5B]' :
                    editedPatient.review === 'video_private' ? 'bg-[#E8DFD3] text-[#6D5548]' :
                    editedPatient.review === 'written' ? 'bg-[#F5E8E7] text-[#A14B42]' : ''
                  }`}
                >
                  {REVIEW_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* 현재 주차 정보 */}
              {editedPatient.treatmentStartDate && (
                <div className="bg-[#E8F0E8] rounded-lg p-4 border border-[#5B8A5B]">
                  <h4 className="font-medium text-[#5B8A5B] border-b border-[#5B8A5B]/30 pb-2 mb-2">진행 현황</h4>
                  <div className="text-sm text-[#5B8A5B]">
                    <p>오늘: <strong>{getTodayYearWeek().code}</strong> ({getTodayYearWeek().year}년 {getTodayYearWeek().week}주차)</p>
                    {getCurrentWeekIndex(editedPatient.treatmentStartDate) >= 0 && (
                      <p>치료 <strong>{getCurrentWeekIndex(editedPatient.treatmentStartDate) + 1}주차</strong> 진행 중</p>
                    )}
                  </div>
                </div>
              )}

              {/* 미내원 사유 목록 */}
              {editedPatient.missedReasons && Object.keys(editedPatient.missedReasons).length > 0 && (
                <div className="bg-[#F5E8E7] rounded-lg p-4 border border-[#A14B42]">
                  <h4 className="font-medium text-[#A14B42] border-b border-[#A14B42]/30 pb-2 mb-2">미내원 사유</h4>
                  <div className="space-y-1">
                    {Object.entries(editedPatient.missedReasons)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([weekIdx, reason]) => (
                        <div key={weekIdx} className="flex items-center gap-2 text-sm">
                          <span className="bg-[#A14B42] text-white px-2 py-0.5 rounded text-xs font-medium min-w-[50px] text-center">
                            {Number(weekIdx) + 1}주차
                          </span>
                          <span className="text-[#6D5548] flex-1">{reason || '(사유 미입력)'}</span>
                          <button
                            onClick={() => {
                              const newReasons = { ...editedPatient.missedReasons }
                              delete newReasons[weekIdx]
                              updateEditedField('missedReasons', newReasons)
                            }}
                            className="text-[#8B7E74] hover:text-[#A14B42] text-xs"
                            title="삭제"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={savePatientDetail}
                disabled={!hasUnsavedChanges}
                className={`flex-1 py-2 rounded-lg transition font-medium ${
                  hasUnsavedChanges
                    ? 'bg-[#5B8A5B] text-white hover:bg-[#4a7a4a]'
                    : 'bg-[#D6C6B0] text-[#8B7E74] cursor-not-allowed'
                }`}
              >
                저장
              </button>
              <button
                onClick={closePatientDetail}
                className="flex-1 py-2 bg-[#D6C6B0] text-[#6D5548] rounded-lg hover:bg-[#8B7265] hover:text-white transition"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  if (confirm('정말 삭제하시겠습니까?')) {
                    deletePatient(editedPatient.id)
                    setSelectedPatient(null)
                    setEditedPatient(null)
                  }
                }}
                className="px-4 py-2 bg-[#F5E8E7] text-[#A14B42] rounded-lg hover:bg-[#A14B42] hover:text-white transition"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 고정 스크롤 컨트롤 - 미니멀 디자인 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-[#E8DFD3] z-30">
        <div className="px-4 py-2 flex items-center justify-center gap-6">
          <div className="flex items-center gap-4 text-sm">
            <button
              onClick={scrollToStart}
              className="text-[#8B7E74] hover:text-[#6D5548] transition font-medium"
              title="처음으로"
            >
              ⟪ 처음
            </button>
            <span className="text-[#D6C6B0]">·</span>
            <button
              onClick={scrollLeft}
              className="text-[#8B7E74] hover:text-[#6D5548] transition font-medium"
              title="왼쪽으로"
            >
              ← 이전
            </button>
            <span className="text-[#D6C6B0]">·</span>
            <button
              onClick={scrollRight}
              className="text-[#8B7E74] hover:text-[#6D5548] transition font-medium"
              title="오른쪽으로"
            >
              다음 →
            </button>
            <span className="text-[#D6C6B0]">·</span>
            <button
              onClick={scrollToEnd}
              className="text-[#8B7E74] hover:text-[#6D5548] transition font-medium"
              title="끝으로"
            >
              끝 ⟫
            </button>
          </div>
          <span className="text-xs text-[#8B7E74]">Shift+휠</span>
        </div>
      </div>

      {/* 미내원 사유 입력 모달 */}
      {missedReasonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4 border border-[#D6C6B0]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#A14B42]">미내원 사유</h3>
              <button
                onClick={() => setMissedReasonModal(null)}
                className="text-[#8B7E74] hover:text-[#6D5548] text-xl"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-[#8B7E74]">
              {missedReasonModal.weekIdx + 1}주차 미내원 사유를 입력하세요.
            </p>
            <textarea
              value={missedReasonModal.reason}
              onChange={(e) => setMissedReasonModal({ ...missedReasonModal, reason: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-[#D6C6B0] rounded-lg text-sm focus:ring-2 focus:ring-[#6D5548] focus:border-transparent"
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
                className="flex-1 py-2 bg-[#6D5548] text-white rounded-lg hover:bg-[#5a463b] transition"
              >
                저장
              </button>
              <button
                onClick={() => {
                  // 내원으로 변경
                  toggleWeeklyVisit(missedReasonModal.patientId, missedReasonModal.weekIdx)
                  setMissedReasonModal(null)
                }}
                className="flex-1 py-2 bg-[#E8F0E8] text-[#5B8A5B] rounded-lg hover:bg-[#5B8A5B] hover:text-white transition"
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
