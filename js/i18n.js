// ─────────────────────────────────────────────
//  LANGUAGE DICTIONARY
// ─────────────────────────────────────────────

window.TRANSLATIONS = {

  fr: {

    "Sign In":"Se connecter",
    "Signing in...":"Connexion...",
    "Username (Email)":"Nom d'utilisateur (courriel)",
    "Password":"Mot de passe",
    "Secure Sign In":"Connexion sécurisée",
    "Work Volt URL":"URL Work Volt",
    "Search...":"Rechercher...",
    "Dashboard":"Tableau de bord",
    "Settings":"Paramètres",
    "Module Store":"Boutique de modules",
    "Role Permissions":"Permissions des rôles",
    "Notifications":"Notifications",
    "Tasks":"Tâches",
    "Projects":"Projets",
    "Reports":"Rapports",
    "Inventory Control":"Gestion d’inventaire",
    "Shift Scheduler":"Planificateur d’horaires",
    "Expense Claims":"Notes de frais",
    "Contract Hub":"Centre des contrats",
    "Help Desk":"Support technique",
    "Recruitment Pipeline":"Pipeline de recrutement",
    "Logout":"Déconnexion",
    "Loading...":"Chargement..."
  }

};


// ─────────────────────────────────────────────
//  AUTO TRANSLATE
// ─────────────────────────────────────────────

window.autoTranslatePage = function(){

  const lang = window.currentLang || 'en';

  if(lang === 'en') return;

  const dict = TRANSLATIONS[lang] || {};

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;

  while(node = walker.nextNode()){

    const text = node.nodeValue.trim();

    if(!text) continue;

    if(dict[text]){
      node.nodeValue = dict[text];
    }

  }

};


// ─────────────────────────────────────────────
//  LANGUAGE SETTER
// ─────────────────────────────────────────────

window.setLanguage = function(lang){

  window.currentLang = lang;

  localStorage.setItem('lang', lang);

  autoTranslatePage();

};