// ═══════════════════════════════════════════════════════════════════
//  Work Volt — i18n Translation System
//  Supports: English (en) · French (fr)
// ═══════════════════════════════════════════════════════════════════

(function() {

  // ── Storage key ─────────────────────────────────────────────────
  const LANG_KEY = 'wv_language';

  // ── Translations ─────────────────────────────────────────────────
  const TRANSLATIONS = {
    en: {
      // ── General ───────────────────────────────────────────
      'Work Volt': 'Work Volt',
      'Power your operations': 'Power your operations',
      'Work Volt v1.0.0 • Secure Business Management': 'Work Volt v1.0.0 · Secure Business Management',
      'Work Volt · v1.0.0': 'Work Volt · v1.0.0',
      'Loading...': 'Loading...',
      'Search...': 'Search...',
      'Save': 'Save',
      'Cancel': 'Cancel',
      'Delete': 'Delete',
      'Edit': 'Edit',
      'Close': 'Close',
      'Back': 'Back',
      'Logout': 'Logout',
      'Settings': 'Settings',
      'Dashboard': 'Dashboard',
      'Module Store': 'Module Store',
      'Role Permissions': 'Role Permissions',
      'Saving…': 'Saving…',
      'Installing…': 'Installing…',
      'Deleting…': 'Deleting…',
      'Testing…': 'Testing…',
      'Fetching…': 'Fetching…',

      // ── Index (Login) ──────────────────────────────────────
      'Secure Sign In': 'Secure Sign In',
      'Work Volt URL': 'Work Volt URL',
      'Your Google Apps Script Web App URL': 'Your Google Apps Script Web App URL',
      'Username (Email)': 'Username (Email)',
      'Password': 'Password',
      'Sign In': 'Sign In',
      'Signing in...': 'Signing in...',
      'Contact your SuperAdmin to reset your password.': 'Contact your SuperAdmin to reset your password.',
      'Please enter your Work Volt URL': 'Please enter your Work Volt URL',
      'Please enter your username (email)': 'Please enter your username (email)',
      'Please enter your password': 'Please enter your password',

      // ── Header / Nav ───────────────────────────────────────
      'Go Back': 'Go Back',
      'Modules': 'Modules',
      'drag to reorder': 'drag to reorder',
      'Collapse sidebar': 'Collapse sidebar',
      'Account': 'Account',
      'My Profile': 'My Profile',
      'Security & Password': 'Security & Password',
      'Mimic Profile': 'Mimic Profile',

      // ── User Dropdown ──────────────────────────────────────
      'Profile modal — coming soon': 'Profile modal — coming soon',
      'Security modal — coming soon': 'Security modal — coming soon',

      // ── Dashboard ─────────────────────────────────────────
      'Work Volt Dashboard': 'Work Volt Dashboard',
      'Good morning': 'Good morning',
      'Good afternoon': 'Good afternoon',
      'Good evening': 'Good evening',
      'Welcome to': 'Welcome to',
      '— your all-in-one operations workspace, built on Google Sheets. Everything here is modular, flexible, and shaped around the way': '— your all-in-one operations workspace, built on Google Sheets. Everything here is modular, flexible, and shaped around the way',
      'team actually works.': 'team actually works.',
      'Available modules': 'Available modules',
      'Add-ons installed': 'Add-ons installed',
      'Setup complete': 'Setup complete',
      'Get started': 'Get started',
      'done': 'done',
      'of': 'of',
      'Work Volt is running': 'Work Volt is running',
      'Your app is live and ready to configure.': 'Your app is live and ready to configure.',
      'Connect your Google Sheet': 'Connect your Google Sheet',
      'Link your Sheet to power real data across all modules.': 'Link your Sheet to power real data across all modules.',
      'Connect Sheet': 'Connect Sheet',
      'Install your first module': 'Install your first module',
      'Visit the Module Store to add features to your sidebar.': 'Visit the Module Store to add features to your sidebar.',
      'Open Store': 'Open Store',
      'Invite your team': 'Invite your team',
      'Add users, assign roles and get everyone working.': 'Add users, assign roles and get everyone working.',
      'Manage Users': 'Manage Users',
      'Your workspace, your way.': 'Your workspace, your way.',
      'Work Volt is designed to grow with you. Start with the modules your team needs today — Timesheets, Tasks, Payroll, CRM — and add more as you scale. Every module connects to your Google Sheet, so your data stays in one place you already own and control.': 'Work Volt is designed to grow with you. Start with the modules your team needs today — Timesheets, Tasks, Payroll, CRM — and add more as you scale. Every module connects to your Google Sheet, so your data stays in one place you already own and control.',
      'No per-seat pricing. No vendor lock-in. Just a clean, powerful workspace that you configure once and your whole team benefits from immediately.': 'No per-seat pricing. No vendor lock-in. Just a clean, powerful workspace that you configure once and your whole team benefits from immediately.',
      'Browse Module Store': 'Browse Module Store',
      'Connect Google Sheet': 'Connect Google Sheet',
      'Installed modules': 'Installed modules',
      'No modules installed yet': 'No modules installed yet',
      'Head to the Module Store to add features to your workspace': 'Head to the Module Store to add features to your workspace',
      'Installed add-ons': 'Installed add-ons',
      'Tip:': 'Tip:',
      'This dashboard will update automatically once you connect your Google Sheet — showing live stats, recent activity and team summaries pulled straight from your data.': 'This dashboard will update automatically once you connect your Google Sheet — showing live stats, recent activity and team summaries pulled straight from your data.',

      // ── Dashboard module descriptions ──────────────────────
      'Manage and track team tasks': 'Manage and track team tasks',
      'Visualise your sales pipeline': 'Visualise your sales pipeline',
      'Run payroll and manage compensation': 'Run payroll and manage compensation',
      'Log and approve work hours': 'Log and approve work hours',
      'Track revenue, costs and P&L': 'Track revenue, costs and P&L',
      'Manage clients and relationships': 'Manage clients and relationships',
      'Plan and deliver projects on time': 'Plan and deliver projects on time',
      'Insights and analytics across modules': 'Insights and analytics across modules',
      'Track company equipment and tools': 'Track company equipment and tools',
      'Track check-ins, absences and hours': 'Track check-ins, absences and hours',
      'Create and track client invoices': 'Create and track client invoices',
      'Monitor stock levels and movements': 'Monitor stock levels and movements',
      'Build and publish shift rosters': 'Build and publish shift rosters',
      'Submit and approve expense claims': 'Submit and approve expense claims',
      'Store and manage contracts': 'Store and manage contracts',
      'Internal support ticket system': 'Internal support ticket system',
      'Track hiring pipeline and candidates': 'Track hiring pipeline and candidates',

      // ── Settings ──────────────────────────────────────────
      'Configure your Work Volt workspace': 'Configure your Work Volt workspace',
      'Connection': 'Connection',
      'User Management': 'User Management',
      'Admin Config': 'Admin Config',
      'Google Sheet Connection': 'Google Sheet Connection',
      'Connect your GAS Web App to power all modules': 'Connect your GAS Web App to power all modules',
      'Connected': 'Connected',
      'Not connected': 'Not connected',
      'Login': 'Login',
      'First Setup': 'First Setup',
      'GAS Web App URL': 'GAS Web App URL',
      'API Secret': 'API Secret',
      'Test Connection': 'Test Connection',
      'How to deploy your GAS backend': 'How to deploy your GAS backend',
      'Disconnect': 'Disconnect',
      'Remove the saved URL and secret from this browser': 'Remove the saved URL and secret from this browser',
      'Users': 'Users',
      'Add User': 'Add User',
      'Add User': 'Add User',
      'Edit User': 'Edit User',
      'Full Name': 'Full Name',
      'Email': 'Email',
      'Role': 'Role',
      'Department': 'Department',
      'Job Title': 'Job Title',
      'Phone': 'Phone',
      'Pay Type': 'Pay Type',
      'Hourly Rate': 'Hourly Rate',
      'Salary': 'Salary',
      'Start Date': 'Start Date',
      'Manager': 'Manager',
      'Avatar URL': 'Avatar URL',
      'Save Changes': 'Save Changes',
      'Create User': 'Create User',
      'Reset Password': 'Reset Password',
      'New Password': 'New Password',
      'Confirm Password': 'Confirm Password',
      'Set Password': 'Set Password',
      'Delete User': 'Delete User',
      'Delete Permanently': 'Delete Permanently',
      'User': 'User',
      'Status': 'Status',
      'Actions': 'Actions',
      'Active': 'Active',
      'Inactive': 'Inactive',
      'No users found': 'No users found',
      'User ID Format': 'User ID Format',
      'Choose how new User IDs are generated': 'Choose how new User IDs are generated',
      'ID Format': 'ID Format',
      'Short, readable ID — default format': 'Short, readable ID — default format',
      'Legacy universally unique identifier': 'Legacy universally unique identifier',
      'Save Configuration': 'Save Configuration',
      'Configuration saved!': 'Configuration saved!',
      'Modules': 'Modules',
      'Install or remove modules. Each module creates its own Sheet tab on first install.': 'Install or remove modules. Each module creates its own Sheet tab on first install.',
      'Refresh': 'Refresh',
      'Installed': 'Installed',
      'Available': 'Available',
      'Roles': 'Roles',
      'Uninstall': 'Uninstall',
      'Install': 'Install',
      'Payroll Tax Settings': 'Payroll Tax Settings',
      'Auto-calculate taxes on every pay run. Disable if you enter taxes manually.': 'Auto-calculate taxes on every pay run. Disable if you enter taxes manually.',
      'Enabled': 'Enabled',
      'Disabled': 'Disabled',
      'Country / Region': 'Country / Region',
      'Save Payroll Tax Settings': 'Save Payroll Tax Settings',
      'Who Can View Tax Settings': 'Who Can View Tax Settings',
      'Always has access': 'Always has access',
      'Module Access': 'Module Access',
      'Connect your Google Sheet first': 'Connect your Google Sheet first',
      'Go to the Connection tab to set up your GAS URL and secret.': 'Go to the Connection tab to set up your GAS URL and secret.',
      'Create Admin Accounts': 'Create Admin Accounts',
      'Set up your Support and Customer admin accounts': 'Set up your Support and Customer admin accounts',
      'Admin Email': 'Admin Email',
      'Admin Name': 'Admin Name',
      'Create Customer Admin': 'Create Customer Admin',
      'First-time credentials — save these now!': 'First-time credentials — save these now!',
      'This password is shown': 'This password is shown',
      'once only': 'once only',
      '— it is not stored anywhere. Copy it now.': '— it is not stored anywhere. Copy it now.',
      'Temp password': 'Temp password',

      // ── Roles ─────────────────────────────────────────────
      'Control which roles can access each module': 'Control which roles can access each module',
      'Permission Matrix': 'Permission Matrix',
      'User Overrides': 'User Overrides',
      'Role Preview': 'Role Preview',
      'Loading permissions…': 'Loading permissions…',
      'Has access': 'Has access',
      'No access': 'No access',
      'SuperAdmin (always on)': 'SuperAdmin (always on)',
      'Module': 'Module',
      'click to toggle all': 'click to toggle all',
      'All': 'All',
      'Revoke all': 'Revoke all',
      'Grant all': 'Grant all',
      'Core modules are not shown here': 'Core modules are not shown here',
      '— Dashboard, Settings, Module Store, and Role Permissions have fixed access rules and cannot be changed.': '— Dashboard, Settings, Module Store, and Role Permissions have fixed access rules and cannot be changed.',
      'SuperAdmin always has access to every module and cannot be unchecked.': 'SuperAdmin always has access to every module and cannot be unchecked.',
      'No modules installed yet': 'No modules installed yet',
      'Install modules from the Module Store first, then configure their role permissions here.': 'Install modules from the Module Store first, then configure their role permissions here.',
      'No Sheet — saves locally': 'No Sheet — saves locally',
      'Unsaved changes': 'Unsaved changes',
      'Save Changes': 'Save Changes',
      'Saving…': 'Saving…',
      'Google Sheet not connected': 'Google Sheet not connected',
      'User overrides require a Sheet connection to load the user list.': 'User overrides require a Sheet connection to load the user list.',
      'Connect Sheet': 'Connect Sheet',
      'User overrides let you grant or restrict access to specific modules for individual users, overriding their role\'s default permissions. Users without an override follow their role\'s settings.': 'User overrides let you grant or restrict access to specific modules for individual users, overriding their role\'s default permissions. Users without an override follow their role\'s settings.',
      'No users loaded yet': 'No users loaded yet',
      'Custom': 'Custom',
      'Reset to role defaults': 'Reset to role defaults',
      'Edit': 'Edit',
      'Override': 'Override',
      'Module Access': 'Module Access',
      'This shows exactly what each role will see in their sidebar after saving.': 'This shows exactly what each role will see in their sidebar after saving.',
      'visible': 'visible',
      'core': 'core',
      'No add-on modules': 'No add-on modules',
      'Access restricted to Admins only': 'Access restricted to Admins only',
      'Permissions saved locally (connect Sheet to sync globally)': 'Permissions saved locally (connect Sheet to sync globally)',
      'Permissions saved successfully': 'Permissions saved successfully',
    },

    fr: {
      // ── General ───────────────────────────────────────────
      'Work Volt': 'Work Volt',
      'Power your operations': 'Optimisez vos opérations',
      'Work Volt v1.0.0 • Secure Business Management': 'Work Volt v1.0.0 · Gestion d\'entreprise sécurisée',
      'Work Volt · v1.0.0': 'Work Volt · v1.0.0',
      'Loading...': 'Chargement...',
      'Search...': 'Rechercher...',
      'Save': 'Enregistrer',
      'Cancel': 'Annuler',
      'Delete': 'Supprimer',
      'Edit': 'Modifier',
      'Close': 'Fermer',
      'Back': 'Retour',
      'Logout': 'Déconnexion',
      'Settings': 'Paramètres',
      'Dashboard': 'Tableau de bord',
      'Module Store': 'Boutique de modules',
      'Role Permissions': 'Permissions des rôles',
      'Saving…': 'Enregistrement…',
      'Installing…': 'Installation…',
      'Deleting…': 'Suppression…',
      'Testing…': 'Test en cours…',
      'Fetching…': 'Récupération…',

      // ── Index (Login) ──────────────────────────────────────
      'Secure Sign In': 'Connexion sécurisée',
      'Work Volt URL': 'URL Work Volt',
      'Your Google Apps Script Web App URL': 'Votre URL d\'application Web Google Apps Script',
      'Username (Email)': 'Identifiant (Email)',
      'Password': 'Mot de passe',
      'Sign In': 'Se connecter',
      'Signing in...': 'Connexion en cours...',
      'Contact your SuperAdmin to reset your password.': 'Contactez votre SuperAdmin pour réinitialiser votre mot de passe.',
      'Please enter your Work Volt URL': 'Veuillez entrer votre URL Work Volt',
      'Please enter your username (email)': 'Veuillez entrer votre identifiant (email)',
      'Please enter your password': 'Veuillez entrer votre mot de passe',

      // ── Header / Nav ───────────────────────────────────────
      'Go Back': 'Retour',
      'Modules': 'Modules',
      'drag to reorder': 'glisser pour réordonner',
      'Collapse sidebar': 'Réduire le menu',
      'Account': 'Compte',
      'My Profile': 'Mon profil',
      'Security & Password': 'Sécurité & Mot de passe',
      'Mimic Profile': 'Imiter un profil',

      // ── User Dropdown ──────────────────────────────────────
      'Profile modal — coming soon': 'Profil — bientôt disponible',
      'Security modal — coming soon': 'Sécurité — bientôt disponible',

      // ── Dashboard ─────────────────────────────────────────
      'Work Volt Dashboard': 'Tableau de bord Work Volt',
      'Good morning': 'Bonjour',
      'Good afternoon': 'Bon après-midi',
      'Good evening': 'Bonsoir',
      'Welcome to': 'Bienvenue sur',
      '— your all-in-one operations workspace, built on Google Sheets. Everything here is modular, flexible, and shaped around the way': '— votre espace de travail tout-en-un, basé sur Google Sheets. Tout est modulaire, flexible et adapté à la façon dont',
      'team actually works.': 'votre équipe travaille réellement.',
      'Available modules': 'Modules disponibles',
      'Add-ons installed': 'Extensions installées',
      'Setup complete': 'Configuration complète',
      'Get started': 'Commencer',
      'done': 'fait',
      'of': 'sur',
      'Work Volt is running': 'Work Volt est actif',
      'Your app is live and ready to configure.': 'Votre application est en ligne et prête à être configurée.',
      'Connect your Google Sheet': 'Connectez votre Google Sheet',
      'Link your Sheet to power real data across all modules.': 'Liez votre feuille pour alimenter les données de tous les modules.',
      'Connect Sheet': 'Connecter la feuille',
      'Install your first module': 'Installez votre premier module',
      'Visit the Module Store to add features to your sidebar.': 'Visitez la boutique de modules pour ajouter des fonctionnalités.',
      'Open Store': 'Ouvrir la boutique',
      'Invite your team': 'Invitez votre équipe',
      'Add users, assign roles and get everyone working.': 'Ajoutez des utilisateurs, attribuez des rôles et mettez tout le monde au travail.',
      'Manage Users': 'Gérer les utilisateurs',
      'Your workspace, your way.': 'Votre espace, à votre façon.',
      'Work Volt is designed to grow with you. Start with the modules your team needs today — Timesheets, Tasks, Payroll, CRM — and add more as you scale. Every module connects to your Google Sheet, so your data stays in one place you already own and control.': 'Work Volt est conçu pour évoluer avec vous. Commencez avec les modules dont votre équipe a besoin — Feuilles de temps, Tâches, Paie, CRM — et ajoutez-en d\'autres au fil de votre croissance. Chaque module se connecte à votre Google Sheet pour que vos données restent en un seul endroit.',
      'No per-seat pricing. No vendor lock-in. Just a clean, powerful workspace that you configure once and your whole team benefits from immediately.': 'Aucun coût par utilisateur. Aucun enfermement propriétaire. Un espace de travail puissant que vous configurez une fois et dont toute votre équipe profite immédiatement.',
      'Browse Module Store': 'Parcourir la boutique',
      'Connect Google Sheet': 'Connecter Google Sheet',
      'Installed modules': 'Modules installés',
      'No modules installed yet': 'Aucun module installé',
      'Head to the Module Store to add features to your workspace': 'Rendez-vous à la boutique de modules pour ajouter des fonctionnalités',
      'Installed add-ons': 'Extensions installées',
      'Tip:': 'Conseil :',
      'This dashboard will update automatically once you connect your Google Sheet — showing live stats, recent activity and team summaries pulled straight from your data.': 'Ce tableau de bord se mettra à jour automatiquement une fois votre Google Sheet connecté — affichant des statistiques en direct, l\'activité récente et les résumés d\'équipe tirés directement de vos données.',

      // ── Dashboard module descriptions ──────────────────────
      'Manage and track team tasks': 'Gérer et suivre les tâches de l\'équipe',
      'Visualise your sales pipeline': 'Visualisez votre pipeline de ventes',
      'Run payroll and manage compensation': 'Gérer la paie et les rémunérations',
      'Log and approve work hours': 'Saisir et approuver les heures de travail',
      'Track revenue, costs and P&L': 'Suivre les revenus, coûts et résultats',
      'Manage clients and relationships': 'Gérer les clients et les relations',
      'Plan and deliver projects on time': 'Planifier et livrer les projets dans les délais',
      'Insights and analytics across modules': 'Analyses et rapports sur tous les modules',
      'Track company equipment and tools': 'Suivre le matériel et les outils de l\'entreprise',
      'Track check-ins, absences and hours': 'Suivre les présences, absences et heures',
      'Create and track client invoices': 'Créer et suivre les factures clients',
      'Monitor stock levels and movements': 'Surveiller les niveaux de stock et mouvements',
      'Build and publish shift rosters': 'Créer et publier les plannings de quarts',
      'Submit and approve expense claims': 'Soumettre et approuver les notes de frais',
      'Store and manage contracts': 'Stocker et gérer les contrats',
      'Internal support ticket system': 'Système de tickets d\'assistance interne',
      'Track hiring pipeline and candidates': 'Suivre le pipeline de recrutement et les candidats',

      // ── Settings ──────────────────────────────────────────
      'Configure your Work Volt workspace': 'Configurez votre espace Work Volt',
      'Connection': 'Connexion',
      'User Management': 'Gestion des utilisateurs',
      'Admin Config': 'Config. Admin',
      'Google Sheet Connection': 'Connexion Google Sheet',
      'Connect your GAS Web App to power all modules': 'Connectez votre application GAS pour alimenter tous les modules',
      'Connected': 'Connecté',
      'Not connected': 'Non connecté',
      'Login': 'Connexion',
      'First Setup': 'Première configuration',
      'GAS Web App URL': 'URL de l\'application GAS',
      'API Secret': 'Clé API secrète',
      'Test Connection': 'Tester la connexion',
      'How to deploy your GAS backend': 'Comment déployer votre backend GAS',
      'Disconnect': 'Déconnecter',
      'Remove the saved URL and secret from this browser': 'Supprimer l\'URL et la clé secrète enregistrées de ce navigateur',
      'Users': 'Utilisateurs',
      'Add User': 'Ajouter un utilisateur',
      'Edit User': 'Modifier l\'utilisateur',
      'Full Name': 'Nom complet',
      'Email': 'E-mail',
      'Role': 'Rôle',
      'Department': 'Département',
      'Job Title': 'Poste',
      'Phone': 'Téléphone',
      'Pay Type': 'Type de rémunération',
      'Hourly Rate': 'Taux horaire',
      'Salary': 'Salaire',
      'Start Date': 'Date de début',
      'Manager': 'Responsable',
      'Avatar URL': 'URL de l\'avatar',
      'Save Changes': 'Enregistrer les modifications',
      'Create User': 'Créer l\'utilisateur',
      'Reset Password': 'Réinitialiser le mot de passe',
      'New Password': 'Nouveau mot de passe',
      'Confirm Password': 'Confirmer le mot de passe',
      'Set Password': 'Définir le mot de passe',
      'Delete User': 'Supprimer l\'utilisateur',
      'Delete Permanently': 'Supprimer définitivement',
      'User': 'Utilisateur',
      'Status': 'Statut',
      'Actions': 'Actions',
      'Active': 'Actif',
      'Inactive': 'Inactif',
      'No users found': 'Aucun utilisateur trouvé',
      'User ID Format': 'Format de l\'ID utilisateur',
      'Choose how new User IDs are generated': 'Choisissez comment les nouveaux IDs utilisateur sont générés',
      'ID Format': 'Format ID',
      'Short, readable ID — default format': 'ID court et lisible — format par défaut',
      'Legacy universally unique identifier': 'Identifiant universel unique (héritage)',
      'Save Configuration': 'Enregistrer la configuration',
      'Configuration saved!': 'Configuration enregistrée !',
      'Modules': 'Modules',
      'Install or remove modules. Each module creates its own Sheet tab on first install.': 'Installez ou supprimez des modules. Chaque module crée son propre onglet lors de l\'installation.',
      'Refresh': 'Actualiser',
      'Installed': 'Installés',
      'Available': 'Disponibles',
      'Roles': 'Rôles',
      'Uninstall': 'Désinstaller',
      'Install': 'Installer',
      'Payroll Tax Settings': 'Paramètres fiscaux de la paie',
      'Auto-calculate taxes on every pay run. Disable if you enter taxes manually.': 'Calcul automatique des taxes à chaque traitement de paie. Désactivez si vous saisissez les taxes manuellement.',
      'Enabled': 'Activé',
      'Disabled': 'Désactivé',
      'Country / Region': 'Pays / Région',
      'Save Payroll Tax Settings': 'Enregistrer les paramètres fiscaux',
      'Who Can View Tax Settings': 'Qui peut voir les paramètres fiscaux',
      'Always has access': 'Accès permanent',
      'Module Access': 'Accès aux modules',
      'Connect your Google Sheet first': 'Connectez d\'abord votre Google Sheet',
      'Go to the Connection tab to set up your GAS URL and secret.': 'Accédez à l\'onglet Connexion pour configurer votre URL GAS et votre clé secrète.',
      'Create Admin Accounts': 'Créer des comptes administrateurs',
      'Set up your Support and Customer admin accounts': 'Configurez vos comptes administrateurs support et client',
      'Admin Email': 'E-mail administrateur',
      'Admin Name': 'Nom de l\'administrateur',
      'Create Customer Admin': 'Créer l\'administrateur client',
      'First-time credentials — save these now!': 'Identifiants initiaux — sauvegardez-les maintenant !',
      'This password is shown': 'Ce mot de passe est affiché',
      'once only': 'une seule fois',
      '— it is not stored anywhere. Copy it now.': '— il n\'est stocké nulle part. Copiez-le maintenant.',
      'Temp password': 'Mot de passe temporaire',

      // ── Roles ─────────────────────────────────────────────
      'Control which roles can access each module': 'Contrôlez quels rôles peuvent accéder à chaque module',
      'Permission Matrix': 'Matrice des permissions',
      'User Overrides': 'Exceptions utilisateurs',
      'Role Preview': 'Aperçu des rôles',
      'Loading permissions…': 'Chargement des permissions…',
      'Has access': 'A accès',
      'No access': 'Pas d\'accès',
      'SuperAdmin (always on)': 'SuperAdmin (toujours activé)',
      'Module': 'Module',
      'click to toggle all': 'cliquer pour tout basculer',
      'All': 'Tous',
      'Revoke all': 'Tout révoquer',
      'Grant all': 'Tout accorder',
      'Core modules are not shown here': 'Les modules principaux ne sont pas affichés ici',
      '— Dashboard, Settings, Module Store, and Role Permissions have fixed access rules and cannot be changed.': '— Tableau de bord, Paramètres, Boutique et Permissions ont des règles fixes et ne peuvent pas être modifiés.',
      'SuperAdmin always has access to every module and cannot be unchecked.': 'Le SuperAdmin a toujours accès à tous les modules et ne peut pas être désactivé.',
      'Install modules from the Module Store first, then configure their role permissions here.': 'Installez d\'abord des modules depuis la boutique, puis configurez leurs permissions ici.',
      'No Sheet — saves locally': 'Sans feuille — sauvegarde locale',
      'Unsaved changes': 'Modifications non enregistrées',
      'Google Sheet not connected': 'Google Sheet non connecté',
      'User overrides require a Sheet connection to load the user list.': 'Les exceptions utilisateurs nécessitent une connexion à la feuille pour charger la liste.',
      'Connect Sheet': 'Connecter la feuille',
      'User overrides let you grant or restrict access to specific modules for individual users, overriding their role\'s default permissions. Users without an override follow their role\'s settings.': 'Les exceptions permettent d\'accorder ou de restreindre l\'accès à des modules spécifiques pour des utilisateurs individuels. Les utilisateurs sans exception suivent les paramètres de leur rôle.',
      'No users loaded yet': 'Aucun utilisateur chargé',
      'Custom': 'Personnalisé',
      'Reset to role defaults': 'Réinitialiser aux valeurs du rôle',
      'Override': 'Personnaliser',
      'This shows exactly what each role will see in their sidebar after saving.': 'Ceci montre exactement ce que chaque rôle verra dans son menu après l\'enregistrement.',
      'visible': 'visible',
      'core': 'principal',
      'No add-on modules': 'Aucun module complémentaire',
      'Access restricted to Admins only': 'Accès réservé aux administrateurs',
      'Permissions saved locally (connect Sheet to sync globally)': 'Permissions sauvegardées localement (connectez la feuille pour synchroniser)',
      'Permissions saved successfully': 'Permissions enregistrées avec succès',

      // ── Module Store ────────────────────────────────────────
      'Extend your workspace with powerful add-on modules. Install once, appears in your sidebar instantly.': 'Étendez votre espace de travail avec des modules puissants. Installez-les une fois, ils apparaissent immédiatement dans votre menu.',
      'Featured Modules': 'Modules en vedette',
      'Featured': 'En vedette',
      'Installed': 'Installés',
      'Install': 'Installer',
      'Remove': 'Retirer',
      'Coming Soon': 'Bientôt disponible',
      'Coming Soon — Check back later!': 'Bientôt disponible — Revenez plus tard !',
      'Install Module': 'Installer le module',
      'No modules found': 'Aucun module trouvé',
      'Try a different search or category': 'Essayez une autre recherche ou catégorie',
      "What's Included": 'Ce qui est inclus',
      'Sidebar navigation entry': 'Entrée dans le menu latéral',
      'Full module UI page': 'Page UI complète du module',
      'Google Sheet integration ready': 'Intégration Google Sheet prête',
      'Role-based access control': 'Contrôle d\'accès par rôle',
      'by': 'par',

      // ── Module catalogue labels (used in store/sidebar) ────
      'Notifications': 'Notifications',
      'Tasks': 'Tâches',
      'Pipeline': 'Pipeline',
      'Payroll': 'Paie',
      'Timesheets': 'Feuilles de temps',
      'Financials': 'Finances',
      'CRM': 'CRM',
      'Projects': 'Projets',
      'Reports': 'Rapports',
      'Assets': 'Actifs',
      'Attendance Tracker': 'Suivi des présences',
      'Invoice Manager': 'Gestionnaire de factures',
      'Inventory Control': 'Gestion des stocks',
      'Shift Scheduler': 'Planificateur de quarts',
      'Expense Claims': 'Notes de frais',
      'Contract Hub': 'Gestion des contrats',
      'Help Desk': 'Centre d\'assistance',
      'Recruitment Pipeline': 'Pipeline de recrutement',

      // ── Module descriptions (store tab) ────────────────────
      'Full notification center with smart grouping, priority levels, bell alerts, popup toasts, persistent banners, and quiet hours.': 'Centre de notifications complet avec groupement intelligent, niveaux de priorité, alertes, toasts et heures silencieuses.',
      'Create, assign and track tasks with priority, billing and pay-per-task support.': 'Créez, assignez et suivez des tâches avec priorité, facturation et rémunération à la tâche.',
      'Visual sales pipeline to manage leads and deals through custom stages.': 'Pipeline de ventes visuel pour gérer les prospects et les affaires par étapes personnalisées.',
      'Run payroll for hourly, salaried and pay-per-task employees.': 'Gérez la paie pour les employés à l\'heure, salariés ou rémunérés à la tâche.',
      'Log and approve work hours with project and task tracking.': 'Enregistrez et approuvez les heures de travail avec suivi des projets et tâches.',
      'Track income, expenses and financial KPIs in one place.': 'Suivez les revenus, dépenses et KPI financiers en un seul endroit.',
      'Manage contacts, companies and customer relationships.': 'Gérez les contacts, entreprises et relations clients.',
      'Organise work into projects with milestones and team assignments.': 'Organisez le travail en projets avec jalons et affectations d\'équipe.',
      'Auto-generated reports across all installed modules.': 'Rapports générés automatiquement pour tous les modules installés.',
      'Track company assets, assignments and maintenance schedules.': 'Suivez les actifs de l\'entreprise, les affectations et les calendriers de maintenance.',
      'Monitor employee check-ins, absences and leave requests.': 'Surveillez les entrées/sorties, absences et demandes de congé des employés.',
      'Create and send professional invoices, track payment status.': 'Créez et envoyez des factures professionnelles, suivez les paiements.',
      'Manage stock levels, SKUs, suppliers and reorder points.': 'Gérez les niveaux de stock, SKU, fournisseurs et points de commande.',
      'Build and publish shift schedules for your team.': 'Créez et publiez les plannings de quarts pour votre équipe.',
      'Submit, review and reimburse employee expense claims.': 'Soumettez, examinez et remboursez les notes de frais des employés.',
      'Store and manage contracts with expiry reminders.': 'Stockez et gérez les contrats avec rappels d\'expiration.',
      'Internal ticket system for employee IT and HR requests.': 'Système de tickets interne pour les demandes informatiques et RH.',
      'Track candidates through your hiring pipeline.': 'Suivez les candidats dans votre pipeline de recrutement.',

      // ── Toast/error messages ───────────────────────────────
      'Please enter the GAS URL': 'Veuillez entrer l\'URL GAS',
      'Please enter the API Secret for first-time setup': 'Veuillez entrer la clé API secrète pour la configuration initiale',
      'Settings saved. Testing connection…': 'Paramètres enregistrés. Test de la connexion…',
      'Email is required.': 'L\'e-mail est requis.',
      'Role is required.': 'Le rôle est requis.',
      'Password is required.': 'Le mot de passe est requis.',
      'User updated successfully.': 'Utilisateur mis à jour avec succès.',
      'User created successfully.': 'Utilisateur créé avec succès.',
      'Please enter a new password.': 'Veuillez entrer un nouveau mot de passe.',
      'Passwords do not match.': 'Les mots de passe ne correspondent pas.',
      'Password updated successfully.': 'Mot de passe mis à jour avec succès.',
      'Please fill in all fields': 'Veuillez remplir tous les champs',
    },
  };

  // ── Core i18n API ─────────────────────────────────────────────────

  let _currentLang = localStorage.getItem(LANG_KEY) || 'en';

  function getLang() { return _currentLang; }

  function setLang(lang) {
    if (!TRANSLATIONS[lang]) return;
    _currentLang = lang;
    localStorage.setItem(LANG_KEY, lang);
    // Fire an event so pages can re-render
    document.dispatchEvent(new CustomEvent('wv:langchange', { detail: { lang } }));
    // Re-render nav if available
    if (typeof window.renderNav === 'function') window.renderNav();
    // Re-render current page module
    const main = document.getElementById('main-content');
    const lastModule = sessionStorage.getItem('lastModule') || 'dashboard';
    if (main && typeof window.WorkVolt !== 'undefined') {
      window.WorkVolt.navigate(lastModule);
    }
  }

  function t(key) {
    const dict = TRANSLATIONS[_currentLang] || TRANSLATIONS.en;
    return dict[key] !== undefined ? dict[key] : (TRANSLATIONS.en[key] !== undefined ? TRANSLATIONS.en[key] : key);
  }

  // ── Language toggle button HTML ───────────────────────────────────
  function langToggleHTML() {
    const isEN = _currentLang === 'en';
    return `
      <button
        onclick="window.WVI18n.setLang('${isEN ? 'fr' : 'en'}')"
        title="${isEN ? 'Switch to French' : 'Passer en anglais'}"
        style="display:flex;align-items:center;gap:6px;padding:5px 10px;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;color:#475569;font-family:inherit;transition:all 0.15s;white-space:nowrap;"
        onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'"
      >
        ${isEN
          ? `<span style="font-size:15px">🇺🇸</span> EN`
          : `<span style="font-size:15px">🇫🇷</span> FR`
        }
      </button>`;
  }

  // ── Apply to Login page (index.html) ─────────────────────────────
  function applyToLoginPage() {
    // Run after DOM is ready
    function apply() {
      // subtitle
      const sub = document.querySelector('p.text-blue-200');
      if (sub) sub.textContent = t('Power your operations');

      // Secure Sign In badge
      const badge = document.querySelector('.fas.fa-shield-alt + span');
      if (badge) badge.textContent = t('Secure Sign In');

      // Labels
      document.querySelectorAll('label').forEach(el => {
        const txt = el.textContent.trim();
        const tr = t(txt);
        if (tr !== txt) el.textContent = tr;
      });

      // Placeholders
      const gasInput = document.getElementById('gas-url');
      if (gasInput) gasInput.placeholder = 'https://script.google.com/macros/s/.../exec';

      const usernameInput = document.getElementById('username');
      if (usernameInput) usernameInput.placeholder = 'admin@workvolt.app';

      const gasHelper = document.querySelector('#gas-url + p');
      if (gasHelper) gasHelper.textContent = t('Your Google Apps Script Web App URL');

      // Button
      const loginBtn = document.getElementById('login-btn');
      if (loginBtn) {
        const span = loginBtn.querySelector('span');
        if (span) span.textContent = t('Sign In');
      }

      // Footer
      const footer = document.querySelector('p.text-center.text-blue-200\\/60');
      if (footer) footer.textContent = t('Work Volt v1.0.0 • Secure Business Management');

      // Inject lang toggle
      injectLoginLangToggle();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply);
    } else {
      apply();
    }

    document.addEventListener('wv:langchange', apply);
  }

  function injectLoginLangToggle() {
    let btn = document.getElementById('wv-lang-toggle');
    if (!btn) {
      btn = document.createElement('div');
      btn.id = 'wv-lang-toggle';
      btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:999';
      document.body.appendChild(btn);
    }
    btn.innerHTML = langToggleHTML();
  }

  // ── Inject toggle into main app header ───────────────────────────
  function injectMainLangToggle() {
    let existing = document.getElementById('wv-lang-toggle');
    if (existing) { existing.innerHTML = langToggleHTML(); return; }
    existing = document.createElement('div');
    existing.id = 'wv-lang-toggle';
    existing.innerHTML = langToggleHTML();
    // Insert before user-menu-container
    const userMenu = document.getElementById('user-menu-container');
    if (userMenu) {
      userMenu.parentNode.insertBefore(existing, userMenu);
    }
  }

  // ── Expose globally ───────────────────────────────────────────────
  window.WVI18n = { t, getLang, setLang, langToggleHTML, injectMainLangToggle, injectLoginLangToggle, applyToLoginPage };
  window.t = t; // shorthand

})();
