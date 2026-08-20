# 前端页面首屏适配：如何让页面内容不超出视口

## 问题场景

图谱咨询助手（`AssistantPage`）纵向过长，即使在 1080p 分辨率下也需要滚动才能看到完整界面。目标是让整个页面在首屏（`100vh`）内完整显示，无需外层纵向滚动条。

## 根本原因分析

### 1. 布局链中的 min-height 层层传递

页面从 `html` → `body` → `#root` → `.app-container` → `.assistant-page` 构成了一个高度继承链：

```css
/* 全局 index.css */
html, body { height: 100%; }
#root       { height: 100%; }

/* App.css */
.app-container { min-height: 100%; }  /* ← 这里用了 min-height，允许撑开 */

/* AssistantPage/index.css */
.assistant-page { height: 100%; min-height: 100vh; }  /* ← 双重允许溢出 */
```

`min-height` 的含义是"至少这么高，不够可以更高"。当子元素内容超过视口高度时，`min-height` 不会截断，而是让容器继续撑大，这就是外层滚动条产生的根源。

### 2. 绝对定位元素未计入 flex 布局高度

```css
.assistant-main {
  display: flex;
  flex-direction: column;
  position: relative;
}

.assistant-chat-stage {
  flex: 1 1 auto;
  padding: 32px 24px 142px;  /* ← 底部 padding 是为 composer 预留的空间 */
}

.assistant-composer-shell {
  position: absolute;  /* ← 绝对定位，脱离文档流 */
  left: 0;
  right: 0;
  bottom: 0;
}
```

Composer 用了 `position: absolute`，脱离了 flex 布局。`chat-stage` 的 `padding-bottom: 142px` 是手动计算出来的"占位"，用来防止消息被 composer 遮挡。这种手动计算的方式容易出错，且一旦 composer 高度变化就需要同步调整 padding。

### 3. Welcome 区域强制撑高

```css
.assistant-welcome {
  min-height: calc(100vh - 260px);  /* ← 强制最小高度 */
}
```

这个值在 1080p 屏幕（可用高度 ≈ 900px）下等于 640px，加上顶部栏 42px 和 composer 约 120px，总高度 ≈ 800px，在笔记本 768px 分辨率下必然溢出。

## 解决方案

### 原则一：约束容器高度，用 `height` 而非 `min-height`

```css
/* 改前 */
.assistant-page { height: 100%; min-height: 100vh; }
.app-container { min-height: 100%; }

/* 改后 */
.assistant-page { height: 100vh; }
.app-container { height: 100%; }
```

`height` 是硬性约束，超出部分由 `overflow` 控制。`min-height` 是软性约束，允许内容撑开容器。

### 原则二：用盒模型计算，确保总高度 ≤ 100vh

将页面划分为三个区域：

```
┌──────────────────────────────┐
│  Topbar (flex: 0 0 44px)    │  ← 固定高度
├──────────────────────────────┤
│  Chat Stage (flex: 1 1 auto)│  ← 弹性填充，内部 overflow-y: auto
│  min-height: 0              │
│                              │
│  (Welcome 或 消息列表)       │
│                              │
├──────────────────────────────┤
│  Composer (absolute bottom)  │  ← 绝对定位吸附底部
│  padding: 0 34px 14px       │
│  + 内部 padding: 10px 8px   │
│  + textarea: 32px           │
│  + tools: 36px              │
│  ≈ 100px 总厚度             │
└──────────────────────────────┘
```

验证公式：`topbar + composer_thickness + welcome_content ≤ 100vh`

- `topbar`: 44px
- `composer`: 14 (shell bottom) + 10 (composer top) + 32 (textarea) + 8 (composer bottom) + 36 (tools) ≈ 100px
- 剩余给 welcome 的空间：`100vh - 144px`

### 原则三：移除强制 min-height，让内容自然撑开

```css
/* 改前 */
.assistant-welcome {
  min-height: calc(100vh - 260px);  /* 强制撑高 */
  gap: 26px;
}
.assistant-suggestion-pill {
  padding: 10px 18px;
  font-size: 15px;
}

/* 改后 */
.assistant-welcome {
  /* 移除 min-height */
  gap: 18px;
}
.assistant-suggestion-pill {
  padding: 8px 14px;
  font-size: 14px;
}
```

Welcome 区域由内容自然撑开，通过 flexbox 的 `justify-content: center` 在剩余空间内居中。

### 原则四：滚动发生在内部，而非外层

```css
.assistant-page {
  height: 100vh;
  overflow: hidden;        /* 外层禁止滚动 */
}

.assistant-chat-stage {
  flex: 1 1 auto;
  min-height: 0;           /* flex 子元素必须设置，否则不会收缩 */
  overflow-y: auto;        /* 内部允许滚动 */
}
```

关键点：`min-height: 0` 是 flex 子元素收缩的必要条件。Flex 子元素默认 `min-height: auto`，会阻止收缩到内容高度以下，导致内容溢出。

## 验证方法

### 1. 裸眼直接看

打开页面，看右侧是否有竖向滚动条。不依赖任何工具。

### 2. 窗口缩放测试

将浏览器窗口从大逐步拖小，记录首次出现滚动条时的窗口高度。这个值就是当前设计能适配的最小分辨率。

### 3. 盒模型计算（开发者视角）

在浏览器中打开 DevTools（F12），选中 `.assistant-page` 元素，在 Computed 面板中查看实际渲染高度。如果该值 = 视口高度（`window.innerHeight`），说明没有溢出。

在 Console 中执行：
```js
const page = document.querySelector('.assistant-page');
const viewport = window.innerHeight;
console.log('页面高度:', page.offsetHeight, '视口高度:', viewport, '溢出:', page.offsetHeight > viewport);
```

### 4. 设备模拟（推荐）

用 `Ctrl+Shift+M`（Chrome/Edge）打开设备模拟工具栏，选择 1366×768 或 1920×1080 等常见分辨率查看效果。这种方式 DevTools 内嵌在页面中，不会额外占用视口高度。

> ⚠️ **不要**用 F12 打开完整 DevTools 面板来判断是否溢出——DevTools 面板本身占用了 200-400px 的视口高度，会把原本不滚动的页面挤出滚动条。

## 关键 CSS 对照表

| 问题 | 错误写法 | 正确写法 |
|---|---|---|
| 容器高度约束 | `min-height: 100vh` | `height: 100vh; overflow: hidden` |
| 子元素弹性收缩 | 默认 `min-height: auto` | `min-height: 0` |
| 绝对定位占位 | 手动计算 padding-bottom | 统一计算 composer 厚度，确保 `padding-bottom` 精确匹配 |
| Welcome 区域 | `min-height: calc(100vh - Xpx)` | 移除 min-height，由 flex 自然分配 |
| 多处间距 | 各自独立设置，难以统一管理 | 用盒模型公式统一计算，确保总和 ≤ 100vh |

## 总结

首屏适配的核心不是"让东西变小"，而是**建立正确的约束链**：

1. 最外层用 `height`（硬约束）而非 `min-height`（软约束）
2. 只有需要滚动的内容区域设置 `overflow-y: auto`
3. Flex 子元素必须设置 `min-height: 0` 才能正确收缩
4. 绝对定位元素的高度要精确计算，并反映在相邻元素的 padding 中
5. 验证时排除 DevTools 面板自身的空间占用