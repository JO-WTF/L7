# Petal 适配教程

本文以教程形式系统说明 `packages/maps/src/petal` 目录中各模块的职责、关键函数以及它们与 Huawei Petal Maps JS SDK 的适配方式。文中提到的“适配层”指的是一组位于 L7 与第三方地图 SDK 之间的中间代码：上层仍然按照 L7 的标准接口工作，下层则由适配层把这些请求翻译成 Petal SDK 可识别的调用，并把 Petal 的变化再同步回 L7。按照以下步骤可构建或维护一套稳定的 Petal 适配层。

## 适配原理

### 核心服务：PetalMapService

- **接口转译**：L7 通过 `MapService` 统一管理缩放、平移、事件、坐标转换等能力；`PetalMapService` 逐一实现这些接口，并在内部调用 Petal SDK，对 zoom 偏移、`LatLng` 与 `[lng, lat]` 互转等差异做适配。
- **摄像机同步与视口计算**：WebMercator 是 L7 的摄像机模型。Petal 底图产生的 move/zoom/heading 事件会由 `bindCameraEvents` 和 `syncViewport` 统一处理，转换成 L7 需要的中心点、缩放和旋转数据，再推动图层更新；反向调用 `setCenter`、`setZoom` 等接口时，也会把 L7 的变更同步到底图。
- **事件桥接**：L7 的 `click`、`mapmove` 等事件名称与 Petal 原生事件不同，`EventMap` 先建立映射，`bindEvent` 在 Petal 事件触发时补齐 `lngLat` 并回调给 L7，使业务代码始终面对统一的事件语义。
- **容器与 overlay 管理**：`addMarkerContainer`、`getOverlayContainer` 等函数在底图 DOM 上创建 marker/overlay 容器，并处理定位与层级，使 L7 的自定义图层、Marker、Canvas overlay 可以正确叠加在 Petal 地图之上。
- **能力兼容与回退**：构造 `HWMapJsSDK.LatLng`、设置地图样式 (`setMapStyle`) 以及执行 `fitBounds` 等操作时，都会检测 Petal SDK 版本差异，必要时提供降级或显式报错，保证不同版本下都可用。

### SDK 生命周期：PetalMapLoader

- `maploader.ts` 统一处理 SDK 的加载、状态机与重置：`load` 负责插入脚本、串联并发 Promise，`waitForSDKReady` 轮询 SDK 是否挂载，`flushSuccess/Failure` 广播结果，`reset` 支持卸载脚本与重置状态。借助该模块，`PetalMapService` 可以专注于业务逻辑，而不必直接操控脚本注入。

## 前置条件

- 理解 L7 对 `MapService` 与 `MapWrapper` 的能力约定。
- 准备可用的 Petal Maps access token（仓库自带的 demo token 仅用于本地验证）。
- 运行环境需具备浏览器能力，以满足 SDK 对 `window` 的依赖。

## Step 1：模块概览

1. `map.ts`：实现 `PetalMapService`，继承 `BaseMapService`，负责把 L7 的标准接口转译为 Petal SDK 调用。L7 场景会通过统一的地图服务接口请求缩放、平移、事件订阅等能力，而 Petal SDK 提供的原生 API 与 L7 约定并不一致，因此需要一个服务层来做“翻译”和状态同步。`PetalMapService` 逐一覆盖 L7 期望的函数，再调用 Petal SDK 完成实际操作，并生成视口信息、接管摄像机事件、管理 overlay 容器等，从而让 Petal 地图能够像其他底图一样被 L7 驱动，是整个适配层的核心。
2. `maploader.ts`：按需加载 Petal SDK，维护脚本状态与回调队列，确保只加载一次并可重置。由于 Petal JS SDK 以远程脚本形式提供，`maploader.ts` 在首次需要 Petal 地图时动态插入 `<script>`，并在脚本真正就绪后统一唤醒所有等待的 Promise。如果脚本失效或需要切换 token，可调用 `reset()` 清理现场并重新加载。
3. `index.ts`：暴露 `PetalMapWrapper`，继承 `BaseMapWrapper`，在 L7 场景中注册 `PetalMapService`。`MapWrapper` 是 L7 连接外部地图实现的入口，`PetalMapWrapper` 只需返回 `PetalMapService` 构造器，L7 就能在创建场景时自动实例化该服务，因此该文件负责把 Petal 适配层挂接到 L7 的插件体系。

## Step 2：加载 SDK（maploader.ts）

1. `getSDK()`：检测 `window.HWMapJsSDK` 是否存在且具备 `HWMap` 构造器，若已存在则直接复用。
2. `load(options?: IPetalLoaderOptions)`：
   - 解析 `url`（默认 `https://mapapi.cloud.huawei.com/mapjs/v1/mapkit.js`）。
   - 若 SDK 已就绪立即 resolve；若之前加载失败则直接 reject（提示先执行 `reset()`）。
   - 将本次 Promise 推入 `callbacks` 队列，统一等待脚本回调。
   - 首次调用时动态创建 `<script>`，绑定 `onload` 触发 `waitForSDKReady()`，`onerror` 调用 `flushFailure()`。
3. `waitForSDKReady(attempt = 0)`：脚本 onload 后循环检查 `HWMapJsSDK` 是否挂载，间隔 50ms、最多 40 次。成功时 `flushSuccess(sdk)`，超时则 `flushFailure(error)`。
4. `reset()`：移除已注入的 Petal 脚本、删除 `window.HWMapJsSDK` 并将 `status` 重置为 `NotLoaded`。
5. `LoadStatus`、`callbacks`、`MAX_READY_CHECK_ATTEMPTS`、`READY_CHECK_INTERVAL`：组成加载状态机，避免重复注入或 Promise 悬挂。

完成此步后，`PetalMapService.init` 可安全调用 `PetalMapLoader.load()`。

## Step 3：注册 Wrapper（index.ts）

- `PetalMapWrapper.getServiceConstructor()` 返回 `PetalMapService`，`BaseMapWrapper` 会据此创建具体服务实例，实现与 L7 核心的对接。

## Step 4：实现核心服务（map.ts）

以下按“基础工具 → 生命周期 → 容器尺寸 → 摄像机与状态 → 交互 → 坐标与三维 → 事件 → 其他能力”的顺序说明关键函数。

### 4.1 基础常量与工具

- `CallbackMap`：维护 Petal 原生事件和 L7 事件之间的代理函数映射。
- `EventMap`：描述 L7 事件名到 Petal 事件/方法的映射（如 `camerachange` 依赖 `onZoomChanged`、`onHeadingChanged` 等）。
- `STYLE_CONFIG`、`ZOOM_OFFSET`：分别定义可用样式和 L7 与 Petal 缩放级别的偏移（Petal 多 1 级）。
- `LatLng` 构造逻辑：通过 `HWMapJsSDK.LatLng` 统一创建 SDK 所需的经纬度对象，与官方 API 保持一致。
- `createBounds(bound)`、`boundsToArray(bound)`：在新旧 SDK 接口间转换 L7 的 `Bounds`。

### 4.2 生命周期

1. `getType()`：返回 `'PetalMap'`，供上层识别底图类型。
2. `getMapStyle()` / `getMapStyleConfig()`：分别返回当前样式和可选样式集合。
3. `init()`：
   - 创建 `Viewport`，配置 `simpleMapCoord`，解析 `token`、`center`、`zoom`、`minZoom`、`maxZoom` 等参数。
   - 调用 `PetalMapLoader.load()` 或复用传入的 `mapInstance`。
   - 校验容器 `id` 与 access token；若使用 demo token 则输出警告。
   - 对所有 zoom 相关配置应用 `ZOOM_OFFSET`，随后构造 `HWMap`。
   - 执行 `bindCameraEvents()`、`addMarkerContainer()`，并在 `waitForMapReady()` 之后调用 `enableMapInteractions()` 与 `handleCameraChanged()`。
4. `destroy()`：解绑摄像机事件、清空 `evtCbProxyMap`、移除 overlay 容器并释放 `this.map`。
5. `onCameraChanged(callback)`：登记摄像机变化回调，在 `syncViewport` 后触发。
6. `enableMapInteractions()`：配置 Petal 的控件状态，满足 L7 的交互设定。
7. `waitForMapReady()`：轮询 `getZoom()`/`getCenter()` 是否可用，避免在地图未就绪时继续执行。

### 4.3 容器与尺寸

- `addMarkerContainer()`：在底图 DOM 内创建 `l7-marker-container`，设置绝对定位与 `pointer-events: none`。
- `getContainer()`：返回底图主容器，供 overlay 使用。
- `getOverlayContainer()` / `getCanvasOverlays()`：懒加载 `l7-overlay-container`，用于挂载 Canvas 或自定义覆盖物。
- `getMapCanvasContainer()`：提供底图 Canvas 所在的容器。
- `getSize()`：优先使用 Petal `getSize()`，若不可用则回退到容器 `clientWidth/Height`。

### 4.4 摄像机与状态

- `getZoom()` / `setZoom()` / `setZoomAndCenter()`：在输入输出阶段统一处理 `ZOOM_OFFSET`。
- `getCenter()` / `setCenter()`：直接使用 Petal 提供的 `LatLng` 实例与 L7 的 `[lng, lat]` 参数互转，保证输入输出格式统一。
- `getPitch()`：固定返回 `0`，表示当前不支持自定义俯仰。
- `getRotation()` / `setRotation()`：对应 Petal 的 `heading`。
- `getBounds()`：兼容 `LatLngBounds`、数组或中心点。
- `getMinZoom()` / `getMaxZoom()`：结合 Petal 支持范围与 `ZOOM_OFFSET` 输出。
- `setMapStatus()`：按照 `rotateEnable`、`zoomEnable`、`resizeEnable` 等配置 Petal 的交互能力。
- `setMapStyle(name)`：解析样式值并依次尝试 `setPresetStyleId`、`setStyleId` 或 `setStyle`。

### 4.5 交互控制

- `zoomIn()` / `zoomOut()`：直接调用 Petal 内置方法。
- `panTo(lnglat)`：将 L7 坐标转换为 Petal `LatLng` 后调用 `panTo`。
- `panBy(x, y)`：按像素偏移执行平移。
- `fitBounds(bound, fitBoundsOptions)`：优先使用 `LatLngBounds` 的 `fitBounds`，否则回退为 `panToBounds` 或 `setFitView`。

### 4.6 坐标与三维

- `meterToCoord(center, outer)`：结合 `MercatorCoordinate.fromLngLat` 与球面距离，将真实米数换算成屏幕坐标距离。
- `pixelToLngLat(point)` / `lngLatToPixel(lnglat)`：通过 `fromScreenLocation` / `toScreenLocation` 执行像素与经纬度互转。
- `containerToLngLat()` / `lngLatToContainer()`：与像素转换保持一致，方便 overlay、marker 使用。
- `lngLatToCoord()` / `lngLatToCoords()`：使用 `Viewport.projectFlat` 将经纬度投影到 L7 平面坐标系（Y 轴取反）。
- `lngLatToMercator()`：返回 `MercatorCoordinate.fromLngLat` 得到的 `{ x, y, z }`。
- `getModelMatrix()`：在墨卡托空间内构建模型矩阵，处理平移、按真实米数缩放与三轴旋转，供 3D 图层使用。

### 4.7 事件与摄像机同步

- `on(type, handle)`：若事件属于 `MapServiceEvent` 则交由内部 `eventEmitter`，否则根据 `EventMap` 注册到 Petal 事件，并使用 `bindEvent()` 建立代理。
- `off(type, handle)`：查找代理函数后执行 `map.un` 解绑，同时清理 `evtCbProxyMap`。
- `bindEvent(eventName, originType, handle)`：在回调参数中补充 `lngLat`/`lnglat` 字段，统一事件数据结构。
- `handleCameraChanged()`：触发 `PetalMapService.syncViewport(this)`。
- `PetalMapService.syncViewport(service)`：读取中心、尺寸、旋转、缩放等信息，调用 `viewport.syncWithMapCamera()`，随后触发 `mapchange` 并执行 `cameraChangedCallback`。
- `bindCameraEvents()`：注册 `movestart`、`moveend` 及 `onZoomChanged`、`onCenterChanged`、`onHeadingChanged` 等回调，统一通过 `requestAnimationFrame` 触发同步。
- `registerCameraEvent(eventName)` 与 `detachCameraEvents()`：负责摄像机事件的注册与销毁阶段清理。

### 4.8 其他能力

- `getMapCanvasContainer()`：为直接访问底图 Canvas 的场景提供 DOM 入口。
- `exportMap(type)`：查找容器内的 `<canvas>`，输出 `image/png` 或 `image/jpeg` 的 Data URL。

## Step 5：常见注意事项

1. **Token 优先级**：`init()` 始终按 `token > accessToken > authOptions.accessToken` 的顺序解析，并在使用默认 token 时给出警告。
2. **缩放偏移**：所有与 zoom 相关的函数都必须使用 `ZOOM_OFFSET`，新增接口时需遵循同一策略。
3. **事件扩展**：新增事件时应先更新 `EventMap` 映射，再依赖 `bindEvent()` 以保持统一的事件对象。
4. **容器定位**：`addMarkerContainer()` 与 `getOverlayContainer()` 会在容器为 `position: static` 时改为 `relative`，如发现 overlay 定位问题可先检查此逻辑。
5. **SDK 兼容性**：`LatLng` 构造、`setMapStyle()`、`fitBounds()` 等关键接口都实现了新旧 API 的回退，升级 SDK 时只需在这些位置追加分支。

按上述步骤即可完成 Petal Maps 与 L7 的对接。SDK 由 loader 统一管理，`PetalMapService` 负责对齐视角、交互、坐标与事件接口，整体适配层具备良好的可维护性与扩展空间。
