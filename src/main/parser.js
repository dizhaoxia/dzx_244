import axios from 'axios'

const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const UA_PC =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export function extractUrls(text) {
  const regex = /https?:\/\/[^\s，,。；;）)\]]+/g
  const matches = text.match(regex)
  return matches ? [...new Set(matches)] : []
}

export function detectPlatform(url) {
  if (url.includes('douyin.com') || url.includes('iesdouyin.com') || url.includes('douyin')) {
    return 'douyin'
  }
  if (url.includes('kuaishou.com') || url.includes('gifshow.com') || url.includes('kuaishou')) {
    return 'kuaishou'
  }
  return 'unknown'
}

async function manualRedirect(url, ua = UA_MOBILE, depth = 0) {
  if (depth > 5) return url
  try {
    const r = await axios.get(url, {
      headers: {
        'User-Agent': ua,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 15000
    })
    if (r.status >= 300 && r.status < 400 && r.headers?.location) {
      let loc = r.headers.location
      if (loc.startsWith('/')) {
        try {
          const u = new URL(url)
          loc = u.origin + loc
        } catch (_) {}
      }
      return manualRedirect(loc, ua, depth + 1)
    }
    return r.request?.responseURL || url
  } catch (e) {
    if (e.response?.headers?.location) {
      return manualRedirect(e.response.headers.location, ua, depth + 1)
    }
    throw e
  }
}

function extractBalancedJSON(str, startIdx) {
  if (str[startIdx] !== '{') return null
  let depth = 0
  let i = startIdx
  let inString = false
  let stringChar = ''
  let escape = false
  for (; i < str.length; i++) {
    const ch = str[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (inString) {
      if (ch === stringChar) inString = false
      continue
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return str.slice(startIdx, i + 1)
    }
  }
  return null
}

function extractNamedJSON(html, varName) {
  const pattern = new RegExp(`window\\.${varName}\\s*=\\s*`)
  const m = pattern.exec(html)
  if (!m) return null
  const idx = m.index + m[0].length
  const jsonStr = extractBalancedJSON(html, idx)
  if (!jsonStr) return null
  try { return JSON.parse(jsonStr) } catch (_) {
    try { return JSON.parse(decodeURIComponent(jsonStr)) } catch (__) { return null }
  }
}

function decodeHtmlEntities(str) {
  if (!str) return str
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractRouterData(html) {
  return extractNamedJSON(html, '_ROUTER_DATA')
}

function pickPlayAddr(item) {
  if (!item?.video) return ''
  const v = item.video
  let url = ''
  if (v.bit_rate && Array.isArray(v.bit_rate) && v.bit_rate.length) {
    const sorted = [...v.bit_rate].sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))
    for (const b of sorted) {
      const urls = b.play_addr?.url_list
      if (urls && urls.length) {
        url = urls[0]
        break
      }
    }
  }
  if (!url && v.play_addr?.url_list?.length) {
    url = v.play_addr.url_list[0]
  }
  return url ? decodeHtmlEntities(url) : ''
}

function removeWatermarkFromDouyinUrl(u) {
  if (!u) return u
  try {
    const url = new URL(u)
    if (url.hostname.includes('douyin') || url.hostname.includes('iesdouyin') || url.hostname.includes('snssdk')) {
      const pathname = url.pathname
      if (pathname.includes('/playwm/')) {
        url.pathname = pathname.replace('/playwm/', '/play/')
      }
    }
    return url.toString()
  } catch (_) {
    return u.replace('/playwm/', '/play/')
  }
}

export async function parseDouyin(rawUrl) {
  try {
    const realUrl = await manualRedirect(rawUrl, UA_MOBILE)

    const html = await axios
      .get(realUrl, {
        headers: {
          'User-Agent': UA_MOBILE,
          Referer: 'https://www.iesdouyin.com/',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        timeout: 20000
      })
      .then((r) => r.data)
      .catch(() => '')

    let title = ''
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
    if (titleMatch) {
      title = titleMatch[1]
        .replace(/_抖音|_抖音极速版|抖音短视频/g, '')
        .replace(/^- | - $/g, '')
        .trim()
    }

    let videoId = ''
    const idM = realUrl.match(/\/video\/(\d+)/) || realUrl.match(/\/v\/([^/?]+)/)
    if (idM) videoId = idM[1]

    let playAddr = ''

    const routerData = extractRouterData(html)
    if (routerData) {
      const loader = routerData.loaderData || {}
      const pageKey = Object.keys(loader).find((k) => k.includes('video_') && k.includes('page'))
      if (pageKey) {
        const pageData = loader[pageKey] || {}
        const videoInfoRes = pageData.videoInfoRes
        if (videoInfoRes?.item_list?.[0]) {
          const item = videoInfoRes.item_list[0]
          if (item.desc) title = item.desc
          playAddr = pickPlayAddr(item) || ''
        }
      }
    }

    if (!playAddr) {
      const re1 = html.match(/playAddr['"]?\s*:\s*['"]([^'"]+)['"]/)
      if (re1) playAddr = re1[1]

      const re2 = html.match(/play_addr['"]?\s*:\s*\{\s*['"]url_list['"]?\s*:\s*\[['"]([^'"]+)['"]/)
      if (!playAddr && re2) playAddr = re2[1]

      const re3 = html.match(/src['"]?\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i)
      if (!playAddr && re3) playAddr = re3[1]

      const re4 = html.match(/<video[^>]+src=['"]([^'"]+)['"]/i)
      if (!playAddr && re4) playAddr = re4[1]
    }

    if (!playAddr && videoId) {
      try {
        const html2 = await axios
          .get(`https://www.douyin.com/video/${videoId}`, {
            headers: {
              'User-Agent': UA_PC,
              Referer: 'https://www.douyin.com/'
            },
            timeout: 20000
          })
          .then((r) => r.data)
          .catch(() => '')

        const rd = extractRouterData(html2) || extractNamedJSON(html2, '__INITIAL_STATE__')
        if (rd) {
          const searchJSON = (obj, depth = 0) => {
            if (depth > 8 || !obj || typeof obj !== 'object') return null
            if (Array.isArray(obj)) {
              if (obj[0]?.aweme_id || obj[0]?.video) return searchJSON(obj[0], depth + 1)
              for (const it of obj) { const r = searchJSON(it, depth + 1); if (r) return r }
              return null
            }
            if (obj.video?.play_addr) return obj
            for (const k of Object.keys(obj)) {
              const r = searchJSON(obj[k], depth + 1)
              if (r) return r
            }
            return null
          }
          const item = searchJSON(rd)
          if (item) {
            if (item.desc) title = item.desc
            playAddr = pickPlayAddr(item) || ''
          }
        }
      } catch (_) {}
    }

    if (playAddr) {
      playAddr = removeWatermarkFromDouyinUrl(decodeHtmlEntities(playAddr))
    }

    if (!title) title = `抖音视频_${videoId || Date.now()}`

    return {
      success: !!playAddr,
      videoUrl: playAddr,
      title: title || '抖音视频',
      referer: 'https://www.douyin.com/',
      error: playAddr ? '' : '未找到视频地址，可能已失效或为私密作品'
    }
  } catch (e) {
    return {
      success: false,
      videoUrl: '',
      title: '',
      referer: '',
      error: `解析失败：${e.message || '网络错误'}`
    }
  }
}

export async function parseKuaishou(rawUrl) {
  try {
    const realUrl = await manualRedirect(rawUrl, UA_MOBILE)

    const html = await axios
      .get(realUrl, {
        headers: {
          'User-Agent': UA_MOBILE,
          Referer: 'https://www.kuaishou.com/',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Cookie: 'did=web_' + Math.random().toString(36).slice(2, 18)
        },
        timeout: 20000
      })
      .then((r) => r.data)
      .catch(() => '')

    let title = ''
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
    if (titleMatch) {
      title = titleMatch[1].replace(/-快手短视频.*$/, '').trim()
    }

    let playAddr = ''

    const routerData = extractRouterData(html) || extractNamedJSON(html, '__INITIAL_STATE__')
    if (routerData) {
      const searchJSON = (obj, depth = 0) => {
        if (depth > 8 || !obj || typeof obj !== 'object') return null
        if (Array.isArray(obj)) {
          for (const it of obj) { const r = searchJSON(it, depth + 1); if (r) return r }
          return null
        }
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string' && v.includes('.mp4') && v.includes('http')) return v
          if (v && typeof v === 'object') {
            const r = searchJSON(v, depth + 1)
            if (r) return r
          }
        }
        return null
      }
      const found = searchJSON(routerData)
      if (found) playAddr = decodeHtmlEntities(found)
    }

    const patterns = [
      /playUrl['"]?\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i,
      /play_url['"]?\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i,
      /videoUrl['"]?\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i,
      /<video[^>]+src=['"]([^'"]+)['"]/i,
      /"mainMvUrls"[^}]*"url"\s*:\s*"([^"]+\.mp4[^"]*)"/i,
      /https?:\/\/[^'"\s]+\.mp4[^'"\s]*/
    ]
    for (const p of patterns) {
      if (playAddr) break
      const m = html.match(p)
      if (m) {
        playAddr = decodeHtmlEntities(m[1] || m[0])
      }
    }

    if (!title) title = '快手视频'

    return {
      success: !!playAddr,
      videoUrl: playAddr,
      title: title || '快手视频',
      referer: 'https://www.kuaishou.com/',
      error: playAddr ? '' : '未找到视频地址，可能链接已失效或为私密作品'
    }
  } catch (e) {
    return {
      success: false,
      videoUrl: '',
      title: '',
      referer: '',
      error: `解析失败：${e.message || '网络错误'}`
    }
  }
}

export async function parseLink(rawUrl) {
  const platform = detectPlatform(rawUrl)
  if (platform === 'unknown') {
    return {
      success: false,
      videoUrl: '',
      title: '',
      referer: '',
      platform,
      error: '不支持的平台，仅支持抖音和快手链接'
    }
  }

  const result =
    platform === 'douyin' ? await parseDouyin(rawUrl) : await parseKuaishou(rawUrl)

  return { ...result, platform }
}

export function parseInputLinks(text) {
  const urls = extractUrls(text)
  return urls.map((url) => ({
    link: url,
    platform: detectPlatform(url)
  }))
}
