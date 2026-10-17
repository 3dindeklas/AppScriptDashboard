# Installatie van de minimale versie

Gebruik bij voorkeur een **nieuw leeg Apps Script-project**. Zo blijven oude `.gs`-bestanden, foutcodes en verkeerd aangemaakte HTML-bestanden niet onzichtbaar meedraaien.

## Stap 1 · Maak exact zes bestanden

Maak in Apps Script drie scriptbestanden via **+ → Script**:

1. `Config`
2. `Code`
3. `Data`

Maak daarna drie HTML-bestanden via **+ → HTML**:

1. `Index`
2. `Styles`
3. `Client`

Kopieer de inhoud uit de gelijknamige bestanden in `src/`.

Controleer de bestandstypen goed:

- `Config`, `Code` en `Data` krijgen in Apps Script de extensie `.gs`;
- `Index`, `Styles` en `Client` krijgen de extensie `.html`;
- `document` en `window` mogen nergens in een `.gs`-bestand staan.

## Stap 2 · Sta je Google-account toe

Vervang in `Config.gs` het voorbeeldadres door het Google-account waarmee je de web-app opent:

```javascript
allowedEmails: [
  'jouw.naam@organisatie.nl'
],
```

Gebruik voor ieder extra account een nieuwe regel. De controle negeert hoofdletters en spaties, maar accepteert alleen volledige e-mailadressen; een domeinnaam alleen is niet voldoende. Laat je de lijst leeg of kan Google geen account vaststellen, dan wordt toegang geweigerd.

Zet geen wachtwoorden, tokens, spreadsheet-ID's of andere geheimen in deze lijst.

## Stap 3 · Test eerst de demomodus

Laat in `Config.gs` dit staan:

```javascript
demoMode: true,
```

Sla alle bestanden op. Kies daarna **Implementeren → Implementaties testen → Web-app** en open de `/dev`-URL. Deze test-URL gebruikt altijd de laatst opgeslagen code en is alleen toegankelijk voor projecteditors.

Je hoort nu zonder verdere instellingen te zien:

- de badge `Demogegevens`;
- 10 workshops verdeeld over Stichting A en Stichting B;
- negen werkende dropdownfilters;
- een maandbereik en leerlingbereik met leesbare waarden;
- zeven kerncijfers en een vergelijking tussen beide stichtingen;
- twee staafdiagrammen en een tabel.

Werkt dit niet, koppel dan nog geen echte data. Controleer eerst of alle zes bestanden het juiste type en exact dezelfde naam hebben.

## Stap 4 · Koppel één Google Sheet

Vul eerst alleen Stichting A in:

```javascript
const APP_CONFIG = Object.freeze({
  title: 'Workshopkompas',
  demoMode: false,
  maxRowsPerSource: 5000,
  allowedEmails: [
    'jouw.naam@organisatie.nl'
  ],
  sources: [
    {
      name: 'Stichting A',
      spreadsheetId: 'PLAK_HIER_HET_SPREADSHEET_ID',
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
```

Het spreadsheet-ID is het deel tussen `/d/` en `/edit` in de Google Sheets-URL. Test opnieuw met de `/dev`-URL.

De app leest vanaf de ingestelde kopregel. Minimaal bruikbaar zijn deze kolommen:

- `Workshopnaam`
- `Status`
- `Aantal leerlingen`
- `Lesmomenten`
- `PO / VO`
- `Gemeente / Regio`
- `Aanbieder`
- `Datum aanvraag` of `Definitieve datum`

Andere kolommen mogen gewoon aanwezig zijn. Persoonsgegevens worden niet naar de browser gestuurd.

De dropdownfilters worden automatisch opgebouwd uit de geladen workshopregels. Je kunt stichting, schooljaar, gemeente/regio, PO/VO, aanbieder, workshop, statusgroep, school en type combineren. **Filters wissen** herstelt altijd het volledige overzicht.

Onder de dropdowns kun je kiezen tussen **Definitieve datum** en **Datum aanvraag**. Stel daarna met de twee maandsliders een inclusieve periode in. `Definitieve datum` mag meerdere lesdagen bevatten, gescheiden door komma’s, puntkomma’s of nieuwe regels. Een workshop wordt opgenomen zodra minimaal één van die lesdagen binnen de gekozen periode valt; de tabel toont alle lesdagen. De leerling-sliders gebruiken automatisch het laagste en hoogste bekende aantal. De twee vinkjes bepalen expliciet of workshopregels zonder geldige datum of zonder leerlingaantal zichtbaar blijven. De sliders reageren direct, zijn met de pijltjestoetsen te bedienen en kunnen elkaar niet passeren.

Met de volledige demoselectie tonen de kerncijfers 10 aanvragen/workshops, 204 leerlingdeelnames, 10 scholen, 22 lesmomenten en 4 uitgevoerde aanvragen. Het gemiddelde is 22,7 bekende leerlingen per aanvraag en er is één regel zonder leerlingaantal. De vergelijking toont dezelfde definities afzonderlijk voor Stichting A en Stichting B. Kies een stichting, regio of ander filter en controleer dat zowel de KPI’s als de vergelijkingstabel direct meeveranderen.

Onder **Bronnen & datakwaliteit** zie je per stichting of de bron geladen is, hoeveel workshopregels zijn ingelezen en welke vaste controles aandacht vragen. De standaardlimiet is 5.000 workshopregels per bron. Verhoog deze alleen bewust; de code hanteert altijd een harde bovengrens van 10.000 regels per bron.

## Stap 5 · Koppel de tweede Google Sheet

Vul pas wanneer Stichting A werkt ook het `spreadsheetId` van Stichting B in. Beide sheets gebruiken dezelfde kopteksten en dezelfde kopregelinstelling.

Als één bron niet bereikbaar is, blijven de gegevens van de andere bron zichtbaar. Het dashboard meldt dan dat het overzicht onvolledig is. Er wordt in live-modus nooit automatisch teruggevallen op demogegevens.

## Stap 6 · Publiceer een versie

Wanneer de `/dev`-test werkt:

1. kies **Implementeren → Nieuwe implementatie**;
2. kies **Web-app**;
3. voer de app uit als **gebruiker die de web-app opent**;
4. kies alleen de doelgroep die toegang mag krijgen;
5. deel de gebruikte Google Sheets met diezelfde gebruikers;
6. open de nieuwe `/exec`-URL.

De manifestinstelling blijft `executeAs: USER_ACCESSING`. Daardoor geeft iedere gebruiker zelf toestemming en leest de app Google Sheets met de rechten van die gebruiker. De allowlist in `Config.gs` blijft daarnaast verplicht, ook wanneer `demoMode: true` staat.

Na latere codewijzigingen moet je de bestaande implementatie bewerken en een nieuwe versie selecteren. Alleen opslaan vernieuwt de gepubliceerde `/exec`-versie niet.

## Verwachte toegangsmeldingen

- **Geen toegang**: het actieve Google-account staat niet exact in `allowedEmails`, of Google heeft geen identiteit doorgegeven.
- **Dashboard tijdelijk niet beschikbaar**: de pagina kon niet uit de opgeslagen HTML-bestanden worden opgebouwd.
- **Dashboardgegevens konden niet worden geladen**: de pagina werkt, maar de databron kon niet veilig worden gelezen.

Deze meldingen tonen bewust geen account, providerfout of spreadsheet-ID.

## Foutcodes en serverlogs

Technische details worden niet in het dashboard getoond. Bij een onverwachte fout verschijnt wel een veilige foutcode en referentie. Open in Apps Script links **Uitvoeringen**, kies de uitvoering met hetzelfde tijdstip en zoek in de logs naar die referentie.

- `DATA_FILES_OUT_OF_SYNC`: `Code.gs` en `Data.gs` komen niet uit dezelfde versie; werk beide bestanden tegelijk bij.
- `DASHBOARD_DATA_FAILED`: onverwachte fout tijdens het opbouwen van het antwoord; gebruik de referentie om de serverlog te vinden.
- `SOURCE_NOT_CONFIGURED`: voor deze bron ontbreekt een spreadsheet-ID of tabbladnaam.
- `SOURCE_READ_FAILED`: controleer de tabbladnaam en of het actieve Google-account toegang tot de Sheet heeft.

De server logt alleen wanneer iets mislukt. Providerdetails blijven in de afgeschermde Apps Script-uitvoeringslog en worden niet naar de browser gestuurd.

## Waarom Microsoft 365 nog ontbreekt

Microsoft 365 vereist Microsoft Graph, OAuth-tokens, tokenvernieuwing en extra foutafhandeling. Dat maakt fouten in de basis moeilijker te herkennen. Zodra demo en Google Sheets stabiel draaien, voegen we Microsoft als afzonderlijke fase toe zonder de werkende basis om te bouwen.
