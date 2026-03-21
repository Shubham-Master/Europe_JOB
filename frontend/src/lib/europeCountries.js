export const EUROPE_COUNTRY_OPTIONS = [
  { code: 'gb', label: 'United Kingdom' },
  { code: 'ie', label: 'Ireland' },
  { code: 'de', label: 'Germany' },
  { code: 'fr', label: 'France' },
  { code: 'nl', label: 'Netherlands' },
  { code: 'be', label: 'Belgium' },
  { code: 'lu', label: 'Luxembourg' },
  { code: 'ch', label: 'Switzerland' },
  { code: 'at', label: 'Austria' },
  { code: 'pl', label: 'Poland' },
  { code: 'cz', label: 'Czechia' },
  { code: 'it', label: 'Italy' },
  { code: 'es', label: 'Spain' },
  { code: 'pt', label: 'Portugal' },
  { code: 'dk', label: 'Denmark' },
  { code: 'se', label: 'Sweden' },
  { code: 'no', label: 'Norway' },
  { code: 'fi', label: 'Finland' },
]

export const DEFAULT_TARGET_COUNTRIES = ['nl', 'de', 'be', 'ch']

export function countryLabelFromCode(code) {
  return EUROPE_COUNTRY_OPTIONS.find((item) => item.code === code)?.label || code.toUpperCase()
}
