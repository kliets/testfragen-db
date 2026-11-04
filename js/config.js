// Einstellungen der Prüfungsbank.
// Ohne Supabase-Angaben läuft die App im Lokal-Modus (nur in diesem Browser, zum Ausprobieren).
// Mit Supabase-Angaben nutzen alle Kolleginnen und Kollegen dieselbe Datenbank.
window.PB_CONFIG = {
  SUPABASE_URL: "https://puvrdyliagpowojnxbez.supabase.co",        // z. B. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1dnJkeWxpYWdwb3dvam54YmV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MTUzODQsImV4cCI6MjEwOTM5MTM4NH0.V1NZPc_IYEfLgv2f2wTe6iplns1BbQzBcaOaCA6_pFY",   // "anon public"-Schlüssel aus Supabase (Project Settings > API)
  SHARED_EMAIL: "kli@katharineum.de", // der gemeinsame Zugang, den du in Supabase anlegst
  SCHOOL_NAME: "Katharineum"          // erscheint in der Kopfzeile der Prüfungen, kann pro Prüfung geändert werden
};
