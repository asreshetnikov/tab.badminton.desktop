import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en/common.json'

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { common: en }
  },
  defaultNS: 'common',
  interpolation: {
    escapeValue: false // React handles XSS
  }
})

export default i18n
