import de from '@/locales/de.json';
import en from '@/locales/en.json';

type TranslationKeys = typeof de;

const translations: Record<string, TranslationKeys> = {
  de,
  en,
};

class I18n {
  private currentLocale: string = 'de';
  private translations: TranslationKeys = de;

  setLocale(locale: string) {
    this.currentLocale = locale;
    this.translations = translations[locale] || translations['de'];
  }

  getLocale(): string {
    return this.currentLocale;
  }

  t(key: string): string {
    const keys = key.split('.');
    let result: any = this.translations;

    for (const k of keys) {
      result = result?.[k];
    }

    return result || key;
  }

  component(type: string): string {
    return this.t(`components.${type}`);
  }

  orderStatus(status: string): string {
    return this.t(`orderStatus.${status}`);
  }
}

export const i18n = new I18n();
