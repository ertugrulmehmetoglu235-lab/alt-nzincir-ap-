import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { validateTestData } from '../services/testValidator.js'
import { calculateHealthScore, scoreToGrade, findIssues } from '../services/healthScore.js'
import { generateAndUploadPDF } from '../services/pdfGenerator.js'

const startSchema = z.object({
  device_model: z.string().min(1).max(100),
  android_version: z.string().min(1).max(20),
})

const submitTestSchema = z.object({
  test_type: z.string().min(1),
  status: z.enum(['passed', 'failed', 'warning']),
  result_data: z.record(z.unknown()),
})

export async function sessionRoutes(app: FastifyInstance) {
  // Yeni test oturumu başlat
  app.post('/api/sessions/start', { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = startSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const userId = (request as any).user.sub

    const { data, error } = await supabase
      .from('test_sessions')
      .insert({
        user_id: userId,
        device_model: body.data.device_model,
        android_version: body.data.android_version,
        status: 'in_progress',
      })
      .select('id')
      .single()

    if (error) {
      return reply.status(500).send({ error: 'Oturum başlatılamadı' })
    }

    return reply.status(201).send({ session_id: data.id })
  })

  // Tek test sonucu gönder
  app.post('/api/sessions/:id/test', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = submitTestSchema.safeParse(request.body)

    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { test_type, status, result_data } = body.data

    // Sahte/manipüle değerleri sunucuda engelle
    const validation = validateTestData(test_type, result_data)
    if (!validation.valid) {
      return reply.status(422).send({ error: `Geçersiz test verisi: ${validation.error}` })
    }

    const userId = (request as any).user.sub

    // Oturumun bu kullanıcıya ait ve açık olduğunu doğrula
    const { data: session } = await supabase
      .from('test_sessions')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (!session || session.status !== 'in_progress') {
      return reply.status(404).send({ error: 'Oturum bulunamadı veya tamamlanmış' })
    }

    const { error } = await supabase
      .from('test_results')
      .insert({ session_id: id, test_type, status, result_data })

    if (error) {
      return reply.status(500).send({ error: 'Test sonucu kaydedilemedi' })
    }

    return reply.send({ message: 'Test kaydedildi' })
  })

  // Oturumu bitir → sağlık puanı hesapla + rapor üret
  app.post('/api/sessions/:id/finish', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = (request as any).user.sub

    const { data: session } = await supabase
      .from('test_sessions')
      .select('*, test_results(*)')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (!session || session.status !== 'in_progress') {
      return reply.status(404).send({ error: 'Oturum bulunamadı veya zaten tamamlanmış' })
    }

    const tests = session.test_results as Array<{
      test_type: string
      status: 'passed' | 'failed' | 'warning'
      result_data: Record<string, unknown>
    }>

    if (tests.length === 0) {
      return reply.status(400).send({ error: 'Hiç test sonucu yok' })
    }

    // Sağlık puanı sunucu tarafında hesaplanır — istemciye güvenilmez
    const score = calculateHealthScore(tests)
    const grade = scoreToGrade(score)
    const issues = findIssues(tests)

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({ session_id: id, health_score: score, health_grade: grade, issues })
      .select('id')
      .single()

    if (reportError || !report) {
      return reply.status(500).send({ error: 'Rapor oluşturulamadı' })
    }

    await supabase
      .from('test_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id)

    // PDF arka planda üretilir (yanıtı bloke etmez)
    setImmediate(async () => {
      try {
        const pdfUrl = await generateAndUploadPDF(report.id, {
          deviceModel: session.device_model,
          androidVersion: session.android_version,
          score,
          grade,
          issues,
          tests,
        })
        await supabase.from('reports').update({ pdf_path: pdfUrl }).eq('id', report.id)
      } catch (e) {
        console.error('PDF üretim hatası:', e)
      }
    })

    return reply.send({ report_id: report.id, health_score: score, health_grade: grade, issues })
  })

  // Oturum durumu
  app.get('/api/sessions/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = (request as any).user.sub

    const { data, error } = await supabase
      .from('test_sessions')
      .select('*, test_results(test_type, status), reports(id, health_score, health_grade, pdf_path)')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return reply.status(404).send({ error: 'Oturum bulunamadı' })
    }

    return reply.send(data)
  })
}
