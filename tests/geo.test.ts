import { describe, expect, it } from 'vitest'
import {
  decodeAmapPolyline,
  dedupeGeometry,
  encodeGeometry,
  shortPlaceName,
  simplifyGeometry,
} from '../src/geo.js'

describe('decodeAmapPolyline', () => {
  it('解析高德紧凑折线串', () => {
    expect(decodeAmapPolyline('116.4,39.9;116.5,39.95')).toEqual([
      [116.4, 39.9],
      [116.5, 39.95],
    ])
  })

  it('跳过非法片段而不是抛错（上游数据不可信）', () => {
    expect(decodeAmapPolyline('116.4,39.9;bad;1,2,3;200,39;116.5,39.95')).toEqual([
      [116.4, 39.9],
      [116.5, 39.95],
    ])
  })

  it('空串与 undefined 返回空数组', () => {
    expect(decodeAmapPolyline('')).toEqual([])
    expect(decodeAmapPolyline(undefined)).toEqual([])
  })
})

describe('dedupeGeometry', () => {
  it('去掉相邻重复点并保留顺序', () => {
    expect(dedupeGeometry([[1, 2], [1, 2], [3, 4], [3, 4], [5, 6]])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ])
  })

  it('丢弃越界坐标，并把 -0 归一成 0', () => {
    expect(dedupeGeometry([[200, 10], [-0, 0], [1, 1]])).toEqual([
      [0, 0],
      [1, 1],
    ])
  })
})

describe('simplifyGeometry', () => {
  it('短路线原样返回（仅取整）', () => {
    const line: Array<[number, number]> = [[116.397451234, 39.908721234], [116.41, 39.92]]
    expect(simplifyGeometry(line)).toEqual([
      [116.39745, 39.90872],
      [116.41, 39.92],
    ])
  })

  it('直线中间的点被抽掉，首尾保留', () => {
    const line: Array<[number, number]> = []
    for (let i = 0; i <= 100; i += 1) line.push([116 + i * 0.001, 39 + i * 0.001])
    const simplified = simplifyGeometry(line)
    expect(simplified.length).toBe(2)
    expect(simplified[0]).toEqual(line[0])
    expect(simplified[simplified.length - 1]).toEqual(line[line.length - 1])
  })

  it('保留拐点（L 形路线不会退化成直线）', () => {
    const line: Array<[number, number]> = []
    for (let i = 0; i <= 50; i += 1) line.push([116 + i * 0.001, 39])
    for (let i = 1; i <= 50; i += 1) line.push([116 + 0.05, 39 + i * 0.001])
    const simplified = simplifyGeometry(line)
    // 拐点必须还在，否则画出来是斜线而不是 L 形。
    expect(simplified).toContainEqual([116.05, 39])
    expect(simplified.length).toBeLessThan(10)
  })

  it('无论输入多长都遵守点数上限', () => {
    const zigzag: Array<[number, number]> = []
    for (let i = 0; i < 2000; i += 1) zigzag.push([116 + i * 0.0001, 39 + (i % 2) * 0.002])
    const simplified = simplifyGeometry(zigzag, 50)
    expect(simplified.length).toBeLessThanOrEqual(50)
    expect(simplified[0]).toEqual(zigzag[0])
  })

  it('空数组、单点、全重合点都不会崩', () => {
    expect(simplifyGeometry([])).toEqual([])
    expect(simplifyGeometry([[116, 39]])).toEqual([[116, 39]])
    expect(simplifyGeometry([[116, 39], [116, 39], [116, 39]])).toEqual([[116, 39]])
  })

  it('默认上限是 200 点', () => {
    const many: Array<[number, number]> = []
    for (let i = 0; i < 5000; i += 1) many.push([116 + i * 0.00001, 39 + Math.sin(i) * 0.001])
    expect(simplifyGeometry(many).length).toBeLessThanOrEqual(200)
  })
})

describe('encodeGeometry', () => {
  it('压成高德风格的紧凑串', () => {
    expect(encodeGeometry([[116.4, 39.9], [116.5, 39.95]])).toBe('116.4,39.9;116.5,39.95')
    expect(encodeGeometry([])).toBe('')
  })
})

describe('shortPlaceName（把长地址裁成可读地名）', () => {
  it('剥掉省/市/区/街道前缀', () => {
    expect(shortPlaceName('北京市丰台区右安门街道北京南站', ['北京市', '丰台区', '右安门街道'])).toBe('北京南站')
    expect(shortPlaceName('北京市顺义区首都机场街道北京首都国际机场(2号通道)', ['北京市', '顺义区', '首都机场街道']))
      .toBe('北京首都国际机场')
  })

  it('只剥能匹配上的前缀，顺序无关', () => {
    expect(shortPlaceName('北京市朝阳区建国路88号', ['朝阳区', '北京市'])).toBe('建国路88号')
    expect(shortPlaceName('上海市浦东新区世纪大道', ['上海市'])).toBe('浦东新区世纪大道')
  })

  it('去掉尾部括号补充', () => {
    expect(shortPlaceName('北京首都国际机场（T3航站楼）', [])).toBe('北京首都国际机场')
    expect(shortPlaceName('某某大厦(A座)', [])).toBe('某某大厦')
    // 括号在中间则保留（不是尾部补充）。
    expect(shortPlaceName('某某(中关村)大厦', [])).toBe('某某(中关村)大厦')
  })

  it('剥完为空 / 前缀缺失时原样返回（宁可长，不要空）', () => {
    expect(shortPlaceName('北京市', ['北京市'])).toBe('北京市')
    expect(shortPlaceName('某地', [undefined, ''])).toBe('某地')
    expect(shortPlaceName('', [])).toBe('')
  })
})
