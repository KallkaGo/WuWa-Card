const fs = require('fs')
const path = require('path')
const md5 = require('md5')
const http = require('./http')

const KURO_API_BASE = 'https://api.kurobbs.com'
const KURO_BBS_VERSION = '2.2.1'
const KURO_BBS_VERSION_CODE = '2210'
const CREDENTIALS_PATH = path.resolve(__dirname, '../kuro_credentials.txt')

function generateDevCode(seed = '114514') {
  const normalizedSeed = String(seed || '').trim() || '114514'
  return md5(`kuro-devcode-${normalizedSeed}`).substring(0, 32)
}

function generateUUID(seed = '114514') {
  const hash = md5(`kuro-uuid-${seed}`)
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`
}

function buildHeaders(userId, token) {
  const normalizedUserId = String(userId || '114514').trim()
  const normalizedToken = String(token || '').trim()

  const headers = {
    devCode: generateDevCode(normalizedUserId),
    ip: `192.168.1.1${normalizedUserId.slice(-2) || '00'}`,
    source: 'android',
    version: KURO_BBS_VERSION,
    versionCode: KURO_BBS_VERSION_CODE,
    osVersion: 'Android',
    countryCode: 'CN',
    model: '23127PN0CC',
    lang: 'zh-Hans',
    channelId: '2',
    'Content-Type': 'application/x-www-form-urlencoded',
    'accept-encoding': 'gzip',
    'User-Agent': 'okhttp/3.11.0',
    distinct_id: generateUUID(normalizedUserId),
  }

  if (normalizedToken) {
    headers.token = normalizedToken
    headers.Cookie = `user_token=${normalizedToken}`
  }

  return headers
}

function buildH5Headers(userId, token) {
  const normalizedUserId = String(userId || '114514').trim()
  const normalizedToken = String(token || '').trim()

  const headers = {
    source: 'h5',
    origin: 'https://www.kurobbs.com',
    referer: 'https://www.kurobbs.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    devCode: generateDevCode(normalizedUserId),
    distinct_id: generateUUID(normalizedUserId),
  }

  if (normalizedToken) {
    headers.token = normalizedToken
    headers.Cookie = `user_token=${normalizedToken}`
  }

  return headers
}

function buildWidgetHeaders(userId, token) {
  const normalizedUserId = String(userId || '114514').trim()
  const normalizedToken = String(token || '').trim()
  const suffix1 = normalizedUserId.slice(-1) || '0'
  const suffix2 = normalizedUserId.slice(-2) || '00'
  const suffix4 = normalizedUserId.slice(-4) || '0000'

  return {
    pragma: 'no-cache',
    'cache-control': 'no-cache',
    'sec-ch-ua': `"Not)A;Brand";v="99", "Android WebView";v="12${suffix1}", "Chromium";v="12${suffix1}"`,
    source: 'android',
    'sec-ch-ua-mobile': '?1',
    'user-agent': `Mozilla/5.0 (Linux; Android 14; 23127PN0CC Build/UKQ1.230804.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/12${suffix1}.0.${suffix4}.${suffix2} Mobile Safari/537.36 Kuro/${KURO_BBS_VERSION} KuroGameBox/${KURO_BBS_VERSION}`,
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json, text/plain, */*',
    devcode: generateDevCode(normalizedUserId),
    token: normalizedToken,
    'sec-ch-ua-platform': '"Android"',
    origin: 'https://web-static.kurobbs.com',
    'sec-fetch-site': 'same-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    priority: 'u=1, i',
  }
}

function getStoredCredentials() {
  let userId = String(process.env.KURO_USER_ID || '').trim()
  let token = String(process.env.KURO_TOKEN || '').trim()

  if ((!userId || !token) && fs.existsSync(CREDENTIALS_PATH)) {
    try {
      const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
      const uidMatch = content.match(/userId=([^\r\n]+)/)
      const tokenMatch = content.match(/token=([^\r\n]+)/)

      if (uidMatch && uidMatch[1]) userId = uidMatch[1].trim()
      if (tokenMatch && tokenMatch[1]) token = tokenMatch[1].trim()
    } catch (e) {
      console.error('读取凭据文件失败:', e)
    }
  }

  return { userId, token }
}

function saveCredentials({ userId, token }) {
  const normalizedUserId = String(userId || '').trim()
  const normalizedToken = String(token || '').trim()

  process.env.KURO_USER_ID = normalizedUserId
  process.env.KURO_TOKEN = normalizedToken

  const fileContent = `userId=${normalizedUserId}\ntoken=${normalizedToken}\n`
  fs.writeFileSync(CREDENTIALS_PATH, fileContent, 'utf8')

  return { userId: normalizedUserId, token: normalizedToken }
}

function normalizeCredentials({ userId, token } = {}) {
  let u = String(userId || '').trim()
  let t = String(token || '').trim()

  if (!u || !t) {
    const stored = getStoredCredentials()
    if (!u) u = stored.userId
    if (!t) t = stored.token
  }

  if (!u) throw new Error('缺少 userId')
  if (!t) throw new Error('缺少 token')

  return { userId: u, token: t }
}

async function checkKuroToken({ userId, token } = {}) {
  const credentials = normalizeCredentials({ userId, token })
  const body = `otherUserId=${encodeURIComponent(credentials.userId)}`

  // 优先使用 H5 请求头（兼容网页版与 App Token），失败时回退到 App 请求头
  let response = await http({
    method: 'POST',
    url: `${KURO_API_BASE}/user/mineV2`,
    headers: buildH5Headers(credentials.userId, credentials.token),
    data: body,
  })

  let result = response?.data || {}
  if (result.code !== 200) {
    response = await http({
      method: 'POST',
      url: `${KURO_API_BASE}/user/mineV2`,
      headers: buildHeaders(credentials.userId, credentials.token),
      data: body,
    })
    result = response?.data || {}
  }

  const userData = result.data?.mine || result.data || {}
  return {
    ok: result.code === 200,
    code: result.code,
    msg: result.msg || result.message || '',
    user: result.data
      ? {
          userId: userData.userId,
          userName: userData.userName,
          headUrl: userData.headUrl,
        }
      : null,
  }
}

async function sendKuroSmsCode({ mobile }) {
  const normalizedMobile = String(mobile || '').trim()
  if (!normalizedMobile) throw new Error('手机号不能为空')

  const body = `mobile=${encodeURIComponent(normalizedMobile)}`
  const response = await http({
    method: 'POST',
    url: `${KURO_API_BASE}/user/getSmsCode`,
    headers: buildHeaders('114514', ''),
    data: body,
  })

  const result = response?.data || {}
  return {
    ok: result.code === 200,
    code: result.code,
    msg: result.msg || result.message || '',
    data: result.data,
  }
}

async function loginWithKuroSms({ mobile, code }) {
  const normalizedMobile = String(mobile || '').trim()
  const normalizedCode = String(code || '').trim()

  if (!normalizedMobile) throw new Error('手机号不能为空')
  if (!normalizedCode) throw new Error('验证码不能为空')

  const devCode = generateDevCode(normalizedMobile)
  const body = [
    `code=${encodeURIComponent(normalizedCode)}`,
    `devCode=${encodeURIComponent(devCode)}`,
    `gameList=`,
    `mobile=${encodeURIComponent(normalizedMobile)}`,
  ].join('&')

  const response = await http({
    method: 'POST',
    url: `${KURO_API_BASE}/user/sdkLogin`,
    headers: buildHeaders('114514', ''),
    data: body,
  })

  const result = response?.data || {}
  if (result.code === 200 && result.data && result.data.token) {
    saveCredentials({
      userId: result.data.userId,
      token: result.data.token,
    })
  }

  return {
    ok: result.code === 200,
    code: result.code,
    msg: result.msg || result.message || '',
    data: result.data || null,
  }
}

async function fetchKuroRoleList({ userId, token, gameId = 3 } = {}) {
  const credentials = normalizeCredentials({ userId, token })
  const normalizedGameId = Number(gameId)
  const body = `gameId=${encodeURIComponent(String(normalizedGameId))}`

  // 优先尝试 H5 请求头
  let response = await http({
    method: 'POST',
    url: `${KURO_API_BASE}/gamer/role/list`,
    headers: {
      ...buildH5Headers(credentials.userId, credentials.token),
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    data: body,
  })

  let result = response?.data || {}
  if (result.code !== 200) {
    response = await http({
      method: 'POST',
      url: `${KURO_API_BASE}/gamer/role/list`,
      headers: {
        ...buildHeaders(credentials.userId, credentials.token),
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      data: body,
    })
    result = response?.data || {}
  }

  return {
    ok: result.code === 200,
    code: result.code,
    msg: result.msg || result.message || '',
    roles: Array.isArray(result.data) ? result.data : [],
    raw: result,
  }
}

async function fetchKuroRoleDetail({ userId, token, roleId, serverId }) {
  const credentials = normalizeCredentials({ userId, token })
  const normalizedRoleId = String(roleId || '').trim()
  const normalizedServerId = String(serverId || '').trim()

  if (!normalizedRoleId) throw new Error('缺少 roleId')
  if (!normalizedServerId) throw new Error('缺少 serverId')

  const body = [
    `gameId=${encodeURIComponent('3')}`,
    `roleId=${encodeURIComponent(normalizedRoleId)}`,
    `serverId=${encodeURIComponent(normalizedServerId)}`,
    `type=${encodeURIComponent('2')}`,
    `sizeType=${encodeURIComponent('1')}`,
  ].join('&')

  // 优先使用带 web-static.kurobbs.com 的 headers
  let response = await http({
    method: 'POST',
    url: `${KURO_API_BASE}/gamer/widget/game3/getData`,
    headers: {
      ...buildH5Headers(credentials.userId, credentials.token),
      origin: 'https://web-static.kurobbs.com',
    },
    data: body,
  })

  let result = response?.data || {}
  if (result.code !== 200) {
    response = await http({
      method: 'POST',
      url: `${KURO_API_BASE}/gamer/widget/game3/getData`,
      headers: buildWidgetHeaders(credentials.userId, credentials.token),
      data: body,
    })
    result = response?.data || {}
  }

  return {
    ok: result.code === 200,
    code: result.code,
    msg: result.msg || result.message || '',
    detail: result.data || null,
    raw: result,
  }
}

async function fetchKuroAkiBaseData({ userId, token, roleId, serverId }) {
  const credentials = normalizeCredentials({ userId, token })
  const normalizedRoleId = String(roleId || '').trim()
  const normalizedServerId = String(serverId || '').trim()

  if (!normalizedRoleId) throw new Error('缺少 roleId')
  if (!normalizedServerId) throw new Error('缺少 serverId')

  const body = [
    `gameId=${encodeURIComponent('3')}`,
    `roleId=${encodeURIComponent(normalizedRoleId)}`,
    `serverId=${encodeURIComponent(normalizedServerId)}`,
  ].join('&')

  const response = await http({
    method: 'POST',
    url: `${KURO_API_BASE}/aki/roleBox/akiBox/baseData`,
    headers: buildH5Headers(credentials.userId, credentials.token),
    data: body,
  })

  const result = response?.data || {}
  let parsedData = result.data || null
  if (typeof parsedData === 'string') {
    try {
      parsedData = JSON.parse(parsedData)
    } catch (e) {
      // ignore
    }
  }

  return {
    ok: result.code === 200,
    code: result.code,
    msg: result.msg || result.message || '',
    data: parsedData,
    raw: result,
  }
}

module.exports = {
  getStoredCredentials,
  saveCredentials,
  checkKuroToken,
  sendKuroSmsCode,
  loginWithKuroSms,
  fetchKuroRoleList,
  fetchKuroRoleDetail,
  fetchKuroAkiBaseData,
}
