/* =============================================================
   Irkam Media — main.js
   JavaScript natif, sans dépendance. Chaque fonctionnalité est
   une amélioration progressive : la page fonctionne entièrement
   sans JS.
   ============================================================= */
(function () {
  'use strict';

  document.documentElement.classList.remove('no-js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DESKTOP = '(min-width: 1061px)';

  /* ---------- Helpers ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* =============================================================
     1. THÈME CLAIR / SOMBRE
     Le thème par défaut est le thème clair (attribut data-theme
     présent sur <html> et jetons définis sur :root). Cette section
     ne fait que basculer et mémoriser le choix.
     ============================================================= */
  var THEME_KEY = 'irkam-theme';
  var THEME_COLOR = { light: '#ffffff', dark: '#08090a' };
  var root = document.documentElement;

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);

    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* stockage indisponible */ }
    }

    var meta = $('#themeColor');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);

    var btn = $('#themeToggle');
    if (btn) {
      var next = theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', 'Passer en thème ' + (next === 'dark' ? 'sombre' : 'clair'));
      btn.setAttribute('title', 'Passer en thème ' + (next === 'dark' ? 'sombre' : 'clair'));
    }
  }

  /* Aligne le bouton et la couleur du navigateur sur le thème déjà
     présent dans le DOM (appliqué par le script en ligne du <head>) */
  applyTheme(currentTheme(), false);

  var themeBtn = $('#themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  /* =============================================================
     2. NAVBAR — état collant, tiroir mobile, lien actif
     ============================================================= */
  var nav      = $('#nav');
  var toggle   = $('#navToggle');
  var links    = $('#navLinks');
  var scrim    = $('#navScrim');

  /* Fond collant */
  var onScroll = function () {
    if (!nav) return;
    nav.classList.toggle('is-stuck', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Tiroir mobile */
  function setMenu(open) {
    if (!nav || !links || !toggle) return;
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('is-locked', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');

    if (scrim) {
      if (open) {
        scrim.hidden = false;
        requestAnimationFrame(function () { scrim.classList.add('is-visible'); });
      } else {
        scrim.classList.remove('is-visible');
        window.setTimeout(function () { scrim.hidden = true; }, 320);
      }
    }
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
  }
  if (scrim) scrim.addEventListener('click', function () { setMenu(false); });

  /* Refermer le tiroir après avoir choisi un lien */
  $$('a', links).forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav && nav.classList.contains('is-open')) {
      setMenu(false);
      toggle.focus();
    }
  });

  /* Réinitialiser l'état en repassant en affichage large */
  var deskQuery = window.matchMedia(DESKTOP);
  var onDeskChange = function (e) { if (e.matches) setMenu(false); };
  if (deskQuery.addEventListener) deskQuery.addEventListener('change', onDeskChange);
  else if (deskQuery.addListener) deskQuery.addListener(onDeskChange);

  /* Mise en évidence de la section active */
  var sections = $$('main section[id]');
  var navAnchors = $$('.nav__links > ul > li > a');

  function setActive(id) {
    navAnchors.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + id;
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* =============================================================
     3. MENU DÉROULANT GITHUB
     Souris, clavier (Échap / Tab) et fermeture au clic extérieur.
     ============================================================= */
  var ghDrop = $('#ghDrop');
  var ghBtn  = $('#ghBtn');

  function setDrop(open) {
    if (!ghDrop || !ghBtn) return;
    ghDrop.classList.toggle('is-open', open);
    ghBtn.setAttribute('aria-expanded', String(open));
  }

  if (ghDrop && ghBtn) {
    /* Souris : le survol suffit à ouvrir et refermer.
       Tactile / sans survol : le bouton bascule l'état.
       `detail === 0` distingue une activation clavier (Entrée / Espace)
       d'un clic de pointeur, qui doit rester ignoré sur bureau pour ne
       pas refermer instantanément le menu que le survol vient d'ouvrir. */
    var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');

    ghBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var keyboard = e.detail === 0;
      if (hoverCapable.matches && !keyboard) return;
      setDrop(ghBtn.getAttribute('aria-expanded') !== 'true');
    });

    /* Survol à la souris */
    ghDrop.addEventListener('mouseenter', function () {
      if (hoverCapable.matches) setDrop(true);
    });
    ghDrop.addEventListener('mouseleave', function () {
      if (hoverCapable.matches) setDrop(false);
    });

    /* Fermeture au clic en dehors */
    document.addEventListener('click', function (e) {
      if (!ghDrop.contains(e.target)) setDrop(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ghDrop.classList.contains('is-open')) {
        setDrop(false);
        ghBtn.focus();
      }
    });

    /* Refermé si l'on repasse en affichage large */
    var onDropResize = function (e) { if (e.matches) setDrop(false); };
    if (deskQuery.addEventListener) deskQuery.addEventListener('change', onDropResize);
    else if (deskQuery.addListener) deskQuery.addListener(onDropResize);
  }

  /* =============================================================
     4. DÉPÔTS GITHUB — rendus depuis assets/js/repos.js
     ============================================================= */
  (function renderRepos() {
    /* Échappement — les données proviennent d'un fichier versionné,
       mais on ne fait jamais confiance à une saisie pour innerHTML */
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function escapeAttr(s) {
      return escapeHtml(s).replace(/javascript:/gi, '');
    }

    var cfg = window.IRKAM_REPOS;
    if (!cfg) return;

    var org = (cfg.org || '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
    var profile = (cfg.profile || '').trim();

    /* Aucun compte pour la société pour l'instant : on masque purement et
       simplement le lien « Voir l'organisation » plutôt que de pointer vers
       une organisation inexistante. */
    if (!profile && org) profile = 'https://github.com/' + org;

    /* Normalisation : champs manquants tolérés, liens déduits de l'org */
    var repos = (Array.isArray(cfg.repos) ? cfg.repos : [])
      .filter(function (r) { return r && r.name; })
      .map(function (r) {
        var name = String(r.name).trim();
        return {
          name: name,
          description: (r.description || '').trim(),
          language: (r.language || '').trim(),
          topics: Array.isArray(r.topics) ? r.topics : [],
          url: r.url || (org ? profile + '/' + name : ''),
          featured: !!r.featured
        };
      })
      /* `featured` d'abord, puis l'ordre de déclaration */
      .sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });

    var profileLink = $('#ghProfile');
    if (profileLink) {
      if (profile) {
        profileLink.setAttribute('href', profile);
        profileLink.removeAttribute('hidden');
      } else {
        /* Pas d'organisation : on retire le lien de l'accessibilité comme
           de l'affichage. */
        profileLink.setAttribute('hidden', '');
        profileLink.setAttribute('href', '#github');
      }
    }

    var emptyMsg = 'Aucun dépôt à afficher pour le moment.';
    var GITHUB_ICON =
      '<svg class="repo__icon" viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true">' +
      '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38l-.01-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

    /* ---- Menu déroulant de la navbar ---- */
    var menuList = $('#ghMenuList');
    if (menuList) {
      if (repos.length) {
        menuList.innerHTML = repos.map(function (r) {
          return '<li><a href="' + escapeAttr(r.url) + '" target="_blank" rel="noopener">' +
                   '<span>' + escapeHtml(r.name) + '</span>' +
                   (r.language ? '<span class="nav__drop-lang">' + escapeHtml(r.language) + '</span>' : '') +
                 '</a></li>';
        }).join('');
      } else {
        menuList.innerHTML = '<li class="nav__drop-empty">' + emptyMsg + '</li>';
      }
    }

    /* ---- Section « Code ouvert » ---- */
    var grid = $('#repoGrid');
    if (grid) {
      if (repos.length) {
        grid.innerHTML = repos.map(function (r) {
          var topics = r.topics.length
            ? ' · ' + r.topics.map(escapeHtml).join(' · ')
            : '';
          return '<a class="repo" href="' + escapeAttr(r.url) + '" target="_blank" rel="noopener">' +
                   '<span class="repo__head">' + GITHUB_ICON +
                     '<span class="repo__name">' + escapeHtml(r.name) + '</span>' +
                   '</span>' +
                   (r.description ? '<span class="repo__text">' + escapeHtml(r.description) + '</span>' : '<span class="repo__text"></span>') +
                   '<span class="repo__foot">' +
                     (r.language
                       ? '<span class="repo__lang">' + escapeHtml(r.language) + topics + '</span>'
                       : '<span class="repo__lang">' + topics.replace(/^ · /, '') + '</span>') +
                     '<svg class="repo__arrow" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
                       '<path d="M2 8h11M9 4l4 4-4 4" stroke-linecap="square"/></svg>' +
                   '</span>' +
                 '</a>';
        }).join('');
      } else {
        grid.innerHTML = '<p class="repos__empty">' + emptyMsg + '</p>';
      }
    }
  })();

  /* =============================================================
     5. RÉVÉLATION AU DÉFILEMENT
     ============================================================= */
  var reveals = $$('.reveal');

  /* Reporter le décalage data-delay sur une propriété personnalisée CSS */
  reveals.forEach(function (el) {
    var d = el.getAttribute('data-delay');
    if (d) el.style.setProperty('--d', d);
  });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        obs.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* =============================================================
     6. COMPTEURS
     ============================================================= */
  var counters = $$('[data-count]');

  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';

    if (reduceMotion) { el.textContent = prefix + target + suffix; return; }

    var dur = 1400;
    var start = performance.now();

    function tick(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);          /* easeOutCubic */
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (counters.length) {
    if (!('IntersectionObserver' in window)) {
      counters.forEach(runCount);
    } else {
      var cio = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          runCount(en.target);
          obs.unobserve(en.target);
        });
      }, { threshold: 0.6 });
      counters.forEach(function (el) { cio.observe(el); });
    }
  }

  /* =============================================================
     7. BANDEAU DE TECHNOLOGIES — dupliquer la liste pour la boucle
     ============================================================= */
  var track = $('#marqueeTrack');
  if (track) {
    var group = $('.marquee__group', track);
    if (group && !reduceMotion) {
      /* 2 copies => translateX(-50%) boucle parfaitement */
      for (var i = 0; i < 2; i++) {
        track.appendChild(group.cloneNode(true));
      }
      /* Les copies sont décoratives — masquées aux technologies d'assistance */
      Array.prototype.slice.call(track.children).forEach(function (child, idx) {
        if (idx > 0) child.setAttribute('aria-hidden', 'true');
      });
    }
  }

  /* =============================================================
     8. FORMULAIRE DE CONTACT

     Les soumissions sont envoyées à POST /api/contact, qui :
       1. les enregistre dans la base D1 (source de vérité),
       2. envoie un e-mail de notification via Resend,
       3. renvoie un accusé de réception au demandeur.
     Voir README.md pour la configuration et le stockage.

     Si l'API est indisponible (site ouvert en local, par exemple),
     on bascule sur un brouillon mailto: afin de ne jamais perdre
     une demande.

     Le pot de miel et le contrôle de vitesse sont appliqués côté
     SERVEUR : le visiteur reçoit toujours une confirmation, ce qui
     évite qu'une saisie légitime mais rapide soit prise pour un bot.
     ============================================================= */
  var FORM_ENDPOINT = '/api/contact';
  var EMAIL_FALLBACK = 'irkammedia@gmail.com';

  var form    = $('#contactForm');
  var btn     = $('#submitBtn');
  var status  = $('#formStatus');

  if (form && btn && status) {

    /* Horodatage du rendu du formulaire : transmis pour le contrôle
       anti-robot côté serveur */
    var stamp = $('#_t');
    if (stamp) stamp.value = String(Date.now());

    /* ---- Règles de validation ---- */
    var rules = {
      name: function (v) {
        if (!v.trim()) return 'Merci d’indiquer votre nom.';
        if (v.trim().length < 2) return 'Ce nom semble un peu court.';
        return '';
      },
      email: function (v) {
        if (!v.trim()) return 'Nous avons besoin d’une adresse e-mail pour vous répondre.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) return 'Cette adresse e-mail semble incorrecte.';
        return '';
      },
      company: function () { return ''; },
      type: function (v) { return v ? '' : 'Choisissez le type de projet le plus proche.'; },
      budget: function (v) {
        /* Champ libre : on refuse uniquement le dépassement abusif */
        return v.length > 120 ? 'Merci de raccourcir ce champ.' : '';
      },
      message: function (v) {
        if (!v.trim()) return 'Merci d’ajouter quelques détails sur votre projet.';
        if (v.trim().length < 20) return 'Quelques mots de plus nous aideraient à vous répondre utilement.';
        if (v.length > 5000) return 'Merci de raccourcir ce champ (5 000 caractères maximum).';
        return '';
      }
    };

    function errBox(field) { return $('#' + field.id + '-err'); }

    function validateField(field) {
      var rule = rules[field.name];
      if (!rule) return true;
      var msg = rule(field.value);
      var box = errBox(field);
      if (box) box.textContent = msg;
      if (msg) {
        field.setAttribute('aria-invalid', 'true');
        return false;
      }
      field.removeAttribute('aria-invalid');
      return true;
    }

    function validateAll() {
      var fields = $$('input[name], select[name], textarea[name]', form)
        .filter(function (f) { return f.name !== 'website'; });
      var firstBad = null;

      fields.forEach(function (f) {
        if (!validateField(f) && !firstBad) firstBad = f;
      });

      if (firstBad) {
        firstBad.focus();
        return null;
      }
      return fields;
    }

    /* Valider à la sortie du champ ; une fois un champ signalé,
       le revérifier pendant la saisie */
    $$('input[name], select[name], textarea[name]', form).forEach(function (f) {
      if (f.name === 'website') return;
      f.addEventListener('blur', function () { validateField(f); });
      f.addEventListener('input', function () {
        if (f.getAttribute('aria-invalid') === 'true') validateField(f);
      });
      f.addEventListener('change', function () {
        if (f.tagName === 'SELECT') validateField(f);
      });
    });

    function say(msg, ok) {
      status.textContent = msg;
      status.classList.remove('is-ok', 'is-error');
      status.classList.add(ok ? 'is-ok' : 'is-error');
    }

    function busy(on) {
      btn.classList.toggle('is-sending', on);
      btn.disabled = on;
    }

    function mailtoDraft(data) {
      var subject = 'Demande de projet — ' + (data.type || 'Demande générale');
      var body =
        'Nom : ' + data.name + '\n' +
        'E-mail : ' + data.email + '\n' +
        (data.company ? 'Entreprise : ' + data.company + '\n' : '') +
        'Type de projet : ' + (data.type || '—') + '\n' +
        (data.budget ? 'Budget : ' + data.budget + '\n' : '') +
        '\nDétails :\n' + data.message;

      window.location.href = 'mailto:' + EMAIL_FALLBACK +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var data = {};
      new FormData(form).forEach(function (value, key) {
        data[key] = value;
      });

      var valid = validateAll();
      if (!valid) {
        say('Merci de corriger les champs signalés puis de renvoyer.', false);
        return;
      }

      busy(true);
      say('Envoi en cours…', true);

      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok) {
              var err = new Error(body.error || ('HTTP ' + res.status));
              err.code = res.status;
              throw err;
            }
            return body;
          });
        })
        .then(function (body) {
          form.reset();
          if (stamp) stamp.value = String(Date.now());
          say(body.message ||
              'Merci — votre demande est bien enregistrée. Vous recevez un accusé de réception par e-mail et nous répondons sous un jour ouvré.',
              true);
        })
        .catch(function (err) {
          /* Une demande réelle ne doit jamais être perdue : on ouvre le
             client e-mail du visiteur avec les mêmes informations. */
          mailtoDraft(data);
          if (err && err.code === 429) {
            say('Trop de tentatives depuis cet appareil. Nous avons ouvert votre client e-mail — envoyez le message pour que votre demande nous parvienne.', false);
          } else {
            say('L’envoi automatique a échoué, nous avons donc ouvert votre client e-mail avec les détails pré-remplis. Il vous suffit de cliquer sur « envoyer ».', false);
          }
        })
        .finally(function () { busy(false); });
    });
  }

  /* =============================================================
     9. DIVERS
     ============================================================= */
  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

})();