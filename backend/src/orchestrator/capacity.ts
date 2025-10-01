import os from 'node:os'
export interface NodeCapacity {
  cpuCores: number
  memoryBytes: number
  storageBytes?: number
  gpuCount?: number
  labels?: Record<string, string>
}

export function getLocalCapacity(): NodeCapacity {
  // Minimal stub; refine later
  return {
  cpuCores: Math.max(1, os.cpus()?.length || 1),
  memoryBytes: os.totalmem()
  }
}
