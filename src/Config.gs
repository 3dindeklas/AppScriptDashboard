/**
 * Enige configuratiebestand voor de minimale versie.
 *
 * Laat demoMode op true staan om de app eerst zonder databronnen te testen.
 * Zet demoMode daarna op false en vul één of twee Google Sheets in.
 * De spreadsheet moet toegankelijk zijn voor de gebruiker die de web-app opent.
 * Vervang het voorbeeldadres in allowedEmails door ieder Google-account dat
 * het dashboard mag openen. Een lege lijst geeft niemand toegang.
 * Zet alleen accounts die financiële cijfers mogen zien daarnaast ook in
 * financialAllowedEmails. Een lege financiële lijst verbergt het blok voor iedereen.
 * maxRowsPerSource begrenst de hoeveelheid data per bron; maximaal 10000.
 * snapshotCache bewaart een privacyveilige kopie maximaal zes uur.
 */
const APP_CONFIG = Object.freeze({
  title: 'Workshopkompas',
  demoMode: true,
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
