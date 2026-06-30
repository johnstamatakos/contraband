import { feature } from 'topojson-client'
import countriesAtlas from 'world-atlas/countries-110m.json'
import landAtlas from 'world-atlas/land-110m.json'
import { geoPath } from 'd3-geo'
import type { GeoProjection } from 'd3-geo'
import type { Topology, GeometryCollection } from 'topojson-specification'

const landTopo = landAtlas as unknown as Topology
const countriesTopo = countriesAtlas as unknown as Topology

// Pre-extract features once at module load
const landFeature = feature(landTopo, landTopo.objects['land'] as GeometryCollection)
const countriesFeature = feature(countriesTopo, countriesTopo.objects['countries'] as GeometryCollection)

export function drawWorldToCanvas(canvas: HTMLCanvasElement, projection: GeoProjection): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // canvas.width/height are in physical pixels; CSS pixels are canvas.style.width/height
  // Apply DPR scale so D3 draws at the same CSS-pixel coordinates as Pixi
  const dpr = window.devicePixelRatio || 1
  ctx.save()
  ctx.scale(dpr, dpr)
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  const path = geoPath(projection, ctx)

  ctx.fillStyle = '#030712'
  ctx.fillRect(0, 0, width, height)

  ctx.beginPath()
  path(landFeature)
  ctx.fillStyle = '#111827'
  ctx.fill()

  ctx.beginPath()
  path(countriesFeature)
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 0.5
  ctx.stroke()

  ctx.restore()
}
