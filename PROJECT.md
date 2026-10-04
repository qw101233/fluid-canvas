# PROJECT.md — fluid-canvas（流体画布）

> **本文件供 AI 助手读取**。接手前先读完本文档，判断是否为重复项目、是否延续既有决策。

## 项目名称

**fluid-canvas（流体画布）** — WebGL 实时流体染料模拟器

GitHub: https://github.com/qw101233/fluid-canvas （2026-10-04 创建）

## 一句话需求

在浏览器中实时求解 Navier-Stokes 方程，用户通过鼠标/触摸拖动喷射染料、点击放置墨滴，
观察染料在涡流中绽放、翻卷、流淌的视觉效果。

## 核心功能（均已实现并通过验证）

1. **GPU 流体求解**（Stable Fluids / Jos Stam 1999 经典方案）：
   - 速度场 + 染料场双 FBO ping-pong（RGBA half-float 纹理）
   - 半拉格朗日平流（advection，支持线性采样优化路径）
   - Jacobi 迭代压力求解（默认 20 次迭代）+ 梯度减除（不可压缩性）
   - 涡量约束（vorticity confinement，默认 curl=30）补偿数值耗散的漩涡
2. **交互**：
   - 拖动 = 喷射染料+速度；单击 = 放置墨滴（径向爆发）
   - 指针多点触控支持（pointer events）
3. **参数面板**（右侧玻璃拟态 UI，可折叠）：涡量强度、粘性耗散、染料消散、压力迭代、
   喷洒半径、调色板（霓虹/海洋/熔岩/翡翠/单色）、清空/爆发/暂停按钮、闲时自动爆发开关
4. **可编程调色板**：染料颜色由 5 种 HSV 生成策略生成
5. **window.fluid 调试 API**（自动化验证与演示录制的核心依赖）：
   - `splat(x, y, dx, dy, color, radius)` / `step(n)` / `reset()` / `readPixels()`
   - `setParams({...})` / `getParams()` / `setPaused(bool)` / `setAutoSplats(bool)`
   - `_readField('dye'|'velocity')` 直读场数据；`_ext` GL 扩展信息

## 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 渲染 | WebGL 1 + GLSL ES 1.00 | 兼容性最强（工作区沉淀：swiftshader/ANGLE 下 ES 3.00 有坑） |
| 数值格式 | OES_texture_half_float + 线性过滤（不支持时退 NEAREST） | 平衡精度与性能 |
| 架构 | 单文件 index.html（782 行），零依赖、零构建 | 双击即用 |
| 验证 | Node Playwright（`tools/verify.mjs`），`--use-angle=swiftshader` 软件渲染 | 无头可复现 |

## 目录结构

```
fluid-canvas/
├── index.html          # 全部实现（HTML+CSS+JS+GLSL）
├── PROJECT.md          # 本文件（AI 判重/接手用）
├── README.md           # 面向人的完整说明（GitHub 首页）
├── .gitignore
├── screenshots/        # verify/shots 脚本产出的演示截图（5 张，960x540）
│   ├── demo-bloom.png  # 墨滴绽放
│   ├── demo-vortex.png # 涡街
│   ├── demo-ribbon.png # 流带
│   ├── demo-paint.png  # 笔触绘画
│   └── demo-ui.png     # 完整 UI
├── slides/             # 9:16 幻灯片 HTML 源文件（1080x1920）
│   ├── slide1.html     # 项目简介
│   ├── slide2.html     # 核心功能演示
│   └── slide3.html     # 最终效果
├── deliverables/       # 幻灯片渲染成品 PNG（发布用）
│   ├── slide1.png / slide2.png / slide3.png
└── tools/              # 自动化脚本（Node，不进浏览器）
    ├── verify.mjs      # 10 项行为验证（Playwright）
    ├── shots.mjs       # 5 张演示截图生成
    └── render-slides.mjs # 幻灯片 HTML→PNG 渲染 + 溢出检测
```

## 运行方式

- **使用**：直接双击 `index.html`（任何现代浏览器）。
- **验证**：
  ```bash
  NODE_PATH=<playwright 所在 node_modules> node tools/verify.mjs
  ```
  输出 10/10 PASSED 即健康。
- **重生成截图/幻灯片**：`node tools/shots.mjs` → `node tools/render-slides.mjs`

## 当前进度（2026-10-04）

- ✅ 核心模拟实现完成（782 行单文件）
- ✅ Playwright 行为验证 10/10 通过：清屏基线 / splat 注入 / 平流方向性（质心 0.300→0.364 右移）
  / 无速度对照组不漂移 / 参数热更新 / 涡量约束 / 600 步稳定性 / 交互路径 / FPS / 零报错
- ✅ 5 张演示截图 + 3 张 9:16 幻灯片（逐张 QC）
- ✅ GitHub 公开仓库已推送

## 关键实现决策（历史，勿推翻）

- **全屏四边形顶点顺序必须是 zigzag** `[-1,-1, 1,-1, -1,1, 1,1]`（TRIANGLE_STRIP）。
  曾误用 TRIANGLE_FAN 的绕圈顺序导致"蝴蝶结"——屏幕左半 splat 全部消失（2026-10-04 大坑，详见工作区记忆）。
- NPOT 纹理与 POT 纹理均实测无差别（当时排查过，非分辨率问题）。
- `getResolution` 按 canvas 宽高比分配模拟/染料分辨率（SIM_RESOLUTION=128, DYE_RESOLUTION=1024）。
- swiftshader 环境下 subSteps 自适应降级保证可运行性。

## 判重提示

若新任务出现以下关键词组合：**流体模拟 / fluid simulation / smoke / ink / Navier-Stokes /
Stable Fluids / WebGL 染料** —— 先确认是不是要动本项目或重建同类，避免重复造轮子。
相邻项目（方向不同，勿混淆）：particle-life（粒子生命）、pattern-lab（反应扩散）、
gravity-theater（N 体引力）、photon-lab（光学）、element-sandbox（元素沙盒）。
