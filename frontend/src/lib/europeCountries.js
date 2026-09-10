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

// Adzuna's API does not cover these countries at all — jobs there only
// come from Greenhouse/Lever/Remotive sources.
export const ADZUNA_UNSUPPORTED_COUNTRIES = ['dk', 'se', 'no', 'fi']

export function countryLabelFromCode(code) {
  return EUROPE_COUNTRY_OPTIONS.find((item) => item.code === code)?.label || code.toUpperCase()
}
