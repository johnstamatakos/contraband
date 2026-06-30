import { geoNaturalEarth1 } from 'd3-geo'
import type { GeoProjection } from 'd3-geo'

export interface Viewport {
  zoom: number   // 1 = fit-to-screen baseline
  panX: number   // pixels offset from center
  panY: number
}

export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 }

// Natural Earth 1 defaults: scale=175, 960×500
const BASE_SCALE = 175
const BASE_W = 960
const BASE_H = 500

export const MIN_ZOOM = 0.75
export const MAX_ZOOM = 8

export function createProjection(
  width: number,
  height: number,
  viewport: Viewport = DEFAULT_VIEWPORT,
): GeoProjection {
  const fitScale = Math.min((width / BASE_W) * BASE_SCALE, (height / BASE_H) * BASE_SCALE) * 0.96
  return geoNaturalEarth1()
    .scale(fitScale * viewport.zoom)
    .translate([width / 2 + viewport.panX, height / 2 + viewport.panY])
    .precision(0.1)
}

// Zoom toward a screen point (sx, sy), keeping that point stationary.
export function zoomViewport(
  viewport: Viewport,
  factor: number,   // e.g. 1.15 for zoom-in, 1/1.15 for zoom-out
  sx: number,       // cursor x in container coords
  sy: number,       // cursor y in container coords
  width: number,
  height: number,
): Viewport {
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * factor))
  const ratio = newZoom / viewport.zoom
  // Keep the geographic point under (sx, sy) stationary
  const newPanX = viewport.panX * ratio + (sx - width / 2) * (1 - ratio)
  const newPanY = viewport.panY * ratio + (sy - height / 2) * (1 - ratio)
  return { zoom: newZoom, panX: newPanX, panY: newPanY }
}

export function projectCoord(
  projection: GeoProjection,
  lon: number,
  lat: number,
): [number, number] | null {
  return projection([lon, lat])
}
