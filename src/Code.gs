/**
 * Web-app entry point.
 *
 * Dit volgt het standaardpatroon uit de officiële Apps Script-documentatie:
 * maak een template van Index, evalueer de template en retourneer HtmlOutput.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_CONFIG.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Voegt een HTML-partial toe aan Index.html.
 * Styles.html bevat zelf <style> en Client.html bevat zelf <script>.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Enige functie die vanuit de browser wordt aangeroepen.
 * Contactgegevens, notities en technische ID's worden niet teruggestuurd.
 */
function getDashboardData() {
  const internalRecords = APP_CONFIG.demoMode ? demoRecords_() : readConfiguredSheets_();

  return {
    mode: APP_CONFIG.demoMode ? 'demo' : 'live',
    generatedAt: new Date().toISOString(),
    records: internalRecords.map(publicRecord_)
  };
}
