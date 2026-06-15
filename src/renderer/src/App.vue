<template>
  <n-config-provider :theme="isDark ? darkTheme : null" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-notification-provider>
        <div class="app-container">
          <header class="app-header">
            <div class="app-title">
              <n-icon size="26" :color="'#2080f0'">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
              </n-icon>
              <span>抖音 / 快手 无水印下载器</span>
            </div>
            <div style="display: flex; align-items: center; gap: 14px;">
              <span class="stat-row">
                <span>下载中: {{ downloadStore.activeCount }}</span>
                <span style="color:#18a058">成功: {{ downloadStore.completedCount }}</span>
                <span style="color:#d03050">失败: {{ downloadStore.failedCount }}</span>
              </span>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button quaternary circle @click="handleSelectDir">
                    <template #icon>
                      <n-icon size="20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg></n-icon>
                    </template>
                  </n-button>
                </template>
                选择下载目录（当前：{{ currentDownloadDir || '系统下载目录' }}）
              </n-tooltip>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button quaternary circle @click="isDark = !isDark">
                    <template #icon>
                      <n-icon size="20">
                        <svg v-if="isDark" viewBox="0 0 24 24" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>
                        <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"/></svg>
                      </n-icon>
                    </template>
                  </n-button>
                </template>
                {{ isDark ? '切换浅色' : '切换深色' }}
              </n-tooltip>
            </div>
          </header>

          <main class="app-content">
            <div class="input-section">
              <n-card class="input-card" bordered>
                <template #header>
                  <div style="font-weight:600">粘贴分享链接</div>
                </template>
                <n-input
                  v-model:value="inputText"
                  type="textarea"
                  class="link-textarea"
                  placeholder="在此粘贴抖音/快手分享链接，每行一个，支持批量（自动识别文本中的链接）"
                  :autosize="{ minRows: 3, maxRows: 6 }"
                />
                <div class="action-row">
                  <n-space>
                    <n-button type="primary" :loading="isProcessing" @click="handleStartDownload">
                      <template #icon>
                        <n-icon size="18"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></n-icon>
                      </template>
                      解析并下载
                    </n-button>
                    <n-button @click="inputText = ''">清空</n-button>
                    <n-button
                      v-if="downloadStore.tasks.length"
                      @click="downloadStore.clearCompleted()"
                    >
                      清除已完成
                    </n-button>
                  </n-space>
                  <n-space style="margin-left: auto;">
                    <span style="font-size: 13px; color: var(--n-text-color-2);">并发数：</span>
                    <n-select
                      v-model:value="concurrency"
                      :options="concurrencyOptions"
                      style="width: 90px"
                      @update:value="handleConcurrencyChange"
                    />
                  </n-space>
                </div>
              </n-card>
            </div>

            <div class="tabs-section">
              <n-tabs type="line" :tab-style="{ fontSize: '15px' }">
                <n-tab-pane name="tasks" tab="下载任务">
                  <div class="download-tasks">
                    <div v-if="!downloadStore.tasks.length" class="empty-tip">
                      暂无下载任务，粘贴链接开始下载
                    </div>
                    <div
                      v-for="task in downloadStore.tasks"
                      :key="task.id"
                      class="task-item"
                    >
                      <div class="task-header">
                        <div class="task-title">
                          <n-tag :type="platformTagType(task.platform)" size="small" style="margin-right:8px">
                            {{ platformLabel(task.platform) }}
                          </n-tag>
                          <span>{{ task.title || task.link }}</span>
                        </div>
                        <div class="task-status">
                          <n-tag :type="taskStatusType(task.status)" size="small" round>
                            {{ taskStatusLabel(task.status) }}
                          </n-tag>
                        </div>
                      </div>

                      <div v-if="task.status === 'downloading' || task.status === 'parsing'" class="task-progress">
                        <n-progress
                          type="line"
                          :percentage="Math.floor(task.progress)"
                          :show-indicator="true"
                          :processing="task.status === 'downloading' || task.status === 'parsing'"
                          :status="task.progress >= 100 ? 'success' : 'default'"
                        />
                        <div v-if="task.status === 'downloading' && task.speed" style="text-align:right;font-size:12px;color:var(--n-text-color-3);margin-top:4px">
                          {{ formatSpeed(task.speed) }}
                        </div>
                      </div>

                      <div class="task-footer">
                        <span style="color: var(--n-text-color-3);">
                          {{ task.errorMsg || (task.filePath ? `保存到：${task.filePath}` : '') }}
                        </span>
                        <div style="display:flex; gap:6px;">
                          <n-button
                            v-if="task.status === 'done' && task.filePath"
                            size="tiny"
                            type="primary"
                            quaternary
                            @click="handleOpenPath(task.filePath)"
                          >
                            打开文件位置
                          </n-button>
                          <n-button size="tiny" quaternary @click="handleRemoveTask(task.id)">
                            移除
                          </n-button>
                        </div>
                      </div>
                    </div>
                  </div>
                </n-tab-pane>

                <n-tab-pane name="history" tab="历史记录">
                  <div class="history-panel">
                    <div class="filter-row">
                      <n-date-picker
                        type="daterange"
                        v-model:value="dateRange"
                        clearable
                        placeholder="选择时间范围"
                        style="width: 260px"
                      />
                      <n-button size="small" @click="handleFilterHistory">
                        <template #icon><n-icon size="16"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></n-icon></template>
                        筛选
                      </n-button>
                      <n-button size="small" @click="handleRefreshHistory">刷新</n-button>
                      <n-button
                        size="small"
                        type="error"
                        quaternary
                        style="margin-left: auto"
                        @click="handleClearHistory"
                      >
                        <template #icon><n-icon size="16"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></n-icon></template>
                        清空历史
                      </n-button>
                    </div>

                    <div v-if="!displayHistory.length" class="empty-tip">
                      暂无历史记录
                    </div>

                    <div
                      v-for="item in displayHistory"
                      :key="item.id"
                      class="history-item"
                    >
                      <div class="history-title">
                        <n-tag :type="platformTagType(item.platform)" size="small" style="margin-right:8px">
                          {{ platformLabel(item.platform) }}
                        </n-tag>
                        {{ item.title }}
                      </div>
                      <div class="history-meta">
                        <span>🕒 {{ formatDate(item.timestamp) }}</span>
                        <span title="链接">🔗 {{ item.link?.slice(0, 50) }}{{ item.link?.length > 50 ? '...' : '' }}</span>
                        <span v-if="item.filePath" title="本地路径">📁 {{ item.filePath }}</span>
                      </div>
                      <div class="history-actions">
                        <n-button
                          v-if="item.filePath"
                          size="tiny"
                          type="primary"
                          quaternary
                          @click="handleOpenPath(item.filePath)"
                        >
                          打开文件位置
                        </n-button>
                        <n-button size="tiny" type="error" quaternary @click="handleDeleteHistory(item.id)">
                          删除
                        </n-button>
                      </div>
                    </div>
                  </div>
                </n-tab-pane>
              </n-tabs>
            </div>
          </main>
        </div>
      </n-notification-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, h } from 'vue'
import { useDownloadStore } from './stores/download'
import { DownloadManager } from './utils/downloader'
import { parseInputLinks } from './utils/parser'
import {
  NConfigProvider,
  NMessageProvider,
  NNotificationProvider,
  NCard,
  NInput,
  NButton,
  NIcon,
  NSpace,
  NTabs,
  NTabPane,
  NProgress,
  NTag,
  NTooltip,
  NSelect,
  NDatePicker,
  darkTheme,
  createDiscreteApi
} from 'naive-ui'

const { message, notification } = createDiscreteApi(['message', 'notification'])

const api = window.electronAPI || null
const isElectron = !!api

const downloadStore = useDownloadStore()

const inputText = ref('')
const isProcessing = ref(false)
const isDark = ref(false)
const concurrency = ref(3)
const concurrencyOptions = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '5', value: 5 },
  { label: '8', value: 8 }
]
const dateRange = ref(null)
const history = ref([])
const currentDownloadDir = ref('')

const themeOverrides = {}

const displayHistory = computed(() => {
  if (!dateRange.value || dateRange.value.length !== 2) return history.value
  const [s, e] = dateRange.value
  return history.value.filter(
    (h) => h.timestamp >= s && h.timestamp <= e + 86400000
  )
})

let manager = null
let progressUnsub = null
let completeUnsub = null

onMounted(async () => {
  manager = new DownloadManager(downloadStore, api)

  if (!isElectron) return

  try {
    const settings = await api.getSettings()
    if (settings) {
      concurrency.value = settings.concurrency || 3
      isDark.value = settings.theme === 'dark'
      manager.setConcurrency(concurrency.value)
    }
  } catch (_) {}

  try {
    currentDownloadDir.value = await api.getDownloadDir()
  } catch (_) {}

  try {
    history.value = await api.getHistory()
  } catch (_) {}

  progressUnsub = api.onDownloadProgress(({ taskId, progress, speed }) => {
    downloadStore.setProgress(taskId, progress, speed)
  })

  completeUnsub = api.onDownloadComplete(({ taskId, filePath, success, errorMsg }) => {
    const t = downloadStore.tasks.find((x) => x.id === taskId)
    if (!t) return
    if (success) {
      downloadStore.updateTask(taskId, {
        status: 'done',
        filePath,
        progress: 100
      })
      notification.success({
        title: '下载完成',
        content: t.title || filePath,
        duration: 4000
      })
      ;(async () => {
        try {
          history.value = await api.getHistory()
        } catch (_) {}
      })()
    } else {
      downloadStore.updateTask(taskId, {
        status: 'error',
        errorMsg
      })
      notification.error({
        title: '下载失败',
        content: errorMsg || (t.title || '未知错误'),
        duration: 5000
      })
    }
  })
})

onUnmounted(() => {
  progressUnsub && progressUnsub()
  completeUnsub && completeUnsub()
})

async function handleStartDownload() {
  if (!inputText.value.trim()) {
    message.warning('请先粘贴分享链接')
    return
  }

  if (!isElectron) {
    message.error('请在桌面应用中使用，浏览器环境无法下载')
    return
  }

  const links = parseInputLinks(inputText.value)
  if (!links.length) {
    message.error('未识别到有效链接，请检查输入')
    return
  }

  const valid = links.filter((l) => l.platform !== 'unknown')
  if (!valid.length) {
    message.error('仅支持抖音和快手的链接')
    return
  }
  if (valid.length < links.length) {
    message.warning(`${links.length - valid.length} 个链接不支持，已跳过`)
  }

  downloadStore.addTasks(valid)
  inputText.value = ''
  message.success(`已添加 ${valid.length} 个任务`)

  isProcessing.value = true
  const newTaskIds = valid.map((_, i) => {
    return downloadStore.tasks[downloadStore.tasks.length - valid.length + i]?.id
  }).filter(Boolean)
  try {
    await manager.addTasks(newTaskIds.map((id) => ({ id })))
  } finally {
    isProcessing.value = false
  }
}

function handleConcurrencyChange(n) {
  manager?.setConcurrency(n)
  if (isElectron) api.setSettings({ concurrency: n })
}

async function handleSelectDir() {
  if (!isElectron) {
    message.warning('请在桌面应用中使用')
    return
  }
  try {
    const dir = await api.selectDownloadDir()
    if (dir) {
      currentDownloadDir.value = dir
      message.success(`下载目录已切换：${dir}`)
    }
  } catch (e) {
    message.error('选择目录失败')
  }
}

async function handleOpenPath(filePath) {
  if (!isElectron) return
  try {
    const ok = await api.openPath(filePath)
    if (!ok) message.warning('文件可能已被移动或删除')
  } catch (e) {
    message.error('打开失败')
  }
}

function handleRemoveTask(id) {
  downloadStore.removeTask(id)
}

async function handleRefreshHistory() {
  if (!isElectron) return
  try {
    history.value = await api.getHistory()
    message.success('已刷新')
  } catch (e) {
    message.error('刷新失败')
  }
}

async function handleFilterHistory() {
  if (!dateRange.value || dateRange.value.length !== 2) {
    message.warning('请先选择时间范围')
    return
  }
  if (!isElectron) return
  try {
    const [s, e] = dateRange.value
    history.value = await api.filterHistoryByDate(s, e + 86400000)
    message.success('筛选完成')
  } catch (e) {
    message.error('筛选失败')
  }
}

async function handleDeleteHistory(id) {
  if (!isElectron) return
  try {
    history.value = await api.deleteHistory(id)
    message.success('已删除')
  } catch (e) {
    message.error('删除失败')
  }
}

async function handleClearHistory() {
  if (!isElectron) return
  try {
    history.value = await api.clearHistory()
    message.success('历史记录已清空')
  } catch (e) {
    message.error('清空失败')
  }
}

function platformLabel(p) {
  if (p === 'douyin') return '抖音'
  if (p === 'kuaishou') return '快手'
  return '未知'
}

function platformTagType(p) {
  if (p === 'douyin') return 'error'
  if (p === 'kuaishou') return 'info'
  return 'default'
}

function taskStatusLabel(s) {
  const map = {
    pending: '等待中',
    parsing: '解析中',
    downloading: '下载中',
    done: '已完成',
    error: '失败'
  }
  return map[s] || s
}

function taskStatusType(s) {
  const map = {
    pending: 'default',
    parsing: 'warning',
    downloading: 'primary',
    done: 'success',
    error: 'error'
  }
  return map[s] || 'default'
}

function formatSpeed(bytes) {
  if (bytes < 1024) return `${bytes} B/s`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB/s`
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>
