import { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function pairingRoutes(app: FastifyInstance) {
  // Yeni oda oluştur
  app.post('/api/pairing/create', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request as any).user.sub

    let roomCode = generateRoomCode()
    // Çakışma varsa yeni kod dene
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase
        .from('pairing_sessions')
        .select('id')
        .eq('room_code', roomCode)
        .eq('status', 'waiting')
        .maybeSingle()
      if (!data) break
      roomCode = generateRoomCode()
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('pairing_sessions')
      .insert({ room_code: roomCode, initiator_id: userId, status: 'waiting', expires_at: expiresAt })
      .select('room_code')
      .single()

    if (error || !data) {
      return reply.status(500).send({ error: 'Oda oluşturulamadı' })
    }

    return reply.status(201).send({
      room_code: data.room_code,
      expires_at: expiresAt,
      // Flutter: Supabase Realtime'da bu kanalı dinle
      channel: `pairing:${data.room_code}`,
    })
  })

  // Odaya katıl
  app.post('/api/pairing/join/:code', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { code } = request.params as { code: string }
    const userId = (request as any).user.sub

    const { data: room, error } = await supabase
      .from('pairing_sessions')
      .select('*')
      .eq('room_code', code.toUpperCase())
      .eq('status', 'waiting')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !room) {
      return reply.status(404).send({ error: 'Geçersiz veya süresi dolmuş oda kodu' })
    }

    if (room.initiator_id === userId) {
      return reply.status(400).send({ error: 'Kendi odanıza katılamazsınız' })
    }

    await supabase
      .from('pairing_sessions')
      .update({ partner_id: userId, status: 'paired' })
      .eq('id', room.id)

    // Diğer cihaza bildir (Flutter Supabase Realtime ile dinler)
    await supabase.channel(`pairing:${code.toUpperCase()}`).send({
      type: 'broadcast',
      event: 'partner_joined',
      payload: { partner_id: userId },
    })

    return reply.send({
      room_code: room.room_code,
      channel: `pairing:${room.room_code}`,
      message: 'Odaya başarıyla katıldınız',
    })
  })

  // Oda durumu
  app.get('/api/pairing/:code', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { code } = request.params as { code: string }

    const { data, error } = await supabase
      .from('pairing_sessions')
      .select('room_code, status, expires_at')
      .eq('room_code', code.toUpperCase())
      .single()

    if (error || !data) {
      return reply.status(404).send({ error: 'Oda bulunamadı' })
    }

    return reply.send(data)
  })
}
