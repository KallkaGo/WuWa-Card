const express = require('express')
const compression = require('compression')
const pino = require('pino')
const path = require('path')
const svg = require('./utils/svg')
const userInfo = require('./userInfo')
const {
  getStoredCredentials,
  saveCredentials,
  checkKuroToken,
  sendKuroSmsCode,
  loginWithKuroSms,
  fetchKuroRoleList,
} = require('./utils/kuroAuth')

const app = express()
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))
app.use(compression())
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')

const CACHE_0 = 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0'
const CACHE_STATIC = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600'
const CACHE_DYNAMIC = 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0'

function renderErrorSvg(message) {
  const safeMsg = String(message || '获取角色数据失败')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return `<svg width="500" height="165" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0b0f19" rx="6" stroke="#ef4444" stroke-width="1.5"/>
  <circle cx="250" cy="50" r="16" fill="#ef4444" opacity="0.2"/>
  <text x="250" y="56" fill="#ef4444" font-size="20" font-family="sans-serif" font-weight="bold" text-anchor="middle">!</text>
  <text x="250" y="90" fill="#f87171" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle">鸣潮卡片生成提示</text>
  <text x="250" y="118" fill="#94a3b8" font-size="13" font-family="sans-serif" text-anchor="middle">${safeMsg}</text>
  <text x="250" y="140" fill="#64748b" font-size="11" font-family="sans-serif" text-anchor="middle">请访问网页控制台检查登录态或绑定角色</text>
</svg>`
}

// 主页
app.get('/', (req, res) => res.render('index.pug'))

// 获取当前登录状态与绑定的鸣潮角色
app.get('/kuro/api/status', async (req, res) => {
  const credentials = getStoredCredentials()
  if (!credentials.userId || !credentials.token) {
    return res.json({
      code: 0,
      isLoggedIn: false,
      user: null,
      roles: [],
      msg: '尚未登录',
    })
  }

  try {
    const userRes = await checkKuroToken(credentials)
    if (!userRes.ok) {
      return res.json({
        code: 0,
        isLoggedIn: false,
        user: null,
        roles: [],
        msg: userRes.msg || '登录已过期',
      })
    }

    const roleRes = await fetchKuroRoleList({
      userId: credentials.userId,
      token: credentials.token,
      gameId: 3,
    })

    return res.json({
      code: 0,
      isLoggedIn: true,
      user: userRes.user,
      roles: roleRes.roles || [],
      msg: '登录有效',
    })
  } catch (error) {
    logger.error('获取登录状态失败 %o', error)
    return res.json({
      code: -1,
      isLoggedIn: false,
      user: null,
      roles: [],
      msg: error?.message || '检查登录状态失败',
    })
  }
})

// 发送短信验证码
app.post('/kuro/api/send-sms', async (req, res) => {
  const mobile = String(req.body.mobile || '').trim()
  if (!mobile) {
    return res.status(400).json({ code: -1, msg: '手机号不能为空' })
  }

  try {
    const result = await sendKuroSmsCode({ mobile })
    if (!result.ok) {
      return res.status(400).json({
        code: result.code,
        msg: result.msg || '发送验证码失败',
      })
    }

    // 检查是否需要极验
    const needGeetest = Boolean(result.data?.geeTest)
    return res.json({
      code: 0,
      msg: needGeetest
        ? '需极验验证，建议直接在库街区 App 点击发送验证码，然后在此输入验证码'
        : '验证码发送成功',
      needGeetest,
    })
  } catch (error) {
    logger.error('发送验证码失败 %o', error)
    return res.status(500).json({ code: -1, msg: error?.message || '发送验证码接口请求失败' })
  }
})

// 验证码登录
app.post('/kuro/api/login-sms', async (req, res) => {
  const mobile = String(req.body.mobile || '').trim()
  const code = String(req.body.code || '').trim()

  if (!mobile || !code) {
    return res.status(400).json({ code: -1, msg: '手机号与验证码不能为空' })
  }

  try {
    const result = await loginWithKuroSms({ mobile, code })
    if (!result.ok) {
      return res.status(400).json({
        code: result.code,
        msg: result.msg || '登录失败，请检查验证码是否正确或过期',
      })
    }

    const userData = result.data
    saveCredentials({
      userId: userData.userId,
      token: userData.token,
    })

    // 获取绑定的鸣潮角色
    const roleRes = await fetchKuroRoleList({
      userId: userData.userId,
      token: userData.token,
      gameId: 3,
    })

    return res.json({
      code: 0,
      msg: '登录成功',
      user: {
        userId: userData.userId,
        userName: userData.userName,
        headUrl: userData.headUrl,
      },
      roles: roleRes.roles || [],
    })
  } catch (error) {
    logger.error('短信登录异常 %o', error)
    return res.status(500).json({ code: -1, msg: error?.message || '短信登录请求失败' })
  }
})

// 直接导入 Token
app.post('/kuro/api/save-token', async (req, res) => {
  let userId = String(req.body.userId || '').trim()
  let token = String(req.body.token || '').trim()
  const rawInput = String(req.body.rawInput || '').trim()

  // 支持直接粘贴整个 JSON
  if (rawInput) {
    try {
      const parsed = JSON.parse(rawInput)
      const dataObj = parsed.data || parsed
      if (dataObj.userId) userId = String(dataObj.userId).trim()
      if (dataObj.token) token = String(dataObj.token).trim()
    } catch (e) {
      // 不是 JSON，如果包含 token 键值对则尝试正则匹配
      const uidMatch = rawInput.match(/userId["':\s=]+([a-zA-Z0-9_-]+)/)
      const tokenMatch = rawInput.match(/token["':\s=]+([a-zA-Z0-9_.-]+)/)
      if (uidMatch && uidMatch[1]) userId = uidMatch[1]
      if (tokenMatch && tokenMatch[1]) token = tokenMatch[1]
    }
  }

  if (!userId || !token) {
    return res.status(400).json({ code: -1, msg: '缺少 userId 或 token 参数' })
  }

  try {
    const userRes = await checkKuroToken({ userId, token })
    if (!userRes.ok) {
      return res.status(401).json({
        code: userRes.code,
        msg: userRes.msg || 'Token 无效或已过期',
      })
    }

    saveCredentials({ userId, token })

    const roleRes = await fetchKuroRoleList({ userId, token, gameId: 3 })

    return res.json({
      code: 0,
      msg: 'Token 保存并校验成功',
      user: userRes.user,
      roles: roleRes.roles || [],
    })
  } catch (error) {
    logger.error('保存 Token 异常 %o', error)
    return res.status(500).json({ code: -1, msg: error?.message || '校验 Token 失败' })
  }
})

// 渲染名片 SVG 接口
app.get('/:skin/:uid.png', async (req, res) => {
  const { skin, uid } = req.params
  const { effect, height, h, detail } = req.query
  logger.info('收到卡片请求 uid:%s, skin:%s, effect:%s, height:%s', uid, skin, effect, height || h)

  try {
    const data = await userInfo({ uid })
    const svgImage = await svg({
      data,
      skin,
      effect,
      height: height || h,
      detail: detail === 'true' || detail === '1',
    })

    res.set({
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': data.avatarFallback
        ? CACHE_0
        : (isNaN(Number(skin)) ? CACHE_DYNAMIC : CACHE_STATIC),
    })
    res.send(svgImage)
  } catch (err) {
    logger.warn('生成卡片失败: %s', err?.message || err)
    res.set({
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': CACHE_0,
    })
    res.send(renderErrorSvg(err?.message || err))
  }
})

// 默认直接访问 /:uid.png (skin=0)
app.get('/:uid.png', async (req, res) => {
  const { uid } = req.params
  const { effect, height, h, detail } = req.query
  try {
    const data = await userInfo({ uid })
    const svgImage = await svg({
      data,
      skin: '0',
      effect,
      height: height || h,
      detail: detail === 'true' || detail === '1',
    })

    res.set({
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': data.avatarFallback ? CACHE_0 : CACHE_STATIC,
    })
    res.send(svgImage)
  } catch (err) {
    res.set({
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': CACHE_0,
    })
    res.send(renderErrorSvg(err?.message || err))
  }
})

app.get('/heart-beat', (req, res) => {
  res.set({ 'cache-control': CACHE_0 })
  res.json({ msg: 'alive', code: 0 })
})

const PORT = Number(process.env.PORT || 3000)
app.listen(PORT, () => logger.info('鸣潮卡片服务已启动，监听端口: ' + PORT))

module.exports = app
