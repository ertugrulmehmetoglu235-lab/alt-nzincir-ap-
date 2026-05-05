import { z } from 'zod'

// Her test türü için geçerli değer aralıkları (sahte veri engeli)
const validators: Record<string, z.ZodTypeAny> = {
  battery: z.object({
    level: z.number().min(0).max(100),
    temperature: z.number().min(-10).max(80),   // Celsius
    voltage: z.number().min(2000).max(5000),     // mV
    health: z.enum(['GOOD', 'OVERHEAT', 'DEAD', 'OVER_VOLTAGE', 'COLD', 'UNSPECIFIED']),
    charge_type: z.enum(['AC', 'USB', 'WIRELESS', 'NONE']).optional(),
  }),

  touchscreen: z.object({
    touches_detected: z.number().min(0).max(20),
    response_time_ms: z.number().min(1).max(2000),
    grid_coverage: z.number().min(0).max(100),  // % of grid touched
  }),

  speaker: z.object({
    frequency_hz: z.number().min(20).max(20000),
    volume_db: z.number().min(-60).max(120),
    distortion_detected: z.boolean(),
  }),

  microphone: z.object({
    volume_db: z.number().min(-100).max(0),
    noise_detected: z.boolean(),
  }),

  gps: z.object({
    satellites: z.number().min(0).max(50),
    accuracy_meters: z.number().min(0).max(5000),
    fix_time_ms: z.number().min(0).max(60000),
  }),

  sensors: z.object({
    accelerometer: z.boolean(),
    gyroscope: z.boolean(),
    compass: z.boolean(),
    proximity: z.boolean(),
    ambient_light: z.boolean(),
    barometer: z.boolean().optional(),
  }),

  wifi: z.object({
    rssi_dbm: z.number().min(-150).max(0),
    frequency_mhz: z.number().min(2400).max(6000),  // 2.4/5/6 GHz
    link_speed_mbps: z.number().min(0).max(10000),
  }),

  camera: z.object({
    front_available: z.boolean(),
    back_available: z.boolean(),
    sharpness_score: z.number().min(0).max(100),
  }),

  storage: z.object({
    total_gb: z.number().min(0).max(2000),
    used_gb: z.number().min(0).max(2000),
    free_gb: z.number().min(0).max(2000),
  }),

  nfc: z.object({
    available: z.boolean(),
    enabled: z.boolean().optional(),
  }),

  bluetooth: z.object({
    available: z.boolean(),
    enabled: z.boolean(),
  }),

  fingerprint: z.object({
    available: z.boolean(),
    enrolled: z.boolean().optional(),
  }),
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateTestData(testType: string, data: unknown): ValidationResult {
  const schema = validators[testType]
  if (!schema) {
    return { valid: false, error: `Bilinmeyen test tipi: ${testType}` }
  }

  const result = schema.safeParse(data)
  if (!result.success) {
    return { valid: false, error: result.error.message }
  }

  return { valid: true }
}
