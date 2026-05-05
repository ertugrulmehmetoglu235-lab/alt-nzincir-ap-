import { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'

export async function reportRoutes(app: FastifyInstance) {
  // Rapor detayı
  app.get('/api/reports/mine', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request as any).user.sub

    const { data, error } = await supabase
      .from('reports')
      .select('id, health_score, health_grade, pdf_path, created_at, test_sessions!inner(device_model, android_version, user_id)')
      .eq('test_sessions.user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return reply.status(500).send({ error: 'Raporlar getirilemedi' })
    }

    return reply.send(data)
  })

  app.get('/api/reports/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = (request as any).user.sub

    const { data, error } = await supabase
      .from('reports')
      .select('*, test_sessions!inner(user_id, device_model, android_version, test_results(*))')
      .eq('id', id)
      .eq('test_sessions.user_id', userId)
      .single()

    if (error || !data) {
      return reply.status(404).send({ error: 'Rapor bulunamadı' })
    }

    return reply.send(data)
  })

  // PDF URL'i al
  app.get('/api/reports/:id/pdf', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = (request as any).user.sub

    const { data, error } = await supabase
      .from('reports')
      .select('pdf_path, test_sessions!inner(user_id)')
      .eq('id', id)
      .eq('test_sessions.user_id', userId)
      .single()

    if (error || !data) {
      return reply.status(404).send({ error: 'Rapor bulunamadı' })
    }

    if (!data.pdf_path) {
      return reply.status(202).send({ message: 'PDF henüz hazır değil, kısa süre içinde tekrar deneyin' })
    }

    return reply.send({ pdf_url: data.pdf_path })
  })
}
