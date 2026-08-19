import { describe, expect, it } from 'vitest'
import { formatLngLat, parseLngLat } from '../src/types.js'

describe('parseLngLat', () => {
  it('parses a valid lng,lat pair', () => {
    expect(parseLngLat('116.397428,39.90923')).toEqual([116.397428, 39.90923])
  })

  it('trims surrounding whitespace', () => {
    expect(parseLngLat('  116.4, 39.9  ')).toEqual([116.4, 39.9])
  })

  it('rejects out-of-range longitude', () => {
    expect(parseLngLat('200,39.9')).toBeNull()
  })

  it('rejects out-of-range latitude', () => {
    expect(parseLngLat('116.4,95')).toBeNull()
  })

  it('rejects non-numeric input', () => {
    expect(parseLngLat('abc,def')).toBeNull()
    expect(parseLngLat('北京市')).toBeNull()
  })

  it('rejects single coordinate', () => {
    expect(parseLngLat('116.4')).toBeNull()
  })

  it('accepts negative coordinates (southern/western hemisphere)', () => {
    expect(parseLngLat('-73.9857,40.7484')).toEqual([-73.9857, 40.7484])
  })
})

describe('formatLngLat', () => {
  it('formats as lng,lat', () => {
    expect(formatLngLat([116.397428, 39.90923])).toBe('116.397428,39.90923')
  })
})
