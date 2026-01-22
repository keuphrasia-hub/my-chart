import { useState, useEffect } from 'react'

// localStorage 키
const STORAGE_KEY = 'hanuiwon_patients_v4'

// 섹션 컴포넌트 (App 외부에 정의하여 리렌더링 시 재생성 방지)
const Section = ({ title, children, className = '' }) => (
  <div className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 ${className}`}>
    <h3 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">{title}</h3>
    {children}
  </div>
)

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
const getTodayDate = () => {
  return new Date().toISOString().split('T')[0]
}

function App() {
  const [patients, setPatients] = useState(loadPatients)
  const [view, setView] = useState('list')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [listFilter, setListFilter] = useState('active')

  // 새 환자 등록 폼 상태
  const [newPatient, setNewPatient] = useState({
    name: '',
    gender: '',
    age: '',
    firstVisitDate: getTodayDate(),
    symptoms: '',
    treatmentMonths: 3,
    visitInterval: '주 2회',
    doctorMemo: '',
  })

  // 상담 기록 입력 상태
  const [newConsultation, setNewConsultation] = useState({
    date: getTodayDate(),
    comment: '',
  })

  // 환자 데이터 변경 시 localStorage에 저장
  useEffect(() => {
    savePatients(patients)
  }, [patients])

  // 새 환자 등록
  const handleAddPatient = () => {
    if (!newPatient.name.trim()) {
      alert('환자 이름을 입력해주세요.')
      return
    }

    const patient = {
      id: Date.now(),
      ...newPatient,
      age: newPatient.age ? Number(newPatient.age) : null,
      createdAt: new Date().toISOString(),
      // 주간 내원 기록
      weeklyVisits: [],
      // 탕/환약 복용 기록 (월별): { month: 1, taken: true, type: '탕약', note: '' }
      herbalRecords: [],
      // 상담 기록: { id, date, comment }
      consultations: [],
      // 치료 종료 관련
      isCompleted: false,
      completedDate: null,
      hasWrittenReview: false,
      hasVideoInterview: false,
    }

    setPatients([...patients, patient])
    setNewPatient({
      name: '',
      gender: '',
      age: '',
      firstVisitDate: getTodayDate(),
      symptoms: '',
      treatmentMonths: 3,
      visitInterval: '주 2회',
      doctorMemo: '',
    })
    setView('list')
  }

  // 환자 정보 업데이트
  const updatePatient = (patientId, updates) => {
    setPatients(patients.map(p =>
      p.id === patientId ? { ...p, ...updates } : p
    ))
  }

  // 주간 내원 토글
  const toggleWeeklyVisit = (patientId, week) => {
    setPatients(patients.map(p => {
      if (p.id === patientId) {
        const existingVisit = p.weeklyVisits.find(v => v.week === week)
        if (existingVisit) {
          return {
            ...p,
            weeklyVisits: p.weeklyVisits.map(v =>
              v.week === week
                ? { ...v, visited: !v.visited, missedReason: v.visited ? v.missedReason : '' }
                : v
            )
          }
        } else {
          return {
            ...p,
            weeklyVisits: [...p.weeklyVisits, {
              week,
              visited: true,
              missedReason: '',
              date: new Date().toISOString()
            }]
          }
        }
      }
      return p
    }))
  }

  // 내원 미이행 사유 업데이트
  const updateMissedReason = (patientId, week, reason) => {
    setPatients(patients.map(p => {
      if (p.id === patientId) {
        return {
          ...p,
          weeklyVisits: p.weeklyVisits.map(v =>
            v.week === week ? { ...v, missedReason: reason } : v
          )
        }
      }
      return p
    }))
  }

  // 탕/환약 기록 업데이트
  const updateHerbalRecord = (patientId, month, field, value) => {
    setPatients(patients.map(p => {
      if (p.id === patientId) {
        const records = p.herbalRecords || []
        const existingRecord = records.find(r => r.month === month)
        if (existingRecord) {
          return {
            ...p,
            herbalRecords: records.map(r =>
              r.month === month ? { ...r, [field]: value } : r
            )
          }
        } else {
          return {
            ...p,
            herbalRecords: [...records, { month, taken: false, type: '', note: '', [field]: value }]
          }
        }
      }
      return p
    }))
  }

  // 탕/환약 복용 토글
  const toggleHerbalTaken = (patientId, month) => {
    setPatients(patients.map(p => {
      if (p.id === patientId) {
        const records = p.herbalRecords || []
        const existingRecord = records.find(r => r.month === month)
        if (existingRecord) {
          return {
            ...p,
            herbalRecords: records.map(r =>
              r.month === month ? { ...r, taken: !r.taken } : r
            )
          }
        } else {
          return {
            ...p,
            herbalRecords: [...records, { month, taken: true, type: '탕약', note: '' }]
          }
        }
      }
      return p
    }))
  }

  // 상담 기록 추가
  const addConsultation = (patientId) => {
    if (!newConsultation.comment.trim()) {
      alert('상담 내용을 입력해주세요.')
      return
    }

    setPatients(patients.map(p => {
      if (p.id === patientId) {
        const consultations = p.consultations || []
        return {
          ...p,
          consultations: [
            {
              id: Date.now(),
              date: newConsultation.date,
              comment: newConsultation.comment,
            },
            ...consultations,
          ]
        }
      }
      return p
    }))

    setNewConsultation({
      date: getTodayDate(),
      comment: '',
    })
  }

  // 상담 기록 삭제
  const deleteConsultation = (patientId, consultationId) => {
    if (confirm('이 상담 기록을 삭제하시겠습니까?')) {
      setPatients(patients.map(p => {
        if (p.id === patientId) {
          return {
            ...p,
            consultations: (p.consultations || []).filter(c => c.id !== consultationId)
          }
        }
        return p
      }))
    }
  }

  // 치료 종료 토글
  const toggleTreatmentComplete = (patientId) => {
    setPatients(patients.map(p => {
      if (p.id === patientId) {
        const newCompleted = !p.isCompleted
        return {
          ...p,
          isCompleted: newCompleted,
          completedDate: newCompleted ? new Date().toISOString() : null,
          hasWrittenReview: newCompleted ? p.hasWrittenReview : false,
          hasVideoInterview: newCompleted ? p.hasVideoInterview : false,
        }
      }
      return p
    }))
  }

  // 환자 삭제
  const deletePatient = (patientId) => {
    if (confirm('정말 이 환자를 삭제하시겠습니까?')) {
      setPatients(patients.filter(p => p.id !== patientId))
      setView('list')
      setSelectedPatient(null)
    }
  }

  // 통계 계산
  const calculateStats = (patient) => {
    const totalMonths = patient.treatmentMonths
    const totalWeeks = totalMonths * 4
    const visitedWeeks = patient.weeklyVisits.filter(v => v.visited).length
    const herbalRecords = patient.herbalRecords || []
    const herbalMonths = herbalRecords.filter(r => r.taken).length
    const adherenceRate = totalWeeks > 0 ? Math.round((visitedWeeks / totalWeeks) * 100) : 0

    return {
      totalMonths,
      totalWeeks,
      visitedWeeks,
      herbalMonths,
      adherenceRate,
    }
  }

  // 필터링된 환자 목록
  const getFilteredPatients = () => {
    switch (listFilter) {
      case 'active':
        return patients.filter(p => !p.isCompleted)
      case 'completed':
        return patients.filter(p => p.isCompleted)
      default:
        return patients
    }
  }

  // 수동 저장
  const handleManualSave = () => {
    savePatients(patients)
    alert('데이터가 저장되었습니다.')
  }

  // JSON 내보내기
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(patients, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `한의원_환자데이터_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // JSON 가져오기
  const handleImportJSON = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result)
        if (Array.isArray(importedData)) {
          if (confirm(`${importedData.length}명의 환자 데이터를 가져오시겠습니까?\n기존 데이터는 유지됩니다.`)) {
            // 중복 방지를 위해 ID 새로 생성
            const newPatients = importedData.map(p => ({
              ...p,
              id: Date.now() + Math.random()
            }))
            setPatients([...patients, ...newPatients])
            alert('데이터를 가져왔습니다.')
          }
        } else {
          alert('올바른 형식의 JSON 파일이 아닙니다.')
        }
      } catch (error) {
        alert('JSON 파일을 읽는 중 오류가 발생했습니다.')
      }
    }
    reader.readAsText(file)
    event.target.value = '' // 같은 파일 다시 선택 가능하도록
  }

  // 환자 목록 화면
  const renderPatientList = () => {
    const filteredPatients = getFilteredPatients()

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-800">환자 목록</h2>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {[
                { key: 'active', label: '치료중' },
                { key: 'completed', label: '종료' },
                { key: 'all', label: '전체' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setListFilter(f.key)}
                  className={`px-3 py-1.5 text-sm transition ${
                    listFilter === f.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setView('stats')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm"
            >
              전체 통계
            </button>
            <button
              onClick={() => setView('add')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
            >
              + 새 환자 등록
            </button>
          </div>
        </div>

        {filteredPatients.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>등록된 환자가 없습니다.</p>
            <p className="text-sm mt-2">새 환자를 등록해주세요.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredPatients.map(patient => {
              const stats = calculateStats(patient)
              return (
                <div
                  key={patient.id}
                  onClick={() => {
                    setSelectedPatient(patient)
                    setView('detail')
                  }}
                  className={`bg-white p-5 rounded-xl shadow-sm border hover:shadow-md transition cursor-pointer ${
                    patient.isCompleted ? 'border-gray-200 bg-gray-50' : 'border-gray-100'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium text-gray-900">{patient.name}</h3>
                        {patient.gender && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            patient.gender === '남' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                          }`}>
                            {patient.gender}
                          </span>
                        )}
                        {patient.age && (
                          <span className="text-xs text-gray-500">{patient.age}세</span>
                        )}
                        {patient.isCompleted && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">치료종료</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        치료기간: {patient.treatmentMonths}개월 ({stats.totalWeeks}주) | {patient.visitInterval}
                      </p>
                      <p className="text-sm text-gray-600 mt-2 line-clamp-1">{patient.symptoms}</p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-blue-600">{stats.adherenceRate}%</div>
                      <div className="text-xs text-gray-500">내원율</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <span className="text-gray-600">
                      내원: <span className="font-medium text-gray-900">{stats.visitedWeeks}/{stats.totalWeeks}주</span>
                    </span>
                    <span className="text-emerald-600">
                      탕/환약: <span className="font-medium">{stats.herbalMonths}/{stats.totalMonths}개월</span>
                    </span>
                    {patient.isCompleted && patient.hasWrittenReview && (
                      <span className="text-amber-600">수기후기 완료</span>
                    )}
                    {patient.isCompleted && patient.hasVideoInterview && (
                      <span className="text-purple-600">영상인터뷰 완료</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // 새 환자 등록 화면
  const renderAddPatient = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setView('list')}
          className="text-gray-600 hover:text-gray-900"
        >
          ← 목록으로
        </button>
        <h2 className="text-xl font-semibold text-gray-800">새 환자 등록</h2>
      </div>

      {/* 기본 정보 섹션 */}
      <Section title="기본 정보">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              환자 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newPatient.name}
              onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="홍길동"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">성별</label>
              <div className="flex gap-2">
                {['남', '여'].map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setNewPatient({ ...newPatient, gender: newPatient.gender === g ? '' : g })}
                    className={`flex-1 py-3 rounded-lg border transition ${
                      newPatient.gender === g
                        ? g === '남' ? 'bg-blue-600 text-white border-blue-600' : 'bg-pink-500 text-white border-pink-500'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">나이</label>
              <input
                type="number"
                value={newPatient.age}
                onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="35"
                min="1"
                max="150"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">초진일</label>
            <input
              type="date"
              value={newPatient.firstVisitDate}
              onChange={(e) => setNewPatient({ ...newPatient, firstVisitDate: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">내원 간격</label>
            <input
              type="text"
              value={newPatient.visitInterval}
              onChange={(e) => setNewPatient({ ...newPatient, visitInterval: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="예: 주 2회, 2주 1회"
            />
          </div>
        </div>
      </Section>

      {/* 증상 및 치료 계획 섹션 */}
      <Section title="증상 및 치료 계획">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">증상 및 주소증</label>
            <textarea
              value={newPatient.symptoms}
              onChange={(e) => setNewPatient({ ...newPatient, symptoms: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition h-24 resize-none"
              placeholder="환자의 주요 증상을 입력하세요..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              치료 계획 기간
              <span className="text-gray-400 font-normal ml-2">
                ({newPatient.treatmentMonths * 4}주)
              </span>
            </label>
            <select
              value={newPatient.treatmentMonths}
              onChange={(e) => setNewPatient({ ...newPatient, treatmentMonths: Number(e.target.value) })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{m}개월 ({m * 4}주)</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* 원장 메모 섹션 */}
      <Section title="원장 메모">
        <textarea
          value={newPatient.doctorMemo}
          onChange={(e) => setNewPatient({ ...newPatient, doctorMemo: e.target.value })}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition h-32 resize-none"
          placeholder="원장만 볼 수 있는 메모를 입력하세요..."
        />
      </Section>

      <button
        onClick={handleAddPatient}
        className="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-medium text-lg"
      >
        환자 등록
      </button>
    </div>
  )

  // 환자 상세 화면
  const renderPatientDetail = () => {
    if (!selectedPatient) return null

    const patient = patients.find(p => p.id === selectedPatient.id) || selectedPatient
    const stats = calculateStats(patient)
    const totalMonths = patient.treatmentMonths
    const totalWeeks = totalMonths * 4
    const herbalRecords = patient.herbalRecords || []
    const consultations = patient.consultations || []

    return (
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setView('list')
                setSelectedPatient(null)
              }}
              className="text-gray-600 hover:text-gray-900"
            >
              ← 목록으로
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-800">{patient.name}</h2>
              {patient.gender && (
                <span className={`text-xs px-2 py-0.5 rounded ${
                  patient.gender === '남' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                }`}>
                  {patient.gender}
                </span>
              )}
              {patient.age && <span className="text-sm text-gray-500">{patient.age}세</span>}
              {patient.isCompleted && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">치료종료</span>
              )}
            </div>
          </div>
          <button
            onClick={() => deletePatient(patient.id)}
            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition text-sm"
          >
            삭제
          </button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-blue-600">{stats.adherenceRate}%</div>
            <div className="text-sm text-gray-500 mt-1">내원율</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-gray-900">{stats.visitedWeeks}<span className="text-lg text-gray-400">/{stats.totalWeeks}</span></div>
            <div className="text-sm text-gray-500 mt-1">내원 주차</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-emerald-600">{stats.herbalMonths}<span className="text-lg text-gray-400">/{stats.totalMonths}</span></div>
            <div className="text-sm text-gray-500 mt-1">탕/환약 복용</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-purple-600">{consultations.length}</div>
            <div className="text-sm text-gray-500 mt-1">상담 기록</div>
          </div>
        </div>

        {/* 기본 정보 */}
        <Section title="기본 정보">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">초진일</span>
              <p className="font-medium mt-1">{patient.firstVisitDate || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">치료 기간</span>
              <p className="font-medium mt-1">{patient.treatmentMonths}개월 ({totalWeeks}주)</p>
            </div>
            <div>
              <span className="text-gray-500">내원 간격</span>
              <p className="font-medium mt-1">{patient.visitInterval || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">등록일</span>
              <p className="font-medium mt-1">{new Date(patient.createdAt).toLocaleDateString('ko-KR')}</p>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-gray-500 text-sm">증상 및 주소증</span>
            <p className="mt-1">{patient.symptoms || '-'}</p>
          </div>
        </Section>

        {/* 주간 내원 관리 */}
        <Section title={`주간 내원 관리 (총 ${totalWeeks}주)`}>
          <div className="space-y-2">
            {Array.from({ length: totalMonths }, (_, monthIndex) => {
              const monthNumber = monthIndex + 1
              const startWeek = monthIndex * 4 + 1
              const endWeek = startWeek + 3

              return (
                <div key={monthNumber} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                    <span className="font-medium text-gray-700">{monthNumber}개월차</span>
                    <span className="text-gray-400 text-sm ml-2">({startWeek}주 ~ {endWeek}주)</span>
                  </div>
                  <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Array.from({ length: 4 }, (_, weekIndex) => {
                      const week = startWeek + weekIndex
                      const visit = patient.weeklyVisits.find(v => v.week === week)
                      const visited = visit?.visited || false
                      const missedReason = visit?.missedReason || ''

                      return (
                        <div key={week} className="space-y-1">
                          <button
                            onClick={() => toggleWeeklyVisit(patient.id, week)}
                            className={`w-full py-2 rounded-lg text-sm font-medium transition ${
                              visited
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {week}주차 {visited ? '✓' : ''}
                          </button>
                          {!visited && visit && (
                            <input
                              type="text"
                              value={missedReason}
                              onChange={(e) => updateMissedReason(patient.id, week, e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                              placeholder="미이행 사유"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* 탕/환약 복용 관리 */}
        <Section title={`탕/환약 복용 관리 (총 ${totalMonths}개월)`}>
          <div className="space-y-3">
            {Array.from({ length: totalMonths }, (_, i) => {
              const month = i + 1
              const record = herbalRecords.find(r => r.month === month) || { taken: false, type: '', note: '' }

              return (
                <div key={month} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleHerbalTaken(patient.id, month)}
                      className={`w-24 py-2 rounded-lg text-sm font-medium transition ${
                        record.taken
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {month}개월 {record.taken ? '✓' : ''}
                    </button>

                    <select
                      value={record.type || ''}
                      onChange={(e) => updateHerbalRecord(patient.id, month, 'type', e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">종류 선택</option>
                      <option value="탕약">탕약</option>
                      <option value="환약">환약</option>
                      <option value="탕약+환약">탕약+환약</option>
                    </select>

                    <input
                      type="text"
                      value={record.note || ''}
                      onChange={(e) => updateHerbalRecord(patient.id, month, 'note', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500"
                      placeholder="메모 (예: 가미소요산, 보중익기탕 등)"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-sm text-gray-500 mt-3">
            총 <span className="font-medium text-emerald-600">{stats.herbalMonths}개월</span> 복용 완료
          </p>
        </Section>

        {/* 상담 기록 */}
        <Section title="상담 기록">
          {/* 새 상담 입력 */}
          <div className="bg-purple-50 p-4 rounded-lg mb-4">
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="date"
                value={newConsultation.date}
                onChange={(e) => setNewConsultation({ ...newConsultation, date: e.target.value })}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-purple-500 bg-white"
              />
              <input
                type="text"
                value={newConsultation.comment}
                onChange={(e) => setNewConsultation({ ...newConsultation, comment: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-purple-500 bg-white"
                placeholder="상담 내용을 입력하세요..."
                onKeyPress={(e) => e.key === 'Enter' && addConsultation(patient.id)}
              />
              <button
                onClick={() => addConsultation(patient.id)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm whitespace-nowrap"
              >
                + 추가
              </button>
            </div>
          </div>

          {/* 상담 기록 목록 */}
          {consultations.length === 0 ? (
            <p className="text-center text-gray-400 py-4">상담 기록이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {consultations.map(c => (
                <div key={c.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-purple-600 whitespace-nowrap">{c.date}</span>
                  <p className="flex-1 text-sm text-gray-700">{c.comment}</p>
                  <button
                    onClick={() => deleteConsultation(patient.id, c.id)}
                    className="text-gray-400 hover:text-red-500 transition text-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 원장 메모 */}
        <Section title="원장 메모">
          <textarea
            value={patient.doctorMemo || ''}
            onChange={(e) => updatePatient(patient.id, { doctorMemo: e.target.value })}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition h-32 resize-none"
            placeholder="원장만 볼 수 있는 메모..."
          />
        </Section>

        {/* 치료 종료 관리 */}
        <Section title="치료 종료 관리">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">치료 종료 여부</p>
                <p className="text-sm text-gray-500">치료가 완료되면 체크해주세요</p>
              </div>
              <button
                onClick={() => toggleTreatmentComplete(patient.id)}
                className={`relative w-14 h-8 rounded-full transition ${
                  patient.isCompleted ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                    patient.isCompleted ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {patient.isCompleted && (
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <p className="text-sm font-medium text-gray-700">후기 관리</p>
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-amber-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={patient.hasWrittenReview}
                    onChange={(e) => updatePatient(patient.id, { hasWrittenReview: e.target.checked })}
                    className="w-5 h-5 text-amber-600 rounded"
                  />
                  <div>
                    <span className="font-medium text-gray-900">수기후기 작성 완료</span>
                    <p className="text-sm text-gray-500">환자가 수기 후기를 작성했습니다</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-purple-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={patient.hasVideoInterview}
                    onChange={(e) => updatePatient(patient.id, { hasVideoInterview: e.target.checked })}
                    className="w-5 h-5 text-purple-600 rounded"
                  />
                  <div>
                    <span className="font-medium text-gray-900">영상 인터뷰 완료</span>
                    <p className="text-sm text-gray-500">환자 영상 인터뷰를 진행했습니다</p>
                  </div>
                </label>
              </div>
            )}
          </div>
        </Section>
      </div>
    )
  }

  // 전체 통계 화면
  const renderOverallStats = () => {
    const totalPatients = patients.length
    const activePatients = patients.filter(p => !p.isCompleted).length
    const completedPatients = patients.filter(p => p.isCompleted).length
    const avgAdherence = totalPatients > 0
      ? Math.round(patients.reduce((acc, p) => acc + calculateStats(p).adherenceRate, 0) / totalPatients)
      : 0
    const totalHerbalMonths = patients.reduce((acc, p) => acc + calculateStats(p).herbalMonths, 0)
    const writtenReviews = patients.filter(p => p.hasWrittenReview).length
    const videoInterviews = patients.filter(p => p.hasVideoInterview).length

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('list')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← 목록으로
          </button>
          <h2 className="text-xl font-semibold text-gray-800">전체 통계</h2>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-4xl font-bold text-blue-600">{totalPatients}</div>
            <div className="text-sm text-gray-500 mt-2">총 환자 수</div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-4xl font-bold text-emerald-600">{activePatients}</div>
            <div className="text-sm text-gray-500 mt-2">치료중</div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-4xl font-bold text-gray-600">{completedPatients}</div>
            <div className="text-sm text-gray-500 mt-2">치료 종료</div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-4xl font-bold text-amber-600">{avgAdherence}%</div>
            <div className="text-sm text-gray-500 mt-2">평균 내원율</div>
          </div>
        </div>

        {/* 추가 통계 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-emerald-600">{totalHerbalMonths}</div>
            <div className="text-sm text-gray-500 mt-2">총 탕/환약 복용 (개월)</div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-amber-600">{writtenReviews}</div>
            <div className="text-sm text-gray-500 mt-2">수기후기 완료</div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-purple-600">{videoInterviews}</div>
            <div className="text-sm text-gray-500 mt-2">영상인터뷰 완료</div>
          </div>
        </div>

        {/* 환자별 통계 테이블 */}
        {totalPatients > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">환자명</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">성별/나이</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">치료기간</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">내원율</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">내원(주)</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">탕/환약(월)</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {patients.map(patient => {
                    const stats = calculateStats(patient)
                    return (
                      <tr key={patient.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">{patient.name}</td>
                        <td className="px-4 py-4 text-sm text-center text-gray-600">
                          {patient.gender || '-'} / {patient.age ? `${patient.age}세` : '-'}
                        </td>
                        <td className="px-4 py-4 text-sm text-center text-gray-600">{patient.treatmentMonths}개월</td>
                        <td className="px-4 py-4 text-sm text-center">
                          <span className={`font-medium ${
                            stats.adherenceRate >= 80 ? 'text-emerald-600' :
                            stats.adherenceRate >= 50 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {stats.adherenceRate}%
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-center text-gray-600">
                          {stats.visitedWeeks}/{stats.totalWeeks}
                        </td>
                        <td className="px-4 py-4 text-sm text-center text-gray-600">
                          {stats.herbalMonths}/{stats.totalMonths}
                        </td>
                        <td className="px-4 py-4 text-sm text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            patient.isCompleted ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {patient.isCompleted ? '종료' : '치료중'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h1
            className="text-2xl font-bold text-gray-900 cursor-pointer"
            onClick={() => setView('list')}
          >
            한의원 환자 관리 차트
          </h1>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleManualSave}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
            >
              저장
            </button>
            <button
              onClick={handleExportJSON}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
            >
              JSON 내보내기
            </button>
            <label className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition text-sm cursor-pointer">
              JSON 가져오기
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {view === 'list' && renderPatientList()}
        {view === 'add' && renderAddPatient()}
        {view === 'detail' && renderPatientDetail()}
        {view === 'stats' && renderOverallStats()}
      </main>
    </div>
  )
}

export default App
