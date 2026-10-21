# Excel importeren naar een Google-tabblad

Stap 10 gebruikt een eenvoudig importtabblad. Apps Script haalt een Excel-bestand op, zet het tijdelijk om naar Google Sheets en kopieert de oorspronkelijke kolommen en celwaarden naar een eigen tabblad. Het dashboard leest daarna die Google-kopie. De directe Microsoft Graph-/OAuth-variant (PR #21) is gesloten en niet gemerged.

## Welke bron werkt?

| Bron | Werkwijze |
| --- | --- |
| Downloadbare .xlsx-URL zonder aanmelding | Configureer `url`; import kan handmatig of met tijdtrigger |
| SharePoint-link waarvoor aanmelden verplicht is | Geen automatische URL-import; download met je eigen account en plaats de export in Google Drive |
| Excel-webpagina zoals excel.cloud.microsoft/open/onedrive | Geen bestandslink; gebruik een echte downloadlink of Drive-export |
| .xlsx-export in je Google Drive | Configureer `driveFileId`; upload een nieuwe export wanneer de bron verandert |

De organisatielink uit de bespreking gaf anoniem HTTP 401; de demo-openlink gaf HTML in plaats van Excel. Het wijzigen van de URL verleent geen toegangsrechten. Ook delen met een Google-e-mailadres geeft Apps Script geen Microsoft-aanmeldsessie. Er wordt geen browsercookie, wachtwoord of Microsoft-token gebruikt of opgeslagen.

Voor het organisatiebestand waarvan je de deelinstellingen niet kunt wijzigen is de Drive-export de direct bruikbare route. Automatische synchronisatie van die beschermde bron zou toestemming/ondersteuning vanuit de organisatie of alsnog Microsoft-authenticatie vereisen. Een tijdtrigger op de import maakt een handmatig aangeleverde export niet automatisch actueler.

## Eerst rechten en services controleren

Volg [DIAGNOSE.md](DIAGNOSE.md): voeg Diagnostics.gs toe en voer achtereenvolgens **authorizeApp**, **checkAppSetup** en **refreshExcelImports** uit in de Apps Script-editor. De diagnose maakt onderscheid tussen Google-rechten, bestandsrechten, Drive-service en Microsoft-aanmelding.

## Eenmalig in Google instellen

1. Voeg **ExcelImport** en **Diagnostics** als scriptbestanden toe. Werk ook **Data.gs** en **Cache.gs** bij en houd de overige bestanden uit dezelfde versie.
2. Gebruik het bijgewerkte manifest of neem de aanvullingen over in je eigen manifest. Behoud `script.send_mail`, identiteit en je bestaande deploymentinstellingen.
3. Het manifest bevat **Google Drive API v3** onder `dependencies.enabledAdvancedServices`. In Apps Script hoort onder **Services** nu Drive v3 te staan. Voeg die service daar zo nodig toe. Bij een eigen Google Cloud-project moet de Drive API ook in dat Cloud-project zijn ingeschakeld.
4. De aanvullende Google-scopes zijn `script.external_request` (download), `drive.file` (tijdelijke conversie/opruimen), `drive.readonly` (je aangewezen Excel-export lezen) en volledige `spreadsheets` (importtabblad schrijven). Het gastmanifest heeft daarom ook schrijfrecht voor Sheets nodig. Dit zijn Google-rechten; er is geen Microsoft-appregistratie nodig.
5. Voer de import uit als toegestane Google-beheerder met schrijfrecht op het doelbestand. Autoriseer de nieuwe scopes in de editor. Gastgebruikers kunnen geen import starten.

Alleen code uit `src/` hoort in Apps Script. `.claspignore` sluit testbestanden en deploymentvoorbeelden uit.

## Config.gs

Voeg een importbron toe aan `APP_CONFIG.sources`, of vervang de tweede Google-bron. Laat je werkende Google-bron en eigen toegangsadressen staan:

```javascript
{
  name: 'Tech-hub i_lab',
  type: 'excel-import',
  url: 'https://voorbeeld.sharepoint.com/downloadbaar-bestand.xlsx',
  driveFileId: '',
  sourceSheetName: 'Aanvragen',
  headerRow: 8,
  spreadsheetId: 'GOOGLE_BESTAND_ID',
  sheetName: 'Import_i_lab'
}
```

| Veld | Betekenis |
| --- | --- |
| `name` | Tech-hubnaam voor filters en bronstatus |
| `type` | Vast `excel-import`; gewone Google-bronnen mogen zonder type blijven |
| `url` | Downloadbare Excel-bestandslink, geen iframe-/weergavepagina |
| `driveFileId` | Optioneel: ID van een geüpload .xlsx-bestand in Google Drive; krijgt voorrang op `url` |
| `sourceSheetName` | Exacte tabbladnaam **in Excel**; wordt niet uit de link afgeleid |
| `headerRow` | Rij met de kolomkoppen in Excel |
| `spreadsheetId` | Bestaand Google-bestand waarin de import moet komen |
| `sheetName` | Nieuwe Google-tabbladnaam voor deze bron; wordt automatisch aangemaakt |

Gebruik een aparte doeltabbladnaam per bron. Laat de importer het tabblad aanmaken: een al bestaand, niet door de importer beheerd tabblad wordt bewust niet overschreven. Dezelfde doelnaam tegelijk als gewone Google-bron toevoegen zou dubbel tellen en wordt geweigerd bij import. Er komt één stabiel tabblad per importbron; niet bij iedere vernieuwing nog een extra historisch tabblad.

Bij iedere import wordt eerst een stagingtabblad gevuld. Pas na succes krijgt dat de vaste doelnaam. De vorige kopie wordt daarna verwijderd. Bij schrijf-/publicatiefouten probeert de importer de vorige naam te herstellen. Het sheet-ID verandert; gebruik dit tabblad uitsluitend als dashboardimport, niet als basis voor eigen formules of andere koppelingen. De bron-URL en echte bestand-ID's horen alleen in je eigen Config, nooit in GitHub.

## Organisatiebestand via een Drive-export

1. Open het SharePoint-bestand met je gebruikelijke organisatieaccount en download een kopie als `.xlsx`.
2. Upload dit bestand naar een privémap in je Google Drive. Laat het als Excel-bestand staan; Apps Script doet de conversie tijdelijk.
3. Neem het bestands-ID uit de Drive-link (`/file/d/BESTANDS_ID/view`) over in `driveFileId`. `url` mag dan leeg blijven. Vul ook de exacte Excel-tabbladnaam en kopregel in.
4. Kies in Apps Script **refreshExcelImports → Uitvoeren**.
5. Controleer het resultaat in het uitvoeringslog en het nieuwe Google-tabblad.
6. Voor een volgende export kun je in Drive een nieuwe versie van hetzelfde bestand uploaden, zodat het ID gelijk blijft, of je past `driveFileId` aan. Start daarna de import opnieuw.

De doelkopie behoudt nu alle bronkolommen, dus ook eventuele contactpersonen, e-mailadressen, telefoonnummers en notities. Deel het Google-importbestand met de bedoelde bronbeheerders, zoals bij de gewone Google-bron. Het dashboard stuurt contactgegevens/notities niet door naar de browser of snapshot. De financiële dashboardallowlist beheert alleen dashboardinzage; personen met toegang tot de Google-bron kunnen de daar opgeslagen bedragen zien.

## Bronkolommen behouden

De importer gebruikt `readGoogleSheetRows_`, dezelfde rijselectie als de gewone Google-bronnen. De kopregel wordt exact overgenomen, inclusief spaties en lege tussenkolommen binnen het gebruikte bronbereik. Er is geen eigen importkolomlijst, geen hernoeming en geen toevoeging van financiële kolommen als die niet in de bron staan. Ook Gewenste periode, Locatie, Punten per workshop, Actie nodig en Notities blijven op hun oorspronkelijke plek.

De echte workshoprijen worden zonder voorafgaande normalisatie gekopieerd. Datums, getallen, teksten en de oorspronkelijke schrijfwijze van meerdere lesdagen blijven als celwaarden behouden. Excel-formules worden als berekende waarden overgenomen; tekst die letterlijk met `=` begint wordt veilig als tekst geschreven. Formule-only rijen en de bestaande rijlimiet blijven dezelfde regels volgen als Google Sheets. Volledig ongebruikte kolommen buiten het bronbereik en Excel-opmaak worden niet gerepliceerd.

Daarna loopt de Google-kopie via `readGoogleSheet_` en `normalizeSheet_` door precies hetzelfde analysepad als de gewone bronnen. De kopregel staat in het importtabblad op rij 1; `headerRow` in Config blijft de kopregel in Excel aanduiden. Bestaande financiële veldrechten en de browser-allowlist blijven gelden.

Bij bijwerken vanaf PR #22: werk **Data.gs en ExcelImport.gs samen** bij en voer **refreshExcelImports** opnieuw uit om het bestaande verkorte importtabblad met de originele kolommen te vervangen. Config, Google-scopes en OneDrive-cookieafhandeling blijven gelijk.

## Downloadbare URL

De importer ondersteunt HTTPS op Microsoft-bestandshosts: SharePoint, OneDrive/1drv, korte 1drv.ms-links en exact `my.microsoftpersonalcontent.com` als OneDrive-bestandshost. Hij probeert bij SharePoint-, 1drv.ms- en onedrive.live.com-links `download=1` toe te voegen, zonder de bestaande linkparameters te verwijderen. Dat is alleen een downloadvariant, geen garantie dat elke deel-URL werkt. Redirects worden maximaal zes keer en alleen naar toegestane Microsoft-bestandshosts gevolgd. Aanmeldredirects en 401/403 worden afgewezen.

Publieke OneDrive-links kunnen tijdens redirects een anonieme sessiecookie meegeven. Die wordt alleen binnen dezelfde download en met host-/padbinding doorgegeven, niet opgeslagen of gelogd. Hiervoor worden geen browsercookies of Microsoft-aanmeldgegevens gebruikt.

Een link moet uiteindelijk een `.xlsx`-bestand opleveren. HTML, een loginpagina, een ander bestandstype en een download groter dan 5 MB worden geweigerd. Legacy `.xls`, wachtwoordbeveiligde bestanden en conversies die Google niet ondersteunt vallen buiten deze stap. De API-conversie kan anders reageren op niet-ondersteunde Excel-formules; vergelijk de uitkomst met Excel bij acceptatie.

Voor je eigen demo kun je desgewenst in OneDrive een **alleen-lezenlink zonder aanmeldplicht en met downloaden toegestaan** maken. Iedereen met die link kan het bestand lezen/downloaden. Gebruik daarom alleen fictieve of expliciet voor delen bedoelde data. Een link kopiëren uit de adresbalk van de geopende Excel-app is niet voldoende.

## Vernieuwen en tijdtriggers

- **refreshExcelImports** in de editor downloadt/converteert de ingestelde importbronnen en publiceert nieuwe kopieën.
- Een optionele tijdtrigger voor **refreshExcelImports_** kan bijvoorbeeld ieder uur draaien, onder hetzelfde toegestane Google-beheerdersaccount. De private functie is niet via `google.script.run` beschikbaar.
- De import neemt dezelfde ScriptLock als de snapshotverversing. Twee imports of een import en snapshotopbouw publiceren niet tegelijk.
- Na een importpoging wordt de snapshotmanifest verwijderd. De volgende dashboardopening of **Brongegevens vernieuwen** bouwt een snapshot uit de actuele Google-tabbladen en importmeldingen.
- **Brongegevens vernieuwen** in het dashboard leest alleen de Google-bronnen/snapshot opnieuw. Het start geen Excel-download of wijziging aan het importtabblad. Zo blijft een pagina-opening snel en kan een gast geen bestanden importeren.

Onder **Data → Bronnen & datakwaliteit** staat bij een importbron de laatste geslaagde importtijd. Dat is de actualiteit van de Excel-kopie; de algemene bijwerktijd bovenaan hoort bij de dashboard-snapshot en kan recenter zijn.

## Fouten en behoud van data

Een mislukte import vervangt het vorige tabblad niet. De bron toont de laatste geslaagde import plus een waarschuwing en het totaal wordt als onvolledig gemarkeerd. Zonder eerdere geslaagde import toont de bron geen records. Een leeg tabblad wordt afgewezen; deze versie ondersteunt dus geen automatische vervanging door nul records.

| Foutcode | Actie |
| --- | --- |
| `IMPORT_GOOGLE_PERMISSION_REQUIRED` | Voer authorizeApp en checkAppSetup uit; controleer het Google-manifest |
| `IMPORT_LOGIN_REQUIRED` | Bron vereist Microsoft-aanmelding; gebruik Drive-export of vraag de organisatie om een bruikbare export/download |
| `IMPORT_VIEWER_LINK` | Gebruik een bestandslink of Drive-export in plaats van de Excel-webpagina |
| `IMPORT_NOT_CONFIGURED` | Vul doelbestand, doeltabblad, Excel-tabblad en URL of Drive-ID in |
| `IMPORT_TARGET_EXISTS` | Kies een nieuwe doelnaam; bestaand tabblad is geen beheerde import |
| `IMPORT_TARGET_CONFLICT` | Geef iedere bron een eigen doelnaam |
| `IMPORT_DRIVE_SERVICE_REQUIRED` | Voeg Drive API v3 toe bij Services |
| `IMPORT_DRIVE_READ_FAILED` | Controleer Drive-ID en leesrechten van de Google-beheerder |
| `IMPORT_TOO_LARGE` | Gebruik een export kleiner dan 5 MB |
| `IMPORT_NOT_EXCEL` | De bron is geen ondersteund .xlsx-bestand |
| `IMPORT_SOURCE_SHEET_NOT_FOUND` | Controleer de exacte Excel-tabbladnaam in `sourceSheetName` |
| `IMPORT_EMPTY_DATA` | Controleer exact bronblad, kopregel en aanwezige workshopregels |
| `IMPORT_FAILED` | Controleer bronblad, kolomkoppen, conversieondersteuning en Google-schrijf-/Drive-rechten |
| `IMPORT_DOWNLOAD_FAILED` | Controleer bereikbaarheid en downloadlink; ook Google-externe-verzoeken moeten geautoriseerd zijn |

Logs bevatten alleen bronnaam, vaste foutcode en foutreferentie. Ze bevatten geen URL's, tokens of providerfoutbodies. Tijdelijke conversiebestanden worden in `finally` verwijderd. Bij timeouts/platformfouten kan opruimen mislukken: verwijder achtergebleven bestanden met naam **Workshopkompas tijdelijke Excel-import** dan handmatig. `_import_backup_`-tabbladen mogen na controle van de geslaagde import eveneens worden opgeruimd als een opruimfout is gemeld.

Verander je de bron-URL, het Excel-tabblad, Drive-ID, kopregel of rijlimiet, dan is eerst een nieuwe geslaagde import nodig. Tot die tijd wordt de oude kopie niet als data voor de nieuwe broninstellingen gebruikt. Verwijder je een bron uit Config, dan blijft het importtabblad bewust bestaan; opruimen daarvan is een beheerkeuze.

## Praktijkacceptatie (nog open)

- [ ] Google Drive-service en scopes geautoriseerd als beheerder.
- [ ] Organisatie-export in Drive geïmporteerd met het juiste bronblad/de juiste kopregel.
- [ ] Eventuele openbare demo-downloadlink levert werkelijk Excel en importeert correct.
- [ ] Doeltabblad wordt eenmaal aangemaakt en bij een herimport zonder dubbelen vervangen.
- [ ] Aantallen, meerdere lesdagen, leerlingaantallen, kosten en facturatie komen overeen met Excel.
- [ ] Kolomnamen, volgorde, lege tussenkolommen en bronwaarden komen overeen met Excel.
- [ ] Lege/formule-only rijen tellen niet mee; contactgegevens/notities ontbreken in browser en snapshot.
- [ ] Verkeerde link/bronblad veroorzaakt een melding en behoudt vorige gegevens.
- [ ] Dashboardopeningen downloaden Excel niet opnieuw; importtijd en snapshottijd zijn begrijpelijk.
- [ ] Gastlogin en financiële afscherming werken na een nieuwe `/exec`-deployment.
- [ ] Optionele tijdtrigger draait als de bedoelde beheerder en tijdelijke bestanden worden opgeruimd.

## Officiële basis

- [Google: externe HTTP-verzoeken](https://developers.google.com/apps-script/guides/services/external)
- [Google: Advanced Drive-service](https://developers.google.com/apps-script/advanced/drive)
- [Google: uploaden en converteren naar Google Sheets](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Google: setValues en formulebehandeling](https://developers.google.com/apps-script/reference/spreadsheet/range#setValues(Object))
- [Microsoft: bestanden delen en downloaden blokkeren](https://support.microsoft.com/en-us/onedrive/share-files-and-folders-in-microsoft-onedrive)
