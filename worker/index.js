/* =============================================================
   Irkam Media — worker/index.js

   Point d'entrée unique du Worker Cloudflare :
     • GET  /api/health  → vérification de disponibilité
     • POST /api/contact → traitement d'une demande de projet

   Chaîne de traitement d'une soumission :

     1. contrôle de l'origine (anti-CORS)
     2. rejet silencieux des robots (pot de miel + vitesse de saisie)
     3. validation côté serveur — le client n'est jamais présumé fiable
     4. limitation du débit par IP
     5. ENREGISTREMENT DANS D1  ← source de vérité de la demande
     6. e-mail de notification via Resend → irkammedia@gmail.com
     7. accusé de réception au demandeur
     8. réponse JSON

   Règle de non-perte : si l'écriture en base échoue, l'e-mail est
   tout de même tenté ; et si l'API est totalement injoignable, le
   navigateur bascule sur un brouillon mailto: (voir main.js).
   ============================================================= */

/* ---------- Configuration ---------- */
const CONFIG = {
  contactEmail: 'irkammedia@gmail.com',
  studioName: 'Irkam Media',
  /* Adresse d'expédition. DOIT appartenir à un domaine vérifié dans
     votre tableau de bord Resend. Surchargeable par la variable
     d'environnement RESEND_FROM. */
  fromAddress: 'Irkam Media <no-reply@irkammedia.com>',
  siteUrl: 'https://irkammedia.com/'
};

const LIMITS = {
  name: 120,
  email: 254,
  company: 160,
  type: 80,
  budget: 120,
  message: 5000
};

/* Limitation du débit : 5 demandes enregistrées par IP et par heure. */
const RATE_LIMIT = { max: 5, windowMinutes: 60 };

/* Envoi en moins de 3 s après affichage du formulaire → robot. */
const MIN_FILL_MS = 3000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/health') {
        return json({ ok: true, service: 'irkam-media' });
      }

      if (url.pathname === '/api/contact') {
        if (request.method !== 'POST') {
          return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
        }
        return await handleContact(request, env);
      }

      /* Tout le reste : fichiers statiques servis par Cloudflare.
         S'ils n'existent pas, le Worker n'a rien à dire. */
      return json({ ok: false, error: 'Introuvable.' }, 404);
    } catch (err) {
      console.error('Erreur non gérée :', err && err.stack ? err.stack : err);
      return json(
        { ok: false, error: 'Une erreur interne est survenue. Merci de réessayer dans un instant.' },
        500
      );
    }
  }
};

/* =============================================================
   Gestion de la soumission
   ============================================================= */
async function handleContact(request, env) {
  /* --- 1. Origine : uniquement le site lui-même --- */
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request, env)) {
    return json({ ok: false, error: 'Origine non autorisée.' }, 403);
  }

  /* --- 2. Corps de la requête --- */
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Requête invalide.' }, 400);
  }

  if (!data || typeof data !== 'object') {
    return json({ ok: false, error: 'Requête invalide.' }, 400);
  }

  /* --- 3. Filtres anti-robot ---
     Le demandeur reçoit volontairement une confirmation positive :
     un robot n'a rien à y perdre, un humain ne perd jamais son message. */
  if (clean(data.website, 200)) {
    return json({ ok: true, message: successMessage() });
  }

  const stamp = Number(data._t);
  if (Number.isFinite(stamp) && Date.now() - stamp < MIN_FILL_MS) {
    return json({ ok: true, message: successMessage() });
  }

  /* --- 4. Validation côté serveur --- */
  const fields = {
    name: clean(data.name, LIMITS.name),
    email: clean(data.email, LIMITS.email).toLowerCase(),
    company: clean(data.company, LIMITS.company),
    type: clean(data.type, LIMITS.type),
    budget: clean(data.budget, LIMITS.budget),
    message: clean(data.message, LIMITS.message)
  };

  const errors = [];
  if (fields.name.length < 2) errors.push('name');
  if (!isEmail(fields.email)) errors.push('email');
  if (!fields.type) errors.push('type');
  if (fields.message.length < 20) errors.push('message');

  if (errors.length) {
    return json({ ok: false, error: 'Certains champs sont invalides.', fields: errors }, 422);
  }

  /* --- 5. Limitation du débit --- */
  const ip = clientIp(request);
  const ipHash = ip ? await hashWithSalt(ip, env.IP_SALT || CONFIG.contactEmail) : 'inconnu';

  const db = env.DB;
  if (db) {
    try {
      const recent = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM contact_submissions
            WHERE ip_hash = ? AND created_at > datetime('now', ?)`
        )
        .bind(ipHash, `-${RATE_LIMIT.windowMinutes} minutes`)
        .first();

      if (recent && Number(recent.n) >= RATE_LIMIT.max) {
        return json(
          {
            ok: false,
            error:
              `Trop de demandes envoyées depuis cet appareil. Merci de réessayer dans une heure, ` +
              `ou de nous écrire directement à ${CONFIG.contactEmail}.`
          },
          429
        );
      }
    } catch (err) {
      /* Ne pas bloquer la demande si le compteur est indisponible */
      console.error('Limitation de débit indisponible :', err);
    }
  }

  const emailOk = Boolean(env.RESEND_API_KEY);
  const contactEmail = env.CONTACT_EMAIL || CONFIG.contactEmail;
  const from = env.RESEND_FROM || CONFIG.fromAddress;

  /* --- 6. ENREGISTREMENT EN BASE (source de vérité) --- */
  let stored = false;
  let rowId = null;

  if (db) {
    try {
      const result = await db
        .prepare(
          `INSERT INTO contact_submissions
             (name, email, company, project_type, budget, message, ip_hash, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          fields.name,
          fields.email,
          fields.company || null,
          fields.type,
          fields.budget || null,
          fields.message,
          ipHash,
          clean(request.headers.get('User-Agent') || '', 300) || null
        )
        .run();

      stored = true;
      rowId = result && result.meta ? result.meta.last_row_id : null;
    } catch (err) {
      console.error("ÉCHEC DE L'ENREGISTREMENT EN BASE :", err);
    }
  }

  /* --- 7. E-mails --- */
  let delivered = false;
  let mailError = null;

  if (emailOk) {
    try {
      await sendNotification(env, { fields, contactEmail, from, rowId, ip });
      delivered = true;
    } catch (err) {
      mailError = err;
      console.error("ÉCHEC DE L'E-MAIL DE NOTIFICATION :", err);
    }

    /* Accusé de réception au demandeur : « au mieux », son échec
       n'invalide pas la demande. */
    try {
      await sendConfirmation(env, { fields, from });
    } catch (err) {
      console.error("Échec de l'accusé de réception :", err);
    }
  }

  /* --- 8. Réponse --- */
  if (stored) {
    return json({ ok: true, stored: true, delivered, message: successMessage() });
  }

  /* Rien en base : la demande ne survivrait pas. Si l'e-mail est
     parti, elle n'est pas perdue ; sinon on renvoie une erreur pour
     que le navigateur propose le brouillon mailto:. */
  if (delivered) {
    return json({ ok: true, stored: false, delivered: true, message: successMessage() });
  }

  console.error('Stockage et e-mail indisponibles.', mailError);
  return json(
    { ok: false, error: 'Service temporairement indisponible. Merci de réessayer dans un instant.' },
    503
  );
}

/* =============================================================
   E-mails (Resend)
   ============================================================= */
async function sendNotification(env, { fields, contactEmail, from, rowId, ip }) {
  const subject = `Nouvelle demande de projet — ${fields.type}`;

  const rows = [
    ['Nom', fields.name],
    ['E-mail', fields.email],
    ['Société', fields.company || '—'],
    ['Type de projet', fields.type],
    ['Budget', fields.budget || '— non précisé —']
  ];

  const html =
    emailShell(
      CONFIG.studioName,
      '<h1 style="margin:0 0 20px;font:700 21px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0a0b">Nouvelle demande de projet</h1>' +
        table(rows) +
        '<div style="margin-top:24px;padding:14px 16px;background:#f6f6f7;border-left:3px solid #ffcc00;border-radius:6px">' +
        '<div style="font:600 12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:#6b7078;margin-bottom:6px">Message</div>' +
        `<div style="font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#383b40;white-space:pre-wrap">${escapeHtml(fields.message)}</div>` +
        '</div>' +
        (rowId
          ? `<p style="margin:24px 0 0;font:400 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8f959d">Référence : #${escapeHtml(String(rowId))}${ip ? ` · IP ${escapeHtml(ip)}` : ''}</p>`
          : '')
    );

  const text =
    'Nouvelle demande de projet\n\n' +
    rows.map(([k, v]) => `${k} : ${v}`).join('\n') +
    '\n\nMessage :\n' +
    fields.message +
    (rowId ? `\n\nRéférence : #${rowId}` : '') +
    `\n\nEnvoyé depuis ${CONFIG.siteUrl}`;

  const res = await resend(env, {
    from,
    to: [contactEmail],
    reply_to: fields.email,
    subject,
    html,
    text
  });

  if (!res.ok) throw new Error(`Resend a refusé l'envoi : ${res.status} ${res.body}`);
}

async function sendConfirmation(env, { fields, from }) {
  const subject = 'Nous avons bien reçu votre demande';

  const html =
    emailShell(
      CONFIG.studioName,
      '<h1 style="margin:0 0 20px;font:700 21px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0a0b">' +
        `Merci, ${escapeHtml(fields.name)}.</h1>` +
        '<p style="margin:0 0 16px;font:400 15px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#383b40">' +
        'Votre demande a bien été enregistrée et nous revenons vers vous sous un jour ouvré.' +
        '</p>' +
        table([
          ['Type de projet', fields.type],
          ['Budget', fields.budget || '— non précisé —']
        ]) +
        '<p style="margin:24px 0 0;font:400 15px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#383b40">' +
        'Une question urgente ? Répondez simplement à cet e-mail ou appelez-nous au ' +
        '<a href="tel:0774227756" style="color:#8a6a00">0774227756</a>.</p>'
    );

  const text =
    `Bonjour ${fields.name},\n\n` +
    'Votre demande a bien été enregistrée. Nous revenons vers vous sous un jour ouvré.\n\n' +
    `Type de projet : ${fields.type}\n` +
    `Budget : ${fields.budget || '— non précisé —'}\n\n` +
    'Une question urgente ? Répondez à cet e-mail ou appelez le 0774227756.\n\n' +
    `— L'équipe ${CONFIG.studioName}`;

  const res = await resend(env, {
    from,
    to: [fields.email],
    reply_to: env.CONTACT_EMAIL || CONFIG.contactEmail,
    subject,
    html,
    text
  });

  if (!res.ok) console.error(`Accusé de réception refusé : ${res.status} ${res.body}`);
}

async function resend(env, payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

/* =============================================================
   Gabarit d'e-mail — mise en page par tables et styles inline,
   seule approche fiabilisée par les clients e-mail.
   ============================================================= */
function emailShell(title, inner) {
  return (
    '<!DOCTYPE html>\n' +
    '<html lang="fr"><head><meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<meta name="color-scheme" content="light only">\n' +
    `<title>${escapeHtml(title)}</title></head>\n` +
    '<body style="margin:0;padding:0;background:#f6f6f7">\n' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">Votre demande a bien été reçue.</div>\n' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7">\n' +
    '<tr><td align="center" style="padding:28px 16px">\n' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e7e9">\n' +
    '<tr><td style="height:5px;background:#ffcc00;font-size:0;line-height:0">&nbsp;</td></tr>\n' +
    '<tr><td style="padding:28px 28px 8px">\n' +
    '<span style="font:700 15px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0a0b">Irkam<span style="color:#8a6a00">Media</span></span>\n' +
    '</td></tr>\n' +
    `<tr><td style="padding:12px 28px 28px">${inner}</td></tr>\n` +
    '</table>\n' +
    '<p style="max-width:600px;margin:16px auto 0;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8f959d;text-align:center">\n' +
    `${escapeHtml(CONFIG.studioName)} · <a href="${CONFIG.siteUrl}" style="color:#8f959d">${escapeHtml(CONFIG.siteUrl.replace(/^https?:\/\//, ''))}</a>\n` +
    '</p>\n' +
    '</td></tr></table>\n' +
    '</body></html>'
  );
}

function table(rows) {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">' +
    rows
      .map(
        ([k, v]) =>
          '<tr>' +
          '<td style="padding:9px 0;border-bottom:1px solid #f0f1f2;font:600 12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:#6b7078;white-space:nowrap;vertical-align:top;padding-right:16px">' +
          escapeHtml(k) +
          '</td>' +
          '<td style="padding:9px 0;border-bottom:1px solid #f0f1f2;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a0a0b">' +
          escapeHtml(v) +
          '</td></tr>'
      )
      .join('') +
    '</table>'
  );
}

/* =============================================================
   Utilitaires
   ============================================================= */
function successMessage() {
  return 'Merci — votre demande est bien enregistrée. Un accusé de réception vient de vous être envoyé par e-mail et nous répondons sous un jour ouvré.';
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

/* Retire les caractères de contrôle (code < 32 et 127) — notamment
   CR/LF, qui permettraient d'injecter des en-têtes d'e-mail ou de
   corrompre la mise en page du message. Écrit sous forme de boucle
   plutôt que de motif, pour rester explicite. */
function clean(value, max) {
  if (typeof value !== 'string') return '';

  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    out += code < 32 || code === 127 ? ' ' : value[i];
  }

  return out.trim().slice(0, max);
}

function isEmail(value) {
  return value.length <= LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isAllowedOrigin(origin, request, env) {
  if (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN === origin) return true;

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function clientIp(request) {
  const forwarded = request.headers.get('X-Forwarded-For');
  const first = forwarded ? forwarded.split(',')[0] : null;
  return request.headers.get('CF-Connecting-IP') || (first ? first.trim() : 'inconnu');
}

/* Hachage salé de l'IP : aucune adresse n'est conservée en clair. */
async function hashWithSalt(value, salt) {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}