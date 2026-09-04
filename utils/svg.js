const fs = require('fs')
const path = require('path')
const mimeType = require('mime-types')
const Fontmin = require('fontmin-kallka')
const ttf2woff = require('ttf2woff')
const NodeCache = require('node-cache')
const md5 = require('md5')
const pino = require('pino')
const util = require('./index')

const skinPath = path.resolve(__dirname, '../assets/skin')
const woff2Cache = new NodeCache({ stdTTL: 60 * 60 * 24 * 365 })
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const skinList = {}

function loadSkins() {
  if (fs.existsSync(skinPath)) {
    fs.readdirSync(skinPath).forEach(img => {
      const imgPath = path.resolve(skinPath, img)
      const name = path.parse(img).name
      skinList[name] = convertToDatauri(imgPath)
    })
  }

  if (!skinList['0'] && skinList['1']) {
    skinList['0'] = skinList['1']
  }
}

loadSkins()

function convertToDatauri(p) {
  const mime = mimeType.lookup(p)
  const base64 = fs.readFileSync(p).toString('base64')
  return `data:${mime};base64,${base64}`
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

function randomArr(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function range(start, end) {
  if (start > end) [end, start] = [start, end]
  return Array.from(new Array(parseInt(end) + 1).keys()).slice(parseInt(start))
}

const baseGlyph = `
ABCDEFGHIJKLMNOPQRSTUVWXYZ
abcdefghijklmnopqrstuvwxyz
1234567890 
"!\\'?'.,;:()[]{}<>|/@\\^$-%+=#_&~*
联觉等级索拉结晶波片单质活跃天数成就达成逆境深塔深境区共鸣者奇藏箱朴素基准精密辉光信标鸣潮漂泊者国服角色声骸图鉴存储
`

const txt2woff2 = async text => {
  const key = '__woff2__' + md5(text)
  const fontPath = path.resolve(__dirname, '../assets/fonts/HYWenHei-55W.ttf')

  return new Promise((resolve, reject) => {
    const cachedData = woff2Cache.get(key)
    if (cachedData) {
      logger.info('从缓存中获取子集化字体 %s', key)
      resolve(cachedData)
      return
    }

    const fontmin = new Fontmin()
      .src(fontPath)
      .use(
        Fontmin.glyph({
          text: baseGlyph + text,
          hinting: false,
        })
      )

    fontmin.run(function (err, files) {
      if (err) {
        reject(err)
        return
      }

      const ttfBuffer = files[0].contents
      const woffBuffer = ttf2woff(ttfBuffer)
      const woff2 = Buffer.from(woffBuffer).toString('base64')

      woff2Cache.set(key, woff2)
      resolve(woff2)
    })
  })
}

const svg = async ({ data, skin = '0', detail = false, effect = 'sparkles', height = 420 }) => {
  skin = String(skin || '0').trim()
  effect = String(effect || 'sparkles').trim().toLowerCase()

  const cardWidth = 1000
  const cardHeight = Math.max(300, Math.min(700, Number(height) || 420))
  const svgWidth = Math.round(cardWidth * 0.5)
  const svgHeight = Math.round(cardHeight * 0.5)

  let bgImage = ''

  if (skin.includes(',')) {
    const skinArr = skin.split(',').reduce((arr, cur) => {
      if (cur) {
        if (cur.includes('-')) {
          const [start, end] = cur.split('-')
          arr = arr.concat(range(start, end))
        } else {
          arr = arr.concat(parseInt(cur))
        }
      }
      return arr
    }, [])
    skin = String(randomArr(skinArr))
    bgImage = skinList[skin] || skinList['1'] || skinList['0'] || ''
  } else if (skin.includes('-')) {
    const [start, end] = skin.split('-')
    const skinArr = range(start, end)
    skin = String(randomArr(skinArr))
    bgImage = skinList[skin] || skinList['1'] || skinList['0'] || ''
  } else if (skin === 'rand' || isNaN(Number(skin))) {
    const keys = Object.keys(skinList).filter(k => k !== '0')
    skin = keys.length ? keys[random(0, keys.length - 1)] : '1'
    bgImage = skinList[skin] || skinList['1'] || skinList['0'] || ''
  } else {
    bgImage = skinList[skin] || skinList['1'] || skinList['0'] || ''
  }

  if (!bgImage) {
    bgImage = skinList['1'] || skinList['0'] || ''
  }

  const woff2 = await txt2woff2(data.nickname || '')

  let effectCss = ''
  let effectHtml = ''

  if (effect !== 'none' && effect !== 'clean' && effect !== 'false') {
    // ✦ 典藏星芒闪烁 (增加亮光前的自然微晶折射效果：随机动态分布，消失无停顿连贯动画)
    const starCount = 14 // 14 颗星芒，每颗在两个不同随机点之间连续无缝绽放（全卡 28 处随机星芒）
    const colors = ['s-white', 's-cyan', 's-gold', 's-violet']
    let starCssRules = ''
    let starHtmlSpans = ''

    for (let i = 0; i < starCount; i++) {
      // 随机位置1 (P1)
      const x0 = random(25, 940)
      const y0 = random(15, cardHeight - 40)

      // 随机位置2 (P2，全画幅另一个随机点)
      const x1 = random(25, 940)
      const y1 = random(15, cardHeight - 40)

      const dx = x1 - x0
      const dy = y1 - y0

      // 动画周期 2.8s ~ 4.0s，自然错落
      const duration = (2.8 + Math.random() * 1.2).toFixed(2)
      // 负延时，卡片呈现瞬间即处于不同绽放相位，无需冷启动等待
      const delay = (-Math.random() * 4).toFixed(2)
      const size = random(18, 28)
      const color = colors[i % colors.length]

      starCssRules += `
        .s${i} {
          top: ${y0}px;
          left: ${x0}px;
          font-size: ${size}px;
          animation: twkStar_${i} ${duration}s ease-in-out infinite;
          animation-delay: ${delay}s;
        }
        @keyframes twkStar_${i} {
          0% {
            transform: translate(0px, 0px) scale(0) rotate(0deg);
            opacity: 0;
          }
          25% {
            transform: translate(0px, 0px) scale(1.25) rotate(45deg);
            opacity: 1;
          }
          50% {
            transform: translate(0px, 0px) scale(0) rotate(90deg);
            opacity: 0;
          }
          50.01% {
            transform: translate(${dx}px, ${dy}px) scale(0) rotate(90deg);
            opacity: 0;
          }
          75% {
            transform: translate(${dx}px, ${dy}px) scale(1.25) rotate(135deg);
            opacity: 1;
          }
          100% {
            transform: translate(${dx}px, ${dy}px) scale(0) rotate(180deg);
            opacity: 0;
          }
        }
      `
      starHtmlSpans += `          <span class="s s${i} ${color}">✦</span>\n`
    }

    effectCss = `
        /* ✦ 典藏星芒闪烁 (随机动态分布，消失无停顿连贯动画) */
        .effect-sparkles {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          overflow: hidden;
          z-index: 10;
        }
        .effect-sparkles .s {
          position: absolute;
          display: inline-block;
          color: #ffffff;
          line-height: 1;
          user-select: none;
          opacity: 0;
        }
        .s-white  { text-shadow: 0 0 6px #ffffff, 0 0 16px rgba(255, 255, 255, 0.9), 0 0 28px rgba(255, 255, 255, 0.6); }
        .s-cyan   { text-shadow: 0 0 6px #ffffff, 0 0 16px #38bdf8, 0 0 30px #0284c7; }
        .s-gold   { text-shadow: 0 0 6px #ffffff, 0 0 16px #fbbf24, 0 0 30px #d97706; }
        .s-violet { text-shadow: 0 0 6px #ffffff, 0 0 16px #c084fc, 0 0 30px #7c3aed; }
        ${starCssRules}
    `
    effectHtml = `
        <div class="effect-sparkles">
${starHtmlSpans}        </div>
    `
  }

  const hasBoxes = Boolean(
    (data.box_basic && data.box_basic > 0) ||
    (data.box_standard && data.box_standard > 0) ||
    (data.box_advanced && data.box_advanced > 0) ||
    (data.box_premium && data.box_premium > 0)
  )

  const topExtraHtml = detail && hasBoxes
    ? `
            <div class="chest-item" title="朴素奇藏箱"><span class="chest-dot dot-basic"></span><span class="chest-val">${data.box_basic || 0}</span></div>
            <div class="chest-item" title="基准奇藏箱"><span class="chest-dot dot-standard"></span><span class="chest-val">${data.box_standard || 0}</span></div>
            <div class="chest-item" title="精密奇藏箱"><span class="chest-dot dot-advanced"></span><span class="chest-val">${data.box_advanced || 0}</span></div>
            <div class="chest-item" title="辉光奇藏箱"><span class="chest-dot dot-premium"></span><span class="chest-val">${data.box_premium || 0}</span></div>
    `
    : ''

  return new Promise(resolve => {
    const tpl = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgWidth}" height="${svgHeight}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <title>Wuthering Waves Resonator Card</title>
  <foreignObject width="${cardWidth}" height="${cardHeight}" transform="scale(.5)">
    <body xmlns="http://www.w3.org/1999/xhtml">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          user-select: none;
        }
        body {
          width: 100%;
          height: 100%;
          font-family: HYWenHei, sans-serif;
          font-size: 26px;
          color: #ffffff;
        }
        .user-container {
          position: absolute;
          width: 100%;
          height: 100%;
          background-image: url(${bgImage});
          background-size: cover;
          background-position: center;
          overflow: hidden;
        }

        ${effectCss}

        .top {
          position: absolute;
          display: flex;
          align-items: center;
          width: 100%;
          height: 125px;
          padding: 10px 20px;
          background: transparent;
          text-shadow: 0px 0px 10px rgba(19, 19, 19, 70%), 0px 2px 4px rgba(0, 0, 0, 80%);
          z-index: 1;
        }

        .profile-wrap {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .avatar-wrap {
          position: relative;
          width: 105px;
          height: 105px;
          border-radius: 50%;
          border: 3px solid #ffffff;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.6);
          overflow: hidden;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .avatar {
          width: 104%;
          height: 104%;
          border-radius: 50%;
          object-fit: cover;
          display: block;
        }

        .user-info {
          position: relative;
          display: inline-block;
          padding: 4px 0;
          z-index: 1;
        }

        .user-info .name-wrap {
          display: flex;
        }

        .name-wrap .name {
          font-size: 44px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .name-wrap .level {
          margin-top: 12px;
          margin-left: 8px;
          font-size: 24px;
          font-weight: bold;
        }

        .user-info .uid {
          font-size: 26px;
          margin-top: 2px;
          line-height: 1;
        }

        .chest-list {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-left: auto;
        }

        .chest-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(15, 23, 42, 0.65);
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-size: 22px;
        }

        .chest-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .dot-basic { background: #94a3b8; box-shadow: 0 0 6px #94a3b8; }
        .dot-standard { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
        .dot-advanced { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
        .dot-premium { background: #fbbf24; box-shadow: 0 0 8px #fbbf24; }

        .chest-val {
          font-weight: bold;
          color: #f8fafc;
        }

        .bottom {
          position: absolute;
          bottom: 0;
          width: 100%;
          height: 120px;
          display: flex;
          padding-top: 22px;
          padding-left: 20px;
          justify-content: space-around;
          align-items: center;
          background: transparent;
          text-shadow: 0px 0px 10px rgba(19, 19, 19, 70%), 0px 2px 4px rgba(0, 0, 0, 80%);
          z-index: 1;
        }

        .bottom .section {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-around;
          min-width: 160px;
          margin-right: 12px;
          line-height: 1;
          z-index: 1;
        }

        .bottom .section:last-of-type {
          margin-right: auto;
        }

        .bottom .section .val {
          font-size: 48px;
          letter-spacing: -2px;
        }

        .bottom .section .desc {
          font-size: 26px;
          margin-top: 4px;
        }

        .chest-list:empty {
          display: none;
        }

        @font-face {
          font-family: HYWenHei;
          src: url('data:font/woff2;base64,${woff2}') format('woff2');
        }
      </style>

      <div class="user-container">
        ${effectHtml}
        <div class="top">
          <div class="profile-wrap">
            <div class="avatar-wrap">
              <img class="avatar" src="{{avatar}}" alt="avatar" />
            </div>
            <div class="user-info">
              <div class="name-wrap">
                <div class="name">{{nickname}}</div>
                <div class="level">Lv.{{level}}</div>
              </div>
              <div class="uid">UID: {{uid}}</div>
            </div>
          </div>
          <div class="chest-list">
            ${topExtraHtml}
          </div>
        </div>

        <div class="bottom">
          <div class="section">
            <div class="val">{{active_days}}</div>
            <div class="desc">活跃天数</div>
          </div>
          <div class="section">
            <div class="val">{{achievement_number}}</div>
            <div class="desc">成就达成</div>
          </div>
          <div class="section">
            <div class="val">{{tower_star}}</div>
            <div class="desc">逆境深塔</div>
          </div>
          <div class="section">
            <div class="val">{{role_num}}</div>
            <div class="desc">共鸣者</div>
          </div>
        </div>
      </div>
    </body>
  </foreignObject>
</svg>`

    resolve(util.render(tpl, data))
  })
}

module.exports = svg
