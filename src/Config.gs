/**
 * Enige configuratiebestand voor de minimale versie.
 *
 * Vul Google Sheets in, of type microsoft voor een Excel-tabel (docs/MICROSOFT.md).
 * Bij de standaarddeployment leest de beheerder de Sheets.
 * Vervang het voorbeeldadres in allowedEmails door ieder Google-account dat
 * het dashboard mag openen. Een lege lijst geeft niemand toegang.
 * Zet alleen accounts die financiële cijfers mogen zien daarnaast ook in
 * financialAllowedEmails. Een lege financiële lijst verbergt het blok voor iedereen.
 * maxRowsPerSource begrenst de hoeveelheid data per bron; maximaal 10000.
 * snapshotCache bewaart een privacyveilige kopie maximaal zes uur.
 * emailAccess is optioneel en vereist de gastdeployment uit docs/TOEGANG.md.
 */
const APP_CONFIG = Object.freeze({
  title: 'Workshopkompas',
  maxRowsPerSource: 5000,
  snapshotCache: Object.freeze({
    enabled: true,
    ttlSeconds: 21600
  }),
  allowedEmails: [
    'jouw-account@voorbeeld.nl'
  ],
  financialAllowedEmails: [
    'jouw-account@voorbeeld.nl'
  ],
  // Optionele inzage zonder Google-account. Zie docs/TOEGANG.md voor de gastdeployment.
  emailAccess: Object.freeze({
    enabled: false,
    allowedEmails: [],
    codeMinutes: 10,
    sessionHours: 8
  }),
  // Microsoft-bron als alternatief/toevoeging:
  // { name: 'Tech-hub Microsoft', type: 'microsoft', driveId: '', itemId: '', tableName: 'Workshops' }
  // MS_TENANT_ID, MS_CLIENT_ID en MS_GOOGLE_OWNER_EMAIL staan alleen in Script Properties.
  sources: [
    {
      name: 'Tech-hub A',
      spreadsheetId: '',
      sheetName: 'Workshops',
      headerRow: 8
    },
    {
      name: 'Tech-hub B',
      spreadsheetId: '',
      sheetName: 'Workshops',
      headerRow: 8
    }
  ]
});
