/* =============================================================
   Irkam Media — assets/js/repos.js
   ------------------------------------------------------------
   SOURCE UNIQUE DES DÉPÔTS GITHUB AFFICHÉS.

   Ce fichier alimente À LA FOIS :
     • le menu déroulant « GitHub » de la barre de navigation
     • la section « Code ouvert » de la page
   Modifier ce seul fichier suffit ; aucune autre édition n'est
   nécessaire.

   ------------------------------------------------------------
   POUR AJOUTER UN DÉPÔT
   ------------------------------------------------------------
   Ajoutez un objet au tableau « repos » ci-dessous, en respectant
   les virgules entre les objets.

     {
       name:        'nom-du-depot',        // obligatoire
       description: 'Une phrase.',          // facultatif
       language:    'TypeScript',           // facultatif — langage principal
       topics:      ['api', 'outillage'],   // facultatif — tableau de mots-clés
       url:         'https://github.com/UTILISATEUR/nom-du-depot'
                                             // facultatif — sinon déduit de
                                             // « org » + « name »
       featured:    true                    // facultatif — remonte en haut
     }

   Pour lier un profil de développeur plutôt qu'un dépôt, il suffit
   de renseigner son URL dans « url » et son pseudo dans « name ».

   ============================================================ */

window.IRKAM_REPOS = {

  /* ------------------------------------------------------------
     ORGANISATION GITHUB

     Laissez `org` et `profile` VIDES tant que vous n'avez pas
     créé de compte pour la société. Le lien « Voir l'organisation »
     est alors automatiquement masqué, et aucun lien vers une
     organisation inexistante n'apparaît sur le site.

     Le jour où vous créez l'organisation, indiquez simplement
     `org: 'irkammedia'` : tous les liens seront déduits, et les
     entrées qui n'ont pas de `url` se construiront automatiquement.
     ------------------------------------------------------------ */
  org: '',
  profile: '',

  /* ======================================================
     DÉPÔTS ET PROFILS AFFICHÉS
     ====================================================== */
  repos: [
    {
      name: 'asmabelaidi',
      description: 'Développeur chez Irkam Media — profil GitHub, projets et contributions publiques.',
      url: 'https://github.com/asmabelaidi',
      featured: true
    },
    {
      name: 'linahc',
      description: 'Développeur chez Irkam Media — profil GitHub, projets et contributions publiques.',
      url: 'https://github.com/linahc',
      featured: true
    }
  ]

};