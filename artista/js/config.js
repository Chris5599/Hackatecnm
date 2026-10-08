/**
 * Configuración del Panel de Artistas.
 * Usa EL MISMO proyecto de Supabase que la app de clientes.
 * Supabase → Project Settings → API: Project URL y anon public key.
 */
window.SONORA_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU-ANON-KEY",

  // Reparto de cada pago: 95 % para la banda, el resto a la cooperación
  ARTIST_SHARE: 0.95,
  COOP_NAME: "Cooperación Sonora",

  // Explorador de bloques para la trazabilidad
  BLOCKCHAIN: {
    name: "Polygon Amoy",
    txUrl: "https://amoy.polygonscan.com/tx/",
    addressUrl: "https://amoy.polygonscan.com/address/",
  },
};
