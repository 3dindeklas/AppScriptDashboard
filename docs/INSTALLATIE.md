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

Zet daarna alleen de accounts die ook financiële bedragen mogen bekijken in de tweede lijst:

```javascript
financialAllowedEmails: [
  'jouw.naam@organisatie.nl'
],
```

Een account in `financialAllowedEmails` moet ook in `allowedEmails` staan. Alleen in de financiële lijst staan geeft dus geen toegang tot de app. Een lege financiële lijst is toegestaan: het dashboard blijft dan werken, maar het financiële blok blijft voor iedereen verborgen en de bedragen worden niet naar de browser gestuurd.

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
- een standaard ingeklapt financieel overzicht;
- een maandgrafiek met metriekkeuze;
- verdelingen voor onderwijs, regio, statusgroep, workshop en aanbieder;
- gewogen PO- en VO-leerjaren;
- een leesbare tabelweergave onder iedere grafiek en de recente-workshoptabel.

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
  financialAllowedEmails: [
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

Voor het financiële overzicht gebruikt de app deze twee kolommen:

- `Totale kosten aanbieder`
- `Te factureren i_lab`

Deze kolommen zijn optioneel voor het laden van een workshopregel. Ontbreekt één van beide bedragen, dan blijft de regel zichtbaar maar wordt hij financieel onvolledig genoemd. De bestaande sheetkolommen `Marge (€)` en `Marge (%)` worden niet gebruikt voor de dashboardberekening.

De dropdownfilters worden automatisch opgebouwd uit de geladen workshopregels. Je kunt stichting, schooljaar, gemeente/regio, PO/VO, aanbieder, workshop, statusgroep, school en type combineren. **Filters wissen** herstelt altijd het volledige overzicht.

Onder de dropdowns kun je kiezen tussen **Definitieve datum** en **Datum aanvraag**. Stel daarna met de twee maandsliders een inclusieve periode in. `Definitieve datum` mag meerdere lesdagen bevatten, gescheiden door komma’s, puntkomma’s of nieuwe regels. Een workshop wordt opgenomen zodra minimaal één van die lesdagen binnen de gekozen periode valt; de tabel toont alle lesdagen. De leerling-sliders gebruiken automatisch het laagste en hoogste bekende aantal. De twee vinkjes bepalen expliciet of workshopregels zonder geldige datum of zonder leerlingaantal zichtbaar blijven. De sliders reageren direct, zijn met de pijltjestoetsen te bedienen en kunnen elkaar niet passeren.

Met de volledige demoselectie tonen de kerncijfers 10 aanvragen/workshops, 204 leerlingdeelnames, 10 scholen, 22 lesmomenten en 4 uitgevoerde aanvragen. Het gemiddelde is 22,7 bekende leerlingen per aanvraag en er is één regel zonder leerlingaantal. De vergelijking toont dezelfde definities afzonderlijk voor Stichting A en Stichting B. Kies een stichting, regio of ander filter en controleer dat zowel de KPI’s als de vergelijkingstabel direct meeveranderen.

Controleer daarna de grafieken. In de demodata zijn 8 aanvragen voor PO en 2 voor VO. De PO-leerjaarverdeling toont onder andere 3,5 gewogen aanvragen voor groep 6; de VO-verdeling toont 1 aanvraag voor leerjaar 1 en 1 voor leerjaar 2. Wissel in de maandgrafiek tussen aanvragen/workshops, leerlingdeelnames en lesmomenten. De aanvraag met twee definitieve lesdagen wordt evenredig over september en oktober verdeeld. Open bij iedere grafiek **Bekijk cijfers als tabel** en controleer dat dezelfde waarden ook zonder de visuele staven leesbaar zijn.

Open daarna als account uit `financialAllowedEmails` **Kosten, facturatie en marge**. Dit blok hoort bij het laden standaard dicht te staan. Met alle demogegevens zichtbaar zijn de verwachte waarden € 4.750,00 kosten, € 6.700,00 te factureren, € 1.450,00 marge, 25,0% gewogen marge, 8 complete regels en 2 onvolledige regels. Kies daarna één stichting of workshop en controleer dat alle financiële waarden direct dezelfde filters volgen. Test ook met een account dat alleen in `allowedEmails` staat: het financiële blok hoort dan volledig te ontbreken.

De kosten- en facturatietotalen tellen ieder hun bekende bedragen. Marge wordt alleen berekend voor regels waarop beide bedragen aanwezig zijn. Controleer dit ook met één lege kostencel en één lege factuurcel: de lege cel mag niet als € 0,00 worden behandeld en de betreffende regel moet als onvolledig worden geteld.

Kies vervolgens één stichting en verklein het maand- en leerlingbereik. Alle grafieken en tabellen moeten direct dezelfde selectie volgen. Maak ook bewust een lege combinatie van filters; ieder onderdeel hoort dan een duidelijke lege melding te tonen in plaats van een JavaScript-fout.

Onder **Bronnen & datakwaliteit** zie je per stichting of de bron geladen is, hoeveel workshopregels zijn ingelezen en welke vaste controles aandacht vragen. De standaardlimiet is 5.000 workshopregels per bron. Verhoog deze alleen bewust; de code hanteert altijd een harde bovengrens van 10.000 regels per bron.

Formules mogen onder de echte gegevens alvast zijn doorgetrokken. Rijen die uitsluitend formules bevatten worden niet geladen, tellen niet als workshop en verbruiken de rijlimiet niet. Test dit desgewenst door een formule enkele honderden rijen naar beneden door te trekken: het getoonde aantal workshops hoort gelijk te blijven. Een echte workshoprij met daarnaast berekende formulevelden blijft wel gewoon zichtbaar.

Tijdens het ophalen blijft bovenaan een laadmelding met spinner zichtbaar. Na 1,5, 5 en 10 seconden verandert de tekst, zodat zichtbaar blijft dat de pagina nog op Apps Script en de Sheets wacht. Dit is geen geschat percentage. Na een succesvolle laadactie toont **Bijgewerkt** ook de werkelijk gemeten laadtijd. De knop **Vernieuwen** is tijdens het laden uitgeschakeld om dubbele aanvragen te voorkomen.

De bronimport leest per Sheet eerst de kopregel, daarna één compact ankerbereik en ten slotte één keer de benodigde brede tabel. Test bij voorkeur ook met de grootste echte Sheet en met ver doorgetrokken formules. Blijft de melding langer dan 10 seconden staan, controleer dan in Apps Script onder **Uitvoeringen** of het wachten in de bronimport zit en noteer de getoonde laadtijd na afloop.

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
