import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { registerRouteTools, type MapClients } from '../src/tools/routes.js'
import { registerGeocodeTools } from '../src/tools/geocode.js'
import { registerPoiTool } from '../src/tools/poi.js'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** Minimal tools registry stub: captures definitions, returns disposers. */
class StubTools {
  registered = new Map<string, ToolDefinition>()
  register(def: ToolDefinition) {
    this.registered.set(def.name, def)
    return () => {
      this.registered.delete(def.name)
    }
  }
}

function makeContext(): { ctx: Context; tools: StubTools } {
  const ctx = new Context()
  const tools = new StubTools()
  ;(ctx as unknown as { tools: StubTools }).tools = tools
  return { ctx, tools }
}

const noopResolve = async (text: string): Promise<[number, number]> => {
  const m = /^(-?\d+\.?\d*),(-?\d+\.?\d*)$/.exec(text)
  if (m) return [Number(m[1]), Number(m[2])]
  throw new Error('resolve: unreachable in this test')
}

const clients: MapClients = {
  osrm: { route: async () => ({ provider: 'osrm', distanceM: 1000, durationS: 60, polyline: '', points: [], steps: [] }) } as never,
  resolve: noopResolve,
  resolveCity: async () => '',
  defaultMode: 'driving',
}

describe('tool registration', () => {
  it('registers all 7 tools with the documented names', () => {
    const { ctx, tools } = makeContext()
    registerRouteTools(ctx, clients, [])
    registerGeocodeTools(ctx, {}, [])
    registerPoiTool(ctx, { resolve: noopResolve }, [])

    const names = [...tools.registered.keys()].sort()
    expect(names).toEqual([
      'map_bicycling_route',
      'map_driving_route',
      'map_geocode',
      'map_poi_search',
      'map_reverse_geocode',
      'map_transit_route',
      'map_walking_route',
    ])
  })

  it('every route tool declares the canonical output fields', () => {
    const { ctx, tools } = makeContext()
    registerRouteTools(ctx, clients, [])
    for (const name of ['map_driving_route', 'map_transit_route', 'map_walking_route', 'map_bicycling_route']) {
      const def = tools.registered.get(name)!
      expect(def.name).toBe(name)
      expect(def.description).toBeTruthy()
      // defineTool compiles the parameter DSL into JSON Schema:
      // { type: 'object', properties: { origin: {...}, destination: {...} }, ... }
      const params = def.parameters as { type?: string; properties?: Record<string, unknown>; required?: string[] }
      expect(params.type).toBe('object')
      expect(params.properties?.origin).toBeTruthy()
      expect(params.properties?.destination).toBeTruthy()
      expect(params.required).toContain('origin')
      expect(params.required).toContain('destination')
      const out = def.output.schema as { type?: string; properties?: Record<string, unknown> }
      expect(out.type).toBe('object')
      const props = out.properties ?? {}
      for (const f of ['provider', 'distanceM', 'durationS', 'steps']) {
        expect(props[f], `route tool ${name} missing output field ${f}`).toBeTruthy()
      }
    }
  })

  it('disposers unregister tools when invoked', () => {
    const { ctx, tools } = makeContext()
    const disposers: Array<() => void> = []
    registerRouteTools(ctx, clients, disposers)
    expect(tools.registered.size).toBe(4)
    for (const d of disposers) d()
    expect(tools.registered.size).toBe(0)
  })
})
