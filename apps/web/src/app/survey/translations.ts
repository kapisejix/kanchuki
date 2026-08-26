// Retailer discovery survey — question/option copy in 3 languages.
// Mirrors docs/survey/retailer-pain-point.html field-for-field so API
// payload keys (see apps/api/src/routes/team/team-survey.ts) stay stable
// across languages — only the label text changes. Staff-only tool: a field
// agent fills this in while standing in the retailer's shop.

export type Locale = 'en' | 'hi' | 'pa'
export type Text = Record<Locale, string>

export interface Option {
  value: string
  label: Text
}

export type QType = 'text' | 'tel' | 'select' | 'radio' | 'checkbox' | 'textarea' | 'likert'

export interface Question {
  name: string
  type: QType
  label: Text
  hint?: Text
  placeholder?: Text
  options?: Option[]
  otherField?: { name: string; placeholder: Text }
}

export interface Section {
  title: Text
  questions: Question[]
}

const t = (en: string, hi: string, pa: string): Text => ({ en, hi, pa })

export const UI = {
  pageTitle: t(
    'Retailer Discovery & Sales Form',
    'दुकान खोज और सेल्स फॉर्म',
    'ਦੁਕਾਨ ਖੋਜ ਅਤੇ ਸੇਲਜ਼ ਫਾਰਮ',
  ),
  pageLead: t(
    'Field sales form — collect retailer store details, pain points & generate instant referral onboarding ID.',
    'फील्ड सेल्स फॉर्म — रिटेलर स्टोर विवरण, समस्याएं दर्ज करें और तुरंत रेफरल आईडी बनाएं।',
    'ਫੀਲਡ ਸੇਲਜ਼ ਫਾਰਮ — ਰਿਟੇਲਰ ਸਟੋਰ ਵੇਰਵੇ, ਸਮੱਸਿਆਵਾਂ ਦਰਜ ਕਰੋ ਅਤੇ ਤੁਰੰਤ ਰੈਫਰਲ ਆਈਡੀ ਬਣਾਓ।',
  ),
  submit: t('Submit Sales Form', 'सेल्स फॉर्म जमा करें', 'ਸੇਲਜ਼ ਫਾਰਮ ਜਮ੍ਹਾ ਕਰੋ'),
  sending: t('Saving & Generating Referral ID…', 'सेव और रेफरल आईडी बन रहा है…', 'ਸੇਵ ਅਤੇ ਰੈਫਰਲ ਆਈਡੀ ਬਣ ਰਿਹਾ ਹੈ…'),
  sentTitle: t('Sales Form Recorded!', 'सेल्स फॉर्म सेव हो गया!', 'ਸੇਲਜ਼ ਫਾਰਮ ਸੇਵ ਹੋ ਗਿਆ!'),
  sentBody: t(
    'Retailer survey and lead recorded successfully under your sales ID.',
    'रिटेलर प्रोफाइल और सर्वे आपकी सेल्स आईडी के तहत दर्ज हो गया है।',
    'ਰਿਟੇਲਰ ਪ੍ਰੋਫਾਈਲ ਅਤੇ ਸਰਵੇ ਤੁਹਾਡੀ ਸੇਲਜ਼ ਆਈਡੀ ਦੇ ਤਹਿਤ ਦਰਜ ਹੋ ਗਿਆ ਹੈ।',
  ),
  submitAnother: t('Submit Another Sales Form', 'एक और सेल्स फॉर्म भरें', 'ਇੱਕ ਹੋਰ ਸੇਲਜ਼ ਫਾਰਮ ਭਰੋ'),
  errorMsg: t(
    'Something went wrong — please try again.',
    'कुछ गड़बड़ हो गई — कृपया दोबारा कोशिश करें।',
    'ਕੁਝ ਗਲਤ ਹੋ ਗਿਆ — ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
  ),
  otherLabel: t('Other:', 'अन्य:', 'ਹੋਰ:'),
  pickUpTo3: t('(pick up to 3)', '(अधिकतम 3 चुनें)', '(ਵੱਧ ਤੋਂ ਵੱਧ 3 ਚੁਣੋ)'),
  checkAll: t('(check all that apply)', '(जो लागू हो सब चुनें)', '(ਜੋ ਲਾਗੂ ਹੋਵੇ ਸਭ ਚੁਣੋ)'),
  likertNotProblem: t('No problem', 'कोई समस्या नहीं', 'ਕੋਈ ਸਮੱਸਿਆ ਨਹੀਂ'),
  likertMajor: t('Major daily problem', 'रोज़ की बड़ी समस्या', 'ਰੋਜ਼ ਦੀ ਵੱਡੀ ਸਮੱਸਿਆ'),
}

export const LIKERT_LEVELS = [
  { value: '1', label: t('1 · No Problem', '1 · कोई समस्या नहीं', '1 · ਕੋਈ ਸਮੱਸਿਆ ਨਹੀਂ') },
  { value: '2', label: t('2 · Minor', '2 · मामूली', '2 · ਮਾਮੂਲੀ') },
  { value: '3', label: t('3 · Moderate', '3 · मध्यम', '3 · ਮੱਧਮ') },
  { value: '4', label: t('4 · High Frustration', '4 · काफ़ी परेशानी', '4 · ਕਾਫ਼ੀ ਪਰੇਸ਼ਾਨੀ') },
  { value: '5', label: t('5 · Major Daily Pain', '5 · रोज़ की बड़ी समस्या', '5 · ਰੋਜ਼ ਦੀ ਵੱਡੀ ਮੁਸ਼ਕਲ') },
]

export const SECTIONS: Section[] = [
  {
    title: t('1. About Your Store', '1. आपकी दुकान के बारे में', '1. ਤੁਹਾਡੀ ਦੁਕਾਨ ਬਾਰੇ'),
    questions: [
      { name: 'storeName', type: 'text', label: t('Store name', 'दुकान का नाम', 'ਦੁਕਾਨ ਦਾ ਨਾਮ') },
      { name: 'ownerName', type: 'text', label: t('Owner / manager name', 'मालिक / मैनेजर का नाम', 'ਮਾਲਕ / ਮੈਨੇਜਰ ਦਾ ਨਾਮ') },
      { name: 'city', type: 'text', label: t('City / area', 'शहर / इलाका', 'ਸ਼ਹਿਰ / ਇਲਾਕਾ') },
      {
        name: 'years',
        type: 'select',
        label: t('Years in business', 'व्यवसाय में कितने साल', 'ਕਾਰੋਬਾਰ ਵਿੱਚ ਕਿੰਨੇ ਸਾਲ'),
        options: [
          { value: 'under1', label: t('Under 1 year', '1 साल से कम', '1 ਸਾਲ ਤੋਂ ਘੱਟ') },
          { value: '1to3', label: t('1–3 years', '1–3 साल', '1–3 ਸਾਲ') },
          { value: '3to10', label: t('3–10 years', '3–10 साल', '3–10 ਸਾਲ') },
          { value: '10plus', label: t('10+ years', '10+ साल', '10+ ਸਾਲ') },
        ],
      },
      {
        name: 'category',
        type: 'checkbox',
        label: t('What does your store mainly sell?', 'आपकी दुकान मुख्य रूप से क्या बेचती है?', 'ਤੁਹਾਡੀ ਦੁਕਾਨ ਮੁੱਖ ਤੌਰ \'ਤੇ ਕੀ ਵੇਚਦੀ ਹੈ?'),
        options: [
          { value: 'mens', label: t("Men's wear", 'पुरुषों के कपड़े', 'ਮਰਦਾਂ ਦੇ ਕੱਪੜੇ') },
          { value: 'womens', label: t("Women's wear", 'महिलाओं के कपड़े', 'ਔਰਤਾਂ ਦੇ ਕੱਪੜੇ') },
          { value: 'kids', label: t('Kids wear', 'बच्चों के कपड़े', 'ਬੱਚਿਆਂ ਦੇ ਕੱਪੜੇ') },
          { value: 'ethnic', label: t('Ethnic / sarees / suits', 'एथनिक / साड़ी / सूट', 'ਐਥਨਿਕ / ਸਾੜੀ / ਸੂਟ') },
          { value: 'footwear', label: t('Footwear / accessories', 'फुटवियर / एक्सेसरीज़', 'ਫੁੱਟਵੀਅਰ / ਐਕਸੈਸਰੀਜ਼') },
        ],
        otherField: { name: 'categoryOther', placeholder: t('Other category', 'अन्य श्रेणी', 'ਹੋਰ ਸ਼੍ਰੇਣੀ') },
      },
      {
        name: 'skuCount',
        type: 'select',
        label: t('Roughly how many products (designs) do you stock?', 'लगभग कितने प्रोडक्ट (डिज़ाइन) रखते हैं?', 'ਲਗਭਗ ਕਿੰਨੇ ਪ੍ਰੋਡਕਟ (ਡਿਜ਼ਾਈਨ) ਰੱਖਦੇ ਹੋ?'),
        options: [
          { value: 'under100', label: t('Under 100', '100 से कम', '100 ਤੋਂ ਘੱਟ') },
          { value: '100to500', label: t('100–500', '100–500', '100–500') },
          { value: '500to2000', label: t('500–2000', '500–2000', '500–2000') },
          { value: '2000plus', label: t('2000+', '2000+', '2000+') },
        ],
      },
      {
        name: 'staffCount',
        type: 'select',
        label: t('Number of staff (excluding owner)', 'स्टाफ की संख्या (मालिक को छोड़कर)', 'ਸਟਾਫ ਦੀ ਗਿਣਤੀ (ਮਾਲਕ ਨੂੰ ਛੱਡ ਕੇ)'),
        options: [
          { value: '0', label: t('0 (just me)', '0 (सिर्फ़ मैं)', '0 (ਸਿਰਫ਼ ਮੈਂ)') },
          { value: '1to2', label: t('1–2', '1–2', '1–2') },
          { value: '3to5', label: t('3–5', '3–5', '3–5') },
          { value: '6plus', label: t('6+', '6+', '6+') },
        ],
      },
    ],
  },
  {
    title: t(
      '2. Showing Products & Going Online — Your Real Pain Points',
      '2. प्रोडक्ट दिखाना और ऑनलाइन जाना — असली समस्याएं',
      '2. ਪ੍ਰੋਡਕਟ ਦਿਖਾਉਣਾ ਅਤੇ ਆਨਲਾਈਨ ਜਾਣਾ — ਅਸਲੀ ਸਮੱਸਿਆਵਾਂ',
    ),
    questions: [
      {
        name: 'manualShowCount',
        type: 'select',
        label: t('On average, how many items do you show a customer manually per visit?', 'औसतन एक ग्राहक को कितने आइटम हाथ से दिखाते हैं?', 'ਔਸਤਨ ਇੱਕ ਗਾਹਕ ਨੂੰ ਕਿੰਨੇ ਆਈਟਮ ਹੱਥ ਨਾਲ ਦਿਖਾਉਂਦੇ ਹੋ?'),
        options: [
          { value: 'under5', label: t('Under 5', '5 से कम', '5 ਤੋਂ ਘੱਟ') },
          { value: '5to10', label: t('5–10', '5–10', '5–10') },
          { value: '10to20', label: t('10–20', '10–20', '10–20') },
          { value: '20plus', label: t('20+', '20+', '20+') },
        ],
      },
      {
        name: 'timePerCustomer',
        type: 'select',
        label: t('How much time do you spend with ONE customer showing products?', 'एक ग्राहक को प्रोडक्ट दिखाने में कितना समय लगता है?', 'ਇੱਕ ਗਾਹਕ ਨੂੰ ਪ੍ਰੋਡਕਟ ਦਿਖਾਉਣ ਵਿੱਚ ਕਿੰਨਾ ਸਮਾਂ ਲੱਗਦਾ ਹੈ?'),
        options: [
          { value: 'under10', label: t('Under 10 minutes', '10 मिनट से कम', '10 ਮਿੰਟ ਤੋਂ ਘੱਟ') },
          { value: '10to20', label: t('10–20 minutes', '10–20 मिनट', '10–20 ਮਿੰਟ') },
          { value: '20to40', label: t('20–40 minutes', '20–40 मिनट', '20–40 ਮਿੰਟ') },
          { value: '40plus', label: t('40+ minutes', '40+ मिनट', '40+ ਮਿੰਟ') },
        ],
      },
      {
        name: 'purchaseRate',
        type: 'radio',
        label: t('Out of the items you show, how many does the customer actually buy?', 'दिखाए गए आइटम में से ग्राहक असल में कितने खरीदता है?', 'ਦਿਖਾਏ ਗਏ ਆਈਟਮ ਵਿੱਚੋਂ ਗਾਹਕ ਅਸਲ ਵਿੱਚ ਕਿੰਨੇ ਖਰੀਦਦਾ ਹੈ?'),
        options: [
          { value: '1item', label: t('Usually just 1 item', 'आमतौर पर सिर्फ़ 1 आइटम', 'ਆਮ ਤੌਰ \'ਤੇ ਸਿਰਫ਼ 1 ਆਈਟਮ') },
          { value: 'fewItems', label: t('A few (2–3) out of what\'s shown', 'दिखाए में से कुछ (2–3)', 'ਦਿਖਾਏ ਵਿੱਚੋਂ ਕੁਝ (2–3)') },
          { value: 'mostShown', label: t('Most of what\'s shown', 'ज़्यादातर दिखाए गए', 'ਜ਼ਿਆਦਾਤਰ ਦਿਖਾਏ ਗਏ') },
          { value: 'oftenNothing', label: t('Often nothing at all', 'अक्सर कुछ भी नहीं', 'ਅਕਸਰ ਕੁਝ ਵੀ ਨਹੀਂ') },
        ],
      },
      { name: 'irritationLevel', type: 'likert', label: t("How irritating/tiring is it when a customer checks 10–15 items and still doesn't buy?", 'ग्राहक 10–15 आइटम देखकर भी न खरीदे तो कितना थका देने वाला लगता है?', 'ਗਾਹਕ 10–15 ਆਈਟਮ ਵੇਖ ਕੇ ਵੀ ਨਾ ਖਰੀਦੇ ਤਾਂ ਕਿੰਨਾ ਥਕਾ ਦੇਣ ਵਾਲਾ ਲੱਗਦਾ ਹੈ?') },
      {
        name: 'rateColorTrendAsk',
        type: 'checkbox',
        label: t(
          'Do customers ask you to show products by?',
          'क्या ग्राहक आपसे प्रोडक्ट इसके हिसाब से दिखाने को कहते हैं?',
          'ਕੀ ਗਾਹਕ ਤੁਹਾਨੂੰ ਇਹਨਾਂ ਦੇ ਹਿਸਾਬ ਨਾਲ ਪ੍ਰੋਡਕਟ ਦਿਖਾਉਣ ਲਈ ਕਹਿੰਦੇ ਹਨ?'
        ),
        hint: UI.checkAll,
        options: [
          { value: 'priceRange', label: t('Price range (budget)', 'कीमत सीमा (बजट)', 'ਕੀਮਤ ਸੀਮਾ (ਬਜਟ)') },
          { value: 'color', label: t('Color / shade', 'रंग / शेड', 'ਰੰਗ / ਸ਼ੇਡ') },
          { value: 'trendingNow', label: t("What's trending now / new arrivals", 'नया ट्रेंड / नया स्टॉक', 'ਨਵਾਂ ਟ੍ਰੈਂਡ / ਨਵਾਂ ਸਟਾਕ') },
          { value: 'occasion', label: t('Occasion / festival / wedding wear', 'त्योहार / शादी के कपड़े', 'ਤਿਉਹਾਰ / ਵਿਆਹ ਦੇ ਕੱਪੜੇ') },
          { value: 'fabric', label: t('Fabric / material quality', 'कपड़े की क्वालिटी / फैब्रिक', 'ਕੱਪੜੇ ਦੀ ਕੁਆਲਿਟੀ / ਫੈਬਰਿਕ') },
        ],
        otherField: { name: 'rateColorTrendAskOther', placeholder: t('Other request', 'अन्य मांग', 'ਹੋਰ ਮੰਗ') },
      },
      {
        name: 'mobileCatalogValue',
        type: 'radio',
        label: t("If you could show ALL your products on the customer's own phone — without physically showing each item — how valuable would that be?", 'अगर सारे प्रोडक्ट ग्राहक के फ़ोन पर दिखा सकें — बिना हर आइटम शारीरिक रूप से दिखाए — तो यह कितना मूल्यवान होगा?', 'ਜੇ ਸਾਰੇ ਪ੍ਰੋਡਕਟ ਗਾਹਕ ਦੇ ਫ਼ੋਨ \'ਤੇ ਦਿਖਾ ਸਕੀਏ — ਬਿਨਾਂ ਹਰ ਆਈਟਮ ਸਰੀਰਕ ਤੌਰ \'ਤੇ ਦਿਖਾਏ — ਤਾਂ ਇਹ ਕਿੰਨਾ ਕੀਮਤੀ ਹੋਵੇਗਾ?'),
        options: [
          { value: 'veryValuable', label: t('Very valuable', 'बहुत मूल्यवान', 'ਬਹੁਤ ਕੀਮਤੀ') },
          { value: 'somewhatValuable', label: t('Somewhat valuable', 'कुछ हद तक मूल्यवान', 'ਕੁਝ ਹੱਦ ਤੱਕ ਕੀਮਤੀ') },
          { value: 'notNeeded', label: t('Not needed', 'ज़रूरत नहीं', 'ਲੋੜ ਨਹੀਂ') },
          { value: 'notSure', label: t('Not sure', 'पक्का नहीं', 'ਪੱਕਾ ਨਹੀਂ') },
        ],
      },
      {
        name: 'staffWorkReduction',
        type: 'radio',
        label: t("Do you think showing all items on the customer's mobile would reduce your/your staff's work?", 'क्या लगता है ग्राहक के मोबाइल पर सब दिखाने से आपका/स्टाफ का काम कम होगा?', 'ਕੀ ਲੱਗਦਾ ਹੈ ਗਾਹਕ ਦੇ ਮੋਬਾਈਲ \'ਤੇ ਸਭ ਦਿਖਾਉਣ ਨਾਲ ਤੁਹਾਡਾ/ਸਟਾਫ ਦਾ ਕੰਮ ਘਟੇਗਾ?'),
        options: [
          { value: 'yesDefinitely', label: t('Yes, definitely', 'हाँ, ज़रूर', 'ਹਾਂ, ਜ਼ਰੂਰ') },
          { value: 'maybe', label: t('Maybe, not sure how much', 'शायद, कितना पक्का नहीं', 'ਸ਼ਾਇਦ, ਕਿੰਨਾ ਪੱਕਾ ਨਹੀਂ') },
          { value: 'no', label: t('No', 'नहीं', 'ਨਹੀਂ') },
        ],
      },
      { name: 'onlineShoppingEffect', type: 'likert', label: t('How has online shopping (Myntra/Meesho/Instagram sellers) affected your business?', 'ऑनलाइन शॉपिंग (Myntra/Meesho/Instagram) से बिज़नेस पर कितना असर पड़ा है?', 'ਆਨਲਾਈਨ ਸ਼ਾਪਿੰਗ (Myntra/Meesho/Instagram) ਨਾਲ ਬਿਜ਼ਨਸ \'ਤੇ ਕਿੰਨਾ ਅਸਰ ਪਿਆ ਹੈ?') },
      {
        name: 'whyNotOnline',
        type: 'checkbox',
        label: t("Why haven't you made your store online yet?", 'दुकान अभी तक ऑनलाइन क्यों नहीं की?', 'ਦੁਕਾਨ ਹੁਣ ਤੱਕ ਆਨਲਾਈਨ ਕਿਉਂ ਨਹੀਂ ਕੀਤੀ?'),
        hint: UI.checkAll,
        options: [
          { value: 'tooExpensive', label: t('Too expensive', 'बहुत महंगा', 'ਬਹੁਤ ਮਹਿੰਗਾ') },
          { value: 'dontKnowHow', label: t("Don't know how / not tech-savvy", 'पता नहीं कैसे / तकनीक की समझ नहीं', 'ਪਤਾ ਨਹੀਂ ਕਿਵੇਂ / ਤਕਨੀਕ ਦੀ ਸਮਝ ਨਹੀਂ') },
          { value: 'noTime', label: t('No time to manage it', 'संभालने का समय नहीं', 'ਸੰਭਾਲਣ ਦਾ ਸਮਾਂ ਨਹੀਂ') },
          { value: 'triedComplicated', label: t('Tried before, too complicated', 'पहले कोशिश की, बहुत मुश्किल', 'ਪਹਿਲਾਂ ਕੋਸ਼ਿਸ਼ ਕੀਤੀ, ਬਹੁਤ ਔਖਾ') },
          { value: 'notNeeded', label: t("Don't think it's needed for my store", 'लगता नहीं मेरी दुकान के लिए ज़रूरी है', 'ਲੱਗਦਾ ਨਹੀਂ ਮੇਰੀ ਦੁਕਾਨ ਲਈ ਜ਼ਰੂਰੀ ਹੈ') },
        ],
        otherField: { name: 'whyNotOnlineOther', placeholder: t('Other reason', 'अन्य कारण', 'ਹੋਰ ਕਾਰਨ') },
      },
    ],
  },
  {
    title: t('3. Online Presence Today', '3. वर्तमान ऑनलाइन उपस्थिति', '3. ਮੌਜੂਦਾ ਆਨਲਾਈਨ ਮੌਜੂਦਗੀ'),
    questions: [
      {
        name: 'hasWebsite',
        type: 'radio',
        label: t('Do you have a website?', 'क्या आपकी वेबसाइट है?', 'ਕੀ ਤੁਹਾਡੀ ਵੈੱਬਸਾਈਟ ਹੈ?'),
        options: [
          { value: 'yes', label: t('Yes, and I update it myself', 'हाँ, और मैं खुद अपडेट करता हूँ', 'ਹਾਂ, ਅਤੇ ਮੈਂ ਖੁਦ ਅੱਪਡੇਟ ਕਰਦਾ ਹਾਂ') },
          { value: 'yes_other', label: t('Yes, but someone else updates it', 'हाँ, पर कोई और अपडेट करता है', 'ਹਾਂ, ਪਰ ਕੋਈ ਹੋਰ ਅੱਪਡੇਟ ਕਰਦਾ ਹੈ') },
          { value: 'had', label: t('Had one, not maintained anymore', 'थी, अब मेंटेन नहीं होती', 'ਸੀ, ਹੁਣ ਮੇਨਟੇਨ ਨਹੀਂ ਹੁੰਦੀ') },
          { value: 'no', label: t('No', 'नहीं', 'ਨਹੀਂ') },
        ],
      },
      {
        name: 'social',
        type: 'checkbox',
        label: t('Which social media do you actively use for the store?', 'दुकान के लिए कौन सी सोशल मीडिया इस्तेमाल करते हैं?', 'ਦੁਕਾਨ ਲਈ ਕਿਹੜੀ ਸੋਸ਼ਲ ਮੀਡੀਆ ਵਰਤਦੇ ਹੋ?'),
        hint: UI.checkAll,
        options: [
          { value: 'instagram', label: t('Instagram', 'इंस्टाग्राम', 'ਇੰਸਟਾਗ੍ਰਾਮ') },
          { value: 'facebook', label: t('Facebook Page', 'फेसबुक पेज', 'ਫੇਸਬੁੱਕ ਪੇਜ') },
          { value: 'whatsappBusiness', label: t('WhatsApp Business (broadcast/status)', 'व्हाट्सएप बिज़नेस (ब्रॉडकास्ट/स्टेटस)', 'ਵਟਸਐਪ ਬਿਜ਼ਨਸ (ਬ੍ਰੌਡਕਾਸਟ/ਸਟੇਟਸ)') },
          { value: 'youtube', label: t('YouTube', 'यूट्यूब', 'ਯੂਟਿਊਬ') },
          { value: 'none', label: t('None of these', 'इनमें से कोई नहीं', 'ਇਹਨਾਂ ਵਿੱਚੋਂ ਕੋਈ ਨਹੀਂ') },
        ],
      },
      {
        name: 'whoPosts',
        type: 'radio',
        label: t('Who posts on social media for the store?', 'दुकान के लिए सोशल मीडिया पर कौन पोस्ट करता है?', 'ਦੁਕਾਨ ਲਈ ਸੋਸ਼ਲ ਮੀਡੀਆ \'ਤੇ ਕੌਣ ਪੋਸਟ ਕਰਦਾ ਹੈ?'),
        options: [
          { value: 'me', label: t('I do it myself', 'मैं खुद करता हूँ', 'ਮੈਂ ਖੁਦ ਕਰਦਾ ਹਾਂ') },
          { value: 'staff', label: t('A staff member', 'कोई स्टाफ सदस्य', 'ਕੋਈ ਸਟਾਫ ਮੈਂਬਰ') },
          { value: 'agency', label: t('Paid agency / freelancer', 'पेड एजेंसी / फ्रीलांसर', 'ਪੇਡ ਏਜੰਸੀ / ਫ੍ਰੀਲਾਂਸਰ') },
          { value: 'nobody', label: t("Nobody, it's not kept updated", 'कोई नहीं, अपडेट नहीं रहती', 'ਕੋਈ ਨਹੀਂ, ਅੱਪਡੇਟ ਨਹੀਂ ਰਹਿੰਦੀ') },
        ],
      },
      {
        name: 'postFreq',
        type: 'radio',
        label: t('How often is new stock actually posted online?', 'नया स्टॉक ऑनलाइन कितनी बार पोस्ट होता है?', 'ਨਵਾਂ ਸਟਾਕ ਆਨਲਾਈਨ ਕਿੰਨੀ ਵਾਰ ਪੋਸਟ ਹੁੰਦਾ ਹੈ?'),
        options: [
          { value: 'daily', label: t('Daily', 'रोज़', 'ਰੋਜ਼') },
          { value: 'weekly', label: t('A few times a week', 'हफ्ते में कुछ बार', 'ਹਫ਼ਤੇ ਵਿੱਚ ਕੁਝ ਵਾਰ') },
          { value: 'monthly', label: t('A few times a month', 'महीने में कुछ बार', 'ਮਹੀਨੇ ਵਿੱਚ ਕੁਝ ਵਾਰ') },
          { value: 'rarely', label: t('Rarely / never', 'कभी-कभार / कभी नहीं', 'ਕਦੇ-ਕਦਾਈਂ / ਕਦੇ ਨਹੀਂ') },
        ],
      },
      {
        name: 'gmb',
        type: 'radio',
        label: t('Is your store listed on Google Business Profile / Maps?', 'क्या दुकान Google Business Profile / Maps पर है?', 'ਕੀ ਦੁਕਾਨ Google Business Profile / Maps \'ਤੇ ਹੈ?'),
        options: [
          { value: 'claimed_active', label: t('Yes, claimed and I update it', 'हाँ, क्लेम की है और अपडेट करता हूँ', 'ਹਾਂ, ਕਲੇਮ ਕੀਤੀ ਹੈ ਅਤੇ ਅੱਪਡੇਟ ਕਰਦਾ ਹਾਂ') },
          { value: 'claimed_inactive', label: t('Claimed but never touched since', 'क्लेम की पर कभी अपडेट नहीं की', 'ਕਲੇਮ ਕੀਤੀ ਪਰ ਕਦੇ ਅੱਪਡੇਟ ਨਹੀਂ ਕੀਤੀ') },
          { value: 'unclaimed', label: t('Listed but not claimed by me', 'लिस्टेड है पर मैंने क्लेम नहीं की', 'ਲਿਸਟਡ ਹੈ ਪਰ ਮੈਂ ਕਲੇਮ ਨਹੀਂ ਕੀਤੀ') },
          { value: 'none', label: t("Not listed / don't know", 'लिस्टेड नहीं / पता नहीं', 'ਲਿਸਟਡ ਨਹੀਂ / ਪਤਾ ਨਹੀਂ') },
        ],
      },
      { name: 'gRating', type: 'text', label: t('Approx. Google rating (if known)', 'लगभग Google रेटिंग (अगर पता हो)', 'ਲਗਭਗ Google ਰੇਟਿੰਗ (ਜੇ ਪਤਾ ਹੋਵੇ)'), placeholder: t('e.g. 4.2 stars, 30 reviews', 'जैसे 4.2 स्टार, 30 रिव्यू', 'ਜਿਵੇਂ 4.2 ਸਟਾਰ, 30 ਰਿਵਿਊ') },
      {
        name: 'reviewHabit',
        type: 'radio',
        label: t('Do you ask for / respond to reviews?', 'क्या आप रिव्यू माँगते / जवाब देते हैं?', 'ਕੀ ਤੁਸੀਂ ਰਿਵਿਊ ਮੰਗਦੇ / ਜਵਾਬ ਦਿੰਦੇ ਹੋ?'),
        options: [
          { value: 'yes', label: t('Yes, regularly', 'हाँ, नियमित रूप से', 'ਹਾਂ, ਨਿਯਮਿਤ ਤੌਰ \'ਤੇ') },
          { value: 'sometimes', label: t('Sometimes', 'कभी-कभी', 'ਕਦੇ-ਕਦੇ') },
          { value: 'never', label: t('Never', 'कभी नहीं', 'ਕਦੇ ਨਹੀਂ') },
        ],
      },
      {
        name: 'usesSoftware',
        type: 'radio',
        label: t('Do you use any software/app to manage your store?', 'क्या दुकान चलाने के लिए कोई सॉफ्टवेयर/ऐप इस्तेमाल करते हैं?', 'ਕੀ ਦੁਕਾਨ ਚਲਾਉਣ ਲਈ ਕੋਈ ਸਾਫਟਵੇਅਰ/ਐਪ ਵਰਤਦੇ ਹੋ?'),
        options: [
          { value: 'yes', label: t('Yes', 'हाँ', 'ਹਾਂ') },
          { value: 'tried', label: t('Tried before, stopped using it', 'पहले आज़माया, अब नहीं', 'ਪਹਿਲਾਂ ਅਜ਼ਮਾਇਆ, ਹੁਣ ਨਹੀਂ') },
          { value: 'no', label: t('No, everything manual / register', 'नहीं, सब मैन्युअल / रजिस्टर में', 'ਨਹੀਂ, ਸਭ ਮੈਨੂਅਲ / ਰਜਿਸਟਰ ਵਿੱਚ') },
        ],
        otherField: { name: 'softwareName', placeholder: t('Which app/software?', 'कौन सा ऐप/सॉफ्टवेयर?', 'ਕਿਹੜਾ ਐਪ/ਸਾਫਟਵੇਅਰ?') },
      },
    ],
  },
  {
    title: t('4. Reaching & Remembering Customers', '4. ग्राहकों तक पहुँचना और याद रखना', '4. ਗਾਹਕਾਂ ਤੱਕ ਪਹੁੰਚਣਾ ਅਤੇ ਯਾਦ ਰੱਖਣਾ'),
    questions: [
      {
        name: 'notifyMethod',
        type: 'checkbox',
        label: t('How do customers find out about new arrivals?', 'ग्राहकों को नए स्टॉक का पता कैसे चलता है?', 'ਗਾਹਕਾਂ ਨੂੰ ਨਵੇਂ ਸਟਾਕ ਦਾ ਪਤਾ ਕਿਵੇਂ ਲੱਗਦਾ ਹੈ?'),
        options: [
          { value: 'walkin', label: t('Have to walk in and see', 'दुकान आकर देखना पड़ता है', 'ਦੁਕਾਨ ਆ ਕੇ ਵੇਖਣਾ ਪੈਂਦਾ ਹੈ') },
          { value: 'whatsappPersonal', label: t('Personal WhatsApp message/call', 'निजी व्हाट्सएप मैसेज/कॉल', 'ਨਿੱਜੀ ਵਟਸਐਪ ਮੈਸੇਜ/ਕਾਲ') },
          { value: 'whatsappBroadcast', label: t('WhatsApp broadcast/group', 'व्हाट्सएप ब्रॉडकास्ट/ग्रुप', 'ਵਟਸਐਪ ਬ੍ਰੌਡਕਾਸਟ/ਗਰੁੱਪ') },
          { value: 'socialPost', label: t('Social media post', 'सोशल मीडिया पोस्ट', 'ਸੋਸ਼ਲ ਮੀਡੀਆ ਪੋਸਟ') },
          { value: 'none', label: t("They mostly don't find out", 'ज़्यादातर पता नहीं चलता', 'ਜ਼ਿਆਦਾਤਰ ਪਤਾ ਨਹੀਂ ਲੱਗਦਾ') },
        ],
      },
      {
        name: 'custRecord',
        type: 'radio',
        label: t('Do you keep a record of customers (phone, sizes, likes)?', 'क्या ग्राहकों का रिकॉर्ड रखते हैं (फोन, साइज़, पसंद)?', 'ਕੀ ਗਾਹਕਾਂ ਦਾ ਰਿਕਾਰਡ ਰੱਖਦੇ ਹੋ (ਫੋਨ, ਸਾਈਜ਼, ਪਸੰਦ)?'),
        options: [
          { value: 'digital', label: t('Yes, in an app/software', 'हाँ, ऐप/सॉफ्टवेयर में', 'ਹਾਂ, ਐਪ/ਸਾਫਟਵੇਅਰ ਵਿੱਚ') },
          { value: 'register', label: t('Yes, notebook/Excel', 'हाँ, रजिस्टर/एक्सेल में', 'ਹਾਂ, ਰਜਿਸਟਰ/ਐਕਸਲ ਵਿੱਚ') },
          { value: 'memory', label: t('No, I just remember regulars', 'नहीं, बस पुराने ग्राहक याद रहते हैं', 'ਨਹੀਂ, ਬੱਸ ਪੁਰਾਣੇ ਗਾਹਕ ਯਾਦ ਰਹਿੰਦੇ ਹਨ') },
          { value: 'none', label: t('No record at all', 'कोई रिकॉर्ड नहीं', 'ਕੋਈ ਰਿਕਾਰਡ ਨਹੀਂ') },
        ],
      },
      {
        name: 'repeatPct',
        type: 'radio',
        label: t('Roughly what % of sales are repeat customers?', 'लगभग कितने % सेल पुराने ग्राहकों से होती है?', 'ਲਗਭਗ ਕਿੰਨੇ % ਸੇਲ ਪੁਰਾਣੇ ਗਾਹਕਾਂ ਤੋਂ ਹੁੰਦੀ ਹੈ?'),
        options: [
          { value: 'under20', label: t('Under 20%', '20% से कम', '20% ਤੋਂ ਘੱਟ') },
          { value: '20to50', label: t('20–50%', '20–50%', '20–50%') },
          { value: '50plus', label: t('Over 50%', '50% से ज़्यादा', '50% ਤੋਂ ਵੱਧ') },
          { value: 'dontknow', label: t("Don't know", 'पता नहीं', 'ਪਤਾ ਨਹੀਂ') },
        ],
      },
      {
        name: 'shareMethod',
        type: 'radio',
        label: t('How do you share a "collection" with a specific customer?', 'किसी ग्राहक को "कलेक्शन" कैसे भेजते हैं?', 'ਕਿਸੇ ਗਾਹਕ ਨੂੰ "ਕਲੈਕਸ਼ਨ" ਕਿਵੇਂ ਭੇਜਦੇ ਹੋ?'),
        options: [
          { value: 'photos', label: t('Individual photos one by one on WhatsApp', 'व्हाट्सएप पर एक-एक फोटो भेजकर', 'ਵਟਸਐਪ \'ਤੇ ਇੱਕ-ਇੱਕ ਫੋਟੋ ਭੇਜ ਕੇ') },
          { value: 'video', label: t('Video call / video walkthrough', 'वीडियो कॉल / वीडियो में दिखाकर', 'ਵੀਡੀਓ ਕਾਲ / ਵੀਡੀਓ ਵਿੱਚ ਦਿਖਾ ਕੇ') },
          { value: 'instore', label: t('Ask them to come to the store', 'दुकान बुलाकर', 'ਦੁਕਾਨ ਬੁਲਾ ਕੇ') },
          { value: 'link', label: t('Send a link/catalog', 'लिंक/कैटलॉग भेजकर', 'ਲਿੰਕ/ਕੈਟਲਾਗ ਭੇਜ ਕੇ') },
        ],
      },
    ],
  },
  {
    title: t('5. Selling, Payments & Promotions', '5. बिक्री, भुगतान और प्रमोशन', '5. ਵਿਕਰੀ, ਭੁਗਤਾਨ ਅਤੇ ਪ੍ਰਮੋਸ਼ਨ'),
    questions: [
      {
        name: 'orderChannel',
        type: 'checkbox',
        label: t('Where do you currently take orders from?', 'फिलहाल ऑर्डर कहाँ से लेते हैं?', 'ਫਿਲਹਾਲ ਆਰਡਰ ਕਿੱਥੋਂ ਲੈਂਦੇ ਹੋ?'),
        options: [
          { value: 'instore', label: t('In-store only', 'सिर्फ़ दुकान पर', 'ਸਿਰਫ਼ ਦੁਕਾਨ \'ਤੇ') },
          { value: 'whatsapp', label: t('WhatsApp orders', 'व्हाट्सएप ऑर्डर', 'ਵਟਸਐਪ ਆਰਡਰ') },
          { value: 'instagramDm', label: t('Instagram/Facebook DM', 'इंस्टाग्राम/फेसबुक DM', 'ਇੰਸਟਾਗ੍ਰਾਮ/ਫੇਸਬੁੱਕ DM') },
          { value: 'website', label: t('Own website/online store', 'अपनी वेबसाइट/ऑनलाइन स्टोर', 'ਆਪਣੀ ਵੈੱਬਸਾਈਟ/ਆਨਲਾਈਨ ਸਟੋਰ') },
          { value: 'marketplace', label: t('Meesho / Amazon / marketplace', 'मीशो / अमेज़न / मार्केटप्लेस', 'ਮੀਸ਼ੋ / ਐਮਾਜ਼ਾਨ / ਮਾਰਕੀਟਪਲੇਸ') },
        ],
      },
      {
        name: 'festivalPromo',
        type: 'radio',
        label: t('Do you run festival/seasonal promotions?', 'क्या त्योहारों पर प्रमोशन चलाते हैं?', 'ਕੀ ਤਿਓਹਾਰਾਂ \'ਤੇ ਪ੍ਰਮੋਸ਼ਨ ਚਲਾਉਂਦੇ ਹੋ?'),
        options: [
          { value: 'planned', label: t('Yes, planned in advance', 'हाँ, पहले से योजना बनाकर', 'ਹਾਂ, ਪਹਿਲਾਂ ਤੋਂ ਯੋਜਨਾ ਬਣਾ ਕੇ') },
          { value: 'lastMinute', label: t('Yes, but last-minute', 'हाँ, पर आखिरी वक़्त पर', 'ਹਾਂ, ਪਰ ਆਖਰੀ ਸਮੇਂ \'ਤੇ') },
          { value: 'no', label: t('No', 'नहीं', 'ਨਹੀਂ') },
        ],
      },
    ],
  },
  {
    title: t('6. Where It Actually Hurts', '6. असली दिक्कत कहाँ है', '6. ਅਸਲੀ ਮੁਸ਼ਕਲ ਕਿੱਥੇ ਹੈ'),
    questions: [
      { name: 'pain_photoTime', type: 'likert', label: t('Uploading/photographing new stock takes too much time', 'नए स्टॉक की फोटो/अपलोड में बहुत समय लगता है', 'ਨਵੇਂ ਸਟਾਕ ਦੀ ਫੋਟੋ/ਅਪਲੋਡ ਵਿੱਚ ਬਹੁਤ ਸਮਾਂ ਲੱਗਦਾ ਹੈ') },
      { name: 'pain_visibility', type: 'likert', label: t("Losing customers who can't see new stock without visiting", 'बिना आए नया स्टॉक न देख पाने से ग्राहक छूट जाते हैं', 'ਬਿਨਾਂ ਆਏ ਨਵਾਂ ਸਟਾਕ ਨਾ ਵੇਖ ਸਕਣ ਕਾਰਨ ਗਾਹਕ ਗੁਆਚ ਜਾਂਦੇ ਹਨ') },
      { name: 'pain_whatsappChaos', type: 'likert', label: t('Managing WhatsApp orders/enquiries manually is chaotic', 'व्हाट्सएप ऑर्डर मैन्युअली संभालना गड़बड़ है', 'ਵਟਸਐਪ ਆਰਡਰ ਮੈਨੂਅਲੀ ਸੰਭਾਲਣਾ ਗੜਬੜ ਹੈ') },
      { name: 'pain_noCrm', type: 'likert', label: t("No system to remember a regular customer's size/history", 'नियमित ग्राहक का साइज़/इतिहास याद रखने का सिस्टम नहीं', 'ਨਿਯਮਿਤ ਗਾਹਕ ਦਾ ਸਾਈਜ਼/ਇਤਿਹਾਸ ਯਾਦ ਰੱਖਣ ਦਾ ਸਿਸਟਮ ਨਹੀਂ') },
      { name: 'pain_onlineCompetition', type: 'likert', label: t('Losing business to online platforms (Myntra/Meesho/Instagram)', 'ऑनलाइन प्लेटफॉर्म से बिज़नेस छिन रहा है', 'ਆਨਲਾਈਨ ਪਲੇਟਫਾਰਮਾਂ ਤੋਂ ਬਿਜ਼ਨਸ ਖੁੱਸ ਰਿਹਾ ਹੈ') },
      {
        name: 'biggestFrustration',
        type: 'textarea',
        label: t('In your own words — biggest daily frustration running this store?', 'अपने शब्दों में — दुकान चलाने की सबसे बड़ी रोज़ की परेशानी?', 'ਆਪਣੇ ਸ਼ਬਦਾਂ ਵਿੱਚ — ਦੁਕਾਨ ਚਲਾਉਣ ਦੀ ਸਭ ਤੋਂ ਵੱਡੀ ਰੋਜ਼ ਦੀ ਪਰੇਸ਼ਾਨੀ?'),
      },
    ],
  },
  {
    title: t('7. Interest in an All-in-One Solution', '7. ऑल-इन-वन समाधान में रुचि', '7. ਆਲ-ਇਨ-ਵਨ ਹੱਲ ਵਿੱਚ ਦਿਲਚਸਪੀ'),
    questions: [
      {
        name: 'wantedFeature',
        type: 'checkbox',
        label: t('Which of these would matter MOST to you?', 'इनमें से आपके लिए सबसे ज़रूरी क्या है?', 'ਇਹਨਾਂ ਵਿੱਚੋਂ ਤੁਹਾਡੇ ਲਈ ਸਭ ਤੋਂ ਜ਼ਰੂਰੀ ਕੀ ਹੈ?'),
        hint: UI.pickUpTo3,
        options: [
          { value: 'aiCatalog', label: t('Photo → auto-tagged catalog in seconds', 'फोटो → सेकंडों में ऑटो-टैग कैटलॉग', 'ਫੋਟੋ → ਸਕਿੰਟਾਂ ਵਿੱਚ ਆਟੋ-ਟੈਗ ਕੈਟਲਾਗ') },
          { value: 'whatsappCollections', label: t('One-tap WhatsApp collection links', 'एक-टैप व्हाट्सएप कलेक्शन लिंक', 'ਇੱਕ-ਟੈਪ ਵਟਸਐਪ ਕਲੈਕਸ਼ਨ ਲਿੰਕ') },
          { value: 'customerCrm', label: t('Automatic customer preference/size memory', 'ग्राहक की पसंद/साइज़ अपने आप याद रखना', 'ਗਾਹਕ ਦੀ ਪਸੰਦ/ਸਾਈਜ਼ ਆਪਣੇ ਆਪ ਯਾਦ ਰੱਖਣਾ') },
          { value: 'socialAutoPost', label: t('Auto-posting new arrivals to social/Google', 'नए स्टॉक की सोशल/Google पर ऑटो-पोस्टिंग', 'ਨਵੇਂ ਸਟਾਕ ਦੀ ਸੋਸ਼ਲ/Google \'ਤੇ ਆਟੋ-ਪੋਸਟਿੰਗ') },
          { value: 'onlineStore', label: t('Own online store/checkout', 'अपना ऑनलाइन स्टोर/चेकआउट', 'ਆਪਣਾ ਆਨਲਾਈਨ ਸਟੋਰ/ਚੈੱਕਆਊਟ') },
          { value: 'marketingCampaigns', label: t('Ready-made festival marketing campaigns', 'तैयार त्योहार मार्केटिंग कैंपेन', 'ਤਿਆਰ ਤਿਓਹਾਰ ਮਾਰਕੀਟਿੰਗ ਮੁਹਿੰਮਾਂ') },
        ],
      },
      {
        name: 'trialInterest',
        type: 'radio',
        label: t('Open to a free trial with in-person setup help?', 'मुफ़्त ट्रायल + सेटअप में मदद के लिए तैयार हैं?', 'ਮੁਫ਼ਤ ਟ੍ਰਾਇਲ + ਸੈੱਟਅੱਪ ਵਿੱਚ ਮਦਦ ਲਈ ਤਿਆਰ ਹੋ?'),
        options: [
          { value: 'yes', label: t('Yes', 'हाँ', 'ਹਾਂ') },
          { value: 'maybe', label: t('Maybe, need more info', 'शायद, और जानकारी चाहिए', 'ਸ਼ਾਇਦ, ਹੋਰ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ') },
          { value: 'no', label: t('No', 'नहीं', 'ਨਹੀਂ') },
        ],
      },
    ],
  },
  {
    title: t('8. Contact for Follow-up', '8. संपर्क जानकारी', '8. ਸੰਪਰਕ ਜਾਣਕਾਰੀ'),
    questions: [
      { name: 'contactPhone', type: 'tel', label: t('Phone / WhatsApp number', 'फ़ोन / व्हाट्सएप नंबर', 'ਫ਼ੋਨ / ਵਟਸਐਪ ਨੰਬਰ') },
      { name: 'contactTime', type: 'text', label: t('Best time to reach you', 'संपर्क का सबसे अच्छा समय', 'ਸੰਪਰਕ ਦਾ ਸਭ ਤੋਂ ਵਧੀਆ ਸਮਾਂ'), placeholder: t('e.g. weekday evenings', 'जैसे शाम को', 'ਜਿਵੇਂ ਸ਼ਾਮ ਨੂੰ') },
    ],
  },
]
