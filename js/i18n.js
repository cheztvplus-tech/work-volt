/* -------------------------
   LANGUAGE STORAGE
------------------------- */

window.currentLang = localStorage.getItem("lang") || "en";


/* -------------------------
   TRANSLATION DICTIONARY
   (LOADED FROM translations.js)
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
  
  // Skip INPUT/TEXTAREA elements (placeholders handled separately in translatePage)
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return;
  }
  
  // For regular elements, translate text content
  // Preserve child elements (icons, etc.)
  if (el.children.length > 0 || el.querySelector('i, svg, img')) {
    // Has child elements, find text nodes
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeValue.trim()) textNodes.push(node);
    }
    if (textNodes.length > 0) {
      // Replace the last text node (usually the label after icons)
      // Trim the existing value and replace completely
      const lastNode = textNodes[textNodes.length - 1];
      const currentText = lastNode.nodeValue.trim();
      
      // Only update if this isn't already the correct translation
      // Check against both the key and current language translation
      if (currentText !== translated && currentText !== key) {
        // Add a single space before if there are previous siblings
        const needsSpace = lastNode.previousSibling && lastNode.previousSibling.nodeType === Node.ELEMENT_NODE;
        lastNode.nodeValue = needsSpace ? ' ' + translated : translated;
      }
    } else {
      el.textContent = translated;
    }
  } else {
    el.textContent = translated;
  }
}

function translatePage() {
  // Translate all elements with data-i18n or data-i18n-placeholder
  document.querySelectorAll('[data-i18n], [data-i18n-placeholder]').forEach(el => {
    // Handle placeholder translations
    const placeholderKey = el.getAttribute('data-i18n-placeholder');
    if (placeholderKey) {
      el.placeholder = t(placeholderKey);
    }
    
    // Handle regular data-i18n translations
    const key = el.getAttribute('data-i18n');
    if (key) {
      translateElement(el);
    }
  });
}

window.translatePage = translatePage;


/* -------------------------
   LANGUAGE SWITCH
------------------------- */

function setLang(lang) {
  console.log('Switching language from', window.currentLang, 'to', lang);
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
        if (node.hasAttribute && (node.hasAttribute('data-i18n') || node.hasAttribute('data-i18n-placeholder'))) {
          shouldTranslate = true;
        } else if (node.querySelector && (node.querySelector('[data-i18n]') || node.querySelector('[data-i18n-placeholder]'))) {
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
  console.log('i18n: DOM loaded, current lang:', window.currentLang);
  window.currentLang = localStorage.getItem("lang") || "en";
  translatePage();
  
  // Start watching for dynamic content
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});
