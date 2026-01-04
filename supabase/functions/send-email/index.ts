// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import "@supabase/functions-js/edge-runtime.d.ts"
import nodemailer from 'nodemailer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Attachment {
  filename: string
  content?: string
  path?: string
  contentType?: string
  encoding?: string
}

interface EmailRequest {
  to: string
  subject: string
  html: string
  from?: string
  cc?: string
  bcc?: string
  attachments?: Attachment[]
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html, from, cc, bcc, attachments } = await req.json() as EmailRequest

    // Get SMTP settings from secrets
    const smtpHost = Deno.env.get('SMTP_HOST')
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587')
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPass = Deno.env.get('SMTP_PASS')

    if (!smtpHost || !smtpUser || !smtpPass) {
      throw new Error('Missing SMTP configuration secrets')
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false
      }
    })

    const mailOptions = {
      from: from || `"${smtpUser}" <${smtpUser}>`,
      to,
      cc,
      bcc,
      subject,
      html,
      attachments
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('Email sent: %s', info.messageId)

    return new Response(
      JSON.stringify({ message: 'Email sent successfully', id: info.messageId }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error sending email:', error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
