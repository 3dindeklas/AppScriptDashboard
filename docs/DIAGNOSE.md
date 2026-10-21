# Rechten controleren en Excel-import starten

Gebruik **authorizeApp → checkAppSetup → refreshExcelImports**, in die volgorde vanuit de Apps Script-editor. Je hoeft geen functieargumenten in te vullen en geen Microsoft-token aan te maken.

## Bestanden bijwerken

Voeg **Diagnostics** via **+ → Script** toe en kopieer Diagnostics.gs. Werk ook **ExcelImport.gs** bij. Behoud je eigen Config.gs. Het manifest moet de rechten en Advanced Drive v3 uit de import-PR bevatten; deze diagnose voegt geen nieuwe scopes toe.

## 1. Google-toestemming geven

1. Sla de code en het manifest op.
2. Open het project als het Google-account dat in `allowedEmails` staat en het doelbestand mag bewerken.
3. Kies boven in de editor, naast **Uitvoeren**, de functie **authorizeApp**.
4. Klik **Uitvoeren**. Kies je Google-account en accepteer de gevraagde rechten wanneer Google daarom vraagt.
5. Open het **Uitvoeringslog**. Na succes staat er `[APP_AUTHORIZE_OK]`.

Deze functie gebruikt Googles `requireAllScopes`: daarmee worden de rechten uit het manifest expliciet gecontroleerd/aangevraagd. Dit is geen Microsoft-aanmelding. Een scope die ontbreekt in het manifest kan hiermee niet alsnog worden verleend; voeg die eerst aan `oauthScopes` toe.

## 2. Diagnose draaien

Selecteer **checkAppSetup** in dezelfde functiekeuzelijst en klik **Uitvoeren**. De eerste logregel bevat `[APP_CHECK_START]`. Per onderdeel volgt eerst een startregel en daarna een resultaat:

| Uitkomst | Betekenis |
| --- | --- |
| `OK` | De betreffende controle is geslaagd |
| `ERROR` | Foutcode en concrete herstelactie; andere controles gaan door |
| `WARNING` | Bijvoorbeeld lege configuratie, cache-miss of een bezette lock |
| `SKIPPED` | Functie niet ingesteld of afhankelijkheid nog niet beschikbaar |

Het einde bevat `[APP_CHECK_DONE]` met het aantal fouten en waarschuwingen. De functie retourneert daarnaast een gestructureerd rapport. Je kunt de regels met foutcode/actie delen; er worden geen echte bron-URL's, bestand-ID's, accounts, OAuth-tokens of workshopregels gelogd.

### Wat wordt getest?

- Of het uitvoerende Google-account toegang heeft volgens Config en als zichzelf uitvoert.
- Google-autorisatiestatus en de relevante scopes voor de ingestelde functies. Volledig Sheets-recht telt ook als leesrecht voor een gewone Google-bron.
- Script Properties: tijdelijk testitem schrijven, teruglezen en verwijderen.
- Cache: tijdelijk testitem schrijven, lezen en verwijderen; een cache-miss is een waarschuwing.
- ScriptLock: direct proberen en vrijgeven; een actieve import wordt niet onderbroken.
- Bij ingeschakelde gastlogin: MailApp-toegang en resterend dagquotum. **Er wordt geen e-mail verstuurd.**
- Bij URL-import: algemene externe HTTP-toegang en bereikbaarheid/bestandskop van de ingestelde downloadbron.
- Bij importbronnen: Advanced Drive v3 en conversie van een klein fictief CSV-bestand naar een tijdelijk Google-bestand.
- Lezen/schrijven op dat tijdelijke testbestand, daarna verwijderen. Echte bron-/importtabbladen worden door de diagnose niet gewijzigd.
- Google-bronnen: doelbestand, tabblad en de vereiste kolomkoppen uitlezen.
- Importbestemming: bestandsmetadata geeft bewerkrechten aan; een bestaand importtabblad moet door de importer beheerd worden.
- Drive-export of URL: het bestand is bereikbaar, niet te groot en heeft een XLSX/ZIP-bestandskop.

De tijdelijke test heet **Workshopkompas tijdelijke rechtentest**. Na een opruimfout of platformtimeout kan je dit bestand zo nodig handmatig uit Drive verwijderen. De precieze Excel-conversie, gekozen Excel-tabblad, rijgegevens, eventuele bladbeveiliging, praktijk-mailbezorging en de gepubliceerde web-app blijven controles bij de echte import/publicatie. Een geslaagde algemene rechtentest bewijst niet dat Microsoft iedere gedeelde URL zonder aanmelding beschikbaar stelt.

## 3. De echte import starten

Controleer in je eigen Config een bron zoals:

```javascript
{
  name: 'Tech-hub import',
  type: 'excel-import',
  url: 'PLAK_HIER_JE_MICROSOFT_DEELLINK',
  driveFileId: '',
  sourceSheetName: 'EXACTE_EXCEL_TABBLADNAAM',
  headerRow: 8,
  spreadsheetId: 'GOOGLE_DOELBESTAND_ID',
  sheetName: 'Import_Microsoft'
}
```

Gebruik bij een in Drive geplaatste Excel-export `driveFileId`; dat krijgt voorrang op `url`. Kies een **nieuwe** doelnaam die de importer zelf mag aanmaken. Een tabblad alvast handmatig aanmaken is niet nodig.

Selecteer nu **refreshExcelImports → Uitvoeren**. Dit is de gewone editorfunctie. Selecteer niet `doGet` om een import te starten. Het log toont:

1. `[IMPORT_START]`: de editorfunctie is begonnen.
2. `[IMPORT_PHASE]`: per bron download, conversie, bronblad controleren en publiceren.
3. Een resultaat per bron met status, foutcode en bij fouten de fase en uitleg.
4. `[IMPORT_DONE]`: hoeveel bronnen zonder fout zijn verwerkt.

`IMPORT_NO_SOURCES` betekent dat in `APP_CONFIG.sources` nog geen bron met exact `type: 'excel-import'` staat. Een bron met alleen een URL en zonder dat type blijft een gewone Google-bron.

Na een geslaagde import: controleer het nieuwe tabblad in het Google-bestand. Open of herlaad daarna het dashboard. **Brongegevens vernieuwen** in het dashboard voert eerst de Excel-imports uit en vernieuwt daarna de snapshot. Gewoon openen voert geen import uit. Voor automatisch importeren kies je de private functie `refreshExcelImports_` als tijdtrigger; de gewone editorroute blijft `refreshExcelImports`.

## Bij “Er is een onbekende fout opgetreden”

Die algemene Google-melding bewijst niet welke scope of functie fout gaat. Kijk eerst of het eigen startbericht zichtbaar is:

- **Geen `[APP_CHECK_START]` of `[IMPORT_START]`:** Google is gestopt voordat deze code begon. Een try/catch in de functie kan dat niet afvangen. Controleer dat alle bestanden opgeslagen zijn, het manifest geldige JSON is en Drive API v3 correct bij Services staat. Herlaad de editor en start authorizeApp opnieuw met het bedoelde Google-account. Bekijk ook de details onder **Uitvoeringen**. Een aanhoudende platformfout moet vanuit die uitvoering/projectinstellingen verder worden onderzocht.
- **Wel een startregel:** de laatst gestarte stap of importfase begrenst de fout. Lees de bijbehorende foutcode en actie. Deel bij vervolgonderzoek de diagnose-uitvoer met die codes en het functienaam/tijdstip, zonder echte links of persoonsgegevens.
- **`GOOGLE_PERMISSION_REQUIRED` of `SCOPE_MISSING`:** herstel de Google-scopes in het manifest en voer authorizeApp opnieuw uit.
- **`DRIVE_SERVICE_MISSING` of `DRIVE_API_DISABLED`:** voeg Drive API v3 toe bij Services en activeer de API zo nodig in het gekoppelde Cloud-project.
- **`TARGET_NOT_WRITABLE`:** dit Google-account heeft geen bewerkrechten op het gekozen Google-doelbestand.
- **`IMPORT_LOGIN_REQUIRED`:** de Microsoft-bron vraagt aanmelding; dit is een andere fout dan ontbrekende Google-rechten. Gebruik een bruikbare anonieme download of de Drive-exportroute.

## OneDrive-deellink versus CSV

Een korte `https://1drv.ms/x/...`-link is een Excel-deellink, geen CSV-URL. De importer probeert die met behoud van de linkparameters als download via `download=1`. OneDrive kan doorverwijzen naar `my.microsoftpersonalcontent.com`; exact die host wordt nu ook geaccepteerd. Er worden geen browsercookies of extra aanmeldrechten toegevoegd.

De recente publieke OneDrive-link werkte wel in een privévenster maar gaf met de eerdere downloader HTTP 401. Oorzaak: OneDrive gaf bij de eerste redirect een anonieme sessiecookie mee die onze handmatige redirectafhandeling niet doorgaf. De downloader bewaart zulke cookies nu alleen voor deze ene download, met host-/padbinding, vervaltijd en begrensde omvang. De cookies worden niet gelogd, niet opgeslagen en nooit uit je browser overgenomen.

Bij de controle met deze correctie volgde op HTTP 302 een HTTP 200 met Excel-contenttype en de XLSX/ZIP-bestandskop. Dit bevestigt de downloadroute; het gekozen Excel-tabblad, de daadwerkelijke Google-conversie en publicatie blijven via refreshExcelImports te testen. De bestaande Config-URL kan blijven staan. Werk ExcelImport.gs bij en start refreshExcelImports opnieuw. Er zijn geen nieuwe Google-scopes nodig.

Een beschermde organisatiebron kan nog steeds Microsoft-aanmelding vereisen. De sessieafhandeling maakt een privébestand niet publiek; bij blijvende 401/403 blijft de Drive-export een alternatief.

## Google-documentatie

- [AuthorizationInfo: verleende scopes en status](https://developers.google.com/apps-script/reference/script/authorization-info)
- [ScriptApp: requireAllScopes en autorisatiecontrole](https://developers.google.com/apps-script/reference/script/script-app)
- [Drive: bestandsrechten en capabilities](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
