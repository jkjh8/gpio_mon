/** @format */

// 디바이스 목록 저장
const devices = new Map()

// DOM 요소
const getBtn = document.getElementById('getBtn')
const clearBtn = document.getElementById('clearBtn')
const devicesList = document.getElementById('devicesList')

// GET 버튼 클릭 이벤트
getBtn.addEventListener('click', async () => {
  console.log('디바이스 검색 시작...')
  getBtn.disabled = true
  getBtn.textContent = '검색 중...'

  try {
    await window.electronAPI.sendDiscovery()
    setTimeout(() => {
      getBtn.disabled = false
      getBtn.textContent = 'GET'
    }, 1000)
  } catch (err) {
    console.error('검색 실패:', err)
    getBtn.disabled = false
    getBtn.textContent = 'GET'
  }
})

// CLEAR 버튼 클릭 이벤트
clearBtn.addEventListener('click', () => {
  devices.clear()
  updateDevicesList()
  console.log('디바이스 목록 초기화')
})

// 디바이스 발견 이벤트 수신
window.electronAPI.onDeviceFound((device) => {
  console.log('디바이스 발견:', device)

  // 디바이스 정보 저장 (IP를 키로 사용)
  devices.set(device.ip, device)

  // UI 업데이트
  updateDevicesList()
})

// 디바이스 목록 UI 업데이트
function updateDevicesList() {
  if (devices.size === 0) {
    devicesList.innerHTML =
      '<p class="no-devices">검색된 디바이스가 없습니다. GET 버튼을 눌러 검색하세요.</p>'
    return
  }

  devicesList.innerHTML = ''

  devices.forEach((device) => {
    const card = createDeviceCard(device)
    devicesList.appendChild(card)
  })
}

// 디바이스 카드 생성
function createDeviceCard(device) {
  const card = document.createElement('div')
  card.className = 'device-card'

  // IP 클릭 시 웹브라우저로 열기 (HTTP 80포트)
  card.addEventListener('click', () => {
    const url = `http://${device.ip}`
    window.electronAPI.openExternal(url)
  })

  const lastSeenTime = new Date(device.lastSeen).toLocaleString('ko-KR')

  card.innerHTML = `
    <div class="device-header">
      <div class="device-id">
        디바이스 ID ${device.deviceId}
        <span class="device-mac">${device.mac}</span>
      </div>
      <div class="device-status">온라인</div>
    </div>
    <div class="device-info">
      <div class="info-row">
        <span class="info-label">IP 주소:</span>
        <span class="info-value device-ip">${device.ip}</span>
      </div>
      <div class="info-row">
        <span class="info-label">TCP 포트:</span>
        <span class="info-value">${device.tcpPort}</span>
      </div>
      <div class="info-row">
        <span class="info-label">RS232 Baud:</span>
        <span class="info-value">${device.uartBaud.toLocaleString()}</span>
      </div>
    </div>
    <div class="last-seen">마지막 응답: ${lastSeenTime}</div>
  `

  return card
}

// 초기 메시지 표시
updateDevicesList()
