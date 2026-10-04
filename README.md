# Irkam Media — site vitrine

Site vitrine one-page, en français, avec formulaire de contact **réellement
fonctionnel** : chaque demande est enregistrée en base **et** envoyée par
e-mail.

Site statique (HTML / CSS / JS natif, **aucune dépendance à l'exécution**, pas
d'étape de build) servi par un Worker Cloudflare qui n'expose qu'un point
d'entrée : `/api/contact`.

> **État actuel : prêt à être déployé, mais rien n'est encore déployé.**
> Aucune ressource Cloudflare n'a été créée. Le dépôt est configuré pour un
> déploiement Wrangler dès que vous aurez suivi [la procédure](#déploiement).

---

## Sommaire

- [Ce qui a changé](#ce-qui-a-changé)
- [Architecture](#architecture)
- [Formulaire de contact : où vont les données](#formulaire-de-contact--où-vont-les-données)
- [Déploiement](#déploiement)
- [Ajouter ou modifier les dépôts GitHub](#ajouter-ou-modifier-les-dépôts-github)
- [Scripts disponibles](#scripts-disponibles)
- [Travailler en local](#travailler-en-local)
- [Lire les demandes](#lire-les-demandes)
- [Structure du projet](#structure-du-projet)
- [Sécurité](#sécurité)
- [Contenu à personnaliser](#contenu-à-personnaliser)

---

## Ce qui a changé

| Avant | Après |
| --- | --- |
| Anglais | **Français intégral** (interface, `<title>`, Open Graph, JSON-LD, `lang="fr"`, messages du formulaire) |
| Thème sombre unique, codé en dur | **Thème clair par défaut + thème sombre**, sélecteur soigné, mémorisé dans `localStorage`, sans clignotement au chargement |
| `hello@irkammedia.com` | **irkammedia@gmail.com** + **0774227756** (page, pied de page, JSON-LD) |
| Aucune section GitHub | **Menu déroulant GitHub** + **section « Code ouvert »**, alimentés par un seul fichier de configuration |
| Budget : liste déroulante à fourchettes | **Champ texte libre** (montant, fourchette, ou « à définir ») |
| « Systems in production », missions clients | **« Des solutions que nous pouvons construire. »** — les 5 projets sont présentés comme **exemples / concepts**, avec encadré d'avertissement et badges « Concept » |
| Formulaire frontal sans effet | **Enregistrement D1 + e-mail Resend + accusé de réception**, avec repli `mailto:` si l'API est injoignable |

---

## Architecture

```
public/            Site statique — c'est ce qui est servi au navigateur
  index.html
  robots.txt
  assets/css/      core.css (jetons, reset, navbar, thème) · site.css (sections)
  assets/js/       main.js (comportements) · repos.js (config GitHub)
  assets/fonts/    Inter + Space Grotesk auto-hébergés
  assets/img/      favicon · couverture Open Graph

worker/
  index.js         Worker : /api/contact et /api/health
  schema.sql       Schéma de la table D1

wrangler.jsonc     Déploiement : assets statiques + liaison D1 + variables
package.json       Scripts de développement et de déploiement
.dev.vars.example  Exemple de configuration locale (clés secrètes)
.gitignore         node_modules, .wrangler, .dev.vars, exports de base
```

### Pourquoi cette architecture

- **Coût : 0 €/mois.** Sur le palier gratuit Cloudflare, les requêtes de
  fichiers statiques sont illimitées et sans frais de bande passante. Seul un
  `POST /api/contact` compte comme requête de fonction — il faudrait des
  dizaines de milliers de demandes par jour pour approcher la limite.
- **Pas de dépendance à l'exécution.** D1 est une liaison native du runtime
  Worker : `env.DB`. Resend s'appelle par `fetch`. Aucun `node_modules` n'est
  publié, et le site n'en a pas besoin pour fonctionner.
- **Base et e-mail sont découplés.** C'est le point le plus important, voir
  ci-dessous.

---

## Formulaire de contact : où vont les données

> **Réponse directe : les soumissions sont stockées dans une base de données ET
> envoyées par e-mail à `irkammedia@gmail.com`. L'e-mail n'est pas l'archive.**

### Ordre de traitement

| Étape | Action | Si elle échoue |
| --- | --- | --- |
| 1 | Contrôle de l'origine (anti-CSRF) | `403`, rien n'est enregistré |
| 2 | Pot de miel + vitesse de saisie (anti-robot) | `200` silencieux, **rien** n'est enregistré — le visiteur voit une confirmation |
| 3 | Validation côté serveur | `422`, liste des champs fautifs |
| 4 | Limitation du débit (5 demandes / IP / heure) | `429`, message explicite |
| 5 | **Insertion dans D1** | ↓ tentative d'e-mail malgré tout |
| 6 | E-mail de notification → `irkammedia@gmail.com` | journalisé ; **la demande reste en base** |
| 7 | Accusé de réception au demandeur | journalisé, sans conséquence |
| 8 | Réponse JSON au navigateur | — |

### Pourquoi c'est important

Si l'envoi d'e-mail échoue (quota Resend, incident réseau, domaine non
vérifié), **la demande est déjà en base** : rien n'est perdu. Inversement, si
l'écriture en base échoue mais que l'e-mail part, la réponse indique le cas
« e-mail uniquement ». Si les deux échouent, l'API renvoie `503` et le
navigateur ouvre automatiquement le client e-mail du visiteur avec les mêmes
informations pré-remplies — une demande réelle n'est jamais perdue en silence.

### Ce qui est enregistré

Table `contact_submissions` :

| Colonne | Contenu |
| --- | --- |
| `id`, `created_at` | Référence et horodatage UTC |
| `name`, `email`, `company` | Identité du contact |
| `project_type`, `budget`, `message` | Contenu de la demande |
| `ip_hash` | **Empreinte SHA-256 salée** de l'IP, jamais l'adresse en clair — sert à la limitation du débit |
| `user_agent` | Chaîne du navigateur, tronquée à 300 caractères |
| `email_delivered`, `email_id` | Traçabilité de l'envoi Resend |
| `status` | `0` nouvelle · `1` traitée · `2` perdue |

---

## Déploiement

Durée : environ 15 minutes, une seule fois. Toutes les commandes se lancent
depuis la racine du projet.

### Étape 0 — Prérequis

- Un compte Cloudflare gratuit — <https://dash.cloudflare.com> (plan *Workers
  Free*, 5 $/mois pour *Workers Paid* si vous souhaitez dépasser les quotas).
- Un compte Resend — <https://resend.com>.
- [Node.js 18+](https://nodejs.org) (vérifiez avec `node -v`).

### Étape 1 — Installer les dépendances et s'authentifier

```bash
npm install        # installe uniquement wrangler (devDependency)
npx wrangler login # ouvre le navigateur pour autoriser Wrangler
```

> Cette étape crée une ressource dans votre compte Cloudflare. Ne la sautez
> pas.

### Étape 2 — Créer la base D1

```bash
npm run db:create
```

La commande affiche un bloc `database_id`. **Ouvrez `wrangler.jsonc` et
remplacez `REMPLACER_PAR_L_IDENTIFIANT_D1` par cette valeur.** Sans cela, le
Worker ne pourra pas lire la base.

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "irkam-submissions",
    "database_id": "<votre-identifiant>"   // ← à remplacer
  }
]
```

Puis créez les tables :

```bash
npm run db:init
```

### Étape 3 — Configurer Resend

1. **Ajoutez et vérifiez votre domaine** `irkammedia.com` :
   *Domains → Add Domain*. Resend affiche des enregistrements DNS (SPF,
   DKIM…) à copier chez votre registrar.
   > Sans domaine vérifié, l'expéditeur `onboarding@resend.dev` ne peut
   > écrire qu'à l'adresse du titulaire du compte. Pour un envoi depuis
   > `irkammedia.com`, la vérification est obligatoire.
2. **Créez une clé API** : *API Keys → Create API Key*. Restreignez-la au
   domaine `irkammedia.com`.

### Étape 4 — Déclarer le secret Resend

```bash
npm run secret:resend   # ou : npx wrangler secret put RESEND_API_KEY
```

Collez la clé quand elle est demandée. **Elle n'est jamais inscrite dans le
dépôt.**

### Étape 5 — Renseigner le sel IP

Dans `wrangler.jsonc`, remplacez `REMPLACER_PAR_UN_SEL_ALEATOIRE` par une
valeur aléatoire :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Étape 6 — Vérifier la configuration avant déploiement

```bash
npm run check          # wrangler deploy --dry-run : compile et valide, sans rien déployer
```

### Étape 7 — Déployer

```bash
npm run deploy
```

Vous apprendrez l'URL du type `https://irkam-media.<sous-domaine>.workers.dev`.

### Étape 8 — Brancher le domaine

*Workers & Pages → irkam-media → Settings → Domains & Routes → Add Custom
Domain* → `irkammedia.com`.

Puis, dans `wrangler.jsonc`, adaptez si besoin :

```jsonc
"ALLOWED_ORIGIN": "https://irkammedia.com"
```

Redéployez ensuite (`npm run deploy`).

### Étape 9 — Tester de bout en bout

```bash
curl https://irkammedia.com/api/health
# attendu : {"ok":true,"service":"irkam-media"}
```

Puis envoyez une vraie demande depuis le site. Vérifiez **les deux** sorties :

```bash
npm run db:recent      # la demande doit apparaître dans la base
```

- **Ligne présente, e-mail reçu** → tout fonctionne.
- **Ligne présente, e-mail absent** → le problème est Resend (domaine non
  vérifié, clé invalide, quota). La demande n'est pas perdue ; les logs
  Workers indiquent l'erreur exacte.
- **Aucune ligne** → la liaison D1 est mal configurée (étape 2).

En cas de souci, suivez les logs en direct :

```bash
npm run logs
```

---

## Scripts disponibles

| Commande | Effet |
| --- | --- |
| `npm run dev` | Worker + site en local sur `http://localhost:8787` |
| `npm run deploy` | Déploie le Worker et les assets |
| `npm run check` | Validation à blanc — **aucun déploiement** |
| `npm run preview` | Exécution à distance, sans toucher à la production |
| `npm run logs` / `npm run tail` | Logs Workers en direct |
| `npm run db:create` | Crée la base D1 |
| `npm run db:init` | Crée les tables (production) |
| `npm run db:init:local` | Crée les tables (base locale) |
| `npm run db:recent` | 20 dernières demandes |
| `npm run secret:resend` | Déclare la clé API Resend |

---

## Ajouter ou modifier les dépôts GitHub

**Un seul fichier : `public/assets/js/repos.js`.** Il alimente à la fois le
menu déroulant de la navbar et la section « Code ouvert ». Aucun appel à l'API
GitHub n'est fait (donc aucune limite de débit, et un rendu instantané).

Entrées actuelles :

| Pointeur | Rôle |
| --- | --- |
| [@asmabelaidi](https://github.com/asmabelaidi) | Développeur |
| [@linahc](https://github.com/linahc) | Développeur |

### Ajouter une entrée

Dans `window.IRKAM_REPOS`, ajoutez un objet au tableau `repos` :

```js
repos: [
  {
    name: 'asmabelaidi',
    description: 'Développeur chez Irkam Media — profil GitHub, projets et contributions publiques.',
    url: 'https://github.com/asmabelaidi',
    featured: true
  },
  {
    name: 'mon-outil',
    description: 'Ce qu\'il fait, en une phrase.',
    language: 'TypeScript',            // facultatif
    topics: ['CLI', 'ETL'],            // facultatif
    url: 'https://github.com/utilisateur/mon-outil',
    featured: false                    // facultatif — `true` remonte en tête
  }
]
```

Seul `name` est obligatoire. Pour un dépôt précis, renseignez `url`. Pour un
profil, mettez l'URL du profil dans `url` et le pseudo dans `name`.

### Quand vous aurez un compte GitHub pour la société

Il n'existe pas encore de compte `github.com/irkammedia` : le lien « Voir
l'organisation » est donc **automatiquement masqué** et aucune adresse
inexistante n'apparaît sur le site.

Le jour où vous créez l'organisation, indiquez simplement :

```js
org: 'irkammedia',
```

Tous les liens seront alors déduits, et les entrées sans `url` seront
construites automatiquement (`org` + `name`).

---

## Travailler en local

**Aperçu visuel rapide** — le formulaire basculera sur le repli `mailto:`,
car `/api/contact` n'existe pas hors de Cloudflare :

```bash
python -m http.server 8000 --directory public
```

**Formulaire réellement opérationnel** :

```bash
cp .dev.vars.example .dev.vars   # renseigner RESEND_API_KEY
npm run db:init:local
npm run dev                      # → http://localhost:8787
```

---

## Lire les demandes

```bash
npm run db:recent
```

Ou directement :

```bash
npx wrangler d1 execute irkam-submissions --remote \
  --command "SELECT * FROM contact_submissions WHERE email = 'client@exemple.fr'"

npx wrangler d1 execute irkam-submissions --remote \
  --command "UPDATE contact_submissions SET status = 1 WHERE id = 42"
```

Les données sont aussi consultables et exportables depuis le tableau de bord
Cloudflare (*Workers & Pages → D1 → irkam-submissions*).

**Obligation légale (RGPD)** : ces données sont des données à caractère
personnel. Prévoyez une procédure de suppression et une durée de conservation,
puis inscrivez-le dans une politique de confidentialité.

---

## Sécurité

| Mesure | Où |
| --- | --- |
| Échappement HTML de toute donnée injectée dans un e-mail | `worker/index.js` |
| Suppression des caractères de contrôle — bloque l'injection d'en-têtes via CR/LF | `worker/index.js` (`clean`) |
| Validation et longueurs maximales appliquées **côté serveur** | `worker/index.js` |
| Contrôle de l'origine sur le `POST` | `worker/index.js` |
| Limitation du débit : 5 demandes / IP / heure | `worker/index.js` + D1 |
| Pot de miel + détection de saisie trop rapide | `index.html` + `worker/index.js` |
| IP stockée uniquement sous forme d'empreinte salée | `worker/index.js` |
| Clé API jamais exposée au navigateur (variable secrète) | `wrangler.jsonc` + `wrangler secret put` |
| Liens externes en `rel="noopener"` | `main.js`, `index.html` |
| Contenu GitHub échappé avant insertion en HTML | `main.js` |

> **Limite connue :** la limitation de débit ne compte que les demandes
> **validées et enregistrées**. Un robot qui envoie des données invalides est
> rejeté au stade de la validation, sans rien consommer. C'est volontaire : on
> ne veut pas polluer la base de contacts. Une règle WAF Cloudflare (offerte)
> au niveau de l'edge est le complément naturel si le site devait être ciblé.

---

## Contenu à personnaliser

| Quoi | Où |
| --- | --- |
| **Dépôts / profils GitHub** | `public/assets/js/repos.js` → `repos` |
| Année de création (`2019`) | `index.html` → `.about__panel` |
| `database_id`, `ALLOWED_ORIGIN`, `IP_SALT` | `wrangler.jsonc` |
| Adresse d'expédition | `wrangler.jsonc` → `RESEND_FROM` |
| Couverture Open Graph | `assets/img/og-cover.svg` — **à exporter en PNG 1200×630**, la plupart des réseaux refusant le SVG |
| Adresse canonical, Open Graph | `index.html` → `<head>` |

> **À faire avant la mise en ligne.** `og-cover.svg` est référencé comme
> `og:image`. Facebook, LinkedIn, X et WhatsApp n'afficheront pas la
> couverture tant qu'elle reste au format SVG.

### Accessibilité et performances

- Contrastes vérifiés : **≥ 4,5:1** en thème clair comme en thème sombre
  (le jaune `#ffcc00` atteint 13,2:1 sur fond sombre).
- Navigation au clavier complète, `aria-expanded` sur le menu GitHub, `Échap`
  referme et rend le focus au bouton.
- `prefers-reduced-motion` respecté (l'en-tête coupe toutes les animations).
- Polices auto-hébergées, **zéro requête tierce**, images générées en CSS.
- Aucun débordement horizontal de 320px à 1440px (vérifié).

---

## Licence

Code © Irkam Media. Tous droits réservés.