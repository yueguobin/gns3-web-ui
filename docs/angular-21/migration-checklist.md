# Zoneless + Signals 迁移检查清单

> 创建日期: 2026-03-21
> 分支: `feature/zoneless-signals-migration`
> 基础分支: `master`

---

## 项目概况

### 技术栈
- **Angular 版本**: 21.0.0
- **Zone.js 版本**: 0.15.1
- **组件总数**: 253 个
- **服务总数**: 71 个

### 当前构建基准 (2026-03-21)
```
Initial chunk files | Names         |  Raw size
vendor.js           | vendor        |   8.55 MB
main.js             | main          |   6.02 MB
styles.css          | styles        | 631.85 kB
polyfills.js        | polyfills     | 120.59 kB  (包含 zone.js)
runtime.js          | runtime       |   6.79 kB
-----------------------------------------------
                    | Initial total |  15.32 MB
```

### 预期改进
- **包体积减少**: ~80-120 KB (移除 zone.js)
- **性能提升**: 更快的启动时间，更好的运行时性能
- **代码质量**: 更清晰的响应式数据流

---

## 代码分析结果

### NgZone 使用 (5 个文件) - P0 优先级
- [x] `src/app/services/toaster.service.ts`
- [ ] `src/app/services/xterm-context-menu.service.ts`
- [ ] `src/app/components/project-map/project-map.component.ts`
- [ ] `src/app/components/controllers/controllers.component.ts`
- [ ] `src/app/cartography/components/text-editor/text-editor.component.ts`

### @Input() 使用 (97 个组件) - P1/P2 优先级
需要迁移到 `input()` signal inputs

### ChangeDetectionStrategy 使用
- **已使用 OnPush**: ~90 个组件
- **使用 Default**: 1 个组件 (`topology-summary.component.ts`)
- **未明确指定**: ~162 个组件（需要添加 OnPush）

---

## 阶段 0: 准备阶段 ✅

- [x] 创建迁移分支 `feature/zoneless-signals-migration`
- [x] 代码分析完成
- [x] 记录构建基准
- [ ] 运行测试套件并记录结果
- [ ] 创建性能基准（Lighthouse）

---

## 阶段 1: NgZone 依赖清理 (3-5 天)

### 任务清单
- [ ] 1.1 `src/app/services/toaster.service.ts`
  - [ ] 移除 `NgZone` 依赖注入
  - [ ] 移除 `zone.run()` 包装
  - [ ] 直接调用 `snackbar.open()`
  - [ ] 测试 toast 通知功能

- [ ] 1.2 `src/app/services/xterm-context-menu.service.ts`
  - [ ] 分析 NgZone 使用情况
  - [ ] 移除 NgZone 依赖
  - [ ] 测试右键菜单功能

- [ ] 1.3 `src/app/components/project-map/project-map.component.ts`
  - [ ] 分析 NgZone 使用情况
  - [ ] 移除 NgZone 依赖
  - [ ] 确保 D3.js 回调正确触发更新

- [ ] 1.4 `src/app/components/controllers/controllers.component.ts`
  - [ ] 分析 NgZone 使用情况
  - [ ] 移除 NgZone 依赖
  - [ ] 测试控制器管理功能

- [ ] 1.5 `src/app/cartography/components/text-editor/text-editor.component.ts`
  - [ ] 分析 NgZone 使用情况
  - [ ] 移除 NgZone 依赖
  - [ ] 测试文本编辑功能

- [ ] 1.6 运行完整测试套件
- [ ] 1.7 提交代码: `git commit -m "feat: remove NgZone dependencies"`

---

## 阶段 2: 启用 Zoneless (1-2 天)

### 任务清单
- [ ] 2.1 `src/polyfills.ts`
  - [ ] 移除 `import 'zone.js';`
  - [ ] 移除 `import 'zone.js/testing';`（如果有）

- [ ] 2.2 `src/main.ts`
  - [ ] 添加 `provideZonelessChangeDetection()` 到 providers
  - [ ] 验证 bootstrap 配置

- [ ] 2.3 `src/test.ts`
  - [ ] 添加 `provideZonelessChangeDetection()` 到测试配置
  - [ ] 更新失败的测试

- [ ] 2.4 `angular.json`
  - [ ] 移除 `test.polyfills` 中的 `zone.js/testing`

- [ ] 2.5 `package.json`
  - [ ] 运行 `npm uninstall zone.js`
  - [ ] 验证依赖更新

- [ ] 2.6 验证构建
  - [ ] `npm run build`
  - [ ] 检查包体积减小
  - [ ] `ng test --watch=false`

- [ ] 2.7 提交代码: `git commit -m "feat: enable zoneless change detection"`

---

## 阶段 3: 核心组件迁移到 Signals (5-7 天)

### 高优先级组件

- [ ] 3.1 `src/app/app.component.ts`
  - [ ] 将 `darkThemeEnabled` 转换为 signal
  - [ ] 将 `componentCssClass` 转换为 computed signal
  - [ ] 迁移主题切换逻辑
  - [ ] 添加 `ChangeDetectionStrategy.OnPush`

- [ ] 3.2 `src/app/components/project-map/project-map.component.ts`
  - [ ] 迁移所有 `@Input()` 到 `input()`
  - [ ] 迁移所有 `@Output()` 到 `output()`
  - [ ] 添加 `ChangeDetectionStrategy.OnPush`
  - [ ] 将本地状态转换为 signals
  - [ ] 确保 D3.js 回调正确触发更新

- [ ] 3.3 `src/cartography/components/d3-map/d3-map.component.ts`
  - [ ] 迁移所有 `@Input()` 到 `input()`
  - [ ] 添加 `ChangeDetectionStrategy.OnPush`
  - [ ] 将 `settings`、`gridVisibility` 等转换为 signals
  - [ ] 迁移 D3.js 相关状态

- [ ] 3.4 `src/app/components/project-map/new-template-dialog/new-template-dialog.component.ts`
  - [ ] 迁移表单状态为 signals
  - [ ] 使用 `toSignal` 处理 Observable
  - [ ] 添加 `ChangeDetectionStrategy.OnPush`

- [ ] 3.5 `src/layouts/default-layout/default-layout.component.ts`
  - [ ] 迁移状态为 signals
  - [ ] 添加 `ChangeDetectionStrategy.OnPush`

- [ ] 3.6 `src/app/components/projects/projects.component.ts`
  - [ ] 迁移项目列表为 signals
  - [ ] 使用 `toSignal` 处理 HTTP Observable

- [ ] 3.7 `src/app/components/template/template.component.ts`
  - [ ] 迁移模板状态为 signals

- [ ] 3.8 `src/app/components/project-map/console-wrapper/console-wrapper.component.ts`
  - [ ] 迁移控制台状态为 signals

- [ ] 3.9 `src/app/components/project-map/ai-chat/ai-chat.component.ts`
  - [ ] 迁移聊天状态为 signals
  - [ ] 处理流式响应

- [ ] 3.10 `src/app/components/settings/settings.component.ts`
  - [ ] 迁移设置状态为 signals

---

## 阶段 4: 表单组件迁移 (3-4 天)

### 关键表单组件

- [ ] 4.1 `src/app/components/login/login.component.ts`
  - [ ] 确保表单更新触发变更检测
  - [ ] 连接 form observables 到 `ChangeDetectorRef.markForCheck()`

- [ ] 4.2 `src/app/components/user-management/add-user-dialog/add-user-dialog.component.ts`
  - [ ] 迁移表单验证状态为 signals

- [ ] 4.3 `src/app/components/user-management/edit-user-dialog/edit-user-dialog.component.ts`

- [ ] 4.4 `src/app/components/controllers/add-controller-dialog/add-controller-dialog.component.ts`

- [ ] 4.5 `src/app/components/projects/add-blank-project-dialog/add-blank-project-dialog.component.ts`

- [ ] 4.6 Preferences 对话框（约 40 个）
  - [ ] qemu 配置对话框
  - [ ] docker 配置对话框
  - [ ] virtualbox 配置对话框
  - [ ] vmware 配置对话框
  - [ ] 其他配置对话框

---

## 阶段 5: 服务层迁移 (4-5 天)

### 状态管理服务

- [ ] 5.1 `src/app/services/settings.service.ts`
  - [ ] 将设置状态转换为 signals
  - [ ] 提供 computed getters

- [ ] 5.2 `src/app/services/theme.service.ts`
  - [ ] 将主题状态转换为 signal
  - [ ] 使用 `effect()` 处理主题切换副作用

- [ ] 5.3 `src/app/services/tools.service.ts`
  - [ ] 将工具状态转换为 signals

- [ ] 5.4 `src/app/services/mapScale.service.ts`
  - [ ] 迁移缩放状态为 signals

- [ ] 5.5 `src/app/services/mapsettings.service.ts`
  - [ ] 迁移地图设置状态为 signals

- [ ] 5.6 `src/app/services/progress.service.ts`
  - [ ] 迁移进度状态为 signals

### HTTP 服务

- [ ] 5.7 `src/app/services/project.service.ts`
  - [ ] HTTP 调用保持 Observable（用于 `async` pipe）
  - [ ] 本地缓存使用 signals

- [ ] 5.8 `src/app/services/template.service.ts`
- [ ] 5.9 `src/app/services/node.service.ts`
- [ ] 5.10 `src/app/services/link.service.ts`
- [ ] 5.11 `src/app/services/snapshot.service.ts`
- [ ] 5.12 `src/app/services/controller.service.ts`
- [ ] 5.13 `src/app/services/user.service.ts`

---

## 阶段 6: 添加 OnPush 策略 (3-4 天)

### 批处理策略
按目录分批，每批 20-30 个组件

- [ ] 6.1 高频更新组件
  - [ ] 地图相关组件
  - [ ] 控制台组件
  - [ ] 日志组件

- [ ] 6.2 列表组件
  - [ ] 项目列表
  - [ ] 模板列表
  - [ ] 节点列表

- [ ] 6.3 表单组件
  - [ ] 所有配置对话框
  - [ ] 所有编辑表单

- [ ] 6.4 对话框组件
  - [ ] 所有确认对话框
  - [ ] 所有选择对话框

- [ ] 6.5 静态组件
  - [ ] 帮助对话框
  - [ ] 信息显示组件

---

## 阶段 7: 优化和调试 (2-3 天)

### 任务清单
- [ ] 7.1 添加开发时检查
  - [ ] 在 `src/main.ts` 中添加 `provideCheckNoChangesConfig({ exhaustive: true })`

- [ ] 7.2 性能优化
  - [ ] 移除不必要的 `detectChanges()` 调用
  - [ ] 优化 `effect()` 使用
  - [ ] 减少不必要的 computed signals

- [ ] 7.3 内存泄漏检查
  - [ ] 确保所有 `effect()` 正确清理
  - [ ] 检查订阅是否正确取消

- [ ] 7.4 代码审查
  - [ ] 检查是否有遗漏的 `@Input`/`@Output`
  - [ ] 确保没有使用 `NgZone`
  - [ ] 验证所有组件使用 `OnPush`

---

## 阶段 8: 测试和验证 (2-3 天)

### 单元测试
- [ ] 8.1 所有现有测试必须通过
- [ ] 8.2 更新使用 `fixture.detectChanges()` 的测试
- [ ] 8.3 添加 signals 相关测试

### 集成测试
- [ ] 8.4 测试主要用户流程
  - [ ] 项目创建和打开
  - [ ] 节点添加和配置
  - [ ] 链接创建
  - [ ] 控制台连接
  - [ ] 快照创建和恢复

### 性能测试
- [ ] 8.5 对比迁移前后的 Lighthouse 分数
- [ ] 8.6 测量包体积减小
- [ ] 8.7 测试内存使用

### 回归测试
- [ ] 8.8 手动测试所有核心功能
- [ ] 8.9 检查是否有 UI 不更新的问题

---

## 迁移后性能基准

### 构建大小目标
```
Initial chunk files | Names         |  Raw size | Expected
vendor.js           | vendor        |   8.55 MB | 8.47 MB (-80 KB)
main.js             | main          |   6.02 MB | 6.02 MB
styles.css          | styles        | 631.85 kB | 631.85 kB
polyfills.js        | polyfills     | 120.59 kB | ~20 KB (-100 KB)
runtime.js          | runtime       |   6.79 kB | 6.79 kB
-----------------------------------------------
                    | Initial total |  15.32 MB | ~15.22 MB (-100 KB)
```

### Lighthouse 目标
- Performance: +5-10 分
- FID (First Input Delay): -20-30%
- LCP (Largest Contentful Paint): -10-15%

---

## 风险缓解

### 高风险项
- [x] 识别 D3.js 地图组件更新问题
- [x] 识别 WebSocket 实时数据更新问题
- [x] 识别第三方库兼容性问题

### 测试策略
- [ ] 每个阶段完成后运行测试套件
- [ ] 每个阶段完成后手动测试核心功能
- [ ] 每个阶段完成后提交代码

---

## 提交规范

每个阶段完成后，使用以下提交格式：

```bash
# Phase 1
git commit -m "feat: remove NgZone dependencies

- Remove NgZone from toaster.service.ts
- Remove NgZone from xterm-context-menu.service.ts
- Remove NgZone from project-map.component.ts
- Remove NgZone from controllers.component.ts
- Remove NgZone from text-editor.component.ts

All tests passing. Ready for zoneless enablement."

# Phase 2
git commit -m "feat: enable zoneless change detection

- Remove zone.js from polyfills.ts
- Add provideZonelessChangeDetection to main.ts
- Update test configuration for zoneless
- Remove zone.js dependency from package.json

Build successful. Bundle size reduced by ~100KB."

# Phase 3+
git commit -m "feat: migrate [component-name] to signals

- Convert @Input to input() signals
- Convert @Output to output() signals
- Add ChangeDetectionStrategy.OnPush
- Convert local state to signals

Component migrated successfully."
```

---

## 进度追踪

- **开始日期**: 2026-03-21
- **预计完成**: TBD
- **当前阶段**: Phase 0 - 准备阶段

### 完成情况
- Phase 0: █░░░░░░░░░ 10%
- Phase 1: ░░░░░░░░░░ 0%
- Phase 2: ░░░░░░░░░░ 0%
- Phase 3: ░░░░░░░░░░ 0%
- Phase 4: ░░░░░░░░░░ 0%
- Phase 5: ░░░░░░░░░░ 0%
- Phase 6: ░░░░░░░░░░ 0%
- Phase 7: ░░░░░░░░░░ 0%
- Phase 8: ░░░░░░░░░░ 0%

**总体进度**: █░░░░░░░░░ 1.25%

---

## 参考资源

- [Angular Zoneless Guide](https://angular.dev/guide/zoneless)
- [Angular Signals Guide](https://angular.dev/guide/signals)
- [Signal Forms Migration](https://angular.dev/guide/forms/signals/migration)
- [RxJS Interop](https://angular.dev/ecosystem/rxjs-interop)
