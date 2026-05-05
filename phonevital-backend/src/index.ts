import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { createClient } from '@supabase/supabase-js'
import { authRoutes } from './routes/auth.js'
import { sessionRoutes } from './routes/sessions.js'
import { reportRoutes } from './routes/reports.js'
import { pairingRoutes } from './routes/pairing.js'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>
  }
}

const app = Fastify({ logger: true })

async function main() {
  await app.register(cors, { origin: true })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    errorResponseBuilder: () => ({
      error: 'Çok fazla istek gönderildi. 15 dakika sonra tekrar deneyin.',
    }),
  })

  // Supabase token doğrulama — korumalı route'larda kullanılır
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '')
      if (!token) throw new Error('Token eksik')

      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      )
      const { data, error } = await supabase.auth.getUser(token)
      if (error || !data.user) throw new Error('Geçersiz token')

      request.user = { sub: data.user.id }
    } catch {
      reply.status(401).send({ error: 'Yetkisiz erişim' })
    }
  })

  await app.register(authRoutes)
  await app.register(sessionRoutes)
  await app.register(reportRoutes)
  await app.register(pairingRoutes)

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  const port = Number(process.env.PORT ?? 3000)
  await app.listen({ port, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
