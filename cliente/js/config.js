/**
 * Configuración de Supabase
 * Encuéntralos en: Supabase → Project Settings → API
 *  - Project URL
 *  - anon public key  (es segura para el navegador; la protección real está en RLS)
 */
window.SONORA_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU-ANON-KEY",

  // Reparto de cada pago: 95 % para la banda o artista, el resto a la cooperación
  ARTIST_SHARE: 0.95,
  COOP_NAME: "Cooperación Sonora",
};
