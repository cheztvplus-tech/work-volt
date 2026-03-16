/* -------------------------
   LANGUAGE STORAGE
------------------------- */

window.currentLang = localStorage.getItem("lang") || "en";


/* -------------------------
   TRANSLATION DICTIONARY
   (KEEP YOUR CURRENT ONE)
------------------------- */

const TRANSLATIONS = window.TRANSLATIONS || {};


/* -------------------------
   CORE TRANSLATOR
------------------------- */

function t(key) {
  const lang = window.currentLang;
  if (!TRANSLATIONS[lang]) return key;
  if (TRANSLATIONS[lang][key] !== undefined) return TRANSLATIONS[lang][key];
  if (TRANSLATIONS.en && TRANSLATIONS.en[key]) return TRANSLATIONS.en[key];
  return key;
}

window.t = t;


/* -------------------------
   PAGE TRANSLATION ENGINE
------------------------- */

// Track which elements we've already translated to avoid infinite loops
const translatedElements = new WeakSet();

function translateElement(el) {
  // Skip if already translated this session
  if (translatedElements.has(el)) return;
  
  // Skip if no data-i18n attribute and no text content to translate
  const key = el.getAttribute('data-i18n');
  const text = el.textContent.trim();
  
  if (key) {
    // Use explicit key
    const translated = t(key);
    if (translated !== key) {
      // Preserve child elements (like icons) by only replacing text nodes
      const textNodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeValue.trim()) textNodes.push(node);
      }
      
      // Replace only the last text node (usually the label after icons)
      if (textNodes.length > 0) {
        const lastNode = textNodes[textNodes.length - 1];
        lastNode.nodeValue = translated;
        translatedElements.add(el);
      } else {
        el.textContent = translated;
        translatedElements.add(el);
      }
    }
  } else if (text && TRANSLATIONS[window.currentLang] && TRANSLATIONS[window.currentLang][text]) {
    // Auto-translate by text content match
    const translated = t(text);
    if (translated !== text) {
      const textNodes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeValue.trim()) textNodes.push(node);
      }
      
      if (textNodes.length > 0) {
        const lastNode = textNodes[textNodes.length - 1];
        lastNode.nodeValue = translated;
        translatedElements.add(el);
      }
    }
  }
}

function translatePage() {
  // Translate elements with data-i18n attributes first
  document.querySelectorAll('[data-i18n]').forEach(translateElement);
  
  // Then try to auto-translate navigation items and buttons
  document.querySelectorAll('.nav-label, button span, h1, h2, h3, p, label').forEach(translateElement);

   // Handle placeholder translation for inputs
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translated = t(key);
    if (translated !== key) el.placeholder = translated;
  });
}


/* -------------------------
   LANGUAGE SWITCH
------------------------- */

function setLang(lang) {
  window.currentLang = lang;
  localStorage.setItem("lang", lang);
  
  // Clear translated set when switching languages
  translatePage();
  
  document.dispatchEvent(
    new CustomEvent("wv:langchange", { detail: { lang } })
  );
}

window.setLang = setLang;

window.WVI18n = {
  setLang,
  getLang: () => window.currentLang,
  translatePage
};


/* -------------------------
   AUTO TRANSLATE NEW UI (SAFE VERSION)
------------------------- */

let isTranslating = false;

const observer = new MutationObserver((mutations) => {
  // Prevent infinite loops
  if (isTranslating) return;
  
  const hasSignificantChanges = mutations.some(m => 
    m.type === 'childList' && 
    Array.from(m.addedNodes).some(n => 
      n.nodeType === Node.ELEMENT_NODE || 
      (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim())
    )
  );
  
  if (hasSignificantChanges) {
    isTranslating = true;
    requestAnimationFrame(() => {
      translatePage();
      isTranslating = false;
    });
  }
});

// Start observing after initial load
function startObserver() {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}


/* -------------------------
   INITIAL LOAD
------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  window.currentLang = localStorage.getItem("lang") || "en";
  translatePage();
  startObserver();
});
