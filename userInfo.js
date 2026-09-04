const fs = require('fs')
const path = require('path')
const pino = require('pino')
const NodeCache = require('node-cache')
const axios = require('axios')
const {
  getStoredCredentials,
  fetchKuroRoleList,
  fetchKuroRoleDetail,
  fetchKuroAkiBaseData,
} = require('./utils/kuroAuth')

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const roleListCache = new NodeCache({ stdTTL: 60 * 5 }) // 5分钟
const cardCache = new NodeCache({ stdTTL: 60 * 3 })     // 3分钟
const avatarCache = new NodeCache({ stdTTL: 60 * 60 * 24 }) // 24小时

const zlib = require('zlib')

function cropAvatarPng(pngBuffer) {
  try {
    let pos = 8
    let width = 0
    let height = 0
    const idatChunks = []
    while (pos < pngBuffer.length) {
      const len = pngBuffer.readUInt32BE(pos)
      const type = pngBuffer.toString('ascii', pos + 4, pos + 8)
      if (type === 'IHDR') {
        width = pngBuffer.readUInt32BE(pos + 8)
        height = pngBuffer.readUInt32BE(pos + 12)
      } else if (type === 'IDAT') {
        idatChunks.push(pngBuffer.subarray(pos + 8, pos + 8 + len))
      }
      pos += 12 + len
    }
    if (!width || !height || idatChunks.length === 0) return pngBuffer

    const decompressed = zlib.inflateSync(Buffer.concat(idatChunks))
    const bpp = 4
    const stride = 1 + width * bpp
    const raw = Buffer.alloc(width * height * 4)

    for (let y = 0; y < height; y++) {
      const filter = decompressed[y * stride]
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 4; c++) {
          const rawIdx = (y * width + x) * 4 + c
          const compIdx = y * stride + 1 + x * 4 + c
          let val = decompressed[compIdx]
          const a = x > 0 ? raw[(y * width + (x - 1)) * 4 + c] : 0
          const b = y > 0 ? raw[((y - 1) * width + x) * 4 + c] : 0
          const cVal = (x > 0 && y > 0) ? raw[((y - 1) * width + (x - 1)) * 4 + c] : 0
          if (filter === 1) val = (val + a) & 0xff
          else if (filter === 2) val = (val + b) & 0xff
          else if (filter === 3) val = (val + Math.floor((a + b) / 2)) & 0xff
          else if (filter === 4) {
            const p = a + b - cVal
            const pa = Math.abs(p - a)
            const pb = Math.abs(p - b)
            const pc = Math.abs(p - cVal)
            const pr = (pa <= pb && pa <= pc) ? a : ((pb <= pc) ? b : cVal)
            val = (val + pr) & 0xff
          }
          raw[rawIdx] = val
        }
      }
    }

    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = raw[(y * width + x) * 4 + 3]
        if (alpha > 40) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    if (maxX <= minX || maxY <= minY) return pngBuffer

    // 若已经填满画面则无需裁剪
    if (minX <= 2 && maxX >= width - 3 && minY <= 2 && maxY >= height - 3) {
      return pngBuffer
    }

    let cx
    let cy
    let cropSize
    if (width === 256 && height === 256) {
      cx = 128
      cy = Math.round((minY + maxY) / 2)
      cropSize = Math.min(256, maxY - minY + 1)
    } else {
      cx = Math.round((minX + maxX) / 2)
      cy = Math.round((minY + maxY) / 2)
      cropSize = Math.min(Math.min(width, height), Math.max(maxX - minX + 1, maxY - minY + 1))
    }

    if (cropSize % 2 !== 0) cropSize += 1
    const half = cropSize / 2
    const cropX0 = Math.max(0, Math.min(width - cropSize, cx - half))
    const cropY0 = Math.max(0, Math.min(height - cropSize, cy - half))

    const croppedRaw = Buffer.alloc(cropSize * (1 + cropSize * 4))
    for (let y = 0; y < cropSize; y++) {
      const srcY = cropY0 + y
      croppedRaw[y * (1 + cropSize * 4)] = 0
      for (let x = 0; x < cropSize; x++) {
        const srcX = cropX0 + x
        const srcIdx = (srcY * width + srcX) * 4
        const dstIdx = y * (1 + cropSize * 4) + 1 + x * 4
        croppedRaw[dstIdx] = raw[srcIdx]
        croppedRaw[dstIdx + 1] = raw[srcIdx + 1]
        croppedRaw[dstIdx + 2] = raw[srcIdx + 2]
        croppedRaw[dstIdx + 3] = raw[srcIdx + 3]
      }
    }

    const deflated = zlib.deflateSync(croppedRaw)

    const crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      crcTable[n] = c
    }
    function crc32(b, offset, l) {
      let crc = -1
      for (let i = 0; i < l; i++) crc = crcTable[(crc ^ b[offset + i]) & 0xff] ^ (crc >>> 8)
      return (crc ^ -1) >>> 0
    }
    function makeChunk(t, d) {
      const chunk = Buffer.alloc(12 + d.length)
      chunk.writeUInt32BE(d.length, 0)
      chunk.write(t, 4, 4, 'ascii')
      d.copy(chunk, 8)
      const crcVal = crc32(chunk, 4, 4 + d.length)
      chunk.writeUInt32BE(crcVal, 8 + d.length)
      return chunk
    }

    const ihdrData = Buffer.alloc(13)
    ihdrData.writeUInt32BE(cropSize, 0)
    ihdrData.writeUInt32BE(cropSize, 4)
    ihdrData[8] = 8
    ihdrData[9] = 6
    ihdrData[10] = 0
    ihdrData[11] = 0
    ihdrData[12] = 0

    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    return Buffer.concat([
      header,
      makeChunk('IHDR', ihdrData),
      makeChunk('IDAT', deflated),
      makeChunk('IEND', Buffer.alloc(0)),
    ])
  } catch (err) {
    logger.debug('头像裁剪异常，使用原图: %s', err.message)
    return pngBuffer
  }
}

let defaultAvatarDataUri = ''
function getDefaultAvatar() {
  if (defaultAvatarDataUri) return defaultAvatarDataUri
  const defaultPath = path.resolve(__dirname, 'assets/default_avatar.png')
  if (fs.existsSync(defaultPath)) {
    try {
      const buf = fs.readFileSync(defaultPath)
      defaultAvatarDataUri = `data:image/png;base64,${buf.toString('base64')}`
    } catch (e) {
      logger.warn('读取本地默认头像失败: %s', e.message)
    }
  }
  return defaultAvatarDataUri
}

async function fetchBufferWithRetry(url, maxRetries = 1, timeoutMs = 8000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Referer': 'https://www.kurobbs.com/',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      })
      return res
    } catch (err) {
      if (attempt < maxRetries) {
        logger.debug('拉取头像重试: url=%s, attempt=%d, err=%s', url, attempt + 1, err.message)
        await new Promise(r => setTimeout(r, 400))
      } else {
        throw err
      }
    }
  }
}

async function getAvatarDataUri(primaryUrl, secondaryUrl) {
  const urls = [primaryUrl, secondaryUrl].filter(Boolean)
  if (!urls.length) return getDefaultAvatar()

  // 优先复用有效 Base64 缓存
  for (const u of urls) {
    const cached = avatarCache.get(u)
    if (cached && typeof cached === 'string' && cached.startsWith('data:image/')) {
      return cached
    }
  }

  // 尝试依次下载并裁剪转换
  for (const u of urls) {
    try {
      const res = await fetchBufferWithRetry(u, 1, 8000)
      let buf = Buffer.from(res.data)
      try {
        buf = cropAvatarPng(buf)
      } catch (e) {
        logger.debug('裁剪头像处理失败: %s', e.message)
      }
      const contentType = res.headers['content-type'] || 'image/png'
      const dataUri = `data:${contentType};base64,${buf.toString('base64')}`
      avatarCache.set(u, dataUri)
      return dataUri
    } catch (e) {
      logger.warn('下载游戏头像失败 (%s): %s', u, e.message)
    }
  }

  // 若均下载超时或失败，使用本地官方高清兜底头像，绝不返回未转换的外部 http url（SVG 中外部 http url 会被浏览器拦截）
  return getDefaultAvatar()
}

function getBoxCount(baseData, namePattern) {
  if (!baseData) return 0
  const list = baseData.treasureBoxList || baseData.boxList || []
  if (!Array.isArray(list)) return 0

  const item = list.find(b => {
    const n = b.boxName || b.name || ''
    return n.includes(namePattern)
  })

  return item ? Number(item.num || 0) : 0
}

async function getRoleList(credentials) {
  const cacheKey = `__roles__${credentials.userId}`
  const cached = roleListCache.get(cacheKey)
  if (cached) return cached

  const res = await fetchKuroRoleList({
    userId: credentials.userId,
    token: credentials.token,
    gameId: 3,
  })

  if (!res.ok) {
    throw new Error(res.msg || '获取鸣潮角色列表失败')
  }

  const roles = res.roles || []
  roleListCache.set(cacheKey, roles)
  return roles
}

async function userInfo({ uid, detail = false } = {}) {
  const credentials = getStoredCredentials()
  if (!credentials.userId || !credentials.token) {
    throw new Error('未配置库街区登录信息，请先在网页控制台完成登录或导入 Token')
  }

  const roles = await getRoleList(credentials)
  if (!roles.length) {
    throw new Error('未在库街区账号下找到绑定的鸣潮角色，请先在库街区 App 绑定游戏角色')
  }

  const normalizedUid = String(uid || '').trim()
  let targetRole = null

  if (normalizedUid && normalizedUid !== 'default' && normalizedUid !== '0') {
    targetRole = roles.find(r => String(r.roleId) === normalizedUid)
  }

  if (!targetRole) {
    targetRole = roles[0]
  }

  const roleId = String(targetRole.roleId)
  const serverId = String(targetRole.serverId)
  const cacheKey = `__kuro_card_${roleId}`

  const cachedData = cardCache.get(cacheKey)
  if (cachedData) {
    if (!cachedData.avatar || !cachedData.avatar.startsWith('data:image/')) {
      logger.warn('检测到缓存中头像非 Data URI 格式，重新获取头像...')
      const primaryAvatarUrl = targetRole.headPhotoUrl || ''
      const secondaryAvatarUrl = targetRole.gameHeadUrl || ''
      cachedData.avatar = await getAvatarDataUri(primaryAvatarUrl, secondaryAvatarUrl)
      cardCache.set(cacheKey, cachedData)
    }
    logger.info('从缓存中获取鸣潮卡片数据: roleId=%s', roleId)
    return cachedData
  }

  logger.info('开始请求鸣潮角色数据: roleId=%s, serverId=%s', roleId, serverId)

  // 并发拉取小组件数据与鸣潮基础数据
  const [widgetResult, baseResult] = await Promise.allSettled([
    fetchKuroRoleDetail({
      userId: credentials.userId,
      token: credentials.token,
      roleId,
      serverId,
    }),
    fetchKuroAkiBaseData({
      userId: credentials.userId,
      token: credentials.token,
      roleId,
      serverId,
    }),
  ])

  const widgetData = widgetResult.status === 'fulfilled' && widgetResult.value.ok
    ? widgetResult.value.detail
    : null

  const baseData = baseResult.status === 'fulfilled' && baseResult.value.ok
    ? baseResult.value.data
    : null

  if (!widgetData && !baseData) {
    const errorMsg =
      (widgetResult.status === 'fulfilled' ? widgetResult.value.msg : '') ||
      (baseResult.status === 'fulfilled' ? baseResult.value.msg : '') ||
      '获取鸣潮角色数据失败，可能登录态已过期，请重新登录'
    throw new Error(errorMsg)
  }

  const energyCur = widgetData?.energyData?.cur ?? baseData?.energy ?? 0
  const energyTotal = widgetData?.energyData?.total ?? baseData?.maxEnergy ?? 240
  const storeEnergyCur = widgetData?.storeEnergyData?.cur ?? baseData?.storeEnergy ?? 0
  const storeEnergyTotal = widgetData?.storeEnergyData?.total ?? baseData?.storeEnergyLimit ?? 480

  const towerCur = widgetData?.towerData?.cur ?? 0
  const towerTotal = widgetData?.towerData?.total ?? 36
  const towerStar = `${towerCur}/${towerTotal}`

  const nickname =
    widgetData?.roleName ||
    baseData?.name ||
    targetRole.roleName ||
    '漂泊者'

  const level = Number(targetRole.gameLevel || baseData?.level || targetRole.level || 0)
  const worldLevel = baseData?.worldLevel ?? (level >= 80 ? 8 : Math.max(1, Math.floor(level / 10)))
  const activeDays = targetRole.activeDay ?? baseData?.activeDays ?? 0
  const achievementNumber = targetRole.achievementCount ?? baseData?.achievementCount ?? 0
  const roleNum = targetRole.roleNum ?? baseData?.roleNum ?? 0
  const phantomPercent = targetRole.phantomPercent
    ? (Math.round(Number(targetRole.phantomPercent) * 1000) / 10).toFixed(1) + '%'
    : '0%'

  const boxBasic = getBoxCount(baseData, '朴素')
  const boxStandard = getBoxCount(baseData, '基准')
  const boxAdvanced = getBoxCount(baseData, '精密')
  const boxPremium = getBoxCount(baseData, '辉光')

  const primaryAvatarUrl = targetRole.headPhotoUrl || ''
  const secondaryAvatarUrl = targetRole.gameHeadUrl || ''
  const avatar = await getAvatarDataUri(primaryAvatarUrl, secondaryAvatarUrl)

  const data = {
    uid: roleId,
    roleId,
    nickname,
    roleName: nickname,
    avatar,
    level,
    world_level: worldLevel,
    server_name: widgetData?.serverName || targetRole.serverName || '鸣潮',
    energy: energyCur,
    max_energy: energyTotal,
    store_energy: storeEnergyCur,
    max_store_energy: storeEnergyTotal,
    active_days: activeDays,
    achievement_number: achievementNumber,
    tower_star: towerStar,
    role_num: roleNum,
    phantom_percent: phantomPercent,
    box_basic: boxBasic,
    box_standard: boxStandard,
    box_advanced: boxAdvanced,
    box_premium: boxPremium,
    small_count: baseData?.smallCount ?? 0,
    big_count: baseData?.bigCount ?? 0,
  }

  cardCache.set(cacheKey, data)
  return data
}

module.exports = userInfo