import { defineMessages } from "@/lib/i18n/messages"

export const auth = defineMessages({
  "en-US": {
    headline: { lead: "Long streams in.", accent: "Short clips out." },
    form: {
      signin: {
        title: "Sign in",
        lede: "Welcome back. Your projects are where you left them.",
        cta: "Sign in",
        form: "Sign in with email",
      },
      signup: {
        title: "Create account",
        lede: "Make an account and drop in your first recording.",
        cta: "Create account",
        form: "Create account with email",
      },
      modeSwitch: "Sign in or create an account",
      continueWith: (provider: string) => `Continue with ${provider}`,
      orEmail: "or with email",
      name: "Name",
      namePlaceholder: "How the crew should call you",
      email: "Email",
      emailPlaceholder: "you@studio.com",
      password: "Password",
      forgot: "Forgot it?",
      passwordPlaceholder: "Your password",
      newPasswordPlaceholder: "At least 10 characters",
      pending: "One moment…",
      privacy: "Your recordings stay private until you export them.",
    },
    glimpse: { webcam: "Webcam found · laid out on top" },
    twoFactor: {
      title: "Two-step verification",
      codeLede: "Enter the 6-digit code from your authenticator app.",
      backupLede: "Enter one of the backup codes you saved.",
      form: "Verify sign-in",
      code: "Code",
      backupCode: "Backup code",
      trust: "Trust this device for 30 days",
      pending: "Checking…",
      verify: "Verify",
      useBackup: "Use a backup code",
      useCode: "Use the authenticator code",
    },
    forgot: {
      metaTitle: "Reset password",
      title: "Reset your password",
      lede: "We'll make a one-time link to set a new one.",
      form: "Reset password",
      email: "Email",
      pending: "One moment…",
      submit: "Make a reset link",
      back: "Back to sign in",
      sentTitle: "Check the server log",
      sentLede:
        "nimbus runs on your machine and doesn't send email. If that address has an account, the reset link was written to the server log.",
    },
    reset: {
      metaTitle: "New password",
      title: "Choose a new password",
      lede: "Other sessions are signed out.",
      form: "Set a new password",
      password: "New password",
      hint: "At least 10 characters.",
      pending: "Saving…",
      submit: "Set password",
      invalidTitle: "This link isn't valid",
      invalidLede: "Ask for a new reset link and use it within an hour.",
      newLink: "Make a new link",
    },
    errors: {
      failed: "That didn't work.",
      failedRetry: "That didn't work. Try again.",
      rateLimited: "Too many requests. Please try again later.",
      codes: {
        INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
        INVALID_EMAIL: "Invalid email",
        INVALID_PASSWORD: "Invalid password",
        USER_ALREADY_EXISTS: "User already exists.",
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
          "User already exists. Use another email.",
        PASSWORD_TOO_SHORT: "Password too short",
        PASSWORD_TOO_LONG: "Password too long",
        INVALID_TOKEN: "Invalid token",
        TOKEN_EXPIRED: "Token expired",
        PROVIDER_NOT_FOUND: "Provider not found",
        INVALID_CODE: "Invalid code",
        INVALID_BACKUP_CODE: "Invalid backup code",
        TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
          "Too many attempts. Please request a new code.",
        ACCOUNT_TEMPORARILY_LOCKED:
          "Too many failed verification attempts. Your account is temporarily locked. Please try again later.",
        INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
      },
    },
  },
  "pt-BR": {
    headline: { lead: "Entra live longa.", accent: "Sai corte curto." },
    form: {
      signin: {
        title: "Entrar",
        lede: "Que bom te ver de novo. Seus projetos estão onde você deixou.",
        cta: "Entrar",
        form: "Entrar com e-mail",
      },
      signup: {
        title: "Criar conta",
        lede: "Crie uma conta e solte sua primeira gravação.",
        cta: "Criar conta",
        form: "Criar conta com e-mail",
      },
      modeSwitch: "Entrar ou criar uma conta",
      continueWith: (provider: string) => `Continuar com ${provider}`,
      orEmail: "ou com e-mail",
      name: "Nome",
      namePlaceholder: "Como a galera te chama",
      email: "E-mail",
      emailPlaceholder: "voce@estudio.com",
      password: "Senha",
      forgot: "Esqueceu?",
      passwordPlaceholder: "Sua senha",
      newPasswordPlaceholder: "Pelo menos 10 caracteres",
      pending: "Um momento…",
      privacy: "Suas gravações ficam privadas até você exportar.",
    },
    glimpse: { webcam: "Webcam encontrada · posicionada no topo" },
    twoFactor: {
      title: "Verificação em duas etapas",
      codeLede: "Digite o código de 6 dígitos do seu app autenticador.",
      backupLede: "Digite um dos códigos de backup que você guardou.",
      form: "Verificar acesso",
      code: "Código",
      backupCode: "Código de backup",
      trust: "Confiar neste dispositivo por 30 dias",
      pending: "Verificando…",
      verify: "Verificar",
      useBackup: "Usar um código de backup",
      useCode: "Usar o código do autenticador",
    },
    forgot: {
      metaTitle: "Redefinir senha",
      title: "Redefina sua senha",
      lede: "A gente gera um link de uso único para você criar uma nova.",
      form: "Redefinir senha",
      email: "E-mail",
      pending: "Um momento…",
      submit: "Gerar link de redefinição",
      back: "Voltar para entrar",
      sentTitle: "Confira o log do servidor",
      sentLede:
        "O nimbus roda na sua máquina e não envia e-mail. Se esse endereço tiver uma conta, o link de redefinição foi gravado no log do servidor.",
    },
    reset: {
      metaTitle: "Nova senha",
      title: "Escolha uma nova senha",
      lede: "As outras sessões são encerradas.",
      form: "Definir uma nova senha",
      password: "Nova senha",
      hint: "Pelo menos 10 caracteres.",
      pending: "Salvando…",
      submit: "Definir senha",
      invalidTitle: "Este link não é válido",
      invalidLede: "Peça um novo link de redefinição e use em até uma hora.",
      newLink: "Gerar um novo link",
    },
    errors: {
      failed: "Não deu certo.",
      failedRetry: "Não deu certo. Tente de novo.",
      rateLimited: "Muitas tentativas. Tente de novo mais tarde.",
      codes: {
        INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha inválidos",
        INVALID_EMAIL: "E-mail inválido",
        INVALID_PASSWORD: "Senha inválida",
        USER_ALREADY_EXISTS: "Já existe uma conta com esse e-mail.",
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
          "Já existe uma conta com esse e-mail. Use outro.",
        PASSWORD_TOO_SHORT: "Senha curta demais",
        PASSWORD_TOO_LONG: "Senha longa demais",
        INVALID_TOKEN: "Link inválido ou expirado",
        TOKEN_EXPIRED: "Link expirado",
        PROVIDER_NOT_FOUND: "Esse provedor não está disponível",
        INVALID_CODE: "Código inválido",
        INVALID_BACKUP_CODE: "Código de backup inválido",
        TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
          "Muitas tentativas. Peça um novo código.",
        ACCOUNT_TEMPORARILY_LOCKED:
          "Muitas tentativas de verificação. Sua conta está bloqueada temporariamente. Tente de novo mais tarde.",
        INVALID_TWO_FACTOR_COOKIE:
          "A verificação expirou. Entre de novo para receber outra.",
      },
    },
  },
})

type AuthErrors = (typeof auth)["en-US"]["errors"]

export type AuthClientError = {
  code?: string
  status?: number
  message?: string
}

export function authErrorMessage(
  errors: AuthErrors,
  error: AuthClientError,
  fallback: "failed" | "failedRetry" = "failedRetry"
) {
  if (error.code && Object.hasOwn(errors.codes, error.code))
    return errors.codes[error.code as keyof AuthErrors["codes"]]
  if (error.status === 429) return errors.rateLimited
  return errors[fallback]
}
