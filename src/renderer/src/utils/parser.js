import axios from 'axios'

const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const UA_PC =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function extractUrls(text) {
  const regex = /https?:\/\/[^\s，,。；;）)\]]+/g
  const matches = text.match(regex)
  return matches ? [...new Set(matches)] : []
}

function detectPlatform(url) {
  if (url.includes('douyin.com') || url.includes('iesdouyin.com') || url.includes('douyin')) {
    return 'douyin'
  }
  if (url.includes('kuaishou.com') || url.includes('gifshow.com') || url.includes('kuaishou')) {
    return 'kuaishou'
  }
  return 'unknown'
}

async function getRedirectUrl(url, ua = UA_MOBILE) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': ua },
      maxRedirects: 5,
      responseType: 'text',
      timeout: 15000
    })
    return res.request?.responseURL || res.config?.url || url
  } catch (e) {
    if (e.response?.status === 302) {
      return e.response.headers?.location || url
    }
    if (e.request?.responseURL) {
      return e.request.responseURL
    }
    throw e
  }
}

async function parseDouyin(url) {
  try {
    const realUrl = await getRedirectUrl(url)

    let videoId = ''
    const m = realUrl.match(/video\/(\d+)/)
    if (m) {
      videoId = m[1]
    } else {
      const m2 = realUrl.match(/v\/([^/?]+)/)
      if (m2) videoId = m2[1]
    }

    const html = await axios
      .get(realUrl, {
        headers: {
          'User-Agent': UA_MOBILE,
          Referer: 'https://www.douyin.com/'
        },
        timeout: 15000
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

    let playAddr = ''

    const re1 = html.match(/playAddr['"]?\s*:\s*['"]([^'"]+)['"]/)
    if (re1) playAddr = re1[1]

    const re2 = html.match(/play_addr['"]?\s*:\s*\{\s*['"]url_list['"]?\s*:\s*\[['"]([^'"]+)['"]/)
    if (!playAddr && re2) playAddr = re2[1]

    const re3 = html.match(/src['"]?\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/)
    if (!playAddr && re3) playAddr = re3[1]

    const re4 = html.match(/<video[^>]+src=['"]([^'"]+)['"]/)
    if (!playAddr && re4) playAddr = re4[1]

    if (!playAddr && videoId) {
      try {
        const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`
        const apiRes = await axios.get(apiUrl, {
          headers: {
            'User-Agent': UA_PC,
            Referer: 'https://www.iesdouyin.com/'
          },
          timeout: 15000
        })
        const data = apiRes.data
        if (data?.item_list?.[0]) {
          const item = data.item_list[0]
          if (!title && item.desc) title = item.desc
          const play =
            item.video?.play_addr?.url_list?.[0] ||
            item.video?.play_addr_h264?.url_list?.[0] ||
            item.video?.bit_rate?.[0]?.play_addr?.url_list?.[0]
          if (play) playAddr = play
        }
      } catch (_) {}
    }

    if (playAddr) {
      playAddr = playAddr
        .replace(/&amp;/g, '&')
        .replace(/\/play\//, '/playwm/')
        .replace('/playwm/', '/play/')
      if (playAddr.includes('douyin') && !playAddr.includes('?ratio=')) {
        playAddr = playAddr.split('?')[0]
      }
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

async function parseKuaishou(url) {
  try {
    const realUrl = await getRedirectUrl(url)

    const html = await axios
      .get(realUrl, {
        headers: {
          'User-Agent': UA_MOBILE,
          Referer: 'https://www.kuaishou.com/',
          Cookie: 'did=web_' + Math.random().toString(36).slice(2, 18)
        },
        timeout: 15000
      })
      .then((r) => r.data)
      .catch(() => '')

    let title = ''
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
    if (titleMatch) {
      title = titleMatch[1].replace(/-快手短视频.*$/, '').trim()
    }

    let playAddr = ''

    const re1 = html.match(/playUrl['"]?\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i)
    if (re1) playAddr = re1[1]

    const re2 = html.match(/play_url['"]?\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i)
    if (!playAddr && re2) playAddr = re2[1]

    const re3 = html.match(/videoUrl['"]?\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i)
    if (!playAddr && re3) playAddr = re3[1]

    const re4 = html.match(/<video[^>]+src=['"]([^'"]+)['"]/i)
    if (!playAddr && re4) playAddr = re4[1]

    const re5 = html.match(/"mainMvUrls"[^}]*"url"\s*:\s*"([^"]+\.mp4[^"]*)"/i)
    if (!playAddr && re5) playAddr = re5[1]

    if (!playAddr) {
      const mp4Match = html.match(/https?:\/\/[^'"\s]+\.mp4[^'"\s]*/)
      if (mp4Match) playAddr = mp4Match[0]
    }

    if (playAddr) {
      playAddr = playAddr.replace(/&amp;/g, '&').replace(/\\u002F/g, '/')
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
