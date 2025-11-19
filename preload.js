/** @format */

const { contextBridge, ipcRenderer } = require('electron')

// 렌더러 프로세스에 안전한 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 디바이스 검색 요청
  sendDiscovery: () => ipcRenderer.invoke('send-discovery'),

  // 디바이스 발건 이벤트 수신
  onDeviceFound: (callback) => {
    ipcRenderer.on('device-found', (event, device) => {
      callback(device)
    })
  },

  // 외부 URL 열기
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
})
