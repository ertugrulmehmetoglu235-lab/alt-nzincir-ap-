import puppeteer from 'puppeteer'
import Handlebars from 'handlebars'
import { supabase } from '../lib/supabase.js'

const REPORT_TEMPLATE = `
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 40px; background: #fff; color: #222; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #FF5722; padding-bottom: 20px; margin-bottom: 30px; }
  .brand { font-size: 28px; font-weight: 900; color: #FF5722; }
  .report-meta { font-size: 12px; color: #666; text-align: right; }
  .score-section { text-align: center; margin: 30px 0; }
  .grade-circle { width: 120px; height: 120px; border-radius: 50%; background: {{gradeColor}}; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 60px; font-weight: 900; }
  .score-number { font-size: 48px; font-weight: 900; color: #222; margin-top: 15px; }
  .device-info { background: #f5f5f5; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
  .device-info h3 { margin: 0 0 15px 0; color: #FF5722; }
  .device-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e0e0e0; }
  .tests-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  .tests-table th { background: #FF5722; color: white; padding: 10px; text-align: left; }
  .tests-table td { padding: 10px; border-bottom: 1px solid #eee; }
  .tests-table tr:nth-child(even) { background: #fafafa; }
  .status-passed { color: #00C853; font-weight: bold; }
  .status-failed { color: #E53935; font-weight: bold; }
  .status-warning { color: #FF8F00; font-weight: bold; }
  .issues-box { background: #FFF3E0; border: 1px solid #FF8F00; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
  .issues-box h3 { color: #E65100; margin: 0 0 15px 0; }
  .footer { border-top: 1px solid #eee; padding-top: 20px; font-size: 11px; color: #999; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">PhoneVital</div>
    <div class="report-meta">
      Rapor ID: {{reportId}}<br>
      Tarih: {{date}}
    </div>
  </div>

  <div class="device-info">
    <h3>Cihaz Bilgileri</h3>
    <div class="device-row"><span>Model</span><span>{{deviceModel}}</span></div>
    <div class="device-row"><span>Android Sürümü</span><span>{{androidVersion}}</span></div>
  </div>

  <div class="score-section">
    <div class="grade-circle">{{grade}}</div>
    <div class="score-number">{{score}} / 100</div>
    <div style="color:#666; margin-top:8px;">Genel Sağlık Puanı</div>
  </div>

  <table class="tests-table">
    <thead>
      <tr><th>Test</th><th>Durum</th><th>Detay</th></tr>
    </thead>
    <tbody>
      {{#each tests}}
      <tr>
        <td>{{this.label}}</td>
        <td class="status-{{this.status}}">{{this.statusLabel}}</td>
        <td>{{this.detail}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  {{#if issues}}
  <div class="issues-box">
    <h3>Tespit Edilen Sorunlar</h3>
    <ul>
      {{#each issues}}
      <li>{{this}}</li>
      {{/each}}
    </ul>
  </div>
  {{/if}}

  <div class="footer">
    <span>Bu rapor PhoneVital tarafından otomatik olarak üretilmiştir.</span>
    <span>Doğrulama Kodu: {{reportId}}</span>
  </div>
</body>
</html>
`

const TEST_LABELS: Record<string, string> = {
  battery:     'Pil',
  touchscreen: 'Dokunmatik Ekran',
  speaker:     'Hoparlör',
  microphone:  'Mikrofon',
  gps:         'GPS / Konum',
  sensors:     'Sensörler',
  wifi:        'Wi-Fi',
  camera:      'Kamera',
  storage:     'Depolama',
  nfc:         'NFC',
  bluetooth:   'Bluetooth',
  fingerprint: 'Parmak İzi',
}

const STATUS_LABELS: Record<string, string> = {
  passed:  '✓ Geçti',
  failed:  '✗ Başarısız',
  warning: '⚠ Dikkat',
}

const GRADE_COLORS: Record<string, string> = {
  A: '#00C853',
  B: '#64DD17',
  C: '#FF8F00',
  D: '#FF5722',
  F: '#E53935',
}

function buildTestDetail(testType: string, data: Record<string, unknown>): string {
  switch (testType) {
    case 'battery':
      return `Doluluk: ${data.level}% | Sıcaklık: ${data.temperature}°C | Durum: ${data.health}`
    case 'wifi':
      return `Sinyal: ${data.rssi_dbm} dBm | Bant: ${Number(data.frequency_mhz) >= 5000 ? '5 GHz' : '2.4 GHz'}`
    case 'gps':
      return `Doğruluk: ${data.accuracy_meters}m | Uydu: ${data.satellites}`
    case 'touchscreen':
      return `Yanıt: ${data.response_time_ms}ms | Tarama: %${data.grid_coverage}`
    case 'storage':
      return `Kullanılan: ${data.used_gb} GB / ${data.total_gb} GB`
    default:
      return ''
  }
}

export async function generateAndUploadPDF(
  reportId: string,
  sessionData: {
    deviceModel: string
    androidVersion: string
    score: number
    grade: string
    issues: string[]
    tests: Array<{ test_type: string; status: string; result_data: Record<string, unknown> }>
  }
): Promise<string> {
  const template = Handlebars.compile(REPORT_TEMPLATE)

  const html = template({
    reportId,
    date: new Date().toLocaleDateString('tr-TR', { dateStyle: 'long' }),
    deviceModel: sessionData.deviceModel,
    androidVersion: sessionData.androidVersion,
    score: sessionData.score,
    grade: sessionData.grade,
    gradeColor: GRADE_COLORS[sessionData.grade] ?? '#607D8B',
    issues: sessionData.issues,
    tests: sessionData.tests.map((t) => ({
      label: TEST_LABELS[t.test_type] ?? t.test_type,
      status: t.status,
      statusLabel: STATUS_LABELS[t.status] ?? t.status,
      detail: buildTestDetail(t.test_type, t.result_data),
    })),
  })

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    })

    const pdfPath = `reports/${reportId}.pdf`

    const { error } = await supabase.storage
      .from('phonevital-reports')
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data } = supabase.storage
      .from('phonevital-reports')
      .getPublicUrl(pdfPath)

    return data.publicUrl
  } finally {
    await browser.close()
  }
}
