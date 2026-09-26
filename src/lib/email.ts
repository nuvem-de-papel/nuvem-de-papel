// Camada de e-mails transacionais (Fase 2/3). Sem SMTP configurado, registra
// no log e devolve ok:false — nenhum e-mail sai do servidor (no-op deliberado).
// Quando o SMTP chegar (pendência do parecer-acesso-enterprise), só o
// transportador em enviarEmail() muda; os templates já ficam prontos aqui.

type ResultadoEnvio = { ok: boolean; motivo?: string };

export function smtpConfigurado(): boolean {
  return Boolean(process.env.EMAIL_SMTP_HOST && process.env.EMAIL_SMTP_USER);
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function enviarEmail(
  destinatario: string,
  assunto: string,
  html: string
): Promise<ResultadoEnvio> {
  if (!smtpConfigurado()) {
    console.info(
      `[email] SMTP ausente — nada enviado. para=${destinatario} assunto="${assunto}" (${html.length}b)`
    );
    return { ok: false, motivo: "smtp_ausente" };
  }
  // Fase 3: transportador SMTP (nodemailer) entra aqui.
  console.info(`[email] transportador pendente — nada enviado. para=${destinatario}`);
  return { ok: false, motivo: "transportador_nao_implementado" };
}

export function templateConvite(
  nome: string,
  email: string
): { assunto: string; html: string } {
  const nomeSeguro = escaparHtml(nome || email);
  const emailSeguro = escaparHtml(email);
  return {
    assunto: "Seu acesso à equipe Nuvem de Papel foi criado",
    html: [
      `<p>Olá ${nomeSeguro},</p>`,
      `<p>Seu acesso à área da equipe Nuvem de Papel foi criado com o e-mail <strong>${emailSeguro}</strong>.</p>`,
      `<p>Use a senha que foi informada fora deste e-mail. Se precisar redefini-la, use “Esqueci a senha” na tela de login.</p>`,
    ].join(""),
  };
}
