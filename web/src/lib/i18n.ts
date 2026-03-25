import de from '@/locales/de.json';

type TranslationKeys = typeof de;

class I18n {
  private translations: TranslationKeys = de;

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
