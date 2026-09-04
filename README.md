<div align="center">

# 🌊 Kuro-Card · 鸣潮名片生成器
### Wuthering Waves Resonator Profile Card Generator

> 基于 [journey-ad/genshin-impact-card](https://github.com/journey-ad/genshin-impact-card) 与 [teppyboy/Genshin-Card](https://github.com/teppyboy/Genshin-Card) 架构改进，专为《鸣潮》（Wuthering Waves）玩家量身打造的动态 SVG 个人名片生成工具。  
> 自动同步库街区官方实时数据，支持 Vercel 零维护无状态部署，完美嵌入 GitHub Profile README、个人博客与社区论坛！

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/KallkaGo/WuWa-Card&amp;env=KURO_USER_ID,KURO_TOKEN&amp;project-name=wuwa-card">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>
</p>

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![Vercel](https://img.shields.io/badge/Deployment-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## ✨ 项目特性

- ⚡ **实时游戏数据同步**：自动对接库街区官方接口，实时渲染 **联觉等级、索拉结晶波片体力（实时恢复）、活跃天数、奇藏箱开启数、逆境深塔战绩与共鸣者总数**。
- ✦ **纯 SVG 典藏微晶星芒**：采用纯 CSS @keyframes 实现自然折射的多色微晶星芒流光，无需前端 JavaScript 或 Canvas，在任何 Markdown / HTML 页面均可流畅绽放。
- 🎨 **12 款精美高清背景立绘**：内置今汐、椿、弗洛洛、爱弥斯、露西、陆·赫斯等 12 款 1280×704 宽幅立绘，支持指定编号或随机抽取。
- 📐 **比例微放优化**：优化视口比例为 `500 × 210`（内部 1000 × 420），大幅减少对角色面部与武器姿态的裁切，兼顾通透排版与角色质感。
- ☁️ **Vercel Serverless 原生支持**：基于无状态设计，通过环境变量安全注入个人 Token，安全私密、永续在线、无需自备云服务器。

---

## 🚀 使用方法 (Usage)

### 1. 路径规范

| 格式 | 调用语法 | 说明 |
| :--- | :--- | :--- |
| **SVG 图片直链** | `/{背景编号}/{UID}.png` | 适合站内或反代 |
| **Markdown 引用** | `![]({域名}/{背景编号}/{UID}.png)` | 适合 GitHub Profile `README.md` |
| **HTML 嵌入** | `<img src="{域名}/{背景编号}/{UID}.png" alt="Card" />` | 适合个人网站、博客页面 |
| **BBCode 引用** | `[img]{域名}/{背景编号}/{UID}.png[/img]` | 适合贴吧、NGA、Discourse 等论坛 |

### 2. 调用示例

- **使用 1 号背景（露西 01，默认）**：
  ```markdown
  ![](https://{你的域名}/1/101888171.png)
  ```
- **使用 7 号背景（椿 03）**：
  ```markdown
  ![](https://{你的域名}/7/101888171.png)
  ```
- **每次刷新随机切换背景（1~12 款）**：
  ```markdown
  ![](https://{你的域名}/rand/101888171.png)
  ```
- **指定随机范围（如在 1~5 号之间随机）**：
  ```markdown
  ![](https://{你的域名}/1-5/101888171.png)
  ```

### 3. 可选 URL 参数

| 参数名 | 默认值 | 可选值 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `effect` | `sparkles` | `clean` / `none` | 关闭微晶星芒动效，展示纯净名片 | `?effect=clean` |
| `height` | `420` | `330` ~ `700` | 卡片高度（设为 `330` 即为原版 500×165 狭长高度） | `?height=330` |

---

## 🛠️ Vercel 一键部署指南

由于库街区（Kuro BBS）官方严格执行**账号与角色权限隔离校验**，建议每位玩家部署属于自己的专属 Vercel 实例，凭据 100% 自主持有，绝对安全：

### 步骤 1：Fork 并导入 Vercel
1. 点击上方的 **[Deploy with Vercel]** 按钮，或进入 [Vercel 控制台](https://vercel.com/new) 导入本仓库。

### 步骤 2：配置环境变量
在 Vercel 项目设置中的 **Settings -> Environment Variables** 添加以下两项：

| 变量名 | 说明 | 示例 |
| :--- | :--- | :--- |
| `KURO_USER_ID` | 你的库街区用户 ID（纯数字） | `24653789` |
| `KURO_TOKEN` | 你的库街区 Token 密钥（以 `eyJ` 开头） | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |

> 💡 **如何获取库街区 Token 与 UserId？**  
> 1. 用电脑浏览器打开并登录 [库街区官网 (kurobbs.com)](https://www.kurobbs.com/)；  
> 2. 按键盘 `F12` 打开开发者工具，切换到 **Application (应用程序)** -> **Cookies** -> `https://www.kurobbs.com`；  
> 3. 复制 `token`（或 `user_token`）和 `userId` 的值填入上述环境变量即可。

### 步骤 3：完成部署
点击 **Deploy**，部署完成后 Vercel 会为你分配一个专属域名（如 `https://your-name.vercel.app`），直接访问该域名即可使用！

---

## 💻 本地开发与调试

```bash
# 1. 克隆仓库
git clone https://github.com/KallkaGo/WuWa-Card.git
cd WuWa-Card

# 2. 安装依赖
npm install

# 3. 配置凭据启动 (两种方式选其一)
# 方式 A：通过环境变量启动
KURO_USER_ID=你的userId KURO_TOKEN=你的token npm run dev

# 方式 B：根目录下创建 kuro_credentials.txt
# 内容：
# userId=你的userId
# token=你的token
npm run dev

# 4. 浏览器访问
open http://localhost:3000
```

---

## 📂 项目结构

```text
Kuro-Card/
├── assets/
│   ├── fonts/           # 汉仪文黑字体子集化源文件
│   ├── skin/            # 12 款鸣潮高清宽幅背景立绘 (1.png ~ 12.png)
│   └── default_avatar.png # 官方高清默认头像兜底
├── utils/
│   ├── kuroAuth.js      # 库街区鉴权、小组件及战绩 API 客户端
│   ├── svg.js           # 动态 SVG 生成器、文字子集化与星芒动效
│   └── http.js          # 带重试和超时容错的 Axios 封装
├── views/
│   └── index.pug        # 响应式 Web 控制台与卡片快速交互界面
├── index.js             # Express 入口与 API 路由
├── userInfo.js          # 角色数据拉取、双层头像下载与内存缓存
└── vercel.json          # Vercel Serverless 构建与路由配置文件
```

---

## 🤝 致谢与参考 (Acknowledgements)

- [journey-ad/genshin-impact-card](https://github.com/journey-ad/genshin-impact-card) - 优秀的原版原神卡片设计理念与灵感来源
- [teppyboy/Genshin-Card](https://github.com/teppyboy/Genshin-Card) - Vercel Serverless 适配版工程实现
- [Fontmin](https://github.com/ecomfe/fontmin) - 动态中文字体矢量子集化技术
- [库洛游戏 (Kuro Games)](https://www.kurogames.com/) - 《鸣潮》精美的美术资产与库街区服务

---

## 📜 声明 (Disclaimer)

- 本项目为《鸣潮》（Wuthering Waves）玩家社区制作的非官方开源同人衍生作品，与广州库洛科技有限公司（Kuro Games）及其关联实体无官方隶属关系。
- 项目中引用的游戏图标、角色背景与相关资产知识产权均归广州库洛科技有限公司所有。
- 请妥善保管好个人库街区 Token 凭据，切勿在公开群聊、日志或公开代码仓库中泄漏。
