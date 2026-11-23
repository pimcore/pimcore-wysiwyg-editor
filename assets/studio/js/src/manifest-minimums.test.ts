import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const declared: Record<string, string> = { ...manifest.dependencies, ...manifest.devDependencies }

const lowest = (range: string): number[] => {
  const m = /(\d+)\.(\d+|x)\.?(\d+|x)?/.exec(range) ?? /(\d+)/.exec(range)
  return [Number(m?.[1] ?? 0), Number(m?.[2] ?? 0) || 0, Number(m?.[3] ?? 0) || 0]
}
const atLeast = (range: string, min: string): boolean => {
  const a = lowest(range)
  const b = min.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== (b[i] ?? 0)) return a[i] > (b[i] ?? 0)
  }
  return true
}

describe('manifest minimums', () => {
  it('AC1: declares the LTS minimums for antd, rsbuild, @types/jest and the MF plugin', () => {
    expect(atLeast(declared.antd, '5.29.3')).toBe(true)
    expect(atLeast(declared['@rsbuild/core'], '1.7.6')).toBe(true)
    expect(atLeast(declared['@types/jest'], '30.0.0')).toBe(true)
    expect(atLeast(declared.jest, '30.0.0')).toBe(true)
    expect(atLeast(declared['@module-federation/rsbuild-plugin'], '2.9.0')).toBe(true)
  })

  it('AC2: declares packages the source imports directly', () => {
    expect(declared['@types/node']).toBeDefined()
    expect(declared['@testing-library/react']).toBeDefined()
    expect(declared.antd).toBeDefined()
  })

  it('AC3: lockfile keeps resolved antd, rsbuild, jest and react versions', () => {
    const v = (p: string): string => lock.packages[`node_modules/${p}`].version
    expect(v('antd')).toBe('5.29.3')
    expect(v('@rsbuild/core')).toBe('1.7.6')
    expect(v('jest')).toBe('30.5.2')
    expect(v('react')).toBe('18.3.1')
  })
})
