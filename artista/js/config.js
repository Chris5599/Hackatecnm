/**
 * Configuración del Panel de Artistas.
 * Usa EL MISMO proyecto de Supabase que la app de clientes.
 * Supabase → Project Settings → API: Project URL y anon public key.
 */
window.SONORA_CONFIG = {
 SUPABASE_URL: "https://sqgjyqarhwwvdskhczlt.supabase.co",
SUPABASE_ANON_KEY: "sb_publishable_zeV55tBIUrke0V-Q3Av1uA_zXKJl6AB",

  // Reparto de cada pago: 95 % para la banda, el resto a la cooperación
  ARTIST_SHARE: 0.95,
  COOP_NAME: "Cooperación SoundOra",

  // Explorador de bloques para la trazabilidad
  BLOCKCHAIN: {
  name: "Base Sepolia",
  txUrl: "https://sepolia.basescan.org/tx/",
  addressUrl: "https://sepolia.basescan.org/address/",
},
};
