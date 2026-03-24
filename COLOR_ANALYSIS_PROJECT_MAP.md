# Project Map 颜色分析与重构规划

## 📊 当前状态分析

### 1. 已使用的 MD3 颜色变量

#### 主要颜色角色
| 变量 | 使用位置 | 用途 | 代码行 |
|------|---------|------|--------|
| `--mat-sys-primary` | node hover, titlebar 背景, 选中元素 | 主题色 | 18, 50, 332, 355, 356 |
| `--mat-sys-on-primary` | titlebar 前景, 分割线, 选中图标 | 主题色上的文字 | 51, 70, 103, 106 |
| `--mat-sys-surface` | 主背景, 菜单背景 | 表面背景 | 22, 235, 259 |
| `--mat-sys-on-surface` | 文字, 图标, 标签, 链接 | 表面上的内容 | 27, 31, 39, 157, 178, 350, 419, 464 |
| `--mat-sys-surface-container` | toolbar 背景, 菜单 hover | 表面容器 | 122, 407 |
| `--mat-sys-primary-container` | AI 按钮状态 | 主色容器 | (project-map-menu) |
| `--mat-sys-outline-variant` | 边框, 分割线 | 轮廓变体 | 216, 301 |
| `--mat-sys-shadow` | 阴影效果 | 阴影 | 55, 124, 246, 267, 311 |
| `--mat-sys-error` | 错误状态, 链接 hover | 错误色 | 342, 346 |

### 2. 硬编码颜色（需要重构）

#### 2.1 链接颜色
| 位置 | 当前颜色 | 用途 | 建议变量 |
|------|---------|------|---------|
| :34 | `#800000` | 串行链接 | `--mat-sys-tertiary` 或自定义 |
| :30 | `#000000` (选择器) | 以太网链接 | 已用 `--mat-sys-on-surface` |
| :459 | `#ff0000` | console 高亮链接 | `--mat-sys-error` |
| :423 | `#ff0000` | console 高亮阴影 | `--mat-sys-error` |
| :440 | `#0000ff` | console 已连接高亮 | `--mat-sys-primary` |

#### 2.2 内联样式（HTML）
| 位置 | 当前颜色 | 用途 | 建议变量 |
|------|---------|------|---------|
| project-map-menu.html:64 | `stroke: white` | 暗色主题线条 | `--mat-sys-on-surface-variant` |
| project-map-menu.html:84 | `stroke: black` | 亮色主题线条 | `--mat-sys-on-surface` |

### 3. 颜色混合使用情况

#### 阴影效果
```scss
// 标准阴影 (20%)
color-mix(in srgb, var(--mat-sys-shadow) 20%, transparent)

// 轻阴影 (15%)
color-mix(in srgb, var(--mat-sys-shadow) 15%, transparent)

// 重阴影 (25%)
color-mix(in srgb, var(--mat-sys-shadow) 25%, transparent)
```

#### 分割线/边框
```scss
// titlebar 内部分割线
color-mix(in srgb, var(--mat-sys-on-primary) 20%, transparent)

// 选中状态背景
color-mix(in srgb, var(--mat-sys-on-primary) 15%, transparent)
```

---

## 🎨 设计系统规划

### 颜色层次结构

```
Project Map 页面
├── 主要区域
│   ├── 背景层 (--mat-sys-surface)
│   ├── 画布层 (继承背景)
│   └── 内容层 (--mat-sys-on-surface)
│
├── 顶部标题栏
│   ├── 背景: --mat-sys-primary
│   ├── 前景: --mat-sys-on-primary
│   └── 分割线: color-mix(--mat-sys-on-primary, 20%)
│
├── 左侧工具栏
│   ├── 背景: --mat-sys-surface-container
│   ├── 前景: --mat-sys-on-surface
│   └── 分割线: --mat-sys-outline-variant
│
└── 交互元素
    ├── 选中状态: --mat-sys-primary / --mat-sys-primary-container
    ├── 悬停状态: --mat-sys-error (链接)
    ├── 错误状态: --mat-sys-error
    └── 高亮状态: --mat-sys-error (console)
```

### 推荐的 MD3 变量映射

#### 功能元素颜色
| 元素类型 | 推荐变量 | 说明 |
|---------|---------|------|
| 主背景 | `--mat-sys-surface` | 页面主要背景 |
| 次要背景 | `--mat-sys-surface-container` | 工具栏、浮动面板 |
| 主要文字 | `--mat-sys-on-surface` | 一般文字和图标 |
| 次要文字 | `--mat-sys-on-surface-variant` | 辅助信息 |
| 主题背景 | `--mat-sys-primary` | 标题栏、品牌元素 |
| 主题文字 | `--mat-sys-on-primary` | 主题背景上的文字 |
| 选中状态 | `--mat-sys-primary-container` | 选中元素背景 |
| 选中文字 | `--mat-sys-on-primary-container` | 选中状态文字 |
| 边框 | `--mat-sys-outline-variant` | 分割线、边框 |
| 错误 | `--mat-sys-error` | 错误提示、高亮 |
| 错误文字 | `--mat-sys-on-error` | 错误背景上的文字 |

#### 链接类型颜色
| 链接类型 | 推荐变量 | 替代方案 |
|---------|---------|---------|
| 以太网链接 | `--mat-sys-on-surface` | 保持当前 |
| 串行链接 | `--mat-sys-tertiary` | 或自定义 `--gns3-serial-link` |
| 选中的链接 | `--mat-sys-primary` | 保持当前 |
| 悬停的链接 | `--mat-sys-error` | 保持当前 |
| Console 高亮 | `--mat-sys-error` | 保持当前 |
| Console 已连接 | `--mat-sys-primary` | 保持当前 |

---

## 🔧 重构计划

### 阶段 1: 修复硬编码颜色（高优先级）

#### 1.1 修复 HTML 内联样式
**文件**: `project-map-menu.component.html`

```html
<!-- 修改前 -->
<svg height="40" width="40">
  <line style="stroke: white; stroke-width: 2" />
</svg>

<!-- 修改后 -->
<svg height="40" width="40">
  <line class="draw-line-icon" style="stroke-width: 2" />
</svg>
```

**对应的 CSS**:
```scss
// 暗色主题
.draw-line-icon {
  stroke: var(--mat-sys-on-surface-variant);
}

// 或使用 CSS 变量控制
:root {
  --gns3-draw-line-color: var(--mat-sys-on-surface-variant);
}
```

#### 1.2 修复串行链接颜色
**文件**: `project-map.component.scss:34`

```scss
// 修改前
path.serial_link[stroke="#800000"] {
  stroke: #800000;
}

// 修改后
path.serial_link {
  stroke: var(--mat-sys-tertiary);
}

// 或使用自定义语义化变量
path.serial_link {
  stroke: var(--gns3-serial-link-color);
}
```

#### 1.3 修复 Console 高亮颜色
**文件**: `project-map.component.scss:423, 440, 459`

```scss
// 修改前
g.node.console-highlight {
  filter: drop-shadow(0 0 5px #ff0000);
}

g.node.console-highlight-connected {
  filter: drop-shadow(0 0 3px #0000ff);
}

path.serial_link.selected, .console-highlight > path.ethernet_link,
.console-highlight > path.serial_link {
  stroke: #ff0000;
}

// 修改后
g.node.console-highlight {
  filter: drop-shadow(0 0 5px var(--mat-sys-error));
}

g.node.console-highlight-connected {
  filter: drop-shadow(0 0 3px var(--mat-sys-primary));
}

path.serial_link.selected, .console-highlight > path.ethernet_link,
.console-highlight > path.serial_link {
  stroke: var(--mat-sys-error);
}
```

### 阶段 2: 统一边框和分割线（中优先级）

**目标**: 所有边框使用一致的混合比例

```scss
// 定义语义化变量
:root {
  // 边框透明度级别
  --gns3-border-opacity-subtle: 8%;
  --gns3-border-opacity-normal: 12%;
  --gns3-border-opacity-strong: 20%;

  // 阴影透明度级别
  --gns3-shadow-opacity-subtle: 10%;
  --gns3-shadow-opacity-normal: 15%;
  --gns3-shadow-opacity-strong: 20%;
  --gns3-shadow-opacity-heavy: 25%;
}

// 统一使用
.titlebar-divider {
  border-color: color-mix(
    in srgb,
    var(--mat-sys-on-primary),
    var(--gns3-border-opacity-normal)
  );
}

.toolbar-divider {
  border-color: var(--mat-sys-outline-variant);
}

.box-shadow-subtle {
  box-shadow: 0 1px 3px color-mix(
    in srgb,
    var(--mat-sys-shadow),
    var(--gns3-shadow-opacity-normal)
  );
}

.box-shadow-normal {
  box-shadow: 0 2px 8px color-mix(
    in srgb,
    var(--mat-sys-shadow),
    var(--gns3-shadow-opacity-strong)
  );
}

.box-shadow-strong {
  box-shadow: 0 4px 16px color-mix(
    in srgb,
    var(--mat-sys-shadow),
    var(--gns3-shadow-opacity-heavy)
  );
}
```

### 阶段 3: 优化选中状态（中优先级）

**当前问题**: 选中状态在不同区域使用不同的颜色方案

**统一方案**:
```scss
// 为不同背景定义选中状态
.selection-on-surface {
  background: var(--mat-sys-primary-container);
  color: var(--mat-sys-on-primary-container);
}

.selection-on-primary {
  background: color-mix(
    in srgb,
    var(--mat-sys-on-primary),
    var(--gns3-selection-opacity)
  );
  color: var(--mat-sys-on-primary);
}

// 应用到具体元素
#project-titlebar {
  .selected {
    @extend .selection-on-primary;
  }
}

#project-toolbar {
  .selected {
    @extend .selection-on-surface;
  }
}
```

### 阶段 4: 添加语义化变量（低优先级）

为 GNS3 特定的功能添加语义化的颜色变量：

```scss
// 在全局样式文件中定义
:root {
  // 链接颜色
  --gns3-link-ethernet: var(--mat-sys-on-surface);
  --gns3-link-serial: var(--mat-sys-tertiary);
  --gns3-link-selected: var(--mat-sys-primary);
  --gns3-link-hover: var(--mat-sys-error);

  // Console 状态
  --gns3-console-highlight: var(--mat-sys-error);
  --gns3-console-connected: var(--mat-sys-primary);

  // 界面元素
  --gns3-titlebar-bg: var(--mat-sys-primary);
  --gns3-titlebar-fg: var(--mat-sys-on-primary);
  --gns3-toolbar-bg: var(--mat-sys-surface-container);
  --gns3-toolbar-fg: var(--mat-sys-on-surface);

  // 透明度级别
  --gns3-opacity-subtle: 0.08;
  --gns3-opacity-normal: 0.12;
  --gns3-opacity-strong: 0.20;
}
```

---

## 📋 实施检查清单

### ✅ 已完成
- [x] default-layout toolbar 使用 CSS 变量
- [x] project-map titlebar 使用 primary 颜色方案

### 🔄 待实施

#### 阶段 1 - 紧急修复
- [ ] 修复 project-map-menu.html 中的内联颜色（白色/黑色线条）
- [ ] 修复串行链接硬编码颜色 (#800000)
- [ ] 修复 console 高亮硬编码颜色 (#ff0000, #0000ff)

#### 阶段 2 - 统一边框
- [ ] 定义统一的边框透明度变量
- [ ] 统一所有 box-shadow 的混合比例
- [ ] 统一所有 border 的使用

#### 阶段 3 - 优化选中状态
- [ ] 为不同背景定义统一的选中状态样式
- [ ] 应用到 titlebar 和 toolbar

#### 阶段 4 - 语义化变量
- [ ] 定义 GNS3 语义化颜色变量
- [ ] 替换直接的 MD3 变量为语义化变量

---

## 🎯 预期收益

### 一致性提升
- ✅ 所有颜色使用 CSS 变量，无硬编码
- ✅ 统一的透明度和混合比例
- ✅ 语义化的变量命名，易于维护

### 可维护性提升
- ✅ 主题切换更容易
- ✅ 颜色修改只需更改变量定义
- ✅ 更清晰的代码意图

### 可访问性提升
- ✅ 使用 MD3 确保对比度符合标准
- ✅ 支持亮色/暗色主题自动适配

---

## 📝 注意事项

1. **向后兼容**: 确保修改后的视觉效果与当前保持一致
2. **测试覆盖**: 在亮色和暗色主题下都要测试
3. **渐进式重构**: 按阶段逐步实施，避免大规模变更
4. **文档更新**: 每个阶段完成后更新组件文档

---

**生成时间**: 2026-03-24
**分析范围**: project-map.component.scss, project-map-menu.component.scss/html
**MD3 版本**: Material Design 3
