/** @format */

const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const dgram = require('dgram')
const path = require('path')
const os = require('os')

// 단일 인스턴스 락
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 두 번째 인스턴스 실행 시 기존 창 활성화
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

let mainWindow
let udpSocket
let localIPs = []
let discoveryInterval = null

// 멀티캐스트/브로드캐스트 설정
const BROADCAST_ADDR = '255.255.255.255'
const UDP_PORT = 36721 // 송수신 포트
const DEVICE_INFO_REQUEST = 0x01
const DEVICE_INFO_RESPONSE = 0x02

function createWindow() {
  // 메뉴 제거
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'M Monitor',
    icon: path.join(__dirname, 'public/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.loadFile('index.html')

  // 개발자 도구 열기 (개발 중)
}

// UDP 멀티캐스트 소켓 초기화
function initializeUdpSocket() {
  // 로컬 IP 주소 목록 가져오기
  const networkInterfaces = os.networkInterfaces()
  localIPs = []
  for (const interfaceName in networkInterfaces) {
    const addresses = networkInterfaces[interfaceName]
    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal) {
        localIPs.push(addr.address)
      }
    }
  }
  console.log('[로컬 IP 목록]', localIPs)

  udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

  udpSocket.on('error', (err) => {
    console.error('소켓 에러:', err)
  })

  udpSocket.on('listening', () => {
    const address = udpSocket.address()
    console.log(`소켓 리스닝: ${address.address}:${address.port}`)
  })

  // 36721 포트로 바인딩 (브로드캐스트 송수신)
  udpSocket.bind(UDP_PORT, '0.0.0.0', () => {
    try {
      // 브로드캐스트 활성화
      udpSocket.setBroadcast(true)
      console.log(`소켓을 0.0.0.0:${UDP_PORT}에 바인딩 (브로드캐스트 송수신)`)
      console.log(`브로드캐스트 활성화`)
    } catch (err) {
      console.error('소켓 설정 실패:', err)
    }
  })

  // 메시지 수신 처리
  udpSocket.on('message', (msg, rinfo) => {
    console.log(
      `[수신] ${rinfo.address}:${rinfo.port}에서 ${msg.length}바이트 수신`
    )
    console.log(
      `[데이터] ${Array.from(msg)
        .map((b) => '0x' + b.toString(16).padStart(2, '0'))
        .join(' ')}`
    )

    // 자기 자신이 보낸 메시지는 무시 (일단 주석 처리)
    // if (localIPs.includes(rinfo.address)) {
    //   console.log(`[무시] 자기 자신(${rinfo.address})에서 온 메시지`)
    //   return
    // }

    try {
      if (msg.length >= 1 && msg[0] === DEVICE_INFO_RESPONSE) {
        console.log('[응답] 디바이스 정보 응답 감지')
        const deviceInfo = parseDeviceInfo(msg, rinfo)
        if (deviceInfo) {
          console.log('[파싱 성공]', deviceInfo)
          // 렌더러 프로세스로 디바이스 정보 전송
          mainWindow.webContents.send('device-found', deviceInfo)
        } else {
          console.log('[파싱 실패] 디바이스 정보 파싱 실패')
        }
      } else {
        console.log(
          `[무시] 메시지 타입: 0x${
            msg[0]?.toString(16).padStart(2, '0') || '??'
          }`
        )
      }
    } catch (err) {
      console.error('메시지 파싱 에러:', err)
    }
  })

  udpSocket.on('error', (err) => {
    console.error('UDP 소켓 에러:', err)
  })
}

// 디바이스 정보 파싱
function parseDeviceInfo(msg, rinfo) {
  try {
    // 메시지 형식: [msg_type(1)] [device_id(1)] [ip(4)] [mac(6)] [tcp_port(2)] [uart_baud(4)]
    if (msg.length < 18) {
      return null
    }

    const deviceId = msg[1]
    const ip = `${msg[2]}.${msg[3]}.${msg[4]}.${msg[5]}`
    const mac = Array.from(msg.slice(6, 12))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(':')
      .toUpperCase()
    // Little-endian uint16: 인덱스 12-13
    const tcpPort = msg[12] | (msg[13] << 8)
    // Little-endian uint32: 인덱스 14-17
    const uartBaud =
      msg[14] | (msg[15] << 8) | (msg[16] << 16) | (msg[17] << 24)

    return {
      deviceId,
      ip,
      mac,
      tcpPort,
      uartBaud,
      lastSeen: new Date().toISOString()
    }
  } catch (err) {
    console.error('파싱 에러:', err)
    return null
  }
}

// 디바이스 검색 요청 전송 (브로드캐스트)
function sendDiscoveryRequest() {
  if (!udpSocket) {
    console.error('UDP 소켓이 초기화되지 않았습니다.')
    return
  }

  const address = udpSocket.address()
  console.log(`[송신] 소켓 정보: ${address.address}:${address.port}`)

  const message = Buffer.from([DEVICE_INFO_REQUEST, 0, 0, 0])

  // 브로드캐스트로 전송
  udpSocket.send(
    message,
    0,
    message.length,
    UDP_PORT,
    BROADCAST_ADDR,
    (err) => {
      if (err) {
        console.error('브로드캐스트 전송 실패:', err)
      } else {
        console.log(`[브로드캐스트] ${BROADCAST_ADDR}:${UDP_PORT}로 전송됨`)
      }
    }
  )
}

// IPC 핸들러
ipcMain.handle('send-discovery', async () => {
  sendDiscoveryRequest()
  return { success: true }
})

// 외부 URL 열기 핸들러
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url)
  return { success: true }
})

// 앱 초기화
app.whenReady().then(() => {
  createWindow()
  initializeUdpSocket()

  // 5초마다 자동으로 디바이스 검색
  discoveryInterval = setInterval(() => {
    console.log('[Auto Discovery] 디바이스 검색 요청 송신')
    sendDiscoveryRequest()
  }, 5000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 앱 종료 처리
app.on('window-all-closed', () => {
  if (discoveryInterval) {
    clearInterval(discoveryInterval)
    discoveryInterval = null
  }
  if (udpSocket) {
    try {
      udpSocket.removeAllListeners()
      udpSocket.close()
      udpSocket = null
    } catch (err) {
      console.error('소켓 종료 오류:', err)
    }
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  if (discoveryInterval) {
    clearInterval(discoveryInterval)
    discoveryInterval = null
  }
  if (udpSocket) {
    try {
      udpSocket.removeAllListeners()
      udpSocket.close()
      udpSocket = null
    } catch (err) {
      console.error('소켓 종료 오류:', err)
    }
  }
})
