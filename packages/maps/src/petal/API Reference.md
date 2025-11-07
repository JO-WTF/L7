# HWMap

**更新时间：2025-10-09 19:36**

## 概述

API 中的核心类，用来加载一张地图。

---

## 构造函数

---

函数 描述

---

`HWMapJsSDK.HWMap(div, mapOptions)` 加载地图。`<br>`{=html}**div**：填充地图容器。`<br>`{=html}**mapOptions**：设置地图属性，详情见
`MapOptions`。

---

---

## 方法

---

方法 描述 参数类型 返回值

---

`fitBounds(bounds)` 设置地图显示区域范围。 `LatLngBounds` \-

`fromScreenLocation(pixel)` 屏幕坐标转经纬度。地图加载完成后使用。`<br>`{=html}`pixel = {x, y}``<br>`{=html}x：横坐标偏移像素数；y：纵坐标偏移像素数。 `{x: Number, y: Number}` `LatLng`

`getBounds()` 获取地图显示区域。 \- `LatLngBounds`

`getCenter()` 获取地图中心点坐标。 \- `LatLng`

`getDiv()` 获取装载地图的容器。 \- `div` 容器

`getHeading()` 获取地图朝向。 \- `Number`（表示与正北夹角）

`getMapType()` 获取地图类型。 \- `String`

`getOpacity()` 获取地图不透明度。 \- `Number`

`getPoi(pixel)` 获取当前位置的 POI 数据。`<br>`{=html}`pixel`：\[x, y\]，屏幕像素点坐标。 `[Number, Number]` 返回 POI 信息（位置与属性）

`getSize()` 获取地图大小。 \- `[width, height]`（Number
数组）

`getZoom()` 获取地图缩放级别。 \- `Number`

`panBy(x, y)` 将地图中心点偏移 `(x, y)`。 `x, y: Number` \-

`panTo(latLng)` 地图中心移动到指定坐标点。 `LatLng` \-

`panToBounds(latLngBounds)` 移动地图以包含指定坐标区域。 `[lng1, lat1, lng2, lat2]` \-

`resize()` 重新计算地图容器大小。 \- \-

`setCenter(latlng)` 设置地图中心点。 `LatLng` \-

`setCopyrightControl(enabled)` 是否显示版权信息。 `Boolean` (`true` 显示 / `false` 关闭) \-

`setFitView(points, options?)` 根据输入经纬度数组计算最优视角。 `points: Array<LatLng>``<br>`{=html}`options?: FitViewOptions` \-

`setHeading(heading)` 设置地图朝向，取值范围 `[0, 360]`。 `Number` \-

`setLocationControl(enabled)` 是否显示当前位置按钮。 `Boolean` \-

`setLogoPosition(logoPosition)` 设置 Petal Maps Logo 位置。可选值：`BOTTOM_LEFT`（默认）、`BOTTOM_RIGHT`、`TOP_LEFT`、`TOP_RIGHT`。 `String` \-

`setMapType(mapType)` 设置地图类型：`ROADMAP`、`TERRAIN`、`SATELLITE`、`HYBRID`。 `String` \-

`setNavigationControl(enabled)` 是否显示平移按钮。 `Boolean` \-

`setOpacity(opacity)` 设置地图不透明度 `[0, 1]`。 `Number` \-

`setPinchRotate(disabled)` 设置双指旋转是否可用（默认 `true`）。 `Boolean` \-

`setPresetStyleId(presetStyleId)` 设置预置地图样式（`standard`、`night`、`simple`）。 `String` \-

`setPreviewId(previewId)` 通过预览 ID 设置自定义地图样式。 `String` \-

`setRotateControl(enabled)` 是否显示指北针。 `Boolean` \-

`setScaleControl(enabled)` 是否显示比例尺。 `Boolean` \-

`setStyle(styles)` 使用 JSON 文件设置自定义地图样式。 `JSON 数组` \-

`setStyleId(styleId)` 通过样式 ID 设置自定义地图样式。 `String` \-

`setTitle(title)` 设置地图容器的提示信息。 `String` \-

`setZoom(zoom)` 设置地图缩放级别，取值范围 `[minZoom, maxZoom]`。 `Number` \-

`setZoomControl(enabled)` 是否显示缩放按钮。 `Boolean` \-

`setZoomSlider(enabled)` 是否显示缩放条。 `Boolean` \-

`toScreenLocation(latlng)` 经纬度转屏幕坐标。地图加载完成后使用。 `LatLng` `{x, y}`

`zoomIn()` 地图放大一级。 \- \-

`zoomOut()` 地图缩小一级。 \- \-

`on(event, callback)` 注册事件监听。 `event: String``<br>`{=html}`callback: Function` \-

`onCenterChanged(callback)` 地图中心点改变。 `Function` \-

`onHeadingChanged(callback)` 地图方向改变。 `Function` \-

`onZoomChanged(callback)` 缩放级别改变。 `Function` \-

`un(event, callback)` 解绑事件监听。 `event: String``<br>`{=html}`callback: Function` \-

---

---

## 事件

---

事件 描述 用法 说明

---

`click` 鼠标左键点击（与 `dblclick` `map.on('click', callback)` `event.coordinate`：墨卡托3857坐标，可用
冲突）。 `HWMapJsSDK.HWMapUtils.epsgToLatLng()`
转换为经纬度。`<br>`{=html}`event.pixel`：屏幕像素坐标。

`contextmenu` 鼠标右键点击。 `map.on('contextmenu', callback)` \-

`dblclick` 鼠标左键双击。 `map.on('dblclick', callback)` \-

`singleclick` 鼠标左键单击（延迟 `map.on('singleclick', callback)` \-
250ms，避免与双击冲突）。

`pointermove` 鼠标移动。 `map.on('pointermove', callback)` \-

`pointerdown` 鼠标按下。 `map.on('pointerdown', callback)` \-

`pointerup` 鼠标松开。 `map.on('pointerup', callback)` \-

`pointerdrag` 地图拖动。 `map.on('pointerdrag', callback)` \-

`movestart` 地图开始移动。 `map.on('movestart', callback)` \-

`moveend` 地图结束移动。 `map.on('moveend', callback)` \-

`onCenterChanged` 地图中心点改变。 `map.onCenterChanged(callback)` \-

`onHeadingChanged` 地图方向改变。 `map.onHeadingChanged(callback)` \-

`onZoomChanged` 缩放级别改变。 `map.onZoomChanged(callback)` \-

---

---

## AuthOptions

参数 是否必选 参数类型 描述

---

`accessToken` 是 `String` AT。

---

## CopyrightControlOptions

---

参数 是否必选 参数类型 描述

---

`value` 是 `String` 支持文本或 HTML 元素，包括
`<font>`、`<a>`、`<img>`
标签。

---

---

## MapOptions

---

参数 是否必选 参数类型 描述

---

`authOptions` 否 `AuthOptions` 设置 AT。

`center` 是 `LatLng` 地图中心点。

`copyrightControl` 否 `Boolean` 是否显示版权，默认 `false`。

`copyrightControlOptions` 否 `CopyrightControlOptions` 设置版权内容。

`language` 否 `String` 设置语言，推荐使用 BCP 47 语言码。

`locationControl` 否 `Boolean` 是否显示当前位置按钮，默认 `false`。

`logoPosition` 否 `String` 设置 Logo 位置（`BOTTOM_LEFT` 默认）。

`mapType` 否 `String` 地图类型：`ROADMAP`、`TERRAIN`、`SATELLITE`、`HYBRID`。

`maxZoom` 否 `Number` 最大缩放级别 `[2, 20]`（默认 20）。

`minZoom` 否 `Number` 最小缩放级别 `[2, 20]`（默认 2）。

`navigationControl` 否 `Boolean` 是否显示平移按钮。

`presetStyleId` 否 `String` 设置预置地图样式（`standard`、`night`、`simple`）。

`rotateControl` 否 `Boolean` 是否显示指北针。

`scaleControl` 否 `Boolean` 是否显示比例尺。

`sourceType` 否 `String` 加载瓦片类型：`vector` 或 `raster`（默认 `vector`）。

`zoom` 是 `Number` 初始化缩放级别。

`zoomSlider` 否 `Boolean` 是否显示缩放条（默认 `false`）。

`zoomControl` 否 `Boolean` 是否显示缩放按钮（默认 `true`）。

`rasterPreload` 否 `Boolean` 矢量图是否支持栅格预加载（默认 `true`）。

---

---

## ScaleControlOptions

---

参数 是否必选 参数类型 描述

---

`units` 否 `String` 比例尺单位：`imperial`（英制）、`nautical`（海里）、`metric`（默认公制）。

---
