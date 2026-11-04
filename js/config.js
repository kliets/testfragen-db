// Einstellungen der Prüfungsbank.
// Ohne Supabase-Angaben läuft die App im Lokal-Modus (nur in diesem Browser, zum Ausprobieren).
// Mit Supabase-Angaben nutzen alle Kolleginnen und Kollegen dieselbe Datenbank.
window.PB_CONFIG = {
  SUPABASE_URL: "",        // z. B. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",   // "anon public"-Schlüssel aus Supabase (Project Settings > API)
  SHARED_EMAIL: "lehrkraefte@schule.example", // der gemeinsame Zugang, den du in Supabase anlegst
  SCHOOL_NAME: ""          // erscheint in der Kopfzeile der Prüfungen, kann pro Prüfung geändert werden
};
