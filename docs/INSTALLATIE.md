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

## Stap 2 · Test eerst de demomodus

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

## Stap 3 · Koppel één Google Sheet

Vul eerst alleen Stichting A in:

```javascript
const APP_CONFIG = Object.freeze({
  title: 'Workshopkompas',
  demoMode: false,
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

## Stap 4 · Koppel de tweede Google Sheet

Vul pas wanneer Stichting A werkt ook het `spreadsheetId` van Stichting B in. Beide sheets gebruiken dezelfde kopteksten en dezelfde kopregelinstelling.

## Stap 5 · Publiceer een versie

Wanneer de `/dev`-test werkt:

1. kies **Implementeren → Nieuwe implementatie**;
2. kies **Web-app**;
3. voer de app uit als **gebruiker die de web-app opent**;
4. kies alleen de doelgroep die toegang mag krijgen;
5. deel de gebruikte Google Sheets met diezelfde gebruikers;
6. open de nieuwe `/exec`-URL.

Na latere codewijzigingen moet je de bestaande implementatie bewerken en een nieuwe versie selecteren. Alleen opslaan vernieuwt de gepubliceerde `/exec`-versie niet.

## Waarom Microsoft 365 nog ontbreekt

Microsoft 365 vereist Microsoft Graph, OAuth-tokens, tokenvernieuwing en extra foutafhandeling. Dat maakt fouten in de basis moeilijker te herkennen. Zodra demo en Google Sheets stabiel draaien, voegen we Microsoft als afzonderlijke fase toe zonder de werkende basis om te bouwen.
