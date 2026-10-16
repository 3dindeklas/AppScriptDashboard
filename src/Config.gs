/**
 * Enige configuratiebestand voor de minimale versie.
 *
 * Laat demoMode op true staan om de app eerst zonder databronnen te testen.
 * Zet demoMode daarna op false en vul één of twee Google Sheets in.
 * De spreadsheet moet toegankelijk zijn voor de gebruiker die de web-app opent.
 */
const APP_CONFIG = Object.freeze({
  title: 'Workshopkompas',
  demoMode: true,
  sources: [
    {
      name: 'Stichting A',
      spreadsheetId: '',
      sheetName: 'Workshops',
      headerRow: 8
    },
    {
      name: 'Stichting B',
      spreadsheetId: '',
      sheetName: 'Workshops',
      headerRow: 8
    }
  ]
});
