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

function t(key){

  const lang = window.currentLang;

  if(!TRANSLATIONS[lang]) return key;

  if(TRANSLATIONS[lang][key] !== undefined){
    return TRANSLATIONS[lang][key];
  }

  if(TRANSLATIONS.en && TRANSLATIONS.en[key]){
    return TRANSLATIONS.en[key];
  }

  return key;

}

window.t = t;


/* -------------------------
   PAGE TRANSLATION ENGINE
------------------------- */

function translatePage(){

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

    const translated = t(text);

    if(translated !== text){
      node.nodeValue = translated;
    }

  }

}


/* -------------------------
   LANGUAGE SWITCH
------------------------- */

function setLang(lang){

  window.currentLang = lang;

  localStorage.setItem("lang", lang);

  translatePage();

  document.dispatchEvent(
    new CustomEvent("wv:langchange",{detail:{lang}})
  );

}

window.setLang = setLang;

window.WVI18n = {
  setLang,
  getLang: () => window.currentLang
};


/* -------------------------
   AUTO TRANSLATE NEW UI
------------------------- */

const observer = new MutationObserver(() => {
  translatePage();
});

observer.observe(document.body,{
  childList:true,
  subtree:true
});


/* -------------------------
   INITIAL LOAD
------------------------- */

document.addEventListener("DOMContentLoaded", () => {

  window.currentLang = localStorage.getItem("lang") || "en";

  translatePage();

});
