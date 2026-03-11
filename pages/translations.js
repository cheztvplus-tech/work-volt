// ─────────────────────────────────────────────
//  WORK VOLT — TRANSLATION SYSTEM
//  Usage: WorkVoltI18n.t('key') → translated string
//         WorkVoltI18n.setLang('fr') → switch language
//         WorkVoltI18n.getLang() → 'en' | 'fr'
// ─────────────────────────────────────────────

window.WorkVoltI18n = (() => {
  const STORAGE_KEY = 'wv_lang';

  const strings = {
    en: {
      // ── App Shell ──
      'app.name':                   'Work Volt',
      'app.tagline':                'Power your operations',
      'app.version':                'Work Volt · v1.0.0',
      'app.loading':                'Loading...',

      // ── Splash ──
      'splash.tagline':             'Power your operations',

      // ── Header ──
      'header.search':              'Search...',

      // ── Nav sections ──
      'nav.dashboard':              'Dashboard',
      'nav.settings':               'Settings',
      'nav.store':                  'Module Store',
      'nav.roles':                  'Role Permissions',
      'nav.modules':                'Modules',
      'nav.drag_hint':              'drag to reorder',

      // ── User menu ──
      'menu.account':               'Account',
      'menu.profile':               'My Profile',
      'menu.security':              'Security & Password',
      'menu.mimic':                 'Mimic Profile',
      'menu.language':              'Language / Langue',
      'menu.switch_fr':             '🇫🇷 Français',
      'menu.switch_en':             '🇬🇧 English',
      'menu.logout':                'Logout',

      // ── Toasts / misc ──
      'toast.profile_soon':         'Profile modal — coming soon',
      'toast.security_soon':        'Security modal — coming soon',

      // ── Placeholder page ──
      'page.placeholder_desc':      'This page is ready to be built as its own module.',
      'page.placeholder_create':    'Create',
      'page.placeholder_register':  'and register it with',

      // ── Back button ──
      'btn.back':                   'Go Back',

      // ── Global loading ──
      'loading.text':               'Loading...',

      // ── Module labels ──
      'module.notifications':       'Notifications',
      'module.tasks':               'Tasks',
      'module.pipeline':            'Pipeline',
      'module.payroll':             'Payroll',
      'module.timesheets':          'Timesheets',
      'module.financials':          'Financials',
      'module.crm':                 'CRM',
      'module.projects':            'Projects',
      'module.reports':             'Reports',
      'module.assets':              'Assets',
      'module.attendance':          'Attendance Tracker',
      'module.invoices':            'Invoice Manager',
      'module.inventory':           'Inventory Control',
      'module.scheduler':           'Shift Scheduler',
      'module.expenses':            'Expense Claims',
      'module.contracts':           'Contract Hub',
      'module.helpdesk':            'Help Desk',
      'module.recruitment':         'Recruitment Pipeline',
      'module.dashboard':           'Dashboard',
      'module.settings':            'Settings',
      'module.store':               'Module Store',
      'module.roles':               'Role Permissions',

      // ── Index / Login page ──
      'login.secure':               'Secure Sign In',
      'login.url_label':            'Work Volt URL',
      'login.url_placeholder':      'https://script.google.com/macros/s/.../exec',
      'login.url_hint':             'Your Google Apps Script Web App URL',
      'login.email_label':          'Username (Email)',
      'login.email_placeholder':    'admin@workvolt.app',
      'login.password_label':       'Password',
      'login.btn':                  'Sign In',
      'login.btn_loading':          'Signing in...',
      'login.footer':               'Work Volt v1.0.0 • Secure Business Management',
      'login.reset_hint':           'Contact your SuperAdmin to reset your password.',
      'login.err.no_url':           'Please enter your Work Volt URL',
      'login.err.no_email':         'Please enter your username (email)',
      'login.err.no_password':      'Please enter your password',
      'login.err.failed':           'Login failed. Please check your credentials.',
      'login.language':             'Français',
    },

    fr: {
      // ── App Shell ──
      'app.name':                   'Work Volt',
      'app.tagline':                'Optimisez vos opérations',
      'app.version':                'Work Volt · v1.0.0',
      'app.loading':                'Chargement...',

      // ── Splash ──
      'splash.tagline':             'Optimisez vos opérations',

      // ── Header ──
      'header.search':              'Rechercher...',

      // ── Nav sections ──
      'nav.dashboard':              'Tableau de bord',
      'nav.settings':               'Paramètres',
      'nav.store':                  'Boutique de modules',
      'nav.roles':                  'Permissions des rôles',
      'nav.modules':                'Modules',
      'nav.drag_hint':              'glisser pour réorganiser',

      // ── User menu ──
      'menu.account':               'Compte',
      'menu.profile':               'Mon profil',
      'menu.security':              'Sécurité & Mot de passe',
      'menu.mimic':                 'Imiter un profil',
      'menu.language':              'Language / Langue',
      'menu.switch_fr':             '🇫🇷 Français',
      'menu.switch_en':             '🇬🇧 English',
      'menu.logout':                'Déconnexion',

      // ── Toasts / misc ──
      'toast.profile_soon':         'Profil — bientôt disponible',
      'toast.security_soon':        'Sécurité — bientôt disponible',

      // ── Placeholder page ──
      'page.placeholder_desc':      'Cette page est prête à être construite en tant que module.',
      'page.placeholder_create':    'Créez',
      'page.placeholder_register':  'et enregistrez-le avec',

      // ── Back button ──
      'btn.back':                   'Retour',

      // ── Global loading ──
      'loading.text':               'Chargement...',

      // ── Module labels ──
      'module.notifications':       'Notifications',
      'module.tasks':               'Tâches',
      'module.pipeline':            'Pipeline',
      'module.payroll':             'Paie',
      'module.timesheets':          'Feuilles de temps',
      'module.financials':          'Finances',
      'module.crm':                 'CRM',
      'module.projects':            'Projets',
      'module.reports':             'Rapports',
      'module.assets':              'Actifs',
      'module.attendance':          'Suivi des présences',
      'module.invoices':            'Gestionnaire de factures',
      'module.inventory':           'Contrôle des stocks',
      'module.scheduler':           'Planificateur de quarts',
      'module.expenses':            'Notes de frais',
      'module.contracts':           'Espace contrats',
      'module.helpdesk':            'Centre d\'assistance',
      'module.recruitment':         'Pipeline de recrutement',
      'module.dashboard':           'Tableau de bord',
      'module.settings':            'Paramètres',
      'module.store':               'Boutique de modules',
      'module.roles':               'Permissions des rôles',

      // ── Index / Login page ──
      'login.secure':               'Connexion sécurisée',
      'login.url_label':            'URL Work Volt',
      'login.url_placeholder':      'https://script.google.com/macros/s/.../exec',
      'login.url_hint':             'L\'URL de votre application Google Apps Script',
      'login.email_label':          'Nom d\'utilisateur (e-mail)',
      'login.email_placeholder':    'admin@workvolt.app',
      'login.password_label':       'Mot de passe',
      'login.btn':                  'Se connecter',
      'login.btn_loading':          'Connexion en cours...',
      'login.footer':               'Work Volt v1.0.0 • Gestion d\'entreprise sécurisée',
      'login.reset_hint':           'Contactez votre SuperAdmin pour réinitialiser votre mot de passe.',
      'login.err.no_url':           'Veuillez saisir votre URL Work Volt',
      'login.err.no_email':         'Veuillez saisir votre nom d\'utilisateur (e-mail)',
      'login.err.no_password':      'Veuillez saisir votre mot de passe',
      'login.err.failed':           'Connexion échouée. Veuillez vérifier vos identifiants.',
      'login.language':             'English',
    },
  };

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) || 'en';
  }

  function t(key) {
    const lang = getLang();
    return (strings[lang] && strings[lang][key]) || (strings['en'] && strings['en'][key]) || key;
  }

  function setLang(lang) {
    if (!strings[lang]) return;
    localStorage.setItem(STORAGE_KEY, lang);
    // Dispatch event so pages can react
    window.dispatchEvent(new CustomEvent('wv-lang-change', { detail: { lang } }));
  }

  function toggleLang() {
    setLang(getLang() === 'en' ? 'fr' : 'en');
  }

  return { t, getLang, setLang, toggleLang };
})();
