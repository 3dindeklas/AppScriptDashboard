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
- drie werkende dropdownfilters;
- drie kerncijfers;
- twee staafdiagrammen en een tabel.

Werkt dit niet, koppel dan nog geen echte data. Controleer eerst of alle zes bestanden het juiste type en exact dezelfde naam hebben.

## Stap 4 · Koppel één Google Sheet

Vul eerst alleen Stichting A in:

```javascript
const APP_CONFIG = Object.freeze({
  title: 'Workshopkompas',
  demoMode: false,
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

## Stap 5 · Koppel de tweede Google Sheet

Vul pas wanneer Stichting A werkt ook het `spreadsheetId` van Stichting B in. Beide sheets gebruiken dezelfde kopteksten en dezelfde kopregelinstelling.

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

## Waarom Microsoft 365 nog ontbreekt

Microsoft 365 vereist Microsoft Graph, OAuth-tokens, tokenvernieuwing en extra foutafhandeling. Dat maakt fouten in de basis moeilijker te herkennen. Zodra demo en Google Sheets stabiel draaien, voegen we Microsoft als afzonderlijke fase toe zonder de werkende basis om te bouwen.
