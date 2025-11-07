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

const PETAL_MAP_TOKEN =
  'DQEDAD1uMZ0F69eNhmcLlqbB4w6NDtDUi4l2PlXdfoY7xVJaJrlAFg5BrUbHIPglTyNXkdksd1JkhyFzDmm6BoA5gxkGPPquJHquLw==';
const DEFAULT_CENTER: [number, number] = [121.30654632240122, 31.25744185633306];
const DEFAULT_ZOOM = 5;
const ZOOM_OFFSET = 1;

const EventMap: Record<string, string | string[]> = {
  mapmove: ['movestart', 'moveend'],
  camerachange: ['moveend', 'onZoomChanged', 'onHeadingChanged', 'onCenterChanged'],
  zoomchange: 'onZoomChanged',
  dragging: 'pointerdrag',
  contextmenu: 'contextmenu',
  click: 'click',
  dblclick: 'dblclick',
  singleclick: 'singleclick',
  mousemove: 'pointermove',
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
    return 'PetalMap';
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
      this.$mapContainer = this.map.getDiv() ?? null;
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
            'You can get an access token from Huawei Developer Console: https://developer.huawei.com/consumer/cn/service/josp/agc/index.html',
        );
      }

      // 如果使用的是默认的 demo token，给出警告
      if (resolvedAccessToken === PETAL_MAP_TOKEN) {
        console.warn(
          '%cPetal Maps: Using default demo token. For production use, please:\n' +
            '1. Get your own token from: https://developer.huawei.com/consumer/cn/service/josp/agc/index.html\n' +
            '2. Provide your token in map config: { token: "your_token_here" }',
          'color: #ff6b35; font-weight: bold; font-size: 12px;',
        );
      }

      const resolvedZoom = typeof zoom === 'number' ? zoom + ZOOM_OFFSET : zoom;
      const resolvedMinZoom = typeof minZoom === 'number' ? minZoom + ZOOM_OFFSET : minZoom;
      const resolvedMaxZoom = typeof maxZoom === 'number' ? maxZoom + ZOOM_OFFSET : maxZoom;

      const mapOptions: Record<string, any> = {
        ...rest,
        zoom: resolvedZoom,
        minZoom: resolvedMinZoom,
        maxZoom: resolvedMaxZoom,
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
      this.$mapContainer = this.map.getDiv() ?? mapContainer;
    }

    this.bindCameraEvents();

    this.addMarkerContainer();

    // 等待地图加载完成后再启用交互
    this.waitForMapReady().then(() => {
      this.enableMapInteractions();
      this.handleCameraChanged();
    });
  }

  public destroy(): void {
    this.detachCameraEvents();
    this.eventEmitter.removeAllListeners();
    this.evtCbProxyMap.clear();

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
    if (!container) return;

    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    this.markerContainer = DOM.create('div', 'l7-marker-container', container);
    this.markerContainer.setAttribute('tabindex', '-1');
    Object.assign(this.markerContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      zIndex: '2',
      pointerEvents: 'none',
    });
  }

  private enableMapInteractions(): void {
    this.map?.setPinchRotate(true);
    this.map?.setNavigationControl(false);
    this.map?.setZoomControl(false);
    this.map?.setRotateControl(false);
    this.map?.setScaleControl(false);
    this.map?.setLocationControl(false);
    this.map?.setCopyrightControl(false);
  }

  private async waitForMapReady(): Promise<void> {
    if (!this.map) return;

    return new Promise((resolve) => {
      const checkReady = () => {
        try {
          if (this.map.getZoom() !== undefined && this.map.getCenter() !== undefined) {
            resolve();
            return;
          }
        } catch (error) {
          // 继续等待
        }
        setTimeout(checkReady, 100);
      };
      checkReady();
    });
  }

  public getContainer(): HTMLElement | null {
    return this.map?.getDiv() ?? null;
  }

  public getOverlayContainer(): HTMLElement | undefined {
    if (this.overlayContainer) return this.overlayContainer;

    const container = this.getContainer();
    if (!container) return undefined;

    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    const overlay = DOM.create('div', 'l7-overlay-container', container);
    Object.assign(overlay.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '3',
    });
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
    const size = this.map?.getSize();
    if (Array.isArray(size)) return [Number(size[0]) || 0, Number(size[1]) || 0];
    if (size && typeof size === 'object') {
      const width = Number((size as any).width ?? (size as any)[0]) || 0;
      const height = Number((size as any).height ?? (size as any)[1]) || 0;
      if (width && height) return [width, height];
    }
    const container = this.getContainer();
    return [container?.clientWidth ?? 0, container?.clientHeight ?? 0];
  }

  public getZoom(): number {
    const rawZoom = this.map?.getZoom();
    return typeof rawZoom === 'number' && !Number.isNaN(rawZoom) ? rawZoom - ZOOM_OFFSET : 0;
  }

  public setZoom(zoom: number): void {
    this.map?.setZoom(typeof zoom === 'number' && !Number.isNaN(zoom) ? zoom + ZOOM_OFFSET : zoom);
  }

  public getCenter(): ILngLat {
    const [lng, lat] = this.normalizeLngLat(this.map?.getCenter());
    return { lng, lat };
  }

  public setCenter(lnglat: [number, number]): void {
    this.map?.setCenter(this.createLatLng(lnglat));
  }

  public getPitch(): number {
    return 0;
  }

  public getRotation(): number {
    return Number(this.map?.getHeading()) || 0;
  }

  public setRotation(rotation: number): void {
    this.map?.setHeading(rotation);
  }

  public getBounds(): Bounds {
    const bounds = this.map?.getBounds();
    if (bounds?.getSouthWest && bounds?.getNorthEast) {
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
    const [lng, lat] = this.normalizeLngLat(this.map?.getCenter());
    return [
      [lng, lat],
      [lng, lat],
    ];
  }

  public getMinZoom(): number {
    return 2 - ZOOM_OFFSET;
  }

  public getMaxZoom(): number {
    return 40 - ZOOM_OFFSET;
  }

  public zoomIn(): void {
    this.map?.zoomIn();
  }

  public zoomOut(): void {
    this.map?.zoomOut();
  }

  public panTo(p: [number, number]): void {
    this.map?.panTo(this.createLatLng(p));
  }

  public panBy(x: number = 0, y: number = 0): void {
    this.map?.panBy(x, y);
  }

  public fitBounds(bound: Bounds, fitBoundsOptions?: any): void {
    const bounds = this.createBounds(bound);
    if (bounds) {
      this.map?.fitBounds(bounds, fitBoundsOptions);
    } else if (this.map?.panToBounds) {
      this.map.panToBounds(this.boundsToArray(bound));
    } else if (this.map?.setFitView) {
      const points = bound.map((coordinate) => this.createLatLng(coordinate));
      this.map.setFitView(points, fitBoundsOptions);
    }
  }

  public setMapStatus(option: Partial<IStatusOptions>): void {
    if (!option || !this.map) return;
    (Object.keys(option) as Array<keyof IStatusOptions>).forEach((statusKey) => {
      const value = option[statusKey];
      if (value === undefined) return;
      if (statusKey === 'rotateEnable') this.map.setPinchRotate(value);
      else if (statusKey === 'zoomEnable') {
        this.map.setZoomControl?.(value);
        this.map.setZoomSlider?.(value);
      } else if (statusKey === 'resizeEnable' && value) this.map.resize();
    });
  }

  public setZoomAndCenter(zoom: number, center: [number, number]): void {
    const adjustedZoom =
      typeof zoom === 'number' && !Number.isNaN(zoom) ? zoom + ZOOM_OFFSET : zoom;
    this.map?.setZoom(adjustedZoom);
    this.setCenter(center);
  }

  public setMapStyle(name: MapStyleName): void {
    if (!this.map) return;
    const styleValue = this.getMapStyleValue(name);
    if (this.map.setPresetStyleId) this.map.setPresetStyleId(styleValue);
    else if (this.map.setStyleId) this.map.setStyleId(styleValue);
    else if (this.map.setStyle) this.map.setStyle(styleValue);
    this.currentStyle = styleValue;
  }

  public meterToCoord(center: [number, number], outer: [number, number]): number {
    const centerMercator = MercatorCoordinate.fromLngLat({ lng: center[0], lat: center[1] });
    const outerMercator = MercatorCoordinate.fromLngLat({ lng: outer[0], lat: outer[1] });
    const coordDistance = Math.sqrt(
      Math.pow(centerMercator.x - outerMercator.x, 2) +
        Math.pow(centerMercator.y - outerMercator.y, 2),
    );
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
    const meterDistance = s * 6378137;
    return meterDistance ? (coordDistance * 4194304 * 2) / meterDistance : 1;
  }

  public pixelToLngLat([x, y]: Point): ILngLat {
    const latLng = this.map?.fromScreenLocation({ x, y });
    if (latLng) {
      const [lng, lat] = this.normalizeLngLat(latLng);
      return { lng, lat };
    }
    return this.getCenter();
  }

  public lngLatToPixel([lng, lat]: Point): IPoint {
    const point = this.map?.toScreenLocation(this.createLatLng([lng, lat]));
    return point ? { x: Number(point.x) || 0, y: Number(point.y) || 0 } : { x: 0, y: 0 };
  }

  public containerToLngLat([x, y]: Point): ILngLat {
    return this.pixelToLngLat([x, y]);
  }

  public lngLatToContainer([lng, lat]: Point): IPoint {
    return this.lngLatToPixel([lng, lat]);
  }

  public lngLatToCoord([lng, lat]: [number, number]): [number, number] {
    if (!this.viewport) return [lng, lat];
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
      { lng: lnglat[0], lat: lnglat[1] },
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
    const canvas = this.getContainer()?.querySelector('canvas') as HTMLCanvasElement | null;
    return canvas?.toDataURL(type === 'jpg' ? 'image/jpeg' : 'image/png') ?? '';
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
      const handleProxy = this.evtCbProxyMap.get(eventName)?.get(handle);
      if (handleProxy) this.map?.un(eventName, handleProxy);
      this.evtCbProxyMap.get(eventName)?.delete(handle);
    });
  }

  protected handleCameraChanged = () => {
    PetalMapService.syncViewport(this);
  };

  private static syncViewport(service?: PetalMapService) {
    if (!service?.viewport || !service.map) return;
    let size: [number, number] | undefined;
    try {
      size = service.getSize();
    } catch (error) {
      return;
    }
    if (!Array.isArray(size) || size.length < 2) return;
    const [width, height] = size;
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0)
      return;
    service.emit('mapchange');
    const [lng, lat] = service.normalizeLngLat(service.map.getCenter());
    service.viewport.syncWithMapCamera({
      center: [lng, lat],
      viewportHeight: height,
      viewportWidth: width,
      bearing: service.getRotation(),
      pitch: service.getPitch(),
      zoom: service.getZoom(),
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
    if (cbProxyMap.get(handle)) return;
    const handleProxy = (...args: any[]) => {
      const event = args[0];
      if (event && typeof event === 'object') {
        if (!event.lngLat) {
          const [lng, lat] = this.extractEventLngLat(event);
          event.lngLat = { lng, lat };
        }
        if (!event.lnglat && event.lngLat) event.lnglat = event.lngLat;
      }
      handle(...args);
    };
    cbProxyMap.set(handle, handleProxy);
    this.map?.on(eventName, handleProxy);
  }

  private bindCameraEvents() {
    ['movestart', 'moveend'].forEach((event) => this.registerCameraEvent(event));
    ['onZoomChanged', 'onCenterChanged', 'onHeadingChanged'].forEach((method) => {
      const handler = () => requestAnimationFrame(() => PetalMapService.syncViewport(this));
      this.map?.[method]?.(handler);
      this.cameraEventHandlers.set(method, handler);
    });
  }

  private registerCameraEvent(eventName: string) {
    const handler = () => requestAnimationFrame(() => PetalMapService.syncViewport(this));
    this.map?.on(eventName, handler);
    this.cameraEventHandlers.set(eventName, handler);
  }

  private detachCameraEvents() {
    this.cameraEventHandlers.forEach((handler, eventName) => {
      this.map?.un(eventName, handler);
    });
    this.cameraEventHandlers.clear();
  }

  private normalizeLngLat(value: any): [number, number] {
    if (!value) return [...DEFAULT_CENTER];
    if (typeof value.lng === 'function' && typeof value.lat === 'function') {
      return [Number(value.lng()) || 0, Number(value.lat()) || 0];
    }
    const lngKey =
      'lng' in value ? 'lng' : 'longitude' in value ? 'longitude' : 'x' in value ? 'x' : null;
    const latKey =
      'lat' in value ? 'lat' : 'latitude' in value ? 'latitude' : 'y' in value ? 'y' : null;
    if (lngKey && latKey) {
      return [Number(value[lngKey]) || 0, Number(value[latKey]) || 0];
    }
    if (Array.isArray(value) && value.length >= 2) {
      return [Number(value[0]) || 0, Number(value[1]) || 0];
    }
    return [...DEFAULT_CENTER];
  }

  private createLatLng(lnglat: [number, number] | { lng: number; lat: number }) {
    const [lng, lat] = Array.isArray(lnglat) ? lnglat : [lnglat.lng, lnglat.lat];
    const sdk = (window as any).HWMapJsSDK;
    return sdk?.LatLng
      ? new sdk.LatLng(lat, lng)
      : sdk?.HWLatLng
        ? new sdk.HWLatLng(lat, lng)
        : sdk?.HWMapUtils?.createLatLng
          ? sdk.HWMapUtils.createLatLng(lat, lng)
          : { lng, lat };
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
    if (!event) return [...DEFAULT_CENTER];
    if (event.latLng) return this.normalizeLngLat(event.latLng);
    if (event.position) return this.normalizeLngLat(event.position);
    if (event.coordinate && (window as any).HWMapJsSDK?.HWMapUtils?.epsgToLatLng) {
      return this.normalizeLngLat(
        (window as any).HWMapJsSDK.HWMapUtils.epsgToLatLng(event.coordinate),
      );
    }
    if (event.pixel) {
      const result = this.map?.fromScreenLocation(event.pixel);
      if (result) return this.normalizeLngLat(result);
    }
    return this.normalizeLngLat(this.map?.getCenter());
  }
}
