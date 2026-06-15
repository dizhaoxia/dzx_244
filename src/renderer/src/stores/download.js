import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useDownloadStore = defineStore('download', () => {
  const tasks = ref([])

  const activeCount = computed(
    () => tasks.value.filter((t) => t.status === 'downloading' || t.status === 'parsing').length
  )
  const completedCount = computed(() => tasks.value.filter((t) => t.status === 'done').length)
  const failedCount = computed(() => tasks.value.filter((t) => t.status === 'error').length)

  function addTasks(list) {
    const now = Date.now()
    list.forEach((item, idx) => {
      tasks.value.push({
        id: `task_${now}_${idx}`,
        link: item.link,
        platform: item.platform,
        status: 'pending',
        title: '',
        progress: 0,
        speed: 0,
        filePath: '',
        errorMsg: '',
        videoUrl: '',
        referer: '',
        createdAt: now + idx
      })
    })
  }

  function updateTask(id, patch) {
    const t = tasks.value.find((x) => x.id === id)
    if (t) {
      Object.assign(t, patch)
    }
  }

  function setProgress(taskId, progress, speed) {
    const t = tasks.value.find((x) => x.id === taskId)
    if (t) {
      t.progress = progress
      t.speed = speed
    }
  }

  function removeTask(id) {
    tasks.value = tasks.value.filter((t) => t.id !== id)
  }

  function clearCompleted() {
    tasks.value = tasks.value.filter((t) => t.status !== 'done' && t.status !== 'error')
  }

  return {
    tasks,
    activeCount,
    completedCount,
    failedCount,
    addTasks,
    updateTask,
    setProgress,
    removeTask,
    clearCompleted
  }
})
