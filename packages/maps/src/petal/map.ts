import type {
  Bounds,
  ILngLat,
  IMercator,
  IPoint,
  IStatusOptions,
  IViewport,
  MapStyleConfig,
  MapStyleName,
  Point,
} from '@antv/l7-core';
import { MapServiceEvent } from '@antv/l7-core';
import { MercatorCoordinate } from '@antv/l7-map';
import { DOM } from '@antv/l7-utils';
import { mat4, vec3 } from 'gl-matrix';
import Viewport from '../lib/web-mercator-viewport';
import BaseMapService from '../utils/BaseMapService';
import PetalMapLoader from './maploader';

type CallbackMap = Map<string, Map<(...args: any[]) => any, (...args: any[]) => any>>;

const PETAL_MAP_TOKEN = 'DQEDAD1uMZ0F69eNhmcLlqbB4w6NDtDUi4l2PlXdfoY7xVJaJrlAFg5BrUbHIPglTyNXkdksd1JkhyFzDmm6BoA5gxkGPPquJHquLw==';
const DEFAULT_CENTER: [number, number] = [121.30654632240122, 31.25744185633306];
const DEFAULT_ZOOM = 5;

const EventMap: Record<string, string | string[]> = {
  mapmove: ['movestart', 'moveend'],
  camerachange: ['moveend', 'onZoomChanged', 'onHeadingChanged', 'onCenterChanged'],
  zoomchange: 'onZoomChanged',
  dragging: 'pointerdrag',
  contextmenu: 'contextmenu',
  click: 'click',
  dblclick: 'dblclick',
  singleclick: 'singleclick',
  pointermove: 'pointermove',
  pointerdown: 'pointerdown',
  pointerup: 'pointerup',
};

const STYLE_CONFIG: MapStyleConfig = {
  standard: 'standard',
  night: 'night',
  simple: 'simple',
};

export default class PetalMapService extends BaseMapService<any> {
  protected viewport: IViewport | null = null;
  protected evtCbProxyMap: CallbackMap = new Map();
  protected currentStyle: MapStyleName = 'standard';
  private cameraEventHandlers: Map<string, () => void> = new Map();
  private overlayContainer: HTMLElement | null = null;

  public getType(): string {
    return 'petalmap';
  }

  public getMapStyle(): MapStyleName {
    return this.currentStyle;
  }

  public getMapStyleConfig(): MapStyleConfig {
    return STYLE_CONFIG;
  }

  public async init(): Promise<void> {
    this.viewport = new Viewport();

    const {
      id,
      mapInstance,
      center = DEFAULT_CENTER,
      zoom = DEFAULT_ZOOM,
      minZoom,
      maxZoom,
      mapSize = 10000,
      token = PETAL_MAP_TOKEN,
      accessToken,
      authOptions,
      ...rest
    } = this.config;

    this.simpleMapCoord.setSize(mapSize);

    let sdk: any;

    if (!mapInstance) {
      sdk = await PetalMapLoader.load();
    } else {
      sdk = (window as any).HWMapJsSDK;
    }

    if (mapInstance) {
      this.map = mapInstance;
      this.$mapContainer = this.map.getDiv?.() ?? null;
    } else {
      if (!id) {
        throw Error('No container id specified');
      }
      const mapContainer = DOM.getContainer(id)!;

      // 按优先级获取 token: token > accessToken > authOptions.accessToken
      const resolvedAccessToken = token ?? accessToken ?? authOptions?.accessToken;

      // 如果没有提供 token，抛出错误要求用户提供
      if (!resolvedAccessToken) {
        throw new Error(
          'Petal Maps access token is required. Please provide `token` in map config. ' +
          'You can get an access token from Huawei Developer Console: https://developer.huawei.com/consumer/cn/service/josp/agc/index.html'
        );
      }

      // 如果使用的是默认的 demo token，给出警告
      if (resolvedAccessToken === PETAL_MAP_TOKEN) {
        console.warn(
          '%cPetal Maps: Using default demo token. For production use, please:\n' +
          '1. Get your own token from: https://developer.huawei.com/consumer/cn/service/josp/agc/index.html\n' +
          '2. Provide your token in map config: { token: "your_token_here" }',
          'color: #ff6b35; font-weight: bold; font-size: 12px;'
        );
      }

      const mapOptions: Record<string, any> = {
        ...rest,
        zoom,
        minZoom,
        maxZoom,
        center: this.createLatLng(center),
        authOptions: {
          accessToken: resolvedAccessToken,
        },
      };

      const HWMapCtor = sdk?.HWMap ?? (window as any).HWMapJsSDK?.HWMap;
      if (typeof HWMapCtor !== 'function') {
        throw new Error(
          'HWMapJsSDK.HWMap constructor is not available. Please confirm that the Petal Maps SDK script is reachable and that the access token is valid.',
        );
      }
      this.map = new HWMapCtor(mapContainer, mapOptions);
      this.$mapContainer = this.map.getDiv?.() ?? mapContainer;
    }

    this.bindCameraEvents();

    this.addMarkerContainer();

    // 等待地图加载完成后再启用交互
    this.waitForMapReady().then(() => {
      this.enableMapInteractions();
      // Ensure viewport sync at start
      this.handleCameraChanged();
    });
  }

  public destroy(): void {
    this.detachCameraEvents();
    this.eventEmitter.removeAllListeners();
    this.evtCbProxyMap.clear();

    if (this.map) {
      if (typeof this.map.destroy === 'function') {
        this.map.destroy();
      } else if (typeof this.map.remove === 'function') {
        this.map.remove();
      }
    }

    this.$mapContainer = null;
    if (this.overlayContainer) {
      this.overlayContainer.parentNode?.removeChild(this.overlayContainer);
      this.overlayContainer = null;
    }
    // @ts-ignore
    this.map = undefined;
  }

  public onCameraChanged(callback: (viewport: IViewport) => void): void {
    this.cameraChangedCallback = callback;
  }

  public addMarkerContainer(): void {
    const container = this.getContainer();
    if (!container) {
      return;
    }
    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    this.markerContainer = DOM.create('div', 'l7-marker-container', container);
    this.markerContainer.setAttribute('tabindex', '-1');
    this.markerContainer.style.position = 'absolute';
    this.markerContainer.style.top = '0';
    this.markerContainer.style.left = '0';
    this.markerContainer.style.width = '100%';
    this.markerContainer.style.height = '100%';
    this.markerContainer.style.zIndex = '2';
    // 确保 marker 容器不阻挡地图交互
    this.markerContainer.style.pointerEvents = 'none';
  }

  private enableMapInteractions(): void {
    // 根据 Petal Maps 文档，确保地图交互功能启用
    // 注意：Petal Maps 的大部分交互功能默认是启用的，这里主要是确保没有被意外禁用
    if (this.map) {
      // 设置双指旋转为启用（文档显示默认为 true）
      if (typeof this.map.setPinchRotate === 'function') {
        this.map.setPinchRotate(true);
      }

      // 确保控件不显示（避免干扰 L7 的控制）
      if (typeof this.map.setNavigationControl === 'function') {
        this.map.setNavigationControl(false);
      }
      if (typeof this.map.setZoomControl === 'function') {
        this.map.setZoomControl(false);
      }
      if (typeof this.map.setRotateControl === 'function') {
        this.map.setRotateControl(false);
      }
      if (typeof this.map.setScaleControl === 'function') {
        this.map.setScaleControl(false);
      }
      if (typeof this.map.setLocationControl === 'function') {
        this.map.setLocationControl(false);
      }
      if (typeof this.map.setCopyrightControl === 'function') {
        this.map.setCopyrightControl(false);
      }
    }
  }

  private async waitForMapReady(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) {
        resolve();
        return;
      }

      // 检查地图是否已经加载完成
      const checkReady = () => {
        // 如果地图有 getZoom 方法且能正常返回值，说明已经加载完成
        if (typeof this.map?.getZoom === 'function' &&
          typeof this.map?.getCenter === 'function') {
          try {
            const zoom = this.map.getZoom();
            const center = this.map.getCenter();
            if (zoom !== undefined && center !== undefined) {
              resolve();
              return;
            }
          } catch (error) {
            // 如果还没有准备好，继续等待
          }
        }

        // 如果还没有准备好，延迟检查
        setTimeout(checkReady, 100);
      };

      // 立即检查一次
      checkReady();
    });
  }

  public getContainer(): HTMLElement | null {
    return this.map?.getDiv?.() ?? null;
  }

  public getOverlayContainer(): HTMLElement | undefined {
    if (this.overlayContainer) {
      return this.overlayContainer;
    }
    const container = this.getContainer();
    if (!container) {
      return undefined;
    }
    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    const overlay = DOM.create('div', 'l7-overlay-container', container);
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '3';
    this.overlayContainer = overlay;
    return overlay;
  }

  public getCanvasOverlays(): HTMLElement | null {
    return this.getOverlayContainer() ?? null;
  }

  public getMapCanvasContainer(): HTMLElement {
    return this.getContainer() ?? (this.$mapContainer as HTMLElement);
  }

  public getSize(): [number, number] {
    if (typeof this.map?.getSize === 'function') {
      const size = this.map.getSize();
      if (Array.isArray(size)) {
        return [Number(size[0]) || 0, Number(size[1]) || 0];
      }
      if (size && typeof size === 'object') {
        const width = Number((size as any).width ?? (size as any)[0]) || 0;
        const height = Number((size as any).height ?? (size as any)[1]) || 0;
        if (width && height) {
          return [width, height];
        }
      }
    }

    const container = this.getContainer();
    return [
      container?.clientWidth ?? 0,
      container?.clientHeight ?? 0,
    ];
  }

  public getZoom(): number {
    return Number(this.map?.getZoom?.()) || 0;
  }

  public setZoom(zoom: number): void {
    this.map?.setZoom?.(zoom);
  }

  public getCenter(): ILngLat {
    const [lng, lat] = this.normalizeLngLat(this.map?.getCenter?.());
    return { lng, lat };
  }

  public setCenter(lnglat: [number, number]): void {
    if (typeof this.map?.setCenter === 'function') {
      this.map.setCenter(this.createLatLng(lnglat));
      return;
    }
    if (typeof this.map?.panTo === 'function') {
      this.map.panTo(this.createLatLng(lnglat));
    }
  }

  public getPitch(): number {
    if (typeof this.map?.getTilt === 'function') {
      return Number(this.map.getTilt()) || 0;
    }
    if (typeof this.map?.getPitch === 'function') {
      return Number(this.map.getPitch()) || 0;
    }
    return 0;
  }

  public setPitch(pitch: number): void {
    if (typeof this.map?.setTilt === 'function') {
      this.map.setTilt(pitch);
    } else if (typeof this.map?.setPitch === 'function') {
      this.map.setPitch(pitch);
    }
  }

  public getRotation(): number {
    if (typeof this.map?.getHeading === 'function') {
      return Number(this.map.getHeading()) || 0;
    }
    return 0;
  }

  public setRotation(rotation: number): void {
    if (typeof this.map?.setHeading === 'function') {
      this.map.setHeading(rotation);
    }
  }

  public getBounds(): Bounds {
    const bounds = this.map?.getBounds?.();
    if (bounds) {
      if (typeof bounds.getSouthWest === 'function' && typeof bounds.getNorthEast === 'function') {
        const sw = this.normalizeLngLat(bounds.getSouthWest());
        const ne = this.normalizeLngLat(bounds.getNorthEast());
        return [
          [sw[0], sw[1]],
          [ne[0], ne[1]],
        ];
      }
      if (Array.isArray(bounds)) {
        const sw = this.normalizeLngLat(bounds[0]);
        const ne = this.normalizeLngLat(bounds[1]);
        return [
          [sw[0], sw[1]],
          [ne[0], ne[1]],
        ];
      }
    }
    const [lng, lat] = this.normalizeLngLat(this.map?.getCenter?.());
    return [
      [lng, lat],
      [lng, lat],
    ];
  }

  public getMinZoom(): number {
    return Number(this.map?.getMinZoom?.()) || 0;
  }

  public getMaxZoom(): number {
    return Number(this.map?.getMaxZoom?.()) || 20;
  }

  public zoomIn(option?: any, eventData?: any): void {
    // 根据 Petal Maps 文档，zoomIn() 方法不需要参数
    this.map?.zoomIn?.();
  }

  public zoomOut(option?: any, eventData?: any): void {
    // 根据 Petal Maps 文档，zoomOut() 方法不需要参数
    this.map?.zoomOut?.();
  }

  public panTo(p: [number, number]): void {
    this.map?.panTo?.(this.createLatLng(p));
  }

  public panBy(x: number = 0, y: number = 0): void {
    this.map?.panBy?.(x, y);
  }

  public fitBounds(bound: Bounds, fitBoundsOptions?: any): void {
    const bounds = this.createBounds(bound);
    if (bounds && typeof this.map?.fitBounds === 'function') {
      this.map.fitBounds(bounds, fitBoundsOptions);
      return;
    }
    if (typeof this.map?.panToBounds === 'function') {
      this.map.panToBounds(this.boundsToArray(bound));
      return;
    }
    if (typeof this.map?.setFitView === 'function') {
      const points = bound.map((coordinate) => this.createLatLng(coordinate));
      this.map.setFitView(points, fitBoundsOptions);
    }
  }

  public setMaxZoom(max: number): void {
    this.map?.setMaxZoom?.(max);
  }

  public setMinZoom(min: number): void {
    this.map?.setMinZoom?.(min);
  }

  public setMapStatus(option: Partial<IStatusOptions>): void {
    if (!option) {
      return;
    }
    (Object.keys(option) as Array<keyof IStatusOptions>).forEach((statusKey) => {
      const value = option[statusKey];
      if (value === undefined) {
        return;
      }
      switch (statusKey) {
        case 'rotateEnable':
          // Petal Maps 使用 setPinchRotate 控制双指旋转
          if (typeof this.map?.setPinchRotate === 'function') {
            this.map.setPinchRotate(value);
          }
          break;
        case 'zoomEnable':
          // 控制缩放功能
          if (typeof this.map?.setZoomControl === 'function') {
            this.map.setZoomControl(value);
          }
          if (typeof this.map?.setZoomSlider === 'function') {
            this.map.setZoomSlider(value);
          }
          break;
        case 'doubleClickZoom':
          // Petal Maps 文档中没有明确的双击缩放控制方法
          // 可能需要通过事件监听来实现
          break;
        case 'dragEnable':
          // Petal Maps 文档中没有明确的拖拽控制方法
          // 地图拖拽默认启用
          break;
        case 'keyboardEnable':
          // Petal Maps 文档中没有明确的键盘控制方法
          break;
        case 'resizeEnable':
          if (value && typeof this.map?.resize === 'function') {
            this.map.resize();
          }
          break;
        case 'showIndoorMap':
          // Petal Maps 文档中没有明确的室内地图控制方法
          break;
        default:
          break;
      }
    });
  }

  public setZoomAndCenter(zoom: number, center: [number, number]): void {
    this.map?.setZoom?.(zoom);
    this.setCenter(center);
  }

  public setMapStyle(name: MapStyleName): void {
    const styleValue = this.getMapStyleValue(name);
    if (typeof this.map?.setPresetStyleId === 'function') {
      this.map.setPresetStyleId(styleValue);
    } else if (typeof this.map?.setStyleId === 'function') {
      this.map.setStyleId(styleValue);
    } else if (typeof this.map?.setStyle === 'function') {
      this.map.setStyle(styleValue);
    }
    this.currentStyle = styleValue;
  }

  public meterToCoord(center: [number, number], outer: [number, number]): number {
    const centerMercator = MercatorCoordinate.fromLngLat({
      lng: center[0],
      lat: center[1],
    });
    const outerMercator = MercatorCoordinate.fromLngLat({
      lng: outer[0],
      lat: outer[1],
    });
    const coordDistance = Math.sqrt(
      Math.pow(centerMercator.x - outerMercator.x, 2) +
      Math.pow(centerMercator.y - outerMercator.y, 2),
    );
    const earthRadius = 6378137;
    const radLat1 = (center[1] * Math.PI) / 180;
    const radLat2 = (outer[1] * Math.PI) / 180;
    const a = radLat1 - radLat2;
    const b = ((center[0] - outer[0]) * Math.PI) / 180;
    const s =
      2 *
      Math.asin(
        Math.sqrt(
          Math.pow(Math.sin(a / 2), 2) +
          Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2),
        ),
      );
    const meterDistance = s * earthRadius;
    if (!meterDistance) {
      return 1;
    }
    return (coordDistance * 4194304 * 2) / meterDistance;
  }

  public pixelToLngLat([x, y]: Point): ILngLat {
    if (typeof this.map?.fromScreenLocation === 'function') {
      const latLng = this.map.fromScreenLocation({ x, y });
      const [lng, lat] = this.normalizeLngLat(latLng);
      return { lng, lat };
    }
    return this.getCenter();
  }

  public lngLatToPixel([lng, lat]: Point): IPoint {
    if (typeof this.map?.toScreenLocation === 'function') {
      const point = this.map.toScreenLocation(this.createLatLng([lng, lat]));
      return {
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
      };
    }
    const center = this.getCenter();
    return {
      x: lng - center.lng,
      y: lat - center.lat,
    };
  }

  public containerToLngLat([x, y]: Point): ILngLat {
    return this.pixelToLngLat([x, y]);
  }

  public lngLatToContainer([lng, lat]: Point): IPoint {
    return this.lngLatToPixel([lng, lat]);
  }

  public lngLatToCoord([lng, lat]: [number, number]): [number, number] {
    if (!this.viewport) {
      return [lng, lat];
    }
    const flat = (this.viewport as Viewport).projectFlat([lng, lat]);
    return [flat[0], -flat[1]];
  }

  public lngLatToCoords(list: number[][] | number[][][]): any {
    return list.map((item) =>
      Array.isArray(item[0])
        ? this.lngLatToCoords(item as Array<[number, number]>)
        : this.lngLatToCoord(item as [number, number]),
    );
  }

  public lngLatToMercator(lnglat: [number, number], altitude: number): IMercator {
    const { x = 0, y = 0, z = 0 } = MercatorCoordinate.fromLngLat(lnglat, altitude);
    return { x, y, z };
  }

  public getModelMatrix(
    lnglat: [number, number],
    altitude: number,
    rotate: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    origin: IMercator = { x: 0, y: 0, z: 0 },
  ): number[] {
    const modelAsMercatorCoordinate = MercatorCoordinate.fromLngLat(
      {
        lng: lnglat[0],
        lat: lnglat[1],
      },
      altitude,
    );
    const meters = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();
    const modelMatrix = mat4.create();

    mat4.translate(
      modelMatrix,
      modelMatrix,
      vec3.fromValues(
        modelAsMercatorCoordinate.x - origin.x,
        modelAsMercatorCoordinate.y - origin.y,
        (modelAsMercatorCoordinate.z || 0) - origin.z,
      ),
    );

    mat4.scale(
      modelMatrix,
      modelMatrix,
      vec3.fromValues(meters * scale[0], -meters * scale[1], meters * scale[2]),
    );

    mat4.rotateX(modelMatrix, modelMatrix, rotate[0]);
    mat4.rotateY(modelMatrix, modelMatrix, rotate[1]);
    mat4.rotateZ(modelMatrix, modelMatrix, rotate[2]);

    return modelMatrix as unknown as number[];
  }

  public exportMap(type: 'jpg' | 'png'): string {
    const container = this.getContainer();
    const canvas = container?.querySelector('canvas') as HTMLCanvasElement | null;
    if (canvas) {
      return type === 'jpg' ? canvas.toDataURL('image/jpeg') : canvas.toDataURL('image/png');
    }
    return '';
  }

  public on(type: string, handle: (...args: any[]) => void): void {
    if (MapServiceEvent.indexOf(type) !== -1) {
      this.eventEmitter.on(type, handle);
      return;
    }
    const rawEvents = EventMap[type] || type;
    const events = Array.isArray(rawEvents) ? rawEvents : [rawEvents];
    events
      .filter(Boolean)
      .forEach((eventName) => this.bindEvent(eventName as string, type, handle));
  }

  public off(type: string, handle: (...args: any[]) => void): void {
    if (MapServiceEvent.indexOf(type) !== -1) {
      this.eventEmitter.off(type, handle);
      return;
    }

    const rawEvents = EventMap[type] || type;
    const events = Array.isArray(rawEvents) ? rawEvents : [rawEvents];
    events.forEach((eventName) => {
      const cbProxy = this.evtCbProxyMap.get(eventName);
      const handleProxy = cbProxy?.get(handle);
      if (handleProxy && typeof this.map?.un === 'function') {
        this.map.un(eventName, handleProxy);
      } else if (handleProxy && typeof this.map?.off === 'function') {
        this.map.off(eventName, handleProxy);
      }
      cbProxy?.delete(handle);
    });
  }

  protected handleCameraChanged = () => {
    PetalMapService.syncViewport(this);
  };

  private static syncViewport(service?: PetalMapService) {
    if (!service || !service.viewport) {
      return;
    }

    if (!service.map) {
      return;
    }

    if (typeof service.getSize !== 'function') {
      return;
    }

    let size: [number, number] | undefined;
    try {
      size = service.getSize();
    } catch (error) {
      console.warn('PetalMapService: unable to read size from map instance', error);
      return;
    }
    if (!Array.isArray(size) || size.length < 2) {
      return;
    }
    const [width, height] = size;
    if (typeof width !== 'number' || typeof height !== 'number') {
      return;
    }
    if (width <= 0 || height <= 0) {
      return;
    }

    service.emit('mapchange');

    const [lng, lat] = service.normalizeLngLat(service.map?.getCenter?.());
    const bearing = typeof service.getRotation === 'function' ? service.getRotation() : 0;
    const pitch = typeof service.getPitch === 'function' ? service.getPitch() : 0;
    const rawZoom = typeof service.getZoom === 'function' ? service.getZoom() : undefined;
    // Petal Maps 的缩放级别不需要调整，直接使用原始值
    const zoom = typeof rawZoom === 'number' ? rawZoom : 0;

    service.viewport.syncWithMapCamera({
      center: [lng, lat],
      viewportHeight: height,
      viewportWidth: width,
      bearing,
      pitch,
      zoom,
      cameraHeight: 0,
    } as any);

    service.updateCoordinateSystemService();
    service.cameraChangedCallback?.(service.viewport);
  }

  private bindEvent(eventName: string, originType: string, handle: (...args: any[]) => void) {
    let cbProxyMap = this.evtCbProxyMap.get(eventName);
    if (!cbProxyMap) {
      cbProxyMap = new Map();
      this.evtCbProxyMap.set(eventName, cbProxyMap);
    }
    if (cbProxyMap.get(handle)) {
      return;
    }

    const handleProxy = (...args: any[]) => {
      const event = args[0];
      if (event && typeof event === 'object') {
        if (!event.lngLat) {
          const [lng, lat] = this.extractEventLngLat(event);
          event.lngLat = { lng, lat };
        }
        if (!event.lnglat && event.lngLat) {
          event.lnglat = event.lngLat;
        }
      }
      handle(...args);
    };

    cbProxyMap.set(handle, handleProxy);
    if (typeof this.map?.on === 'function') {
      this.map.on(eventName, handleProxy);
    }
    if (typeof (this.map as any)?.addEventListener === 'function') {
      (this.map as any).addEventListener(eventName, handleProxy);
    }
  }

  private bindCameraEvents() {
    // 根据 Petal Maps 文档绑定相机事件
    this.registerCameraEvent('movestart');
    this.registerCameraEvent('moveend');

    const service = this;

    // 使用 Petal Maps 特有的回调方法
    if (typeof this.map?.onZoomChanged === 'function') {
      const handler = () => PetalMapService.syncViewport(service);
      this.map.onZoomChanged(handler);
      this.cameraEventHandlers.set('onZoomChanged', handler);
    }

    if (typeof this.map?.onCenterChanged === 'function') {
      const handler = () => PetalMapService.syncViewport(service);
      this.map.onCenterChanged(handler);
      this.cameraEventHandlers.set('onCenterChanged', handler);
    }

    if (typeof this.map?.onHeadingChanged === 'function') {
      const handler = () => PetalMapService.syncViewport(service);
      this.map.onHeadingChanged(handler);
      this.cameraEventHandlers.set('onHeadingChanged', handler);
    }
  }

  private registerCameraEvent(eventName: string) {
    if (typeof this.map?.on !== 'function') {
      return;
    }
    const service = this;
    const handler = () => PetalMapService.syncViewport(service);
    this.map.on(eventName, handler);
    this.cameraEventHandlers.set(eventName, handler);
  }

  private detachCameraEvents() {
    this.cameraEventHandlers.forEach((handler, eventName) => {
      if (typeof this.map?.un === 'function') {
        this.map.un(eventName, handler);
      } else if (typeof this.map?.off === 'function') {
        this.map.off(eventName, handler);
      } else if (typeof (this.map as any)?.removeEventListener === 'function') {
        (this.map as any).removeEventListener(eventName, handler);
      }
    });
    this.cameraEventHandlers.clear();
  }

  private normalizeLngLat(value: any): [number, number] {
    if (!value) {
      return [...DEFAULT_CENTER];
    }
    if (typeof value.lng === 'function' && typeof value.lat === 'function') {
      return [Number(value.lng()) || 0, Number(value.lat()) || 0];
    }
    if ('lng' in value && 'lat' in value) {
      return [Number(value.lng) || 0, Number(value.lat) || 0];
    }
    if ('longitude' in value && 'latitude' in value) {
      return [Number(value.longitude) || 0, Number(value.latitude) || 0];
    }
    if (Array.isArray(value) && value.length >= 2) {
      return [Number(value[0]) || 0, Number(value[1]) || 0];
    }
    if ('x' in value && 'y' in value) {
      return [Number(value.x) || 0, Number(value.y) || 0];
    }
    return [...DEFAULT_CENTER];
  }

  private createLatLng(lnglat: [number, number] | { lng: number; lat: number }) {
    const [lng, lat] = Array.isArray(lnglat) ? lnglat : [lnglat.lng, lnglat.lat];
    const sdk = (window as any).HWMapJsSDK;
    if (sdk?.LatLng) {
      return new sdk.LatLng(lat, lng);
    }
    if (sdk?.HWLatLng) {
      return new sdk.HWLatLng(lat, lng);
    }
    if (sdk?.HWMapUtils?.createLatLng) {
      return sdk.HWMapUtils.createLatLng(lat, lng);
    }
    return { lng, lat };
  }

  private createBounds(bound: Bounds) {
    const sdk = (window as any).HWMapJsSDK;
    if (sdk?.LatLngBounds) {
      const [sw, ne] = bound;
      return new sdk.LatLngBounds(this.createLatLng(sw), this.createLatLng(ne));
    }
    return null;
  }

  private boundsToArray(bound: Bounds): [number, number, number, number] {
    const [sw, ne] = bound;
    return [sw[0], sw[1], ne[0], ne[1]];
  }

  private extractEventLngLat(event: any): [number, number] {
    if (!event) {
      return [...DEFAULT_CENTER];
    }
    if (event.latLng) {
      return this.normalizeLngLat(event.latLng);
    }
    if (event.position) {
      return this.normalizeLngLat(event.position);
    }
    if (event.coordinate && (window as any).HWMapJsSDK?.HWMapUtils?.epsgToLatLng) {
      const latLng = (window as any).HWMapJsSDK.HWMapUtils.epsgToLatLng(event.coordinate);
      return this.normalizeLngLat(latLng);
    }
    if (event.pixel && typeof this.map?.fromScreenLocation === 'function') {
      return this.normalizeLngLat(this.map.fromScreenLocation(event.pixel));
    }
    return this.normalizeLngLat(this.map?.getCenter?.());
  }
}
