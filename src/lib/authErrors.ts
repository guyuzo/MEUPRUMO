// Traduz os códigos de erro do Supabase Auth para mensagens em português.
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Senha muito fraca. Use pelo menos 8 caracteres.',
  over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos.',
  same_password: 'A nova senha deve ser diferente da atual.',
}

export function authErrorMessage(error: { code?: string; message: string }): string {
  return (error.code && MESSAGES[error.code]) || 'Não foi possível concluir. Tente novamente.'
}
