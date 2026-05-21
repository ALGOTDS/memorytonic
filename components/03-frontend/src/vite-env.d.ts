/// <reference types="vite/client" />

declare module 'd3-force-3d' {
  export function forceCollide<N = any>(radius?: number | ((node: N) => number)): {
    radius(r: number | ((node: N) => number)): ReturnType<typeof forceCollide>
    iterations(n: number): ReturnType<typeof forceCollide>
  }
}
