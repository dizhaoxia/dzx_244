class PLimit {
  constructor(concurrency) {
    this.concurrency = concurrency
    this.queue = []
    this.active = 0
  }

  async run(fn) {
    return new Promise((resolve, reject) => {
      const task = { fn, resolve, reject }
      this.queue.push(task)
      this.next()
    })
  }

  async next() {
    if (this.active >= this.concurrency) return
    if (this.queue.length === 0) return
    const task = this.queue.shift()
    this.active++
    try {
      const res = await task.fn()
      task.resolve(res)
    } catch (e) {
      task.reject(e)
    } finally {
      this.active--
      this.next()
    }
  }
}

export class DownloadManager {
  constructor(store, api) {
    this.store = store
    this.api = api
    this.concurrency = 3
    this.limiter = new PLimit(this.concurrency)
  }

  setConcurrency(n) {
    this.concurrency = n
    this.limiter = new PLimit(n)
  }

  async addTasks(taskList) {
    const pending = []
    taskList.forEach((t) => {
      pending.push(
        this.limiter.run(() => this.processTask(t.id))
      )
    })
    return Promise.allSettled(pending)
  }

  async processTask(taskId) {
    const task = this.store.tasks.find((t) => t.id === taskId)
    if (!task) return

    this.store.updateTask(taskId, { status: 'parsing', progress: 0 })

    let parsed
    try {
      parsed = this.api && typeof this.api.parseLink === 'function'
        ? await this.api.parseLink(task.link)
        : { success: false, error: '解析接口不可用' }
    } catch (e) {
      parsed = { success: false, error: `解析异常：${e.message || '未知错误'}` }
    }

    if (!parsed.success) {
      this.store.updateTask(taskId, {
        status: 'error',
        errorMsg: parsed.error,
        title: parsed.title || task.link
      })
      return
    }

    this.store.updateTask(taskId, {
      status: 'downloading',
      title: parsed.title || task.link,
      videoUrl: parsed.videoUrl,
      referer: parsed.referer,
      progress: 0
    })

    const result = await this.api.startDownload({
      taskId,
      url: parsed.videoUrl,
      title: parsed.title || task.link,
      referer: parsed.referer
    })

    if (result.success) {
      this.store.updateTask(taskId, {
        status: 'done',
        filePath: result.filePath,
        progress: 100
      })
      try {
        await this.api.addHistory({
          link: task.link,
          title: parsed.title || task.link,
          platform: parsed.platform || task.platform,
          filePath: result.filePath,
          videoUrl: parsed.videoUrl
        })
      } catch (_) {}
    } else {
      this.store.updateTask(taskId, {
        status: 'error',
        errorMsg: result.error || '下载失败'
      })
    }
  }
}
