/* -------------------------
   LANGUAGE STORAGE
------------------------- */

window.currentLang = localStorage.getItem("lang") || "en";


/* -------------------------
   TRANSLATION DICTIONARY
------------------------- */

const TRANSLATIONS = window.TRANSLATIONS || {};


/* -------------------------
   CORE TRANSLATOR
------------------------- */

function t(key) {
  if (!key) return '';
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

function translateElement(el) {
  const key = el.getAttribute('data-i18n');
  if (!key) return;
  
  const translated = t(key);
  if (translated === key) return; // No translation found
  
  // Don't re-translate if already translated
  if (el.getAttribute('data-translated') === 'true') return;
  
  // Handle different element types
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    // For inputs, translate placeholder or value
    if (el.getAttribute('data-i18n-placeholder')) {
      el.placeholder = translated;
    } else {
      el.value = translated;
    }
  } else {
    // For regular elements, translate text content
    // Preserve child elements (icons, etc.)
    if (el.children.length > 0) {
      // Has child elements, find text nodes
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeValue.trim()) textNodes.push(node);
      }
      if (textNodes.length > 0) {
        // Replace the last text node (usually the label after icons)
        textNodes[textNodes.length - 1].nodeValue = ' ' + translated;
      } else {
        el.textContent = translated;
      }
    } else {
      el.textContent = translated;
    }
  }
  
  el.setAttribute('data-translated', 'true');
}

function translatePage() {
  // Remove translated markers to allow re-translation
  document.querySelectorAll('[data-translated="true"]').forEach(el => {
    el.removeAttribute('data-translated');
  });
  
  // Translate all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(translateElement);
  
  // Handle placeholder translations
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translated = t(key);
    if (translated !== key) el.placeholder = translated;
  });
}

window.translatePage = translatePage;


/* -------------------------
   LANGUAGE SWITCH
------------------------- */

function setLang(lang) {
  window.currentLang = lang;
  localStorage.setItem("lang", lang);
  translatePage();
  document.dispatchEvent(new CustomEvent("wv:langchange", { detail: { lang } }));
}

window.setLang = setLang;

window.WVI18n = {
  setLang,
  getLang: () => window.currentLang,
  translatePage
};


/* -------------------------
   AUTO TRANSLATE DYNAMIC CONTENT
------------------------- */

// Watch for new elements being added and translate them
const observer = new MutationObserver((mutations) => {
  let shouldTranslate = false;
  
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Check if new element has data-i18n or contains elements with data-i18n
        if (node.hasAttribute && node.hasAttribute('data-i18n')) {
          shouldTranslate = true;
        } else if (node.querySelector && node.querySelector('[data-i18n]')) {
          shouldTranslate = true;
        }
      }
    });
  });
  
  if (shouldTranslate) {
    // Small delay to ensure DOM is ready
    setTimeout(translatePage, 10);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  window.currentLang = localStorage.getItem("lang") || "en";
  translatePage();
  
  // Start watching for dynamic content
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});
