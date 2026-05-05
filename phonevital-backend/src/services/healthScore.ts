export type TestStatus = 'passed' | 'failed' | 'warning'

interface TestResult {
  test_type: string
  status: TestStatus
  result_data: Record<string, unknown>
}

const WEIGHTS: Record<string, number> = {
  battery:     25,
  touchscreen: 20,
  speaker:     10,
  microphone:  10,
  gps:          5,
  sensors:     10,
  wifi:        10,
  camera:      10,
}

const STATUS_SCORES: Record<TestStatus, number> = {
  passed:  100,
  warning:  60,
  failed:    0,
}

export function calculateHealthScore(tests: TestResult[]): number {
  let totalScore = 0
  let totalWeight = 0

  for (const test of tests) {
    const weight = WEIGHTS[test.test_type] ?? 5
    const score = STATUS_SCORES[test.status] ?? 0
    totalScore += score * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return 0
  return Math.round(totalScore / totalWeight)
}

export function scoreToGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export function findIssues(tests: TestResult[]): string[] {
  const issues: string[] = []

  for (const test of tests) {
    if (test.status === 'failed' || test.status === 'warning') {
      const label = issueLabels[test.test_type]
      if (label) issues.push(label[test.status])
    }
  }

  return issues
}

const issueLabels: Record<string, Record<string, string>> = {
  battery:     { failed: 'Pil arızalı veya ölü', warning: 'Pil durumu dikkat gerektiriyor (aşırı ısınma/yıpranma)' },
  touchscreen: { failed: 'Dokunmatik ekran çalışmıyor', warning: 'Dokunmatik yanıt süresi yavaş' },
  speaker:     { failed: 'Hoparlör çalışmıyor', warning: 'Hoparlörde bozulma tespit edildi' },
  microphone:  { failed: 'Mikrofon çalışmıyor', warning: 'Mikrofon kalitesi düşük' },
  gps:         { failed: 'GPS sinyal alınamıyor', warning: 'GPS doğruluğu düşük' },
  sensors:     { failed: 'Bir veya daha fazla sensör çalışmıyor', warning: 'Sensör verisi tutarsız' },
  wifi:        { failed: 'Wi-Fi bağlantısı yok', warning: 'Wi-Fi sinyali zayıf' },
  camera:      { failed: 'Kamera çalışmıyor', warning: 'Kamera netliği düşük' },
}
