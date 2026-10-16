/** Só aceita caminhos internos ("/x", não "//host" nem URLs) para não virar redirecionamento aberto. */
export function safeRedirect(target: string | undefined, fallback = '/dashboard'): string {
  return target?.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : fallback
}
