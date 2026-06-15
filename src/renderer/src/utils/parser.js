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

export function parseInputLinks(text) {
  const urls = extractUrls(text)
  return urls.map((url) => ({
    link: url,
    platform: detectPlatform(url)
  }))
}
