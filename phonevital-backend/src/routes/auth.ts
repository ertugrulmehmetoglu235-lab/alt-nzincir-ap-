import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'

const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+90[0-9]{10}$/, 'Geçerli bir Türk telefon numarası girin (+905xxxxxxxxx)'),
})

const verifyOtpSchema = z.object({
  phone: z.string(),
  token: z.string().length(6),
})

export async function authRoutes(app: FastifyInstance) {
  // OTP gönder
  app.post('/auth/send-otp', async (request, reply) => {
    const body = sendOtpSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: body.data.phone,
      options: { channel: 'sms' },
    })

    if (error) {
      return reply.status(500).send({ error: 'SMS gönderilemedi' })
    }

    return reply.send({ message: 'Doğrulama kodu gönderildi' })
  })

  // OTP doğrula → JWT al
  app.post('/auth/verify-otp', async (request, reply) => {
    const body = verifyOtpSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { phone, token } = body.data

    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    })

    if (error || !data.session) {
      return reply.status(401).send({ error: 'Geçersiz veya süresi dolmuş kod' })
    }

    return reply.send({
      access_token: data.session.access_token,
      user_id: data.session.user.id,
    })
  })
}
