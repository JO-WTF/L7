import { Scene } from '@antv/l7';
import type { IMapConfig } from '@antv/l7-core';
import * as Maps from '@antv/l7-maps';
import type { TestCaseOptions } from '../types';

type CaseSceneOptions = TestCaseOptions & {
  mapConfig?: Partial<IMapConfig>;
};

export const CaseScene = (options: CaseSceneOptions) => {
  const { map: basemap, animate, mapConfig } = options;

  const resolveBasemapKey = (name: string) => {
    if (!name) {
      return name;
    }
    const entries = Object.keys(Maps);
    if (entries.includes(name)) {
      return name;
    }
    const normalized = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    if (entries.includes(normalized)) {
      return normalized;
    }
    const upper = name.toUpperCase();
    const matched = entries.find((key) => key.toUpperCase() === upper);
    return matched ?? name;
  };

  const basemapKey = resolveBasemapKey(basemap);
  const MapCtor = (Maps as Record<string, any>)[basemapKey];

  if (typeof MapCtor !== 'function') {
    throw new Error(
      `Unknown basemap "${basemap}". Available: ${Object.keys(Maps)
        .filter((key) => typeof (Maps as Record<string, any>)[key] === 'function')
        .join(', ')}`,
    );
  }

  const isMapbox = ['MapLibre', 'Mapbox'].includes(basemapKey);

  const style = isMapbox
    ? 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json'
    : 'light';

  const baseMapOptions: Partial<IMapConfig> = {
    style,
    center: [120.188193, 30.292542],
    rotation: 0,
    pitch: 0,
    zoom: 16,
    WebGLParams: {
      preserveDrawingBuffer: true,
    },
  };

  const finalMapOptions: Record<string, any> = {
    ...baseMapOptions,
    ...mapConfig,
  };

  const map = new MapCtor(finalMapOptions);

  const scene = new Scene({
    ...options,
    map,
    shaderCompilerPath: '/glsl_wgsl_compiler_bg.wasm',
    logoVisible: false,
  });

  return new Promise<Scene>((resolve) => {
    scene.on('loaded', () => {
      if (animate) {
        scene.startAnimate();
      }
      resolve(scene);
    });
  });
};
