-- =============================================================
--  Irkam Media — schéma de la base D1
--  Appliquer avec :
--    npx wrangler d1 execute irkam-submissions --file=./worker/schema.sql
--  (ajouter --remote pour la base en production)
-- =============================================================

-- Chaque demande de projet envoyée depuis le site est conservée ici.
-- C'est la SOURCE DE VÉRITÉ : l'e-mail est une notification, pas l'archive.
CREATE TABLE IF NOT EXISTS contact_submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL,
  company        TEXT,
  project_type   TEXT    NOT NULL,
  budget         TEXT,
  message        TEXT    NOT NULL,

  -- Empreinte salée de l'IP (jamais l'adresse en clair), utilisée pour
  -- la limitation du débit.
  ip_hash        TEXT,

  -- Chaîne d'identification du navigateur, tronquée à 300 caractères.
  user_agent     TEXT,

  -- Traçabilité de la livraison : 1 si l'e-mail Resend est parti.
  email_delivered INTEGER NOT NULL DEFAULT 0,
  email_id        TEXT,

  -- 0 = nouvelle, 1 = traitée, 2 = sans réponse / perdue
  status          INTEGER NOT NULL DEFAULT 0
);

-- Tri chronologique inverse (liste des demandes les plus récentes)
CREATE INDEX IF NOT EXISTS idx_contact_created
  ON contact_submissions (created_at DESC);

-- Limitation du débit : compter les demandes d'une IP sur une fenêtre
CREATE INDEX IF NOT EXISTS idx_contact_ip_window
  ON contact_submissions (ip_hash, created_at);

-- Retrouver toutes les demandes d'un même contact
CREATE INDEX IF NOT EXISTS idx_contact_email
  ON contact_submissions (email);