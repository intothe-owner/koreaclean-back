import nodemailer, { Transporter } from 'nodemailer';

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: {   // 필요 없으면 제거
    filename: string;
    content?: Buffer | string;
    path?: string;  // 로컬/원격 파일 경로
    contentType?: string;
  }[];
};

let transporter: Transporter | null = null;

// 재사용 가능한 트랜스포터 (커넥션 풀)
function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: String(process.env.SMTP_SECURE ?? 'false') === 'true', // true for 465
    auth: { 
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },

    // 선택: 풀링/타임아웃/재시도 등
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter; 
}

/** 공용 발송 함수 */
export async function sendEmail(opts: SendEmailOptions) {
  const t = getTransporter();

  const info = await t.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    cc: opts.cc,
    bcc: opts.bcc,
    attachments: opts.attachments,
  });

  // 필요하면 로그 저장
  // console.log('Message sent: %s', info.messageId);

  return info;
}
